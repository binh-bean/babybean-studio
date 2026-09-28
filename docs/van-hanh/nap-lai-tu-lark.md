# Xoá sạch và nạp lại từ Lark — hướng dẫn cho admin

Việc này chỉ làm MỘT LẦN, trước khi mở app cho khách (BB-300). Mục đích: xoá
hết dữ liệu cũ đang có trong app, rồi nạp lại từ đầu theo đúng Lark. Làm vậy
để không ai còn phải nghi ngờ dữ liệu app có khớp Lark hay không.

Việc này KHÔNG đụng vào: chi nhánh, tài khoản nhân sự, gói chụp, sản phẩm,
cài đặt. Bốn nhóm đó Lark không hề biết tới, nên giữ nguyên.

Việc này XOÁ SẠCH: toàn bộ khách, bé, buổi chụp, bộ ảnh, ảnh, link chia sẻ,
lượt chọn của khách, thanh toán phát sinh. Xoá xong sẽ nạp lại từ Lark.

---

## Trước khi bắt đầu

Chỉ chạy khi:
- Admin đã xem qua số đếm ở bước 1 và đồng ý xoá.
- Đã có bản sao lưu (bước 2) trong vòng 24 giờ gần nhất.

Không có ai khác nên chạy các lệnh dưới đây ngoài admin hoặc người admin nhờ,
vì bước 3 xoá thật, không lấy lại được nếu không có bản sao lưu.

---

## Bước 1 — Xem số đếm (an toàn, chỉ đọc)

Mở cửa sổ dòng lệnh trong thư mục dự án, gõ:

```
npm run db:nap-lai
```

Lệnh này KHÔNG xoá gì cả, chỉ đọc và in ra:

- Những bảng được GIỮ NGUYÊN, kèm lý do (chi nhánh, nhân sự, sản phẩm, cài đặt).
- Những bảng SẼ BỊ XOÁ, kèm số dòng hiện có của từng bảng.
- Tổng số dòng sẽ mất.
- Một MÃ XÁC NHẬN 6 ký tự — dùng ở bước 3.

Đọc kỹ số đếm. Nếu số lạ, dừng lại, hỏi kỹ thuật trước khi đi tiếp.

Mã xác nhận chỉ dùng được cho ĐÚNG bộ số vừa in, trong ĐÚNG ngày hôm nay. Nếu
có ai đó chạy đồng bộ Lark sau khi in mã, số đếm đổi, mã cũ sẽ không dùng
được nữa — phải chạy lại bước 1 để lấy mã mới.

---

## Bước 2 — Sao lưu trước khi xoá (bắt buộc)

```
npm run db:nap-lai -- --sao-luu "D:\BabyBean-sao-luu"
```

Thay `D:\BabyBean-sao-luu` bằng nơi admin muốn lưu — miễn KHÔNG nằm trong thư
mục dự án (thư mục dự án là công khai trên internet).

Lệnh này xuất toàn bộ dữ liệu SẮP BỊ XOÁ ra các tệp JSON trong một thư mục con
mới, kèm một tệp ghi tổng số dòng và thời điểm sao lưu.

Không đặt lại tên hay xoá thư mục này cho tới khi chắc chắn app chạy tốt sau
khi nạp lại.

---

## Bước 3 — Xoá thật

```
npm run db:nap-lai -- --xoa --xac-nhan <MÃ_TỪ_BƯỚC_1>
```

Thay `<MÃ_TỪ_BƯỚC_1>` bằng đúng mã 6 ký tự bước 1 vừa in ra.

Lệnh sẽ TỪ CHỐI chạy nếu:

- Mã không khớp (gõ sai, hoặc số đếm đã đổi từ lúc in mã) — chạy lại bước 1.
- Chưa có bản sao lưu nào trong 24 giờ gần nhất — chạy lại bước 2.
- Đang trỏ vào bb-dev mà thiếu một cờ an toàn riêng — việc này chỉ dành cho
  kỹ thuật, admin không cần quan tâm cờ này.

Nếu bị từ chối, đọc dòng chữ đỏ trên màn hình — nó nói rõ vì sao, và bước nào
cần làm lại.

Xoá xong, lệnh in ra danh sách đã xoá bao nhiêu dòng ở mỗi bảng.

---

## Bước 4 — Nạp lại từ Lark

```
npm run db:nap-lai -- --nap
```

Lệnh chạy lần lượt bốn bước lấy dữ liệu từ Lark: danh mục sản phẩm, khách và
bộ ảnh, hợp đồng, và trạng thái chỉnh sửa. Mỗi bước in ra số dòng nạp được.

Nếu một bước lỗi giữa chừng, lệnh DỪNG NGAY — các bước sau chưa chạy. Đọc
dòng lỗi, báo kỹ thuật, đừng tự chạy lại nhiều lần.

Nạp xong cả bốn bước, mở thử app, kiểm vài bộ ảnh quen thuộc xem đúng chưa
rồi mới báo "đã mở cho khách".

---

## Tóm tắt bốn bước

| Bước | Lệnh | Xoá dữ liệu? |
|---|---|---|
| 1. Đếm | `npm run db:nap-lai` | Không |
| 2. Sao lưu | `npm run db:nap-lai -- --sao-luu "..."` | Không |
| 3. Xoá | `npm run db:nap-lai -- --xoa --xac-nhan ...` | **Có** |
| 4. Nạp lại | `npm run db:nap-lai -- --nap` | Không (chỉ ghi thêm) |

Làm đúng thứ tự 1 → 2 → 3 → 4. Không bỏ bước 2.
