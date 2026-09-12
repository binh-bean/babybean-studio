-- ============================================================================
-- Migration: 0020 — Báo cáo thất thoát: ảnh đã giao vượt hạn mức mà chưa lập hóa đơn
--
-- Task: BB-106 (ARCH)
-- Bối cảnh: docs/15-doi-chieu-lark.md §6.3
--
-- Bốn luật:
-- 1. Album hạn mức NULL thì KHÔNG vào v_over_quota_unbilled, và đếm riêng thành
--    missing_quota_album_count trong v_over_quota_summary.
-- 2. Chỉ tính ảnh mark = 'selected'. Ảnh thả tim (is_favorite) không phải ảnh chọn.
-- 3. RLS theo chi nhánh. Quản lý chi nhánh chỉ thấy chi nhánh mình. CTV thời vụ không thấy gì.
-- 4. extra_photo_price của ALBUM, không phải products.list_price.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. View chi tiết từng album vượt hạn mức chưa thu tiền
-- ---------------------------------------------------------------------------

create or replace view v_over_quota_unbilled
with (security_invoker = true) as
with raw_stats as (
  select
    g.id as gallery_id,
    g.title as gallery_title,
    g.branch_id,
    b.name as branch_name,
    coalesce(
      g.lark_contract_code,
      (select gi.lark_contract_code from gallery_items gi where gi.gallery_id = g.id and gi.lark_contract_code is not null limit 1)
    ) as lark_contract_code,
    sh.shoot_date,
    app.gallery_quota(g.id) as quota,
    coalesce(
      (
        select count(*)::integer
        from selection_items si
        join selections s on s.id = si.selection_id
        where s.gallery_id = g.id
          and (s.is_primary or not exists (select 1 from selections s2 where s2.gallery_id = g.id and s2.is_primary))
          and si.mark = 'selected'
      ),
      0
    ) as selected_count,
    coalesce(
      (
        select sum(sa.quantity)::integer
        from selection_addons sa
        join products p on p.id = sa.product_id
        join selections s on s.id = sa.selection_id
        where s.gallery_id = g.id and p.kind = 'edited_photo'
      ),
      0
    ) as addon_count,
    g.extra_photo_price
  from galleries g
  join branches b on b.id = g.branch_id
  left join shoots sh on sh.id = g.shoot_id
  where coalesce(app.my_role() != 'photoshop_ctv', true)
),
metrics as (
  select
    gallery_id,
    gallery_title,
    branch_id,
    branch_name,
    lark_contract_code,
    shoot_date,
    quota,
    selected_count,
    greatest(0, selected_count - quota) as over_count,
    addon_count,
    greatest(0, greatest(0, selected_count - quota) - addon_count) as unbilled_count,
    extra_photo_price
  from raw_stats
  where quota is not null
)
select
  gallery_id,
  gallery_title,
  gallery_id as id,
  gallery_title as title,
  gallery_id as album_id,
  gallery_title as album_title,
  branch_id,
  branch_name,
  lark_contract_code,
  shoot_date,
  quota,
  quota as included_quota,
  selected_count,
  over_count,
  addon_count,
  addon_count as addon_photo_count,
  unbilled_count,
  unbilled_count as unbilled_photo_count,
  extra_photo_price,
  (unbilled_count * extra_photo_price)::numeric as unbilled_amount
from metrics
where unbilled_count > 0;

comment on view v_over_quota_unbilled is
  'Danh sách album vượt hạn mức mà chưa lập hóa đơn / chưa mua thêm. Chỉ tính ảnh mark=selected, loại bỏ album chưa biết hạn mức (quota is null).';

-- ---------------------------------------------------------------------------
-- 2. View đếm gọn cho trang tổng quan (Dashboard Summary)
-- ---------------------------------------------------------------------------

create or replace view v_over_quota_summary
with (security_invoker = true) as
with raw_stats as (
  select
    g.id as gallery_id,
    g.branch_id,
    app.gallery_quota(g.id) as quota,
    coalesce(
      (
        select count(*)::integer
        from selection_items si
        join selections s on s.id = si.selection_id
        where s.gallery_id = g.id
          and (s.is_primary or not exists (select 1 from selections s2 where s2.gallery_id = g.id and s2.is_primary))
          and si.mark = 'selected'
      ),
      0
    ) as selected_count,
    coalesce(
      (
        select sum(sa.quantity)::integer
        from selection_addons sa
        join products p on p.id = sa.product_id
        join selections s on s.id = sa.selection_id
        where s.gallery_id = g.id and p.kind = 'edited_photo'
      ),
      0
    ) as addon_count,
    g.extra_photo_price
  from galleries g
  where coalesce(app.my_role() != 'photoshop_ctv', true)
),
calculated as (
  select
    gallery_id,
    branch_id,
    quota,
    selected_count,
    addon_count,
    case
      when quota is null then 0
      else greatest(0, selected_count - quota)
    end as over_count,
    case
      when quota is null then 0
      else greatest(0, greatest(0, selected_count - quota) - addon_count)
    end as unbilled_count,
    case
      when quota is null then 0
      else greatest(0, greatest(0, selected_count - quota) - addon_count) * extra_photo_price
    end as unbilled_amount
  from raw_stats
)
select
  coalesce(count(*) filter (where quota is not null and unbilled_count > 0), 0)::integer as over_quota_album_count,
  coalesce(count(*) filter (where quota is not null and unbilled_count > 0), 0)::integer as album_count,
  coalesce(sum(unbilled_count) filter (where quota is not null and unbilled_count > 0), 0)::integer as unbilled_photo_count,
  coalesce(sum(unbilled_count) filter (where quota is not null and unbilled_count > 0), 0)::integer as photo_count,
  coalesce(sum(unbilled_amount) filter (where quota is not null and unbilled_count > 0), 0)::numeric as total_unbilled_amount,
  coalesce(sum(unbilled_amount) filter (where quota is not null and unbilled_count > 0), 0)::numeric as total_amount,
  coalesce(count(*) filter (where quota is null), 0)::integer as missing_quota_album_count,
  coalesce(count(*) filter (where quota is null), 0)::integer as missing_data_album_count
from calculated
having coalesce(app.my_role() != 'photoshop_ctv', true);

comment on view v_over_quota_summary is
  'Tổng quan thất thoát: số album vượt, số ảnh chưa thu, tổng tiền chưa thu, và số album chưa đủ dữ liệu hạn mức.';

-- ---------------------------------------------------------------------------
-- 3. Quyền hạn & Phân quyền
-- ---------------------------------------------------------------------------

revoke all on v_over_quota_unbilled from public;
revoke all on v_over_quota_summary from public;

grant select on v_over_quota_unbilled to authenticated, service_role;
grant select on v_over_quota_summary to authenticated, service_role;

commit;
