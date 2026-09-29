-- ============================================================================
-- 0077 — BB-321: "đợt chọn" — mua thêm ảnh theo từng đợt, sau khi đợt 1 đã chốt
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là Claude (giám đốc điều hành) sau khi soát —
-- người viết (Sonnet builder) không được áp migration lên bb-dev/bb-prod.
--
-- ---------------------------------------------------------------------------
-- Luật của chủ studio 29/09/2026 (luật LIÊN QUAN TỚI DOANH THU)
-- ---------------------------------------------------------------------------
--   Khi khách đã chốt đợt 1 (đủ ảnh cho gói/hoá đơn) và CSKH đã xác nhận, ảnh
--   đã chọn ở đợt 1 bị KHOÁ. Muốn đổi thì khách gửi yêu cầu mở lại. Còn MUA
--   THÊM ở đợt 2, đợt 3… thì khách vẫn chọn ảnh và chốt từng đợt riêng. Đó là
--   doanh thu — cách app chạy không bao giờ được cản.
--
-- ---------------------------------------------------------------------------
-- Mô hình dữ liệu (đơn giản có chủ ý)
-- ---------------------------------------------------------------------------
--   · Đợt 1 KHÔNG có dòng trong `selection_rounds`: nó chính là lượt chọn +
--     chốt hiện có (galleries.status / selections.snapshot_*). Bảng mới chỉ
--     chứa đợt từ 2 trở đi (check so_dot >= 2). Nhờ vậy mọi bộ ảnh cũ không
--     cần đổi gì và đọc được y như trước.
--   · `selection_items.dot` / `selection_addons.dot` = số đợt của dòng đó.
--     Dòng cũ mặc định 1 → "dữ liệu cũ thành đợt 1".
--   · Dòng của đợt ≥ 2 chỉ tồn tại trong DB khi đợt đó đang `cho_xac_nhan`
--     hoặc `da_xac_nhan` — tức luôn luôn KHOÁ. Bị từ chối / mở lại thì dòng bị
--     XOÁ và ảnh "trả về cho khách chọn" (khách chọn lại và chốt thành một
--     đợt MỚI, số đợt luôn tăng). Bản chụp ảnh/sản phẩm của đợt đó nằm trong
--     `anh_ids` + `san_pham` để màn khách điền sẵn lại, khỏi bắt chọn từ đầu.
--   · Bản nháp đang chọn dở của khách nằm ở phía trình duyệt, không ở DB.
--
-- ---------------------------------------------------------------------------
-- An ninh (AGENTS §5b)
-- ---------------------------------------------------------------------------
-- Bảng mới: bật RLS, KHÔNG có policy, thu hết quyền của anon/authenticated;
-- chỉ service_role (máy chủ, qua route API) đọc/ghi — cùng khuôn 0072.
-- Migration này KHÔNG tạo hàm SQL nào, nên không có dòng `revoke execute`.
--
-- Chạy lại được nhiều lần (BB-315): `if not exists` / `drop ... if exists`.
-- ============================================================================

create table if not exists selection_rounds (
  id                 uuid primary key default gen_random_uuid(),
  gallery_id         uuid not null references galleries(id) on delete cascade,
  selection_id       uuid not null references selections(id) on delete cascade,

  so_dot             int  not null check (so_dot >= 2),

  -- cho_xac_nhan : khách vừa chốt, CSKH chưa xem       (ảnh KHOÁ)
  -- da_xac_nhan  : CSKH đã xác nhận                    (ảnh KHOÁ)
  -- tu_choi      : CSKH từ chối kèm lý do, ảnh trả lại  (dòng ảnh đã xoá)
  -- da_mo_lai    : CSKH mở lại theo yêu cầu khách       (dòng ảnh đã xoá)
  trang_thai         text not null default 'cho_xac_nhan'
    check (trang_thai in ('cho_xac_nhan', 'da_xac_nhan', 'tu_choi', 'da_mo_lai')),

  -- Con số CHỤP LẠI lúc khách chốt — khách trả theo số họ đã nhìn thấy, không
  -- tính lại về sau (cùng luật snapshot_* của đợt 1).
  so_anh             int  not null default 0 check (so_anh >= 0),
  so_anh_tinh_tien   int  not null default 0 check (so_anh_tinh_tien >= 0),
  gia_moi_anh        numeric(12,0) not null default 0,
  tien_anh           numeric(12,0) not null default 0,
  tien_san_pham      numeric(12,0) not null default 0,

  -- Bản chụp nội dung đợt, để trả lại cho khách điền sẵn khi bị từ chối/mở lại.
  anh_ids            uuid[] not null default '{}',
  san_pham           jsonb  not null default '[]'::jsonb,
  -- true = ảnh của đợt này đang chờ khách chọn lại (chưa được dùng cho đợt mới).
  tra_lai            boolean not null default false,

  -- Số sản phẩm in/album khách chốt mà CHƯA gắn ảnh, và cờ khách đã tick "Tôi biết nếu
  -- chưa chọn ảnh in, thời gian nhận ảnh sẽ lâu hơn timeline". Có sản phẩm chưa gắn
  -- ảnh mà thiếu cờ thì API chốt từ chối — cột này là bằng chứng khách đã đồng ý.
  so_san_pham_in_chua_anh int not null default 0 check (so_san_pham_in_chua_anh >= 0),
  biet_anh_in_cham_hon    boolean not null default false,

  ly_do_tu_choi      text check (ly_do_tu_choi is null or char_length(ly_do_tu_choi) <= 500),
  ly_do_mo_lai       text check (ly_do_mo_lai is null or char_length(ly_do_mo_lai) <= 500),

  submitted_at       timestamptz not null default now(),
  submitted_by_name  text,
  confirmed_at       timestamptz,
  confirmed_by       uuid,            -- id nhân viên (staff), không FK: giữ được sau khi nhân viên nghỉ
  xu_ly_at           timestamptz,     -- lúc từ chối / mở lại
  xu_ly_by           uuid,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Một số đợt chỉ có MỘT dòng cho mỗi bộ ảnh. Đây cũng là hàng rào chống hai
-- lượt chốt cùng lúc giành cùng một số đợt.
create unique index if not exists uq_selection_rounds_gallery_dot
  on selection_rounds (gallery_id, so_dot);

create index if not exists idx_selection_rounds_cho_xac_nhan
  on selection_rounds (gallery_id)
  where trang_thai = 'cho_xac_nhan';

alter table selection_rounds enable row level security;
revoke all on table selection_rounds from public, anon, authenticated;
grant all on table selection_rounds to service_role;

comment on table selection_rounds is
  'BB-321 — đợt chọn thêm ảnh (đợt 2, 3, …) sau khi đợt 1 đã chốt. Đợt 1 KHÔNG có '
  'dòng ở đây. RLS bật, không policy — chỉ service_role qua /api/g/dot-chon và '
  '/api/admin/galleries/[id]/dot-chon.';

comment on column selection_rounds.trang_thai is
  'cho_xac_nhan/da_xac_nhan = ảnh của đợt đang KHOÁ trong selection_items; '
  'tu_choi/da_mo_lai = dòng ảnh đã xoá, ảnh trả về cho khách (xem anh_ids).';

-- ---------------------------------------------------------------------------
-- Cột `dot` trên hai bảng lựa chọn. Mặc định 1 → mọi dòng hiện có là đợt 1.
-- Thêm cột có default hằng số là thao tác NHANH ở Postgres ≥ 11 (không ghi lại
-- bảng).
-- ---------------------------------------------------------------------------
alter table selection_items
  add column if not exists dot int not null default 1 check (dot >= 1);

alter table selection_addons
  add column if not exists dot int not null default 1 check (dot >= 1);

-- ---------------------------------------------------------------------------
-- Cờ của lần chốt ĐỢT 1 (chủ studio 29/09/2026), ghi trên lượt chọn `selections`:
--   · chốt THIẾU ảnh so với hạn mức: khách được nhờ studio chọn bổ sung, kèm ô tick
--     "Tôi đồng ý với ảnh studio chọn dùm và không đổi lại";
--   · còn sản phẩm in chưa gắn ảnh: khách tick "Tôi biết nếu chưa chọn ảnh in, thời
--     gian nhận ảnh sẽ lâu hơn timeline".
-- Cả hai chỉ ghi khi có việc (mặc định 0/false), CSKH thấy ở trang chi tiết và hàng
-- đợi "Việc cần xử lý"; tin Lark báo "Khách nhờ studio chọn thêm N ảnh" / "Còn N sản
-- phẩm in chưa chọn ảnh".
-- ---------------------------------------------------------------------------
alter table selections
  add column if not exists nho_studio_chon_them int not null default 0 check (nho_studio_chon_them >= 0),
  add column if not exists dong_y_anh_studio_chon boolean not null default false,
  add column if not exists so_san_pham_in_chua_anh int not null default 0 check (so_san_pham_in_chua_anh >= 0),
  add column if not exists biet_anh_in_cham_hon boolean not null default false;

comment on column selections.nho_studio_chon_them is
  'BB-321 — số ảnh khách NHỜ studio chọn bổ sung lúc chốt đợt 1 (máy chủ tính = hạn mức − đã chọn). 0 = không nhờ.';
comment on column selections.dong_y_anh_studio_chon is
  'BB-321 — khách đã tick "Tôi đồng ý với ảnh studio chọn dùm và không đổi lại". Luôn true khi nho_studio_chon_them > 0.';
comment on column selections.so_san_pham_in_chua_anh is
  'BB-321 — số sản phẩm in/album chưa gắn ảnh lúc chốt đợt 1.';
comment on column selections.biet_anh_in_cham_hon is
  'BB-321 — khách đã tick "Tôi biết nếu chưa chọn ảnh in, thời gian nhận ảnh sẽ lâu hơn timeline". Luôn true khi so_san_pham_in_chua_anh > 0.';

comment on column selection_items.dot is
  'BB-321 — số đợt chọn của ảnh này. 1 = lượt chọn gốc (mọi dữ liệu cũ). Từ 2 = ảnh '
  'mua thêm ở đợt sau, luôn khoá khi còn tồn tại.';
comment on column selection_addons.dot is
  'BB-321 — số đợt mà sản phẩm mua thêm này thuộc về. 1 = lượt chọn gốc.';

create index if not exists idx_selection_items_selection_dot
  on selection_items (selection_id, dot);

-- ---------------------------------------------------------------------------
-- Hai chỉ mục duy nhất của 0061 gồm (selection, product[, photo]) — không có
-- đợt. Mua cùng một album (không gắn ảnh) ở đợt 3 sau khi đã mua ở đợt 2 sẽ
-- đụng chỉ mục cũ. Thêm `dot` vào cả hai.
-- ---------------------------------------------------------------------------
drop index if exists uq_selection_addons_co_anh;
drop index if exists uq_selection_addons_khong_anh;

create unique index if not exists uq_selection_addons_co_anh_dot
  on selection_addons (selection_id, product_id, photo_id, dot)
  where photo_id is not null;

create unique index if not exists uq_selection_addons_khong_anh_dot
  on selection_addons (selection_id, product_id, dot)
  where photo_id is null;
