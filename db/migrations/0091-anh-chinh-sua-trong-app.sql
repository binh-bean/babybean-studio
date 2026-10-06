-- ============================================================================
-- Migration: 0091 — ảnh chỉnh sửa xem/duyệt trong app, yêu cầu sửa chi tiết (BB-371)
--
-- CHƯA ÁP. Mã của BB-371 chạy được khi chưa áp (tính năng tự ẩn an toàn):
--   · thiếu `deliveries.anh_chinh_gui_luc` → mốc "CSKH đã gửi khách" lấy tạm
--     `deliveries.updated_at` (route gửi khách cập nhật cột này cùng lúc);
--   · thiếu bảng `revision_request_items` → yêu cầu sửa vẫn ghi đủ CHỮ vào
--     `revision_requests.note` (ghép từng tấm), nhưng vùng khoanh + ảnh mẫu
--     không lưu được — màn khách ẩn hai công cụ đó;
--   · thiếu bucket `yeu-cau-sua` → nút "gửi kèm ảnh mẫu" ẩn.
--
-- Ba phần:
--   1. deliveries.anh_chinh_gui_luc — lúc CSKH bấm "Gửi khách duyệt". Ảnh
--      chỉnh về app SAU mốc này thì khách chưa thấy (chờ CSKH kiểm).
--   2. revision_request_items — mỗi tấm khách xin sửa trong một vòng: ghi chú,
--      vùng khoanh (tỉ lệ 0..1), đường dẫn ảnh mẫu trong Storage.
--   3. Bucket Storage `yeu-cau-sua` — ảnh mẫu khách tải lên. RIÊNG TƯ (không
--      public), tối đa 5 MB/tấm, chỉ ảnh. Không có policy nào trên
--      storage.objects cho bucket này: chỉ service_role (máy chủ app) đọc/ghi;
--      người xem nhận URL KÝ có hạn do máy chủ cấp sau khi xét quyền.
--
-- Không tạo hàm nào → không có dòng revoke function (AGENTS.md §5b).
-- Quyền bảng theo docs/12: RLS bật; khách ghi qua service_role (route API đã
-- xét phiên); nhân viên chỉ ĐỌC, cùng luật chi nhánh/CTV với revision_requests.
-- ============================================================================

begin;

-- 1 -------------------------------------------------------------------------
alter table deliveries add column if not exists anh_chinh_gui_luc timestamptz;

comment on column deliveries.anh_chinh_gui_luc is
  'BB-371: lúc CSKH bấm "Gửi khách duyệt" ảnh chỉnh trong app. Ảnh chỉnh có '
  'photos.created_at sau mốc này thì khách chưa thấy.';

-- 2 -------------------------------------------------------------------------
create table if not exists revision_request_items (
  id                  uuid primary key default gen_random_uuid(),
  revision_request_id uuid not null references revision_requests(id) on delete cascade,
  gallery_id          uuid not null references galleries(id) on delete cascade,
  -- Ảnh CHỈNH khách xin sửa (photos.subfolder là thư mục ảnh chỉnh sửa).
  photo_id            uuid not null references photos(id) on delete cascade,
  -- Ảnh gốc ghép theo tên tệp lúc khách gửi (null = không ghép được).
  original_photo_id   uuid references photos(id) on delete set null,
  note                text not null default '' check (length(note) <= 1000),
  -- [{x, y, r}] — tâm + bán kính theo tỉ lệ khung ảnh 0..1, tối đa 10 vùng.
  marks               jsonb not null default '[]'::jsonb
                        check (jsonb_typeof(marks) = 'array' and jsonb_array_length(marks) <= 10),
  -- Đường dẫn trong bucket `yeu-cau-sua`, dạng '<gallery_id>/<uuid>.<đuôi>'.
  reference_paths     text[] not null default '{}'::text[]
                        check (cardinality(reference_paths) <= 3),
  created_at          timestamptz not null default now(),
  unique (revision_request_id, photo_id)
);

create index if not exists idx_revision_request_items_gallery
  on revision_request_items(gallery_id, revision_request_id);

comment on table revision_request_items is
  'BB-371: từng tấm khách xin sửa trong một vòng (revision_requests): ghi chú, '
  'vùng khoanh, ảnh mẫu. Khách ghi qua service_role; nhân viên chỉ đọc.';

-- Supabase cấp sẵn mọi quyền cho anon/authenticated trên bảng mới ở schema
-- public — thu lại hết rồi cấp đúng phần cần.
revoke all on revision_request_items from public, anon, authenticated;
grant select on revision_request_items to authenticated;
grant all privileges on revision_request_items to service_role;

alter table revision_request_items enable row level security;

-- Cùng luật đọc với revision_requests (0033): thấy chi nhánh của bộ ảnh; CTV
-- chỉnh ảnh chỉ thấy bộ mình được giao.
drop policy if exists revision_request_items_select on revision_request_items;
create policy revision_request_items_select on revision_request_items for select to authenticated
  using (exists (
    select 1 from galleries g
    where g.id = revision_request_items.gallery_id
      and app.can_see_branch(g.branch_id)
      and (app.my_role() != 'photoshop_ctv' or g.editor_id = auth.uid())
  ));

-- 3 -------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'yeu-cau-sua',
  'yeu-cau-sua',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

commit;
