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
| 5 | **Mục 2.0 (bốn migration) + bốn việc tay ở mục 2** | Không có tài khoản quản trị thì không ai vào được màn quản trị, kể cả chủ studio |
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

## 2.0. TRƯỚC ĐÃ — bb-prod đang chậm hơn bb-dev bốn migration

**Soát ngày 21/09/2026.** Việc này KHÔNG phải việc tay của chủ studio, nhưng
nó phải xong **trước** bốn việc ở dưới, nếu không cắt sang là màn Nhân sự hỏng
ngay phút đầu.

Đo bằng cách so trực tiếp hai cơ sở dữ liệu:

| | bb-dev | bb-prod |
|---|---|---|
| Bảng | đủ | **đủ** |
| Khung nhìn `v_staff_deletable` | có | **THIẾU** |
| Hàm `check_staff_deletable` | có | **THIẾU** |
| Cột PIN đã bỏ (0045) | rồi | **chưa** (cột thừa, mã không còn đọc) |
| `settings['gallery.link_ttl_days']` | có | **THIẾU** |
| `settings['chat.page_url']` | có | **THIẾU** |
| `settings['lark.webhook_url']` | có | có |

Hậu quả nếu cắt sang mà chưa vá:

- **Màn Nhân sự đọc `v_staff_deletable`** (`/api/admin/staff` dòng 69). Khung
  nhìn không tồn tại thì truy vấn hỏng — và đúng dòng đó là **một trong 18 chỗ
  bỏ qua `error`** của BB-190, nên nó hỏng trong im lặng: danh sách nhân sự
  hiện ra nhưng không nút Xoá nào biết mình có được bấm hay không.
- **Nút "Nhắn cho studio" của ba mẹ biến mất**, vì `chat.page_url` không có.
- Hạn link rơi về mặc định 60 ngày trong mã. Bằng đúng "2 tháng" chủ studio
  chốt, nên không sai — nhưng một con số nằm trong mã chứ không nằm trong cài
  đặt là con số không ai đổi được qua giao diện.

### Đã có đường vá — soạn 21/09/2026, diễn tập xong trên bb-dev

Trước đây mục này ghi "không có script chạy migration cho bb-prod", và việc vá
phải làm bằng tay: dán từng tệp SQL vào ô SQL Editor, không ai đo trước, không
ai đo lại sau, không gì bắt buộc sao lưu. Nay có `scripts/migrate-prod.mjs`.

| Lệnh | Làm gì |
|---|---|
| `npm run db:migrate:prod` | **Chỉ đọc.** In bảy mốc kiểm của bb-prod, nói rõ mốc nào chưa đạt và hỏng cái gì. Không ghi một chữ nào |
| `npm run db:migrate:prod -- --thuc-thi` | Sao lưu trước, rồi áp `0045` → `0046` → `0047` → `0048` → `0049`, mỗi tệp một giao dịch riêng, gãy ở đâu hoàn nguyên đúng tệp đó. Xong thì đo lại bảy mốc; còn mốc nào đỏ là **thoát khác 0**, không báo xong |

`0049-dong-chat-page-url.sql` là tệp mới: dòng `chat.page_url` từ trước tới nay
chỉ nằm trong `db/seed.sql`, mà seed không bao giờ chạy trên production — nên
không có đường nào bắc nó sang bb-prod. Giá trị đúng bằng giá trị đang chạy
trên bb-dev (trang Messenger của studio, địa chỉ công khai).

Không cần lo thứ tự hay chạy trùng: cả năm tệp đều chạy lại được nhiều lần mà
kết quả không đổi (`if exists`, `or replace`, `on conflict do nothing`).

**Diễn tập ngày 21/09/2026 trên bb-dev** (493 bộ ảnh, 8 nhân sự): xoá thật dòng
`chat.page_url` để một mốc chuyển đỏ → chạy `--thuc-thi` → năm tệp áp xong,
bảy mốc xanh lại, giá trị khôi phục đúng nguyên văn, `npm run verify:db`
**17/17**, mã thoát 0. Mốc "PUBLIC không gọi được hàm" vẫn xanh sau khi chạy,
tức thứ tự 0047 → 0048 giữ đúng: 0047 vô tình cấp quyền cho PUBLIC, 0048 thu
lại ngay sau đó.

Đây là việc sửa dữ liệu của hàng trăm nhà thật, không hoàn tác được. Script đã
tự sao lưu, nhưng **chỉ chạy sau khi chủ studio duyệt**, và chạy lệnh đọc
trước để xem bb-prod đang thiếu đúng những gì.

### Đo thật bằng chính script, 21/09/2026

`npm run db:migrate:prod` (chỉ đọc) trên bb-prod — **457 bộ ảnh, 0 nhân sự**:

| Mốc | bb-prod |
|---|---|
| Khung nhìn `public.v_staff_deletable` | **THIẾU** |
| Hàm `public.check_staff_deletable` | **THIẾU** |
| PUBLIC không gọi được hàm đó | đã khoá (vì chưa có hàm nào để gọi) |
| Cặp `app.*` lạc ngoài migration | sạch |
| Cột mã PIN đã bỏ (0045) | **còn 4 cột thừa** |
| `settings['gallery.link_ttl_days']` | **THIẾU** |
| `settings['chat.page_url']` | **THIẾU** |

**5/7 mốc đỏ**, đúng bằng bản soát tay ở đầu mục này — lần đo tay không bỏ sót
gì, cũng không thổi phồng gì.

Con số **0 nhân sự** là một chuyện khác, và nó nằm ở mục 2 bên dưới: bb-prod
chưa có một tài khoản quản trị nào. Vá xong năm migration thì màn Nhân sự chạy
được, nhưng vẫn chưa ai đăng nhập vào để mở nó ra.

### 2.0b. Vá xong thì lộ ra một lớp lệch nữa — và nó nặng hơn (BB-193)

Áp xong năm tệp, soát tiếp quyền trên bb-prod thì thấy:

| | bb-dev | bb-prod |
|---|---|---|
| Quyền **mặc định** của bảng/khung nhìn sinh sau | `anon=Dxtm`, `authenticated=m` | **`anon=arwdDxtm`, `authenticated=arwdm`** |
| Khung nhìn mở cho `anon` | không cái nào | **cả năm cái**, đủ SELECT/INSERT/UPDATE/DELETE |
| `selection_ops` mở cho `authenticated` | không | **có** |

Nghĩa là trên bb-prod, **mọi bảng và khung nhìn sinh ra từ nay đều mở sẵn cho
`anon` ngay lúc chào đời**, không cần ai cấp. Chính lượt vá hôm nay chứng minh
điều đó: `0045` dựng lại `v_share_links`, `0047` tạo `v_staff_deletable`, và cả
hai sinh ra với `anon` đọc–ghi–xoá.

Hai khung nhìn đó **không phải `security_invoker`**, nên chúng chạy bằng quyền
của chủ khung nhìn và **đi vòng qua RLS** của `share_links` và `staff_profiles`.
`v_share_links` lại là một select phẳng nên Postgres coi nó tự động ghi được —
tức về lý thuyết là cả đường ĐỌC lẫn đường GHI, vòng qua toàn bộ lớp kiểm quyền.

**Hôm nay chưa ai với tới được**: Data API của bb-prod trả 404 (`PGRST125`) cho
mọi đường, kể cả `/rest/v1/share_links`. Nhưng đó là một **công tắc trong bảng
điều khiển Supabase**, không phải một lớp quyền — bật nhầm là lộ tiền tố link,
tình trạng và số lượt mở của 457 nhà thật. Trên bb-dev thì cùng câu hỏi đó trả
401 kèm đúng câu *"permission denied"*: ở đó chặn bằng quyền, không bằng công tắc.

**Vì sao kho không ai biết**: câu `alter default privileges ... from anon` không
có trong bất kỳ migration nào, cũng không có trong `policies.sql` — `policies.sql`
chỉ thu hồi trên những bảng ĐANG có, và tệp đó không bao giờ chạy trên
production. Ai đó đã gõ tay lên bb-dev và không ghi lại. Một lớp bảo vệ chỉ tồn
tại trong một cơ sở dữ liệu là lớp bảo vệ không ai kế thừa được.

`0050-quyen-mac-dinh-cho-vat-sinh-sau.sql` vá cả ba dòng trong bảng trên, và
`migrate-prod` nay đo **chín mốc** thay vì bảy — hai mốc mới quét cả họ khung
nhìn chứ không gõ tên, để khung nhìn chưa ai viết cũng nằm trong lưới.

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
