-- 0073 — BB-254: "Mời ông bà cùng xem" — ông bà/người thân XEM và MUA, không
-- chọn ảnh, không thấy tiền của ba mẹ.
--
-- Viewer (link vai 'viewer') giờ gửi được yêu cầu mua thêm qua
-- /api/g/mua-them (route DEV-BE tự kiểm quyền theo phiên + trạng thái bộ
-- ảnh, KHÔNG cần điều kiện "đã duyệt/không vòng sửa" như ba mẹ — chỉ cần bộ
-- ảnh đang mở cho khách xem). Vì CSKH gọi lại đúng NGƯỜI GỬI (không phải ba
-- mẹ đứng hợp đồng), cần biết ai gửi: tên, số điện thoại, và link nào (nhãn
-- "Bà nội" chẳng hạn) đã gửi yêu cầu đó.
--
-- KHÔNG TỰ ÁP MIGRATION NÀY. Chỉ viết ra chờ Opus soát rồi áp lên bb-dev —
-- xem AGENTS.md và brief BB-254.
--
-- ---------------------------------------------------------------------------
-- Vì sao ba cột đều NULLABLE
-- ---------------------------------------------------------------------------
-- Ba mẹ (owner/co_editor/suggester) gửi yêu cầu mua thêm theo luật BB-245 cũ
-- (đã duyệt, không vòng sửa) — không bắt buộc điền tên/SĐT người mua vì CSKH
-- vốn đã có thông tin hợp đồng của họ. `share_link_id` cũng để trống cho
-- những dòng cũ (trước 0073) và cho ba mẹ (route không gán link cho họ, dù
-- kỹ thuật có thể — không cần, ba mẹ gắn trực tiếp với gallery qua contract).
--
-- ---------------------------------------------------------------------------
-- `on delete set null` cho `share_link_id`
-- ---------------------------------------------------------------------------
-- Ba mẹ thu hồi link mời ông bà SAU khi ông bà đã gửi yêu cầu mua thêm là
-- chuyện bình thường (ông bà gọi điện chốt xong, ba mẹ dọn link). Xoá CASCADE
-- sẽ xoá luôn yêu cầu mua thêm đang chờ CSKH xử lý — sai. Giữ dòng yêu cầu,
-- chỉ mất đường tham chiếu tới link (đã có `ten_nguoi_mua`/`sdt_nguoi_mua`
-- lưu tại chỗ nên không mất thông tin liên hệ).

alter table yeu_cau_mua_them
  add column if not exists ten_nguoi_mua text
    check (ten_nguoi_mua is null or char_length(btrim(ten_nguoi_mua)) between 1 and 100),
  add column if not exists sdt_nguoi_mua text
    check (sdt_nguoi_mua is null or sdt_nguoi_mua ~ '^0[0-9]{9}$'),
  add column if not exists share_link_id uuid references share_links(id) on delete set null;

create index if not exists idx_yeu_cau_mua_them_share_link
  on yeu_cau_mua_them(share_link_id)
  where share_link_id is not null;

comment on column yeu_cau_mua_them.ten_nguoi_mua is
  'BB-254 — tên người thực sự gửi yêu cầu (điền bắt buộc khi gửi từ link viewer/ông bà, để CSKH gọi đúng người). Rỗng với yêu cầu của ba mẹ.';

comment on column yeu_cau_mua_them.sdt_nguoi_mua is
  'BB-254 — SĐT VN 10 số của người gửi (bắt buộc với link viewer). Rỗng với yêu cầu của ba mẹ. KHÔNG che khi CSKH xem trong quản trị — chỉ che khi gửi sang Lark (cheSoDienThoai).';

comment on column yeu_cau_mua_them.share_link_id is
  'BB-254 — link đã dùng để gửi yêu cầu, để CSKH biết "Bà nội" hay "Cậu Ba" đã gửi. NULL với yêu cầu của ba mẹ hoặc link đã bị xoá.';
