# Backlog — BabyBean Studio Platform

**Cách dùng**: mỗi task có mã, agent sở hữu, phụ thuộc, tiêu chí xong. Agent chỉ nhận task khi mọi phụ thuộc đã `DONE`.
Trạng thái: `TODO` · `DOING` · `REVIEW` · `DONE` · `BLOCKED` (kèm dòng trong `BLOCKERS.md`).

Độ phức tạp: `low` dùng Gemini 3 Flash · `med` Gemini 3 Pro thinking medium · `high` Gemini 3 Pro thinking high hoặc Deep Think.

---

## Phase 0 — Nền móng

### Điều kiện tiên quyết — PM làm, agent không làm thay được

Ba việc này cần tài khoản thật, agent không có quyền truy cập. Làm xong mới giao BB-003.

| # | Việc | Kết quả cần có |
|---|---|---|
| P-1 | Tạo project `bb-dev` (region **ap-southeast-1 Singapore**) | ✅ **XONG** — `bb-staging`, `bb-prod` để sau, xem `docs/11-deployment.md §1b` |
| P-2 | Chép `.env.example` → `.env.local`, điền khoá của `bb-dev` | ✅ **XONG** — đã kiểm: cả hai khoá gọi được Supabase |
| P-3 | Sinh `APP_SECRET`: `openssl rand -base64 32` | ✅ **XONG** |

**Đưa khoá cho agent thế nào**: chỉ đặt trong `.env.local` trên máy. Không dán khoá vào khung chat của agent, không commit. Agent đọc qua `process.env`.

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-001 | Khởi tạo Next.js 15 + TS strict + Tailwind v4, chạy được `npm run dev` | DEV-OPS | — | low | DONE |
| BB-002 | Cài shadcn/ui, `tokens.css` theo `docs/07-ui-ux.md §2`, font Be Vietnam Pro | DEV-UI | BB-001 | low | TODO |
| BB-003 | Áp `schema.sql` + `policies.sql` lên `bb-dev`, hoàn thiện `scripts/db-push.mjs`, xác nhận RLS bật trên 17 bảng và 6 test phủ định ở `db/policies.sql` chạy đúng. **Thêm**: sau khi áp xong, gọi `/rest/v1/galleries` bằng khoá publishable — phải trả 401/403, nếu trả dữ liệu là bảng đang bị lộ ra API công khai | ARCH | P-1..P-3 (xong) | med | DONE |
| BB-004 | GitHub Actions: lint, typecheck, test, build; chặn merge khi đỏ | DEV-OPS | BB-001 | low | DONE |
| BB-005 | Nối Vercel, cấu hình env cho 3 môi trường, deploy trang trắng | DEV-OPS | BB-001 | low | BLOCKED |
| BB-006 | Đối chiếu `src/types/domain.ts` với `schema.sql`, bổ sung type còn thiếu | ARCH | BB-003 | med | DONE |
| BB-007 | Hoàn thiện `lib/supabase/{server,admin,client}.ts` + ESLint rule cấm import `admin.ts` ngoài `api/` và `scripts/` | DEV-BE | BB-003 | med | TODO |
| BB-008 | Hoàn thiện seed. `db/seed.sql` **đã có** chi nhánh, gói, khách, bé, album, settings. **Còn thiếu**: `staff_profiles` + `staff_branches` (phải tạo `auth.users` trước qua Auth admin API), `photos` cho 3 album, và 1 `selection` primary kèm ~18 `selection_items` để `v_gallery_progress` không rỗng. Viết `scripts/db-seed.mjs` làm cả hai bước. **Dữ liệu giả 100%** — `AGENTS.md §6` . **Nghiệm thu: `npm run verify:db:seed` phải xanh 19/19, dán kết quả vào báo cáo** | DEV-BE | BB-003 ✅ | low | ✅ **DONE** — verify:db:seed 19/19, 2 token dev khớp sha256, dữ liệu giả 100% |

**Cổng ra Phase 0**: `npm run verify` xanh · deploy Vercel thành công · đăng nhập Supabase hoạt động.

---

## Phase 1A — Google Drive

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-010 | Test cho `parse-link.ts` (4 dạng link + ID thuần + link file + rác) | DEV-INT | BB-001 | low | TODO |
| BB-011 | Hoàn thiện `driveFetch()`: retry, backoff+jitter, timeout, log không lộ key | DEV-INT | BB-001 | med | TODO |
| BB-012 | `list-files.ts`: phân trang, đệ quy 2 cấp, lọc ảnh, natural sort + test với fixture 1.000 file | DEV-INT | BB-011 | med | TODO |
| BB-013 | `POST /api/admin/galleries/preview` — trả tên thư mục, số file, 6 ảnh mẫu, lỗi 403 kèm hướng dẫn 3 bước | DEV-INT | BB-012 | med | TODO |
| BB-014 | Job đồng bộ: upsert `photos`, đánh dấu `missing`, cập nhật `photo_count`, `status` | DEV-INT | BB-012 | high | TODO |
| BB-015 | Proxy `/api/img/[photoId]`: kiểm quyền, fallback nguồn, cache header | DEV-INT | BB-014, BB-030 | high | TODO |

**Nghiệm thu 1A**: album Drive thật 500+ ảnh đồng bộ < 30s; thư mục chưa mở công khai → thông báo có hướng dẫn, không phải 500.

---

## Phase 1B — Quản trị tối thiểu

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-020 | Đăng nhập nhân viên + `middleware.ts` + `src/lib/auth/staff.ts` (`requireStaff`/`requireRole`/`requireBranch`). Vai trò phải khớp `docs/05-rbac.md §2` — chú ý `photographer` **không** được sửa khách hàng (xem migration 0001) | SEC-ARCH | BB-003 ✅ | high | ✅ **DONE** — 7 test RLS chạy trên db thật, mutation-test xác nhận có tác dụng |
| BB-021 | Layout admin: sidebar, bộ chọn chi nhánh, breadcrumb | DEV-FE | BB-002, BB-020 | low | TODO |
| BB-022 | Wizard tạo album 3 bước (nguồn ảnh → thông tin → luật chọn) | DEV-FE | BB-013, BB-021 | med | TODO |
| BB-023 | `POST /api/admin/galleries`: tạo gallery + share_link, sinh token 22 ký tự, hash PIN | DEV-BE | BB-007, BB-020 | high | TODO |
| BB-024 | Danh sách album: bảng, bộ lọc, tìm kiếm, phân trang cursor | DEV-FE | BB-021, BB-023 | med | TODO |
| BB-025 | Chi tiết album: tab tổng quan, nút đồng bộ, thanh tiến trình | DEV-FE | BB-014, BB-024 | med | TODO |

---

## Phase 1C — Cổng khách hàng ⭐

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-030 | Phiên khách: `POST /api/auth/gallery`, ký cookie, **kiểm `share_links.status` mỗi request** | SEC-ARCH | BB-023 | high | TODO |
| BB-031 | Màn nhập PIN: 4 ô, tự nhảy, khoá sau 5 lần sai, đếm ngược | DEV-FE + SEC-ARCH | BB-030 | med | TODO |
| BB-032 | `GET /api/g/gallery` + `GET /api/g/photos` (cursor, filter, subfolder) | DEV-BE | BB-030, BB-014 | med | TODO |
| BB-033 | `PhotoGrid`: virtualize >200 ảnh, lazy load, srcset, đổi mật độ, skeleton | DEV-FE | BB-032, BB-015 | high | TODO |
| BB-034 | `Lightbox`: vuốt, pinch zoom, phím tắt, preload 3 ảnh | DEV-FE | BB-033 | high | TODO |
| BB-035 | `PATCH /api/g/selection`: idempotent theo `clientOpId`, all-or-nothing khi vượt hạn | DEV-BE | BB-032 | high | TODO |
| BB-036 | Store chọn ảnh (Zustand): optimistic, debounce 400ms, hàng đợi offline + localStorage | DEV-FE | BB-035 | high | TODO |
| BB-037 | `SelectionBar` + `QuotaMeter` + hộp thoại cảnh báo vượt quota | DEV-FE | BB-036 | med | TODO |
| BB-038 | Ghi chú chỉnh sửa: sheet từng ảnh + chip gợi ý + ghi chú chung | DEV-FE + DEV-BE | BB-035 | med | TODO |
| BB-039 | `GET /api/g/review` + `POST /api/g/submit` (transaction, snapshot, khoá album) | DEV-BE | BB-035 | high | TODO |
| BB-040 | Màn review + màn cảm ơn + tải ảnh tóm tắt | DEV-FE | BB-039 | med | TODO |

**Nghiệm thu 1C**: trên iPhone qua 4G, khách mở link → nhập PIN → chọn 20 ảnh → ghi chú 3 ảnh → chốt, không lỗi; tắt mạng giữa chừng vẫn không mất lựa chọn.

---

## Phase 1D — Khép vòng

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-050 | `GET /api/admin/galleries/:id/export` — csv, txt, lightroom, json | DEV-BE | BB-039 | med | TODO |
| BB-051 | Hộp thoại xuất + xem trước + copy clipboard | DEV-FE | BB-050 | low | TODO |
| BB-052 | Rà soát: **mọi** hành động ghi dữ liệu đều có `activity_logs` cùng transaction | DEV-BE | BB-039 | med | TODO |
| BB-053 | E2E E-1…E-12 theo `docs/10-testing-qa.md §5` | QA-BOT | BB-051 | high | TODO |
| BB-054 | Rà soát bảo mật: 14 ca ở `docs/05-rbac.md §6` + grep secret trong bundle | SEC-ARCH | BB-053 | high | TODO |

**Cổng ra Phase 1**: 14/14 test bảo mật pass · E2E xanh trên 3 trình duyệt · 1 chi nhánh dùng thật 1 tuần không lỗi chặn.

---

## Phase 2 — Vận hành 3 chi nhánh

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-060 | Dashboard: thẻ số liệu, danh sách khẩn, biểu đồ 14 ngày | DEV-FE | BB-024 | med | TODO |
| BB-061 | Quản lý khách hàng + bé + lịch sử + chống trùng SĐT | DEV-FE + DEV-BE | BB-024 | med | TODO |
| BB-062 | Quản lý gói chụp | DEV-FE + DEV-BE | BB-024 | low | TODO |
| BB-063 | Quản lý chi nhánh, nhân sự, mời qua email, gán vai trò | DEV-FE + DEV-BE | BB-020 | med | TODO |
| BB-064 | Màn nhật ký hoạt động + bộ lọc | DEV-FE | BB-052 | low | TODO |
| BB-065 | Mời người thân: link phụ, vai trò, hiển thị đề xuất | DEV-FE + DEV-BE | BB-039 | high | TODO |
| BB-066 | Watermark ở tầng proxy ảnh | DEV-INT | BB-015 | high | TODO |
| BB-067 | Tải ảnh preview + ZIP ảnh đã chọn + log lượt tải | DEV-BE | BB-015 | med | TODO |
| BB-068 | Cron: `expire-galleries`, `send-reminders`, `flush-notifications` | DEV-BE | BB-039 | med | TODO |
| BB-069 | i18n VI/EN đầy đủ, rà soát không còn chuỗi hard-code | DEV-UI | BB-040 | low | TODO |
| BB-070 | Chế độ tối + PWA nhẹ + OG image trang chia sẻ | DEV-FE | BB-040 | med | TODO |
| BB-071 | Tối ưu album 1.500 ảnh: bundle ≤180KB, bộ nhớ ≤300MB | DEV-FE | BB-033 | high | TODO |
| BB-072 | Sentry + trang lỗi 404/500 tiếng Việt | DEV-OPS | BB-005 | low | TODO |

---

## Phase 3 — Quản trị studio & Lark

| Mã | Việc | Agent | Phức tạp | TT |
|---|---|---|---|---|
| BB-080 | Bot Lark: 7 sự kiện, message card, webhook theo chi nhánh | DEV-INT | med | TODO |
| BB-081 | Đồng bộ một chiều sang Lark Base (bitable batch upsert) | DEV-INT | high | TODO |
| BB-082 | Hàng đợi retouch: gán người, deadline, trạng thái | DEV-FE + DEV-BE | med | TODO |
| BB-083 | Duyệt nội bộ trước khi giao | DEV-FE + DEV-BE | med | TODO |
| BB-084 | Theo dõi giao hàng: album in, USB, link final | DEV-FE + DEV-BE | med | TODO |
| BB-085 | Module booking: lịch, phòng, thợ, cọc | DEV-FE + DEV-BE | high | TODO |
| BB-086 | Nhắc lịch chụp tự động | DEV-BE | med | TODO |
| BB-087 | Báo cáo: tỉ lệ chốt, thời gian TB, doanh thu ảnh thêm, xuất Excel | DEV-FE + DEV-BE | med | TODO |
| BB-088 | Cài đặt thương hiệu + mẫu tin nhắn + watermark theo chi nhánh | DEV-FE + DEV-BE | med | TODO |
| BB-089 | Zalo ZNS: gửi link, nhắc hạn | DEV-INT | med | TODO |

---

## Quy ước ghi task khi làm

Khi nhận task, agent sửa dòng tương ứng: `TODO` → `DOING` kèm ngày. Khi mở PR: `REVIEW`. Khi merge: `DONE`.
Nếu bị chặn: `BLOCKED` và thêm một dòng vào `tasks/BLOCKERS.md`.

Mẫu mô tả task chi tiết (agent tự sinh trước khi code, đính vào PR):

```
## BB-xxx — <tiêu đề>
Agent: <ARCH|DEV-BE|...>          Phức tạp: <low|med|high>
Phụ thuộc: BB-yyy (DONE)
File được ghi: <danh sách, phải nằm trong vùng sở hữu ở AGENTS.md>
Tài liệu tham chiếu: docs/xx §y

### Việc cần làm
1. …

### Tiêu chí xong
- [ ] …
- [ ] typecheck + lint sạch
- [ ] test đơn vị cho logic mới
- [ ] QA-BOT verify trên browser, có ảnh chụp
- [ ] tài liệu cập nhật nếu có thay đổi hành vi
```
