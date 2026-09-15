# ADR-0004 — Sửa tay trên app và đồng bộ từ Lark: ai đè ai

- **Trạng thái**: Đề xuất
- **Ngày**: 2026-09-15
- **Người quyết định**: Chủ studio

## Bối cảnh

Ngày 15.09.2026, chủ studio đặt câu hỏi: *"sao trên app không đồng bộ lên và có quyền sửa để khỏi phải nhập tay lại"* và *"khi Lark thay đổi trạng thái thì app cũng thay đổi theo hay như thế nào"*.

Hiện tại, việc đồng bộ từ Lark xuống App là **một chiều**. Lệnh đồng bộ đang dùng `ON CONFLICT DO UPDATE`, nghĩa là dữ liệu từ Lark luôn đè lên App. Ngược lại, cột `status` của bộ ảnh lại bị bỏ qua khi ghi đè, và chỉ được dùng để lọc ban đầu. App tự đổi `status` theo hành vi tương tác của khách.

**Bối cảnh mới rất quan trọng**: 
- **BB-138** đã dựng xong môi trường thật (`bb-prod`).
- **BB-139** đã hiển thị tên khách thật.
- **BB-152 sắp chạy đồng bộ định kỳ**: Dữ liệu sẽ tự động kéo từ Lark về vài phút một lần. Việc "ai đè ai" không còn là lý thuyết khi chạy lệnh bằng tay, mà sẽ diễn ra liên tục hàng ngày, tự động. 

Nếu App cho phép sửa mà không có cơ chế rõ ràng, nhân viên vừa sửa xong vài phút sau hệ thống đồng bộ sẽ tự động đè mất, gây ức chế lớn và thất thoát thông tin. Do đó, cần quyết định dứt khoát "Ai là bản đúng" (Source of truth) để làm cơ sở cho đồng bộ tự động.

## Các phương án đã cân nhắc

| Phương án | Ưu | Nhược (Cái mất) |
|---|---|---|
| **1. Lark là bản đúng tuyệt đối: app chỉ đọc, không cho sửa** | Đơn giản, rẻ nhất. Với đồng bộ định kỳ vài phút/lần, hệ thống chạy trơn tru, không bao giờ mất dữ liệu do đè nhau. | Mất sự tiện lợi: nhân viên thấy sai trên App bắt buộc phải mở Lark để sửa, đúng cái phiền họ đang than. |
| **2. App cho sửa, cột nào đã sửa tay thì đồng bộ bỏ qua cột đó** | Không mất dữ liệu sửa tay của nhân viên trên App. Phản hồi tức thời. | Phân mảnh dữ liệu vĩnh viễn (Split Brain). Lark và App có hai bản khác nhau mà không ai biết bên nào mới hơn. Phá vỡ nguyên tắc quản trị tập trung của Lark. |
| **3. App cho sửa, đồng bộ đọc về không đè — báo lệch cho nhân viên tự chọn** | Không giấu diếm, minh bạch mâu thuẫn để con người tự chọn bản đúng. | Đắt nhất. Cần thêm giao diện báo lệch, lịch sử cập nhật. Nhân viên sẽ liên tục nhận cảnh báo lệch mỗi vài phút do đồng bộ định kỳ chạy liên tục. |

## Phân định "Ai là bản đúng" (Source of Truth)

Bất kể chọn phương án nào, khi có xung đột, nguyên tắc quyết định dựa trên bảng phân định dưới đây. Không có ngoại lệ:

| Cột | Bản đúng | Giải thích |
|---|---|---|
| `full_name` (Tên khách)| **Lark** | Thông tin cơ bản tạo từ hợp đồng ban đầu trên Lark. |
| `phone` (SĐT) | **Lark** | Thông tin cơ bản tạo từ hợp đồng ban đầu trên Lark. |
| `note` (Ghi chú) | **Lark** | Ghi chú vận hành, hậu kỳ của nhân viên từ Lark. |
| `shoot_date` (Ngày chụp)| **Lark** | Dữ liệu gốc từ buổi chụp trong hợp đồng. |
| `branch_id` (Chi nhánh)| **Lark** | Nơi tạo doanh thu và chịu trách nhiệm buổi chụp. |
| `drive_folder_url` | **Lark** | Nguồn lưu trữ ảnh gốc do nhân viên dán tay vào Lark. |
| `baby_name` (Tên bé)| **Lark** | Thông tin cơ bản thuộc hợp đồng. |
| `galleries.status` | **App** | Cố tình không ánh xạ, App hoàn toàn làm chủ. |

### Giải thích riêng về cột `galleries.status`

Trạng thái trên Lark phản ánh quy trình nội bộ (`Đã Chọn Hình`, `Đang làm`, `Leader check hình`, `Đã gửi In`, `Đã Giao`). Trạng thái trên App phản ánh hành vi tương tác của khách (`draft`, `ready`, `in_review`, `submitted`, `in_retouch`, `delivered`). 

**Quyết định: CỐ TÌNH không ánh xạ trạng thái.**
Khi Lark đổi trạng thái, App **KHÔNG** biết và không đổi theo. Đồng bộ đọc cột Trạng Thái bên Lark chỉ để **LỌC** lúc nhập (bỏ những bộ đã qua in), rồi vứt đi, không lưu. Cột `status` trên App do App tự đổi theo hành vi khách. Nếu ép đồng bộ từ Lark đè lên App, App sẽ mất dấu tiến trình thực tế của khách hàng.

## Quyết định

**Khuyến nghị chọn: Phương án 1 (Lark là bản đúng tuyệt đối: app chỉ đọc thông tin hành chính, KHÔNG cho sửa).**

**Vì sao:**
1. **Phù hợp với đồng bộ định kỳ (BB-152)**: Khi hệ thống tự động chạy vài phút một lần, mọi chỉnh sửa trên Lark sẽ sớm có mặt trên App. Điều này bù đắp một phần cho nhược điểm "thiếu tiện lợi" của Phương án 1.
2. **Tuân thủ nguyên tắc gốc**: `docs/16` mục 2 đã chốt nguyên tắc đồng bộ một chiều. Hai chiều thì hai bên đè nhau và không ai biết bên nào đúng.
3. **Tránh phân mảnh**: Lark tiếp tục là trung tâm dữ liệu đáng tin cậy duy nhất cho khối vận hành.

## Hệ quả

**Tích cực**:
- Hệ thống đồng bộ định kỳ sẽ hoạt động an toàn, không bao giờ vô tình xoá mất công sức sửa tay của nhân viên. Dữ liệu hội tụ tuyệt đối.

**Tiêu cực và cách sống chung**:
- Nhân viên vẫn không thể sửa trực tiếp trên App. Cách sống chung: Studio cần phổ biến rõ quy trình — mọi thông tin sai lệch phải được sửa trên Lark, và App sẽ tự động cập nhật lại sau vài phút. 

## Điều kiện xem lại

Quyết định này được xem xét lại khi studio chấp nhận ngân sách và thời gian để làm tính năng "báo lệch" (Phương án 3), hoặc khi có yêu cầu thay đổi hoàn toàn kiến trúc thành đồng bộ hai chiều (đi ngược lại quyết định ở docs/16).
