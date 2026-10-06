-- ============================================================================
-- 0093 — BB-374 (2/2): ảnh khách chọn "cho album · không chỉnh sửa".
--
-- VIẾT NHƯNG CHƯA ÁP (06/10/2026). Người áp: PM, SAU 0092 (cần giá trị enum
-- 'album_unedited'). Chạy lại được nhiều lần (`if not exists`, `where not exists`).
--
-- 1. Bảng `anh_album_khong_chinh` — tấm khách chọn cho suất "Ảnh album không
--    chỉnh sửa". CỐ Ý là bảng RIÊNG, KHÔNG phải `selection_items`:
--      mọi chỗ tính hạn mức và tiền (`v_over_quota_unbilled`, `v_over_quota_summary`,
--      `patch_selection_batch`, `/api/g/submit` → `snapshot_extra_*`, đợt chọn)
--      đều đếm `selection_items.mark = 'selected'`. Để tấm "không chỉnh" ngoài
--      bảng đó là cách DUY NHẤT chắc chắn nó không bao giờ thành tiền vượt hạn
--      mức — không phải sửa (và nhớ sửa) từng chỗ đếm một.
--    Một tấm không thể vừa "chỉnh" vừa "không chỉnh": API chặn chọn tấm đã thả
--    tim; thả tim một tấm đang "không chỉnh" thì app gỡ dòng ở đây trước.
--
-- 2. Sản phẩm "Ảnh album không chỉnh sửa" (giá 0 ₫) trong danh mục — để CSKH
--    chọn ở "Thêm sản phẩm". Không có mã Lark: `sync-lark-catalog` đã được dạy
--    KHÔNG tắt sản phẩm loại này và tự dựng lại nó sau khi nạp lại từ Lark.
--
-- An ninh (AGENTS §5b, cùng khuôn 0083): bật RLS, KHÔNG policy — chỉ service_role
-- (route /api/g/album-khong-chinh, route quản trị) đọc/ghi. Mục 3 viết lại
-- `app.gallery_quota` (không security definer) — dòng revoke/grant đứng NGAY SAU nó.
--
-- Đảo ngược (không mất dữ liệu tiền — bảng này không mang tiền):
--   drop table if exists anh_album_khong_chinh;
--   update products set is_active = false where kind = 'album_unedited';
-- ============================================================================

create table if not exists anh_album_khong_chinh (
  id            uuid primary key default gen_random_uuid(),
  gallery_id    uuid not null references galleries(id)  on delete cascade,
  selection_id  uuid not null references selections(id) on delete cascade,
  photo_id      uuid not null references photos(id)     on delete cascade,
  created_at    timestamptz not null default now(),
  constraint uq_anh_album_khong_chinh unique (selection_id, photo_id)
);

create index if not exists idx_anh_album_khong_chinh_gallery on anh_album_khong_chinh(gallery_id);

alter table anh_album_khong_chinh enable row level security;
revoke all on table anh_album_khong_chinh from public, anon, authenticated;
grant all on table anh_album_khong_chinh to service_role;

comment on table anh_album_khong_chinh is
  'BB-374: tấm khách chọn cho suất "Ảnh album không chỉnh sửa" — in vào album, '
  'KHÔNG chỉnh, KHÔNG tính tiền, KHÔNG nằm trong selection_items (nên không bao giờ '
  'vào hạn mức hay tiền vượt). Số tấm tối đa = tổng quantity các dòng gallery_items '
  'có products.kind = album_unedited. RLS bật, không policy — chỉ service_role.';

-- 3. Hạn mức: dòng "Ảnh album không chỉnh sửa" KHÔNG được đổi cách tính hạn mức.
--    `app.gallery_quota` (bản 0019) hỏi "bộ có dòng hợp đồng nào không": có → cộng
--    `edited_photo`; không → lùi về `galleries.included_quota`. Bộ đang chạy bằng
--    `included_quota` (chưa có dòng nào) mà CSKH thêm suất ảnh album → "có dòng" →
--    tổng `edited_photo` = 0 → NULL → khách bị chặn "chưa biết hạn mức". Nay câu hỏi
--    "có dòng nào" bỏ qua dòng loại `album_unedited`. Thân hàm còn lại giữ nguyên 0019.
create or replace function app.gallery_quota(p_gallery_id uuid)
returns integer
language sql stable set search_path = public as $$
  select case
    when exists (
      select 1 from gallery_items gi
        join products p on p.id = gi.product_id
       where gi.gallery_id = p_gallery_id
         and p.kind <> 'album_unedited'
    ) then
      (select nullif(sum(gi.quantity), 0)::integer
         from gallery_items gi
         join products p on p.id = gi.product_id
        where gi.gallery_id = p_gallery_id
          and p.kind = 'edited_photo')
    else
      (select g.included_quota from galleries g where g.id = p_gallery_id)
  end;
$$;

-- AGENTS §5b: `create or replace` trả EXECUTE về PUBLIC — thu lại NGAY SAU, đúng quyền 0019.
revoke all on function app.gallery_quota(uuid) from public, anon;
grant execute on function app.gallery_quota(uuid) to authenticated, service_role;

comment on function app.gallery_quota is
  'Hạn mức ảnh của album. Ưu tiên gallery_items (tổng edited_photo); null nếu có items (không kể dòng album_unedited — BB-374) nhưng không có edited_photo. Fallback galleries.included_quota khi không có items.';

insert into products (name, kind, list_price, price_samples, is_active)
select 'Ảnh album không chỉnh sửa', 'album_unedited', 0, 0, true
 where not exists (select 1 from products where kind = 'album_unedited');
