-- ============================================================================
-- 0006 — Khoá các hàm public SECURITY DEFINER
--
-- Task BB-082: Chặn anon và authenticated gọi thẳng hàm public, chỉ cho phép service_role
-- ============================================================================

-- Thay đổi quyền mặc định cho các hàm tương lai trong schema public
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema public grant execute on functions to service_role;

-- Thu hồi quyền EXECUTE trên các hàm hiện có khỏi PUBLIC, anon và authenticated
-- Postgres cấp mặc định quyền EXECUTE cho PUBLIC trên mọi function.
revoke execute on function public.get_gallery_photos from public, anon, authenticated;
revoke execute on function public.patch_selection_batch(uuid, uuid, uuid, text, jsonb, integer, integer, numeric, text, inet, text) from public, anon, authenticated;
revoke execute on function public.patch_selection_batch(uuid, uuid, uuid, text, jsonb, integer, boolean, integer, numeric, text, inet, text) from public, anon, authenticated;
revoke execute on function public.create_gallery_bundle from public, anon, authenticated;
revoke execute on function public.rls_auto_enable from public, anon, authenticated;

-- Đảm bảo service_role vẫn có quyền EXECUTE
grant execute on function public.get_gallery_photos to service_role;
grant execute on function public.patch_selection_batch(uuid, uuid, uuid, text, jsonb, integer, integer, numeric, text, inet, text) to service_role;
grant execute on function public.patch_selection_batch(uuid, uuid, uuid, text, jsonb, integer, boolean, integer, numeric, text, inet, text) to service_role;
grant execute on function public.create_gallery_bundle to service_role;
grant execute on function public.rls_auto_enable to service_role;
