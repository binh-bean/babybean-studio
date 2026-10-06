-- ============================================================================
-- 0094 — BB-369: người chỉnh sửa của bộ ảnh, đọc từ bảng Hậu Kỳ bên Lark.
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát; trùng số với
-- nhánh khác thì đánh số lại.
--
-- Schema Lark đo 06/10/2026 (chỉ đọc): "Người Photoshop" (User, type 11) và
-- "Photoshop CTV" (SingleSelect, type 3). App lưu TÊN (text), nhiều người thì
-- "A, B" — src/lib/lark/nguoi-chinh-sua-lark.ts. Cron /api/cron/hau-ky và hook
-- Lark ghi (doc-trang-thai-lark.ts), cùng chỗ ghi lark_photo (0081).
--
-- Mã chạy được khi CHƯA áp: đọc trả null, ghi bỏ qua.
-- Không tạo hàm → không cần revoke (AGENTS.md §5b).
-- Đảo ngược: alter table galleries drop column lark_nguoi_photoshop, drop column lark_photoshop_ctv;
-- Chạy lại được: if not exists.
-- ============================================================================

alter table galleries add column if not exists lark_nguoi_photoshop text;
alter table galleries add column if not exists lark_photoshop_ctv text;

comment on column galleries.lark_nguoi_photoshop is
  'BB-369: tên người chỉnh sửa đọc từ cột "Người Photoshop" (User) của bảng Hậu Kỳ Lark; "A, B" khi nhiều người. Chỉ app ghi (cron/hook).';
comment on column galleries.lark_photoshop_ctv is
  'BB-369: tên cộng tác viên chỉnh sửa đọc từ cột "Photoshop CTV" (chọn một) của bảng Hậu Kỳ Lark. Chỉ app ghi (cron/hook).';
