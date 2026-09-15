begin;

-- ---------------------------------------------------------------------------
-- Branches
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
-- Packages
-- ---------------------------------------------------------------------------
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
-- System defaults
-- ---------------------------------------------------------------------------
insert into settings (key, branch_id, value) values
  ('gallery.default_due_days',      null, '7'::jsonb),
  ('gallery.require_pin_default',   null, 'true'::jsonb),
  ('gallery.allow_download_default',null, 'false'::jsonb),
  ('gallery.watermark_default',     null, 'true'::jsonb),
  ('gallery.invite_default',        null, 'true'::jsonb),
  ('gallery.reminder_days',         null, '[3, 6]'::jsonb),
  ('photo.expected_long_edge_px',   null, '2048'::jsonb),
  ('lark.webhook_url',              null, '""'::jsonb)
on conflict do nothing;

commit;
