# 28 — Đồng bộ các lượt chọn ảnh (BB-400)

Anh yêu cầu 08/10/2026: "lượt sau chỉ còn thả tim, không còn đủ chức năng như lượt
đầu. Đồng bộ lại, cả ở màn mời gia đình, và các lượt chọn của gia đình cũng cần giống
nhau. Ưu tiên người dùng như quan điểm iPhone."

Luật chốt: **mọi lượt chọn dùng CÙNG một bộ công cụ** — cùng lưới ảnh (`LuoiAnh`/thẻ
`the-anh`), cùng màn xem lớn (`PhotoLightbox`), cùng hàng chip lọc + nút So sánh
(`cong-cu-luot-chon.tsx`), cùng màn so sánh (`SoSanhAnh`), cùng bảng "Tấm này dùng
cho…" (`BangSanPhamCuaAnh`), cùng màn "Xem trên tường nhà" (`ManTreoTuong`). Lượt nào
được dùng công cụ nào do MỘT hàm thuần quyết: `congCuLuotChon()` ở
`src/lib/gallery/luot-chon.ts` (cùng luật vai với máy chủ — `EDITING_ROLES`,
`SUBMIT_ROLES`, `/api/g/addons`, `/api/g/album-khong-chinh`, `coBuocChonBiaAlbum`).

Khác nhau giữa các lượt CHỈ ở:
- luật tiền/hạn mức của đợt (đợt ≥ 2 tính tiền mọi ảnh mới — `tinhTienDot`);
- ảnh đã chốt ở đợt trước hiện huy hiệu khoá "Đợt N" (không bỏ chọn được, ghi chú chỉ đọc);
- quyền theo vai (bảng dưới — KHÔNG nới quyền nào);
- hộp chốt của đợt (`hop-xac-nhan-dot`, BB-395/398/399 giữ nguyên).

## 1. Bảng so sánh — TRƯỚC BB-400 (đọc mã main 08/10)

Ký hiệu: **có** · **thiếu** (vai được phép mà màn không có) · **khác** (có nhưng khác
chỗ/khác tên/khác cách) · **—** (vai KHÔNG được phép, đúng luật).

| Chức năng | Đợt 1 (ba mẹ) | Đợt mua thêm 2/3… (ba mẹ) | Người thân gợi ý (`suggester`) | Người cùng chọn (`co_editor`) | Gia đình được mời (`viewer`) | Màn mời mua lần hai (`viewer`) |
|---|---|---|---|---|---|---|
| Thả tim trên thẻ ảnh | có | có | có | có | có (tim gia đình, `tim_gia_dinh`) | **khác** — ô ảnh nhỏ tự vẽ, dấu ✓ thay tim |
| Huy hiệu "Đợt N" tấm đã chốt | — | có | — | — | — | — |
| Ghi chú cho thợ (xem lớn) | có | **thiếu** | có | có | — (máy chủ chặn 403) | — |
| Dấu "có ghi chú" trên thẻ | có | **thiếu** (nháp không có ghi chú) | có | có | có (chỉ đọc) | — |
| Xem lớn / vuốt / phóng to | có | có | có | có | có | **thiếu** (ô ảnh không mở lớn được) |
| Tên bé trong xem lớn | có | **thiếu** | có | có | có | — |
| So sánh / ghim (2–4 tấm) | có | **thiếu** (`soSanhBat={false}` cứng) | có | có | **khác** — màn so sánh dùng tim của ba mẹ, tim bị khoá | thiếu |
| Chip lọc Tất cả / Đã chọn / Chưa chọn | có | **khác** — tự vẽ, cỡ chữ/khoảng cách khác | có | có | khác — chỉ "Tất cả" + "Gia đình thích" | thiếu |
| Chip "Gia đình thích" | có | **thiếu** | có | có | có (tên "Gia đình thích" = tim của mình) | — |
| Dấu "Gia đình" trên thẻ | có | **thiếu** | có | có | — | — |
| Nhóm ảnh (thư mục con) | có, có số đếm | **khác** — không có số đếm | có | có | có | — |
| Đếm / tiến độ | thanh chọn `x/N` | câu đáy "N tấm mới · tiền" | thanh chọn | thanh chọn | "Gia đình đã thả tim N tấm" | đếm tấm đã chọn |
| Sản phẩm theo ảnh ("Đặt in" trong xem lớn) | có | **thiếu** — chỉ vào cửa hàng từ thanh đáy | có | có | **thiếu** — xem lớn chỉ có tim | — (đây chính là màn mua) |
| Xem trên tường nhà | có | **thiếu** | có | có | — | — |
| Cửa hàng / mua thêm | có (`/api/g/addons`) | có (giỏ của đợt) | có | có | gửi yêu cầu (`/api/g/mua-them`) | có |
| Ảnh album không chỉnh | có (nếu có suất) | — (chỉ đợt 1) | — (máy chủ chặn) | có | — | — |
| Chọn bìa album | có | — (bộ đã khoá) | — | có | — | — |
| Tải xuống (nếu bộ cho tải) | có | **thiếu** | có | có | có | — |
| Nhắn Bean / chuông | có | **thiếu** (màn thay cả trang) | có | có | có | — |
| Hộp chốt | chốt đợt 1 | chốt đợt N | — (chỉ ba mẹ) | — | — | gửi yêu cầu mua |

Kết luận: lượt mua thêm "cụt" 8 công cụ ba mẹ được phép (ghi chú, so sánh, gia đình
thích, sản phẩm theo ảnh, xem trên tường, tải, tên bé, số đếm nhóm); gia đình được mời
thiếu lối "Đặt in tấm này" trong xem lớn và màn so sánh dùng nhầm tim của ba mẹ.

## 2. Bảng so sánh — SAU BB-400

Cột "Đợt mua thêm" và "Gia đình được mời" giờ khớp cột "Đợt 1" ở mọi dòng vai được phép.
Các dòng không đổi giữ nguyên như bảng trên.

| Chức năng | Đợt 1 | Đợt mua thêm | Gợi ý | Cùng chọn | Gia đình | Mời mua lần hai |
|---|---|---|---|---|---|---|
| Thả tim | có | có | có | có | có | **khác** — vẫn tấm chọn ảnh riêng (xem mục 5) |
| Ghi chú cho thợ | có | **có** — lưu vào nháp đợt, gửi kèm lúc chốt; tấm đã chốt chỉ đọc | có | có | — | — |
| So sánh / ghim | có | **có** (cùng nút, cùng chỗ, cùng màn) | có | có | **có** — tim của chính gia đình | dùng so sánh ở lưới |
| Chip lọc | có | **có** — cùng component, cùng tên | có | có | có | — |
| Chip + dấu "Gia đình thích" | có | **có** | có | có | có | — |
| Nhóm ảnh có số đếm | có | **có** | có | có | có | — |
| Sản phẩm theo ảnh | có | **có** — "Đặt in" trong xem lớn, vào giỏ đợt | có | có | **có** — "Đặt in tấm này" mở màn mua của gia đình | — |
| Xem trên tường nhà | có | **có** — món chọn vào giỏ đợt | có | có | — | — |
| Tải xuống | có | **có** | có | có | có | — |
| Tên bé trong xem lớn | có | **có** | có | có | có | — |

Mã dùng chung (không chép):

| Mảnh | Tệp | Đợt 1 | Đợt N |
|---|---|---|---|
| Luật công cụ theo vai + chip lọc + lọc ảnh | `src/lib/gallery/luot-chon.ts` | có | có |
| Hàng chip, nhóm ảnh, nút So sánh, thanh đầu/đáy so sánh, `useSoSanhLuotChon`, `propsCongCuXemLon`, `DatInChoGiaDinh` | `src/components/features/gallery/cong-cu-luot-chon.tsx` | có | có |
| Lưới/thẻ ảnh | `luoi-anh.tsx` | có | có |
| Xem lớn | `photo-lightbox.tsx` (thêm: ghi chú chỉ đọc cho tấm khoá theo đợt) | có | có |
| So sánh | `so-sanh-anh.tsx` (thêm `khoaTimAnh`) | có | có |
| Bảng "Tấm này dùng cho…" | `bang-san-pham-cua-anh.tsx` (không đổi) | có | có — giỏ của đợt |
| Xem trên tường | `man-treo-tuong.tsx` (không đổi) | có | có — giỏ của đợt |

Ghi chú của đợt N đi đường: nháp đợt (`NhapDot.ghiChu`, máy của ba mẹ) → `POST /api/g/dot-chon/chot`
trường `ghiChu` → `selection_items.retouch_note` (cùng cột đợt 1; máy chủ chỉ ghi cho tấm MỚI của
đợt — `ghiChuChoAnhMoi`). Không cần migration.

## 3. Quyền theo vai (giữ nguyên, không nới)

| Vai | Tim | Ghi chú | Đặt in / mua | Album không chỉnh | Chọn bìa | Chốt |
|---|---|---|---|---|---|---|
| `owner` (ba mẹ) | có | có | có | có | có | **có** (đợt 1 và đợt N) |
| `co_editor` | có | có | có | có | có | không |
| `suggester` | có | có | có (đúng luật máy chủ hiện nay) | không | không | không |
| `viewer` (gia đình được mời) | tim gia đình | không | gửi yêu cầu mua | không | không | không |

### 3b. Vòng 2 (08/10) — quyền ở ĐỢT N (bộ đã sang chọn thêm)

| Vai | Vào màn đợt | Tim ở đợt N | Ghi chú / giỏ / xem trên tường | Chốt + trả tiền |
|---|---|---|---|---|
| `owner` | "Chọn thêm ảnh" | vào nháp đợt (máy ba mẹ) | có (nháp đợt) | **có** |
| `co_editor` | "Gợi ý ảnh cho đợt mới" — CÙNG màn | **gợi ý** chung (`tim_gia_dinh`) | không (là phần nháp + tiền của ba mẹ) | không |
| `suggester` | như `co_editor` | **gợi ý** chung | không | không |
| `viewer` | — (dùng màn mua của gia đình) | tim gia đình | — | gửi yêu cầu `/api/g/mua-them` |

- Máy chủ: `POST /api/g/tim-gia-dinh` cho `co_editor`/`suggester` ghi CHỈ khi bộ đã ở đợt N
  (`duocGhiTimGiaDinh` + `dangCheDoChonThem`); đợt 1 họ vẫn chọn thẳng qua `/api/g/selection`.
  Owner vẫn 403. `GET` trả thêm `cuaToi` (gợi ý của chính link) cho hai vai này.
- Ba mẹ thấy gợi ý trên lưới đợt: dấu "Gia đình" + chip "Gia đình thích" (cùng kho, cùng dấu với
  tim của gia đình được mời) → chạm tim để đưa vào đợt.
- **Không cần migration**: bảng `tim_gia_dinh` (0083) đã khoá theo `share_link_id`, RLS bật + revoke
  public/anon/authenticated. Không viết 0109.
- Nhân viên: gợi ý của người cùng chọn/người gợi ý hiện chung với tim gia đình ở màn quản trị
  (`/api/admin/galleries/[id]/tim-gia-dinh`).

### 3c. Vòng 2 — màn mua của gia đình (`man-mua-gia-dinh.tsx`)

Thay lớp phủ + tấm chọn ảnh riêng của `MoiMuaLanHai`. Màn THAY cả trang như màn đợt: đầu màn
`DauManLuotChon`, lưới `LuoiAnh` (tim gia đình), xem lớn với bảng "Tấm này dùng cho…", so sánh,
cửa hàng `CuaHang`, thanh đáy `ThanhDayLuot` ("N món · tạm tính" + "Gửi yêu cầu"). Gửi = MỘT lượt
`POST /api/g/mua-them` với tên + SĐT (luồng + quyền như cũ). `MoiMuaLanHai` chỉ còn hiện thẻ
"đã gửi yêu cầu" trên trang chính; phần tấm chọn ảnh của nó không còn đường mở (dọn ở việc sau).

### 3d. Vòng 4 (08/10) — "Xem trên tường / bàn nhà" ở mọi màn, mọi vai

- Lối vào CỐ ĐỊNH: nút "Trên tường" góc phải trên của MỌI màn xem lớn (`PhotoLightbox.onXemTuong`,
  `data-testid="nut-xem-tuong"`): đợt 1, đợt N (ba mẹ + người gợi ý), gia đình được mời, màn mua của
  gia đình, bộ đã chốt/đã giao, và màn lớn ảnh ĐÃ CHỈNH (`XemLonDuyet`). Vẫn còn lối trong bảng
  "Tấm này dùng cho…" và trong cửa hàng (BB-398). Xem không đòi tấm đã chọn. Luật UV → bàn, còn lại →
  tường giữ nguyên (`ManTreoTuong`).
- ĐẶT trong màn treo theo `cachDatTuManTreo` (thuần, `luot-chon.ts`):

| Vai / trạng thái | Nút ở màn treo |
|---|---|
| Đợt 1 còn mở (ba mẹ, cùng chọn, gợi ý) | "Thêm vào giỏ" (như cũ) |
| Màn đợt N của ba mẹ / màn mua của gia đình | "Thêm vào giỏ" của đợt / giỏ yêu cầu |
| Bộ đã khoá + đợt N mở — ba mẹ | "Chọn thêm ảnh" → màn đợt N |
| Bộ đã khoá + đợt N mở — cùng chọn / gợi ý | "Gợi ý ảnh cho đợt mới" / "Gợi ý tấm này" |
| Gia đình được mời (trang chính) | "Đặt in tấm này" → màn mua của gia đình, cửa hàng mở sẵn tấm đó |
| Bộ khoá, chưa tới đợt N / bộ đóng | chỉ xem (một dòng giải thích, không nút giả) |

## 4. Kiểu iPhone — luật cho mọi lượt

1. Một thao tác chính mỗi màn: đợt 1 "Chốt danh sách", đợt N "Chốt đợt N", gia đình "Đặt in / mua thêm".
2. Nút cùng chỗ, cùng tên: chip lọc ở đầu lưới; "So sánh" là biểu tượng góc phải trên điện thoại, chip sau cụm lọc trên máy tính; trong xem lớn luôn là Tim · Ghi chú · Đặt in.
3. Phản hồi tức thì: tim/ghi chú của đợt N ghi vào nháp ngay (không chờ mạng), như đợt 1 lạc quan.
4. Không màn nào cụt: vai được phép thì có nút; vai không được phép thì không có nút (không nút giả).
5. Điện thoại 390px trước.

## 5. Chỗ chưa xong / còn để anh quyết

- (Vòng 2 đã làm: màn mua của gia đình thay cả trang; người cùng chọn / người gợi ý gợi ý ở đợt N.)
- Phần tấm chọn ảnh + danh sách một cột trong `moi-mua-lan-hai.tsx` không còn đường mở — nên dọn.
- Nháp đợt (ảnh + giỏ + ghi chú) nằm trong trình duyệt của máy ba mẹ: đổi máy là mất nháp
  (như trước BB-400).
