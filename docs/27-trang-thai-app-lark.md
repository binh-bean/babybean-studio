# 27 — Trạng thái bộ ảnh: app ↔ Lark Hậu Kỳ

> BB-332 (30/09/2026). Nguồn cho tài liệu vận hành. Mã nguồn duy nhất:
> `src/lib/lark/trang-thai-app-lark.ts` → hàm `trangThaiBoAnh()`. Sửa hàm thì
> sửa bảng này trong cùng lần thay đổi. Màn quản trị và màn khách (BB-329) cùng
> gọi hàm đó, không tự suy nhãn riêng.

## 1. Luật chung

- **Lark là nguồn** từ "Đã chọn hình" trở đi (BB-285). App chỉ **đọc** cột
  "Trạng Thái" của bảng Hậu Kỳ, không bao giờ ghi sang.
- **Trừ một chỗ**: app đang ở `awaiting_approval` (chờ khách duyệt ảnh chỉnh) thì
  giữ nhãn của app, vì màn khách lúc đó có nút duyệt / xin sửa của chính app.
- **"Đang chỉnh sửa" chỉ khi Lark ở "Đang làm" trở đi.** CSKH xác nhận mà Lark
  chưa "Đang làm" thì bộ ảnh đang **xếp hàng**.
- App đã ghi "Đã giao" mà Lark còn chậm: tin app, không lùi nhãn.
- CSKH **mở lại** bộ ảnh sau lần đổi Lark cuối: trạng thái Lark cũ hết hiệu lực
  cho tới khi Lark đổi lần nữa (`maLarkConHieuLuc`).

## 2. Bảng ánh xạ

| # | Mã app (`ma`) | Khi nào | Lark "Trạng Thái" | Màn quản trị | Màn khách | Bước khách |
|---|---|---|---|---|---|---|
| 1 | `moi_nhap` | Dòng Lark mới chưa thành bộ ảnh, hoặc bộ nháp chưa có link Drive | *(trống)* | Mới nhập | Bean đang chuẩn bị ảnh ạ | — |
| 2 | `dang_tai` | Có link Drive, đang kéo ảnh (`draft`/`syncing`) | *(trống)* | Đang tải ảnh | Bean đang chuẩn bị ảnh ạ | — |
| 3 | `loi_tai` | Có link Drive mà tải lỗi (`sync_error`), **hoặc** link đã thuộc bộ/dòng khác (luồng BB-325 hỏi nhân viên chọn) | *(trống)* | Lỗi tải | Bean đang chuẩn bị ảnh ạ | — |
| 4 | `cho_tao_link` | Đủ ảnh (`ready`) nhưng chưa có Link app | *(trống)* | Chờ tạo Link app | Bean đang chuẩn bị ảnh ạ | — |
| 5 | `san_sang` | Đủ ảnh + đã có Link app, bộ neo Lark, Lark chưa "Đã gửi file gốc" | *(trống)* | Sẵn sàng | Mời ba mẹ chọn ảnh ạ | Chọn ảnh |
| 6 | `cho_khach_chon` | Lark "Đã gửi file gốc", hoặc khách đang chọn (`in_review`/mở lại) | Đã gửi file gốc | Chờ khách chọn | Mời ba mẹ chọn ảnh ạ | Chọn ảnh |
| 7 | `cho_studio_xac_nhan` | Khách bấm chốt (`submitted`) | Đã gửi file gốc | Chờ studio xác nhận | **Bean đang xác nhận danh sách ảnh ạ** | Bean xác nhận |
| 8 | `da_chon_hinh` | CSKH xác nhận (`in_retouch`) mà Lark chưa "Đang làm"; hoặc Lark "Đã chọn hình" | Đã chọn hình | Đã chọn hình · chờ chỉnh sửa | Bean đã nhận danh sách, ảnh đang chờ chỉnh ạ | Bean xác nhận |
| 9 | `dang_chinh_sua` | | Đang làm | Đang chỉnh sửa | Bean đang chỉnh ảnh ạ | Chỉnh sửa |
| 10 | `leader_kiem` | | Leader check hình | Leader đang kiểm ảnh | Bean đang chỉnh ảnh ạ | Chỉnh sửa |
| 11 | `cho_khach_duyet` | Lark "Đã gửi duyệt", hoặc app `awaiting_approval` | Đã gửi duyệt | Chờ khách duyệt | Ảnh đã chỉnh xong, mời ba mẹ duyệt ạ | Duyệt ảnh |
| 12 | `dang_sua_theo_yeu_cau` | | Sửa / Sửa lần 2, 3, 4 | Đang sửa theo yêu cầu | Bean đang sửa theo yêu cầu của ba mẹ ạ | Duyệt ảnh |
| 13 | `da_chot_cho_in` | Lark "Đã chốt chưa in", hoặc app `approved` | Đã chốt chưa in | Đã chốt, chờ in | Ảnh đã chốt, Bean đang chuẩn bị in ạ | In & giao |
| 14 | `dang_in` | | Đã gửi in | Đã gửi in | Bean đang in sản phẩm ạ | In & giao |
| 15 | `hinh_da_ve` | | Hình đã về | Ảnh đã về, chờ giao | Sản phẩm đã về, mời ba mẹ ghé nhận ạ | In & giao |
| 16 | `da_giao` | Lark "Đã giao", hoặc app `delivered` | Đã giao | Đã giao | Ảnh của bé đã hoàn thiện ạ | In & giao |
| 17 | `da_cham_soc` | | Đã chăm sóc khách | Đã chăm sóc khách | Ảnh của bé đã hoàn thiện ạ | In & giao |
| 18 | `het_han` | App `expired` (link hết hạn, chưa chốt) | — | Link đã hết hạn | Link đã hết hạn ạ | Chọn ảnh |
| 19 | `luu_tru` | App `archived` | — | Đã lưu trữ | Bộ ảnh không còn mở ạ | — |

Các bước của thanh tiến độ bên khách (`BUOC_KHACH`): **Chọn ảnh → Bean xác
nhận → Chỉnh sửa → Duyệt ảnh → In & giao**.

**BB-353 — một hàm cho màn khách.** Màn khách chỉ có `status` + giai đoạn Lark đã
tính sẵn, nên đọc bảng này qua `trangThaiKhach(status, giaiDoan, { khoa })`. Bìa
(cột `bia` trong mã, gắn tên bé), thẻ tiến trình, màn cảm ơn sau chốt, dải khoá
đầu lưới và bìa của người thân được mời đều đọc từ đó. Nhãn khách theo giọng Bean:
tự xưng "Bean", câu nào cũng kết bằng "ạ" (phép thử `bb-353-giong-bean`).

Mã lựa chọn Lark (không đổi khi nhân viên đổi tên hiển thị) ở
`src/lib/lark/trang-thai-hau-ky.ts` → `TRANG_THAI_LARK`.

## 3. Bản ghi mới từ Lark

Luật chủ studio (chốt 30/09/2026): một dòng Hậu Kỳ là **bản ghi mới** khi đủ
**cả ba** điều kiện:

1. có **tên khách + SĐT + gói chụp**;
2. cột **"Trạng Thái" trống**;
3. cột **"Link app" trống** — cột app ghi link khách ngược sang Lark
   (`ghi-link-app.ts`, mẫu tên `MAU_TEN_COT_LINK_APP`), tức **chưa gửi link
   ảnh cho khách**.

Link Drive ("Link ảnh gửi khách") **không** phải điều kiện: có rồi thì dòng hiện
"Mới nhập" kèm link sẵn, chưa có thì hiện "· chưa có link Drive". Không có luật
"Đã gửi file gốc trong N ngày".

Mọi dòng cũ đã xử lý đều có "Trạng Thái" (đo 30/09: 3.440/3.440 dòng) nên không
lọt vào khối; 8/3.440 dòng đã có "Link app".

Hiện ở khối **"Bản ghi mới từ Lark"**, đầu Bàn làm việc. Nhân viên bấm **Tạo bộ
ảnh** → thuật sĩ tạo bộ ảnh (BB-325) đã điền sẵn mã hoá đơn + SĐT, tự tra Lark,
nhân viên bổ sung link Drive rồi tạo bộ ảnh + Link app. Bộ ảnh tạo xong neo
`lark_hauky_record_id` → dòng rời khối.

### Đồng bộ "gần như tức thì"

| Đường | Khi nào | Lượt gọi Lark |
|---|---|---|
| Hook Lark `/api/lark/hook` | Tự động hoá bên Lark bắn một dòng sang | có sẵn (đọc 1 dòng) |
| Mở Bàn làm việc (`GET /api/admin/lark-moi`) | Lượt trước cũ hơn **5 phút** | ~4 + 1/dòng mới |
| Nút **Đồng bộ ngay** (`POST`) | Nhân viên bấm; tối đa 1 lượt/30 giây | như trên |
| Cron sáng 08:00 (`/api/cron/hau-ky`) | Mỗi ngày | quét đủ bảng (đã có) |

Không có cron 5–10 phút vì gói Vercel Hobby chỉ cho 2 cron/ngày. Không ai mở
Bàn làm việc thì không tốn lượt gọi Lark nào.

### Lark xoá dòng

| Trường hợp trong app | App làm gì |
|---|---|
| Bản ghi mới, chưa thành bộ ảnh | Xoá khỏi khối (bảng `lark_ban_ghi_moi` chỉ là bản sao) |
| Bộ ảnh **chưa gửi khách**: `draft`/`syncing`/`sync_error`/`ready`, **chưa có Link app nào**, **chưa có ảnh chọn** | **Lưu trữ** (`archived`), không xoá cứng — đảo lại được |
| Bộ ảnh **đã có Link app** hoặc **đã có ảnh chọn** hoặc đã qua `ready` | **KHÔNG xoá.** Đánh dấu `lark_dong_da_xoa_luc` → Việc cần xử lý, tab **"Dòng Lark đã bị xoá"**. CSKH gắn lại dòng Lark đúng hoặc lưu trữ, rồi bấm "Đã xử lý" |

Chốt an toàn: một lượt thấy **quá 20** dòng/bộ ảnh "bị xoá" thì coi là đọc Lark
hỏng — không làm gì, chỉ ghi log.

## 4. Xác nhận mua thêm đã thanh toán

"Số dư của khách = 0 là đã thanh toán đủ": số dư = phải thu − đã ghi có (sổ
`gallery_payments`, gồm cả dòng giảm giá BB-320). Hàm:
`src/lib/gallery/thanh-toan-mua-them.ts` → `trangThaiThanhToan()`.
Cột mã hoá đơn mua thêm, mã phiếu thu, mốc xác nhận từng đợt: migration 0080
(chưa áp, chưa có màn hình ghi).

## 4. Đổi trạng thái Lark → làm mới màn hình + chuông (BB-347)

Khi Lark đẩy một dòng sang (`/api/lark/hook`) và cột "Trạng Thái" đổi thật, app
phát tín hiệu `lark.trang_thai` để màn khách và màn nhân viên tự tải lại, và gửi
chuông + đẩy cho ba mẹ ở **đúng ba mốc**: Đã chọn hình ("Đã xác nhận danh sách"),
Đang làm ("Đang chỉnh sửa"), Hình đã về. **Không** báo "Đã giao". Hướng dẫn cài
Automation trên Lark: `docs/28-tu-dong-hoa-lark-sang-app.md`.
