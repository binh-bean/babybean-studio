# 25 — Hướng dẫn màn quản trị

> Viết cho chủ studio và CSKH — không cần biết lập trình. Cập nhật theo BB-280
> (27/09/2026): sắp lại menu quản trị cho gọn theo việc thật đang làm, và cho
> mọi trang cùng một cỡ chữ tiêu đề.

## Bốn nhóm trong menu bên trái

Menu quản trị chia bốn nhóm, mỗi nhóm một tiêu đề nhỏ chữ hoa:

### 1. Tổng quan
**Bảng điều khiển** — mở app lên là thấy màn này. Khối "Cần xử lý ngay" nằm
trên cùng: đây là những bộ ảnh sắp trễ hẹn hoặc đã trễ hẹn với khách, cần làm
trước tiên trong ngày. Bên dưới là các con số tổng quan (đang chờ khách chọn,
sắp hết hạn, quá hạn, chờ chỉnh ảnh, đã giao trong tháng) và biểu đồ album tạo
mới 14 ngày gần nhất.

### 2. Vận hành — việc hằng ngày của CSKH
- **Bộ ảnh** — danh sách mọi bộ ảnh, tạo bộ ảnh mới, xem/sửa từng bộ.
- **Khách hàng** — tra cứu và sửa thông tin khách.
- **Việc cần xử lý** — MỘT trang gộp ba việc trước đây nằm ba mục riêng, chia
  làm ba thẻ (tab), mỗi thẻ có số đếm ngay trên nhãn:
  - *Bộ ảnh lỗi tải* — thư mục Drive chưa kéo được ảnh về, cần sửa quyền chia
    sẻ hoặc đường dẫn.
  - *Link sắp hết hạn* — link đã gửi khách sắp tới ngày hết hạn, cần gia hạn
    trước khi khách bấm vào gặp trang báo lỗi.
  - *Ảnh vượt hạn mức* — khách đã chọn nhiều ảnh hơn gói đã mua, chưa thu thêm
    tiền.

  Link cũ (nếu ai đó đã lưu hoặc gửi) vẫn mở được — tự động nhảy sang đúng
  thẻ tương ứng.

### 3. Báo cáo
**Báo cáo điều hành** — xem số liệu theo khoảng ngày, so kỳ trước, xuất file.
Không thao tác sửa gì ở đây, chỉ xem và tải về. (Ẩn với tài khoản Photoshop
CTV — không thuộc việc của vai trò này.)

### 4. Hệ thống — chỉ chủ studio và quản trị hệ thống thấy trọn
- **Chi nhánh** — tên, địa chỉ, hotline từng chi nhánh.
- **Nhân sự & vai trò** — hai thẻ:
  - *Nhân sự* — cấp tài khoản, gán vai trò và chi nhánh cho nhân viên.
  - *Vai trò* — chín vai có sẵn (chỉ xem, vì hệ thống bảo mật đang dựa vào),
    và vai tự tạo (sửa/xoá được).
- **Cài đặt** — các con số điều khiển app thật: hạn chốt mặc định, hạn link,
  giá ảnh chọn thêm, watermark, v.v. Đổi ở đây thay vì phải nhờ sửa cơ sở dữ
  liệu.
- **Nhật ký thao tác** — lịch sử ai làm gì, khi nào. Chỉ xem, không sửa được.

## Thứ tự việc buổi sáng của CSKH

1. **Bảng điều khiển** — nhìn khối "Cần xử lý ngay" trước tiên: có bộ ảnh nào
   quá hạn hoặc sắp hết hạn hôm nay không.
2. **Việc cần xử lý** — lướt qua ba thẻ, xử lý thẻ nào có số đếm cao trước
   (bộ ảnh lỗi tải thường cần sửa gấp nhất vì khách chưa xem được gì).
3. **Bộ ảnh** — vào việc thường ngày: tạo bộ ảnh mới, cập nhật bộ ảnh đang
   làm, gửi link cho khách.
4. **Khách hàng** — tra cứu khi khách gọi hỏi, cập nhật thông tin liên hệ.

## Chủ studio xem gì hằng tuần

- **Báo cáo điều hành** — doanh thu, số bộ ảnh hoàn thành, so với tuần/tháng
  trước.
- **Bảng điều khiển** — mục "Tiến độ theo chi nhánh": chi nhánh nào đang chốt
  chậm hơn các chi nhánh còn lại.
- **Việc cần xử lý** — nếu số đếm ở thẻ "Bộ ảnh lỗi tải" hay "Link sắp hết
  hạn" không giảm qua nhiều ngày, nghĩa là CSKH đang bỏ sót — cần nhắc trực
  tiếp.
- **Nhân sự & vai trò** — kiểm tài khoản nào lâu không đăng nhập (nhãn "Quá 60
  ngày không đăng nhập" trong thẻ Nhân sự), cân nhắc cho nghỉ tài khoản không
  còn dùng.
