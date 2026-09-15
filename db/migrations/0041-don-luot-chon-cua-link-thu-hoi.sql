-- BB-148: Dọn dữ liệu đang kẹt
-- Xoá những lượt chọn mang cờ is_primary mà thuộc về link đã thu hồi
-- và chưa có ảnh nào được chọn.
-- Việc này dọn dẹp các lượt chọn rác sinh ra khi link vừa tạo bị thu hồi ngay.

DELETE FROM selections s
WHERE s.is_primary = true
  AND EXISTS (
    SELECT 1 FROM share_links sl
    WHERE sl.id = s.share_link_id
      AND sl.status = 'revoked'
  )
  AND NOT EXISTS (
    SELECT 1 FROM selection_items si
    WHERE si.selection_id = s.id
  );
