# GEMINI.md — Ngữ cảnh dự án (nạp tự động cho agent)

> File này được Antigravity nạp vào mọi phiên agent. Đọc hết trước khi làm bất cứ việc gì.

## Dự án là gì

**BabyBean Studio Platform** — web app để khách hàng của studio chụp ảnh cho bé BabyBean (3 chi nhánh) tự chọn ảnh từ buổi chụp, và để studio quản trị toàn bộ quy trình.

- Nguồn ảnh: **thư mục Google Drive chia sẻ công khai** (link "anyone with the link"). Không upload ảnh lên hệ thống.
- Khách nhận link `/g/<token>`, xác thực nhẹ, xem lưới ảnh, chọn/ghi chú/chốt.
- Studio quản trị album, quota, hạn chốt, khách hàng, nhân sự, báo cáo.
- Giai đoạn sau: mở rộng thành hệ quản trị chung cho studio (booking, nhân sự, kho, doanh thu), đồng bộ với **Lark** đang dùng nội bộ.

> Giá trị mặc định đã chốt (hạn chốt 7 ngày, PIN bật mặc định, không cho tải ảnh ở Phase 1, giá ảnh thêm, tên miền, webhook Lark, preset ảnh 2048px) nằm ở `docs/13-quyet-dinh-van-hanh.md` và đã có trong `db/seed.sql`. **Lấy giá trị từ đó, đừng tự đoán.**

## Quy tắc bất di bất dịch

1. Đọc `AGENTS.md` để biết mình được ghi file nào. **Không ghi ngoài vùng sở hữu.**
2. Hợp đồng chung không được đổi tuỳ tiện: `db/schema.sql`, `docs/04-api-spec.md`, `src/types/domain.ts`.
3. Không có mã task `BB-xxx` thì không code.
4. Ngôn ngữ: **tài liệu tiếng Việt**, **code/identifier/commit tiếng Anh**.
5. TypeScript `strict`, không dùng `any`. Không `// @ts-ignore` nếu chưa ghi lý do.
6. Không commit secret. Không đưa service-role key xuống client.
7. Ảnh trẻ em là dữ liệu nhạy cảm — xem `docs/12-security.md`.

## Tech stack

| Lớp | Công nghệ |
|---|---|
| Framework | Next.js 15 App Router, React 19, TypeScript strict |
| UI | Tailwind CSS v4, shadcn/ui (Radix), lucide-react |
| Data | Supabase — Postgres + Auth + Storage + Realtime + RLS |
| Validation | Zod (mọi ranh giới input) |
| Ảnh | Google Drive API v3 (API key, thư mục public) + image proxy tự viết |
| Test | Vitest (unit) + Playwright (E2E) |
| Deploy | Vercel |
| Thông báo | Lark webhook (Phase 3), Zalo ZNS (Phase 4) |

## Vocabulary nghiệp vụ (dùng đúng từ này trong code)

| Thuật ngữ | Ý nghĩa | Định danh trong code |
|---|---|---|
| Chi nhánh | 1 trong 3 cơ sở BabyBean | `branch` |
| Khách hàng | Phụ huynh đặt chụp | `customer` |
| Bé | Đối tượng được chụp | `baby` |
| Buổi chụp | Một session chụp | `shoot` |
| Album | Bộ ảnh của một buổi chụp, gắn 1 thư mục Drive | `gallery` |
| Ảnh | 1 file ảnh trong album (metadata cache từ Drive) | `photo` |
| Link chia sẻ | Token khách dùng để mở album | `share_link` |
| Phiên chọn | Lượt chọn của một người trên album | `selection` |
| Ảnh đã chọn | Một dòng chọn ảnh cụ thể | `selection_item` |
| Quota | Số ảnh miễn phí theo gói | `included_quota` |
| Ảnh mua thêm | Ảnh vượt quota, tính phí | `extra_photo` |
| Chốt đơn | Khách xác nhận, khoá album | `submit` / `status = submitted` |
| Yêu cầu chỉnh | Ghi chú retouch cho từng ảnh | `retouch_note` |
| Giao hàng | Album final trả khách | `delivery` |

## Trạng thái album (không tự thêm trạng thái mới)

```
draft → syncing → ready → in_review → submitted → in_retouch → delivered
                                  ↘ expired
                                  ↘ reopened → in_review
```

## Cấu trúc thư mục

```
src/
  app/
    (customer)/g/[token]/      # khách chọn ảnh
    (admin)/admin/             # quản trị
    api/                       # route handlers
  components/
    ui/                        # DEV-UI sở hữu — thuần trình bày
    features/                  # DEV-FE sở hữu — có nghiệp vụ
  lib/
    drive/                     # DEV-INT
    supabase/                  # DEV-BE
    selection/                 # DEV-BE — logic quota, chốt đơn
    auth/                      # SEC-ARCH
    lark/                      # DEV-INT
  types/domain.ts              # ARCH — nguồn sự thật kiểu dữ liệu
db/                            # schema, policies, migrations, seed
docs/                          # đặc tả
tasks/                         # backlog BB-xxx
tests/                         # QA-BOT
```

## Lệnh thường dùng

```bash
npm run dev          # chạy dev
npm run typecheck    # bắt buộc trước khi báo xong
npm run lint
npm run test         # vitest
npm run test:e2e     # playwright
npm run db:push      # apply schema lên Supabase
npm run drive:sync   # đồng bộ thủ công 1 album
```

## Trước khi báo "xong"

- [ ] `npm run typecheck` sạch
- [ ] `npm run lint` sạch
- [ ] Test đơn vị cho logic mới đã pass
- [ ] Đã chạy thật trên browser agent, có ảnh chụp
- [ ] Tài liệu liên quan đã cập nhật
- [ ] Không có secret trong diff
- [ ] Trạng thái task trong `tasks/TASK-INDEX.md` đã đổi
