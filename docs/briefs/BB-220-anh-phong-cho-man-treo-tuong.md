```
DÁN VÀO CỬA SỔ: THIẾT KẾ  (agent DESIGNER)
Thư mục xuất:   C:\Users\binh\Downloads\claude code\babybean-assets\BB-220
                (thư mục MỚI, chỉ chứa ảnh xuất ra — không đụng thư mục mã nào)
Model:          Nano Banana
```

# BB-220 — Ảnh phòng thật cho màn "treo ảnh của con lên tường"

## Vì sao có việc này

Sau khi ba mẹ chốt danh sách ảnh, app mở một màn bán hàng: **ướm tấm ảnh của
con lên tường nhà mình**, đổi chất liệu (gỗ, tráng gương, thủy tinh, canvas)
và kích thước (40×60, 50×75, 60×90 cm), giá đổi theo. Ba mẹ mua ảnh treo tường
khi **thấy** nó trên tường, không phải khi đọc bảng giá.

Bản mẫu đầu tiên vẽ căn phòng bằng mảng màu phẳng và chủ studio từ chối thẳng:

> "Giao diện phải thật đẹp và hiện đại chứ không phải 2D đổ màu như bản hôm qua."

Việc của bạn: tạo **ảnh căn phòng thật như chụp**, có một mảng tường trống để
app đặt ảnh của bé lên đúng tỷ lệ. Bạn KHÔNG làm giao diện, không viết mã. Ảnh
xong, Claude sẽ dựng màn hình quanh chúng.

## Cần giao

**4 căn phòng × 2 khổ = 8 ảnh**, cộng 1 tệp số liệu.

| Mã | Căn phòng | Vật tham chiếu tỷ lệ (kích thước thật) |
|---|---|---|
| `phong-khach` | Phòng khách căn hộ, sofa vải màu kem hoặc xanh rêu nhạt, tường trống phía trên sofa | Sofa dài **200 cm** |
| `phong-be` | Phòng ngủ của bé, cũi gỗ hoặc tủ thấp, tường trống phía trên | Cũi / tủ dài **120 cm** |
| `phong-ngu` | Phòng ngủ ba mẹ, tường đầu giường trống | Giường rộng **180 cm** |
| `hanh-lang` | Sảnh vào nhà, bàn console gỗ, tường trống phía trên | Bàn console dài **100 cm** |

Mỗi phòng hai khổ:

- **Dọc 4:5**, 1600×2000 px — cho điện thoại.
- **Ngang 16:9**, 2400×1350 px — cho máy tính.

Đặt tên: `<mã>-doc.jpg`, `<mã>-ngang.jpg`. Chất lượng JPEG 85–90.

## Luật ảnh — sai một điều là làm lại

1. **Nhìn thẳng vào mảng tường trống**: máy ảnh vuông góc với tường, đường ngang
   của tường nằm ngang thật. Nếu tường chụp xiên, app không đặt ảnh chữ nhật lên
   được mà trông thật.
2. **Mảng tường trống thật sự trống**: không tranh, không kệ, không đèn tường,
   không cây che, không ổ điện. Chiếm khoảng **35–50% bề ngang ảnh** và đủ cao
   để treo một tấm 60×90 cm dọc.
3. **Ánh sáng tự nhiên, dịu, đều trên mảng tường** — nắng qua cửa sổ một phía
   được, nhưng không có vệt nắng gắt hay bóng lá cắt ngang mảng tường.
4. **Không người, không chữ, không logo, không nhãn hiệu**, không đồ vật có chữ.
5. **Phong cách**: căn hộ ở TP.HCM hoặc Hà Nội, hiện đại, ấm, gọn —
   Japandi / Bắc Âu ấm. Bảng màu gần ảnh của studio: tường kem hoặc trắng ngà,
   gỗ sồi sáng, vải lanh, một chút xanh rêu và vàng mù tạt. **Không** phong cách
   khách sạn sang lạnh, không đá cẩm thạch bóng.
6. **Chân thật như ảnh chụp** — nhìn kỹ không thấy dấu ảnh tạo bằng máy: đồ vật
   không méo, chân ghế đủ, mép đồ thẳng, không vật thể lơ lửng.
7. Ảnh là sản phẩm tạo mới của bạn, **không lấy lại ảnh có sẵn trên mạng**.

## Tệp số liệu — bắt buộc

`tuong.json` trong cùng thư mục, một mục cho mỗi ảnh:

```json
{
  "phong-khach-doc.jpg": {
    "tuong": { "x": 380, "y": 290, "rong": 840, "cao": 760 },
    "thamChieu": { "ten": "sofa", "rongPx": 1180, "rongCm": 200 },
    "mauTuong": "#EFE8DC",
    "huongSang": "trai"
  }
}
```

- `tuong`: hình chữ nhật của **mảng tường trống**, tính bằng pixel trên chính
  ảnh đó (gốc toạ độ ở góc trên bên trái).
- `thamChieu`: vật tham chiếu và bề ngang của nó **đo trên ảnh** (px) cùng kích
  thước thật (cm) ở bảng trên. App dùng tỷ lệ này để một tấm 40×60 cm hiện đúng
  cỡ so với sofa. Đo sai là tấm ảnh trên tường sai cỡ, mà ba mẹ chọn cỡ theo
  chính cái nhìn đó.
- `mauTuong`: mã màu trung bình của mảng tường.
- `huongSang`: `trai` / `phai` / `tren` — để app đổ bóng khung ảnh cùng phía.

## Xong khi

1. Đủ 8 ảnh + `tuong.json` trong thư mục xuất.
2. Tự kiểm từng ảnh theo 7 luật ở trên, và ghi vào `KIEM-TRA.md` cùng thư mục:
   mỗi ảnh một dòng "đạt / chưa đạt luật số mấy".
3. Mở từng ảnh ở 100% và nhìn mép đồ vật, chân ghế, mép tường — ghi lại chỗ nào
   phải tạo lại.

Báo cáo: danh sách tệp kèm kích thước pixel thật (không phải kích thước bạn
định tạo — mở tệp ra đo), và nội dung `KIEM-TRA.md`. Claude sẽ tự mở từng ảnh
để soát trước khi dùng.

## Phần thêm nếu còn thời gian (không bắt buộc)

Ảnh chụp cận **góc khung** cho bốn kiểu khung (Khung HQ đen mờ, gỗ sồi, trắng,
viền vàng mảnh), nền trắng, nhìn thẳng — để app vẽ khung thật thay vì viền màu
phẳng. Mỗi kiểu một ảnh 1200×1200: `khung-<kieu>.jpg`.
