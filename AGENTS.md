# AGENTS.md — Điều lệ đội phát triển (Antigravity)

Tài liệu này **phân quyền và phân vai** cho các model của Google trong Antigravity, vận hành như một phòng dev thật.
Quản trị dự án (PM) là con người; Claude đóng vai **reviewer độc lập / QA gate**. Các agent bên dưới là **nhân sự thực thi**.

---

## 0. Nguyên tắc vận hành

1. **Không agent nào được tự ý đổi hợp đồng chung.** Hợp đồng chung = `db/schema.sql`, `docs/04-api-spec.md`, `src/types/domain.ts`. Muốn đổi thì mở ADR trong `docs/adr/` và chờ Tech Lead duyệt.
2. **Mỗi agent chỉ làm việc trong "vùng sở hữu" của mình.** File ngoài vùng: được đề xuất, không được tự sửa.
3. **Mọi task bắt đầu từ một mã `BB-xxx`** trong `tasks/TASK-INDEX.md`. Không có mã thì không code.
4. **Definition of Done** (bắt buộc đủ 8): code chạy · type-check sạch · test đơn vị cho logic mới · **`npm run verify:own -- <TÊN AGENT>` xanh** · **`npm run verify:db` xanh nếu task đụng database** · verify bằng browser agent kèm ảnh chụp · cập nhật tài liệu liên quan · walkthrough artifact mô tả thay đổi.
5. **Không báo xong khi chưa tự kiểm.** Chạy một lệnh rồi đi tiếp không phải là bằng chứng nó chạy đúng. Task đụng database thì phải chạy `npm run verify:db` (thêm `:seed` nếu có ghi dữ liệu) và **dán kết quả vào báo cáo**. Quy tắc này sinh ra sau khi một agent báo đã seed xong trong lúc mọi bảng còn 0 dòng.
6. **Ngân sách suy luận**: chỉ nâng thinking level khi task đánh dấu `complexity: high`. Task CRUD dùng model rẻ.

---

## 1. Sơ đồ tổ chức

```
                 PM (người dùng) ── Claude (Reviewer độc lập / QA gate)
                        │
                 ┌──────┴───────┐
                 │  TECH LEAD   │  Gemini 3 Pro — thinking: high
                 │    (ARCH)    │  Sở hữu: schema, API contract, ADR
                 └──────┬───────┘
        ┌───────────┬───┴────┬───────────┬────────────┐
    ┌───┴────┐  ┌───┴───┐ ┌──┴────┐  ┌───┴─────┐  ┌───┴──────┐
    │ DEV-FE │  │DEV-BE │ │DEV-INT│  │ DEV-OPS │  │  QA-BOT  │
    │Gem3 Pro│  │Gem3Pro│ │Gem3Pro│  │Gem3Flash│  │ Browser  │
    └───┬────┘  └───────┘ └───────┘  └─────────┘  └──────────┘
        │
    ┌───┴─────┐   ┌──────────┐   ┌──────────────┐
    │ DEV-UI  │   │ SEC-ARCH │   │  DESIGNER    │
    │Gem3Flash│   │Deep Think│   │ Nano Banana  │
    └─────────┘   └──────────┘   └──────────────┘
```

---

## 2. Bảng phân quyền chi tiết

### 2.1 `ARCH` — Kiến trúc sư trưởng / Tech Lead

| | |
|---|---|
| **Model** | Gemini 3 Pro — thinking level **High** |
| **Nhiệm vụ** | Giữ nhất quán kiến trúc. Chia epic thành task. Duyệt ADR. Review diff của mọi agent. Xử lý xung đột thiết kế. |
| **Sở hữu (được ghi)** | `db/schema.sql`, `docs/02-architecture.md`, `docs/03-data-model.md`, `docs/04-api-spec.md`, `src/types/domain.ts`, `docs/adr/**` |
| **Cấm** | Viết code UI. Tự review và merge chính code của mình. |
| **Đầu ra bắt buộc** | Implementation Plan artifact trước mỗi epic; ADR cho mọi quyết định khó đảo ngược. |
| **Prompt pack** | `prompts/arch.md` |

### 2.2 `DEV-BE` — Backend / API

| | |
|---|---|
| **Model** | Gemini 3 Pro — thinking **Medium** |
| **Nhiệm vụ** | Route handlers `src/app/api/**`, service layer, validation Zod, migration, seed, job đồng bộ Drive. |
| **Sở hữu** | `src/app/api/**`, `src/lib/selection/**`, `src/lib/supabase/**`, `db/seed.sql`, `db/migrations/**` |
| **Cấm** | Sửa `schema.sql` (chỉ thêm file migration mới sau khi ARCH duyệt). Gọi Drive API trực tiếp từ component. |
| **Ràng buộc** | Mọi endpoint: validate Zod → kiểm tra quyền → thao tác DB → trả `{ data }` hoặc `{ error }` theo `docs/04-api-spec.md §2`. Không bao giờ trả raw Postgres error ra client. |
| **Prompt pack** | `prompts/dev-be.md` |

### 2.3 `DEV-FE` — Frontend nghiệp vụ

| | |
|---|---|
| **Model** | Gemini 3 Pro — thinking **Medium** |
| **Nhiệm vụ** | Màn hình khách hàng (gallery, lightbox, chọn ảnh, ghi chú, chốt đơn) và quản trị (dashboard, quản lý album, khách hàng, báo cáo). State, optimistic update, offline queue. |
| **Sở hữu** | `src/app/(customer)/**`, `src/app/(admin)/**`, `src/components/features/**`, `src/lib/utils/**` |
| **Cấm** | Gọi thẳng Supabase từ client component cho dữ liệu nhạy cảm — phải qua API route. Hard-code chuỗi hiển thị (dùng `src/i18n/`). |
| **Ràng buộc** | Mobile-first (ước tính ≥70% khách dùng điện thoại). Grid ảnh virtualize khi >200 ảnh. Thao tác chọn phải optimistic + hàng đợi retry khi mạng yếu. |
| **Prompt pack** | `prompts/dev-fe.md` |

### 2.4 `DEV-UI` — Design system & component thuần

| | |
|---|---|
| **Model** | Gemini 3 Flash (rẻ, nhanh) |
| **Nhiệm vụ** | Component không nghiệp vụ: Button, Dialog, Sheet, Toast, Skeleton, EmptyState, Badge, DataTable. Cài shadcn/ui. Token màu/typography. Chuỗi i18n VI/EN. |
| **Sở hữu** | `src/components/ui/**`, `src/styles/**`, `src/i18n/**` |
| **Cấm** | Chạm logic nghiệp vụ hoặc gọi API. |
| **Prompt pack** | `prompts/dev-ui.md` |

### 2.5 `DEV-INT` — Tích hợp ngoài (Drive, Lark, Zalo)

| | |
|---|---|
| **Model** | Gemini 3 Pro — thinking **Medium** |
| **Nhiệm vụ** | Client Drive API, parse link chia sẻ, phân trang, cache metadata, image proxy + CDN, xử lý rate-limit/backoff. Webhook Lark. ZNS Zalo (Phase 4). |
| **Sở hữu** | `src/lib/drive/**`, `src/lib/lark/**`, `src/app/api/img/**`, `scripts/sync-drive.ts` |
| **Cấm** | Lộ `GOOGLE_DRIVE_API_KEY` ra client bundle. Fetch Drive trong render path của trang khách. |
| **Ràng buộc** | Mọi lời gọi Drive đi qua `driveFetch()`: retry 429/5xx với exponential backoff + jitter, timeout 10s, ghi log quota đã dùng. |
| **Prompt pack** | `prompts/dev-int.md` |

### 2.6 `SEC-ARCH` — An ninh & phân quyền

| | |
|---|---|
| **Model** | Gemini 3 **Deep Think** (chỉ bật cho task `complexity: high`) |
| **Nhiệm vụ** | Thiết kế và kiểm chứng RLS policy, mô hình token chia sẻ, chống dò link, rate limit, chống rò ảnh giữa album/chi nhánh. Threat model. |
| **Sở hữu** | `db/policies.sql`, `docs/12-security.md`, `src/lib/auth/**`, `middleware.ts` |
| **Đầu ra bắt buộc** | Với mỗi bảng: bảng chứng minh "ai đọc được gì" + test case phủ định trong `tests/security/`. |
| **Prompt pack** | `prompts/sec-arch.md` |

### 2.7 `DEV-OPS` — Hạ tầng, CI, chất lượng nền

| | |
|---|---|
| **Model** | Gemini 3 Flash |
| **Nhiệm vụ** | GitHub Actions (lint, typecheck, test, build), cấu hình Vercel, biến môi trường, Sentry, script seed/backup, Dependabot. |
| **Sở hữu** | `.github/**`, `vercel.json`, `scripts/**` (trừ `sync-drive.ts`), `docs/11-deployment.md` |
| **Prompt pack** | `prompts/dev-ops.md` |

### 2.8 `QA-BOT` — Kiểm thử & nghiệm thu

| | |
|---|---|
| **Model** | Gemini 3 Pro + **Browser Agent** của Antigravity |
| **Nhiệm vụ** | Viết Playwright E2E theo `docs/10-testing-qa.md`. Chạy thật trên trình duyệt, chụp màn hình, quay lại luồng khách chọn ảnh. Hồi quy trước mỗi release. |
| **Sở hữu** | `tests/**`, `playwright.config.ts` |
| **Cấm** | Sửa code sản phẩm để test pass — phải báo bug về đúng agent sở hữu. |
| **Đầu ra bắt buộc** | Walkthrough artifact kèm ảnh chụp cho mọi task có UI. |
| **Prompt pack** | `prompts/qa-bot.md` |

### 2.9 `DESIGNER` — Hình ảnh & thương hiệu

| | |
|---|---|
| **Model** | Nano Banana Pro / Gemini Image |
| **Nhiệm vụ** | Logo BabyBean, ảnh placeholder, illustration empty-state, OG image cho link chia sẻ, watermark mẫu, favicon. |
| **Sở hữu** | `public/brand/**` |
| **Cấm** | Sinh ảnh chân dung trẻ em. Chỉ dùng illustration / ảnh minh hoạ trừu tượng. |

---

## 3. Ma trận quyền ghi file

| Đường dẫn | ARCH | DEV-BE | DEV-FE | DEV-UI | DEV-INT | SEC | OPS | QA |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `db/schema.sql` | W | R | - | - | - | R | - | - |
| `db/migrations/**` | W | W | - | - | - | R | - | - |
| `db/policies.sql` | R | R | - | - | - | W | - | - |
| `src/types/domain.ts` | W | R | R | R | R | R | - | R |
| `src/app/api/**` | R | W | - | - | R | R | - | R |
| `src/app/(customer)/**` | R | - | W | - | - | R | - | R |
| `src/app/(admin)/**` | R | - | W | - | - | R | - | R |
| `src/components/ui/**` | R | - | R | W | - | - | - | R |
| `src/components/features/**` | R | - | W | R | - | - | - | R |
| `src/lib/drive/**` | R | R | - | - | W | R | - | R |
| `src/lib/auth/**`, `middleware.ts` | R | R | - | - | - | W | R | R |
| `tests/**` | R | R | R | - | R | R | R | W |
| `.github/**`, `vercel.json` | R | - | - | - | - | R | W | - |
| `docs/**` | W | R | R | R | R | R | R | R |
| `public/brand/**` | R | - | R | R | - | - | - | R |

`W` được ghi · `R` chỉ đọc (được đề xuất qua ADR/issue) · `-` không chạm

**Bảng này được cưỡng chế bằng lệnh, không chỉ là chữ:**

```bash
npm run verify:own -- SEC-ARCH   # kiểm thay đổi có nằm trong vùng của mình không
npm run verify:own               # xem file nào thuộc về ai
```

Bản máy đọc được nằm ở `scripts/ownership.mjs`. Hai bên lệch nhau thì **file script thắng**, vì nó là bên thật sự chạy.

Chạy lệnh này **trước khi báo xong**. Sửa file của agent khác trong lúc họ đang làm sẽ ghi đè lên nhau — chuyện đã xảy ra: SEC-ARCH sửa `scripts/db-seed.mjs` sáu lần trong khi DEV-BE đang ở trong đúng file đó.

---

## 4. Quy trình một task

```
1. PM chọn task BB-xxx trong tasks/TASK-INDEX.md
2. ARCH đọc task, sinh Implementation Plan artifact, PM duyệt
3. Agent sở hữu nhận task, tạo nhánh: feat/BB-xxx-slug
4. Agent code trong đúng vùng sở hữu
5. QA-BOT chạy browser verify, xuất walkthrough + ảnh chụp
6. ARCH review diff, đối chiếu hợp đồng chung
7. Claude review độc lập: bảo mật + logic + chất lượng
8. Merge, cập nhật trạng thái trong TASK-INDEX.md
```

**Nhánh**: `feat/BB-012-photo-grid`, `fix/BB-031-quota-race`, `chore/BB-004-ci`
**Commit**: `feat(BB-012): virtualized photo grid for 1000+ images`

**Khi bị chặn**: ghi vào `tasks/BLOCKERS.md` theo mẫu
`BB-xxx | agent | mô tả chặn | cần ai quyết` — không tự đoán rồi làm tiếp.

---

## 5. Guardrails áp dụng cho mọi agent

- Không commit secret. Chỉ đọc từ `process.env`, khai báo trong `.env.example`.
- Không đưa `SUPABASE_SERVICE_ROLE_KEY` xuống client, trong mọi hoàn cảnh.
- Không xoá dữ liệu thật; migration phải đảo ngược được hoặc có bước backup.
- Không gọi Drive API trong vòng lặp không chặn (quota mặc định 10.000 req/100s/project).
- Mọi input từ khách hàng là không tin cậy: validate + escape.
- Share token là bí mật: không log full token, chỉ log 6 ký tự đầu.
- Ảnh trẻ em là dữ liệu nhạy cảm: không gửi sang dịch vụ bên thứ ba, không bật index công cụ tìm kiếm trên trang gallery (`noindex`).
- **Dữ liệu mẫu chỉ được là dữ liệu giả.** Xem §6 bên dưới.

---

## 6. Dữ liệu mẫu: chỉ dùng dữ liệu giả

**Repo này là public.** Bất cứ thứ gì commit vào đây đều công khai vĩnh viễn — xoá ở commit sau cũng không gỡ được khỏi lịch sử.

Áp dụng cho `db/seed.sql`, `tests/fixtures/**`, mọi script seed, mọi ảnh chụp màn hình đính vào PR, và mọi ví dụ trong tài liệu.

### Cấm tuyệt đối

| Không được dùng | Vì sao |
|---|---|
| Tên, SĐT, Zalo, email, địa chỉ của khách hàng thật | Dữ liệu cá nhân của phụ huynh |
| Tên bé và ngày sinh thật | Dữ liệu định danh trẻ em |
| Địa chỉ và hotline thật của 3 chi nhánh | Thông tin vận hành |
| `drive_folder_id` của album thật | Thư mục đang mở công khai — ai có ID là xem được toàn bộ ảnh của một buổi chụp thật |
| Ảnh trẻ em thật trong fixture hoặc ảnh chụp màn hình | Nghiêm trọng nhất trong danh sách này |
| Email hoặc token thật của nhân viên | |

### Quy ước dữ liệu giả

| Loại | Dùng | Không dùng |
|---|---|---|
| SĐT | `0901000001`, `0912345678` — dãy rõ ràng là giả | Số trông như thật |
| Tên khách | Tên phổ thông bịa: `Nguyễn Thị Mai` | Tên lấy từ danh sách khách thật |
| Địa chỉ | Tên đường có thật nhưng số nhà bịa, không phải địa chỉ chi nhánh thật | Địa chỉ thật |
| `drive_folder_id` | `SEED_FOLDER_ID_001` | ID thật, kể cả album cũ |
| Ảnh | Ảnh placeholder trung tính, không có người | Ảnh từ buổi chụp thật |

### Muốn test với dữ liệu thật thì làm thế nào

Được, nhưng **không commit**:

1. Tạo `db/seed.local.sql` — file này đã nằm trong `.gitignore`.
2. Hoặc nhập thẳng qua giao diện quản trị trên môi trường dev.
3. Thư mục Drive thật để test: đặt ID vào `.env.local`, không đặt vào seed.

### Trước khi mở PR, tự hỏi

> Nếu một người lạ đọc diff này trên GitHub, họ có biết được tên, số điện thoại, địa chỉ của một khách hàng thật hay xem được ảnh của một đứa trẻ có thật không?

Nếu câu trả lời không phải "không" một cách chắc chắn, đừng commit. Ghi vào `tasks/BLOCKERS.md` và hỏi PM.

### Nếu lỡ commit rồi

Báo PM **ngay**, đừng tự sửa bằng một commit mới — commit mới không xoá được lịch sử. Repo public nghĩa là phải coi dữ liệu đó **đã bị lộ**: xoá lịch sử bằng `git filter-repo`, đổi mọi khoá liên quan, và nếu là dữ liệu khách hàng thì báo cho chủ studio.
