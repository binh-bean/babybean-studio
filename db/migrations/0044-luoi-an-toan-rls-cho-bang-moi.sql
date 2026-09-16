-- ============================================================================
-- Migration: 0044-luoi-an-toan-rls-cho-bang-moi
-- BB-163 — lưới an toàn: bảng mới tạo ra là RLS tự bật.
--
-- Vì sao có file này: hàm `public.rls_auto_enable()` và event trigger
-- `ensure_rls` ĐANG CHẠY trên bb-dev nhưng KHÔNG CÓ trong repo — ai đó tạo tay
-- trên bảng điều khiển Supabase rồi không commit. Hậu quả đo được 16/09/2026:
-- bb-prod dựng từ repo nên không có lưới này, và migration 0006 (revoke quyền
-- trên rls_auto_enable) im lặng rơi ở đó vì hàm không tồn tại.
--
-- Nghĩa là: trên bb-prod, ai tạo một bảng mới mà quên `enable row level
-- security` thì bảng đó mở cho anon đọc — đúng môi trường có 427 tên khách và
-- số điện thoại thật. verify:db canh được "mọi bảng đang có đều bật RLS", nhưng
-- nó chạy SAU khi bảng đã tồn tại; lưới này chặn ngay lúc tạo.
--
-- Bản này chép đúng hàm đang chạy trên bb-dev (pg_get_functiondef), thêm phần
-- revoke mà docs/12-security.md §9 đòi: 0006 chạy TRƯỚC file này nên câu revoke
-- ở đó không với tới được, phải tự revoke tại chỗ.
--
-- Event trigger cần quyền cao. Đo trên bb-prod: vai `postgres` không phải
-- superuser nhưng TẠO ĐƯỢC. Nếu một môi trường nào từ chối thì câu lệnh rơi và
-- bộ nạp tự hội tụ sẽ báo — không im lặng.
-- ============================================================================

create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path to 'pg_catalog'
as $$
declare
  cmd record;
begin
  for cmd in
    select *
    from pg_event_trigger_ddl_commands()
    where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      and object_type in ('table', 'partitioned table')
  loop
    if cmd.schema_name = 'public' then
      begin
        execute format('alter table if exists %s enable row level security', cmd.object_identity);
        raise log 'rls_auto_enable: đã bật RLS cho %', cmd.object_identity;
      exception
        when others then
          raise log 'rls_auto_enable: KHÔNG bật được RLS cho %', cmd.object_identity;
      end;
    else
      raise log 'rls_auto_enable: bỏ qua % (schema %)', cmd.object_identity, cmd.schema_name;
    end if;
  end loop;
end;
$$;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
grant execute on function public.rls_auto_enable() to service_role;

drop event trigger if exists ensure_rls;
create event trigger ensure_rls
  on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();
