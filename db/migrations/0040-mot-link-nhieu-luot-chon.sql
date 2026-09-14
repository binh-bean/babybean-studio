-- Migration: một link gắn theo khách phải giữ được NHIỀU lượt chọn
-- Task: BB-130
--
-- Vì sao
-- ---------------------------------------------------------------------------
-- `0010` đổi mô hình link sang "một link một KHÁCH HÀNG", làm địa chỉ vĩnh
-- viễn. Nhưng chỉ số `uq_selections_share_link` vẫn giữ luật cũ: MỘT lượt chọn
-- cho MỘT link. Luật đó đúng khi một link chỉ mở đúng một bộ ảnh.
--
-- Chủ studio đã chốt "một khách hàng nhiều buổi chụp". Với mô hình đó, một
-- link theo khách phải mở được N buổi chụp, mà mỗi buổi chụp cần lượt chọn
-- RIÊNG — ảnh chọn của buổi thôi nôi không được lẫn vào buổi đầy tháng.
--
-- Giữ nguyên chỉ số cũ thì buổi chụp THỨ HAI ba mẹ bấm vào sẽ đâm vào lỗi
-- trùng khoá, và ba mẹ chỉ thấy "có lỗi xảy ra".
--
-- Luật mới yếu hơn luật cũ đúng một bậc: (link, bộ ảnh) là duy nhất thay vì
-- (link). Link kiểu cũ chỉ trỏ vào một bộ ảnh nên với chúng hai luật hoàn toàn
-- trùng nhau — không dòng dữ liệu nào phải đổi, và mã nguồn bản cũ vẫn chạy
-- được trên lược đồ này (yêu cầu tương thích lùi một bản phát hành).

drop index if exists uq_selections_share_link;

create unique index uq_selections_share_link_gallery
  on selections(share_link_id, gallery_id);

comment on index uq_selections_share_link_gallery is
  'Một lượt chọn cho mỗi cặp (link, bộ ảnh). Link theo khách mở nhiều buổi chụp nên không thể khoá theo link nữa — xem BB-130.';
