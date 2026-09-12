-- ============================================================================
-- Migration: 0017 — hạn mức mặc định theo từng gói, lấy từ lịch sử thật
--
-- PM làm. Đây là việc đọc dữ liệu và phán đoán, không phải việc viết code.
--
-- ---------------------------------------------------------------------------
-- Con số 20 sai với gần như mọi gói
-- ---------------------------------------------------------------------------
-- galleries.included_quota và packages.included_quota đều là `default 20`.
-- Con số đó không đến từ hợp đồng nào. Đếm trên toàn bộ bảng Chi Tiết Gói
-- Chụp, nhóm theo tên gói, lấy mức Số Lượng của dòng Edit file hay gặp nhất:
--
--   Baby 01   5   (286 hợp đồng, 82%)     Fam 01   5   (87,  87%)
--   Baby 02  15   (1.326,        87%)     Fam 02  15   (1.059, 81%)
--   Baby 03  20   (112,          82%)     Fam 03  20   (828,   78%)
--   Baby 04  30   (223,          83%)     Fam 04  30   (141,   77%)
--   Baby 05  35   (21,           81%)     Fam 05  35   (20,    80%)
--   Newborn 01  5 (11)   Newborn 02 20 (19)   Bầu 01 10 (9)   Bầu 02 15 (10)
--   Portrait     5 (6, 100%)
--
-- Một cái thang rõ ràng: 5 · 15 · 20 · 30 · 35. Không có bậc nào là 20 cho
-- gói phổ thông nhất.
--
-- Baby 02 là gói bán chạy nhất, 1.326 hợp đồng, hạn mức thật 15. Mặc định 20
-- cho không 5 ảnh mỗi hợp đồng. Ở mức giá 50.000đ/ảnh, chỉ riêng gói đó đã là
-- 331 triệu nếu chạy hết lượng lịch sử. Đây chính là dạng thất thoát mà app
-- này sinh ra để chặn — nên để nguyên con số 20 thì app tự tạo lại đúng cái
-- lỗi nó đi sửa.
--
-- Phần 13-23% còn lại của mỗi gói không phải nhiễu: đó là khách mua thêm ảnh
-- ngay lúc ký, tạo ra các số 16, 21, 31. Vì thế đây là GIÁ TRỊ GỢI Ý điền sẵn,
-- không phải luật. Hạn mức thật của một album vẫn là app.gallery_quota(), suy
-- từ dòng hàng của chính hợp đồng đó.
--
-- Xem docs/15 mục 6.1-6.3.
-- ============================================================================

begin;

alter table products add column default_quota integer
  check (default_quota is null or default_quota > 0);

comment on column products.default_quota is
  'Số ảnh chỉnh sửa hay đi kèm gói này nhất, suy từ lịch sử bán. Chỉ điền khi '
  'đủ chắc (>=70% và >=5 hợp đồng). Dùng để GỢI Ý điền sẵn khi CSKH tạo album, '
  'không phải hạn mức chính thức — hạn mức thật là app.gallery_quota().';

-- Chỉ gói chụp mới có hạn mức đi kèm. Ảnh phóng hay album thì không.
create index idx_products_default_quota on products(kind)
  where default_quota is not null;

commit;
