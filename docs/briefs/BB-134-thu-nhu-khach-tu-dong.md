# BB-134 — Phép thử tự động đi đúng đường của khách

**Cửa sổ:** QA
**Thư mục worktree:** `../bb-qa-134`
**Nhánh:** `feat/bb-134-thu-nhu-khach`

---

## Vì sao có việc này

Ngày 14.09.2026 PM mở thử một bộ ảnh thật bằng link khách và phát hiện **hai
lỗi chồng nhau khiến khách không xem được MỘT tấm ảnh nào**:

1. `/api/img` chỉ nhận đăng nhập nhân viên — phần cho khách là một dòng `TODO`.
2. Câu truy vấn mơ hồ về quan hệ bảng nên trả "không tìm thấy ảnh" cho cả
   nhân viên.

Lúc đó có **270 phép thử đều xanh**, `tsc` sạch, `lint` sạch, `npm run build`
chạy được. Không một cổng nào bắt được.

Lý do: mọi phép thử đều gọi thẳng vào hàm route trong Node. **Không có phép
thử nào mở một trang thật bằng một cái link thật.** Cả hai lỗi nằm đúng ở chỗ
các mảnh ghép nối vào nhau.

## Phải làm gì

Một phép thử Playwright chạy được bằng `npm run test:e2e`:

1. Tự dựng dữ liệu của mình: khách, bộ ảnh, vài tấm ảnh, một link chia sẻ.
2. Mở `/g/<mã>` bằng trình duyệt thật.
3. **Khẳng định ảnh TẢI ĐƯỢC THẬT** — không phải "thẻ img có trong trang", mà
   `naturalWidth > 0`. Đây là điều kiện đã bắt được lỗi hôm nay.
4. Thả tim một tấm, khẳng định con số "Đã chọn" tăng.
5. Mở cùng link đó tới ảnh của bộ **khác**, khẳng định bị chặn.
6. Dọn sạch dữ liệu mình tạo.

## Ràng buộc

- Không mượn dữ liệu có sẵn trên bb-dev. Dự án đã vấp lỗi đó năm lần.
- Ảnh thật trên Drive không ổn định cho phép thử. Dựng ảnh giả và cho
  `/api/img` trả về được, hoặc chặn tầng Drive ở mức mạng — **nhưng tuyệt đối
  không giả lập `createAdminClient` hay tầng xét quyền**. Chính một lớp giả lập
  đặt sai chỗ đã che mất lỗi hôm nay: phép thử xanh trong khi bản thật hỏng.
- Kho công khai: không ảnh trẻ em thật, không tên khách thật trong phép thử
  hay ảnh chụp màn hình.

## Xong là khi

- [ ] `npm run test:e2e` chạy được và xanh
- [ ] **Kiểm chứng ngược**: trả `/api/img` về hành vi cũ (chặn khách) thì phép
      thử phải ĐỎ. Ghi kết quả đó vào báo cáo — không có bước này thì không
      biết phép thử có canh gì không.
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` vẫn sạch
