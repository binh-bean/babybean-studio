-- ============================================================================
-- 0099 — Quyền theo vai, anh chốt 06/10/2026 (BB-383)
--
-- 1. CTV chỉnh ảnh (`photoshop_ctv`) được XEM khách đã chọn ảnh nào
--    (`selections:read`) — CHỈ bộ được giao cho mình (`galleries.editor_id`).
--    Luật `selections_select` cũ (0056) chỉ xét quyền + chi nhánh, không xét
--    "được giao": cấp quyền mà không sửa luật thì CTV đọc được lượt chọn của
--    MỌI bộ trong chi nhánh. Nên mục 5 dưới đây thêm điều kiện được giao — cùng
--    hình với `selection_items_select` và `galleries_select` của 0056. Vai có
--    `galleries:all_in_branch` (mọi vai hệ thống trừ CTV) không đổi gì.
-- 2. Thợ chỉnh (`retoucher`) tự "Gửi khách duyệt" ảnh chỉnh: quyền MỚI
--    `anh_chinh:gui_khach`, cấp cho owner, admin, cs, retoucher. Route
--    `[id]/anh-chinh-sua/gui-khach` nhận quyền này HOẶC `galleries:write`.
-- 3. Thợ chụp (`photographer`) bấm "Đồng bộ ảnh": route `[id]/sync` nhận
--    `galleries:sync` HOẶC `galleries:write`. Thợ chụp có `galleries:sync` từ
--    0052 — dòng dưới chỉ bảo đảm (dữ liệu đã sửa tay qua màn Vai trò).
-- 4. Vai "Photo" (tên hiển thị của `photographer`, src/i18n/vi.ts) sửa THÔNG
--    TIN bộ ảnh — anh chốt 07/10 (BB-383b): "Chỉ sửa thông tin bộ, không tiền".
--    KHÔNG cấp `galleries:write` (quyền đó mở cả thu tiền, xác nhận danh sách,
--    dòng hàng, hợp đồng). Thay bằng quyền MỚI hẹp `galleries:edit_info`
--    ("Sửa thông tin bộ ảnh"): route `[id]/drive`, `[id]/ten-be`, `[id]/bia`
--    nhận quyền này HOẶC `galleries:write`. Cấp cho photographer, và cho owner,
--    admin, branch_manager, cs để bảng quyền nhất quán (họ đã có write).
--
-- Chạy lại được: mỗi câu chỉ thêm khi chưa có; luật RLS drop-rồi-tạo.
-- Vai hệ thống chặn sửa bằng trigger `app.chan_sua_vai_he_thong` (0055) trừ
-- khi chạy bằng `postgres` — tức là bằng migration như tệp này.
--
-- Đảo ngược (chạy bằng postgres):
--   update roles set permissions = array_remove(permissions, 'selections:read')
--    where id = '00000000-0000-0000-0000-000000000009';
--   update roles set permissions = array_remove(permissions, 'anh_chinh:gui_khach')
--    where id in ('00000000-0000-0000-0000-000000000001',
--                 '00000000-0000-0000-0000-000000000002',
--                 '00000000-0000-0000-0000-000000000004',
--                 '00000000-0000-0000-0000-000000000006');
--   update roles set permissions = array_remove(permissions, 'galleries:edit_info')
--    where id in ('00000000-0000-0000-0000-000000000001',
--                 '00000000-0000-0000-0000-000000000002',
--                 '00000000-0000-0000-0000-000000000003',
--                 '00000000-0000-0000-0000-000000000004',
--                 '00000000-0000-0000-0000-000000000005');
--   -- (giữ `galleries:sync` của photographer — có từ 0052)
--   drop policy if exists selections_select on selections;
--   create policy selections_select on selections for select to authenticated
--     using (app.has_permission('selections:read') and exists (
--       select 1 from galleries g
--       where g.id = selections.gallery_id and app.can_see_branch(g.branch_id)));
-- ============================================================================

-- --- 1. CTV chỉnh ảnh xem lượt chọn ----------------------------------------
update roles
   set permissions = array_append(permissions, 'selections:read')
 where id = '00000000-0000-0000-0000-000000000009'
   and name = 'photoshop_ctv'
   and not ('selections:read' = any (permissions));

-- --- 2. Quyền mới: gửi ảnh chỉnh cho khách duyệt ---------------------------
update roles
   set permissions = array_append(permissions, 'anh_chinh:gui_khach')
 where id in ('00000000-0000-0000-0000-000000000001',  -- owner
              '00000000-0000-0000-0000-000000000002',  -- admin
              '00000000-0000-0000-0000-000000000004',  -- cs
              '00000000-0000-0000-0000-000000000006')  -- retoucher
   and name in ('owner', 'admin', 'cs', 'retoucher')
   and not ('anh_chinh:gui_khach' = any (permissions));

-- --- 3. Thợ chụp đồng bộ ảnh (bảo đảm) -------------------------------------
update roles
   set permissions = array_append(permissions, 'galleries:sync')
 where id = '00000000-0000-0000-0000-000000000005'
   and name = 'photographer'
   and not ('galleries:sync' = any (permissions));

-- --- 4. Sửa THÔNG TIN bộ ảnh (không tiền) — quyền mới hẹp ------------------
update roles
   set permissions = array_append(permissions, 'galleries:edit_info')
 where id in ('00000000-0000-0000-0000-000000000001',  -- owner
              '00000000-0000-0000-0000-000000000002',  -- admin
              '00000000-0000-0000-0000-000000000003',  -- branch_manager
              '00000000-0000-0000-0000-000000000004',  -- cs
              '00000000-0000-0000-0000-000000000005')  -- photographer
   and name in ('owner', 'admin', 'branch_manager', 'cs', 'photographer')
   and not ('galleries:edit_info' = any (permissions));

-- --- 5. Lượt chọn: chỉ bộ được giao nếu không thấy mọi bộ trong chi nhánh --
drop policy if exists selections_select on selections;
create policy selections_select on selections for select to authenticated
  using (app.has_permission('selections:read') and exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id)
    and (app.has_permission('galleries:all_in_branch') or g.editor_id = auth.uid())));
