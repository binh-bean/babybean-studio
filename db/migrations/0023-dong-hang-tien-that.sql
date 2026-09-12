-- ============================================================================
-- Migration: 0023 — dòng hàng ghi được số tiền thật, không chỉ đơn giá
--
-- PM làm, khi chuẩn bị đồng bộ hợp đồng thật từ Lark xuống gallery_items.
--
-- ---------------------------------------------------------------------------
-- Lark có bốn cột tiền, và chúng không cùng một loại
-- ---------------------------------------------------------------------------
-- Đo trên 898 dòng có Số Lượng >= 2 và đủ dữ liệu:
--
--   Giá niêm yết          ĐƠN GIÁ một đơn vị
--   Thành Tiền niêm yết   = Giá niêm yết x Số Lượng   (đúng 11.163/11.163 dòng)
--   Giá sau giảm          TIỀN CẢ DÒNG sau chiết khấu (701 dòng khớp x Số Lượng,
--                         197 dòng thấp hơn vì có chiết khấu thật)
--   Giá chốt cuối         TIỀN CẢ DÒNG chốt với khách (10.934/11.693 dòng > 0)
--
-- Kiểm được bằng tay: SL=2, niêm yết 110.000, sau giảm 187.000 = 110.000 x 2
-- x 0,85. SL=20, niêm yết 25.000, sau giảm 425.000 = 25.000 x 20 x 0,85.
--
-- 0014 chỉ có unit_price. Muốn ghi số tiền thật thì phải chia ngược
-- Giá chốt cuối cho Số Lượng — và phép chia đó không phải lúc nào cũng chia
-- hết, nên tổng giá trị hợp đồng dựng lại từ đơn giá sẽ lệch vài nghìn so với
-- hóa đơn khách cầm. Vài nghìn đó là thứ khách sẽ chỉ tay vào.
--
-- Nên giữ CẢ HAI, không suy ra nhau:
--   unit_price  đơn giá niêm yết, đúng như Lark ghi
--   line_total  số tiền thật của dòng này, đúng như khách trả
--
-- Chiết khấu không cần cột riêng: nó là hiệu của hai số trên nhân số lượng.
-- ============================================================================

begin;

alter table gallery_items add column line_total numeric(12,0);

comment on column gallery_items.unit_price is
  'Đơn giá niêm yết một đơn vị, chốt lúc ký. null ở dòng thành phần.';
comment on column gallery_items.line_total is
  'Số tiền THẬT của dòng này sau chiết khấu, đúng như khách trả. Tổng giá trị '
  'hợp đồng = tổng line_total của các dòng cha. null ở dòng thành phần.';

-- Thành phần không mang tiền — mở rộng ràng buộc cũ sang cột mới.
-- Bỏ rồi tạo lại vì check constraint không sửa tại chỗ được.
alter table gallery_items drop constraint chk_component_no_price;
alter table gallery_items add constraint chk_component_no_price
  check (parent_item_id is null or (unit_price is null and line_total is null));

commit;
