-- ============================================================================
-- Migration: 0025 — thu hồi TRUNCATE, TRIGGER, REFERENCES của authenticated
--
-- PM tìm ra khi soát BB-115. Không phải lỗi của ARCH — lỗ này có từ ngày đầu,
-- trên cả 26 bảng.
--
-- ---------------------------------------------------------------------------
-- Phát hiện
-- ---------------------------------------------------------------------------
-- 0024 dựng gallery_payments theo kiểu CHỈ GHI THÊM: policy chặn update, chặn
-- delete, vì một bản ghi tiền biến mất là một cuộc cãi nhau không có bằng
-- chứng. Policy viết đúng.
--
-- Nhưng liệt kê quyền bảng thì ra:
--
--   gallery_payments   INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE
--
-- TRUNCATE KHÔNG đi qua RLS. Có quyền đó là xoá sạch bảng được, bất kể policy
-- viết gì. Đảm bảo "không được xoá" bị vô hiệu ngay tại chỗ.
--
-- Đếm ra thì cả 26/26 bảng đều cấp TRUNCATE cho authenticated.
--
-- ---------------------------------------------------------------------------
-- Từ đâu ra
-- ---------------------------------------------------------------------------
-- Không phải từ mã của dự án. Supabase mặc định cấp ALL trên schema public cho
-- anon, authenticated và service_role. policies.sql dòng 327 đã thu hồi của
-- anon:
--
--   revoke all on all tables in schema public from anon;
--
-- nhưng không ai làm điều tương tự với authenticated. Các migration sau đó cấp
-- quyền cụ thể cho từng bảng mới, nên trông như thể quyền được kiểm soát chặt
-- — trong khi mặc định của nền tảng đã cho sẵn tất cả từ trước.
--
-- ---------------------------------------------------------------------------
-- Mức độ thật, không nói quá
-- ---------------------------------------------------------------------------
-- HÔM NAY CHƯA khai thác được qua API: PostgREST không phơi TRUNCATE ra, và
-- nhân viên chỉ có JWT đi qua PostgREST chứ không có kết nối Postgres trực
-- tiếp. Nên đây KHÔNG phải lỗ đang chảy máu.
--
-- Vẫn phải bịt, vì ba lý do:
--   1. Nó chỉ cách một hàm RPC chạy SQL động nữa là thành thật.
--   2. Nó mâu thuẫn âm thầm với đảm bảo mà 0024 vừa dựng — người đọc policy
--      sẽ tin vào một thứ không đúng.
--   3. Bịt không tốn gì: không đường ghi nào của app dùng TRUNCATE, TRIGGER
--      hay REFERENCES.
--
-- TRIGGER cho phép tạo trigger trên bảng, REFERENCES cho phép tạo khoá ngoại
-- trỏ vào bảng. Mã ứng dụng không cần cái nào — cả hai đều là việc của
-- migration, và migration chạy bằng khoá quản trị.
-- ============================================================================

begin;

revoke truncate, trigger, references on all tables in schema public
  from authenticated;

-- Bảng do migration sau này tạo ra cũng không được nhận ba quyền đó.
-- Không có dòng này thì lỗ mở lại ngay ở bảng tiếp theo, và không ai để ý.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from authenticated;

commit;
