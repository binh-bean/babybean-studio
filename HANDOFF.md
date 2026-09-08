# HANDOFF — Chuyển dự án sang Antigravity

Tài liệu này dành cho **PM** (bạn), để đưa bộ khung này vào Antigravity và cho đội agent chạy.

---

## Bước 1 — Chuẩn bị tài khoản (làm thủ công, ~30 phút)

| Việc | Nơi làm | Kết quả cần có |
|---|---|---|
| Tạo project Supabase `bb-dev` | supabase.com | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Tạo Google Cloud project, bật Drive API, tạo API key có giới hạn | console.cloud.google.com | `GOOGLE_DRIVE_API_KEY` |
| Sinh `APP_SECRET` | `openssl rand -base64 32` | chuỗi ≥ 32 ký tự |
| Chuẩn bị 1 thư mục Drive thật để test | Drive của studio | Link đã bật "Bất kỳ ai có đường liên kết — Người xem", 300–800 ảnh |
| Tạo repo Git | GitHub | Push toàn bộ thư mục `babybean-studio/` |

Chép `.env.example` thành `.env.local` và điền. **Không commit file này.**

## Bước 2 — Mở dự án trong Antigravity

1. Mở thư mục `babybean-studio/` bằng Antigravity.
2. Antigravity sẽ tự nạp `GEMINI.md` làm ngữ cảnh cho mọi agent.
3. Kiểm tra bằng câu hỏi thử với một agent bất kỳ:
   > Dự án này là gì, tôi được ghi những file nào, và task đầu tiên cần làm là gì?

   Nếu agent trả lời đúng (BabyBean, vùng sở hữu theo vai, task BB-001/BB-003) thì ngữ cảnh đã nạp đúng.

## Bước 3 — Dựng 8 agent trong Agent Manager

Với mỗi vai trong bảng dưới: tạo một agent, dán nội dung file prompt tương ứng, chọn model.

| Agent | Model | Prompt | Bật khi |
|---|---|---|---|
| ARCH | Gemini 3 Pro — thinking **High** | `prompts/arch.md` | Ngay từ đầu |
| DEV-BE | Gemini 3 Pro — Medium | `prompts/dev-be.md` | Phase 0 |
| DEV-FE | Gemini 3 Pro — Medium | `prompts/dev-fe.md` | Phase 1B |
| DEV-UI | Gemini 3 Flash | `prompts/dev-ui.md` | Phase 0 |
| DEV-INT | Gemini 3 Pro — Medium | `prompts/dev-int.md` | Phase 1A |
| SEC-ARCH | Gemini 3 **Deep Think** | `prompts/sec-arch.md` | Phase 1B (BB-020) |
| DEV-OPS | Gemini 3 Flash | `prompts/dev-ops.md` | Phase 0 |
| QA-BOT | Gemini 3 Pro + Browser | `prompts/qa-bot.md` | Phase 1D |

> Nếu Antigravity phiên bản bạn dùng không có đúng tên model nào đó, chọn model mạnh nhất cho ARCH và SEC-ARCH, model nhanh/rẻ nhất cho DEV-UI và DEV-OPS. Nguyên tắc phân vai không đổi.

## Bước 4 — Thứ tự giao việc

Giao task bằng một câu duy nhất:

> Thực hiện **BB-003**. Đọc `tasks/TASK-INDEX.md` để lấy chi tiết, tuân thủ `AGENTS.md`.

**Ba việc chạy song song được ngay từ đầu:**

```
ARCH     → BB-003 (Supabase + schema + policies)   ← quan trọng nhất, làm trước
DEV-OPS  → BB-001, BB-004, BB-005
DEV-UI   → BB-002
```

Sau khi BB-003 xong: `ARCH → BB-006`, `DEV-BE → BB-007, BB-008`.

Sau khi Phase 0 xong, hai nhánh chạy song song:
```
Nhánh Drive:   DEV-INT  → BB-010 → BB-011 → BB-012 → BB-013 → BB-014
Nhánh Admin:   SEC-ARCH → BB-020 ; DEV-FE → BB-021 ; DEV-BE → BB-023
```
Hai nhánh gặp nhau ở **BB-015** (proxy ảnh) và **BB-022** (wizard tạo album).

## Bước 5 — Nhịp làm việc hằng ngày

1. **Đầu ngày**: bạn xem `tasks/TASK-INDEX.md` và `tasks/BLOCKERS.md`. Giải quyết mọi dòng `OPEN` trong BLOCKERS trước — agent đang đứng chờ.
2. **Giao 2–4 task song song**, không nhiều hơn: quá nhiều PR cùng lúc sẽ xung đột.
3. **Mỗi PR**: bắt ARCH review trước, sau đó QA-BOT verify bằng browser.
4. **Cuối ngày**: cập nhật trạng thái task, merge những gì đã xanh.

## Bước 6 — Vai trò của Claude (reviewer độc lập)

Sau khi ARCH đã review, đưa diff sang Claude với yêu cầu:

> Review PR này theo `docs/12-security.md` và `docs/04-api-spec.md`. Tập trung: rò rỉ dữ liệu giữa các chi nhánh, ID lấy từ client, secret trong bundle, sai lệch so với hợp đồng API.

Lý do có hai lớp review: ARCH và các DEV cùng họ model, dễ mù chung một chỗ. Reviewer khác họ bắt được lỗi mà cùng họ bỏ qua.

---

## Bảng theo dõi tiến độ

| Mốc | Điều kiện xác nhận | Ngày dự kiến | Thực tế |
|---|---|---|---|
| Phase 0 xong | `npm run verify` xanh, deploy Vercel được, đăng nhập chạy | | |
| Drive chạy | Đồng bộ album thật 500+ ảnh < 30s | | |
| Khách chọn được | Chọn 20 ảnh trên iPhone qua 4G, chốt thành công | | |
| Xuất được | Dán danh sách vào Lightroom, đúng số lượng | | |
| Bảo mật đạt | 14/14 test ở `docs/05-rbac.md §6` pass | | |
| **Phase 1 xong** | 1 chi nhánh dùng thật 1 tuần, không lỗi chặn | | |
| Phase 2 xong | Cả 3 chi nhánh dùng thật, ≥20 album/chi nhánh | | |

---

## Những chỗ dễ hỏng nhất — kiểm kỹ

1. **Vượt quyền chi nhánh**: nhân viên chi nhánh A xem được album chi nhánh B. Test số 1 trong `docs/05-rbac.md §6`.
2. **Secret lọt vào bundle**: CI đã có job grep, nhưng hãy tự kiểm tra một lần bằng tay sau lần deploy đầu tiên.
3. **Mất lựa chọn của khách**: mạng yếu là chuyện thường ở Việt Nam. Test E-6 (offline) là bắt buộc.
4. **Ảnh mất khỏi Drive**: nhân viên dọn Drive giữa chừng. Phải thành `missing`, không được xoá lựa chọn.
5. **Album lớn làm treo điện thoại**: test thật với 1.000+ ảnh trên máy Android tầm trung, không chỉ trên trình giả lập.
6. **Agent tự ý đổi schema**: mỗi lần review, kiểm `git diff db/schema.sql` — phải trống trừ khi có ADR kèm theo.

## Bảy quyết định vận hành — đã chốt

Toàn bộ nằm ở [`docs/13-quyet-dinh-van-hanh.md`](docs/13-quyet-dinh-van-hanh.md), và đã được nạp sẵn vào `db/seed.sql`. Agent lấy giá trị từ đó, không hỏi lại.

| # | Câu hỏi | Đã chốt | Cần PM xác nhận? |
|---|---|---|---|
| 1 | Giá ảnh mua thêm | 60k / 50k / 45k / 40k, giảm dần theo gói | **Có** — sửa trong `db/seed.sql` |
| 2 | Hạn chốt mặc định | 7 ngày, nhắc ngày 3 và ngày 6 | Không |
| 3 | PIN | Bật mặc định, = 4 số cuối SĐT | Không |
| 4 | Cho tải ảnh | Tắt ở Phase 1, bật lẻ từ Phase 2 | Không |
| 5 | Tên miền | `chon-anh.babybean.vn` | **Có** — studio phải sở hữu `babybean.vn` |
| 6 | Nhóm Lark | 4 webhook: 3 chi nhánh + 1 nhóm quản lý | **Có** — cần URL webhook thật ở Phase 3 |
| 7 | Ảnh preview | 2048px, JPEG q75, sRGB, xoá GPS | Không |

Ba việc PM phải làm trước khi giao BB-023:
1. Xác nhận hoặc sửa bảng giá trong `db/seed.sql`.
2. Xác nhận đã sở hữu `babybean.vn` và thêm được CNAME.
3. Gửi preset xuất ảnh ở `docs/13-quyet-dinh-van-hanh.md §7` cho thợ ảnh, kèm ba quy tắc vận hành ở cuối tài liệu đó.
