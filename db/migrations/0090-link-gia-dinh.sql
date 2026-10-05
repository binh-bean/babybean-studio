-- ============================================================================
-- 0090 — BB-334A: link gia đình (một link cho cả nhà) + số thứ tự bộ trong nhà.
--
-- VIẾT NHƯNG CHƯA ÁP (04/10/2026). Người áp: giám đốc điều hành / PM sau khi soát.
-- App chạy được cả khi CHƯA áp:
--   * `galleries.so_thu_tu_khach` thiếu → máy chủ tính số thứ tự theo
--     (created_at, id) trong khách — ĐÚNG cách mục 2 dưới đây điền ngược, nên
--     áp xong địa chỉ /k/<mã>/<n> ba mẹ đã lưu KHÔNG đổi nghĩa.
--   * chỉ mục duy nhất ở mục 1 thiếu → route nhân viên vẫn tự thu hồi link gia
--     đình cũ trước khi tạo link mới (một link sống/khách giữ bằng mã); chỉ mục
--     là lưới cuối cùng chống hai CSKH bấm cùng lúc.
--
-- Kế hoạch: babybean-assets/BB-334/ke-hoach.md mục 1 (đánh số dự kiến 0078;
-- giám đốc đánh lại thành 0090). Hợp đồng API: docs/29-link-gia-dinh.md.
-- KHÔNG thêm bảng mới: link gia đình = `share_links` có `customer_id` (0010),
-- `role = 'owner'`, `expires_at = null`; bản mã hoá ở `share_link_ma` (0070).
--
-- Chạy lại được nhiều lần: `if not exists`, `create or replace`, `drop trigger
-- if exists`, điền ngược chỉ chạm dòng còn NULL.
--
-- AGENTS.md §5b: hàm trigger KHÔNG `security definer`, nhưng vẫn revoke ngay
-- sau `create or replace` (create cấp EXECUTE cho PUBLIC theo mặc định) và ghim
-- search_path.
--
-- Đảo ngược (không mất dữ liệu nghiệp vụ — chỉ bỏ số thứ tự và chỉ mục):
--   drop trigger if exists trg_galleries_so_thu_tu_khach on galleries;
--   drop function if exists public.gan_so_thu_tu_khach();
--   drop index if exists uq_galleries_so_thu_tu_khach;
--   alter table galleries drop column if exists so_thu_tu_khach;
--   drop index if exists uq_share_links_gia_dinh_song;
-- ============================================================================

-- 1. Mỗi khách tối đa MỘT link gia đình còn sống ------------------------------
-- Chỉ link `owner` gắn theo khách. Link mời người thân theo khách (viewer, Q6)
-- không bị giới hạn ở đây — giới hạn 5 link/khách nằm ở route.
-- Trên bb-dev ngày 04/10/2026: 0 dòng `share_links` có `customer_id` → tạo chỉ
-- mục không vướng dòng trùng nào.
create unique index if not exists uq_share_links_gia_dinh_song
  on share_links (customer_id)
  where customer_id is not null and role = 'owner' and status = 'active';

-- 2. Số thứ tự bộ ảnh trong nhà (/k/<mã>/<n>) -------------------------------
alter table galleries add column if not exists so_thu_tu_khach smallint;

comment on column galleries.so_thu_tu_khach is
  'BB-334: số thứ tự (1,2,3…) của bộ ảnh trong khách — cho địa chỉ đẹp /k/<mã>/<n> mà không lộ uuid. Gán bởi trigger trg_galleries_so_thu_tu_khach; không tái dùng số khi bộ bị ẩn.';

-- Điền ngược: thứ tự tạo trong từng khách, hoà thì theo id — khớp đúng cách
-- `src/lib/gia-dinh/bo-anh-gia-dinh.ts` tính khi cột chưa có.
with xep as (
  select id,
         row_number() over (partition by customer_id order by created_at, id) as n
    from galleries
   where customer_id is not null
)
update galleries g
   set so_thu_tu_khach = xep.n
  from xep
 where g.id = xep.id
   and g.so_thu_tu_khach is null;

create unique index if not exists uq_galleries_so_thu_tu_khach
  on galleries (customer_id, so_thu_tu_khach)
  where so_thu_tu_khach is not null;

-- Bộ mới (hoặc bộ chuyển sang khách khác khi gộp khách) nhận số kế tiếp.
-- Khoá tư vấn theo khách: hai bộ của cùng một khách được tạo cùng lúc (đồng bộ
-- Lark chạy song song) không lấy trùng số — trùng là chỉ mục duy nhất ở trên
-- ném lỗi và làm hỏng lượt đồng bộ.
create or replace function public.gan_so_thu_tu_khach()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.customer_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and new.customer_id is not distinct from old.customer_id
     and new.so_thu_tu_khach is not null then
    return new;
  end if;
  if tg_op = 'INSERT' and new.so_thu_tu_khach is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('bb334:' || new.customer_id::text, 0));
  select coalesce(max(so_thu_tu_khach), 0) + 1
    into new.so_thu_tu_khach
    from galleries
   where customer_id = new.customer_id
     and id <> new.id;
  return new;
end;
$$;

revoke execute on function public.gan_so_thu_tu_khach() from public, anon, authenticated;

drop trigger if exists trg_galleries_so_thu_tu_khach on galleries;
create trigger trg_galleries_so_thu_tu_khach
  before insert or update of customer_id on galleries
  for each row execute function public.gan_so_thu_tu_khach();
