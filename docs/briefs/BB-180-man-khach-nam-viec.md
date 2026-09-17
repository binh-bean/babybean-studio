# BB-180 — Màn khách: năm việc chủ studio đặt

**Cửa sổ: DEV-FE.** Thư mục làm việc:
`C:\Users\binh\Downloads\claude code\babybean-dev-fe` — nhánh `agent/dev-fe`.

**Nhận việc này SAU KHI BB-170 đã xong và đã gộp.** Hai việc cùng chạm màn quản
trị và màn khách; làm chồng lên nhau là tự tạo xung đột.

**Trước khi bắt đầu:** `git fetch && git merge origin/main`.

---

## Bối cảnh

Chủ studio mở app bằng điện thoại thật ngày 17/09 và đặt năm việc. Bốn trong
năm là **nối tiếp thứ đã có**, không phải dựng mới — đọc kỹ để khỏi làm lại.

## 1 · Nút chọn và tải lên góc trên bên phải

Hiện `photo-lightbox.tsx` đặt "Chọn ảnh này" và nút tải **ở giữa đáy màn**, to và
nặng, che mất chân ảnh.

Đưa lên **góc trên bên phải** dạng hai biểu tượng tròn nhỏ, nền mờ. Ảnh phải
được nhìn trọn vẹn — với ảnh trẻ con thì đó chính là thứ ba mẹ mở link để xem.

Vẫn phải bấm trúng trên điện thoại: vùng chạm **tối thiểu 44×44 px** kể cả khi
biểu tượng vẽ nhỏ hơn. Nút nhỏ mà bấm trượt thì tệ hơn nút to.

## 2 · Ghi chú chỉnh sửa ngay trong màn xem ảnh lớn

**Đã làm xong một nửa.** BB-144 dựng đường lưu ghi chú từng ảnh
(`src/lib/selection/mutate.ts`) và nó đang chạy ở màn lưới. Việc còn lại là đưa
ô ghi chú vào màn xem lớn.

Vì sao đáng làm: khách nghĩ ra điều muốn dặn đúng lúc **đang nhìn kỹ một tấm**,
không phải lúc lướt lưới. Bắt họ nhớ rồi quay ra lưới tìm lại là mất ghi chú.

Đừng dựng đường lưu mới. Dùng lại đúng đường của BB-144.

## 3 · Luôn thấy đã chọn bao nhiêu trên hạn mức bao nhiêu

Con số này đã có ở màn lưới (`quota-display.tsx`) nhưng **biến mất khi mở ảnh
lớn** — mà khách chọn ảnh chủ yếu lúc xem lớn.

Hiện thường trực ở góc màn xem lớn, gọn, kiểu `12 / 20`. Vượt hạn mức thì đổi
màu theo đúng cách màn lưới đang làm, đừng nghĩ ra cách hiển thị thứ hai.

## 4 · Nhắc chọn ảnh phóng và bìa album trước khi chốt

Phần đặt ảnh vào sản phẩm in **đã làm xong** (`/api/g/placements`,
`photo-placement-picker.tsx`). Thiếu đúng một bước.

Khi khách bấm **Chốt**: nếu còn sản phẩm in chưa gán ảnh thì hiện hộp thoại
liệt kê đúng những sản phẩm còn thiếu.

**KHÔNG chặn khách chốt.** Hộp thoại có hai nút: *"Để tôi chọn thêm"* và
*"Chốt luôn"*. Lời văn phải nói rõ cái được, không doạ:

> Bạn chưa chọn ảnh cho **bìa album**. Chọn luôn thì bên mình làm nhanh hơn —
> để sau cũng được, CSKH sẽ hỏi lại.

Bắt buộc là làm khách bỏ dở giữa chừng. Họ đang cầm điện thoại, đang bế con.

## 5 · Nhóm ảnh theo thư mục, và thông tin studio

**Dữ liệu đã có sẵn** — đo ngày 17/09 trên bb-dev: **148.881 / 152.637 ảnh đã
mang tên thư mục, 184 concept khác nhau**. Cột `photos.subfolder`.

Hiện màn khách mới ghi tên thư mục bé xíu cạnh ảnh
(`gallery-app.tsx:242`). Nâng thành **nhóm có tiêu đề và lọc được**, dùng lại
bộ lọc đã có (`subfolders: string[]`, dòng 53) chứ đừng dựng bộ lọc thứ hai.

Đây là nền cho việc sau: ảnh đã chỉnh, ảnh sửa lại, layout ghép album cho khách
duyệt — mỗi loại là một thư mục. Nên **đừng ghi cứng 184 tên concept vào mã**;
nhóm theo cái gì có trong dữ liệu.

Thêm ở chân màn khách: tên và địa chỉ chi nhánh, hotline, nút nhắn cho studio
(đã có từ BB-166), và **thời gian lưu ảnh**.

> **Thời gian lưu ảnh: chờ chủ studio chốt con số.** Chưa có thì để chỗ trống và
> ghi trong bàn giao, **đừng tự đoán một con số rồi in cho khách đọc**. Khách
> đọc "lưu 6 tháng" rồi tháng thứ bảy mất ảnh là studio mất khách.

## Tiêu chí xong

- [ ] `npm run typecheck` sạch, `npm run lint` sạch.
- [ ] `npm run test` — không ca nào đang xanh bị đỏ. Ghi rõ số ca trước và sau.
- [ ] Phép thử **dựng component thật**, không đọc tệp `.tsx` bằng `fs` rồi khớp
      regex. Ít nhất phải có: hộp thoại nhắc hiện đúng khi thiếu sản phẩm in;
      bấm "Chốt luôn" thì vẫn chốt được; số hạn mức hiện đúng trong màn xem lớn.
- [ ] Phép thử nào **ghi vào cơ sở dữ liệu thì phải trả lại giá trị cũ**
      (`beforeAll`/`afterAll`). Ở BB-166 một phép thử đổi `settings` mà không
      hoàn nguyên, làm nút nhắn tin biến mất khỏi app thật sau mỗi lần chạy.

**Kiểm ngược, bắt buộc:** `npm run dev` trong worktree này, mở một link khách
trên `localhost:3000`, **thu nhỏ cửa sổ về cỡ điện thoại**, rồi chụp màn hình
cho thấy: nút ở góc phải, số hạn mức, ô ghi chú trong màn xem lớn, và hộp thoại
nhắc khi bấm Chốt. Che tên khách trước khi đưa vào bàn giao.

Không gọi ra internet cho việc này.

## Một điều phải biết

**bb-dev chứa dữ liệu khách THẬT** — 447 nhà (`AGENTS.md §6`). Kho này public.
Dọn rác sau khi xong: `npm run db:cleanup`, bộ ảnh thử đặt tên `Fixture BB-180`.
