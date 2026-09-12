-- ============================================================================
-- Migration: 0033 — vòng duyệt ảnh đã chỉnh
--
-- BB-121. Dùng hai giá trị enum đã thêm ở 0032. Tách file vì Postgres không
-- cho dùng giá trị enum trong cùng giao dịch với lệnh thêm nó.
--
-- ---------------------------------------------------------------------------
-- Vòng lặp, không phải đường thẳng
-- ---------------------------------------------------------------------------
--   in_retouch          người photoshop đang chỉnh
--     ↓ CSKH gửi file đã chỉnh cho khách
--   awaiting_approval   chờ khách duyệt
--     ├─ khách đồng ý   → approved → đi in → delivered
--     └─ khách yêu cầu sửa → QUAY LẠI in_retouch, vòng sau
--
-- Vòng có thể lặp nhiều lần. Không đếm vòng thì đến vòng thứ tư không ai nhớ
-- khách đã yêu cầu những gì ở ba vòng trước, và người photoshop sửa lại đúng
-- thứ đã sửa rồi.
--
-- ---------------------------------------------------------------------------
-- Vì sao yêu cầu sửa phải lưu thành BẢN GHI, không phải một ô ghi chú
-- ---------------------------------------------------------------------------
-- Một ô ghi chú trên bộ ảnh thì vòng sau ghi đè vòng trước. Lịch sử yêu cầu là
-- thứ duy nhất trả lời được "khách đã đòi sửa mấy lần rồi" — câu hỏi luôn xuất
-- hiện khi hai bên bắt đầu căng thẳng, và lúc đó không còn ai nhớ chính xác.
-- ============================================================================

begin;

create table revision_requests (
  id          uuid primary key default gen_random_uuid(),
  gallery_id  uuid not null references galleries(id) on delete cascade,

  -- Vòng thứ mấy. Vòng 1 là lần khách yêu cầu sửa đầu tiên.
  round       integer not null check (round >= 1),

  -- Khách viết gì. Bắt buộc — "yêu cầu sửa" mà không nói sửa gì thì người
  -- photoshop không làm được, và họ sẽ phải gọi lại hỏi.
  note        text not null check (length(trim(note)) > 0),

  -- Link file đã chỉnh mà khách đang xem lúc yêu cầu. Giữ lại để biết khách
  -- chê BẢN NÀO — vòng sau file khác rồi.
  reviewed_url text,

  created_at  timestamptz not null default now(),

  -- Lúc CSKH chuyển bản mới cho khách xem, vòng này coi như đã xử lý.
  resolved_at timestamptz,

  unique (gallery_id, round)
);

create index idx_revision_requests_gallery on revision_requests(gallery_id, round);

comment on table revision_requests is
  'Lịch sử khách yêu cầu sửa ảnh. Mỗi vòng một dòng — không ghi đè, vì câu hỏi '
  '"khách đã đòi sửa mấy lần" chỉ trả lời được bằng lịch sử.';

-- ---------------------------------------------------------------------------
-- Quyền
-- ---------------------------------------------------------------------------

grant select, insert, update on revision_requests to authenticated;
grant all privileges on revision_requests to service_role;
revoke truncate, trigger, references on revision_requests from authenticated;

alter table revision_requests enable row level security;

-- Người photoshop PHẢI đọc được — đây là việc của họ. Khác với bảng tiền.
create policy revision_requests_select on revision_requests for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = revision_requests.gallery_id
      and app.can_see_branch(g.branch_id)
      and (app.my_role() != 'photoshop_ctv' or g.editor_id = auth.uid())
  ));

-- Khách ghi qua service_role; nhân viên không thay khách viết yêu cầu sửa.
-- Cho CSKH cập nhật resolved_at khi chuyển bản mới.
create policy revision_requests_update on revision_requests for update to authenticated
  using (app.can_write() and exists (
    select 1 from galleries g
    where g.id = revision_requests.gallery_id and app.can_see_branch(g.branch_id)))
  with check (app.can_write());

-- ---------------------------------------------------------------------------
-- Khoá chọn ảnh ở các trạng thái mới
-- ---------------------------------------------------------------------------
-- patch_selection_batch chặn sửa lựa chọn khi bộ ảnh đã chốt. Hai trạng thái
-- mới nằm SAU lúc chốt, nên cũng phải chặn — nếu không, khách đang duyệt ảnh
-- đã chỉnh vẫn bỏ chọn được ảnh gốc, và người photoshop đã chỉnh xong rồi.
--
-- Hàm giữ NGUYÊN CHỮ KÝ. Đổi một tham số là Postgres tạo bản CHỒNG chứ không
-- thay thế, và bản mới mặc định cho PUBLIC gọi — bẫy đã mở lại lỗ hổng BB-082
-- một lần.
create or replace function app.gallery_is_locked(p_status gallery_status)
returns boolean
language sql immutable as $$
  select p_status in ('submitted', 'in_retouch', 'awaiting_approval',
                      'approved', 'delivered', 'archived');
$$;

comment on function app.gallery_is_locked is
  'Bộ ảnh ở trạng thái này thì khách không sửa lựa chọn được nữa. Một chỗ duy '
  'nhất để danh sách trạng thái khoá không trôi khỏi nhau giữa các hàm.';

revoke all on function app.gallery_is_locked(gallery_status) from public;
grant execute on function app.gallery_is_locked(gallery_status) to authenticated, service_role;

commit;
