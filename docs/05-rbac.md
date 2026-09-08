# 05 — Vai trò & phân quyền

Hai hệ phân quyền tách biệt: **nhân viên** (có tài khoản) và **khách hàng** (chỉ có link).

---

## 1. Vai trò nhân viên

| Vai trò | Ai | Phạm vi dữ liệu |
|---|---|---|
| `owner` | Chủ studio | Toàn hệ thống |
| `admin` | Quản trị hệ thống | Toàn hệ thống |
| `branch_manager` | Quản lý chi nhánh (3 người) | Chi nhánh được gán |
| `cs` | CSKH / lễ tân | Chi nhánh được gán |
| `photographer` | Thợ ảnh | Chi nhánh được gán |
| `retoucher` | Người chỉnh ảnh | Chi nhánh được gán (có thể nhiều) |
| `accountant` | Kế toán | Chi nhánh được gán, chỉ dữ liệu tài chính |
| `viewer` | Thực tập / xem báo cáo | Chi nhánh được gán, chỉ đọc |

## 2. Ma trận quyền

`C` tạo · `R` đọc · `U` sửa · `D` xoá · `—` không có quyền

| Chức năng | owner | admin | branch_manager | cs | photographer | retoucher | accountant | viewer |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Dashboard toàn hệ thống | R | R | — | — | — | — | — | — |
| Dashboard chi nhánh | R | R | R | R | R | R | R | R |
| Album — xem | R | R | R | R | R | R | R | R |
| Album — tạo | C | C | C | C | C | — | — | — |
| Album — sửa cấu hình | U | U | U | U | — | — | — | — |
| Album — đồng bộ Drive | U | U | U | U | U | — | — | — |
| Album — gửi/thu hồi link | U | U | U | U | — | — | — | — |
| Album — **mở lại sau chốt** | U | U | U | — | — | — | — | — |
| Album — xoá/lưu trữ | D | D | D | — | — | — | — | — |
| Album — xuất danh sách | R | R | R | R | R | R | — | — |
| Lựa chọn của khách — sửa | — | — | — | — | — | — | — | — |
| Khách hàng | CRUD | CRUD | CRUD | CRU | R | R | R | R |
| Gói chụp | CRUD | CRUD | CRU | R | R | R | R | R |
| Chi nhánh | CRUD | CRUD | RU | R | R | R | R | R |
| Nhân sự | CRUD | CRUD | R | R | — | — | — | — |
| Phân vai trò | U | U | — | — | — | — | — | — |
| Nhật ký hoạt động | R | R | R | — | — | — | — | — |
| Báo cáo vận hành | R | R | R | R | — | — | R | R |
| Báo cáo doanh thu | R | R | R | — | — | — | R | — |
| Cài đặt hệ thống | CRUD | CRUD | — | — | — | — | — | — |
| Cài đặt chi nhánh | CRUD | CRUD | RU | R | — | — | — | — |
| Hàng đợi retouch | R | R | RU | RU | R | RU | — | — |
| Giao hàng | CRUD | CRUD | CRUD | CRU | R | RU | R | R |

**Ba quy tắc không được phá**

1. **Không ai sửa được lựa chọn của khách.** Kể cả `owner`. Muốn đổi thì `reopen` album (có ghi lý do + log) rồi để khách chọn lại. Đây là lá chắn khi có tranh chấp.
2. **Không ai tự nâng quyền cho chính mình.** RLS policy `staff_update_self` chặn việc tự đổi `role` và `is_active`.
3. **`accountant` không thấy ảnh.** Chỉ thấy số liệu tổng hợp và tiền.

## 3. Thực thi ở đâu

Ba lớp, phải có đủ cả ba:

| Lớp | Cơ chế | Ai làm |
|---|---|---|
| Điều hướng | `middleware.ts` chặn `/admin/**` nếu chưa đăng nhập | SEC-ARCH |
| Ứng dụng | `requireRole()` / `requireBranch()` đầu mỗi route handler | DEV-BE |
| Cơ sở dữ liệu | RLS policy trong `db/policies.sql` | SEC-ARCH |

```ts
// src/lib/auth/staff.ts — mẫu bắt buộc dùng ở mọi route quản trị
const staff = await requireStaff();                          // 401 nếu chưa đăng nhập
requireRole(staff, ['owner', 'admin', 'branch_manager']);    // 403 nếu sai vai
requireBranch(staff, gallery.branch_id);                     // 403 nếu khác chi nhánh
```

UI ẩn nút theo quyền chỉ để đỡ rối mắt — **không tính là biện pháp bảo mật**.

---

## 4. Vai trò khách hàng (theo share link)

| Vai | Xem ảnh | Chọn | Đề xuất | Yêu thích | Ghi chú | Chốt đơn | Mời thêm |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| `owner` (khách chính) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `co_editor` (vợ/chồng) | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `suggester` (người thân) | ✓ | — | ✓ | ✓ | ✓ | — | — |
| `viewer` (xem chung) | ✓ | — | — | — | — | — | — |

- Link `owner` được sinh khi tạo album, gửi cho khách chính.
- Các link khác do khách chính tự tạo hoặc nhân viên tạo hộ.
- Lựa chọn của `suggester` hiện dưới dạng gợi ý, **không tính vào quota**.
- `co_editor` chọn vào cùng phiên primary → tính vào quota.
- Tối đa 5 link phụ mỗi album.

## 5. Bảo vệ link chia sẻ

| Biện pháp | Chi tiết |
|---|---|
| Độ dài token | 22 ký tự base62 (~131 bit) — không thể dò |
| Lưu trữ | Chỉ lưu SHA-256; token gốc không nằm trong DB |
| PIN | 4 số, bcrypt cost 10, mặc định 4 số cuối SĐT |
| Chống dò PIN | 5 lần sai / 15 phút → khoá link 15 phút |
| Chống dò token | 20 request 404 / 5 phút / IP → chặn 1 giờ |
| Hết hạn | `expires_at` tuỳ chọn; mặc định 90 ngày sau `due_at` |
| Thu hồi | `status = 'revoked'` → mọi phiên hiện có bị vô hiệu ngay |
| Phiên | JWT 7 ngày, HttpOnly, Secure, SameSite=Lax; đổi PIN → thu hồi toàn bộ phiên |
| Không lộ tồn tại | Token sai và token hết hạn trả cùng dạng lỗi khi chưa xác thực |

## 6. Ma trận nghiệm thu cho SEC-ARCH

Mỗi dòng phải có một test tự động trong `tests/security/`:

| # | Kịch bản | Kết quả mong đợi |
|---|---|---|
| 1 | `cs` chi nhánh A đọc album chi nhánh B | 0 dòng / 403 |
| 2 | `photographer` gọi `PATCH /admin/galleries/:id` | 403 |
| 3 | `cs` gọi `POST /admin/galleries/:id/reopen` | 403 |
| 4 | Nhân viên bất kỳ `UPDATE selection_items` | lỗi RLS |
| 5 | Nhân viên tự `UPDATE` `role` của mình | lỗi RLS |
| 6 | `anon` `SELECT` bất kỳ bảng nào | lỗi quyền |
| 7 | Khách dùng cookie album A gọi `/api/g/photos` khi cookie trỏ album B | chỉ ra ảnh album trong cookie |
| 8 | `viewer` link gọi `PATCH /api/g/selection` | 403 |
| 9 | `suggester` gửi `mark: "selected"` | lưu thành `suggested` |
| 10 | Gọi `/api/g/submit` hai lần | lần hai `GALLERY_LOCKED` |
| 11 | Sai PIN 6 lần | lần 6 trả `PIN_LOCKED` |
| 12 | `GET /api/img/<photo của album khác>` | 403 |
| 13 | `accountant` gọi `/api/g/photos` hoặc `/api/img` | 403 |
| 14 | Token đã `revoked` | 410 `LINK_EXPIRED` |
