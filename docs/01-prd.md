# 01 — Yêu cầu sản phẩm (PRD)

Ký hiệu ưu tiên: **P0** = bắt buộc cho bản chạy thật · **P1** = quan trọng, sau P0 · **P2** = phát triển sau.

> Giá trị mặc định cụ thể (hạn chốt, PIN, quyền tải, giá ảnh thêm) đã chốt ở [`docs/13-quyet-dinh-van-hanh.md`](13-quyet-dinh-van-hanh.md). Tài liệu này mô tả **hành vi**; tài liệu 13 giữ **con số**.

---

# PHẦN A — CỔNG KHÁCH HÀNG

## A1. Mở album (P0)

**US-A1.1** — Là phụ huynh, tôi mở link `https://chon-anh.babybean.vn/g/aB3xK9pQ` trên điện thoại và thấy ngay album của bé mình.

Tiêu chí nghiệm thu:
- Trang hiển thị: ảnh bìa, tên bé, ngày chụp, chi nhánh, logo BabyBean.
- Hiện rõ: "Bạn được chọn **20** ảnh miễn phí. Ảnh thứ 21 trở đi: **50.000đ/ảnh**."
- Hiện hạn chốt và đếm ngược nếu còn ≤ 3 ngày.
- Thời gian hiển thị ảnh đầu tiên ≤ 2,5s trên 4G.
- Link sai/hết hạn/đã bị thu hồi → trang thông báo lịch sự kèm nút "Liên hệ studio" (Zalo/hotline chi nhánh).

**US-A1.2** — Xác thực nhẹ. Nếu album bật bảo vệ, tôi nhập **PIN 4 số** (mặc định: 4 số cuối SĐT đăng ký) trước khi xem.
- Sai 5 lần trong 15 phút → khoá 15 phút, có thông báo.
- Nhập đúng → giữ phiên 7 ngày trên thiết bị đó (cookie ký, `HttpOnly`, `SameSite=Lax`).
- Có nút "Không nhớ PIN?" → hướng dẫn liên hệ chi nhánh.

## A2. Xem ảnh (P0)

**US-A2.1** — Lưới ảnh
- Lưới masonry/vuông, mặc định 2 cột trên mobile, 4–6 cột trên desktop; có nút đổi mật độ (nhỏ/vừa/lớn).
- Lazy-load + skeleton; virtualize khi album > 200 ảnh.
- Album lên tới **1.500 ảnh** vẫn cuộn mượt (≥ 50 fps trên thiết bị tầm trung).
- Ảnh có watermark nhẹ nếu studio bật (logo mờ góc dưới).

**US-A2.2** — Xem lớn (lightbox)
- Bấm ảnh → mở toàn màn hình, vuốt trái/phải để chuyển, pinch để zoom.
- Phím tắt desktop: `←` `→` chuyển, `Space` chọn/bỏ chọn, `F` yêu thích, `Esc` đóng.
- Hiển thị tên file, số thứ tự (`142 / 860`), trạng thái chọn.
- Preload 3 ảnh kế tiếp.

**US-A2.3** — Bộ lọc & sắp xếp
- Lọc: Tất cả · Đã chọn · Chưa chọn · Yêu thích · Có ghi chú.
- Sắp xếp: theo tên file (mặc định, natural sort), theo thời gian chụp.
- Nhóm theo thư mục con của Drive nếu có (ví dụ "Concept 1", "Concept 2") → hiển thị thành tab/section.

## A3. Chọn ảnh (P0)

**US-A3.1** — Chọn / bỏ chọn
- Một chạm vào biểu tượng trên góc ảnh để chọn; ảnh đã chọn có viền + số thứ tự chọn.
- Optimistic UI: đánh dấu ngay, đồng bộ nền. Mất mạng → xếp hàng đợi, tự gửi lại khi có mạng, có chỉ báo "Đang lưu…/Đã lưu".
- Bộ đếm dính (sticky) luôn hiển thị: `Đã chọn 18/20 · thêm 0 ảnh trả phí`.

**US-A3.2** — Vượt quota
- Khi chọn ảnh thứ 21: hộp thoại "Ảnh này vượt gói của bạn, phụ thu 50.000đ. Tiếp tục?" (có tuỳ chọn "Không hỏi lại trong lần chọn này").
- Bộ đếm chuyển sang: `Đã chọn 24/20 · thêm 4 ảnh × 50.000đ = 200.000đ`.
- Studio có thể đặt **giới hạn cứng** (`max_selection`) — vượt là không cho chọn nữa.

**US-A3.3** — Yêu thích
- Đánh dấu ⭐ độc lập với "chọn", dùng để đánh dấu ảnh phân vân/ưu tiên chỉnh kỹ.

**US-A3.4** — Ghi chú chỉnh sửa
- Mỗi ảnh có ô ghi chú (tối đa 500 ký tự) + chip gợi ý sẵn: "Xoá mụn sữa", "Làm sáng da", "Xoá vật thể lạ", "Cắt cúp lại", "Đổi nền", "Ghép mắt mở".
- Ghi chú chung cho cả album (tối đa 1.000 ký tự).

**US-A3.5** — Tự động lưu & tiếp tục sau
- Rời trang rồi quay lại (cùng thiết bị) → khôi phục nguyên trạng.
- Mở trên thiết bị khác bằng cùng link + PIN → thấy đúng lựa chọn (state ở server, không chỉ localStorage).

## A4. Cùng chọn với người thân (P1)

**US-A4.1** — Khách chính bấm "Mời người khác cùng xem" → sinh link phụ với vai trò:
- `viewer` — chỉ xem
- `suggester` — được đánh dấu "đề xuất", hiện dưới dạng gợi ý cho khách chính, không tính vào quota
- `co-editor` — chọn/bỏ chọn như khách chính

**US-A4.2** — Hiển thị ai đã đề xuất ảnh nào (avatar chữ cái + tên tự đặt).
**US-A4.3** — Chỉ khách chính (`owner`) được bấm chốt đơn.

## A5. Chốt đơn (P0)

**US-A5.1** — Nút "Xác nhận chọn ảnh" luôn ở thanh dưới.
- Màn hình xác nhận: số ảnh đã chọn, số ảnh vượt quota + thành tiền, danh sách tên file, ghi chú.
- Cảnh báo nếu chọn ít hơn quota: "Bạn còn 3 ảnh miễn phí chưa dùng. Chốt luôn?"
- Ô nhập tên người xác nhận + tick "Tôi xác nhận danh sách trên là cuối cùng".

**US-A5.2** — Sau khi chốt
- Album chuyển `submitted`, khoá mọi thao tác chọn.
- Hiện màn hình cảm ơn + tóm tắt + nút tải file tóm tắt (PDF/PNG).
- Gửi thông báo cho studio (Lark webhook / email).
- Khách vẫn xem lại được album ở chế độ chỉ đọc.

**US-A5.3** — Mở lại
- Chỉ nhân viên có quyền mới `reopen` được, phải ghi lý do, có ghi log.

## A6. Tải ảnh (P1)

**US-A6.1** — Nếu studio cho phép: khách tải bản preview (có watermark) từng ảnh hoặc ZIP các ảnh đã chọn.
**US-A6.2** — Mặc định **tắt**. Có log mỗi lượt tải.

## A7. Trải nghiệm khác (P1)

- Song ngữ VI/EN, tự nhận theo trình duyệt, có nút đổi.
- Chế độ tối.
- Có thể "Thêm vào màn hình chính" (PWA nhẹ).
- Trang chia sẻ có OG image đẹp (ảnh bìa album + logo) khi dán link vào Zalo/Messenger.
- Hỗ trợ đọc màn hình cơ bản, tương phản đạt WCAG AA.

---

# PHẦN B — CỔNG QUẢN TRỊ

## B1. Xác thực & phân quyền (P0)

**US-B1.1** — Nhân viên đăng nhập bằng email + mật khẩu (Supabase Auth); hỗ trợ Google Workspace SSO nếu studio có.
**US-B1.2** — Mỗi người thuộc ≥ 1 chi nhánh và có 1 vai trò. Chi tiết ma trận quyền: `docs/05-rbac.md`.
**US-B1.3** — Người dùng chỉ thấy dữ liệu của chi nhánh mình, trừ `owner`/`admin`.

## B2. Dashboard (P0)

**US-B2.1** — Thẻ số liệu: album đang chờ khách chọn · sắp hết hạn (≤2 ngày) · **quá hạn** · đã chốt chờ retouch · đã giao trong tháng.
**US-B2.2** — Danh sách "Cần xử lý ngay" xếp theo mức khẩn.
**US-B2.3** — Bộ lọc theo chi nhánh (nếu có quyền), theo thợ ảnh, theo khoảng ngày.

## B3. Quản lý album (P0)

**US-B3.1** — Tạo album
- Dán link thư mục Drive → hệ thống parse `folderId`, kiểm tra quyền truy cập, đếm số ảnh, hiện xem trước 6 ảnh đầu.
- Báo lỗi rõ ràng nếu thư mục chưa mở công khai, kèm hướng dẫn 3 bước để sửa.
- Chọn khách hàng (hoặc tạo mới), bé, ngày chụp, chi nhánh, thợ ảnh, gói chụp.
- Quota tự điền theo gói, cho phép ghi đè.

**US-B3.2** — Đồng bộ ảnh
- Nhấn "Đồng bộ" → job đọc toàn bộ file trong thư mục (kể cả thư mục con, tối đa 2 cấp), lưu metadata vào `photos`.
- Chạy nền, có thanh tiến trình, chịu được album 2.000 ảnh.
- Đồng bộ lại: thêm ảnh mới, đánh dấu ảnh đã bị xoá khỏi Drive là `missing` (không xoá lựa chọn của khách).

**US-B3.3** — Cấu hình album
- `included_quota`, `extra_photo_price`, `max_selection` (tuỳ chọn), hạn chốt.
- Bật/tắt: PIN, watermark, cho tải, cho mời người thân, cho ghi chú.
- Đổi ảnh bìa, đổi tiêu đề, lời nhắn riêng gửi khách.

**US-B3.4** — Theo dõi & xuất
- Xem realtime khách đã chọn bao nhiêu, lần mở gần nhất, thiết bị.
- Xem đúng lưới ảnh khách thấy, đánh dấu ảnh nào được chọn.
- Xuất: CSV (tên file, ghi chú, trạng thái) · TXT danh sách tên file cách nhau bởi xuống dòng · copy nhanh chuỗi tên file để dán vào bộ lọc Lightroom/Bridge · PDF phiếu chọn ảnh có chữ ký xác nhận.

**US-B3.5** — Hành động
- Gửi link (sinh nội dung tin nhắn mẫu để copy sang Zalo).
- Nhắc khách (thủ công ở P0, tự động ở P1).
- Gia hạn / thu hồi link / mở lại album / lưu trữ album.

## B4. Quản lý khách hàng (P0)

- Hồ sơ khách: tên, SĐT, Zalo, email, ghi chú, chi nhánh thường đến.
- Danh sách bé: tên, biệt danh, ngày sinh (để nhắc sinh nhật ở Phase 3).
- Lịch sử: các buổi chụp, album, ảnh đã chọn, số tiền phụ thu.
- Chống trùng: cảnh báo khi trùng SĐT.

## B5. Quản lý gói chụp (P0)

- CRUD gói: tên, chi nhánh áp dụng, giá, số ảnh miễn phí, giá ảnh thêm, số ảnh in, mô tả.
- Gói dùng chung hoặc riêng theo chi nhánh.

## B6. Quản lý nhân sự & chi nhánh (P0)

- CRUD chi nhánh: tên, địa chỉ, hotline, Zalo OA, giờ làm việc, logo.
- CRUD nhân sự: mời qua email, gán vai trò + chi nhánh, vô hiệu hoá.
- Không cho tự nâng quyền của chính mình.

## B7. Nhật ký hoạt động (P0)

- Ghi mọi hành động quan trọng: tạo/sửa/xoá album, đổi quota, mở lại đơn, thu hồi link, đăng nhập thất bại, xuất dữ liệu, khách chốt đơn.
- Lọc theo người, theo album, theo khoảng thời gian. Chỉ đọc, không sửa được.

## B8. Báo cáo (P1)

- Số album theo chi nhánh / tháng; tỉ lệ chốt; thời gian trung bình từ gửi link đến chốt.
- Doanh thu ảnh mua thêm theo chi nhánh.
- Xếp hạng ảnh được chọn nhiều nhất theo thợ ảnh (phục vụ đào tạo).
- Xuất Excel.

## B9. Cài đặt hệ thống (P1)

- Thương hiệu: logo, màu chủ đạo, tên hiển thị, domain tuỳ chỉnh.
- Mẫu tin nhắn: gửi link, nhắc hạn, cảm ơn sau chốt (biến `{ten_be}`, `{han_chot}`, `{link}`).
- Cấu hình watermark: ảnh, độ mờ, vị trí.
- Tích hợp: webhook Lark, Zalo OA, Google Drive credentials.

---

# PHẦN C — MỞ RỘNG (P2, để sau)

Đã tính trước trong mô hình dữ liệu để không phải đập đi làm lại:

| Module | Nội dung |
|---|---|
| **Booking** | Lịch đặt chụp, phòng chụp, gán thợ, nhắc lịch, trạng thái cọc |
| **Sản xuất** | Hàng đợi retouch, gán retoucher, deadline, duyệt nội bộ, sửa lại |
| **Giao hàng** | Album in, USB, link tải final, trạng thái giao, ký nhận |
| **Kho & tài sản** | Đạo cụ, trang phục theo chi nhánh, mượn/trả |
| **Nhân sự** | Ca làm, chấm công, hoa hồng theo album |
| **Tài chính** | Hoá đơn, thu chi, đối soát ảnh mua thêm |
| **CSKH** | Nhắc sinh nhật bé, chiến dịch tái chụp, đánh giá NPS sau giao hàng |
| **Lark** | Đồng bộ hai chiều Lark Base, thông báo nhóm, phê duyệt |

---

# PHẦN D — Yêu cầu phi chức năng

| Nhóm | Yêu cầu |
|---|---|
| **Hiệu năng** | LCP ≤ 2,5s trên 4G; API p95 ≤ 400ms; album 1.500 ảnh cuộn mượt |
| **Khả dụng** | 99,5%/tháng; sự cố Drive không làm sập trang (dùng metadata đã cache) |
| **Bảo mật** | Xem `docs/12-security.md`. Không index công cụ tìm kiếm. Rate limit chống dò token |
| **Riêng tư** | Ảnh trẻ em: không gửi bên thứ ba, không dùng cho quảng cáo nếu chưa có đồng ý; có cơ chế xoá theo yêu cầu |
| **Khả năng mở rộng** | 3 chi nhánh → 10 chi nhánh mà không đổi kiến trúc |
| **Tương thích** | iOS Safari 15+, Chrome Android 100+, Chrome/Edge/Safari desktop bản mới |
| **Vận hành** | Nhân viên không rành công nghệ dùng được sau 15 phút hướng dẫn |
| **Ngôn ngữ** | VI mặc định, EN đầy đủ |
