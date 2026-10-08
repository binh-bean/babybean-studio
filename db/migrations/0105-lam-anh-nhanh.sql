-- ============================================================================
-- 0105 — BB-399: dịch vụ "Làm ảnh nhanh" (anh chốt 08/10/2026)
--
-- VIẾT NHƯNG CHƯA ÁP. Claude áp sau khi soát. Chạy lại được nhiều lần.
--
-- Chưa áp thì app vẫn chạy đúng: mã đọc `settings` gặp thiếu dòng thì dùng 14 / 5 ngày và
-- tìm sản phẩm theo tên "Làm ảnh nhanh" (src/lib/dich-vu/lam-anh-nhanh.ts). Migration này chỉ
-- chèn dòng mặc định để màn Cài đặt hiện sẵn số cho Admin sửa, và GHIM sản phẩm theo record
-- id Lark để Lark đổi tên sản phẩm không làm ô làm nhanh biến mất âm thầm.
--
-- THỨ TỰ: chạy `npm run sync:catalog -- --write` TRƯỚC (tạo dòng `products` "Làm ảnh nhanh"
-- từ bảng "🎁Sản Phẩm Dịch Vụ", kind 'addon'), RỒI mới áp tệp này — không thì bước 3 không có
-- gì để ghim (vẫn chạy được, app tìm theo tên; chạy lại tệp này sau khi đồng bộ là ghim).
--
-- Không tạo hàm SQL nên không có dòng `revoke execute`. Không tạo bảng/cột. Không đụng dòng đã có.
--
-- Đảo ngược:
--   delete from settings where branch_id is null and key in
--     ('hau_ky.so_ngay_tra_tieu_chuan', 'hau_ky.so_ngay_lam_nhanh', 'dich_vu.lam_anh_nhanh_lark_id');
-- ============================================================================

-- 1. Trả ảnh chỉnh tiêu chuẩn: 14 ngày sau khi khách chốt danh sách.
insert into settings (key, branch_id, value)
values ('hau_ky.so_ngay_tra_tieu_chuan', null, '14'::jsonb)
on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

-- 2. Làm ảnh nhanh: 5 ngày.
insert into settings (key, branch_id, value)
values ('hau_ky.so_ngay_lam_nhanh', null, '5'::jsonb)
on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;

-- 3. Ghim sản phẩm theo record id Lark — chỉ khi có ĐÚNG MỘT sản phẩm đang bán tên
--    "Làm ảnh nhanh" (so chữ thường, bỏ khoảng trắng thừa) có record id. Không có / nhiều hơn
--    một → không ghim (app tìm theo tên; Admin dán record id ở Cài đặt nếu cần).
insert into settings (key, branch_id, value)
select 'dich_vu.lam_anh_nhanh_lark_id', null, to_jsonb(p.lark_record_id)
  from products p
 where p.is_active
   and p.lark_record_id is not null
   and p.kind in ('addon', 'service')
   and lower(regexp_replace(btrim(p.name), '\s+', ' ', 'g')) = 'làm ảnh nhanh'
   and (select count(*) from products q
         where q.is_active and q.lark_record_id is not null and q.kind in ('addon', 'service')
           and lower(regexp_replace(btrim(q.name), '\s+', ' ', 'g')) = 'làm ảnh nhanh') = 1
on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;
