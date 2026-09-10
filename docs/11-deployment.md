# 11 — Triển khai & vận hành

Chủ sở hữu: **DEV-OPS**.

## 1. Môi trường

| Môi trường | Nhánh | URL | Supabase | Dùng để |
|---|---|---|---|---|
| Local | — | `localhost:3000` | project `bb-dev` hoặc Supabase CLI | Phát triển |
| Preview | mọi PR | `*.vercel.app` | project `bb-staging` | Review PR, QA-BOT chạy E2E |
| Staging | `develop` | `staging.chon-anh.babybean.vn` | `bb-staging` | Nghiệm thu trước khi lên thật |
| Production | `main` | `chon-anh.babybean.vn` | `bb-prod` | Thật |

**Quy tắc**: Preview và Staging **không bao giờ** trỏ vào `bb-prod`. Dữ liệu khách thật không được lọt sang môi trường thử.

## 1b. Cài đặt khi tạo project Supabase

Bốn lựa chọn ở màn hình "Create a new project" quyết định mô hình bảo mật. Đặt giống nhau cho cả `bb-dev`, `bb-staging`, `bb-prod`.

| Tuỳ chọn | Đặt | Vì sao |
|---|---|---|
| **Enable Data API** | **Bật** | `@supabase/supabase-js` gọi qua PostgREST. Tắt là toàn bộ truy cập của nhân viên hỏng. |
| **Automatically expose new tables** | **Tắt** | Mặc định của Supabase là cấp quyền cho mọi bảng mới ngay khi nó ra đời. Với dự án này, một bảng do migration Phase 3 tạo ra sẽ lộ qua REST API **trước khi** ai đó kịp viết policy cho nó. Tắt đi thì bảng mới không ai với tới được cho tới khi có `grant` tường minh trong `db/policies.sql` — quên là hỏng về phía an toàn. |
| **Enable automatic RLS** | **Bật** | Event trigger tự bật RLS cho mọi bảng mới trong schema `public`. `schema.sql` đã bật thủ công cho 17 bảng, nhưng đây là lưới an toàn cho những bảng agent thêm về sau. |
| **Region** | **Singapore (ap-southeast-1)** | **Không đổi được sau khi tạo project.** Đo thật từ TP.HCM: Singapore ~65 ms, Sydney ~253 ms cho một vòng TCP — chênh ~190 ms. |

**Hệ quả của việc tắt "Automatically expose new tables"**: `db/policies.sql` phải cấp quyền bảng tường minh cho vai `authenticated`. Postgres kiểm tra **quyền trước, policy sau** — vai không có quyền bị từ chối ngay, kèm lỗi `permission denied for table ...` trông không giống lỗi RLS chút nào. Mục "Table privileges for staff" ở cuối `db/policies.sql` lo phần này. **Migration thêm bảng mới thì phải thêm `grant` ở đó.**

**Mật khẩu database**: dùng nút "Generate a password" của Supabase, lưu vào trình quản lý mật khẩu. Mật khẩu này **không** dùng trong `.env.local` (ứng dụng dùng API key), nhưng cần khi kết nối trực tiếp bằng `psql` hoặc chuỗi kết nối.

**Region của Vercel phải khớp region của Supabase.** Đây là ràng buộc dễ bỏ sót nhất. Hai lý do:

1. `/api/img` nằm trên đường đi của **từng thumbnail** — album 600 ảnh là 600 request. Điện thoại khách nối thẳng tới Vercel function, nên function đặt xa là mỗi ảnh đắt thêm một vòng.
2. Mỗi route handler còn phải đi tiếp tới Supabase. Function ở Singapore mà database ở Sydney thì cộng thêm ~90 ms cho **mọi** truy vấn, và các endpoint chạy transaction nhiều câu lệnh (`/api/g/submit`) trả giá nhiều lần.

Đặt cả hai ở Singapore: Supabase region `ap-southeast-1`, và Vercel Project Settings → Functions → Region → **Singapore (sin1)**.

**GitHub integration**: bỏ qua ở Phase 0. Tính năng đó kỳ vọng bố cục `supabase/migrations/`, còn repo này dùng `db/`. Xem lại nếu sau này chuyển sang Supabase CLI migrations.

## 1c. Cách chạy SQL lên Supabase — chỉ một đường duy nhất

Agent **không được tự chọn cách khác**. Ba đường dưới đây đã bị loại, có lý do:

| Cách | Vì sao KHÔNG dùng |
|---|---|
| `npx supabase ...` (Supabase CLI) | CLI điều khiển stack Supabase chạy local bằng Docker. Repo này không có `supabase/`, không có `config.toml`, và database nằm trên mây. Lệnh sẽ tải cả CLI về rồi báo lỗi "not a Supabase project". |
| `psql` | Không cài trên máy dev, và không nên bắt mỗi người tự cài Postgres client chỉ để chạy hai file SQL. |
| Dán tay vào SQL Editor | Chạy được nhưng không lặp lại được. Migration về sau cần một lệnh, không cần một người ngồi copy. |

**Đường được chọn: gói `pg` của Node + biến `SUPABASE_DB_URL`.**

- `SUPABASE_DB_URL` lấy ở dashboard → **Connect** → **Connection string** → **URI**, ưu tiên **Session pooler** (chạy được trên mạng chỉ có IPv4). Đặt trong `.env.local`, không commit.
- `pg` cài dưới dạng devDependency: `npm i -D pg`.
- Script chạy qua npm để `.env.local` được nạp: `npm run db:push` (đã kèm `--env-file-if-exists`).

Yêu cầu với `scripts/db-push.mjs`:

1. Đọc `SUPABASE_DB_URL` từ `process.env`. Thiếu thì dừng với thông báo rõ ràng. **Không hard-code, không in giá trị ra log.**
2. Chạy `db/schema.sql` rồi `db/policies.sql`, theo đúng thứ tự đó.
3. Mỗi file chạy trong **một transaction**. Lỗi thì rollback toàn bộ file, không để database ở trạng thái nửa vời.
4. Giữ nguyên chốt chặn từ chối chạy khi URL trỏ tới production.
5. In ra tiến trình dạng người đọc được: đang chạy file nào, bao nhiêu câu lệnh, lỗi ở câu nào.

**Lưu ý cho lần chạy đầu**: cả hai file SQL này chưa từng chạy trên Postgres thật. Gặp lỗi cú pháp hoặc lỗi thứ tự tạo đối tượng là chuyện bình thường — sửa file SQL, ghi rõ đã sửa gì, **không** bỏ qua câu lệnh lỗi và **không** nới lỏng RLS để cho chạy được.

## 2. Biến môi trường

| Biến | Local | Preview | Prod | Ghi chú |
|---|:--:|:--:|:--:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ | Công khai |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ | Công khai |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | ✓ | **Bí mật — server only** |
| `GOOGLE_DRIVE_API_KEY` | ✓ | ✓ | ✓ | **Bí mật.** Prod dùng key riêng, giới hạn IP |
| `APP_SECRET` | ✓ | ✓ | ✓ | **Bí mật.** Mỗi môi trường một giá trị khác nhau |
| `NEXT_PUBLIC_APP_URL` | ✓ | ✓ | ✓ | Dùng để dựng link chia sẻ |
| `CRON_SECRET` | — | — | ✓ | Bảo vệ `/api/cron/**` |
| `UPSTASH_REDIS_*` | tuỳ | ✓ | ✓ | Rate limit; thiếu thì fallback in-memory |
| `LARK_*` | — | — | ✓ | Phase 3 |
| `SENTRY_DSN` | — | ✓ | ✓ | |

**Không có `.env` nào được commit.** `.env.example` chỉ chứa tên biến, không chứa giá trị.

## 3. Quy trình phát hành

```
feat/BB-xxx  ──PR──►  develop  ──PR──►  main
     │                   │                │
  preview            staging          production
  E2E của QA-BOT   nghiệm thu PM    deploy tự động
```

1. Agent mở PR vào `develop`. CI chạy: `lint → typecheck → test → build → e2e`.
2. QA-BOT chạy browser verify trên URL preview, đính ảnh chụp vào PR.
3. ARCH review, Claude review độc lập.
4. Merge `develop` → deploy staging tự động.
5. PM nghiệm thu trên staging theo checklist `docs/10-testing-qa.md §7`.
6. PR `develop` → `main`, merge → deploy production.
7. Gắn tag `v0.x.y`, ghi changelog.

**Quy tắc**: không deploy vào chiều thứ Sáu và không deploy trong giờ studio đang gửi link cho khách (14:00–20:00), trừ hotfix.
 
### 3.1. Thiết lập GitHub Branch Protection (chặn merge khi đỏ)
 
Áp dụng cho cả nhánh `main` và `develop` trên GitHub repo:
1. Vào **Settings** → **Branches** → **Add branch protection rule** (hoặc Rulesets).
2. Nhập Branch name pattern: `main` (làm tương tự cho `develop`).
3. Tích chọn **Require a pull request before merging**.
4. Tích chọn **Require status checks to pass before merging**:
   - Chọn status check: `verify` (tên job trong `.github/workflows/ci.yml`).
   - Tích chọn **Require branches to be up to date before merging**.
5. Tích chọn **Do not allow bypassing the above settings** để đảm bảo quy trình.
 
### 3.2. Hướng dẫn kết nối Vercel & thiết lập môi trường (cho BB-005)
 
1. Đăng nhập Vercel bằng tài khoản studio.
2. **Add New Project** → Import repository `babybean-studio`.
3. Framework Preset: chọn **Next.js**, Root Directory: `./`.
4. Project Settings → **Functions** → **Function Region**: chọn **Singapore (sin1)** (khớp với `vercel.json` và Supabase).
5. Cấu hình biến môi trường (Environment Variables) theo bảng ở §2:
   - Điền các biến `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_DRIVE_API_KEY`, `APP_SECRET`, `NEXT_PUBLIC_APP_URL`.
   - Chọn đúng scope (Production, Preview, Development).
6. Deploy bản đầu tiên để kích hoạt pipeline.


## 4. Migration cơ sở dữ liệu

- `db/schema.sql` là ảnh chụp trạng thái đầy đủ, chỉ dùng khi dựng project mới.
- Mọi thay đổi sau đó nằm trong `db/migrations/NNNN-mo-ta.sql`, **chỉ tiến, không lùi tự động**.
- Thứ tự bắt buộc: chạy migration trên staging → xác nhận → chạy trên production **trước** khi deploy code phụ thuộc.
- Thay đổi phá vỡ (đổi tên cột, xoá cột) phải làm hai bước qua hai lần phát hành: (1) thêm mới + ghi cả hai, (2) bỏ cũ.
- Trước migration production: bật snapshot thủ công trong Supabase.

## 5. Cron (`vercel.json`)

```json
{
  "crons": [
    { "path": "/api/cron/expire-galleries",    "schedule": "0 18 * * *" },
    { "path": "/api/cron/send-reminders",      "schedule": "0 2 * * *"  },
    { "path": "/api/cron/flush-notifications", "schedule": "*/5 * * * *" }
  ]
}
```
Giờ trong `vercel.json` là **UTC**. `0 18 * * *` UTC = 01:00 giờ Việt Nam. `0 2 * * *` UTC = 09:00 giờ Việt Nam.
Mọi handler cron kiểm `Authorization: Bearer <CRON_SECRET>` trước khi làm gì.

## 6. Giám sát

| Thứ cần theo dõi | Công cụ | Ngưỡng cảnh báo |
|---|---|---|
| Lỗi ứng dụng | Sentry | > 10 lỗi/giờ |
| Tỉ lệ 5xx | Vercel Analytics | > 1% trong 15 phút |
| API p95 | Vercel | > 1s trong 15 phút |
| Album kẹt `syncing` | Truy vấn DB hằng ngày | > 30 phút ở `syncing` |
| `notifications` failed | Truy vấn DB hằng ngày | > 5 dòng |
| Lỗi Drive | Log ứng dụng | > 20 lỗi 403/429 trong 1 giờ |
| Dung lượng DB | Supabase | > 80% hạn mức gói |

## 7. Sao lưu & khôi phục

- Supabase: bật **Point-in-time Recovery** (gói Pro), giữ 7 ngày.
- Xuất `pg_dump` hằng tuần sang Google Drive của studio (script `scripts/backup.mjs`).
- **Ảnh không cần backup** — vẫn nằm trên Drive của studio. Nhưng phải dặn studio: **không xoá thư mục Drive của album chưa giao xong.**
- Diễn tập khôi phục: 6 tháng một lần, khôi phục vào project tạm và kiểm tra dữ liệu.

## 8. Tên miền

- Production: `chon-anh.babybean.vn` (CNAME → Vercel).
- Link gửi khách ngắn gọn: `chon-anh.babybean.vn/g/aB3xK9pQ`.
- Bắt buộc HTTPS, HSTS bật sau khi chạy ổn định 1 tháng.

## 9. Quy trình xử lý sự cố

| Mức | Ví dụ | Phản ứng |
|---|---|---|
| **P1** | Khách không mở được album, không chốt được | Rollback ngay về bản trước trên Vercel. Báo 3 chi nhánh. Điều tra sau. |
| **P2** | Đồng bộ Drive lỗi, ảnh không hiển thị | Sửa trong ngày. Hướng dẫn nhân viên tạm gửi link Drive. |
| **P3** | Sai số liệu báo cáo, lỗi giao diện nhỏ | Đưa vào backlog phát hành kế tiếp. |

Rollback: Vercel → Deployments → chọn bản trước → **Promote to Production**. Nếu bản lỗi kèm migration thì phải xử lý DB thủ công — vì vậy migration luôn phải tương thích ngược một phát hành.

## 10. Chi phí ước tính (3 chi nhánh, ~300 album/tháng)

| Dịch vụ | Gói | Chi phí/tháng |
|---|---|---|
| Vercel | Pro | ~20 USD |
| Supabase | Pro | ~25 USD |
| Upstash Redis | Pay-as-you-go | ~0–5 USD |
| Sentry | Developer | 0 USD |
| Google Drive API | Miễn phí trong hạn mức | 0 USD |
| Tên miền | — | ~1 USD |
| **Tổng** | | **~50 USD/tháng** |

Giai đoạn thử nghiệm có thể chạy hoàn toàn trên gói miễn phí của Vercel và Supabase.
