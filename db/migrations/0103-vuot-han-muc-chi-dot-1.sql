-- ============================================================================
-- 0103 — BB-395 vòng 3: "vượt hạn mức" chỉ đếm ẢNH ĐỢT 1.
--
-- VIẾT NHƯNG CHƯA ÁP. Claude áp sau khi soát. Chạy lại được nhiều lần.
--
-- Lỗi (tính tiền TRÙNG cho khách): `v_over_quota_unbilled` / `v_over_quota_summary` (bản 0022)
-- đếm MỌI `selection_items.mark = 'selected'` của lượt chọn — kể cả ảnh ĐỢT ≥ 2 (cột `dot`, 0077).
-- Ảnh đợt ≥ 2 đã tính tiền riêng theo đợt (`selection_rounds.tien_anh`, `tinhTienDot` — đợt ≥ 2 tính
-- tiền từ ảnh đầu tiên). Bộ không vượt ở đợt 1 (số lúc chốt = 0) mà có đợt 2 thì `layTienCanThu`
-- lùi về "số theo ảnh" của view → ảnh đợt 2 bị đòi HAI lần: một lần "vượt hạn mức", một lần `tien_anh`.
-- Tương tự "Edit file" khách mua ở giỏ đợt ≥ 2 (`selection_addons.dot ≥ 2`) bị trừ vào phần vượt
-- của đợt 1 trong khi đã nằm trong tiền của đợt.
--
-- Sửa: thêm `and si.dot = 1` / `and sa.dot = 1`. Cột `dot` nằm ở `selection_items` và
-- `selection_addons` (0077, `not null default 1` — mọi dòng cũ là đợt 1). Phần còn lại GIỮ NGUYÊN
-- từng chữ bản 0022: tên + kiểu cột đầu ra, `security_invoker = true`, bộ lọc vai, `having`.
-- `create or replace view` (cột không đổi) → giữ nguyên quyền; vẫn viết lại revoke/grant như 0022.
-- Không tạo hàm SQL.
--
-- Đảo ngược: chạy lại khối `create or replace view` của 0022 (bỏ hai dòng `dot = 1`), tức:
--   create or replace view v_over_quota_unbilled ... (bản 0022, dòng 70–132)
--   create view v_over_quota_summary  ... (bản 0022, dòng 143–190)
-- ============================================================================

begin;

-- bb-dev đang chạy bản schema.sql (thêm cột bí danh id/title/album_*/included_quota/…), bb-prod sẽ
-- chạy bản 0022 — `create or replace` không đổi được bộ cột giữa hai bản. Nên DROP rồi CREATE với
-- tập cột HỢP của cả hai (bí danh giữ để không gãy ai đang đọc). Không có đối tượng nào phụ thuộc
-- hai view; nếu có, drop (không cascade) sẽ gãy và cả giao dịch hoàn nguyên.
drop view if exists v_over_quota_summary;
drop view if exists v_over_quota_unbilled;

create view v_over_quota_unbilled
with (security_invoker = true) as
with raw_stats as (
  select
    g.id            as gallery_id,
    g.title         as gallery_title,
    g.branch_id,
    b.name          as branch_name,
    coalesce(
      g.lark_contract_code,
      (select gi.lark_contract_code from gallery_items gi
        where gi.gallery_id = g.id and gi.lark_contract_code is not null limit 1)
    )               as lark_contract_code,
    sh.shoot_date,
    app.gallery_quota(g.id) as quota,
    -- distinct: một tấm ảnh mà hai người cùng chọn vẫn là một tấm ảnh.
    -- 0103: chỉ ảnh ĐỢT 1 — ảnh đợt ≥ 2 tính tiền theo đợt (selection_rounds.tien_anh).
    coalesce((
      select count(distinct si.photo_id)::integer
        from selection_items si
        join selections s on s.id = si.selection_id
       where s.gallery_id = g.id
         and (s.is_primary or not exists (
               select 1 from selections s2 where s2.gallery_id = g.id and s2.is_primary))
         and si.mark = 'selected'
         and si.dot = 1
    ), 0)           as selected_count,
    -- 0103: "Edit file" mua ở giỏ đợt ≥ 2 đã nằm trong tiền của đợt — không trừ vào vượt đợt 1.
    coalesce((
      select sum(sa.quantity)::integer
        from selection_addons sa
        join products p on p.id = sa.product_id
        join selections s on s.id = sa.selection_id
       where s.gallery_id = g.id and p.kind = 'edited_photo'
         and sa.dot = 1
    ), 0)           as addon_count,
    g.extra_photo_price
  from galleries g
  join branches b on b.id = g.branch_id
  left join shoots sh on sh.id = g.shoot_id
  where app.my_role() is distinct from 'photoshop_ctv'
),
metrics as (
  select *,
         greatest(0, selected_count - quota) as over_count
    from raw_stats
   where quota is not null      -- chưa biết hạn mức thì không kết luận gì
)
select
  gallery_id,
  gallery_title,
  gallery_id    as id,
  gallery_title as title,
  gallery_id    as album_id,
  gallery_title as album_title,
  branch_id,
  branch_name,
  lark_contract_code,
  shoot_date,
  quota,
  quota         as included_quota,
  selected_count,
  over_count,
  addon_count,
  addon_count   as addon_photo_count,
  greatest(0, over_count - addon_count)                        as unbilled_count,
  greatest(0, over_count - addon_count)                        as unbilled_photo_count,
  extra_photo_price,
  (greatest(0, over_count - addon_count) * extra_photo_price)::numeric as unbilled_amount
from metrics
where greatest(0, over_count - addon_count) > 0;

comment on view v_over_quota_unbilled is
  'Album đã chọn vượt hạn mức (ẢNH ĐỢT 1 — 0103) mà chưa mua thêm. Chỉ đếm ảnh mark = selected, '
  'mỗi ảnh một lần. Ảnh đợt ≥ 2 tính tiền theo đợt (selection_rounds). Album chưa biết hạn mức '
  'KHÔNG nằm ở đây — xem missing_quota_album_count trong v_over_quota_summary.';

create or replace view v_over_quota_summary
with (security_invoker = true) as
with per_gallery as (
  select
    g.id as gallery_id,
    app.gallery_quota(g.id) as quota,
    coalesce((
      select count(distinct si.photo_id)::integer
        from selection_items si
        join selections s on s.id = si.selection_id
       where s.gallery_id = g.id
         and (s.is_primary or not exists (
               select 1 from selections s2 where s2.gallery_id = g.id and s2.is_primary))
         and si.mark = 'selected'
         and si.dot = 1
    ), 0) as selected_count,
    coalesce((
      select sum(sa.quantity)::integer
        from selection_addons sa
        join products p on p.id = sa.product_id
        join selections s on s.id = sa.selection_id
       where s.gallery_id = g.id and p.kind = 'edited_photo'
         and sa.dot = 1
    ), 0) as addon_count,
    g.extra_photo_price
  from galleries g
  where app.my_role() is distinct from 'photoshop_ctv'
),
calculated as (
  select
    quota,
    case when quota is null then 0
         else greatest(0, greatest(0, selected_count - quota) - addon_count) end as unbilled_count,
    extra_photo_price
  from per_gallery
)
select
  count(*) filter (where quota is not null and unbilled_count > 0)::integer
    as over_quota_album_count,
  count(*) filter (where quota is not null and unbilled_count > 0)::integer
    as album_count,
  coalesce(sum(unbilled_count) filter (where quota is not null), 0)::integer
    as unbilled_photo_count,
  coalesce(sum(unbilled_count) filter (where quota is not null), 0)::integer
    as photo_count,
  coalesce(sum(unbilled_count * extra_photo_price) filter (where quota is not null), 0)::numeric
    as total_unbilled_amount,
  coalesce(sum(unbilled_count * extra_photo_price) filter (where quota is not null), 0)::numeric
    as total_amount,
  count(*) filter (where quota is null)::integer
    as missing_quota_album_count,
  count(*) filter (where quota is null)::integer
    as missing_data_album_count
from calculated
having app.my_role() is distinct from 'photoshop_ctv';

comment on view v_over_quota_summary is
  'Tổng quan thất thoát (ảnh đợt 1 — 0103). missing_quota_album_count là số album CHƯA ĐỦ DỮ LIỆU '
  'để đối chiếu, phải đọc kèm ba con số kia — con số tiền là SÀN, không phải trần.';

revoke all on v_over_quota_unbilled from public;
revoke all on v_over_quota_summary from public;
grant select on v_over_quota_unbilled to authenticated, service_role;
grant select on v_over_quota_summary to authenticated, service_role;

commit;
