# 12 — Bảo mật & quyền riêng tư

Chủ sở hữu: **SEC-ARCH**.

> Dữ liệu ở đây là **ảnh trẻ sơ sinh kèm tên và số điện thoại phụ huynh**. Đây là loại dữ liệu nhạy cảm nhất mà một studio nhỏ có thể nắm giữ. Mọi quyết định thiết kế phải nghiêng về phía an toàn.

## 1. Tài sản cần bảo vệ

| Tài sản | Mức | Nếu lộ thì sao |
|---|---|---|
| Ảnh trẻ em | **Rất cao** | Tổn hại cho gia đình, mất uy tín studio, có thể vi phạm pháp luật |
| Tên bé, ngày sinh | Cao | Định danh trẻ em |
| SĐT/địa chỉ phụ huynh | Cao | Quấy rối, lừa đảo |
| Link chia sẻ + PIN | Cao | Truy cập trái phép vào album |
| Số liệu doanh thu | Trung bình | Bất lợi cạnh tranh |
| Tài khoản nhân viên | Cao | Truy cập toàn bộ hệ thống |

## 2. Mô hình đe doạ

| # | Kẻ tấn công | Kịch bản | Biện pháp |
|---|---|---|---|
| T1 | Người lạ trên Internet | Dò token trong URL | Token 131 bit; rate limit 20 lần 404/5 phút/IP; không tiết lộ album có tồn tại |
| T2 | Người quen được chuyển tiếp link | Xem album không được phép | PIN mặc định bật; thu hồi link; hết hạn; log lượt xem |
| T3 | Nhân viên chi nhánh khác | Xem/ tải album chi nhánh mình không phụ trách | RLS theo chi nhánh (3 lớp thực thi) |
| T4 | Nhân viên cũ đã nghỉ | Đăng nhập lại | `is_active = false` chặn ở `app.my_role()`; buộc thu hồi phiên Supabase |
| T5 | Kẻ tấn công có link Drive gốc | Xem toàn bộ ảnh không qua app | **Không đưa link Drive cho khách.** Phase 2 chuyển sang Shared Drive + service account |
| T6 | Bot thu thập | Ảnh bị index lên Google | `X-Robots-Tag: noindex` + `Referrer-Policy: no-referrer` + không sitemap |
| T7 | Chính agent AI trong quá trình dev | Vô tình đưa secret vào bundle hoặc log | Test tự động grep bundle; quy tắc trong `AGENTS.md`; review của Claude |
| T8 | XSS qua ghi chú của khách | Chiếm phiên nhân viên | React tự escape; không dùng `dangerouslySetInnerHTML`; CSP |
| T9 | Nhân viên bất mãn | Xuất toàn bộ dữ liệu khách | Ghi log mọi lần export; giới hạn tần suất; chỉ `cs` trở lên |
| T10 | Tranh chấp với khách | "Tôi không chọn ảnh đó" | Không ai sửa được `selection_items`; snapshot lúc chốt; nhật ký đầy đủ |

## 3. Xác thực

### Nhân viên
- Supabase Auth: email + mật khẩu ≥ 10 ký tự, hoặc Google Workspace SSO.
- Phiên 8 giờ, refresh token 30 ngày; đăng xuất thu hồi cả hai.
- Khoá 15 phút sau 10 lần đăng nhập sai.
- Bắt buộc 2FA cho `owner` và `admin` (Phase 2).

### Khách hàng
- Không có tài khoản. `token` (22 ký tự base62) + `PIN` (4 số).
- Token: chỉ lưu SHA-256 trong DB.
- PIN: bcrypt cost 10. Mặc định 4 số cuối SĐT — **có thể đoán được nếu biết SĐT**, nên PIN chỉ là lớp phòng vệ thứ hai sau token, không phải lớp duy nhất. Cho phép nhân viên đặt PIN tuỳ ý cho khách VIP.
- Sai 5 lần / 15 phút → khoá link 15 phút.
- Phiên: JWT ký `HS256` bằng `APP_SECRET`, hạn 7 ngày, cookie `HttpOnly; Secure; SameSite=Lax; Path=/`.
- Thu hồi link → mọi phiên đang mở mất hiệu lực (kiểm `share_links.status` mỗi request, không chỉ tin JWT).

## 4. Phân quyền

Ba lớp, phải có đủ (chi tiết ở `docs/05-rbac.md`):
1. `middleware.ts` — chặn đường dẫn.
2. `requireStaff/requireRole/requireBranch` — trong route handler.
3. RLS Postgres — hàng rào cuối, kể cả khi code có lỗi.

Đường service-role bỏ qua RLS, nên **mọi truy vấn thay mặt khách bắt buộc ràng buộc `gallery_id` lấy từ cookie đã ký**, không bao giờ từ body/query.

## 5. Bảo vệ dữ liệu

| Lớp | Biện pháp |
|---|---|
| Truyền tải | HTTPS bắt buộc, HSTS |
| Lưu trữ | Supabase mã hoá at-rest; ảnh không nằm trên hệ thống |
| Trong log | Không log token đầy đủ (chỉ 6 ký tự đầu), không log PIN, không log SĐT đầy đủ |
| Trong lỗi | Không trả message Postgres/stack trace ra client |
| Sang bên thứ ba | Không gửi ảnh cho Lark/Zalo/Sentry. Sentry bật `beforeSend` để lọc PII |
| Client bundle | Test CI grep tìm secret trong `.next/static/**` |

## 6. Header bảo mật

```
Content-Security-Policy: default-src 'self';
  img-src 'self' data: blob:;
  script-src 'self' 'unsafe-inline';
  style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
  font-src 'self' https://fonts.gstatic.com;
  connect-src 'self' https://*.supabase.co;
  frame-ancestors 'none';
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
X-Robots-Tag: noindex, nofollow, noarchive     # riêng /g/**
```

Ảnh đi qua proxy cùng origin nên `img-src 'self'` là đủ — đây là một lợi ích nữa của việc không nhúng thẳng URL Google.

## 7. Giới hạn tần suất

Xem bảng đầy đủ ở `docs/04-api-spec.md §5`. Hai chỗ then chốt:
- `POST /api/auth/gallery`: 10 / 15 phút / IP **và** 5 lần sai / 15 phút / link.
- 404 trên `/g/*`: 20 / 5 phút / IP → chặn IP 1 giờ (chống dò token).

Dùng Upstash Redis; nếu chưa cấu hình thì fallback in-memory (chấp nhận được ở Phase 1, **không đủ** cho production nhiều instance).

## 8. Quyền riêng tư & tuân thủ

- **Mục đích sử dụng**: ảnh chỉ dùng để khách chọn và studio sản xuất. Không dùng cho marketing nếu chưa có đồng ý riêng bằng văn bản.
- **Thời hạn lưu**: album `delivered` quá 12 tháng → tự chuyển `archived`, ẩn khỏi cổng khách. Ảnh trên Drive do studio tự quản.
- **Quyền của khách**: yêu cầu xoá dữ liệu → nhân viên xoá `gallery` + `photos` + `selection_items`; `activity_logs` giữ lại ở dạng ẩn danh (thay `actor_label` bằng "[đã xoá]") để bảo toàn nhật ký kiểm toán.
- **Trẻ em**: không hiển thị tên đầy đủ và ngày sinh của bé trên bất kỳ trang công khai nào. Trang chia sẻ chỉ hiện biệt danh.
- **OG image**: dùng ảnh bìa **có watermark**, hoặc ảnh thương hiệu chung. Cân nhắc: dán link vào nhóm chat là ảnh preview hiện ra cho cả nhóm.

## 9. Quy tắc riêng cho agent AI

1. Không bao giờ dán giá trị secret vào code, comment, tài liệu, hay message commit.
2. Không tạo test dùng ảnh trẻ em thật.
3. Không thêm dịch vụ bên thứ ba mới (analytics, CDN ảnh, dịch vụ AI) nếu chưa có ADR được duyệt — dữ liệu ảnh không được rời hệ thống.
4. Không nới lỏng RLS "cho dễ debug". Muốn debug thì dùng service role trong script local.
5. Khi không chắc một thay đổi có ảnh hưởng bảo mật không: ghi vào `tasks/BLOCKERS.md` và hỏi, đừng đoán.

## 10. Kiểm tra định kỳ

| Việc | Tần suất |
|---|---|
| Chạy đủ 14 test bảo mật | Mỗi PR |
| Grep secret trong bundle | Mỗi build |
| `npm audit` | Hằng tuần (Dependabot) |
| Rà soát danh sách nhân sự và vai trò | Hằng tháng |
| Rà soát share link còn hiệu lực, thu hồi link cũ | Hằng quý |
| Diễn tập khôi phục dữ liệu | 6 tháng |
| Rà soát toàn bộ mô hình đe doạ | 6 tháng, hoặc khi thêm module lớn |
