# BB-144 — Ghi chú chỉnh sửa cho từng ảnh đang bị nuốt lặng lẽ

**Cửa sổ:** HẬU CẦN DỮ LIỆU (DEV-BE)
**Thư mục worktree:** `../bb-be-144`
**Nhánh:** `feat/bb-144-luu-ghi-chu-tung-anh`

---

## Vì sao có việc này

Chủ studio hỏi ngày 15.09.2026: *"chưa có ghi chú chỉnh sửa cho từng ảnh"*.

Soát lại thì mọi mảnh đều đã có sẵn, trừ đúng một mắt xích:

| Mảnh | Tình trạng |
|---|---|
| `selection_items.retouch_note`, `note_tags` | **đã có** trong `db/schema.sql` |
| `GET /api/g/photos` trả về `retouchNote`, `noteTags` | **đã có** |
| `SelectionPatchSchema` nhận `retouchNote`, `noteTags` | **đã có** |
| Sáu nhãn thẻ tiếng Việt (`Xoá mụn sữa`, `Làm sáng da`…) | **đã dịch sẵn** |
| `src/lib/selection/mutate.ts` **ghi** hai cột đó xuống | **KHÔNG CÓ** |

Nghĩa là hôm nay màn khách gửi ghi chú lên thì đường ghi **nhận, trả về 200, rồi
bỏ đi** — không lỗi, không cảnh báo. Đúng loại im lặng đã nuôi 138 dòng rác trong
bb-dev suốt nhiều tuần.

## Phải làm gì

1. `patchSelection` trong `src/lib/selection/mutate.ts` ghi `retouch_note` và
   `note_tags` xuống `selection_items`.
2. Quy tắc rõ ràng, ghi vào mã: gửi `null` là **xoá ghi chú**, không gửi trường
   đó là **giữ nguyên**. Hai chuyện khác nhau, đừng gộp.
3. Ghi chú đi kèm ảnh **chưa được chọn** thì xử lý sao — quyết và ghi rõ lý do.
4. Bộ ảnh đã chốt thì không sửa được ghi chú nữa, giống như không đổi được lựa chọn.

## Ràng buộc

- Vùng được ghi: `src/lib/selection/**`, `src/app/api/**`. Phần giao diện nhập
  ghi chú **không thuộc task này** — đó là BB-145 của DEV-FE, làm sau khi đường
  ghi đã chạy.
- Không nới giới hạn đã khai trong `schema.ts`: ghi chú tối đa 500 ký tự, tối đa
  10 thẻ, mỗi thẻ 40 ký tự.
- Ghi chú là **chữ của ba mẹ gõ tay**. Không bao giờ ghép thẳng vào câu truy vấn,
  và không in ra log.

## Xong là khi

- [ ] Phép thử: gửi ghi chú + thẻ → đọc lại bằng `GET /api/g/photos` thấy đúng
- [ ] Phép thử: gửi `null` → ghi chú bị xoá; không gửi trường → giữ nguyên
- [ ] **Kiểm chứng ngược**: bỏ phần ghi vừa thêm thì phép thử phải ĐỎ. Ghi kết
      quả vào báo cáo — hôm nay đường ghi im lặng nuốt mất mà 270 phép thử không
      ai đỏ, nên phép thử mới phải chứng minh được nó canh thật
- [ ] Bộ đã chốt: sửa ghi chú bị từ chối
- [ ] `npm run verify:own -- DEV-BE --base main`, `npm test`, `tsc`, `lint` sạch
