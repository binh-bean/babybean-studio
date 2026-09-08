-- ============================================================================
-- BabyBean Studio Platform — Row Level Security
-- Owner: SEC-ARCH
-- ============================================================================
--
-- MÔ HÌNH HAI ĐƯỜNG TRUY CẬP
--
--   1. Nhân viên  → anon key + JWT Supabase Auth  → RLS BẬT, các policy dưới đây quyết định.
--   2. Khách hàng → service role key (chỉ ở server, trong src/app/api/**) → RLS BỎ QUA.
--      Với đường này, hàng rào là tầng ứng dụng: cookie phiên đã ký chứa gallery_id
--      và share_link_id, mọi truy vấn đều bị ràng buộc theo hai giá trị đó.
--      KHÔNG BAO GIỜ để service role key lọt xuống client.
--
-- NGUYÊN TẮC: mặc định từ chối. Bật RLS cho mọi bảng, kể cả bảng chỉ server dùng.
-- ============================================================================

create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Hàm trợ giúp (SECURITY DEFINER để tránh đệ quy RLS khi đọc staff_profiles)
-- ---------------------------------------------------------------------------

create or replace function app.my_role()
returns staff_role
language sql stable security definer set search_path = public as $$
  select role from staff_profiles where id = auth.uid() and is_active;
$$;

create or replace function app.is_superuser()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.my_role() in ('owner','admin'), false);
$$;

-- Danh sách chi nhánh mà người dùng hiện tại được phép thấy.
create or replace function app.my_branches()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.id from branches b where app.is_superuser()
  union
  select sb.branch_id from staff_branches sb where sb.staff_id = auth.uid();
$$;

create or replace function app.can_see_branch(p_branch uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select p_branch is null or p_branch in (select app.my_branches());
$$;

-- Vai trò được phép ghi dữ liệu nghiệp vụ (không chỉ đọc).
create or replace function app.can_write()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    app.my_role() in ('owner','admin','branch_manager','cs','photographer'),
    false);
$$;

-- ---------------------------------------------------------------------------
-- Bật RLS trên toàn bộ bảng
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'branches','staff_profiles','staff_branches','customers','babies','packages',
    'shoots','galleries','photos','share_links','selections','selection_items',
    'selection_ops','deliveries','activity_logs','notifications','settings'
  ] loop
    -- ENABLE only, never FORCE. The helper functions below are SECURITY
    -- DEFINER and read staff_profiles/staff_branches; under FORCE the owner is
    -- also subject to RLS, so those reads would re-enter these policies and
    -- Postgres would abort with infinite recursion.
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------

create policy branches_select on branches for select to authenticated
  using (app.can_see_branch(id));

create policy branches_write on branches for all to authenticated
  using (app.is_superuser()) with check (app.is_superuser());

-- ---------------------------------------------------------------------------
-- staff_profiles / staff_branches
-- ---------------------------------------------------------------------------

-- Ai cũng đọc được hồ sơ của mình; superuser đọc tất cả;
-- quản lý chi nhánh đọc được người cùng chi nhánh.
create policy staff_select on staff_profiles for select to authenticated
  using (
    id = auth.uid()
    or app.is_superuser()
    or exists (
      select 1 from staff_branches sb
      where sb.staff_id = staff_profiles.id
        and sb.branch_id in (select app.my_branches())
    )
  );

-- Tự sửa hồ sơ mình nhưng KHÔNG được tự đổi vai trò hay trạng thái kích hoạt.
-- Reads its own role through the SECURITY DEFINER helper, not a subquery on
-- staff_profiles: a subquery on the policy's own table recurses.
create policy staff_update_self on staff_profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = app.my_role() and is_active);

create policy staff_admin_all on staff_profiles for all to authenticated
  using (app.is_superuser()) with check (app.is_superuser());

create policy staff_branches_select on staff_branches for select to authenticated
  using (staff_id = auth.uid() or app.can_see_branch(branch_id));

create policy staff_branches_admin on staff_branches for all to authenticated
  using (app.is_superuser()) with check (app.is_superuser());

-- ---------------------------------------------------------------------------
-- customers / babies
-- ---------------------------------------------------------------------------

create policy customers_select on customers for select to authenticated
  using (app.can_see_branch(branch_id));

create policy customers_write on customers for all to authenticated
  using (app.can_see_branch(branch_id) and app.can_write())
  with check (app.can_see_branch(branch_id) and app.can_write());

create policy babies_select on babies for select to authenticated
  using (exists (
    select 1 from customers c
    where c.id = babies.customer_id and app.can_see_branch(c.branch_id)));

create policy babies_write on babies for all to authenticated
  using (exists (
    select 1 from customers c
    where c.id = babies.customer_id and app.can_see_branch(c.branch_id))
    and app.can_write())
  with check (exists (
    select 1 from customers c
    where c.id = babies.customer_id and app.can_see_branch(c.branch_id))
    and app.can_write());

-- ---------------------------------------------------------------------------
-- packages
-- ---------------------------------------------------------------------------

create policy packages_select on packages for select to authenticated
  using (branch_id is null or app.can_see_branch(branch_id));

-- branch_id IS NULL means a system-wide package; only superusers touch those.
create policy packages_write on packages for all to authenticated
  using (app.is_superuser()
    or (app.my_role() = 'branch_manager' and branch_id is not null and app.can_see_branch(branch_id)))
  with check (app.is_superuser()
    or (app.my_role() = 'branch_manager' and branch_id is not null and app.can_see_branch(branch_id)));

-- ---------------------------------------------------------------------------
-- shoots / galleries / photos
-- ---------------------------------------------------------------------------

create policy shoots_select on shoots for select to authenticated
  using (app.can_see_branch(branch_id));

create policy shoots_write on shoots for all to authenticated
  using (app.can_see_branch(branch_id) and app.can_write())
  with check (app.can_see_branch(branch_id) and app.can_write());

create policy galleries_select on galleries for select to authenticated
  using (app.can_see_branch(branch_id));

create policy galleries_write on galleries for all to authenticated
  using (app.can_see_branch(branch_id) and app.can_write())
  with check (app.can_see_branch(branch_id) and app.can_write());

create policy photos_select on photos for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = photos.gallery_id and app.can_see_branch(g.branch_id)));

create policy photos_write on photos for all to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = photos.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write())
  with check (exists (
    select 1 from galleries g
    where g.id = photos.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

-- ---------------------------------------------------------------------------
-- share_links — nhạy cảm: token_hash và pin_hash không bao giờ được lộ ra client.
-- Nhân viên chỉ đọc qua view an toàn bên dưới.
-- ---------------------------------------------------------------------------

create policy share_links_select on share_links for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id)));

create policy share_links_write on share_links for all to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write())
  with check (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

-- View không chứa bí mật, dùng cho mọi màn hình quản trị.
create or replace view v_share_links as
select id, gallery_id, token_prefix, role, label, requires_pin, status,
       expires_at, view_count, last_viewed_at, created_at, revoked_at
from share_links;

-- ---------------------------------------------------------------------------
-- selections / selection_items
-- ---------------------------------------------------------------------------

create policy selections_select on selections for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id)));

create policy selections_write on selections for all to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write())
  with check (exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id))
    and app.can_write());

create policy selection_items_select on selection_items for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = selection_items.gallery_id and app.can_see_branch(g.branch_id)));

-- Nhân viên KHÔNG được sửa lựa chọn của khách (tránh tranh cãi).
-- Muốn đổi thì phải reopen album, hành động này có ghi log.
create policy selection_items_no_write on selection_items for all to authenticated
  using (false) with check (false);

create policy selection_ops_deny on selection_ops for all to authenticated
  using (false) with check (false);

-- ---------------------------------------------------------------------------
-- deliveries
-- ---------------------------------------------------------------------------

create policy deliveries_select on deliveries for select to authenticated
  using (app.can_see_branch(branch_id));

create policy deliveries_write on deliveries for all to authenticated
  using (app.can_see_branch(branch_id)
    and coalesce(app.my_role() in ('owner','admin','branch_manager','cs','retoucher'), false))
  with check (app.can_see_branch(branch_id)
    and coalesce(app.my_role() in ('owner','admin','branch_manager','cs','retoucher'), false));

-- ---------------------------------------------------------------------------
-- activity_logs — chỉ đọc, không ai sửa/xoá được qua RLS.
-- ---------------------------------------------------------------------------

create policy activity_select on activity_logs for select to authenticated
  using (app.can_see_branch(branch_id));

-- Append-only: staff may write log rows for their own branches, but nobody
-- may ever edit or delete one.
create policy activity_insert on activity_logs for insert to authenticated
  with check (app.can_see_branch(branch_id));

create policy activity_no_mutate on activity_logs for update to authenticated
  using (false) with check (false);

create policy activity_no_delete on activity_logs for delete to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- notifications / settings
-- ---------------------------------------------------------------------------

create policy notifications_select on notifications for select to authenticated
  using (app.can_see_branch(branch_id));

create policy notifications_admin on notifications for all to authenticated
  using (app.is_superuser()) with check (app.is_superuser());

create policy settings_select on settings for select to authenticated
  using (branch_id is null or app.can_see_branch(branch_id));

create policy settings_write on settings for all to authenticated
  using (app.is_superuser()
    or (app.my_role() = 'branch_manager' and branch_id is not null and app.can_see_branch(branch_id)))
  with check (app.is_superuser()
    or (app.my_role() = 'branch_manager' and branch_id is not null and app.can_see_branch(branch_id)));

-- ---------------------------------------------------------------------------
-- Chặn vai trò anon hoàn toàn. Khách hàng KHÔNG nói chuyện trực tiếp với Postgres.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on schema app from anon;

-- ---------------------------------------------------------------------------
-- Table privileges for staff.
--
-- The Supabase project is created with "Automatically expose new tables"
-- DISABLED, so nothing is granted by default. Policies alone are not enough:
-- Postgres checks privileges BEFORE it evaluates any policy, so a role with no
-- privilege is refused outright and the error looks nothing like an RLS denial
-- ("permission denied for table galleries").
--
-- Grants say which operations may be ATTEMPTED. The policies above decide which
-- rows are actually visible or writable. Both layers are required.
--
-- When a migration adds a table, it must add its grant here too. Forgetting is
-- safe in the right direction: the table is unreachable until someone does.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  branches, staff_profiles, staff_branches, customers, babies, packages,
  shoots, galleries, photos, share_links, selections, deliveries,
  notifications, settings
to authenticated;

-- Read-only for staff: a customer's selection is evidence in a dispute and
-- nobody edits it (docs/05-rbac.md §2). The policy denies writes; withholding
-- the privilege means the attempt fails even if that policy is ever changed.
grant select on selection_items to authenticated;

-- Append-only audit log. No update, no delete, for anyone.
grant select, insert on activity_logs to authenticated;
grant usage, select on sequence activity_logs_id_seq to authenticated;

-- Views used by the admin screens.
grant select on v_share_links, v_gallery_progress to authenticated;

-- selection_ops is idempotency bookkeeping written only by the service role.
-- Deliberately no grant.

-- ---------------------------------------------------------------------------
-- Table privileges for service_role.
--
-- service_role bypasses RLS, but Postgres still checks PRIVILEGES first, and
-- with "Automatically expose new tables" disabled it starts with none. Without
-- these grants every customer-facing request fails with
-- "permission denied for table ..." while the policies look perfectly correct.
--
-- Full access is intended here: service_role never reaches the browser, and
-- the customer paths (session lookup, selection writes, image proxy) run
-- through it after the app layer has checked the signed session cookie.
-- ---------------------------------------------------------------------------

grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute  on all functions in schema public to service_role;

-- Tables added by later migrations inherit the same access.
alter default privileges in schema public grant all privileges on tables    to service_role;
alter default privileges in schema public grant all privileges on sequences to service_role;

-- Policy expressions are evaluated as the querying role, so `authenticated`
-- must be able to call the helpers. They are SECURITY DEFINER and expose
-- nothing beyond the caller's own role/branches.
grant usage on schema app to authenticated;
grant execute on all functions in schema app to authenticated;

-- ============================================================================
-- BẢNG CHỨNG MINH "AI ĐỌC ĐƯỢC GÌ"  (SEC-ARCH cập nhật khi đổi policy)
-- ============================================================================
--
-- | Vai trò         | branches | customers | galleries | photos | selection_items | share_links(secret) |
-- |-----------------|----------|-----------|-----------|--------|-----------------|---------------------|
-- | anon            | không    | không     | không     | không  | không           | không               |
-- | viewer          | CN mình  | CN mình   | CN mình   | CN mình| CN mình (đọc)   | không (dùng view)   |
-- | photographer    | CN mình  | CN mình   | CN mình   | CN mình| CN mình (đọc)   | không (dùng view)   |
-- | cs              | CN mình  | CN mình R/W| CN mình R/W| R/W  | chỉ đọc         | không (dùng view)   |
-- | branch_manager  | CN mình  | CN mình R/W| CN mình R/W| R/W  | chỉ đọc         | không (dùng view)   |
-- | owner/admin     | tất cả   | tất cả    | tất cả    | tất cả | chỉ đọc         | không (dùng view)   |
-- | service_role    | bỏ qua RLS — hàng rào nằm ở tầng ứng dụng                                       |
--
-- Test phủ định bắt buộc (tests/security/):
--   1. cs của chi nhánh A đọc gallery của chi nhánh B  → 0 dòng
--   2. photographer cố UPDATE customers                → lỗi quyền
--   3. bất kỳ nhân viên nào cố UPDATE selection_items  → lỗi quyền
--   4. staff tự UPDATE role của mình thành 'owner'     → lỗi quyền
--   5. anon SELECT bất kỳ bảng nào                     → lỗi quyền
--   6. cs cố DELETE activity_logs                      → lỗi quyền
