-- ============================================================================
-- 0058 — Hai việc nhỏ để tầng API hỏi được quyền (BB-172 chặng 2d)
--
-- 1. Thêm `branches:manage`
-- ---------------------------------------------------------------------------
-- Tầng API có hai cửa "tạo chi nhánh" và "bật/tắt chi nhánh", hôm nay mở cho
-- `owner` và `admin`. Trong danh mục quyền không có tên nào mang đúng nghĩa đó
-- mà lại đúng bằng hai vai ấy: `branches:write` rộng hơn (có cả
-- `branch_manager`), `branches:delete` thì nói chuyện xoá.
--
-- Dùng bừa một quyền gần đúng là **đổi ai được làm gì**, mà luật của cả chặng
-- này là không ai thêm hay mất quyền. Nên thêm một tên mới, gán cho đúng hai
-- vai đang qua được cửa đó hôm nay.
--
-- 2. Trigger đồng bộ `role_id` phải nhường khi người ta gán vai TAY
-- ---------------------------------------------------------------------------
-- `0053` dạy trigger: `role` đổi thì kéo `role_id` theo. Đúng cho tới khi có
-- màn Vai trò — từ nay chủ studio gán **vai tự tạo** bằng cách đặt thẳng
-- `role_id`, và vai đó KHÔNG có tên trong kiểu enum `staff_role`.
--
-- Với bản cũ, một lượt `update staff_profiles set role_id = <vai tự tạo>` mà
-- không đụng `role` thì trigger để yên (đúng), nhưng một lượt đặt cả hai thì
-- trigger ghi đè `role_id` theo `role` — tức lặng lẽ vứt vai tự tạo đi và
-- không ai biết. Nay: ai đặt `role_id` tường minh thì người đó thắng.
-- ============================================================================

update roles
   set permissions = permissions || '{branches:manage}'
 where name in ('owner', 'admin')
   and not ('branches:manage' = any(permissions));

create or replace function app.dong_bo_role_id()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.role_id is distinct from old.role_id then
    -- Người gọi vừa đặt `role_id` tường minh. Đó là cách gán vai tự tạo, và
    -- trigger không được xen vào.
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    select id into new.role_id from roles where name = new.role::text and is_system;
  elsif new.role_id is null and new.role is not null then
    select id into new.role_id from roles where name = new.role::text and is_system;
  end if;

  return new;
end;
$$;

revoke execute on function app.dong_bo_role_id() from public;

drop trigger if exists trg_dong_bo_role_id on staff_profiles;
create trigger trg_dong_bo_role_id
  before insert or update of role, role_id on staff_profiles
  for each row execute function app.dong_bo_role_id();
