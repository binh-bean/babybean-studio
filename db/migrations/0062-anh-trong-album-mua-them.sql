-- ============================================================================
-- Migration: 0062 — những tấm ảnh nằm trong một album MUA THÊM
--
-- Album khác mọi thứ khác trong bảng giá: nó gộp NHIỀU ảnh vào một sản phẩm.
-- Ảnh in và khung thì một sản phẩm một tấm (migration 0061 lo việc đó bằng
-- `selection_addons.photo_id`), còn album 20x30 thì ba mẹ chọn vài chục tấm
-- cho vào.
--
-- Album TRONG GÓI đã có chỗ: `selection_placements` nối ảnh với dòng hợp đồng
-- (`gallery_items`). Album MUA THÊM thì chưa — nó nằm ở `selection_addons`,
-- một bảng khác.
--
-- ---------------------------------------------------------------------------
-- Vì sao thêm bảng mới thay vì nới `selection_placements`
-- ---------------------------------------------------------------------------
-- Khoá chính của bảng đó là (selection_item_id, gallery_item_id) — không cột
-- nào được rỗng. Thêm một cột `addon_id` cho phép rỗng nghĩa là phá khoá chính
-- và dựng lại bằng ràng buộc "đúng một trong hai cột có giá trị", tức là sửa
-- một bảng đang chạy để nhét vào một việc nó không sinh ra để làm.
--
-- Bảng riêng, hình dạng y hệt, đọc ra là hiểu ngay đang nói về cái gì.
-- ============================================================================

create table if not exists selection_addon_photos (
  addon_id uuid not null references selection_addons(id) on delete cascade,
  selection_item_id uuid not null references selection_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (addon_id, selection_item_id)
);

comment on table selection_addon_photos is
  'Những tấm ảnh ba mẹ đưa vào một album MUA THÊM. Album trong gói thì dùng '
  'selection_placements. Xem migration 0062.';

create index if not exists idx_selection_addon_photos_item
  on selection_addon_photos (selection_item_id);

-- Cùng luật với selection_placements: bảng này do khách ghi qua khoá quản trị
-- ở tầng API, nhân viên đọc qua RLS.
alter table selection_addon_photos enable row level security;

drop policy if exists selection_addon_photos_select on selection_addon_photos;
create policy selection_addon_photos_select on selection_addon_photos
  for select
  using (
    exists (
      select 1
        from selection_items si
        join galleries g on g.id = si.gallery_id
       where si.id = selection_addon_photos.selection_item_id
         and app.can_see_branch(g.branch_id)
    )
  );
