-- Migration: Gắn người phụ trách theo album và vai trò photoshop_ctv
-- Lệnh ALTER TYPE không thể chạy trong transaction nên ta commit trước.
commit;

alter type staff_role add value if not exists 'photoshop_ctv';

-- Không cần begin ở đây, Supabase sẽ thực thi phần còn lại
alter table galleries
  add column photographer_id uuid references staff_profiles(id),
  add column cskh_id uuid references staff_profiles(id),
  add column editor_id uuid references staff_profiles(id);

create index idx_galleries_photographer on galleries(photographer_id);
create index idx_galleries_cskh on galleries(cskh_id);
create index idx_galleries_editor on galleries(editor_id);
