-- ============================================================================
-- 0050 — Vật sinh ra sau này thôi tự động mở cho anon (BB-193)
--
-- Soát ngày 21/09/2026, ngay sau khi áp 0045–0049 lên bb-prod.
--
-- ---------------------------------------------------------------------------
-- Cái đã thấy
-- ---------------------------------------------------------------------------
-- Trên bb-prod, quyền MẶC ĐỊNH của schema public là:
--
--     anon          = arwdDxtm     (đọc, thêm, sửa, xoá — đủ cả)
--     authenticated = arwdm
--
-- Nghĩa là **mọi bảng và mọi khung nhìn sinh ra từ nay về sau đều mở sẵn cho
-- anon** ngay lúc chào đời, không cần ai cấp. Trên bb-dev thì hai dòng đó là
-- `anon=Dxtm` và `authenticated=m` — tức đã bị thu hồi.
--
-- Chênh lệch đó không nằm trong kho: không migration nào, không cả
-- `policies.sql`, có câu `alter default privileges ... from anon`. Ai đó đã gõ
-- tay lên bb-dev và không ghi lại. Một lớp bảo vệ chỉ tồn tại trong MỘT cơ sở
-- dữ liệu, không ai đọc kho mà biết được — đúng hình dạng của những lỗi đã cắn
-- dự án này bốn lần.
--
-- Hậu quả đo được: 0045 dựng lại `v_share_links` và 0047 tạo `v_staff_deletable`
-- thì cả hai khung nhìn trên bb-prod sinh ra với anon = SELECT/INSERT/UPDATE/
-- DELETE. Cả hai đều KHÔNG phải `security_invoker`, nên chúng chạy bằng quyền
-- của chủ khung nhìn và **đi vòng qua RLS** của `share_links` và
-- `staff_profiles`. `selection_ops` cũng đang mở cho authenticated trên bb-prod
-- trong khi bb-dev thì không.
--
-- Hôm nay chưa ai với tới được, vì Data API của bb-prod trả 404 cho mọi đường
-- (`PGRST125`) — nhưng đó là một CÔNG TẮC trong bảng điều khiển Supabase, không
-- phải một lớp quyền. Bật nhầm công tắc đó là 457 nhà thật lộ tiền tố link,
-- tình trạng link và số lượt mở.
--
-- ---------------------------------------------------------------------------
-- Làm gì
-- ---------------------------------------------------------------------------
-- Chạy lại nhiều lần cũng cho cùng kết quả: `revoke` trên thứ không có quyền là
-- không làm gì cả, và `alter default privileges` là đặt trạng thái chứ không
-- cộng dồn.
--
-- Chặt hơn bb-dev một bậc ở chỗ anon: bb-dev còn để lại TRUNCATE/TRIGGER/
-- REFERENCES cho anon trên bảng sinh sau. Không có lý do gì để một khoá công
-- khai được phép TRUNCATE bảng, nên thu hồi luôn — và migration này chạy cả
-- trên bb-dev nên hai bên hội tụ về cùng một chỗ.
-- ============================================================================

begin;

-- 1. Mọi khung nhìn, không chỉ hai cái vừa sinh ------------------------------
--
-- Quét cả `pg_views` chứ không gõ tên: đo ngày 21/09 thì bb-prod mở CẢ NĂM
-- khung nhìn cho anon với đủ SELECT/INSERT/UPDATE/DELETE, trong đó có hai bảng
-- báo cáo vượt hạn mức. Gõ tên thì lần sau ai thêm khung nhìn mới lại sót.
--
-- Luật đặt ra ở đây, và mốc kiểm trong `scripts/migrate-prod.mjs` canh đúng
-- luật này:
--
--   · anon          — không có gì trên bất kỳ khung nhìn nào.
--   · authenticated — không bao giờ được GHI qua khung nhìn.
--
-- Vì sao ghi qua khung nhìn là chuyện đáng chặn: `v_share_links` là một select
-- phẳng từ `share_links`, nên Postgres coi nó **tự động ghi được**. Mà khung
-- nhìn không phải `security_invoker` thì lệnh ghi đó chạy bằng quyền của chủ
-- khung nhìn — tức đi vòng qua mọi chính sách RLS của bảng gốc.
do $$
declare
  v record;
begin
  for v in select viewname from pg_views where schemaname = 'public'
  loop
    execute format('revoke all on public.%I from anon', v.viewname);
    execute format('revoke insert, update, delete on public.%I from authenticated', v.viewname);
  end loop;
end;
$$;

-- 1b. Hai khung nhìn quản trị: authenticated cũng không cần ĐỌC ---------------
--
-- Chỉ đường quản trị đọc chúng, và đường đó đi bằng khoá service_role. bb-dev
-- đang đúng như vậy; bb-prod thì đang mở cho authenticated.
--
-- Ba khung nhìn báo cáo (`v_gallery_progress`, `v_over_quota_*`) GIỮ NGUYÊN
-- quyền đọc của authenticated — bb-dev có, và đây không phải lúc đi đổi thứ
-- đang chạy được.
do $$
declare
  v_ten text;
begin
  foreach v_ten in array array['v_share_links', 'v_staff_deletable']
  loop
    if to_regclass('public.' || v_ten) is not null then
      execute format('revoke select on public.%I from authenticated', v_ten);
      execute format('grant select on public.%I to service_role', v_ten);
    end if;
  end loop;
end;
$$;

-- 1c. `selection_ops` — bảng, không phải khung nhìn ---------------------------
-- bb-prod cấp cho authenticated, bb-dev thì không cấp cho ai ngoài service_role.
do $$
begin
  if to_regclass('public.selection_ops') is not null then
    execute 'revoke all on public.selection_ops from anon, authenticated';
  end if;
end;
$$;

-- 2. Vật sinh sau này thôi mở sẵn ---------------------------------------------
alter default privileges in schema public
  revoke select, insert, update, delete, truncate, references, trigger on tables from anon;

alter default privileges in schema public
  revoke select, insert, update, delete on tables from authenticated;

alter default privileges in schema public
  revoke usage, select, update on sequences from anon, authenticated;

commit;

-- Sau migration này, một bảng mới vẫn cần dòng `grant` của chính nó cho
-- `authenticated` — đó là chủ ý: cấp quyền phải là một câu ai cũng đọc thấy
-- trong migration, không phải một thứ rơi từ mặc định xuống.
