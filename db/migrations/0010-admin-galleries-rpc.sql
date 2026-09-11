-- ============================================================================
-- Migration: 0010-admin-galleries-rpc
--
-- Task BB-024: RPC get_admin_galleries phục vụ danh sách album khu quản trị.
-- Hỗ trợ lọc theo chi nhánh, trạng thái, thợ ảnh, retoucher, CSKH, ngày chụp,
-- sắp hết hạn, tìm kiếm tên bé / SĐT khách.
-- Sắp xếp động, phân trang cursor/offset (chặn trần 200).
-- Kèm khối đếm theo trạng thái để dựng kanban.
-- ============================================================================

drop function if exists get_admin_galleries(uuid[], text[], uuid, uuid, uuid, date, date, boolean, text, text, text, integer, integer);

create function get_admin_galleries(
  p_branch_ids uuid[],
  p_status text[],
  p_photographer_id uuid,
  p_editor_id uuid,
  p_cskh_id uuid,
  p_shoot_date_from date,
  p_shoot_date_to date,
  p_expiring_soon boolean,
  p_search text,
  p_sort_by text,
  p_sort_order text,
  p_offset integer,
  p_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_offset integer;
  v_counts jsonb;
  v_items jsonb;
  v_search text;
  v_has_more boolean;
begin
  -- Chặn trần ở backend: tối đa 200, mặc định 50
  v_limit := least(greatest(coalesce(p_limit, 50), 1), 200);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  if p_search is not null and length(trim(p_search)) > 0 then
    v_search := trim(p_search);
  else
    v_search := null;
  end if;

  -- 1. Tính toán khối đếm theo trạng thái (Kanban counts) trong phạm vi chi nhánh được phép
  -- Không lọc theo p_status để các cột Kanban luôn thấy tổng số của từng trạng thái
  with base_galleries as (
    select
      g.id,
      g.status
    from galleries g
    join branches b on b.id = g.branch_id
    join customers c on c.id = g.customer_id
    left join babies bb on bb.id = g.baby_id
    left join shoots sh on sh.id = g.shoot_id
    left join lateral (
      select del.retoucher_id
      from deliveries del
      where del.gallery_id = g.id
      order by del.created_at desc
      limit 1
    ) ed on true
    where (p_branch_ids is null or g.branch_id = any(p_branch_ids))
      and (p_photographer_id is null or sh.photographer_id = p_photographer_id)
      and (p_editor_id is null or ed.retoucher_id = p_editor_id)
      and (p_cskh_id is null or g.created_by = p_cskh_id)
      and (p_shoot_date_from is null or sh.shoot_date >= p_shoot_date_from)
      and (p_shoot_date_to is null or sh.shoot_date <= p_shoot_date_to)
      and (p_expiring_soon is not true or (
        g.due_at is not null and g.due_at >= now() and g.due_at <= now() + interval '3 days'
        and g.status in ('ready', 'in_review')
      ))
      and (v_search is null or (
        c.phone ilike '%' || v_search || '%'
        or c.phone_normalized ilike '%' || v_search || '%'
        or c.full_name ilike '%' || v_search || '%'
        or bb.full_name ilike '%' || v_search || '%'
        or bb.nickname ilike '%' || v_search || '%'
        or g.title ilike '%' || v_search || '%'
      ))
  ),
  status_counts as (
    select
      count(*)::int as total,
      count(*) filter (where status = 'draft')::int as draft,
      count(*) filter (where status = 'syncing')::int as syncing,
      count(*) filter (where status = 'ready')::int as ready,
      count(*) filter (where status = 'in_review')::int as in_review,
      count(*) filter (where status = 'submitted')::int as submitted,
      count(*) filter (where status = 'in_retouch')::int as in_retouch,
      count(*) filter (where status = 'delivered')::int as delivered,
      count(*) filter (where status = 'expired')::int as expired,
      count(*) filter (where status = 'archived')::int as archived
    from base_galleries
  )
  select jsonb_build_object(
    'all', coalesce(total, 0),
    'draft', coalesce(draft, 0),
    'syncing', coalesce(syncing, 0),
    'ready', coalesce(ready, 0),
    'in_review', coalesce(in_review, 0),
    'submitted', coalesce(submitted, 0),
    'in_retouch', coalesce(in_retouch, 0),
    'delivered', coalesce(delivered, 0),
    'expired', coalesce(expired, 0),
    'archived', coalesce(archived, 0)
  ) into v_counts from status_counts;

  -- 2. Truy vấn danh sách album với đầy đủ thông tin chi tiết
  with gallery_details as (
    select
      g.id,
      g.title,
      coalesce(bb.nickname, bb.full_name) as baby_name,
      bb.full_name as baby_full_name,
      c.full_name as customer_name,
      c.phone as customer_phone,
      b.id as branch_id,
      b.name as branch_name,
      sp_photo.id as photographer_id,
      sp_photo.full_name as photographer_name,
      ed.retoucher_id as editor_id,
      ed.retoucher_name as editor_name,
      sp_cs.id as cskh_id,
      sp_cs.full_name as cskh_name,
      sh.shoot_date,
      g.photo_count as total_photos,
      coalesce(
        case
          when g.status in ('submitted', 'in_retouch', 'delivered') and s.snapshot_selected_count is not null
            then s.snapshot_selected_count
          else (select count(*)::int from selection_items si where si.selection_id = s.id and si.mark = 'selected')
        end,
        0
      ) as selected_count,
      g.included_quota,
      g.due_at,
      g.status,
      coalesce(
        (select max(si.updated_at) from selection_items si where si.selection_id = s.id),
        s.updated_at
      ) as last_selected_at,
      case
        when g.status in ('submitted', 'in_retouch', 'delivered') then 'done'
        when g.due_at is null then 'no_due'
        when g.due_at < now() then 'overdue'
        when g.due_at < now() + interval '2 days' then 'due_soon'
        else 'on_track'
      end as urgency,
      g.sent_at,
      g.submitted_at,
      g.created_at
    from galleries g
    join branches b on b.id = g.branch_id
    join customers c on c.id = g.customer_id
    left join babies bb on bb.id = g.baby_id
    left join shoots sh on sh.id = g.shoot_id
    left join staff_profiles sp_photo on sp_photo.id = sh.photographer_id
    left join staff_profiles sp_cs on sp_cs.id = g.created_by
    left join lateral (
      select del.retoucher_id, sp_ret.full_name as retoucher_name
      from deliveries del
      left join staff_profiles sp_ret on sp_ret.id = del.retoucher_id
      where del.gallery_id = g.id
      order by del.created_at desc
      limit 1
    ) ed on true
    left join lateral (
      select sel.id, sel.updated_at, sel.submitted_at, sel.snapshot_selected_count
      from selections sel
      where sel.gallery_id = g.id and sel.is_primary = true
      limit 1
    ) s on true
    where (p_branch_ids is null or g.branch_id = any(p_branch_ids))
      and (p_status is null or g.status::text = any(p_status))
      and (p_photographer_id is null or sh.photographer_id = p_photographer_id)
      and (p_editor_id is null or ed.retoucher_id = p_editor_id)
      and (p_cskh_id is null or g.created_by = p_cskh_id)
      and (p_shoot_date_from is null or sh.shoot_date >= p_shoot_date_from)
      and (p_shoot_date_to is null or sh.shoot_date <= p_shoot_date_to)
      and (p_expiring_soon is not true or (
        g.due_at is not null and g.due_at >= now() and g.due_at <= now() + interval '3 days'
        and g.status in ('ready', 'in_review')
      ))
      and (v_search is null or (
        c.phone ilike '%' || v_search || '%'
        or c.phone_normalized ilike '%' || v_search || '%'
        or c.full_name ilike '%' || v_search || '%'
        or bb.full_name ilike '%' || v_search || '%'
        or bb.nickname ilike '%' || v_search || '%'
        or g.title ilike '%' || v_search || '%'
      ))
    order by
      case when p_sort_by = 'shootDate' and p_sort_order = 'asc' then sh.shoot_date end asc nulls last,
      case when p_sort_by = 'shootDate' and p_sort_order = 'desc' then sh.shoot_date end desc nulls last,
      case when p_sort_by = 'dueAt' and p_sort_order = 'asc' then g.due_at end asc nulls last,
      case when p_sort_by = 'dueAt' and p_sort_order = 'desc' then g.due_at end desc nulls last,
      case when p_sort_by = 'title' and p_sort_order = 'asc' then g.title end asc,
      case when p_sort_by = 'title' and p_sort_order = 'desc' then g.title end desc,
      case when p_sort_by = 'status' and p_sort_order = 'asc' then g.status end asc,
      case when p_sort_by = 'status' and p_sort_order = 'desc' then g.status end desc,
      case when p_sort_by = 'photoCount' and p_sort_order = 'asc' then g.photo_count end asc,
      case when p_sort_by = 'photoCount' and p_sort_order = 'desc' then g.photo_count end desc,
      case when p_sort_by = 'selectedCount' and p_sort_order = 'asc' then
        coalesce(
          case
            when g.status in ('submitted', 'in_retouch', 'delivered') and s.snapshot_selected_count is not null
              then s.snapshot_selected_count
            else (select count(*)::int from selection_items si where si.selection_id = s.id and si.mark = 'selected')
          end, 0
        ) end asc,
      case when p_sort_by = 'selectedCount' and p_sort_order = 'desc' then
        coalesce(
          case
            when g.status in ('submitted', 'in_retouch', 'delivered') and s.snapshot_selected_count is not null
              then s.snapshot_selected_count
            else (select count(*)::int from selection_items si where si.selection_id = s.id and si.mark = 'selected')
          end, 0
        ) end desc,
      case when p_sort_by = 'lastSelectedAt' and p_sort_order = 'asc' then
        coalesce((select max(si.updated_at) from selection_items si where si.selection_id = s.id), s.updated_at) end asc nulls last,
      case when p_sort_by = 'lastSelectedAt' and p_sort_order = 'desc' then
        coalesce((select max(si.updated_at) from selection_items si where si.selection_id = s.id), s.updated_at) end desc nulls last,
      case when p_sort_order = 'asc' then g.created_at end asc,
      g.created_at desc,
      g.id desc
    offset v_offset
    limit v_limit + 1
  ),
  ranked as (
    select
      r.*,
      row_number() over () as row_num,
      count(*) over () as total_fetched
    from gallery_details r
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', r.id,
          'title', r.title,
          'babyName', r.baby_name,
          'babyFullName', r.baby_full_name,
          'customerName', r.customer_name,
          'customerPhone', r.customer_phone,
          'branch', jsonb_build_object('id', r.branch_id, 'name', r.branch_name),
          'branchName', r.branch_name,
          'photographer', case when r.photographer_id is not null then jsonb_build_object('id', r.photographer_id, 'name', r.photographer_name) else null end,
          'photographerName', r.photographer_name,
          'editor', case when r.editor_id is not null then jsonb_build_object('id', r.editor_id, 'name', r.editor_name) else null end,
          'editorName', r.editor_name,
          'cskh', case when r.cskh_id is not null then jsonb_build_object('id', r.cskh_id, 'name', r.cskh_name) else null end,
          'cskhName', r.cskh_name,
          'shootDate', to_char(r.shoot_date, 'YYYY-MM-DD'),
          'totalPhotos', r.total_photos,
          'selectedCount', r.selected_count,
          'includedQuota', r.included_quota,
          'extraCount', greatest(0, r.selected_count - r.included_quota),
          'progress', r.selected_count || '/' || r.included_quota,
          'dueAt', r.due_at,
          'status', r.status,
          'lastSelectedAt', r.last_selected_at,
          'urgency', r.urgency,
          'sentAt', r.sent_at,
          'submittedAt', r.submitted_at,
          'createdAt', r.created_at
        )
      ) filter (where r.row_num <= v_limit),
      '[]'::jsonb
    ),
    coalesce(bool_or(r.total_fetched > v_limit), false)
  into v_items, v_has_more
  from ranked r;

  return jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'counts', v_counts,
    'hasMore', coalesce(v_has_more, false),
    'limit', v_limit,
    'offset', v_offset
  );
end;
$$;

-- Phân quyền: khoá khỏi public, anon, authenticated; chỉ cấp cho service_role
revoke all on function get_admin_galleries(uuid[], text[], uuid, uuid, uuid, date, date, boolean, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function get_admin_galleries(uuid[], text[], uuid, uuid, uuid, date, date, boolean, text, text, text, integer, integer) to service_role;
