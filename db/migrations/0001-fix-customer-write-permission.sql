-- ============================================================================
-- 0001 — Thợ ảnh không được sửa hồ sơ khách hàng
--
-- Phát hiện bởi test phủ định số 2 của BB-003: một `photographer` UPDATE thành
-- công một dòng trong `customers`, trong khi docs/05-rbac.md §2 quy định vai
-- này chỉ được ĐỌC dữ liệu khách hàng.
--
-- Nguyên nhân: app.can_write() gộp `photographer` vào nhóm được ghi, vì thợ ảnh
-- thật sự cần tạo album và đồng bộ ảnh. Nhưng `customers` và `babies` dùng
-- chung hàm đó, nên quyền bị cấp lây.
--
-- Cách sửa: tách thành hai vị từ.
--   app.can_write()            -> album, ảnh, buổi chụp  (có photographer)
--   app.can_manage_customers() -> khách hàng, bé          (KHÔNG có photographer)
-- ============================================================================

create or replace function app.can_manage_customers()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    app.my_role() in ('owner','admin','branch_manager','cs'),
    false);
$$;

grant execute on function app.can_manage_customers() to authenticated;

drop policy if exists customers_write on customers;
create policy customers_write on customers for all to authenticated
  using (app.can_see_branch(branch_id) and app.can_manage_customers())
  with check (app.can_see_branch(branch_id) and app.can_manage_customers());

drop policy if exists babies_write on babies;
create policy babies_write on babies for all to authenticated
  using (exists (
    select 1 from customers c
    where c.id = babies.customer_id and app.can_see_branch(c.branch_id))
    and app.can_manage_customers())
  with check (exists (
    select 1 from customers c
    where c.id = babies.customer_id and app.can_see_branch(c.branch_id))
    and app.can_manage_customers());
