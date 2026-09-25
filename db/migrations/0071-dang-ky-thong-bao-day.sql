-- 0071 — BB-246: bảng đăng ký thông báo đẩy (Web Push) cho ba mẹ trên màn khách.
--
-- Chủ studio: bấm "Bật thông báo" một lần thì nhận tin khi ảnh đã chỉnh xong,
-- mời duyệt (bộ ảnh sang `awaiting_approval`) — không cần mở lại link để biết.
--
-- Mỗi trình duyệt tự đăng ký một "subscription" Web Push (endpoint riêng của
-- Google/Apple/Mozilla + hai khoá mã hoá p256dh/auth). Bảng này lưu đúng những
-- gì trình duyệt trả về lúc đăng ký — không lưu link khách (mã link là bí mật,
-- xem src/lib/auth/ma-link.ts và ghi chú trong service worker).
--
-- BẢNG RIÊNG, RLS bật, KHÔNG policy, thu hết quyền của anon/authenticated —
-- cùng khuôn với `share_link_ma` ở 0070: endpoint + khoá p256dh/auth gộp lại
-- là đủ để MẠO DANH trình duyệt đó nhận thông báo of một bộ ảnh, nên chỉ máy
-- chủ (service_role) được đọc/ghi bảng này.

create table if not exists push_dang_ky (
  id          uuid        primary key default gen_random_uuid(),
  gallery_id  uuid        not null references galleries(id) on delete cascade,
  endpoint    text        not null unique,
  p256dh      text        not null,
  auth        text        not null,
  created_at  timestamptz default now(),
  gui_ok_luc  timestamptz
);

create index if not exists idx_push_dang_ky_gallery_id on push_dang_ky (gallery_id);

alter table push_dang_ky enable row level security;
revoke all on push_dang_ky from anon, authenticated;

comment on table push_dang_ky is
  'BB-246 — đăng ký Web Push của trình duyệt khách, theo bộ ảnh. Chỉ service_role đọc/ghi; không policy.';
comment on column push_dang_ky.gui_ok_luc is
  'Lần gửi thành công gần nhất — không phải lần ĐĂNG KÝ. NULL nghĩa là chưa gửi được lần nào.';
