-- ============================================================================
-- 0045 — Bỏ tính năng mã PIN (BB-169 chặng 2)
--
-- ADR-0005: Gỡ hoàn toàn mã PIN bảo vệ album vì không có lượt dùng.
-- ============================================================================

-- 1. Dựng lại view v_share_links (bỏ requires_pin)
--
-- PHẢI `drop` rồi `create`, KHÔNG dùng được `create or replace`.
-- Postgres chỉ cho `replace` THÊM cột vào cuối, không cho BỎ BỚT cột — áp lên
-- một cơ sở dữ liệu đã có khung nhìn cũ sẽ gãy với "cannot drop columns from view".
--
-- Cổng `verify:schema` KHÔNG bắt được lỗi này, và đó không phải lỗi của cổng:
-- nó luôn dựng từ một schema TRỐNG nên không có khung nhìn cũ để va chạm.
-- Lớp lỗi này chỉ lộ ra khi áp thật.
--
-- Không dùng `cascade`: đã tra pg_depend ngày 17/09, không khung nhìn nào và
-- không chính sách quyền nào phụ thuộc vào nó. `cascade` ở đây sẽ là một con dao
-- sắc cầm ngược: nó im lặng xoá luôn thứ mình không biết là có.
drop view if exists v_share_links;

create view v_share_links as
select id, gallery_id, token_prefix, role, label, status,
       expires_at, view_count, last_viewed_at, created_at, revoked_at
from share_links;

-- 2. Dựng lại hàm create_gallery_bundle
drop function if exists public.create_gallery_bundle;

create or replace function public.create_gallery_bundle(
  p_branch_id uuid,
  p_customer_id uuid default null,
  p_new_customer jsonb default null,
  p_baby_id uuid default null,
  p_new_baby jsonb default null,
  p_package_id uuid default null,
  p_photographer_id uuid default null,
  p_shoot_date date default null,
  p_title text default '',
  p_drive_folder_id text default '',
  p_drive_folder_url text default '',
  p_drive_folder_name text default null,
  p_included_quota integer default null,
  p_extra_photo_price numeric default null,
  p_max_selection integer default null,
  p_due_at timestamptz default null,
  p_welcome_message text default null,
  p_watermark_enabled boolean default true,
  p_download_enabled boolean default false,
  p_notes_enabled boolean default true,
  p_invite_enabled boolean default true,
  p_token_hash text default '',
  p_token_prefix text default '',
  p_staff_id uuid default null,
  p_actor_label text default null,
  p_ip inet default null,
  p_user_agent text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, app, extensions
as $$
declare
  v_customer_id uuid := p_customer_id;
  v_baby_id uuid := p_baby_id;
  v_customer_phone text;
  v_pkg packages%rowtype;
  v_quota integer;
  v_extra_price numeric;
  v_shoot_id uuid := null;
  v_gallery_id uuid;
  v_share_link_id uuid;
begin
  -- 1. Xử lý Customer
  if v_customer_id is null and p_new_customer is not null then
    insert into customers (
      branch_id,
      full_name,
      phone,
      zalo
    ) values (
      p_branch_id,
      p_new_customer->>'fullName',
      p_new_customer->>'phone',
      p_new_customer->>'zalo'
    ) returning id, phone into v_customer_id, v_customer_phone;
  elsif v_customer_id is not null then
    select phone into v_customer_phone from customers where id = v_customer_id and branch_id = p_branch_id;
    if not found then
      raise exception 'CUSTOMER_NOT_FOUND' using errcode = 'P0002';
    end if;
  else
    raise exception 'CUSTOMER_REQUIRED' using errcode = 'P0001';
  end if;

  -- 2. Xử lý Baby
  if v_baby_id is null and p_new_baby is not null then
    insert into babies (
      customer_id,
      full_name,
      birth_date
    ) values (
      v_customer_id,
      p_new_baby->>'fullName',
      case 
        when p_new_baby->>'birthDate' is not null and p_new_baby->>'birthDate' <> '' 
        then (p_new_baby->>'birthDate')::date 
        else null 
      end
    ) returning id into v_baby_id;
  end if;

  -- 3. Xử lý Package & Quota
  select * into v_pkg from packages where id = p_package_id;
  if not found then
    raise exception 'PACKAGE_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_quota := coalesce(p_included_quota, v_pkg.included_quota);
  v_extra_price := coalesce(p_extra_photo_price, v_pkg.extra_photo_price);

  -- 4. Tạo shoot nếu có shoot_date
  if p_shoot_date is not null then
    insert into shoots (
      branch_id, customer_id, baby_id, package_id, photographer_id,
      shoot_date, created_by
    ) values (
      p_branch_id, v_customer_id, v_baby_id, p_package_id, p_photographer_id,
      p_shoot_date, p_staff_id
    ) returning id into v_shoot_id;
  end if;

  -- 5. Insert galleries
  insert into galleries (
    branch_id, shoot_id, customer_id, baby_id, package_id,
    title, welcome_message, status,
    drive_folder_id, drive_folder_url, drive_folder_name,
    included_quota, extra_photo_price, max_selection,
    watermark_enabled, download_enabled, notes_enabled, invite_enabled,
    due_at, created_by
  ) values (
    p_branch_id, v_shoot_id, v_customer_id, v_baby_id, p_package_id,
    p_title, p_welcome_message, 'draft',
    p_drive_folder_id, p_drive_folder_url, p_drive_folder_name,
    v_quota, v_extra_price, p_max_selection,
    coalesce(p_watermark_enabled, true),
    coalesce(p_download_enabled, false),
    coalesce(p_notes_enabled, true),
    coalesce(p_invite_enabled, true),
    coalesce(p_due_at, now() + interval '7 days'),
    p_staff_id
  ) returning id into v_gallery_id;

  -- 6. Insert share_links
  insert into share_links (
    gallery_id, token_hash, token_prefix, role, label,
    status, created_by
  ) values (
    v_gallery_id, p_token_hash, p_token_prefix, 'owner', 'Khách chính',
    'active', p_staff_id
  ) returning id into v_share_link_id;

  -- 7. Ghi activity_logs trong cùng transaction
  insert into activity_logs (
    branch_id, actor_type, actor_id, actor_label,
    action, entity_type, entity_id,
    metadata, ip, user_agent
  ) values (
    p_branch_id, 'staff', p_staff_id, p_actor_label,
    'gallery.create', 'gallery', v_gallery_id,
    jsonb_build_object(
      'title', p_title,
      'drive_folder_id', p_drive_folder_id,
      'share_link_id', v_share_link_id,
      'token_prefix', p_token_prefix,
      'included_quota', v_quota
    ),
    p_ip, p_user_agent
  );

  return jsonb_build_object(
    'gallery_id', v_gallery_id,
    'share_link_id', v_share_link_id,
    'customer_id', v_customer_id,
    'baby_id', v_baby_id
  );
end;
$$;

-- THU HỒI TRƯẮC, CẤP SAU — và phải có đủ cả hai dòng.
--
-- `drop function` xoá luôn mọi lệnh thu hồi quyền đã áp trước đó (0006), và
-- Postgres **mặc định cấp quyền chạy cho PUBLIC** với mọi hàm mới tạo. Hàm này
-- là `security definer`, nên thiếu dòng revoke là khoá công khai gọi được nó và
-- đi vòng qua toàn bộ lớp kiểm quyền — tạo khách, tạo bộ ảnh, tạo link chia sẻ.
--
-- Lỗ này đã mở thật trên bb-dev ngày 17/09, và `verify:db` bắt được ngay
-- (“Khoá công khai không gọi được hàm SECURITY DEFINER”). Đó là lý do cổng đó
-- tồn tại — đừng bỏ qua nó khi áp migration có đụng tới hàm.
revoke execute on function public.create_gallery_bundle from public, anon;
grant execute on function public.create_gallery_bundle to authenticated, service_role;

-- 3. Xoá các cột mã PIN
alter table public.share_links
  drop column if exists requires_pin,
  drop column if exists pin_hash,
  drop column if exists failed_attempts,
  drop column if exists locked_until;
