-- Migration: T?o ch?c nang check_staff_deletable

create or replace function app.check_staff_deletable(p_staff_id uuid)
returns text
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  -- 1. T?o b? ?nh (galleries.created_by)
  select count(*) into v_count from galleries where created_by = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này đã tạo ' || v_count || ' bộ ảnh nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  -- 2. D?oc gán làm th? ?nh, th? ch?nh, hay CSKH c?a b? nào (galleries)
  select count(*) into v_count from galleries 
  where photographer_id = p_staff_id or cskh_id = p_staff_id or editor_id = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này đang phụ trách ' || v_count || ' bộ ảnh nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  -- 3. activity_logs
  select count(*) into v_count from activity_logs where actor_type = 'staff' and actor_id = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này có ' || v_count || ' nhật ký hoạt động nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  -- 4. gallery_payments
  select count(*) into v_count from gallery_payments where confirmed_by = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này đã xác nhận ' || v_count || ' thanh toán nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  -- 5. shoots (created_by, photographer_id)
  select count(*) into v_count from shoots where created_by = p_staff_id or photographer_id = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này có lịch sử trong ' || v_count || ' buổi chụp nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  -- 6. customers
  select count(*) into v_count from customers where created_by = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này đã tạo ' || v_count || ' khách hàng nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  -- N?u không v??ng gì
  return null;
end;
$$;

-- View d? ki?m tra nhanh deletability c?a toàn b? nhân viên (dùng trong danh sách admin)
create or replace view app.v_staff_deletable as
select 
  id as staff_id,
  app.check_staff_deletable(id) as delete_reason
from staff_profiles;
