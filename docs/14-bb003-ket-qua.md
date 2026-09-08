# 14 — BB-003: kết quả áp schema lên `bb-dev`

Ngày: 2026-09-08 · Môi trường: `bb-dev` (`ap-southeast-1` Singapore)

## 1. Đã làm gì

| Bước | Cách làm | Kết quả |
|---|---|---|
| Áp `db/schema.sql` + `db/policies.sql` | Dán vào Supabase SQL Editor, bọc trong một transaction | Thành công, không lỗi |
| Cấp quyền cho `service_role` | SQL bổ sung, chạy sau | Thành công |

**SQL chạy đúng ngay lần đầu.** Không phải sửa câu lệnh nào — dự đoán trước đó của tôi (sẽ có lỗi cú pháp) đã sai theo hướng tốt.

## 2. Kết quả kiểm chứng

Kiểm bằng REST API với hai khoá, không dùng kết nối Postgres trực tiếp.

### 2.1 Cấu trúc

| Mục | Kết quả |
|---|---|
| Bảng truy cập được bằng `service_role` | **17/17** |
| View `v_gallery_progress`, `v_share_links` | HTTP 200, cả hai |

### 2.2 Khoá publishable (khoá gửi xuống trình duyệt)

| Bảng | HTTP | Kết luận |
|---|---|---|
| `galleries` | 401 | bị từ chối |
| `photos` | 401 | bị từ chối |
| `customers` | 401 | bị từ chối |
| `share_links` | 401 | bị từ chối |
| `activity_logs` | 401 | bị từ chối |

Xác nhận **"Automatically expose new tables" đã tắt đúng**. Không bảng nào lộ ra API công khai.

### 2.3 RLS — kiểm bằng người dùng thật

Tạo một tài khoản thật qua Auth admin API, đăng nhập lấy JWT thật, rồi gọi PostgREST bằng token đó. Đây là **đúng đường mà ứng dụng sẽ đi**, chặt hơn `set role` trong psql.

Người dùng này đã đăng nhập (vai `authenticated`) nhưng **chưa có `staff_profiles`**:

| Bảng | HTTP | Số dòng thấy được | Kết luận |
|---|---|---|---|
| `branches` | 200 | 0 | RLS lọc đúng |
| `customers` | 200 | 0 | RLS lọc đúng |
| `galleries` | 200 | 0 | RLS lọc đúng |
| `photos` | 200 | 0 | RLS lọc đúng |
| `activity_logs` | 200 | 0 | RLS lọc đúng |

HTTP 200 kèm 0 dòng là kết quả **đúng**: quyền bảng có (nên không lỗi 403), nhưng policy lọc sạch. Nếu ra 403 nghĩa là thiếu grant; nếu ra dữ liệu nghĩa là RLS thủng. Không rơi vào cả hai.

Có một dòng `branches` thật trong bảng lúc kiểm, nên "0 dòng" là do policy lọc, không phải vì bảng rỗng.

| Phép thử ghi | HTTP | Kết luận |
|---|---|---|
| `INSERT` vào `selection_items` | 403 | Bị chặn đúng — quy tắc "không ai sửa lựa chọn của khách" (`docs/05-rbac.md §2`) hoạt động |

Dữ liệu và tài khoản kiểm thử đã xoá sau khi chạy.

## 3. Lỗi phát hiện trong scaffold và đã sửa

### 3.1 Thiếu grant cho `service_role`

`db/policies.sql` chỉ cấp quyền cho `authenticated`, quên `service_role`. Hậu quả nếu không phát hiện: **toàn bộ đường đi của khách hàng hỏng** — mọi request qua `createAdminClient()` trả `permission denied for table ...`, một lỗi trông không giống lỗi RLS chút nào và rất mất thời gian để lần ra.

Nguyên nhân gốc: Supabase bình thường tự cấp quyền cho bảng mới, nhưng dự án này **cố ý tắt** "Automatically expose new tables". Đó là lựa chọn đúng, nhưng nó có nghĩa là **mọi vai trò đều phải được cấp quyền tường minh** — tôi viết ra cảnh báo đó trong `docs/11-deployment.md §1b` rồi lại quên áp cho `service_role`.

Đã thêm vào cuối `db/policies.sql`, kèm `alter default privileges` để bảng do migration sau này tạo ra không lặp lại lỗi này.

### 3.2 Script `node` không nạp `.env.local`

Next.js tự nạp, script chạy thẳng bằng `node` thì không. `db:push`, `db:seed`, `drive:sync`, `db:backup` giờ đều kèm `--env-file-if-exists=.env.local`.

### 3.3 Bản giao việc thiếu cách kết nối

BB-003 ban đầu chỉ nói "áp schema lên bb-dev" mà không nói kết nối bằng cách nào. Agent phải tự đoán, thử Supabase CLI rồi `psql`, tốn ba vòng phê duyệt. Đã bổ sung `docs/11-deployment.md §1c`.

## 4. Còn tồn đọng

| Việc | Trạng thái |
|---|---|
| `scripts/db-push.mjs` | Agent đã viết, **chưa chạy thử được** vì `SUPABASE_DB_URL` chưa xác thực — xem `tasks/BLOCKERS.md` |
| Seed dữ liệu mẫu | BB-008, chưa làm |
| 6 test phủ định đầy đủ trong `tests/security/` | BB-054; hiện mới kiểm thủ công các ca quan trọng nhất |

**Không việc nào trong số này chặn Phase 0.** Schema đã có, RLS đã đúng, các task phụ thuộc (BB-006, BB-007, BB-008, BB-020) mở khoá được.

## 5. Bài học cho các task sau

1. **Quyền và policy là hai lớp khác nhau.** Postgres kiểm quyền trước. Một RLS policy viết hoàn hảo vẫn vô dụng nếu vai trò không có quyền bảng — và thông báo lỗi sẽ không nói gì về RLS.
2. **Tắt auto-expose là đánh đổi.** An toàn hơn, nhưng mọi vai trò phải cấp tay. Mỗi migration thêm bảng phải thêm grant cho cả `authenticated` lẫn `service_role`.
3. **Giao việc thiếu phương pháp thì agent sẽ tự chọn phương pháp.** Nếu có một cách đúng duy nhất, phải nói ra, kèm lý do loại các cách khác.
