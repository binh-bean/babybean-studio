-- ============================================================================
-- Migration: 0036 — CTV thời vụ không thấy link giao của bộ ảnh người khác
--
-- BB-124.
--
-- ---------------------------------------------------------------------------
-- Lỗ hổng
-- ---------------------------------------------------------------------------
-- Chính sách đọc cũ của `deliveries`:
--
--     using (app.can_see_branch(branch_id))
--
-- Ai trong chi nhánh cũng đọc được — kể cả CTV thời vụ. Cột `final_drive_url`
-- là link thư mục ảnh HOÀN THIỆN của khách, nên một CTV làm một bộ đọc được
-- link ảnh thành phẩm của mọi khách trong chi nhánh.
--
-- Lúc viết chính sách này, bảng `deliveries` chưa ai ghi vào nên chỗ lỏng
-- không lộ ra. BB-121 bắt đầu ghi link vào đó. Chính sách viết cho một bảng
-- rỗng thì không ai soát kỹ, và nó nằm im cho tới lúc bảng có dữ liệu.
--
-- Hai bảng cùng loại đã chặn đúng từ đầu:
--   revision_requests — CTV chỉ thấy bộ được gán cho mình (0033)
--   gallery_payments  — CTV không thấy dòng nào (0024)
-- `deliveries` bị bỏ sót.
--
-- ---------------------------------------------------------------------------
-- Vì sao CTV vẫn thấy bộ CỦA MÌNH
-- ---------------------------------------------------------------------------
-- Cùng luật với revision_requests: người chỉnh ảnh cần link thư mục bộ đang
-- làm. Chặn sạch thì họ phải đi hỏi CSKH từng lần.
-- ============================================================================

begin;

drop policy if exists deliveries_select on deliveries;

create policy deliveries_select on deliveries for select to authenticated
  using (
    app.can_see_branch(branch_id) and (
      app.my_role() is distinct from 'photoshop_ctv'
      or exists (
        select 1 from galleries g
        where g.id = deliveries.gallery_id and g.editor_id = auth.uid()
      )
    )
  );

comment on policy deliveries_select on deliveries is
  'CTV thời vụ chỉ thấy link giao của bộ ảnh được gán cho mình. Cùng luật với '
  'revision_requests — final_drive_url là ảnh thành phẩm của khách.';

commit;
