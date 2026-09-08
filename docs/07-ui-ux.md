# 07 — Thiết kế giao diện

## 1. Nguyên tắc

1. **Ảnh là nhân vật chính.** Giao diện lùi lại: nền trung tính, chrome tối giản, không đổ bóng loè loẹt cạnh ảnh.
2. **Mobile trước.** Thiết kế cho màn 375px rồi mở rộng lên. Vùng chạm ≥ 44×44px.
3. **Một thao tác một chạm.** Chọn ảnh không được cần 2 bước.
4. **Luôn biết mình đang ở đâu.** Bộ đếm quota dính đáy màn hình, không bao giờ khuất.
5. **Ấm áp, không trẻ con.** Khách là phụ huynh trẻ; giao diện dịu, sạch, đáng tin — không phải app thiếu nhi.

## 2. Design token

```css
/* src/styles/tokens.css — DEV-UI sở hữu */
:root {
  /* Thương hiệu — pastel ấm, hợp studio ảnh em bé */
  --bb-primary:        #E8A598;   /* hồng đất */
  --bb-primary-fg:     #FFFFFF;
  --bb-accent:         #7FA99B;   /* xanh sage */
  --bb-cream:          #FBF7F2;

  /* Nền */
  --bb-bg:             #FBF7F2;
  --bb-surface:        #FFFFFF;
  --bb-surface-2:      #F3EDE6;
  --bb-border:         #E5DCD2;

  /* Chữ */
  --bb-fg:             #2E2A27;
  --bb-fg-muted:       #7A716A;

  /* Trạng thái */
  --bb-success:        #4E9A6B;
  --bb-warning:        #D9932B;
  --bb-danger:         #C4553F;

  /* Chế độ xem ảnh — luôn nền tối để mắt tập trung vào ảnh */
  --bb-viewer-bg:      #16130F;

  --bb-radius:         12px;
  --bb-radius-sm:      8px;
  --bb-shadow:         0 1px 3px rgba(46,42,39,.08), 0 8px 24px rgba(46,42,39,.06);

  --bb-font-sans:      "Be Vietnam Pro", system-ui, -apple-system, sans-serif;
  --bb-font-display:   "Playfair Display", Georgia, serif;   /* chỉ dùng cho tiêu đề album */
}

@media (prefers-color-scheme: dark) {
  :root {
    --bb-bg: #16130F; --bb-surface: #211D19; --bb-surface-2: #2B2621;
    --bb-border: #3A332C; --bb-fg: #F2EDE7; --bb-fg-muted: #A69B91;
  }
}
```

Thang khoảng cách: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64.
Font: **Be Vietnam Pro** (dấu tiếng Việt chuẩn) cho toàn bộ; **Playfair Display** chỉ cho tên album.

## 3. Màn hình khách hàng

### 3.1 `/g/[token]/pin` — Nhập PIN

```
┌────────────────────────────┐
│                            │
│         [ logo ]           │
│                            │
│    Album của bé Bơ         │
│    BabyBean Quận 1         │
│                            │
│   Nhập 4 số cuối số điện   │
│   thoại đã đăng ký         │
│                            │
│     ┌─┐ ┌─┐ ┌─┐ ┌─┐        │
│     │ │ │ │ │ │ │ │        │
│     └─┘ └─┘ └─┘ └─┘        │
│                            │
│      [   Xem album   ]     │
│                            │
│   Không nhớ? Gọi 0901…     │
└────────────────────────────┘
```
- 4 ô riêng, tự nhảy ô, `inputmode="numeric"`, tự submit khi đủ 4 số.
- Sai: rung nhẹ + "Sai PIN, còn 3 lần thử".
- Bị khoá: đếm ngược phút.

### 3.2 `/g/[token]` — Lưới ảnh (màn hình chính)

```
┌──────────────────────────────────────┐
│ [logo] Bé Bơ 3 tháng      [VI] [⋯]  │ ← header, thu gọn khi cuộn
├──────────────────────────────────────┤
│ Tất cả · Đã chọn(18) · ⭐ · Ghi chú │ ← tab lọc, cuộn ngang
│ Concept 1 · Concept 2                │ ← tab thư mục con (nếu có)
├──────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐              │
│ │  ảnh    │ │  ảnh  ✓ │              │ ← ✓ góc trên phải
│ │      ○  │ │      ⑦ │              │   số = thứ tự chọn
│ └─────────┘ └─────────┘              │
│ ┌─────────┐ ┌─────────┐              │
│ │  ảnh 💬 │ │  ảnh ⭐ │              │ ← 💬 có ghi chú
│ └─────────┘ └─────────┘              │
│              …                       │
├──────────────────────────────────────┤
│  Đã chọn 18/20 · 0đ phụ thu          │ ← thanh dính, luôn hiện
│  [  Xem lại và xác nhận  ]           │
└──────────────────────────────────────┘
```

- Mặc định 2 cột (mobile) / 4 cột (tablet) / 6 cột (desktop); nút đổi mật độ trong menu `⋯`.
- Chạm vào ảnh → mở lightbox. Chạm vào vòng tròn góc → chọn/bỏ chọn ngay tại lưới.
- Trạng thái lưu: chip nhỏ cạnh bộ đếm — "Đang lưu…" / "Đã lưu" / "Chưa lưu (đang chờ mạng)".
- Skeleton khi tải; virtualize khi > 200 ảnh.

### 3.3 Lightbox

```
┌──────────────────────────────────────┐
│ ✕            142 / 862          ⋯   │
│                                      │
│                                      │
│            [   Ảnh lớn   ]           │
│                                      │
│                                      │
│  BB_0123.jpg                         │
├──────────────────────────────────────┤
│  [ ⭐ Yêu thích ]  [ ✓ Chọn ảnh này ]│
│  ✎ Thêm ghi chú chỉnh sửa            │
└──────────────────────────────────────┘
```
- Nền `--bb-viewer-bg`, không có gì phân tán.
- Vuốt trái/phải chuyển ảnh, vuốt xuống đóng, pinch zoom.
- Preload 3 ảnh kế tiếp và 1 ảnh trước.
- Sheet ghi chú trượt lên từ đáy, có chip gợi ý: `Xoá mụn sữa` `Làm sáng da` `Xoá vật thể lạ` `Cắt cúp lại` `Đổi nền` `Ghép mắt mở`.

### 3.4 `/g/[token]/review` — Xác nhận

- Tóm tắt: `24 ảnh · 20 trong gói · 4 ảnh thêm × 50.000đ = 200.000đ`.
- Lưới thu nhỏ toàn bộ ảnh đã chọn, chạm để bỏ chọn ngay tại đây.
- Danh sách ghi chú chỉnh sửa theo từng ảnh.
- Cảnh báo vàng nếu chưa dùng hết quota.
- Ô nhập tên + checkbox xác nhận + nút "Chốt danh sách".
- Hộp thoại xác nhận lần cuối: "Sau khi chốt, bạn không đổi được nữa. Chắc chắn chứ?"

### 3.5 `/g/[token]/done` — Hoàn tất

Ảnh minh hoạ + "Cảm ơn ba mẹ!" + tóm tắt + thời gian dự kiến giao + nút "Lưu ảnh tóm tắt" + "Xem lại album".

## 4. Màn hình quản trị

Bố cục: sidebar trái (thu gọn được) + vùng nội dung. Bộ chọn chi nhánh ở góc trên phải nếu người dùng phụ trách nhiều chi nhánh.

### 4.1 Dashboard
- Hàng thẻ số: `Chờ khách chọn` · `Sắp hết hạn` · `Quá hạn` (đỏ) · `Chờ retouch` · `Đã giao tháng này`.
- Bảng "Cần xử lý ngay": tên bé, khách, chi nhánh, trạng thái, còn lại N ngày, tiến độ chọn `18/20`, nút thao tác nhanh.
- Biểu đồ cột đơn giản: album theo ngày, 14 ngày gần nhất.

### 4.2 Danh sách album
Bảng có bộ lọc dính (chi nhánh, trạng thái, mức khẩn, thợ ảnh, khoảng ngày, tìm theo tên/SĐT). Mỗi dòng có menu: Xem · Copy link · Nhắc khách · Xuất danh sách · Gia hạn · Mở lại.

### 4.3 Tạo album — wizard 3 bước
1. **Nguồn ảnh** — dán link Drive, hệ thống kiểm tra và xem trước 6 ảnh.
2. **Thông tin** — khách (tìm hoặc tạo mới), bé, ngày chụp, thợ ảnh, gói.
3. **Luật chọn** — quota, giá ảnh thêm, hạn chốt, PIN, watermark, cho tải, cho mời.
→ Màn hình kết quả: link + QR + nội dung tin nhắn mẫu có nút "Copy".

### 4.4 Chi tiết album
Tab: **Tổng quan** (thông tin, tiến độ, dòng thời gian hoạt động) · **Ảnh** (lưới giống khách thấy, đánh dấu ảnh được chọn) · **Kết quả chọn** (danh sách + ghi chú + nút xuất) · **Link chia sẻ** (danh sách link, lượt xem, thu hồi) · **Nhật ký**.

### 4.5 Xuất danh sách
Hộp thoại chọn định dạng, có ô xem trước và nút "Copy vào clipboard" cho định dạng Lightroom.

## 5. Thư viện component

| Nhóm | Component | Sở hữu |
|---|---|---|
| Cơ bản | Button, Input, Select, Checkbox, Radio, Switch, Textarea, Badge, Avatar, Tooltip | DEV-UI |
| Bố cục | Card, Sheet, Dialog, Tabs, Accordion, Separator, ScrollArea | DEV-UI |
| Phản hồi | Toast, Skeleton, Spinner, EmptyState, ErrorState, ProgressBar | DEV-UI |
| Dữ liệu | DataTable (sort, filter, phân trang), Pagination, StatCard | DEV-UI |
| Album | PhotoGrid, PhotoCard, Lightbox, SelectionBar, FilterTabs, DensityToggle, NoteSheet, QuotaMeter | DEV-FE |
| Quản trị | GalleryTable, CreateGalleryWizard, DrivePreview, SyncProgress, ExportDialog, ShareLinkPanel, ActivityTimeline | DEV-FE |

## 6. Trạng thái rỗng & lỗi (bắt buộc thiết kế, không để trắng)

| Tình huống | Nội dung |
|---|---|
| Album chưa có ảnh | "Album đang được chuẩn bị. Studio sẽ báo khi sẵn sàng." |
| Lọc không ra kết quả | "Chưa có ảnh nào trong mục này." + nút xoá bộ lọc |
| Link hỏng | "Link không tồn tại hoặc đã hết hạn." + nút gọi/Zalo chi nhánh |
| Album đã chốt | Banner xanh "Bạn đã chốt ngày 05/09. Album ở chế độ chỉ xem." |
| Mất mạng | Banner cam dính đáy "Mất kết nối — lựa chọn của bạn được giữ và sẽ lưu khi có mạng." |
| Ảnh lỗi tải | Ô xám + biểu tượng + nút "Thử lại" |
| Ảnh mất khỏi Drive | Ô xám "Ảnh này không còn khả dụng, vui lòng liên hệ studio." |

## 7. Chuyển động

- Chọn ảnh: dấu ✓ nảy nhẹ, 150ms, `cubic-bezier(.34,1.56,.64,1)`.
- Mở lightbox: ảnh phóng từ vị trí ô lưới, 220ms.
- Toast: trượt lên từ đáy, tự ẩn sau 3s.
- Tôn trọng `prefers-reduced-motion`: tắt hết, chỉ giữ đổi màu.

## 8. Khả năng tiếp cận

- Tương phản chữ/nền ≥ 4.5:1.
- Điều hướng bàn phím đầy đủ ở lightbox và mọi hộp thoại (bẫy focus, `Esc` đóng).
- `aria-label` cho mọi nút biểu tượng; trạng thái chọn báo qua `aria-pressed`.
- Không chỉ dùng màu để truyền tin: ảnh đã chọn có cả viền, dấu ✓ và số thứ tự.
- Vùng chạm tối thiểu 44px.

## 9. Ngôn ngữ

Tất cả chuỗi nằm trong `src/i18n/vi.ts` và `src/i18n/en.ts`. Không hard-code.

Giọng văn tiếng Việt: xưng **"ba mẹ"** với khách, lịch sự, ngắn. Ví dụ: "Ba mẹ đã chọn 18/20 ảnh", "Ba mẹ kiểm tra lại giúp em nhé".
