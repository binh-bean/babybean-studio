-- 0088 — BB-357: thu gọn danh sách ảnh của bộ ảnh cũ (lưu trữ / hết hạn > 6 tháng).
--        BB-359 (sửa tại chỗ, vẫn CHƯA ÁP): thêm ĐÃ GIAO > 6 tháng; cột khoá
--        `mo_lai_anh_luc` cho đường khách mở lại bộ đã thu gọn (POST /api/g/mo-lai-anh).
--
-- VIẾT NHƯNG CHƯA ÁP (02/10/2026). Người áp: chủ dự án / PM, sau khi duyệt.
-- Chưa áp thì bước "anh_bo_cu" của người dọn (src/lib/van-hanh/don-rac.ts) tự
-- bỏ qua với ghi chú "chờ áp 0088" — không lỗi, không xoá gì.
--
-- Ba cột trên `galleries`:
--
--   * trang_thai_tu — lúc bộ ảnh VÀO trạng thái hiện tại. Mốc "6 tháng" đo từ
--     cột này, KHÔNG từ `updated_at`: cron đọc Lark ghi `lark_doc_luc` lên mọi
--     bộ chưa lưu trữ mỗi lượt (doc-trang-thai-lark.ts), nên `updated_at` của bộ
--     HẾT HẠN luôn mới → bộ hết hạn không bao giờ đủ tuổi. Cũng không có cột
--     `archived_at`/`expired_at` nào để dùng.
--     Điền sẵn = `updated_at` (luôn ≥ lúc đổi trạng thái thật → chỉ có thể
--     thu gọn MUỘN hơn, không bao giờ sớm hơn).
--   * danh_sach_thu_gon_luc — dấu "danh sách ảnh đã thu gọn". Màn chi tiết bộ
--     ảnh hiện "Ảnh gốc vẫn trên Drive — bấm Đồng bộ lại để xem đủ".
--   * mo_lai_anh_luc — BB-359: lúc một lượt "khách mở bộ đã thu gọn → tự Đồng bộ
--     lại" NHẬN việc. Là khoá + giới hạn tần suất: route chỉ nhận khi cột này NULL
--     hoặc cũ hơn 10 phút (một câu UPDATE có điều kiện — hai yêu cầu cùng lúc thì
--     Postgres chỉ cho MỘT câu khớp). Không xoá khi xong: lượt hỏng giữa chừng
--     cũng phải chờ 10 phút mới thử lại, không dội Drive.
--   * so_anh_truoc_thu_gon — `photo_count` trước khi thu gọn (để màn hình nói
--     được "đã thu gọn từ N ảnh"). `photo_count` thì cập nhật về số ảnh còn lại
--     để `verify:db` ("photo_count khớp số ảnh thật") vẫn đúng nghĩa.
--
-- Trigger `trg_galleries_bb357_moc`:
--   * status đổi → trang_thai_tu = now();
--   * last_synced_at đổi (tức "Đồng bộ lại" từ Drive vừa chạy xong,
--     sync-gallery.ts ghi cột này) → xoá dấu thu gọn. Không cần sửa mã đồng bộ.
--
-- Hàm trigger không `security definer`, nhưng vẫn revoke theo AGENTS.md §5b.
--
-- Đảo ngược:
--   drop trigger if exists trg_galleries_bb357_moc on galleries;
--   drop function if exists public.galleries_bb357_moc();
--   drop function if exists public.nhan_mo_lai_anh(uuid, interval, integer);
--   alter table galleries drop column if exists trang_thai_tu,
--     drop column if exists danh_sach_thu_gon_luc, drop column if exists so_anh_truoc_thu_gon,
--     drop column if exists mo_lai_anh_luc;
-- (Ảnh đã thu gọn lấy lại bằng "Đồng bộ lại" từ Drive — ảnh gốc không bị đụng.)

alter table galleries add column if not exists trang_thai_tu timestamptz;
alter table galleries add column if not exists danh_sach_thu_gon_luc timestamptz;
alter table galleries add column if not exists so_anh_truoc_thu_gon integer;
alter table galleries add column if not exists mo_lai_anh_luc timestamptz;

-- Điền sẵn KHÔNG làm nhích updated_at của ~500 bộ (trigger set_updated_at).
-- BB-359: bộ ĐÃ GIAO lấy mốc thật lúc giao (`deliveries.delivered_at`, route "Đã giao"
-- ghi), không thì lúc Lark vào trạng thái hiện tại (`lark_trang_thai_tu`), không thì
-- `updated_at`. Lý do: cron Lark ghi `lark_doc_luc` lên mọi bộ CHƯA lưu trữ mỗi lượt,
-- nên `updated_at` của bộ đã giao luôn mới → điền bằng nó thì không bộ đã giao nào
-- đủ tuổi trong 6 tháng đầu. `least(…, updated_at)`: không bao giờ muộn hơn bản cũ.
alter table galleries disable trigger trg_galleries_updated_at;
update galleries g
   set trang_thai_tu = least(
         g.updated_at,
         coalesce(
           (select max(d.delivered_at) from deliveries d
             where d.gallery_id = g.id and d.status = 'delivered' and d.delivered_at is not null),
           g.lark_trang_thai_tu,
           g.updated_at))
 where g.trang_thai_tu is null and g.status = 'delivered';
update galleries set trang_thai_tu = updated_at where trang_thai_tu is null;
alter table galleries enable trigger trg_galleries_updated_at;

alter table galleries alter column trang_thai_tu set default now();
alter table galleries alter column trang_thai_tu set not null;

comment on column galleries.trang_thai_tu is
  'BB-357: lúc bộ ảnh vào trạng thái hiện tại (trigger trg_galleries_bb357_moc). Mốc 6 tháng của bước thu gọn ảnh.';
comment on column galleries.danh_sach_thu_gon_luc is
  'BB-357: danh sách ảnh đã thu gọn lúc này (ảnh gốc vẫn trên Drive). Đồng bộ lại → trigger xoá về NULL.';
comment on column galleries.mo_lai_anh_luc is
  'BB-359: lúc lượt khách-mở-lại-bộ-đã-thu-gọn nhận việc Đồng bộ lại (khoá + tần suất 10 phút).';
comment on column galleries.so_anh_truoc_thu_gon is
  'BB-357: photo_count trước khi thu gọn. NULL khi chưa thu gọn / đã đồng bộ lại.';

create or replace function public.galleries_bb357_moc()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    new.trang_thai_tu := now();
  end if;
  -- Đồng bộ lại từ Drive vừa ghi last_synced_at → danh sách lại đủ.
  if new.last_synced_at is distinct from old.last_synced_at
     and new.danh_sach_thu_gon_luc is not distinct from old.danh_sach_thu_gon_luc then
    new.danh_sach_thu_gon_luc := null;
    new.so_anh_truoc_thu_gon := null;
  end if;
  return new;
end;
$$;
revoke execute on function public.galleries_bb357_moc() from public, anon, authenticated;

drop trigger if exists trg_galleries_bb357_moc on galleries;
create trigger trg_galleries_bb357_moc
  before update on galleries
  for each row execute function public.galleries_bb357_moc();

-- Bộ chờ thu gọn được chọn theo trạng thái + mốc; chỉ mục một phần rất nhỏ
-- (chỉ các bộ đã giao/lưu trữ/hết hạn chưa thu gọn — BB-359 thêm đã giao).
drop index if exists idx_galleries_cho_thu_gon;
create index idx_galleries_cho_thu_gon
  on galleries (trang_thai_tu)
  where status in ('delivered', 'archived', 'expired') and danh_sach_thu_gon_luc is null;

-- ---------------------------------------------------------------------------
-- BB-359 — khách mở bộ đã thu gọn: NHẬN việc "Đồng bộ lại" một cách nguyên tử.
-- ---------------------------------------------------------------------------
-- Gọi từ POST /api/g/mo-lai-anh (khoá service_role, sau khi đã kiểm phiên khách vai
-- owner của ĐÚNG bộ này). Trả một trong:
--   'khong_thu_gon' — bộ không (còn) thu gọn: không làm gì;
--   'dang_mo'       — đã có lượt nhận trong `p_khoa` vừa qua (khoá + giới hạn tần suất);
--   'ban'           — đang có ≥ p_tran bộ khác cùng mở lại (giữ hạn mức Drive) — thử sau;
--   'da_nhan'       — lượt này nhận việc; route chạy dongBoBoAnh ở nền.
-- Khoá nằm ở câu UPDATE có điều kiện: hai yêu cầu cùng lúc thì yêu cầu sau chờ khoá
-- dòng rồi đọc lại điều kiện trên bản mới (mo_lai_anh_luc vừa ghi) → không khớp.
create or replace function public.nhan_mo_lai_anh(
  p_gallery_id uuid,
  p_khoa interval default interval '10 minutes',
  p_tran integer default 3
)
returns text
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_thu_gon timestamptz;
  v_dang integer;
  v_id uuid;
begin
  select danh_sach_thu_gon_luc into v_thu_gon from galleries where id = p_gallery_id;
  if v_thu_gon is null then
    return 'khong_thu_gon';
  end if;

  select count(*)::int into v_dang
    from galleries
   where danh_sach_thu_gon_luc is not null
     and mo_lai_anh_luc > now() - p_khoa
     and id <> p_gallery_id;
  if v_dang >= p_tran then
    return 'ban';
  end if;

  update galleries
     set mo_lai_anh_luc = now()
   where id = p_gallery_id
     and danh_sach_thu_gon_luc is not null
     and (mo_lai_anh_luc is null or mo_lai_anh_luc < now() - p_khoa)
  returning id into v_id;
  if v_id is null then
    return 'dang_mo';
  end if;
  return 'da_nhan';
end;
$$;
revoke execute on function public.nhan_mo_lai_anh(uuid, interval, integer) from public, anon, authenticated;
grant execute on function public.nhan_mo_lai_anh(uuid, interval, integer) to service_role;
