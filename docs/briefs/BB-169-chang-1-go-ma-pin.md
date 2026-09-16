# BB-169 chặng 1 — Gỡ mọi đường mã chạm tới PIN

**Cửa sổ: DEV-BE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-be` — nhánh `agent/dev-be`.

**Không phải ARCH, không phải DEV-FE.** ARCH đang làm chặng 2 của chính task này
trong một cửa sổ khác; DEV-FE đang làm BB-166. Đọc kỹ mục "Hai agent khác đang
chạy" bên dưới trước khi gõ phím đầu tiên.

---

## Việc

Chủ studio chốt ngày 16/09/2026: **bỏ hẳn mã PIN**, không phải tắt mặc định.
Chặng này gỡ mã. Xong chặng này là **không ai bật PIN được nữa**.

Đo ngày 16/09: **0/14 link đang bật PIN**. Một lớp phòng vệ không ai bật thì
không phải lớp phòng vệ.

**Cột trong cơ sở dữ liệu thì ARCH bỏ ở chặng 2, KHÔNG phải bạn.** Thứ tự này
bắt buộc và `db/migrations/README.md` đã ghi thành luật: bỏ cột trong khi mã cũ
còn đọc là app 500 ngay. Chặng 1 đi trước, chặng 2 theo sau một bản phát hành.

Nghĩa là sau khi bạn xong, bốn cột `requires_pin`, `pin_hash`, `failed_attempts`,
`locked_until` **vẫn còn nguyên** trong cơ sở dữ liệu, không ai đọc. Đúng như
thế, đừng "dọn nốt cho gọn".

## Mười bốn tệp, đã soát sẵn

| Tệp | Gỡ gì |
|---|---|
| `src/app/(customer)/g/[token]/pin/page.tsx` | xoá cả màn |
| `src/components/features/gallery/pin-form.tsx` | xoá cả component |
| `src/app/api/admin/share-links/[id]/pin/route.ts` | xoá cả đường |
| `src/app/api/auth/gallery/route.ts` | bỏ chỗ kiểm PIN và mã lỗi `PIN_REQUIRED` |
| `src/app/api/admin/galleries/route.ts` | bỏ `p_pin`, `p_requires_pin`, `pinHint` |
| `src/app/api/admin/galleries/schema.ts` | bỏ `requirePin` và `pin` khỏi `options` |
| `src/app/api/admin/galleries/[id]/items/route.ts` | 2 dòng |
| `src/components/features/admin/create-gallery-wizard.tsx` | bỏ ô tick PIN và state |
| `src/components/features/admin/gallery-detail.tsx` | 1 dòng |
| `src/components/features/gallery/gallery-app.tsx` | **chỉ 4 dòng** — xem cảnh báo dưới |
| `src/lib/api-response.ts` | bỏ mã lỗi `PIN_REQUIRED` |
| `src/types/domain.ts` | bỏ trường PIN |
| `src/i18n/vi.ts` · `src/i18n/en.ts` | bỏ khoá PIN — xem cảnh báo dưới |

Phép thử phải xử: `tests/unit/pin-input.test.ts` và `tests/unit/share-link-pin.test.ts`
xoá hẳn. `tests/security/gallery-auth.test.ts` và ba tệp trong `tests/e2e/` có
lối đi qua PIN — **sửa cho đúng đường mới, đừng xoá cả ca**. Một ca bảo mật bị
xoá là một lỗ không ai canh nữa.

`db/` thì **đừng đụng**. Đó là chặng 2 của ARCH.

## Hai agent khác đang chạy — ba tệp dùng chung

**DEV-FE đang làm BB-166** trong worktree `babybean-dev-fe`, và chạm ba tệp
trùng với bạn:

| Tệp dùng chung | DEV-FE đang sửa vùng nào | Bạn sửa vùng nào |
|---|---|---|
| `gallery-app.tsx` | quanh dòng 955, phần đầu màn hình | dòng 512, 521–522, 551–552 |
| `src/i18n/vi.ts` | thêm khoá cho nút nhắn tin | bỏ khoá PIN |
| `src/i18n/en.ts` | thêm khoá cho nút nhắn tin | bỏ khoá PIN |

Hai vùng cách xa nhau nên git gộp được, **miễn là bạn không định dạng lại tệp**.

- Ở `gallery-app.tsx`, chỉ bỏ đúng khối `PIN_REQUIRED` và hai lệnh
  `router.push(\`/g/${token}/pin\`)`. Không sắp xếp lại import, không chạy
  formatter lên cả tệp, không đổi thứ tự hàm.
- Ở hai tệp i18n, chỉ xoá đúng dòng khoá PIN.

Chạy formatter lên cả tệp là biến một lần gộp sạch thành một lần gỡ xung đột
bằng tay, và người phải gỡ là người gộp sau — không phải bạn.

**ARCH đang làm chặng 2** trong `babybean-arch`, chỉ đụng `db/` và `docs/adr/`.
Bạn đừng chạm hai chỗ đó thì không ai giẫm chân ai.

## Một chỗ dễ làm hỏng, nói trước

`/api/auth/gallery` là cửa khách đi vào. Bỏ nhánh PIN ở đây mà lệch một chút là
**khách không vào được ảnh của con mình**, hoặc tệ hơn — cửa mở cho người không
có token.

Bỏ nhánh PIN **không có nghĩa là bỏ kiểm token**. Token 22 ký tự giờ là thứ duy
nhất che ảnh của một nhà. Đường đi mới chỉ có hai nhánh: token đúng thì vào,
token sai hoặc link đã thu hồi thì chặn.

## Tiêu chí xong

- [ ] `grep -rniE "requires_pin|requirePin|pin_hash|PIN_REQUIRED|pinRequired|pinHint|PinForm" src/`
      → **không kết quả nào.**
- [ ] `ls src/app/\(customer\)/g/\[token\]/pin` → không tồn tại.
- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — xanh hết. Số ca **sẽ giảm** vì bạn xoá hai tệp phép thử;
      ghi rõ trong bàn giao **giảm bao nhiêu và vì sao**. Đây là task duy nhất
      trong dự án mà số ca giảm là đúng — nên phải nói ra, không để người soát
      tự đoán.
- [ ] `npm run verify:wired` sạch — canh không còn màn hình nào treo lơ lửng
      sau khi xoá màn PIN.
- [ ] `git diff --stat` **không** đụng `db/`. Chạm `db/` là bạn đang làm chặng 2
      của ARCH.

**Kiểm ngược, bắt buộc, dán kết quả thật vào bàn giao.**

Chạy `npm run dev` **ngay trong worktree này**. `.env.local` đã trỏ sẵn vào
bb-dev, nên `localhost:3000` phục vụ đúng dữ liệu đó. Tạo một bộ ảnh thử tên bắt
đầu bằng `Fixture BB-169`, cấp link, rồi:

1. Mở `http://localhost:3000/g/<token>` — vào được, xem được ảnh, thả tim được.
2. Thu hồi link đó rồi mở lại — **phải bị chặn**.

Dán cả hai kết quả.

**KHÔNG gọi ra internet cho việc này.** Không có host nào tên `bb-dev.*`:
`bb-dev` là tên một **dự án Supabase**, tức là một cơ sở dữ liệu, không phải
website. Tên miền thật của studio là `babybeanstudio.vn` (app ở
`hauky.babybeanstudio.vn`). `babybean.vn` — không có chữ `studio` — **chưa ai
đăng ký**, tra DNS ngày 15/09/2026 trả về không tồn tại (`docs/13 §5`). Đừng
ghép hostname từ chuỗi `@demo.babybean.vn` trong dữ liệu mẫu — đó là đuôi email
giả của sáu tài khoản demo, không phải địa chỉ có thật.

Ca thứ hai quan trọng hơn ca thứ nhất: nó chứng minh bạn gỡ PIN mà không gỡ nhầm
lớp kiểm token. Ở BB-108 agent báo xong mà không có kiểm ngược nào — lần này
thiếu phần này thì trả lại, không soát tiếp.

## Một điều phải biết trước khi chạy

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà, tên và số điện thoại thật, chủ
studio chốt 16/09. Xem `AGENTS.md §6`. Ảnh chụp màn hình và kết quả truy vấn phải
che tên trước khi đưa vào bàn giao. Kho này public.

Dọn rác sau khi xong: `npm run db:cleanup`. Đặt tên bộ ảnh thử bắt đầu bằng
`Fixture BB-169` thì nó dọn được, không thì bạn phải tự xoá tay.
