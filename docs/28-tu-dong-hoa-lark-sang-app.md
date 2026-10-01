# 28 — Tự động hoá Lark gửi sang app mỗi khi bảng Hậu Kỳ đổi

> BB-347 (01/10/2026). Viết cho chủ studio, không cần biết lập trình.
> Làm xong việc này thì mỗi lần nhân viên sửa một dòng ở bảng **Hậu Kỳ** trên
> Lark, app biết **ngay** (vài giây), không phải đợi 8 giờ sáng hôm sau.

## 0. Hai điều cần nhớ

- **Bí mật (`SYNC_CRON_SECRET`) anh tự điền.** Tài liệu này, và em, không bao
  giờ ghi giá trị thật. Chỗ nào thấy `<SYNC_CRON_SECRET>` là chỗ anh dán giá trị
  vào. Đừng gửi giá trị đó qua chat, email hay chụp màn hình.
- **Lark có thể gọi tên các nút hơi khác bản em mô tả** (giao diện Lark hay đổi,
  và có bản tiếng Anh, bản tiếng Việt). Chỗ nào em không chắc tên nút, em ghi
  **"(chưa chắc tên)"** — anh tìm nút có nghĩa gần nhất, đừng sợ nhầm: chưa bấm
  **Bật** thì chưa có gì chạy thật.

## 1. Việc này làm gì cho khách

Mỗi lần cột **Trạng Thái** của một dòng đổi **thật** (giá trị mới khác giá trị
app đang nhớ), app:

1. **Tự làm mới màn hình đang mở** — màn của ba mẹ (khách) và màn của nhân
   viên cùng chi nhánh, không cần F5.
2. **Gửi chuông + thông báo đẩy cho ba mẹ** — nhưng chỉ ở **đúng 3 mốc** trong
   bảng dưới. Đổi sang trạng thái khác thì chỉ làm mới màn hình, không rung điện
   thoại ai cả.

Không đổi gì (Lark gửi lại cùng một giá trị, hoặc chỉ cột Cảnh Báo / cột khác
đổi) thì app **không làm gì thêm**.

| Lark chuyển sang | Ba mẹ nhận chuông + đẩy? | Nội dung |
|---|---|---|
| Đã gửi file gốc | Không | — |
| **Đã chọn hình** | **Có** — "Đã xác nhận danh sách" | "Bean đã xác nhận danh sách ảnh ạ" |
| **Đang làm** | **Có** — "Đang chỉnh sửa" | "Bean đang chỉnh ảnh của bé ạ!" |
| Leader check hình | Không | — |
| Đã gửi duyệt | Không | — |
| Sửa / Sửa lần 2, 3, 4 | Không | — |
| Đã chốt chưa in | Không | — |
| Đã gửi in | Không | — |
| **Hình đã về** | **Có** — "Sản phẩm của bé đã về" | "Mời ba mẹ ghé Bean nhận ảnh của bé nhé ạ." |
| Đã giao | **Không** (anh đã bỏ) | — |
| Đã chăm sóc khách | Không | — |

Mỗi mốc chỉ báo **một lần** cho mỗi bộ ảnh:

- Nhân viên lỡ kéo trạng thái lùi rồi tiến lại → **không báo lần hai**.
- CSKH đã xác nhận đợt chọn ngay trong app (app đã gửi tin "Studio đã xác nhận
  đợt…") → khi Lark sang "Đã chọn hình" **không gửi thêm** tin xác nhận nữa.
- Lần đầu app đọc một dòng mà dòng đó đã ở sẵn "Đã chọn hình" hay "Đang làm" từ
  trước → **không báo** (để khỏi dội tin cũ cho khách).
- Nhảy cóc (từ "Đã gửi file gốc" thẳng sang "Đang làm") → chỉ báo mốc "Đang
  chỉnh sửa", không bù mốc bị bỏ qua.
- Bộ ảnh app đã ghi là **Đã giao** thì không báo mốc nào.

Lịch 08:00 sáng mỗi ngày **vẫn giữ nguyên** làm lưới đỡ: nếu hôm nào Lark gửi
hụt, đến sáng app vẫn đọc lại và cập nhật trạng thái. (Lưới đỡ 08:00 chỉ cập
nhật trạng thái và báo "Hình đã về"; hai mốc mới là việc của đường gửi tức thì
này.)

## 2. Chuẩn bị

Anh cần:

- Quyền **chỉnh sửa Base** của studio trên Lark (để tạo Automation).
- Giá trị `SYNC_CRON_SECRET` — anh đã lưu ở chỗ cấu hình biến môi trường của
  app trên Vercel (Project → Settings → Environment Variables). Nếu Vercel
  không cho xem lại giá trị, hãy dùng giá trị anh đã ghi chép lúc tạo; **không**
  tự đổi giá trị mới trừ khi anh định cập nhật cả hai nơi (Vercel và Lark) cùng
  lúc, vì đổi một nơi thì cái còn lại sẽ bị app từ chối.

## 3. Các bước tạo Automation số 1: "Khi bản ghi được sửa"

Làm trên bảng **Hậu Kỳ** của Base studio.

1. Mở Base của studio trên Lark, vào bảng **Hậu Kỳ**.
2. Tìm mục **Automation** (chưa chắc tên: có thể là "Automation", "Tự động hoá"
   hoặc biểu tượng tia chớp ở thanh trên). Bấm vào.
3. Bấm **tạo mới** (chưa chắc tên: "New automation", "Create", "Tạo quy trình").
   Đặt tên dễ nhớ, ví dụ: `Gửi sang app khi sửa dòng Hậu Kỳ`.
4. **Trigger (điều kiện kích hoạt):** chọn kiểu **"khi bản ghi được sửa"**
   (chưa chắc tên: "When a record is modified" hoặc "When record is updated").
   - **Bảng:** chọn **Hậu Kỳ**.
   - **Trường theo dõi:** anh muốn "gửi mọi thứ", nên chọn **mọi trường**
     (nếu Lark có ô "Any field" / "Tất cả trường" thì chọn ô đó). Nếu Lark bắt
     buộc phải tick từng trường, cứ tick **Trạng Thái** trước — đó là trường
     quan trọng nhất — rồi tick thêm các trường anh muốn app nhận.
5. Bấm thêm bước (chưa chắc tên: "Add action", "+"). Chọn hành động
   **"Gửi yêu cầu HTTP"** (chưa chắc tên: "Send HTTP request" /
   "HTTP request" / "Webhook"). Điền như sau:

   | Ô trên Lark | Điền |
   |---|---|
   | URL | `https://hauky.babybeanstudio.vn/api/lark/hook` |
   | Method | `POST` |
   | Header 1 — tên | `Authorization` |
   | Header 1 — giá trị | `Bearer <SYNC_CRON_SECRET>` (có đúng **một dấu cách** giữa chữ `Bearer` và bí mật; anh dán giá trị thật thay cho `<SYNC_CRON_SECRET>`, bỏ luôn hai dấu `<` `>`) |
   | Header 2 — tên | `Content-Type` |
   | Header 2 — giá trị | `application/json` |
   | Body (kiểu JSON / raw) | xem bên dưới |

6. **Body** là đoạn JSON gửi kèm, chỉ cần một ô là mã dòng:

   ```json
   {"record_id": "<Record ID của dòng>"}
   ```

   Phần `<Record ID của dòng>` **không gõ chữ**: trên Lark, đặt con trỏ vào
   giữa hai dấu ngoặc kép rồi bấm nút chèn biến (chưa chắc tên: "Insert
   variable", "+", biểu tượng `{x}`), chọn bước Trigger ở bước 4, rồi chọn mục
   **Record ID** (chưa chắc tên: "Record ID", "ID bản ghi", "ID của bản ghi").
   Giữ nguyên hai dấu ngoặc kép bao quanh biến. Sau khi chèn, ô sẽ trông kiểu
   `{"record_id": "[Record ID]"}` với `[Record ID]` là một thẻ màu.

   > **Nếu Lark không có mục Record ID trong danh sách biến** (em chưa kiểm
   > trên Lark của studio): thêm vào bảng Hậu Kỳ một **cột công thức** có công
   > thức `RECORD_ID()` (hàm này lấy mã dòng; chưa chắc Lark của studio có
   > hàm này), rồi chèn **cột công thức đó** làm biến thay cho Record ID. Nếu
   > cả hai cách đều không được, anh dừng lại và nhắn em — đừng đoán.

7. Bấm **Lưu** rồi **Bật** (chưa chắc tên: "Enable", "Turn on", công tắc
   bật/tắt). **Chưa bật thì chưa chạy.** Nên **chưa bật** cho tới khi đã làm
   bước 1–4 của mục 5 (Cách thử) bên dưới trên một dòng test.

## 4. Automation số 2: "Khi có bản ghi mới"

Dòng mới mà nhân viên vừa thêm vào bảng Hậu Kỳ cũng cần app biết ngay (để hiện
ở khối "Bản ghi mới từ Lark"). Làm **y hệt mục 3**, chỉ khác bước 4:

- **Trigger:** chọn **"khi có bản ghi mới"** (chưa chắc tên: "When a record is
  added", "When record is created").
- **Bảng:** Hậu Kỳ.
- Các bước 5–7 giữ nguyên (cùng URL, cùng header, cùng body). Đặt tên khác để
  phân biệt, ví dụ: `Gửi sang app khi thêm dòng Hậu Kỳ`.

Hai Automation riêng nhau, cùng gọi **một địa chỉ**. App không cần biết dòng là
"mới" hay "sửa": nó đọc lại dòng đó rồi tự quyết.

## 5. Cách thử (làm trước khi bật thật)

Thử trên **một dòng test**, không thử trên dòng của khách thật — vì nếu dòng đó
có ba mẹ đã bật thông báo thì chuông và thông báo đẩy sẽ **gửi thật** cho họ.

1. Chọn (hoặc tạo) một dòng Hậu Kỳ **của studio** (khách giả, ví dụ tên
   "Test nội bộ"), đã có bộ ảnh trên app và đang ở **Đã gửi file gốc**.
2. Mở màn khách của bộ ảnh đó trên điện thoại (bật thông báo nếu muốn thấy
   chuông), và mở màn quản trị trên máy tính.
3. Trên Lark, trong Automation vừa tạo, bấm nút **chạy thử** (chưa chắc tên:
   "Test", "Run test", "Thử chạy"). Nếu Lark hỏi chọn dòng để thử, chọn dòng test.
4. Đọc kết quả (mục 6). Mong đợi: **trạng thái 200**, và có chữ `Success`.
5. Bật Automation. Trên dòng test, đổi cột **Trạng Thái** từ **Đã gửi file gốc**
   sang **Đã chọn hình**. Vài giây sau phải thấy:
   - Màn khách và màn quản trị **tự làm mới**, nhãn trạng thái đổi;
   - Chuông ở màn khách có thêm dòng **"Bean đã xác nhận danh sách ảnh ạ"**.
6. Đổi tiếp sang **Đang làm** → chuông có dòng **"Bean đang chỉnh ảnh của bé ạ!"**.
7. Đổi sang **Đã giao** (hoặc **Leader check hình**) → màn tự làm mới nhưng
   **không** có dòng chuông mới. Đổi lại cùng giá trị → không có gì xảy ra.
8. Xong thì trả dòng test về trạng thái ban đầu, hoặc xoá dòng test.

## 6. Cách đọc kết quả

Trên Lark, mở **lịch sử chạy** của Automation (chưa chắc tên: "Run history",
"Lịch sử chạy", "Logs"), bấm vào một lần chạy, xem bước **Gửi yêu cầu HTTP**:
trạng thái (HTTP status) và nội dung phản hồi.

| Thấy gì | Nghĩa là gì | Làm gì |
|---|---|---|
| Trạng thái **200**, có `"message":"Success"` | App nhận và xử lý xong | Không cần làm gì. Xem tiếp các con số bên dưới nếu muốn |
| Trạng thái **401**, `Unauthorized` | Bí mật sai hoặc thiếu | Kiểm lại header `Authorization`: có đúng chữ `Bearer`, một dấu cách, bí mật đúng và **không** thừa dấu cách / xuống dòng ở cuối |
| Trạng thái **200** nhưng có `"message":"Missing record_id"` | Body không có mã dòng | Kiểm lại bước 6 mục 3: biến Record ID đã chèn đúng trong `"record_id"`? |
| Trạng thái **200** nhưng có `"message":"Invalid JSON body"` | Body không phải JSON đúng | Kiểm dấu ngoặc `{ }`, dấu ngoặc kép `" "` quanh biến |
| Trạng thái **200** với `"message":"Thiếu cấu hình môi trường"` hoặc `"Lỗi kết nối DB"` | Phía app đang thiếu cấu hình | Báo em / người dựng app, không phải lỗi ở Lark |
| Trạng thái **200** với `"skipped":"busy_queued"` | App đang xử lý việc khác, đã xếp dòng này vào hàng đợi | Bình thường, dòng sẽ được xử lý ở lượt gửi kế tiếp |
| Không có phản hồi / quá thời gian | Mạng hoặc app chậm | Thử lại; nếu lặp lại nhiều lần thì báo em |

App cố ý trả **200** cho hầu hết lỗi (chỉ riêng sai bí mật trả 401) để Lark
không tự gửi lại vô hạn. Vì vậy **200 chưa chắc là mọi thứ đã trọn vẹn** — hãy
đọc chữ `message` trong nội dung phản hồi.

Khi thành công (`"message":"Success"`), phần `trangThai` trong phản hồi cho số
liệu của lượt đó:

| Khoá | Nghĩa |
|---|---|
| `doc` | số bộ ảnh app đã đọc |
| `doi` | số bộ có trạng thái / cảnh báo thay đổi |
| `phatTrangThai` | số lần đã làm mới màn hình (chỉ khi Trạng Thái đổi thật) |
| `baoDaXacNhan` | số tin "Đã xác nhận danh sách" đã gửi |
| `baoDangChinhSua` | số tin "Đang chỉnh sửa" đã gửi |
| `baoHinhDaVe` | số tin "Hình đã về" đã gửi |

Nếu `trangThai` là `null` thì phần cập nhật trạng thái bị lỗi ở lượt đó (phần
dựng bộ ảnh vẫn chạy); sáng hôm sau lịch 08:00 sẽ đỡ lại.

## 7. Lưu ý

- **App cũng tự ghi vài thứ ngược sang Lark** (ví dụ cột Link app). Những lần ghi
  đó có thể làm Automation "khi bản ghi được sửa" chạy thêm vài lượt. Không sao:
  nếu Trạng Thái không đổi thì app không làm gì thêm (không phát tín hiệu, không
  báo ai).
- Nếu anh thấy Lark báo quá nhiều lượt chạy hoặc vướng giới hạn của gói Lark, thu
  hẹp **Trường theo dõi** ở bước 4 mục 3 về một số trường quan trọng, thay vì
  "mọi trường". Em chưa biết giới hạn lượt chạy Automation của gói Lark studio
  đang dùng — anh kiểm trong phần gói / hạn mức của Lark.
- Muốn **tạm dừng**: tắt công tắc của Automation trên Lark. App vẫn đọc trạng thái
  lúc 08:00 như cũ.
- Đổi `SYNC_CRON_SECRET` ở Vercel thì phải sửa **cả hai Automation** trên Lark
  cho khớp, nếu không Lark sẽ nhận 401.

## 8. Dành cho người dựng app

- Địa chỉ: `POST /api/lark/hook` (`src/app/api/lark/hook/route.ts`). Xác thực:
  header `Authorization: Bearer ${SYNC_CRON_SECRET}`; sai → 401. Body JSON
  `{"record_id": "<mã dòng>"}`; thiếu/hỏng → 200 kèm `message` (cố ý, để Lark
  không thử lại).
- Hook đọc **một** dòng Hậu Kỳ, dựng/cập nhật bộ ảnh, rồi gọi
  `capNhatTrangThaiTuHook` (`src/lib/lark/cap-nhat-tu-hook.ts`):
  - mọi bộ có **mã Trạng Thái đổi** → `phatSuKienBoAnh` loại `lark.trang_thai`
    (kênh khách + kênh nhân viên chi nhánh; payload không có dữ liệu cá nhân);
  - sang "Hình đã về" → `baoHinhDaVe` (như BB-250/252);
  - sang "Đã chọn hình" / "Đang làm" → `baoMocKhach`
    (`src/lib/thong-bao/bao-moc-khach.ts`, chữ ở `moc-khach.ts`), kiểm
    `thong_bao_khach.loai` trước để mỗi mốc một lần.
- Bảng trạng thái ↔ nhãn: `docs/27-trang-thai-app-lark.md`.
- Cron 08:00 (`/api/cron/hau-ky`) giữ làm lưới đỡ; **không** phát tín hiệu và
  **không** báo hai mốc mới.
