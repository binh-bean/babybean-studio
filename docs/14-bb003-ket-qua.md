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

### 2.4 Sáu test phủ định — chạy bằng kết nối Postgres trực tiếp

Tạo 2 chi nhánh, 2 nhân sự thật (một `cs` ở CN A, một `photographer` ở CN B), rồi giả lập từng vai bằng `set local role authenticated` cộng `request.jwt.claims`.

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | `cs` chi nhánh A đọc album chi nhánh B | 0 dòng — RLS lọc đúng |
| 2 | `photographer` UPDATE `customers` | **HỎNG lần đầu — sửa được 1 dòng** → xem §3.4 |
| 3 | Nhân viên UPDATE `selection_items` | permission denied |
| 4 | Nhân viên tự nâng mình lên `owner` | vi phạm RLS policy |
| 5 | `anon` SELECT `galleries` | permission denied |
| 6 | `cs` DELETE `activity_logs` | permission denied |
| 7 | `cs` sửa khách của **chính chi nhánh mình** | sửa 1 dòng — quyền hợp lệ không bị cắt nhầm |

Sau khi vá: **7/7 đạt**. Toàn bộ dữ liệu và tài khoản kiểm thử đã xoá;  hiện rỗng.

Dữ liệu và tài khoản kiểm thử đã xoá sau khi chạy.

## 3. Lỗi phát hiện trong scaffold và đã sửa

### 3.1 Thiếu grant cho `service_role`

`db/policies.sql` chỉ cấp quyền cho `authenticated`, quên `service_role`. Hậu quả nếu không phát hiện: **toàn bộ đường đi của khách hàng hỏng** — mọi request qua `createAdminClient()` trả `permission denied for table ...`, một lỗi trông không giống lỗi RLS chút nào và rất mất thời gian để lần ra.

Nguyên nhân gốc: Supabase bình thường tự cấp quyền cho bảng mới, nhưng dự án này **cố ý tắt** "Automatically expose new tables". Đó là lựa chọn đúng, nhưng nó có nghĩa là **mọi vai trò đều phải được cấp quyền tường minh** — tôi viết ra cảnh báo đó trong `docs/11-deployment.md §1b` rồi lại quên áp cho `service_role`.

Đã thêm vào cuối `db/policies.sql`, kèm `alter default privileges` để bảng do migration sau này tạo ra không lặp lại lỗi này.

### 3.4 Thợ ảnh sửa được hồ sơ khách hàng — lỗ hổng phân quyền

Test phủ định số 2 bắt được: một `photographer` UPDATE thành công một dòng trong `customers`, trong khi `docs/05-rbac.md §2` cho vai này quyền **đọc**, không phải sửa.

Nguyên nhân: `app.can_write()` gộp `photographer` vào nhóm được ghi — đúng, vì thợ ảnh cần tạo album và đồng bộ ảnh. Nhưng policy của `customers` và `babies` dùng chung hàm đó, nên quyền bị cấp lây sang dữ liệu khách hàng.

Đây là leo thang quyền trong nội bộ: thợ ảnh sửa được số điện thoại, ghi chú, thậm chí tên của khách ở chi nhánh mình — không ai phát hiện được vì hành động đó trông hợp lệ.

Sửa bằng `db/migrations/0001-fix-customer-write-permission.sql`: tách thành hai vị từ.

| Hàm | Dùng cho | Có `photographer`? |
|---|---|---|
| `app.can_write()` | album, ảnh, buổi chụp | có |
| `app.can_manage_customers()` | khách hàng, bé | **không** |

Kiểm lại sau khi vá: test 2 đạt, và test 7 xác nhận `cs` vẫn sửa được khách của chi nhánh mình — bản vá không cắt nhầm quyền hợp lệ.

**Bài học**: một vị từ quyền dùng chung cho nhiều loại dữ liệu sẽ rò quyền giữa các loại đó. Mỗi nhóm dữ liệu có ma trận quyền riêng thì phải có vị từ riêng.

### 3.2 Script `node` không nạp `.env.local`

Next.js tự nạp, script chạy thẳng bằng `node` thì không. `db:push`, `db:seed`, `drive:sync`, `db:backup` giờ đều kèm `--env-file-if-exists=.env.local`.

### 3.3 Bản giao việc thiếu cách kết nối

BB-003 ban đầu chỉ nói "áp schema lên bb-dev" mà không nói kết nối bằng cách nào. Agent phải tự đoán, thử Supabase CLI rồi `psql`, tốn ba vòng phê duyệt. Đã bổ sung `docs/11-deployment.md §1c`.

## 4. Còn tồn đọng

| Việc | Trạng thái |
|---|---|
| `scripts/db-push.mjs` | Agent đã viết, chưa chạy thử. `SUPABASE_DB_URL` **đã thông** — kiểm được rồi |
| Seed dữ liệu mẫu | BB-008, chưa làm |
| Tự động hoá 7 test phủ định vào `tests/security/` | BB-054 — hiện đã chạy thủ công, đạt 7/7 |

**Không việc nào trong số này chặn Phase 0.** Schema đã có, RLS đã đúng, các task phụ thuộc (BB-006, BB-007, BB-008, BB-020) mở khoá được.

## 5. Bài học cho các task sau

1. **Quyền và policy là hai lớp khác nhau.** Postgres kiểm quyền trước. Một RLS policy viết hoàn hảo vẫn vô dụng nếu vai trò không có quyền bảng — và thông báo lỗi sẽ không nói gì về RLS.
2. **Tắt auto-expose là đánh đổi.** An toàn hơn, nhưng mọi vai trò phải cấp tay. Mỗi migration thêm bảng phải thêm grant cho cả `authenticated` lẫn `service_role`.
3. **Giao việc thiếu phương pháp thì agent sẽ tự chọn phương pháp.** Nếu có một cách đúng duy nhất, phải nói ra, kèm lý do loại các cách khác.
