# Quy trình đầu cuối — chủ studio mô tả, PM ghi lại

> Nguồn: chủ studio mô tả ngày 12.09.2026. Đây là **bản chốt** về nghiệp vụ.
> Khi tài liệu khác mâu thuẫn với file này, file này đúng.

---

## 1. Dữ liệu đi từ Lark xuống, một chiều

Lark có **ba tầng**, và tiền chỉ nằm ở tầng giữa:

```
Hóa Đơn                     hợp đồng, gắn với một khách hàng
  └ Hóa Đơn Chi Tiết        dòng hàng — CHỖ DUY NHẤT CÓ TIỀN
      └ Chi Tiết Gói Chụp   chỉ xuất hiện khi dòng trên là một GÓI CHỤP.
                            Đây là thành phần của gói. Tiền = 0, vì tiền đã
                            được tính ở dòng cha rồi.
```

**Tiền 0 ở tầng dưới không phải thiếu dữ liệu — nó là con số đúng.** Cộng tiền
tầng dưới vào tổng hợp đồng là tính hai lần. Ràng buộc `chk_component_no_price`
trong `0023` chặn việc ghi tiền vào tầng dưới, đúng vì lý do này.

Bảng **Khách Hàng** đồng bộ một chiều lên app. App không bao giờ ghi ngược lên
Lark.

Đã dựng: `db/migrations/0014`, `0023`, `scripts/sync-lark-contracts.mjs`.

---

## 2. Album xuất hiện trong app như thế nào

Điều kiện kích hoạt, cả hai phải đúng:

1. Có **bản ghi mới trong bảng Hậu Kỳ**, và
2. Cột **`Link ảnh gửi khách`** của bản ghi đó **có nội dung**

Khi đó màn quản lý của app hiện **y hệt** những gì Lark đang có.

Bảng Hậu Kỳ bên Lark cần thêm **hai cột**:

| Cột mới | Ai điền | Dùng để |
|---|---|---|
| `Lấy link app` (ô tích) | nhân viên tích | báo cho app biết cần dựng link cho khách này |
| `Link app` | nhân viên **dán tay** | nơi chứa link app đã tạo |

Luồng:

```
nhân viên tích "Lấy link app"
   -> app tự điền tạm thông tin khách vào album (CÒN SỬA ĐƯỢC, để nhân viên soát)
   -> nhân viên bấm tạo link app
   -> nhân viên COPY link, DÁN vào cột "Link app" bên Lark
   -> khách nhận link, mở xem ảnh
```

**Dán tay là cố ý.** App không ghi ngược lên Lark ở giai đoạn này. Một chiều
thì hỏng cũng chỉ hỏng một phía; hai chiều thì hai bên ghi đè nhau và không ai
biết bên nào đúng.

Thông tin app tự điền là **bản nháp**, nhân viên phải soát được và sửa được
trước khi tạo link.

---

## 3. Khách chọn ảnh

### 3.1. Thả tim CHÍNH LÀ chọn ảnh

> **ĐỌC KỸ CHỖ NÀY TRƯỚC KHI VIẾT MỘT DÒNG MÃ NÀO.**
>
> Chủ studio gọi thao tác chọn ảnh là **"thả tim"**. Đó là **hình dạng của nút
> bấm**, không phải tên cột trong cơ sở dữ liệu.
>
> Trái tim trên màn hình phải ghi xuống `selection_items.mark = 'selected'`.
>
> **TUYỆT ĐỐI KHÔNG** nối nó vào cột `is_favorite`.
>
> `is_favorite` là một cột khác, sinh ra ở BB-081 để tách "đánh dấu để xem lại"
> khỏi "chọn để chỉnh sửa". Trước khi có nó, bấm tim vào ảnh đã chọn sẽ **xoá
> mất lựa chọn của khách**. Nối trái tim vào `is_favorite` là làm sống lại đúng
> lỗi đó — và lần này còn tệ hơn, vì hạn mức chỉ đếm `mark = 'selected'`, nên
> khách thả tim 30 ảnh mà hệ thống báo đã chọn 0 ảnh, không ai phải trả tiền
> vượt và không báo cáo nào thấy gì.

### 3.2. Khách nhìn thấy gì khi đang chọn

Bốn con số, cập nhật ngay mỗi lần thả tim:

| Hiện gì | Lấy từ đâu |
|---|---|
| Số ảnh đã chọn | đếm `mark = 'selected'`, mỗi ảnh một lần |
| Số ảnh chỉnh sửa **đã thanh toán** | `app.gallery_quota()` — suy từ dòng hàng |
| Số ảnh chọn thừa | đã chọn trừ đã thanh toán, sàn 0 |
| Tiền của số ảnh thừa | số thừa nhân `galleries.extra_photo_price` |

Hạn mức **chưa biết** (`app.gallery_quota()` trả null) thì **chặn chọn ảnh** và
báo *"studio sẽ báo lại số ảnh trong gói"*. Không hiện số 0. Xem `docs/15` mục 6.

### 3.3. Ghi chú và chọn ảnh cho sản phẩm in

- Ghi chú chỉnh sửa **từng ảnh một** (`selection_items.retouch_note`).
- Chọn ảnh nào để **phóng**, để **bàn**, làm **bìa album**.

**Chỉ hiện ô chọn cho sản phẩm mà hợp đồng THẬT SỰ có.** Hợp đồng không mua
album thì không được hiện chỗ chọn ảnh bìa album. Nguồn sự thật là
`gallery_items`; chỗ lưu là `selection_placements` (bảng nối, vì một ảnh có thể
vừa vào album vừa được phóng).

Đặt ảnh vào sản phẩm in **không tiêu thêm hạn mức**. Hạn mức đếm ảnh được
CHỈNH; ảnh in lấy từ tập đã chỉnh đó.

---

## 4. Chốt và xác nhận

```
khách bấm CHỐT
   -> album chuyển 'in_review' -> 'submitted', khoá không cho sửa nữa
   -> báo cho studio qua Zalo hoặc link chat page
   -> CSKH xem lại
   -> có phát sinh  -> khách thanh toán  -> CSKH xác nhận
      không phát sinh -> CSKH xác nhận luôn
   -> album chuyển sang giai đoạn sau ('in_retouch')
```

Hai điểm phải đúng:

- **Chốt xong là khoá.** `patch_selection_batch` đã ném `GALLERY_LOCKED` với
  các trạng thái `submitted`, `in_retouch`, `delivered`, `archived`. Giữ nguyên.
- **Chỉ CSKH mới chuyển được giai đoạn**, không phải khách, và không tự động
  theo việc thanh toán.

Kênh báo: Zalo OA (`branches.zalo_oa`), hoặc link chat page — bảng Hậu Kỳ bên
Lark đã có sẵn cột `Chat với khách` chứa link hộp thư Facebook.

---

## 5. Sáu bước khách nhìn thấy

Quy trình vận hành có chín bước (`docs/15` mục 1). Khách chỉ cần thấy sáu:

| Bước | Khách thấy | `galleries.status` |
|---|---|---|
| 1 | Đã chụp xong | `draft` · `syncing` · `sync_error` |
| 2 | Ảnh đã sẵn sàng, mời bạn chọn | `ready` |
| 3 | Bạn đang chọn ảnh | `in_review` |
| 4 | Đã chốt, chờ studio xác nhận | `submitted` |
| 5 | Đang chỉnh ảnh | `in_retouch` |
| 6 | Đang in và giao | `delivered` |

`expired` **không phải** một bước — đó là link hết hạn, phải báo riêng chứ
không được vẽ vào dải tiến trình.

---

## 6. Những chỗ chưa có, xếp theo thứ tự cần làm

| | Việc | Chặn cái gì |
|---|---|---|
| 1 | Nhập mã hợp đồng lúc tạo album | không có mã thì không đồng bộ được hợp đồng |
| 2 | Đồng bộ bảng Hậu Kỳ xuống app | album không tự xuất hiện |
| 3 | Nút chọn ảnh hình trái tim + bốn con số | khách không chọn được |
| 4 | Chọn ảnh cho sản phẩm in | khách không đặt được ảnh vào album |
| 5 | Chốt, báo studio, CSKH xác nhận | vòng đời không khép |
| 6 | Thanh toán phát sinh | tiền vẫn thu ngoài app |
