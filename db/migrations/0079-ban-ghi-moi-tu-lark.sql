-- ============================================================================
-- 0079 — BB-332: "Bản ghi mới từ Lark" + đánh dấu bộ ảnh mất dòng Lark
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát; nếu trùng số
-- với nhánh khác thì đánh số lại.
--
-- Luật chủ studio 30/09/2026 (yêu cầu k6kft9qr):
--   Dòng Hậu Kỳ trên Lark có tên khách + SĐT + gói chụp, cột "Trạng Thái" còn
--   trống, VÀ cột "Link app" (link gửi khách, app ghi ngược sang Lark) còn
--   trống (chủ studio chốt lại 30/09) → hiện ở đầu Bàn làm việc "Bản ghi mới
--   từ Lark". Link Drive không phải điều kiện. Nhân viên bấm vào,
--   bổ sung link Drive, tạo bộ ảnh + Link app (thuật sĩ BB-325).
--   Lark xoá dòng → app xoá bản ghi mới; bộ ảnh CHƯA gửi khách thì lưu trữ;
--   bộ ảnh đã có Link app / ảnh chọn thì KHÔNG xoá, chỉ đánh dấu
--   `galleries.lark_dong_da_xoa_luc` → Việc cần xử lý "Dòng Lark đã bị xoá".
--
-- Bảng là BẢN SAO chỉ-đọc của Lark (app không bao giờ ghi ngược sang Lark), nên
-- xoá dòng ở đây không mất dữ liệu gốc nào.
--
-- An ninh (AGENTS §5b): bảng mới bật RLS, KHÔNG có policy, thu hết quyền của
-- anon/authenticated — chỉ service_role (route API, cron) đọc/ghi. Cùng khuôn
-- 0072/0077. Migration này KHÔNG tạo hàm SQL nào.
--
-- Chạy lại được nhiều lần: `if not exists`.
-- ============================================================================

create table if not exists lark_ban_ghi_moi (
  lark_record_id  text primary key,
  -- Khớp theo ô "Chi Nhánh" của Lark; không khớp thì NULL (không đoán chi nhánh).
  branch_id       uuid references branches(id) on delete set null,
  -- Tên/SĐT thật chỉ lưu khi DB đích được phép giữ tên thật (muc-tieu-du-lieu.ts).
  ten_khach       text not null,
  so_dien_thoai   text,
  goi_chup        text not null,
  ma_hoa_don      text,
  ngay_chup       date,
  chi_nhanh_lark  text,
  drive_url       text,
  -- Bộ ảnh đã tạo từ dòng này (neo lark_hauky_record_id); có giá trị thì dòng rời khối.
  gallery_id      uuid references galleries(id) on delete set null,
  lark_tao_luc    timestamptz,
  thay_luc        timestamptz not null default now(),
  cap_nhat_luc    timestamptz not null default now()
);

create index if not exists idx_lark_ban_ghi_moi_cho
  on lark_ban_ghi_moi(branch_id, thay_luc)
  where gallery_id is null;

alter table lark_ban_ghi_moi enable row level security;
revoke all on table lark_ban_ghi_moi from anon, authenticated;

comment on table lark_ban_ghi_moi is
  'BB-332 — dòng Hậu Kỳ mới trên Lark (đủ tên+SĐT+gói, Trạng Thái trống, Link app trống) chưa thành bộ ảnh. '
  'Bản sao chỉ-đọc; RLS bật, không policy — chỉ service_role qua /api/admin/lark-moi, hook, cron.';

alter table galleries
  add column if not exists lark_dong_da_xoa_luc timestamptz;

comment on column galleries.lark_dong_da_xoa_luc is
  'BB-332 — lúc app thấy dòng Hậu Kỳ neo của bộ ảnh đã bị XOÁ trên Lark. Bộ chưa gửi khách thì '
  'đồng thời bị lưu trữ; bộ đã gửi/có ảnh chọn thì giữ nguyên và hiện ở Việc cần xử lý.';

create index if not exists idx_galleries_lark_dong_da_xoa
  on galleries(lark_dong_da_xoa_luc)
  where lark_dong_da_xoa_luc is not null and status <> 'archived';
