# 09 — Lộ trình

Đơn vị: **tuần agent** (một agent làm liên tục). Với đội Antigravity chạy song song, có thể rút ngắn đáng kể.

---

## Phase 0 — Nền móng (3–4 ngày)

**Mục tiêu**: bộ khung chạy được, deploy được, CI xanh.

| Mã | Việc | Agent |
|---|---|---|
| BB-001 | Khởi tạo Next.js 15 + TS strict + Tailwind v4 | DEV-OPS |
| BB-002 | Cài shadcn/ui, token màu, font Be Vietnam Pro | DEV-UI |
| BB-003 | Tạo project Supabase, chạy `schema.sql` + `policies.sql` | ARCH |
| BB-004 | GitHub Actions: lint + typecheck + test + build | DEV-OPS |
| BB-005 | Deploy Vercel, cấu hình biến môi trường | DEV-OPS |
| BB-006 | `src/types/domain.ts` — sinh type từ schema | ARCH |
| BB-007 | Supabase client (server/admin/browser) | DEV-BE |
| BB-008 | Dữ liệu mẫu: 3 chi nhánh, 4 gói, 5 nhân sự, 10 khách | DEV-BE |

**Điều kiện thoát**: `npm run verify` xanh; trang trắng deploy được lên Vercel; đăng nhập Supabase hoạt động.

---

## Phase 1 — Lõi chọn ảnh (2–3 tuần) ⭐ Phần giá trị nhất

**Mục tiêu**: một album thật chạy từ đầu đến cuối. Đây là bản đem dùng thử tại 1 chi nhánh.

### 1A. Google Drive (4–5 ngày)
| Mã | Việc | Agent |
|---|---|---|
| BB-010 | `parse-link.ts` + test cho 4 dạng link | DEV-INT |
| BB-011 | `driveFetch()` với retry/backoff/timeout | DEV-INT |
| BB-012 | `list-files.ts` — phân trang, đệ quy 2 cấp, natural sort | DEV-INT |
| BB-013 | `POST /api/admin/galleries/preview` | DEV-INT |
| BB-014 | Job đồng bộ + upsert `photos` + xử lý `missing` | DEV-INT |
| BB-015 | Proxy `/api/img/[photoId]` + cache Edge | DEV-INT |

### 1B. Quản trị album tối thiểu (4–5 ngày)
| Mã | Việc | Agent |
|---|---|---|
| BB-020 | Đăng nhập nhân viên + `middleware.ts` | SEC-ARCH |
| BB-021 | Khung layout admin + sidebar | DEV-FE |
| BB-022 | Wizard tạo album 3 bước | DEV-FE |
| BB-023 | `POST /api/admin/galleries` + sinh share link | DEV-BE |
| BB-024 | Danh sách album + bộ lọc | DEV-FE |
| BB-025 | Chi tiết album + nút đồng bộ + tiến trình | DEV-FE |

### 1C. Cổng khách hàng (6–8 ngày)
| Mã | Việc | Agent |
|---|---|---|
| BB-030 | Phiên khách: token → PIN → cookie ký | SEC-ARCH |
| BB-031 | Màn nhập PIN + chống dò | DEV-FE + SEC |
| BB-032 | `GET /api/g/gallery`, `GET /api/g/photos` | DEV-BE |
| BB-033 | `PhotoGrid` virtualize + lazy load + srcset | DEV-FE |
| BB-034 | `Lightbox` vuốt/zoom/phím tắt | DEV-FE |
| BB-035 | `PATCH /api/g/selection` idempotent theo lô | DEV-BE |
| BB-036 | Store chọn ảnh + optimistic + hàng đợi offline | DEV-FE |
| BB-037 | `SelectionBar` + `QuotaMeter` + cảnh báo vượt quota | DEV-FE |
| BB-038 | Ghi chú chỉnh sửa (từng ảnh + chung) | DEV-FE + DEV-BE |
| BB-039 | Màn review + `POST /api/g/submit` (transaction) | DEV-BE + DEV-FE |
| BB-040 | Màn cảm ơn + tóm tắt | DEV-FE |

### 1D. Xuất & khép vòng (2–3 ngày)
| Mã | Việc | Agent |
|---|---|---|
| BB-050 | `GET /api/admin/galleries/:id/export` 4 định dạng | DEV-BE |
| BB-051 | Hộp thoại xuất + copy clipboard | DEV-FE |
| BB-052 | Ghi `activity_logs` cho mọi hành động | DEV-BE |
| BB-053 | Bộ E2E: tạo album → khách chọn → chốt → xuất | QA-BOT |
| BB-054 | Rà soát bảo mật toàn bộ Phase 1 | SEC-ARCH |

**Điều kiện thoát Phase 1**
- Nhân viên tạo album từ link Drive thật (≥ 500 ảnh) trong < 3 phút.
- Khách mở trên iPhone qua 4G, chọn 20 ảnh, ghi chú, chốt — không lỗi.
- Nhân viên xuất danh sách dán được vào Lightroom.
- 14/14 test bảo mật ở `docs/05-rbac.md §6` pass.
- Chạy thử thật tại **1 chi nhánh** trong 1 tuần.

---

## Phase 2 — Vận hành thật cho 3 chi nhánh (2 tuần)

| Mã | Việc | Agent |
|---|---|---|
| BB-060 | Dashboard + thẻ số liệu + danh sách khẩn | DEV-FE |
| BB-061 | Quản lý khách hàng + bé + lịch sử | DEV-FE + DEV-BE |
| BB-062 | Quản lý gói chụp | DEV-FE + DEV-BE |
| BB-063 | Quản lý chi nhánh + nhân sự + mời qua email | DEV-FE + DEV-BE |
| BB-064 | Màn nhật ký hoạt động | DEV-FE |
| BB-065 | Mời người thân cùng chọn (link phụ, vai trò) | DEV-FE + DEV-BE |
| BB-066 | Watermark ở tầng proxy ảnh | DEV-INT |
| BB-067 | Cho tải ảnh preview + ZIP ảnh đã chọn | DEV-BE |
| BB-068 | Cron: hết hạn + nhắc hạn | DEV-BE |
| BB-069 | Song ngữ VI/EN đầy đủ | DEV-UI |
| BB-070 | Chế độ tối + PWA nhẹ + OG image | DEV-FE |
| BB-071 | Tối ưu hiệu năng album 1.500 ảnh | DEV-FE |
| BB-072 | Sentry + trang lỗi thân thiện | DEV-OPS |

**Điều kiện thoát**: cả 3 chi nhánh dùng thật, mỗi chi nhánh ≥ 20 album, không có lỗi chặn nghiệp vụ trong 2 tuần.

---

## Phase 3 — Quản trị studio (3–4 tuần)

| Mã | Nhóm | Việc |
|---|---|---|
| BB-080 | Lark | Bot thông báo 7 sự kiện |
| BB-081 | Lark | Đồng bộ một chiều sang Lark Base |
| BB-082 | Sản xuất | Hàng đợi retouch, gán người, deadline |
| BB-083 | Sản xuất | Duyệt nội bộ trước khi giao |
| BB-084 | Giao hàng | Theo dõi album in / USB / link final |
| BB-085 | Booking | Lịch đặt chụp, phòng, thợ, cọc |
| BB-086 | Booking | Nhắc lịch tự động |
| BB-087 | Báo cáo | Tỉ lệ chốt, thời gian TB, doanh thu ảnh thêm, xuất Excel |
| BB-088 | Cài đặt | Thương hiệu, mẫu tin nhắn, watermark theo chi nhánh |
| BB-089 | Zalo | ZNS gửi link + nhắc hạn |

---

## Phase 4 — Mở rộng (theo nhu cầu)

Nhân sự & chấm công · Hoa hồng theo album · Kho đạo cụ/trang phục · Hoá đơn & thu chi · Nhắc sinh nhật bé & chiến dịch tái chụp · NPS sau giao hàng · Lark SSO + phê duyệt · App di động (nếu cần).

---

## Đường găng

```
BB-003 (Supabase) ─┬─► BB-007 ─► BB-023 ─► BB-032 ─► BB-035 ─► BB-039  ← đường dài nhất
                   └─► BB-020 ─► BB-030 ─┘
BB-010 ─► BB-011 ─► BB-012 ─► BB-014 ─► BB-015 ─► BB-033
```

Ba việc phải làm sớm nhất vì mọi thứ khác phụ thuộc: **BB-003** (database), **BB-006** (types), **BB-011** (drive client).

## Rủi ro

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| URL `lh3` bị Google thay đổi | Ảnh không hiển thị | Đã có nguồn dự phòng + proxy để đổi trong 1 chỗ |
| Album 2.000+ ảnh làm chậm mobile | Khách bỏ giữa chừng | Virtualize + phân trang cursor, test thật trên máy tầm trung |
| Nhân viên quên mở chia sẻ công khai | Album lỗi, khách chờ | Kiểm tra ngay ở bước 1 của wizard + hướng dẫn 3 bước |
| Khách chia sẻ link cho người lạ | Lộ ảnh bé | PIN mặc định bật + thu hồi link + hết hạn |
| Phạm vi phình vì đòi thêm tính năng | Trễ Phase 1 | Phase 1 khoá cứng; mọi đề xuất mới đẩy sang Phase 2 |
