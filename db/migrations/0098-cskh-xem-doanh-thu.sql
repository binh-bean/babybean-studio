-- ============================================================================
-- 0098 — Cấp quyền xem doanh thu (`reports:financial`) cho vai CSKH (`cs`).
--
-- Anh chốt 06/10/2026: CSKH làm cả việc bán (sales) nên cần thấy số tiền ở dải
-- "Sáu con số điều hành" và báo cáo Sales / Doanh thu mua thêm (BB-380).
-- Trước đó chỉ owner, admin, branch_manager, accountant có quyền này (0052).
--
-- Chạy lại được: chỉ thêm khi chưa có. Không đụng vai khác, không tạo hàm.
-- Đảo ngược:
--   update roles set permissions = array_remove(permissions, 'reports:financial')
--    where id = '00000000-0000-0000-0000-000000000004';
-- ============================================================================

update roles
   set permissions = array_append(permissions, 'reports:financial')
 where id = '00000000-0000-0000-0000-000000000004'
   and name = 'cs'
   and not ('reports:financial' = any (permissions));
