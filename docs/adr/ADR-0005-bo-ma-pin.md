# ADR-0005 — Bỏ tính năng mã PIN bảo vệ album

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-09-16
- **Người quyết định**: Chủ studio

## Bối cảnh

Tính năng mã PIN (yêu cầu khách nhập PIN 4 số khi mở link xem ảnh) đã bị tắt mặc định từ ngày 12/09/2026. Tính đến ngày 16/09/2026, thống kê cho thấy 0/14 link đang sử dụng chức năng này.

Việc duy trì một tính năng không ai dùng mang lại nhiều gánh nặng bảo trì: duy trì một màn hình nhập PIN, một đường dẫn API riêng, bốn cột trong cơ sở dữ liệu (`requires_pin`, `pin_hash`, `failed_attempts`, `locked_until`) và logic khởi tạo phức tạp. Hơn nữa, tính năng sinh tự động '1234' khi độ dài số điện thoại không đủ (BB-168) là một thiết kế khiếm khuyết từng bị bác bỏ trước đây.

## Các phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| 1. Giữ nguyên mã PIN nhưng tắt mặc định | Dễ dàng, không cần sửa đổi lớn ở hiện tại. | Tốn nguồn lực bảo trì. Giữ lại logic lỗi sinh mã '1234'. |
| 2. Gỡ bỏ hoàn toàn mã PIN khỏi hệ thống | Giảm độ phức tạp codebase, DB và giao diện. Dọn dẹp dứt điểm các tác vụ (như BB-168). | Mất lớp bảo mật chống chuyển tiếp link không mong muốn. |

## Quyết định

Gỡ bỏ hoàn toàn tính năng mã PIN khỏi dự án.

**Vì sao**:
- Tỷ lệ sử dụng thực tế là 0%.
- Giúp dọn dẹp hệ thống, giảm thiểu gánh nặng bảo trì vô ích (code UI, API, database schema, logic).
- Giải quyết triệt để lỗi sinh mã '1234' từ số điện thoại ngắn (BB-168).

*(Lưu ý thêm: `gallery.watermark_default` hiện cũng là một thiết lập tĩnh, tuy nhiên ở task này chưa cần dọn dẹp).*

## Hệ quả

**Tích cực**:
- Lược bỏ được 4 cột ở bảng `share_links` và rút gọn được chữ ký cũng như logic của hàm `create_gallery_bundle`.
- Tối ưu UI/UX, khách hàng vào thẳng album.

**Tiêu cực và cách sống chung**:
- Lớp phòng vệ cuối cùng bảo vệ album chỉ còn phụ thuộc vào tính bí mật của token 22 ký tự.
- Nếu token bị tiết lộ (do chuyển tiếp link qua Zalo hoặc mạng xã hội), người lạ có thể xem được ảnh (do không còn lớp mã PIN chặn lại).
- **Đường xử lý**: Sử dụng tính năng **thu hồi và cấp lại link mới** (đã hoàn thành trong BB-148). Toàn bộ lượt chọn ảnh của khách sẽ được giữ nguyên và gắn theo link mới.

## Điều kiện xem lại

Quyết định này được xem xét lại nếu có số lượng lớn phản hồi từ khách hàng bị lộ link ra ngoài và có nhu cầu thiết lập mật khẩu truy cập album riêng.
