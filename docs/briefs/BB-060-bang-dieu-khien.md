# BB-060 — Bảng điều khiển: thứ nhân viên nhìn thấy đầu tiên mỗi sáng

**Cửa sổ: GIAO DIỆN (agent DEV-FE).** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-fe` — nhánh `agent/dev-fe`.

**Không phải DEV-UI, không phải DEV-BE.**

**Trước khi bắt đầu:** `git fetch && git merge origin/main`. Lần trước bạn bỏ
qua dòng này và làm trên nền cũ hơn `main` 31 commit. `main` bây giờ đã có màn
Nhật ký thao tác của chính bạn.

---

## Chuyện đang xảy ra mỗi sáng

`src/app/(auth)/login/page.tsx` đưa người vừa đăng nhập về `/admin`. Còn
`src/app/(admin)/admin/page.tsx` — nguyên văn, không cắt bớt:

```tsx
<h1>Bảng điều khiển</h1>
<p>Chưa triển khai (BB-060).</p>
```

Nghĩa là thứ đầu tiên nhân viên studio nhìn thấy sau khi gõ mật khẩu, mỗi ngày,
là một trang trống. Mà mục menu dẫn tới nó thì đang bị khoá xám và ghi "sắp có"
(`admin-sidebar.tsx`). Hai chỗ nói hai điều khác nhau về cùng một màn hình.

`docs/17-todo-dang-giau-viec-thieu.md` xếp đây là **chỗ đáng sửa sớm nhất**
trong bảy dòng TODO còn lại: không ai mất dữ liệu, nhưng nó là ấn tượng đầu
tiên mỗi ngày, và app đang chạy thật từ 15/09.

## Việc cần làm — `docs/07-ui-ux.md §4.1`

1. **Hàng thẻ số**: `Chờ khách chọn` · `Sắp hết hạn` · `Quá hạn` (đỏ) ·
   `Chờ retouch` · `Đã giao tháng này`.
2. **Bảng "Cần xử lý ngay"**: tên bé, khách, chi nhánh, trạng thái, còn lại N
   ngày, tiến độ chọn (`18/20`), nút thao tác nhanh.
3. **Biểu đồ cột**: số album theo ngày, 14 ngày gần nhất. Cột đơn giản, không
   cần thư viện biểu đồ nặng.
4. Mở khoá mục "Bảng điều khiển" trong sidebar — bỏ trạng thái "sắp có".

**Mức khẩn tính ở cơ sở dữ liệu, không tính lại ở trình duyệt.** Khung nhìn
`v_gallery_progress` đã có sẵn (`db/schema.sql §16`). Hai nơi cùng tính một con
số là hai nơi sẽ lệch nhau, và người dùng tin nơi nào thì tuỳ hôm.

**Chi nhánh lấy từ phiên đăng nhập**, rồi mới giao với tham số trên địa chỉ —
đúng như bạn đã làm ở màn Nhật ký (`src/app/api/admin/reports/nhat-ky/route.ts`
dòng 22). Đừng nhận `branchId` từ phía client gửi lên rồi tin luôn.

**Trạng thái rỗng phải có nội dung** (`docs/07-ui-ux.md §6`): chi nhánh chưa có
album nào thì hiện một câu nói rõ, không để trắng.

## Tiêu chí xong

- [ ] `npm run typecheck` — **dán mã thoát**.
- [ ] `npm run lint` — **dán mã thoát**.
- [ ] `npm run test` — **368/368** cộng ca bạn thêm, dán mã thoát.
- [ ] Ảnh chụp màn hình thật ở ba khổ: điện thoại, máy tính bảng, máy tính.
- [ ] Phép thử cho đường API mới, trong đó **bắt buộc** có một ca chi nhánh:
      người của chi nhánh A không đếm được album của chi nhánh B.

**Kiểm ngược, bắt buộc** (`AGENTS.md §5a`): bỏ lớp lọc chi nhánh đi (tin thẳng
vào tham số client gửi) thì ca đó phải **ĐỎ**. Dán cả hai kết quả. Đây đúng là
bước đã chứng minh màn Nhật ký của bạn làm đúng — `expected 200 to be 403`.

Và một cảnh báo từ lượt soát chiều nay: phép thử phải đỏ **vì đúng lý do nó
nói**. Ca "bắt buộc" của BB-190 từng xanh cả khi bỏ bản vá, chỉ vì bảng giả
thiếu một hàm nên mã nổ ra cùng một mã lỗi mà ca đó đang chờ.

## Một điều phải biết

`bb-dev` chứa dữ liệu khách **thật** (`AGENTS.md §6`) — 488 bộ ảnh, 427 khách.
Ảnh chụp màn hình đưa vào PR **phải che tên khách và tên bé**. Dọn rác sau khi
xong: `npm run db:cleanup`.
