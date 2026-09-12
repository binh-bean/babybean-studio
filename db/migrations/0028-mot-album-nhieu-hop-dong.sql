-- ============================================================================
-- Migration: 0028 — một album có thể gom nhiều hợp đồng
--
-- Sửa mô hình sau khi chủ studio giải thích dữ liệu thật, ngày 12.09.2026.
--
-- ---------------------------------------------------------------------------
-- Chuyện gì xảy ra
-- ---------------------------------------------------------------------------
-- 0027 neo album vào BẢN GHI HẬU KỲ, vì 11 mã hợp đồng xuất hiện ở hai bản ghi
-- hậu kỳ khác nhau. Neo như vậy chặn được việc đếm lặp hạn mức.
--
-- Nhưng nó lại làm lộ chuyện ngược lại: 12 THƯ MỤC DRIVE đang bị hai bản ghi
-- hậu kỳ dùng chung, và ràng buộc uq_galleries_drive_folder chặn bản ghi thứ
-- hai. 17 bộ không vào được.
--
-- Chủ studio giải thích từng trường hợp:
--
--   HD_...#3556 + HD_...#3557   MỘT nhà, MỘT buổi chụp, hai gói chụp khác
--                               nhau nên lập hai hóa đơn
--   HD_...#4260 hai lần         đã xử lý xong bên Lark
--   HD_...#4487 + #4515         nhân viên điền sai, để nhân viên sửa sau
--
-- Trường hợp đầu mới là điều quan trọng: KHÁCH ĐÓ CHỈ THẤY MỘT THƯ MỤC ẢNH, và
-- hạn mức của họ là TỔNG hai hợp đồng. Tách thành hai album là chia đôi hạn
-- mức của chính khách — họ mua 15 + 15 ảnh nhưng mỗi màn hình chỉ cho chọn 15,
-- và ảnh thì trùng nhau vì cùng một thư mục.
--
-- ---------------------------------------------------------------------------
-- Mô hình đúng
-- ---------------------------------------------------------------------------
-- Đơn vị khách nhìn thấy là THƯ MỤC ẢNH, không phải bản ghi hậu kỳ, cũng không
-- phải hợp đồng. Một thư mục = một album = một lần khách chọn ảnh.
--
--   drive_folder_id        KHOÁ ĐỊNH DANH album (đã unique từ trước)
--   lark_contract_codes    MỌI hợp đồng đổ vào album này
--   lark_contract_code     phần tử đầu, giữ cho chỗ hiển thị và mã cũ
--   lark_hauky_record_id   bản ghi hậu kỳ đầu tiên, để tra cứu — THÔI UNIQUE
--
-- Hạn mức tự khắc đúng: app.gallery_quota() cộng phẳng mọi dòng edited_photo
-- của album, và sync:contracts đổ dòng hàng của CẢ HAI hợp đồng vào đó.
--
-- Ràng buộc chk_contract_code_first giữ hai cột khỏi nói khác nhau — đúng bài
-- học "hai tên cho một giá trị là hai chỗ để lệch nhau" ở 0022.
-- ============================================================================

begin;

alter table galleries add column lark_contract_codes text[] not null default '{}';

comment on column galleries.lark_contract_codes is
  'Mọi mã hợp đồng đổ dòng hàng vào album này. Một nhà chụp một buổi nhưng mua '
  'hai gói thì có hai hóa đơn, chung một thư mục ảnh, và hạn mức là TỔNG.';

-- Điền cho các album đã nhập: mỗi album một mã như hiện tại.
update galleries
   set lark_contract_codes = array[lark_contract_code]
 where lark_contract_code is not null and lark_contract_code <> '';

alter table galleries add constraint chk_contract_code_first
  check (
    lark_contract_codes = '{}'::text[]
    or lark_contract_code = lark_contract_codes[1]
  );

-- Một album gom nhiều bản ghi hậu kỳ, nên cột này thôi làm khoá định danh.
-- drive_folder_id vẫn unique và giữ vai trò đó.
drop index if exists uq_galleries_lark_hauky;

comment on column galleries.lark_hauky_record_id is
  'Bản ghi hậu kỳ ĐẦU TIÊN đổ vào album này, để tra ngược sang Lark. KHÔNG '
  'phải khoá định danh — nhiều bản ghi hậu kỳ có thể chung một thư mục ảnh. '
  'Khoá định danh là drive_folder_id.';

create index idx_galleries_lark_hauky on galleries(lark_hauky_record_id);

commit;
