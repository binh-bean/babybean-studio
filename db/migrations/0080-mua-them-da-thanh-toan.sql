-- ============================================================================
-- 0080 — BB-332 mục 3b: xác nhận MUA THÊM đã thanh toán + chỗ gắn mã hoá đơn,
-- mã phiếu thu (để sau này gắn hoá đơn mua thêm và phiếu thu vào).
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát; nếu trùng số
-- với nhánh khác thì đánh số lại. Đợt này CHỈ thêm cột + trạng thái — chưa có
-- màn hình/route ghi vào (xem bàn giao BB-332).
--
-- Luật chủ studio (30/09/2026, yêu cầu joopukjv): "số dư của khách = 0 là đã
-- thanh toán đủ". Số dư tính từ sổ `gallery_payments` (append-only, BB-123/
-- BB-320): phải thu − đã ghi có. Nên "Đã thanh toán" của cả bộ ảnh là SỐ SUY
-- RA, không lưu cột (lưu thì lệch sổ). Hàm thuần: src/lib/gallery/thanh-toan-mua-them.ts.
--
-- Cái cần LƯU là:
--   1. Trên từng dòng thu tiền: mã hoá đơn mua thêm + mã phiếu thu (tuỳ chọn).
--   2. Trên từng ĐỢT mua thêm (selection_rounds, đợt ≥ 2 — BB-321): lúc CSKH
--      xác nhận đợt đó đã thanh toán, ai xác nhận, và hai mã trên.
--   3. Yêu cầu mua thêm sau duyệt (yeu_cau_mua_them, BB-245): thêm trạng thái
--      'da_thanh_toan' + hai mã.
--
-- An ninh: không tạo hàm SQL, không đổi quyền; ba bảng đều đã RLS như cũ.
-- Chạy lại được nhiều lần: `if not exists` / `drop constraint if exists`.
-- ============================================================================

-- 1. Sổ thu tiền ---------------------------------------------------------------
alter table gallery_payments
  add column if not exists ma_hoa_don  text check (ma_hoa_don  is null or char_length(btrim(ma_hoa_don))  between 1 and 64),
  add column if not exists ma_phieu_thu text check (ma_phieu_thu is null or char_length(btrim(ma_phieu_thu)) between 1 and 64);

comment on column gallery_payments.ma_hoa_don is
  'BB-332 — mã hoá đơn MUA THÊM (Lark/kế toán) mà lần thu này thuộc về. Tuỳ chọn.';
comment on column gallery_payments.ma_phieu_thu is
  'BB-332 — mã phiếu thu của lần thu này. Tuỳ chọn.';

-- 2. Đợt mua thêm (đợt ≥ 2) ----------------------------------------------------
alter table selection_rounds
  add column if not exists da_thanh_toan_luc timestamptz,
  add column if not exists da_thanh_toan_boi uuid references staff_profiles(id) on delete set null,
  add column if not exists ma_hoa_don  text check (ma_hoa_don  is null or char_length(btrim(ma_hoa_don))  between 1 and 64),
  add column if not exists ma_phieu_thu text check (ma_phieu_thu is null or char_length(btrim(ma_phieu_thu)) between 1 and 64);

comment on column selection_rounds.da_thanh_toan_luc is
  'BB-332 — lúc CSKH xác nhận đợt mua thêm này ĐÃ THANH TOÁN (null = chưa). Chỉ có nghĩa khi trang_thai = da_xac_nhan.';

-- 3. Yêu cầu mua thêm sau duyệt -------------------------------------------------
alter table yeu_cau_mua_them
  add column if not exists ma_hoa_don  text check (ma_hoa_don  is null or char_length(btrim(ma_hoa_don))  between 1 and 64),
  add column if not exists ma_phieu_thu text check (ma_phieu_thu is null or char_length(btrim(ma_phieu_thu)) between 1 and 64),
  add column if not exists da_thanh_toan_luc timestamptz;

alter table yeu_cau_mua_them drop constraint if exists yeu_cau_mua_them_trang_thai_check;
alter table yeu_cau_mua_them
  add constraint yeu_cau_mua_them_trang_thai_check
  check (trang_thai in ('moi', 'da_lien_he', 'da_chot', 'da_thanh_toan', 'huy'));

comment on column yeu_cau_mua_them.trang_thai is
  '''moi'' = vừa gửi; ''da_lien_he''/''da_chot'' CSKH cập nhật; ''da_thanh_toan'' (BB-332) = khách đã trả đủ; ''huy''.';
