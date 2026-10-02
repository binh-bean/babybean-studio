-- 0086 — BB-351: khoá chống ghi trùng cho sổ thu tiền `gallery_payments`.
--
-- VIẾT NHƯNG CHƯA ÁP (01/10/2026). Người áp: chủ dự án / PM, sau khi duyệt.
--
-- Vì sao: CSKH bấm đúp "Ghi nhận đã thu" (hoặc mạng gửi lại) là sổ có HAI dòng cho MỘT khoản
-- (vòng 7, người soát C, mục f6). Form nay sinh một `requestId` cho mỗi lần ghi; cột dưới đây
-- giữ mã đó, chỉ mục duy nhất làm Postgres tự chặn dòng thứ hai cùng mã — kể cả khi hai lần
-- bấm chạy song song (lưới đỡ 15 giây trong route không chặn được trường hợp đó).
--
-- Route `/api/admin/galleries/[id]/payments` chạy được cả TRƯỚC khi áp: thiếu cột thì bỏ qua
-- lớp này, chỉ dùng lưới đỡ "cùng người, cùng số, cùng hình thức trong 15 giây".
--
-- Một lần ghi có thể ra HAI dòng (dòng giảm giá + dòng tiền) cùng mã, nên chỉ mục gồm cả
-- `payment_method`.
--
-- Đảo ngược:
--   drop index if exists uq_gallery_payments_ma_yeu_cau;
--   alter table gallery_payments drop column if exists ma_yeu_cau;

alter table gallery_payments add column if not exists ma_yeu_cau text;

comment on column gallery_payments.ma_yeu_cau is
  'BB-351 — mã do form sinh cho mỗi lần ghi (chống bấm đúp). Null với các dòng cũ.';

create unique index if not exists uq_gallery_payments_ma_yeu_cau
  on gallery_payments (gallery_id, ma_yeu_cau, payment_method)
  where ma_yeu_cau is not null;

-- Không tạo hàm nào trong tệp này (AGENTS.md §5b: không có hàm mới → không cần dòng revoke).
