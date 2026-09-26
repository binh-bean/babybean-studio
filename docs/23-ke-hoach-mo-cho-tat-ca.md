# 23. Kế hoạch mở app cho TẤT CẢ khách (26/09/2026)

Chủ studio chốt 26/09: app **đang thử, sắp cho tất cả khách chọn qua app**.
Tài liệu này nối tiếp `docs/18` (bảy cổng cắt sang bb-prod, chốt 17/09) và
cập nhật theo tình hình thật hôm nay.

## 1. Tình hình thật (chỉ đếm, đọc bb-dev 26/09)

| | |
|---|---|
| App trên `hauky.babybeanstudio.vn` đang chạy trên | **bb-dev** (không phải bb-prod) |
| Bộ ảnh thật trong bb-dev | 488 (nhập hàng loạt 12/09 và 16/09) |
| Link khách tạo trong 14 ngày | 25 — đều do chủ studio tự thử (xem mục 2) |
| Gia đình chọn ảnh trong 7 ngày | ~4; bộ chốt trong 14 ngày: 1 |
| Bộ lỗi Drive (thư mục chưa chia sẻ) | 73 — CSKH sửa qua khối "Cần xử lý" (BB-257) |
| Buổi chụp mới trên Lark | ~345/tháng |
| Migration trên bb-dev | tới 0073 |
| bb-prod | có 457 bộ ảnh cũ, chậm hơn bb-dev nhiều migration (đo 21/09: thiếu 4; từ đó thêm 0065–0073) |

## 2. CHỦ STUDIO CHỐT 26/09: toàn bộ link/lựa chọn hiện có là chủ studio TỰ THỬ

"tất cả đều là bản tôi tự làm để tự test. mở một phần để khi test xong toàn bộ
tôi sẽ báo xóa toàn bộ dữ liệu để cập nhật chạy thật trên khách."

Nghĩa là: chưa có khách thật cầm link → không có gì mất khi cắt. Khi chủ studio
báo "thử xong", làm một lượt: **xoá dữ liệu thử** (link, lựa chọn, ghi chú, yêu
cầu mua, đăng ký thông báo — giữ nguyên danh mục, nhân sự, chi nhánh, bộ ảnh
dựng từ Lark), chốt cơ sở dữ liệu chạy thật (A/B bên dưới, không còn ràng buộc
link sống), rồi mở cho khách. Kịch bản xoá phải CHỈ ĐỌC trước (đếm từng bảng),
chủ studio duyệt số đếm, rồi mới xoá trong một giao dịch.

## 2b. (Tham khảo) hai hướng khi cắt

Khi `docs/18` được viết, app chưa có khách thật nên "cắt sang bb-prod" chỉ là
đổi ba biến. Nếu lúc đó đã có khách thật cầm link trên bb-dev thì cắt sang bb-prod là
các link đó chết (mã link chỉ có trong bb-dev), lựa chọn tim/ghi chú của các
gia đình đang chọn không sang theo.

| | A. Giữ bb-dev làm cơ sở dữ liệu chính thức (Claude đề xuất) | B. Cắt sang bb-prod như `docs/18` |
|---|---|---|
| Link khách đang cầm | Sống nguyên | **Chết** — CSKH phải gửi lại ~25 link |
| Lựa chọn đang dở | Giữ nguyên | Mất, trừ khi chép sang (việc mới, dễ sai) |
| Việc phải làm | Dựng một cơ sở dữ liệu THỬ mới để phép thử không ghi vào dữ liệu thật; đổi tên gọi trong tài liệu | Áp ~12 migration lên bb-prod, 4 việc tay (`docs/18 §2`), nhập lại, gửi lại link |
| Rủi ro còn lại | Phép thử hiện ghi "Fixture…" vào DB thật — phải chuyển sang DB thử | Một lần cắt lớn đúng lúc bắt đầu có khách |
| Thời gian | ~1 buổi (Claude + Sonnet), chủ studio chỉ tạo 1 dự án Supabase mới | ~1 ngày, chủ studio ngồi cùng |

## 3. Các cổng còn lại (theo `docs/18 §1b`, cập nhật)

1. ✅ BB-183, BB-174·175·176, BB-177, BB-182 (đã xong từ trước).
2. ✅ Bộ ảnh mới tự vào app + lưới đỡ 08:00 (BB-256).
3. ✅ CSKH thấy bộ lỗi để sửa (BB-257). **Việc tay:** CSKH chia sẻ 73 thư mục Drive.
4. ⬜ Chốt mục 2 (A hay B) rồi làm phần việc tương ứng.
5. ⬜ Sao lưu hằng tuần (`docs/11 §7`) — trên cơ sở dữ liệu chính thức đã chọn.
6. ⬜ Một lượt đi trọn đường như khách thật — chủ studio, điện thoại thật, 4G.
7. ⬜ BB-253/258 (giao diện màn khách theo bản vẽ) lên app — đang soát.

## 4. Việc KHÔNG chặn mở cho tất cả

Báo cáo điều hành (BB-260…), dòng thời gian (BB-259), dữ liệu hoá đơn Lark cho
báo cáo sales/tài chính (BB-203 phần 2) — làm song song, không giữ khách lại.
