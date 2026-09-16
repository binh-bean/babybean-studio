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

## 2. Ba việc CHỦ STUDIO phải tự làm

Cả ba đều là gõ mật khẩu hoặc dán khoá bí mật. Đó là việc của người, không phải
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
- **Tên khách trên bb-dev vẫn là tên che.** Chốt ở `src/lib/lark/muc-tieu-du-lieu.ts`:
  chỉ bb-prod nhận tên thật. Đừng nới danh sách đó để tiện thử.

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
