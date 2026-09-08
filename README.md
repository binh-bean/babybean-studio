# BabyBean Studio Platform

Nền tảng **chọn ảnh cho khách hàng** + **quản trị studio** cho hệ thống chụp ảnh cho bé **BabyBean** (3 chi nhánh).

Khách hàng nhận một link, mở ra xem toàn bộ ảnh buổi chụp (nguồn: thư mục Google Drive chia sẻ công khai), chọn ảnh, ghi chú yêu cầu chỉnh sửa, chốt đơn. Studio theo dõi tiến độ, xuất danh sách file, giao album.

> Repo này là **bộ khung (scaffold) + đặc tả đầy đủ**. Việc triển khai code chi tiết được giao cho đội agent trong Antigravity — xem [AGENTS.md](AGENTS.md).

---

## 1. Trạng thái hiện tại

| Hạng mục | Trạng thái |
|---|---|
| Đặc tả sản phẩm (PRD) | ✅ Hoàn chỉnh — `docs/01-prd.md` |
| Kiến trúc hệ thống | ✅ Hoàn chỉnh — `docs/02-architecture.md` |
| Mô hình dữ liệu + SQL | ✅ Hoàn chỉnh — `db/schema.sql`, `db/policies.sql` |
| Hợp đồng API | ✅ Hoàn chỉnh — `docs/04-api-spec.md` |
| Phân quyền RBAC | ✅ Hoàn chỉnh — `docs/05-rbac.md` |
| Tích hợp Google Drive | ✅ Đặc tả + code mẫu — `docs/06-drive-integration.md`, `src/lib/drive/` |
| Code ứng dụng | 🟡 Scaffold — chờ đội Antigravity implement theo `tasks/` |
| Kiểm chứng scaffold | ✅ `npm run verify` xanh (typecheck + lint + 12 test) và `next build` thành công |
| Kiểm chứng SQL | ⚠️ Chưa chạy trên Postgres thật — thuộc task **BB-003** |
| Tích hợp Lark | 🟡 Đặc tả — `docs/08-lark-integration.md` (Phase 3) |

## 2. Tech stack

- **Next.js 15** (App Router, Server Components) + **TypeScript strict**
- **Tailwind CSS v4** + **shadcn/ui** (Radix)
- **Supabase** — PostgreSQL + Auth + Storage + Realtime + RLS
- **Google Drive API v3** — đọc metadata thư mục public bằng API key
- **Vercel** — hosting + Edge cache cho image proxy
- **Lark Open Platform** — webhook thông báo nội bộ (Phase 3)

Lý do chọn: xem `docs/adr/ADR-0001-tech-stack.md`.

## 3. Chạy local

```bash
cp .env.example .env.local   # điền khóa
npm install
npm run db:push              # apply db/schema.sql lên Supabase
npm run dev
```

Truy cập:
- Khách hàng: `http://localhost:3000/g/<share_token>`
- Quản trị:  `http://localhost:3000/admin`

## 4. Bản đồ tài liệu

| File | Nội dung |
|---|---|
| `docs/00-overview.md` | Bối cảnh, phạm vi, thuật ngữ |
| `docs/01-prd.md` | Yêu cầu sản phẩm, user story, tiêu chí nghiệm thu |
| `docs/02-architecture.md` | Kiến trúc, luồng dữ liệu, thư mục code |
| `docs/03-data-model.md` | ERD, mô tả bảng, vòng đời trạng thái |
| `docs/04-api-spec.md` | Toàn bộ endpoint, request/response |
| `docs/05-rbac.md` | Vai trò, ma trận quyền, RLS |
| `docs/06-drive-integration.md` | Cách đọc Drive public, cache, giới hạn |
| `docs/07-ui-ux.md` | Design system, wireframe từng màn hình |
| `docs/08-lark-integration.md` | Đồng bộ Lark Base + thông báo |
| `docs/09-roadmap.md` | 5 phase, mốc thời gian |
| `docs/10-testing-qa.md` | Chiến lược test, checklist nghiệm thu |
| `docs/11-deployment.md` | Môi trường, biến env, quy trình deploy |
| `docs/12-security.md` | Mô hình đe dọa, biện pháp |
| `docs/13-quyet-dinh-van-hanh.md` | **7 quyết định vận hành đã chốt** + preset xuất ảnh cho thợ ảnh |
| `AGENTS.md` | **Phân quyền đội agent Google (Antigravity)** |
| `GEMINI.md` | Ngữ cảnh nạp tự động cho agent trong Antigravity |
| `tasks/TASK-INDEX.md` | Backlog chi tiết, thứ tự phụ thuộc |
| `prompts/` | Prompt pack sẵn sàng dán cho từng vai trò |

## 5. Quy ước

- Ngôn ngữ tài liệu: **Tiếng Việt**. Ngôn ngữ code/identifier/commit: **Tiếng Anh**.
- Mỗi task có mã `BB-xxx`, commit theo `feat(BB-012): ...`.
- Không sửa `db/schema.sql` khi chưa có ADR + duyệt của Tech Lead.
