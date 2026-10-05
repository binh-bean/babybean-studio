# 28 — Tự động hoá Lark gửi sang app mỗi khi bảng Hậu Kỳ đổi

> BB-347 (01/10/2026), viết lại bằng tiếng Việt theo đúng giao diện Lark tiếng
> Việt ngày 05/10/2026. Viết cho chủ studio, không cần biết lập trình.
>
> Làm xong việc này thì mỗi lần nhân viên sửa một dòng ở bảng **Hậu Kỳ** trên
> Lark, app biết **ngay** (vài giây), không phải đợi 8 giờ sáng hôm sau.

## 0. Ba điều cần nhớ

- **Mã bí mật anh tự điền.** Tài liệu này và em không bao giờ ghi giá trị thật.
  Chỗ nào thấy `<MÃ BÍ MẬT>` là chỗ anh dán giá trị biến `SYNC_CRON_SECRET`
  (đang lưu trên Vercel). Đừng gửi giá trị đó qua chat, email hay ảnh chụp.
- **Chữ trong ô `màu xám` phải gõ đúng từng ký tự** (kể cả chữ hoa, chữ thường,
  dấu cách). Đó là tên kỹ thuật app chờ nhận, không dịch được.
- **Chưa bật công tắc thì chưa có gì chạy thật.** Anh cứ điền thoải mái, thử
  xong mới bật.

## 1. Việc này làm gì cho khách

Mỗi lần cột **Trạng Thái** của một dòng đổi **thật** (giá trị mới khác giá trị
app đang nhớ), app:

1. **Tự làm mới màn hình đang mở**, cả màn của ba mẹ lẫn màn nhân viên cùng chi
   nhánh, không cần tải lại trang.
2. **Gửi chuông và thông báo lên điện thoại ba mẹ**, nhưng chỉ ở **đúng 3 mốc**
   in đậm trong bảng dưới. Đổi sang trạng thái khác thì chỉ làm mới màn hình,
   không báo ai.

Lark gửi lại cùng một giá trị, hoặc chỉ cột khác đổi, thì app **không làm gì
thêm**.

| Lark chuyển sang | Ba mẹ nhận chuông và thông báo? | Nội dung |
|---|---|---|
| Đã gửi file gốc | Không | — |
| **Đã chọn hình** | **Có** — mốc "Đã xác nhận danh sách" | "Bean đã xác nhận danh sách ảnh ạ" |
| **Đang làm** | **Có** — mốc "Đang chỉnh sửa" | "Bean đang chỉnh ảnh của bé ạ!" |
| Leader check hình | Không | — |
| Đã gửi duyệt | Không | — |
| Sửa / Sửa lần 2, 3, 4 | Không | — |
| Đã chốt chưa in | Không | — |
| Đã gửi in | Không | — |
| **Hình đã về** | **Có** — mốc "Sản phẩm của bé đã về" | "Mời ba mẹ ghé Bean nhận ảnh của bé nhé ạ." |
| Đã giao | **Không** (anh đã bỏ) | — |
| Đã chăm sóc khách | Không | — |

Mỗi mốc chỉ báo **một lần** cho mỗi bộ ảnh:

- Nhân viên lỡ kéo trạng thái lùi rồi tiến lại thì **không báo lần hai**.
- CSKH đã xác nhận đợt chọn ngay trong app (app đã gửi tin "Studio đã xác nhận
  đợt…") thì khi Lark sang "Đã chọn hình" **không gửi thêm** tin nữa.
- Lần đầu app đọc một dòng đã ở sẵn "Đã chọn hình" hay "Đang làm" từ trước thì
  **không báo**, để khỏi dội tin cũ cho khách.
- Nhảy cóc (từ "Đã gửi file gốc" thẳng sang "Đang làm") thì chỉ báo mốc "Đang
  chỉnh sửa", không bù mốc bị bỏ qua.
- Bộ ảnh app đã ghi là **Đã giao** thì không báo mốc nào.

Lịch **8 giờ sáng** mỗi ngày **vẫn giữ nguyên** làm lưới đỡ: hôm nào Lark gửi
hụt thì sáng hôm sau app vẫn đọc lại và cập nhật trạng thái. (Lịch 8 giờ chỉ cập
nhật trạng thái và báo "Hình đã về"; hai mốc kia là việc của đường gửi ngay này.)

## 2. Chuẩn bị

- Quyền **chỉnh sửa Base** của studio trên Lark (để tạo tự động hoá).
- Mã bí mật `SYNC_CRON_SECRET`: lấy ở Vercel → dự án → **Settings** →
  **Environment Variables**. Nếu Vercel không cho xem lại, dùng giá trị anh đã
  ghi lúc tạo. **Đừng tự tạo mã mới**, trừ khi anh sửa cùng lúc cả Vercel lẫn
  hai tự động hoá trên Lark, vì lệch một nơi là app từ chối.

## 3. Tự động hoá số 1: "Gửi sang app khi sửa dòng Hậu Kỳ"

Màn anh đang mở (ảnh chụp 05/10) chính là tự động hoá này. Dòng chữ cuối màn
phải ghi: *Khi có bất kỳ bản ghi nào trong cập nhật "🎯Hậu Kỳ", sau đó gửi yêu
cầu HTTP*.

### 3.1 Phần bên trái — điều kiện kích hoạt

1. Bảng: **🎯Hậu Kỳ**.
2. Danh sách trường có ô tích: **tích tất cả, trừ ô `Link app`**.
   - Cột **Link app** do chính app ghi ngược sang Lark. Để tích thì mỗi lần app
     ghi link, Lark lại gọi app thêm một lượt thừa.
   - Bắt buộc phải tích **Trạng Thái**, vì đó là trường quan trọng nhất.
3. **Kích hoạt cài đặt hạn chế** và **Thêm điều kiện đồng thời**: để nguyên,
   không cần bấm.

### 3.2 Phần bên phải — mục "Cấu hình yêu cầu"

Kéo lên đầu cột phải. Nếu có ô **Phương thức** (hoặc ô chọn kiểu yêu cầu), chọn
`POST`. Rồi điền từng ô từ trên xuống:

| Ô trên Lark | Điền gì |
|---|---|
| **URL** | `https://hauky.babybeanstudio.vn/api/lark/hook` (anh đã điền đúng) |
| **Thông số** | **Để trống.** Không bấm "+ Thêm" |
| **Tiêu đề**, dòng 1 — ô **Mã** | `Authorization` |
| **Tiêu đề**, dòng 1 — ô **Giá trị** | `Bearer <MÃ BÍ MẬT>` |
| **Tiêu đề**, dòng 2 (bấm **+ Thêm** dưới mục Tiêu đề) — ô **Mã** | `Content-Type` |
| **Tiêu đề**, dòng 2 — ô **Giá trị** | `application/json` |
| **Nội dung yêu cầu** — ô chọn kiểu | **JSON** (anh đã chọn đúng) |
| **Nội dung yêu cầu** — ô soạn bên dưới | xem mục 3.3 |

Lưu ý cho ô **Giá trị** của `Authorization`:

- gõ chữ `Bearer`, **một dấu cách**, rồi dán mã bí mật;
- bỏ cả hai dấu `<` `>`;
- không để dấu cách hay xuống dòng thừa ở cuối.

### 3.3 Ô soạn "Nội dung yêu cầu"

Ô này đang có sẵn `{}`. Thay bằng đúng một dòng sau:

```json
{"record_id": ""}
```

Rồi chèn mã dòng vào giữa hai dấu ngoặc kép, **không gõ chữ**:

1. Đặt con trỏ vào **giữa hai dấu ngoặc kép** `""`.
2. Bấm biểu tượng **⊕** ở góc phải ô soạn.
3. Trong danh sách hiện ra, chọn bước kích hoạt (bảng 🎯Hậu Kỳ), rồi chọn mục
   **ID bản ghi** (Lark có thể ghi là "Mã bản ghi" hoặc "Record ID", ý nghĩa như
   nhau).
4. Sau khi chèn, ô trông như `{"record_id": "[ID bản ghi]"}`, trong đó
   `[ID bản ghi]` là một **thẻ màu**, không phải chữ gõ tay.

> **Nếu danh sách ⊕ không có mục ID bản ghi:** thêm vào bảng Hậu Kỳ một cột
> **Công thức** với công thức `RECORD_ID()`, rồi bấm ⊕ chèn **cột công thức đó**
> vào thay. Nếu cả hai cách đều không được thì anh dừng lại và nhắn em, đừng
> đoán.

### 3.4 Mục "Cấu hình câu trả lời"

**Nội dung phản hồi**: để **JSON** và ô `{}` như mặc định. Không cần sửa.

### 3.5 Lưu, chưa bật

Bấm **Lưu**. **Chưa bật công tắc** cho tới khi thử xong theo mục 5.

## 4. Tự động hoá số 2: "Gửi sang app khi thêm dòng Hậu Kỳ"

Dòng nhân viên vừa thêm vào bảng Hậu Kỳ cũng cần app biết ngay, để hiện ở khối
"Bản ghi mới từ Lark".

1. Tạo tự động hoá mới, đặt tên `Gửi sang app khi thêm dòng Hậu Kỳ`.
2. Điều kiện kích hoạt: chọn kiểu **khi thêm bản ghi mới** (Lark có thể ghi là
   "Khi bản ghi được thêm" hoặc "Khi tạo bản ghi"), bảng **🎯Hậu Kỳ**.
3. Hành động: **Gửi yêu cầu HTTP**, điền **y hệt mục 3.2 → 3.4**: cùng URL, cùng
   hai dòng Tiêu đề, cùng Nội dung yêu cầu.

Hai tự động hoá riêng nhau nhưng cùng gọi **một địa chỉ**. App không cần biết
dòng là "mới" hay "sửa": nó đọc lại dòng đó rồi tự quyết.

## 5. Cách thử (trước khi bật thật)

Thử trên **một dòng thử**, không thử trên dòng của khách thật. Nếu dòng đó có ba
mẹ đã bật thông báo thì chuông và thông báo sẽ **gửi thật** cho họ.

1. Chọn hoặc tạo một dòng Hậu Kỳ **của studio** (khách giả, ví dụ tên "Thử nội
   bộ"), đã có bộ ảnh trên app và đang ở **Đã gửi file gốc**.
2. Mở màn khách của bộ ảnh đó trên điện thoại (bật thông báo nếu muốn thấy
   chuông), và mở màn quản trị trên máy tính.
3. Trong tự động hoá vừa tạo, bấm nút **chạy thử** (thường ở góc trên, có thể
   ghi "Thử nghiệm" hoặc "Chạy thử"). Lark hỏi chọn dòng thì chọn dòng thử.
4. Xem kết quả theo mục 6. Mong đợi: **trạng thái 200** và có chữ `Success`.
5. Bật công tắc tự động hoá. Trên dòng thử, đổi **Trạng Thái** từ **Đã gửi file
   gốc** sang **Đã chọn hình**. Vài giây sau phải thấy:
   - màn khách và màn quản trị **tự làm mới**, nhãn trạng thái đổi;
   - chuông ở màn khách có thêm dòng **"Bean đã xác nhận danh sách ảnh ạ"**.
6. Đổi tiếp sang **Đang làm**: chuông có dòng **"Bean đang chỉnh ảnh của bé ạ!"**.
7. Đổi sang **Leader check hình**: màn tự làm mới nhưng **không** có dòng chuông
   mới. Chọn lại đúng giá trị đang có: không có gì xảy ra.
8. Xong thì trả dòng thử về trạng thái ban đầu, hoặc xoá dòng thử.

## 6. Cách đọc kết quả

Mở thẻ **Nhật ký hoạt động** (cạnh thẻ "Chỉnh sửa mục tự động hóa" ở trên cùng),
bấm vào một lần chạy, xem bước **Gửi yêu cầu HTTP**: mã trạng thái và nội dung
phản hồi.

| Thấy gì | Nghĩa là gì | Làm gì |
|---|---|---|
| Trạng thái **200**, có `"message":"Success"` | App nhận và xử lý xong | Không cần làm gì |
| Trạng thái **401**, có `Unauthorized` | Mã bí mật sai hoặc thiếu | Kiểm lại dòng Tiêu đề `Authorization`: đúng chữ `Bearer`, một dấu cách, mã đúng, không thừa dấu cách ở cuối |
| **200** nhưng có `"message":"Missing record_id"` | Nội dung yêu cầu thiếu mã dòng | Kiểm lại mục 3.3: thẻ màu ID bản ghi đã nằm giữa hai dấu ngoặc kép chưa |
| **200** nhưng có `"message":"Invalid JSON body"` | Nội dung yêu cầu viết sai | Kiểm dấu ngoặc nhọn `{ }` và hai dấu ngoặc kép quanh thẻ màu |
| **200** với `"Thiếu cấu hình môi trường"` hoặc `"Lỗi kết nối DB"` | Phía app thiếu cấu hình | Báo em, không phải lỗi ở Lark |
| **200** với `"skipped":"busy_queued"` | App đang bận, đã xếp dòng này vào hàng chờ | Bình thường, lượt sau app xử lý |
| Không có phản hồi hoặc quá thời gian | Mạng hoặc app chậm | Chạy thử lại; lặp lại nhiều lần thì báo em |

App cố ý trả **200** cho hầu hết lỗi (chỉ sai mã bí mật mới trả 401) để Lark
không tự gửi lại mãi. Vì vậy **200 chưa chắc là đã trọn vẹn**: hãy đọc chữ sau
`message` trong phản hồi.

Khi thành công, phần `trangThai` trong phản hồi cho số liệu của lượt đó:

| Chữ trong phản hồi | Nghĩa |
|---|---|
| `doc` | số bộ ảnh app đã đọc |
| `doi` | số bộ có trạng thái hoặc cảnh báo thay đổi |
| `phatTrangThai` | số lần đã làm mới màn hình (chỉ khi Trạng Thái đổi thật) |
| `baoDaXacNhan` | số tin "Đã xác nhận danh sách" đã gửi |
| `baoDangChinhSua` | số tin "Đang chỉnh sửa" đã gửi |
| `baoHinhDaVe` | số tin "Hình đã về" đã gửi |

`trangThai` là `null` nghĩa là phần cập nhật trạng thái lỗi ở lượt đó (phần dựng
bộ ảnh vẫn chạy); sáng hôm sau lịch 8 giờ sẽ đỡ lại.

## 7. Lưu ý

- **App tự ghi vài cột ngược sang Lark** (ví dụ Link app). Vì vậy mục 3.1 bỏ tích
  ô Link app. Lỡ có vài lượt chạy thừa cũng không sao: Trạng Thái không đổi thì
  app không làm gì thêm.
- Nếu Lark báo quá nhiều lượt chạy hoặc vướng hạn mức của gói Lark: ở mục 3.1 chỉ
  tích những trường quan trọng (Trạng Thái, Link HD, Ngày ảnh về, Ngày Gửi In…)
  thay vì tất cả. Em chưa biết hạn mức lượt chạy của gói Lark studio đang dùng,
  anh xem trong phần gói của Lark.
- Muốn **tạm dừng**: tắt công tắc của tự động hoá. App vẫn đọc lúc 8 giờ sáng
  như cũ.
- Đổi mã `SYNC_CRON_SECRET` trên Vercel thì phải sửa **cả hai tự động hoá** trên
  Lark cho khớp, nếu không Lark sẽ nhận 401.

## 8. Dành cho người dựng app

- Địa chỉ: `POST /api/lark/hook` (`src/app/api/lark/hook/route.ts`). Xác thực
  bằng tiêu đề `Authorization: Bearer ${SYNC_CRON_SECRET}`; sai thì trả 401.
  Nội dung JSON `{"record_id": "<mã dòng>"}`; thiếu hoặc hỏng thì trả 200 kèm
  `message` (cố ý, để Lark không thử lại).
- Hook đọc **một** dòng Hậu Kỳ, dựng hoặc cập nhật bộ ảnh, rồi gọi
  `capNhatTrangThaiTuHook` (`src/lib/lark/cap-nhat-tu-hook.ts`):
  - bộ nào có **mã Trạng Thái đổi** thì `phatSuKienBoAnh` loại `lark.trang_thai`
    (kênh khách và kênh nhân viên chi nhánh; dữ liệu phát đi không có thông tin
    cá nhân);
  - sang "Hình đã về" thì `baoHinhDaVe` (như BB-250/252);
  - sang "Đã chọn hình" hoặc "Đang làm" thì `baoMocKhach`
    (`src/lib/thong-bao/bao-moc-khach.ts`, chữ ở `moc-khach.ts`), kiểm
    `thong_bao_khach.loai` trước để mỗi mốc chỉ một lần.
- Bảng trạng thái ↔ nhãn: `docs/27-trang-thai-app-lark.md`.
- Lịch 8 giờ (`/api/cron/hau-ky`) giữ làm lưới đỡ; **không** phát tín hiệu làm
  mới và **không** báo hai mốc mới.
