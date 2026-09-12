-- ============================================================================
-- Migration: 0022 — sửa cách đếm trong báo cáo thất thoát
--
-- PM sửa sau khi soát BB-106. Ba việc, hai trong đó là lỗi thật.
--
-- Con số của báo cáo này sẽ được dùng để ĐÒI TIỀN KHÁCH. Một con số phồng lên
-- không chỉ sai, nó làm hỏng lòng tin vào cả báo cáo: chỉ cần một khách phản
-- bác đúng một lần là không ai dám dùng bảng này nữa.
--
-- ---------------------------------------------------------------------------
-- 1. count(*) đếm trùng ảnh
-- ---------------------------------------------------------------------------
-- 0020 đếm ảnh đã chọn bằng
--
--     select count(*) from selection_items si join selections s ...
--      where s.gallery_id = g.id
--        and (s.is_primary or not exists (... s2.is_primary))
--
-- Khi album CÓ selection primary thì đúng: uq_selection_items chặn một ảnh
-- xuất hiện hai lần trong cùng một selection.
--
-- Nhưng khi album KHÔNG có selection nào là primary — xảy ra khi mọi share
-- link đều được tạo với vai khác owner — mệnh đề `not exists` cho TẤT CẢ
-- selection đi qua. Cùng một tấm ảnh mà mẹ và bà cùng chọn sẽ được đếm hai
-- lần, đẩy số ảnh vượt và số tiền lên theo.
--
-- Đổi thành count(distinct si.photo_id). Ảnh là ảnh, ai chọn cũng vậy.
--
-- Đáng chú ý: 0021 vừa đổi share_links.role mặc định thành 'viewer', nên album
-- không có primary sẽ xuất hiện NHIỀU HƠN chứ không ít đi. Hai thay đổi này
-- gặp nhau đúng chỗ này.
--
-- ---------------------------------------------------------------------------
-- 2. Bộ lọc vai: viết lại cho rõ, KHÔNG đổi hành vi
-- ---------------------------------------------------------------------------
--     where coalesce(app.my_role() != 'photoshop_ctv', true)
--
-- Thoạt nhìn đây giống lỗi "không biết thì cho qua" mà 0021 vừa dọn, và PM đã
-- thử đổi thành coalesce(..., false). ĐỔI NHƯ VẬY LÀ SAI, và nó làm báo cáo
-- rỗng hoàn toàn.
--
-- Lý do: app.my_role() trả null cho service_role — chính là khoá mà mọi route
-- API dùng để đọc. Đóng cửa với vai null tức là đóng cửa với người đọc duy
-- nhất. Trường hợp null còn lại là nhân viên đã bị khoá, và họ đã bị RLS của
-- galleries chặn từ trước (can_see_branch với vai null trả về rỗng).
--
-- Nên hành vi cũ đúng. Chỉ viết lại thành `is distinct from` cho đọc ra ngay
-- ý định, thay vì phải suy ngược từ coalesce.
--
-- ---------------------------------------------------------------------------
-- 3. Mỗi cột một tên
-- ---------------------------------------------------------------------------
-- 0020 trả cùng một giá trị dưới hai đến ba tên: gallery_id / id / album_id,
-- unbilled_count / unbilled_photo_count, và trong bảng tổng thì mọi số đều có
-- hai tên. Test chỉ dùng unbilled_count và missing_quota_album_count.
--
-- Hai tên cho một giá trị là hai chỗ để lệch nhau về sau. Giữ một bộ tên.
-- Phải DROP rồi CREATE vì create or replace view không bỏ được cột.
-- ============================================================================

begin;

drop view if exists v_over_quota_unbilled;
drop view if exists v_over_quota_summary;

-- ---------------------------------------------------------------------------
-- Từng album vượt hạn mức mà chưa thu tiền
-- ---------------------------------------------------------------------------

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
    coalesce((
      select count(distinct si.photo_id)::integer
        from selection_items si
        join selections s on s.id = si.selection_id
       where s.gallery_id = g.id
         and (s.is_primary or not exists (
               select 1 from selections s2 where s2.gallery_id = g.id and s2.is_primary))
         and si.mark = 'selected'
    ), 0)           as selected_count,
    coalesce((
      select sum(sa.quantity)::integer
        from selection_addons sa
        join products p on p.id = sa.product_id
        join selections s on s.id = sa.selection_id
       where s.gallery_id = g.id and p.kind = 'edited_photo'
    ), 0)           as addon_count,
    g.extra_photo_price
  from galleries g
  join branches b on b.id = g.branch_id
  left join shoots sh on sh.id = g.shoot_id
  -- CTV thời vụ không thấy gì. Vai null là service_role (route API tự lo
  -- phần xác thực) hoặc nhân viên đã bị khoá — cả hai đều bị RLS của galleries
  -- chặn sẵn, nên cho qua bộ lọc này.
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
  branch_id,
  branch_name,
  lark_contract_code,
  shoot_date,
  quota,
  selected_count,
  over_count,
  addon_count,
  greatest(0, over_count - addon_count)                        as unbilled_count,
  extra_photo_price,
  (greatest(0, over_count - addon_count) * extra_photo_price)::numeric as unbilled_amount
from metrics
where greatest(0, over_count - addon_count) > 0;

comment on view v_over_quota_unbilled is
  'Album đã chọn vượt hạn mức mà chưa mua thêm. Chỉ đếm ảnh mark = selected, '
  'mỗi ảnh một lần. Album chưa biết hạn mức KHÔNG nằm ở đây — xem '
  'missing_quota_album_count trong v_over_quota_summary.';

-- ---------------------------------------------------------------------------
-- Bảng tổng cho trang tổng quan
-- ---------------------------------------------------------------------------

create view v_over_quota_summary
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
    ), 0) as selected_count,
    coalesce((
      select sum(sa.quantity)::integer
        from selection_addons sa
        join products p on p.id = sa.product_id
        join selections s on s.id = sa.selection_id
       where s.gallery_id = g.id and p.kind = 'edited_photo'
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
  coalesce(sum(unbilled_count) filter (where quota is not null), 0)::integer
    as unbilled_photo_count,
  coalesce(sum(unbilled_count * extra_photo_price) filter (where quota is not null), 0)::numeric
    as total_unbilled_amount,
  -- Đếm riêng, KHÔNG cộng vào tiền. Đây là số album mà studio chưa đủ dữ liệu
  -- để kết luận, không phải số album không nợ gì.
  count(*) filter (where quota is null)::integer
    as missing_quota_album_count
from calculated
-- Không có GROUP BY nên truy vấn gộp này LUÔN trả một dòng, kể cả khi bộ lọc
-- vai đã loại sạch dữ liệu ở CTE trên. Với CTV thời vụ, một dòng toàn số 0 vừa
-- là thông tin họ không được thấy, vừa sai sự thật. having ở đây để họ nhận
-- KHÔNG dòng nào. Giữ nguyên từ bản gốc BB-106 của ARCH; PM đã thử bỏ và làm
-- hỏng đúng phép thử này.
having app.my_role() is distinct from 'photoshop_ctv';

comment on view v_over_quota_summary is
  'Tổng quan thất thoát. missing_quota_album_count là số album CHƯA ĐỦ DỮ LIỆU '
  'để đối chiếu, phải đọc kèm ba con số kia — con số tiền là SÀN, không phải trần.';

revoke all on v_over_quota_unbilled from public;
revoke all on v_over_quota_summary from public;
grant select on v_over_quota_unbilled to authenticated, service_role;
grant select on v_over_quota_summary to authenticated, service_role;

commit;
