-- ============================================================================
-- Migration: 0015 — Hạn mức gallery ưu tiên gallery_items
--
-- BB-102: app.gallery_quota() trả về NULL khi chưa biết hạn mức. NULL KHÔNG PHẢI 0.
-- - Nếu album CÓ dòng hàng (gallery_items):
--   Hạn mức = tổng số lượng mọi dòng có product.kind = 'edited_photo'.
--   Nếu không có dòng nào kind = 'edited_photo' -> NULL (chưa biết hạn mức).
--   KHÔNG được trả về 0, KHÔNG được coalesce với 20.
-- - Nếu album KHÔNG CÓ dòng hàng (album cũ chưa đồng bộ từ Lark):
--   Đọc cột galleries.included_quota làm fallback.
-- ============================================================================

begin;

create or replace function app.gallery_quota(p_gallery_id uuid)
returns integer
language sql stable set search_path = public as $$
  select case
    when exists (select 1 from gallery_items where gallery_id = p_gallery_id) then
      (select nullif(sum(gi.quantity), 0)::integer
         from gallery_items gi
         join products p on p.id = gi.product_id
        where gi.gallery_id = p_gallery_id
          and p.kind = 'edited_photo')
    else
      (select g.included_quota from galleries g where g.id = p_gallery_id)
  end;
$$;

comment on function app.gallery_quota is
  'Hạn mức ảnh của album. Ưu tiên gallery_items (tổng edited_photo); null nếu có items nhưng không có edited_photo. Fallback galleries.included_quota khi không có items.';

revoke all on function app.gallery_quota(uuid) from public;
grant execute on function app.gallery_quota(uuid) to authenticated, service_role;

grant usage on schema app to service_role;
grant execute on all functions in schema app to service_role;

-- PostgREST chỉ expose schema public. Tạo wrapper để route API gọi qua RPC.
create or replace function public.gallery_quota(p_gallery_id uuid)
returns integer
language sql stable as $$
  select app.gallery_quota(p_gallery_id);
$$;

comment on function public.gallery_quota is
  'Wrapper public cho app.gallery_quota để gọi qua Supabase RPC.';

revoke all on function public.gallery_quota(uuid) from public;
grant execute on function public.gallery_quota(uuid) to authenticated, service_role;

commit;
