-- Migration 0065 — giá một ảnh chọn thêm mặc định, cấu hình được (BB-214c)
--
-- OWNER: DEV-BE. Task BB-214(c).
--
-- ---------------------------------------------------------------------------
-- Vì sao có tệp này
-- ---------------------------------------------------------------------------
-- Lời chủ studio: "một file chỉnh là 50k, chưa có quyết định thay đổi, nhưng
-- cứ để dự trù phương án để sau này có thể thay đổi nếu có quyết định."
--
-- Rà soát 24/09/2026: số 50000 đang nằm ở BA chỗ khác nhau, không chỗ nào là
-- "cấu hình":
--   1. `packages.extra_photo_price` — mỗi trong 4 gói đang có tự set 50000.
--   2. `create-gallery-wizard.tsx` — `useState(50000)` trước khi chọn gói.
--   3. Hàm `create_gallery_bundle` — rơi về `v_pkg.extra_photo_price` khi form
--      không truyền `p_extra_photo_price`.
--
-- Cả 488/488 bộ ảnh hiện có đều mang đúng 50000, đúng như một con số toàn
-- studio bị chép tay ra nhiều chỗ, không phải một thang giá thật sự khác nhau
-- theo gói. Migration này đưa nó về MỘT chỗ, theo đúng cách các khoá khác
-- trong màn Cài đặt đã làm (`gallery.reminder_days`, `gallery.link_ttl_days`).
--
-- ---------------------------------------------------------------------------
-- Không đổi giá của bộ ảnh đã có
-- ---------------------------------------------------------------------------
-- Migration này CHỈ thêm một dòng `settings`. Không `update galleries`, không
-- đụng `packages.extra_photo_price` (cột đó vẫn còn, vẫn là nơi rơi về cuối
-- cùng nếu đọc settings hụt — xem sửa đổi cùng lúc trong
-- `create_gallery_bundle`, khối "4b" bên dưới).
--
-- ---------------------------------------------------------------------------
-- Chưa làm thang giá theo gói
-- ---------------------------------------------------------------------------
-- Không xoá `packages.extra_photo_price`, không thêm bảng giá theo gói. Nếu
-- sau này chủ studio quyết định giá khác nhau theo từng gói, chỗ gắn vào là
-- ngay TRƯỚC dòng đọc settings trong `create_gallery_bundle` (đã đánh dấu
-- bằng chú thích "THANG GIÁ THEO GÓI" ở khối 4b).

-- 1 --------------------------------------------------------------------------
insert into settings (key, branch_id, value)
values ('gallery.extra_photo_price_default', null, '50000'::jsonb)
on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

-- 2 --------------------------------------------------------------------------
-- create_gallery_bundle: rơi về settings TRƯỚC khi rơi về giá của gói. Ưu
-- tiên vì settings mới là "chỗ mặc định" theo yêu cầu — giá của gói giờ chỉ
-- còn là lưới an toàn cuối cùng nếu vì lý do gì đó thiếu dòng settings.
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
  v_settings_price numeric;
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

  -- THANG GIÁ THEO GÓI — chưa làm. Nếu sau này giá khác nhau theo gói, đọc
  -- theo v_pkg ở ĐÂY, trước khi rơi về settings, ví dụ:
  --   v_extra_price := coalesce(p_extra_photo_price, <giá riêng theo v_pkg.id>, v_settings_price, v_pkg.extra_photo_price);
  select (value)::text::numeric into v_settings_price
    from settings
   where key = 'gallery.extra_photo_price_default'
     and branch_id is null;

  v_extra_price := coalesce(p_extra_photo_price, v_settings_price, v_pkg.extra_photo_price);

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
      'included_quota', v_quota,
      'extra_photo_price', v_extra_price
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

-- THU HỒI TRƯỚC, CẤP SAU — và phải có đủ cả hai dòng (xem AGENTS.md §5b).
-- `drop function` xoá luôn mọi lệnh thu hồi quyền đã áp trước đó, và Postgres
-- mặc định cấp quyền chạy cho PUBLIC với mọi hàm mới tạo.
revoke execute on function public.create_gallery_bundle from public, anon;
grant execute on function public.create_gallery_bundle to authenticated, service_role;
