-- BB-315 (cố vấn CV-01, lỗi S1): thêm `if not exists` — đây là tệp DUY NHẤT
-- trong dãy 0045-0075 không chạy lại được. migrate-prod.mjs áp cả dãy mỗi
-- lượt (mọi tệp phải idempotent — xem đầu tệp đó); thiếu dòng này thì lượt
-- chạy thứ hai gãy ngay ở đây với "column cover_layout already exists" và mọi
-- tệp sau 0069 không bao giờ được áp lại.
alter table galleries
add column if not exists cover_layout text check (cover_layout in ('tap-chi', 'toi-gian', 'ben-canh', 'de-cheo'));
