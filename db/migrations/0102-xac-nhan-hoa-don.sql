-- ============================================================================
-- 0102 — BB-395: xác nhận phát sinh bằng MÃ HOÁ ĐƠN (anh chốt 08/10/2026).
--
-- VIẾT NHƯNG CHƯA ÁP. Claude áp sau khi soát. Chạy lại được nhiều lần.
--
-- 1. Bảng `hoa_don_bo_anh`: mã hoá đơn nào đã gán cho bộ ảnh nào + kết quả đối chiếu lần
--    đồng bộ gần nhất. `ma_hoa_don` UNIQUE → MỘT mã chỉ thuộc MỘT bộ (ràng buộc DB, không
--    chỉ kiểm ở API). Đổi bộ = Admin/Quản lý gỡ gán rồi gán lại.
-- 2. Quyền mới `thanh_toan:nhap_tay` ("Nhập tiền tay / ép gán hoá đơn") cho owner, admin,
--    branch_manager. Route `POST /api/admin/galleries/[id]/payments` (nhập tay) đòi quyền
--    này từ BB-395; vai khác chỉ thấy đường mã hoá đơn. Muốn cấp cho vai khác (vd "lead"
--    sau này) thì tích ở màn Vai trò.
--
-- Sổ tiền KHÔNG đổi cấu trúc: dòng thu do hoá đơn ghi vào `gallery_payments` với
-- `ma_hoa_don`, `ma_phieu_thu` (cột có từ 0080) và `ma_yeu_cau` (0086, chống ghi trùng).
-- Dòng hạn mức do hoá đơn nằm trong `gallery_items` (`lark_record_id = 'hoa_don:<mã dòng>'`,
-- cột có sẵn, unique) — không cần cột mới.
--
-- An ninh: không tạo hàm SQL. Bảng mới bật RLS, không policy, chỉ service_role (cùng mẫu
-- `anh_album_khong_chinh` 0093) — mọi đọc/ghi đi qua route quản trị đã kiểm quyền + chi nhánh.
--
-- Đảo ngược (chạy bằng postgres):
--   drop table if exists hoa_don_bo_anh;
--   alter table selection_addons drop column if exists ma_hoa_don;
--   update roles set permissions = array_remove(permissions, 'thanh_toan:nhap_tay')
--    where id in ('00000000-0000-0000-0000-000000000001',
--                 '00000000-0000-0000-0000-000000000002',
--                 '00000000-0000-0000-0000-000000000003');
-- ============================================================================

-- 1. Hoá đơn gán cho bộ ảnh --------------------------------------------------
create table if not exists hoa_don_bo_anh (
  id            uuid primary key default gen_random_uuid(),
  gallery_id    uuid not null references galleries(id) on delete cascade,
  ma_hoa_don    text not null check (ma_hoa_don ~ '^HD_[0-9]{8}#[0-9]{1,7}$'),
  -- Nguồn đọc hoá đơn ('lark' hôm nay; 'fixture' chỉ trong phép thử; 'app' khi app tự lập).
  nguon         text not null default 'lark' check (char_length(nguon) between 1 and 20),
  -- Kết quả lần đồng bộ gần nhất.
  trang_thai    text not null default 'cho_dong_bo'
    check (trang_thai in ('cho_dong_bo', 'chua_du_dieu_kien', 'khop', 'thua', 'thieu', 'hon_hop')),
  ket_qua       jsonb,
  -- Ép gán khi app không tự kiểm được khách (khách tạo tay / hoá đơn không gắn khách):
  -- chỉ người có `thanh_toan:nhap_tay`, bắt buộc lý do.
  ep_gan_ly_do  text check (ep_gan_ly_do is null or char_length(btrim(ep_gan_ly_do)) between 3 and 500),
  gan_boi       uuid references staff_profiles(id) on delete set null,
  gan_luc       timestamptz not null default now(),
  dong_bo_luc   timestamptz,
  xac_nhan_luc  timestamptz,
  constraint uq_hoa_don_bo_anh_ma unique (ma_hoa_don)
);

create index if not exists idx_hoa_don_bo_anh_gallery on hoa_don_bo_anh(gallery_id);
create index if not exists idx_hoa_don_bo_anh_trang_thai on hoa_don_bo_anh(trang_thai)
  where trang_thai in ('thua', 'thieu', 'hon_hop', 'chua_du_dieu_kien');

alter table hoa_don_bo_anh enable row level security;
revoke all on table hoa_don_bo_anh from public, anon, authenticated;
grant all on table hoa_don_bo_anh to service_role;

comment on table hoa_don_bo_anh is
  'BB-395 — mã hoá đơn (Lark) gán cho bộ ảnh để xác nhận phát sinh. Một mã một bộ (unique). '
  'RLS bật, không policy — chỉ service_role qua /api/admin/galleries/[id]/hoa-don.';
comment on column hoa_don_bo_anh.ket_qua is
  'BB-395 — ảnh chụp kết quả đối chiếu lần đồng bộ gần nhất (tiền, phiếu thu, từng mục). Chỉ để hiển thị; số tiền thật đọc từ sổ.';

-- 1b. (vòng 2) Dòng giỏ đợt 1 đã trả bằng hoá đơn -----------------------------
-- `layTienCanThu` bỏ dòng có mã này khỏi "Phải thu" (tiền nằm trong sổ theo giá hoá đơn). Đợt ≥ 2
-- dùng `selection_rounds.ma_hoa_don` có sẵn từ 0080. Chưa áp cột này: app đọc như cũ (không lỗi).
alter table selection_addons
  add column if not exists ma_hoa_don text check (ma_hoa_don is null or char_length(btrim(ma_hoa_don)) between 1 and 64);
comment on column selection_addons.ma_hoa_don is
  'BB-395 — mã hoá đơn đã trả dòng giỏ đợt 1 này (null = chưa). Ghi/bỏ bởi đồng bộ hoá đơn.';

-- 2. Quyền mới: nhập tiền tay / ép gán hoá đơn -------------------------------
update roles
   set permissions = array_append(permissions, 'thanh_toan:nhap_tay')
 where id in ('00000000-0000-0000-0000-000000000001',  -- owner
              '00000000-0000-0000-0000-000000000002',  -- admin
              '00000000-0000-0000-0000-000000000003')  -- branch_manager
   and name in ('owner', 'admin', 'branch_manager')
   and not ('thanh_toan:nhap_tay' = any (permissions));
