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
  p_allow_extra boolean,
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
  v_existing_selection_id uuid;
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
  v_photo_status photo_status;
  v_current_mark text;
  v_rejected jsonb := '[]'::jsonb;
  v_hard_limit integer;
begin
  -- 1. Check idempotency
  select selection_id into v_existing_selection_id from selection_ops where client_op_id = p_client_op_id;
  if v_existing_selection_id is not null then
    if v_existing_selection_id != p_selection_id then
      raise exception 'CONFLICT';
    end if;
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
  if v_gallery_status in ('submitted', 'in_retouch', 'delivered', 'archived') then
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
    
    if v_op ? 'noteTags' and v_op->'noteTags' is not null then
      select array_agg(x::text) into v_note_tags from jsonb_array_elements_text(v_op->'noteTags') x;
    else
      v_note_tags := null;
    end if;

    -- Validate photo belongs to gallery
    select gallery_id, status into v_photo_gallery_id, v_photo_status from photos where id = v_photo_id;
    if v_photo_gallery_id is null or v_photo_gallery_id != p_gallery_id then
      raise exception 'FORBIDDEN_PHOTO';
    end if;

    if v_photo_status in ('missing', 'hidden') then
      v_rejected := v_rejected || jsonb_build_object('photoId', v_photo_id, 'code', 'NOT_FOUND');
      continue;
    end if;

    if p_role = 'suggester' and v_mark = 'selected' then
      v_mark := 'suggested';
    end if;

    select mark into v_current_mark from selection_items where selection_id = p_selection_id and photo_id = v_photo_id;

    if (v_op ? 'mark') and v_mark is null then
      -- Explicitly deselecting
      delete from selection_items where selection_id = p_selection_id and photo_id = v_photo_id;
      v_applied := v_applied + 1;
      continue;
    end if;

    if v_current_mark is null then
      -- Inserting new item
      if not (v_op ? 'mark') or v_mark is null then
        v_rejected := v_rejected || jsonb_build_object('photoId', v_photo_id, 'code', 'INVALID_INPUT', 'message', 'Cannot add notes to unselected photos');
        continue;
      end if;

      insert into selection_items (selection_id, photo_id, gallery_id, mark, retouch_note, note_tags)
      values (p_selection_id, v_photo_id, p_gallery_id, v_mark::selection_mark, v_retouch_note, coalesce(v_note_tags, '{}'::text[]));
    else
      -- Updating existing item
      update selection_items set
        mark = case when (v_op ? 'mark') then v_mark::selection_mark else mark end,
        retouch_note = case when (v_op ? 'retouchNote') then v_retouch_note else retouch_note end,
        note_tags = case when (v_op ? 'noteTags') then v_note_tags else note_tags end,
        updated_at = now()
      where selection_id = p_selection_id and photo_id = v_photo_id;
    end if;
    v_applied := v_applied + 1;
  end loop;

  -- 4. Check quota
  if not p_allow_extra then
    v_hard_limit := p_included_quota;
  else
    v_hard_limit := p_max_selection;
  end if;

  select count(*) into v_selected_count from selection_items where selection_id = p_selection_id and mark = 'selected';
  if v_hard_limit is not null and v_selected_count > v_hard_limit then
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
    'rejected', v_rejected
  );
end;
$$;

revoke all on function patch_selection_batch(uuid, uuid, uuid, text, jsonb, integer, boolean, integer, numeric, text, inet, text) from public;
grant execute on function patch_selection_batch(uuid, uuid, uuid, text, jsonb, integer, boolean, integer, numeric, text, inet, text) to service_role;
