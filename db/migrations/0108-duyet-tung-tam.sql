-- ============================================================================
-- Migration: 0108 — ba mẹ "Duyệt tấm này" từng tấm ảnh chỉnh, lưu trên máy chủ (BB-401)
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát.
-- Chưa áp thì app vẫn chạy: route `POST /api/g/anh-chinh-sua/duyet-tam` trả
-- `{ luuMayChu: false }` (không lỗi), màn khách giữ dấu "Đã duyệt" trên máy
-- (localStorage) như bản BB-401 vòng 1; màn quản trị không hiện dòng "Khách đã
-- duyệt n/N tấm". Mã dò bảng bằng mã lỗi "chưa có bảng" (`laLoiChuaCoBang`).
--
-- Vì sao: anh 08/10 — ba mẹ bấm "Duyệt tấm này" từng tấm; mở lại trên máy khác
-- (điện thoại ↔ máy tính) phải còn nguyên, và thợ/CSKH phải thấy khách đã ưng
-- những tấm nào (đừng đụng vào các tấm đó khi sửa).
--
-- Một dòng = một tấm ảnh CHỈNH ba mẹ đã bấm duyệt:
--   · `khoa`: vòng duyệt của tấm lúc bấm — 'goc' (trong gói) hoặc đợt mua thêm
--     ('dot:N' / 'mt:<uuid>', cùng khuôn 0095). Ghi để đọc lại/kiểm toán; máy chủ
--     vẫn tính đợt HIỆN TẠI của tấm từ bối cảnh ảnh chỉnh.
--   · `duyet_luc`: lúc bấm. Dấu duyệt chỉ CÒN HIỆU LỰC khi `duyet_luc` ≥ mốc
--     "Gửi khách duyệt" gần nhất của vòng đó — CSKH gửi lại (sau khi sửa) thì ba
--     mẹ xem lại từ đầu, dòng cũ tự hết hiệu lực, không cần xoá.
--   · Bỏ duyệt (ba mẹ đổi sang "Cần sửa tấm này") = XOÁ dòng.
--
-- An ninh (docs/12, AGENTS §5b, cùng khuôn 0095): RLS bật, KHÔNG policy, thu hết
-- quyền của public/anon/authenticated; chỉ service_role đọc/ghi — qua route khách
-- đã xét phiên (`requirePhienBoAnh`, chỉ người nhận link CHÍNH) và route quản trị
-- đã xét quyền xem bộ ảnh. Không tạo hàm SQL nào nên không có dòng `revoke execute`.
--
-- Chạy lại được nhiều lần: `if not exists`.
--
-- Đảo ngược:
--   drop table if exists anh_chinh_duyet_tam;
-- ============================================================================

begin;

create table if not exists anh_chinh_duyet_tam (
  gallery_id  uuid not null references galleries(id) on delete cascade,
  -- Ảnh CHỈNH ba mẹ đã duyệt (photos trong thư mục ảnh chỉnh sửa).
  photo_id    uuid not null references photos(id) on delete cascade,
  khoa        text not null default 'goc'
    check (khoa = 'goc'
           or khoa ~ '^(dot:[2-9][0-9]{0,2}|mt:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  duyet_luc   timestamptz not null default now(),
  primary key (gallery_id, photo_id)
);

comment on table anh_chinh_duyet_tam is
  'BB-401 — tấm ảnh chỉnh ba mẹ đã bấm "Duyệt tấm này". Còn hiệu lực khi duyet_luc >= mốc gửi khách '
  'gần nhất của vòng (trong gói: deliveries.anh_chinh_gui_luc; đợt mua thêm: anh_chinh_dot.gui_luc). '
  'RLS bật, không policy — chỉ service_role qua /api/g/anh-chinh-sua/duyet-tam, /api/g/anh-chinh-sua '
  'và /api/admin/galleries/[id]/anh-chinh-sua.';

alter table anh_chinh_duyet_tam enable row level security;
revoke all on table anh_chinh_duyet_tam from public, anon, authenticated;
grant all on table anh_chinh_duyet_tam to service_role;

commit;
