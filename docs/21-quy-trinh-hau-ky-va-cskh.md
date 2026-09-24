# 21. Quy trình hậu kỳ & CSKH — bản chuẩn của studio

**Nguồn:** sơ đồ "QUY TRÌNH HẬU KỲ & CSKH" chủ studio gửi ngày 24/09/2026
(`thuong hieu/QUY TRÌNH HẬU KỲ & CSKH.png`, 10.316×2.837 px). Claude chép lại
nguyên ý từng nhánh — **mọi con số ngày ở đây là số trên sơ đồ, không suy ra**.
Chỗ sơ đồ bị cắt chữ (…) ghi rõ là bị cắt.

Đây là nguồn chuẩn cho BB-200 (luồng trạng thái nối Lark) và cho bộ nhắc
(thay `gallery.reminder_days` hiện chỉ có một dãy mốc chung).

## Ba loại khách — rẽ nhánh theo HOÁ ĐƠN

| Nhánh | Nhận biết | Màu cảnh báo nền |
|---|---|---|
| **A. Làm ảnh nhanh** | Hoá đơn có dịch vụ "làm ảnh nhanh" | ĐỎ ngay từ đầu |
| **B. Làm trước ảnh phóng / toàn bộ trước timeline** | Khách được hỗ trợ, ghi chú trong hoá đơn | CAM ngay từ đầu |
| **C. Bình thường** | Còn lại | theo mốc ngày |

Thang màu: **xanh (an toàn) → cam → đỏ → tím** (tím = quá hạn nặng, báo quản lý).

---

## Giai đoạn 0 — Khởi tạo

- **Đã chụp xong:** thợ ảnh (Foto) cập nhật bảng lịch chụp là "đã chụp xong" →
  vào bảng Hậu kỳ cập nhật link ảnh gốc gửi khách (quy chuẩn: tên mẹ là tiêu đề,
  phía dưới là link folder) → gửi link cho khách trên kênh liên lạc đã có → kéo
  sang **"Đã gửi file gốc"** trong Hậu kỳ.
- **Chưa chụp xong:** thợ ảnh cập nhật "chưa chụp xong" → vẫn cập nhật link ảnh
  gốc như trên → để trạng thái **"Chưa phân loại"** (đợi chụp hoàn thành).

## Giai đoạn 1 — Đã gửi file gốc (chờ khách chọn ảnh)

**A. Làm ảnh nhanh**
- Tính từ mốc gửi file gốc: cảnh báo **ĐỎ** ngay.
- Sau **1 ngày** → nhắc CSKH liên hệ khách chọn ảnh.
- Các ngày tiếp theo → tiếp tục nhắc CSKH nếu khách chưa chọn và bộ ảnh chưa đổi trạng thái.

**B. Làm trước ảnh phóng / toàn bộ trước timeline**
- Tính từ mốc gửi file gốc: cảnh báo **CAM** ngay.
- Sau **1 ngày** → nhắc CSKH xử lý yêu cầu hỗ trợ (đã ghi ở hoá đơn).
- Làm theo timeline. Trường hợp làm trước ảnh phóng hoặc album: sau khi giao
  sản phẩm, bộ ảnh **quay lại chu kỳ hậu kỳ một lần nữa** — khách chưa chọn hết
  ảnh thì để "đã gửi file gốc", đã chọn thì để "đã chọn hình".

**C. Bình thường** — nhắc CSKH, CSKH gọi điện/nhắn tin khách:
- Sau **3 ngày** từ ngày gửi file gốc.
- Sau **5 ngày**.
- Sau **10 ngày**.
- Sau **30 ngày**: nhắc chọn ảnh **và** nhắc khách lưu file về máy, vì **sau 60
  ngày file gốc trên hệ thống sẽ bị xoá**; kèm điều kiện: nếu sau 60 ngày khách
  chưa chọn ảnh thì dịch vụ được đóng lại và coi như đã hoàn thành.
- Từ lần nhắc ngày 30 trở đi: **cứ +30 ngày** nhắc khách một lần nếu chưa đổi
  trạng thái, cùng nội dung lưu file / 60 ngày.

Mẫu tin cho CSKH (mọi mốc): *"Hôm nay có …(số lượng)… bộ quá hạn N ngày gửi file
gốc nhưng khách chưa chọn ảnh, CSKH gọi điện nhắn tin nhắc khách chọn ảnh sớm
nhé: các bộ gồm {tên KH}, {link chat} + {sđt}"*.

## Giai đoạn 2 — Đã chọn hình

**A. Làm ảnh nhanh**
- Duy trì cảnh báo **ĐỎ** suốt quá trình.
- Sau **2 ngày** (từ lúc "đã chọn") chưa đổi trạng thái → **TÍM**.
- Sau **4 ngày** chưa đổi → gửi tin báo lỗi vi phạm cho **QUẢN LÝ**.
  Nội dung: *"Yêu cầu xử lý khủng hoảng: bộ ảnh của KH… đã không được xử lý đúng…"* (sơ đồ bị cắt).

**B. Làm trước ảnh phóng / toàn bộ**
- Duy trì cảnh báo **CAM** suốt quá trình.
- Xử lý theo timeline do nhân sự cập nhật và từ hoá đơn đã ghi.
- In trước ảnh phóng hoặc album: cập nhật bộ tới bước "đã giao", sau đó quay lại
  "đã gửi file gốc" và nhập… (sơ đồ bị cắt).

**C. Bình thường** (tính từ lúc trạng thái "đã chọn" mà chưa đổi):
- Sau **5 ngày** → **CAM**.
- Sau **7 ngày** → **ĐỎ**.
- Sau **9 ngày** → **TÍM**.
- Sau **10 ngày** → nhắn tin có **Quản lý** vào xử lý quá hạn hậu kỳ các bộ tím chưa làm.
- Đổi trạng thái từ "đã chọn" / "đang làm" sang "đã gửi duyệt" → về **an toàn**.

## Giai đoạn 3 — Đang làm

- Sau **2 ngày** từ khi đổi trạng thái mà chưa đổi tiếp → nhắn tin vào nhóm,
  cộng người photoshop, nhắc hoàn thành.

## Giai đoạn 4 — Leader check hình

- **5 giờ chiều hàng ngày** nhắn vào nhóm nhắc lead check để gửi khách, nếu có
  bộ ở giai đoạn này.

## Giai đoạn 5 — Đã gửi duyệt

Sau khi gửi file chỉnh sửa hoàn tất cho khách và đổi trạng thái → **an toàn**.
Chưa nhận phản hồi của khách thì nhắc CSKH liên hệ khách vào ngày thứ
**2, 5, 10, 20, 30** (tính từ lúc gửi duyệt).

Mẫu tin: *"Hôm nay có …{số lượng}… đã gửi duyệt N ngày mà chưa thay đổi trạng
thái gồm {Tên KH} + {sđt} + {Link chat}"*. (Sơ đồ ghi "2 ngày" ở cả năm mẫu tin —
có lẽ là chép lại; số ngày đúng của từng mốc là 2/5/10/20/30.)

## Giai đoạn 6 — Sửa

Tính từ lúc chuyển sang "sửa":
- Sau **2 ngày** chưa đổi → **ĐỎ**.
- Sau **3 ngày** chưa đổi → **TÍM**.
- Đổi trạng thái → về **xanh**.

Từ lần **sửa thứ 2–3**: chuyển **TÍM và giữ tím** qua các lần sửa tiếp theo cho
tới khi đổi sang "đã chốt in" / "đã in" thì tự về **an toàn**.

## Giai đoạn 7 — Đã chốt chưa in

- Đổi trạng thái → **an toàn**.
- **In ngay** nếu có dịch vụ làm ảnh nhanh hoặc chậm timeline.
- **5 giờ chiều** gửi tin nhắn nhắc in.

## Giai đoạn 8 — Đã in

- Sau **2 ngày** từ lúc đổi "đã in" mà chưa đổi → nhắn CSKH kiểm tra, cập nhật và
  làm việc với nhà in.

## Giai đoạn 9 — Hình đã về

- Kiểm tra chất lượng, đạt thì báo giao khách; không đạt thì check lỗi, in lại.
- Sau **2 ngày** từ "hình đã về" chưa đổi (hình đang trong kho) → nhắn CSKH nhắc khách lấy hình.
- Sau **5 ngày** vẫn chưa "đã giao" → nhắc CSKH: *"Hôm nay có …{số lượng}… đã 5
  ngày chưa đổi trạng thái {tên KH + SĐT + LINK CHAT} chưa đổi trạng thái đã giao"*.
- Sau **10 ngày** → nhắc tương tự với "10 ngày".

## Giai đoạn 10 — Đã giao

- Ghi nhận mốc thời gian.

## Giai đoạn 11 — Chăm sóc khách hàng

- Sau **2 ngày** từ "đã giao" → nhắn CSKH gọi điện và nhắn tin **cảm ơn**, xin
  phản hồi về chất lượng ảnh và dịch vụ.

---

## Bảng tóm tắt để làm thành mã (BB-200)

| GĐ | Trạng thái | Mốc (ngày, nhánh C) | Người nhận | Màn khách nên nói |
|---|---|---|---|---|
| 0 | Chưa phân loại / đã chụp | — | — | (chưa có link) |
| 1 | Đã gửi file gốc | 3 · 5 · 10 · 30 · +30… (60 ngày xoá file gốc) | CSKH | "Ảnh đã sẵn sàng, mời ba mẹ chọn" |
| 2 | Đã chọn hình | 5 cam · 7 đỏ · 9 tím · 10 quản lý | CSKH → quản lý | "Bộ ảnh đã được ghi nhận yêu cầu" (lời chủ studio, docs/19) |
| 3 | Đang làm | 2 | nhóm + thợ PTS | "Đang chỉnh sửa" |
| 4 | Leader check hình | 17:00 hằng ngày | nhóm (lead) | "Đang chỉnh sửa" |
| 5 | Đã gửi duyệt | 2 · 5 · 10 · 20 · 30 | CSKH | "Mời ba mẹ duyệt ảnh đã chỉnh" |
| 6 | Sửa | 2 đỏ · 3 tím; lần sửa ≥2 giữ tím | nhóm | "Đang sửa theo yêu cầu" |
| 7 | Đã chốt chưa in | 17:00 nhắc in | nhóm | "Đã chốt, đang chuẩn bị in" |
| 8 | Đã in | 2 | CSKH | "Đang in" |
| 9 | Hình đã về | 2 · 5 · 10 | CSKH | "Sản phẩm đã về, mời ba mẹ nhận" |
| 10 | Đã giao | — | — | "Đã giao" |
| 11 | Chăm sóc khách hàng | 2 sau đã giao | CSKH | (không hiện) |

Nhánh A/B có mốc riêng như trên. "Màn khách nên nói" là đề xuất của Claude —
riêng giai đoạn 2 là lời chủ studio.

## Việc còn phải đối chiếu khi làm BB-200

1. Tên trạng thái **chính xác** trong cột trạng thái của bảng Hậu kỳ trên Lark
   (sơ đồ dùng tên mô tả) — đọc từ dữ liệu Lark thật, không đoán.
2. Trường nào trong hoá đơn Lark cho biết "làm ảnh nhanh" và "làm trước ảnh
   phóng/album" (nhánh A/B).
3. Luật "60 ngày xoá file gốc, quá hạn coi như hoàn thành dịch vụ" đụng tới
   `docs/13 §11` (thời gian lưu ảnh) và BB-183 (link hết hạn) — phải khớp một số.

---

## Phụ lục — đối chiếu với bảng "🎯Hậu Kỳ" thật trên Lark (đọc 24/09/2026, chỉ đọc)

**Cột "Trạng Thái"** — 12 lựa chọn. Khớp theo **mã lựa chọn**, không theo tên
(luật docs/15 §2: nhân viên đổi tên hiển thị bất cứ lúc nào).

| GĐ | Mã lựa chọn | Tên trên Lark | Số bản ghi |
|---|---|---|---|
| 1 | `optDAI9nFV` | Đã gửi file gốc | 316 |
| 2 | `optl5DyKLx` | Đã Chọn Hình | 98 |
| 3 | `optmhzW4sL` | Đang làm | 11 |
| 4 | `optWz9BTWy` | Leader check hình | 4 |
| 5 | `optjJ9MNLL` | Đã Gửi Duyệt | 104 |
| 6 | `optjhQwMrT` | sửa | 8 |
| 6 (lần ≥2) | `optW0pvHGd` | Sửa lần 2,3,4 | 0 |
| 7 | `optsXat0f1` | Đã chốt chưa in | 9 |
| 8 | `optxMAdtNX` | Đã gửi In | 72 |
| 9 | `opttKmVbce` | Hình đã về | 284 |
| 10 | `opttHXFpgy` | Đã Giao | 2.055 |
| 11 | `optZUXP6XK` | Đã CSKH | 365 |
| — | (trống) | | 14 |

Tổng 3.340 bản ghi. Giai đoạn 0 ("Chưa phân loại") **không có** lựa chọn riêng
trên Lark — khớp với 14 bản ghi trống.

**Cột "Cảnh Báo"** — 4 mức: `optSj1R6PM` An Toàn (2.742) · `opt1E9Y1AQ` Cảnh Báo
(27) · `optmFaSbfW` Nguy Hiểm (36) · `optQEfwHOy` Phải Xong Trong Ngày (35) ·
trống (500). Ứng với thang màu của sơ đồ: an toàn = xanh; cam/đỏ/tím phải chốt
với chủ studio mức nào ứng mức nào.

**Mốc thời gian có sẵn trên Lark:** Ngày gửi file gốc · Ngày chọn ảnh · Ngày
Gửi In · Ngày ảnh về · Ngày giao ảnh · Ngày Deadline · "Số ngày chờ.".

**Nhánh A/B (làm nhanh / làm trước):**
- "Yêu cầu từ Hóa đơn" là cột tra cứu CHỮ TỰ DO (444 giá trị khác nhau: mã
  khung, quà tặng…; 2.805/3.340 trống) — không dùng làm cờ được.
- Bảng giá có sản phẩm **"Làm ảnh nhanh"** (500.000 ₫) → nhánh A nhận biết được
  qua dòng hoá đơn của bộ ảnh.
- Nhánh B chưa có trường nào có cấu trúc — chờ chủ studio chỉ cách nhận biết.

**Cột mới "Loại Hậu Kỳ"**: lựa chọn "Chup anh" / "Mua them/San pham in an",
hiện TRỐNG cả 3.340 bản ghi — khớp với luật "bộ ảnh rỗng theo hoá đơn" (BB-204).

**Cột phục vụ việc khác:** "Link HD" và "Hợp đồng chi tiết" (BB-203 — link hoá
đơn ở màn quản trị), "Nhãn Dán" (Sinh Nhật Gấp · Thêm Tên · Đã Nhắc Chọn · Đã in
ảnh phóng), "Trạng thái nhắc duyệt" (Đã nhắc), "Link app" (app đã ghi sang).

## Chủ studio chốt (24/09/2026)

1. **Thang màu ↔ cột "Cảnh Báo":** xanh = An Toàn · cam = Cảnh Báo · đỏ = Nguy
   Hiểm · tím = Phải Xong Trong Ngày.
2. **App KHÔNG ghi cột "Cảnh Báo" lên Lark** — "hiện tại Lark đã set tự động cho
   việc đó nên không cần ghi đè lên". Hệ quả cho BB-200: app ĐỌC trạng thái và
   mức cảnh báo từ Lark rồi hiện lại (màn quản trị, màn khách), không tự tính
   màu song song — hai nơi tính một thứ là có ngày lệch nhau.
   Còn phải hỏi: các tin NHẮC (CSKH, quản lý, 17:00) Lark đã tự gửi chưa — nếu
   rồi thì app không gửi trùng.
3. **Nhánh B (làm trước ảnh phóng/album):** để mở — "CSKH đang làm việc trên
   Lark, nên sẽ để mở để hoàn thiện sau".
