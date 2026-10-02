-- 0089 — BB-357: gọn chỉ mục bảng `photos` (dựng lại, KHÔNG bỏ chỉ mục nào).
--
-- VIẾT NHƯNG CHƯA ÁP (02/10/2026). Người áp: chủ dự án / PM, sau khi duyệt.
-- Nên áp lúc vắng khách (đêm): REINDEX thường (không CONCURRENTLY — migrate-prod
-- chạy mỗi tệp trong MỘT giao dịch) khoá ghi `photos` và khoá đọc qua chỉ mục
-- đang dựng trong lúc chạy. Đo trên bb-dev 156k dòng: dựng cả 4 chỉ mục từ đầu
-- mất vài giây.
--
-- Đo trên bb-dev ngày 02/10/2026 (pg_stat_user_indexes, thống kê từ 25/08):
--
--   chỉ mục                       cỡ nay   idx_scan   dựng mới   đề xuất
--   uq_photos_gallery_drive        22 MB       990     11,5 MB   GIỮ (khoá trùng của đồng bộ Drive) + dựng lại
--   idx_photos_gallery_sort        14 MB   154 225      6,1 MB   GIỮ (màn khách phân trang theo sort_index) + dựng lại
--   photos_pkey                   7,5 MB   250 350      4,7 MB   GIỮ (khoá chính, 5 khoá ngoại trỏ vào) + dựng lại
--   idx_photos_gallery_subfolder  2,3 MB   107 578      1,1 MB   GIỮ (lọc theo thư mục con) + dựng lại
--   tổng                          ~45 MB               ~23 MB   → tiết kiệm ~22 MB
--
-- "Dựng mới" = cỡ đo thật khi dựng chính chỉ mục đó trên bản sao tạm của bảng
-- (temp table, rollback) — không phải ước lượng bằng công thức.
--
-- Vì sao phình gấp đôi: bảng `photos` trên bb-dev đã có 495k dòng chèn và 339k
-- dòng xoá (nạp sạch + nạp lại từ Lark nhiều lần). B-tree không tự co trang đã
-- rỗng một nửa. Không chỉ mục nào thừa: cả 4 đều được quét, và không cái nào
-- là tiền tố của cái khác (ba cái chung cột đầu gallery_id nhưng cột thứ hai
-- phục vụ ba câu hỏi khác nhau). Chỉ mục một phần cho subfolder (`where
-- subfolder is not null`) đo ra không nhỏ hơn (97% dòng có subfolder) → không đổi.
--
-- KHÔNG đụng định nghĩa `uq_photos_gallery_drive`: đồng bộ Drive dựa vào nó để
-- không bao giờ có hai dòng cùng một tệp Drive trong một bộ.
--
-- Không có hàm nào được tạo, nên không có dòng revoke (AGENTS.md §5b).
-- Đảo ngược: không cần (REINDEX không đổi định nghĩa, chỉ đổi cách xếp trang).
-- Chạy lại vô hại (chỉ tốn vài giây).

reindex index uq_photos_gallery_drive;
reindex index idx_photos_gallery_sort;
reindex index photos_pkey;
reindex index idx_photos_gallery_subfolder;
