-- ============================================================================
-- Migration: 0015 — Khách mua thêm sản phẩm (BB-101)
-- ============================================================================

begin;

-- 1. Bảng khách mua thêm sản phẩm
create table selection_addons (
  id            uuid primary key default gen_random_uuid(),
  selection_id  uuid not null references selections(id) on delete cascade,
  product_id    uuid not null references products(id),
  
  quantity      integer not null check (quantity > 0),
  
  -- Đơn giá TẠI THỜI ĐIỂM BẤM MUA, chép từ products.list_price.
  -- Không được tra lại bảng products về sau, tránh tranh chấp khi studio đổi giá.
  unit_price    numeric(12,0) not null,
  
  created_at    timestamptz not null default now()
);

create index idx_selection_addons_selection on selection_addons(selection_id);

comment on table selection_addons is 'Sản phẩm mua thêm lúc khách chốt đơn.';

-- 2. Bảng nối: Ảnh này đặt vào sản phẩm in nào (n-n)
create table selection_placements (
  selection_item_id uuid not null references selection_items(id) on delete cascade,
  gallery_item_id   uuid not null references gallery_items(id) on delete cascade,
  
  primary key (selection_item_id, gallery_item_id)
);

create index idx_selection_placements_gallery_item on selection_placements(gallery_item_id);

comment on table selection_placements is 'Ảnh nào được in vào sản phẩm nào (album, ảnh phóng...). Việc in không tiêu hao hạn mức ảnh chỉnh sửa.';

-- Bật RLS
alter table selection_addons enable row level security;
alter table selection_placements enable row level security;

-- Quyền cho selection_addons
create policy selection_addons_select on selection_addons for select to authenticated
  using (app.my_role() != 'photoshop_ctv' and exists (
    select 1 from selections s
    join galleries g on g.id = s.gallery_id
    where s.id = selection_addons.selection_id and app.can_see_branch(g.branch_id)
  ));

-- Quyền cho selection_placements
create policy selection_placements_select on selection_placements for select to authenticated
  using (exists (
    select 1 from selection_items si
    join galleries g on g.id = si.gallery_id
    where si.id = selection_placements.selection_item_id and app.can_see_branch(g.branch_id)
    and (app.my_role() != 'photoshop_ctv' or g.editor_id = auth.uid())
  ));

-- Nhân viên KHÔNG được sửa lựa chọn của khách (giống selection_items)
create policy selection_addons_no_write on selection_addons for all to authenticated
  using (false) with check (false);

create policy selection_placements_no_write on selection_placements for all to authenticated
  using (false) with check (false);

grant select, insert, update, delete on selection_addons, selection_placements to authenticated;
grant all privileges on selection_addons, selection_placements to service_role;

commit;
