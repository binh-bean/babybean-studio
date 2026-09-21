# BB-194 + BB-195 — Chín chỗ nuốt lỗi còn lại, và hai đường ra ngoài chưa có chốt

**Cửa sổ: TÍCH HỢP (agent DEV-INT).** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-int` — nhánh `agent/dev-int`.

**Không phải DEV-BE, không phải DEV-FE.**

**Trước khi bắt đầu:** `git fetch && git merge origin/main`. Lần trước bạn bỏ
qua dòng này và làm trên nền cũ hơn `main` 29 commit. Lần này `main` đã có
BB-190, BB-191, BB-173 và cả `src/lib/kiem-thu.ts` của chính bạn — không gộp là
làm lại thứ đã có.

Hai việc, làm theo thứ tự. **BB-194 trước** vì nó nhỏ và cùng tệp.

---

## BB-194 — chín chỗ ghi dữ liệu xong không kiểm xem có ghi được không

BB-190 vừa vá 19 chỗ trong `src/app/api/`. Nhưng bộ dò chạy lại hôm 21/09 còn
**11 chỗ**, trong đó **9 chỗ nằm trong vùng của bạn** — DEV-BE không được phép
đụng vào:

| Tệp | Số chỗ | Ghi cái gì |
|---|---|---|
| `src/lib/lark/notify.ts` | 6 | cập nhật trạng thái dòng `notifications` |
| `src/lib/drive/sync-gallery.ts` | 3 | cập nhật `galleries` sau mỗi lượt đồng bộ |

Sáu chỗ ở `notify.ts` đáng lo hơn. Chúng là các lượt `update` đánh dấu một tin
đã `sent`, `skipped` hay `failed`. Lượt cập nhật đó hụt thì **tin nằm lại
`pending` vĩnh viễn**: lần chạy sau thấy nó còn `pending` nên gửi lại, và CSKH
nhận cùng một thẻ nhiều lần — hoặc ngược lại, một tin đã gửi rồi mà sổ ghi là
chưa. Không có gì báo.

Ba chỗ ở `sync-gallery.ts` ghi `photo_count`, `status` và `cover_photo_id`. Hụt
thì màn quản trị hiện số ảnh cũ trong khi Drive đã đổi — đúng lớp "im lặng".

**Luật áp dụng, giống hệt BB-190:**

- Ghi nghiệp vụ hụt → ném, để đường gọi biết.
- Ghi nhật ký / thống kê hụt → `console.error` kèm ngữ cảnh, không chặn đường
  người dùng.
- Cố ý bỏ qua → ghi lý do ngay trên đầu dòng, như hai chỗ `last_viewed_at` mà
  BB-190 đã để lại.

**Đừng sửa `src/app/api/`** — phần đó của DEV-BE và đã xong.

---

## BB-195 — `driveFetch` và `sync-retouch` vẫn chưa có chốt nào canh

BB-191 đã chặn hai đường ra Lark. Nhưng `docs/10-testing-qa.md §8` — do chính
bạn viết — nói thẳng rằng hai đường còn lại "an toàn" vì **mỗi phép thử hiện có
tự nhớ giả lập `fetch`**:

- `src/lib/drive/client.ts` → `googleapis.com`
- `src/lib/lark/sync-retouch.ts` → `open.larksuite.com` (đọc bảng Hậu Kỳ)

Đó không phải một chốt. Đó là trí nhớ của người viết phép thử tiếp theo. Và
đúng hình dạng đó đã gây tai nạn sáng 21/09.

Việc cần làm: kéo cả hai vào `src/lib/kiem-thu.ts`, cùng kiểu với hai đường
Lark. Phép thử nào cần đi qua chốt thì giả lập `fetch` rồi bật cửa thoát, như
`tests/unit/ghi-link-app-len-lark.test.ts` đang làm.

**Chặn thì phải để lại dấu**, không im lặng bỏ qua: trả về một kết quả nói rõ
"đang chạy phép thử", hoặc ghi một dòng — giống `notify.ts` ghi
`status: 'skipped'` kèm lý do.

---

## Tiêu chí xong

- [ ] `npm run typecheck` — **dán mã thoát**.
- [ ] `npm run lint` — **dán mã thoát**. Lần trước bạn báo xong mà lint đỏ:
      `scripts/kiem-nguoc-bb191.mjs` khai một biến rồi không dùng. Reviewer phải
      vá hộ. Đừng để lặp lại.
- [ ] `npm run test` — **368/368** cộng ca bạn thêm, dán mã thoát.
- [ ] Bộ dò của reviewer: sau khi xong, 9 chỗ kia phải về **0**. Cách đo nhanh:
      tìm trong `src/lib` những lượt `await <client>.from(...)` mà kết quả không
      được gán vào đâu cả.

**Kiểm ngược, bắt buộc** (`AGENTS.md §5a`) — làm thật, dán cả hai kết quả:

1. Hoàn nguyên một chỗ vá của BB-194 → phép thử canh chỗ đó phải **ĐỎ**.
2. Tắt chốt của BB-195 → phép thử phải **ĐỎ**, và phải đỏ vì đúng lý do nó nói
   là canh, không phải vì mock thiếu hàm rồi nổ ra cùng một mã lỗi.

Ý số 2 không phải nói suông: ca "bắt buộc" của BB-190 đã xanh cả khi bỏ bản vá,
vì bảng giả thiếu `insert` nên mã nổ `TypeError` và vẫn ra 500 — đúng con số ca
đó chờ, sai hoàn toàn lý do.

## Một điều phải biết

`bb-dev` chứa dữ liệu khách **thật** (`AGENTS.md §6`), và bảng Hậu Kỳ bên Lark
là bảng vận hành thật của studio. Dọn rác sau khi xong: `npm run db:cleanup`.
