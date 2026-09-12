-- ============================================================================
-- Migration: 0037 — CTV thời vụ chỉ thấy việc của mình (ba bảng còn sót)
--
-- BB-124. Tiếp theo 0036.
--
-- ---------------------------------------------------------------------------
-- Cách tìm ra
-- ---------------------------------------------------------------------------
-- Sau khi vá `deliveries`, đếm bảng nào có chính sách đọc KHÔNG nhắc tới
-- 'photoshop_ctv'. Ra tám bảng; bốn trong đó chứa dữ liệu khách. Đo thật trên
-- bb-dev bằng một phiên đăng nhập CTV:
--
--   babies           0 / 4      — đã chặn (gián tiếp, xem dưới)
--   shoots         120 / 471    — RÒ
--   activity_logs 1586 / 1589   — RÒ
--   notifications    0 / 0      — bảng đang rỗng nên con số 0 KHÔNG chứng minh
--                                 gì; chính sách vẫn cho CTV đọc hết
--
-- ---------------------------------------------------------------------------
-- babies: đang an toàn NHỜ MAY, nên vẫn phải viết rõ
-- ---------------------------------------------------------------------------
-- Chính sách của `babies` lồng một truy vấn vào `customers`. Truy vấn con đó
-- chạy dưới quyền người đang hỏi, nên chính sách chặn CTV của `customers` che
-- luôn cho `babies`. Tức là bảng nhạy cảm nhất — tên, biệt danh, NGÀY SINH của
-- em bé — đang được bảo vệ bởi một hiệu ứng phụ ở bảng khác. Nới `customers`
-- một ngày nào đó là `babies` mở theo, im lặng. Viết rõ điều kiện vào đây.
--
-- ---------------------------------------------------------------------------
-- Siết không làm hỏng màn hình nào
-- ---------------------------------------------------------------------------
-- Cả bốn bảng chỉ được đọc qua service_role, vốn đi vòng qua RLS. Chính sách
-- này chỉ chặn đường đọc thẳng cơ sở dữ liệu bằng phiên đăng nhập nhân viên.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- shoots — buổi chụp của mọi khách trong chi nhánh
-- ---------------------------------------------------------------------------
-- CTV vẫn thấy buổi chụp của bộ ảnh được gán cho mình: ngày chụp và concept là
-- thứ người chỉnh ảnh cần.
drop policy if exists shoots_select on shoots;

create policy shoots_select on shoots for select to authenticated
  using (
    app.can_see_branch(branch_id) and (
      app.my_role() is distinct from 'photoshop_ctv'
      or exists (
        select 1 from galleries g
        where g.shoot_id = shoots.id and g.editor_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- notifications — target là số điện thoại hoặc link chat của khách
-- ---------------------------------------------------------------------------
-- CTV không cần dòng nào. Cùng luật với gallery_payments.
drop policy if exists notifications_select on notifications;

create policy notifications_select on notifications for select to authenticated
  using (
    app.can_see_branch(branch_id)
    and app.my_role() is distinct from 'photoshop_ctv'
  );

-- ---------------------------------------------------------------------------
-- activity_logs — nhật ký toàn chi nhánh
-- ---------------------------------------------------------------------------
-- CTV chỉ thấy việc CHÍNH MÌNH đã làm. Xem được nhật ký của người khác là xem
-- được ai đụng vào bộ nào, lúc nào — bản đồ hoạt động của cả chi nhánh.
-- BẪY: bảng này có HAI chính sách đọc, và tên thật là 'activity_select',
-- không phải 'activity_logs_select'. Chính sách PERMISSIVE thì OR với nhau —
-- thêm một chính sách chặt bên cạnh một chính sách lỏng KHÔNG chặn được gì.
-- Và 'drop policy if exists' gọi tên không tồn tại thì im lặng chạy qua, nên
-- lần chạy đầu của migration này báo thành công mà lỗ hổng vẫn nguyên. Chỉ có
-- đo lại bằng một phiên đăng nhập CTV thật mới phát hiện ra.
drop policy if exists activity_logs_select on activity_logs;
drop policy if exists activity_select on activity_logs;

create policy activity_logs_select on activity_logs for select to authenticated
  using (
    app.can_see_branch(branch_id) and (
      app.my_role() is distinct from 'photoshop_ctv'
      or actor_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- babies — viết rõ điều kiện thay vì dựa vào hiệu ứng phụ
-- ---------------------------------------------------------------------------
drop policy if exists babies_select on babies;

create policy babies_select on babies for select to authenticated
  using (
    exists (
      select 1 from customers c
      where c.id = babies.customer_id and app.can_see_branch(c.branch_id)
    )
    and (
      app.my_role() is distinct from 'photoshop_ctv'
      or exists (
        select 1 from galleries g
        where g.customer_id = babies.customer_id and g.editor_id = auth.uid()
      )
    )
  );

comment on policy babies_select on babies is
  'Tên, biệt danh và ngày sinh của em bé. CTV thời vụ chỉ thấy bé của bộ ảnh '
  'được gán cho mình. Điều kiện viết rõ, không dựa vào chính sách bảng customers.';

commit;
