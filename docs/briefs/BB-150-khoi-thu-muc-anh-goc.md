# BB-150 — Màn chi tiết phải cho thấy ảnh đến từ thư mục nào

**Cửa sổ:** GIAO DIỆN
**Thư mục worktree:** `../bb-fe-150`
**Nhánh:** `feat/bb-150-khoi-thu-muc-anh-goc`

---

## Vì sao có việc này

Mở màn chi tiết một bộ ảnh hôm nay, nhân viên **không biết ảnh đến từ thư mục
Drive nào**: không thấy link, không bấm sang Drive được, không đồng bộ lại được,
và link sai thì không sửa được.

Chỗ duy nhất trong cả hệ thống nhìn thấy thư mục gốc là màn **"Bộ ảnh lỗi tải"** —
tức chỉ khi đã hỏng mới thấy. Bộ chạy bình thường thì nguồn ảnh vô hình.

Ô nhập link đang có trên màn chi tiết tên là "Link thư mục ảnh đã chỉnh" và chỉ
hiện khi trạng thái `in_retouch`. Đó là ảnh **đã chỉnh** gửi khách ở cuối quy
trình — dễ nhầm, nên đặt tên khối mới cho thật rõ để không ai dán nhầm chỗ.

## Phải làm gì

Một khối **"Thư mục ảnh gốc"** trên màn chi tiết, luôn hiện, gồm:

1. Địa chỉ thư mục hiện tại, bấm được, mở tab mới sang Drive.
2. Số ảnh đã kéo về và lần đồng bộ gần nhất — nhân viên nhìn là biết dữ liệu cũ
   hay mới.
3. Nút **Đồng bộ lại** → `POST /api/admin/galleries/<id>/sync` (đã có sẵn). Route
   trả 202 rồi chạy nền, nên màn hình phải nói rõ "đang chạy, vài phút nữa xong"
   chứ đừng đứng im như treo.
4. Nút **Đổi thư mục** → mở ô dán link → gọi đường ghi của BB-149:

```
PATCH /api/admin/galleries/<id>/drive     body: { "driveUrl": "..." }
→ 200 { driveFolderId, driveFolderUrl }   hoặc INVALID_INPUT kèm câu tiếng Việt
```

5. Đổi thư mục xong thì **hỏi luôn "đồng bộ lại ngay?"** — đổi link mà không kéo
   ảnh về thì màn hình vẫn hiện ảnh của thư mục cũ, và không ai hiểu vì sao.
6. Bộ đang ở `sync_error` thì khối này hiện **lý do lỗi** ngay tại đó, đừng bắt
   nhân viên mở sang màn khác mới biết vì sao hỏng.

## Ràng buộc

- **Phụ thuộc BB-149** (DEV-BE) cho đường `PATCH .../drive`. Hợp đồng ở trên đã
  chốt, cứ dựng giao diện theo đó; đường ghi xong trước thì càng tốt.
- Vùng được ghi: `src/components/features/**`, `src/app/(admin)/**`. Cần thêm màu
  hay chữ dịch thì nhờ DEV-UI.
- **Đừng đụng** khối "Link thư mục ảnh đã chỉnh" đang có — hai thứ khác nhau,
  và gộp chúng lại là cách chắc chắn để có ngày ai đó ghi đè nguồn ảnh gốc bằng
  link ảnh đã chỉnh.
- Báo cáo màn hình gọi API thì **dán kèm phản hồi thật của API** — `AGENTS.md`
  mục 0 điểm 6.

## Xong là khi

- [ ] Mở một bộ bất kỳ: thấy link thư mục gốc, bấm sang Drive được
- [ ] Bấm Đồng bộ lại: màn hình nói rõ đang chạy, xong thì số ảnh đổi
- [ ] Đổi thư mục bằng link mới: lưu được, và có hỏi đồng bộ lại ngay
- [ ] Dán link rác: hiện đúng câu báo lỗi từ API, không làm hỏng màn hình
- [ ] Mở một trong **77 bộ `sync_error`**: thấy lý do lỗi ngay trong khối này
- [ ] `npm run verify:own -- DEV-FE --base main`, `npm run verify:wired`,
      `npm test`, `tsc`, `lint` sạch
