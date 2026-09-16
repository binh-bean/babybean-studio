# BB-166 — Nút "Nhắn cho studio" trên màn khách

**Cửa sổ: DEV-FE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-fe` — nhánh `agent/dev-fe`.

Đọc kỹ dòng trên trước khi gõ phím đầu tiên. Nhầm cửa sổ là sửa vào worktree của
agent khác, và người phát hiện ra sẽ là người phải gỡ.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`. Nhánh này còn ở
trước BB-108 đã gộp; không đồng bộ là bạn sửa lên bản cũ.

---

## Việc

Màn khách hiện chỉ có tên chi nhánh và số hotline. Ba mẹ muốn hỏi gì thì phải
gọi điện — giữa giờ làm, hoặc khi đang bế con, gọi là việc khó. Thêm một nút
**"Nhắn cho studio"** mở thẳng ứng dụng chat.

Đích: `https://m.me/113878833349843` — một Page dùng chung cho cả ba chi nhánh,
chủ studio chốt 16/09/2026.

## Ba ràng buộc, không thương lượng

**1. KHÔNG nhúng hộp chat của Facebook. Chỉ deep link.**

Đây không phải chuyện tiện hay không tiện. Trang này hiện ảnh trẻ em. Nhúng hộp
chat nghĩa là Facebook biết ai đang xem bộ ảnh nào và vào lúc nào, **trên chính
trang đó**. BB-074 đã tự host font Be Vietnam Pro chỉ để không gửi địa chỉ IP
của khách sang Google; nhúng Messenger vào đây là đi ngược đúng quyết định ấy,
mà lần này còn nặng hơn nhiều.

Không `<script>` của Facebook. Không iframe. Không `<link>` sang domain của họ.
Một thẻ `<a href>` với `target="_blank"` và `rel="noopener noreferrer"`.

**2. KHÔNG ghi cứng địa chỉ trong mã.**

Địa chỉ này sẽ đổi: studio đổi Page, tách theo chi nhánh, hay chuyển sang Zalo
OA. Lúc đó không ai muốn phải dựng lại bản web chỉ để sửa một chuỗi.

Chỗ chứa: bảng **`settings`**, khoá `chat.page_url`, `branch_id = null` nghĩa là
áp cho cả ba chi nhánh. Bảng này đã có sẵn và đã có cột `branch_id`, nên sau này
tách theo chi nhánh không cần migration. **Đừng tạo cột mới, đừng tạo bảng mới,
đừng dùng biến môi trường** — biến môi trường thì đổi phải dựng lại bản web.

Thêm dòng cấu hình vào `db/seed.sql` để cơ sở dữ liệu dựng mới có sẵn khoá đó
(giá trị để trống), và tự `insert` giá trị thật vào bb-dev để thử.

**3. Không có cấu hình thì KHÔNG vẽ nút.**

Một nút bấm vào không ra gì tệ hơn là không có nút. Khoá trống hoặc không tồn
tại thì màn khách trông y như hôm nay.

## Đường dữ liệu

`GET /api/g/gallery` đã trả `branch: { name, hotline, zaloOa }`
(`route.ts:215`). Thêm `chatUrl` vào đúng khối đó.

Route này dùng `createAdminClient()` nên đọc `settings` được, **không vướng luật
quyền**. Nhưng chính vì thế: **chỉ lấy đúng một khoá `chat.page_url`**, đừng trả
cả hàng, đừng trả cả bảng. `db/migrations/0038` ghi rõ `settings` là bảng nhạy
cảm — nó sẽ chứa bảng giá và địa chỉ webhook. Rò một khoá hôm nay là rò tất cả
ngày mai.

Kiểm giá trị trước khi trả: chỉ chấp nhận chuỗi bắt đầu bằng `https://`. Giá trị
lạ thì trả `null`, đừng trả nguyên xi — ô cấu hình là chỗ người gõ tay.

## Chỗ đặt nút

Cạnh dòng `{gallery.branch.name} • {gallery.branch.hotline}` ở
`gallery-app.tsx:955`. Hotline giữ nguyên, không thay — có ba mẹ vẫn thích gọi.

Nút hiện **cả khi bộ ảnh đã chốt** (`isLocked`). Chốt xong mới là lúc ba mẹ hay
có việc cần hỏi nhất.

Chuỗi hiển thị đi qua `src/i18n/vi.ts` và `en.ts`. **Không hard-code tiếng
Việt** — BB-069 đã dọn hết chuỗi cứng, đừng thêm lại.

## Tiêu chí xong — và một điều rút ra từ BB-108

Ở BB-108 bạn viết phép thử đọc chính tệp `.tsx` bằng `fs` rồi khớp regex trên
văn bản. **Đừng làm lại kiểu đó.** Phép thử như vậy đỏ khi đổi tên biến dù hành
vi y nguyên, và xanh khi component hỏng lúc chạy. Nó canh chính tả, không canh
hành vi.

Lần này phép thử phải **dựng component thật** và kiểm điều người dùng thấy:

- [ ] Có `chat.page_url` → nút hiện ra, `href` đúng bằng giá trị đó,
      `rel` có `noopener`.
- [ ] Khoá trống, khoá không tồn tại, khoá không bắt đầu bằng `https://`
      → **không có nút nào** trong cây DOM. Ba ca riêng, không gộp.
- [ ] Bộ ảnh đã chốt → nút vẫn hiện.
- [ ] `GET /api/g/gallery` **không** trả khoá `settings` nào khác ngoài
      `chatUrl`. Ca này quan trọng nhất về sau — viết nó.

Cổng bắt buộc:

- [ ] `npm run typecheck` sạch.
- [ ] `npm run lint` sạch.
- [ ] `npm run test` — **319/319 đạt** cộng số ca bạn thêm. Thấp hơn nghĩa là
      bạn làm hỏng một phép thử đang xanh; đừng sửa phép thử cho nó xanh lại.
- [ ] `grep -rn "m.me\|113878833349843" src/` → **không kết quả nào.**
      Ra kết quả tức là bạn đã ghi cứng địa chỉ, vi phạm ràng buộc 2.
- [ ] `grep -rniE "connect.facebook|fbevents|messenger" src/` → **không kết
      quả nào.** Vi phạm ràng buộc 1.

**Kiểm ngược, bắt buộc, dán kết quả thật vào bàn giao:** mở một link khách thật
trên bb-dev, chụp lại phần đầu màn hình có nút, rồi mở tab Network của trình
duyệt và dán danh sách domain mà trang gọi tới. **Không được có domain nào của
Facebook.** Ở BB-108 bạn báo xong mà không có kiểm ngược nào — lần này thiếu
phần này thì tôi trả lại, không soát tiếp.

## Hai điều phải biết trước khi chạy

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà, tên và số điện thoại thật, chủ
studio chốt 16/09. Xem `AGENTS.md §6`. Ảnh chụp màn hình phải **che tên khách**
trước khi đưa vào bàn giao. Kho này public.

**Dọn rác sau khi xong:** `npm run db:cleanup`. Nó chỉ nhận ra bộ ảnh mang tiền
tố `Fixture ` hoặc thư mục Drive giả `mock-*` — đặt tên bộ thử là
`Fixture BB-166 ...`, không thì bạn phải tự xoá tay.

## Ngoài phạm vi

Mã PIN sắp bị bỏ hẳn khỏi hệ thống (chủ studio chốt 16/09, xem BB-169). Màn
`/g/[token]/pin` và `pin-form.tsx` sẽ biến mất. **Đừng đụng vào chúng ở task
này**, và cũng đừng dựa vào chúng.
