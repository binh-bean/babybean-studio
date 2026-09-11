-- Migration: Thêm cột is_favorite cho selection_items
-- Task: BB-081
-- Lý do: Thiết kế yêu cầu hai nút riêng (yêu thích, chọn ảnh), do đó không thể dùng chung 1 enum mark (loại trừ nhau). Cột mark='favorite' làm mất ảnh được chọn.
-- Kế hoạch bỏ 'favorite' khỏi enum selection_mark: chưa bỏ ngay theo quy tắc two-phase drop (README migrations). Hiện tại chỉ chuyển đổi dữ liệu và đánh dấu is_favorite = true, enum value 'favorite' vẫn tồn tại để tương thích ngược. Sẽ bị xóa trong Phase 2/release sau.

-- Thêm cột is_favorite
alter table selection_items
  add column is_favorite boolean not null default false;

-- Cập nhật dữ liệu cũ (những dòng nào có mark = 'favorite' sẽ thành is_favorite = true)
update selection_items
set is_favorite = true, mark = 'selected'
where mark = 'favorite';

-- Lưu ý: hiện tại enum selection_mark vẫn chứa giá trị 'favorite'. Việc xóa giá trị enum trong Postgres khá phức tạp (không có lệnh drop enum value trực tiếp, phải sửa system catalog hoặc tạo enum mới rồi cast). Nên tạm thời cứ để đó, app không ghi vào nữa là đủ.
