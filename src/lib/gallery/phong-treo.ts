/**
 * Số liệu 8 ảnh phòng cho màn "treo ảnh của con lên tường" (BB-217).
 *
 * OWNER: DEV-FE. Nguồn: `babybean-assets/BB-220/tuong-do-lai.json` — Claude
 * Opus ĐO TAY trên từng ảnh ngày 24/09/2026, sau khi phát hiện `tuong.json`
 * (tệp script tạo ảnh tự sinh ra) dùng chung một hình chữ nhật ĐOÁN
 * (x=440,y=200,rong=720) cho cả 4 ảnh dọc — tức bịa, không đo. Xem ghi chú
 * `_ghiChu` trong tệp gốc.
 *
 * KHÔNG chép lại số bằng tay lần thứ hai ở đâu khác: đổi số đo thì chỉ sửa ở
 * đây, và bản demo hôm 22/09 chủ studio từ chối ("2D đổ màu") vì không có ảnh
 * thật lẫn tỷ lệ thật — sai số ở đây là lặp lại đúng lỗi đó.
 *
 * Ảnh đã nén JPEG ~82 (giữ nguyên kích thước px) trong `public/tuong/`, cùng
 * tên với khoá bên dưới bớt đuôi `.jpg`.
 */

/** Hình chữ nhật tính bằng pixel trên chính ảnh gốc (gốc toạ độ góc trên-trái). */
export interface HinhChuNhatPx {
  x: number;
  y: number;
  rong: number;
  cao: number;
}

export type HuongSang = "trai" | "phai" | "tren";

/** Mã 4 căn phòng — cũng là tiền tố tên tệp ảnh. */
export type MaPhong = "phong-khach" | "phong-be" | "phong-ngu" | "hanh-lang";

/** Khổ ảnh: dọc cho điện thoại (4:5), ngang cho máy tính (16:9). */
export type KhoAnhPhong = "doc" | "ngang";

export interface AnhPhong {
  /** Tên tệp trong `public/tuong/`, ví dụ `phong-khach-doc.jpg`. */
  tep: string;
  rongAnhPx: number;
  caoAnhPx: number;
  /** Mảng tường trống, đo tay, đơn vị px trên chính ảnh này. */
  tuong: HinhChuNhatPx;
  /** Bao nhiêu px trên ảnh ứng với 1cm ngoài đời — suy từ vật tham chiếu sát tường. */
  pxMoiCm: number;
  mauTuong: string;
  huongSang: HuongSang;
  /**
   * Cỡ khung lớn nhất Opus ước lượng vừa mảng tường, chỉ để THAM KHẢO khi đọc
   * số liệu — không phải nguồn sự thật để ẩn/hiện cỡ trên giao diện. Nguồn
   * thật là phép tính hình học ở `khung-tren-tuong.ts` (nó tự biết cỡ nào vừa
   * cỡ nào không, kể cả khi số đo tay ở đây có sai số ±10%).
   */
  coLonNhatThamKhao: string;
}

export interface PhongTreo {
  ten: string;
  doc: AnhPhong;
  ngang: AnhPhong;
}

export const PHONG_TREO: Record<MaPhong, PhongTreo> = {
  "phong-khach": {
    ten: "Phòng khách",
    doc: {
      tep: "phong-khach-doc.jpg",
      rongAnhPx: 1600,
      caoAnhPx: 2000,
      tuong: { x: 300, y: 175, rong: 1045, cao: 1480 },
      pxMoiCm: 5.23,
      mauTuong: "#E9E0D3",
      huongSang: "trai",
      coLonNhatThamKhao: "60x90",
    },
    ngang: {
      tep: "phong-khach-ngang.jpg",
      rongAnhPx: 2400,
      caoAnhPx: 1350,
      tuong: { x: 592, y: 30, rong: 1216, cao: 774 },
      pxMoiCm: 6.08,
      mauTuong: "#E6DDD1",
      huongSang: "trai",
      coLonNhatThamKhao: "60x90",
    },
  },
  "phong-be": {
    ten: "Phòng của bé",
    doc: {
      tep: "phong-be-doc.jpg",
      rongAnhPx: 1600,
      caoAnhPx: 2000,
      tuong: { x: 290, y: 95, rong: 1032, cao: 1090 },
      pxMoiCm: 7.69,
      mauTuong: "#F3F1EE",
      huongSang: "trai",
      coLonNhatThamKhao: "60x90",
    },
    ngang: {
      tep: "phong-be-ngang.jpg",
      rongAnhPx: 2400,
      caoAnhPx: 1350,
      tuong: { x: 811, y: 20, rong: 779, cao: 738 },
      pxMoiCm: 5.99,
      mauTuong: "#EEEBE6",
      huongSang: "phai",
      coLonNhatThamKhao: "60x90",
    },
  },
  "phong-ngu": {
    ten: "Phòng ngủ ba mẹ",
    doc: {
      tep: "phong-ngu-doc.jpg",
      rongAnhPx: 1600,
      caoAnhPx: 2000,
      tuong: { x: 463, y: 225, rong: 715, cao: 905 },
      pxMoiCm: 4.21,
      mauTuong: "#DCD2C4",
      huongSang: "trai",
      coLonNhatThamKhao: "60x90",
    },
    ngang: {
      tep: "phong-ngu-ngang.jpg",
      rongAnhPx: 2400,
      caoAnhPx: 1350,
      tuong: { x: 802, y: 20, rong: 814, cao: 594 },
      pxMoiCm: 4.52,
      mauTuong: "#DDD3C5",
      huongSang: "trai",
      coLonNhatThamKhao: "60x90",
    },
  },
  "hanh-lang": {
    ten: "Sảnh vào nhà",
    doc: {
      tep: "hanh-lang-doc.jpg",
      rongAnhPx: 1600,
      caoAnhPx: 2000,
      tuong: { x: 295, y: 160, rong: 1055, cao: 425 },
      pxMoiCm: 6.96,
      mauTuong: "#EEEBE6",
      huongSang: "phai",
      // _loi trong tuong-do-lai.json: mảng tường trên bàn console chỉ cao
      // ~61cm — không đủ cho 50x75 hay 60x90. Giao diện phải tự ẩn hai cỡ đó
      // cho đúng ảnh này (khung-tren-tuong.ts tính ra "không vừa" cho cả hai).
      coLonNhatThamKhao: "40x60",
    },
    ngang: {
      tep: "hanh-lang-ngang.jpg",
      rongAnhPx: 2400,
      caoAnhPx: 1350,
      tuong: { x: 746, y: 20, rong: 908, cao: 890 },
      pxMoiCm: 5.34,
      mauTuong: "#ECE7E0",
      huongSang: "trai",
      coLonNhatThamKhao: "60x90",
    },
  },
};

export const THU_TU_PHONG: MaPhong[] = ["phong-khach", "phong-be", "phong-ngu", "hanh-lang"];
