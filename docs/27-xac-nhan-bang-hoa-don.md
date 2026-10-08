# 27 — Xác nhận phát sinh bằng mã hoá đơn (BB-395)

Anh chốt 08/10/2026. Áp cho MỌI phát sinh: vượt hạn mức lần đầu, đợt mua thêm, sản phẩm mua thêm.
Trước đây nhân viên bấm "Xác nhận thanh toán" và gõ số tiền tay, không ràng buộc hoá đơn/phiếu thu.
Nay đường chính là **mã hoá đơn**; nhập tay chỉ còn là dự phòng cho Admin/Quản lý, bắt ghi lý do.

## 1. Luồng

1. Nhân viên nhập mã hoá đơn (`HD_YYYYMMDD#NN`) vào bộ ảnh (khu "Tiền phát sinh" ở chi tiết bộ,
   hoặc tab "Ảnh vượt hạn mức" / "Khách gửi ảnh chọn"), bấm **Đồng bộ từ Lark**. Thêm được nhiều mã;
   các mã của một bộ được **cộng dồn**.
2. Máy chủ đọc HẾT hoá đơn từ nguồn (`NguonHoaDon`) trước khi ghi gì. Nguồn lỗi/chậm → câu thân thiện,
   không ghi gì.
3. **Khách** (điều kiện cứng): khoá khách trên hoá đơn phải bằng `customers.lark_customer_key` của khách
   của bộ. Khác → chặn "Hoá đơn này của khách khác". Khách của bộ không có khoá Lark (tạo tay) hoặc hoá
   đơn không gắn khách → không tự xác nhận được; chỉ người có quyền `thanh_toan:nhap_tay` **ép gán**
   kèm lý do (lưu ở `hoa_don_bo_anh.ep_gan_ly_do`).

   **Khớp khách dự phòng qua hoá đơn gốc (BB-397).** Khách của bộ CHƯA có `lark_customer_key` (khách
   đến từ Lark nhưng đường tạo/gắn bộ cũ không đặt khoá) → app đọc qua `NguonHoaDon` (chỉ đọc, ≤ 5 mã)
   hoá đơn GỐC của bộ (`galleries.lark_contract_code` + `lark_contract_codes`) và so `khoaKhachNguon`:

   | Hoá đơn gốc | Kết quả | Việc làm |
   |---|---|---|
   | Cùng khách với hoá đơn phát sinh | `khop_qua_hoa_don_goc` (ghi ở `ket_qua.khopKhach` + nhật ký gán) | Cho gán, KHÔNG cần ép; **nối khoá**: ghi `customers.lark_customer_key` (chỉ khi đang NULL) — lần sau khớp thẳng |
   | Khác khách | `khac_khach` | Chặn như cũ |
   | Không có / nguồn không có mã / gốc không có khách / các gốc lệch khách nhau | `bo_chua_co_khoa` | Như cũ: chỉ Admin/Quản lý ép gán |
   | Nguồn lỗi/chậm khi đọc gốc | — | Câu lỗi nguồn, không ghi gì |

   Nối khoá: khách KHÁC đã giữ khoá đó (`uq_customers_lark_key`) → **không ghi**, vẫn cho khớp, cảnh báo
   "Có thể trùng khách" (trả về màn hình + nhật ký `customer.noi_khoa_lark_bo_qua`). Nối được → nhật ký
   `customer.noi_khoa_lark` (`cachKhop`, mã hoá đơn, mã hoá đơn gốc). Có hoá đơn nào bị chặn "khách
   khác" trong lượt → không nối. Khách đã có khoá → KHÔNG dùng dự phòng (khoá khác vẫn là khách khác).
   Mã: `src/lib/hoa-don/khop-khach-du-phong.ts` (thuần) + `dongBoHoaDonChoBo`.

   **Gốc của lỗi, đã vá ở BB-397** — các đường tạo/gắn khách từ Lark trước đây KHÔNG đặt khoá:
   thuật sĩ tạo bộ (`POST /api/admin/galleries`, khách mới qua `create_gallery_bundle` hoặc khách cũ
   khớp SĐT), gắn dòng Hậu Kỳ cho bộ tạo tay (`.../[id]/gan-lark`), và đồng bộ Hậu Kỳ khi bộ ĐÃ CÓ
   (`sync-retouch.ts` nhánh `already_exists` trả về sớm). Nay cả ba đặt khoá = `customerKey(ô "Mã KH"
   của dòng Hậu Kỳ)` — đúng hàm băm và cùng ô với đồng bộ (`bocDongHauKy().khoaKhach`,
   `noiKhoaKhachNeuTrong`): không đè khoá đã có, không giành khoá của khách khác.
4. **Hậu Kỳ** (gợi ý, không phải khoá — một hoá đơn có thể trỏ HAI dòng Hậu Kỳ): link `🎯Tiến Độ Hậu Kỳ`
   của hoá đơn trỏ sang bộ KHÁC (khác `galleries.lark_hauky_record_id`) → cảnh báo vàng, phải xác nhận
   lần hai.
5. **Điều kiện**: ≥ 1 phiếu thu VÀ Còn Lại ≤ 0 (Lark đã tính tips). Còn Lại < 0 ("Thu dư") vẫn hợp lệ,
   kèm cảnh báo. Chưa đủ → lưu mã, báo rõ thiếu gì ("chưa có phiếu thu", "còn phải thu 300.000 ₫"),
   không ghi tiền/hạn mức.
6. **Đối chiếu** từng mục (`doiChieuHoaDon`): "File chỉnh thêm" (dòng "Edit file") và từng sản phẩm
   (theo id sản phẩm ở nguồn ↔ `products.lark_record_id`). Dòng 0 đồng kiểu "Dịch vụ Hậu Kỳ" không
   đối chiếu. Sản phẩm có trên hoá đơn mà app chưa có → app **tự thêm vào bộ**.
7. Ghi (idempotent): dòng hạn mức theo hoá đơn + sổ tiền theo phiếu thu (mục 3). Khớp → khoá đợt 1
   (nếu khách đã gửi, không đang sửa dở), yêu cầu mua thêm → `da_thanh_toan`.

### Một khách nhiều bộ

- Gán từ trang chi tiết một bộ → bộ đó là đích (vẫn kiểm khách).
- Gán từ cấp khách (tab "Ảnh vượt hạn mức" → "Gán mã hoá đơn theo khách"): nhập mã → app liệt kê các
  bộ của khách đó (trong chi nhánh nhân viên thấy), **gợi ý** bộ khớp nhất: dòng Hậu Kỳ hoá đơn trỏ đúng
  bộ (+100) → số file chờ bằng số file hoá đơn (+50, gần hơn thì hơn) → sản phẩm trùng (+10).
  Nhân viên BẤM chọn — không bao giờ tự gán âm thầm, kể cả khi chỉ có một bộ.
- BB-397 — chưa khách nào mang khoá của hoá đơn: app đi theo dòng Hậu Kỳ hoá đơn trỏ tới → bộ neo
  dòng đó (≤ 3 bộ) → khách chưa có khoá mà hoá đơn gốc của bộ cùng khách nguồn → liệt kê bộ của
  khách đó. Trang khách hàng: khách chưa có khoá → so với hoá đơn gốc ≤ 3 bộ gần nhất của khách.
  KHÔNG quét cả kho Lark; gợi ý chỉ đọc, việc nối khoá xảy ra khi bấm gán.
- Một mã chỉ thuộc MỘT bộ (`hoa_don_bo_anh.ma_hoa_don` unique). Đổi bộ = Admin/Quản lý **gỡ gán** (bỏ
  dòng hạn mức của mã, ghi dòng đính chính ÂM cho tiền đã ghi, ghi nhật ký) rồi gán lại.

## 2. Bảng trạng thái

```
            gán mã
 (chưa có) ───────▶ cho_dong_bo ──đồng bộ──▶ chua_du_dieu_kien ──(Lark thu đủ, đồng bộ lại)──┐
                                    │                                                     │
                                    ▼                                                     ▼
                       ┌──────── đối chiếu ◀──────────────────────────────────────────────┘
                       │
        ┌──────────────┼───────────────┬───────────────────┐
        ▼              ▼               ▼                   ▼
      khop           thua            thieu              hon_hop
  (khoá đợt 1,   (hạn mức đã trả   (phần trong HĐ đã    (thừa file +
   xong)          còn N, khách/NV   ghi; phần dư CHỜ)    thiếu mục khác)
                  chọn tiếp)            │
        ▲              │               ├─ tích "Bỏ" mục dư ──▶ đồng bộ lại
        └──────────────┴───────────────┴─ gán thêm mã bổ sung ─▶ đồng bộ lại (cộng dồn)
```

| Trạng thái | Nghĩa | Tiền/hạn mức | Hiện ở đâu |
|---|---|---|---|
| `cho_dong_bo` | Vừa gán, chưa đồng bộ | — | Chi tiết bộ |
| `chua_du_dieu_kien` | Chưa có phiếu thu / còn nợ | Không ghi gì | Chi tiết bộ + "Hoá đơn cần xử lý" (tab Ảnh vượt hạn mức) |
| `khop` | Hoá đơn = khách chọn | Ghi đủ, khoá đợt 1 | — |
| `thua` | Hoá đơn > khách chọn | Ghi đủ, hạn mức dư = ảnh đã trả còn lại | "Hoá đơn cần xử lý"; màn khách "Ba mẹ còn N ảnh đã thanh toán…" |
| `thieu` | Khách chọn > hoá đơn | Ghi phần trong HĐ; phần dư còn phải thu | Tab Ảnh vượt hạn mức (còn nợ) + "Hoá đơn cần xử lý" |
| `hon_hop` | Thừa một mục, thiếu mục khác | như trên | như trên |

## 3. Tiền — MỘT cơ chế nâng hạn mức (không cộng hai lần)

Xác nhận bằng hoá đơn:
- thêm vào `gallery_items` dòng "Edit file × N" mang dấu `lark_record_id = 'hoa_don:<mã dòng HĐ>'`,
  `lark_contract_code = null` (kéo hợp đồng từ Lark không xoá nó), `line_total` = tiền hoá đơn phần đó.
  N = file hoá đơn TRỪ phần dành cho "Edit file" khách đã mua trên app (phần đó đã có tiền riêng);
- ghi `gallery_payments` theo từng phiếu thu: `ma_hoa_don`, `ma_phieu_thu`, phương thức theo phiếu,
  số tiền = tiền dòng "Edit file" (+ tiền sản phẩm CHỈ khi cờ `thanh_toan.thu_san_pham_qua_app` bật;
  tắt = sản phẩm thu qua Lark, không vào sổ app — BB-363). Không phải tổng phiếu thu (có tips).

KHÔNG chạy `dongBoHanMucTheoThanhToan` (BB-348) cho phần này. `layTienCanThu` cộng `TienHanMucHoaDon`:
`tien` (tiền hoá đơn của các dòng đó, giá HOÁ ĐƠN) vào phần vượt phải thu — triệt tiêu đúng phần sổ hoá
đơn ghi có; `truLucChot` trừ phần số lúc chốt đã tính cho ảnh mà dòng hoá đơn tạo SAU lúc chốt nay phủ;
`ghiCoNgoaiVuot` (tiền HĐ cho "Edit file" mua thêm / sản phẩm) không trừ vào phần vượt. Kết quả (phép
thử `tests/unit/bb-395-doi-chieu-hoa-don.test.ts`, chốt trước/sau đều đúng):

| Ca | Hạn mức | Còn phải thu | BB-348 nâng thêm |
|---|---|---|---|
| Khớp (HĐ 10, vượt 10) | +10 | 0 | 0 |
| Thừa (HĐ 10, vượt 7) | +10 (còn 3 chỗ) | 0 (không báo "trả dư") | 0 |
| Thiếu (HĐ 10, vượt 12) | +10 | 2 ảnh | 0 |
| Gán HĐ bổ sung (+2) | +12 | 0 | 0 |
| Giá HĐ ≠ giá ảnh (giảm giá) | +10 | 0 | 0 |
| Đồng bộ lại cùng mã | không đổi | không đổi | 0 |

Chống ghi hai lần: dòng hạn mức theo khoá unique `lark_record_id`; dòng sổ mang
`ma_yeu_cau = hd-<lần gán>-<băm mã phiếu>` (chỉ mục duy nhất 0086). Bấm đúp, hai người cùng bấm, đồng
bộ lại → không thêm dòng. Báo cáo doanh thu phát sinh, "Ảnh vượt hạn mức chưa thu", `layTienCanThu`
đều đọc `layTienCanThuNhieuBo` nên tự đúng.

## 4. Hợp đồng `NguonHoaDon` (src/lib/hoa-don/nguon-hoa-don.ts)

```ts
interface NguonHoaDon {
  ten: "lark" | "fixture" | ...;
  layHoaDon(ma: string): Promise<HoaDonChuan | null>; // null = không có; hỏng → ném LoiNguonHoaDon
}
interface HoaDonChuan {
  ma; nguon; tongPhaiThu; daThu; conLai; trangThai;
  phieuThu: { ma; soTien; phuongThuc: "tien_mat" | "chuyen_khoan" | "khac"; phuongThucGoc; ngay }[];
  dong: { maDong; loai: "file_chinh" | "san_pham" | "dich_vu"; idSanPhamNguon; tenSanPham; soLuong; thanhTien }[];
  khoaKhachNguon: string | null; // ĐÃ chuẩn hoá như customers.lark_customer_key
  maHauKyNguon: string[];
}
```

Luật: chỉ đọc; tiền là số nguyên đồng; nguồn tự phân loại dòng; chữ gốc có tên/SĐT khách không ra khỏi
tệp nguồn. Nhà máy `chonNguonHoaDon`: phép thử (Vitest) và phép thử trình duyệt (`PHEP_THU_TRINH_DUYET=1`)
LUÔN dùng nguồn giả (`HOA_DON_FIXTURE`, mã `HD_20990101#9xxx`) — không bao giờ gọi Lark.

Bản Lark (`nguon-hoa-don-lark.ts`, nơi DUY NHẤT có tên bảng/trường Lark): bảng `Hóa Đơn` khớp tên chính
xác; tìm bằng GET `records?filter=CurrentValue.[Mã Hợp Đồng]="…"` (search báo InvalidFilter với
AutoNumber); dòng/phiếu thu đi theo link `Hóa Đơn Chi Tiết V2` / `💲Bảng Thu V2` (`[0].record_ids`, GET
từng bản ghi — search `contains "<mã>_"` trả 0 dòng); so mã CHÍNH XÁC (`#57` ≠ `#572`); số dạng chuỗi
được parse; khoá khách = `customerKey("Mã KH")` của mã đồng bộ khách (sync-retouch.ts).

### Muốn thay Lark (app tự lập hoá đơn/phiếu thu)

1. Viết `src/lib/hoa-don/nguon-hoa-don-app.ts` trả `NguonHoaDon` với `ten: "app"` — đọc bảng hoá đơn/phiếu
   thu của app, điền `HoaDonChuan` (khoá khách = `customers.lark_customer_key` hoặc khoá mới cùng cách
   chuẩn hoá; phân loại dòng theo `products.kind`).
2. Thêm `"app"` vào `TenNguonHoaDon`; đổi `chonNguonHoaDon(…)` ở hai route (`[id]/hoa-don`,
   `hoa-don/goi-y`) sang nguồn mới (hoặc chọn theo tiền tố mã).
3. Chạy lại `tests/unit/bb-395-doi-chieu-hoa-don.test.ts` (không đổi) + viết phép thử cho nguồn mới như
   `bb-395-nguon-hoa-don-lark.test.ts`. Không đụng `doi-chieu-hoa-don.ts`, `xac-nhan-hoa-don-server.ts`,
   màn hình hay công thức tiền.

## 5. Quyền

| Việc | Quyền |
|---|---|
| Gán mã + đồng bộ, bỏ mục dư, gán theo khách | `galleries:write` + đúng chi nhánh |
| Ép gán (khách không tự kiểm được), gỡ gán, NHẬP TIỀN TAY (`POST [id]/payments`, bắt lý do) | `thanh_toan:nhap_tay` (MỚI, 0102: owner, admin, branch_manager) hoặc `system:superuser` |

Vai "lead" anh nhắc chưa có trong `STAFF_ROLES` — muốn cấp thì tích `thanh_toan:nhap_tay` cho vai đó ở
màn Vai trò. Nhật ký: `gallery.hoa_don_gan`, `gallery.hoa_don_dong_bo`, `gallery.hoa_don_bo_muc`,
`gallery.hoa_don_go_gan`.

## 6. Vòng 2 (anh chốt 08/10)

### Đợt mua thêm (đợt ≥ 2) — "MỌI phát sinh"
- Hoá đơn trả cho `tien_anh` (+ sản phẩm trong giỏ) của đợt. KHÔNG nâng hạn mức cho ảnh đợt ≥ 2
  (đợt tính tiền mọi ảnh mới theo `tinhTienDot`). "Edit file" trong giỏ đợt tính là file của đợt.
- **Thứ tự chia một (hoặc nhiều) hoá đơn — đợt cũ trước**: file hoá đơn trả cho "Edit file" mua thêm
  đợt 1 → ảnh vượt hạn mức đợt 1 → từng đợt ≥ 2 theo số đợt tăng dần. Một đợt chỉ ĐÃ TRẢ khi đủ CẢ
  ảnh lẫn sản phẩm; gặp đợt không đủ thì dừng (đợt sau không được trả trước đợt trước). File còn dư
  chỉ nâng hạn mức đợt 1 (Thừa) khi MỌI đợt đã đủ; còn đợt thiếu thì phần dư đứng chờ ở mục của đợt
  đó (tiền nằm trong sổ, tự triệt tiêu, không đòi gì thêm). Sản phẩm: giỏ đợt 1 + yêu cầu mua thêm trước,
  rồi giỏ các đợt.
- Đợt đủ → ghi dấu `selection_rounds.ma_hoa_don`, `ma_phieu_thu`, `da_thanh_toan_luc/boi` (dấu TRƯỚC),
  rồi xác nhận bằng ĐÚNG `xacNhanDotMuaThem` nếu đợt còn chờ. Thiếu → nhân viên tích bỏ ảnh của đợt
  (chỉ đợt còn chờ) hoặc gán hoá đơn bổ sung rồi đồng bộ lại.
- Tiền: `layTienCanThu` bỏ đợt có `ma_hoa_don` khỏi "Phải thu" (`dotTinhVaoPhaiThu`), và cộng phần sổ
  hoá đơn không thuộc vượt hạn mức đợt 1 (`ghiCoNgoaiVuot`) vào "Phải thu" → tự triệt tiêu theo giá
  HOÁ ĐƠN. Bấm "Xác nhận đợt" theo đường cũ sau đó: route từ chối (409) và dấu vẫn còn → `tien_anh`
  không bao giờ bị đòi lần hai (phép thử "vòng 2: tien_anh của đợt KHÔNG bị đòi hai lần").
- Giỏ đợt 1 ("Edit file", sản phẩm) được phủ đủ → `selection_addons.ma_hoa_don` (cột mới 0102), cùng
  cách. Gỡ gán → bỏ mọi dấu của mã (đợt, giỏ, yêu cầu mua thêm về `da_chot`), ghi dòng đính chính âm,
  rồi tự đồng bộ lại các mã còn lại.

### Bỏ ảnh dư = tích chọn
Danh sách ảnh (thu nhỏ + tên tệp) khách chọn vượt phần đã trả, theo nhóm (đợt 1 / từng đợt ≥ 2 còn
chờ), mới nhất trước, TÍCH SẴN đúng N ảnh chọn sau cùng; nhân viên đổi tích được. Nút "Bỏ N ảnh đã
tích" bật khi mỗi nhóm tích 1…N (tích ít hơn thì hiện "còn thiếu", tích nhiều hơn thì khoá). Bỏ = xoá
khỏi lượt chọn; đợt 1 trừ số lúc chốt tương ứng, đợt ≥ 2 trừ `so_anh`/`tien_anh` theo `gia_moi_anh`;
nhật ký `gallery.hoa_don_bo_muc` có id ảnh để khôi phục.

### Khác
- Sản phẩm khi bật "thu sản phẩm qua app": theo GIÁ TRÊN HOÁ ĐƠN (hoá đơn là cái khách đã trả).
- Yêu cầu mua thêm (BB-245) không có đơn giá: tiền thiếu = `products.list_price` × số lượng, ghi "(giá niêm yết)".
- Phiếu thu phương thức lạ (không phải Tiền Mặt / Chuyển Khoản): ghi `chuyen_khoan`, ghi chú dòng sổ
  thêm "(phương thức gốc: …)".
- Gán theo khách có ở tab "Ảnh vượt hạn mức" VÀ trang khách hàng (`/admin/customers/[id]`, chỉ bộ của
  chính khách đó; hoá đơn của khách khác → "Hoá đơn này của khách khác").
- **Chọn hộ** (Thừa): app chưa có luồng nhân viên chọn ảnh riêng. Cách chọn hộ hiện tại: nút "Mở trang
  khách để chọn hộ" mở link khách của bộ — nhân viên chọn ảnh trên đó như ba mẹ (phần đã trả nằm trong
  hạn mức nên không phát sinh tiền).

## 7. Giới hạn đã biết

- ĐÃ SỬA (vòng 3, migration 0103): view `v_over_quota_unbilled`/`v_over_quota_summary` từng đếm MỌI ảnh
  đang chọn, kể cả ảnh đợt ≥ 2 → bộ không vượt ở đợt 1 mà có đợt 2 bị đòi ảnh đợt 2 hai lần ("vượt hạn
  mức" + `tien_anh`). Nay chỉ đếm ảnh và "Edit file" ĐỢT 1. Cùng luật ở mã: chốt đợt 1
  (`/api/g/submit`, `chotThayKhachTheoDanhSachHienTai`), "ảnh chọn thêm" màn khách (`/api/g/gallery`),
  "Theo hạn mức hiện tại" màn nhân viên (`selectedCountDot1`, `demAnhDot1`).
  Giữ nguyên có chủ ý: giới hạn số ảnh được chọn (`selection/mutate.ts`, không phải tiền), đếm theo
  đợt trong `dot-chon-server.ts`, xuất danh sách, giỏ mua thêm, ảnh album không chỉnh.
- Mục được phủ MỘT PHẦN (vd hoá đơn 1 album, giỏ 2 album) chưa đánh dấu → vẫn tính đủ trong "Phải thu"
  tới khi nhân viên bỏ phần dư hoặc gán hoá đơn bổ sung.
- Đợt đã xác nhận được trả tay trước đó (không dấu hoá đơn) mà lại gán hoá đơn phủ đợt đó → coi như hoá
  đơn trả đợt (tiền tay thành dư). Nhân viên không nên gán hoá đơn cho đợt đã thu tay.
- Giỏ sản phẩm của đợt ≥ 2 không bỏ lẻ được — đổi bằng từ chối/mở lại đợt.
