-- ============================================================================
-- Seed data for local development and staging.
-- Owner: DEV-BE. Task BB-008.
--
-- NEVER run this against production.
-- Staff rows require matching auth.users records; create those in Supabase
-- Auth first (or via scripts/db-seed.mjs) and paste the ids below.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Branches — the three real BabyBean locations
-- ---------------------------------------------------------------------------

insert into branches (id, code, name, address, hotline, timezone) values
  ('11111111-1111-1111-1111-111111111111', 'BB-Q1',
   'BabyBean Quận 1',  '12 Nguyễn Huệ, Quận 1, TP.HCM',      '0901000001', 'Asia/Ho_Chi_Minh'),
  ('22222222-2222-2222-2222-222222222222', 'BB-TD',
   'BabyBean Thủ Đức', '45 Võ Văn Ngân, Thủ Đức, TP.HCM',    '0901000002', 'Asia/Ho_Chi_Minh'),
  ('33333333-3333-3333-3333-333333333333', 'BB-GV',
   'BabyBean Gò Vấp',  '88 Quang Trung, Gò Vấp, TP.HCM',     '0901000003', 'Asia/Ho_Chi_Minh')
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  address = excluded.address,
  hotline = excluded.hotline,
  timezone = excluded.timezone;

-- ---------------------------------------------------------------------------
-- Packages — one shared, three branch-specific
-- ---------------------------------------------------------------------------

-- Extra-photo price falls as the package rises: it rewards upgrading and gives
-- CS a concrete reason to suggest one. See docs/13-quyet-dinh-van-hanh.md §1.
-- PM to confirm the real numbers; changing them here is enough, because each
-- gallery copies quota and price at creation time.
insert into packages (id, branch_id, code, name, price, included_quota, extra_photo_price, printed_photo_count) values
  ('aaaaaaaa-0000-0000-0000-000000000001', null,
   'BASIC',   'Gói Cơ bản',      1500000, 15, 60000,  5),
  ('aaaaaaaa-0000-0000-0000-000000000002', null,
   'STANDARD','Gói Tiêu chuẩn',  2500000, 20, 50000, 10),
  ('aaaaaaaa-0000-0000-0000-000000000003', null,
   'PREMIUM', 'Gói Cao cấp',     4500000, 35, 40000, 20),
  ('aaaaaaaa-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
   'Q1-NEWBORN', 'Newborn Quận 1', 3800000, 30, 45000, 15)
on conflict (id) do update set
  branch_id = excluded.branch_id,
  code = excluded.code,
  name = excluded.name,
  price = excluded.price,
  included_quota = excluded.included_quota,
  extra_photo_price = excluded.extra_photo_price,
  printed_photo_count = excluded.printed_photo_count;

-- ---------------------------------------------------------------------------
-- Customers and babies
-- ---------------------------------------------------------------------------

insert into customers (id, branch_id, full_name, phone, zalo, source) values
  ('cccccccc-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111',
   'Nguyễn Thị Mai',   '0912345678', '0912345678', 'facebook'),
  ('cccccccc-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111',
   'Trần Văn Hùng',    '0923456789', '0923456789', 'referral'),
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
   'Lê Thị Hồng',      '0934567890', null,         'zalo'),
  ('cccccccc-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222',
   'Phạm Minh Tuấn',   '0945678901', null,         'walk_in'),
  ('cccccccc-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333',
   'Võ Thị Lan Anh',   '0956789012', '0956789012', 'facebook')
on conflict (id) do update set
  branch_id = excluded.branch_id,
  full_name = excluded.full_name,
  phone = excluded.phone,
  zalo = excluded.zalo,
  source = excluded.source;

insert into babies (id, customer_id, full_name, nickname, birth_date, gender) values
  ('bbbbbbbb-0000-0000-0000-000000000001', 'cccccccc-0000-0000-0000-000000000001',
   'Nguyễn Bảo An',  'Bơ',   '2026-06-01', 'female'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'cccccccc-0000-0000-0000-000000000002',
   'Trần Gia Khang', 'Bin',  '2026-05-15', 'male'),
  ('bbbbbbbb-0000-0000-0000-000000000003', 'cccccccc-0000-0000-0000-000000000003',
   'Lê Minh Châu',   'Sóc',  '2026-07-20', 'female')
on conflict (id) do update set
  customer_id = excluded.customer_id,
  full_name = excluded.full_name,
  nickname = excluded.nickname,
  birth_date = excluded.birth_date,
  gender = excluded.gender;

-- ---------------------------------------------------------------------------
-- Galleries — three states so the dashboard has something to show
--
-- drive_folder_id values are placeholders. Replace with a real public folder
-- before testing the sync job, or point at tests/fixtures/drive-responses/.
-- ---------------------------------------------------------------------------

insert into galleries (
  id, branch_id, customer_id, baby_id, package_id, title, status,
  drive_folder_id, drive_folder_url,
  included_quota, extra_photo_price, due_at, sent_at, photo_count, last_synced_at
) values
  -- Waiting for the customer to choose
  ('dddddddd-0000-0000-0000-000000000001',
   '11111111-1111-1111-1111-111111111111',
   'cccccccc-0000-0000-0000-000000000001',
   'bbbbbbbb-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000002',
   'Bé Bơ 3 tháng tuổi', 'in_review',
   'SEED_FOLDER_ID_001', 'https://drive.google.com/drive/folders/SEED_FOLDER_ID_001',
   20, 50000, now() + interval '5 days', now() - interval '2 days', 620, now() - interval '2 days'),

  -- Overdue — should light up red on the dashboard
  ('dddddddd-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222',
   'cccccccc-0000-0000-0000-000000000003',
   'bbbbbbbb-0000-0000-0000-000000000003',
   'aaaaaaaa-0000-0000-0000-000000000001',
   'Bé Sóc đầy tháng', 'in_review',
   'SEED_FOLDER_ID_002', 'https://drive.google.com/drive/folders/SEED_FOLDER_ID_002',
   15, 50000, now() - interval '3 days', now() - interval '12 days', 480, now() - interval '12 days'),

  -- Already submitted — used to test the export flow
  ('dddddddd-0000-0000-0000-000000000003',
   '11111111-1111-1111-1111-111111111111',
   'cccccccc-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002',
   'aaaaaaaa-0000-0000-0000-000000000003',
   'Bé Bin 100 ngày', 'submitted',
   'SEED_FOLDER_ID_003', 'https://drive.google.com/drive/folders/SEED_FOLDER_ID_003',
   35, 40000, now() - interval '1 day', now() - interval '8 days', 910, now() - interval '8 days')
on conflict (id) do update set
  branch_id = excluded.branch_id,
  customer_id = excluded.customer_id,
  baby_id = excluded.baby_id,
  package_id = excluded.package_id,
  title = excluded.title,
  status = excluded.status,
  drive_folder_id = excluded.drive_folder_id,
  drive_folder_url = excluded.drive_folder_url,
  included_quota = excluded.included_quota,
  extra_photo_price = excluded.extra_photo_price,
  due_at = excluded.due_at,
  sent_at = excluded.sent_at,
  photo_count = excluded.photo_count,
  last_synced_at = excluded.last_synced_at;

update galleries
set submitted_at = now() - interval '1 day'
where id = 'dddddddd-0000-0000-0000-000000000003';

-- ---------------------------------------------------------------------------
-- System defaults — the seven decisions in docs/13-quyet-dinh-van-hanh.md.
-- branch_id NULL = applies system-wide.
-- ---------------------------------------------------------------------------

insert into settings (key, branch_id, value) values
  ('gallery.default_due_days',      null, '7'::jsonb),
  ('gallery.require_pin_default',   null, 'true'::jsonb),
  ('gallery.allow_download_default',null, 'false'::jsonb),
  ('gallery.watermark_default',     null, 'true'::jsonb),
  ('gallery.invite_default',        null, 'true'::jsonb),
  ('gallery.reminder_days',         null, '[3, 6]'::jsonb),
  ('photo.expected_long_edge_px',   null, '2048'::jsonb),
  -- One webhook per branch plus one management group; filled in at Phase 3.
  ('lark.webhook_url',              null, '""'::jsonb)
on conflict do nothing;

commit;

-- ============================================================================
-- Still to seed (BB-008): staff_profiles + staff_branches once auth.users
-- exist, photos for the three galleries, and one primary selection with ~18
-- selection_items on gallery 001 so the progress view is not empty.
-- Do it from scripts/db-seed.mjs, which can create the auth users first.
-- ============================================================================
