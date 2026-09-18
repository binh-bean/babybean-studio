# Blockers

Khi một agent không thể tiếp tục, ghi một dòng vào đây **thay vì đoán rồi làm tiếp**.

| Mã task | Agent | Bị chặn bởi điều gì | Cần ai quyết | Ngày | Trạng thái |
|---|---|---|---|---|---|
| BB-097 | DEV-INT | tests/security/rbac.test.ts fail ở test photoshop_ctv (dòng 296) do `SELECT id FROM galleries LIMIT 2` lấy nhầm album của chi nhánh khác chi nhánh của ctv (Pasteur vs Gò Vấp), vi phạm policy RLS can_see_branch. Cần lọc theo branch_id của ctv. DEV-INT không được sửa file thuộc SEC-ARCH. | SEC-ARCH / PM | 12/09/2026 | OPEN |
| BB-132 | DEV-INT | **XONG 15/09/2026.** Ba lớp chặn, đều đội lốt cùng một triệu chứng "ô Lark trống": (1) cột `Link app` chưa tồn tại — chủ studio tạo; (2) ba biến `LARK_*` thiếu trên Vercel Production — đã thêm; (3) ứng dụng Lark `studio-os-reader` chỉ có `bitable:app:readonly` — đã thêm `base:record:update` và phát hành. Đã chạy thật trên hợp đồng HD_20260912#5096: app tự ghi `https://hauky.babybeanstudio.vn/g/BbaL1R…` vào đúng dòng Hậu Kỳ, nhãn bằng chính địa chỉ (không mang tên khách), link mở được 200. | — | 15/09/2026 | RESOLVED |

Trạng thái: `OPEN` → `RESOLVED` (ghi kết luận vào cột "Bị chặn bởi") → xoá sau khi task `DONE`.
| BB-182 | DEV-INT | \erify:db\ fail ở bước Khoá công khai không gọi được hàm SECURITY DEFINER đối với public.check_staff_deletable. DEV-INT không có quyền sửa db/migrations để thêm câu lệnh revoke execute. | SEC-ARCH / ARCH | 17/09/2026 | OPEN |
