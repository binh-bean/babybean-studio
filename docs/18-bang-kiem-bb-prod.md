# 18. Bảng kiểm cắt app sang bb-prod

**Soát lại 16/09/2026.** Bản trước viết khi bb-prod còn trống và ghi tên tệp
`.env.prod` (thật ra là `.env.prod.local`). Bản này ghi đúng trạng thái đang có.

App đang chạy trên **bb-dev**. Dữ liệu thật đã nằm sẵn trong **bb-prod** nhưng
chưa ai nhìn thấy nó qua web.

---

## 1. bb-prod đang có gì (số đếm thật)

| Bảng | Số dòng | Ghi chú |
|---|---:|---|
| `branches` | 3 | Pasteur, Tân Bình, Thảo Điền |
| `packages` | 4 | |
| `products` | 130 | kéo từ danh mục Lark |
| `gallery_items` | 2.047 | dòng hàng của hợp đồng |
| `customers` | 427 | **tên và số điện thoại THẬT** |
| `babies` | 256 | |
| `shoots` | 457 | |
| `galleries` | 457 | tất cả đang `draft`; 447/457 tính được hạn mức |
| `photos` | 0 | chưa đồng bộ Drive lần nào |
| `share_links` | 0 | chưa cấp link cho khách nào |
| `staff_profiles` | **0** | **chưa ai đăng nhập được màn quản trị** |

Cổng: `node --env-file=.env.prod.local scripts/verify-db.mjs` → **17/17 đạt**.
Cả 457 bộ ảnh đều `download_enabled = true` (áp 0042 ngày 16/09).

## 1b. KHOAN CẮT SANG — chủ studio chốt 17/09/2026

**Hoàn thiện tính năng và giao diện xong mới giao cho khách.** Bốn việc ở mục 2
bên dưới vẫn đúng, nhưng **chưa làm bây giờ**.

### Vì sao phải viết ra cái đích

"Hoàn thiện" mà không có định nghĩa thì không bao giờ tới — luôn còn một việc
nữa đáng làm. Dưới đây là danh sách đếm được. Xong hết bảy dòng là cắt sang.

### Bảy cổng bắt buộc

| # | Cổng | Vì sao bắt buộc |
|---|---|---|
| ✅ | **BB-183** — link thật sự hết hạn sau 2 tháng | Màn khách đã dựng sẵn chỗ hiện con số này. In "2 tháng" trong khi link sống vĩnh viễn là dạy khách đừng tin app |
| ✅ | **BB-174·175·176** — ba chỗ làm app như đang hỏng | Nhân viên dùng hằng ngày. Cảm giác hỏng đắt hơn lỗi thật: lỗi thật thì người ta báo, cảm giác hỏng thì người ta lặng lẽ thôi dùng |
| ✅ | **BB-177** — CSKH lấy được link app | CSKH dán link cho khách mỗi ngày. Không có nó thì quy trình đứt ngay bước đầu |
| ✅ | **BB-182** — Lark không đánh rơi thay đổi | Thay đổi rơi trong im lặng là bộ ảnh không dựng, mà không ai biết để đi tìm |
| 5 | **Bốn việc tay ở mục 2** (2.4 thêm ngày 18/09) | Không có tài khoản quản trị thì không ai vào được màn quản trị, kể cả chủ studio |
| 6 | **Hẹn giờ sao lưu hằng tuần** | `docs/11 §7`. Từ lúc khách đầu tiên bấm chọn ảnh, mất dữ liệu là mất công của khách |
| 7 | **Một lượt đi trọn đường như khách thật** | Trên điện thoại thật, bằng 4G, với một bộ ảnh thật. Chủ studio làm, không phải máy |

### Những việc KHÔNG chặn

Ghi ra để khỏi bị kéo dài vô hạn. Bốn việc này **làm sau khi giao khách cũng
được**, vì chúng không chạm vào đường đi của ba mẹ hay công việc hằng ngày của
nhân viên:

- **BB-171** nút xoá tài khoản — "Cho nghỉ việc" đã dùng tạm được.
- **BB-172** màn Vai trò và quyền — việc lớn nhất trong sổ, và chín vai trò hiện
  có đủ dùng cho ba chi nhánh.
- **BB-173** lịch sử thao tác — dữ liệu đang được ghi đủ (6.420 dòng), chỉ chưa
  có màn để xem. Không mất gì khi chờ.
- **BB-178** địa chỉ đọc được — tiện cho nhân viên, không ai ngoài thấy.

### Một điều đừng để tuột

Mỗi tuần chưa cắt sang là một tuần **457 bộ ảnh thật nằm trong bb-prod mà không
ai xem được**, và CSKH vẫn gửi ảnh cho khách theo cách cũ. Hoàn thiện là đúng,
nhưng danh sách trên cố tình ngắn — đừng thêm dòng vào đó trừ khi nó thật sự
chặn ba mẹ hoặc chặn nhân viên.

## 2. Bốn việc CHỦ STUDIO phải tự làm

Cả bốn đều là gõ mật khẩu hoặc dán khoá bí mật. Đó là việc của người, không phải
việc của agent hay của Claude.

### 2.1. Tạo tài khoản quản trị trên bb-prod

1. Supabase Dashboard → dự án **bb-prod** → Authentication → Users → Add user.
2. Email công việc, mật khẩu mạnh, tick **Auto Confirm User**.
3. Copy `UUID` của user vừa tạo.
4. Table Editor → `staff_profiles` → Insert row: dán UUID vào `id`, điền
   `full_name`, `email`, `role` = `owner`.
5. Muốn giới hạn theo chi nhánh thì thêm dòng ở `staff_branches`.

Chưa làm bước này thì cắt sang bb-prod là **không ai vào được màn quản trị**.

### 2.2. Đổi ba biến Supabase trên Vercel sang bb-prod

Vercel → project `babybean-studio` → Settings → Environment Variables →
môi trường **Production**, sửa đúng ba biến này (lấy giá trị từ Supabase
Dashboard của bb-prod, Settings → API):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

**Chỉ sửa môi trường Production.** Để Preview trỏ bb-dev — nhánh thử nghiệm
không được chạm dữ liệu khách thật.

Sửa xong phải **Redeploy**: biến môi trường chỉ vào bản dựng mới.

### 2.3. Hai biến cho đường kéo Lark định kỳ

Xem `docs/11-deployment.md §5a`. Bốn thứ, thiếu một là tính năng chết im lặng:
`SYNC_CRON_SECRET` và `SUPABASE_DB_URL` trên Vercel, cùng hai GitHub Secrets,
rồi bỏ dấu `#` ở dòng `schedule`.

### 2.4. Một biến nữa: `CRON_SECRET` (BB-186)

Vercel → Settings → Environment Variables → **Production** → thêm `CRON_SECRET`,
giá trị là một chuỗi dài tự sinh (có thể dùng chung giá trị với
`SYNC_CRON_SECRET`, hoặc một chuỗi khác — đường này nhận cả hai).

**Tên biến do Vercel quy định, không đổi được.** Đặt nó là Vercel tự gắn
`Authorization: Bearer <giá trị>` vào mọi lượt cron nó gọi.

Thiếu biến này thì `/api/cron/expire-galleries` trả 401 mọi lượt, và **link
không bao giờ chuyển sang trạng thái hết hạn** — cột `status` ghi `active`
trong khi ba mẹ nhìn trang báo hết hạn. Đó đúng là tình trạng của dự án suốt
từ lúc dựng tới 18/09/2026, cộng thêm lỗi phương thức đã vá ở BB-186.

Kiểm sau khi Redeploy:

```bash
curl -i -H "Authorization: Bearer <CRON_SECRET>" https://hauky.babybeanstudio.vn/api/cron/expire-galleries
```

Phải ra `200` kèm `stats`. Ra `401` là biến chưa vào bản dựng — Redeploy lại.

## 3. Sau khi cắt — kiểm ngay bốn thứ

1. Đăng nhập `hauky.babybeanstudio.vn/login` bằng tài khoản ở 2.1.
2. Màn danh sách bộ ảnh phải hiện **457** bộ, cột đầu là **Số hoá đơn**.
3. Mở một bộ, bấm **Đồng bộ lại** để kéo ảnh từ thư mục Drive gốc. Bộ ảnh
   chuyển khỏi `draft` khi có ảnh.
4. Cấp một link thử cho **chính mình**, mở bằng điện thoại: ảnh phải nét, thả
   tim được, và có nút tải xuống.

Chưa có ảnh nào trong `photos` nên trước bước 3 màn khách sẽ trống — đúng, không
phải lỗi.

## 4. Những chỗ còn biết mà chưa làm

- **Sao lưu: đã có, chạy được, nhưng chưa ai hẹn giờ.** `npm run db:backup:prod`
  kết xuất dữ liệu ra một tệp `.sql` ngoài kho (đo trên bb-dev 16/09: 23 bảng,
  162.739 dòng, 86 MB, dưới một phút). Không cần gói Pro, không cần cài gì.
  Chi tiết và ba điều phải biết trước khi cần đến nó: `docs/11 §7`.

  Mốc bắt buộc không phải là lúc cắt sang, mà là **lúc khách đầu tiên bấm chọn
  ảnh**. Trước mốc đó, mọi thứ trong bb-prod dựng lại được từ Lark và Drive —
  `selections`, `selection_items`, `share_links` đang rỗng. Sau mốc đó, mất
  bb-prod là mất công của khách, và không nguồn nào dựng lại được.
- **Lệch còn lại giữa bb-dev và bb-prod: 11 cột.** Đều là tên gọi khác của cột
  đã có (`album_title` cạnh `gallery_title`, `included_quota` cạnh `quota`…)
  trong hai khung nhìn báo cáo. Đã soát cả `src/` và `tests/`: **không chỗ nào
  đọc chúng**. Dọn được bằng cách bỏ hẳn tên thừa khỏi `db/schema.sql` rồi dựng
  lại khung nhìn trên bb-dev — chưa làm vì chưa cần.
- **bb-dev giờ cũng hiện tên thật.** Chủ studio chốt 16/09/2026 để soát dữ liệu
  trước khi cắt sang. Chốt vẫn ở `src/lib/lark/muc-tieu-du-lieu.ts`, vẫn là danh
  sách CHO PHÉP — cơ sở dữ liệu nào không có tên trong đó vẫn bị che.

  Cái giá phải nhớ: bb-dev là nơi agent **có** khoá, bb-prod thì không. Từ nay
  ba việc sau không còn là lời khuyên — không dán kết quả truy vấn bb-dev ra
  ngoài; fixture và ảnh chụp màn hình phải thay tên trước khi commit; tệp sao
  lưu bb-dev đối xử như tệp của bb-prod.

## 5. Lịch sử: cách bb-prod được dựng

Giữ lại để dựng lại được từ đầu nếu cần.

```bash
# 1. Dựng cấu trúc, quyền, dữ liệu nền. Tự hội tụ, chạy lại được nhiều lần.
node --env-file=.env.prod.local scripts/setup-prod.mjs

# 2. Kéo danh mục sản phẩm từ Lark
node --env-file=.env.prod.local scripts/sync-lark-catalog.mjs

# 3. Kéo hợp đồng, khách, bé, bộ ảnh
node --env-file=.env.prod.local scripts/sync-lark-contracts.mjs
```

`setup-prod.mjs` áp `db/schema.sql` → `db/policies.sql` → toàn bộ
`db/migrations/` → `db/seed-prod.sql`, mỗi câu lệnh một lần, lỗi nào hoàn tác
riêng câu đó rồi thử lại vòng sau. Ba migration 0042–0044 được áp riêng ngày
16/09 (chỉ 8 câu lệnh) thay vì chạy lại cả bộ hơn 400 câu lên một cơ sở dữ liệu
đã có 457 bộ ảnh thật.
