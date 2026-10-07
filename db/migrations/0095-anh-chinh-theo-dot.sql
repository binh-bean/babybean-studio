-- ============================================================================
-- 0095 — BB-377: ảnh chỉnh sửa của ảnh MUA THÊM đi trọn vòng duyệt, theo từng đợt
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát. Chưa áp thì
-- app chạy như BB-371: một mốc gửi chung cho cả bộ, ảnh mua thêm chỉ được GẮN
-- NHÃN đợt (màn khách/quản trị), CSKH gửi chung cả bộ, khách quyết chung cả bộ.
-- Mã dò bảng/cột trước khi dùng (`coBangTheoDot`, du-lieu.ts) — không 500.
--
-- Anh 06/10/2026: "App dụng thêm logic vào cả phần ảnh gia đình chọn mua thêm."
--
-- ---------------------------------------------------------------------------
-- Vì sao cần bảng
-- ---------------------------------------------------------------------------
-- Ảnh mua thêm (đợt chọn BB-321 / yêu cầu chỉnh sửa người thân BB-345) thường về
-- SAU khi bộ đã duyệt hoặc đã giao. Vòng BB-371 dùng trạng thái bộ ảnh + một mốc
-- gửi chung (`deliveries.anh_chinh_gui_luc`): không gửi được khi bộ đã duyệt, và
-- kéo bộ về "chờ duyệt" thì hỏng trạng thái in/giao của ảnh trong gói. Mỗi đợt mua
-- thêm cần mốc gửi + mốc duyệt RIÊNG, và vòng xin sửa phải biết thuộc đợt nào.
--
--   · `anh_chinh_dot`: một dòng cho mỗi (bộ, đợt mua thêm). Khoá đợt:
--       'dot:<N>'          — đợt chọn thêm N (selection_rounds.so_dot, N ≥ 2)
--       'mt:<uuid>'        — yêu cầu chỉnh sửa của người thân (yeu_cau_mua_them.id)
--     Ảnh TRONG GÓI không có dòng ở đây — vẫn đi vòng BB-371.
--   · `revision_requests.dot_khoa`: null = vòng trong gói (mọi dòng cũ); có giá trị
--     = vòng xin sửa của đợt mua thêm đó. Lần sửa (`round`) vẫn đếm theo BỘ: dòng
--     Hậu Kỳ bên Lark chỉ có một cột Trạng Thái ("Sửa" / "Sửa lần 2, 3, 4"), đợt mua
--     thêm không có dòng Hậu Kỳ riêng.
--
-- An ninh (AGENTS §5b, cùng khuôn 0072/0077/0083): bảng mới bật RLS, KHÔNG policy,
-- thu hết quyền của anon/authenticated; chỉ service_role (route API) đọc/ghi.
-- Không tạo hàm SQL nào nên không có dòng `revoke execute`.
--
-- Chạy lại được nhiều lần: `if not exists`.
--
-- Đảo ngược:
--   drop table if exists anh_chinh_dot;
--   alter table revision_requests drop column if exists dot_khoa;
--
-- Sau khi áp: ảnh mua thêm ĐÃ gửi chung trước đó (qua mốc chung) sẽ ẩn với khách
-- cho tới khi CSKH bấm "Gửi khách duyệt <đợt>" — hàng đợi Việc cần xử lý sẽ báo.
-- Đo trước khi áp (06/10): chưa bộ nào có vòng sửa mua thêm trong app.
-- ============================================================================

create table if not exists anh_chinh_dot (
  gallery_id  uuid not null references galleries(id) on delete cascade,
  khoa        text not null
    check (khoa ~ '^(dot:[2-9][0-9]{0,2}|mt:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$'),
  -- Lúc CSKH bấm "Gửi khách duyệt" đợt này gần nhất. Tấm chỉnh tạo SAU mốc này chờ lượt gửi sau.
  gui_luc     timestamptz,
  -- Lúc ba mẹ duyệt đợt này. Gửi lại (có ảnh mới) thì về null.
  duyet_luc   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (gallery_id, khoa)
);

alter table anh_chinh_dot enable row level security;
revoke all on table anh_chinh_dot from public, anon, authenticated;
grant all on table anh_chinh_dot to service_role;

comment on table anh_chinh_dot is
  'BB-377 — vòng duyệt ảnh chỉnh của từng đợt MUA THÊM (dot:N = selection_rounds, mt:<id> = yeu_cau_mua_them). '
  'Ảnh trong gói không có dòng ở đây. RLS bật, không policy — chỉ service_role qua /api/g/review, '
  '/api/g/anh-chinh-sua và /api/admin/galleries/[id]/anh-chinh-sua/*.';

alter table revision_requests
  add column if not exists dot_khoa text
    check (dot_khoa is null or dot_khoa ~ '^(dot:[2-9][0-9]{0,2}|mt:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$');

comment on column revision_requests.dot_khoa is
  'BB-377 — null = vòng xin sửa ảnh trong gói (BB-121/BB-371); có giá trị = vòng của đợt mua thêm đó '
  '(cùng khoá với anh_chinh_dot.khoa). round vẫn đếm theo cả bộ (một cột Trạng Thái Hậu Kỳ bên Lark).';

create index if not exists idx_revision_requests_dot_mo
  on revision_requests (gallery_id, dot_khoa)
  where resolved_at is null and dot_khoa is not null;
