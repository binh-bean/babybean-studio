# 10 — Kiểm thử & nghiệm thu

Chủ sở hữu: **QA-BOT**. Mọi agent đều phải viết test cho phần mình làm.

## 1. Tháp kiểm thử

| Tầng | Công cụ | Phạm vi | Ai viết |
|---|---|---|---|
| Đơn vị | Vitest | Hàm thuần: parse link, tính quota, natural sort, format tiền | Agent sở hữu code |
| Tích hợp | Vitest + Supabase local | Route handler + DB thật (container) | DEV-BE |
| Bảo mật | Vitest + Supabase local | RLS, phân quyền, phiên | SEC-ARCH |
| E2E | Playwright | Luồng người dùng đầy đủ | QA-BOT |
| Thủ công | Browser agent | Cảm quan, mobile thật | QA-BOT |

## 2. Bắt buộc phải có test đơn vị

| Module | Ca kiểm thử |
|---|---|
| `drive/parse-link` | 4 dạng link hợp lệ · ID thuần · link Docs (phải từ chối) · chuỗi rỗng · link có khoảng trắng thừa |
| `drive/list-files` | Phân trang nhiều token · lọc file không phải ảnh · đệ quy 2 cấp · thư mục rỗng |
| `selection/quota` | Dưới quota · đúng quota · vượt 1 · vượt nhiều · `allowExtra=false` · `maxSelection` chặn |
| `utils/natural-sort` | `IMG_9 < IMG_10` · tên có dấu tiếng Việt · tên trùng |
| `utils/format` | Tiền VND · ngày giờ theo `Asia/Ho_Chi_Minh` · số điện thoại che giữa |
| `auth/gallery-session` | Ký/giải mã JWT · hết hạn · chữ ký sai · thiếu trường |

## 3. Test tích hợp bắt buộc

| # | Kịch bản | Mong đợi |
|---|---|---|
| I-1 | `PATCH /api/g/selection` cùng `clientOpId` hai lần | Lần hai `applied: 0`, số đếm không đổi |
| I-2 | Hai request đồng thời chọn 2 ảnh khác nhau | Cả hai được ghi, đếm đúng |
| I-3 | Chọn vượt `maxSelection` | 409 `QUOTA_EXCEEDED`, **không ghi mục nào** |
| I-4 | Submit hai lần | Lần hai 409 `GALLERY_LOCKED` |
| I-5 | Submit rồi thử `PATCH selection` | 409 `GALLERY_LOCKED` |
| I-6 | Đồng bộ lại khi Drive mất 1 file | `status='missing'`, `selection_items` còn nguyên |
| I-7 | Đồng bộ lại khi Drive thêm 10 file | Thêm đúng 10 dòng, `sort_index` liên tục |
| I-8 | Mọi hành động ghi dữ liệu | Có đúng 1 dòng `activity_logs` tương ứng |
| I-9 | `reopen` không kèm `reason` | 400 `INVALID_INPUT` |
| I-10 | Export sau khi submit | Trả đúng số ảnh bằng `snapshot_selected_count` |

## 4. Test bảo mật

14 ca ở [`docs/05-rbac.md §6`](05-rbac.md) là **bắt buộc**, nằm trong `tests/security/`. Không pass đủ 14 thì không được deploy production.

Thêm:
- Grep `.next/static/**` đảm bảo không có `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_DRIVE_API_KEY`, `APP_SECRET`.
- Trang `/g/**` phải có header `X-Robots-Tag: noindex`.
- Cookie phiên khách phải có `HttpOnly`, `Secure`, `SameSite=Lax`.

## 5. Kịch bản E2E (Playwright)

| # | Tên | Các bước |
|---|---|---|
| E-1 | Vòng đời hạnh phúc | Nhân viên đăng nhập → tạo album từ link Drive giả lập → đồng bộ → copy link → khách mở → nhập PIN → chọn 20 ảnh → chốt → nhân viên xuất CSV → đối chiếu đúng 20 tên file |
| E-2 | Vượt quota | Chọn 24/20 → thấy cảnh báo → review hiện 200.000đ → chốt → admin thấy `extra_count = 4` |
| E-3 | Ghi chú chỉnh sửa | Ghi chú 3 ảnh + ghi chú chung → chốt → export CSV chứa đủ ghi chú |
| E-4 | PIN sai | Sai 5 lần → khoá → đợi → thử lại được |
| E-5 | Mời người thân | Khách chính tạo link `suggester` → người thân đề xuất 5 ảnh → khách chính thấy gợi ý → quota không đổi |
| E-6 | Offline | Ngắt mạng giữa lúc chọn → chọn tiếp 3 ảnh → thấy "Chưa lưu" → nối mạng → tự đồng bộ → reload vẫn đủ |
| E-7 | Album đã chốt | Mở lại link → chỉ đọc, không bấm chọn được |
| E-8 | Mở lại | Manager reopen kèm lý do → khách chọn lại được → có log |
| E-9 | Link hết hạn | Token đã thu hồi → trang 410 thân thiện |
| E-10 | Đa chi nhánh | `cs` chi nhánh A không thấy album chi nhánh B trong danh sách |
| E-11 | Album lớn | Album 1.000 ảnh → cuộn tới cuối → không sập, không rò bộ nhớ |
| E-12 | Mobile | Viewport 375×812, cảm ứng: chọn, vuốt lightbox, chốt |

## 6. Ngưỡng hiệu năng

| Chỉ số | Ngưỡng | Đo bằng |
|---|---|---|
| LCP trang gallery (4G mô phỏng) | ≤ 2,5s | Lighthouse CI |
| INP khi chạm chọn ảnh | ≤ 200ms | Lighthouse CI |
| CLS | ≤ 0,1 | Lighthouse CI |
| API p95 | ≤ 400ms | Ghi log Vercel |
| Đồng bộ 1.000 ảnh | ≤ 30s | Test tích hợp |
| Bộ nhớ sau khi cuộn hết album 1.500 ảnh | ≤ 300MB | Playwright + CDP |
| Kích thước JS bundle trang gallery | ≤ 180KB gzip | `next build` |

## 7. Checklist nghiệm thu trước khi lên production

**Chức năng**
- [ ] Tất cả E2E pass trên Chrome, Safari, Chrome Android
- [ ] 14 test bảo mật pass
- [ ] Album thật ≥ 500 ảnh chạy trọn vòng
- [ ] Xuất danh sách dán được vào Lightroom, đúng số lượng

**Chất lượng**
- [ ] `npm run verify` xanh
- [ ] Độ phủ test cho `src/lib/**` ≥ 70%
- [ ] Không có `console.log` trong code sản phẩm
- [ ] Không có `any`, không có `@ts-ignore` thiếu lý do

**Bảo mật**
- [ ] Không có secret trong bundle client
- [ ] Header bảo mật đầy đủ (`noindex` trên `/g/**`)
- [ ] Rate limit hoạt động trên 6 endpoint ở `docs/04-api-spec.md §5`
- [ ] RLS bật trên **tất cả** bảng

**Vận hành**
- [ ] Sentry nhận lỗi
- [ ] Cron chạy đúng giờ
- [ ] Backup DB hằng ngày (Supabase PITR)
- [ ] Trang lỗi 404/500 có nội dung tiếng Việt tử tế
- [ ] Nhân viên chi nhánh đã được hướng dẫn 15 phút và tự làm được

## 8. Dữ liệu test

- `tests/fixtures/drive-responses/` — bản ghi phản hồi Drive API thật (đã ẩn danh) cho: 50 ảnh, 1.000 ảnh, có thư mục con, lỗi 403, lỗi 429.
- `db/seed.sql` — 3 chi nhánh, 4 gói, 5 nhân sự đủ 5 vai trò, 10 khách, 3 album ở 3 trạng thái khác nhau.
- **Không dùng ảnh trẻ em thật trong test.** Dùng ảnh placeholder trung tính.
