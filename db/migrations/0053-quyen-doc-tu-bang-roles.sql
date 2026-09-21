-- ============================================================================
-- 0053 — Lớp quyền đọc từ bảng `roles` (BB-172 chặng 2a, phần bảo mật)
--
-- ADR-0007 phương án C. `0052` đã dựng bảng `roles` và gán `role_id` cho từng
-- nhân sự; tệp này là phần đổi cách RLS hỏi "người này được làm gì".
--
-- ---------------------------------------------------------------------------
-- Ba điều tệp này CỐ Ý KHÔNG làm
-- ---------------------------------------------------------------------------
-- 1. **Không đụng vào lớp chặn chi nhánh.** `app.my_branches()` và
--    `app.can_see_branch()` giữ nguyên từng chữ. Đó là lớp giữ cho nhân viên
--    Pasteur không đọc được album Gò Vấp, và nó không liên quan gì tới việc
--    vai trò được lưu ở đâu. Đổi hai thứ cùng lúc thì lúc có chuyện không ai
--    biết cái nào gây ra.
-- 2. **Không bỏ cột `staff_profiles.role`.** `db/migrations/README.md`: bỏ cột
--    phải đi hai nhịp phát hành. `app.my_role()` vẫn đọc cột cũ.
-- 3. **Không đổi ai được làm gì.** Sau tệp này, đúng những người hôm qua ghi
--    được vẫn ghi được. Chặng 2 là đổi CÁCH LƯU, không phải đổi quyền.
--
-- Điểm 3 là chỗ dễ trượt nhất, nên nói rõ: `app.can_write()` hôm nay cho
-- owner, admin, branch_manager, cs **và photographer**. Nhưng trong bảng quyền
-- của `0052`, photographer KHÔNG có `galleries:write` — họ có `galleries:create`
-- và `galleries:sync`. Nếu `can_write()` chỉ hỏi `galleries:write` thì thợ ảnh
-- mất quyền tạo album ngay khi tệp này chạy, mà không một dòng nào trong tệp
-- nói ra điều đó. Nên `can_write()` hỏi CẢ HAI.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Quyền đánh dấu "vai này đứng trên chi nhánh"
-- ---------------------------------------------------------------------------
-- `is_superuser()` hôm nay là `role in ('owner','admin')`. Để hỏi nó qua bảng
-- quyền thì phải có một tên quyền tương ứng; `0052` chưa có tên nào mang nghĩa
-- đó (`settings:system` là quyền sửa cài đặt, không phải quyền vượt chi nhánh).
update roles
   set permissions = permissions || '{system:superuser}'
 where name in ('owner', 'admin')
   and not ('system:superuser' = any(permissions));

-- ---------------------------------------------------------------------------
-- 2. Hỏi quyền
-- ---------------------------------------------------------------------------
-- `security definer` vì hàm này đọc `staff_profiles`, mà chính `staff_profiles`
-- có RLS gọi ngược lại nhóm hàm này — không có `definer` là đệ quy vô hạn.
--
-- Nhánh `role_id is null` KHÔNG phải cho vui: đường tạo nhân sự
-- (`/api/admin/staff`) ghi cột `role`, chưa ghi `role_id`. Thiếu nhánh này thì
-- tài khoản tạo sau hôm nay có `role_id` rỗng, `has_permission` trả false cho
-- mọi câu hỏi, và người mới **đăng nhập được nhưng không làm gì được** — hỏng
-- trong im lặng, đúng lớp lỗi cả ngày hôm nay đang dọn. Trigger ở mục 4 vá
-- nguồn; nhánh này là lưới đỡ.
create or replace function app.has_permission(p text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
      from staff_profiles sp
      join roles r
        on r.id = sp.role_id
        or (sp.role_id is null and r.name = sp.role::text)
     where sp.id = auth.uid()
       and sp.is_active
       and p = any(r.permissions)
  );
$$;

-- `0026` thu hồi execute của PUBLIC và đặt mặc định "hàm mới trong schema app
-- không cấp cho ai". Nên hàm này PHẢI có dòng grant của chính nó, nếu không
-- mọi policy gọi nó đều từ chối và cả ứng dụng đứng hình.
revoke execute on function app.has_permission(text) from public;
grant  execute on function app.has_permission(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Ba cổng cũ, nay hỏi qua bảng quyền
-- ---------------------------------------------------------------------------
create or replace function app.is_superuser()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.has_permission('system:superuser'), false);
$$;

-- Ghi dữ liệu SẢN XUẤT: album, ảnh, buổi chụp.
-- Hỏi cả `galleries:create` — xem ghi chú ở đầu tệp về thợ ảnh.
create or replace function app.can_write()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    app.has_permission('galleries:write') or app.has_permission('galleries:create'),
    false);
$$;

-- Ghi dữ liệu KHÁCH HÀNG: customers, babies. KHÔNG có thợ ảnh —
-- docs/05-rbac.md §2 cho photographer quyền đọc, không phải sửa.
create or replace function app.can_manage_customers()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(app.has_permission('customers:write'), false);
$$;

revoke execute on function app.is_superuser()          from public;
revoke execute on function app.can_write()             from public;
revoke execute on function app.can_manage_customers()  from public;
grant  execute on function app.is_superuser()          to authenticated, service_role;
grant  execute on function app.can_write()             to authenticated, service_role;
grant  execute on function app.can_manage_customers()  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Giữ `role_id` khớp với `role`, ngay tại nguồn
-- ---------------------------------------------------------------------------
-- Phải đồng bộ CẢ KHI `role` đổi, không chỉ khi `role_id` rỗng.
--
-- Bản đầu chỉ điền lúc rỗng, và hai bài kiểm bảo mật bắt được ngay: nơi nào đổi
-- `role` mà không đổi `role_id` — chính là `PATCH /api/admin/staff/[id]` — sẽ
-- để hai cột nói hai điều khác nhau. Lúc ấy `has_permission` đọc `role_id` CŨ,
-- nên người vừa bị hạ xuống `accountant` vẫn giữ nguyên quyền của vai cũ.
--
-- Ca 13 của `docs/05-rbac.md §6` đỏ với "expected 1 to be 0": kế toán nhìn thấy
-- ảnh. Đó là một lỗ quyền thật, không phải phép thử khó tính.
create or replace function app.dong_bo_role_id()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

-- Quét lại toàn bảng: vừa điền dòng còn rỗng, vừa kéo về đúng những dòng đã
-- lệch từ trước khi có trigger.
update staff_profiles sp
   set role_id = r.id
  from roles r
 where r.is_system
   and r.name = sp.role::text
   and sp.role_id is distinct from r.id;

-- ---------------------------------------------------------------------------
-- 5. Vai hệ thống là bất biến
-- ---------------------------------------------------------------------------
-- ADR-0007: `owner` không bao giờ được sửa hay xoá, để chủ studio không tự nhốt
-- mình ngoài hệ thống. Chặn ở CSDL chứ không chỉ ở API — API có thể bị đi vòng,
-- trigger thì không.
-- Một ngoại lệ, có chủ ý: vai `postgres` — tức migration — vẫn sửa được.
--
-- Chặn tuyệt đối nghe chắc chắn hơn, nhưng nó biến mọi lần thêm một tên quyền
-- mới cho `owner` thành "tắt trigger, sửa, bật lại". Ai cũng làm được điều đó,
-- và đến lần thứ ba sẽ có người quên bật lại — lúc ấy lớp chặn coi như không
-- có. Đường đi của ứng dụng (`service_role`, `authenticated`) vẫn bị chặn
-- tuyệt đối, và đó mới là đường mà một lỗi thật sẽ đi qua.
create or replace function app.chan_sua_vai_he_thong()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.is_system and current_user <> 'postgres' then
    raise exception 'Vai trò hệ thống "%" không sửa và không xoá được', old.name
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function app.chan_sua_vai_he_thong() from public;

drop trigger if exists trg_chan_sua_vai_he_thong on roles;
create trigger trg_chan_sua_vai_he_thong
  before update or delete on roles
  for each row execute function app.chan_sua_vai_he_thong();

-- ---------------------------------------------------------------------------
-- 6. Ai đọc được bảng `roles`
-- ---------------------------------------------------------------------------
-- `0052` bật RLS mà cố ý chưa có policy nào — đóng chứ không mở. Nay mở đúng
-- một đường: nhân viên đã đăng nhập ĐỌC được danh sách vai, vì màn Nhân sự phải
-- hiện tên vai. Ghi thì chỉ `service_role`, tức chỉ đi qua đường API của mình.
drop policy if exists roles_select_authenticated on roles;
create policy roles_select_authenticated on roles
  for select to authenticated using (true);
