# Bỏ mô hình mẫu gói (package template), lấy trực tiếp từ Lark

## Quyết định
Chúng ta quyết định bỏ thiết kế "mẫu gói" (package_items, gallery_packages) và lưu trữ danh mục sản phẩm và dòng hàng hợp đồng đúng theo cấu trúc Lark đang có (products và gallery_items).

## Bối cảnh
Trước đây (trong brief BB-100 cũ), ta định thiết kế một mô hình trong đó 1 buổi chụp tương ứng với 1 gói (package) và trong gói quy định sẵn số lượng ảnh cần chỉnh, cùng các sản phẩm đi kèm. Tuy nhiên, sau khi phân tích dữ liệu thật từ Lark (ghi trong `docs/15-doi-chieu-lark.md` mục 6):

Lark cấu trúc dữ liệu thành ba tầng, không phải hai:
1. Hóa Đơn (một hợp đồng)
2. Hóa Đơn Chi Tiết (dòng hợp đồng: sản phẩm, số lượng, đơn giá)
3. Chi Tiết Gói Chụp (thành phần của dòng đó, không có tiền)

Hạn mức ảnh thực tế cũng không phải là một con số gắn cứng theo gói, mà là một sản phẩm cụ thể (Edit file). 
Theo thống kê từ 4.403 hợp đồng, 4.212 hợp đồng có dòng "Edit file". Đáng chú ý là có nhiều hạn mức lẻ (16, 17, 21, 31 ảnh), chứng tỏ số lượng này là số lượng gói gốc cộng thêm số lượng mua ngay lúc ký hợp đồng. 

## Hệ quả
1. Cấu trúc mới hỗ trợ đúng thực tế bán hàng: "Edit file" là một sản phẩm, hạn mức ảnh của khách là tổng số lượng của sản phẩm này.
2. `gallery_items` gộp 2 tầng dưới của Lark (Hóa Đơn Chi Tiết và Chi Tiết Gói Chụp) vào chung một bảng và sử dụng `parent_item_id` để phân biệt.
3. Không tra cứu lại đơn giá khi khách mua thêm (`selection_addons`), mà chốt đơn giá `unit_price` ngay thời điểm mua dựa vào `products.list_price`, phòng trường hợp studio đổi giá sau này.
4. Ảnh in được chọn bằng bảng nối `selection_placements` (n-n), không lưu cột cứng để cho phép một ảnh có thể in ra nhiều sản phẩm. Việc in ảnh không làm hao hụt hạn mức chọn ảnh để chỉnh sửa.
