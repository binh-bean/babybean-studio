-- ============================================================================
-- Migration: 0027 — neo album vào BẢN GHI HẬU KỲ, không phải vào mã hợp đồng
--
-- BB-111. PM làm sau khi chạy thử đường ống trên toàn bộ 447 bộ sắp đẩy.
--
-- ---------------------------------------------------------------------------
-- Vì sao cần cột này
-- ---------------------------------------------------------------------------
-- Cách hiển nhiên là tạo album theo mã hợp đồng: mỗi hợp đồng một album, khớp
-- luôn với galleries.lark_contract_code đã có sẵn.
--
-- Cách đó SAI. Đếm trên nhóm 447 bộ sắp đẩy: 11 mã hợp đồng xuất hiện ở HAI
-- bản ghi Hậu Kỳ khác nhau. Một hợp đồng có thể có nhiều buổi chụp, nhiều bé,
-- nhiều lần hậu kỳ.
--
-- Nếu neo theo mã hợp đồng thì 11 mã đó thành 22 album, và vì
-- scripts/sync-lark-contracts.mjs kéo dòng hàng theo lark_contract_code, MỖI
-- album nhận ĐỦ dòng hàng của hợp đồng. Hạn mức bị đếm hai lần, studio cho
-- không gấp đôi số ảnh, và không có gì báo lỗi.
--
-- Bản ghi Hậu Kỳ mới là một-một với album: một lần hậu kỳ, một link gửi khách,
-- một lần khách chọn ảnh.
--
--   lark_hauky_record_id   khoá định danh album, duy nhất
--   lark_contract_code     chỉ để TRA CỨU hợp đồng, KHÔNG duy nhất
--
-- Hai album cùng lark_contract_code là hợp lệ và sẽ xảy ra. Script đồng bộ
-- cảnh báo khi gặp, để người chạy nhìn thấy mà kiểm.
-- ============================================================================

begin;

alter table galleries add column lark_hauky_record_id text;

-- Duy nhất, nhưng cho phép null: album do CSKH tự tạo trong app không đến từ
-- Lark và sẽ không có mã này. Postgres coi mỗi null là khác nhau nên unique
-- không cản chúng.
create unique index uq_galleries_lark_hauky
  on galleries(lark_hauky_record_id)
  where lark_hauky_record_id is not null;

comment on column galleries.lark_hauky_record_id is
  'Mã bản ghi bảng Hậu Kỳ bên Lark. Đây là khoá định danh album khi đồng bộ — '
  'KHÔNG dùng lark_contract_code cho việc đó, vì một hợp đồng có thể có nhiều '
  'bản ghi hậu kỳ và hạn mức sẽ bị đếm lặp. null = album tạo tay trong app.';

commit;
