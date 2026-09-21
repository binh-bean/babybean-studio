# Blockers

Khi một agent không thể tiếp tục, ghi một dòng vào đây **thay vì đoán rồi làm tiếp**.

Trạng thái: `OPEN` → `RESOLVED` (ghi kết luận vào cột "Bị chặn bởi") → xoá khỏi
bảng khi task đã `DONE`, và ghi một dòng xuống mục *Đã gỡ* ở dưới.

Một dòng `OPEN` nghĩa là **có một agent đang đứng chờ**. Bảng này phải trống
hoặc gần trống — dòng `OPEN` của một task đã xong làm chính nó mất nghĩa.

## Đang chặn

| Mã task | Agent | Bị chặn bởi điều gì | Cần ai quyết | Ngày | Trạng thái |
|---|---|---|---|---|---|
| — | — | Không có việc nào đang bị chặn (soát 21/09/2026) | — | — | — |

## Đã gỡ

| Mã task | Ngày gỡ | Gỡ bằng cách nào |
|---|---|---|
| BB-097 | 15/09/2026 | Phép thử `rbac.test.ts` neo nhầm chi nhánh: `SELECT id FROM galleries LIMIT 2` không sắp thứ tự nên lúc trúng lúc không — và khi trượt thì phép thử vẫn XANH kể cả lúc luật quyền hỏng. Nay câu truy vấn lọc theo đúng chi nhánh của CTV, có ghi chú ngay trên chỗ sửa |
| BB-132 | 15/09/2026 | Ba lớp chặn đội lốt cùng một triệu chứng "ô Lark trống": (1) cột `Link app` chưa tồn tại — chủ studio tạo; (2) ba biến `LARK_*` thiếu trên Vercel Production — đã thêm; (3) ứng dụng Lark `studio-os-reader` chỉ có `bitable:app:readonly` — đã thêm `base:record:update` và phát hành. Chạy thật trên hợp đồng HD_20260912#5096: app tự ghi link vào đúng dòng Hậu Kỳ, nhãn bằng chính địa chỉ (không mang tên khách), link mở được 200 |
| BB-177 | 18/09/2026 | Chủ dự án chọn nhánh thứ hai trong chính dòng blocker: **chỉ hiện tiền tố**, không lấy lại mã đầy đủ. `share_links` giữ nguyên `token_hash` + `token_prefix` — đổi sang lưu mã thật để hiện lại trên màn quản trị là hạ cấp bảo mật để đổi lấy một tiện nghi. Màn chi tiết hiện tiền tố, tình trạng, hạn và số lượt mở; ai lỡ mất link thì BB-188 cho **mở lại đúng link cũ** thay vì cấp mã mới |
