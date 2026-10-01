-- ============================================================================
-- 0083 — BB-345: tim của gia đình (link "Mời gia đình", vai viewer) lưu trên
-- máy chủ, và "Đặt chỉnh sửa" các tấm gia đình đã thả tim.
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát. Chưa áp thì
-- app chạy như BB-338 (tim chỉ ở trình duyệt, nút "Đặt chỉnh sửa" xám "đang
-- chuẩn bị") — không 500 (`chuaApMigration`, cùng cách BB-332).
--
-- Anh 01/10/2026: "thêm tim cho màn mời để tối ưu doanh thu chỉnh sửa".
--
-- ---------------------------------------------------------------------------
-- 1. Bảng `tim_gia_dinh`
-- ---------------------------------------------------------------------------
-- Một dòng = một link mời đã thả tim một tấm. Khoá duy nhất (share_link_id,
-- photo_id): bấm lại không nhân đôi. KHÔNG đụng `selection_items` — danh sách
-- trong gói vẫn do ba mẹ quyết, máy chủ vẫn chặn viewer 403 ở /api/g/selection.
--
-- An ninh (AGENTS §5b, cùng khuôn 0072/0077): bật RLS, KHÔNG policy nào, thu
-- hết quyền của anon/authenticated. Chỉ service_role đọc/ghi qua
-- /api/g/tim-gia-dinh (kiểm phiên khách: đúng bộ ảnh, đúng link, ảnh thuộc bộ
-- ảnh) và /api/admin/galleries/[id]/tim-gia-dinh (requireStaff + requireBranch).
--
-- `on delete cascade` ở share_link_id: ba mẹ thu hồi/xoá link mời thì tim của
-- link đó đi theo. Yêu cầu chỉnh sửa đã gửi thì KHÔNG mất — nó nằm ở
-- `yeu_cau_mua_them.anh_ids` (bản chụp lúc gửi).
--
-- ---------------------------------------------------------------------------
-- 2. `yeu_cau_mua_them` nhận thêm loại 'chinh_sua' (luồng BB-245/BB-254 sẵn có)
-- ---------------------------------------------------------------------------
-- Chọn luồng "yêu cầu mua thêm" chứ không phải "đợt chọn" (BB-321): đợt chọn
-- ghi vào `selection_items` của BA MẸ và khoá ảnh — viewer không được chạm
-- danh sách đó. Yêu cầu mua thêm đúng là "gia đình gửi yêu cầu, CSKH gọi lại
-- chốt giá/thanh toán", đã có tên/SĐT/link người gửi (0073), có CSKH đổi trạng
-- thái (BB-249) và có trạng thái đã thanh toán (0080).
--
-- Một yêu cầu chỉnh sửa = MỘT dòng: product_id NULL (không phải sản phẩm in),
-- so_luong = số tấm, anh_ids = các tấm, don_gia = giá ảnh thêm của bộ ảnh
-- (galleries.extra_photo_price) lúc gửi, tam_tinh = so_luong × don_gia.
--
-- Chạy lại được nhiều lần: `if not exists` / `drop constraint if exists`.
-- Không tạo hàm SQL nào, nên không có dòng `revoke execute`.
--
-- Đảo ngược (chỉ khi chưa có dòng 'chinh_sua'):
--   drop table if exists tim_gia_dinh;
--   alter table yeu_cau_mua_them drop constraint if exists yeu_cau_mua_them_loai_hop_le;
--   alter table yeu_cau_mua_them drop constraint if exists yeu_cau_mua_them_so_luong_check;
--   alter table yeu_cau_mua_them add constraint yeu_cau_mua_them_so_luong_check check (so_luong between 1 and 20);
--   alter table yeu_cau_mua_them drop column loai, drop column anh_ids,
--     drop column don_gia, drop column tam_tinh;
--   alter table yeu_cau_mua_them alter column product_id set not null;
-- ============================================================================

-- 1. tim_gia_dinh --------------------------------------------------------------
create table if not exists tim_gia_dinh (
  id             uuid primary key default gen_random_uuid(),
  gallery_id     uuid not null references galleries(id)   on delete cascade,
  share_link_id  uuid not null references share_links(id) on delete cascade,
  photo_id       uuid not null references photos(id)      on delete cascade,
  created_at     timestamptz not null default now(),
  constraint uq_tim_gia_dinh_link_anh unique (share_link_id, photo_id)
);

create index if not exists idx_tim_gia_dinh_gallery on tim_gia_dinh(gallery_id);

alter table tim_gia_dinh enable row level security;
revoke all on table tim_gia_dinh from public, anon, authenticated;
grant all on table tim_gia_dinh to service_role;

comment on table tim_gia_dinh is
  'BB-345 — tấm ảnh người được mời (link vai viewer) thả tim. KHÔNG phải danh sách '
  'trong gói (selection_items của ba mẹ). RLS bật, không policy — chỉ service_role '
  'qua /api/g/tim-gia-dinh và /api/admin/galleries/[id]/tim-gia-dinh.';

-- 2. yeu_cau_mua_them: loại 'chinh_sua' ---------------------------------------
alter table yeu_cau_mua_them
  add column if not exists loai text not null default 'san_pham',
  add column if not exists anh_ids uuid[] not null default '{}',
  add column if not exists don_gia numeric(12,0),
  add column if not exists tam_tinh numeric(12,0);

alter table yeu_cau_mua_them alter column product_id drop not null;

-- so_luong cũ: 1..20 (một sản phẩm). Yêu cầu chỉnh sửa đếm SỐ TẤM — tới 500.
alter table yeu_cau_mua_them drop constraint if exists yeu_cau_mua_them_so_luong_check;
alter table yeu_cau_mua_them
  add constraint yeu_cau_mua_them_so_luong_check
  check (so_luong >= 1 and (so_luong <= 20 or (loai = 'chinh_sua' and so_luong <= 500)));

alter table yeu_cau_mua_them drop constraint if exists yeu_cau_mua_them_loai_hop_le;
alter table yeu_cau_mua_them
  add constraint yeu_cau_mua_them_loai_hop_le
  check (
    (loai = 'san_pham' and product_id is not null)
    or (
      loai = 'chinh_sua'
      and product_id is null
      and cardinality(anh_ids) between 1 and 500
      and so_luong = cardinality(anh_ids)
      and don_gia is not null and don_gia >= 0
      and tam_tinh is not null and tam_tinh = don_gia * so_luong
    )
  );

create index if not exists idx_yeu_cau_mua_them_chinh_sua_mo
  on yeu_cau_mua_them(gallery_id)
  where loai = 'chinh_sua' and trang_thai in ('moi', 'da_lien_he');

comment on column yeu_cau_mua_them.loai is
  'BB-345 — ''san_pham'' = mua thêm sản phẩm in (BB-245/254, product_id bắt buộc); '
  '''chinh_sua'' = gia đình đặt chỉnh sửa các tấm đã thả tim (product_id NULL, anh_ids).';
comment on column yeu_cau_mua_them.anh_ids is
  'BB-345 — các tấm của yêu cầu chỉnh sửa, chụp lúc gửi (tim đổi sau đó không làm đổi yêu cầu).';
comment on column yeu_cau_mua_them.don_gia is
  'BB-345 — giá mỗi ảnh thêm của bộ ảnh (galleries.extra_photo_price) lúc gửi.';
comment on column yeu_cau_mua_them.tam_tinh is
  'BB-345 — tạm tính = so_luong × don_gia. CSKH chốt giá thật khi gọi lại.';
