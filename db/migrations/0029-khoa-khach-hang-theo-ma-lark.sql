-- ============================================================================
-- Migration: 0029 — một khách hàng là MỘT khách hàng, dù có bao nhiêu hợp đồng
--
-- Sửa lỗi trong đợt nhập dữ liệu thật của PM, do chủ studio chỉ ra ngày
-- 12.09.2026: "một khách hàng nhiều hóa đơn buổi chụp".
--
-- ---------------------------------------------------------------------------
-- Lỗi
-- ---------------------------------------------------------------------------
-- Script đồng bộ đặt tên khách theo MÃ HỢP ĐỒNG: "KH · HD_20250722#575". Mỗi
-- hợp đồng thành một khách. Đo trên nhóm 446 bộ:
--
--   405 khách thật     nhưng app tạo ra 446 khách
--   25 khách có nhiều hợp đồng (21 người 2 hợp đồng, 4 người 3 hợp đồng)
--
-- 41 khách bị xé nhỏ. Hậu quả không chỉ là đếm sai:
--
--   * Cổng khách (0010) cấp MỘT link cho MỘT khách để xem mọi buổi chụp của
--     họ. Khách bị xé nhỏ thì mỗi buổi một link, đúng thứ 0010 sinh ra để bỏ.
--   * Chủ studio đã chốt từ đầu: một khách → nhiều buổi chụp → nhiều gói.
--     Xé khách ra là phá tầng trên cùng của mô hình đó.
--
-- ---------------------------------------------------------------------------
-- Khoá đúng, và vì sao phải băm
-- ---------------------------------------------------------------------------
-- Lark có sẵn khoá khách: cột "Mã KH", có đủ ở 446/446 bản ghi.
--
-- Nhưng mã đó GỘP CẢ TÊN LẪN SỐ ĐIỆN THOẠI vào một chuỗi, kiểu
-- "B_SG-<tên khách>_<số điện thoại>". Lưu thẳng là mang nguyên dữ liệu cá nhân
-- vào bb-dev, đúng thứ docs/16 mục 7.3 đang che.
--
-- Nên lưu BĂM: sha256 của mã, lấy 12 ký tự đầu. Cùng một khách thì ra cùng một
-- khoá ở mọi lần chạy, mà không đọc ngược ra tên hay số điện thoại được.
--
-- Nhân viên vẫn tra được khách: mã hợp đồng nằm ở galleries.lark_contract_codes,
-- dán vào ô tìm kiếm bên Lark là ra đúng người.
--
-- Khi dựng bb-prod và bỏ che, cột này giữ nguyên vai trò — chỉ đổi nội dung từ
-- băm sang mã thật, và full_name đổi từ bí danh sang tên thật.
-- ============================================================================

begin;

alter table customers add column lark_customer_key text;

create unique index uq_customers_lark_key
  on customers(lark_customer_key)
  where lark_customer_key is not null;

comment on column customers.lark_customer_key is
  'Khoá khách hàng bên Lark ("Mã KH"), ĐÃ BĂM vì mã gốc gộp cả tên lẫn số điện '
  'thoại. Cùng khách thì cùng khoá ở mọi lần đồng bộ. null = khách do CSKH tạo '
  'tay trong app.';

commit;
