# 13 — Quyết định vận hành & cấu hình mặc định

Tài liệu này chốt 7 câu hỏi treo ở `HANDOFF.md`. Agent lấy giá trị từ đây, không tự đoán.

**Cách đọc cột "Nguồn"**
- `Chốt` — quyết định kỹ thuật, có lý do bên dưới, cứ thế làm.
- `Giả định` — giá trị kinh doanh do PM cần xác nhận. Vẫn code bình thường, nhưng sửa ở **một chỗ duy nhất** đã ghi rõ.

| # | Câu hỏi | Trả lời | Nguồn |
|---|---|---|---|
| 1 | Giá ảnh mua thêm | Thang giảm dần theo gói: 60k / 50k / 45k / 40k | Giả định |
| 2 | Hạn chốt mặc định | **7 ngày**, nhắc ngày 3 và ngày 6 | Chốt |
| 3 | PIN mặc định | **Bật cho mọi album**, PIN = 4 số cuối SĐT | Chốt |
| 4 | Cho khách tải ảnh | **Tắt** ở Phase 1 | Chốt |
| 5 | Tên miền | `babybeanstudio.vn` | Giả định |
| 6 | Nhóm Lark | Riêng từng chi nhánh **+ 1 nhóm quản lý chung** (4 webhook) | Giả định |
| 7 | Ảnh preview | Cạnh dài **2048px**, JPEG q75, sRGB, xoá GPS | Chốt |

---

## 1. Giá ảnh mua thêm — thang giảm dần theo gói

| Mã gói | Tên | Giá gói | Ảnh miễn phí | **Ảnh thêm** |
|---|---|---|---|---|
| `BASIC` | Gói Cơ bản | 1.500.000đ | 15 | **60.000đ** |
| `STANDARD` | Gói Tiêu chuẩn | 2.500.000đ | 20 | **50.000đ** |
| `Q1-NEWBORN` | Newborn Quận 1 | 3.800.000đ | 30 | **45.000đ** |
| `PREMIUM` | Gói Cao cấp | 4.500.000đ | 35 | **40.000đ** |

**Vì sao giảm dần**: khách gói cao đã trả nhiều hơn, cho họ giá ảnh thêm rẻ hơn là phần thưởng cho việc nâng gói, và làm câu "nâng lên gói Cao cấp đi ba mẹ" của CSKH có sức thuyết phục. Nếu giá ảnh thêm bằng nhau ở mọi gói thì không ai có lý do nâng gói.

**Vì sao đoán sai cũng không đắt**: `included_quota` và `extra_photo_price` được **chép sang album lúc tạo** (`docs/03-data-model.md §2.3`). Đổi giá gói không ảnh hưởng album đã gửi khách. Bạn sửa giá bất cứ lúc nào trong màn Quản lý gói chụp.

**Sửa ở đâu**: [`db/seed.sql`](../db/seed.sql) mục Packages, hoặc trực tiếp trên giao diện sau khi chạy.

## 2. Hạn chốt mặc định — 7 ngày

Hiện tại khách mất 5–10 ngày. Mục tiêu ≤ 3 ngày.

**Không đặt hạn 3 ngày.** Đặt hạn quá ngắn với phụ huynh mới sinh con sẽ tạo ra hàng loạt album quá hạn ngay tuần đầu, nhân viên phải gia hạn thủ công liên tục, và cảnh báo "quá hạn" trên dashboard mất hết ý nghĩa vì lúc nào cũng đỏ.

Cách rút ngắn thời gian chốt là **nhắc đúng lúc**, không phải siết hạn:

| Mốc | Việc |
|---|---|
| Ngày 0 | Gửi link |
| Ngày 3 | Nhắc lần 1 (tự động) — chỉ gửi nếu khách chưa chốt |
| Ngày 6 | Nhắc lần 2 (tự động) — "còn 1 ngày" |
| Ngày 7 | Hết hạn → `expired`, cảnh báo nhóm Lark chi nhánh |
| Ngày 7+ | CSKH gọi điện |

Sau 1 tháng chạy thật, xem báo cáo "thời gian trung bình từ gửi link đến chốt". Nếu phần lớn khách chốt trong 3 ngày, hạ mặc định xuống 5 ngày. **Đo trước, siết sau.**

**Cấu hình**: `settings` key `gallery.default_due_days = 7`, ghi đè được theo từng album trong wizard.

## 3. PIN — bật mặc định cho mọi album

Ảnh trẻ sơ sinh là dữ liệu nhạy cảm nhất hệ thống này nắm giữ. Link bị chuyển tiếp là chuyện xảy ra thường xuyên trong nhóm gia đình trên Zalo.

Cân đối chi phí hai phía:
- Bật PIN: khách gõ thêm 4 số mà họ thuộc lòng (số của chính mình). Một lần cho mỗi thiết bị, phiên giữ 7 ngày.
- Tắt PIN: một lần chuyển tiếp nhầm là ảnh của bé nằm trong tay người lạ, và studio không biết.

**Bật mặc định.** Kèm ba lối thoát:
1. CSKH đặt PIN tuỳ ý cho khách VIP hoặc khách lớn tuổi (không dùng 4 số cuối SĐT).
2. CSKH tắt PIN cho một album cụ thể nếu khách thực sự không dùng được — có ghi `activity_logs`.
3. Link mời người thân (`suggester`) dùng PIN riêng, khách chính không phải chia sẻ PIN của mình.

**Lưu ý đã ghi trong `docs/12-security.md §3`**: PIN = 4 số cuối SĐT là **đoán được** nếu ai đó biết số điện thoại. PIN là lớp phòng vệ **thứ hai**, sau token 22 ký tự (~131 bit). Đừng bao giờ coi PIN là hàng rào duy nhất.

**Cấu hình**: `settings` key `gallery.require_pin_default = true`.

## 4. Cho khách tải ảnh — tắt ở Phase 1

Ba lý do:

1. **Không cần thiết để giải quyết vấn đề gốc.** Nhu cầu thật của khách không phải "tải ảnh về máy" mà là "cho chồng/bà xem cùng để quyết". Việc đó đã có link mời người thân (BB-065) giải quyết trực tiếp và tốt hơn — người thân xem được toàn bộ album chất lượng cao, không phải xem lại ảnh nén qua Zalo.
2. **Ảnh preview 2048px không có watermark cứng vẫn dùng in ảnh nhỏ được.** Một số khách sẽ tải về, tự chỉnh bằng app điện thoại và không mua ảnh thêm. Đây là rủi ro doanh thu có thật, không phải giả thuyết.
3. **Không chặn Phase 1.** Đây là BB-067, thuộc Phase 2. Bật lên sau bằng một công tắc, không phải viết lại gì.

**Bật cho ai**: khi Phase 2 xong, CSKH bật theo từng album cho khách quen hoặc khách đã mua thêm nhiều ảnh — dùng như một ưu đãi, không phải mặc định.

**Cấu hình**: `settings` key `gallery.allow_download_default = false`.

## 5. Tên miền — `babybeanstudio.vn`

Chọn **subdomain của tên miền chính**, không phải tên miền riêng.

- Khách dán link vào Zalo thấy `babybeanstudio.vn` → biết ngay là studio, không nghi lừa đảo. Một tên miền lạ như `chonanh-bb.com` trông y hệt link phishing.
- `chon-anh` đọc là hiểu, không cần giải thích trong tin nhắn.
- Link đầy đủ: `babybeanstudio.vn/g/aB3xK9pQ7mN2vC5tR8wZ1y` — 46 ký tự, gọn cho Zalo.

**Điều kiện**: studio phải sở hữu `babybeanstudio.vn` và thêm được bản ghi CNAME trỏ về Vercel.

**Nếu chưa có `babybeanstudio.vn`**: mua trước khi làm BB-005. Đừng dùng domain `.vercel.app` cho khách thật — trông thiếu chuyên nghiệp và khách sẽ ngại bấm.

**Sửa ở đâu**: biến `NEXT_PUBLIC_APP_URL`, và mục tên miền trong `docs/11-deployment.md §8`.

## 6. Lark — 4 webhook, không dùng chung một nhóm

| Webhook | Nhóm Lark | Nhận sự kiện |
|---|---|---|
| `settings['lark.webhook_url', <Quận 1>]` | Vận hành BB Quận 1 | `gallery.sent`, `gallery.first_view`, `selection.submitted`, `gallery.due_soon` |
| `settings['lark.webhook_url', <Thủ Đức>]` | Vận hành BB Thủ Đức | như trên, chỉ album chi nhánh mình |
| `settings['lark.webhook_url', <Gò Vấp>]` | Vận hành BB Gò Vấp | như trên |
| `settings['lark.webhook_url', NULL]` | Quản lý BabyBean | `gallery.overdue`, `gallery.sync_error`, `delivery.ready`, báo cáo 20:00 hằng ngày |

**Vì sao không gộp một nhóm**: 3 chi nhánh × ~10 album/ngày × 4 sự kiện ≈ **120 tin/ngày** trong một nhóm. Nhân viên sẽ tắt thông báo nhóm trong tuần đầu, và từ đó mọi cảnh báo đều vô dụng — kể cả cảnh báo quá hạn.

Tách ra thì nhóm chi nhánh chỉ còn ~40 tin/ngày và **tin nào cũng liên quan tới mình**, nên người ta còn đọc.

**Vì sao có nhóm quản lý riêng**: chủ studio và 3 quản lý chi nhánh cần thấy album quá hạn và lỗi kỹ thuật, nhưng không cần thấy từng lượt khách mở link.

Schema đã hỗ trợ sẵn: `settings` khoá theo `(key, branch_id)`, `branch_id = NULL` nghĩa là toàn hệ thống (`db/schema.sql §13`).

## 7. Ảnh preview — 2048px, JPEG q75, sRGB, xoá GPS

### Preset xuất từ Lightroom

| Thông số | Giá trị | Vì sao |
|---|---|---|
| Cạnh dài | **2048px** | Kích thước hiển thị lớn nhất của app là w1600 (lightbox). 2048 dư một chút cho màn retina khi khách pinch-zoom soi mắt bé — đó chính là thao tác họ luôn làm. |
| Định dạng | JPEG | Drive tạo thumbnail nhanh nhất với JPEG |
| Chất lượng | **75** | ~400–700KB/ảnh. Album 800 ảnh ≈ 450MB trên Drive |
| Không gian màu | **sRGB** | Adobe RGB hiển thị lệch màu trên trình duyệt điện thoại — da bé sẽ bị ám |
| Sharpening | Screen, Standard | |
| Metadata | **Xoá GPS**, giữ ngày chụp | Xem bên dưới |
| Watermark | Logo mờ góc dưới phải, opacity 15% | |

**Vì sao không xuất 4000px full-res**: ảnh 4000px in được khổ A4 — tức là bạn đưa luôn sản phẩm cho khách trước khi họ trả tiền. Ngoài ra Drive tạo thumbnail chậm hơn hẳn và album 800 ảnh sẽ ngốn ~2GB.

**Vì sao không xuất 1200px**: khi khách pinch-zoom để kiểm tra bé có mở mắt không, ảnh 1200px vỡ rõ. Họ sẽ kết luận "ảnh mờ quá" và nghi ngờ chất lượng chụp — dù ảnh gốc hoàn hảo.

### Metadata — xoá GPS, giữ ngày chụp

- **Giữ `DateTimeOriginal`**: hệ thống đọc trường này để đổ vào `photos.taken_at`, phục vụ sắp xếp theo thời gian chụp.
- **Xoá GPS**: ảnh có toạ độ studio (hoặc nhà khách, nếu chụp tại gia) nằm trong một file mà bất kỳ ai có link đều tải được. Đây là rò rỉ vị trí liên quan tới một đứa trẻ. Trong Lightroom: Export → Metadata → **Remove Location Info**.

### Đặt tên file

`BB_<mã buổi chụp>_0001.jpg` — số thứ tự **4 chữ số có số 0 đứng đầu**.

Vì sao zero-padded: danh sách xuất ra cho retoucher được dán thẳng vào bộ lọc Lightroom. Tên có số 0 đứng đầu thì sắp xếp đúng ở mọi công cụ, kể cả những chỗ không có natural sort như hệ thống của chúng ta. Không dùng dấu tiếng Việt và khoảng trắng trong tên file.

### Thư mục con = concept

Nếu buổi chụp có nhiều concept, tạo thư mục con trong thư mục album:
```
2026-09-01 Bé Bơ 3 tháng/
├── Concept 1 - Áo dài/
└── Concept 2 - Bóng bay/
```
Hệ thống đọc tối đa **2 cấp** và hiển thị thành tab cho khách (`photos.subfolder`). Sâu hơn 2 cấp sẽ bị bỏ qua.

---

## Ba quy tắc vận hành phải dặn thợ ảnh và CSKH

1. **Không xoá thư mục Drive của album chưa giao xong.** Ảnh không nằm trong hệ thống, chúng nằm trên Drive của studio (`docs/adr/ADR-0002`). Xoá thư mục là ảnh biến mất khỏi album của khách.
2. **Không gửi link Google Drive cho khách.** Chỉ gửi link `babybeanstudio.vn/g/...`. Link Drive gốc không có PIN, không thu hồi được, không đếm được ai đã xem.
3. **Đồng bộ lại trước khi xuất danh sách cho retoucher.** Nếu ai đó đổi tên file trên Drive sau khi album được tạo, danh sách xuất ra sẽ mang tên cũ cho tới khi đồng bộ lại.

---

## 8. Cấp tài khoản nhân viên — chốt ngày 10/09/2026

**Chủ studio tự tạo tài khoản và mật khẩu, rồi gán vai trò.** Không có màn hình
đăng ký công khai, và không dùng cơ chế mời qua email.

Lý do không có nút "Đăng ký": hệ thống này chứa ảnh trẻ em. Một trang đăng ký mở
nghĩa là bất kỳ ai trên internet cũng tự tạo được tài khoản, vì trang đó không có
cách nào biết ai là nhân viên BabyBean.

### Đăng nhập bằng tên tài khoản, không bắt buộc email

Nhiều nhân viên studio không dùng email thường xuyên. Nhưng Supabase Auth bắt
buộc phải có email cho mỗi tài khoản.

Cách giải: chủ studio nhập **tên tài khoản** (ví dụ `linh.q1`), hệ thống tự sinh
email nội bộ `linh.q1@staff.babybeanstudio.vn` để lưu trong Supabase. Nhân viên
gõ `linh.q1` ở màn đăng nhập, không cần biết cái email kia tồn tại. Ai có email
thật thì nhập email thật, màn đăng nhập nhận cả hai dạng.

Email nội bộ này **không nhận được thư** — nó chỉ là định danh. Vì vậy chức năng
"quên mật khẩu" gửi email sẽ không dùng được cho những tài khoản đó; chủ studio
đặt lại mật khẩu hộ.

### Nghỉ việc: tắt, không xoá

Đặt `staff_profiles.is_active = false`. Tài khoản không đăng nhập được nữa, nhưng
nhật ký hoạt động vẫn giữ tên người đó — cần cho việc đối soát về sau: ai tạo
album này, ai đổi gói, ai mở lại album đã chốt.

Xoá hẳn sẽ làm mọi album cũ mất dấu vết người thực hiện.

### Tắt thủ công là chính, tự động chỉ để nhắc

Chủ studio bấm tắt. Ngoài ra màn quản lý nhân sự hiện một danh sách **tài khoản
quá 60 ngày không đăng nhập** để chủ studio tự quyết định — không tự động khoá,
vì khoá nhầm giữa ca chụp thì nhân viên không vào được máy.

### Ai được làm việc này

Theo `docs/05-rbac.md` §2: chỉ `owner` và `admin` có quyền CRUD nhân sự và gán
vai trò. `branch_manager` chỉ được xem.
