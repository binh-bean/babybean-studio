# 29 — Link gia đình (BB-334): hợp đồng API

> Đội A (dữ liệu + an ninh) viết; đội B (màn khách) và đội C (màn nhân viên)
> dựng theo tệp này. Kế hoạch gốc: `babybean-assets/BB-334/ke-hoach.md`
> (mục "Anh đã chốt (30/09)"). Migration: `db/migrations/0090-link-gia-dinh.sql`
> (**viết, chưa áp** — mọi đường dưới đây chạy được cả khi 0090 chưa áp).

## 0. Tóm tắt một phút

| Khái niệm | Là gì |
|---|---|
| **Link gia đình** | Một dòng `share_links` có `customer_id` (không `gallery_id`), `role = 'owner'`, `expires_at = null`. Mỗi khách **tối đa một** link gia đình còn sống (chỉ mục duy nhất một phần ở 0090). Bản mã hoá ở `share_link_ma` (BB-201). |
| **Link cũ theo bộ** | `share_links.gallery_id` như trước. **Chạy mãi, không đổi hành vi, không thêm quyền** (anh chốt Q2). |
| **Khoá khách** | `customers.id` — gộp theo Mã KH (`lark_customer_key`). Số điện thoại chỉ để gợi ý gộp, nhân viên bấm xác nhận (không có đường gộp tự động nào ở đây). |
| **Số thứ tự bộ trong nhà** | `soThuTu` (1, 2, 3…) — thứ tự tạo bộ ảnh trong khách đó. Sau 0090 lưu ở `galleries.so_thu_tu_khach`; trước 0090 máy chủ tính theo `created_at, id` — **cùng một con số** (0090 điền ngược đúng cách tính này). Dùng cho `/k/<mã>/<n>`. |
| **Đường dẫn khách** | `/k/<mã>` trang gia đình · `/k/<mã>/<n>` bộ thứ n · `/g/<mã>` giữ nguyên. |

## 1. Luật phiên (quan trọng nhất — đội B đọc kỹ)

Cookie `bb_gs` vẫn là cookie ký HMAC cũ (`GallerySession`). Thay đổi: **cookie
chỉ chứng minh "đây là link X của khách Y"; bộ ảnh của MỖI lượt gọi do lượt gọi
nêu ra.**

### 1.1 Mọi lượt gọi `/api/g/*` từ trang `/k/<mã>/<n>` PHẢI gửi tiêu đề

```
x-bb-bo: <galleryId>        // uuid của bộ thứ n, lấy từ GET /api/k/<mã>
```

Chỗ không đặt được tiêu đề (thẻ `<img>`, `EventSource`) dùng `?bo=<galleryId>`.
`/api/img/<photoId>` **không cần** — route ảnh tự kiểm: link gia đình xem ảnh mọi bộ
của **nhà mình** (dù cookie đang trỏ bộ nào); link cũ theo bộ vẫn chỉ đúng bộ của nó.

### 1.2 Máy chủ kiểm gì (`src/lib/auth/phien-bo-anh.ts`)

| Link của phiên | Có `x-bb-bo` | Không có `x-bb-bo` |
|---|---|---|
| Theo bộ (cũ, `/g/<mã>`) | Phải **bằng đúng** bộ của link, khác → `403 FORBIDDEN` | bộ của cookie (y như cũ) |
| Gia đình | Bộ phải **thuộc đúng khách** của link, có ảnh, không `draft`/`archived`; sai → `403 FORBIDDEN`. Lượt chọn tra theo cặp (link, bộ) — không đọc từ cookie | bộ của cookie (luồng BB-130 cũ qua `/g/` + `buoi-chup`). Phiên mở bằng `/api/k/<mã>` có bộ **rỗng** → `403 FORBIDDEN` (máy chủ **không đoán** bộ); riêng `GET /api/g/gallery` trả `404` kèm `canChonBuoiChup: true` như BB-130 |
| Đã thu hồi / hết hạn | `410 LINK_EXPIRED` (trước cả bước kiểm bộ) | như trái |

Route **không cần** bộ ảnh (làm việc theo khách): `moi-nguoi-than` (mời theo nhà),
`tuc-thi` (thiếu bộ → `kenh: []`). Mọi route còn lại cần bộ.

**Một cookie cho cả trình duyệt** — nếu cùng máy còn mở một link KHÁC (vd. link cũ
`/g/<mã khác>`), cookie có thể bị tab kia ghi đè. Khi `/api/g/*` trả `401`, `403`
hoặc `410` trên trang `/k/…`: gọi lại `GET /api/k/<mã>` **một lần** (đặt lại cookie
đúng link), rồi thử lại lượt gọi. Vẫn lỗi thì hiện lỗi.

Hệ quả:
- **Hai tab hai bộ không lẫn nhau**: tab bộ 1 gửi `x-bb-bo: <bộ 1>` thì chốt vào bộ 1 dù cookie đang trỏ bộ 2.
- **Link cũ không thêm quyền**: link theo bộ A gửi `x-bb-bo: <bộ B cùng nhà>` → 403.
- **Không cần "ký lại cookie khi đổi bộ"** trên đường `/k/`. `POST /api/g/buoi-chup` vẫn giữ cho luồng cũ.

### 1.3 Lượt chọn của link gia đình

- Vai `owner`: bộ ảnh **đã có lượt chọn chính** (thường là của link cũ theo bộ) → link gia đình **dùng chung** lượt chọn đó. Mở bằng link cũ hay link gia đình đều thấy cùng một danh sách; màn quản trị (đọc lượt chính) thấy đúng.
- Chưa có lượt chính → tạo lượt chính cho link gia đình.
- Vai khác (viewer…) → lượt riêng theo cặp (link, bộ), như BB-130.

### 1.4 Tim gia đình (BB-345) và cập nhật tức thì (BB-342)

- **Tim** khoá theo `(share_link_id, gallery_id, photo_id)`. Link gia đình viewer (BB-338 mời cả nhà) thả tim ở bộ nào thì dòng tim mang `gallery_id` của bộ đó (lấy từ `x-bb-bo` đã kiểm). Ba mẹ đọc tim gom theo `gallery_id`. **Không đổi bảng, không đổi khoá.**
- **Kênh tức thì** vẫn là HMAC theo `galleryId`. `GET /api/g/tuc-thi` với `x-bb-bo` → kênh của đúng bộ đó. Trang gia đình (không có bộ) → `kenhTucThi` trong `GET /api/k/<mã>` = kênh của **mọi bộ đang hiện** của nhà đó (để thẻ trạng thái tự cập nhật). Không có kênh "theo khách" mới — vì sao: payload kênh chỉ là `{loai, galleryId}`, khách nghe kênh bộ nào cũng chỉ là bộ của chính nhà mình; thêm một loại kênh mới là thêm một chỗ phải chứng minh lại tính bí mật của tên kênh.

## 2. API phía khách

Mọi phản hồi theo `docs/04-api-spec.md §2`: `{ data }` hoặc `{ error: { code, message } }`.

### 2.1 `GET /api/k/<mã>` — trang gia đình

Đổi mã lấy phiên (dùng chung lõi `dangNhapBangMa`: giới hạn lượt theo IP, nhật
ký, đếm lượt mở) **chỉ khi** cookie chưa có phiên của đúng link này. Cookie đặt
trên chính phản hồi. Tải lại trang không đốt lượt giới hạn.

**200**
```jsonc
{
  "data": {
    "loaiLink": "gia_dinh",          // hoặc "theo_bo" (link cũ mở qua /k/ — chỉ 1 bộ của nó)
    "vai": "owner",                  // owner | viewer | co_editor | suggester
    "tenNha": "Nhà bé Mít",          // "Bé Mít & Na" khi 2 bé; "Baby Bean" khi chưa có tên
    "tenNgan": "Nhà bé Mít",         // ≤ 12 ký tự, dưới icon màn hình chính
    "manifest": "/api/k/<mã>/manifest.webmanifest",
    "kenhTucThi": ["<hmac>", "..."], // kênh BB-342 của mọi bộ đang hiện
    "boAnh": [                       // mới nhất trước (ngày chụp, rồi thứ tự)
      {
        "id": "uuid",                // gửi lại trong x-bb-bo
        "soThuTu": 2,                // n trong /k/<mã>/<n>
        "tieuDe": "Thôi nôi",
        "tenBe": "Bé Mít",           // tinhTenBiaTuDuLieu; null nếu chưa gắn bé
        "ngayChup": "2026-09-20",    // null nếu chưa gắn buổi chụp
        "soAnh": 210,
        "anhBiaId": "uuid",          // ảnh: /api/img/<anhBiaId>?w=800 ; null → minh hoạ mặc định
        "trangThai": {               // ĐÚNG trangThaiKhach() (BB-353) — không tự viết nhãn
          "ma": "cho_khach_chon",
          "khach": "Mời ba mẹ chọn ảnh ạ",
          "bia": "Mời ba mẹ chọn ảnh cho Bé Mít ạ.",
          "buocKhach": 0,
          "giaiDoan": null
        },
        "buocTiepTheo": { "ma": "chon_anh", "nhan": "Chọn ảnh" },
        "khoaChon": false
      }
    ]
  }
}
```

`buocTiepTheo.ma`: `chon_anh` (bước khách 0, chưa khoá) · `duyet_anh` (`awaiting_approval`) · `xem_anh` (mọi trạng thái khác) · `nhan_bean` (đang tạm khoá / quá 60 ngày).

Không trả: tiền hợp đồng, số điện thoại, tên ba mẹ, mã Lark, `drive_folder_id`.

**Lỗi**: `404 NOT_FOUND` (sai mã / đã thu hồi — không phân biệt), `410 LINK_EXPIRED`
(hết hạn, kèm lời nhắn), `429 RATE_LIMITED`.

### 2.2 `GET /api/k/<mã>/manifest.webmanifest`

Quyền đến từ mã trong đường dẫn (như BB-213). `name`/`short_name` = `tenNha`/`tenNgan`,
`start_url` = `/k/<mã>`, `scope` = `/k/<mã>/`. Icon = bìa của **bộ mới nhất có bìa**,
cắt vuông qua `GET /api/k/<mã>/bia-vuong?w=180|192|512`; chưa bộ nào có bìa → logo
Baby Bean. Sai/thu hồi/hết hạn → `404` trần. Link cũ theo bộ cũng nhận được (tên/icon
của đúng bộ đó, `start_url` `/k/<mã>`).

Đội B: trang `/k/<mã>` đặt `<link rel="manifest" href="/api/k/<mã>/manifest.webmanifest">`
và `<link rel="apple-touch-icon" href="/api/k/<mã>/bia-vuong?w=180">`.

### 2.3 Các route `/api/g/*` — không đổi hình dạng

Đội B gọi y như màn `/g/` hiện nay, **thêm `x-bb-bo`**. Lỗi mới duy nhất:
`403 FORBIDDEN` khi `x-bb-bo` không thuộc phiên. Danh sách route đã nhận `x-bb-bo`:
`gallery`, `photos`, `selection`, `submit`, `placements`, `album-cover`, `addons`,
`review`, `mua-them`, `dot-chon`, `dot-chon/chot`, `mo-lai-anh`, `xin-sua-lai`,
`moi-nguoi-than`, `thong-bao`, `thong-bao-khach`, `tim-gia-dinh`,
`tim-gia-dinh/dat-chinh-sua`, `tuc-thi`. (`buoi-chup` giữ nguyên: nó liệt kê
theo khách.)

### 2.4 Mời người thân trên link gia đình (Q6 ★ — cả nhà)

`POST /api/g/moi-nguoi-than` từ phiên **link gia đình** tạo link `viewer` gắn
**theo khách** (`customer_id`, không `gallery_id`): ông bà thấy mọi bộ, kể cả bộ
sau này, chỉ xem + thả tim + mua. Giới hạn 5 link mời sống / 10 lượt tạo mỗi 24 giờ
tính **theo khách**. `GET`/`DELETE` liệt kê/thu hồi theo khách. Phiên link cũ theo
bộ: giữ nguyên hành vi theo bộ. Địa chỉ trả về là `/k/<mã>` cho link mời theo
khách, `/g/<mã>` cho link mời theo bộ.

## 3. API phía nhân viên (đội C)

Quyền: `galleries:share` + đúng chi nhánh của khách. **Đổi và thu hồi** thêm điều
kiện vai `cs` (CSKH), `admin` hoặc `owner` (chủ studio, hiện "Admin") — anh chốt Q8,
và thân yêu cầu phải có `"xacNhan": true` (màn C hiện hộp "link cũ sẽ ngừng mở ngay").

### 3.1 `GET /api/admin/customers/<id>/link-gia-dinh`

```jsonc
{ "data": {
  "linkGiaDinh": null | {
    "shareLinkId": "uuid", "duongDan": "/k/<mã>" | null,   // null: không giải mã được (thiếu bản mã hoá)
    "diaChi": "https://…/k/<mã>" | null,
    "tokenPrefix": "AbC123", "taoLuc": "…", "soLanMo": 3, "moLanCuoi": "…" | null
  },
  "linkCuConSong": [ { "shareLinkId": "uuid", "galleryId": "uuid", "tieuDeBo": "…", "vai": "owner", "tokenPrefix": "…", "taoLuc": "…", "soLanMo": 0 } ],
  "loiMoiGiaDinh": [ { "shareLinkId": "uuid", "nhan": "Bà nội", "taoLuc": "…" } ],
  "soBoAnh": 3,
  "duocDoi": true                        // vai hiện tại có được đổi/thu hồi không (để màn C ẩn/hiện nút)
} }
```

### 3.2 `POST /api/admin/customers/<id>/link-gia-dinh`

Thân: `{ "doiLink"?: boolean, "xacNhan"?: boolean, "ghiLark"?: boolean }` (`ghiLark` mặc định `true`).

- Chưa có link gia đình → tạo. `doiLink` bỏ qua.
- Đã có, `doiLink` không phải `true` → `409 CONFLICT` kèm `{ shareLinkId }`.
- `doiLink: true` → cần vai CSKH/Admin + `xacNhan: true`; thu hồi link cũ **ngay**, tạo link mới, lượt chọn của link cũ **chuyển theo** link mới (luật BB-148).
- Sau khi lưu: ghi **cùng một địa chỉ** `/k/<mã>` vào cột "Link app" của **mọi dòng Hậu Kỳ** của khách (mọi bộ có `lark_hauky_record_id`) qua `ghiLinkAppVeLark`. Lark hỏng không chặn: link vẫn trả về.

```jsonc
{ "data": {
  "shareLinkId": "uuid", "duongDan": "/k/<mã>", "tokenPrefix": "AbC123",
  "luuDiaChiDuoc": true,                 // false: share_link_ma ghi hỏng → màn C bắt CSKH chép ngay
  "daThuHoi": "uuid" | null,             // link gia đình cũ vừa thu hồi (khi doiLink)
  "lark": { "tong": 3, "ghiDuoc": 2, "dong": [ { "galleryId": "uuid", "recordId": "rec…", "ghiDuoc": true, "lyDo": null } ] }
} }
```
Lỗi: `400 INVALID_INPUT` (khách chưa có bộ nào hiện cho gia đình; thiếu `xacNhan`), `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`.

### 3.3 `DELETE /api/admin/customers/<id>/link-gia-dinh`

Thân `{ "xacNhan": true }`. Vai CSKH/Admin. Thu hồi link gia đình đang sống
(link mời theo khách **không** bị thu hồi kèm — thu hồi riêng). Không ghi Lark
(ô Lark giữ link đã chết cho tới khi tạo link mới — CSKH thấy ngay vì app báo).
`200 { data: { daThuHoi: "uuid" } }` · `404` khi không có link sống.

### 3.4 `POST /api/admin/customers/<id>/link-gia-dinh/ghi-lark`

Ghi lại link gia đình đang sống lên mọi dòng Hậu Kỳ (vd. có bộ mới về từ Lark).
Trả `lark` như 3.2. `404` khi chưa có link hoặc không giải mã được mã.

## 4. Bảo đảm an ninh (phép thử: `tests/security/bb-334a-*.test.ts`)

| Phép thử phủ định | Canh |
|---|---|
| Link gia đình khách A nêu bộ của khách B (đọc `gallery`, `photos`; ghi `selection`, `submit`) → 403, không ghi gì | `boAnhCuaKhach` lọc `customer_id` |
| Hai tab: cookie trỏ bộ 2, tab bộ 1 chốt với `x-bb-bo: bộ 1` → bộ 1 chốt, bộ 2 nguyên | header thắng cookie |
| Link cũ theo bộ A1 nêu bộ A2 cùng nhà → 403 | link cũ không thêm quyền |
| Link gia đình đã thu hồi → `LINK_EXPIRED`, `GET /api/k/<mã>` → 404, manifest → 404 | `assertShareLinkUsable` |
| Phiên `/k/` không nêu `x-bb-bo` → 403 khi chọn/chốt, không ghi gì | `requirePhienBoAnh` không đoán bộ |
| Đổi/thu hồi link gia đình bởi vai khác CSKH/Admin → 403; thiếu `xacNhan` → 400 | `tests/unit/bb-334a-link-gia-dinh-nhan-vien.test.ts` |

Ghi Lark trong phép thử: `ghiLinkAppVeLark` là bản giả + chốt `khongGuiRaLarkThat()` vẫn bật.

## 4b. Migration 0090 (chưa áp)

- `uq_share_links_gia_dinh_song` — UNIQUE một phần `(customer_id) where customer_id is not null and role='owner' and status='active'`. Ngày 04/10 bb-dev có 0 dòng `share_links` theo khách → không vướng trùng.
- `galleries.so_thu_tu_khach smallint` + điền ngược `row_number() over (partition by customer_id order by created_at, id)` + UNIQUE `(customer_id, so_thu_tu_khach)`.
- Trigger `trg_galleries_so_thu_tu_khach` (hàm `gan_so_thu_tu_khach()`, không security definer, đã `revoke` theo §5b, ghim `search_path`, khoá tư vấn theo khách để hai bộ tạo cùng lúc không trùng số).
- Chưa áp: app tự tính số thứ tự theo đúng cách điền ngược; mọi đường chạy bình thường.
- Đề xuất (chưa làm vì `scripts/verify-db.mjs` là tệp PM bảo vệ): gọi `kiem0090()` (đã có ở `scripts/lib/kiem-cau-truc-day-moi.mjs`, có phép thử) trong `verify-db.mjs` — chưa áp là ĐẠT "chờ áp", áp nửa vời là ĐỎ.

## 5. Chuyển link hiện có

`scripts/tao-link-gia-dinh.mjs` — **mặc định chạy thử**. Chỉ chọn khách có **bộ mới**
(bộ đang hiện cho gia đình, tạo từ `--tu <YYYY-MM-DD>`, mặc định hôm nay) mà chưa có
link gia đình sống. `--write` mới tạo link (+ bản mã hoá). **Không** ghi Lark, **không**
gửi gì cho khách — CSKH gửi khi có dịp (màn C dùng 3.4 để ghi Lark).

## 6. Việc của đội B / C (để khỏi hỏi lại)

- B: trang `/k/[ma]` gọi 2.1; trang `/k/[ma]/[n]` lấy `id` theo `soThuTu` rồi dựng màn chọn ảnh hiện có với `x-bb-bo` trên **mọi** `fetch('/api/g/…')`. Gợi ý: một hàm `goiApiKhach(url, init)` thêm tiêu đề, thay cho `fetch` rải rác.
- C: trang khách hàng gọi 3.1–3.4; hộp xác nhận cho đổi/thu hồi; "N link cũ vẫn mở được" đọc `linkCuConSong`.
