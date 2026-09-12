-- ============================================================================
-- Migration: 0039 — xoá hạn mức bịa còn sót từ trước 0030
--
-- BB-125.
--
-- ---------------------------------------------------------------------------
-- Chuyện gì đã xảy ra
-- ---------------------------------------------------------------------------
-- Cột `galleries.included_quota` từng có `default 20`. Toàn bộ 432 bộ ảnh nhập
-- từ Lark được chèn TRƯỚC khi `0030` bỏ mặc định đó, và script nhập không hề
-- ghi cột này — nên cả 434 dòng mang số 20 mà không ai chọn.
--
-- `0016` dựng cổng QUOTA_UNKNOWN với đúng một mục đích: hạn mức chưa biết thì
-- CHẶN, không đoán. `0030` bỏ mặc định để "chưa biết" biểu diễn được. Nhưng dữ
-- liệu chèn trước đó vẫn mang số đoán, và cổng không bao giờ nổ.
--
-- ---------------------------------------------------------------------------
-- Vì sao chỉ sửa BA dòng, không phải 434
-- ---------------------------------------------------------------------------
-- `app.gallery_quota()` chỉ đọc cột này khi bộ ảnh KHÔNG có dòng hợp đồng nào;
-- có dòng thì nó cộng các dòng `Edit file` và bỏ qua cột. Nên 430 bộ có hợp
-- đồng vẫn ra số đúng dù cột sai — số 20 nằm đó vô hại nhưng gây hiểu nhầm khi
-- đọc thẳng cơ sở dữ liệu.
--
-- Thật sự nguy hiểm là các bộ KHÔNG có dòng hợp đồng nào: lúc đó số 20 được
-- dùng thật. Đo trên bb-dev ngày 12.09.2026 có sáu bộ như vậy:
--
--   ba bộ dữ liệu mẫu (Bé Bơ, Bé Sóc, Bé Bin) — số 20/15/35 do người đặt, GIỮ
--   ba bộ từ Lark (HD_20250729#734, HD_20260327#3317, HD_20260912#5096) — bịa
--
-- Ba bộ Lark đó chuyển về NULL: cổng QUOTA_UNKNOWN nổ, khách không chọn được,
-- CSKH phải điền số thật. Chặn một bộ ảnh còn hơn mời khách chọn 20 ảnh trong
-- khi họ trả tiền cho một số khác — lúc đó studio hoặc chịu lỗ phần chênh,
-- hoặc phải gọi điện nói với khách là mình ghi nhầm.
--
-- Phân biệt bằng `lark_contract_codes`: có mã hợp đồng nghĩa là nhập từ Lark.
-- ============================================================================

begin;

update galleries g
   set included_quota = null,
       updated_at = now()
 where g.included_quota is not null
   and g.lark_contract_codes is not null
   and array_length(g.lark_contract_codes, 1) > 0
   and not exists (select 1 from gallery_items gi where gi.gallery_id = g.id);

commit;
