# BB-182 — Đường Lark đẩy: chậm, và đánh rơi thay đổi trong im lặng

**Cửa sổ: DEV-INT.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-int` — nhánh `agent/dev-int`.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Hai chuyện rời nhau, cùng một đường

Cả hai đều do reviewer soát ra sau khi gộp BB-179. Việc bạn làm ở BB-179 **đúng
và đã chạy thật** — đây là hai chỗ tinh hơn, chỉ lộ ra khi nhìn log.

## (b) Nặng hơn — làm trước

`src/app/api/lark/hook/route.ts` dòng 57: khi khoá đang bận thì trả **200** kèm
`{ skipped: "busy" }`.

Lark thấy 200 là coi như xong và **không gọi lại**. Nhân viên sửa hai dòng sát
nhau trong bảng Hậu Kỳ thì dòng thứ hai **rơi mất** — mà mọi thứ đều báo thành
công, nên không ai biết để đi tìm.

Trả lỗi cũng sai: Lark sẽ thử lại liên tục và làm dồn thêm.

Đường đúng là **xếp hàng lại**, không bỏ qua và cũng không báo lỗi. Vài cách,
bạn chọn và giải thích lựa chọn trong bàn giao:

- Ghi mã bản ghi vào một hàng đợi (bảng nhỏ hoặc cột trong `settings`), rồi
  lượt chạy kế tiếp xử nốt.
- Hoặc chờ khoá trong một khoảng ngắn có giới hạn rồi mới bỏ cuộc — nhưng
  **chỉ khi** cách này không làm Lark chờ quá lâu mà hết giờ.

Dù chọn cách nào: **thay đổi bị hoãn phải để lại dấu vết đọc được**, đừng biến
mất lặng lẽ như bây giờ.

## (a) Chậm 2–8 giây mỗi lượt

`readLarkRecord` liệt kê **toàn bộ bảng** của base rồi mới đọc bản ghi — hai
lượt gọi Lark cho một việc. Log dev server của chính bạn cho thấy `8314ms`,
`5957ms`, `8285ms`.

Nhớ lại `table_id` của bảng Hậu Kỳ sau lần đầu. Nhưng **đừng nhớ vĩnh viễn
trong biến toàn cục**: bảng có thể bị đổi tên hoặc dựng lại, và lúc đó app sẽ
gọi vào một mã đã chết mà không tự sửa được. Nhớ có hạn, hoặc hỏng thì tìm lại
theo tên.

Và giữ nguyên nguyên tắc của BB-132: **tìm bảng theo tên lúc chạy, không ghi
mã bảng vào mã nguồn.** Kho này public.

## Đừng nới lịch kéo định kỳ

Ở bàn giao BB-179 bạn đề xuất đổi lịch kéo từ mỗi giờ sang 6 tiếng. **Đừng**,
ít nhất cho tới khi (b) xong.

Đường kéo định kỳ chính là thứ vớt lại những thay đổi bị rơi ở (b). Nới từ 1
giờ lên 6 giờ là kéo cửa sổ mất dữ liệu dài gấp sáu lần — đúng lúc nó quan
trọng nhất.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — **321/321** cộng ca bạn thêm.
- [ ] Ca bắt buộc: hai lượt gọi **cùng lúc** thì lượt thứ hai **không bị mất** —
      nó được xử sau, hoặc để lại dấu vết đọc được. Đây là ca chứng minh (b)
      đã vá.
- [ ] `AGENTS.md §5a`: hoàn nguyên bản vá thì phép thử phải **ĐỎ**. Làm thật,
      dán cả hai kết quả.
- [ ] `git diff --stat` không đụng `src/components/` — đó là việc của DEV-UI
      đang chạy song song.

**Kiểm ngược, bắt buộc:** `npm run dev`, gọi đường mới hai lượt sát nhau bằng
`curl`, rồi dán truy vấn chứng minh **cả hai bản ghi** đều được xử lý. Che tên
khách. Kèm số mili-giây trước và sau khi vá (a).

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Dọn rác sau khi xong: `npm run db:cleanup`.
