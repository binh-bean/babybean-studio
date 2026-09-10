-- ============================================================================
-- 0002 — Stored procedure tạo album, share link và activity log trong 1 transaction
--
-- Task BB-023: POST /api/admin/galleries
-- ============================================================================

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
  p_requires_pin boolean default true,
  p_pin text default null,
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
  v_final_pin text := p_pin;
  v_pin_hash text := null;
  v_shoot_id uuid := null;
  v_gallery_id uuid;
  v_share_link_id uuid;
  v_requires_pin boolean := coalesce(p_requires_pin, true);
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

  -- 4. Xử lý PIN
  if v_requires_pin then
    -- Nếu chưa có PIN truyền vào, lấy 4 số cuối của SĐT khách hàng
    if v_final_pin is null or length(trim(v_final_pin)) = 0 then
      if v_customer_phone is not null and length(trim(v_customer_phone)) >= 4 then
        v_final_pin := right(trim(v_customer_phone), 4);
      else
        v_final_pin := '1234';
      end if;
    end if;
    v_pin_hash := crypt(v_final_pin, gen_salt('bf', 10));
  end if;

  -- 5. Tạo shoot nếu có shoot_date
  if p_shoot_date is not null then
    insert into shoots (
      branch_id, customer_id, baby_id, package_id, photographer_id,
      shoot_date, created_by
    ) values (
      p_branch_id, v_customer_id, v_baby_id, p_package_id, p_photographer_id,
      p_shoot_date, p_staff_id
    ) returning id into v_shoot_id;
  end if;

  -- 6. Insert galleries
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

  -- 7. Insert share_links
  insert into share_links (
    gallery_id, token_hash, token_prefix, role, label,
    requires_pin, pin_hash, status, created_by
  ) values (
    v_gallery_id, p_token_hash, p_token_prefix, 'owner', 'Khách chính',
    v_requires_pin, v_pin_hash, 'active', p_staff_id
  ) returning id into v_share_link_id;

  -- 8. Ghi activity_logs trong cùng transaction
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
      'included_quota', v_quota,
      'requires_pin', v_requires_pin
    ),
    p_ip, p_user_agent
  );

  return jsonb_build_object(
    'gallery_id', v_gallery_id,
    'share_link_id', v_share_link_id,
    'customer_id', v_customer_id,
    'baby_id', v_baby_id,
    'pin', v_final_pin
  );
end;
$$;

grant execute on function public.create_gallery_bundle to authenticated, service_role;
