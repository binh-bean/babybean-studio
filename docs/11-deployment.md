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
| **Region** | **Singapore (ap-southeast-1)** | Gần Việt Nam nhất trong nhóm Asia-Pacific. |

**Hệ quả của việc tắt "Automatically expose new tables"**: `db/policies.sql` phải cấp quyền bảng tường minh cho vai `authenticated`. Postgres kiểm tra **quyền trước, policy sau** — vai không có quyền bị từ chối ngay, kèm lỗi `permission denied for table ...` trông không giống lỗi RLS chút nào. Mục "Table privileges for staff" ở cuối `db/policies.sql` lo phần này. **Migration thêm bảng mới thì phải thêm `grant` ở đó.**

**Mật khẩu database**: dùng nút "Generate a password" của Supabase, lưu vào trình quản lý mật khẩu. Mật khẩu này **không** dùng trong `.env.local` (ứng dụng dùng API key), nhưng cần khi kết nối trực tiếp bằng `psql` hoặc chuỗi kết nối.

**GitHub integration**: bỏ qua ở Phase 0. Tính năng đó kỳ vọng bố cục `supabase/migrations/`, còn repo này dùng `db/`. Xem lại nếu sau này chuyển sang Supabase CLI migrations.

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
