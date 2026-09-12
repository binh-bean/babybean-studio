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
| 6 | Thanh toán phát sinh | tiền vẫn thu ngoài app |

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
