-- ============================================================================
-- Migration: 0018 — giá ảnh vượt hạn mức, mặc định là giá thật chứ không phải 0
--
-- PM làm. Cùng loại với 0016 và 0017: một giá trị mặc định bịa đặt đang lặng
-- lẽ cho không tiền của studio.
--
-- ---------------------------------------------------------------------------
-- Vấn đề
-- ---------------------------------------------------------------------------
--   galleries.extra_photo_price  numeric(12,0) not null default 0
--   packages.extra_photo_price   numeric(12,0) not null default 0
--
-- Album nào tạo ra mà không ai điền giá thì ảnh vượt hạn mức được tính
-- 0 đồng. Không lỗi, không cảnh báo — khách chọn thừa 10 ảnh, màn hình hiện
-- "phụ trội 0đ", CSKH tin màn hình.
--
-- Nặng hơn con số 20 ở 0017: 20 ít nhất còn CHẶN ở đâu đó, 0 thì không chặn gì
-- và còn khẳng định với khách rằng không mất tiền.
--
-- ---------------------------------------------------------------------------
-- Giá thật
-- ---------------------------------------------------------------------------
-- Sản phẩm Edit file, đo trên toàn bộ bảng Hóa Đơn Chi Tiết:
--
--   405 dòng hóa đơn bán thêm ảnh, 4.027 ảnh
--   đơn giá niêm yết 50.000đ/ảnh — độ tin cậy 1,000, không một mức nào khác
--   tổng đã thu 197.075.000đ
--
-- Đây là con số chắc nhất trong toàn bộ dữ liệu: 405 lần bán, một mức giá duy
-- nhất. Không cần đoán.
--
-- ---------------------------------------------------------------------------
-- Vì sao đổi mặc định chứ không tra bảng lúc chạy
-- ---------------------------------------------------------------------------
-- Giá phải được CHỐT vào album lúc tạo, không tra lại products.list_price mỗi
-- lần tính tiền. Studio tăng giá tháng sau thì album cũ vẫn giữ giá cũ — cùng
-- lý do với gallery_items.unit_price ở 0014. Nếu tra lúc chạy thì một lần đổi
-- bảng giá sẽ đổi ngược số tiền của những album khách đang chọn dở.
--
-- Khi studio đổi giá ảnh vượt, việc phải làm là chạy lại sync:catalog rồi sửa
-- mặc định ở đây bằng một migration mới. Không sửa tay từng album cũ.
-- ============================================================================

begin;

alter table galleries alter column extra_photo_price set default 50000;
alter table packages  alter column extra_photo_price set default 50000;

comment on column galleries.extra_photo_price is
  'Đơn giá mỗi ảnh vượt hạn mức, CHỐT lúc tạo album. Mặc định 50.000đ là giá '
  'thật đo từ 405 lần bán Edit file, độ tin cậy 1,000. Đổi giá thì thêm '
  'migration mới, không sửa tay album cũ.';

comment on column packages.extra_photo_price is
  'Đơn giá mỗi ảnh vượt hạn mức của gói. Xem chú thích ở galleries cùng tên.';

-- KHÔNG sửa các dòng đang có. Album đã tạo giữ nguyên giá đã chốt với khách,
-- kể cả khi giá đó là 0. Sửa ngược giá của một hợp đồng đang chạy là tranh
-- chấp với khách, không phải sửa lỗi. Dòng nào sai thì CSKH sửa từng cái, có
-- chủ ý, và biết mình đang đổi số tiền của ai.

commit;
