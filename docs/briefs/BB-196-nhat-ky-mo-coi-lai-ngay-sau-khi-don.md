# BB-196 — Nhật ký mồ côi lại ngay sau khi dọn

**Cửa sổ: LẬP TRÌNH SAU (agent DEV-BE).** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-be` — nhánh `agent/dev-be`.

**Không phải DEV-FE** (họ vừa làm màn hình đọc nhật ký), **không phải DEV-INT**.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`. Lần trước bạn bỏ
qua dòng này và làm trên nền cũ hơn `main` 36 commit.

---

## Số đo, cùng một ngày

| Lúc | `activity_logs` | Mồ côi |
|---|---|---|
| Khi giao BB-173 (sáng 21/09) | 9.823 dòng | 9.507 (96,8%) |
| Sau khi BB-173 dọn (chiều 21/09) | 720 dòng | **389 (54,0%)** |

"Mồ côi" = dòng có `entity_type = 'gallery'` mà `entity_id` trỏ vào một bộ ảnh
**không còn tồn tại**.

Con số thứ hai mới là việc của bạn. Dọn 9.100 dòng xong, **trong cùng buổi
chiều rác đã quay lại quá nửa**. Nghĩa là `db:cleanup` của BB-173 là một cái
chổi, không phải một cái chốt: nó quét sạch rồi thứ sinh ra rác lại sinh tiếp.

Thứ sinh ra rác là bộ phép thử: mỗi lượt `npm run test` tạo bộ ảnh giả, ghi
nhật ký cho chúng, rồi xoá bộ ảnh mà **không xoá nhật ký**. Ba lượt chạy chiều
nay là đủ 389 dòng.

## Vì sao đáng sửa chứ không phải chạy chổi chăm hơn

Màn Nhật ký thao tác (BB-173) vừa lên. Chủ studio mở nó ra để trả lời đúng một
câu: *ai đã làm gì*. Một bảng mà quá nửa số dòng trỏ vào chỗ không còn gì là
bảng người ta mở một lần rồi thôi — và mất luôn niềm tin vào cả những dòng
đúng.

Thêm nữa: `activity_logs` là bảng dùng để tra khi có tranh cãi với khách. Nó
phải đáng tin **mà không cần ai nhớ chạy lệnh dọn**.

## Việc cần làm

Chọn một trong hai hướng, và ghi rõ vì sao chọn nó vào mô tả PR:

1. **Khoá ngoại có `on delete`** — `activity_logs.entity_id` hiện là `uuid`
   trống, không ràng buộc với bảng nào, vì nó trỏ đa hình (`entity_type` có thể
   là `gallery`, `staff`, `payment`…). Nếu tách một cột `gallery_id` riêng có
   khoá ngoại `on delete set null` thì dòng nhật ký **còn nguyên** mà không còn
   mồ côi: nó vẫn kể ai làm gì, chỉ mất đường trỏ tới thứ đã bị xoá.
2. **Đường xoá bộ ảnh tự dọn theo mình** — chỗ nào xoá `galleries` thì xoá cả
   nhật ký của nó trong cùng một giao dịch.

Hướng 1 giữ được lịch sử, hướng 2 thì không. Cân nhắc kỹ trước khi chọn hướng
2: xoá lịch sử thao tác là thứ không lấy lại được, và `docs/05-rbac.md` nói
nhật ký tồn tại chính để tra ngược.

**Không được đụng** `src/app/(admin)/**` và `src/components/**` — màn hình là
của DEV-FE.

Nếu phải thêm migration: `db/migrations/NNNN-*.sql`, số tiếp theo sau `0050`,
và **phải chạy lại được nhiều lần mà kết quả không đổi** (`if exists`,
`or replace`, `on conflict do nothing`). `db/migrations/0050` là mẫu gần nhất.

## Tiêu chí xong

- [ ] `npm run typecheck` — **dán mã thoát**.
- [ ] `npm run lint` — **dán mã thoát**.
- [ ] `npm run test` — **368/368** cộng ca bạn thêm, dán mã thoát.
- [ ] `npm run verify:db` — **17/17**, dán mã thoát.
- [ ] Đo bằng SQL, dán cả hai con số:
      ```sql
      select count(*) from activity_logs;
      select count(*) from activity_logs
       where entity_type = 'gallery' and entity_id not in (select id from galleries);
      ```

**Kiểm ngược, bắt buộc** (`AGENTS.md §5a`): chạy `npm run test` **hai lượt liên
tiếp**, đo số mồ côi trước và sau. Nếu con số không tăng thì mới là xong. Một
lượt không chứng minh được gì — chính cách đo "một lượt" đã cho BB-173 tưởng
mình dọn xong.

## Một điều phải biết

`bb-dev` chứa dữ liệu khách **thật** (`AGENTS.md §6`). Câu lệnh xoá nào cũng
phải giới hạn đúng phạm vi rác, và chạy thử bằng `select` trước khi đổi thành
`delete`.
