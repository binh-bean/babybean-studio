# BB-169 chặng 2 — Bỏ mã PIN khỏi cơ sở dữ liệu

**Cửa sổ: ARCH.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-arch` — nhánh `agent/arch`.

**Không phải SEC-ARCH.** Hai vai này đã bị nhầm nhiều lần. Việc này là migration
và ADR, thuộc ARCH. SEC-ARCH sẽ soát lại sau, không viết.

---

## ĐỌC TRƯỚC: chặng này CHUẨN BỊ, KHÔNG ÁP

Chủ studio chốt ngày 16/09/2026 bỏ hẳn mã PIN. Việc chia hai chặng:

| Chặng | Ai | Làm gì | Trạng thái |
|---|---|---|---|
| 1 | DEV-FE + DEV-BE | Gỡ mọi đường mã chạm tới PIN | **chưa bắt đầu** |
| 2 | **ARCH — là bạn** | Bỏ cột và nhánh PIN trong hàm | chuẩn bị |

**Bạn viết migration và ADR. Bạn KHÔNG chạy nó lên bất kỳ cơ sở dữ liệu nào.**

Bỏ cột trong khi mã cũ còn đọc nó là app 500 ngay, và đây không phải suy đoán —
`db/migrations/README.md` đã ghi thành luật: *"Renames and drops take two
releases"* và *"staging → verify → production → **then** deploy the code that
depends on it."* Chặng 1 là bản phát hành thứ nhất. Migration của bạn là bản thứ
hai.

Nên tiêu chí xong của chặng này là **tệp migration tồn tại, đọc được, có ADR
kèm** — không phải "đã chạy xong".

## Vì sao bỏ

Đo ngày 16/09/2026: **0/14 link đang bật PIN**. PIN đã tắt mặc định từ 12/09.
Một lớp phòng vệ không ai bật thì không phải lớp phòng vệ — nó là mặt tiền để
nhìn cho yên tâm, mà vẫn bắt dự án nuôi một màn hình, một đường API, bốn cột
trong cơ sở dữ liệu và một nhánh trong hàm dựng bộ ảnh.

Bỏ nó cũng xoá luôn **BB-168**: `db/migrations/0002` dòng 107–112, khi bật PIN
mà không gõ mã thì hàm tự lấy `right(phone, 4)`, điện thoại quá ngắn thì rơi về
đúng chuỗi `'1234'`. Đó là chính cái cách BB-098 đã bác bỏ, có lý do viết hẳn
trong mã. Không cần vá riêng nữa — nó biến mất theo tính năng.

**Cái mất, ghi ra để ADR không viết một phía:** sau khi bỏ, thứ duy nhất che ảnh
của một nhà là token 22 ký tự trong link. Token không đoán được (~131 bit),
nhưng link **chuyển tiếp được** — và đúng chuyện chuyển tiếp trong nhóm gia đình
trên Zalo là lý do `docs/13 §3` từng chọn bật PIN. Đường xử lý khi link rò từ
nay là **thu hồi rồi cấp lại**, BB-148 đã làm xong và lượt chọn của khách đi
theo link mới. ADR phải ghi cả mặt này, không chỉ mặt được.

## Phải bỏ đúng những gì — đã soát, dùng luôn

**Bốn cột, không phải hai.** Đo trên bb-dev:

```
share_links.requires_pin      boolean   default false
share_links.pin_hash          text
share_links.failed_attempts   integer   default 0
share_links.locked_until      timestamptz
```

`0010-portal-token-theo-khach.sql:20` có ghi *"KHÔNG xoá cột pin_hash,
failed_attempts, locked_until ở phase này"* — chặng này chính là cái phase đó.

**Một khung nhìn.** `db/policies.sql:236`, `v_share_links` đang trả `requires_pin`
trong danh sách cột an toàn. Dựng lại khung nhìn không có cột đó.

**Một hàm.** `create_gallery_bundle` trong `db/migrations/0002`:
- tham số `p_pin`
- biến `v_final_pin`, `v_pin_hash`
- cả khối sinh PIN (dòng 107–115)
- `coalesce(p_requires_pin, true)` ở dòng 54 — **mở sẵn**, trái nguyên tắc đóng
  sẵn mà dự án theo ở mọi chỗ khác. Nó đi cùng cả tham số `p_requires_pin`.
- `'pin', v_final_pin` trong giá trị trả về (dòng 182)

Đổi chữ ký hàm là **phải `drop function` rồi `create` lại**, không `create or
replace` được. Nhớ cấp lại quyền: `grant execute ... to authenticated,
service_role` (xem dòng 187 của 0002).

**Hai dòng seed.** `db/seed.sql:160` và `db/seed-prod.sql:52` có
`gallery.require_pin_default = true`. Bỏ cả hai. Tiện thể ghi vào ADR:
`gallery.watermark_default` cũng là giá trị chết — **không** bỏ ở task này,
nhưng nêu ra để PM biết.

**`db/schema.sql`** là ảnh chụp toàn bộ, chỉ dùng khi dựng dự án mới. Sửa nó cho
khớp — bỏ hai dòng 305–306 và hai cột còn lại.

**Đừng sửa `0002` và `0010` tại chỗ.** Migration là forward-only, lịch sử không
viết lại. Viết tệp mới.

## Việc cụ thể

1. **ADR-0005** theo `docs/adr/ADR-TEMPLATE.md`. `db/migrations/README.md` ghi rõ
   *"only after an approved ADR"* — không có ADR thì migration không được duyệt.
   ADR ghi cả mặt mất ở trên, và ghi rõ đường xử lý khi link rò là thu hồi/cấp lại.
2. **`db/migrations/0045-bo-ma-pin.sql`** — bốn cột, khung nhìn, hàm, theo đúng
   thứ tự không gãy phụ thuộc: khung nhìn trước, rồi hàm, rồi cột.
3. Sửa `db/schema.sql`, `db/seed.sql`, `db/seed-prod.sql` cho khớp.
4. **`npm run verify:schema`** phải xanh — cổng này canh `schema.sql` dựng nổi
   một cơ sở dữ liệu trống (BB-159).

## Tiêu chí xong — và cái bẫy của chặng này

- [ ] `ADR-0005` tồn tại, có mục ghi cái mất.
- [ ] `0045-bo-ma-pin.sql` tồn tại.
- [ ] `npm run verify:schema` xanh.
- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **319/319 đạt**. Con số phải **không đổi**: bạn chưa gỡ
      mã nào, nên chưa phép thử nào được phép đỏ hay biến mất.
- [ ] `git diff --stat` **không** đụng vào `src/`. Chạm `src/` là bạn đang làm
      chặng 1 của người khác.

**Cái bẫy:** đừng chạy `npm run db:push` hay `setup-prod.mjs`. Migration này
chưa được áp ở đâu cả. Chạy nó lên bb-dev bây giờ là màn khách và màn quản trị
gãy ngay, vì mã hiện tại vẫn đọc `requires_pin`.

Muốn tự kiểm SQL có chạy được không thì dựng một cơ sở dữ liệu **trống, riêng**
rồi áp `schema.sql` lên đó — đúng cách `verify:schema` làm. Không đụng bb-dev.

**Bàn giao phải có:** nội dung tệp migration, và kết quả thật của
`npm run verify:schema` dán nguyên. Ở BB-108 agent báo xong mà không có kiểm
ngược nào, nên lần này thiếu phần dán kết quả là trả lại, không soát tiếp.

## Một điều phải biết trước khi chạy

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà, tên và số điện thoại thật, chủ
studio chốt 16/09. Xem `AGENTS.md §6`. Kết quả truy vấn dán vào bàn giao phải
che tên trước. Kho này public.
