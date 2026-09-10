-- ============================================================================
-- Migration: 0003-patch-selection
-- Description: Stored procedure for atomic selection updates in /api/g/selection
-- ============================================================================

create or replace function patch_selection_batch(
  p_client_op_id uuid,
  p_selection_id uuid,
  p_gallery_id uuid,
  p_role text,
  p_ops jsonb,
  p_max_selection integer,
  p_included_quota integer,
  p_extra_price numeric,
  p_actor_label text,
  p_ip inet,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_gallery_status gallery_status;
  v_op_exists boolean;
  v_selected_count integer;
  v_favorite_count integer;
  v_extra_count integer;
  v_extra_amount numeric;
  v_op jsonb;
  v_photo_id uuid;
  v_mark text;
  v_retouch_note text;
  v_note_tags text[];
  v_applied integer := 0;
  v_photo_gallery_id uuid;
begin
  -- 1. Check idempotency
  select exists(select 1 from selection_ops where client_op_id = p_client_op_id) into v_op_exists;
  if v_op_exists then
    select count(*) into v_selected_count from selection_items where selection_id = p_selection_id and mark = 'selected';
    select count(*) into v_favorite_count from selection_items where selection_id = p_selection_id and mark = 'favorite';
    v_extra_count := greatest(0, v_selected_count - p_included_quota);
    v_extra_amount := v_extra_count * p_extra_price;
    return jsonb_build_object(
      'selectedCount', v_selected_count,
      'favoriteCount', v_favorite_count,
      'extraCount', v_extra_count,
      'extraAmount', v_extra_amount,
      'applied', 0,
      'rejected', '[]'::jsonb
    );
  end if;

  -- 2. Check gallery status
  select status into v_gallery_status from galleries where id = p_gallery_id for update;
  if v_gallery_status = 'submitted' then
    raise exception 'GALLERY_LOCKED';
  end if;

  if p_role = 'viewer' then
    raise exception 'FORBIDDEN';
  end if;

  -- 3. Process ops
  for v_op in select * from jsonb_array_elements(p_ops)
  loop
    v_photo_id := (v_op->>'photoId')::uuid;
    v_mark := v_op->>'mark';
    v_retouch_note := v_op->>'retouchNote';
    
    if v_op->'noteTags' is not null then
      select array_agg(x::text) into v_note_tags from jsonb_array_elements_text(v_op->'noteTags') x;
    else
      v_note_tags := '{}'::text[];
    end if;

    -- Validate photo belongs to gallery
    select gallery_id into v_photo_gallery_id from photos where id = v_photo_id;
    if v_photo_gallery_id is null or v_photo_gallery_id != p_gallery_id then
      raise exception 'FORBIDDEN_PHOTO';
    end if;

    if p_role = 'suggester' and v_mark = 'selected' then
      v_mark := 'suggested';
    end if;

    if v_mark is null and v_retouch_note is null and array_length(v_note_tags, 1) is null then
      -- Deselect/Remove
      delete from selection_items where selection_id = p_selection_id and photo_id = v_photo_id;
    else
      -- Upsert
      insert into selection_items (selection_id, photo_id, gallery_id, mark, retouch_note, note_tags)
      values (p_selection_id, v_photo_id, p_gallery_id, coalesce(v_mark::selection_mark, 'selected'::selection_mark), v_retouch_note, coalesce(v_note_tags, '{}'::text[]))
      on conflict (selection_id, photo_id)
      do update set
        mark = coalesce(excluded.mark, selection_items.mark),
        retouch_note = coalesce(excluded.retouch_note, selection_items.retouch_note),
        note_tags = coalesce(excluded.note_tags, selection_items.note_tags),
        updated_at = now();
    end if;

    v_applied := v_applied + 1;
  end loop;

  -- 4. Check quota
  select count(*) into v_selected_count from selection_items where selection_id = p_selection_id and mark = 'selected';
  if p_max_selection is not null and v_selected_count > p_max_selection then
    raise exception 'QUOTA_EXCEEDED';
  end if;

  -- 5. Calculate new counts
  select count(*) into v_favorite_count from selection_items where selection_id = p_selection_id and mark = 'favorite';
  v_extra_count := greatest(0, v_selected_count - p_included_quota);
  v_extra_amount := v_extra_count * p_extra_price;

  -- 6. Record idempotency and activity log
  insert into selection_ops (client_op_id, selection_id) values (p_client_op_id, p_selection_id);
  
  insert into activity_logs (actor_type, actor_id, actor_label, action, entity_type, entity_id, metadata, ip, user_agent)
  values (
    'customer',
    p_selection_id,
    p_actor_label,
    'selection.patch',
    'gallery',
    p_gallery_id,
    jsonb_build_object('applied', v_applied, 'selectedCount', v_selected_count, 'clientOpId', p_client_op_id),
    p_ip,
    p_user_agent
  );

  return jsonb_build_object(
    'selectedCount', v_selected_count,
    'favoriteCount', v_favorite_count,
    'extraCount', v_extra_count,
    'extraAmount', v_extra_amount,
    'applied', v_applied,
    'rejected', '[]'::jsonb
  );
end;
$$;
