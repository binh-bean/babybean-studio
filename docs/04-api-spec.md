# 04 — Hợp đồng API

**Đây là hợp đồng chung. Chỉ ARCH được sửa, qua ADR.** DEV-BE implement đúng, DEV-FE gọi đúng.

Base: `/api`. Tất cả body và response là JSON UTF-8.

---

## 1. Xác thực

| Nhóm endpoint | Cách xác thực |
|---|---|
| `/api/auth/gallery`, `/api/g/**` | Cookie `bb_gs` — JWT ký bằng `APP_SECRET`, chứa `{ gallery_id, share_link_id, role, exp }`. HttpOnly, Secure, SameSite=Lax. |
| `/api/admin/**` | Supabase Auth session cookie (nhân viên). |
| `/api/img/**` | Chấp nhận một trong hai loại trên. |
| `/api/cron/**` | Header `Authorization: Bearer <CRON_SECRET>`. |
| `/api/webhooks/**` | Chữ ký của bên gửi (Lark signature). |

**Không bao giờ tin `gallery_id` do client gửi** — luôn lấy từ cookie đã ký.

## 2. Định dạng phản hồi chuẩn

Thành công:
```json
{ "data": { }, "meta": { "cursor": "eyJ...", "hasMore": true } }
```

Lỗi:
```json
{ "error": { "code": "QUOTA_EXCEEDED", "message": "Đã vượt số ảnh tối đa cho phép", "details": { "max": 40, "attempted": 41 } } }
```

**Bảng mã lỗi**

| Code | HTTP | Nghĩa |
|---|---|---|
| `INVALID_INPUT` | 400 | Zod validation thất bại |
| `UNAUTHENTICATED` | 401 | Thiếu/hỏng phiên |
| `PIN_REQUIRED` | 401 | Album cần PIN |
| `PIN_INVALID` | 401 | PIN sai |
| `PIN_LOCKED` | 429 | Sai quá nhiều lần |
| `FORBIDDEN` | 403 | Không đủ quyền |
| `NOT_FOUND` | 404 | Không tồn tại (dùng cả cho token sai — không tiết lộ) |
| `LINK_EXPIRED` | 410 | Link hết hạn hoặc bị thu hồi |
| `GALLERY_LOCKED` | 409 | Album đã chốt, không sửa được |
| `QUOTA_EXCEEDED` | 409 | Vượt `max_selection` |
| `CONFLICT` | 409 | Ghi đồng thời |
| `RATE_LIMITED` | 429 | Vượt giới hạn tần suất |
| `DRIVE_ACCESS_DENIED` | 502 | Thư mục Drive chưa mở công khai |
| `DRIVE_UNAVAILABLE` | 502 | Drive lỗi/hết quota |
| `INTERNAL` | 500 | Lỗi không lường trước (không lộ chi tiết ra client) |

**Không bao giờ** trả message của Postgres, stack trace, hay tên bảng ra client.

---

## 3. API KHÁCH HÀNG

### 3.1 `POST /api/auth/gallery`
Đổi token + PIN lấy cookie phiên.

```jsonc
// Request
{ "token": "aB3xK9pQ7mN2vC5tR8wZ1y", "pin": "4821" }

// 200
{ "data": { "galleryId": "uuid", "role": "owner", "expiresAt": "2026-09-15T…" } }
```

Rate limit: 10 lần / 15 phút / IP; 5 lần sai / 15 phút / share_link (khoá `locked_until`).
Ghi `activity_logs` cho cả thành công và thất bại.

### 3.2 `GET /api/g/gallery`
Thông tin album cho phiên hiện tại.

```jsonc
// 200
{
  "data": {
    "id": "uuid",
    "title": "Bé Bơ 3 tháng tuổi",
    "welcomeMessage": "Cảm ơn ba mẹ đã tin tưởng BabyBean…",
    "status": "in_review",
    "babyName": "Bơ",
    "shootDate": "2026-09-01",
    "branch": { "name": "BabyBean Quận 1", "hotline": "0901…", "zaloOa": "…" },
    "photoCount": 862,
    "includedQuota": 20,
    "extraPhotoPrice": 50000,
    "maxSelection": null,
    "allowExtra": true,
    "dueAt": "2026-09-14T16:59:59Z",
    "options": { "watermark": true, "download": false, "notes": true, "invite": true },
    "subfolders": ["Concept 1 - Áo dài", "Concept 2 - Bóng bay"],
    "coverPhotoId": "uuid",
    "myRole": "owner",
    "selection": {
      "id": "uuid",
      "selectedCount": 18,
      "favoriteCount": 5,
      "extraCount": 0,
      "extraAmount": 0,
      "generalNote": null,
      "submittedAt": null
    }
  }
}
```

### 3.3 `GET /api/g/photos`
Danh sách ảnh, phân trang bằng cursor.

Query: `cursor` · `limit` (mặc định 200, tối đa 500) · `subfolder` · `filter` = `all|selected|unselected|favorite|noted`

```jsonc
// 200
{
  "data": [
    {
      "id": "uuid",
      "fileName": "BB_0123.jpg",
      "width": 4000, "height": 6000,
      "subfolder": "Concept 1 - Áo dài",
      "sortIndex": 122,
      "status": "active",
      "mark": "selected",          // null nếu chưa chọn
      "orderIndex": 7,
      "retouchNote": "Làm sáng da bé",
      "noteTags": ["lam_sang_da"],
      "suggestedBy": ["Bà ngoại"]  // từ các phiên chọn role=suggester
    }
  ],
  "meta": { "cursor": "eyJzIjoxMjJ9", "hasMore": true, "total": 862 }
}
```

### 3.4 `PATCH /api/g/selection`
Ghi lựa chọn theo lô. **Idempotent theo `clientOpId`.**

```jsonc
// Request
{
  "clientOpId": "018f2c1e-…",   // UUID do client sinh, bắt buộc
  "ops": [
    { "photoId": "uuid", "mark": "selected" },
    { "photoId": "uuid", "mark": null },                          // bỏ chọn
    { "photoId": "uuid", "mark": "favorite" },
    { "photoId": "uuid", "retouchNote": "Xoá mụn sữa", "noteTags": ["xoa_mun"] }
  ]
}

// 200
{
  "data": {
    "selectedCount": 21,
    "favoriteCount": 5,
    "extraCount": 1,
    "extraAmount": 50000,
    "applied": 4,
    "rejected": []               // [{ photoId, code }] nếu có mục bị từ chối
  }
}
```

Quy tắc:
- Tối đa **50 ops/request**. Vượt → `INVALID_INPUT`.
- `clientOpId` đã xử lý → trả kết quả hiện tại, `applied: 0`, HTTP 200 (không lỗi).
- Album đã `submitted` → `GALLERY_LOCKED`.
- `role = viewer` → `FORBIDDEN`. `role = suggester` → mọi `mark: "selected"` bị ép thành `"suggested"`.
- Vượt `max_selection` → toàn bộ request bị từ chối với `QUOTA_EXCEEDED` (all-or-nothing).
- Số đếm trả về **luôn tính lại từ DB**, không cộng dồn phía client.

### 3.5 `PATCH /api/g/selection/note`
```jsonc
{ "generalNote": "Ba mẹ muốn tone màu ấm ạ" }   // tối đa 1000 ký tự
```

### 3.6 `GET /api/g/review`
Tóm tắt trước khi chốt, tính lại toàn bộ ở server.

```jsonc
{
  "data": {
    "selectedCount": 24,
    "includedQuota": 20,
    "extraCount": 4,
    "extraPhotoPrice": 50000,
    "extraAmount": 200000,
    "unusedQuota": 0,
    "photos": [ { "id": "uuid", "fileName": "BB_0123.jpg", "retouchNote": "…" } ],
    "generalNote": "…",
    "warnings": ["MISSING_PHOTOS"]   // ví dụ có ảnh đã chọn nhưng biến mất khỏi Drive
  }
}
```

### 3.7 `POST /api/g/submit`
```jsonc
// Request
{ "confirmedByName": "Nguyễn Thị A", "agreed": true }

// 200
{ "data": { "submittedAt": "…", "selectedCount": 24, "extraAmount": 200000, "summaryUrl": "/g/<token>/done" } }
```

- Chỉ `role = owner`.
- Transaction: `SELECT … FOR UPDATE` trên `galleries` → kiểm `status` → ghi snapshot vào `selections` → `galleries.status = 'submitted'` → `activity_logs` → enqueue `notifications`.
- Gọi lần hai → `GALLERY_LOCKED`.

### 3.8 `POST /api/g/invite`
Khách chính tạo link phụ.
```jsonc
// Request
{ "label": "Bà ngoại", "role": "suggester" }
// 200
{ "data": { "url": "https://…/g/xY7…", "role": "suggester", "expiresAt": "…" } }
```
Tối đa 5 link phụ / album. Chỉ khi `gallery.invite_enabled`.

### 3.9 `GET /api/img/[photoId]`
Query: `w` ∈ `{200, 400, 800, 1600}` (giá trị khác → 400) · `v` (cache-busting)

- Kiểm phiên (khách: `photo.gallery_id` phải khớp cookie; nhân viên: theo chi nhánh).
- Stream từ `https://lh3.googleusercontent.com/d/<drive_file_id>=w<size>`.
- Headers: `Cache-Control: private, max-age=86400, stale-while-revalidate=604800`, `Content-Type: image/jpeg`, `X-Content-Type-Options: nosniff`.
- Watermark: nếu bật, chèn ở tầng Edge (Phase 2) hoặc overlay bằng CSS (Phase 1).
- Ảnh `status='missing'` → 404 + placeholder do client xử lý.

---

## 4. API QUẢN TRỊ

Tiền tố `/api/admin`. Mọi endpoint kiểm tra: đã đăng nhập → vai trò → chi nhánh.

### 4.1 Album

| Method | Path | Vai trò | Mô tả |
|---|---|---|---|
| `GET` | `/galleries` | tất cả | Danh sách; query: `branchId`, `status`, `urgency`, `q`, `cursor`, `limit` |
| `POST` | `/galleries/preview` | cs+ | Kiểm tra link Drive trước khi tạo |
| `POST` | `/galleries` | cs+ | Tạo album + share link |
| `GET` | `/galleries/:id` | tất cả | Chi tiết + tiến độ |
| `PATCH` | `/galleries/:id` | cs+ | Sửa cấu hình |
| `POST` | `/galleries/:id/sync` | cs+ | Đồng bộ ảnh từ Drive |
| `GET` | `/galleries/:id/sync/status` | cs+ | Tiến trình đồng bộ |
| `POST` | `/galleries/:id/reopen` | manager+ | Mở lại, **bắt buộc `reason`** |
| `POST` | `/galleries/:id/extend` | cs+ | Gia hạn `dueAt` |
| `GET` | `/galleries/:id/export` | cs+ | `?format=csv\|txt\|lightroom\|json\|pdf` |
| `POST` | `/galleries/:id/share-links` | cs+ | Tạo link |
| `DELETE` | `/share-links/:id` | cs+ | Thu hồi link |
| `POST` | `/galleries/:id/archive` | manager+ | Lưu trữ |

**`POST /galleries/preview`**
```jsonc
// Request
{ "driveUrl": "https://drive.google.com/drive/folders/1a2B3c4D5e?usp=sharing" }

// 200
{
  "data": {
    "folderId": "1a2B3c4D5e",
    "folderName": "2026-09-01 Bé Bơ 3 tháng",
    "fileCount": 862,
    "subfolders": ["Concept 1 - Áo dài", "Concept 2 - Bóng bay"],
    "sample": [ { "driveFileId": "…", "fileName": "BB_0001.jpg", "thumbnailUrl": "…" } ]
  }
}

// 502 nếu thư mục chưa mở công khai
{ "error": { "code": "DRIVE_ACCESS_DENIED",
             "message": "Thư mục chưa được chia sẻ công khai",
             "details": { "howToFix": ["Mở thư mục trên Google Drive",
                                       "Nhấn Chia sẻ",
                                       "Chọn 'Bất kỳ ai có đường liên kết' — quyền Người xem"] } } }
```

**`POST /galleries`**
```jsonc
{
  "branchId": "uuid",
  "customerId": "uuid",           // hoặc "newCustomer": { fullName, phone, zalo }
  "babyId": "uuid",               // hoặc "newBaby": { fullName, birthDate }
  "packageId": "uuid",
  "photographerId": "uuid",
  "shootDate": "2026-09-01",
  "title": "Bé Bơ 3 tháng tuổi",
  "driveUrl": "https://drive.google.com/drive/folders/…",
  "includedQuota": 20,            // mặc định từ package
  "extraPhotoPrice": 50000,
  "maxSelection": null,
  "dueAt": "2026-09-14T16:59:59Z",
  "welcomeMessage": "…",
  "options": { "requirePin": true, "pin": "4821", "watermark": true,
               "download": false, "notes": true, "invite": true }
}
```
→ `201 { data: { galleryId, shareUrl, pinHint: "4 số cuối SĐT" } }`

**`POST /galleries/:id/sync`** → `202 { data: { jobId, status: "syncing" } }`
Đồng bộ chạy nền; hỏi tiến trình qua `/sync/status`:
```jsonc
{ "data": { "status": "syncing", "processed": 400, "total": 862, "added": 400, "missing": 0 } }
```

**`GET /galleries/:id/export`** (BB-067, đã làm) — cần quyền `galleries:export`
và đúng chi nhánh.

- không có `format`, hoặc `format=lightroom` → `text/plain`, mỗi dòng một tên
  file, sắp theo thứ tự ảnh trong thư mục Drive (không theo thứ tự khách bấm —
  thợ chỉnh ảnh đi từ trên xuống trong thư mục).
- `format=csv` → `text/csv`, bốn cột `ten_file,thu_muc_con,ghi_chu_chinh_sua,yeu_thich`,
  kèm ghi chú chung của khách ở cuối.

Chỉ lấy ảnh `mark = 'selected'` trong lượt chọn **chính** (`is_primary`). Ảnh
người thân gợi ý (`suggested`, ở lượt chọn riêng của họ) KHÔNG được xuất — xuất
nhầm là thợ chỉnh ảnh làm thừa và studio tính tiền ảnh khách không chọn.

Ô CSV bắt đầu bằng `=`, `+`, `-` hay `@` được chắn một dấu nháy đơn: ghi chú do
khách viết, và Excel coi những ký tự đó là công thức.

Mọi lần export đều ghi `activity_logs` (`gallery.export`, kèm định dạng và số ảnh).

### 4.2 Khách hàng, gói, chi nhánh, nhân sự

| Method | Path | Vai trò |
|---|---|---|
| `GET` | `/customers` (BB-061, đã làm) | quyền `customers:read` |
| `GET/PATCH` | `/customers/:id` (BB-061, đã làm — kèm bé, lịch sử chụp, hồ sơ trùng SĐT) | đọc: `customers:read`; sửa: `customers:write` |
| `POST` | `/customers/:id/babies` (BB-061, đã làm) | `customers:write` |
| `PATCH/DELETE` | `/customers/:id/babies/:babyId` (BB-061, đã làm) | sửa: `customers:write`; xoá: `customers:delete` |
| `POST` | `/customers` — tạo khách tay, CHƯA làm. Khách hiện đều do đồng bộ Lark sinh ra | `customers:write` |
| `GET/POST/PATCH` | `/packages` | manager+ |
| `GET/POST/PATCH` | `/branches` | admin+ |
| `GET/POST/PATCH` | `/staff` | admin+ |
| `POST` | `/staff/invite` | admin+ |
| `GET/PATCH` | `/settings` | manager+ (theo chi nhánh), admin+ (toàn hệ thống) |

Lịch sử chụp **không có đường riêng** `/customers/:id/history` như bản phác đầu:
nó nằm trong chính `GET /customers/:id`, vì màn hình luôn hiện hồ sơ và lịch sử
cùng lúc — tách ra là hai vòng gọi mạng cho một màn.

Lọc theo chi nhánh áp cho cả ba thứ trong đó: khách, bộ ảnh và hồ sơ trùng số.
Bộ ảnh mang `branch_id` RIÊNG của nó, nên một khách chi nhánh A vẫn có thể có
bộ ảnh ở chi nhánh B — không lọc là rò dữ liệu chi nhánh khác qua đường vòng.

### 4.3 Dashboard, báo cáo, nhật ký

| Method | Path | Mô tả |
|---|---|---|
| `GET` | `/dashboard` | Thẻ số liệu + danh sách cần xử lý |
| `GET` | `/reports/summary` | `?from&to&branchId` — số album, tỉ lệ chốt, thời gian TB |
| `GET` | `/reports/revenue` | Doanh thu ảnh mua thêm |
| `GET` | `/reports/export` | Xuất Excel |
| `GET` | `/activity` | `?branchId&actorId&entityId&from&to&cursor` |

### 4.4 Cron

| Path | Lịch | Việc |
|---|---|---|
| `POST /api/cron/expire-galleries` | 01:00 hằng ngày | Gọi `expire_overdue_galleries()` |
| `POST /api/cron/send-reminders` | 09:00 hằng ngày | Nhắc album còn ≤ 2 ngày |
| `POST /api/cron/flush-notifications` | mỗi 5 phút | Đẩy hàng đợi `notifications` |

---

## 5. Giới hạn tần suất

| Endpoint | Giới hạn |
|---|---|
| `POST /api/auth/gallery` | 10 / 15 phút / IP · 5 lần sai / 15 phút / link |
| `PATCH /api/g/selection` | 60 / phút / phiên |
| `POST /api/g/submit` | 5 / giờ / phiên |
| `GET /api/img/*` | 600 / phút / phiên |
| `/api/admin/*` | 300 / phút / người dùng |
| `POST /api/admin/galleries/:id/sync` | 5 / giờ / album |

## 6. Quy ước cho DEV-BE

1. Mọi handler bắt đầu bằng schema Zod, đặt trong `schema.ts` **cạnh** `route.ts` và export tên `<Name>Schema`. Không export gì ngoài động từ HTTP từ chính `route.ts` — Next.js sẽ fail build.
2. Trình tự bắt buộc: **parse → xác thực → phân quyền → nghiệp vụ → ghi log → trả về**.
3. Không bắt lỗi rồi nuốt im lặng. Lỗi ngoài dự kiến → log kèm `requestId` → trả `INTERNAL`.
4. Mọi hành động thay đổi dữ liệu phải ghi `activity_logs` **trong cùng transaction**.
5. Thao tác đọc dùng `createServerClient()`; thao tác thay mặt khách dùng `createAdminClient()` và **phải** ràng buộc `gallery_id` lấy từ cookie.
6. Trả `Cache-Control: no-store` cho mọi endpoint chứa dữ liệu khách hàng, trừ `/api/img`.

---

## 7. Danh sách Quyền hạn (Permissions)

Dưới đây là danh sách các quyền hạn động (dynamic RBAC) được hệ thống sử dụng. DEV-FE dùng danh sách này để render giao diện phân quyền.

| Mã quyền | Tên hiển thị (Tiếng Việt) |
|---|---|
| `system:dashboard` | Xem Dashboard toàn hệ thống |
| `branch:dashboard` | Xem Dashboard chi nhánh |
| `galleries:read` | Xem danh sách và chi tiết album |
| `galleries:create` | Tạo album mới |
| `galleries:write` | Sửa cấu hình album |
| `galleries:sync` | Đồng bộ ảnh từ Drive |
| `galleries:share` | Gửi và thu hồi link chia sẻ |
| `galleries:reopen` | Mở lại album đã chốt |
| `galleries:delete` | Xóa hoặc lưu trữ album |
| `galleries:export` | Xuất danh sách ảnh |
| `customers:read` | Xem danh sách khách hàng |
| `customers:write` | Thêm và sửa khách hàng |
| `customers:delete` | Xóa khách hàng |
| `packages:read` | Xem danh sách gói chụp |
| `packages:write` | Thêm và sửa gói chụp |
| `packages:delete` | Xóa gói chụp |
| `branches:read` | Xem danh sách chi nhánh |
| `branches:write` | Thêm và sửa chi nhánh |
| `branches:delete` | Xóa chi nhánh |
| `staff:read` | Xem danh sách nhân sự |
| `staff:manage` | Quản lý nhân sự |
| `roles:manage` | Quản lý phân quyền và vai trò |
| `activity_logs:read` | Xem nhật ký hoạt động |
| `reports:operations` | Xem báo cáo vận hành |
| `reports:financial` | Xem báo cáo doanh thu |
| `settings:system` | Cài đặt toàn hệ thống |
| `settings:branch:read` | Xem cài đặt chi nhánh |
| `settings:branch:write` | Sửa cài đặt chi nhánh |
| `settings:branch:delete` | Xóa cài đặt chi nhánh |
| `retouch:read` | Xem hàng đợi retouch |
| `retouch:write` | Cập nhật trạng thái retouch |
| `deliveries:read` | Xem lịch sử giao hàng |
| `deliveries:write` | Cập nhật tiến độ giao hàng |
| `deliveries:delete` | Xóa dữ liệu giao hàng |
