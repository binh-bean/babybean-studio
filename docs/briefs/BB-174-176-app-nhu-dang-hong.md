# BB-174 · 175 · 176 — Ba chỗ làm app có cảm giác hỏng

**Cửa sổ: DEV-UI.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-ui` — nhánh `agent/dev-ui`.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Vì sao gộp ba việc làm một

Chủ studio mở app ngày 17/09 và chỉ ra ba chỗ. Cả ba đều **không hỏng gì cả** —
dữ liệu đúng, đường đi đúng. Nhưng cả ba đều làm người dùng nghĩ app hỏng, và
đó là thứ đắt hơn một lỗi thật: lỗi thật thì người ta báo, còn cảm giác hỏng
thì người ta lặng lẽ thôi dùng.

Ba việc cùng nằm ở lớp vỏ màn quản trị nên làm một lượt, không giẫm chân ai.

## BB-174 · Hai nút góc trên bên phải bấm không ăn

Bộ chọn chi nhánh và nút tài khoản (chữ "AD") ở góc phải. Bấm vào **không có
phản ứng gì** — trên cả màn Nhân sự lẫn màn Quản lý bộ ảnh.

Chủ studio là người đầu tiên bấm thử, và cũng là người sẽ kết luận "phần mềm
này hỏng". Một nút vẽ ra mà bấm không ăn thì tệ hơn là không vẽ.

Hai lựa chọn, chọn cái nào cũng được nhưng **phải chọn một**:

- Nối vào việc thật: bộ chọn chi nhánh lọc theo chi nhánh; nút tài khoản mở
  menu có Đăng xuất.
- Hoặc **ẩn hẳn** cho tới khi làm xong.

Không để nguyên trạng thái bấm-không-ăn.

## BB-175 · Thanh tìm kiếm bị che và dính sai

Khi cuộn danh sách bộ ảnh, khối bộ lọc dính lại phía trên nhưng **đè lên nội
dung**, và chừa một khoảng trống lạ ở trên. Ảnh chủ studio gửi cho thấy hàng
"HD_20260913#5102" bị khối lọc cắt ngang.

Đây là lỗi lớp và khoảng cách của phần tử dính. Sửa cho nó cư xử như mọi phần
mềm khác: nội dung chạy **dưới** thanh dính, không bị cắt, không chừa khoảng
trống thừa.

## BB-176 · Bấm được cả thẻ, và con trỏ phải thành bàn tay

Trong bảng Kanban, hiện chỉ **dòng mã hợp đồng** bấm được. Chủ studio bấm vào
tên khách hoặc vùng trống của thẻ thì không có gì xảy ra.

Cả thẻ phải bấm được. Và chỗ nào bấm được thì con trỏ phải thành **bàn tay**,
kèm phản hồi khi rê chuột (đổi nền hoặc nổi lên nhẹ).

Đây là quy ước mọi phần mềm đều theo, nên khi thiếu thì người dùng không nghĩ
"chưa làm" mà nghĩ "hỏng".

Nhớ giữ **bàn phím dùng được**: thẻ bấm được phải vào được bằng phím Tab và
kích hoạt bằng Enter, có viền focus nhìn thấy.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **321/321**, không ca nào đang xanh bị đỏ.
- [ ] `npm run verify:wired` sạch.
- [ ] Chữ mới đi qua i18n (`vi.ts` và `en.ts` phải cùng bộ khoá).

**Kiểm ngược, bắt buộc — ba ảnh chụp, che tên khách:**

1. Bấm bộ chọn chi nhánh và nút tài khoản, chụp lại **kết quả** (menu mở ra,
   hoặc danh sách đã lọc). Nếu chọn hướng ẩn thì chụp màn hình không còn nút.
2. Cuộn danh sách xuống giữa chừng, chụp cho thấy thanh lọc **không cắt ngang**
   hàng nào.
3. Thẻ Kanban khi rê chuột, cho thấy con trỏ bàn tay và phản hồi.

Chạy `npm run dev` trong worktree này. Không gọi ra internet.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Ảnh chụp màn hình **phải che tên và số điện thoại** trước khi đưa vào bàn giao.

`AGENTS.md §5a` áp cho mọi phép thử bạn viết: hoàn nguyên bản vá thì nó phải đỏ.
