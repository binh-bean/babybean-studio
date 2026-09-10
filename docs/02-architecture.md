# 02 — Kiến trúc hệ thống

## 1. Sơ đồ tổng thể

```
┌───────────────┐        ┌───────────────┐
│  Khách hàng   │        │  Nhân viên    │
│ (điện thoại)  │        │  (desktop)    │
└───────┬───────┘        └───────┬───────┘
        │  /g/<token>            │  /admin
        ▼                        ▼
┌──────────────────────────────────────────────┐
│              Next.js 15 (Vercel)             │
│                                              │
│  middleware.ts ── xác thực + rate limit      │
│                                              │
│  Server Components ── render lưới ảnh        │
│  Route Handlers /api ── ghi dữ liệu          │
│  /api/img ── proxy + cache thumbnail Drive   │
└───────┬───────────────────────┬──────────────┘
        │                       │
        ▼                       ▼
┌────────────────┐     ┌─────────────────────┐
│    Supabase    │     │  Google Drive API   │
│  Postgres+RLS  │     │  (đọc metadata)     │
│  Auth (nhân sự)│     │  lh3 (thumbnail)    │
│  Realtime      │     └─────────────────────┘
│  Storage(brand)│
└────────────────┘
        │
        ▼ (Phase 3)
┌────────────────┐
│  Lark / Zalo   │
│  webhook, ZNS  │
└────────────────┘
```

## 2. Quyết định kiến trúc cốt lõi

### 2.1 Ảnh nằm ở Drive, metadata nằm ở Postgres

Không bao giờ gọi Drive API trong luồng render trang khách. Trình tự:

```
Nhân viên bấm "Đồng bộ"
   → job đọc Drive (phân trang 1000 file/lần)
   → upsert vào bảng photos (drive_file_id là khoá tự nhiên)
   → gallery.status: syncing → ready

Khách mở trang
   → đọc photos từ Postgres (nhanh, có index)
   → <img src="/api/img/{photo_id}?w=600">
   → /api/img kiểm tra quyền, rồi 302/stream từ lh3.googleusercontent.com
   → Cache-Control: private, max-age=86400 + Vercel Edge cache
```

Hệ quả: Drive sập hoặc hết quota → khách vẫn xem được lưới, chỉ ảnh không tải; app không sập.

### 2.2 Khách hàng không có tài khoản

Xác thực bằng **share token + PIN → cookie phiên đã ký**.

```
GET /g/<token>
  → tra share_links theo hash(token)
  → nếu requires_pin và chưa có cookie hợp lệ → màn hình nhập PIN
  → POST /api/auth/gallery  { token, pin }
  → so khớp pin_hash (bcrypt), rate-limit theo IP + token
  → set cookie bb_gs = JWT{ gallery_id, share_link_id, selection_id, role, exp } (HttpOnly, Secure, SameSite=Lax)
```

Mọi API của khách đều đọc cookie này, không tin `gallery_id` do client gửi.

### 2.3 Đa chi nhánh bằng RLS chứ không bằng câu `WHERE` rải rác

Mỗi bảng nghiệp vụ có `branch_id`. RLS của Postgres là hàng rào cuối. Code ứng dụng vẫn lọc, nhưng nếu quên lọc thì DB vẫn chặn. Chi tiết: `db/policies.sql`, `docs/05-rbac.md`.

### 2.4 Hai đường truy cập DB

| Đường | Dùng khi | Khoá |
|---|---|---|
| `createServerClient()` | Thao tác của nhân viên đã đăng nhập | anon key + JWT người dùng → RLS bật |
| `createAdminClient()` | Job đồng bộ, thao tác của khách (đã kiểm quyền ở tầng app) | service role → **bỏ qua RLS** |

`createAdminClient()` chỉ được import trong `src/app/api/**` và `scripts/**`. Có ESLint rule chặn import từ client component.

### 2.5 Ghi lựa chọn — chống race & chống mất dữ liệu

- `selection_items` có UNIQUE `(selection_id, photo_id)` → upsert idempotent.
- Client gửi theo lô (debounce 400ms, tối đa 50 mục/lần) qua `PATCH /api/galleries/:id/selection`.
- Mỗi lô có `client_op_id` (UUID) → server bỏ qua nếu đã xử lý (bảng `selection_ops`), an toàn khi retry.
- Đếm quota tính lại ở **server** khi chốt đơn, không tin số client gửi.
- Chốt đơn dùng transaction + `SELECT ... FOR UPDATE` trên `galleries`.

## 3. Cấu trúc thư mục

```
src/
├── app/
│   ├── (customer)/
│   │   └── g/[token]/
│   │       ├── page.tsx            # lưới ảnh (RSC)
│   │       ├── pin/page.tsx        # nhập PIN
│   │       ├── review/page.tsx     # màn xác nhận trước khi chốt
│   │       ├── done/page.tsx       # cảm ơn
│   │       └── layout.tsx
│   ├── (admin)/
│   │   └── admin/
│   │       ├── page.tsx            # dashboard
│   │       ├── galleries/
│   │       ├── customers/
│   │       ├── packages/
│   │       ├── branches/
│   │       ├── staff/
│   │       ├── reports/
│   │       ├── activity/
│   │       └── settings/
│   ├── api/
│   │   ├── auth/gallery/route.ts
│   │   ├── galleries/route.ts
│   │   ├── galleries/[id]/route.ts
│   │   ├── galleries/[id]/sync/route.ts
│   │   ├── galleries/[id]/selection/route.ts
│   │   ├── galleries/[id]/submit/route.ts
│   │   ├── galleries/[id]/export/route.ts
│   │   ├── img/[photoId]/route.ts
│   │   └── webhooks/lark/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── ui/                         # DEV-UI: thuần trình bày
│   └── features/
│       ├── gallery/                # PhotoGrid, Lightbox, SelectionBar
│       ├── admin/                  # GalleryTable, SyncPanel, ExportDialog
│       └── shared/
├── lib/
│   ├── drive/
│   │   ├── client.ts               # driveFetch + retry/backoff
│   │   ├── parse-link.ts           # link Drive → folderId
│   │   ├── list-files.ts           # phân trang, đệ quy 2 cấp
│   │   └── thumbnail.ts            # dựng URL thumbnail theo kích thước
│   ├── supabase/
│   │   ├── server.ts
│   │   ├── admin.ts
│   │   └── client.ts
│   ├── auth/
│   │   ├── gallery-session.ts      # ký/giải mã cookie khách
│   │   ├── staff.ts                # lấy user + role + branch
│   │   └── rate-limit.ts
│   ├── selection/
│   │   ├── quota.ts                # tính quota, phụ thu
│   │   ├── mutate.ts               # upsert lô, idempotency
│   │   └── submit.ts               # transaction chốt đơn
│   ├── lark/notify.ts
│   └── utils/
├── types/
│   └── domain.ts                   # nguồn sự thật kiểu dữ liệu (ARCH sở hữu)
├── i18n/{vi,en}.ts
└── middleware.ts
```

## 4. Luồng chính

### 4.1 Tạo album

```
Nhân viên dán link Drive
  → POST /api/galleries/preview { driveUrl }
       parse folderId → gọi Drive files.list limit 6 → trả tên thư mục + tổng số file + 6 thumbnail
  → nhân viên điền thông tin, chọn gói
  → POST /api/galleries  → tạo gallery (status=draft) + share_link (token ngẫu nhiên 22 ký tự)
  → POST /api/galleries/:id/sync  → status=syncing → job đọc toàn bộ → status=ready
  → UI hiện link + nội dung tin nhắn mẫu để copy sang Zalo
```

### 4.2 Khách chọn ảnh

```
GET /g/<token>
  → RSC: tra share_link → gallery → photos (phân trang cursor 200/lần)
  → nếu cần PIN và chưa có cookie → redirect /g/<token>/pin
  → render PhotoGrid + SelectionBar
Chạm chọn
  → cập nhật store cục bộ (Zustand) ngay
  → đẩy vào hàng đợi → debounce 400ms → PATCH /api/galleries/:id/selection
  → lỗi mạng: giữ trong hàng đợi + localStorage, thử lại theo backoff
Bấm "Xác nhận"
  → GET /review: server tính lại số ảnh + phụ thu
  → POST /api/galleries/:id/submit
  → transaction: khoá gallery, snapshot danh sách, status=submitted, ghi activity_log
  → gửi Lark webhook (không chặn phản hồi)
  → redirect /done
```

### 4.3 Xuất danh sách cho retoucher

```
GET /api/galleries/:id/export?format=csv|txt|lightroom|pdf
  → kiểm quyền nhân viên + chi nhánh
  → đọc selection_items (đã submit) + retouch_notes
  → format=lightroom trả chuỗi: IMG_0123.jpg, IMG_0187.jpg, ...
  → ghi activity_log (export là hành động nhạy cảm)
```

## 5. Hiệu năng

| Kỹ thuật | Áp dụng ở |
|---|---|
| RSC + streaming | Trang gallery: khung tải trước, ảnh stream sau |
| Cursor pagination 200 ảnh/trang | `photos` |
| `@tanstack/react-virtual` | Lưới > 200 ảnh |
| Thumbnail nhiều kích thước (w=300/600/1200) | `srcset` theo DPR |
| Vercel Edge cache + `stale-while-revalidate` | `/api/img` |
| Index phủ | `(gallery_id, sort_index)` trên `photos` |
| Debounce + batch | Ghi lựa chọn |
| Realtime Supabase | Chỉ ở màn quản trị theo dõi album, không ở trang khách |

## 6. Xử lý lỗi

| Tình huống | Hành vi |
|---|---|
| Drive 403 (thư mục bị đóng chia sẻ) | Album chuyển `sync_error`, cảnh báo trong admin kèm hướng dẫn sửa; khách vẫn xem được ảnh đã cache |
| Drive 429 | Backoff + jitter, tối đa 5 lần; job tự chạy lại |
| Ảnh bị xoá trên Drive | Đánh dấu `photo.status='missing'`, hiện placeholder, **không xoá lựa chọn** |
| Khách mất mạng khi chọn | Hàng đợi cục bộ, chỉ báo "Chưa lưu", tự gửi lại |
| Token không tồn tại | 404 với trang thân thiện, không tiết lộ album có tồn tại hay không |
| Token hết hạn | Trang "Link đã hết hạn" + nút liên hệ chi nhánh |
| Hai người cùng chốt | Transaction + khoá hàng; người thứ hai nhận 409 kèm thông báo |

## 7. Ranh giới mở rộng tương lai

- Bảng `shoots`, `bookings`, `deliveries` đã có sẵn trong schema dù Phase 1 chưa dùng hết → thêm module không cần migrate phá vỡ.
- `settings` dạng JSONB theo chi nhánh → thêm cấu hình không cần đổi schema.
- Lớp `lib/lark/` tách riêng để Phase 3 cắm vào mà không đụng nghiệp vụ.
- Nếu sau này bỏ Drive: chỉ cần thay `lib/drive/` + thêm `photos.storage_provider`; phần còn lại giữ nguyên.
