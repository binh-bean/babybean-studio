-- ============================================================================
-- Migration: 0014 — danh mục sản phẩm và dòng hàng của album
--
-- BB-100. Thay cho giả định "1 buổi chụp = 1 gói = 1 con số hạn mức".
--
-- Cấu trúc lấy theo ĐÚNG cách Lark đang ghi. PM đọc toàn bộ dữ liệu thật ngày
-- 11.09.2026. Lark có BA TẦNG, không phải hai:
--
--   Hóa Đơn              4.744   một hợp đồng
--     Hóa Đơn Chi Tiết  11.689   dòng hợp đồng: sản phẩm, số lượng, ĐƠN GIÁ
--       Chi Tiết Gói Chụp 9.637  dòng đó gồm những gì — KHÔNG có tiền
--
-- Tầng giữa mang tiền, tầng dưới mang thành phần. Bảng gallery_items dưới đây
-- gộp cả hai tầng vào một bảng, phân biệt bằng parent_item_id.
--
-- ---------------------------------------------------------------------------
-- Hạn mức ảnh nằm ở đâu
-- ---------------------------------------------------------------------------
-- Bộ bàn giao Studio OS kết luận "không có trường hạn mức trong Lark" và dựng
-- một bảng ước lượng theo trung vị, kèm ghi chú "chưa ai xác nhận".
--
-- Đúng về mặt TRƯỜNG, sai về mặt DỮ LIỆU. Hạn mức là một DÒNG HÀNG ở tầng
-- dưới: sản phẩm tên Edit file, cột Số Lượng. Đếm trên toàn bộ 9.637 dòng:
--
--   4.403 hợp đồng, 4.212 có dòng Edit file = 95,7%
--   15 ảnh 2.043   20 ảnh 804   5 ảnh 355   30 ảnh 325   16 ảnh 179
--   đuôi dài tới 141 ảnh
--
-- Số lẻ (16, 17, 21, 31) là gói gốc cộng ảnh mua thêm ngay lúc ký — hạn mức
-- thật, không phải nhiễu, không được làm tròn.
--
-- Ảnh mua thêm SAU khi ký nằm ở tầng giữa, cũng là sản phẩm Edit file, đơn giá
-- niêm yết 50.000đ/ảnh. Nên hạn mức thực = tổng số lượng mọi dòng Edit file ở
-- CẢ HAI tầng. Hàm app.gallery_quota() dưới đây cộng phẳng, không phân tầng.
--
-- 4,3% hợp đồng không có dòng nào: hạn mức CHƯA BIẾT, khác hẳn bằng 0.
-- Xem docs/15-doi-chieu-lark.md mục 6 và 6.1.
--
-- Việc CHUYỂN HẲN sang cách tính này bị hoãn có chủ đích. Lý do ở mục 3.
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Danh mục sản phẩm
-- ---------------------------------------------------------------------------

create type product_kind as enum (
  'shoot_package',  -- gói chụp: Baby 01..05, Fam, Newborn, Bầu, Lookbook...
  'edited_photo',   -- Edit file — ĐÂY LÀ HẠN MỨC
  'print',          -- in ấn: UV, Gỗ, Thủy tinh, Tráng gương, Khung, Album
  'addon',          -- phát sinh: thêm set chụp, hoa tươi, bóng bay
  'service'         -- makeup, dịch vụ hậu kỳ
);

create table products (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid references branches(id),   -- null = áp dụng mọi chi nhánh

  name          text not null,
  kind          product_kind not null,

  -- Bóc từ tên: "Gỗ 40x60" -> material 'Gỗ', size '40x60'. Cho null vì có sản
  -- phẩm không mang kích thước (Makeup, Edit file, Baby 02).
  material      text,
  size          text,

  -- ĐƠN GIÁ niêm yết, cho MỘT đơn vị.
  --
  -- Bảng danh mục bên Lark KHÔNG có cột giá. Giá chỉ tồn tại trên từng dòng
  -- hóa đơn. Nên con số ở đây là giá QUAN SÁT ĐƯỢC: mức xuất hiện nhiều nhất
  -- trong lịch sử bán. Đã kiểm trên 11.163 dòng có đủ hai cột:
  -- "Thành Tiền niêm yết" = "Giá niêm yết" x "Số Lượng", đúng 11.163/11.163.
  -- Nên "Giá niêm yết" đúng là ĐƠN GIÁ, không phải tiền cả dòng.
  --
  -- null = chưa từng bán, không suy ra được giá. KHÔNG được hiện 0 cho khách.
  list_price    numeric(12,0),

  -- Độ tin cậy của list_price: tỷ lệ số lần bán ở đúng mức giá đó, và tổng số
  -- lần bán. Baby 02 là 1.393 lần cùng một giá; UV 10x15 chỉ 15 lần rải ra 12
  -- mức. Hai thứ đó khác nhau về chất, giao diện phải phân biệt được: chỉ báo
  -- giá cho khách khi đủ chắc, còn lại để CSKH báo tay.
  price_confidence numeric(4,3) check (price_confidence between 0 and 1),
  price_samples    integer not null default 0,

  lark_category text,          -- Phân Loại Sản Xuất, giữ nguyên để đối chiếu

  -- Neo sang Lark. Đồng bộ lần sau tìm theo đây, KHÔNG tìm theo tên — nhân
  -- viên đổi tên hiển thị bất cứ lúc nào.
  lark_record_id text unique,

  is_active     boolean not null default true,   -- Ngừng Kinh Doanh -> false
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_products_kind on products(kind) where is_active;
create index idx_products_branch on products(branch_id);

comment on table products is
  'Danh mục sản phẩm. Đồng bộ một chiều từ Lark. list_price là giá quan sát '
  'được từ lịch sử bán, không phải bảng giá chính thức.';
comment on column products.list_price is
  'Đơn giá niêm yết cho MỘT đơn vị. null = chưa bán bao giờ, không có giá.';

-- ---------------------------------------------------------------------------
-- 2. Dòng hàng của album
-- ---------------------------------------------------------------------------

create table gallery_items (
  id          uuid primary key default gen_random_uuid(),
  gallery_id  uuid not null references galleries(id) on delete cascade,
  product_id  uuid not null references products(id),

  -- null   = dòng hợp đồng (tầng Hóa Đơn Chi Tiết) — có tiền
  -- có giá = thành phần của dòng đó (tầng Chi Tiết Gói Chụp) — không có tiền
  --
  -- Một hợp đồng thật trông như thế này:
  --   Baby 02            2.000.000đ      <- dòng hợp đồng
  --     Edit file   x20                  <- thành phần, chính là hạn mức
  --     Makeup      x1
  --     Gỗ 15x21    x1
  --   Edit file     x5      250.000đ     <- dòng hợp đồng, khách mua thêm
  parent_item_id uuid references gallery_items(id) on delete cascade,

  quantity    integer not null default 1 check (quantity > 0),

  -- Đơn giá TẠI THỜI ĐIỂM KÝ, không tra lại products.list_price về sau.
  -- Studio tăng giá tháng sau thì hợp đồng cũ vẫn giữ giá cũ, nếu không là
  -- tranh chấp với khách. null ở dòng thành phần vì thành phần không có tiền.
  unit_price  numeric(12,0),

  -- Mã hợp đồng bên Lark. Một album có thể gom nhiều hợp đồng (khách mua nhiều
  -- gói cho cùng buổi chụp), nên mã nằm ở DÒNG HÀNG chứ không ở album.
  --
  -- CẢNH BÁO: mã có dạng HD_YYYYMMDD rồi dấu thăng rồi số. Đưa vào URL bắt
  -- buộc encodeURIComponent, nếu không trình duyệt cắt mất phần sau dấu thăng.
  lark_contract_code text,

  lark_record_id text unique,

  created_at  timestamptz not null default now(),

  -- Thành phần không được mang tiền, dòng hợp đồng thì được. Ràng buộc này
  -- chặn việc cộng nhầm tiền hai lần khi tính tổng giá trị hợp đồng.
  constraint chk_component_no_price
    check (parent_item_id is null or unit_price is null)
);

create index idx_gallery_items_gallery on gallery_items(gallery_id);
create index idx_gallery_items_parent on gallery_items(parent_item_id);
create index idx_gallery_items_contract on gallery_items(lark_contract_code);

comment on table gallery_items is
  'Những gì hợp đồng hứa giao cho album này, hai tầng trong một bảng. '
  'Hạn mức ảnh = tổng quantity của mọi dòng có product.kind = edited_photo.';

-- ---------------------------------------------------------------------------
-- 3. Hạn mức: suy ra từ dòng hàng
-- ---------------------------------------------------------------------------

create or replace function app.gallery_quota(p_gallery_id uuid)
returns integer
language sql stable set search_path = public as $$
  -- Quyền theo NGƯỜI GỌI, không phải definer: nhân viên chi nhánh khác không
  -- cần biết hạn mức của album họ không được xem. Đường khách đi qua
  -- service_role nên vẫn đọc được bình thường.
  --
  -- Cộng phẳng cả hai tầng: 20 ảnh trong gói cộng 5 ảnh mua thêm = 25.
  -- null = CHƯA BIẾT hạn mức. Khác hẳn 0.
  select coalesce(
    (select g.included_quota from galleries g where g.id = p_gallery_id),
    (select nullif(sum(gi.quantity), 0)::integer
       from gallery_items gi
       join products p on p.id = gi.product_id
      where gi.gallery_id = p_gallery_id
        and p.kind = 'edited_photo')
  );
$$;

-- CHÚ Ý: 0019 đã ĐỔI NGHĨA hàm này. Bản ở đây đọc included_quota trước rồi
-- mới suy từ dòng hàng; bản 0019 làm ngược lại — dòng hàng là chính,
-- included_quota chỉ dùng khi album chưa có dòng hàng nào. Bản 0019 mới là bản
-- đang chạy. Giữ nguyên đoạn này để đọc lại lịch sử, đừng chép lại nó.
comment on function app.gallery_quota is
  'Hạn mức ảnh của album. Xem 0019 để biết bản đang chạy.';

-- ---------------------------------------------------------------------------
-- KHÔNG đổi galleries.included_quota trong migration này. Đọc kỹ trước khi làm.
-- ---------------------------------------------------------------------------
-- Ý định ban đầu là bỏ NOT NULL và bỏ default 20, để null mang nghĩa "chưa
-- biết". PM đã thử và dừng lại: hôm nay null KHÔNG an toàn.
--
--   0009 dòng 190:  if v_hard_limit is not null and v_selected_count > v_hard_limit
--
-- Hạn mức null làm vế phải thành null, Postgres coi như false, trần chọn ảnh
-- biến mất. Khách chọn bao nhiêu ảnh cũng được và không tính tiền vượt. Cùng
-- lúc greatest(0, count - null) trả null nên tiền phụ trội mất luôn, và ngoài
-- giao diện selected - null thành NaN.
--
-- Việc bỏ NOT NULL phải đi CHUNG MỘT LẦN với bốn chỗ đọc nó:
--
--   db/migrations/0009  patch_selection      trần chọn ảnh + tiền vượt
--   db/migrations/0013  get_admin_galleries  extraCount, chuỗi "3/20"
--   src/app/api/g/gallery/route.ts:66        extraCount phía khách
--   src/lib/selection/mutate.ts:78           includedQuota trả về client
--
-- Quy tắc cho cả bốn: hạn mức chưa biết thì CHẶN chọn ảnh và báo "chưa có
-- thông tin gói, liên hệ CSKH" — không bao giờ mở trần. Một màn hình báo lỗi
-- thì khách gọi điện; một trần mở thì studio mất tiền và không ai biết.
--
-- Cho đến lúc đó included_quota giữ nguyên not null default 20. Con số 20 là
-- bịa, nhưng nó CHẶN, còn null thì MỞ.

-- ---------------------------------------------------------------------------
-- 4. Quyền — docs/12-security.md mục 9: revoke nằm ngay dưới create
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on products, gallery_items to authenticated;
grant all privileges on products, gallery_items to service_role;

alter table products enable row level security;
alter table gallery_items enable row level security;

-- Danh mục và bảng giá: nhân viên nào cũng đọc được, trừ CTV thời vụ — người
-- làm thời vụ không cần biết studio bán bao nhiêu tiền.
create policy products_select on products for select to authenticated
  using (app.my_role() != 'photoshop_ctv');

create policy products_write on products for all to authenticated
  using (app.my_role() in ('owner','admin'))
  with check (app.my_role() in ('owner','admin'));

create policy gallery_items_select on gallery_items for select to authenticated
  using (
    app.my_role() != 'photoshop_ctv' and
    exists (select 1 from galleries g
             where g.id = gallery_items.gallery_id and app.can_see_branch(g.branch_id))
  );

create policy gallery_items_write on gallery_items for all to authenticated
  using (
    app.can_write() and
    exists (select 1 from galleries g
             where g.id = gallery_items.gallery_id and app.can_see_branch(g.branch_id))
  )
  with check (
    app.can_write() and
    exists (select 1 from galleries g
             where g.id = gallery_items.gallery_id and app.can_see_branch(g.branch_id))
  );

revoke all on function app.gallery_quota(uuid) from public;
grant execute on function app.gallery_quota(uuid) to authenticated, service_role;

create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

commit;
