# BB-140 — Sửa tay trên app và đồng bộ từ Lark: ai đè ai

**Cửa sổ:** KIẾN TRÚC
**Thư mục worktree:** `../bb-arch-140`
**Nhánh:** `feat/bb-140-adr-sua-tay`

---

## Vì sao có việc này

Chủ studio hỏi ngày 15.09.2026: *"sao trên app không đồng bộ lên và có quyền sửa
để khỏi phải nhập tay lại"*.

Phần đồng bộ là BB-139. Phần **sửa** thì chưa ai quyết, và làm trước khi quyết là
làm hỏng: `scripts/sync-lark-hauky.mjs` đang ghi bằng `on conflict ... do update`,
tức **mỗi lần đồng bộ là đè lại**. Mở ô nhập cho nhân viên sửa mà không có quy
tắc thì họ sửa xong, lần đồng bộ sau mất sạch, và không ai thấy lúc nó mất.

`docs/16` mục 2 đã chốt một nguyên tắc cho chiều ngược lại: *"Một chiều thì hỏng
cũng chỉ hỏng một phía; hai chiều thì hai bên ghi đè nhau và không ai biết bên
nào đúng."* Việc này là áp chính nguyên tắc đó cho chiều Lark → app.

## Phải làm gì

Viết `docs/adr/ADR-0004-sua-tay-hay-lark-de.md` theo mẫu `ADR-TEMPLATE.md`, trả
lời đúng một câu hỏi: **với mỗi cột lấy từ Lark, ai là bản đúng?**

Đề xuất ít nhất ba phương án, mỗi phương án nói rõ cái mất:

- Lark là bản đúng tuyệt đối: app chỉ đọc, không cho sửa. Rẻ nhất, nhưng nhân
  viên thấy sai thì phải mở Lark sửa, đúng cái phiền họ đang than.
- App cho sửa, và cột nào đã sửa tay thì đồng bộ **bỏ qua** cột đó. Hết mất dữ
  liệu, nhưng sinh ra hai bản khác nhau mà không ai biết bên nào mới.
- App cho sửa, đồng bộ vẫn đọc về nhưng **không đè** — chỉ **báo lệch** cho nhân
  viên xem và tự chọn. Đắt nhất, nhưng không giấu chuyện gì.

Kèm bảng từng cột: `full_name`, `phone`, `note`, `shoot_date`, `branch_id`,
`drive_folder_url`, tên bé, và **`galleries.status`**. Không cột nào được bỏ
trống ô "ai là bản đúng".

**`status` là cột khó nhất, đừng để cuối.** Chủ studio hỏi thẳng ngày
15.09.2026: *"trạng thái sẽ được cập nhật từ Lark sang phải không, tức là khi
Lark thay đổi trạng thái thì app cũng thay đổi theo hay như thế nào"*.

Hôm nay câu trả lời là KHÔNG, và không ai từng chốt điều đó — nó chỉ xảy ra:

- `scripts/sync-lark-hauky.mjs` đọc cột `Trạng Thái` bên Lark **chỉ để LỌC**
  lúc nhập (bỏ những bộ đã qua in), rồi vứt đi, không lưu.
- Lệnh `insert` đặt cứng `status = 'draft'`, và `on conflict do update` **không
  đụng tới `status`** — nên đồng bộ lại bao nhiêu lần cũng không đổi.
- Từ đó trở đi `status` do app tự đổi theo hành vi khách: `ready` khi gửi link,
  `in_review` khi khách mở, `submitted` khi khách chốt.

Hai hệ thống cùng có khái niệm "trạng thái" mà ánh xạ không trùng nhau: Lark
có `Đã Chọn Hình`, `Đang làm`, `Leader check hình`, `Đã gửi In`, `Đã Giao`;
app có 10 giá trị trong `gallery_status`. ADR phải nói rõ hai bộ này ánh xạ ra
sao, hay cố tình không ánh xạ.

## Ràng buộc

- Đây là việc **quyết định**, không phải việc code. Không sửa `scripts/` hay
  `src/` trong task này.
- Phương án phải đọc được bởi người không lập trình: chủ studio là người duyệt.
- Đừng đề xuất đồng bộ hai chiều tự động. `docs/16` mục 2 đã loại, và lý do ở đó
  vẫn đúng.

## Xong là khi

- [ ] `docs/adr/ADR-0004-...` có đủ ba phương án, mỗi phương án nói rõ cái mất
- [ ] Bảng từng cột, không ô nào trống
- [ ] Một khuyến nghị duy nhất, nói rõ vì sao
- [ ] `npm run verify:own -- ARCH --base main`, `npm test`, `tsc`, `lint` sạch
