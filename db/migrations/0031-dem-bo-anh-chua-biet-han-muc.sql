-- ============================================================================
-- Migration: 0031 — đếm bộ ảnh chưa biết hạn mức, theo phạm vi chi nhánh
--
-- BB-120. Màn báo cáo thất thoát cần con số này đặt CẠNH số tiền, vì hai con
-- số chỉ có nghĩa khi đọc cùng nhau.
--
-- ---------------------------------------------------------------------------
-- Vì sao cần hàm riêng thay vì đọc v_over_quota_summary
-- ---------------------------------------------------------------------------
-- v_over_quota_summary gộp trên mọi chi nhánh mà NGƯỜI GỌI nhìn thấy. Route
-- API đọc bằng khoá quản trị nên RLS bị bỏ qua, và "mọi chi nhánh người gọi
-- nhìn thấy" thành "toàn studio".
--
-- Đặt một con số tổng của toàn studio cạnh danh sách của một chi nhánh là cách
-- chắc chắn để người đọc hiểu sai: quản lý Pasteur nhìn thấy 40 bộ chưa rõ hạn
-- mức trong khi chi nhánh mình chỉ có 3.
--
-- Hàm này nhận thẳng danh sách chi nhánh mà route đã lọc theo quyền.
--
-- ---------------------------------------------------------------------------
-- Vì sao con số này phải hiện lên màn hình
-- ---------------------------------------------------------------------------
-- Bộ ảnh chưa biết hạn mức KHÔNG vào báo cáo — chưa đủ dữ liệu thì không kết
-- luận. Nhưng nếu chỉ hiện số tiền, người đọc sẽ tưởng những bộ còn lại đều
-- không nợ gì. Số tiền là SÀN, và con số này chính là phần chưa đo được.
-- ============================================================================

begin;

create or replace function count_galleries_missing_quota(p_branch_ids uuid[])
returns table (n integer)
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
    from galleries g
   where g.branch_id = any(p_branch_ids)
     -- Chỉ đếm bộ ảnh ĐANG TRONG CUỘC. Bộ nháp chưa gửi khách và bộ đã lưu trữ
     -- thì chưa biết hạn mức cũng không sao — đưa vào chỉ làm con số phồng lên
     -- và mất ý nghĩa cảnh báo.
     and g.status in ('ready', 'in_review', 'submitted')
     and app.gallery_quota(g.id) is null;
$$;

comment on function count_galleries_missing_quota is
  'Số bộ ảnh đang trong cuộc mà chưa suy được hạn mức, giới hạn theo danh sách '
  'chi nhánh do route truyền vào. Đọc kèm số tiền chưa thu: tiền là SÀN, con '
  'số này là phần chưa đo được.';

-- docs/12-security.md mục 9 — revoke nằm ngay dưới create.
--
-- Hàm là SECURITY DEFINER vì nó gọi app.gallery_quota, mà schema app thì anon
-- không có quyền dùng. Nên phải khoá chặt: chỉ service_role gọi được, và route
-- API đã lọc chi nhánh theo quyền TRƯỚC khi truyền vào đây.
revoke all on function count_galleries_missing_quota(uuid[]) from public, anon, authenticated;
grant execute on function count_galleries_missing_quota(uuid[]) to service_role;

commit;
