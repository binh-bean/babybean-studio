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
4. Ngôn ngữ:
   - **Nói chuyện với người dùng: luôn bằng tiếng Việt.** Áp dụng cho mọi thứ người dùng đọc — câu hỏi xin phép chạy lệnh, mô tả ngắn của lệnh, báo cáo, giải thích, thông báo lỗi bạn viết ra. Người quản trị dự án không đọc tiếng Anh.
   - **Tài liệu trong repo: tiếng Việt.**
   - **Code, tên biến/hàm, comment trong code, commit message: tiếng Anh.** Đây là ranh giới cố định, đừng dịch code sang tiếng Việt.
   - Thuật ngữ kỹ thuật giữ nguyên tiếng Anh khi không có từ tiếng Việt gọn hơn (RLS, policy, migration, commit, worktree...) — đừng dịch cưỡng ép.
5. TypeScript `strict`, không dùng `any`. Không `// @ts-ignore` nếu chưa ghi lý do.
6. Không commit secret. Không đưa service-role key xuống client.
7. Ảnh trẻ em là dữ liệu nhạy cảm — xem `docs/12-security.md`.
8. **Repo này là public.** Dữ liệu mẫu trong `db/seed.sql`, `tests/fixtures/**` và ảnh chụp đính PR **chỉ được là dữ liệu giả** — không tên/SĐT/địa chỉ khách thật, không `drive_folder_id` của album thật, không ảnh trẻ em thật. Quy ước đầy đủ: `AGENTS.md §6`.

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

## Shell trên máy dev là PowerShell, không phải bash

Mọi lệnh bạn chạy đều đi qua **PowerShell 7 trên Windows**. Viết lệnh theo phản xạ bash sẽ lỗi.

| Đừng dùng | Vì sao | Dùng thay |
|---|---|---|
| `cat << 'EOF' > file` | PowerShell không có heredoc; `<<` là toán tử bị cấm, lỗi cú pháp | **Công cụ sửa file của Antigravity** — chạy được mọi nền và hiện diff để review |
| `ls -la` | `ls` là bí danh của `Get-ChildItem`, không có cờ `-la` | `ls` hoặc `Get-ChildItem -Force` |
| `touch file` | không tồn tại | `New-Item -ItemType File path` (đừng dùng `-Force` với file — nó xoá sạch nội dung) |
| `which x` | không tồn tại | `(Get-Command x).Source` |
| `head` / `tail` | không tồn tại | `Get-Content f -TotalCount N` / `-Tail N` |
| `export VAR=x` | không tồn tại | `$env:VAR = 'x'` |
| `2>/dev/null` | không tồn tại | `2>$null` |

**Ghi file: luôn dùng công cụ sửa file, không dùng chuyển hướng shell.** Đây là quy tắc quan trọng nhất ở đây — ghi file bằng `>` trên PowerShell vừa dễ lỗi mã hoá, vừa không để lại diff cho người review.

`&&` và `||` **có** hoạt động (PowerShell 7), nhưng nếu không chắc thì tách thành nhiều lệnh.

## Hạn chế xin phép — làm việc liền mạch

Mỗi lệnh shell bạn chạy đều bắt người dùng bấm một hộp thoại. Đọc file bằng công cụ của IDE thì **không hỏi**. Cả buổi làm việc có thể mất hàng chục lượt bấm chỉ vì thói quen dùng shell cho việc không cần shell.

**Đừng dùng shell cho những việc này:**

| Đừng chạy | Làm gì thay |
|---|---|
| `cat file`, `Get-Content file` | Dùng công cụ đọc file của IDE |
| `ls`, `Get-ChildItem` | Dùng trình duyệt file của IDE |
| `grep`, `Select-String` | Dùng công cụ tìm kiếm của IDE |
| `git log`, `git branch -a`, `git status` chỉ để xem | Chỉ chạy khi thật sự cần quyết định điều gì |

**Gộp lệnh thay vì chạy lẻ.** PowerShell 7 hỗ trợ `&&`:

```
npm run typecheck && npm run lint && npm run test
```

Một lần hỏi thay vì ba.

**Chỉ chạy lệnh kiểm tra một lần, ở cuối.** Đừng chạy `npm run test` sau mỗi lần sửa một dòng — sửa xong cả phần việc rồi hãy chạy.

**Đừng chạy lệnh để "xem thử".** Nếu không chắc lệnh có đúng cú pháp PowerShell không, đọc lại mục shell ở trên thay vì thử rồi sửa.

**Đừng hỏi lại điều đã có trong tài liệu.** Đọc `GEMINI.md`, `AGENTS.md`, `tasks/TASK-INDEX.md` và tài liệu liên quan trước khi bắt đầu, đọc một lần cho đủ. Người dùng giao một task là mong bạn làm hết task đó rồi mới quay lại.

## Lệnh thường dùng

```bash
npm run verify:own -- <AGENT>  # kiểm thay đổi có trong vùng sở hữu của mình
npm run verify:db      # kiểm database: cấu trúc, RLS, quyền, rò rỉ khoá công khai
npm run verify:db:seed # như trên, kèm yêu cầu phải có dữ liệu mẫu
npm run verify:build   # mở file đã build ra đọc: bí mật lọt vào bundle? font khai mà không nạp?
npm run verify:prod    # hỏi thẳng site đang chạy thật: định tuyến, vùng máy chủ, header an ninh
npm run dev          # chạy dev
npm run typecheck    # bắt buộc trước khi báo xong
npm run lint
npm run test         # vitest
npm run test:e2e     # playwright
npm run db:push      # apply schema lên Supabase
npm run drive:sync   # đồng bộ thủ công 1 album
```

## Đừng chạy `npm run build` khi máy chủ dev đang chạy

`next dev` và `next build` dùng chung thư mục `.next`. Chạy build trong lúc dev
đang chạy là bản sản xuất ghi đè cache của dev, và mọi trang thành TRẮNG TINH với
lỗi kiểu `Cannot find module './331.js'` hoặc `__webpack_modules__[moduleId] is
not a function`. Nhìn y như code hỏng, mà code không hỏng.

Ngày 10/09/2026 chuyện này xảy ra hai lần trong một buổi, lần thứ hai làm chủ
studio tưởng mình gõ sai mật khẩu.

Cần chạy build thì tắt máy chủ dev trước, hoặc `rm -rf .next` rồi khởi động lại.

---

## Build xanh không có nghĩa là đúng

`npm run build` thoát 0 chỉ nói rằng trình biên dịch hài lòng, không nói rằng kết quả đúng.
Ngày 10/09/2026: build xanh, 39 test xanh, mà production phục vụ `font-family: "Be Vietnam Pro"`
trong khi không tải một file font nào — trình tối ưu CSS đã âm thầm vứt dòng `@import` đi.
Không ai thấy lỗi vì không có gì báo lỗi.

Vì vậy: **đừng lấy "lệnh chạy xong không báo lỗi" làm bằng chứng.** Mở kết quả ra xem.
`verify:build` và `verify:prod` làm đúng việc đó, hãy chạy chúng thay vì tin vào build.

---

## Trước khi báo "xong"

- [ ] `npm run typecheck` sạch
- [ ] `npm run lint` sạch
- [ ] Test đơn vị cho logic mới đã pass
- [ ] Đã chạy thật trên browser agent, có ảnh chụp
- [ ] Tài liệu liên quan đã cập nhật
- [ ] Không có secret trong diff
- [ ] `npm run verify:own -- <TÊN AGENT>` xanh — không sửa file của agent khác
- [ ] `npm run verify:db` xanh (bắt buộc nếu task đụng database) — dán kết quả vào báo cáo
- [ ] `npm run verify:build` xanh (bắt buộc nếu task đụng giao diện, style hoặc biến môi trường)
- [ ] Trạng thái task trong `tasks/TASK-INDEX.md` đã đổi
