/**
 * Luật HIỂN THỊ của màn khách cho "đợt chọn" (BB-321) — hàm thuần, không React,
 * để phép thử đơn vị gọi đúng hàm mà màn hình dùng.
 *
 * OWNER: DEV-FE. Task BB-321 — dựng theo bản vẽ anh duyệt 29/09/2026
 * (`babybean-assets/BB-321/ban-ve/`), sau khi bản đầu bị bác vì ba lý do:
 *   1. Sản phẩm bày thành lưới thẻ → màn đợt không có danh sách sản phẩm riêng;
 *      sản phẩm đi qua cửa hàng đã duyệt (`cua-hang.tsx`), xem `sanPhamBanTrongDot`.
 *   2. "Edit file" bị bán như một sản phẩm → `sanPhamBanTrongDot` loại nó (đó là
 *      SỐ ẢNH CHỈNH của gói, không phải hàng).
 *   3. Chữ tự mâu thuẫn → MỌI con số của thanh đáy và hộp xác nhận ra từ MỘT lần
 *      gọi `tomTatDot`. Tiền tính bằng `tinhTienDot` của DEV-BE (cùng hàm route
 *      dùng để ghi tiền) — không tính lại ở đây.
 *
 * Luật tiền chủ studio chốt 29/09/2026: đợt 2 trở đi tính tiền TỪ ẢNH ĐẦU TIÊN,
 * phần gói còn trống không dùng ở đợt sau — nên câu của đợt KHÔNG có vế "trong gói".
 */

import { vi } from "@/i18n";
import { demSanPhamInChuaAnh, tinhTienDot } from "@/lib/gallery/dot-chon";
import { canGanAnh, type NhomSanPham } from "@/lib/products/nhom-san-pham";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";

// ---------------------------------------------------------------------------
// Khoá theo đợt
// ---------------------------------------------------------------------------

/**
 * Tấm này đã chốt ở đợt nào (0 = chưa thuộc đợt nào, còn chọn được).
 *
 * `mark === "selected"` là tấm đã nằm trong lượt chọn (đợt 1 hoặc đợt đang
 * chờ/đã xác nhận). Máy chủ chỉ trả `dotTheoAnh` cho đợt ≥ 2, nên tấm đã chọn
 * mà không có trong bảng là đợt 1.
 */
export function dotKhoaCuaAnh(
  anh: { id: string; mark: string | null | undefined },
  dotTheoAnh: Readonly<Record<string, number>>,
): number {
  if (anh.mark !== "selected") return 0;
  const dot = dotTheoAnh[anh.id];
  return typeof dot === "number" && dot >= 2 ? dot : 1;
}

/**
 * Bật/tắt một tấm trong nháp đợt mới. Tấm đã khoá theo đợt thì trả NGUYÊN mảng
 * cũ — ảnh đợt trước không bỏ chọn được ở đây; đổi ảnh đã chốt đi đường "Yêu cầu
 * sửa lại".
 */
export function doiAnhTrongNhap(nhap: readonly string[], photoId: string, dotKhoa: number): string[] {
  if (dotKhoa > 0) return [...nhap];
  return nhap.includes(photoId) ? nhap.filter((id) => id !== photoId) : [...nhap, photoId];
}

/** Bỏ khỏi nháp mọi tấm nay đã khoá (vd. nháp cũ trong máy, đợt vừa được xác nhận) hoặc không còn trong bộ. */
export function locNhapConChonDuoc(
  nhap: readonly string[],
  anh: ReadonlyArray<{ id: string; mark: string | null | undefined }>,
  dotTheoAnh: Readonly<Record<string, number>>,
): string[] {
  const theoId = new Map(anh.map((a) => [a.id, a]));
  const ra: string[] = [];
  for (const id of nhap) {
    const a = theoId.get(id);
    if (!a) continue;
    if (dotKhoaCuaAnh(a, dotTheoAnh) > 0) continue;
    if (!ra.includes(id)) ra.push(id);
  }
  return ra;
}

// ---------------------------------------------------------------------------
// Sản phẩm bán trong đợt
// ---------------------------------------------------------------------------

/**
 * Danh mục bày ở cửa hàng của đợt: bỏ "Edit file" (`kind = edited_photo`).
 * "Edit file ×15" là SỐ ẢNH CHỈNH của gói — tấm thêm đã là "ảnh mới" của đợt,
 * bán thêm nó như một món hàng là tính tiền hai lần cho cùng một tấm.
 */
export function sanPhamBanTrongDot<T extends { kind?: string | null; name: string }>(danhMuc: readonly T[]): T[] {
  return danhMuc.filter((sp) => sp.kind !== "edited_photo" && !/^\s*edit\s*file\b/i.test(sp.name));
}

export interface DongGioDot {
  productId: string;
  photoId: string | null;
  soLuong: number;
}

/**
 * Số món trong giỏ của đợt CẦN ảnh mà chưa có ảnh (album đặt mua, ảnh đưa vào
 * sau). Đếm bằng `demSanPhamInChuaAnh` của DEV-BE — cùng luật máy chủ dùng để đòi
 * ô tick "biết nhận ảnh chậm hơn".
 */
export function soMonChuaCoAnhTrongGio(
  gio: ReadonlyArray<DongGioDot>,
  nhomTheoMa: (productId: string) => NhomSanPham | null,
): number {
  const muaThem = gio
    .filter((d) => {
      const nhom = nhomTheoMa(d.productId);
      return nhom === "album" || canGanAnh(nhom);
    })
    .map((d) => ({ soLuong: Math.max(0, d.soLuong), daCoAnh: d.photoId !== null }));
  return demSanPhamInChuaAnh({ hangTrongGoi: [], soXepTheoHang: new Map(), muaThem });
}

// ---------------------------------------------------------------------------
// Con số của đợt
// ---------------------------------------------------------------------------

export interface TomTatDot {
  soAnhMoi: number;
  soAnhTinhTien: number;
  /** Tổng số món (cộng số lượng) trong giỏ của đợt. */
  soSanPham: number;
  tienAnh: number;
  tienSanPham: number;
  tong: number;
  /** Câu DUY NHẤT của thanh đáy, vd "3 ảnh mới · 1 sản phẩm · 130.000 ₫". */
  cau: string;
}

/**
 * Toàn bộ con số của đợt đang chọn — thanh đáy và hộp xác nhận cùng đọc object
 * này, không nơi nào tự đếm lại.
 */
export function tomTatDot(p: {
  soAnhMoi: number;
  giaMoiAnh: number;
  gio: ReadonlyArray<DongGioDot>;
  donGia: (productId: string) => number;
}): TomTatDot {
  const soSanPham = p.gio.reduce((n, d) => n + Math.max(0, d.soLuong), 0);
  const tienSanPhamTho = p.gio.reduce((t, d) => t + Math.max(0, p.donGia(d.productId)) * Math.max(0, d.soLuong), 0);
  const tien = tinhTienDot({ soAnhMoi: p.soAnhMoi, giaMoiAnh: p.giaMoiAnh, tienSanPham: tienSanPhamTho });
  const soAnhMoi = Math.max(0, p.soAnhMoi);

  let cau: string;
  if (soAnhMoi === 0 && soSanPham === 0) {
    cau = "Chưa chọn ảnh mới";
  } else {
    const phan: string[] = [];
    if (soAnhMoi > 0) phan.push(`${soAnhMoi} tấm mới`);    if (soSanPham > 0) phan.push(`${soSanPham} món`);
    phan.push(formatCurrencyVND(tien.tong));
    cau = phan.join(" · ");
  }

  return {
    soAnhMoi,
    soAnhTinhTien: tien.soAnhTinhTien,
    soSanPham,
    tienAnh: tien.tienAnh,
    tienSanPham: tien.tienSanPham,
    tong: tien.tong,
    cau,
  };
}

// ---------------------------------------------------------------------------
// Chữ
// ---------------------------------------------------------------------------

/** Phần giá của dòng đầu màn đợt: "30.000 ₫/tấm" (rỗng nếu studio chưa đặt giá; BB-358: đơn vị đếm ảnh là "tấm"). */
export function dongDauManDot(giaMoiAnh: number): string {
  return giaMoiAnh > 0 ? `${formatCurrencyVND(giaMoiAnh)}/tấm` : "";
}

/**
 * "Bé Mít" — cụm tên bé đứng GIỮA câu: không lặp chữ "Bé"; viết hoa như bìa
 * (BB-362, "Ảnh của Bé Xoài"). Thiếu tên → "bé".
 */
export function cumTenBe(tenBe: string | null | undefined): string {
  const ten = (tenBe ?? "").trim();
  if (!ten) return "bé";
  const [tuDau = "", ...conLai] = ten.split(/\s+/);
  // BB-362 (vòng 10, mục 8) — viết "Bé Mít" như bìa ("Ảnh của Bé Xoài"), không "bé Mít".
  return tuDau.toLowerCase() === "bé" ? ["Bé", ...conLai].join(" ") : `Bé ${ten}`;
}

/** Tiêu đề hộp xác nhận: "Chốt đợt 2 cho bé Mít". */
export function tieuDeHopChotDot(soDot: number, tenBe: string | null | undefined): string {
  return (tenBe ?? "").trim() ? `Chốt đợt ${soDot} cho ${cumTenBe(tenBe)}` : `Chốt đợt ${soDot}`;
}

// ---------------------------------------------------------------------------
// Hộp chốt ĐỢT 1 — hai ô tick mới (chủ studio 29/09/2026)
// ---------------------------------------------------------------------------

/** Dòng đầu khối "chọn thiếu": ≤ 12 chữ. */
export function cauConThieuTrongGoi(soThieu: number): string {
  return vi.gallery.loiBean.nhoBeanChonGiup.replace("{n}", String(soThieu));
}

export interface OTickChotDot1 {
  /** Số ảnh còn thiếu so với hạn mức (0 = đủ / chưa biết hạn mức). */
  soThieu: number;
  /**
   * Có hiện khối "nhờ studio chọn giúp" + ô tick đồng ý không. BẮT BUỘC khi hiện:
   * chủ studio chốt chọn thiếu chỉ có hai đường — "Chọn tiếp" cho đủ, hoặc tick
   * đồng ý studio chọn dùm và không đổi lại. Không có đường thứ ba.
   */
  canDongYStudioChon: boolean;
  /** Có hiện khối "sản phẩm in chưa có ảnh" + ô tick "biết nhận chậm hơn" không. */
  canBietAnhInCham: boolean;
}

/**
 * Hộp chốt đợt 1 hiện những ô tick nào — cả hai đều BẮT BUỘC khi hiện (máy chủ
 * `/api/g/submit` từ chối nếu thiếu):
 *
 *   · Chọn THIẾU so với hạn mức (đã biết hạn mức) → ô "đồng ý ảnh studio chọn dùm".
 *   · Còn sản phẩm in chưa có ảnh → ô "biết chưa chọn ảnh in thì nhận chậm hơn".
 * Số sản phẩm chưa có ảnh là số MÁY CHỦ đếm (`/api/g/dot-chon` → soSanPhamInChuaAnh).
 */
export function oTickChotDot1(p: {
  hanMuc: number | null;
  daChon: number;
  soSanPhamInChuaAnh: number;
}): OTickChotDot1 {
  const soThieu = p.hanMuc === null ? 0 : Math.max(0, p.hanMuc - Math.max(0, p.daChon));
  return {
    soThieu,
    canDongYStudioChon: soThieu > 0,
    canBietAnhInCham: p.soSanPhamInChuaAnh > 0,
  };
}

/** Đã tích đủ các ô BẮT BUỘC chưa (ô "Tôi xác nhận…" chung vẫn kiểm riêng như cũ). */
export function duOTickChotDot1(
  can: OTickChotDot1,
  daTick: { dongYStudioChon: boolean; bietAnhInCham: boolean },
): boolean {
  if (can.canDongYStudioChon && !daTick.dongYStudioChon) return false;
  if (can.canBietAnhInCham && !daTick.bietAnhInCham) return false;
  return true;
}

/** Ba cờ gửi kèm `/api/g/submit` — đúng tên trường của `SubmitSelectionSchema`. */
export function coGuiChotDot1(
  can: OTickChotDot1,
  daTick: { dongYStudioChon: boolean; bietAnhInCham: boolean },
): { nhoStudioChonThem?: boolean; dongYAnhStudioChon?: boolean; bietAnhInChamHon?: boolean } {
  return {
    // Còn thiếu: gửi cờ đồng ý (máy chủ tự ghi lời nhờ khi có cờ; `nhoStudioChonThem` gửi kèm cho rõ).
    ...(can.canDongYStudioChon ? { nhoStudioChonThem: true, dongYAnhStudioChon: daTick.dongYStudioChon } : {}),
    ...(can.canBietAnhInCham ? { bietAnhInChamHon: daTick.bietAnhInCham } : {}),
  };
}
