-- ============================================================================
-- Migration: 0059 — mỗi sản phẩm mua thêm chỉ một dòng trong một lượt chọn
--
-- BB-105 dựng đường `POST /api/g/addons` theo lối CHÈN THẲNG: mỗi lượt bấm là
-- một dòng mới trong `selection_addons`. Chừng nào chưa ai bấm được thì không
-- sao — và đúng là chưa ai bấm được: màn khách dựng `AddonSelector` mà KHÔNG
-- truyền `onChange`, còn danh sách sản phẩm thì lấy từ chính những dòng đã mua,
-- nên khi chưa mua gì thì không có gì để mua. Đo ngày 22/09/2026 trên bb-dev:
-- `selection_addons` có **0 dòng**.
--
-- Nối dây xong thì cái lối chèn thẳng ấy hỏng ngay: ba mẹ bấm dấu cộng ba lần
-- là ba dòng "Khung gỗ 40x60 ×1" nằm cạnh nhau, và hoá đơn tính tiền ba lần.
-- Giảm số lượng hay bỏ mua thì không có đường nào.
--
-- Ràng buộc này biến "mua thêm" thành ĐẶT SỐ LƯỢNG: một sản phẩm một dòng, sửa
-- số lượng là sửa dòng đó, bỏ mua là xoá dòng đó.
--
-- An toàn khi chạy lại: `if not exists`. Bảng đang rỗng nên không có dòng trùng
-- nào phải gộp; nếu về sau chạy trên cơ sở dữ liệu có dòng trùng thì câu lệnh
-- sẽ báo lỗi ngay thay vì âm thầm bỏ qua — đúng thứ ta muốn, vì gộp tiền của
-- khách là việc phải có người nhìn.
-- ============================================================================

create unique index if not exists uq_selection_addons_selection_product
  on selection_addons (selection_id, product_id);

comment on index uq_selection_addons_selection_product is
  'Một sản phẩm mua thêm chỉ có một dòng trong một lượt chọn. Đổi số lượng là '
  'cập nhật dòng này, bỏ mua là xoá nó — xem 0059 và /api/g/addons.';
