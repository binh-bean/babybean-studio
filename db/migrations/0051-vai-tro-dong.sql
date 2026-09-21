create table if not exists roles (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  permissions   text[] not null default '{}',
  is_system     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

drop trigger if exists trg_roles_updated_at on roles;
create trigger trg_roles_updated_at before update on roles
  for each row execute function set_updated_at();

alter table staff_profiles add column if not exists role_id uuid references roles(id);

delete from roles where is_system = true;

insert into roles (id, name, permissions, is_system) values
  ('00000000-0000-0000-0000-000000000001', 'owner', '{system:dashboard, branch:dashboard, galleries:read, galleries:create, galleries:write, galleries:sync, galleries:share, galleries:reopen, galleries:delete, galleries:export, customers:read, customers:write, customers:delete, packages:read, packages:write, packages:delete, branches:read, branches:write, branches:delete, staff:read, staff:manage, roles:manage, activity_logs:read, reports:operations, reports:financial, settings:system, settings:branch:read, settings:branch:write, settings:branch:delete, retouch:read, retouch:write, deliveries:read, deliveries:write, deliveries:delete}', true),
  ('00000000-0000-0000-0000-000000000002', 'admin', '{system:dashboard, branch:dashboard, galleries:read, galleries:create, galleries:write, galleries:sync, galleries:share, galleries:reopen, galleries:delete, galleries:export, customers:read, customers:write, customers:delete, packages:read, packages:write, packages:delete, branches:read, branches:write, branches:delete, staff:read, staff:manage, roles:manage, activity_logs:read, reports:operations, reports:financial, settings:system, settings:branch:read, settings:branch:write, settings:branch:delete, retouch:read, retouch:write, deliveries:read, deliveries:write, deliveries:delete}', true),
  ('00000000-0000-0000-0000-000000000003', 'branch_manager', '{branch:dashboard, galleries:read, galleries:create, galleries:write, galleries:sync, galleries:share, galleries:reopen, galleries:delete, galleries:export, customers:read, customers:write, customers:delete, packages:read, packages:write, branches:read, branches:write, staff:read, activity_logs:read, reports:operations, reports:financial, settings:branch:read, settings:branch:write, retouch:read, retouch:write, deliveries:read, deliveries:write, deliveries:delete}', true),
  ('00000000-0000-0000-0000-000000000004', 'cs', '{branch:dashboard, galleries:read, galleries:create, galleries:write, galleries:sync, galleries:share, galleries:export, customers:read, customers:write, packages:read, branches:read, staff:read, reports:operations, settings:branch:read, retouch:read, retouch:write, deliveries:read, deliveries:write}', true),
  ('00000000-0000-0000-0000-000000000005', 'photographer', '{branch:dashboard, galleries:read, galleries:create, galleries:sync, galleries:export, customers:read, packages:read, branches:read, retouch:read, deliveries:read}', true),
  ('00000000-0000-0000-0000-000000000006', 'retoucher', '{branch:dashboard, galleries:read, galleries:export, customers:read, packages:read, branches:read, retouch:read, retouch:write, deliveries:read, deliveries:write}', true),
  ('00000000-0000-0000-0000-000000000007', 'accountant', '{branch:dashboard, galleries:read, customers:read, packages:read, branches:read, reports:operations, reports:financial, deliveries:read}', true),
  ('00000000-0000-0000-0000-000000000008', 'viewer', '{branch:dashboard, galleries:read, customers:read, packages:read, branches:read, reports:operations, deliveries:read}', true),
  ('00000000-0000-0000-0000-000000000009', 'photoshop_ctv', '{branch:dashboard, galleries:read, retouch:read, retouch:write, deliveries:read}', true);

update staff_profiles set role_id = case role
  when 'owner' then '00000000-0000-0000-0000-000000000001'::uuid
  when 'admin' then '00000000-0000-0000-0000-000000000002'::uuid
  when 'branch_manager' then '00000000-0000-0000-0000-000000000003'::uuid
  when 'cs' then '00000000-0000-0000-0000-000000000004'::uuid
  when 'photographer' then '00000000-0000-0000-0000-000000000005'::uuid
  when 'retoucher' then '00000000-0000-0000-0000-000000000006'::uuid
  when 'accountant' then '00000000-0000-0000-0000-000000000007'::uuid
  when 'viewer' then '00000000-0000-0000-0000-000000000008'::uuid
  when 'photoshop_ctv' then '00000000-0000-0000-0000-000000000009'::uuid
end
where role_id is null;
