-- ============================================================================
-- 0082 — BB-337 mục 1: CSKH xác nhận đã xử lý xong phần khách để lại cho studio
-- ở đợt 1 ("nhờ studio chọn thêm N ảnh" / "còn sản phẩm in chưa chọn ảnh").
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát.
--
-- Vì sao cần: hàng đợi "Khách gửi ảnh chọn" (Việc cần xử lý) giữ dòng của một
-- bộ ảnh chừng nào khách còn để lại việc cho studio (BB-321,
-- `layDanhSachViecDot1`). Trước 0082 không có chỗ nào ghi "studio đã làm xong
-- phần đó", nên dòng chỉ rời hàng đợi khi bộ ảnh sang `awaiting_approval` —
-- CSKH làm xong vẫn thấy việc còn treo. Hai cột dưới đây là dấu "đã xong".
--
-- KHÔNG xoá/sửa `nho_studio_chon_them`, `so_san_pham_in_chua_anh`: đó là điều
-- khách đã yêu cầu, giữ nguyên làm lịch sử.
--
-- An ninh: không tạo hàm SQL, không đổi quyền; `selections` đã RLS như cũ.
-- Chạy lại được nhiều lần: `if not exists`.
-- Đảo ngược: alter table selections drop column studio_xu_ly_dot1_at,
--            drop column studio_xu_ly_dot1_boi;
-- ============================================================================

alter table selections
  add column if not exists studio_xu_ly_dot1_at  timestamptz,
  add column if not exists studio_xu_ly_dot1_boi uuid references staff_profiles(id) on delete set null;

comment on column selections.studio_xu_ly_dot1_at is
  'BB-337: lúc CSKH xác nhận đã chọn giúp ảnh / gắn ảnh cho sản phẩm in khách để lại ở đợt 1. null = chưa xử lý.';
comment on column selections.studio_xu_ly_dot1_boi is
  'BB-337: nhân viên bấm xác nhận (staff_profiles.id).';
