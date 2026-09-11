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
