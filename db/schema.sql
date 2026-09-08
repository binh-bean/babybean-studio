-- ============================================================================
-- BabyBean Studio Platform — Database schema
-- Postgres 15 / Supabase
-- Owner: ARCH. Không sửa file này trực tiếp — thêm file trong db/migrations/.
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

-- ============================================================================
-- 1. ENUMS
-- ============================================================================

create type staff_role as enum (
  'owner',            -- chủ studio, toàn quyền
  'admin',            -- quản trị hệ thống
  'branch_manager',   -- quản lý một chi nhánh
  'cs',               -- CSKH / lễ tân
  'photographer',
  'retoucher',
  'accountant',
  'viewer'            -- chỉ xem báo cáo
);

create type gallery_status as enum (
  'draft',       -- vừa tạo, chưa đồng bộ ảnh
  'syncing',     -- đang đọc Drive
  'sync_error',  -- lỗi đọc Drive
  'ready',       -- sẵn sàng gửi khách
  'in_review',   -- khách đã mở, đang chọn
  'submitted',   -- khách đã chốt
  'in_retouch',  -- đang chỉnh sửa
  'delivered',   -- đã giao
  'expired',     -- quá hạn chưa chốt
  'archived'
);

create type photo_status as enum ('active', 'missing', 'hidden');

create type share_role as enum ('owner', 'co_editor', 'suggester', 'viewer');

create type share_link_status as enum ('active', 'revoked', 'expired');

create type selection_mark as enum ('selected', 'suggested', 'favorite', 'rejected');

create type delivery_status as enum ('pending', 'in_progress', 'ready', 'delivered');

-- ============================================================================
-- 2. TỔ CHỨC & NHÂN SỰ
-- ============================================================================

create table branches (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,             -- 'BB-Q1', 'BB-TD', 'BB-GV'
  name          text not null,
  address       text,
  hotline       text,
  zalo_oa       text,
  logo_url      text,
  timezone      text not null default 'Asia/Ho_Chi_Minh',
  is_active     boolean not null default true,
  settings      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table branches is 'Chi nhánh studio. Phase 1: 3 dòng.';

-- Hồ sơ nhân sự, 1-1 với auth.users của Supabase
create table staff_profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         citext not null unique,
  phone         text,
  role          staff_role not null default 'cs',
  avatar_url    text,
  is_active     boolean not null default true,
  last_login_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Một nhân sự có thể phụ trách nhiều chi nhánh
create table staff_branches (
  staff_id      uuid not null references staff_profiles(id) on delete cascade,
  branch_id     uuid not null references branches(id) on delete cascade,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (staff_id, branch_id)
);

create index idx_staff_branches_branch on staff_branches(branch_id);

-- ============================================================================
-- 3. KHÁCH HÀNG
-- ============================================================================

create table customers (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branches(id),
  full_name      text not null,
  phone          text not null,
  phone_normalized text generated always as (regexp_replace(phone, '\D', '', 'g')) stored,
  email          citext,
  zalo           text,
  facebook       text,
  address        text,
  note           text,
  source         text,                              -- 'facebook' | 'zalo' | 'referral' | 'walk_in'
  tags           text[] not null default '{}',
  created_by     uuid references staff_profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index uq_customers_phone_branch on customers(branch_id, phone_normalized);
create index idx_customers_branch on customers(branch_id);
create index idx_customers_name_trgm on customers using gin (full_name gin_trgm_ops);

create table babies (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  full_name     text not null,
  nickname      text,
  birth_date    date,
  gender        text check (gender in ('male','female','other')),
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_babies_customer on babies(customer_id);
create index idx_babies_birth_date on babies(birth_date);  -- nhắc sinh nhật (Phase 3)

-- ============================================================================
-- 4. GÓI CHỤP
-- ============================================================================

create table packages (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid references branches(id),   -- null = áp dụng mọi chi nhánh
  code                text not null,
  name                text not null,
  description         text,
  price               numeric(12,0) not null default 0,
  included_quota      integer not null default 20,    -- số ảnh chỉnh miễn phí
  extra_photo_price   numeric(12,0) not null default 0,
  printed_photo_count integer not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index uq_packages_code on packages(coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

-- ============================================================================
-- 5. BUỔI CHỤP (mở đường cho module booking Phase 3)
-- ============================================================================

create table shoots (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branches(id),
  customer_id    uuid not null references customers(id),
  baby_id        uuid references babies(id),
  package_id     uuid references packages(id),
  photographer_id uuid references staff_profiles(id),
  shoot_date     date not null,
  concept        text,
  note           text,
  created_by     uuid references staff_profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index idx_shoots_branch_date on shoots(branch_id, shoot_date desc);
create index idx_shoots_customer on shoots(customer_id);

-- ============================================================================
-- 6. ALBUM (GALLERY)
-- ============================================================================

create table galleries (
  id                  uuid primary key default gen_random_uuid(),
  branch_id           uuid not null references branches(id),
  shoot_id            uuid references shoots(id) on delete set null,
  customer_id         uuid not null references customers(id),
  baby_id             uuid references babies(id),
  package_id          uuid references packages(id),

  title               text not null,
  welcome_message     text,
  status              gallery_status not null default 'draft',

  -- Nguồn ảnh trên Google Drive
  drive_folder_id     text not null,
  drive_folder_url    text not null,
  drive_folder_name   text,

  -- Quy tắc chọn ảnh
  included_quota      integer not null default 20,
  extra_photo_price   numeric(12,0) not null default 0,
  max_selection       integer,                        -- null = không giới hạn cứng
  allow_extra         boolean not null default true,

  -- Tuỳ chọn hiển thị
  cover_photo_id      uuid,                           -- FK gán sau khi tạo photos
  watermark_enabled   boolean not null default true,
  download_enabled    boolean not null default false,
  notes_enabled       boolean not null default true,
  invite_enabled      boolean not null default true,

  -- Vòng đời
  due_at              timestamptz,
  sent_at             timestamptz,
  first_viewed_at     timestamptz,
  submitted_at        timestamptz,
  reopened_at         timestamptz,
  reopen_reason       text,

  -- Kết quả đồng bộ Drive
  photo_count         integer not null default 0,
  last_synced_at      timestamptz,
  sync_error          text,

  created_by          uuid references staff_profiles(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint chk_quota_positive check (included_quota >= 0),
  constraint chk_max_selection check (max_selection is null or max_selection >= included_quota)
);

create index idx_galleries_branch_status on galleries(branch_id, status);
create index idx_galleries_customer on galleries(customer_id);
create index idx_galleries_due on galleries(due_at) where status in ('ready','in_review');
create unique index uq_galleries_drive_folder on galleries(drive_folder_id) where status <> 'archived';

-- ============================================================================
-- 7. ẢNH (metadata cache từ Drive)
-- ============================================================================

create table photos (
  id                uuid primary key default gen_random_uuid(),
  gallery_id        uuid not null references galleries(id) on delete cascade,

  drive_file_id     text not null,
  file_name         text not null,
  mime_type         text not null,
  size_bytes        bigint,
  width             integer,
  height            integer,
  taken_at          timestamptz,

  subfolder         text,            -- tên thư mục con trong Drive, dùng để nhóm concept
  sort_index        integer not null default 0,
  status            photo_status not null default 'active',

  drive_modified_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index uq_photos_gallery_drive on photos(gallery_id, drive_file_id);
create index idx_photos_gallery_sort on photos(gallery_id, sort_index) where status = 'active';
create index idx_photos_gallery_subfolder on photos(gallery_id, subfolder);

alter table galleries
  add constraint fk_galleries_cover
  foreign key (cover_photo_id) references photos(id) on delete set null;

-- ============================================================================
-- 8. LINK CHIA SẺ
-- ============================================================================

create table share_links (
  id             uuid primary key default gen_random_uuid(),
  gallery_id     uuid not null references galleries(id) on delete cascade,

  token_hash     text not null unique,       -- sha256(token); token gốc không lưu
  token_prefix   text not null,              -- 6 ký tự đầu, chỉ để hiển thị/log
  role           share_role not null default 'owner',
  label          text,                       -- 'Mẹ bé', 'Bà ngoại'

  requires_pin   boolean not null default true,
  pin_hash       text,                       -- bcrypt
  failed_attempts integer not null default 0,
  locked_until   timestamptz,

  status         share_link_status not null default 'active',
  expires_at     timestamptz,
  max_views      integer,
  view_count     integer not null default 0,
  last_viewed_at timestamptz,
  last_viewed_ip inet,

  created_by     uuid references staff_profiles(id),
  created_at     timestamptz not null default now(),
  revoked_at     timestamptz,
  revoked_by     uuid references staff_profiles(id)
);

create index idx_share_links_gallery on share_links(gallery_id);
create index idx_share_links_status on share_links(status) where status = 'active';

-- ============================================================================
-- 9. PHIÊN CHỌN & LỰA CHỌN
-- ============================================================================

-- Mỗi share_link được dùng sinh ra 1 selection. Album có thể có nhiều selection
-- (khách chính + người thân), nhưng chỉ selection của share_link role='owner'
-- mới được tính vào kết quả chốt.
create table selections (
  id              uuid primary key default gen_random_uuid(),
  gallery_id      uuid not null references galleries(id) on delete cascade,
  share_link_id   uuid not null references share_links(id) on delete cascade,

  display_name    text,                        -- tên khách tự nhập
  is_primary      boolean not null default false,

  general_note    text,
  submitted_at    timestamptz,
  submitted_by_name text,

  -- Ảnh chụp lại số liệu tại thời điểm chốt (không tính lại về sau)
  snapshot_selected_count integer,
  snapshot_extra_count    integer,
  snapshot_extra_amount   numeric(12,0),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index uq_selections_share_link on selections(share_link_id);
create unique index uq_selections_primary on selections(gallery_id) where is_primary;
create index idx_selections_gallery on selections(gallery_id);

create table selection_items (
  id            uuid primary key default gen_random_uuid(),
  selection_id  uuid not null references selections(id) on delete cascade,
  photo_id      uuid not null references photos(id) on delete cascade,
  gallery_id    uuid not null references galleries(id) on delete cascade,  -- phi chuẩn hoá cho RLS + truy vấn nhanh

  mark          selection_mark not null default 'selected',
  order_index   integer,                     -- thứ tự khách chọn
  retouch_note  text,
  note_tags     text[] not null default '{}',-- ['xoa_mun','lam_sang_da']

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint chk_note_len check (retouch_note is null or length(retouch_note) <= 500)
);

create unique index uq_selection_items on selection_items(selection_id, photo_id);
create index idx_selection_items_gallery on selection_items(gallery_id);
create index idx_selection_items_photo on selection_items(photo_id);

-- Idempotency cho ghi theo lô: client gửi client_op_id, server bỏ qua nếu trùng.
create table selection_ops (
  client_op_id  uuid primary key,
  selection_id  uuid not null references selections(id) on delete cascade,
  applied_at    timestamptz not null default now()
);

create index idx_selection_ops_selection on selection_ops(selection_id);

-- ============================================================================
-- 10. GIAO HÀNG (Phase 2)
-- ============================================================================

create table deliveries (
  id              uuid primary key default gen_random_uuid(),
  gallery_id      uuid not null references galleries(id) on delete cascade,
  branch_id       uuid not null references branches(id),
  status          delivery_status not null default 'pending',
  retoucher_id    uuid references staff_profiles(id),
  due_at          timestamptz,
  final_drive_url text,
  physical_items  jsonb not null default '[]'::jsonb,   -- album in, USB, khung...
  delivered_at    timestamptz,
  received_by     text,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_deliveries_branch_status on deliveries(branch_id, status);

-- ============================================================================
-- 11. NHẬT KÝ HOẠT ĐỘNG
-- ============================================================================

create table activity_logs (
  id            bigserial primary key,
  branch_id     uuid references branches(id),
  actor_type    text not null check (actor_type in ('staff','customer','system')),
  actor_id      uuid,                -- staff_profiles.id hoặc share_links.id
  actor_label   text,                -- tên hiển thị tại thời điểm ghi log
  action        text not null,       -- 'gallery.create', 'selection.submit', 'export.csv'
  entity_type   text,
  entity_id     uuid,
  metadata      jsonb not null default '{}'::jsonb,
  ip            inet,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index idx_activity_branch_time on activity_logs(branch_id, created_at desc);
create index idx_activity_entity on activity_logs(entity_type, entity_id);
create index idx_activity_action on activity_logs(action, created_at desc);

-- ============================================================================
-- 12. THÔNG BÁO (hàng đợi gửi Lark / Zalo / email)
-- ============================================================================

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid references branches(id),
  channel       text not null check (channel in ('lark','zalo','email','inapp')),
  template      text not null,
  payload       jsonb not null default '{}'::jsonb,
  target        text,
  status        text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts      integer not null default 0,
  last_error    text,
  scheduled_at  timestamptz not null default now(),
  sent_at       timestamptz,
  created_at    timestamptz not null default now()
);

create index idx_notifications_pending on notifications(scheduled_at) where status = 'pending';

-- ============================================================================
-- 13. CÀI ĐẶT
-- ============================================================================

create table settings (
  id          uuid primary key default gen_random_uuid(),
  key         text not null,
  branch_id   uuid references branches(id),   -- null = cài đặt toàn hệ thống
  value       jsonb not null default '{}'::jsonb,
  updated_by  uuid references staff_profiles(id),
  updated_at  timestamptz not null default now()
);

-- Mỗi key duy nhất theo chi nhánh; branch_id null = bản ghi toàn hệ thống.
create unique index uq_settings_key_branch
  on settings(key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================================================
-- 14. TRIGGER updated_at
-- ============================================================================

create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'branches','staff_profiles','customers','babies','packages','shoots',
    'galleries','photos','selections','selection_items','deliveries','settings'
  ] loop
    execute format(
      'create trigger trg_%s_updated_at before update on %I
       for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ============================================================================
-- 15. HÀM NGHIỆP VỤ
-- ============================================================================

-- Đếm số ảnh đã chọn (chỉ mark='selected') của một phiên chọn.
create or replace function count_selected(p_selection_id uuid)
returns integer language sql stable as $$
  select count(*)::integer
  from selection_items
  where selection_id = p_selection_id and mark = 'selected';
$$;

-- Tính phụ thu vượt quota tại thời điểm gọi.
create or replace function calc_extra_amount(p_gallery_id uuid, p_selection_id uuid)
returns numeric language sql stable as $$
  select greatest(count_selected(p_selection_id) - g.included_quota, 0) * g.extra_photo_price
  from galleries g where g.id = p_gallery_id;
$$;

-- Chuyển album quá hạn sang 'expired' (gọi bởi cron hằng ngày).
create or replace function expire_overdue_galleries()
returns integer language sql as $$
  with updated as (
    update galleries
    set status = 'expired'
    where status in ('ready','in_review')
      and due_at is not null
      and due_at < now()
    returning 1
  )
  select count(*)::integer from updated;
$$;

-- ============================================================================
-- 16. VIEW BÁO CÁO
-- ============================================================================

create or replace view v_gallery_progress as
select
  g.id,
  g.branch_id,
  b.name                              as branch_name,
  g.title,
  g.status,
  c.full_name                         as customer_name,
  c.phone                             as customer_phone,
  g.photo_count,
  g.included_quota,
  g.due_at,
  g.sent_at,
  g.submitted_at,
  s.id                                as primary_selection_id,
  coalesce(count_selected(s.id), 0)   as selected_count,
  greatest(coalesce(count_selected(s.id), 0) - g.included_quota, 0) as extra_count,
  case
    when g.status = 'submitted' then 'done'
    when g.due_at is null then 'no_due'
    when g.due_at < now() then 'overdue'
    when g.due_at < now() + interval '2 days' then 'due_soon'
    else 'on_track'
  end                                 as urgency,
  extract(epoch from (coalesce(g.submitted_at, now()) - g.sent_at)) / 86400 as days_to_submit
from galleries g
join branches b on b.id = g.branch_id
join customers c on c.id = g.customer_id
left join selections s on s.gallery_id = g.id and s.is_primary;

comment on view v_gallery_progress is 'Nguồn dữ liệu cho dashboard quản trị.';
