# BB-148 — Cấp lại link là khách hết mở được bộ ảnh

**Cửa sổ:** BẢO MẬT
**Thư mục worktree:** `../bb-sec-148`
**Nhánh:** `feat/bb-148-cap-lai-link`

---

## Vì sao có việc này

Ngày 15.09.2026, chủ studio bấm `Tạo link mới (thu hồi link cũ)` trên hợp đồng
thật rồi mở link: **"Link đã hết hạn"**. Link không hề hết hạn — `expires_at`
trống, `status = 'active'`, bộ ảnh `ready` với 261 ảnh.

Sự thật nằm dưới: `POST /api/auth/gallery` trả **500**, và giao diện quy mọi lỗi
về câu "hết hạn hoặc đã thu hồi".

Nguyên nhân, đã tái hiện trên máy và bắt được lỗi gốc:

```
duplicate key value violates unique constraint "uq_selections_primary"
Key (gallery_id)=(ae91dfc1-…) already exists.
```

`db/schema.sql` khai:

```sql
create unique index uq_selections_primary on selections(gallery_id) where is_primary;
```

Một bộ ảnh chỉ được có **một** lượt chọn mang cờ `is_primary`. Nhưng
`src/app/api/auth/gallery/route.ts` tạo lượt chọn mới cho **mỗi link**, với
`is_primary: link.role === "owner"`. Link đầu tiên chiếm cờ đó. Link thứ hai mở
lên là đụng chỉ số duy nhất, ném lỗi, 500.

Hậu quả: **mọi bộ ảnh đã cấp lại link đều không mở được nữa.** Mà nút cấp lại
link sinh ra đúng cho lúc nghi link cũ lọt ra ngoài — tức là lúc cần nhất thì
khách mất luôn đường vào.

Hôm nay mới 2 bộ từng cấp hơn một link nên chưa ai gặp. Gửi link cho khách thật
rồi mới gặp thì mất lòng tin, không phải mất một lần bấm.

## Chủ studio đã chốt — 15.09.2026

> *"khi tạo link mới thì chỉ link mới mở được, link cũ sẽ bị dọn sạch ở mọi nơi"*

Và khi được hỏi về những ảnh ba mẹ ĐÃ CHỌN bằng link cũ, chủ studio chốt:
**chuyển sang link mới**. Ba mẹ mở link mới phải thấy nguyên những gì đã thả tim,
không phải làm lại — vì studio cấp lại link vì lý do của studio, không phải lỗi
của khách.

Nên hướng sửa đã được quyết, không cần đề xuất lại:

1. Link cũ **chết hẳn** và không còn giữ thứ gì chặn link mới: hết cờ
   `is_primary`, không còn khoá nào, mở lên phải bị từ chối dứt khoát.
2. Lượt chọn của link cũ được **chuyển sang link mới** cùng toàn bộ
   `selection_items` — ảnh đã chọn, ghi chú, nhãn thẻ.
3. Chỉ số `uq_selections_share_link_gallery` khoá theo cặp (link, bộ ảnh), nên
   "chuyển" ở đây là đổi `share_link_id` của lượt chọn cũ sang link mới, hay tạo
   lượt mới rồi dời `selection_items` — chọn cách nào cũng được, miễn không mất
   dòng nào và không để hai lượt cùng mang cờ.

## Phải làm gì

1. Quyết **cờ `is_primary` thuộc về ai khi link được cấp lại**, và viết lý do
   vào mã. Ba hướng, chọn một và nói rõ vì sao:
   - Link mới nhận cờ, link cũ bị gỡ cờ.
   - Lượt chọn cũ được **dùng lại** cho link mới (nhưng chỉ số
     `uq_selections_share_link_gallery` đang khoá theo cặp link + bộ ảnh).
   - Cờ gắn theo bộ ảnh chứ không theo link, tức đổi mô hình.
2. **Giữ bằng được lựa chọn khách đã chọn.** Đây là ràng buộc cứng: ba mẹ chọn
   20 ảnh rồi studio cấp lại link vì lý do kỹ thuật, mà mất sạch lựa chọn thì
   không bao giờ được phép xảy ra. Nếu hướng đã chọn làm mất, đổi hướng.
3. Sửa luôn chỗ giấu lỗi: `failUnexpected` ghi ra `"err":"[object Object]"`.
   Chính dòng đó làm mất hai giờ hôm nay. Ghi `message` và `code` thật.
4. Dọn dữ liệu đang kẹt: những lượt chọn mang cờ mà thuộc link **đã thu hồi**
   và **chưa chọn ảnh nào**. Viết thành migration, đừng sửa tay trên bảng.

## Ràng buộc

- Vùng được ghi: `src/app/api/auth/**`, `db/migrations/**`, `db/policies.sql`,
  `src/lib/auth/**` — đúng vùng SEC-ARCH.
- Đổi `db/schema.sql` thì phải kèm migration và ADR: đó là hợp đồng chung.
- Không nới điều kiện nào trong `tests/security/gallery-auth.test.ts`. 14 ca ở
  đó đang canh đúng đường này.

## Xong là khi

- [ ] Phép thử: tạo link → mở được → **thu hồi, cấp link mới → vẫn mở được**
- [ ] Phép thử: khách đã chọn ảnh, cấp lại link → **lựa chọn còn nguyên**
- [ ] **Kiểm chứng ngược**: hoàn nguyên bản sửa thì hai phép thử trên phải ĐỎ
- [ ] Lỗi bất ngờ ghi ra `message` và `code` thật, không phải `[object Object]`
- [ ] `npm run verify:own -- SEC-ARCH --base main`, `npm run verify:db`,
      `npm test`, `tsc`, `lint` sạch
