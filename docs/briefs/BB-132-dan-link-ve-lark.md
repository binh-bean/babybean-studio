# BB-132 — Ghi link app ngược về bảng Hậu Kỳ bên Lark

**Cửa sổ:** DEV-INT
**Thư mục worktree:** `../bb-int`
**Nhánh:** `feat/bb-132-ghi-link-ve-lark`

---

## Vì sao có việc này

Chủ studio mô tả quy trình: *"bảng hậu kỳ cần thêm một cột tích là lấy link
app → app nhập tạm thông tin → nhân viên tạo link app của khách và **gán lại
vào cột link app** trong hậu kỳ Lark"*.

`BB-127` đã làm xong phần tạo link. Phần **gán lại vào Lark** hiện là chép tay:
CSKH sao link trên màn hình rồi dán sang Lark. Mỗi lần chép tay là một lần có
thể dán nhầm dòng — và dán nhầm nghĩa là khách A nhận link xem ảnh của khách B.

## Phải làm gì

1. Hàm ghi một ô lên Lark Bitable (`PUT .../records/{record_id}`), dùng lại
   `tenant_access_token` như các script đồng bộ đang có.
2. Sau khi `POST /api/admin/galleries/[id]/share-link` tạo link xong, ghi địa
   chỉ đầy đủ vào đúng cột *link app* của **đúng dòng** Hậu Kỳ —
   `galleries.lark_record_id` đã lưu sẵn mã dòng.
3. Ghi hỏng thì **link vẫn phải trả về cho CSKH**. Lark chết mà chặn luôn việc
   tạo link là làm cả studio đứng.
4. Màn CSKH hiện rõ: *"đã ghi sang Lark"* hay *"chưa ghi được, dán tay giúp"*.

## Ràng buộc

- **Không** đưa `app_token`, `table_id`, `field_id` vào kho mã nguồn. Kho là
  kho công khai. Tìm bảng và cột **theo tên lúc chạy**, đúng cách ba script
  `sync-lark-*.mjs` đang làm.
- Đây là đường ghi **đầu tiên** đi lên Lark — mọi thứ trước nay chỉ đọc xuống.
  Vì thế: chỉ ghi **đúng một cột**, không đụng cột nào khác, và có công tắc
  `--that` để chạy thử in ra dự định trước khi ghi thật.
- **Không bao giờ** ghi cả mã link vào nhật ký, chỉ sáu ký tự đầu.

## Xong là khi

- [ ] Chạy thử (không ghi thật) in đúng dòng và đúng cột sẽ ghi
- [ ] Ghi thật một dòng trên Lark, kiểm mắt thường là đúng dòng
- [ ] Lark trả lỗi thì link vẫn về tới tay CSKH, có báo rõ
- [ ] Không có mã định danh Lark nào trong kho mã nguồn (`git grep` để chứng minh)
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` sạch
