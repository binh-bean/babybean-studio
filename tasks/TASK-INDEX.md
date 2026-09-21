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
| BB-001 | Khởi tạo Next.js 15 + TS strict + Tailwind v4, chạy được `npm run dev` | DEV-OPS | — | low | ✅ DONE |
| BB-002 | Cài shadcn/ui, `tokens.css` theo `docs/07-ui-ux.md §2`, font Be Vietnam Pro | DEV-UI | BB-001 | low | ✅ DONE |
| BB-003 | Áp `schema.sql` + `policies.sql` lên `bb-dev`, hoàn thiện `scripts/db-push.mjs`, xác nhận RLS bật trên 17 bảng và 6 test phủ định ở `db/policies.sql` chạy đúng. **Thêm**: sau khi áp xong, gọi `/rest/v1/galleries` bằng khoá publishable — phải trả 401/403, nếu trả dữ liệu là bảng đang bị lộ ra API công khai | ARCH | P-1..P-3 (xong) | med | DONE |
| BB-004 | GitHub Actions: lint, typecheck, test, build; chặn merge khi đỏ | DEV-OPS | BB-001 | low | DONE |
| BB-005 | Nối Vercel, cấu hình env cho 3 môi trường, deploy trang trắng | DEV-OPS | BB-001 | low | ✅ **DONE** — https://babybean-studio.vercel.app, region sin1, header + bundle đã kiểm |
| BB-006 | Đối chiếu `src/types/domain.ts` với `schema.sql`, bổ sung type còn thiếu | ARCH | BB-003 | med | DONE |
| BB-007 | Hoàn thiện `lib/supabase/{server,admin,client}.ts` + ESLint rule cấm import `admin.ts` ngoài `api/` và `scripts/` | DEV-BE | BB-003 ✅ | med | ✅ **DONE** — hoàn thiện {client,server,admin}.ts (typing, env validation, server-only) + đề xuất rule ESLint deny-by-default cho DEV-OPS |
| BB-008 | Hoàn thiện seed. `db/seed.sql` **đã có** chi nhánh, gói, khách, bé, album, settings. **Còn thiếu**: `staff_profiles` + `staff_branches` (phải tạo `auth.users` trước qua Auth admin API), `photos` cho 3 album, và 1 `selection` primary kèm ~18 `selection_items` để `v_gallery_progress` không rỗng. Viết `scripts/db-seed.mjs` làm cả hai bước. **Dữ liệu giả 100%** — `AGENTS.md §6` . **Nghiệm thu: `npm run verify:db:seed` phải xanh 19/19, dán kết quả vào báo cáo** | DEV-BE | BB-003 ✅ | low | ✅ **DONE** — verify:db:seed 19/19, 2 token dev khớp sha256, dữ liệu giả 100% |

**Cổng ra Phase 0**: `npm run verify` xanh · deploy Vercel thành công · đăng nhập Supabase hoạt động.

---

## Phase 1A — Google Drive

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-010 | Test cho `parse-link.ts` (4 dạng link + ID thuần + link file + rác) | DEV-INT | BB-001 | low | ✅ **DONE** — test parse-link đủ 4 dạng link + ca xấu |
| BB-011 | Hoàn thiện `driveFetch()`: retry, backoff+jitter, timeout, log không lộ key | DEV-INT | BB-001 | med | ✅ **DONE** — driveFetch retry/backoff/timeout, 403-404 không retry |
| BB-012 | `list-files.ts`: phân trang, đệ quy 2 cấp, lọc ảnh, natural sort + test với fixture 1.000 file | DEV-INT | BB-011 | med | ✅ **DONE** — phân trang, đệ quy 2 cấp, natural sort, có fixture |
| BB-013 | `POST /api/admin/galleries/preview` — trả tên thư mục, số file, 6 ảnh mẫu, lỗi 403 kèm hướng dẫn 3 bước | DEV-INT | BB-012 | med | TODO |
| BB-014 | Job đồng bộ: upsert `photos`, đánh dấu `missing`, cập nhật `photo_count`, `status` | DEV-INT | BB-012 | high | TODO |
| BB-015 | Proxy `/api/img/[photoId]`: kiểm quyền, fallback nguồn, cache header | DEV-INT | BB-014, BB-030 | high | DONE |

**Nghiệm thu 1A**: album Drive thật 500+ ảnh đồng bộ < 30s; thư mục chưa mở công khai → thông báo có hướng dẫn, không phải 500.

---

## Phase 1B — Quản trị tối thiểu

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-020 | Đăng nhập nhân viên + `middleware.ts` + `src/lib/auth/staff.ts` (`requireStaff`/`requireRole`/`requireBranch`). Vai trò phải khớp `docs/05-rbac.md §2` — chú ý `photographer` **không** được sửa khách hàng (xem migration 0001) | SEC-ARCH | BB-003 ✅ | high | ✅ **DONE** — 7 test RLS chạy trên db thật, mutation-test xác nhận có tác dụng |
| BB-021 | Layout admin: sidebar, bộ chọn chi nhánh, breadcrumb | DEV-FE | BB-002, BB-020 | low | ✅ **DONE** — layout admin, sidebar thu gọn, bộ chọn chi nhánh |
| BB-022 | Wizard tạo album 3 bước (nguồn ảnh → thông tin → luật chọn) | DEV-FE | BB-013, BB-021 | med | ✅ **DONE** — nối API thật: xem trước Drive và tạo album. Bản trước là giao diện giả, bấm tạo không ghi gì vào database |
| BB-023 | `POST /api/admin/galleries`: tạo gallery + share_link, sinh token 22 ký tự, hash PIN | DEV-BE | BB-007, BB-020 ✅ | high | ✅ **DONE** — POST /api/admin/galleries, token 22 ký tự, hash sha256 |
| BB-024 | Danh sách album: bảng, bộ lọc, tìm kiếm, phân trang cursor | DEV-FE | BB-021, BB-023 | med | ✅ **DONE** — bảng 10 cột cho desktop, thẻ cho mobile, kanban theo trạng thái, lọc thật 6 trường, nối GET /api/admin/galleries |
| BB-025 | Chi tiết album: tab tổng quan, nút đồng bộ, thanh tiến trình | DEV-FE | BB-014, BB-024 | med | TODO |

---

## Phase 1C — Cổng khách hàng ⭐

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-030 | Phiên khách: `POST /api/auth/gallery`, ký cookie, **kiểm `share_links.status` mỗi request** | SEC-ARCH | BB-023 | high | DONE |
| BB-031 | Màn nhập PIN: 4 ô, tự nhảy, khoá sau 5 lần sai, đếm ngược | DEV-FE + SEC-ARCH | BB-030 | med | 🚫 **HUỶ** — chủ studio chốt bỏ PIN, thay bằng BB-098 |
| BB-032 | `GET /api/g/gallery` + `GET /api/g/photos` (cursor, filter, subfolder) | DEV-BE | BB-030, BB-014 | med | ✅ DONE |
| BB-033 | `PhotoGrid`: virtualize >200 ảnh, lazy load, srcset, đổi mật độ, skeleton | DEV-FE | BB-032, BB-015 | high | TODO |
| BB-034 | `Lightbox`: vuốt, pinch zoom, phím tắt, preload 3 ảnh | DEV-FE | BB-033 | high | TODO |
| BB-035 | `PATCH /api/g/selection`: idempotent theo `clientOpId`, all-or-nothing khi vượt hạn | DEV-BE | BB-032 | high | ⚠️ DONE — chờ BB-081 (is_favorite) rồi phải sửa lại phần đếm favorite |
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
| BB-050 | ~~`GET /api/admin/galleries/:id/export` — csv, txt, lightroom, json~~ | DEV-BE | BB-039 | med | 🚫 **HUỶ** 16/09/2026 — thay bằng BB-165 |
| BB-051 | ~~Hộp thoại xuất + xem trước + copy clipboard~~ | DEV-FE | BB-050 | low | 🚫 **HUỶ** 16/09/2026 — thay bằng BB-165 |
| BB-165 | **Copy danh sách ảnh khách chọn.** Nhân viên lọc trên app, bấm một nút, dán thẳng vào trình chọn ảnh ở máy lưu ảnh của chi nhánh. Không sinh tệp, không định dạng riêng cho Lightroom | DEV-FE | BB-039 | low | ⏸ **CHỜ ĐẶT TÊN PHẦN MỀM** — chưa biết trình chọn ảnh ở chi nhánh là gì thì chưa chốt được định dạng chuỗi |
| BB-166 | **Nút "Nhắn cho studio" trên màn khách.** Mở thẳng ứng dụng chat qua deep link. **KHÔNG nhúng mã Facebook** — trang này hiện ảnh trẻ em, và BB-074 đã tự host font chỉ để không gửi IP khách ra ngoài | DEV-FE | — | low | ✅ **XONG 16/09, đã gộp** |
| BB-167 | **Báo CSKH khi khách chốt.** Bot nhắn vào nhóm Lark khi khách chốt chọn ảnh và khi chốt ảnh in. **Không thêm cột nào vào bảng Hậu Kỳ** — chủ studio bác phương án thêm cột, và bác đúng: việc cần làm là BÁO, mà một ô đổi giá trị thì không báo cho ai. Lấp thân `src/lib/lark/notify.ts` (đang ném lỗi, BB-080) | DEV-INT | — | med | ✅ **DONE 21/09** — reviewer tự làm. Phát hiện thêm: `/api/g/submit` đang ghi `notifications` bằng HAI CỘT KHÔNG TỒN TẠI (`gallery_id`, `recipient`) → PGRST204, và `supabase-js` không ném nên mỗi lượt Chốt rơi vào hư không. Đổi thiết kế: **gửi ngay, hàng đợi là sổ cái** (cron 5 phút của docs/08 không tồn tại được trên gói Hobby). Chốt: chỉ nhận miền Lark, không ảnh, che sĐT, không bao giờ ném, và **không bắn tin khi chạy phép thử**. 13 ca |
| BB-168 | **PIN tự sinh từ 4 số cuối điện thoại, hoặc `1234`.** `db/migrations/0002` dòng 107–112: bật PIN mà không gõ mã thì hàm tự lấy `right(phone, 4)`, điện thoại ngắn thì rơi về `'1234'`. Đúng cái cách BB-098 đã bác bỏ, có lý do viết hẳn trong mã. Kèm: `coalesce(p_requires_pin, true)` là mở sẵn, trái nguyên tắc đóng sẵn | SEC-ARCH | — | med | 🚫 **KHÉP VÀO BB-169** — chủ studio chốt bỏ hẳn PIN 16/09, nên lỗ hổng này biến mất theo tính năng thay vì phải vá riêng. Giữ dòng này làm bằng chứng — nếu BB-169 bị hoãn thì nó sống lại |
| BB-169 | **Bỏ hẳn mã PIN khỏi hệ thống.** Chủ studio chốt 16/09/2026 — không phải tắt mặc định, bỏ luôn cả đường bật. Đo 16/09: **0/14 link đang bật PIN** — một lớp phòng vệ không ai bật thì không phải lớp phòng vệ. Chạm 46 tệp, làm **hai chặng**: **(1) DEV-FE + DEV-BE** gỡ màn `/g/[token]/pin`, `pin-form`, `pin-input`, đường `/api/admin/share-links/[id]/pin`, `requirePin`/`pin` trong schema và wizard, chố kiểm PIN ở `/api/auth/gallery`, khoá i18n, kiểu trong `domain.ts`, phép thử. Xong chặng này là **không ai bật PIN được nữa**. **(2) ARCH** migration bỏ `share_links.requires_pin`, `pin_hash`, và nhánh PIN trong `create_gallery_bundle` (0002 dòng 107–112, kèm `coalesce(p_requires_pin, true)`). **Phải đúng thứ tự này** — bỏ cột trước khi gỡ mã là app 500 ngay | ARCH + DEV-BE | — | high | ✅ **XONG 17/09** — cả hai chặng đã gộp, migration 0045 **đã áp lên bb-dev** 17/09. Bốn cột PIN không còn |
| BB-170 | **Kanban nói dối: cột khoe tổng thật nhưng chỉ vẽ thẻ từ 50 bộ mới nhất.** `gallery-list.tsx` dòng 201 đặt `limit=50`; dòng 579 lọc thẻ từ 50 bộ đó; dòng 580 lấy số đếm tổng từ máy chủ. Đo 17/09 trên bb-dev: cột "Sẵn sàng" hiện **357** và **không một thẻ nào**, "Lỗi tải ảnh" hiện **0** trong khi có **76**. Mỗi cột phải tự tải dữ liệu của nó | DEV-FE + DEV-BE | — | med | ✅ **DONE** — brief `docs/briefs/BB-170-kanban-chi-ve-50-bo.md` |
| BB-171 | **Nhân sự: thiếu nút Xoá.** Hiện chỉ có "Cho nghỉ việc" (tắt, giữ lịch sử). Tài khoản tạo nhầm hoặc tài khoản demo cần xoá hẳn. **Phải phân biệt hai việc**: nghỉ việc thì giữ dấu vết trên bộ ảnh cũ (docs/13 §8), xoá hẳn chỉ cho tài khoản **chưa từng làm gì** | DEV-FE + DEV-BE | — | med | ✅ **XONG 18/09, đã gộp** — chỉ `owner` xoá được, không tự xoá mình được, xoá cả tài khoản đăng nhập |
| BB-172 | **Màn Vai trò và quyền.** Tự tạo vai trò, tích chọn chức năng và mức quyền đọc/ghi/sửa/xoá cho từng vai. Hiện vai trò là danh sách cứng trong `docs/05-rbac.md` và luật quyền nằm trong CSDL | ARCH + SEC-ARCH | — | high | ✅ **CHẶNG 1 XONG 18/09** — ADR-0007. Chốt `owner` bất biến, chặn ở cả CSDL lẫn API. **CHẶNG 2a — phần ARCH XONG 21/09, đã gộp**: `0052` bảng `roles` + 9 vai hệ thống + 34 tên quyền ghi ở `docs/04-api-spec.md §7`. Reviewer vá ba chỗ trước khi gộp: (1) tệp đánh số `0051` trùng với BB-196, đổi thành `0052`; (2) `delete from roles where is_system` khiến lần chạy thứ hai vấp khoá ngoại — bb-prod áp lại cả dãy mỗi lượt nên sẽ gãy, đổi sang `on conflict do update`, áp thật hai lượt lên bb-dev đều xong; (3) thiếu `grant` nên sau `0050` không vai nào đọc được bảng. **Phần bảo mật XONG 21/09** (Claude làm, agent hết token): `0053` — `app.has_permission()` đọc bảng `roles`; `is_superuser`, `can_write`, `can_manage_customers` nay hỏi qua nó; trigger giữ `role_id` khớp `role`; trigger chặn sửa/xoá vai hệ thống (trừ vai `postgres`, tức migration); policy cho `authenticated` đọc `roles`. Lớp chặn chi nhánh giữ nguyên từng chữ — cố ý. **Kiểm ngược bắt được một lỗ thật trong bản đầu**: trigger chỉ điền `role_id` lúc rỗng, nên `PATCH /api/admin/staff` đổi `role` mà quyền vẫn theo vai CŨ — Ca 13 đỏ 'expected 1 to be 0', kế toán nhìn thấy ảnh. Kiểm ngược 2: gỡ `customers:write` khỏi vai `cs` → ca 'cs sửa được khách' ĐỎ, phục hồi → xanh. **CHẶNG 2b XONG 21/09** (Claude làm): `GET/POST /api/admin/roles`, `PATCH/DELETE /api/admin/roles/:id`, màn `/admin/roles` với ô tích theo nhóm. Vai hệ thống chỉ đọc; vai đang có người giữ không xoá được. **`0055` vá một lỗ do chính `0053` tạo ra**: trigger chặn vai hệ thống khai `security definer` nên `current_user` luôn là chủ hàm — trigger chưa từng chặn lượt nào, và `update roles set permissions='{}' where name='owner'` bằng khoá quản trị chạy lọt. Kiểm ngược: trả lại lỗi → ca đó ĐỎ. **CHẶNG 2c — lớp CSDL XONG 21/09**: `0056` đổi 13 chỗ so tên vai (`photoshop_ctv`, `accountant`, `branch_manager`) sang hỏi quyền, thêm `photos:read`, `selections:read`, `galleries:all_in_branch`. `0057` tách `for all` thành insert/update/delete cho 5 bảng — **kiểm ngược đo được**: gỡ `photos:read` khỏi vai cs thì `has_permission` trả false mà `select count(*) from photos` vẫn ra **66.190 dòng**, vì chính sách `for all` góp điều kiện vào cả lượt ĐỌC. Sau `0057`: **0 dòng**, và bài kiểm tương ứng ĐỎ khi gỡ quyền. Lớp RLS nay không đọc tên vai ở đâu nữa. **Còn lại (2d)**: gán vai tự tạo cho nhân sự — `requireRole` ở tầng API vẫn đọc enum `staff_profiles.role` |
| BB-173 | **Lịch sử thao tác và phiên đăng nhập của từng nhân sự.** Bảng `activity_logs` đã có sẵn 6.420 dòng nhưng **chưa màn nào đọc**. Gộp BB-064 | DEV-FE | — | med | ✅ **DONE 21/09, đã gộp** — màn mới lấy chi nhánh từ phiên rồi mới giao với tham số địa chỉ; `photoshop_ctv` bị chặn; `db:cleanup` dọn cả nhật ký mồ côi. Kiểm ngược: bỏ lớp lọc chi nhánh → ca 'CSKH Pasteur không đọc được Tân Bình' ĐỎ (`expected 200 to be 403`). `activity_logs` trên bb-dev từ 9.823 còn 720 dòng, nhưng **389 dòng (54%) vẫn mồ côi** — dọn là một lượt quét, chưa phải một cái chốt |
| BB-174 | **Bộ chọn chi nhánh và nút tài khoản góc phải không làm gì cả.** Bấm vào không phản ứng trên cả màn Nhân sự lẫn Quản lý bộ ảnh | DEV-FE | - | med | ✅ **XONG 18/09, đã gộp** — cổng 2 |
| BB-175 | **Thanh tìm kiếm bị che và dính sai.** Khi cuộn thì bộ lọc đè lên nội dung và chừa một khoảng trống phía trên | DEV-UI | - | low | ✅ **XONG 18/09, đã gộp** |
| BB-176 | **Thẻ bộ ảnh phải bấm được cả thẻ**, không chỉ dòng mã hợp đồng. Chỗ nào bấm được thì con trỏ phải thành bàn tay và có phản hồi khi rê chuột | DEV-UI | - | low | ✅ **XONG 18/09, đã gộp** |
| BB-177 | **Màn chi tiết phải luôn hiện link app và tình trạng link**, giống khối "Thư mục ảnh gốc". Hiện chỉ có một dòng chữ và một nút bị khoá | DEV-FE | — | low | ✅ **XONG 18/09, đã gộp** — cổng 3 |
| BB-178 | **Địa chỉ màn quản trị đang là UUID.** Chuỗi `f2c8878a-02ba-…` không đọc được. Thay bằng **mã hợp đồng** (`HD_20260824#4884`). **KHÔNG dùng mã khách hàng** — mã đó gồm tên và số điện thoại, đặt vào địa chỉ là lộ ra lịch sử trình duyệt và log máy chủ. Chỉ đổi màn QUẢN TRỊ, tuyệt đối không đổi link khách | DEV-FE | — | med | ✅ **XONG 18/09, đã gộp** — UUID cũ vẫn mở được, mã hợp đồng cũng mở được |
| BB-179 | **Lark đẩy thẳng sang app, thôi chờ đến giờ.** Chủ studio xác nhận 17/09: bản Lark của studio **có** hành động "Yêu cầu HTTP" trong Tự động hoá. Dựng `POST /api/lark/hook` nhận một mã bản ghi rồi gọi `syncSingleRetouchRecord` (đã có sẵn, `sync-retouch.ts:386`). Dùng lại khoá của BB-152. **Giữ nguyên đường kéo định kỳ làm lưới đỡ** | DEV-INT | BB-152 | med | ✅ **XONG 17/09, đã gộp** — brief `docs/briefs/BB-179-lark-day-thang-sang-app.md` |
| BB-180 | **Màn khách: năm việc chủ studio đặt.** Nút chọn/tải lên góc trên phải; ghi chú chỉnh sửa ngay trong màn xem lớn; luôn thấy đã chọn trên hạn mức; nhắc chọn ảnh phóng và bìa album trước khi chốt (**nhắc chứ không chặn**); nhóm ảnh theo thư mục và thêm thông tin studio. Bốn trong năm là nối tiếp thứ đã có | DEV-FE | BB-170 | med | ✅ **XONG 17/09, đã gộp đủ 5/5** — reviewer tự làm. Phần hiển thị 2 tháng chờ BB-183 |
| BB-181 | **Trang gốc thôi trả 404.** Giới thiệu ngắn, ba chi nhánh, nút nhắn cho studio, nút nhân viên đăng nhập, cộng trang lỗi 404/500 tiếng Việt (gộp BB-072). Chủ studio chốt **không làm** ba nhân vật (để sang `babybeanstudio.vn`) và **bỏ** phần khách tra bộ ảnh — nhưng bố cục phải chừa sẵn chỗ | DEV-UI | - | med | ✅ **XONG 17/09, đã gộp** |
| BB-182 | **Đường Lark đẩy: chậm, và có thể đánh rơi thay đổi trong im lặng.** Hai chuyện rời nhau, cùng một đường. **(a) Chậm 2–8 giây mỗi lượt** vì `readLarkRecord` liệt kê TOÀN BỘ bảng trước rồi mới đọc bản ghi — hai lượt gọi Lark cho một việc. Nhớ lại `table_id` sau lần đầu. **(b) Lúc bận trả 200 kèm `skipped`** (route dòng 57). Lark thấy 200 là coi như xong và **không gọi lại** — nhân viên sửa hai dòng sát nhau thì dòng thứ hai rơi mất, không ai biết. Cần xếp hàng lại thay vì bỏ qua | DEV-INT | BB-179 | med | ✅ **XONG 18/09, đã gộp** — cổng 4. Bản ghi bị xếp hàng được rút ra xử ở lượt sau |
| BB-183 | **Link phải thực sự hết hạn sau 2 tháng.** Chủ studio chốt 17/09 (`docs/13 §11`): hai tháng kể từ ngày cấp link. Đo cùng ngày: **0/15 link có `expires_at`**, **0 bộ ảnh có `due_at`**, và chưa có đường tự hết hạn — mọi link đang sống vĩnh viễn. Cần: đặt `expires_at` lúc cấp link, một đường chạy định kỳ đổi trạng thái link quá hạn, và chỗ chứa con số trong `settings` để đổi chính sách không phải dựng lại bản web. Gộp BB-068 | DEV-BE + DEV-OPS | — | med | ✅ **XONG 17/09, đã gộp** — cổng 1 |
| BB-184 | **Link gửi khách treo sang bộ ảnh khác.** `linkMoi` là trạng thái trong `GalleryDetail`; điều hướng từ bộ A sang bộ B giữ nguyên component và chỉ đổi prop, nên khung "Link gửi khách" treo link nhà A dưới tiêu đề nhà B, kèm dòng "gửi thẳng cho khách". **Gửi đi là nhà B mở được ảnh con nhà A.** Vá hai lớp: `key={id}` ở chỗ gọi, và effect xoá ba trạng thái khi đổi `galleryId` | DEV-FE | — | high | ✅ **XONG 17/09** — chủ studio báo, reviewer vá ngay |
| BB-185 | **App chưa bao giờ có nút Đăng xuất.** Quét cả dự án 18/09: không đường nào. Studio dùng máy chung — nhân viên đăng nhập xong không thoát ra được, người sau ngồi vào là thừa phiên. BB-174 ẩn nút tài khoản nên cũng ẩn luôn chỗ tự nhiên để đặt nó | DEV-FE | — | low | ✅ **DONE** — `POST /api/auth/logout` (`scope: local`, xoá luôn cookie phiên khách `bb_gs`, chạy được cả khi phiên đã hỏng); góc phải hiện TÊN + vai trò người đang đăng nhập. 3 ca đơn vị + 1 ca e2e trong trình duyệt thật |
| BB-186 | **Link hết hạn trong im lặng — không ai biết.** BB-183 làm link hết hạn thật, nhưng: **(a)** không ai được báo khi link hết hạn; **(b)** màn chi tiết **không hiện hạn dùng hay trạng thái link** — đường API chỉ trả `shareLink: { id }`, không có `expires_at`, không có `status`. CSKH chỉ biết khi khách gọi đến. Cần: trả thêm hai trường đó, hiện lên màn, và một chỗ liệt kê link sắp hết hạn | DEV-FE + DEV-BE | BB-183 | med | ✅ **DONE** — **(b)** xong ở BB-188 (màn chi tiết hiện tình trạng/hạn/số lượt mở). **(c)** màn `/admin/reports/link-sap-het-han` + mục menu: link đã chết và sắp chết, số điện thoại bấm được, lọc theo chi nhánh, không rò mã link. **(a)** gốc của "im lặng": `/api/cron/expire-galleries` **chưa bao giờ chạy được** — chỉ có POST (Vercel gọi GET → 405) và kiểm sai tên khoá (→ 401); `send-reminders` trong `vercel.json` trỏ vào route KHÔNG TỒN TẠI. Đã vá cả ba. Bắn tin CSKH vẫn thuộc BB-167. 7 ca đơn vị + 1 ca e2e |
| BB-052 | Rà soát: **mọi** hành động ghi dữ liệu đều có `activity_logs` cùng transaction | DEV-BE | BB-039 | med | TODO |
| BB-053 | E2E E-1…E-12 theo `docs/10-testing-qa.md §5` | QA-BOT | BB-165 | high | TODO |
| BB-054 | Rà soát bảo mật: 14 ca ở `docs/05-rbac.md §6` + grep secret trong bundle | SEC-ARCH | BB-053 | high | TODO |

**Cổng ra Phase 1**: 14/14 test bảo mật pass · E2E xanh trên 3 trình duyệt · 1 chi nhánh dùng thật 1 tuần không lỗi chặn.

---

## Phase 2 — Vận hành 3 chi nhánh

| Mã | Việc | Agent | Phụ thuộc | Phức tạp | TT |
|---|---|---|---|---|---|
| BB-060 | Dashboard: thẻ số liệu, danh sách khẩn, biểu đồ 14 ngày | DEV-FE | BB-024 ✅ | med | ✅ **DONE 21/09, đã gộp** — Claude tiếp quản khi agent hết token. Vá **8 truy vấn bỏ qua `error`**: hỏng một câu thì bảng hiện SỐ 0 trông như thật. Ca canh mới; kiểm ngược bỏ cả ba chốt → ĐỎ `expected 200 to be 500` |
| BB-061 | Quản lý khách hàng + bé + lịch sử + chống trùng SĐT | DEV-FE + DEV-BE | BB-024 | med | TODO |
| BB-062 | Quản lý gói chụp | DEV-FE + DEV-BE | BB-024 | low | TODO |
| BB-063 | Quản lý chi nhánh + nhân sự: chủ studio tạo tài khoản/mật khẩu, gán vai trò và chi nhánh, bật/tắt hoạt động. Đăng nhập bằng tên tài khoản. Xem docs/13 §8 | DEV-FE + DEV-BE | BB-020 | **high** | ✅ **DONE** — nhân sự: tạo/sửa/tắt, gán vai trò + chi nhánh, đặt lại mật khẩu, đăng nhập bằng tên tài khoản. Chi nhánh: thêm/sửa/đóng, địa chỉ và hotline nhập trong app |
| BB-064 | Màn nhật ký hoạt động + bộ lọc | DEV-FE | BB-052 | low | TODO |
| BB-065 | Mời người thân: link phụ, vai trò, hiển thị đề xuất | DEV-FE + DEV-BE | BB-039 | high | TODO |
| BB-066 | Watermark ở tầng proxy ảnh | DEV-INT | BB-015 | high | 🚫 **HUỶ** — chủ studio chốt không đóng dấu mờ, khách nhận ảnh chất lượng cao |
| BB-067 | Tải ảnh preview + ZIP ảnh đã chọn + log lượt tải | DEV-BE | BB-015 | med | TODO |
| BB-068 | Cron: `expire-galleries`, `send-reminders`, `flush-notifications` | DEV-BE | BB-039 | med | TODO |
| BB-069 | i18n VI/EN đầy đủ, rà soát không còn chuỗi hard-code | DEV-UI | BB-040 | low | ✅ **DONE** — i18n VI/EN đầy đủ, hết chuỗi hard-code |
| BB-070 | Chế độ tối + PWA nhẹ + OG image trang chia sẻ | DEV-UI | BB-040 | med | ✅ **DONE** — manifest.ts + OG metadata đã nối vào RootLayout, dark mode 26 component, PWA prompt |
| BB-071 | Tối ưu album **400 ảnh** (đo thật, không phải 1.500): bundle ≤180KB | DEV-FE | BB-033 | high | TODO |
| BB-072 | Sentry + trang lỗi 404/500 tiếng Việt | DEV-OPS | BB-005 | low | TODO |
| BB-073 | Migration `0003`: accountant không xem được ảnh — đồng bộ `policies.sql` sang `db/migrations/` | ARCH | BB-020 | low | TODO |
| BB-074 | Font thương hiệu không nạp trên production | DEV-UI | BB-040 | high | ✅ **DONE** — tự host Be Vietnam Pro bằng next/font, không còn gửi IP khách sang Google |
| BB-075 | `middleware.ts` `return` redirect trước khi gắn header an ninh — `/admin` ra ngoài không CSP, không `Referrer-Policy` | SEC-ARCH | BB-020 | med | TODO |
| BB-076 | Seed hỏng: `dev_token_with_pin_123` có `requires_pin=true` mà `pin_hash` NULL; link 2 không có `selections`; thiếu link revoked/expired/locked để test | DEV-BE | BB-008 | med | TODO |
| BB-077 | Tài liệu mâu thuẫn code: `02-architecture.md` §2.2 thiếu `selection_id` trong cookie; `05-rbac.md` §5 hứa "đổi PIN thu hồi phiên" mà schema không làm được | ARCH | BB-030 | med | DONE |
| BB-078 | Một cookie `bb_gs` cho mọi album: khách quay lại lần 2 mở album mới sẽ bị đăng xuất khỏi album cũ | SEC-ARCH + DEV-BE | BB-030 | med | HOÃN — quyết định sau Phase 1 |
| BB-079 | Bỏ tên miền bịa `https://chon-anh.babybean.vn` làm giá trị dự phòng trong `api/admin/galleries/route.ts:139` — thiếu `NEXT_PUBLIC_APP_URL` phải báo lỗi, không được đoán | DEV-BE | BB-023 | high | TODO |
| BB-080b | Gắn tên miền `babybeanstudio.vn`: đổi `NEXT_PUBLIC_APP_URL`, cập nhật `verify-prod.mjs`, kiểm HTTPS và link chia sẻ | DEV-OPS | BB-079 | med | ĐANG CHỜ DNS |
| BB-081 | **CHẶN BB-035/BB-033.** `selection_items.mark` là một cột loại trừ nên "Yêu thích" xoá mất "Đã chọn", trong khi `07-ui-ux.md:127` là hai nút riêng. Thêm `is_favorite boolean` + migration | ARCH | BB-006 | high | TODO |
| BB-082 | **NGHIÊM TRỌNG.** 4 hàm `security definer` trong schema `public` cho `anon` gọi: chỉ cần khoá công khai + UUID album là đọc/ghi được mọi album, bỏ qua token, PIN, cookie và RLS. Đã chứng minh HTTP 200 | SEC-ARCH | BB-023 | high | DONE |
| BB-096 | `branch-selector.tsx` dùng `mockBranches` cứng — bộ chọn chi nhánh trên thanh tiêu đề không nối vào đâu | DEV-FE | BB-063 | med | ✅ **DONE** — nối GET /api/admin/branches thật, lưu chọn chi nhánh, chỉ hiện khi phụ trách >1 chi nhánh |
| BB-097 | Bóc tên mẹ và tên bé từ tên thư mục Drive: ngoài ngoặc là mẹ, trong ngoặc là bé, không ngoặc thì tất cả là tên mẹ. Gợi ý cho CSKH sửa, không tự lưu | DEV-INT + DEV-FE | BB-013 | med | ✅ **DONE** (DEV-INT) — `parseFolderName` tại `src/lib/drive/parse-folder-name.ts`, lệnh `npm run suggest:names`, 8 unit tests |
| BB-098 | PIN tuỳ chọn từng link, mặc định TẮT, mã ngẫu nhiên 4 số | PM (thay SEC-ARCH hết token) | BB-030 | med | ✅ **DONE** — trả mã đúng một lần, bật lại xoá bộ đếm cũ |
| BB-099 | Gán người theo từng album: photographer, CSKH, người photoshop. Thêm vai `photoshop_ctv` quyền hẹp hơn | ARCH + DEV-BE | BB-063 | high | TODO |
| BB-100 | Danh mục sản phẩm + dòng hàng hợp đồng theo cấu trúc Lark thật (3 tầng). Hạn mức ảnh là dòng `Edit file`, không phải cột | PM | BB-063 | high | ✅ **DONE** — `0014`, 130/132 sản phẩm đã đồng bộ, `app.gallery_quota()` |
| BB-101 | Khách mua thêm ngay trên app: `selection_addons` + bảng nối `selection_placements` | ARCH | BB-100 | high | ✅ **DONE** — `0015`, ADR-0003 |
| BB-102 | API trả thành phần hợp đồng hai tầng cho một album, hạn mức lấy từ `app.gallery_quota()` chứ không từ cột | DEV-BE | BB-100 | med | ✅ **DONE** — `app.gallery_quota` ưu tiên `gallery_items`; cây 2 tầng tại `GET /api/g/gallery` và `GET /api/admin/galleries/[id]/items`; chặn chọn khi quota chưa biết; 5/5 unit test |
| BB-103 | CSKH sửa dòng hàng, xác nhận chốt đơn, bật/tắt PIN — API và màn hình | PM | BB-100 | med | ✅ **DONE** |
| BB-104 | Dải tiến trình 6 bước cho khách, ưu tiên điện thoại | DEV-UI | BB-100 | med | ✅ **DONE** — PM sửa chỗ coi hạn mức 0 là chưa biết |
| BB-105 | API mua thêm: POST /api/g/addons, chốt giá từ `products.list_price` theo ngưỡng tin cậy | DEV-BE | BB-101 | med | ✅ **DONE** |
| BB-106 | Báo cáo thất thoát: view album đã giao vượt hạn mức mà chưa lập hóa đơn | ARCH | BB-102 | high | ✅ **DONE** — `0020`, PM sửa đếm trùng ảnh và một chỗ fail-open |
| BB-107 | Component chọn mua thêm và khối thành phần hợp đồng hai tầng | DEV-UI | BB-102 | med | TODO |
| BB-108 | **Gỡ công tắc watermark khỏi giao diện.** Nó chạy đủ một vòng nhưng không component nào vẽ watermark — CSKH bật, hệ thống báo đã bật, ảnh vẫn ra sạch. Hứa suông về một thứ bảo vệ không tồn tại | DEV-FE | — | med | ⚠️ **GỘP, CÒN NỢ MỘT VIỆC** — wizard đúng; reviewer vá thêm nhãn `allowDownload`/`pinRequired` nói sai, mặc định cũ trong `schema.ts`, khoá i18n chết và `watermarkEnabled`. **Còn nợ**: phép thử hiện đọc mã nguồn bằng `fs` rồi khớp regex — phải dựng component và kiểm payload thật |
| BB-109 | Đồng bộ nội dung hợp đồng Lark xuống `gallery_items`: hai tầng, tiền thật, khớp sản phẩm theo mã bản ghi | PM | BB-100 | high | ✅ **DONE** — `sync:contracts`, `0023` thêm `line_total` |
| BB-110 | Ô nhập **mã hợp đồng Lark** khi tạo và khi sửa album — mắt xích cuối để `sync:contracts` chạy được | DEV-FE | BB-109 | med | TODO |
| BB-111 | Đồng bộ bảng **Hậu Kỳ** xuống app, che tên và số điện thoại | PM (thay DEV-INT hết token) | BB-109 | high | ✅ **DONE** — `sync:hauky`, `0027` neo theo bản ghi hậu kỳ, 431 album thật |
| BB-112 | **Thả tim = chọn ảnh** (`mark=selected`, KHÔNG phải `is_favorite`) + bốn con số hạn mức hiện ngay | DEV-FE | BB-102 | high | TODO |
| BB-113 | Khách đặt ảnh vào sản phẩm in: chỉ hiện ô chọn cho sản phẩm hợp đồng THẬT SỰ có | DEV-FE + DEV-BE | BB-101 | high | ⏳ **TIẾN ĐỘ** — DEV-BE đã xong API `POST/DELETE /api/g/placements`, mở rộng `GET /api/g/gallery` trả placements |
| BB-114 | Chốt đơn, báo studio qua Zalo hoặc link chat, CSKH xác nhận rồi chuyển giai đoạn | DEV-BE + DEV-INT | BB-112 | high | ✅ **DONE** — `POST /api/g/submit`, `POST /api/admin/galleries/[id]/confirm`, snapshot con số, thông báo studio |
| BB-115 | Ghi nhận thanh toán phát sinh và gắn vào lần xác nhận của CSKH | ARCH + DEV-BE | BB-114 | med | ✅ **DONE** — `0024` `gallery_payments`, chỉ ghi thêm không sửa đè |
| BB-116 | Đẩy 447 bộ hậu kỳ chưa qua khâu in lên để test | PM | BB-111 | med | ✅ **DONE** — 431/447 vào, 16 bộ trùng thư mục Drive |
| BB-117 | Bỏ NOT NULL và DEFAULT của included_quota, get_admin_galleries hỗ trợ hạn mức null ('N/?', extraCount null) | ARCH | BB-102 | med | ✅ **DONE** — migration `0030`, schema.sql, domain.ts, get_admin_galleries |
| BB-118 | Component đặt ảnh vào sản phẩm in, kèm nối vào màn khách | PM (thay DEV-UI hết token) | BB-113 | med | ✅ **DONE** |
| BB-120 | Màn quản trị mở báo cáo thất thoát: API lọc chi nhánh, trang, mục menu | PM | BB-106 | high | ✅ **DONE** — `0031`, 5 test kèm đối chứng cách ly chi nhánh |
| BB-121 | Vòng duyệt ảnh đã chỉnh: CSKH gửi file, khách duyệt hoặc đòi sửa, lặp lại | PM | BB-114 | high | ✅ **DONE** — `0032`-`0034`, 9 test |
| BB-132 | Ghi link app ngược về cột "Link app" bên Lark Bitable (PUT .../records/{id}) khi tạo share-link, có cờ chạy thử `--that`, fail-safe khi Lark lỗi | DEV-INT | BB-127 | med | ⏳ **DOING** — `src/lib/lark/ghi-link-app.ts`, route share-link, màn CSKH, script `npm run lark:ghi-link`, 21 test. **BLOCKED**: bảng Hậu Kỳ bên Lark chưa có cột "Link app" (xem `tasks/BLOCKERS.md`), nên chưa ghi thật được lần nào |
| BB-136 | Hết chập chờn khi nhiều người chạy phép thử cùng lúc: nhãn runId ngẫu nhiên, dọn đúng nhãn mình, dọn rác cũ > 1 giờ | QA-BOT | BB-030 | med | ✅ **DONE** — đã cô lập gallery-auth và cong-khach-nhieu-buoi-chup, 2 tiến trình npm test chạy song song cùng xanh 40/40 |
| BB-143 | Ba mẹ mở ảnh lớn ra xem, vuốt qua lại, xoay theo thiết bị, thả tim ngay trong màn xem lớn | DEV-FE | BB-131 | med | ✅ **DONE** — PhotoLightbox, cỡ ảnh w=1600, sliding window 3 ảnh, vuốt mobile + phím mũi tên/Esc, thả tim trực tiếp, heap ổn định (+14.6KB/50 ảnh trên 1.235 tấm) |
| BB-144 | Lưu ghi chú và nhãn từng ảnh: patchSelection ghi retouch_note và note_tags xuống selection_items, quy tắc xoá/giữ nguyên rõ ràng, kiểm chứng ngược | DEV-BE | BB-035 | med | ✅ **DONE** — `src/lib/selection/mutate.ts`, 7 test trong `bb-144-retouch-notes.test.ts` |
| BB-119 | ~~Hợp nhất hai bản BB-111~~ — chủ studio chốt giữ bản PM, INT làm riêng BB-097 | — | — | — | 🚫 **HUỶ** |

---

## Phase 3 — Quản trị studio & Lark

| Mã | Việc | Agent | Phức tạp | TT |
|---|---|---|---|---|
| BB-080 | Bot Lark: 7 sự kiện, message card, webhook theo chi nhánh | DEV-INT | med | TODO |
| BB-091 | Đồng bộ một chiều sang Lark Base (bitable batch upsert) | DEV-INT | high | TODO |
| BB-092 | Hàng đợi retouch: gán người, deadline, trạng thái | DEV-FE + DEV-BE | med | TODO |
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

| BB-138 | Dựng môi trường bb-prod, script setup, bảng kiểm | ARCH | - | med | DONE |
| BB-187 | Mã trên thanh địa chỉ thắng phiên trong máy — hết hẳn cảnh "mở link nhà mình, hiện ảnh nhà khác" | PM | BB-157 | high | ✅ **DONE** — `GET /api/g/gallery` nhận `?token=`, băm rồi so với `share_links.id` của phiên; lệch → 409 `SESSION_MISMATCH`, màn khách đăng nhập lại bằng đúng mã. Phép băm gom về `src/lib/auth/bam-ma-link.ts`. 3 ca; hoàn nguyên → 2 ca ĐỬ |
| BB-188 | Mở khoá link CŨ thay vì cấp link mới — giữ biểu tượng ba mẹ đã ghim ngoài màn hình | PM | BB-183 | high | ✅ **DONE** — `POST .../share-link/mo-lai` giữ nguyên `token_hash`, chỉ đổi tình trạng và hạn; màn chi tiết hiện tình trạng/hạn/số lượt mở và tách hẳn hai nút. 3 ca; hoàn nguyên → ĐỬ |
| BB-189 | Khoá lại `check_staff_deletable` — 0047 để PUBLIC gọi được một hàm SECURITY DEFINER | PM | BB-171 | high | ✅ **DONE** — `0048` đã áp lên bb-dev (chủ studio duyệt 18/09): thu hồi EXECUTE của PUBLIC/anon/authenticated, ghim `search_path`, và bỏ cả cặp `app.check_staff_deletable` + `app.v_staff_deletable` lạc ngoài migration. `verify:db` **17/17** |
| BB-190 | **18 chỗ ghi dữ liệu xong không kiểm xem có ghi được không.** `supabase-js` không ném lỗi — nó trả `{ data, error }`, và 18 chỗ trong `src/` bỏ qua cả hai. Đây là lớp lỗi đằng sau BB-152, BB-164, BB-186 và BB-167. Bốn chỗ nặng: xoá `staff_branches` (nhân viên giữ quyền chi nhánh cũ), thu hồi link (mã nghi đã lọt vẫn sống), ghi link Drive ảnh đã chỉnh, đặt hạn hai tháng | DEV-BE | — | high | ✅ **DONE 21/09, đã gộp** — 19 chỗ vá; reviewer đo độc lập: nền cũ 30 chỗ → còn 11, 9 trong số đó thuộc vùng DEV-INT (xem BB-194), 2 là ngoại lệ có chủ ý. **Phép thử 'ca bắt buộc' của agent xanh cả khi bỏ bản vá** — bảng giả thiếu `insert` nên mã nổ TypeError và vẫn ra 500; reviewer sửa, kiểm ngược mới thật: bỏ vá → ĐỎ `expected 200 to be 500` |
| BB-191 | **`npm run test` đang gửi tin và ghi dữ liệu ra ngoài thật.** Ngày 21/09 một lượt chạy đẩy **sáu thẻ "Test BB114…" vào nhóm Lark thật của studio**. Đã vá tạm ở `notify.ts`; còn bốn bộ phép thử gọi thật đường ghi cột *Link app* sang **bảng Hậu Kỳ thật**, chưa bộ nào chặn `fetch` — hiện đang được cứu bởi một sự tình cờ, không bởi một chốt nào | DEV-INT | BB-167 | high | ✅ **DONE 21/09, đã gộp** — chốt gom về `src/lib/kiem-thu.ts`, gắn vào cả webhook lẫn đường ghi *Link app*. Kiểm ngược làm thật: tắt chốt → `submit-and-confirm.test.ts` bắn **2 lượt POST ra webhook thật** (bẫy của reviewer bắt lại) mà vẫn báo 4/4 XANH; bật chốt → đủ bộ 0 lượt. `driveFetch` và `sync-retouch` VẪN chưa có chốt (xem BB-195) |
| BB-192 | **bb-prod chậm hơn bb-dev năm migration, và không có đường áp.** Thiếu `v_staff_deletable`, thiếu `check_staff_deletable`, chưa áp `0045`, thiếu hai dòng `settings` — cắt sang là màn Nhân sự hỏng trong im lặng và nút "Nhắn cho studio" của ba mẹ biến mất. `db:push` cố tình từ chối chạy trên prod, `setup-prod` chỉ dành cho cơ sở dữ liệu trống | PM | BB-138 | high | ⏸ **CHỜ CHỦ STUDIO DUYỆT** — `scripts/migrate-prod.mjs` + `npm run db:migrate:prod` đã soạn xong; migration mới `0049-dong-chat-page-url.sql`. Diễn tập trên bb-dev 21/09: bẻ đỏ một mốc → áp 5 tệp → 7/7 mốc xanh, `verify:db` 17/17, mã thoát 0. **Chưa chạm vào bb-prod** |
| BB-193 | **Trên bb-prod, vật gì sinh ra cũng tự mở cho `anon`.** Quyền mặc định của schema `public` là `anon=arwdDxtm` — nên `0045` dựng lại `v_share_links` và `0047` tạo `v_staff_deletable` thì cả hai sinh ra với anon đọc–ghi–xoá. Hai khung nhìn đó không phải `security_invoker` nên **đi vòng qua RLS**. Hôm nay chưa với tới được vì Data API của bb-prod trả 404 cho mọi đường — nhưng đó là một công tắc, không phải một lớp quyền. Câu `alter default privileges ... from anon` không có trong kho: bb-dev được gõ tay và không ai ghi lại | PM | BB-192 | high | ✅ **ĐÃ ÁP LÊN bb-prod 21/09** — `0050` + hai mốc kiểm mới (quét cả họ khung nhìn, không gõ tên). Diễn tập trên bb-dev: áp hai lượt liên tiếp đều xong. Trên bb-prod: sao lưu 1429, **45 quyền đang mở** → áp → chín mốc xanh, `verify:db` **17/17**, mã thoát 0. Đo lại bằng câu truy vấn riêng: chỉ còn ba khung nhìn báo cáo cho `authenticated`, quyền mặc định về `anon=m`, `selection_ops` sạch |
| BB-194 | **Chín chỗ nuốt lỗi còn lại, nằm trong vùng của Tích hợp.** BB-190 vá 19 chỗ nhưng không được đụng `src/lib/drive/sync-gallery.ts` (3 chỗ) và `src/lib/lark/notify.ts` (6 chỗ). Sáu chỗ ở `notify.ts` là các lượt cập nhật trạng thái `notifications` — hụt một lượt thì một tin nằm lại `pending` vĩnh viễn mà không ai biết | DEV-INT | BB-190 | med | ✅ **DONE 21/09, đã gộp** — sáu lượt cập nhật `notifications` và ba lượt ghi `galleries` nay đều kiểm `error`. Phép thử quét mã hạ ngưỡng 8 → 2 |
| BB-195 | **`driveFetch` và `sync-retouch` vẫn chưa có chốt nào canh.** BB-191 chặn hai đường Lark, nhưng hai đường còn lại an toàn chỉ vì mỗi phép thử hiện có tự nhớ giả lập `fetch` — đúng hình dạng đã gây tai nạn 21/09. Kéo cả hai vào `src/lib/kiem-thu.ts` | DEV-INT | BB-191 | med | ✅ **DONE 21/09, đã gộp** — `driveFetch` và `sync-retouch` vào cùng chốt `kiem-thu.ts`, 3 ca canh. Claude đổi tên cửa thoát `LARK_CHO_PHEP_GUI_TRONG_PHEP_THU` → `CHO_PHEP_GOI_MANG_TRONG_PHEP_THU` vì nó nay mở cả đường Drive |
| BB-196 | **Nhật ký vẫn mồ côi lại ngay sau khi dọn.** BB-173 dạy `db:cleanup` xoá nhật ký trỏ vào bộ ảnh đã xoá, và số dòng từ 9.823 xuống 720. Nhưng đo lại cùng ngày: **389/720 dòng (54%) đã mồ côi trở lại**. Dọn là một lượt quét chạy bằng tay; cái sinh ra rác là phép thử tạo rồi xoá bộ ảnh. Cần một cái chốt: hoặc khoá ngoại có `on delete`, hoặc phép thử dọn theo mình | DEV-BE | BB-173 | med | ✅ **DONE 21/09, đã gộp** — `0051`: cột `gallery_id` khoá ngoại `on delete set null` + trigger gỡ luôn `entity_id`. Reviewer đo hai lượt `npm run test` liên tiếp: mồ côi **0 → 0 → 0** (trước đó mỗi lượt để lại ~50 dòng). Agent không viết phép thử nào — reviewer viết, kiểm ngược: tắt trigger là ĐỎ. Reviewer vá thêm: bỏ hai tệp rác commit vào gốc kho, và gỡ nhãn tiếng Việt lọt vào trường `entityType` của API |
| BB-197 | **Màn Cài đặt.** `settings` có 11 dòng đang điều khiển app thật — hạn chốt, ngày nhắc, hạn link, watermark, cho tải, link Messenger, webhook Lark — và **không màn nào sửa được dòng nào**: muốn đổi "nhắc ngày 3 và 6" thì phải gõ SQL thẳng vào cơ sở dữ liệu. Kèm: xoá `gallery.require_pin_default`, dòng chết từ BB-169 mà không mã nào còn đọc | PM (Claude làm cả hai chặng) | BB-196 ✅, BB-060 ✅ | med | ✅ **DONE 21/09** — `GET`/`PATCH /api/admin/settings` (danh sách trắng 9 khoá, kiểm kiểu từng khoá, ghi `activity_logs` kèm giá trị cũ và mới, webhook Lark che khi đọc) + màn `/admin/settings`, mở khoá mục menu. `0054` xoá dòng chết `gallery.require_pin_default`. Kiểm ngược: bỏ lớp vai trò → ca CSKH ĐỎ; bỏ lớp kiểm kiểu → ca sai kiểu ĐỎ. `lark_hook_queue` cố ý không lên màn hình |
