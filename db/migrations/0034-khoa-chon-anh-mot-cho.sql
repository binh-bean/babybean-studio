-- ============================================================================
-- Migration: 0034 — patch_selection_batch dùng app.gallery_is_locked
--
-- BB-121. Hàm này đang mang danh sách trạng thái khoá VIẾT CỨNG:
--
--     if v_gallery_status in ('submitted','in_retouch','delivered','archived')
--
-- 0032 thêm hai trạng thái sau lúc chốt — awaiting_approval và approved — mà
-- danh sách này không biết. Hậu quả: khách đang duyệt ảnh ĐÃ CHỈNH vẫn bỏ chọn
-- được ảnh gốc, trong khi người photoshop đã chỉnh xong rồi.
--
-- Đổi sang gọi app.gallery_is_locked (0033) để danh sách nằm MỘT chỗ. Thêm
-- trạng thái lần sau chỉ phải sửa một nơi — còn danh sách viết cứng rải rác
-- thì lần nào cũng sót một chỗ, và chỗ sót đó im lặng.
--
-- Thân hàm lấy nguyên từ pg_get_functiondef của bản đang chạy, chỉ đổi đúng
-- một dòng. Chép tay 200 dòng là cách chắc chắn để mất một nhánh nào đó.
--
-- CHỮ KÝ GIỮ NGUYÊN. Đổi một tham số là Postgres tạo bản CHỒNG chứ không thay
-- thế, và bản mới mặc định cho PUBLIC gọi — bẫy đã mở lại lỗ hổng BB-082 một
-- lần rồi.
-- ============================================================================

begin;

CREATE OR REPLACE FUNCTION public.patch_selection_batch(p_client_op_id uuid, p_selection_id uuid, p_gallery_id uuid, p_role text, p_ops jsonb, p_max_selection integer, p_allow_extra boolean, p_included_quota integer, p_extra_price numeric, p_actor_label text, p_ip inet, p_user_agent text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_gallery_status gallery_status;
  v_existing_selection_id uuid;
  v_selected_count integer;
  v_favorite_count integer;
  v_extra_count integer;
  v_extra_amount numeric;
  v_hard_limit integer;
  v_op jsonb;
  v_photo_id uuid;
  v_mark text;
  v_retouch_note text;
  v_note_tags text[];
  v_favorite boolean;
  v_applied integer := 0;
  v_rejected jsonb := '[]'::jsonb;
  v_photo_gallery_id uuid;
  v_photo_status photo_status;
  v_exists boolean;
begin
  -- 0. CỔNG CHẶN — mới ở 0016.
  --
  -- Không biết hạn mức thì không ghi gì hết. Đặt trước cả kiểm tra idempotency
  -- vì nếu hạn mức đã biến thành null thì trạng thái hiện tại không an toàn,
  -- kể cả để trả lại kết quả cũ.
  --
  -- Mã lỗi riêng, KHÔNG dùng lại QUOTA_EXCEEDED: hai chuyện khác nhau. Vượt
  -- hạn mức là khách chọn quá; chưa biết hạn mức là studio chưa nhập dữ liệu.
  -- Khách nhận hai câu trả lời khác nhau, CSKH làm hai việc khác nhau.
  if p_included_quota is null then
    raise exception 'QUOTA_UNKNOWN';
  end if;

  -- 1. Idempotency. Cùng mã và cùng selection là gửi lại hợp lệ; cùng mã mà
  --    khác selection là hai người trùng UUID, phải báo lỗi chứ không được
  --    trả "đã xong" cho một lần ghi chưa hề xảy ra.
  select selection_id into v_existing_selection_id
    from selection_ops where client_op_id = p_client_op_id;

  if v_existing_selection_id is not null then
    if v_existing_selection_id != p_selection_id then
      raise exception 'CONFLICT';
    end if;
    select count(*) filter (where mark = 'selected'),
           count(*) filter (where is_favorite)
      into v_selected_count, v_favorite_count
      from selection_items where selection_id = p_selection_id;
    v_extra_count := greatest(0, v_selected_count - p_included_quota);
    return jsonb_build_object(
      'selectedCount', v_selected_count,
      'favoriteCount', v_favorite_count,
      'extraCount', v_extra_count,
      'extraAmount', v_extra_count * p_extra_price,
      'applied', 0,
      'rejected', '[]'::jsonb
    );
  end if;

  -- 2. Khoá album. `for update` cũng là chỗ nối đuôi hai lô ghi cùng lúc.
  select status into v_gallery_status from galleries where id = p_gallery_id for update;
  if app.gallery_is_locked(v_gallery_status) then
    raise exception 'GALLERY_LOCKED';
  end if;

  if p_role = 'viewer' then
    raise exception 'FORBIDDEN';
  end if;

  -- 3. Áp từng op
  for v_op in select * from jsonb_array_elements(p_ops)
  loop
    v_photo_id := (v_op->>'photoId')::uuid;
    v_mark := v_op->>'mark';
    v_retouch_note := v_op->>'retouchNote';
    v_favorite := (v_op->>'isFavorite')::boolean;

    if v_op ? 'noteTags' and v_op->'noteTags' is not null then
      select array_agg(x::text) into v_note_tags from jsonb_array_elements_text(v_op->'noteTags') x;
    else
      v_note_tags := null;
    end if;

    select gallery_id, status into v_photo_gallery_id, v_photo_status
      from photos where id = v_photo_id;

    -- Ảnh của album khác không phải nhầm lẫn, là dò. Từ chối cả lô.
    if v_photo_gallery_id is null or v_photo_gallery_id != p_gallery_id then
      raise exception 'FORBIDDEN_PHOTO';
    end if;

    -- Ảnh đã biến mất khỏi Drive thì bỏ riêng ảnh đó, phần còn lại vẫn chạy.
    if v_photo_status in ('missing', 'hidden') then
      v_rejected := v_rejected || jsonb_build_object('photoId', v_photo_id, 'code', 'NOT_FOUND');
      continue;
    end if;

    if p_role = 'suggester' and v_mark = 'selected' then
      v_mark := 'suggested';
    end if;

    select true into v_exists from selection_items
      where selection_id = p_selection_id and photo_id = v_photo_id;

    if v_exists is null then
      -- Chưa có dòng nào. Chỉ tạo khi khách thật sự làm gì đó; một op chỉ có
      -- ghi chú cho ảnh chưa chọn thì từ chối, vì ghi chú chỉnh sửa chỉ có
      -- nghĩa với ảnh khách đã chọn hoặc đã đánh dấu.
      if not ((v_op ? 'mark' and v_mark is not null) or coalesce(v_favorite, false)) then
        v_rejected := v_rejected || jsonb_build_object(
          'photoId', v_photo_id, 'code', 'INVALID_INPUT',
          'message', 'Không ghi chú được cho ảnh chưa chọn');
        continue;
      end if;

      insert into selection_items (
        selection_id, photo_id, gallery_id, mark, is_favorite, retouch_note, note_tags
      ) values (
        p_selection_id, v_photo_id, p_gallery_id,
        case when v_op ? 'mark' then v_mark::selection_mark else null end,
        coalesce(v_favorite, false),
        v_retouch_note,
        coalesce(v_note_tags, '{}'::text[])
      );
    else
      update selection_items set
        mark         = case when v_op ? 'mark' then v_mark::selection_mark else mark end,
        is_favorite  = case when v_op ? 'isFavorite' then coalesce(v_favorite, false) else is_favorite end,
        retouch_note = case when v_op ? 'retouchNote' then v_retouch_note else retouch_note end,
        note_tags    = case when v_op ? 'noteTags' then v_note_tags else note_tags end,
        updated_at   = now()
      where selection_id = p_selection_id and photo_id = v_photo_id;

      -- Không còn liên hệ gì với ảnh thì dọn dòng đi. Còn tim hoặc còn ghi
      -- chú thì giữ: bỏ chọn không được phép làm mất cái tim.
      delete from selection_items
       where selection_id = p_selection_id
         and photo_id = v_photo_id
         and mark is null
         and is_favorite = false
         and retouch_note is null
         and coalesce(array_length(note_tags, 1), 0) = 0;
    end if;

    v_applied := v_applied + 1;
    v_exists := null;
  end loop;

  -- 4. Hạn mức. allow_extra = false thì trần chính là số ảnh trong gói.
  --
  -- v_hard_limit vẫn có thể null một cách HỢP LỆ: allow_extra = true kèm
  -- max_selection null nghĩa là cho khách mua thêm không giới hạn. Đó là lý do
  -- dòng dưới vẫn giữ `is not null`. Trường hợp nguy hiểm — hạn mức chưa biết
  -- — đã bị chặn ở cổng đầu hàm, không lọt tới đây được nữa.
  v_hard_limit := case when p_allow_extra then p_max_selection else p_included_quota end;

  select count(*) filter (where mark = 'selected'),
         count(*) filter (where is_favorite)
    into v_selected_count, v_favorite_count
    from selection_items where selection_id = p_selection_id;

  if v_hard_limit is not null and v_selected_count > v_hard_limit then
    raise exception 'QUOTA_EXCEEDED';
  end if;

  v_extra_count := greatest(0, v_selected_count - p_included_quota);
  v_extra_amount := v_extra_count * p_extra_price;

  insert into selection_ops (client_op_id, selection_id) values (p_client_op_id, p_selection_id);

  insert into activity_logs (
    actor_type, actor_id, actor_label, action, entity_type, entity_id, metadata, ip, user_agent
  ) values (
    'customer', p_selection_id, p_actor_label, 'selection.patch', 'gallery', p_gallery_id,
    jsonb_build_object('applied', v_applied, 'selectedCount', v_selected_count,
                       'clientOpId', p_client_op_id),
    p_ip, p_user_agent
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
$function$
;


-- docs/12-security.md mục 9 — revoke nằm ngay dưới create.
revoke all on function patch_selection_batch(
  uuid, uuid, uuid, text, jsonb, integer, boolean, integer, numeric, text, inet, text
) from public, anon, authenticated;

grant execute on function patch_selection_batch(
  uuid, uuid, uuid, text, jsonb, integer, boolean, integer, numeric, text, inet, text
) to service_role;

commit;
