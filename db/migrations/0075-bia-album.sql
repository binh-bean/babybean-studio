-- ============================================================================
-- Migration: 0075 — bìa cho ALBUM (sản phẩm in) nằm TRONG GÓI (BB-202)
--
-- Chủ studio 26/09/2026, sau khi làm rõ khái niệm ở docs/19 mục 1:
--
--     "album ảnh là một quyển album được ghép từ 20-30 ảnh … và được in ra
--      thành quyển. Mỗi một album sẽ có một ảnh bìa … gợi ý chọn ảnh bìa cho
--      album nếu trong gói khách hàng có album."
--
-- Chốt thêm cùng ngày: bìa = MỘT tấm trong những tấm ba mẹ ĐÃ THẢ TIM (không
-- phải tấm bất kỳ), app gợi ý sẵn 3–4 tấm, và BẮT BUỘC chọn trước khi chốt.
--
-- ---------------------------------------------------------------------------
-- Vì sao một bảng riêng, không nới `selection_placements`
-- ---------------------------------------------------------------------------
-- `selection_placements` là bảng nối NHIỀU-NHIỀU: một album trong gói nhận
-- nhiều ảnh (ruột), một ảnh vào được nhiều sản phẩm. Khoá chính của nó đúng
-- bằng (selection_item_id, gallery_item_id) — không cột nào rỗng, và route
-- `/api/g/placements` đang upsert với `onConflict: "selection_item_id,gallery_item_id"`.
--
-- Bìa album là một quan hệ KHÁC hẳn: MỘT album (một `gallery_item_id`) có
-- ĐÚNG MỘT bìa. Thêm một cột "vai" (nội dung/bìa) vào `selection_placements`
-- và nới khoá chính ra ba cột sẽ làm khoá (selection_item_id, gallery_item_id)
-- không còn là ràng buộc duy nhất nữa — đúng ràng buộc mà route đặt ảnh đang
-- upsert vào. Sửa bảng đang chạy để nhét thêm một việc nó không sinh ra để
-- làm là cách chắc chắn làm hỏng route đó.
--
-- Bảng riêng, hình dạng khác (một-album-một-bìa), đọc tên là hiểu ngay.
--
-- ---------------------------------------------------------------------------
-- Vì sao KHÔNG bắt buộc `selection_item.mark = 'selected'` bằng CHECK/trigger
-- ---------------------------------------------------------------------------
-- Ba mẹ bỏ tim tấm đang là bìa SAU khi đã chọn nó — bảng vẫn phải giữ được
-- dòng cũ để lúc chốt (`/api/g/submit`) phát hiện "bìa đã mất hiệu lực" và báo
-- lại, thay vì một CHECK constraint âm thầm chặn UPDATE của selection_items ở
-- một chỗ không liên quan. Việc "còn hợp lệ hay không" là việc của tầng ứng
-- dụng lúc đọc, không phải việc của ràng buộc lúc ghi.
-- ============================================================================

create table if not exists album_covers (
  id                 uuid primary key default gen_random_uuid(),

  -- Phi chuẩn hoá cho RLS + truy vấn nhanh, cùng luật với selection_items.
  gallery_id         uuid not null references galleries(id) on delete cascade,
  selection_id       uuid not null references selections(id) on delete cascade,

  -- Dòng hợp đồng ALBUM (nhomSanPham = 'album') nhận bìa này. MỘT album chỉ
  -- có MỘT bìa — ràng buộc duy nhất bên dưới cưỡng chế đúng điều đó, và route
  -- upsert theo đúng cột này.
  gallery_item_id    uuid not null references gallery_items(id) on delete cascade,

  -- Ảnh làm bìa, qua `selection_items` (không trỏ thẳng `photos`) vì cùng một
  -- tấm ảnh có thể được thả tim ở NHIỀU lượt chọn khác nhau (mẹ, bà…) — bìa
  -- phải gắn với đúng lượt chọn đang mua album, không phải với tấm ảnh chung
  -- chung.
  selection_item_id  uuid not null references selection_items(id) on delete cascade,

  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint uq_album_covers_gallery_item unique (gallery_item_id)
);

comment on table album_covers is
  'Bìa của một album TRONG GÓI (BB-202). Mỗi dòng hợp đồng album nhận đúng '
  'một bìa; hợp lệ hay không (ảnh còn được thả tim không) kiểm lại ở tầng '
  'ứng dụng, không phải ở ràng buộc bảng này. Xem migration 0075.';

create index if not exists idx_album_covers_selection
  on album_covers (selection_id);

create index if not exists idx_album_covers_selection_item
  on album_covers (selection_item_id);

-- ---------------------------------------------------------------------------
-- RLS: khách ghi qua khoá quản trị ở tầng API (route dùng service role, kiểm
-- quyền/luật ở TypeScript — cùng khuôn với selection_placements,
-- selection_addon_photos). Nhân viên đọc qua app.can_see_branch(branch_id)
-- của đúng bộ ảnh, qua cột gallery_id phi chuẩn hoá ở trên.
-- ---------------------------------------------------------------------------
alter table album_covers enable row level security;

drop policy if exists album_covers_select on album_covers;
create policy album_covers_select on album_covers
  for select
  using (
    exists (
      select 1
        from galleries g
       where g.id = album_covers.gallery_id
         and app.can_see_branch(g.branch_id)
    )
  );
