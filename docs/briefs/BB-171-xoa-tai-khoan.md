# BB-171 — Xoá tài khoản tạo nhầm, không đụng vào lịch sử

**Cửa sổ: SEC-ARCH.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-sec-arch` — nhánh `agent/sec-arch`.

**Không phải ARCH.** ARCH đang làm BB-172 trong một cửa sổ khác, cùng chủ đề
nhân sự và quyền. Đọc mục "Hai việc chạy song song" bên dưới.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Việc

Màn Nhân sự hiện chỉ có **Cho nghỉ việc** — nó tắt tài khoản chứ không xoá.
Chủ studio cần xoá hẳn tài khoản **tạo nhầm** và sáu tài khoản demo
`@demo.babybean.vn`.

## Hai việc khác nhau, đừng trộn

Đây là chỗ dễ làm hỏng nhất, và hỏng thì không lấy lại được.

| | Cho nghỉ việc | Xoá hẳn |
|---|---|---|
| Khi nào | Nhân viên thật, đã từng làm việc | Tạo nhầm, hoặc tài khoản demo |
| Lịch sử trên bộ ảnh cũ | **GIỮ** | không có gì để giữ |
| Đã có sẵn | rồi | chưa |

`docs/13 §8` đã chốt: **"Nghỉ việc: tắt, không xoá. Xoá hẳn sẽ làm mọi album cũ
mất dấu vết người thực hiện."** Đừng đụng vào quyết định đó.

Nên **nút Xoá chỉ hiện cho tài khoản chưa từng làm gì**. Phải kiểm trước khi
cho xoá, ít nhất:

- Chưa tạo bộ ảnh nào (`galleries.created_by`)
- Chưa được gán làm thợ ảnh, thợ chỉnh, hay CSKH của bộ nào
- Không có dòng nào trong `activity_logs`
- Chưa xác nhận thanh toán nào (`gallery_payments.confirmed_by`)

Còn dấu vết thì **ẩn nút Xoá và nói rõ vì sao** — ví dụ *"Tài khoản này đã tạo
12 bộ ảnh nên không xoá được. Dùng Cho nghỉ việc để giữ lịch sử."* Đừng chỉ làm
nút xám không giải thích.

## Ba chỗ dễ sai

**Sáu tài khoản demo là giàn giáo, không phải rác.** `tests/security/rbac.test.ts`
dòng 300 cần sẵn **hai** nhân viên trong vai cs/photographer/branch_manager, và
sáu chỗ khác cần một nhân viên vai cs. Xoá chúng là bộ phép thử bảo mật đỏ.

Nên brief này **không yêu cầu xoá chúng**. Nếu bạn muốn làm cho danh sách sạch
thì phải **sửa phép thử tự dựng nhân viên trước** — và đó là việc riêng, ghi
vào bàn giao để PM quyết, đừng tự gộp vào đây.

**Xoá `staff_profiles` không xoá tài khoản đăng nhập.** Tài khoản thật nằm ở
`auth.users`, schema `auth`. Xoá một nửa là để lại tài khoản đăng nhập được mà
không có hồ sơ — người đó vào app rồi rơi vào trạng thái không ai lường trước.
Xử cả hai, trong **cùng một giao dịch**.

**Ai được bấm nút này.** `docs/05-rbac.md §2`: chỉ `owner` và `admin` có quyền
với nhân sự. Xoá là việc không hoàn tác được nên **chỉ `owner`**. Chặn ở cả
giao diện lẫn máy chủ — chặn ở giao diện thôi thì không phải là chặn.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **321/321** cộng ca bạn thêm. Phép thử bảo mật hiện có
      **không được đỏ** — nếu đỏ nghĩa là bạn đã xoá mất giàn giáo.
- [ ] `AGENTS.md §5a`: hoàn nguyên bản vá thì phép thử phải **ĐỎ**. Làm thật.
- [ ] Ca bắt buộc: tài khoản có lịch sử thì **không xoá được** (chặn ở máy chủ,
      không chỉ ở giao diện); vai `admin` gọi thẳng đường xoá thì bị từ chối;
      xoá thành công thì **cả `staff_profiles` lẫn `auth.users`** đều mất.

**Kiểm ngược, bắt buộc:** `npm run dev`, tạo một tài khoản thử tên bắt đầu bằng
`Fixture BB-171`, xoá nó, rồi dán truy vấn chứng minh cả hai bảng đều sạch. Sau
đó thử xoá một tài khoản **có lịch sử** và dán lại lời từ chối. Che tên và email
thật.

## Hai việc chạy song song

**ARCH đang làm BB-172** (màn Vai trò và quyền) trong `babybean-arch`. Hai việc
cùng chủ đề nhân sự nên dễ chạm nhau:

- Bạn ở **màn Nhân sự** và đường xoá.
- ARCH ở **màn Vai trò** và luật quyền.

Nếu thấy mình đang sửa `docs/05-rbac.md` hay bảng quyền trong cơ sở dữ liệu thì
dừng lại — đó là phần của ARCH. Ghi vào bàn giao thay vì tự sửa.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Email nhân viên thật cũng là dữ liệu cá nhân: che trước khi dán vào bàn giao.
