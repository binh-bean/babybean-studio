-- ============================================================================
-- 0056 — Lớp RLS thôi đọc TÊN VAI (BB-172 chặng 2c)
--
-- Chặng 2a đổi ba cổng (`can_write`, `can_manage_customers`, `is_superuser`)
-- sang hỏi bảng quyền, nhưng cố ý để lại mười ba chỗ trong `db/policies.sql`
-- vẫn so thẳng với tên vai: `app.my_role() != 'photoshop_ctv'`,
-- `!= 'accountant'`, `= 'branch_manager'`, và một danh sách năm tên vai.
--
-- Chừng nào còn những dòng đó thì **vai tự tạo vẫn vô nghĩa**: chủ studio tích
-- chọn quyền xong, gán cho một người, và người đó vẫn bị mười ba luật kia xét
-- theo cái tên vai cũ nằm ở cột `staff_profiles.role`.
--
-- ---------------------------------------------------------------------------
-- Ba quyền mới, và vì sao phải là quyền mới chứ không tái dùng quyền cũ
-- ---------------------------------------------------------------------------
-- · `photos:read`             — xem ảnh trong album. Kế toán KHÔNG có; họ xem
--                               được album và tiền, không xem ảnh của bé.
-- · `selections:read`         — xem khách đã chọn ảnh nào. Thợ chỉnh ngoài
--                               (`photoshop_ctv`) không có.
-- · `galleries:all_in_branch` — thấy MỌI album trong chi nhánh. Ai không có thì
--                               chỉ thấy album mình được giao (`editor_id`).
--
-- Cái thứ ba là một phạm vi, không phải một nút bật/tắt — nhưng nó vẫn là câu
-- hỏi "người này được thấy tới đâu", nên vẫn là một quyền. Tái dùng
-- `galleries:read` cho nó thì thợ chỉnh ngoài mất luôn album của chính mình.
--
-- ---------------------------------------------------------------------------
-- Quy tắc đổi: KHÔNG ai được thêm hay mất quyền sau tệp này
-- ---------------------------------------------------------------------------
-- Mỗi dòng dưới đây gán quyền mới cho đúng những vai hôm nay đang qua được cửa
-- tương ứng. `docs/05-rbac.md §6` có 14 bài kiểm; chúng là thứ nói tệp này
-- đúng hay sai, không phải lời cam đoan ở đây.
-- ============================================================================

-- --- 1. Ba quyền mới, gán cho đúng những vai đang có ------------------------
update roles set permissions = permissions || '{photos:read}'
 where name <> 'accountant' and not ('photos:read' = any(permissions));

update roles set permissions = permissions || '{selections:read}'
 where name <> 'photoshop_ctv' and not ('selections:read' = any(permissions));

update roles set permissions = permissions || '{galleries:all_in_branch}'
 where name <> 'photoshop_ctv' and not ('galleries:all_in_branch' = any(permissions));

-- --- 2. customers ----------------------------------------------------------
drop policy if exists customers_select on customers;
create policy customers_select on customers for select to authenticated
  using (app.can_see_branch(branch_id) and app.has_permission('customers:read'));

-- --- 3. packages -----------------------------------------------------------
drop policy if exists packages_select on packages;
create policy packages_select on packages for select to authenticated
  using ((branch_id is null or app.can_see_branch(branch_id)) and app.has_permission('packages:read'));

-- Gói dùng chung toàn hệ thống (`branch_id is null`) chỉ vai vượt chi nhánh
-- mới đụng được — giữ nguyên như cũ.
drop policy if exists packages_write on packages;
create policy packages_write on packages for all to authenticated
  using (app.is_superuser()
    or (app.has_permission('packages:write') and branch_id is not null and app.can_see_branch(branch_id)))
  with check (app.is_superuser()
    or (app.has_permission('packages:write') and branch_id is not null and app.can_see_branch(branch_id)));

-- --- 4. galleries ----------------------------------------------------------
drop policy if exists galleries_select on galleries;
create policy galleries_select on galleries for select to authenticated
  using (app.can_see_branch(branch_id)
    and (app.has_permission('galleries:all_in_branch') or editor_id = auth.uid()));

-- --- 5. photos -------------------------------------------------------------
drop policy if exists photos_select on photos;
create policy photos_select on photos for select to authenticated
  using (
    app.has_permission('photos:read') and
    exists (
      select 1 from galleries g
      where g.id = photos.gallery_id and app.can_see_branch(g.branch_id)
      and (app.has_permission('galleries:all_in_branch') or g.editor_id = auth.uid())
    )
  );

-- --- 6. share_links --------------------------------------------------------
drop policy if exists share_links_select on share_links;
create policy share_links_select on share_links for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id)
    and (app.has_permission('galleries:all_in_branch') or g.editor_id = auth.uid())));

-- --- 7. selections / selection_items ---------------------------------------
drop policy if exists selections_select on selections;
create policy selections_select on selections for select to authenticated
  using (app.has_permission('selections:read') and exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id)));

drop policy if exists selection_items_select on selection_items;
create policy selection_items_select on selection_items for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = selection_items.gallery_id and app.can_see_branch(g.branch_id)
    and (app.has_permission('galleries:all_in_branch') or g.editor_id = auth.uid())));

-- --- 8. deliveries ---------------------------------------------------------
drop policy if exists deliveries_write on deliveries;
create policy deliveries_write on deliveries for all to authenticated
  using (app.can_see_branch(branch_id) and app.has_permission('deliveries:write'))
  with check (app.can_see_branch(branch_id) and app.has_permission('deliveries:write'));

-- --- 9. settings -----------------------------------------------------------
drop policy if exists settings_write on settings;
create policy settings_write on settings for all to authenticated
  using (app.is_superuser()
    or (app.has_permission('settings:branch:write') and branch_id is not null and app.can_see_branch(branch_id)))
  with check (app.is_superuser()
    or (app.has_permission('settings:branch:write') and branch_id is not null and app.can_see_branch(branch_id)));
