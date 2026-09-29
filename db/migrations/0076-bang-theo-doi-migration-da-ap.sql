-- ============================================================================
-- 0076 — Bảng theo dõi migration đã áp (BB-315, cố vấn CV-01 — lỗi chặn C1)
--
-- Đúng như brief BB-315 (đợt sửa lỗi) yêu cầu: viết tệp này nhưng KHÔNG áp —
-- người viết (Sonnet builder) không có khoá bb-prod và không được áp migration
-- lên bb-dev/bb-prod trong phạm vi task này. Áp tệp này (cùng 0051→0075 chưa
-- từng chạy trên bb-prod) là việc của lượt cắt thật, xem docs/26 bước 3.
--
-- ---------------------------------------------------------------------------
-- Vì sao cần bảng này
-- ---------------------------------------------------------------------------
-- Trước 0076, `migrate-prod.mjs` chỉ biết "đã vá xong" bằng CHÍN MỐC đo cấu
-- trúc (0045–0050) — không mốc nào canh 0051–0075. Kết quả: chạy đúng theo
-- runbook cũ trên bb-prod (đã có 0045–0050 từ 21/09), chín mốc đều `OK`,
-- script in "Không có gì phải vá" và THOÁT — 0051→0075 KHÔNG BAO GIỜ được áp.
-- Cố vấn CV-01 gọi đây là lỗi chặn C1 (xem
-- scratchpad/co-van/4-soat-runbook.md mục C1).
--
-- Bảng này cho `migrate-prod.mjs` một nguồn sự thật KHÁC: đã áp đúng TỆP nào,
-- không suy diễn qua dấu vết cấu trúc. `scripts/migrate-prod.mjs` tự đảm bảo
-- bảng này tồn tại (chạy CHÍNH câu `create table if not exists` bên dưới,
-- trước khi đọc/ghi) NGAY TỪ ĐẦU mỗi lượt — không đợi tới lúc dãy áp chạy tới
-- số 0076 — nên lượt áp ĐẦU TIÊN trên một cơ sở dữ liệu (kể cả bb-prod hôm
-- nay, đã có 0045-0050 nhưng bảng này chưa hề tồn tại) vẫn ghi lại được đúng
-- những tệp áp thành công trong CHÍNH lượt đó.
--
-- Không phải bảng nghiệp vụ — không nằm trong bất kỳ luồng đếm/xoá/nạp nào
-- của `db:nap-lai` (không có tên trong BANG_GIU_NGUYEN lẫn THU_TU_XOA — nó
-- không thuộc schema mà --dem/--xoa của nap-lai-tu-lark.mjs quan tâm, và bảng
-- này KHÔNG có trong danh sách trả về của `pg_tables` filter theo hai mảng đó
-- — thực ra nó SẼ xuất hiện trong `danhSachBangThat()` và rơi vào diện "bảng
-- MỚI chưa từng phân loại" của nap-lai-tu-lark, coi là dữ liệu nghiệp vụ sẽ bị
-- xoá. Đây là điều CHẤP NHẬN ĐƯỢC: --xoa xoá xong, migrate-prod tự tạo lại
-- bảng rỗng ở lượt chạy kế tiếp và ghi lại từ đầu — không có gì hỏng, chỉ mất
-- lịch sử theo dõi, không mất cấu trúc CSDL đã áp).
-- ============================================================================

create table if not exists public.schema_migrations (
  ten    text primary key,
  ap_luc timestamptz not null default now()
);

comment on table public.schema_migrations is
  'Theo dõi tệp trong db/migrations/ đã áp lên CHÍNH cơ sở dữ liệu này — dùng bởi scripts/migrate-prod.mjs. Không phải dữ liệu nghiệp vụ, không qua PostgREST.';

-- Bảng nội bộ cho script vận hành nối bằng SUPABASE_DB_URL (bỏ qua PostgREST
-- và RLS) — không cần anon/authenticated đọc/ghi được qua Data API.
revoke all on public.schema_migrations from public, anon, authenticated;
grant select, insert on public.schema_migrations to service_role;
