-- ============================================================================
-- 0057 — Quyền GHI thôi tặng kèm quyền ĐỌC (BB-172 chặng 2c)
--
-- ---------------------------------------------------------------------------
-- Cái đo được
-- ---------------------------------------------------------------------------
-- Sau `0056`, `photos_select` đòi `photos:read`. Nhưng đo thật ngày 21/09/2026:
-- gỡ `photos:read` khỏi vai `cs`, rồi hỏi cơ sở dữ liệu bằng chính phiên của
-- một người vai `cs`:
--
--     app.has_permission('photos:read')  ->  false
--     select count(*) from photos        ->  66.190 dòng
--
-- Lý do: `photos_write` khai `for all`. Trong Postgres, chính sách `for all`
-- góp mệnh đề `using` của nó vào **cả lượt SELECT**, và các chính sách được
-- OR với nhau. Nên ai ghi được thì đọc được, bất kể cửa đọc nói gì.
--
-- Đây không phải lỗi `0056` sinh ra — nó có từ ngày dựng `policies.sql`. Nhưng
-- `0056` là lúc nó bắt đầu nói dối: màn Vai trò hiện một ô tích "Xem ảnh", chủ
-- studio bỏ tích, và người đó **vẫn xem được ảnh**. Một ô tích không làm gì
-- đúng là thứ cả tuần nay dự án này đang dọn.
--
-- ---------------------------------------------------------------------------
-- Sửa
-- ---------------------------------------------------------------------------
-- Tách `for all` thành `insert` / `update` / `delete` cho đúng năm bảng có cửa
-- đọc riêng. Điều kiện ghi giữ NGUYÊN từng chữ — chỉ bỏ phần ngầm cho đọc.
--
-- Mười một chính sách `for all` còn lại giữ nguyên: bảng của chúng không có
-- cửa đọc hẹp hơn cửa ghi, nên tách ra không đổi gì mà chỉ thêm chỗ sai.
-- ============================================================================

-- --- photos ----------------------------------------------------------------
drop policy if exists photos_write on photos;

create policy photos_insert on photos for insert to authenticated
  with check (exists (
    select 1 from galleries g
    where g.id = photos.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

create policy photos_update on photos for update to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = photos.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write())
  with check (exists (
    select 1 from galleries g
    where g.id = photos.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

create policy photos_delete on photos for delete to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = photos.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

-- --- customers -------------------------------------------------------------
drop policy if exists customers_write on customers;

create policy customers_insert on customers for insert to authenticated
  with check (app.can_see_branch(branch_id) and app.can_manage_customers());

create policy customers_update on customers for update to authenticated
  using (app.can_see_branch(branch_id) and app.can_manage_customers())
  with check (app.can_see_branch(branch_id) and app.can_manage_customers());

create policy customers_delete on customers for delete to authenticated
  using (app.can_see_branch(branch_id) and app.can_manage_customers());

-- --- packages --------------------------------------------------------------
drop policy if exists packages_write on packages;

create policy packages_insert on packages for insert to authenticated
  with check (app.is_superuser()
    or (app.has_permission('packages:write') and branch_id is not null and app.can_see_branch(branch_id)));

create policy packages_update on packages for update to authenticated
  using (app.is_superuser()
    or (app.has_permission('packages:write') and branch_id is not null and app.can_see_branch(branch_id)))
  with check (app.is_superuser()
    or (app.has_permission('packages:write') and branch_id is not null and app.can_see_branch(branch_id)));

create policy packages_delete on packages for delete to authenticated
  using (app.is_superuser()
    or (app.has_permission('packages:write') and branch_id is not null and app.can_see_branch(branch_id)));

-- --- selections ------------------------------------------------------------
drop policy if exists selections_write on selections;

create policy selections_insert on selections for insert to authenticated
  with check (exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

create policy selections_update on selections for update to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write())
  with check (exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

create policy selections_delete on selections for delete to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

-- --- share_links -----------------------------------------------------------
drop policy if exists share_links_write on share_links;

create policy share_links_insert on share_links for insert to authenticated
  with check (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

create policy share_links_update on share_links for update to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write())
  with check (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

create policy share_links_delete on share_links for delete to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());
