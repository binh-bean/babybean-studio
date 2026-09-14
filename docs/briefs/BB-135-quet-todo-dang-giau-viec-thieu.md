# BB-135 — Quét những dòng TODO đang giấu chức năng thiếu

**Cửa sổ:** ARCH
**Thư mục worktree:** `../bb-arch-135`
**Nhánh:** `feat/bb-135-quet-todo`

---

## Vì sao có việc này

Lỗi chặn toàn bộ dự án tìm ra ngày 14.09.2026 nấp sau đúng hai dòng:

```ts
// TODO(BB-030): Implement customer auth using bb_gs cookie matching photo.gallery_id
// For now, if staff auth fails, block access.
```

Đọc qua thì tưởng là việc còn nợ. Thật ra nó **tắt hẳn một chức năng cốt lõi**:
khách không xem được tấm ảnh nào. Không phép thử nào đỏ vì không phép thử nào
đi qua đường đó.

Câu hỏi của việc này: **còn bao nhiêu dòng như thế nữa?**

## Phải làm gì

1. Quét toàn bộ `src/` và `db/` tìm `TODO`, `FIXME`, `HACK`, `tạm thời`,
   `for now`, `chưa làm`, `sẽ làm sau`.
2. Với **từng chỗ**, trả lời ba câu và ghi vào báo cáo:
   - Nó đang **tắt** chức năng gì, hay chỉ là ghi chú cho tương lai?
   - Có phép thử nào đi qua nhánh đó không? (chứng minh bằng cách sửa nhánh đó
     rồi chạy `npm test` — phép thử đỏ thì có canh, xanh thì không)
   - Ai gặp hậu quả trước: nhân viên, hay **khách hàng**?
3. Xếp hạng theo tiêu chí duy nhất: **khách có gặp không, và có im lặng không**.
4. Viết kết quả vào `docs/17-todo-dang-giau-viec-thieu.md`.

## Ràng buộc

- Đây là việc **SOÁT**, không phải việc sửa. Không sửa chức năng nào trong
  task này, trừ khi tìm ra thứ chặn khách hoàn toàn như `/api/img` — lúc đó
  dừng lại và báo ngay thay vì tự sửa.
- Không xoá dòng TODO nào. Chúng là bằng chứng.
- Báo cáo viết tiếng Việt, cho người không lập trình đọc được phần xếp hạng.

## Xong là khi

- [ ] `docs/17-todo-dang-giau-viec-thieu.md` liệt kê đủ, mỗi mục có ba câu trả lời
- [ ] Mỗi mục xếp "có phép thử canh" / "KHÔNG có phép thử canh" đều **chứng
      minh bằng thực nghiệm**, không phải bằng suy đoán
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` vẫn sạch
