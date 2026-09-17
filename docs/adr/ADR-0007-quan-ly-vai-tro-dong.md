# ADR-0007 — Quản lý vai trò động (Dynamic RBAC)

- **Trạng thái**: Đề xuất
- **Ngày**: 2026-09-17
- **Người quyết định**: PM / Tech Lead

## Bối cảnh

Hiện tại, hệ thống phân quyền (RBAC) sử dụng danh sách vai trò cố định (`owner`, `admin`, `branch_manager`, `cs`, v.v.). Quyền hạn của các vai trò này được "cứng hóa" (hard-code) trong tài liệu `docs/05-rbac.md`, trong mã nguồn (các hàm `requireRole` ở Backend) và đặc biệt là trong các Row Level Security (RLS) policy ở cơ sở dữ liệu (ví dụ hàm `app.can_write()`, `app.can_manage_customers()`).

Chủ studio mong muốn: "Chưa có bảng vai trò để tạo và cài đặt cho từng vai trò mà tôi muốn bằng cách tích chọn các chức năng nhân sự có thể sử dụng và quyền hạn sử dụng như đọc, ghi, sửa, xóa."

Điều này đòi hỏi phải chuyển từ mô hình "Vai trò cố định" (Static Roles) sang "Vai trò động" (Dynamic Roles), nơi admin có thể định nghĩa vai trò mới và gán các quyền cụ thể.

## Các phương án đã cân nhắc

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Dịch chuyển kiểm tra quyền lên tầng Ứng dụng** (Bỏ RLS hoặc nới lỏng) | Dễ triển khai, API truy vấn nhanh, giảm tải cho Postgres. | **Rủi ro cực cao.** RLS là chốt chặn cuối cùng. Nếu nới lỏng RLS, một lỗi code hoặc lỗ hổng API có thể làm lộ dữ liệu chéo giữa các chi nhánh hoặc lộ dữ liệu nhạy cảm. |
| **B. Vai trò động, kiểm tra bằng bảng `permissions` trong RLS** | Giữ được sự an toàn của RLS. API chỉ cần thiết lập cấu hình. | Truy vấn RLS sẽ chậm hơn do phải thực hiện `JOIN` bảng quyền trên mỗi dòng dữ liệu, có nguy cơ gây tắc nghẽn (bottleneck) CSDL. |
| **C. Vai trò động, lưu danh sách quyền ở cột `permissions` (JSONB/Array) trong bảng `roles`** | Giữ RLS, giảm thiểu `JOIN` vì chỉ cần đọc mảng quyền trực tiếp từ bảng `roles` liên kết với `staff_profiles`. Hiệu năng tốt hơn. | Quản lý dữ liệu phân tán phức tạp hơn, khó truy vấn ngược (ai đang có quyền X). |

## Quyết định

Chọn **Phương án C** kết hợp bộ khung bảo mật hiện tại: **Giữ lại kiểm tra phân quyền trong RLS, sử dụng bảng `roles` với trường `permissions` (text[]) để kiểm tra quyền động.**

Thay vì cứng hóa tên vai trò, chúng ta sẽ cứng hóa tên quyền (ví dụ: `galleries:write`, `customers:manage`, `settings:manage`). Người dùng tự tạo vai trò sẽ đóng gói một danh sách các quyền này.

Dưới đây là thiết kế chi tiết để trả lời 4 câu hỏi cốt lõi:

**1. Quyền được kiểm ở đâu?**
Vẫn kiểm ở **Cơ sở dữ liệu (RLS)** kết hợp **Tầng ứng dụng (Route handler)**.
Chúng ta không từ bỏ lớp bảo vệ RLS. Lớp RLS sẽ thay đổi từ việc so sánh `role in ('admin', 'owner')` sang việc kiểm tra `has_permission('galleries:write')`.
*Cái giá phải trả*: Việc giữ quyền ở RLS với dữ liệu động sẽ tăng tải cho cơ sở dữ liệu. Để giảm thiểu chi phí hiệu năng, danh sách quyền của user sẽ được truy xuất thông qua hàm `SECURITY DEFINER` và có thể cần cơ chế caching tĩnh trong scope của Postgres session (nếu Postgres hỗ trợ) hoặc truy vấn nhẹ vào cấu trúc array/jsonb thay vì join nhiều bảng quan hệ.

**2. Vai trò tự tạo thì luật quyền đọc chúng thế nào?**
Tạo bảng `roles (id, name, permissions text[], is_system boolean)`. `staff_profiles` sẽ có cột `role_id`.
Các hàm helper RLS sẽ được sửa đổi:
Hàm `app.has_permission(p text)` sẽ tìm `role_id` của user hiện tại, đối chiếu vào mảng `permissions` của vai trò đó.
*Cái giá phải trả*: Mỗi truy vấn của RLS sẽ tốn thêm chi phí tra cứu mảng quyền từ bảng `roles`. Điều này yêu cầu index tối ưu hoặc thiết kế hàm helper cực nhẹ, có rủi ro tăng thời gian chạy (latency) của toàn bộ hệ thống lên một vài mili-giây cho mỗi truy vấn.

**3. Vai trò nào KHÔNG được sửa?**
Vai trò `owner` là bất biến. Chúng ta sẽ áp dụng cờ `is_system = true` cho vai trò này (và có thể là `admin`).
Tại bảng `roles`, sẽ có RLS hoặc trigger ngăn chặn tuyệt đối lệnh `UPDATE` hoặc `DELETE` nếu `is_system = true`. Đồng thời, ở tầng API cũng sẽ chặn các tác động này. Điều này đảm bảo `owner` luôn có full quyền và không bao giờ tự nhốt mình ngoài hệ thống.
*Cái giá phải trả*: Mất đi một phần tính "động" của hệ thống. Dữ liệu của các vai trò hệ thống sẽ không được phép sửa đổi qua giao diện mới, phải tách biệt UI hoặc hiển thị dưới dạng read-only, gây thêm chút công sức làm frontend. Cần tốn thêm tài nguyên viết Postgres Trigger hoặc Policy riêng để bảo vệ các dòng này.

**4. Đổi quyền có ghi lại không?**
Có. Mọi thay đổi về tạo, sửa, xóa vai trò và việc gán quyền sẽ được ghi lại trong bảng `activity_logs`. API cập nhật role sẽ đẩy vào log một record với action như `role_updated` kèm chi tiết về quyền cũ (`old_permissions`) và quyền mới (`new_permissions`) trong trường `details` JSONB.
*Cái giá phải trả*: Kích thước bảng `activity_logs` sẽ tăng lên. Việc xây dựng logic API cho phần này sẽ tốn công hơn vì phải so sánh sự khác biệt (diff) giữa quyền cũ và mới để ghi log cho chuẩn xác và có ý nghĩa, thay vì chỉ lưu 1 chuỗi 'Thêm vai trò' vô hồn.

## Hệ quả

**Tích cực**:
- Đáp ứng được nhu cầu thực tế của studio trong việc tùy chỉnh nhân sự.
- Hệ thống bảo mật (RLS) được bảo toàn, không lo lộ lọt dữ liệu.

**Tiêu cực và cách sống chung**:
- Chậm truy vấn cơ sở dữ liệu hơn trước. Cần theo dõi hiệu năng của `app.has_permission` sau khi đưa vào thực tế. Nếu quá tải, có thể cần đẩy các claim quyền vào JWT token của Supabase Auth để RLS đọc từ `auth.jwt()` thay vì query bảng (nhưng sẽ tốn thời gian đồng bộ token khi quyền thay đổi).
- Số lượng policy cần viết lại tương đối nhiều.

## Điều kiện xem lại

Quyết định này cần xem xét lại khi:
- Số lượng vai trò và phân quyền quá lớn khiến mảng `permissions` cồng kềnh, gây suy giảm hiệu năng truy vấn rõ rệt.
- Có nhu cầu phân quyền tới cấp độ mịn (fine-grained) mà danh sách permission tĩnh (như `galleries:write`) không đáp ứng được (ví dụ: chỉ được sửa album X chứ không sửa album Y, mặc dù cùng một chi nhánh).

## Ước lượng công việc (Chặng 2)

- **Số lượng migration**: Cần ít nhất 2 file migration. Một file để tạo bảng `roles` và cập nhật dữ liệu mồi (seed system roles), một file để đổi kiểu dữ liệu cột `role` trong `staff_profiles` thành `role_id` (hoặc map sang roles) và viết lại các hàm `app.*`.
- **Số lượng chính sách (policy) cần viết lại**: Gần như toàn bộ các hàm hỗ trợ trong `db/policies.sql` (khoảng 4-5 hàm như `app.can_write`, `app.can_manage_customers`, `app.is_superuser`). Khoảng 10-15 policy lệ thuộc trực tiếp hoặc gián tiếp vào các hàm này sẽ bị ảnh hưởng ngầm.
- **Phần cần SEC-ARCH kiểm soát**: SEC-ARCH BẮT BUỘC phải thực hiện viết lại `policies.sql` và file migration tương ứng cho RBAC, chạy lại trọn bộ 14 bài test bảo mật ở mục 6 `docs/05-rbac.md` để đảm bảo hệ thống không bị thủng.
