# BB-197 — Màn Cài đặt: mười một con số đang chạy mà không ai sửa được

**Hai cửa sổ, hai chặng nối nhau.** Đây là việc **xếp hàng**, không phải việc
làm ngay: mỗi cửa sổ chỉ bắt đầu khi việc đang làm đã gộp xong.

| Chặng | Cửa sổ | Thư mục | Bắt đầu khi |
|---|---|---|---|
| **197a — đường API** | LẬP TRÌNH SAU (DEV-BE) | `babybean-dev-be` | BB-196 đã gộp |
| **197b — màn hình** | GIAO DIỆN (DEV-FE) | `babybean-dev-fe` | BB-060 đã gộp **và** 197a đã gộp |

**Trước khi bắt đầu, cả hai:** `git fetch && git merge origin/main`.

---

## Chuyện đang xảy ra

Bảng `settings` có **11 dòng đang điều khiển app thật**, và **không màn hình nào
sửa được dòng nào**. Muốn đổi "nhắc khách ngày 3 và ngày 6" thành ngày 2 và 5
thì hôm nay phải có người vào thẳng cơ sở dữ liệu gõ SQL.

Đo trên bb-dev ngày 21/09:

| Khoá | Đang là | Điều khiển cái gì |
|---|---|---|
| `gallery.default_due_days` | 7 | hạn chốt mặc định của album mới |
| `gallery.reminder_days` | `[3, 6]` | nhắc khách vào ngày thứ mấy |
| `gallery.link_ttl_days` | 60 | link sống bao lâu (quyết định 17/09: 2 tháng) |
| `gallery.watermark_default` | bật | đóng dấu mờ mặc định |
| `gallery.allow_download_default` | bật | cho khách tải mặc định |
| `gallery.invite_default` | bật | cho mời người thân mặc định |
| `chat.page_url` | link Messenger | nút "Nhắn cho studio" của ba mẹ |
| `lark.webhook_url` | webhook nhóm | bot báo tin sang Lark |
| `photo.expected_long_edge_px` | 2048 | cạnh dài ảnh xem trước |
| `lark_hook_queue` | `{...}` | **không phải cài đặt** — hàng đợi nội bộ |
| `gallery.require_pin_default` | bật | **đã chết** — xem dưới |

## Hai dòng KHÔNG được đưa lên màn hình

- **`lark_hook_queue`** là hàng đợi của đường kéo Lark, không phải thứ người
  chỉnh. Cho nó lên màn Cài đặt là mời người ta sửa một cấu trúc dữ liệu đang
  chạy.
- **`gallery.require_pin_default`** là rác: mã PIN đã gỡ hẳn ở BB-169 và
  migration `0045`. Reviewer quét cả `src/` lẫn `db/` ngày 21/09 — **không chỗ
  nào đọc nó nữa**. DEV-BE xoá nó trong migration của 197a. Để lại thì sớm muộn
  có người bật nó lên và tưởng mình vừa bật một tính năng.

## 197a — DEV-BE

`GET` và `PATCH /api/admin/settings`.

- **Chỉ vai được `settings:manage` mới ghi được.** Hôm nay là `owner` và
  `admin` — ARCH và SEC-ARCH đang làm vai trò động ở BB-172 chặng 2; đừng chờ
  họ, dùng `requireRole` như các đường khác đang làm.
- **Kiểm kiểu dữ liệu từng khoá.** `gallery.reminder_days` là mảng số, không
  phải chuỗi; `chat.page_url` phải là một địa chỉ `https`. Nhận bừa một `jsonb`
  rồi ghi thẳng là cách nhanh nhất để một hôm nào đó app 500 ở màn khách.
- **Ghi `activity_logs`** cho mỗi lượt đổi: khoá nào, **giá trị cũ và giá trị
  mới**. Đây là bảng chủ studio tra khi có tranh cãi.
- **Kiểm `error` của mọi lượt ghi** — BB-190 vừa vá 19 chỗ quên đúng việc này.
- Migration xoá dòng `gallery.require_pin_default`, chạy lại được nhiều lần mà
  kết quả không đổi (xem `db/migrations/0050`).

## 197b — DEV-FE

Màn `/admin/settings`, mở khoá mục "Cài đặt" trong sidebar (đang xám, ghi
"sắp có").

- Nhóm theo việc, không theo tên khoá: **Album** (hạn chốt, nhắc, hạn link) ·
  **Ảnh** (watermark, cho tải, cỡ ảnh) · **Liên lạc** (Messenger, webhook Lark).
- Mỗi ô kèm một câu nói rõ nó ảnh hưởng ai: *"Áp dụng cho album tạo mới. Album
  đang chạy giữ nguyên hạn cũ."*
- Đổi xong phải thấy ngay là đã lưu, và **lưu hụt phải báo đỏ** — đừng im lặng.
- `lark.webhook_url` là địa chỉ bí mật: hiện dạng che bớt, có nút hiện tạm.

## Tiêu chí xong — cả hai chặng

- [ ] `npm run typecheck`, `npm run lint` — **dán mã thoát**.
- [ ] `npm run test` — cả bộ xanh cộng ca mới, dán mã thoát.
- [ ] `npm run verify:db` — **17/17** (chặng a), dán mã thoát.
- [ ] Ảnh chụp màn hình ba khổ (chặng b).

**Kiểm ngược, bắt buộc** (`AGENTS.md §5a`):

- 197a: gỡ lớp kiểm vai trò đi → ca "người không có quyền không sửa được cài
  đặt" phải **ĐỎ**. Gửi một giá trị sai kiểu → phải bị từ chối, không được ghi.
- 197b: đổi một giá trị rồi tải lại trang — giá trị mới phải còn đó. Dán ảnh
  trước và sau.

`tests/security/cai-dat-nhay-cam.test.ts` đã canh luật quyền của bảng này từ
trước. **Đừng sửa nó cho vừa mã mới** — nếu nó đỏ, đọc lại xem ai sai.

## Một điều phải biết

`bb-dev` chứa dữ liệu khách **thật** (`AGENTS.md §6`), và mấy dòng này đang điều
khiển app **đang chạy**. Đổi thử thì đổi rồi trả về giá trị cũ ngay, và ghi lại
giá trị cũ trước khi đổi. Dọn rác sau khi xong: `npm run db:cleanup`.
