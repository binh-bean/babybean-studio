# BB-160 — Phép thử trình duyệt cho hai thứ vừa làm: tải ảnh và Kanban

**Cửa sổ:** KIỂM THỬ
**Thư mục worktree:** `../bb-qa-160`
**Nhánh:** `feat/bb-160-e2e-tai-anh`

---

## Vì sao có việc này

BB-134 vừa chứng minh giá trị của phép thử trình duyệt thật: nó bắt được hai lỗi
đã cắn khách thật trong ngày (cấp lại link, và màn danh sách xoay mãi) mà 310
phép thử trong Node đều mù.

Hai tính năng làm sau BB-134 chưa có ca nào canh, và cả hai đều là loại chỉ hỏng
trong trình duyệt:

- **BB-156 tải ảnh**: tải từng ảnh, và tải cả bộ theo lô 15 ảnh. Toàn bộ phần
  hay hỏng nằm ở phía trình duyệt — thẻ neo tạm, thu hồi địa chỉ blob, lỗi hết
  chỗ trên máy.
- **BB-146 Kanban 8 cột**: 77 bộ `sync_error` từng biến mất khỏi bảng mà không
  ai biết mình đang nhìn thiếu.

## Phải làm gì

Thêm vào `tests/e2e/`:

1. **Tải một ảnh**: mở màn xem ảnh lớn, bấm tải, khẳng định trình duyệt NHẬN
   được tệp — dùng `page.waitForEvent("download")` và kiểm tên tệp, đừng chỉ
   kiểm nút có tồn tại.
2. **Tải cả bộ**: bộ thử nhiều hơn 15 ảnh để đi qua ít nhất hai lô. Khẳng định
   số ảnh tải được đúng bằng số ảnh trong bộ, và thanh tiến độ chạy tới hết.
3. **Bộ TẮT cho tải** (`download_enabled = false`) thì **không có nút nào** —
   quyết định số 4 vẫn cho studio tắt theo từng bộ.
4. **Kanban**: mở `/admin/galleries`, chuyển sang Kanban, khẳng định có cột
   "Lỗi tải ảnh" và số đếm của nó khớp số bộ `sync_error` trong cơ sở dữ liệu.

## Ràng buộc

- Tự dựng dữ liệu của mình, mang nhãn `runId` riêng và dọn theo nhãn của chính
  mình — đúng khuôn BB-136. Không mượn bộ ảnh có sẵn.
- Ảnh thật trên Drive không ổn định cho phép thử: dùng lại
  `tests/fixtures/mock-drive-network.cjs` mà BB-134 đã dựng.
- **Không sửa mã sản phẩm để phép thử xanh.** Tìm ra lỗi thì báo về, kèm bước
  tái hiện. Agent BB-134 đã lỡ sửa vào `src/app/api/img` và làm hỏng chữ tiếng
  Việt trong ghi chú — PM phải hoàn nguyên.
- Kho công khai: không ảnh trẻ em thật, không tên khách thật trong phép thử hay
  ảnh chụp màn hình.

## Xong là khi

- [ ] `npm run test:e2e` xanh, cả bốn ca mới lẫn năm ca của BB-134
- [ ] **Kiểm chứng ngược** cho ca tải cả bộ: đổi cỡ lô về 1 ảnh mỗi lô thì phép
      thử vẫn phải xanh (tải hết là tải hết); còn tắt vòng lặp lô thì phải ĐỎ
- [ ] `npm run verify:own -- QA-BOT --base main`, `npm test`, `tsc`, `lint` sạch
