-- Migration: Đổi mô hình link khách từ một link/một album sang một link/một khách
-- Lý do: Link là địa chỉ vĩnh viễn của khách, thu hồi được từng cái, không PIN, không hạn dùng. Tránh việc hết hạn khiến phụ huynh không xem được ảnh.

-- 1. Thêm customer_id vào share_links, cho phép null (trong giai đoạn chuyển đổi)
alter table share_links
  add column customer_id uuid references customers(id) on delete cascade;

-- 2. Cho phép gallery_id null và thêm ràng buộc "chỉ một trong hai"
alter table share_links
  alter column gallery_id drop not null;

alter table share_links
  add constraint chk_share_link_target
  check ((gallery_id is null) <> (customer_id is null));

-- 3. Đổi requires_pin mặc định thành false
alter table share_links
  alter column requires_pin set default false;
  
-- (KHÔNG xoá cột pin_hash, failed_attempts, locked_until ở phase này)

-- 4. Giữ nguyên expires_at nhưng thêm comment giải thích token mới không có hạn
comment on column share_links.expires_at is 'Token kiểu mới (theo khách) không có hạn dùng mặc định. Cột được giữ lại cho token cũ hoặc logic thu hồi riêng.';

-- 5. Thêm lark_contract_code vào galleries
alter table galleries
  add column lark_contract_code text;

create index idx_galleries_lark_contract on galleries(lark_contract_code);

comment on column galleries.lark_contract_code is 'Mã Hợp Đồng từ Lark (HD_YYYYMMDD#NN). CẢNH BÁO: Phải dùng encodeURIComponent khi đưa vào URL vì chứa ký tự #, nếu không sẽ bị trình duyệt cắt mất.';
