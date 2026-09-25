-- 0070 — BB-201: giữ link gửi khách để màn quản trị hiện lại được (mã HOÁ, không phải mã gốc).
--
-- Chủ studio (docs/19, P0; nhắc lại 25/09/2026): "link app gửi khách vẫn bị
-- mất, tôi muốn nó hiện như link drive". Trước nay cơ sở dữ liệu chỉ giữ bản
-- BĂM của mã (share_links.token_hash) — an toàn, nhưng không dựng lại được
-- link, nên link chỉ hiện đúng một lần lúc tạo.
--
-- Nay giữ thêm bản MÃ HOÁ (AES-256-GCM, khoá dẫn xuất từ APP_SECRET của máy
-- chủ — src/lib/auth/ma-link.ts). Lộ riêng cơ sở dữ liệu vẫn không mở được bộ
-- ảnh nào: thiếu khoá thì chuỗi này vô dụng.
--
-- BẢNG RIÊNG, không phải một cột trên share_links: nhân viên đăng nhập có quyền
-- đọc share_links theo chi nhánh; khoá quyền theo CỘT không có tác dụng khi
-- bảng đã cấp SELECT cả bảng. Bảng riêng bật RLS, KHÔNG có policy nào, thu mọi
-- quyền của anon và authenticated → chỉ máy chủ (service_role) đọc được, và
-- máy chủ chỉ trả link cho nhân viên có quyền galleries:share đúng chi nhánh.

create table if not exists share_link_ma (
  share_link_id uuid        primary key references share_links(id) on delete cascade,
  ma_hoa        text        not null,   -- "v1:<iv>:<tag>:<ciphertext>" base64url
  created_at    timestamptz not null default now()
);

alter table share_link_ma enable row level security;
revoke all on table share_link_ma from anon, authenticated;

comment on table share_link_ma is
  'BB-201 — mã link gửi khách đã MÃ HOÁ (khoá ở máy chủ). Chỉ service_role đọc; không policy.';
