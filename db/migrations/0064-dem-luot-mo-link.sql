-- Migration 0064 — đếm lượt mở link, và đặt lần xem cuối, một cách NGUYÊN TỬ.
--
-- OWNER: DEV-BE. Task BB-214(a).
--
-- ---------------------------------------------------------------------------
-- Vì sao có tệp này
-- ---------------------------------------------------------------------------
-- Rà soát 24/09/2026: `share_links.view_count`, `last_viewed_at` và
-- `last_viewed_ip` chỉ được ĐỌC ở màn quản trị (`admin/galleries/actions.ts`),
-- không có chỗ nào TĂNG `view_count`. `POST /api/auth/gallery` — nơi khách đổi
-- mã link lấy phiên, được gọi ở mọi lần mở `/g/[token]` (xem
-- `src/components/features/gallery/gallery-app.tsx` dòng gọi `/api/auth/gallery`)
-- — đã cập nhật `last_viewed_at` nhưng bỏ quên `view_count`. Kết quả: cả 23 link
-- đang có đều hiện 0 lượt xem, dù khách đã mở.
--
-- ---------------------------------------------------------------------------
-- Vì sao phải là một hàm SQL, không phải đọc-rồi-ghi ở tầng API
-- ---------------------------------------------------------------------------
-- `select view_count` rồi `update ... set view_count = v + 1` ở tầng
-- Node/Supabase-js là hai chuyến đi riêng: hai lần mở link gần như cùng lúc
-- (ví dụ khách bấm lại vì trang chậm) có thể cùng đọc được `view_count = 5`
-- rồi cùng ghi `6` — mất một lượt. Một câu `update share_links set
-- view_count = view_count + 1` chạy TRONG một hàm SQL là một câu lệnh duy
-- nhất: Postgres khoá đúng dòng đó cho tới khi ghi xong, nên hai lượt mở cùng
-- lúc luôn cộng ra đúng hai.
--
-- ---------------------------------------------------------------------------
-- Vì sao KHÔNG lưu `last_viewed_ip`
-- ---------------------------------------------------------------------------
-- `docs/12-security.md` và `docs/13-quyet-dinh-van-hanh.md` không có mục nào
-- nói rõ được phép hay không được phép lưu IP của khách vào cột riêng trên
-- `share_links` (khác với `activity_logs.ip`, vốn đã có tiền lệ ghi IP cho
-- đúng request `gallery.auth` này — nhưng đó là nhật ký thao tác, có mục đích
-- khác: chống dò link/rate-limit, không phải hồ sơ lâu dài gắn trên một dòng
-- share_links mà màn quản trị hiển thị thẳng ra). Không rõ luật thì không ghi:
-- hàm dưới đây CHỦ Ý không đụng `last_viewed_ip`, cột này tiếp tục là NULL cho
-- tới khi có quyết định rõ ràng từ chủ studio.
--
-- ---------------------------------------------------------------------------
-- Vì sao không loại trừ lượt xem trước của nhân viên
-- ---------------------------------------------------------------------------
-- `share_links.role` (`owner | co_editor | suggester | viewer`, xem
-- `src/types/domain.ts`) không có giá trị nào đánh dấu "nhân viên xem trước".
-- Không tìm thấy đường xem trước riêng cho nhân viên đi qua
-- `/api/auth/gallery` với một vai hay cờ phân biệt được — nhân viên quản trị
-- xem bộ ảnh qua màn `/admin/galleries/[id]`, đọc thẳng từ bảng, không qua
-- link chia sẻ. Vậy mọi lượt gọi hàm này đều là khách thật mở link, không có
-- gì cần loại trừ; nếu sau này có vai xem-trước riêng, chặn ở phía gọi
-- (route `/api/auth/gallery`) trước khi gọi hàm, không sửa hàm.
--
-- Tệp idempotent: `create or replace function`, an toàn chạy lại nhiều lần.

-- 1 --------------------------------------------------------------------------
create or replace function public.tang_luot_mo_link(p_share_link_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update share_links
     set view_count = view_count + 1,
         last_viewed_at = now()
   where id = p_share_link_id;
$$;

comment on function public.tang_luot_mo_link(uuid) is
  'Tăng share_links.view_count và đặt last_viewed_at cho một lượt mở link, '
  'nguyên tử (một câu UPDATE, không đọc-rồi-ghi). Gọi từ POST /api/auth/gallery '
  'sau khi xác nhận link dùng được. Xem migration 0064.';

-- 2 --------------------------------------------------------------------------
-- Phải đứng SAU `create or replace`: replace trả quyền EXECUTE về mặc định
-- (PUBLIC), nên đảo thứ tự hai khối này là dòng revoke bị chính create ở trên
-- xoá mất — đúng lỗi đã xảy ra ở 0045 và 0047 (xem AGENTS.md §5b).
revoke execute on function public.tang_luot_mo_link(uuid) from public;
revoke execute on function public.tang_luot_mo_link(uuid) from anon;
revoke execute on function public.tang_luot_mo_link(uuid) from authenticated;
grant  execute on function public.tang_luot_mo_link(uuid) to service_role;
