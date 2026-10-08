-- ============================================================================
-- Migration: 0106 — khung gắn dòng in: MỖI ĐỢT một dòng (BB-398 vòng 3)
--
-- 0104 đặt `uq_selection_addons_khung_gan_in (gan_voi_addon_id, product_id)`: một dòng in
-- chỉ có MỘT dòng khung cho mỗi sản phẩm khung. Từ vòng 3, đợt mua thêm (đợt ≥ 2) được
-- đóng khung cho tấm in của đợt 1 / đợt đã xác nhận. Tấm in 2 bản, đợt 1 đã gắn 1 khung,
-- đợt 2 gắn thêm 1 khung CÙNG kiểu → dòng mới (dot = 2) đụng chỉ mục cũ.
--
-- Đổi chỉ mục thành (gan_voi_addon_id, product_id, dot): mỗi đợt một dòng — đúng mô hình
-- đợt (đợt bị trả thì chỉ dòng của đợt đó bị xoá, dòng khung đợt 1 còn nguyên). Trần
-- "số khung ≤ số tấm in" (cộng mọi đợt) kiểm ở máy chủ: `kiemKhungGanInTrongDot`
-- (dot-chon-server.ts) và `/api/g/addons` (đếm khung đợt khác).
--
-- Không tạo hàm SQL (không cần revoke — AGENTS.md §5b).
--
-- Đảo ngược (lỗi nếu đã có hai đợt cùng gắn một kiểu khung vào một dòng in — gộp trước):
--   drop index if exists uq_selection_addons_khung_gan_in;
--   create unique index uq_selection_addons_khung_gan_in
--     on selection_addons (gan_voi_addon_id, product_id) where gan_voi_addon_id is not null;
-- ============================================================================

begin;

drop index if exists uq_selection_addons_khung_gan_in;
create unique index uq_selection_addons_khung_gan_in
  on selection_addons (gan_voi_addon_id, product_id, dot)
  where gan_voi_addon_id is not null;

commit;
