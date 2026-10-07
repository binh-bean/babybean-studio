-- ============================================================================
-- 0096 — BB-380: chỉ mục cho bộ báo cáo điều hành ("Sáu con số", phễu khách, mua thêm).
--
-- VIẾT NHƯNG CHƯA ÁP. Người áp là giám đốc điều hành sau khi soát; trùng số với
-- nhánh khác thì đánh số lại.
--
-- Không BẮT BUỘC: mã báo cáo chạy y nguyên khi chưa áp (đo 06/10/2026 trên bb-dev,
-- ~500 bộ ảnh: mỗi báo cáo 1,4–2,2 s, phần lớn là độ trễ mạng). Hai chỉ mục này để
-- câu lọc "bộ gửi link trong kỳ" / "bộ chốt trong kỳ" không quét cả bảng khi số bộ
-- ảnh lên hàng nghìn (bảng chỉ có chỉ mục theo chi nhánh+trạng thái, hạn chọn, khách…).
-- Chỉ mục một phần (where … is not null): đa số bộ chưa từng gửi link qua app.
--
-- Không tạo hàm → không cần revoke (AGENTS.md §5b). Không tạo bảng mới.
-- Đảo ngược: drop index if exists idx_galleries_sent_at, idx_galleries_submitted_at;
-- Chạy lại được: if not exists.
-- ============================================================================

create index if not exists idx_galleries_sent_at
  on galleries (sent_at)
  where sent_at is not null;

create index if not exists idx_galleries_submitted_at
  on galleries (submitted_at)
  where submitted_at is not null;
