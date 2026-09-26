-- 0074 — BB-261: hộp thư thông báo cho khách + chuông chưa đọc.
--
-- Chủ studio 26/09/2026: "bật tự động khách chỉ cần chấp nhận và biểu tượng
-- là cái chuông ở góc phải thôi, và thông báo nếu khách chưa đọc cũng sẽ
-- được báo lại và hiện ở đó."
--
-- KHÔNG TỰ ÁP MIGRATION NÀY. Chỉ viết ra chờ Opus soát rồi áp lên bb-dev —
-- xem AGENTS.md và brief BB-261.
--
-- ---------------------------------------------------------------------------
-- Vì sao một bảng riêng, không tái dùng activity_logs
-- ---------------------------------------------------------------------------
-- `activity_logs` (BB-052) là nhật ký NỘI BỘ — ai làm gì, đọc bởi nhân viên.
-- Bảng này là HỘP THƯ của khách: nội dung hiển thị thẳng trên màn khách, có
-- trạng thái đã đọc/chưa đọc và số lần nhắc lại — hai việc khác nhau, hai
-- vòng đời khác nhau (một dòng activity_logs không bao giờ đổi; một dòng ở
-- đây đổi `da_doc_luc` và `so_lan_nhac` nhiều lần).
--
-- ---------------------------------------------------------------------------
-- RLS bật, KHÔNG policy — cùng khuôn với push_dang_ky (0071)
-- ---------------------------------------------------------------------------
-- Khách không có tài khoản Supabase Auth (phiên khách ký bằng HMAC riêng, xem
-- src/lib/auth/gallery-session.ts) — mọi truy cập bảng này đi qua route API
-- (service_role), route tự kiểm phiên khách đúng bộ ảnh. `anon`/`authenticated`
-- không cần đọc/ghi trực tiếp, nên thu hết quyền.

create table if not exists thong_bao_khach (
  id             uuid        primary key default gen_random_uuid(),
  gallery_id     uuid        not null references galleries(id) on delete cascade,
  loai           text        not null,
  tieu_de        text        not null check (char_length(tieu_de) <= 120),
  noi_dung       text        not null check (char_length(noi_dung) <= 500),
  created_at     timestamptz not null default now(),
  da_doc_luc     timestamptz,
  so_lan_nhac    int         not null default 0,
  nhac_lan_cuoi  timestamptz
);

create index if not exists idx_thong_bao_khach_gallery_created
  on thong_bao_khach (gallery_id, created_at desc);

alter table thong_bao_khach enable row level security;
revoke all on thong_bao_khach from anon, authenticated;

comment on table thong_bao_khach is
  'BB-261 — hộp thư thông báo hiển thị trên chuông màn khách. RLS bật, không policy: chỉ service_role đọc/ghi qua route API (đã tự kiểm phiên khách).';
comment on column thong_bao_khach.loai is
  'Loại sự kiện, vd anh_chinh_xong, hinh_da_ve — để phân biệt nguồn gốc, không phải để lọc hiển thị.';
comment on column thong_bao_khach.da_doc_luc is
  'NULL nghĩa là chưa đọc. Khách mở chuông (hoặc bấm vào thông báo) thì đánh dấu.';
comment on column thong_bao_khach.so_lan_nhac is
  'Số lần đã NHẮC LẠI qua push vì khách chưa đọc — tối đa 2 (xem nhacThongBaoChuaDoc), không tính lần gửi đầu.';
comment on column thong_bao_khach.nhac_lan_cuoi is
  'Mốc thời gian của lần nhắc gần nhất, để chặn nhắc lại trước khi đủ 24 giờ.';
