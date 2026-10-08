# 29 — Luồng trạng thái bộ ảnh: quản trị ↔ màn khách (BB-402)

Anh báo 08/10/2026 (bộ HD_20260924#5261): quản trị ghi đã duyệt / đang đi in, còn thẻ tiến trình
của khách không cập nhật; đã chốt, đã in xong mà nút chính vẫn "Yêu cầu sửa" thay vì "Chọn thêm ảnh".

## 0. Nguồn chung (sau BB-402)

| Câu hỏi | Hàm (một chỗ) | Ai dùng |
|---|---|---|
| Giai đoạn của bộ (app + Lark còn hiệu lực + sàn của app) | `nhanHienThi` → `giaiDoanSauSan` (`src/lib/lark/trang-thai-hau-ky.ts`) | huy hiệu quản trị, `giaiDoanTienDo` gửi khách |
| Huy hiệu quản trị + điều khách thấy, từ CÙNG một dòng | `tienDoHaiMan` (`src/lib/lark/trang-thai-app-lark.ts`) | `/api/admin/galleries/[id]/items` (huy hiệu + "Khách đang thấy"), `/api/g/gallery` |
| Câu trạng thái khách / bìa | `trangThaiKhach`, `cauBiaKhach` | bìa, thẻ tiến trình, màn cảm ơn, dải khoá |
| Bước + tranh thẻ hành trình | `buocHanhTrinh`/`tranhHanhTrinh` ĐỌC `trangThaiKhach().ma` (`hanh-trinh.ts`) | thẻ tiến trình khách |
| Nút chính của ba mẹ | `loaiNutChinh` (`src/lib/gallery/nut-chinh-khach.ts`) | thanh đáy `gallery-app.tsx` |
| Thanh đáy ở bước duyệt | `thanhDayBuocDuyet` (`vong-duyet.ts`) | thanh đáy |

**Sàn của app** (`GIAI_DOAN_TOI_THIEU_THEO_APP`): Lark chậm hơn app thì không lùi nhãn.
`in_retouch` ≥ 2 ("Đã chọn hình", xếp hàng) · `approved` ≥ 7 ("Đã chốt chưa in").
Trước BB-402 mọi bộ "theo Lark" thiếu Lark đều bị ép về 2 — đó là lỗi của bộ anh báo.

## 1. Bộ ảnh (`galleries.status`)

Thanh 5 bước của khách: **Chờ xác nhận · Chờ chỉnh · Đang chỉnh · Duyệt ảnh · In/nhận ảnh**.

| status | Quản trị (huy hiệu, Lark NULL) | Khách: câu · bước | Nút chính ba mẹ | Sự kiện sang trạng thái kế |
|---|---|---|---|---|
| `draft` / `syncing` / `sync_error` | Nháp / Đang tải ảnh / Tải ảnh lỗi | (khách chưa vào) | — | đồng bộ Drive xong → `ready` |
| `ready` | Sẵn sàng gửi khách | Mời ba mẹ chọn ảnh · (chưa có thẻ) | Chốt danh sách | khách mở/chọn → `in_review` |
| `in_review` | Khách đang chọn ảnh | Mời ba mẹ chọn ảnh | Chốt danh sách | khách bấm Chốt → `submitted` (`selection.submit`) |
| `submitted` | Khách đã chốt, chờ xác nhận | Bean đang xác nhận danh sách · Chờ xác nhận | Sửa danh sách | CSKH xác nhận / Gửi khách duyệt → `in_retouch` (`gallery.confirm_retouch`) |
| `in_retouch` | Đã chọn ảnh · chờ chỉnh sửa (Lark "Đang làm" → Đang chỉnh sửa) | đang chờ chỉnh · Chờ chỉnh (GĐ3+: Đang chỉnh) | **Chọn thêm ảnh** + lối phụ nhỏ "Nhắn Bean" (kênh chat chi nhánh) để xin đổi danh sách đã chốt (vòng 2) | CSKH "Gửi khách duyệt" (có ảnh chỉnh) → `awaiting_approval` |
| `awaiting_approval` | Chờ khách duyệt ảnh đã chỉnh | Ảnh đã chỉnh xong, mời ba mẹ duyệt · Duyệt ảnh | **Duyệt** (thanh duyệt: "Xem & duyệt N ảnh chỉnh") | ba mẹ duyệt → `approved` (`gallery.review_approved`); xin sửa → `in_retouch` |
| `approved` | **Đã chốt, chờ in** (Lark 8: Đã gửi in · 9: Ảnh đã về) | **Ảnh đã chốt, Bean đang chuẩn bị in · In/nhận ảnh** | **Chọn thêm ảnh** | CSKH "Đã giao ảnh" → `delivered` (`gallery.delivered`) |
| `delivered` | Đã giao | Ảnh của bé đã hoàn thiện (bìa "Đã hoàn thiện"; thẻ 5 bước ẩn) | **Chọn thêm ảnh** ở thanh đáy (vòng 2: anh chốt hiện thanh đáy như mọi giai đoạn; thẻ đợt vẫn ở SAU lưới, không ở màn đầu) | — |
| `expired` | Link đã hết hạn | Link đã hết hạn | Yêu cầu sửa lại (xin mở lại) — giai đoạn DUY NHẤT còn nút này | CSKH mở lại → `in_review` |
| `archived` | Đã lưu trữ | (ẩn với gia đình) | — | — |

Lark ĐI TRƯỚC app (vd app còn `in_retouch` mà Lark "Đã gửi in"/"Đã giao") → hai màn theo Lark
(BB-285), nút chính "Chọn thêm ảnh" từ GĐ7 trở đi. Lark CHẬM hơn app → sàn của app.

### Chỗ lệch tìm thấy (trước BB-402)

| # | Chỗ | Quản trị | Khách | Đã sửa |
|---|---|---|---|---|
| L1 | `approved`, Lark NULL | khối "Khách đã duyệt, ảnh đang đi in" + huy hiệu bị ép GĐ2 "Đã chọn ảnh · chờ chỉnh sửa" | GĐ2 → "Bean đã nhận danh sách, ảnh đang chờ chỉnh" · bước **Chờ chỉnh** | sàn `approved ≥ 7` → hai màn "Đã chốt, chờ in" / bước In/nhận ảnh |
| L2 | `approved` (mọi Lark) | — | `buocHanhTrinh` tự suy: `approved` → bước **Duyệt ảnh**, tranh duyệt; GĐ7 cũng "Duyệt ảnh" — lệch với `trangThaiKhach` (bước 4) | bước + tranh đọc `trangThaiKhach().ma` |
| L3 | `approved` / `delivered` | — | nút chính thanh đáy "Yêu cầu sửa lại" (nhánh "đã khoá" không xét giai đoạn) | `loaiNutChinh` → "Chọn thêm ảnh" |
| L4 | `approved`, Lark chậm ("Đã gửi duyệt"/"Sửa") | "Đã gửi khách duyệt" | "mời ba mẹ duyệt" | sàn của app |
| L5 | màn chi tiết quản trị đọc mã Lark THÔ, màn khách đọc mã Lark CÒN HIỆU LỰC (BB-327 mở lại) | | | cả hai qua `tienDoHaiMan` |
| L6 | chuông theo Lark sau khi đã duyệt | | Lark đổi trễ 2→3 vẫn báo "Bean đang chỉnh ảnh" | `mocCanBaoKhach` bỏ qua `approved` |

## 2. Giao ảnh (`deliveries.status`: pending · in_progress · ready · delivered)

| Lúc | Ghi | Ghi chú |
|---|---|---|
| CSKH "Gửi khách duyệt" (`anh-chinh-sua/gui-khach`, `retouch-done`) | `ready`, `anh_chinh_gui_luc`, `updated_at` | `updated_at` là mốc gửi DỰ PHÒNG khi chưa áp 0091 (`docMocGui`) |
| Ba mẹ duyệt (`/api/g/review`) | KHÔNG đổi | giữ `ready` = "ảnh chỉnh đã sẵn sàng/gửi khách". **Cố ý không chạm**: đổi `updated_at` sẽ dời mốc gửi dự phòng |
| CSKH "Đã giao ảnh" (`/delivered`, chỉ từ `approved`) | `delivered`, `delivered_at` | bộ → `delivered` |

Không màn nào đọc `deliveries.status` để hiện trạng thái — nguồn giai đoạn là `galleries.status` (+ Lark).
`physical_items []` của bộ anh báo: chưa có màn nào ghi cột này (không thuộc BB-402).

## 3. Đợt mua thêm (`selection_rounds.trang_thai`, đợt ≥ 2)

| trạng thái | Quản trị | Khách (thẻ "Chọn thêm ảnh") | Sự kiện |
|---|---|---|---|
| (nháp trên máy) | — | "Tiếp tục đợt N" | ba mẹ bấm Chốt đợt → `cho_xac_nhan` (`selection.round_submit`) |
| `cho_xac_nhan` | đợt chờ xác nhận | Bean đang xác nhận đợt này | CSKH xác nhận → `da_xac_nhan` (`selection.round_confirm`); từ chối → `tu_choi` |
| `da_xac_nhan` | đã xác nhận | đã xác nhận | ảnh của đợt vào hàng chỉnh (vòng duyệt riêng, mục 4) |
| `tu_choi` / `da_mo_lai` | | chưa nhận (kèm lý do) / đã mở lại | ba mẹ chốt lại thành đợt MỚI |

Chế độ "Chọn thêm ảnh" (`dangCheDoChonThem`): `in_retouch`, `awaiting_approval`, `approved`, `delivered`
(hoặc Lark ≥ "Đã chọn hình"). Nút chính "Chọn thêm ảnh" chỉ từ bước "đã duyệt" trở đi (BB-402);
trước đó lối vào vẫn là thẻ "Chọn thêm ảnh".

## 4. Vòng duyệt ảnh chỉnh

| Vòng | Trạng thái (`trangThaiDuyetDot` / `trangThaiDuyetTrongGoi`) | Nút chính ba mẹ |
|---|---|---|
| Trong gói | `awaiting_approval` = cho_duyet · `approved`/`delivered` = da_duyet · `in_retouch` + vòng sửa mở = dang_sua | cho_duyet → thanh duyệt |
| Đợt mua thêm (0095, `anh_chinh_dot`) | đã gửi + chưa duyệt + không vòng sửa mở = **cho_duyet** | **BB-402**: có ≥ 1 đợt cho_duyet → thanh duyệt "Ảnh chỉnh mua thêm chờ ba mẹ duyệt" (kể cả bộ đã duyệt / đã giao); `/api/g/gallery` trả `review.soDotMuaThemChoDuyet` |

## 5. Mốc `sent_at` / `first_viewed_at`

Trước BB-402: `sent_at` chỉ ghi ở `POST /api/admin/galleries/[id]/share-link` (CSKH tạo link theo bộ);
`first_viewed_at` không có đường ghi. Bộ mới của khách đã có **link gia đình** (`/k/<mã>`) không qua
route đó ⇒ cả hai NULL dù khách đã chọn và chốt (bộ anh báo).

BB-402: lúc lượt chọn được TẠO (người cầm link mở bộ lần đầu — `layHoacTaoLuotChon` cho link gia đình,
`dangNhapBangMa` cho link theo bộ) → `ghiMocKhachMoBoAnh` đặt `first_viewed_at` và `sent_at` **chỉ khi
đang NULL**; không đặt `due_at`. Bộ cũ: `scripts/bb402-bu-moc-mo-bo-anh.mjs` (Claude chạy; xem trước rồi `--ghi`).

## 6. Vòng 2 (anh chốt 08/10)

- Nút chính "Chọn thêm ảnh" từ lúc **studio xác nhận** danh sách (`studioDaXacNhan`: mọi mã sau
  `cho_studio_xac_nhan`), không chỉ từ lúc duyệt. "Yêu cầu sửa lại" không còn là nút chính ở bất kỳ
  giai đoạn đã xác nhận nào; chỉ còn cho bộ khoá mà chưa tới bước xác nhận (hết hạn / quá hạn 60 ngày).
- Lối phụ "Nhắn Bean" (`coLoiNhanBean`, liên kết `branch.chatUrl`) cạnh nút chính khi bộ CHƯA duyệt xong
  (xếp hàng / đang chỉnh). Không có link chat thì không hiện.
- Máy chủ: mở đợt mua thêm từ `in_retouch` ĐÃ có sẵn (`dangCheDoChonThem` — `/api/g/dot-chon` và
  `/api/g/dot-chon/chot`), nhất quán với `approved`/`delivered`; không phải sửa.
- Một nút chính trên màn: khi thanh đáy là "Chọn thêm ảnh", nút của thẻ đợt hạ xuống kiểu PHỤ
  (viền, `nutPhu`, `data-kieu-nut="phu"`). Thẻ GIỮ đủ lối vào, câu giá "… · không cần xin mở lại" và
  "Tiếp tục đợt N". (Vòng 3: bản vòng 2 ẩn hẳn hàng lối vào — `anLoiVao` — làm thẻ biến mất khi chưa có
  đợt nào; e2e bb-321 ca 1 và bb-400 ca 1 đỏ vì không còn lối vào đợt 2 trên thẻ. Đã bỏ.)
- Gửi duyệt / xin sửa xong, màn khách nạp lại nền (`loadGallery({ silent: true })`) — không nháy màn chờ,
  không cuộn về đầu.
