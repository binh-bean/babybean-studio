# BB-130 — Cổng khách: một link, nhiều buổi chụp

**Cửa sổ:** DEV-BE
**Thư mục worktree:** `../bb-be`
**Nhánh:** `feat/bb-130-cong-khach`

---

## Vì sao có việc này

Migration `0010` đã đổi mô hình link từ *một link một bộ ảnh* sang **một link
một khách hàng**, làm địa chỉ vĩnh viễn. Lý do ghi trong chính migration: link
hết hạn khiến phụ huynh không xem lại được ảnh con mình.

**Nửa còn lại chưa làm xong.** Link gắn theo khách (`customer_id` có giá trị,
`gallery_id` để trống) mint ra phiên đăng nhập có `galleryId` **rỗng** và không
tạo lượt chọn — xem `src/app/api/auth/gallery/route.ts`, biến `isLegacy`. Dùng
nó hôm nay là gửi khách một link mở ra lỗi.

Vì thế `BB-127` tạm thời tạo link **gắn theo bộ ảnh** (không đặt hạn dùng, nên
vẫn giữ được ý định của `0010`). Việc này làm nốt nửa kia.

Chủ studio đã chốt mô hình: *"một khách hàng nhiều buổi chụp, một buổi chụp có
thể nhiều gói chụp, thường một buổi chụp một hóa đơn"*. Nên cổng khách là có
thật trong nghiệp vụ, không phải trang thừa.

## Phải làm gì

1. `GET /api/g/buoi-chup` — trả danh sách buổi chụp của khách đang đăng nhập,
   lấy `customerId` **từ cookie phiên**, tuyệt đối không từ query hay body.
   Mỗi dòng: tên bộ, ngày chụp, số ảnh, trạng thái, ảnh bìa.
2. Trang `/g/[token]` khi phiên là link theo khách: hiện danh sách buổi chụp
   thay vì lưới ảnh.
3. Chọn một buổi → mint phiên có `galleryId` của bộ đó, tạo lượt chọn nếu chưa
   có (lấy đúng đoạn đang làm cho link kiểu cũ trong `auth/gallery/route.ts`).
4. Khách chỉ được chọn buổi chụp **của chính mình**.

## Ràng buộc

- `galleryId` phải luôn lấy từ cookie phiên đã ký, **không bao giờ** từ thân
  yêu cầu — xem cảnh báo đầu `src/lib/supabase/admin.ts`.
- Bộ ảnh chưa có ảnh nào (`photo_count = 0`) thì **không hiện** trong danh
  sách: khách bấm vào thấy trang trắng là gọi điện ngay.
- Giữ nguyên đường link kiểu cũ đang chạy. Đây là thêm đường, không phải thay.

## Xong là khi

- [ ] Phép thử đi hết đường: tạo link theo khách → đăng nhập → thấy đúng các
      buổi chụp của khách đó, không thấy của khách khác
- [ ] Phép thử: chọn một buổi thì phiên trỏ đúng bộ ảnh và có lượt chọn
- [ ] Đột biến kiểm chứng: bỏ điều kiện lọc theo khách thì phép thử phải đỏ
- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` sạch
