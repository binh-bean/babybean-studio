# Migrations

`../schema.sql` is a full snapshot, used only when standing up a new project.
Every change after that lives here as its own file.

- Name: `0001-add-lark-record-id.sql` — four digits, then a short slug.
- Forward-only. No automatic down migrations.
- Must stay backwards compatible for one release, so rolling the code back does
  not break the database. Renames and drops take two releases:
  1. add the new column, write to both;
  2. next release, drop the old one.
- Order of operations: staging → verify → production → **then** deploy the code
  that depends on it.
- Only ARCH and DEV-BE write here, and only after an approved ADR.

## Số bị bỏ trống (đừng đi tìm)

**0078 và 0084 không tồn tại.** Không có tệp nào bị mất theo `git log`/bảng
`schema_migrations`; lý do bỏ trống không được ghi lại ở đâu (đo 01/10/2026). Công cụ
`migrate-prod` đọc thư mục động và bảng `schema_migrations` ghi tên TỆP, nên
khoảng trống không gây lỗi. Thêm migration mới thì lấy số kế tiếp sau số lớn
nhất đang có, không lấp vào khoảng trống.

Mỗi bảng mới tạo ở đây cũng phải được ghi vào `PHAN_LOAI_BANG` trong
`scripts/nap-lai-tu-lark.mjs` (giữ / nạp lại từ Lark / xoá dữ liệu thử) — phép
thử `tests/unit/bb-352-nap-lai-phan-loai-bang.test.ts` đỏ nếu quên.
