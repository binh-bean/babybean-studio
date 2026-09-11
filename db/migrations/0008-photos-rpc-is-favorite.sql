-- ============================================================================
-- Migration: 0008-photos-rpc-is-favorite
--
-- Nối hai bản vá va vào nhau khi gộp nhánh:
--   BB-081 (ARCH)   thêm cột selection_items.is_favorite, và thêm isFavorite
--                   vào kiểu PhotoPublic
--   BB-032 (DEV-BE) viết get_gallery_photos trước đó, nên hàm chưa trả cột mới
--
-- Hệ quả: `npm run verify` đỏ ngay sau khi gộp, vì route /api/g/photos không
-- dựng nổi PhotoPublic khi thiếu isFavorite.
--
-- Đồng thời sửa bộ lọc. Trước đây 'favorite' là một giá trị của cột mark, loại
-- trừ với 'selected' — nên khách bấm tim vào ảnh đã chọn là ảnh bị bỏ chọn mà
-- không báo gì. Từ nay yêu thích và đã chọn là hai thứ độc lập, và bộ lọc phải
-- đọc đúng cột.
--
-- Đổi RETURNS TABLE thì `create or replace` không làm được, phải drop trước.
-- Câu revoke nằm ngay dưới câu create — docs/12-security.md §9.
-- ============================================================================

drop function if exists get_gallery_photos(uuid, uuid, integer, integer, text, text);

create function get_gallery_photos(
  p_gallery_id uuid,
  p_selection_id uuid,
  p_cursor_sort_index integer,
  p_limit integer,
  p_subfolder text,
  p_filter text
)
returns table (
  id uuid,
  file_name text,
  width integer,
  height integer,
  subfolder text,
  sort_index integer,
  status photo_status,
  mark selection_mark,
  is_favorite boolean,
  order_index integer,
  retouch_note text,
  note_tags text[],
  suggested_by text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    p.id,
    p.file_name,
    p.width,
    p.height,
    p.subfolder,
    p.sort_index,
    p.status,
    si.mark,
    coalesce(si.is_favorite, false) as is_favorite,
    si.order_index,
    si.retouch_note,
    si.note_tags,
    (
      select array_agg(s2.display_name)
      from selection_items si2
      join selections s2 on s2.id = si2.selection_id
      where si2.photo_id = p.id
        and si2.selection_id != p_selection_id
        and si2.mark = 'suggested'
        and s2.display_name is not null
    ) as suggested_by
  from photos p
  left join selection_items si on si.photo_id = p.id and si.selection_id = p_selection_id
  where p.gallery_id = p_gallery_id
    and p.status != 'hidden'
    and p.sort_index > p_cursor_sort_index
    and (p_subfolder is null or p.subfolder = p_subfolder)
    and (
      p_filter = 'all' or
      (p_filter = 'selected' and si.mark = 'selected') or
      -- "chưa chọn" giờ chỉ nói về việc chọn. Một ảnh được thả tim mà chưa
      -- chọn thì vẫn là chưa chọn.
      (p_filter = 'unselected' and (si.mark is null or si.mark != 'selected')) or
      (p_filter = 'favorite' and coalesce(si.is_favorite, false)) or
      (p_filter = 'noted' and (si.retouch_note is not null or array_length(si.note_tags, 1) > 0))
    )
  order by p.sort_index asc
  limit p_limit;
end;
$$;

revoke all on function get_gallery_photos(uuid, uuid, integer, integer, text, text)
  from public, anon, authenticated;
grant execute on function get_gallery_photos(uuid, uuid, integer, integer, text, text)
  to service_role;
