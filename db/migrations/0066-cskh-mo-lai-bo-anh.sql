-- 0066 — CSKH được mở lại bộ ảnh đã chốt / quá hạn (quyền riêng galleries:reopen).
--
-- Chủ studio chốt 25/09/2026: "CSKH được mở lại". Khách gọi xin chọn thêm thì
-- CSKH mở ngay, không phải chờ quản lý — luôn bắt ghi lý do và có nhật ký.
--
-- Trước đó hai chỗ nói ngược nhau: docs/05 ghi CSKH KHÔNG được mở lại, còn
-- docs/16 ghi được. Tuyến /api/admin/galleries/[id]/reopen lại chỉ kiểm
-- `galleries:write` — nên thực tế CSKH mở được, và cả vai tự tạo nào có quyền
-- sửa album cũng mở được, dù không ai cấp `galleries:reopen` cho họ. Nay tuyến
-- kiểm đúng `galleries:reopen`, và vai hệ thống `cs` được cấp quyền đó ở đây
-- (tắt được cho từng vai tự tạo ở màn Vai trò).
--
-- Chỉ THÊM vào mảng, không ghi đè: màn Vai trò có thể đã chỉnh mảng này.

update roles
   set permissions = array_append(permissions, 'galleries:reopen')
 where name = 'cs'
   and is_system
   and not ('galleries:reopen' = any(permissions));
