-- ============================================================================
-- Migration: 0061 — sản phẩm mua thêm gắn vào ẢNH CỤ THỂ
--
-- Chủ studio 22/09/2026: "ở sản phẩm hậu kỳ muốn mua thêm cần gắn với ảnh
-- chọn", và trả lời câu hỏi mua ba khung thì gán ảnh thế nào:
--
--     "Cả hai. Tuỳ từng khách: có khách in ba ảnh khác nhau, có khách in ba
--      ảnh chung một tấm hình."
--
-- Nên một dòng mua thêm = (sản phẩm, ẢNH, số lượng):
--
--   · ba bản cùng một tấm   -> MỘT dòng, photo_id = tấm đó, quantity = 3
--   · ba tấm khác nhau      -> BA dòng, mỗi dòng một photo_id, quantity = 1
--
-- ---------------------------------------------------------------------------
-- Vì sao phải gắn ảnh, nói theo việc thật
-- ---------------------------------------------------------------------------
-- Không gắn thì thợ in nhận được "1 khung gỗ 40x60" và không biết in tấm nào.
-- Đường duy nhất còn lại là CSKH gọi hỏi khách — đúng cuộc gọi mà cả app này
-- sinh ra để bỏ đi.
--
-- ---------------------------------------------------------------------------
-- Hai ràng buộc duy nhất, không phải một
-- ---------------------------------------------------------------------------
-- `photo_id` cho phép rỗng: có sản phẩm không gắn vào một tấm nào (album gộp
-- nhiều ảnh, hay dịch vụ kèm). Mà Postgres coi mỗi NULL là khác nhau, nên một
-- ràng buộc duy nhất gồm cả `photo_id` sẽ KHÔNG chặn được hai dòng cùng sản
-- phẩm khi cả hai đều rỗng ảnh. Vì vậy tách làm hai chỉ mục từng phần.
--
-- Thay cho ràng buộc của 0059 (chỉ gồm selection_id + product_id): từ nay cùng
-- một sản phẩm ĐƯỢC PHÉP có nhiều dòng, miễn khác ảnh.
-- ============================================================================

alter table selection_addons
  add column if not exists photo_id uuid references photos(id) on delete cascade;

comment on column selection_addons.photo_id is
  'Ảnh mà sản phẩm này in ra. Rỗng = sản phẩm không gắn vào một tấm cụ thể '
  '(album gộp nhiều ảnh, dịch vụ kèm). Xem migration 0061.';

create index if not exists idx_selection_addons_photo
  on selection_addons (photo_id);

drop index if exists uq_selection_addons_selection_product;

create unique index if not exists uq_selection_addons_co_anh
  on selection_addons (selection_id, product_id, photo_id)
  where photo_id is not null;

create unique index if not exists uq_selection_addons_khong_anh
  on selection_addons (selection_id, product_id)
  where photo_id is null;
