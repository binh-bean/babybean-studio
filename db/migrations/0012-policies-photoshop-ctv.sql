-- Migration: Cập nhật policies cho photoshop_ctv

begin;

drop policy if exists customers_select on customers;
create policy customers_select on customers for select to authenticated
  using (app.can_see_branch(branch_id) and app.my_role() != 'photoshop_ctv');

drop policy if exists packages_select on packages;
create policy packages_select on packages for select to authenticated
  using ((branch_id is null or app.can_see_branch(branch_id)) and app.my_role() != 'photoshop_ctv');

drop policy if exists galleries_select on galleries;
create policy galleries_select on galleries for select to authenticated
  using (app.can_see_branch(branch_id) and (app.my_role() != 'photoshop_ctv' or editor_id = auth.uid()));

drop policy if exists photos_select on photos;
create policy photos_select on photos for select to authenticated
  using (
    app.my_role() != 'accountant' and
    exists (
      select 1 from galleries g
      where g.id = photos.gallery_id and app.can_see_branch(g.branch_id)
      and (app.my_role() != 'photoshop_ctv' or g.editor_id = auth.uid())
    )
  );

drop policy if exists share_links_select on share_links;
create policy share_links_select on share_links for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = share_links.gallery_id and app.can_see_branch(g.branch_id)
    and (app.my_role() != 'photoshop_ctv' or g.editor_id = auth.uid())));

drop policy if exists selections_select on selections;
create policy selections_select on selections for select to authenticated
  using (app.my_role() != 'photoshop_ctv' and exists (
    select 1 from galleries g
    where g.id = selections.gallery_id and app.can_see_branch(g.branch_id)));

drop policy if exists selection_items_select on selection_items;
create policy selection_items_select on selection_items for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = selection_items.gallery_id and app.can_see_branch(g.branch_id)
    and (app.my_role() != 'photoshop_ctv' or g.editor_id = auth.uid())));

commit;
