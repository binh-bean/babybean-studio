# Blockers

Khi một agent không thể tiếp tục, ghi một dòng vào đây **thay vì đoán rồi làm tiếp**.

| Mã task | Agent | Bị chặn bởi điều gì | Cần ai quyết | Ngày | Trạng thái |
|---|---|---|---|---|---|
| BB-097 | DEV-INT | tests/security/rbac.test.ts fail ở test photoshop_ctv (dòng 296) do `SELECT id FROM galleries LIMIT 2` lấy nhầm album của chi nhánh khác chi nhánh của ctv (Pasteur vs Gò Vấp), vi phạm policy RLS can_see_branch. Cần lọc theo branch_id của ctv. DEV-INT không được sửa file thuộc SEC-ARCH. | SEC-ARCH / PM | 12/09/2026 | OPEN |
| BB-132 | DEV-INT | Bảng `️🎯Hậu Kỳ` bên Lark **chưa có cột "Link app"**. docs/16 §2 mới chỉ mô tả là cần thêm hai cột (`Lấy link app`, `Link app`), chưa ai tạo. Ba cột đang có chữ "link" là `Link điền Mã số ảnh của KH`, `Link ảnh gửi khách`, `Link HD` — KHÔNG cột nào dùng được: `Link ảnh gửi khách` là link thư mục Drive, ghi đè vào đó là mất đường vào ảnh gốc của khách. Mã và phần chạy thử đã xong, chạy thử tìm đúng bảng và đúng dòng rồi dừng. Cần người có quyền sửa cấu trúc Lark tạo cột `Link app` (kiểu ô chữ hoặc ô URL) — đặt ĐÚNG tên đó, vì mã khớp tên neo hai đầu để khỏi nhầm với ô tích `Lấy link app`. | Chủ studio / PM | 14/09/2026 | OPEN |

Trạng thái: `OPEN` → `RESOLVED` (ghi kết luận vào cột "Bị chặn bởi") → xoá sau khi task `DONE`.
