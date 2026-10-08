-- ============================================================================
-- Migration: 0104 — KHUNG GẮN DÒNG ẢNH IN (BB-398)
--
-- Anh 08/10/2026: "Khung ảnh có HAI cách bán: (a) bán lẻ như hiện tại — không
-- cần chọn hình để áp vào; (b) bán cùng sản phẩm in — vd khách đã mua thêm một
-- ảnh 40×60 Gỗ đã chọn hình, giờ mua thêm khung cho chính tấm đó, với kích
-- thước và tên file đã có sẵn."
--
-- Trước 0104, `selection_addons` không có cột nào nói một dòng khung bọc DÒNG IN
-- nào — chỉ có `photo_id` (cùng tấm ảnh), mà một tấm có thể in nhiều chất liệu /
-- nhiều khổ. Thợ nhận "Khung HQ 40x60 · tấm X" không biết bọc tấm in nào.
--
--   · `gan_voi_addon_id` — id dòng IN mà dòng khung này bọc. Rỗng = khung lẻ
--     (không ảnh) hoặc khung gắn thẳng ảnh theo cách cũ (in trong gói).
--   · Khoá ngoại GHÉP (gan_voi_addon_id, selection_id) → (id, selection_id): dòng
--     khung và dòng in BẮT BUỘC cùng một lượt chọn — chặn ở tầng dữ liệu, không
--     chỉ ở route. `on delete cascade`: bỏ dòng in thì khung gắn theo bị xoá
--     (màn khách báo "Bean đã bỏ luôn N khung…").
--   · Luật còn lại (dòng gắn vào là ẢNH IN, không UV, khổ khung = khổ in, số
--     khung ≤ số lượng in) kiểm ở `/api/g/addons` bằng `kiemKhungGanIn`
--     (src/lib/products/khung-gan-anh-in.ts) — cần đọc bảng `products`, không
--     đặt được bằng check constraint.
--
-- Chỉ mục duy nhất:
--   · Dòng khung gắn in: mỗi (dòng in, sản phẩm khung) MỘT dòng — số lượng là
--     tổng (route "đặt số lượng", không cộng dồn).
--   · `uq_selection_addons_co_anh_dot` (0077) đổi thành CHỈ áp dòng KHÔNG gắn in:
--     hai dòng in khác chất liệu của CÙNG một tấm (Gỗ 40×60 + Tráng gương 40×60)
--     mỗi dòng được một khung Khung HQ 40×60 riêng — cùng (lượt, sản phẩm, ảnh,
--     đợt) nhưng khác dòng in. Dòng cũ (gan_voi_addon_id rỗng) giữ đúng luật cũ.
--
-- Không tạo hàm SQL (không cần revoke — AGENTS.md §5b).
--
-- Đảo ngược:
--   drop index if exists uq_selection_addons_khung_gan_in;
--   drop index if exists idx_selection_addons_gan_voi;
--   drop index if exists uq_selection_addons_co_anh_dot;
--   create unique index uq_selection_addons_co_anh_dot
--     on selection_addons (selection_id, product_id, photo_id, dot) where photo_id is not null;
--     -- (lỗi nếu đã có hai dòng khung cùng ảnh khác dòng in: xoá bớt trước)
--   alter table selection_addons drop constraint if exists fk_selection_addons_gan_voi;
--   alter table selection_addons drop constraint if exists ck_selection_addons_khong_tu_gan;
--   alter table selection_addons drop constraint if exists uq_selection_addons_id_selection;
--   alter table selection_addons drop column if exists gan_voi_addon_id;
-- ============================================================================

begin;

alter table selection_addons
  add column if not exists gan_voi_addon_id uuid;

comment on column selection_addons.gan_voi_addon_id is
  'BB-398 — dòng ẢNH IN mà dòng khung này bọc (cùng lượt chọn). Rỗng = khung lẻ '
  '(không ảnh) hoặc khung gắn thẳng ảnh theo cách cũ. Xem migration 0104.';

-- Đích của khoá ngoại ghép: (id, selection_id) — id đã là khoá chính nên luôn duy nhất.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'uq_selection_addons_id_selection'
  ) then
    alter table selection_addons
      add constraint uq_selection_addons_id_selection unique (id, selection_id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fk_selection_addons_gan_voi'
  ) then
    alter table selection_addons
      add constraint fk_selection_addons_gan_voi
      foreign key (gan_voi_addon_id, selection_id)
      references selection_addons (id, selection_id)
      on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ck_selection_addons_khong_tu_gan'
  ) then
    alter table selection_addons
      add constraint ck_selection_addons_khong_tu_gan
      check (gan_voi_addon_id is null or gan_voi_addon_id <> id);
  end if;
end
$$;

create index if not exists idx_selection_addons_gan_voi
  on selection_addons (gan_voi_addon_id)
  where gan_voi_addon_id is not null;

create unique index if not exists uq_selection_addons_khung_gan_in
  on selection_addons (gan_voi_addon_id, product_id)
  where gan_voi_addon_id is not null;

drop index if exists uq_selection_addons_co_anh_dot;
create unique index uq_selection_addons_co_anh_dot
  on selection_addons (selection_id, product_id, photo_id, dot)
  where photo_id is not null and gan_voi_addon_id is null;

commit;
