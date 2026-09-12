-- ============================================================================
-- Migration: 0038 — cài đặt nhạy cảm chỉ chủ và quản trị đọc được
--
-- BB-124, phần cuối.
--
-- ---------------------------------------------------------------------------
-- Tìm ra bằng cách đo, không phải bằng cách đọc
-- ---------------------------------------------------------------------------
-- Dựng một nhân viên giả cho TỪNG vai trò rồi đếm số dòng mỗi vai đọc được ở
-- 23 bảng. Bảng `settings` là bảng duy nhất mà CẢ CHÍN vai trò, kể cả CTV thời
-- vụ, đọc được hết:
--
--     using ((branch_id is null) or app.can_see_branch(branch_id))
--
-- Dòng toàn cục (branch_id null) không có điều kiện nào cả.
--
-- ---------------------------------------------------------------------------
-- Vì sao đáng sửa dù hôm nay chưa rò gì
-- ---------------------------------------------------------------------------
-- Trong bảng có khoá `lark.webhook_url`. Hôm nay giá trị RỖNG nên chưa lộ gì.
-- Nhưng webhook là thứ ai cầm cũng nhắn được vào Lark của studio — nó là một
-- loại chìa khoá. Chỗ để chìa khoá mà ai cũng mở được thì chỉ chờ tới ngày có
-- người bỏ chìa vào.
--
-- Đây đúng hình dạng của lỗ hổng `deliveries` ở 0036: chính sách viết cho một
-- bảng chưa có dữ liệu thì không ai soát kỹ, và nó nằm im tới lúc bảng có
-- dữ liệu. Sửa trước khi có dữ liệu thì rẻ hơn nhiều.
--
-- ---------------------------------------------------------------------------
-- Nhận diện theo HÌNH DẠNG TÊN, không theo danh sách
-- ---------------------------------------------------------------------------
-- Liệt kê từng khoá thì khoá thêm sau này không ai nhớ bổ sung. Bắt theo hình
-- dạng tên: khoá nào có url, token, secret, key, password hay webhook thì chỉ
-- chủ và quản trị đọc. Tám khoá hiện có: chỉ `lark.webhook_url` trúng.
--
-- Không màn hình nào đọc bảng này (màn Cài đặt chưa làm), nên siết không hỏng
-- gì.
-- ============================================================================

begin;

create or replace function app.setting_is_sensitive(p_key text)
returns boolean
language sql immutable as $$
  select p_key ~* '(url|token|secret|key|password|webhook)';
$$;

comment on function app.setting_is_sensitive is
  'Khoá cài đặt có hình dạng của một bí mật. Bắt theo tên chứ không theo danh '
  'sách liệt kê, để khoá thêm sau này không bị bỏ sót.';

revoke all on function app.setting_is_sensitive(text) from public;
grant execute on function app.setting_is_sensitive(text) to authenticated, service_role;

drop policy if exists settings_select on settings;

create policy settings_select on settings for select to authenticated
  using (
    (branch_id is null or app.can_see_branch(branch_id))
    -- CTV thời vụ không cần cài đặt nào.
    and app.my_role() is distinct from 'photoshop_ctv'
    and (
      not app.setting_is_sensitive(key)
      or app.my_role() in ('owner', 'admin')
    )
  );

comment on policy settings_select on settings is
  'Khoá có hình dạng bí mật (url, token, secret, key, password, webhook) chỉ '
  'chủ và quản trị đọc được. CTV thời vụ không đọc cài đặt nào.';

commit;
