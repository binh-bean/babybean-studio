-- ============================================================================
-- Migration: 0026 — thu hồi PUBLIC EXECUTE trên các hàm trợ giúp schema app
--
-- PM tìm ra khi quét quyền hàm. Cùng họ với 0025: một mặc định của Postgres
-- lặng lẽ cho nhiều hơn ý định.
--
-- ---------------------------------------------------------------------------
-- Phát hiện
-- ---------------------------------------------------------------------------
-- docs/12-security.md mục 9 đặt luật: revoke nằm ngay dưới create, vì
-- `create function` mặc định cấp EXECUTE cho PUBLIC. Luật đó được áp dụng cho
-- các hàm trong schema public, và cho hai hàm mới trong schema app
-- (gallery_quota ở 0014, gallery_paid_amount ở 0024).
--
-- Nhưng SÁU hàm trợ giúp gốc trong policies.sql thì chưa ai thu hồi:
--
--   app.my_role  app.is_superuser  app.my_branches
--   app.can_see_branch  app.can_write  app.can_manage_customers
--
-- Liệt kê ACL ra thấy rõ:
--   my_role   =X/postgres | postgres=X/postgres | authenticated=X/postgres | ...
--             ^^^^^^^^^^^ mục trống ở đầu chính là PUBLIC
--
-- Cả sáu đều là SECURITY DEFINER, chạy dưới quyền chủ sở hữu, nên RLS không áp
-- dụng cho những gì chúng đọc.
--
-- ---------------------------------------------------------------------------
-- Mức độ thật, không nói quá
-- ---------------------------------------------------------------------------
-- HÔM NAY anon KHÔNG gọi tới được. Thử thật bằng `set role anon` thì Postgres
-- trả "permission denied for schema app": anon không có USAGE trên schema app,
-- và schema chặn trước khi quyền hàm được xét tới.
--
-- Nên đây KHÔNG phải lỗ đang chảy. Vẫn phải bịt vì toàn bộ phòng thủ đang tựa
-- vào ĐÚNG MỘT dòng cấp quyền schema. Một lệnh
--
--     grant usage on schema app to anon;
--
-- gõ lúc gỡ lỗi là sáu hàm definer mở ra ngay. Năm hàm đầu trả null/false cho
-- anon nên vô hại, nhưng app.gallery_paid_amount đọc dữ liệu tiền — nó đã có
-- revoke riêng, còn năm hàm kia thì không, và hàm thứ bảy viết sau này sẽ lại
-- quên nếu không có hàng rào.
--
-- Hai lớp tốt hơn một lớp, và lớp này không tốn gì: không đường ghi nào của
-- app cần PUBLIC gọi các hàm này.
-- ============================================================================

begin;

-- Vòng lặp thay vì gõ tay từng chữ ký: chữ ký gõ sai một dấu là lệnh chạy qua
-- mà không thu hồi gì cả, và không có lỗi nào báo.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app'
  loop
    execute format('revoke all on function %s from public', fn.sig);
  end loop;
end $$;

-- Hàm viết sau này trong schema app cũng không được nhận PUBLIC EXECUTE.
-- Không có dòng này thì hàng rào chỉ giữ được tới hàm tiếp theo.
alter default privileges in schema app revoke execute on functions from public;

-- Cấp lại cho đúng hai vai cần. Chính sách RLS được đánh giá dưới vai của
-- người truy vấn, nên `authenticated` phải gọi được các hàm trợ giúp — không
-- có chúng thì mọi policy đều lỗi và nhân viên không đọc được gì.
grant execute on all functions in schema app to authenticated, service_role;

commit;
