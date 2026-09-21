-- ============================================================================
-- 0052 — Bảng vai trò động (BB-172 chặng 2a, phần ARCH)
--
-- ADR-0007 phương án C: cứng hoá tên QUYỀN, không cứng hoá tên VAI TRÒ.
-- `roles.permissions` là mảng text; `staff_profiles.role_id` trỏ sang.
--
-- Cột `staff_profiles.role` cũ GIỮ NGUYÊN một nhịp phát hành
-- (`db/migrations/README.md`): hoàn nguyên mã không được làm gãy cơ sở dữ liệu.
-- Lớp RLS đọc quyền từ bảng này nằm ở migration RBAC của SEC-ARCH, không ở đây.
--
-- ---------------------------------------------------------------------------
-- Reviewer sửa ba chỗ trước khi gộp, 21/09/2026
-- ---------------------------------------------------------------------------
-- 1. **Đánh số trùng.** Bản gốc là `0051`, trùng với `0051-activity-logs-
--    gallery-fk.sql` của BB-196 — hai cửa sổ cùng lấy số tiếp theo trong cùng
--    một buổi chiều. Đổi thành `0052`.
--
-- 2. **Chạy lần hai là GÃY.** Bản gốc mở đầu bằng
--    `delete from roles where is_system = true;` rồi chèn lại. Lần chạy thứ hai,
--    `staff_profiles.role_id` đã trỏ vào chính những dòng đó, nên `delete` vấp
--    khoá ngoại và cả migration dừng giữa chừng. Mà `npm run db:migrate:prod`
--    áp lại cả dãy mỗi lượt — nghĩa là bb-prod sẽ gãy ngay lần thứ hai.
--    Thay bằng `on conflict (id) do update`: chạy bao nhiêu lần cũng cho cùng
--    một kết quả, và không dòng nào bị xoá ra khỏi dưới chân ai.
--
-- 3. **Thiếu dòng cấp quyền.** Từ `0050`, vật mới sinh ra KHÔNG còn tự nhận
--    quyền nào cả — đó là chủ ý. Bảng này không có dòng `grant` thì ngay cả
--    `service_role` cũng không đọc được, và màn Nhân sự sẽ hỏng trong im lặng.
-- ============================================================================

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

insert into roles (id, name, permissions, is_system) values
  ('00000000-0000-0000-0000-000000000001', 'owner', '{system:dashboard, branch:dashboard, galleries:read, galleries:create, galleries:write, galleries:sync, galleries:share, galleries:reopen, galleries:delete, galleries:export, customers:read, customers:write, customers:delete, packages:read, packages:write, packages:delete, branches:read, branches:write, branches:delete, staff:read, staff:manage, roles:manage, activity_logs:read, reports:operations, reports:financial, settings:system, settings:branch:read, settings:branch:write, settings:branch:delete, retouch:read, retouch:write, deliveries:read, deliveries:write, deliveries:delete}', true),
  ('00000000-0000-0000-0000-000000000002', 'admin', '{system:dashboard, branch:dashboard, galleries:read, galleries:create, galleries:write, galleries:sync, galleries:share, galleries:reopen, galleries:delete, galleries:export, customers:read, customers:write, customers:delete, packages:read, packages:write, packages:delete, branches:read, branches:write, branches:delete, staff:read, staff:manage, roles:manage, activity_logs:read, reports:operations, reports:financial, settings:system, settings:branch:read, settings:branch:write, settings:branch:delete, retouch:read, retouch:write, deliveries:read, deliveries:write, deliveries:delete}', true),
  ('00000000-0000-0000-0000-000000000003', 'branch_manager', '{branch:dashboard, galleries:read, galleries:create, galleries:write, galleries:sync, galleries:share, galleries:reopen, galleries:delete, galleries:export, customers:read, customers:write, customers:delete, packages:read, packages:write, branches:read, branches:write, staff:read, activity_logs:read, reports:operations, reports:financial, settings:branch:read, settings:branch:write, retouch:read, retouch:write, deliveries:read, deliveries:write, deliveries:delete}', true),
  ('00000000-0000-0000-0000-000000000004', 'cs', '{branch:dashboard, galleries:read, galleries:create, galleries:write, galleries:sync, galleries:share, galleries:export, customers:read, customers:write, packages:read, branches:read, staff:read, reports:operations, settings:branch:read, retouch:read, retouch:write, deliveries:read, deliveries:write}', true),
  ('00000000-0000-0000-0000-000000000005', 'photographer', '{branch:dashboard, galleries:read, galleries:create, galleries:sync, galleries:export, customers:read, packages:read, branches:read, retouch:read, deliveries:read}', true),
  ('00000000-0000-0000-0000-000000000006', 'retoucher', '{branch:dashboard, galleries:read, galleries:export, customers:read, packages:read, branches:read, retouch:read, retouch:write, deliveries:read, deliveries:write}', true),
  ('00000000-0000-0000-0000-000000000007', 'accountant', '{branch:dashboard, galleries:read, customers:read, packages:read, branches:read, reports:operations, reports:financial, deliveries:read}', true),
  ('00000000-0000-0000-0000-000000000008', 'viewer', '{branch:dashboard, galleries:read, customers:read, packages:read, branches:read, reports:operations, deliveries:read}', true),
  ('00000000-0000-0000-0000-000000000009', 'photoshop_ctv', '{branch:dashboard, galleries:read, retouch:read, retouch:write, deliveries:read}', true)
on conflict (id) do update set
  name        = excluded.name,
  permissions = excluded.permissions,
  is_system   = true;

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

-- Quyền trên bảng. Từ 0050, không có dòng này thì không vai nào đọc được.
grant select                         on public.roles to authenticated;
grant select, insert, update, delete on public.roles to service_role;

-- Bật RLS ngay, kể cả khi event trigger `ensure_rls` đã làm hộ: migration phải
-- nói ra điều nó cần, không dựa vào một cái trigger ở chỗ khác.
--
-- Chưa có policy nào ở đây là CỐ Ý: chưa policy thì `authenticated` đọc không
-- ra dòng nào — đóng, chứ không mở. Policy thật nằm trong migration RBAC của
-- SEC-ARCH, cùng lượt với `app.has_permission`.
alter table public.roles enable row level security;
