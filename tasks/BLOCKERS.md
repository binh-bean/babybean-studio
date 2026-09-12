# Blockers

Khi một agent không thể tiếp tục, ghi một dòng vào đây **thay vì đoán rồi làm tiếp**.

| Mã task | Agent | Bị chặn bởi điều gì | Cần ai quyết | Ngày | Trạng thái |
|---|---|---|---|---|---|
| BB-097 | DEV-INT | tests/security/rbac.test.ts fail ở test photoshop_ctv (dòng 296) do `SELECT id FROM galleries LIMIT 2` lấy nhầm album của chi nhánh khác chi nhánh của ctv (Pasteur vs Gò Vấp), vi phạm policy RLS can_see_branch. Cần lọc theo branch_id của ctv. DEV-INT không được sửa file thuộc SEC-ARCH. | SEC-ARCH / PM | 12/09/2026 | OPEN |

Trạng thái: `OPEN` → `RESOLVED` (ghi kết luận vào cột "Bị chặn bởi") → xoá sau khi task `DONE`.
