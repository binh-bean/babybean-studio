# Đối chiếu với quy trình thật đang chạy trên Lark

*Viết 11.09.2026, từ bộ bàn giao `ban-giao-studio-os/` — kiểm kê thật trên Base
vận hành của studio, 2.658 dòng hậu kỳ, 4.231 hợp đồng.*

Mục đích: **dựng cho khớp thực tế ngay từ đầu**, đừng để phải đập ra làm lại.

> **Không đưa mã định danh Lark vào repo này.** `table_id`, `field_id`,
> `option_id` nằm trong thư mục bàn giao ngoài repo. Repo này công khai; tài
> liệu ở đây chỉ mô tả **quy trình nghiệp vụ**, thứ vốn không bí mật.

---

## 1. Quy trình thật, chín bước

```
1. Sale chốt đơn          → hợp đồng + dòng hàng (gói chụp, sản phẩm in)
2. Xếp lịch               → buổi chụp: thợ ảnh, ngày
3. Chụp xong              → PHOTOGRAPHER đổ ảnh gốc lên Drive
4. Tạo bản ghi hậu kỳ     → trạng thái "Đã gửi file gốc"
5. Gán link ảnh cho khách → PHOTOGRAPHER HẾT VIỆC TỪ ĐÂY
6. Khách chọn ảnh         → ĐÂY LÀ CHỖ APP NÀY THAY THẾ
7. Chỉnh ảnh              → NGƯỜI PHOTOSHOP / PHOTOSHOP CTV
8. Đổ ảnh chỉnh vào thư mục con
9. In và giao             → CSKH
```

Ba chặng, ba người khác nhau, **bàn giao ở bước 5 và bước 6**:

| Chặng | Ai | Từ bước | Tới bước |
|---|---|---|---|
| Chụp | Photographer | 3 | **5** |
| Bán và chăm sóc | CSKH | 5 | 9 |
| Hậu kỳ | Người Photoshop · Photoshop CTV | 7 | 8 |

Vì vậy album phải ghi được **ba người phụ trách**, không phải một. Xem BB-099.

---

## 2. Trạng thái — hai trục khác nhau, đừng trộn

Bảng hậu kỳ bên Lark có 12 trạng thái. `galleries.status` của ta có 10. Chúng
**không phải hai phiên bản của cùng một thứ**:

| Trục | Nói về | Ai quan tâm |
|---|---|---|
| `gallery_status` của ta | vòng đời **cổng chọn ảnh** | khách và CSKH |
| Trạng thái bên Lark | vòng đời **sản xuất ảnh** | hậu kỳ và quản lý |

Chúng chỉ chạm nhau ở hai điểm: *"đã gửi file gốc"* ≈ `ready`, và *"đã chọn
hình"* ≈ `submitted`.

**Hệ quả:** muốn thay Lark thì `gallery_status` phải nuốt thêm phần sản xuất —
hiện đang nhảy thẳng từ `submitted` sang `in_retouch` rồi `delivered`, bỏ qua
toàn bộ những nấc mà hậu kỳ thật sự đi qua:

```
leader duyệt hình  →  gửi khách duyệt  →  khách xin sửa (vòng 1, 2, 3…)
   →  chốt chưa in  →  đã gửi in  →  hình đã về  →  đã giao
```

Thiếu những nấc này thì kanban không dùng được cho hậu kỳ, và quản lý không
biết một album đang tắc ở đâu.

**Luật khi ghép Lark về sau:** khớp theo `option_id`, **không khớp theo tên**.
Nhân viên đổi tên hiển thị bất cứ lúc nào. Gặp `option_id` lạ thì giữ nguyên
trạng thái cũ và ghi log — **không đoán theo tên**.

**Bước chỉ đi tới, không đi lui.** Lưu bước cao nhất đã từng đạt.

---

## 3. Những ô bảng hậu kỳ có mà ta chưa có

| Thứ | Lark | Ta | Cần không |
|---|---|---|---|
| Mức khẩn | `Cảnh Báo`: An Toàn · Cảnh Báo · Nguy Hiểm · Phải Xong Trong Ngày | không có | **Có** — BB-024 đã muốn lọc theo mức khẩn mà không có cột |
| Nhãn dán | `Nhãn Dán`: Sinh Nhật Gấp · Thêm Tên · Đã Nhắc Chọn · Đã in ảnh phóng | không có | **Có** — "Đã Nhắc Chọn" là thứ CSKH dùng hằng ngày |
| Ba người phụ trách | `Người Photoshop` · `CSKH` · `Photoshop CTV` | không có | **Có** — BB-099 |
| Mốc thời gian | 6 mốc: deadline, chọn ảnh, giao ảnh, gửi in, ảnh về, gửi file gốc | `due_at`, `submitted_at` | **Một phần** — thêm khi tới giai đoạn sản xuất |
| Sản phẩm in theo album | `Sản phẩm in ấn`, 7 loại | bảng `deliveries` (Phase 2) | Sau |
| Số ảnh đã chỉnh | `Tổng file edit` | suy từ `selection_items` | Ta tính được, tốt hơn |

---

## 4. Ba con số phá vỡ giả định cũ

Đo trên 2.841 buổi hậu kỳ trong 379 ngày:

| | Kế hoạch cũ của dự án này | Đo thật |
|---|---|---|
| Buổi chụp mỗi ngày | 32 | **7,5** |
| Ảnh một bộ | 1.500 (BB-071) | **300–400** |
| Ảnh chỉnh giao khách | — | **19 ảnh/bộ** |

PM đo lại độc lập trên thư mục thật của studio ngày 11.09: **390 ảnh**, khớp.

**Đừng tối ưu cho 1.500 ảnh.** Ảo hoá lưới là công sức đổ vào vấn đề không tồn
tại; 400 ảnh chỉ cần `loading="lazy"`.

---

## 5. Lý do kinh tế của dự án

> **661 buổi (32,8%) giao vượt hạn mức mà không thu tiền** — 4.571 ảnh, đơn giá
> đo được 48.859 ₫/ảnh ≈ **223 triệu ₫/năm**.
>
> Studio đang cho không nhiều hơn số bán được.

Đây là thứ đáng đo sau một tháng chạy thật. Con số `Edit file` không nhúc nhích
thì giả thuyết sai, và biết sớm rẻ hơn biết muộn.

**Hạn mức ảnh không tồn tại trong Lark.** Bảng suy luận từ dữ liệu lịch sử
(trung vị số file edit của buổi không mua thêm) — **chưa ai xác nhận**, phải hỏi
chủ studio trước khi dùng để đòi tiền.

---

## 6. Luật hiển thị hạn mức — lấy nguyên từ `quota.ts` của bộ bàn giao

Sai ở đây là tranh chấp tiền bạc với khách, nên công thức nằm **một chỗ duy
nhất, ở backend**. Client không tự tính.

| Tình huống | Hiện gì |
|---|---|
| Chưa biết hạn mức | *"studio sẽ báo lại số ảnh trong gói"* — **TUYỆT ĐỐI không hiện số 0** |
| Biết hạn mức, chưa có đơn giá | nói vượt bao nhiêu ảnh, **không nói tiền** |
| Bỏ chọn sau khi đã vượt | tiền phải quay về 0 |

Hiện `0` thì khách hoặc tưởng miễn phí, hoặc tưởng vượt ngay từ tấm đầu tiên.

Ca biên bắt buộc kiểm thử: 0 ảnh · đúng hạn mức · vượt 1 · vượt 100 · bỏ chọn
sau khi đã vượt.

### 6.1. Lark có ba tầng, không phải hai

Đọc toàn bộ dữ liệu thật ngày 11.09.2026:

```
Hóa Đơn                4.744    một hợp đồng
  Hóa Đơn Chi Tiết    11.689    dòng hợp đồng: sản phẩm, số lượng, ĐƠN GIÁ
    Chi Tiết Gói Chụp  9.637    dòng đó gồm những gì — KHÔNG có tiền
```

Tầng giữa mang tiền, tầng dưới mang thành phần. Bảng danh mục `Sản Phẩm Dịch Vụ`
(132 dòng) chỉ có tên và phân loại — **không có cột giá**. Giá chỉ tồn tại trên
từng dòng hóa đơn đã bán.

**`Giá niêm yết` là ĐƠN GIÁ, không phải tiền cả dòng.** Kiểm trên 11.163 dòng có
đủ hai cột: `Thành Tiền niêm yết` = `Giá niêm yết` × `Số Lượng`, đúng
11.163/11.163 dòng, không sai dòng nào. Ai chia `Giá niêm yết` cho `Số Lượng` sẽ
thấy một bảng giá loạn xạ và kết luận nhầm là studio bán phá giá — PM đã mắc
đúng lỗi này một lần trong quá trình khảo sát.

### 6.2. Hạn mức nằm ở đâu — bộ bàn giao kết luận sai

`ban-giao-studio-os/01-doc-truoc/TONG-HOP-BAN-GIAO.md` §A5 viết: *"Hạn mức ảnh
— KHÔNG có trường nào trong Lark"*, rồi dựng bảng ước lượng theo trung vị kèm
cảnh báo *"đây là suy luận, chưa ai xác nhận"*.

Đúng về **trường**, sai về **dữ liệu**. Hạn mức là một **dòng hàng** ở tầng dưới
cùng: sản phẩm `Edit file`, cột `Số Lượng`. Đếm trên toàn bộ 9.637 dòng:

| | |
|---|---|
| Hợp đồng riêng biệt | 4.403 |
| Có dòng `Edit file` | **4.212 — 95,7%** |
| Không có | 191 — **chưa biết**, không phải bằng 0 |

| Số ảnh | 5 | 6 | 10 | 15 | 16 | 17 | 20 | 21 | 25 | 30 | 31 | 35 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Số hợp đồng | 355 | 34 | 48 | **2.043** | 179 | 37 | **804** | 89 | 30 | **325** | 27 | 54 |

Đuôi dài tới **141 ảnh**. Số lẻ (16, 17, 21, 31…) là gói gốc **cộng ảnh mua thêm
ngay lúc ký** — hạn mức thật, tuyệt đối không làm tròn về 15 hay 20.

Ảnh mua thêm **sau** khi ký nằm ở tầng giữa, cũng là sản phẩm `Edit file`. Nên
hạn mức thực = tổng `Số Lượng` mọi dòng `Edit file` ở **cả hai tầng**.

### 6.3. Thất thoát: ảnh đã giao mà chưa lập hóa đơn

Studio **có** thu tiền ảnh vượt, và thu đúng giá:

| | |
|---|---|
| Đơn giá `Edit file` | 50.000 ₫/ảnh, độ tin cậy 1,000 trên 405 lần bán |
| Đã bán thêm | 405 dòng hóa đơn, 4.027 ảnh |
| Đã thu (giá chốt cuối) | 197.075.000 ₫ |

Thất thoát không nằm ở hóa đơn. Nó nằm ở ảnh **đã giao mà chưa ai lập hóa đơn**.
So `Tổng file edit` (bảng Hậu Kỳ) với hạn mức + ảnh đã mua thêm, theo từng hợp
đồng:

| | |
|---|---|
| Hợp đồng so sánh được | 2.218 |
| Giao **vượt** số đã trả tiền | **584 hợp đồng, 4.246 ảnh** |
| Quy ra tiền theo 50.000 ₫/ảnh | **212.300.000 ₫** |
| Giao ít hơn hạn mức | 157 hợp đồng (khách chưa chọn xong) |

Riêng năm 2026 tính đến tháng 9: 486 hợp đồng, 3.315 ảnh, **165.750.000 ₫**.
Quy ra cả năm ≈ 221 triệu — khớp với con số 223 triệu/năm của bộ bàn giao, nhưng
lần này là **đếm**, không phải suy luận.

**Ba giới hạn của con số này, phải nói kèm mỗi lần trích dẫn:**

1. 875/3.177 bản ghi hậu kỳ chưa điền `Tổng file edit` → **không được tính**.
   Con số thật lớn hơn 212 triệu, không nhỏ hơn.
2. Chỉ 2.218 trong 4.403 hợp đồng có đủ cả hạn mức lẫn số đã giao.
3. Năm 2024 gần như trắng vì `Tổng file edit` mới được dùng gần đây. Phân bố
   theo năm phản ánh **độ phủ dữ liệu**, không phải xu hướng tăng.

Đây chính là lý do app này tồn tại: hôm nay không chỗ nào tự động đối chiếu
"khách đã chọn bao nhiêu" với "khách đã trả tiền cho bao nhiêu". Việc đó đang
phụ thuộc vào trí nhớ của CSKH. App làm việc đó ở mỗi lần khách bấm chọn.

> **Chưa làm, có chủ đích.** `galleries.included_quota` hôm nay là `not null
> default 20`. Bỏ `not null` để null mang nghĩa "chưa biết" sẽ **mở trần chọn
> ảnh**: `0009` dòng 190 kiểm tra `v_hard_limit is not null and ...`, hạn mức
> null làm mệnh đề thành null và Postgres coi như false. Khách chọn bao nhiêu
> cũng được, không tính tiền vượt. Phải sửa cùng lúc bốn chỗ đọc nó — chi tiết
> ghi trong đầu file `db/migrations/0014-danh-muc-san-pham.sql`. Con số 20 là
> bịa, nhưng nó **chặn**, còn null thì **mở**.

---

## 7. Thiết bị — khách dùng điện thoại

Phụ huynh mở link trong Messenger, **trên điện thoại, một tay bế con, buổi tối,
mạng 4G**. Không phải trên máy tính để bàn.

| | Số đo |
|---|---|
| Lưới ảnh | 3 cột điện thoại · 4 tablet · 6 desktop |
| Ảnh lưới | `w600` ≈ 50 KB (PM đo thật) |
| Ảnh xem lớn | `w1600` ≈ 218 KB |
| 50 ảnh song song | 3,7 giây, không lỗi 429 |

**Mọi màn hình quản trị cũng phải dùng được trên điện thoại.** CSKH tra cứu
giữa ca, không ngồi trước máy tính. Bảng bảy cột không nhét vừa màn hình hẹp —
từ `lg` trở lên là bảng, hẹp hơn thì mỗi dòng một thẻ.

**Giao diện đẹp làm sau.** Chủ studio sẽ dựng lại phần nhìn khi tính năng đã
chạy trơn. Việc bây giờ là **thao tác đúng trên mọi kích thước màn hình**, không
phải màu sắc.

---

## 8. Đã thử và đã bỏ — đừng làm lại

| Việc | Vì sao bỏ |
|---|---|
| Đường ống thu nhỏ ảnh + object storage | Drive tạo sẵn ảnh nhỏ. Đường ống cũ tốn **51 GB tải/ngày** để tiết kiệm vài KB |
| Đọc thư mục qua trang chia sẻ công khai | PM đo 11.09: trả về **50/390 ảnh** và **không báo lỗi**. Dùng Drive API với khoá — đo được 390/390 trong 1 giây |
| Máy tự nối thư mục ↔ hợp đồng | Đúng 76,5%. Phần sai không ai kiểm lại vì máy tự tin thì không đưa cho ai xem. Chuyển sang người gán tay |
| Dấu mờ trên ảnh | Chủ studio chốt: khách luôn nhận ảnh chất lượng cao |
| OTP xác thực khách | Quyền chia sẻ thuộc về khách hàng |
| Sinh mã buổi chụp từ đường dẫn thư mục | Đường dẫn không ổn định: trùng tên, sai chính tả, khác dấu |

---

## 9. Bẫy đã có người vấp

| Bẫy | Hậu quả |
|---|---|
| Mã hợp đồng chứa ký tự `#` | Không `encodeURIComponent` → trình duyệt cắt thành fragment, **không ảnh nào tải** |
| Tiền Việt viết `2.850.000` | Dấu chấm là phân cách nghìn. Đọc nhầm → **sai gấp nghìn lần** |
| Thư mục ảnh chỉnh sửa có **10+ cách viết tên** | `anh chinh sua` · `-file edit` · `Anh_chinh_sua` · `Anh-chinh-sua`… Chuẩn hoá khoảng trắng và dấu trước khi so |
| Thư mục giao **rỗng** không phải tín hiệu hoàn thành | Nhân viên tạo thư mục trước rồi mới upload. Phải đếm ảnh thật |
| Mốc đồng bộ nhích **trước khi** ghi xong | Mất trắng bản ghi trong khoảng lỗi. Chỉ nhích sau khi ghi thành công |
