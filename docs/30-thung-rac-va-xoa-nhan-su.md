# 30 — Thùng rác bộ ảnh và Xoá nhân sự (BB-409)

Dành cho chủ studio. Quyết định chốt ngày 10/10/2026.

## Ai được làm

| Việc | Admin | Quản trị hệ thống | Quản lý chi nhánh | Vai khác |
|---|:--:|:--:|:--:|:--:|
| Xoá bộ ảnh, khôi phục, xoá hẳn ngay | Có | Có | Có (chỉ bộ thuộc chi nhánh mình) | Không |
| Xoá nhân sự | Có | Có | Có (chỉ người thuộc chi nhánh mình) | Không |

Có ba luật cứng:

- **Không ai xoá được tài khoản Admin**, kể cả một Admin khác.
- Người không phải Admin không xoá được Quản trị hệ thống hay Quản lý. Người mang vai tự tạo có quyền "Xoá nhân sự" cũng được tính là Quản lý.
- Không ai tự xoá được tài khoản của mình.

Hai quyền này tên là `bo_anh:xoa` và `nhan_su:xoa`. Chúng hiện ở màn Vai trò. Muốn cấp cho vai khác thì tích ở đó.

## Xoá bộ ảnh: vào thùng rác 10 ngày

1. Mở bộ ảnh, bấm **⋯ → Xoá bộ ảnh**, rồi xác nhận.
2. Bộ ảnh biến mất khỏi danh sách, Kanban, Bàn làm việc, Việc cần xử lý, báo cáo và tìm kiếm. Cron cũng không gửi nhắc cho bộ này nữa.
3. Khách mở link sẽ thấy trang **"Bộ ảnh này không còn nữa"** (giọng Bean, có nút "Nhắn Bean"). Trên link gia đình, bộ này cũng không còn hiện.
4. **Trong 10 ngày**: vào mục **Thùng rác** (menu Hệ thống) và bấm **Khôi phục**. Bộ trở lại y như cũ, link khách mở lại được.
5. **Quá 10 ngày**: cron 01:00 tự **xoá hẳn**, mỗi đêm tối đa 5 bộ. Những thứ bị xoá:
   - dữ liệu của bộ trên app: ảnh, lượt chọn, đợt chọn, đặt in, mua thêm, link khách theo bộ, thông báo, hoá đơn đã gán;
   - các tệp trên Supabase Storage: ảnh đệm, biểu tượng ảnh bìa, ảnh mẫu khách gửi.
6. Muốn xoá ngay không đợi 10 ngày thì bấm **Xoá hẳn ngay** và gõ lại mã bộ (8 ký tự). Việc này **không hoàn tác được**.

Những thứ không bao giờ bị đụng:

- **Thư mục ảnh gốc trên Google Drive.** App không gọi Drive để xoá gì cả.
- **Nhật ký hoạt động.** Các dòng cũ vẫn giữ. Dòng xoá, khôi phục, xoá hẳn chỉ ghi mã bộ, không ghi tên khách, tên bé hay số điện thoại.

### Lark không tạo lại bộ đã xoá

Dòng Hậu Kỳ bên Lark vẫn còn sau khi studio xoá bộ trên app. Vì vậy app giữ một **dấu** cho bộ đó, kể cả sau khi đã xoá hẳn. Đồng bộ Lark (hook, cron 08:00, nút Đồng bộ) bỏ qua mọi dòng trùng dấu, và khối "Bản ghi mới từ Lark" cũng không hiện lại các dòng đó. App không ghi gì lên Lark.

Dấu nhận ra bộ theo hai cách:

- theo mã dòng Lark;
- theo thư mục Drive, cho bộ tạo bằng tay. App chỉ lưu bản băm của mã thư mục, không lưu mã thật.

Muốn bộ đó vào lại app thì vào **Thùng rác → Đã xoá hẳn**, bấm **Cho Lark tạo lại**. Lần đồng bộ sau sẽ dựng lại bộ từ Lark.

## Xoá nhân sự

1. Vào màn **Nhân sự**, bấm **Xoá nhân sự** ở dòng của người đó. Nút này không hiện ở dòng Admin. Quản lý cũng không thấy nút này ở dòng của Quản lý khác.
2. Hộp xác nhận cho biết số **bộ ảnh, việc chỉnh ảnh và buổi chụp** sẽ chuyển về **"Tổ chức BabyBean"**.
3. Bấm xác nhận thì xảy ra ba việc trong cùng một lần:
   - Việc **đang phụ trách** chuyển về Tổ chức BabyBean: thợ chụp, CSKH, người chỉnh của bộ ảnh; người chỉnh của việc giao ảnh; thợ chụp của buổi chụp CHƯA tới ngày (buổi đã chụp giữ tên thợ kèm "(đã nghỉ)", anh chốt 12/10). Người đó cũng được gỡ khỏi các chi nhánh.
   - Tài khoản **bị khoá đăng nhập ngay**. Phiên đang mở bị từ chối ở lượt bấm kế tiếp.
   - Hồ sơ được **giữ lại** và đánh dấu đã nghỉ.
4. Những chỗ ghi lại ai đã làm gì thì **giữ nguyên tên người đó, kèm "(đã nghỉ)"**: người tạo khách, tạo bộ, xác nhận tiền, gán hoá đơn, nhật ký. Nhờ vậy sau này vẫn tra được ai đã làm.

"Tổ chức BabyBean" là một tài khoản chung. Nó không đăng nhập được và không hiện trong danh sách Nhân sự. App tự tạo tài khoản này ở lần xoá nhân sự đầu tiên. Ở danh sách bộ ảnh, cột người phụ trách hiện "Tổ chức BabyBean". Khi muốn giao lại việc cho người mới thì sửa bộ ảnh như bình thường.

**Xoá nhân sự khác "Cho nghỉ việc".**

- "Cho nghỉ việc" chỉ tắt tài khoản và bật lại được.
- "Xoá nhân sự" chuyển hết việc đi và **không bật lại được**.

## Cho người triển khai

- Áp migration `db/migrations/0109-thung-rac-xoa-nhan-su.sql` **trước** khi đưa mã lên.
- Đảo ngược: xem phần đầu tệp migration.
- Bộ đã xoá hẳn thì không khôi phục được.
