-- Migration: Kế toán không được xem ảnh
-- Task: BB-073
-- Lý do: Bản vá lỗi này đã có trong policies.sql nhưng thiếu file migration để chạy trên production.
-- Idempotent: Có thể chạy nhiều lần bằng cách xóa policy trước khi tạo lại.

drop policy if exists photos_select on photos;

create policy photos_select on photos for select to authenticated
  using (
    app.my_role() != 'accountant' and
    exists (
      select 1 from galleries g
      where g.id = photos.gallery_id and app.can_see_branch(g.branch_id)
    )
  );
