-- ============================================================================
-- 0100 — BB-385: giá ảnh chọn thêm RIÊNG theo gói chụp (màn quản trị "Gói chụp")
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát. Chưa áp thì
-- app chạy như trước: mọi bộ ảnh mới lấy giá chung trong Cài đặt
-- (`settings.gallery.extra_photo_price_default`, 0065 — hiện 50.000 ₫). Mã đọc
-- bảng này gặp lỗi "chưa có bảng" (42P01/PGRST205) thì coi như chưa gói nào có
-- giá riêng (`docBangGiaRieng`, src/lib/gallery/gia-goi-chup-server.ts); màn
-- Gói chụp hiện nhắc "chưa áp migration 0100" và khoá ô sửa giá riêng.
--
-- Anh (Bản yêu cầu): "một file chỉnh là 50k, chưa có quyết định thay đổi nhưng
-- cứ để dự trù phương án để sau này có thể thay đổi nếu có quyết định."
--
-- ---------------------------------------------------------------------------
-- Vì sao một bảng riêng, khoá theo MÃ GÓI, không thêm cột vào products/packages
-- ---------------------------------------------------------------------------
--   · `products` (danh mục) do đồng bộ Lark ghi đè (scripts/sync-lark-catalog.mjs):
--     cột app làm chủ đặt ở đó dễ bị một lượt đồng bộ sau xoá mất.
--   · `packages` chỉ có gói ĐÃ từng tạo bộ ảnh trong app (mã `LARK-<TÊN>`, tạo
--     khi gặp lần đầu — goi-chup-lark.ts), không có đủ danh mục.
--   · Cả hai nơi và thuật sĩ tạo bộ ảnh đều biết TÊN gói của Lark ("Baby 02"),
--     nên khoá chung là `ma_goi` = maGoiLark(tên) = 'LARK-BABY-02'.
--
-- ---------------------------------------------------------------------------
-- Không hồi tố
-- ---------------------------------------------------------------------------
-- Migration này KHÔNG `update galleries`, KHÔNG đụng `packages`, `settings`.
-- Giá được chép vào `galleries.extra_photo_price` lúc TẠO bộ; đổi giá ở đây chỉ
-- áp cho bộ tạo sau. Bộ đang chọn dở / đã chốt giữ nguyên giá khách đã thấy.
--
-- An ninh (AGENTS §5b, cùng khuôn 0095): bảng mới bật RLS, KHÔNG policy, thu hết
-- quyền của anon/authenticated; chỉ service_role (route /api/admin/goi-chup,
-- /api/admin/galleries, /api/admin/galleries/options) đọc/ghi. Không tạo hàm SQL
-- nào nên không có dòng `revoke execute`.
--
-- Chạy lại được nhiều lần: `if not exists`.
--
-- Đảo ngược (mọi bộ ảnh mới quay về giá chung; bộ đã tạo không đổi):
--   drop table if exists goi_chup_gia_anh_them;
-- ============================================================================

create table if not exists goi_chup_gia_anh_them (
  -- 'LARK-' + tên gói không dấu, viết hoa, gạch nối (maGoiLark, goi-chup-lark.ts).
  ma_goi        text primary key check (ma_goi ~ '^LARK-[A-Z0-9]+(-[A-Z0-9]+)*$'),
  -- Tên gói lúc đặt giá — chỉ để đọc lại cho dễ, KHÔNG dùng để tra.
  ten_goi       text not null,
  -- Giá một ảnh chọn thêm cho bộ ảnh MỚI của gói. Trần cùng số với ô Cài đặt.
  gia_anh_them  numeric(12,0) not null check (gia_anh_them >= 0 and gia_anh_them <= 10000000),
  cap_nhat_boi  uuid references staff_profiles(id) on delete set null,
  cap_nhat_luc  timestamptz not null default now()
);

alter table goi_chup_gia_anh_them enable row level security;
revoke all on table goi_chup_gia_anh_them from public, anon, authenticated;
grant all on table goi_chup_gia_anh_them to service_role;

comment on table goi_chup_gia_anh_them is
  'BB-385 — giá ảnh chọn thêm RIÊNG theo gói (khoá ma_goi = LARK-<TÊN>). Không có dòng = gói dùng giá chung '
  '(settings gallery.extra_photo_price_default). Chỉ áp khi TẠO bộ ảnh (chép vào galleries.extra_photo_price); '
  'đổi giá không hồi tố. RLS bật, không policy — chỉ service_role qua /api/admin/goi-chup.';
