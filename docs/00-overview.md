# 00 — Tổng quan dự án

## 1. Bối cảnh

BabyBean là studio chụp ảnh cho bé, có **3 chi nhánh**. Quy trình hiện tại:

1. Khách đặt lịch (qua Fanpage/Zalo/điện thoại), studio ghi nhận thủ công.
2. Chụp xong, thợ ảnh đổ ảnh RAW → cull → xuất ảnh preview.
3. Ảnh preview được upload lên **Google Drive**, tạo link chia sẻ công khai gửi khách qua Zalo.
4. Khách xem link, **nhắn tên file** (ví dụ "em chọn ảnh 0123, 0187, 0245...") qua Zalo.
5. Nhân viên chép tay danh sách, chuyển cho retoucher.
6. Retoucher chỉnh, giao album cuối.

**Điểm đau:**

| Vấn đề | Hệ quả |
|---|---|
| Khách nhắn tên file qua chat | Nhầm số, sót ảnh, mất tin nhắn, khó truy vết |
| Không đếm được quota gói | Cãi nhau về số ảnh miễn phí / ảnh mua thêm |
| Khách chọn chậm, nhân viên phải nhắc thủ công | Tồn đọng album, chậm giao hàng |
| Yêu cầu chỉnh sửa nói bằng lời | Retoucher hiểu sai, chỉnh lại nhiều lần |
| Không có số liệu | Không biết chi nhánh nào chậm, tỉ lệ chốt bao nhiêu |
| 3 chi nhánh dùng file/Drive riêng | Không có bức tranh chung |

## 2. Mục tiêu

**Mục tiêu chính (Phase 1–2)**
- Khách tự chọn ảnh trên web bằng một link, không cần cài app, không cần đăng ký.
- Studio nhận danh sách file đã chọn ở dạng máy đọc được (CSV / danh sách tên file để copy vào Lightroom).
- Kiểm soát quota gói chụp, tự tính ảnh mua thêm.
- Theo dõi tiến độ album của cả 3 chi nhánh trên một dashboard.

**Mục tiêu dài hạn (Phase 3–5)**
- Trở thành hệ quản trị chung của studio: booking, lịch nhân sự, giao hàng, doanh thu, CSKH.
- Đồng bộ hai chiều với **Lark** (đang dùng nội bộ) để không phá vỡ thói quen hiện có.

## 3. Phạm vi

### Trong phạm vi (Phase 1–2)
- Cổng khách hàng: mở link, xác thực nhẹ, xem/lọc/zoom ảnh, chọn, ghi chú, chốt đơn, chia sẻ cho người thân cùng chọn.
- Cổng quản trị: tạo album từ link Drive, đồng bộ ảnh, cấu hình quota/hạn/quyền tải, theo dõi tiến độ, xuất danh sách, quản lý khách, quản lý nhân sự, phân quyền theo chi nhánh, nhật ký hoạt động, báo cáo cơ bản.

### Ngoài phạm vi (giai đoạn đầu)
- Upload ảnh trực tiếp lên hệ thống (vẫn dùng Drive làm kho ảnh).
- Thanh toán online.
- Chỉnh sửa ảnh trong trình duyệt.
- App di động native.

## 4. Người dùng

| Vai | Mô tả | Nhu cầu chính |
|---|---|---|
| **Phụ huynh** (khách) | 25–40 tuổi, chủ yếu dùng điện thoại, mạng 4G | Mở nhanh, xem ảnh rõ, chọn dễ, chia sẻ cho chồng/bà xem cùng |
| **CSKH / Lễ tân** | Tại từng chi nhánh | Tạo album, gửi link, nhắc khách, chốt đơn |
| **Thợ ảnh** | Tại từng chi nhánh | Xem album mình chụp, tiến độ |
| **Retoucher** | Tập trung hoặc thuê ngoài | Nhận danh sách file + ghi chú chỉnh sửa |
| **Quản lý chi nhánh** | 3 người | Tiến độ và số liệu chi nhánh mình |
| **Chủ studio / Admin** | 1–2 người | Toàn quyền, số liệu toàn hệ thống |

## 5. Thuật ngữ

| Tiếng Việt | Code | Định nghĩa |
|---|---|---|
| Chi nhánh | `branch` | Một cơ sở BabyBean |
| Khách hàng | `customer` | Phụ huynh, chủ hợp đồng |
| Bé | `baby` | Đối tượng chụp, thuộc về customer |
| Buổi chụp | `shoot` | Một lần chụp, có ngày, chi nhánh, thợ ảnh, gói |
| Gói chụp | `package` | Định nghĩa quota ảnh, giá ảnh thêm |
| Album | `gallery` | Bộ ảnh preview của một buổi chụp; gắn 1 thư mục Drive |
| Ảnh | `photo` | Metadata một file ảnh, cache từ Drive |
| Link chia sẻ | `share_link` | Token + tuỳ chọn PIN để khách mở album |
| Phiên chọn | `selection` | Lượt chọn của một người (khách chính hoặc người thân) |
| Mục đã chọn | `selection_item` | Một ảnh được đánh dấu trong một phiên chọn |
| Quota | `included_quota` | Số ảnh miễn phí theo gói |
| Ảnh mua thêm | `extra_photo` | Ảnh vượt quota, tính phí |
| Chốt đơn | `submit` | Khách xác nhận cuối, album bị khoá |
| Ghi chú chỉnh sửa | `retouch_note` | Yêu cầu retouch cho một ảnh cụ thể |
| Giao hàng | `delivery` | Bàn giao album final |

## 6. Ràng buộc & giả định

- **Kho ảnh vẫn là Google Drive.** Hệ thống chỉ đọc metadata + hiển thị thumbnail, không lưu file gốc. Lý do: studio đã quen, chi phí lưu trữ bằng 0, không phải migrate.
- Thư mục Drive được chia sẻ ở chế độ **"Bất kỳ ai có đường liên kết"** (quyền Xem). Đây là điều kiện tiên quyết để đọc bằng API key.
- Quota Drive API mặc định: ~10.000 request/100 giây/project → phải cache metadata trong DB, không gọi Drive mỗi lần khách load trang.
- Khách hàng **không đăng ký tài khoản**. Xác thực nhẹ bằng token + PIN (mặc định 4 số cuối SĐT).
- Ứng dụng **song ngữ VI/EN**, mặc định VI.
- Ngân sách hạ tầng giai đoạn đầu: gói miễn phí/rẻ (Vercel Hobby/Pro + Supabase Free/Pro).

## 7. Chỉ số thành công

| Chỉ số | Hiện tại (ước tính) | Mục tiêu sau 3 tháng |
|---|---|---|
| Thời gian từ gửi link đến khách chốt | 5–10 ngày | ≤ 3 ngày |
| Tỉ lệ nhầm/sót ảnh khi chép danh sách | ~5% album | 0% |
| Thời gian nhân viên xử lý 1 đơn chọn ảnh | 20–30 phút | ≤ 3 phút |
| Tỉ lệ khách bán thêm ảnh ngoài quota | không đo được | đo được, và tăng |
| Album quá hạn không ai để ý | thường xuyên | 0 (có cảnh báo tự động) |
