# ADR-0002 — Giữ Google Drive làm kho ảnh, chỉ cache metadata

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-09-08
- **Người quyết định**: PM + ARCH + DEV-INT

## Bối cảnh

Studio đã có toàn bộ ảnh trên Google Drive và quy trình đổ ảnh đã quen tay. Mỗi album 500–1.500 ảnh JPEG preview. Câu hỏi: app tự lưu ảnh hay đọc từ Drive?

## Các phương án

| Phương án | Chi phí | Rủi ro | Công sức |
|---|---|---|---|
| **A. Đọc từ Drive, cache metadata** | 0 | Phụ thuộc chế độ chia sẻ và URL thumbnail không chính thức | Thấp |
| B. Copy ảnh sang Supabase Storage | ~25 USD/tháng cho 500GB | Phải đồng bộ, tốn băng thông, chậm khi tạo album | Trung bình |
| C. Copy sang Cloudflare R2 + Images | ~10 USD/tháng | Thêm nhà cung cấp, phải viết pipeline resize | Cao |
| D. Nhúng thẳng iframe/link Drive | 0 | Không kiểm soát được UI, không đánh dấu chọn ảnh được | Rất thấp |

## Quyết định

**Phương án A**: Drive là kho ảnh; hệ thống chỉ lưu metadata trong bảng `photos`; hiển thị qua proxy `/api/img/[photoId]` của mình.

Ba lý do quyết định:
1. **Không thay đổi thói quen studio.** Thợ ảnh vẫn đổ ảnh lên Drive như cũ. Nếu bắt upload lại vào app, dự án sẽ chết ở khâu vận hành.
2. **Chi phí lưu trữ bằng 0.** Với studio nhỏ, 500GB ảnh/năm là khoản đáng kể.
3. **Tạo album tức thì.** Dán link là xong, không phải chờ copy hàng GB.

Kèm theo hai ràng buộc bắt buộc:
- **Không bao giờ gọi Drive API trong luồng render trang khách.** Metadata phải đã nằm trong Postgres.
- **Luôn đi qua proxy của mình**, không nhúng URL Google trực tiếp vào HTML.

## Hệ quả

**Tích cực**: chi phí thấp; tạo album nhanh; Drive sập không làm app sập (lưới vẫn hiện, chỉ ảnh không tải); đổi kho ảnh sau này chỉ phải sửa `src/lib/drive/` và proxy.

**Tiêu cực và cách sống chung**:

| Vấn đề | Giảm thiểu |
|---|---|
| Thư mục phải mở "ai có link cũng xem được" → ai có link Drive gốc đều xem được ảnh | Tuyệt đối không đưa link Drive cho khách. Phase 2: chuyển Shared Drive + service account để không cần mở công khai |
| URL `lh3.googleusercontent.com` không có tài liệu chính thức | Có nguồn dự phòng `drive.google.com/thumbnail`; đổi trong một chỗ duy nhất là proxy |
| Studio xoá thư mục Drive → album hỏng | Ảnh thành `status='missing'`, lựa chọn của khách vẫn còn; cảnh báo trên admin; ghi rõ trong tài liệu vận hành: **không xoá thư mục album chưa giao xong** |
| Drive giới hạn lượt tải khi truy cập cao | Cache Edge dài ngày; Phase 2 cân nhắc đẩy thumbnail w400 sang Supabase Storage |

## Điều kiện xem lại quyết định

Xem lại ADR này nếu xảy ra một trong các điều sau:
- Google thay đổi/chặn URL thumbnail khiến phương án dự phòng cũng hỏng.
- Studio vượt 100 album/tháng và bắt đầu chạm giới hạn tải của Drive.
- Có yêu cầu pháp lý buộc ảnh phải nằm trong hệ thống có kiểm soát truy cập đầy đủ.
