```
DÁN VÀO CỬA SỔ: GIAO DIỆN  (agent DEV-FE)
Thư mục:        C:\Users\binh\Downloads\claude code\babybean-dev-fe
Model:          Gemini (bản mạnh nhất cửa sổ đang có)
```

# BB-244 — Chọn ảnh bìa ở màn quản trị: nổi lên ngay, xem trước, chữ "high fashion"

## Trước khi bắt đầu — bắt buộc

```
git fetch origin
git checkout -B feat/BB-244-chon-anh-bia origin/main
npm ci
```

## Chủ studio yêu cầu (nguyên văn, docs/22 mục 2-7)

> "muốn chọn thì phải kéo xuống dưới tôi muốn nó hiện nổi lên ngay. khi chọn là
> nhìn ngay được kết quả trước khi lưu; nội dung text cần thay đổi cách bài trí
> theo ảnh được một cách high fashion nhất"

## Hiện trạng

Khối "Bìa bộ ảnh" là hàm `CoverEditor` trong
`src/components/features/admin/gallery-detail.tsx` (khoảng dòng 930–1170):

- Bấm "Đổi ảnh bìa" thì lưới ảnh mở ra **ở cuối khối** → phải cuộn xuống mới thấy.
- Bấm một ảnh là lưới **đóng luôn**, không so được hai ảnh.
- Xem trước là một khung nhỏ 220px, chữ luôn nằm một kiểu: đáy trái, nền tối.
- Màn khách vẽ bìa ở `src/components/features/gallery/bia-bo-anh.tsx`.

## Việc cần làm

1. **Tách** `CoverEditor` ra tệp riêng `src/components/features/admin/bia-bo-anh-editor.tsx`.
   Trong `gallery-detail.tsx` chỉ đổi đúng chỗ import/gọi — tệp đó đang có
   người khác sửa song song, đụng càng ít càng tốt.
2. **Chọn ảnh nổi lên ngay:** "Đổi ảnh bìa" mở một **lớp phủ toàn màn**
   (`role="dialog"`, `aria-modal`, Esc để đóng, khoá cuộn nền): bên trái lưới ảnh
   cuộn được (tải thêm như hiện nay, 60 ảnh một lượt), bên phải **xem trước bìa
   cỡ lớn**. Bấm một ảnh → xem trước đổi NGAY, lưới vẫn mở để thử ảnh khác. Nút
   "Dùng ảnh này" đóng lớp phủ và đưa ảnh vào nháp; "Huỷ" giữ ảnh cũ. Trên điện
   thoại (dưới 768px) xem trước nằm trên, lưới nằm dưới.
3. **Xem trước trước khi lưu:** xem trước phải dựng bằng CHÍNH component bìa của
   màn khách (`BiaBoAnh` trong `bia-bo-anh.tsx`, truyền dữ liệu nháp vào), để
   "thấy gì là khách thấy nấy". Có công tắc Điện thoại / Máy tính cho khung xem
   trước. Nếu `BiaBoAnh` chưa nhận được dữ liệu nháp qua props thì thêm props
   tối thiểu, không đổi cách màn khách đang gọi nó.
4. **Bố cục chữ "high fashion":** cho CSKH chọn 1 trong 4 kiểu đặt chữ, mỗi kiểu
   một nút có hình thu nhỏ:
   - **Tạp chí** — tiêu đề serif rất lớn (Fraunces, chữ mảnh), sát mép trên trái,
     lời chào nhỏ chữ in hoa giãn chữ ở đáy.
   - **Tối giản** — tiêu đề vừa, căn giữa đáy, nhiều khoảng trống.
   - **Bên cạnh** — trên máy tính ảnh một nửa, chữ một nửa trên nền kem
     (#f7f2eb); trên điện thoại rơi về kiểu Tối giản.
   - **Đè chéo** — tiêu đề lớn đặt lệch, một phần chữ đè lên mép ảnh.
   Chữ phải đọc được trên mọi ảnh: tự đổi lớp phủ tối/sáng theo độ sáng vùng đặt
   chữ (đo trên ảnh w=200 bằng canvas là đủ), không dùng màu chữ cố định.
   Kiểu chữ lưu vào cột mới `galleries.cover_layout` (text, null = kiểu hiện nay).
   **Chỉ VIẾT tệp migration** `db/migrations/0069-kieu-chu-bia.sql` (thêm cột,
   `check` chỉ nhận 4 giá trị hoặc null). **KHÔNG áp lên cơ sở dữ liệu, KHÔNG
   chạy SQL** — Claude soát rồi áp. Sửa API `/api/admin/galleries/[id]/bia` và
   API màn khách trả thêm trường này; màn khách vẽ theo kiểu đã chọn.
5. Mọi thứ bấm được có con trỏ bàn tay (xem `tests/unit/con-tro-ban-tay.test.ts`).
   Chuỗi hiển thị đặt trong `src/i18n/vi.ts`.

## Luật bắt buộc

1. **Cơ sở dữ liệu là dữ liệu THẬT.** Chỉ tạo dòng tên bắt đầu `Fixture BB-244`,
   xoá sạch trong `afterAll` (thứ tự: selections → galleries; staff_branches →
   staff_profiles → tài khoản auth). Vai hợp lệ: owner, admin, branch_manager,
   cs, photographer, retoucher, accountant, viewer, photoshop_ctv.
2. **KHÔNG áp migration, KHÔNG sửa hàm/bảng trên bb-dev** (lần trước một agent
   làm vậy và đè hỏng một hàm đang chạy). Phép thử cần cột mới thì ghi rõ trong
   báo cáo là "chờ Claude áp 0069", và cho phép thử đó tự bỏ qua khi cột chưa có.
3. Playwright LUÔN `$env:PW_PORT=3170`. Không dùng 3099/3100.
4. Không đăng nhập tài khoản thật, không đoán mật khẩu. Nhân viên thử: email
   `test_bb244_…@demo.babybean.vn`, tạo như `tests/e2e/e8-mo-lai.spec.ts`.
5. Số điện thoại giả phải MỚI mỗi lượt (xem `tests/e2e/bb-217-218-so-sanh-treo-tuong.spec.ts`,
   biến `soGia`) — số cố định va nhau khi hai nơi chạy cùng lúc.
6. Phép thử đỏ vì lỗi thật của app → ghi vào mục "Lỗi thật" của báo cáo kèm ảnh
   chụp và dòng nhật ký máy chủ; không nới phép thử cho xanh.
7. Không lách khi bị chặn quyền — dừng, dán nguyên văn.
8. Ghi chú trong mã tiếng Việt, nói VÌ SAO. Chạy `npm run lint` (0 lỗi) —
   không dùng `as any`.

## Phép thử

- Vitest cho hàm đo độ sáng/chọn lớp phủ (thuần, không DOM).
- `tests/e2e/bb-244-chon-anh-bia.spec.ts` (nhân viên vai `cs`, bộ ảnh Fixture 6 ảnh):
  bấm "Đổi ảnh bìa" → lớp phủ hiện NGAY trong khung nhìn (không cần cuộn —
  kiểm `boundingBox` nằm trong viewport); bấm ảnh 2 rồi ảnh 3 → xem trước đổi
  theo mà lớp phủ vẫn mở; "Huỷ" → ảnh bìa nháp giữ nguyên; chọn lại → "Dùng ảnh
  này" → "Lưu bìa" → cơ sở dữ liệu `cover_photo_id` đúng ảnh 3; Esc đóng lớp phủ.
- KIỂM NGƯỢC từng khẳng định bằng cách làm hỏng thứ nó canh → phải ĐỎ → hoàn
  lại. Ghi lại từng lần.

## Xong khi

1. `npx tsc --noEmit -p tsconfig.json`, `npm run lint` (0 lỗi), vitest tệp mới,
   `npx playwright test tests/e2e/bb-244-chon-anh-bia.spec.ts` với PW_PORT=3170 —
   **dán nguyên kết quả và mã thoát**.
2. Ảnh chụp lớp phủ chọn ảnh + 4 kiểu chữ (dùng ảnh Fixture, KHÔNG ảnh khách thật).
3. Truy vấn chứng minh không còn dòng `Fixture BB-244`.
4. Commit trên `feat/BB-244-chon-anh-bia`, KHÔNG gộp `main`, KHÔNG push.
