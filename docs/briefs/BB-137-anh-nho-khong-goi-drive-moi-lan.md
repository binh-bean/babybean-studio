# BB-137 — Ảnh nhỏ không được gọi sang Drive mỗi lần xem

**Cửa sổ:** DEV-INT
**Thư mục worktree:** `../bb-int-137`
**Nhánh:** `feat/bb-137-cache-anh-nho`

---

## Vì sao có việc này

`/api/img/[photoId]` lấy ảnh bằng cách **gọi thẳng sang Google mỗi lần**. Mỗi
tấm ảnh khách nhìn thấy là một lượt gọi.

Con số thật sau đợt kéo ảnh ngày 14.09.2026:

| | |
|---|---|
| Ảnh trong hệ thống | **152.476 tấm** |
| Trung bình một bộ | 424 tấm |
| Bộ lớn nhất | 1.235 tấm |

Một ba mẹ mở bộ ảnh của mình và cuộn hết là vài trăm lượt gọi sang Google. Vài
gia đình mở cùng lúc vào buổi tối là vài nghìn. Google có hạn mức, và chạm hạn
mức thì **ảnh ngừng hiện cho tất cả mọi người cùng lúc** — đúng lúc đông khách
nhất.

Hôm nay chưa ai gặp vì chưa gửi link cho khách thật nào.

## Phải làm gì

1. **Đo trước.** Mở một bộ ảnh thật bằng link khách, đếm số lượt gọi sang
   Google cho một lần cuộn hết. Ghi số vào báo cáo.
2. Chọn cách giữ lại ảnh nhỏ đã lấy — đề xuất phương án và **nói rõ đánh đổi**
   (tốn chỗ, phức tạp, hay chi phí), rồi làm.
3. Đo lại sau khi sửa, cùng một bộ ảnh.

## Ràng buộc

- **Giữ nguyên tầng xét quyền.** Đường này vừa được vá ở BB-133: quyền xem một
  tấm ảnh đến từ cookie phiên đã ký, không bao giờ từ đường dẫn. Ảnh giữ lại
  phải **không xem được nếu không có quyền** — một kho ảnh nhỏ công khai là
  cách biến bản vá BB-133 thành vô nghĩa.
- Đọc `tests/security/khach-xem-duoc-anh.test.ts` trước khi đụng vào route.
  Sáu phép thử ở đó phải còn xanh.
- Kho công khai: không ảnh trẻ em thật trong phép thử hay ảnh chụp màn hình.

## Xong là khi

- [ ] Bảng số **trước và sau**: số lượt gọi sang Google cho một lần cuộn hết
- [ ] Sáu phép thử của BB-133 còn xanh, và **kiểm chứng ngược**: ảnh giữ lại
      vẫn bị chặn khi không có quyền
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` sạch
