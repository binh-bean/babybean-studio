-- 0072 — BB-245: "Mời mua lần hai khi khách duyệt không yêu cầu chỉnh lại."
--
-- Chủ studio chốt: khi ba mẹ đã DUYỆT ảnh chỉnh (status 'approved'/'delivered')
-- và bộ ảnh không có vòng xin sửa nào (review.rounds.length === 0), màn khách
-- hiện một thẻ mời mua thêm (khung, ảnh in, album). Bộ ảnh lúc này đã KHOÁ nên
-- /api/g/addons từ chối đúng luật — không nới khoá. Ba mẹ chỉ GỬI YÊU CẦU cho
-- CSKH gọi lại chốt giá/thanh toán; app không cộng tiền vào hợp đồng.
--
-- LƯU Ý ĐÁNH SỐ: 0071 chưa tồn tại trên nhánh main tại thời điểm viết migration
-- này (kiểm bằng `ls db/migrations`, mục cuối là 0070). Đặt tên 0072 theo đúng
-- số task yêu cầu; nếu 0071 xuất hiện từ một nhánh khác trước khi áp, người áp
-- migration (Opus) cần xác nhận thứ tự trong DAY của scripts/migrate-prod.mjs
-- không bị đảo.
--
-- Bảng RIÊNG, bật RLS, KHÔNG có policy nào — cùng khuôn với 0070
-- (share_link_ma): thu hết quyền của anon và authenticated, chỉ service_role
-- (máy chủ, qua route API) đọc/ghi. Route /api/g/mua-them tự kiểm quyền theo
-- phiên khách (gallery đúng, bộ ảnh đã khoá đúng luật) trước khi chạm bảng.

create table if not exists yeu_cau_mua_them (
  id          uuid primary key default gen_random_uuid(),
  gallery_id  uuid not null references galleries(id) on delete cascade,
  product_id  uuid not null references products(id),
  photo_id    uuid references photos(id) on delete set null,

  so_luong    int  not null check (so_luong between 1 and 20),
  ghi_chu     text check (ghi_chu is null or char_length(ghi_chu) <= 500),

  -- 'moi' = vừa gửi, chờ CSKH liên hệ. Chống spam kiểm ở API: tối đa 10 dòng
  -- 'moi' cho một bộ ảnh — không kiểm bằng constraint vì đếm điều kiện theo
  -- trạng thái, Postgres không cho check constraint tham chiếu bảng khác.
  trang_thai  text not null default 'moi'
    check (trang_thai in ('moi', 'da_lien_he', 'da_chot', 'huy')),

  created_at  timestamptz not null default now()
);

create index if not exists idx_yeu_cau_mua_them_gallery
  on yeu_cau_mua_them(gallery_id);

alter table yeu_cau_mua_them enable row level security;
revoke all on table yeu_cau_mua_them from anon, authenticated;

comment on table yeu_cau_mua_them is
  'BB-245 — yêu cầu mua thêm sau khi khách DUYỆT ảnh (bộ ảnh đã khoá). Ba mẹ '
  'gửi yêu cầu, CSKH gọi lại chốt giá/thanh toán; KHÔNG cộng vào hợp đồng. '
  'RLS bật, không policy — chỉ service_role đọc/ghi qua /api/g/mua-them và '
  '/api/admin/galleries/[id]/mua-them.';

comment on column yeu_cau_mua_them.trang_thai is
  ''''moi'' = vừa gửi; ''da_lien_he''/''da_chot''/''huy'' dành cho CSKH cập '
  'nhật tay về sau (BB-245 chưa dựng route đổi trạng thái).';
