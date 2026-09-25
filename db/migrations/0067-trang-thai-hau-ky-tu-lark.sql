-- 0067 — BB-200: app ĐỌC trạng thái hậu kỳ từ Lark, và nhớ tin nhắc đã gửi.
--
-- Spec: docs/21 (quy trình hậu kỳ & CSKH, chủ studio chốt 24–25/09/2026).
--
-- Chủ studio (docs/19 mục 3): CSKH xác nhận xong thì Lark ở "Đã Chọn Hình" —
-- bộ ảnh XẾP HÀNG chờ chỉnh, chưa ai làm. Màn khách phải nói "Bộ ảnh đã được
-- ghi nhận yêu cầu"; chỉ khi Lark chuyển "Đang làm" thì hai màn mới nói "Đang
-- chỉnh sửa". App trước nay đổi sang "Đang chỉnh ảnh" ngay lúc CSKH xác nhận,
-- vì nó không biết gì về cột Trạng Thái bên Lark.
--
-- MỘT CHIỀU: app đọc, không bao giờ ghi cột Trạng Thái hay Cảnh Báo (chủ
-- studio 24/09: "Lark đã set tự động, không cần ghi đè").
--
-- Lưu MÃ LỰA CHỌN (vd optmhzW4sL), không lưu tên: nhân viên đổi tên hiển thị
-- trên Lark bất cứ lúc nào (docs/15 §2).

alter table galleries
  add column if not exists lark_trang_thai     text,
  add column if not exists lark_canh_bao       text,
  -- Bộ ảnh ở trạng thái hiện tại TỪ LÚC NÀO — mốc tính ngày cho tin nhắc.
  -- Lark không cho biết lúc một ô đổi giá trị; app ghi khi thấy giá trị mới.
  -- Lần đầu thấy thì lấy cột ngày tương ứng của Lark (Ngày chọn ảnh, Ngày Gửi
  -- In…) nếu có, không thì lúc bản ghi được sửa gần nhất.
  add column if not exists lark_trang_thai_tu  timestamptz,
  -- Lần cuối đọc được từ Lark — để biết số liệu cũ tới đâu.
  add column if not exists lark_doc_luc        timestamptz;

comment on column galleries.lark_trang_thai is
  'Mã lựa chọn cột "Trạng Thái" bảng Hậu Kỳ trên Lark (chỉ đọc, BB-200)';
comment on column galleries.lark_canh_bao is
  'Mã lựa chọn cột "Cảnh Báo" bảng Hậu Kỳ trên Lark (chỉ đọc, BB-200)';

-- Mỗi mốc nhắc gửi MỘT lần cho mỗi bộ ảnh. Khoá chính chặn gửi trùng kể cả khi
-- hai lượt cron chạy chồng nhau.
create table if not exists lark_nhac_da_gui (
  gallery_id uuid        not null references galleries(id) on delete cascade,
  ma_nhac    text        not null,   -- vd 'da_gui_duyet'
  moc        integer     not null,   -- số ngày của mốc, vd 5
  trang_thai text        not null,   -- mã lựa chọn Lark lúc gửi
  -- Lượt vào giai đoạn này bắt đầu lúc nào (= lark_trang_thai_tu lúc gửi).
  -- Nằm trong khoá: bộ ảnh sửa xong gửi duyệt LẦN HAI là một lượt mới, các
  -- mốc 2/5/10… phải nhắc lại từ đầu chứ không bị chặn bởi lượt trước.
  dot_tu     timestamptz not null,
  gui_luc    timestamptz not null default now(),
  primary key (gallery_id, ma_nhac, moc, dot_tu)
);

-- Chỉ máy chủ (service_role) đọc/ghi. Không policy nào = anon và nhân viên
-- đăng nhập đều không thấy; service_role bỏ qua RLS.
alter table lark_nhac_da_gui enable row level security;
revoke all on table lark_nhac_da_gui from anon, authenticated;
