# Quy trình đầu cuối — chủ studio mô tả, PM ghi lại

> Nguồn: chủ studio mô tả ngày 12.09.2026. Đây là **bản chốt** về nghiệp vụ.
> Khi tài liệu khác mâu thuẫn với file này, file này đúng.

---

## 0. Thuật ngữ — gọi đúng tên, nhất là chữ "album"

> Chủ studio chỉnh ngày 12.09.2026. **"Album" là một SẢN PHẨM**, không phải tập
> ảnh khách chọn. Danh mục có 11 sản phẩm tên thật bắt đầu bằng "Album (Ultra
> HD)". Gọi tập ảnh là "album" thì hai thứ khác hẳn nhau dùng chung một chữ, và
> câu *"album này có album không"* là câu hỏi hợp lệ — dấu hiệu rõ nhất của một
> cái tên sai.

| Gọi là | Nghĩa | Trong mã nguồn |
|---|---|---|
| **Khách hàng** | một nhà. Một khách có **nhiều buổi chụp** | `customers` |
| **Buổi chụp** | một lần chụp. Thường **một buổi = một hóa đơn** | `shoots` |
| **Hóa đơn** | hợp đồng của buổi chụp đó. Chứa **1 hoặc nhiều gói chụp**, cộng dịch vụ và sản phẩm mua thêm | `gallery_items` có `parent_item_id` null |
| **Gói chụp** | sản phẩm, ví dụ `Baby 02`, `Fam 03` | `products.kind = 'shoot_package'` |
| **Bộ ảnh** | **tập ảnh khách mở ra chọn**. Một thư mục Drive = một bộ ảnh | `galleries` |
| **Album** | **SẢN PHẨM** — quyển ảnh in. Nằm trong gói chụp, hoặc khách quay lại mua lẻ sau khi đã xong gói | `products.kind = 'print'`, tên chứa "Album" |
| **Ảnh phóng · ảnh để bàn** | sản phẩm in khác | `products.kind = 'print'` |
| **Hạn mức** | số ảnh chỉnh sửa đã trả tiền — dòng `Edit file` | `app.gallery_quota()` |

**Bảng trong cơ sở dữ liệu vẫn tên `galleries`.** Đổi tên bảng là sửa hàng trăm
chỗ mà chẳng sửa được hiểu lầm nào. Cái phải đúng là **chữ người đọc nhìn
thấy**: mọi văn bản tiếng Việt hiện cho khách và cho nhân viên đều nói **"bộ
ảnh"**. Tiếng Anh dùng **"gallery"**.

### Mô hình bốn tầng, chủ studio chốt

```
Khách hàng
  └─ nhiều BUỔI CHỤP
       └─ thường một HÓA ĐƠN cho một buổi
            ├─ 1 hoặc nhiều GÓI CHỤP
            │    └─ thành phần của gói: ảnh chỉnh sửa, makeup, hàng in
            └─ dịch vụ và sản phẩm MUA THÊM
       └─ một BỘ ẢNH — thư mục Drive khách mở ra chọn
```

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

## 2. Bộ ảnh xuất hiện trong app như thế nào

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
   -> app tự điền tạm thông tin khách vào bộ ảnh (CÒN SỬA ĐƯỢC, để nhân viên soát)
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
- Chọn ảnh nào để **phóng**, để **bàn**, làm **bìa bộ ảnh**.

**Chỉ hiện ô chọn cho sản phẩm mà hợp đồng THẬT SỰ có.** Hợp đồng không mua
bộ ảnh thì không được hiện chỗ chọn ảnh bìa bộ ảnh. Nguồn sự thật là
`gallery_items`; chỗ lưu là `selection_placements` (bảng nối, vì một ảnh có thể
vừa vào bộ ảnh vừa được phóng).

Đặt ảnh vào sản phẩm in **không tiêu thêm hạn mức**. Hạn mức đếm ảnh được
CHỈNH; ảnh in lấy từ tập đã chỉnh đó.

---

## 4. Chốt và xác nhận

```
khách bấm CHỐT
   -> bộ ảnh chuyển 'in_review' -> 'submitted', khoá không cho sửa nữa
   -> báo cho studio qua Zalo hoặc link chat page
   -> CSKH xem lại
   -> có phát sinh  -> khách thanh toán  -> CSKH xác nhận
      không phát sinh -> CSKH xác nhận luôn
   -> bộ ảnh chuyển sang giai đoạn sau ('in_retouch')
```

Hai điểm phải đúng:

- **Chốt xong là khoá.** `patch_selection_batch` đã ném `GALLERY_LOCKED` với
  các trạng thái `submitted`, `in_retouch`, `delivered`, `archived`. Giữ nguyên.
- **Chỉ CSKH mới chuyển được giai đoạn**, không phải khách, và không tự động
  theo việc thanh toán.

Kênh báo: Zalo OA (`branches.zalo_oa`), hoặc link chat page — bảng Hậu Kỳ bên
Lark đã có sẵn cột `Chat với khách` chứa link hộp thư Facebook.

---

## 4b. Sau khi chỉnh ảnh: vòng duyệt

Chủ studio mô tả ngày 12.09.2026:

> thu tiền → xác nhận → chuyển cho nhân viên photoshop chỉnh sửa theo quy trình
> đã có sẵn → CSKH chuyển file chỉnh sửa cho khách → khách duyệt, sửa hoặc in →
> quy trình tiếp tục

Đây là **vòng lặp**, không phải đường thẳng:

```
in_retouch            người photoshop đang chỉnh
   ↓ CSKH chuyển file đã chỉnh cho khách
awaiting_approval     chờ khách duyệt
   ├─ khách đồng ý       → approved → đi in → delivered
   └─ khách yêu cầu sửa  → QUAY LẠI in_retouch, vòng sau
```

Vòng lặp được nhiều lần. `revision_requests` ghi **mỗi vòng một dòng**, không
ghi đè: câu hỏi *"khách đã đòi sửa mấy lần rồi"* chỉ trả lời được bằng lịch sử,
và câu đó luôn xuất hiện đúng lúc hai bên bắt đầu căng thẳng.

| Ai làm | Đường |
|---|---|
| CSKH chuyển file đã chỉnh | `POST /api/admin/galleries/[id]/retouch-done` |
| Khách duyệt hoặc đòi sửa | `POST /api/g/review` |

### Bốn điều đã chốt

**Bắt buộc có link file đã chỉnh** mới chuyển sang chờ duyệt. Chuyển mà không
có gì cho khách xem thì khách mở link thấy trang trống rồi gọi điện — thà chặn
ở đây còn hơn phát hiện qua một cuộc gọi.

**Yêu cầu sửa bắt buộc viết gì đó.** "Sửa đi" mà không nói sửa gì thì người
photoshop phải gọi lại hỏi, tức là khách trả lời hai lần cho một việc.

**Giữ link bản khách đang xem lúc chê.** Vòng sau file khác rồi; không lưu thì
không ai biết khách chê bản nào.

**Chỉ khách chính được quyết.** Bà hay dì được mời vào xem và gợi ý, nhưng
quyết định cuối là của người đứng tên hợp đồng — cùng luật với lúc chốt chọn ảnh.

### Khoá chọn ảnh: một danh sách duy nhất

Hai trạng thái mới nằm **sau** lúc khách chốt, nên khách không được sửa lựa
chọn nữa — nếu không, khách đang duyệt ảnh đã chỉnh vẫn bỏ chọn được ảnh gốc mà
người photoshop đã chỉnh xong.

Danh sách trạng thái khoá trước đây **viết cứng trong thân hàm**
`patch_selection_batch`. Thêm trạng thái mà quên sửa chỗ đó thì lỗ hổng im
lặng. `0033` gom vào `app.gallery_is_locked()`, `0034` cho hàm gọi nó — thêm
trạng thái lần sau chỉ phải sửa một nơi.

Bên TypeScript thì danh sách nằm ở **ba** chỗ, và cả ba đều không được sửa
theo: màn khách, màn CSKH, route ảnh của khách. Hậu quả không phải lỗi đỏ mà
là màn hình hiện nút sửa, khách bấm vào, API trả `GALLERY_LOCKED` — nhân viên
tưởng hệ thống hỏng. Cả ba giờ dùng chung `src/lib/gallery-status.ts`.

Một phép thử so **từng giá trị** của kiểu enum giữa hai bên
(`tests/unit/gallery-status-khop-sql.test.ts`) giữ cho hai bản không trôi khỏi
nhau. Nó không đọc danh sách chép tay mà hỏi thẳng cơ sở dữ liệu, nên trạng
thái mới thêm vào là lộ ngay, kể cả khi chưa có dòng dữ liệu nào.

### Lỗ hổng phép thử đó tìm ra: `expired`

Hai bên lệch nhau đúng một giá trị. Bộ ảnh hết hạn đã bị chặn mua thêm
(`/api/g/addons`) và chặn chốt (`/api/g/submit`), nhưng **vẫn đổi được lựa
chọn ảnh** — phiên đăng nhập chỉ kiểm link chia sẻ, không kiểm trạng thái bộ
ảnh. Khách mở lại link cũ còn hạn thì thêm bớt ảnh thoải mái, chỉ là không chốt
được; danh sách đổi sau lưng studio trong khi người chỉnh ảnh có thể đã làm
theo danh sách cũ. `0035` khoá lại.

**Đính chính.** Bản đầu của mục này viết rằng mở lại cho khách chọn làm được
bằng cách đổi trạng thái sang `reopened`. Sai: enum không có giá trị đó — dải
tiến trình phía khách có nhánh xử lý `reopened`, nhưng nhánh ấy chưa bao giờ
chạy. Và **không có đường mở lại nào cả**; hai cột `reopened_at`,
`reopen_reason` nằm trong schema từ đầu mà không ai ghi.

Tức là trước `0035`, chính lỗ hổng đó là đường thoát duy nhất cho bộ ảnh quá
hạn. Khoá mà không mở đường chính thức thì bộ ảnh quá hạn thành ngõ cụt, CSKH
phải nhờ người sửa thẳng cơ sở dữ liệu. Đường chính thức:

| Ai | Đường | Từ trạng thái |
|---|---|---|
| CSKH mở lại cho khách chọn tiếp | `POST /api/admin/galleries/[id]/reopen` | `expired`, `submitted` |

Bắt buộc ghi lý do — mở lại là đảo ngược một quyết định của khách, và sáu
tháng sau câu hỏi *"sao bộ này mở lại"* chỉ trả lời được nếu lúc đó có người
viết vào. **Không** mở từ `in_retouch` trở đi: người chỉnh ảnh đã làm theo
danh sách cũ, mở ra thì công đã bỏ vào những ảnh khách vừa bỏ chọn. Muốn đổi ở
giai đoạn đó thì đi đường yêu cầu sửa.

### Danh sách trạng thái: sáu bản chép tay, mỗi bản thiếu một kiểu

Gom lại mới thấy hết. Ngoài bốn chỗ trên còn hai chỗ nữa, và hai chỗ này là lỗ
hổng thật chứ không phải phiền phức giao diện:

- `/api/g/submit` và `/api/g/addons` giữ danh sách riêng, thiếu
  `awaiting_approval` và `approved`. Khách đang **chờ duyệt ảnh đã chỉnh** vẫn
  gọi được hai route đó: bộ ảnh bị đẩy ngược về `submitted`, xoá mất giai đoạn
  chỉnh ảnh trong khi người photoshop đã làm xong.
- `GALLERY_STATUS_VALUES` trong lược đồ lọc danh sách thiếu cả `sync_error` —
  CSKH lọc theo trạng thái đó thì Zod từ chối thẳng.

Cả sáu giờ lấy từ `GALLERY_STATUSES` trong `src/lib/gallery-status.ts`, và có
phép thử so danh sách ấy với enum thật — **bằng nhau**, không thiếu cũng không
thừa. Thừa cũng là lỗi: nhánh `reopened` tồn tại được lâu như vậy chính vì
không ai so hai chiều.

Riêng dải tiến trình thì không dùng phép thử mà dùng cổng **lúc biên dịch**:
`getCustomerProgressStep` bỏ `default`, kết thúc bằng phép kiểm `never`. Thêm
trạng thái mà quên file đó thì không biên dịch được — chắc hơn phép thử, vì
không ai quên chạy trình biên dịch.

### Hai màn hình

| Ai | Thấy gì |
|---|---|
| CSKH, khi đang chỉnh ảnh | Ô dán link thư mục ảnh đã chỉnh + nút gửi khách. Yêu cầu sửa đang mở hiện **trên cùng**, không nằm dưới lịch sử — người chỉnh ảnh mở màn này để biết phải làm gì. |
| Khách, khi chờ duyệt | Link mở thư mục ảnh đã chỉnh, nút *Duyệt, cho in* và *Yêu cầu sửa*. |

Nút duyệt **chỉ hiện khi có link**. Studio quên dán link mà khách vẫn duyệt
được thì bộ ảnh đi thẳng vào xưởng in, và cái sai chỉ lộ ra lúc khách cầm ảnh
trên tay.

Nút *Yêu cầu sửa* **mở ra ô viết trước**, không gửi ngay. Bấm một nút là gửi
thì khách gửi yêu cầu rỗng, người chỉnh ảnh phải gọi lại hỏi — khách trả lời
hai lần cho một việc.

Lịch sử các vòng để **mở sẵn** ở cả hai màn. Đến vòng thứ ba, câu hỏi của cả
hai bên đều là *"lần trước đã nói gì rồi"*; giấu đi thì khách viết lại yêu cầu
cũ và người chỉnh ảnh sửa lại thứ đã sửa.

---

## 5. Sáu bước khách nhìn thấy

Quy trình vận hành có chín bước (`docs/15` mục 1). Khách chỉ cần thấy sáu:

| Bước | Khách thấy | `galleries.status` |
|---|---|---|
| 1 | Đã chụp xong | `draft` · `syncing` · `sync_error` |
| 2 | Ảnh đã sẵn sàng, mời bạn chọn | `ready` |
| 3 | Bạn đang chọn ảnh | `in_review` |
| 4 | Đã chốt, chờ studio xác nhận | `submitted` |
| 5 | Đang chỉnh ảnh · *Mời ba mẹ duyệt ảnh* | `in_retouch` · `awaiting_approval` |
| 6 | Đang in và giao | `approved` · `delivered` |

`expired` **không phải** một bước — đó là link hết hạn, phải báo riêng chứ
không được vẽ vào dải tiến trình.

---

## 6. Những chỗ chưa có, xếp theo thứ tự cần làm

| | Việc | Chặn cái gì |
|---|---|---|
| 1 | Nhập mã hợp đồng lúc tạo bộ ảnh | không có mã thì không đồng bộ được hợp đồng |
| 2 | Đồng bộ bảng Hậu Kỳ xuống app | bộ ảnh không tự xuất hiện |
| 3 | Nút chọn ảnh hình trái tim + bốn con số | khách không chọn được |
| 4 | Chọn ảnh cho sản phẩm in | khách không đặt được ảnh vào bộ ảnh |
| 5 | Chốt, báo studio, CSKH xác nhận | vòng đời không khép |
| 6 | ~~Thanh toán phát sinh~~ | **xong** — xem mục 6b |

---

## 6b. Ghi nhận thu tiền phát sinh

Bảng `gallery_payments` có từ `0024`, nhưng **chưa route nào ghi vào** — CSKH
thu tiền xong không có chỗ đánh dấu, nên câu hỏi *"bộ này khách trả chưa"* chỉ
trả lời được bằng cách hỏi nhau. `POST /api/admin/galleries/[id]/payments` lấp
chỗ đó, và màn CSKH hiện ba con số: **phải thu · đã thu · còn thiếu**.

### App chỉ ghi nhận

Tiền thu ngoài app — chuyển khoản, tiền mặt, quẹt thẻ. App không nối cổng
thanh toán và không tự chuyển giai đoạn theo tiền.

### Sổ thì không sửa đè

Bảng là append-only, nên route **chỉ có POST**: không PATCH, không DELETE, kể
cả khi con số vừa ghi sai rõ ràng. Ghi nhầm thì ghi một dòng **âm** kèm lý do —
dòng trừ không có lý do bị từ chối, vì sáu tháng sau không ai biết vì sao sổ bị
trừ. Sổ tiền mà sửa được thì không còn là sổ.

### Số phải trả là con số khách đã NHÌN THẤY

`snapshot_extra_amount` chép lại lúc khách bấm chốt, không tính lại theo trạng
thái hiện tại. CSKH đổi hạn mức sau đó thì phát sinh tính lại sẽ ra số khác,
nhưng khách đã trả theo số cũ — và biên nhận phải khớp cái khách nhìn thấy.

### Báo, chứ không chặn

Thu thiếu và thu thừa đều ghi được. Màn CSKH hiện cảnh báo *"khách còn thiếu
X"* ngay cạnh nút chuyển sang chỉnh ảnh, nhưng **không khoá nút**. Chặn cứng ở
đây thì gặp trường hợp thật — khách trả trước một nửa, khách trả dư rồi bù vào
buổi sau — CSKH sẽ đi ghi tay ra ngoài, và sổ trong app thành sổ rỗng.

**Chủ studio chốt ngày 12.09.2026: báo, vẫn cho bấm.** Không khoá nút.

### Hai hình thức thu, không phải năm

**Chủ studio chốt ngày 12.09.2026: ba chi nhánh chỉ thu tiền mặt và chuyển
khoản.** Bản đầu PM tự thêm quẹt thẻ, ví điện tử và "khác" — đã bỏ. Mục không
bao giờ dùng để trong danh sách chỉ tổ nhân viên chọn nhầm, và một dòng sổ sai
hình thức thì báo cáo đối chiếu ngân hàng lệch theo.

Danh sách nằm ở `src/lib/payment-methods.ts`, **một chỗ duy nhất** — route và
màn hình cùng lấy từ đó. Bài học sáu bản chép tay ở mục 4b còn mới; không lặp
lại với danh sách thứ hai.

---

## 6c. CTV thời vụ chỉ thấy việc của mình

Tìm ra khi soát bảng `deliveries` sau BB-121. Trước đó bảng ấy **không ai ghi
vào**, nên chính sách đọc lỏng của nó không lộ ra. BB-121 bắt đầu ghi
`final_drive_url` — link thư mục ảnh **hoàn thiện** của từng khách — và lúc đó
một CTV làm một bộ đọc được link ảnh thành phẩm của mọi khách trong chi nhánh.

Cách soát: đếm bảng nào có chính sách đọc **không nhắc tới** `photoshop_ctv`.
Ra tám bảng. Đo thật bằng một phiên đăng nhập CTV trên bb-dev:

| Bảng | CTV đọc được | Chứa gì |
|---|---|---|
| `deliveries` | tất cả | link thư mục ảnh hoàn thiện |
| `shoots` | 120 / 471 | buổi chụp của mọi khách trong chi nhánh |
| `activity_logs` | 1.586 / 1.589 | ai đụng vào bộ nào, lúc nào |
| `notifications` | 0 / 0 — **bảng rỗng** | số điện thoại, link chat, nội dung nhắn |
| `babies` | 0 / 4 — an toàn nhờ may | tên, biệt danh, **ngày sinh** của bé |

Con số 0 của `notifications` **không chứng minh gì**: bảng đang rỗng. Chính
sách vẫn cho CTV đọc hết, và đã kiểm lại bằng cách chèn một dòng.

`babies` đang an toàn vì chính sách của nó lồng truy vấn vào `customers`, mà
bảng ấy chặn CTV — tức là **bảng nhạy cảm nhất trong cơ sở dữ liệu đang được
bảo vệ bởi hiệu ứng phụ ở bảng khác**. Nới `customers` một ngày nào đó là
`babies` mở theo, im lặng. `0037` viết rõ điều kiện vào chính `babies`.

Siết không làm hỏng màn hình nào: cả bốn bảng chỉ được đọc qua service_role,
vốn đi vòng qua RLS.

### Cái bẫy đắt nhất: hai chính sách đọc trên một bảng

Chính sách PERMISSIVE thì **OR** với nhau. Thêm một chính sách chặt bên cạnh
một chính sách lỏng **không chặn được gì**.

`activity_logs` có hai: `activity_select` (lỏng) và cái tôi vừa thêm. Lệnh
`drop policy if exists activity_logs_select` — đúng cú pháp, chạy thành công,
và **không xoá gì** vì tên thật là `activity_select`. Migration báo xanh, lỗ
hổng nguyên vẹn. Chỉ có đo lại bằng phiên đăng nhập CTV thật mới lộ ra.

`verify:db` giờ có cổng thứ 15 canh đúng hình dạng đó: **không bảng nào được
có hai chính sách SELECT**. Hiện 22 bảng, mỗi bảng một chính sách.

### Đo, chứ không đọc: `npm run soat:quyen`

Vì chính sách cộng dồn, đọc một chính sách rồi kết luận là sai. Script
`scripts/soat-quyen-doc.mjs` dựng một nhân viên giả cho **từng vai trò** rồi
đếm số dòng vai đó đọc được ở cả 23 bảng, in ra một bảng vai-trò × bảng. Mỗi
vai nằm trong một giao dịch bị huỷ, không để lại dòng nào.

Nó tìm ra thứ mà đọc chính sách không thấy: **`settings` là bảng duy nhất cả
chín vai trò đọc được hết**, kể cả CTV thời vụ — dòng toàn cục
(`branch_id null`) không có điều kiện nào. Trong bảng có khoá
`lark.webhook_url`.

Hôm nay giá trị rỗng nên chưa rò gì. Nhưng webhook là thứ ai cầm cũng nhắn
được vào Lark của studio — nó là một loại chìa khoá, và chỗ để chìa mà ai cũng
mở được thì chỉ chờ tới ngày có người bỏ chìa vào. Đúng hình dạng lỗ hổng
`deliveries`: chính sách viết cho bảng chưa có dữ liệu thì không ai soát kỹ.

`0038` bắt theo **hình dạng tên** chứ không theo danh sách liệt kê — khoá nào
có `url`, `token`, `secret`, `key`, `password` hay `webhook` thì chỉ chủ và
quản trị đọc được. Liệt kê từng khoá thì khoá thêm sau này không ai nhớ bổ
sung; bắt theo tên thì `zalo.api_token` hay `smtp.password` tự động bị chặn.

Một bẫy nữa của script: bản đầu in "cấm" cho **tám bảng liền nhau**, toàn số
giả. Nguyên nhân là một truy vấn lỗi làm hỏng cả giao dịch, mọi truy vấn sau
đó lỗi theo. Suýt thành một phát hiện tưởng tượng. Giờ mỗi bảng có savepoint
riêng.

Và con số 0 không phải lúc nào cũng là tin tốt: `notifications` cho 0 vì
**bảng đang rỗng**, không phải vì bị chặn. Script in kèm chữ *(bảng rỗng)* để
không ai đọc nhầm con số đó nữa.

---

## 6d. Hạn mức bịa: 434 bộ mang số 20 mà không ai chọn

Tìm ra khi đo xem dữ liệu thật đã dùng được chưa. Câu hỏi đơn giản — *bao nhiêu
bộ ảnh còn thiếu hạn mức* — trả lời ra **không bộ nào**. Con số đó quá đẹp.

Phân bố hạn mức: **434 / 436 bộ có hạn mức đúng bằng 20**. Hai bộ còn lại là 35
và 15.

Cột `galleries.included_quota` từng có `default 20`. Toàn bộ 432 bộ nhập từ
Lark được chèn **trước** khi `0030` bỏ mặc định đó, và script nhập không hề ghi
cột này. Nên con số 20 không từ đâu ra cả.

`0016` dựng cổng QUOTA_UNKNOWN với đúng một mục đích: **hạn mức chưa biết thì
chặn, không đoán**. `0030` bỏ mặc định để "chưa biết" biểu diễn được. Nhưng dữ
liệu chèn trước đó vẫn mang số đoán, nên cổng không bao giờ nổ.

### Vì sao chỉ sửa ba dòng chứ không phải 434

`app.gallery_quota()` chỉ đọc cột này khi bộ ảnh **không có dòng hợp đồng nào**;
có dòng thì nó cộng các dòng `Edit file` và bỏ qua cột. Nên 430 bộ có hợp đồng
vẫn ra số đúng dù cột sai.

Đối chiếu cho thấy mức lệch: **337 bộ có cột mâu thuẫn với chính hợp đồng của
nó** — 187 bộ ghi 20 trong khi hợp đồng là 15, 52 bộ ghi 20 trong khi hợp đồng
là 30. Số trong cột vô hại vì không được dùng, nhưng ai đọc thẳng cơ sở dữ liệu
sẽ tin nhầm.

Thật sự nguy hiểm là các bộ **không có dòng hợp đồng nào** — lúc đó số 20 được
dùng thật. Có sáu bộ như vậy:

| Bộ | Hạn mức | Nguồn | Xử lý |
|---|---|---|---|
| Bé Bơ, Bé Sóc, Bé Bin | 20 / 15 / 35 | dữ liệu mẫu | giữ — người đặt |
| ba bộ mã `HD_…` | 20 | Lark | **xoá về "chưa biết"** |

Ba bộ Lark đó giờ chặn khách chọn ảnh, và CSKH phải điền số thật. Chặn một bộ
còn hơn mời khách chọn 20 ảnh trong khi họ trả tiền cho một số khác — lúc đó
studio hoặc chịu lỗ phần chênh, hoặc phải gọi điện nói với khách là mình ghi
nhầm.

Sau `0039`: **427 bộ có hạn mức đúng, 9 bộ chờ CSKH điền** (ba bộ trên cộng sáu
bộ có hợp đồng nhưng thiếu dòng `Edit file`).

`verify:db` có cổng thứ 16 canh: không bộ ảnh Lark nào được mang hạn mức khi
chưa có dòng hợp đồng nào.

### Cái nút không tồn tại

Vá xong mới thấy vấn đề thật: chín bộ ảnh giờ bị chặn đúng như thiết kế, và
màn hình bảo CSKH *"thêm dòng Edit file bên dưới"* — nhưng **không có nút nào
để làm**. Đường `POST` thêm dòng hàng có sẵn từ lâu; giao diện thiếu. Có hai
chỗ trên màn hình bảo người ta "thêm tay" mà không đưa chỗ để thêm.

Bảo người ta làm một việc rồi không đưa chỗ để làm là cách chắc chắn để họ đi
sửa thẳng cơ sở dữ liệu — và lúc đó mọi cổng đã dựng đều vô nghĩa.

Màn CSKH giờ có ô chọn sản phẩm (nhóm theo loại) kèm số lượng. Bộ nào chưa rõ
hạn mức thì ô chọn **mở sẵn ở dòng ảnh chỉnh sửa**, vì đó gần như luôn là thứ
cần thêm. Thêm xong, nếu hạn mức đổi thì màn hình báo bằng **con số trước và
sau** — *"chưa biết → 15 ảnh"* — chứ không phải một câu chung chung.

### Bài học chung của hai mục 6c và 6d

Cả hai lỗi đều **không gây lỗi đỏ ở đâu cả**. Một cái là chính sách viết cho
bảng đang rỗng; một cái là giá trị mặc định đã bị bỏ, nhưng dữ liệu chèn trước
đó vẫn mang nó. Không phép thử nào đỏ, không màn hình nào hỏng. Chỉ có **đo
thẳng vào dữ liệu và hỏi "con số này từ đâu ra"** mới thấy.

---

## 6e. Kéo ảnh từ Drive, và cái bẫy 200-mà-rỗng

Chủ studio chốt ngày 14.09.2026: *"đồng bộ ảnh từ Drive, bộ nào trùng lỗi thì
bỏ qua, đồng bộ những bộ đúng trước"*.

### Kết quả đợt đầu

| | |
|---|---|
| Đồng bộ được | **350 bộ**, 152.472 ảnh, hết 4 phút |
| Lỗi, đã bỏ qua | **77 bộ** — tất cả cùng một lý do: thư mục chưa chia sẻ công khai |

Lỗi ghi lên từng bộ (`galleries.sync_error`) để CSKH nhìn thấy trên màn hình,
không nằm im trong nhật ký. Sửa quyền chia sẻ bên Drive xong thì chạy lại với
`--lam-lai`.

### Cái bẫy: Drive trả 200 kèm danh sách RỖNG

Ba bộ chạy thử đầu tiên đều báo **thành công với 0 ảnh**, và bị đánh dấu *sẵn
sàng gửi khách*. Hỏi thẳng Drive về chính ba thư mục đó thì trả **404**.

Nguyên nhân: lệnh liệt kê dùng `q='<id>' in parents`. Với một thư mục **không
đọc được**, Drive không trả 403 hay 404 — nó trả **200 kèm danh sách rỗng**.
Nên `driveFetch` không bao giờ có cơ hội ném `DriveAccessDeniedError`, đồng bộ
báo thành công, và khách mở link ra thấy **trang trắng** rồi gọi điện hỏi
studio làm mất ảnh của con mình.

Vá hai lớp:

1. `assertFolderReadable()` hỏi `/files/{id}` **trước** khi liệt kê — đường đó
   trả 404 thật khi không đọc được.
2. Không bao giờ đánh dấu *sẵn sàng gửi khách* khi không có tấm ảnh nào. Lớp
   một bịt nguyên nhân đã biết; lớp hai bịt **hình dạng của hậu quả**, dù
   nguyên nhân là gì.

### Thứ tự chạy: mới nhất trước

Bản đầu chạy từ bộ cũ nhất. Mười bộ đầu (tháng 7.2025) hỏng thư mục cả mười,
trong khi lấy ngẫu nhiên cả kho thì 30/40 đọc được — thư mục cũ hay bị gỡ chia
sẻ. Chạy từ cũ nhất là mấy phút đầu chỉ toàn lỗi, người ngồi xem tưởng cả mẻ
hỏng. Mới nhất trước cũng đúng thứ tự cần: bộ vừa chụp là bộ sắp phải gửi khách.

### Tên file không lộ thông tin khách

Kiểm bằng cách che (chữ → X, số → 9) rồi mới đọc hình dạng: tên file toàn kiểu
máy ảnh (`X99_9999.jpg`), 26/26 tên thư mục con đều là từ kỹ thuật (ảnh gốc,
đã chỉnh, đã chọn…). Không có tên người nào vào bb-dev.

---

## 6f. Tạo link gửi khách

Chủ studio mô tả từ đầu: *"nhân viên tạo link app của khách và gán lại vào cột
link app trong hậu kỳ Lark"*. Cho tới hôm nay **không có đường nào tạo link** —
chỉ có đường đổi PIN, và link duy nhất trong cơ sở dữ liệu là của dữ liệu mẫu.

`POST /api/admin/galleries/[id]/share-link` + nút bên màn CSKH.

**Link hiện đúng một lần.** Cơ sở dữ liệu chỉ giữ bản băm SHA-256, không giữ
mã. Mất thì tạo lại chứ không đọc lại được — cùng luật với PIN. Nhật ký chỉ ghi
sáu ký tự đầu.

**Tạo link mới thì thu hồi link cũ.** Hai link cùng sống nghĩa là mã cũ vẫn mở
được, kể cả khi CSKH tạo mới đúng vì nghi mã cũ lọt ra ngoài.

**Chưa có ảnh thì không tạo được link.** Gửi link cho khách khi bộ ảnh trống là
để khách mở ra thấy trang trắng rồi gọi điện.

### Gắn theo bộ ảnh, không gắn theo khách — và vì sao

Ràng buộc `chk_share_link_target` bắt chọn đúng một trong hai. `0010` đã đổi mô
hình sang **một link cho một khách** làm địa chỉ vĩnh viễn, vì link hết hạn
khiến phụ huynh không xem lại được ảnh con mình.

Nhưng nửa còn lại của mô hình đó **chưa làm xong**: link theo khách mint ra
phiên có `galleryId` rỗng và không tạo lượt chọn, vì một khách có nhiều buổi
chụp và chưa có trang cho khách chọn xem buổi nào. Dùng nó hôm nay là gửi khách
một link mở ra lỗi.

Nên link gắn theo bộ ảnh — cũng đúng với cột *link app* bên Hậu Kỳ, vốn **một
dòng một buổi chụp**. Ý định của `0010` vẫn giữ: **không đặt hạn dùng**, link
không hết hạn. Cái `0010` muốn bỏ là hạn dùng, không phải việc gắn theo bộ ảnh.

Ràng buộc cơ sở dữ liệu chính là thứ bắt được lỗi này: bản đầu của route gắn
vào `customer_id` và bị từ chối thẳng. Không có ràng buộc đó thì link vẫn tạo
ra, vẫn trông đúng, và hỏng lúc khách mở. Vì thế có thêm một phép thử đi hết
đường — tạo link → đăng nhập bằng chính mã đó → kiểm phiên trỏ đúng bộ ảnh.

---

## 7. Đợt đẩy dữ liệu thật đầu tiên

Chủ studio chốt: chỉ đẩy các bộ **chưa qua khâu in**. Đo trên bảng Hậu Kỳ ngày
12.09.2026, 3.177 bản ghi.

### 7.1. Năm trạng thái bị loại

Tên chủ studio gọi, và giá trị thật bên Lark:

| Chủ studio nói | Giá trị trong Lark | Số bản ghi |
|---|---|---|
| đã chốt in | `Đã chốt chưa in` | 12 |
| đã in | `Đã gửi In` | 97 |
| hình đã về | `Hình đã về` | 255 |
| đã giao | `Đã Giao` | 1.954 |
| đã cskh | `Đã CSKH` | 362 |

Hai dòng đầu ban đầu là PM suy ra — chủ studio nói "đã chốt in" và "đã in",
Lark ghi "Đã chốt chưa in" và "Đã gửi In". **Chủ studio đã xác nhận ngày
12.09.2026: đúng hai giá trị đó.**

### 7.2. Còn lại bao nhiêu

```
3.177  tổng bản ghi hậu kỳ
2.680  bị loại (năm trạng thái trên)
  497  còn lại
  443  trong đó CÓ "Link ảnh gửi khách"   <== số bộ ảnh sẽ lên app
```

| Trạng thái | Số bộ ảnh | Ghi chú |
|---|---|---|
| `Đã gửi file gốc` | 270 | **đúng điểm app thay thế** — khách chưa chọn |
| `Đã Chọn Hình` | 84 | khách **đã chọn rồi** bằng cách cũ |
| `Đã Gửi Duyệt` | 71 | |
| `Đang làm` | 11 | |
| `Leader check hình` | 6 | |
| `sửa` | 1 | |

**84 bộ `Đã Chọn Hình`: chủ studio chốt ĐƯA LÊN**, để có dữ liệu thật mà kiểm.
Khách những bộ này đã chọn ảnh bằng cách cũ, nên đừng gửi link cho họ trong
đợt thử — chúng ở đó để kiểm phần tính toán, không phải để khách dùng.

### 7.3. Dữ liệu cá nhân — quy tắc che, chủ studio đã chốt

Cả 443 bản ghi đều mang dữ liệu cá nhân thật:

| Cột Lark | Có giá trị | Nội dung |
|---|---|---|
| `Tên KH` | 443/443 | tên thật |
| `SDT KH` | 443/443 | số điện thoại thật |
| `Mã KH` | 443/443 | **gộp cả tên lẫn số điện thoại vào một chuỗi** |

`bb-dev` dùng chung cho PM và toàn bộ agent, test xoá dòng trong đó, và repo
**công khai** — ảnh chụp màn hình lên PR là dữ liệu đi theo.

**Chốt: che tên và số điện thoại, giữ nguyên phần còn lại.** Mở lại khi dựng
`bb-prod`; lúc đó agent không được cấp khoá vào đó.

#### Bảng ánh xạ, DEV-INT làm đúng từng dòng

| Cột trong app | Đợt này ghi gì | Vì sao |
|---|---|---|
| `customers.full_name` | `KH · HD_20250722#572` (chính mã hợp đồng) | **Đây là cách phân biệt khách.** Duy nhất, dán thẳng vào ô tìm kiếm bên Lark là ra đúng người. Không mang tên ai. |
| `customers.phone` | `null` | |
| `customers.phone_normalized` | `null` | |
| `customers.facebook` | **chỉ phần URL** của ô `Chat với khách` | chủ studio yêu cầu đưa link chat lên để còn liên lạc được |
| `customers.zalo` | `null` | |
| `customers.note` | `null` | ô `Ghi Chú` bên Lark là nhận xét về từng khách, ví dụ *"đã nhắc mẹ rất nhiều lần"* |
| `galleries.lark_contract_code` | **giữ nguyên thật** | khoá để kéo hợp đồng, không phải dữ liệu cá nhân |
| dòng hàng, hạn mức, tiền | **giữ nguyên thật** | đây mới là phần cần kiểm |

#### Hai chỗ dễ làm hỏng

**Một.** Ô `Chat với khách` bên Lark có dạng
`[{ "link": "https://...", "text": "<tên khách>" }]`.
**Chỉ lấy `link`, bỏ `text`.** Lấy cả ô bằng `cellText()` sẽ kéo luôn tên
khách vào — đúng thứ vừa mất công che.

**Hai.** Bản thân URL chat vẫn chứa một mã định danh Facebook của khách. Che
tên và số điện thoại **làm giảm** mức lộ, không xoá hẳn. Ảnh chụp màn hình có
link chat vẫn không được đưa lên PR.

#### Không phụ thuộc vào tên

Toàn bộ phần dễ sai — mã hợp đồng, dòng hàng hai tầng, hạn mức, tiền vượt, báo
cáo thất thoát — **không dùng tới tên khách một lần nào**. Che tên không làm
yếu phép thử.

### 7.4. Bẫy đọc dữ liệu đã vấp

`SDT KH` là ô kiểu điện thoại, Lark trả `[{ "fullPhoneNum": "..." }]`. Bộ bóc ô
của PM thiếu nhánh này nên đọc ra chuỗi rỗng, và PM đã báo nhầm "443 bản ghi
không có số điện thoại nào". Không có lỗi nào bật lên — ô có dữ liệu, hàm trả
rỗng, hết.

Đã vá trong cả hai script đồng bộ. Ai viết bộ đọc Lark mới thì chép `cellText`
từ `scripts/sync-lark-contracts.mjs`, đừng viết lại.

### 7.5. Chạy thử toàn bộ trước khi đẩy — ba vấn đề tìm được

PM chạy đường ống hợp đồng ở chế độ **chỉ đọc** trên toàn bộ nhóm sắp đẩy,
ngày 12.09.2026. Không ghi gì vào Lark, không ghi gì vào `bb-dev`.

| | |
|---|---|
| Bộ sẽ đẩy lên | **447** (số đo lần trước là 443 — dữ liệu Lark thay đổi từng ngày) |
| Không có mã hợp đồng | 0 |
| Có mã nhưng Lark không có dòng nào | 0 |
| **Suy được hạn mức** | **440** |
| **KHÔNG suy được hạn mức** | **7** |
| Có sản phẩm in | 438 |
| Có bộ ảnh | 146 |
| Dòng hợp đồng / dòng thành phần | 1.070 / 1.109 |

Phân bố hạn mức khớp với lịch sử: 15 ảnh (191 bộ), 20 (92), 30 (52), 5 (36).

#### Vấn đề 1 — 11 mã hợp đồng dùng cho hai bản ghi hậu kỳ

Một mã hợp đồng xuất hiện ở **hai** bản ghi Hậu Kỳ khác nhau, 11 lần.

Nếu bộ ảnh được tạo **theo mã hợp đồng**, 11 mã đó thành 22 bộ ảnh, và mỗi bộ ảnh
nhận đủ dòng hàng của hợp đồng — **hạn mức bị đếm hai lần, studio cho không
gấp đôi số ảnh.**

> **Bộ ảnh phải được tạo theo BẢN GHI HẬU KỲ, không phải theo mã hợp đồng.**
> Một hợp đồng có thể có nhiều bản ghi hậu kỳ (nhiều buổi chụp, nhiều bé).
> `galleries.lark_contract_code` là thứ để TRA CỨU hợp đồng, không phải khoá
> định danh bộ ảnh.

`scripts/sync-lark-contracts.mjs` giờ **cảnh báo** khi thấy nhiều bộ ảnh chung
một mã, liệt kê ra từng cái. Cảnh báo chứ không chặn — có thể là hai buổi chụp
thật, và chỉ người chạy mới phân biệt được. Nhưng phải nhìn thấy nó.

Đã đối chứng: dựng hai bộ ảnh cùng mã thì cảnh báo nổ đúng.

#### Vấn đề 2 — 7 bộ không suy được hạn mức

Bảy hợp đồng không có dòng `Edit file` nào. Theo luật ở mục 3.2, khách của bảy
bộ này sẽ **bị chặn chọn ảnh** và thấy *"studio sẽ báo lại số ảnh trong gói"*.

Đó là hành vi đúng — chặn còn hơn mở trần. Nhưng bảy hợp đồng này cần được bổ
sung bên Lark trước khi gửi link cho khách, nếu không CSKH sẽ nhận bảy cuộc
gọi.

#### Vấn đề 3 — 8 dòng hóa đơn trống

Tám dòng không liên kết tới sản phẩm nào và trị giá 0đ. Script bỏ qua chúng và
có báo ra. Không ảnh hưởng tiền hay hạn mức.

*(Lần quét đầu PM đọc ra "88 dòng thiếu sản phẩm" — con số đó đếm gộp cả dòng
thành phần và đếm theo lượt xuất hiện. Đếm đúng ở tầng hóa đơn là 8.)*

### 7.6. Một bộ ảnh = một thư mục ảnh, có thể gom nhiều hợp đồng

Chủ studio giải thích ba trường hợp thư mục Drive dùng chung, ngày 12.09.2026:

| Cặp | Thực chất |
|---|---|
| `HD_...#3556` + `#3557` | **một nhà, một buổi chụp, hai gói chụp** nên lập hai hóa đơn |
| `HD_...#4260` hai lần | đã xử lý xong bên Lark |
| `HD_...#4487` + `#4515` | **nhân viên điền sai**, để nhân viên sửa sau |

Trường hợp đầu quyết định mô hình. Khách đó **chỉ nhìn thấy một thư mục ảnh**,
và hạn mức của họ là **tổng hai hợp đồng**. Tách thành hai bộ ảnh là chia đôi
hạn mức của chính khách: họ mua 35 + 35 ảnh nhưng mỗi màn hình chỉ cho chọn 35,
và ảnh thì trùng nhau vì cùng một thư mục.

**Đơn vị định danh bộ ảnh là `drive_folder_id`** — thứ khách nhìn thấy — chứ
không phải bản ghi hậu kỳ (0027) cũng không phải mã hợp đồng.

```
drive_folder_id        KHOÁ ĐỊNH DANH
lark_contract_codes    mọi hợp đồng đổ vào bộ ảnh này
lark_contract_code     phần tử đầu, giữ cho chỗ hiển thị
lark_hauky_record_id   bản ghi hậu kỳ đầu tiên, để tra ngược — THÔI unique
```

Ràng buộc `chk_contract_code_first` giữ hai cột mã hợp đồng khỏi nói khác nhau.

Kết quả trên dữ liệu thật: **432 bộ ảnh từ 446 bản ghi**, 4 bộ ảnh gom hai hợp
đồng. Cặp `#3556 + #3557` giờ là một bộ ảnh **hạn mức 70 ảnh**.

> **Máy không phân biệt được hai kiểu gom.** Mã liên tiếp thường là một nhà mua
> hai gói; mã cách xa nhau thường là dán nhầm link. Script in ra **toàn bộ**
> danh sách bộ ảnh gom kèm nhãn *"liên tiếp, có vẻ cùng nhà"* hoặc *"CÁCH XA
> NHAU, kiểm kỹ"*. Gom nhầm hai nhà là khách này nhìn thấy ảnh con nhà kia, nên
> danh sách đó phải có người đọc — không được bỏ qua.

Ba cặp đang mang nhãn *kiểm kỹ*: `#4796 + #4898`, `#4842 + #4967`,
`#4635 + #4638`.

### 7.7. Một khách hàng là một khách hàng, dù có bao nhiêu hóa đơn

Chủ studio chỉ ra ngày 12.09.2026: *"một khách hàng nhiều hóa đơn buổi chụp"*.
Đợt nhập đầu của PM đặt tên khách theo **mã hợp đồng**, nên mỗi hợp đồng thành
một khách.

| | |
|---|---|
| Khách thật | **405** |
| App tạo ra | 446 |
| Khách có nhiều hợp đồng | 25 — 21 người có 2, 4 người có 3 |

41 khách bị xé nhỏ. Hậu quả không chỉ là đếm sai:

- **Cổng khách (`0010`) cấp MỘT link cho MỘT khách** để xem mọi buổi chụp của
  họ. Khách bị xé nhỏ thì mỗi buổi một link — đúng thứ `0010` sinh ra để bỏ.
- Mô hình chủ studio chốt từ đầu là *một khách → nhiều buổi chụp → nhiều gói*.
  Xé khách ra là phá tầng trên cùng.

**Khoá đúng là `Mã KH` bên Lark**, có đủ ở 446/446 bản ghi. Nhưng mã đó gộp cả
tên lẫn số điện thoại, nên lưu **băm sha256, 12 ký tự đầu**: cùng khách thì cùng
khoá ở mọi lần chạy, mà không đọc ngược ra tên hay số điện thoại. Xem `0029`.

Tên bộ ảnh đổi sang **mã hợp đồng** để nhân viên dán vào Lark tra ra ngay; tên
khách là bí danh bám theo khoá băm.

Sau khi sửa: **405 khách · 432 bộ ảnh · 1.988 dòng hàng**, 23 khách có nhiều hơn
một buổi chụp — bốn người trong đó có ba buổi trải nhiều tháng.

#### Hai lỗi lộ ra nhờ việc này

**Một.** Câu `insert ... on conflict do nothing` cũ **không có ràng buộc duy
nhất nào để đụng vào**, nên nó không bao giờ xung đột — mỗi lần chạy lại là
chèn thêm 446 khách mới. Năm lần chạy để lại **2.154 khách rác** trong
`bb-dev`. `on conflict do nothing` mà thiếu chỉ số duy nhất thì không phải "bỏ
qua nếu trùng", nó là **"luôn luôn chèn"**.

**Hai.** Test `admin-galleries` tìm `q=0912` rồi kiểm khớp trên
`phone`/`babyName`/`customerName`, nhưng RPC `0013` còn tìm cả `g.title`. Bộ ảnh
mang tiêu đề `HD_20260912#...` khớp qua tiêu đề — **API đúng, test báo sai**.
Kèm theo `customerPhone` có thể null vì đã che, và gọi `.includes` trên null ném
`TypeError` che mất phép thử thật.
