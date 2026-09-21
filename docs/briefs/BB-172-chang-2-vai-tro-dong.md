# BB-172 chặng 2a — Vai trò động: lớp cơ sở dữ liệu

**Hai cửa sổ cùng làm việc này.** Ai làm phần nào ghi rõ ở bảng dưới — đọc bảng
trước khi gõ dòng mã đầu tiên.

| Cửa sổ | Thư mục | Nhánh | Phần việc |
|---|---|---|---|
| **KIẾN TRÚC (ARCH)** | `babybean-arch` | `agent/arch` | Bảng `roles`, migration tạo bảng + nạp vai trò hệ thống, kiểu dữ liệu ở `src/types/domain.ts`, hợp đồng API ghi vào `docs/04-api-spec.md` |
| **BẢO MẬT (SEC-ARCH)** | `babybean-sec-arch` | `agent/sec-arch` | `db/policies.sql` + migration viết lại các hàm `app.*`, và chạy trọn bộ 14 bài kiểm ở `docs/05-rbac.md §6` |

**Trước khi bắt đầu, cả hai cửa sổ:** `git fetch && git merge origin/main`.

**KHÔNG cửa sổ nào làm màn hình hay API trong chặng này.** Màn Vai trò và đường
`/api/admin/roles` là chặng 2b, của DEV-FE và DEV-BE, giao sau.

---

## Việc này đã có quyết định rồi — đọc trước khi thiết kế lại

`docs/adr/ADR-0007-quan-ly-vai-tro-dong.md` đã chốt ngày 17/09, chặng 1 đã xong:

- **Phương án C**: bảng `roles (id, name, permissions text[], is_system boolean)`,
  `staff_profiles` trỏ sang bằng `role_id`.
- **Quyền vẫn kiểm ở RLS**, không dời lên tầng ứng dụng. Đổi từ
  `role in ('admin','owner')` sang `app.has_permission('galleries:write')`.
- **Cứng hoá tên QUYỀN, không cứng hoá tên VAI TRÒ.** Ví dụ `galleries:write`,
  `customers:manage`, `settings:manage`.
- **`owner` bất biến**: `is_system = true`, chặn `update`/`delete` ở cả trigger
  lẫn API. Chủ studio không bao giờ tự nhốt mình ngoài hệ thống được.
- Mọi thay đổi vai trò ghi vào `activity_logs`, kèm **quyền cũ và quyền mới**,
  không chỉ ghi "đã sửa vai trò".

Không mở lại bốn quyết định đó. Thấy sai chỗ nào thì ghi một dòng vào
`tasks/BLOCKERS.md` và dừng, đừng tự đổi hướng.

## Vì sao việc này nguy hiểm hơn mọi việc khác trong dự án

Lớp RLS **chính là** thứ giữ cho nhân viên Pasteur không đọc được album của Gò
Vấp. Chặng này viết lại đúng lớp đó, trên một app **đang chạy thật với 457 nhà
và 427 khách**.

Sáu hàm trong `db/policies.sql` sẽ bị đụng: `app.my_role`, `app.is_superuser`,
`app.my_branches`, `app.can_see_branch`, `app.can_write`,
`app.can_manage_customers`. ADR ước lượng 10–15 chính sách lệ thuộc vào chúng —
**lệ thuộc gián tiếp cũng tính**, và đó là chỗ dễ sót nhất.

Nên chặng này có một luật riêng: **không có bước nào được coi là xong nếu chưa
có một phép thử ĐỎ khi luật quyền bị hỏng.** Xanh không chứng minh gì cả.

## ARCH — phần của bạn

1. Migration tạo `roles`, nạp các vai trò hệ thống hiện có (`docs/05-rbac.md §2`)
   với đúng bộ quyền chúng đang có hôm nay — **không nhân dịp này đổi quyền của
   ai**. Chặng 2 là đổi cách lưu, không phải đổi ai được làm gì.
2. `staff_profiles.role_id`, và giữ cột `role` cũ **song song một nhịp phát
   hành** — `db/migrations/README.md`: đổi tên hay bỏ cột phải đi hai chặng, để
   hoàn nguyên mã không làm gãy cơ sở dữ liệu.
3. `src/types/domain.ts` khớp với schema mới.
4. Danh sách tên quyền chốt lại, viết vào `docs/04-api-spec.md`. Đây là thứ
   DEV-FE sẽ dựng ô tích chọn từ đó, nên tên phải đọc hiểu được bằng tiếng người.

## SEC-ARCH — phần của bạn

1. `app.has_permission(p text)` — `SECURITY DEFINER`, ghim `search_path`, và
   **kèm dòng `revoke` ngay sau `create`** (`AGENTS.md §5b`). 0047 đã quên đúng
   dòng đó và để PUBLIC gọi được một hàm `SECURITY DEFINER`; 0048 phải dọn.
2. Viết lại sáu hàm `app.*` để đi qua `has_permission`.
3. Trigger chặn `update`/`delete` lên dòng `is_system = true`.
4. `db/policies.sql` **và** migration tương ứng — sửa một bên là `verify:own`
   chặn.
5. Chạy trọn **14 bài kiểm** ở `docs/05-rbac.md §6`, cộng cả tám tệp trong
   `tests/security/`.

## Tiêu chí xong — cả hai cửa sổ

- [ ] `npm run typecheck`, `npm run lint` — **dán mã thoát**, không dán lời kể.
- [ ] `npm run test` — **368/368** cộng ca mới, dán mã thoát.
- [ ] `npm run verify:db` — **17/17**, dán mã thoát.
- [ ] `npm run verify:own` — dán mã thoát.
- [ ] 14 bài ở `docs/05-rbac.md §6` — dán bảng kết quả từng bài.

**Kiểm ngược, bắt buộc** (`AGENTS.md §5a`), làm thật và dán cả hai kết quả:

1. Gỡ một quyền khỏi một vai trò → phép thử canh quyền đó phải **ĐỎ**.
2. Làm hỏng lớp chặn chi nhánh → bài kiểm số 1 ở `docs/05-rbac.md §6` phải
   **ĐỎ**.

Phép thử phải đỏ **vì đúng lý do nó nói là canh**. Chiều 21/09 reviewer bắt được
một ca "bắt buộc" xanh cả khi bỏ bản vá, chỉ vì bảng giả thiếu một hàm nên mã nổ
ra đúng mã lỗi mà ca đó đang chờ. Và trước đó, một phép thử RBAC từng xanh kể cả
khi luật quyền hỏng, vì nó neo nhầm chi nhánh.

## Một điều phải biết

`bb-dev` chứa dữ liệu khách **thật** (`AGENTS.md §6`). `bb-prod` vừa được vá
ngang bằng `bb-dev` hôm 21/09 (`docs/18 §2.0`) — migration nào viết ở chặng này
cũng phải **chạy lại được nhiều lần mà kết quả không đổi**, vì nó sẽ được áp lên
bb-prod bằng `npm run db:migrate:prod`. Xem `db/migrations/0050` làm mẫu.
