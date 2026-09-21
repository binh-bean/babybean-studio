-- ============================================================================
-- 0055 — Chốt chặn vai hệ thống của 0053 KHÔNG chặn gì cả (BB-172 chặng 2b)
--
-- ---------------------------------------------------------------------------
-- Lỗi
-- ---------------------------------------------------------------------------
-- `0053` dựng `app.chan_sua_vai_he_thong()` để không ai sửa hay xoá được vai
-- `owner`, kèm một ngoại lệ cho migration:
--
--     if old.is_system and current_user <> 'postgres' then raise ...
--
-- Nhưng hàm đó khai `security definer`. Trong một hàm `security definer`,
-- `current_user` là **chủ hàm** chứ không phải người gọi — tức luôn là
-- `postgres`. Nên vế `current_user <> 'postgres'` luôn sai, và trigger chưa
-- từng chặn một lượt nào.
--
-- Phép thử viết ngày 21/09/2026 bắt được: gọi thẳng `update roles set
-- permissions = '{}' where name = 'owner'` bằng khoá quản trị thì **không có
-- lỗi nào**, và bộ quyền của chủ studio bị xoá sạch.
--
-- Đây đúng hình dạng đã cắn dự án bốn lần: một lớp bảo vệ trông như đang chạy.
-- Lớp chặn ở API vẫn đúng, nhưng `service_role` đi vòng qua RLS được, nên chỉ
-- còn API canh thì bất kỳ đường ghi nào khác cũng xoá được vai `owner`.
--
-- ---------------------------------------------------------------------------
-- Sửa
-- ---------------------------------------------------------------------------
-- Bỏ `security definer`. Hàm này chỉ đọc `old`/`new` rồi ném lỗi — nó không cần
-- quyền của ai cả. Không có `definer` thì `current_user` đúng là vai đang gọi:
-- `service_role` hay `authenticated` khi đi qua ứng dụng, `postgres` khi là
-- migration.
-- ============================================================================

create or replace function app.chan_sua_vai_he_thong()
returns trigger
language plpgsql
set search_path = public as $$
begin
  if old.is_system and current_user <> 'postgres' then
    raise exception 'Vai trò hệ thống "%" không sửa và không xoá được', old.name
      using errcode = '42501';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function app.chan_sua_vai_he_thong() from public;

-- Hàm trigger chạy bằng quyền của người gọi, nên `service_role` và
-- `authenticated` phải gọi được nó — nếu không, mọi lượt ghi vào `roles` đều
-- gãy vì không gọi nổi trigger.
grant execute on function app.chan_sua_vai_he_thong() to authenticated, service_role;

drop trigger if exists trg_chan_sua_vai_he_thong on roles;
create trigger trg_chan_sua_vai_he_thong
  before update or delete on roles
  for each row execute function app.chan_sua_vai_he_thong();
