-- Migration 0048 — khoá lại `check_staff_deletable`, và dọn bản sao lạc trong schema `app`.
--
-- OWNER: PM (reviewer). Soát sau khi gộp BB-171.
--
-- ---------------------------------------------------------------------------
-- Vì sao có tệp này
-- ---------------------------------------------------------------------------
-- `npm run verify:db` rơi từ 17/17 xuống 16/17 ngay sau khi 0047 chạy:
--
--   HỎNG  Khoá công khai không gọi được hàm SECURITY DEFINER
--         GỌI ĐƯỢC: public.check_staff_deletable
--
-- 0047 tạo hàm bằng `create or replace function ... security definer` mà không
-- kèm dòng `revoke` nào. Postgres CẤP EXECUTE CHO PUBLIC theo mặc định với mọi
-- hàm mới — nên khoá `anon` (khoá nằm công khai trong mã trình duyệt) gọi được
-- nó qua PostgREST.
--
-- Hàm là SECURITY DEFINER, tức nó chạy bằng quyền của `postgres` và **đi vòng
-- qua toàn bộ luật quyền theo dòng**. Nó đọc `galleries`, `activity_logs`,
-- `customers`, `shoots`, `gallery_payments`. Người ngoài cầm một mã nhân viên
-- là hỏi được "người này đã tạo bao nhiêu bộ ảnh, bao nhiêu khách".
--
-- Đây là **lần thứ hai** cùng một lỗi trong dự án: 0045 cũng xoá mất dòng
-- revoke của 0006 theo đúng cách này. `drop`/`create` một hàm là trả quyền về
-- mặc định, và mặc định của Postgres là PUBLIC.
--
-- ---------------------------------------------------------------------------
-- Ba việc, và vì sao mỗi việc cần
-- ---------------------------------------------------------------------------
-- 1. Thu hồi EXECUTE của public/anon/authenticated. Chỉ `service_role` gọi —
--    đó là khoá máy chủ, và cả hai chỗ dùng hàm này (`/api/admin/staff` và
--    `/api/admin/staff/[id]`) đều đi bằng khoá đó sau khi đã kiểm vai.
--
-- 2. Ghim `search_path`. Hàm SECURITY DEFINER không ghim search_path là hàm có
--    thể bị lừa gọi sang bảng giả nếu ai đó tạo được schema đứng trước trong
--    đường tìm. Hôm nay chưa ai tạo được, nhưng đây đúng là thứ không nên để
--    phụ thuộc vào chữ "hôm nay".
--
-- 3. Dọn `app.check_staff_deletable`. Bản sao này CÓ TRÊN bb-dev nhưng KHÔNG
--    có trong một tệp migration nào — nó được tạo tay. Không ai gọi nó
--    (`grep -rn "app.check_staff_deletable" src/ db/ scripts/` không ra dòng
--    nào), và bb-prod sẽ không bao giờ có nó. Hai bản cùng tên ở hai schema là
--    chỗ ngày nào đó có người sửa đúng một bản rồi tưởng đã xong.
--
-- ---------------------------------------------------------------------------
-- Khung nhìn `v_staff_deletable` không phải đi cùng
-- ---------------------------------------------------------------------------
-- Đã đo: `anon` KHÔNG có SELECT trên khung nhìn đó, chỉ `service_role` và
-- `postgres` có. Nên nó không phải là đường vòng, và tệp này không đụng vào.

-- 1 --------------------------------------------------------------------------
create or replace function public.check_staff_deletable(p_staff_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from galleries where created_by = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này đã tạo ' || v_count || ' bộ ảnh nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  select count(*) into v_count from galleries
  where photographer_id = p_staff_id or cskh_id = p_staff_id or editor_id = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này đang phụ trách ' || v_count || ' bộ ảnh nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  select count(*) into v_count from activity_logs where actor_type = 'staff' and actor_id = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này có ' || v_count || ' nhật ký hoạt động nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  select count(*) into v_count from gallery_payments where confirmed_by = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này đã xác nhận ' || v_count || ' thanh toán nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  select count(*) into v_count from shoots where created_by = p_staff_id or photographer_id = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này có lịch sử trong ' || v_count || ' buổi chụp nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  select count(*) into v_count from customers where created_by = p_staff_id;
  if v_count > 0 then
    return 'Tài khoản này đã tạo ' || v_count || ' khách hàng nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử.';
  end if;

  return null;
end;
$$;

-- 2 --------------------------------------------------------------------------
-- Phải đứng SAU `create or replace`: replace trả quyền về mặc định, nên đảo
-- thứ tự hai khối này là dòng revoke bị chính create ở trên xoá đi.
revoke execute on function public.check_staff_deletable(uuid) from public;
revoke execute on function public.check_staff_deletable(uuid) from anon;
revoke execute on function public.check_staff_deletable(uuid) from authenticated;
grant  execute on function public.check_staff_deletable(uuid) to service_role;

-- 3 --------------------------------------------------------------------------
-- Không chỉ một hàm: trong schema `app` có CẢ CẶP — hàm và khung nhìn đọc nó.
-- Cả hai đều không nằm trong một tệp migration nào, không dòng mã nào gọi tới,
-- và bb-prod sẽ không bao giờ có chúng. Phải bỏ khung nhìn trước, không thì
-- Postgres từ chối: "cannot drop function ... because other objects depend on it".
drop view     if exists app.v_staff_deletable;
drop function if exists app.check_staff_deletable(uuid);
