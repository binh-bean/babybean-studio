# Blockers

Khi một agent không thể tiếp tục, ghi một dòng vào đây **thay vì đoán rồi làm tiếp**.

| Mã task | Agent | Bị chặn bởi điều gì | Cần ai quyết | Ngày | Trạng thái |
|---|---|---|---|---|---|
| BB-097 | DEV-INT | tests/security/rbac.test.ts fail ở test photoshop_ctv (dòng 296) do `SELECT id FROM galleries LIMIT 2` lấy nhầm album của chi nhánh khác chi nhánh của ctv (Pasteur vs Gò Vấp), vi phạm policy RLS can_see_branch. Cần lọc theo branch_id của ctv. DEV-INT không được sửa file thuộc SEC-ARCH. | SEC-ARCH / PM | 12/09/2026 | OPEN |
| BB-132 | DEV-INT | **Đã qua hai lớp, còn lớp thứ ba.** (1) Cột `Link app` bên Lark: ĐÃ TẠO 15/09/2026, kiểu ô liên kết, mã tìm đúng bảng đúng dòng. (2) Ba biến `LARK_APP_ID` / `LARK_APP_SECRET` / `LARK_BASE_APP_TOKEN` thiếu trên Vercel Production: ĐÃ THÊM 15/09/2026. (3) CÒN CHẶN: ứng dụng Lark chỉ có quyền đọc. Lark trả `Access denied. One of the following scopes is required: [bitable:app, base:record:update]`. Cần quản trị viên Lark cấp quyền `base:record:update` (hoặc `bitable:app`), phát hành phiên bản mới, VÀ thêm ứng dụng làm cộng tác viên có quyền chỉnh sửa trên chính Base Hậu Kỳ. Không liên quan tới mã hay deploy. | Quản trị viên Lark / Chủ studio | 15/09/2026 | OPEN |

Trạng thái: `OPEN` → `RESOLVED` (ghi kết luận vào cột "Bị chặn bởi") → xoá sau khi task `DONE`.
