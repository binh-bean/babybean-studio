-- ============================================================================
-- 0107 — BB-399 vòng 3: công tắc "Nhận làm ảnh nhanh" (anh 08/10/2026: "quản trị có CÔNG TẮC
-- tắt/mở khi cần thiết nếu hậu kỳ đang quá tải").
--
-- VIẾT NHƯNG CHƯA ÁP. Claude áp sau khi soát. Chạy lại được nhiều lần (`on conflict do nothing`).
--
-- Chưa áp thì app vẫn đúng: thiếu dòng = BẬT (src/lib/dich-vu/lam-anh-nhanh.ts `laBatLamNhanh`).
-- Migration chỉ chèn dòng mặc định `true` để màn Cài đặt và công tắc nhanh ở Việc cần xử lý ›
-- Ảnh chỉnh sửa đọc/ghi cùng một dòng. Không tạo hàm SQL nên không có dòng `revoke execute`.
-- Không đụng dòng đã có.
--
-- Đảo ngược: delete from settings where key = 'dich_vu.lam_anh_nhanh_bat' and branch_id is null;
-- ============================================================================

insert into settings (key, branch_id, value)
values ('dich_vu.lam_anh_nhanh_bat', null, 'true'::jsonb)
on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do nothing;
