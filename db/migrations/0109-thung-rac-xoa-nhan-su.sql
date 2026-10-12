-- ============================================================================
-- 0109 — BB-409: THÙNG RÁC bộ ảnh (10 ngày, tự dọn) + XOÁ NHÂN SỰ (chuyển dữ liệu
-- về "Tổ chức BabyBean"). Chủ studio chốt 10/10/2026.
--
-- VIẾT NHƯNG CHƯA ÁP. Giám đốc áp sau khi soát. Chạy lại được nhiều lần (if not
-- exists / create or replace / drop … if exists). PHẢI ÁP TRƯỚC KHI TRIỂN KHAI MÃ
-- BB-409: mã mới đọc `galleries.deleted_at`, `staff_profiles.da_nghi_luc`.
--
-- 1. galleries.deleted_at / deleted_by — bộ trong thùng rác. App bỏ qua bộ có
--    deleted_at ở mọi danh sách; khách mở link thấy "bộ ảnh không còn".
-- 2. Bảng `bo_anh_da_xoa` — DẤU (tombstone) của bộ đã xoá, SỐNG TIẾP sau khi dọn
--    hẳn: đồng bộ Lark (hook, cron, "Bản ghi mới từ Lark") bỏ qua dòng Hậu Kỳ có
--    `lark_hauky_record_id` hoặc thư mục Drive (lưu BĂM sha256, không lưu id thật)
--    trùng dấu. Admin "Cho Lark tạo lại" = đặt `bo_dau_luc`. Chỉ giữ MÃ, không
--    giữ tên khách/bé/SĐT.
-- 3. staff_profiles.da_nghi_luc / nghi_boi / la_to_chuc — nhân sự đã xoá (giữ dòng
--    để nhật ký và cột lịch sử không gãy) và dòng chủ thể chung "Tổ chức BabyBean"
--    (tối đa MỘT dòng, chỉ mục unique có điều kiện; app tạo khi cần).
-- 4. Quyền mới `bo_anh:xoa`, `nhan_su:xoa` cho owner (Admin), admin, branch_manager.
-- 5. Hàm (security definer, ghim search_path, revoke/grant NGAY SAU create —
--    AGENTS.md §5b; chỉ service_role gọi):
--      bo_anh_vao_thung_rac(uuid, uuid, text)       → timestamptz
--      bo_anh_khoi_phuc(uuid)                        → boolean
--      duong_dan_storage_bo_anh(uuid)                → table(bucket, name)
--      bo_anh_don_han(uuid)                          → jsonb
--      dem_du_lieu_nhan_su(uuid)                     → jsonb
--      xoa_nhan_su_chuyen_du_lieu(uuid, uuid, uuid)  → jsonb  (MỘT giao dịch)
-- 6. get_admin_galleries: dựng lại từ 0081 (bản mới nhất — soát bằng
--    `grep -rl "function get_admin_galleries" db/migrations`: 0013/0030/0068/0081),
--    CHỈ thêm `g.deleted_at is null` (2 chỗ) và đuôi " (đã nghỉ)" cho tên nhân sự
--    đã xoá. Chữ ký giữ nguyên 14 tham số → không cần drop.
-- 7. v_over_quota_unbilled / v_over_quota_summary: dựng lại từ 0103 (drop+create,
--    giữ TẬP CỘT HỢP có bí danh của bb-dev), CHỈ thêm `g.deleted_at is null`.
-- 8. v_gallery_progress: lấy định nghĩa ĐANG CHẠY (pg_get_viewdef) + `where g.deleted_at
--    is null` (khối DO, tự bỏ qua kèm notice nếu định nghĩa lệch dự kiến).
-- 9. count_galleries_missing_quota (0031): thêm `g.deleted_at is null`, ghim search_path.
--
-- Không đụng `check_staff_deletable` / `v_staff_deletable` (0047/0048): route mới
-- không dùng nữa nhưng để nguyên cho đảo ngược được.
--
-- Đảo ngược (chạy bằng postgres; KHÔNG khôi phục được bộ đã dọn hẳn):
--   áp lại khối get_admin_galleries của 0081, khối view của 0103, hàm của 0031 và
--   khối v_gallery_progress của db/schema.sql;
--   drop function if exists public.xoa_nhan_su_chuyen_du_lieu(uuid, uuid, uuid),
--     public.dem_du_lieu_nhan_su(uuid), public.bo_anh_don_han(uuid),
--     public.duong_dan_storage_bo_anh(uuid), public.bo_anh_khoi_phuc(uuid),
--     public.bo_anh_vao_thung_rac(uuid, uuid, text);
--   drop table if exists bo_anh_da_xoa;
--   alter table galleries drop column if exists deleted_by, drop column if exists deleted_at;
--   alter table staff_profiles drop column if exists la_to_chuc,
--     drop column if exists nghi_boi, drop column if exists da_nghi_luc;
--   update roles set permissions = array_remove(array_remove(permissions, 'bo_anh:xoa'), 'nhan_su:xoa')
--    where id in ('00000000-0000-0000-0000-000000000001',
--                 '00000000-0000-0000-0000-000000000002',
--                 '00000000-0000-0000-0000-000000000003');
-- ============================================================================

begin;

-- 1. Thùng rác bộ ảnh ---------------------------------------------------------
alter table galleries add column if not exists deleted_at timestamptz;
alter table galleries add column if not exists deleted_by uuid references staff_profiles(id) on delete set null;
create index if not exists idx_galleries_thung_rac on galleries (deleted_at) where deleted_at is not null;

comment on column galleries.deleted_at is
  'BB-409 — bộ ở THÙNG RÁC từ lúc này (null = đang dùng). Quá 10 ngày cron 01:00 dọn hẳn. Mọi danh sách bỏ qua bộ có giá trị.';
comment on column galleries.deleted_by is 'BB-409 — nhân sự bấm "Xoá bộ ảnh".';

-- 2. Dấu bộ đã xoá (sống tiếp sau khi dọn hẳn) -------------------------------
create table if not exists bo_anh_da_xoa (
  -- KHÔNG khoá ngoại: dấu phải còn sau khi dòng galleries bị xoá hẳn.
  gallery_id            uuid primary key,
  ma_bo                 text not null check (char_length(ma_bo) between 4 and 40),
  branch_id             uuid references branches(id) on delete set null,
  lark_hauky_record_id  text,
  -- sha256 hex của drive_folder_id — đủ để so khớp, không lộ thư mục ảnh công khai.
  drive_folder_hash     text check (drive_folder_hash is null or drive_folder_hash ~ '^[0-9a-f]{64}$'),
  xoa_luc               timestamptz not null default now(),
  xoa_boi               uuid references staff_profiles(id) on delete set null,
  don_luc               timestamptz,
  so_lieu_don           jsonb,
  bo_dau_luc            timestamptz,
  bo_dau_boi            uuid references staff_profiles(id) on delete set null
);
create index if not exists idx_bo_anh_da_xoa_lark on bo_anh_da_xoa (lark_hauky_record_id)
  where lark_hauky_record_id is not null and bo_dau_luc is null;
create index if not exists idx_bo_anh_da_xoa_drive on bo_anh_da_xoa (drive_folder_hash)
  where drive_folder_hash is not null and bo_dau_luc is null;

alter table bo_anh_da_xoa enable row level security;
revoke all on table bo_anh_da_xoa from public, anon, authenticated;
grant all on table bo_anh_da_xoa to service_role;

comment on table bo_anh_da_xoa is
  'BB-409 — dấu bộ ảnh đã xoá (thùng rác hoặc đã dọn hẳn). Đồng bộ Lark bỏ qua dòng trùng dấu khi bo_dau_luc is null. '
  'Chỉ mã, không dữ liệu cá nhân. RLS bật, không policy — chỉ service_role.';

-- 3. Nhân sự đã xoá + chủ thể "Tổ chức BabyBean" -----------------------------
alter table staff_profiles add column if not exists da_nghi_luc timestamptz;
alter table staff_profiles add column if not exists nghi_boi uuid references staff_profiles(id) on delete set null;
alter table staff_profiles add column if not exists la_to_chuc boolean not null default false;
create unique index if not exists uq_staff_profiles_to_chuc on staff_profiles (la_to_chuc) where la_to_chuc;

comment on column staff_profiles.da_nghi_luc is
  'BB-409 — đã XOÁ khỏi nhân sự (khác "Cho nghỉ việc": không cho làm lại; việc phụ trách đã chuyển về Tổ chức BabyBean). Tên hiện kèm "(đã nghỉ)".';
comment on column staff_profiles.la_to_chuc is
  'BB-409 — dòng chủ thể chung "Tổ chức BabyBean" nhận việc của nhân sự đã xoá. Tài khoản đăng nhập bị khoá, is_active = false.';

-- 4. Quyền mới -----------------------------------------------------------------
update roles
   set permissions = array_append(permissions, 'bo_anh:xoa')
 where id in ('00000000-0000-0000-0000-000000000001',  -- owner (Admin)
              '00000000-0000-0000-0000-000000000002',  -- admin
              '00000000-0000-0000-0000-000000000003')  -- branch_manager (Quản lý)
   and name in ('owner', 'admin', 'branch_manager')
   and not ('bo_anh:xoa' = any (permissions));

update roles
   set permissions = array_append(permissions, 'nhan_su:xoa')
 where id in ('00000000-0000-0000-0000-000000000001',
              '00000000-0000-0000-0000-000000000002',
              '00000000-0000-0000-0000-000000000003')
   and name in ('owner', 'admin', 'branch_manager')
   and not ('nhan_su:xoa' = any (permissions));

-- 5a. Đưa bộ vào thùng rác + đặt dấu (một giao dịch) ---------------------------
create or replace function public.bo_anh_vao_thung_rac(p_gallery_id uuid, p_actor_id uuid, p_drive_hash text)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_luc timestamptz := now();
  v_g record;
begin
  select id, branch_id, lark_hauky_record_id, deleted_at into v_g
    from galleries where id = p_gallery_id for update;
  if not found or v_g.deleted_at is not null then
    return null;
  end if;

  update galleries set deleted_at = v_luc, deleted_by = p_actor_id, updated_at = v_luc
   where id = p_gallery_id;

  insert into bo_anh_da_xoa (gallery_id, ma_bo, branch_id, lark_hauky_record_id, drive_folder_hash, xoa_luc, xoa_boi)
  values (p_gallery_id, left(p_gallery_id::text, 8), v_g.branch_id, v_g.lark_hauky_record_id,
          nullif(p_drive_hash, ''), v_luc, p_actor_id)
  on conflict (gallery_id) do update
     set xoa_luc = excluded.xoa_luc, xoa_boi = excluded.xoa_boi,
         lark_hauky_record_id = excluded.lark_hauky_record_id,
         drive_folder_hash = excluded.drive_folder_hash,
         don_luc = null, bo_dau_luc = null, bo_dau_boi = null;

  return v_luc;
end;
$$;
revoke execute on function public.bo_anh_vao_thung_rac(uuid, uuid, text) from public, anon, authenticated;
grant  execute on function public.bo_anh_vao_thung_rac(uuid, uuid, text) to service_role;

-- 5b. Khôi phục (gỡ dấu) -------------------------------------------------------
create or replace function public.bo_anh_khoi_phuc(p_gallery_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update galleries set deleted_at = null, deleted_by = null, updated_at = now()
   where id = p_gallery_id and deleted_at is not null;
  if not found then
    return false;
  end if;
  delete from bo_anh_da_xoa where gallery_id = p_gallery_id;
  return true;
end;
$$;
revoke execute on function public.bo_anh_khoi_phuc(uuid) from public, anon, authenticated;
grant  execute on function public.bo_anh_khoi_phuc(uuid) to service_role;

-- 5c. Tệp Storage của bộ (đọc storage.objects; xoá tệp đi qua Storage API) ------
-- Quy ước đường dẫn trong mã: thumbnails/<photoId>/<w>.jpg (/api/img, lam-nong-cache),
-- thumbnails/icon/<galleryId>/… (bia-vuong-server), yeu-cau-sua/<galleryId>/… (ảnh mẫu, 0091).
create or replace function public.duong_dan_storage_bo_anh(p_gallery_id uuid)
returns table (bucket text, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select o.bucket_id::text, o.name::text
    from storage.objects o
   where o.bucket_id = 'thumbnails'
     and split_part(o.name, '/', 1) in (select p.id::text from photos p where p.gallery_id = p_gallery_id)
  union all
  select o.bucket_id::text, o.name::text
    from storage.objects o
   where o.bucket_id = 'thumbnails'
     and o.name like 'icon/' || p_gallery_id::text || '/%'
  union all
  select o.bucket_id::text, o.name::text
    from storage.objects o
   where o.bucket_id = 'yeu-cau-sua'
     and o.name like p_gallery_id::text || '/%';
$$;
revoke execute on function public.duong_dan_storage_bo_anh(uuid) from public, anon, authenticated;
grant  execute on function public.duong_dan_storage_bo_anh(uuid) to service_role;

-- 5d. Dọn hẳn một bộ đã ở thùng rác ------------------------------------------
-- Xoá dòng galleries → mọi bảng con có `on delete cascade` đi theo (ảnh, lượt chọn,
-- đợt chọn, đặt in, mua thêm, link khách theo bộ, thông báo, hoá đơn gán…).
-- activity_logs.gallery_id là `on delete set null` (0051) → nhật ký CÒN, mất liên kết.
-- lark_ban_ghi_moi.gallery_id `on delete set null` → khối "Bản ghi mới" lọc bằng dấu.
create or replace function public.bo_anh_don_han(p_gallery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted timestamptz;
  v_so_anh int;
  v_so_luot_chon int;
  v_so_link int;
  v_so_lieu jsonb;
begin
  select deleted_at into v_deleted from galleries where id = p_gallery_id for update;
  if not found or v_deleted is null then
    return null;  -- chỉ dọn bộ ĐANG ở thùng rác
  end if;

  select count(*) into v_so_anh from photos where gallery_id = p_gallery_id;
  select count(*) into v_so_luot_chon from selections where gallery_id = p_gallery_id;
  select count(*) into v_so_link from share_links where gallery_id = p_gallery_id;
  v_so_lieu := jsonb_build_object('soAnh', v_so_anh, 'soLuotChon', v_so_luot_chon, 'soLink', v_so_link);

  delete from galleries where id = p_gallery_id;

  insert into bo_anh_da_xoa (gallery_id, ma_bo, xoa_luc, don_luc, so_lieu_don)
  values (p_gallery_id, left(p_gallery_id::text, 8), v_deleted, now(), v_so_lieu)
  on conflict (gallery_id) do update set don_luc = now(), so_lieu_don = excluded.so_lieu_don;

  return v_so_lieu;
end;
$$;
revoke execute on function public.bo_anh_don_han(uuid) from public, anon, authenticated;
grant  execute on function public.bo_anh_don_han(uuid) to service_role;

-- 5e. Đếm việc sẽ chuyển khi xoá nhân sự (màn xác nhận) ------------------------
create or replace function public.dem_du_lieu_nhan_su(p_staff_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'boAnhPhoto',   (select count(*) from galleries where photographer_id = p_staff_id and deleted_at is null),
    'boAnhCskh',    (select count(*) from galleries where cskh_id = p_staff_id and deleted_at is null),
    'boAnhChinh',   (select count(*) from galleries where editor_id = p_staff_id and deleted_at is null),
    'viecChinhAnh', (select count(*) from deliveries where retoucher_id = p_staff_id),
    -- Anh 12/10: buổi ĐÃ chụp là lịch sử (giữ tên thợ, hiện "(đã nghỉ)"); chỉ buổi chưa tới ngày mới chuyển.
    'buoiChup',     (select count(*) from shoots where photographer_id = p_staff_id
                       and shoot_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date),
    'khachTao',     (select count(*) from customers where created_by = p_staff_id),
    'dongNhatKy',   (select count(*) from activity_logs where actor_type = 'staff' and actor_id = p_staff_id)
  );
$$;
revoke execute on function public.dem_du_lieu_nhan_su(uuid) from public, anon, authenticated;
grant  execute on function public.dem_du_lieu_nhan_su(uuid) to service_role;

-- 5f. Xoá nhân sự: chuyển việc ĐANG PHỤ TRÁCH về Tổ chức, giữ cột LỊCH SỬ ------
-- Cột phụ trách (chuyển): galleries.photographer_id, cskh_id, editor_id;
--   deliveries.retoucher_id; shoots.photographer_id (CHỈ buổi chưa tới ngày). staff_branches: xoá.
-- Cột lịch sử (giữ, hiện "(đã nghỉ)"): *.created_by, share_links.revoked_by,
--   gallery_payments.confirmed_by, settings.updated_by, activity_logs.actor_id,
--   selection_rounds.confirmed_by / xu_ly_by / da_thanh_toan_boi,
--   selections.studio_xu_ly_dot1_boi, goi_chup_gia_anh_them.cap_nhat_boi,
--   hoa_don_bo_anh.gan_boi, galleries.deleted_by, bo_anh_da_xoa.xoa_boi.
-- Lỗi nghiệp vụ ném mã 'BB409_*' — route dịch sang câu tiếng Việt.
create or replace function public.xoa_nhan_su_chuyen_du_lieu(p_staff_id uuid, p_to_chuc_id uuid, p_actor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nv record;
  n_photo int; n_cskh int; n_editor int; n_retoucher int; n_shoot int; n_branch int;
begin
  if p_staff_id = p_actor_id then
    raise exception 'BB409_TU_XOA';
  end if;

  select id, role::text as role, la_to_chuc, da_nghi_luc into v_nv
    from staff_profiles where id = p_staff_id for update;
  if not found then raise exception 'BB409_KHONG_THAY'; end if;
  if v_nv.role = 'owner' then raise exception 'BB409_ADMIN'; end if;
  if v_nv.la_to_chuc then raise exception 'BB409_TO_CHUC'; end if;
  if v_nv.da_nghi_luc is not null then raise exception 'BB409_DA_XOA'; end if;

  perform 1 from staff_profiles where id = p_to_chuc_id and la_to_chuc;
  if not found then raise exception 'BB409_THIEU_TO_CHUC'; end if;

  update galleries set photographer_id = p_to_chuc_id where photographer_id = p_staff_id;
  get diagnostics n_photo = row_count;
  update galleries set cskh_id = p_to_chuc_id where cskh_id = p_staff_id;
  get diagnostics n_cskh = row_count;
  update galleries set editor_id = p_to_chuc_id where editor_id = p_staff_id;
  get diagnostics n_editor = row_count;
  update deliveries set retoucher_id = p_to_chuc_id where retoucher_id = p_staff_id;
  get diagnostics n_retoucher = row_count;
  -- Anh 12/10: chỉ buổi chụp CHƯA tới ngày chuyển về Tổ chức; buổi đã chụp giữ tên thợ (lịch sử).
  update shoots set photographer_id = p_to_chuc_id
   where photographer_id = p_staff_id
     and shoot_date >= (now() at time zone 'Asia/Ho_Chi_Minh')::date;
  get diagnostics n_shoot = row_count;
  delete from staff_branches where staff_id = p_staff_id;
  get diagnostics n_branch = row_count;

  update staff_profiles
     set is_active = false, da_nghi_luc = now(), nghi_boi = p_actor_id, updated_at = now()
   where id = p_staff_id;

  return jsonb_build_object(
    'boAnhPhoto', n_photo, 'boAnhCskh', n_cskh, 'boAnhChinh', n_editor,
    'viecChinhAnh', n_retoucher, 'buoiChup', n_shoot, 'chiNhanhGo', n_branch
  );
end;
$$;
revoke execute on function public.xoa_nhan_su_chuyen_du_lieu(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.xoa_nhan_su_chuyen_du_lieu(uuid, uuid, uuid) to service_role;

-- 6. get_admin_galleries: bản 0081 + lọc thùng rác + "(đã nghỉ)" ----------------
create or replace function get_admin_galleries(
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
  p_limit integer,
  p_lark_photo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
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
      -- BB-409: bộ trong thùng rác không hiện ở danh sách/kanban/đếm.
      and g.deleted_at is null
      and (p_photographer_id is null or sh.photographer_id = p_photographer_id)
      -- BB-335: lọc theo tên thợ chụp đọc từ cột "photo" của Lark (chứa, không phân biệt hoa thường)
      and (p_lark_photo is null or g.lark_photo ilike '%' || p_lark_photo || '%')
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
      -- BB-409: người đã xoá khỏi nhân sự hiện kèm "(đã nghỉ)".
      case when sp_photo.da_nghi_luc is not null then sp_photo.full_name || ' (đã nghỉ)' else sp_photo.full_name end as photographer_name,
      ed.retoucher_id as editor_id,
      ed.retoucher_name as editor_name,
      sp_cs.id as cskh_id,
      case when sp_cs.da_nghi_luc is not null then sp_cs.full_name || ' (đã nghỉ)' else sp_cs.full_name end as cskh_name,
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
      app.gallery_quota(g.id) as included_quota,
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
      g.created_at,
      -- BB-200 (2/3): mã thô từ Lark — TypeScript tính nhãn/mức cảnh báo.
      g.lark_trang_thai,
      g.lark_canh_bao,
      g.lark_doc_luc,
      g.lark_photo
    from galleries g
    join branches b on b.id = g.branch_id
    join customers c on c.id = g.customer_id
    left join babies bb on bb.id = g.baby_id
    left join shoots sh on sh.id = g.shoot_id
    left join staff_profiles sp_photo on sp_photo.id = sh.photographer_id
    left join staff_profiles sp_cs on sp_cs.id = g.created_by
    left join lateral (
      select del.retoucher_id,
             case when sp_ret.da_nghi_luc is not null then sp_ret.full_name || ' (đã nghỉ)' else sp_ret.full_name end as retoucher_name
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
      -- BB-409: bộ trong thùng rác không hiện ở danh sách/kanban/đếm.
      and g.deleted_at is null
      and (p_status is null or g.status::text = any(p_status))
      and (p_photographer_id is null or sh.photographer_id = p_photographer_id)
      -- BB-335: lọc theo tên thợ chụp đọc từ cột "photo" của Lark (chứa, không phân biệt hoa thường)
      and (p_lark_photo is null or g.lark_photo ilike '%' || p_lark_photo || '%')
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
          'extraCount', case
            when r.included_quota is null then null
            else greatest(0, r.selected_count - r.included_quota)
          end,
          'progress', r.selected_count || '/' || coalesce(r.included_quota::text, '?'),
          'dueAt', r.due_at,
          'status', r.status,
          'lastSelectedAt', r.last_selected_at,
          'urgency', r.urgency,
          'sentAt', r.sent_at,
          'submittedAt', r.submitted_at,
          'createdAt', r.created_at,
          'larkTrangThai', r.lark_trang_thai,
          'larkCanhBao', r.lark_canh_bao,
          'larkDocLuc', r.lark_doc_luc,
          'larkPhoto', r.lark_photo
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

revoke all on function get_admin_galleries(uuid[], text[], uuid, uuid, uuid, date, date, boolean, text, text, text, integer, integer, text) from public, anon, authenticated;
grant execute on function get_admin_galleries(uuid[], text[], uuid, uuid, uuid, date, date, boolean, text, text, text, integer, integer, text) to service_role;

-- 7. View vượt hạn mức: bản 0103 + lọc thùng rác --------------------------------
drop view if exists v_over_quota_summary;
drop view if exists v_over_quota_unbilled;

create view v_over_quota_unbilled
with (security_invoker = true) as
with raw_stats as (
  select
    g.id            as gallery_id,
    g.title         as gallery_title,
    g.branch_id,
    b.name          as branch_name,
    coalesce(
      g.lark_contract_code,
      (select gi.lark_contract_code from gallery_items gi
        where gi.gallery_id = g.id and gi.lark_contract_code is not null limit 1)
    )               as lark_contract_code,
    sh.shoot_date,
    app.gallery_quota(g.id) as quota,
    -- distinct: một tấm ảnh mà hai người cùng chọn vẫn là một tấm ảnh.
    -- 0103: chỉ ảnh ĐỢT 1 — ảnh đợt ≥ 2 tính tiền theo đợt (selection_rounds.tien_anh).
    coalesce((
      select count(distinct si.photo_id)::integer
        from selection_items si
        join selections s on s.id = si.selection_id
       where s.gallery_id = g.id
         and (s.is_primary or not exists (
               select 1 from selections s2 where s2.gallery_id = g.id and s2.is_primary))
         and si.mark = 'selected'
         and si.dot = 1
    ), 0)           as selected_count,
    -- 0103: "Edit file" mua ở giỏ đợt ≥ 2 đã nằm trong tiền của đợt — không trừ vào vượt đợt 1.
    coalesce((
      select sum(sa.quantity)::integer
        from selection_addons sa
        join products p on p.id = sa.product_id
        join selections s on s.id = sa.selection_id
       where s.gallery_id = g.id and p.kind = 'edited_photo'
         and sa.dot = 1
    ), 0)           as addon_count,
    g.extra_photo_price
  from galleries g
  join branches b on b.id = g.branch_id
  left join shoots sh on sh.id = g.shoot_id
  where app.my_role() is distinct from 'photoshop_ctv'
    and g.deleted_at is null  -- BB-409: bộ trong thùng rác không tính thất thoát
),
metrics as (
  select *,
         greatest(0, selected_count - quota) as over_count
    from raw_stats
   where quota is not null      -- chưa biết hạn mức thì không kết luận gì
)
select
  gallery_id,
  gallery_title,
  gallery_id    as id,
  gallery_title as title,
  gallery_id    as album_id,
  gallery_title as album_title,
  branch_id,
  branch_name,
  lark_contract_code,
  shoot_date,
  quota,
  quota         as included_quota,
  selected_count,
  over_count,
  addon_count,
  addon_count   as addon_photo_count,
  greatest(0, over_count - addon_count)                        as unbilled_count,
  greatest(0, over_count - addon_count)                        as unbilled_photo_count,
  extra_photo_price,
  (greatest(0, over_count - addon_count) * extra_photo_price)::numeric as unbilled_amount
from metrics
where greatest(0, over_count - addon_count) > 0;

comment on view v_over_quota_unbilled is
  'Album đã chọn vượt hạn mức (ẢNH ĐỢT 1 — 0103) mà chưa mua thêm. Chỉ đếm ảnh mark = selected, '
  'mỗi ảnh một lần. Ảnh đợt ≥ 2 tính tiền theo đợt (selection_rounds). Album chưa biết hạn mức '
  'KHÔNG nằm ở đây — xem missing_quota_album_count trong v_over_quota_summary.';

create or replace view v_over_quota_summary
with (security_invoker = true) as
with per_gallery as (
  select
    g.id as gallery_id,
    app.gallery_quota(g.id) as quota,
    coalesce((
      select count(distinct si.photo_id)::integer
        from selection_items si
        join selections s on s.id = si.selection_id
       where s.gallery_id = g.id
         and (s.is_primary or not exists (
               select 1 from selections s2 where s2.gallery_id = g.id and s2.is_primary))
         and si.mark = 'selected'
         and si.dot = 1
    ), 0) as selected_count,
    coalesce((
      select sum(sa.quantity)::integer
        from selection_addons sa
        join products p on p.id = sa.product_id
        join selections s on s.id = sa.selection_id
       where s.gallery_id = g.id and p.kind = 'edited_photo'
         and sa.dot = 1
    ), 0) as addon_count,
    g.extra_photo_price
  from galleries g
  where app.my_role() is distinct from 'photoshop_ctv'
    and g.deleted_at is null  -- BB-409: bộ trong thùng rác không tính thất thoát
),
calculated as (
  select
    quota,
    case when quota is null then 0
         else greatest(0, greatest(0, selected_count - quota) - addon_count) end as unbilled_count,
    extra_photo_price
  from per_gallery
)
select
  count(*) filter (where quota is not null and unbilled_count > 0)::integer
    as over_quota_album_count,
  count(*) filter (where quota is not null and unbilled_count > 0)::integer
    as album_count,
  coalesce(sum(unbilled_count) filter (where quota is not null), 0)::integer
    as unbilled_photo_count,
  coalesce(sum(unbilled_count) filter (where quota is not null), 0)::integer
    as photo_count,
  coalesce(sum(unbilled_count * extra_photo_price) filter (where quota is not null), 0)::numeric
    as total_unbilled_amount,
  coalesce(sum(unbilled_count * extra_photo_price) filter (where quota is not null), 0)::numeric
    as total_amount,
  count(*) filter (where quota is null)::integer
    as missing_quota_album_count,
  count(*) filter (where quota is null)::integer
    as missing_data_album_count
from calculated
having app.my_role() is distinct from 'photoshop_ctv';

comment on view v_over_quota_summary is
  'Tổng quan thất thoát (ảnh đợt 1 — 0103). missing_quota_album_count là số album CHƯA ĐỦ DỮ LIỆU '
  'để đối chiếu, phải đọc kèm ba con số kia — con số tiền là SÀN, không phải trần.';

revoke all on v_over_quota_unbilled from public;
revoke all on v_over_quota_summary from public;
grant select on v_over_quota_unbilled to authenticated, service_role;
grant select on v_over_quota_summary to authenticated, service_role;

-- 8. v_gallery_progress (nguồn Bàn làm việc: sắp hết hạn / quá hạn / cần xử lý) -----
-- Chỉ định nghĩa ở schema.sql (không migration nào dựng lại; bb-dev có thể đã lệch).
-- Không chép tay: lấy ĐÚNG định nghĩa đang chạy trong DB, thêm `where g.deleted_at is
-- null` rồi `create or replace` (cùng bộ cột → giữ nguyên quyền + tuỳ chọn view).
-- Định nghĩa đã có WHERE/deleted_at (lệch dự kiến) → BỎ QUA kèm notice, không làm hỏng
-- cả migration. Đảo ngược: chạy lại khối `create or replace view v_gallery_progress`
-- của db/schema.sql (mục 16).
do $$
declare
  v_def  text;
  v_opts text[];
begin
  if to_regclass('public.v_gallery_progress') is null then
    raise notice 'BB-409: không có v_gallery_progress — bỏ qua';
    return;
  end if;
  v_def := rtrim(pg_get_viewdef('public.v_gallery_progress'::regclass, true));
  v_def := rtrim(regexp_replace(v_def, ';\s*$', ''));
  if v_def ~* '\mwhere\M' or v_def ~* 'deleted_at' then
    raise notice 'BB-409: v_gallery_progress đã có WHERE/deleted_at — bỏ qua, soát tay';
    return;
  end if;
  if v_def !~* '\mgalleries g\M' then
    raise notice 'BB-409: v_gallery_progress không đọc "galleries g" — bỏ qua, soát tay';
    return;
  end if;
  select reloptions into v_opts from pg_class where oid = 'public.v_gallery_progress'::regclass;
  execute 'create or replace view public.v_gallery_progress'
       || case when v_opts is null then '' else ' with (' || array_to_string(v_opts, ', ') || ')' end
       || ' as ' || v_def || E'\n  WHERE g.deleted_at IS NULL';
end;
$$;

-- 9. count_galleries_missing_quota (0031) + lọc thùng rác ----------------------
create or replace function count_galleries_missing_quota(p_branch_ids uuid[])
returns table (n integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
    from galleries g
   where g.branch_id = any(p_branch_ids)
     and g.status in ('ready', 'in_review', 'submitted')
     and g.deleted_at is null  -- BB-409: bộ trong thùng rác không tính
     and app.gallery_quota(g.id) is null;
$$;
revoke all on function count_galleries_missing_quota(uuid[]) from public, anon, authenticated;
grant execute on function count_galleries_missing_quota(uuid[]) to service_role;

commit;
