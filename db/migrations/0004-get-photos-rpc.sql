-- ============================================================================
-- Migration: 0004-get-photos-rpc
-- Description: Fetch photos for a specific gallery and selection, with filters
-- ============================================================================

create or replace function get_gallery_photos(
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
      (p_filter = 'unselected' and (si.mark is null or (si.mark != 'selected' and si.mark != 'favorite'))) or
      (p_filter = 'favorite' and si.mark = 'favorite') or
      (p_filter = 'noted' and (si.retouch_note is not null or array_length(si.note_tags, 1) > 0))
    )
  order by p.sort_index asc
  limit p_limit;
end;
$$;
