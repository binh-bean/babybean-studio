/**
 * BB-395 — ĐỐI CHIẾU hoá đơn với phát sinh trên app. HÀM THUẦN: không mạng, không cơ sở
 * dữ liệu, không biết Lark (chỉ biết `HoaDonChuan`). Route và màn hình cùng dùng.
 *
 * Bốn câu hỏi, bốn hàm:
 *   1. `kiemDieuKienHoaDon` — hoá đơn đủ điều kiện xác nhận chưa (≥1 phiếu thu + Còn Lại ≤ 0).
 *   2. `kiemKhachHoaDon`    — hoá đơn có đúng khách của bộ ảnh không (điều kiện CỨNG).
 *   3. `doiChieuHoaDon`     — từng mục (file chỉnh thêm, từng sản phẩm) khớp / thừa / thiếu.
 *   4. `goiYBoAnhChoHoaDon` — một khách nhiều bộ: gợi ý bộ khớp nhất (nhân viên vẫn bấm chọn).
 */
import type { HoaDonChuan } from "@/lib/hoa-don/nguon-hoa-don";

const dinhTien = (n: number) => `${Math.round(n).toLocaleString("vi-VN")} ₫`;

// ---------------------------------------------------------------------------
// 1. Điều kiện
// ---------------------------------------------------------------------------

export interface DieuKienHoaDon {
  duDieuKien: boolean;
  /** Vì sao chưa đủ (rỗng khi đủ). */
  lyDo: string[];
  /** Đủ nhưng cần để ý (vd thu dư). */
  canhBao: string[];
}

export function kiemDieuKienHoaDon(hd: HoaDonChuan): DieuKienHoaDon {
  const lyDo: string[] = [];
  const canhBao: string[] = [];
  if (hd.phieuThu.length === 0) lyDo.push(`Hoá đơn ${hd.ma} chưa có phiếu thu`);
  if (hd.conLai > 0) lyDo.push(`Hoá đơn ${hd.ma} còn phải thu ${dinhTien(hd.conLai)}`);
  if (hd.conLai < 0) canhBao.push(`Hoá đơn ${hd.ma} thu dư ${dinhTien(-hd.conLai)} — kiểm lại với kế toán`);
  return { duDieuKien: lyDo.length === 0, lyDo, canhBao };
}

// ---------------------------------------------------------------------------
// 2. Khách
// ---------------------------------------------------------------------------

export type KetQuaKhach = "khop" | "khac_khach" | "bo_chua_co_khoa" | "hoa_don_khong_co_khach";

export const CAU_KHACH: Record<Exclude<KetQuaKhach, "khop">, string> = {
  khac_khach: "Hoá đơn này của khách khác — không gán vào bộ ảnh này được.",
  bo_chua_co_khoa:
    "Khách của bộ ảnh chưa nối với khách bên Lark (tạo tay), nên app không tự kiểm được. Chỉ Admin/Quản lý ép gán được, kèm lý do.",
  hoa_don_khong_co_khach:
    "Hoá đơn chưa gắn khách hàng bên Lark, nên app không tự kiểm được. Chỉ Admin/Quản lý ép gán được, kèm lý do.",
};

/**
 * Khớp khách là điều kiện CỨNG. `khoaKhachBo` = `customers.lark_customer_key` của khách của
 * bộ; `hd.khoaKhachNguon` đã được nguồn chuẩn hoá theo cùng cách.
 */
export function kiemKhachHoaDon(hd: HoaDonChuan, khoaKhachBo: string | null | undefined): KetQuaKhach {
  const bo = (khoaKhachBo ?? "").trim();
  const hoaDon = (hd.khoaKhachNguon ?? "").trim();
  if (!bo) return "bo_chua_co_khoa";
  if (!hoaDon) return "hoa_don_khong_co_khach";
  return bo === hoaDon ? "khop" : "khac_khach";
}

/** Link Hậu Kỳ của hoá đơn trỏ sang bộ KHÁC (chỉ là gợi ý — một HĐ có thể trỏ 2 dòng). */
export function hauKyLechBo(hd: HoaDonChuan, maHauKyBo: string | null | undefined): boolean {
  if (!maHauKyBo || hd.maHauKyNguon.length === 0) return false;
  return !hd.maHauKyNguon.includes(maHauKyBo);
}

// ---------------------------------------------------------------------------
// 3. Đối chiếu
// ---------------------------------------------------------------------------

export interface SanPhamApp {
  /** `products.id` trong app. */
  productId: string;
  /** `products.lark_record_id` — khoá so với `idSanPhamNguon` của dòng hoá đơn. */
  idSanPhamNguon: string | null;
  ten: string;
  soLuong: number;
  donGia: number;
  /** Đơn giá không phải giá khách chốt (vd yêu cầu mua thêm BB-245 → "giá niêm yết"). */
  ghiChuGia?: string;
}


/**
 * BB-395 vòng 2 — một đợt mua thêm (đợt ≥ 2, `selection_rounds`) đang chờ hoặc đã xác nhận.
 * Hoá đơn trả cho `tien_anh` (+ sản phẩm) của đợt — KHÔNG nâng hạn mức cho ảnh đợt ≥ 2.
 */
export interface DotApp {
  roundId: string;
  soDot: number;
  soAnh: number;
  tienAnh: number;
  tienSanPham: number;
  /** Sản phẩm trong giỏ đợt (không kể "Edit file", đã tính vào soAnh/tienAnh). */
  sanPham: SanPhamApp[];
  daXacNhan: boolean;
}

export interface PhatSinhApp {
  /** Ảnh ĐỢT 1 khách chọn vượt hạn mức GỐC (không kể dòng hạn mức do hoá đơn). */
  fileVuot: number;
  /** "Edit file" khách mua thêm trong app ở đợt 1 / yêu cầu mua thêm (có tiền riêng). */
  fileMuaThem: number;
  giaMotFile: number;
  /** Sản phẩm mua thêm đợt 1 + yêu cầu mua thêm (không kể "Edit file"), gộp theo sản phẩm. */
  sanPham: SanPhamApp[];
  /** Đợt ≥ 2 chưa trả bằng đường khác, xếp theo số đợt (thiếu = không có đợt). */
  dot?: DotApp[];
}

export type TrangThaiMuc = "khop" | "thua" | "thieu" | "them";

export interface MucDoiChieu {
  /** "file" (đợt 1), `dot:<số đợt>`, hoặc `sp:<idSanPhamNguon|productId>`. */
  khoa: string;
  loai: "file" | "dot" | "san_pham";
  ten: string;
  trenHoaDon: number;
  khachChon: number;
  /** trenHoaDon − khachChon. */
  chenh: number;
  trangThai: TrangThaiMuc;
  /** Thiếu: số tiền app còn chờ cho phần dư (0 nếu không thiếu). */
  tienThieu: number;
  /** Có ở app → id để "Bỏ"; sản phẩm chỉ có trên hoá đơn → null. */
  productId: string | null;
  idSanPhamNguon: string | null;
  /** Mục `dot:` — id đợt. */
  roundId?: string;
  /** Ghi chú cách tính tiền thiếu (vd "giá niêm yết"). */
  ghiChu?: string;
}

export type TrangThaiDoiChieu = "khop" | "thua" | "thieu" | "hon_hop";

export interface KetQuaDoiChieu {
  trangThai: TrangThaiDoiChieu;
  muc: MucDoiChieu[];
  /** Tổng tiền thiếu (các mục khách chọn nhiều hơn hoá đơn). */
  tienThieu: number;
  /** Tổng file trên các hoá đơn. */
  fileHoaDon: number;
  /** File hoá đơn dành cho "Edit file" khách đã mua trong app (không nâng hạn mức). */
  fileChoMuaThem: number;
  /** File hoá đơn trả cho ảnh các đợt ≥ 2 đã phủ đủ (không nâng hạn mức). */
  fileChoDot: number;
  /** File hoá đơn nâng hạn mức đợt 1 (gồm phần dư khi mọi đợt đã đủ). */
  fileNangHanMuc: number;
  /** Thừa: số ảnh đã trả mà khách chưa chọn — khách (hoặc nhân viên chọn hộ) chọn tiếp. */
  fileDaTraConLai: number;
  /** Sản phẩm có trên hoá đơn mà app chưa có (hoặc có ít hơn) — app tự thêm vào bộ. */
  sanPhamThemVao: { idSanPhamNguon: string; ten: string; soLuong: number }[];
  /** Đợt ≥ 2 hoá đơn đã phủ ĐỦ (ảnh + sản phẩm) → xác nhận + đánh dấu đã thanh toán. */
  dotDaTra: { roundId: string; soDot: number }[];
  /** Đợt ≥ 2 chưa phủ đủ: số ảnh còn thiếu (để nhân viên tích bỏ ảnh của đợt). */
  dotThieu: { roundId: string; soDot: number; anhThieu: number }[];
  /** "Edit file" mua thêm đợt 1 được phủ ĐỦ → đánh dấu dòng giỏ đã trả. */
  fileMuaThemDaTra: boolean;
  /** Sản phẩm đợt 1 (theo `productId`) được phủ đủ → đánh dấu dòng giỏ đã trả. */
  sanPhamDot1DaTra: string[];
  /** Ảnh đợt 1 còn thiếu (file vượt chưa được hoá đơn phủ). */
  anhDot1Thieu: number;
}

const khoaSpApp = (s: SanPhamApp) => s.idSanPhamNguon ?? `app:${s.productId}`;

/**
 * Cộng dồn MỌI hoá đơn đã gán cho bộ rồi so với phát sinh trên app.
 * Dòng `dich_vu` (0 đồng) không đối chiếu. Dòng `file_chinh` cộng vào "File chỉnh thêm".
 *
 * Thứ tự chia (anh chốt 08/10, "đợt cũ trước"): file hoá đơn trả cho "Edit file" mua thêm đợt 1
 * → ảnh vượt hạn mức đợt 1 → từng đợt ≥ 2 theo số đợt tăng dần. Một đợt chỉ được coi là ĐÃ TRẢ
 * khi đủ CẢ ảnh lẫn sản phẩm của đợt; gặp đợt không đủ thì dừng (đợt sau không được trả trước
 * đợt trước). Phần file còn dư chỉ nâng hạn mức đợt 1 (Thừa) khi MỌI đợt đã đủ; còn đợt thiếu
 * thì phần dư đứng chờ ở mục của đợt đó (tiền vẫn nằm trong sổ, không đòi gì thêm).
 * Sản phẩm hoá đơn trả cho giỏ đợt 1 + yêu cầu mua thêm trước, rồi tới giỏ các đợt.
 */
export function doiChieuHoaDon(hoaDons: readonly HoaDonChuan[], app: PhatSinhApp): KetQuaDoiChieu {
  let fileHoaDon = 0;
  const spHd = new Map<string, { ten: string; soLuong: number }>();
  for (const hd of hoaDons) {
    for (const d of hd.dong) {
      if (d.loai === "file_chinh") fileHoaDon += Math.max(0, d.soLuong);
      else if (d.loai === "san_pham") {
        const k = d.idSanPhamNguon ?? `ten:${d.tenSanPham}`;
        const cu = spHd.get(k) ?? { ten: d.tenSanPham, soLuong: 0 };
        cu.soLuong += Math.max(0, d.soLuong);
        spHd.set(k, cu);
      }
    }
  }

  const muc: MucDoiChieu[] = [];
  const fileMuaThem = Math.max(0, Math.floor(app.fileMuaThem));
  const fileVuot = Math.max(0, Math.floor(app.fileVuot));
  const fileApp = fileMuaThem + fileVuot;
  const gia = Math.max(0, app.giaMotFile);

  // 1. Đợt 1: "Edit file" mua thêm trước, rồi ảnh vượt hạn mức.
  const fileChoMuaThem = Math.min(fileHoaDon, fileMuaThem);
  const fileChoVuot = Math.min(fileHoaDon - fileChoMuaThem, fileVuot);
  let conFile = fileHoaDon - fileChoMuaThem - fileChoVuot;

  // 2. Sản phẩm: giỏ đợt 1 + yêu cầu mua thêm trước.
  const appTheoKhoa = new Map<string, SanPhamApp & { soLuong: number }>();
  for (const s of app.sanPham) {
    const k = khoaSpApp(s);
    const cu = appTheoKhoa.get(k);
    if (cu) cu.soLuong += s.soLuong;
    else appTheoKhoa.set(k, { ...s });
  }
  const conSp = new Map<string, number>();
  for (const [k, v] of spHd) conSp.set(k, Math.max(0, v.soLuong - (appTheoKhoa.get(k)?.soLuong ?? 0)));

  // 3. Đợt ≥ 2 theo thứ tự, mỗi đợt đủ hoặc không.
  const dotDaTra: KetQuaDoiChieu["dotDaTra"] = [];
  const dotThieu: KetQuaDoiChieu["dotThieu"] = [];
  const mucDot: MucDoiChieu[] = [];
  const spChoDot = new Map<string, number>();
  let fileChoDot = 0;
  let dung = false;
  for (const dt of [...(app.dot ?? [])].sort((a, b) => a.soDot - b.soDot)) {
    const canSp = new Map<string, number>();
    for (const s of dt.sanPham) canSp.set(khoaSpApp(s), (canSp.get(khoaSpApp(s)) ?? 0) + s.soLuong);
    const duSp = [...canSp].every(([k, n]) => (conSp.get(k) ?? 0) >= n);
    const du = !dung && conFile >= dt.soAnh && duSp;
    const giaAnhDot = dt.soAnh > 0 ? dt.tienAnh / dt.soAnh : 0;
    if (du) {
      conFile -= dt.soAnh;
      fileChoDot += dt.soAnh;
      for (const [k, n] of canSp) {
        conSp.set(k, (conSp.get(k) ?? 0) - n);
        spChoDot.set(k, (spChoDot.get(k) ?? 0) + n);
      }
      dotDaTra.push({ roundId: dt.roundId, soDot: dt.soDot });
    } else {
      dung = true;
      const coFile = Math.min(conFile, dt.soAnh);
      const anhThieu = dt.soAnh - coFile;
      dotThieu.push({ roundId: dt.roundId, soDot: dt.soDot, anhThieu });
      const spThieu = duSp ? 0 : dt.tienSanPham;
      mucDot.push({
        khoa: `dot:${dt.soDot}`,
        loai: "dot",
        ten: `Đợt ${dt.soDot} · ảnh chọn thêm${dt.sanPham.length ? " + sản phẩm" : ""}`,
        trenHoaDon: coFile,
        khachChon: dt.soAnh,
        chenh: coFile - dt.soAnh,
        trangThai: "thieu",
        tienThieu: Math.round(anhThieu * giaAnhDot) + spThieu,
        productId: null,
        idSanPhamNguon: null,
        roundId: dt.roundId,
      });
      continue;
    }
    mucDot.push({
      khoa: `dot:${dt.soDot}`,
      loai: "dot",
      ten: `Đợt ${dt.soDot} · ảnh chọn thêm${dt.sanPham.length ? " + sản phẩm" : ""}`,
      trenHoaDon: dt.soAnh,
      khachChon: dt.soAnh,
      chenh: 0,
      trangThai: "khop",
      tienThieu: 0,
      productId: null,
      idSanPhamNguon: null,
      roundId: dt.roundId,
    });
  }
  // Phần file còn dư nâng hạn mức đợt 1 CHỈ khi không còn đợt nào thiếu.
  const fileDuNangHanMuc = dotThieu.length === 0 ? conFile : 0;
  const fileNangHanMuc = fileChoVuot + fileDuNangHanMuc;

  if (fileHoaDon > 0 || fileApp > 0) {
    const trenHoaDon = fileChoMuaThem + fileChoVuot + fileDuNangHanMuc;
    const chenh = trenHoaDon - fileApp;
    muc.push({
      khoa: "file",
      loai: "file",
      ten: (app.dot ?? []).length ? "File chỉnh thêm (đợt 1)" : "File chỉnh thêm",
      trenHoaDon,
      khachChon: fileApp,
      chenh,
      trangThai: chenh === 0 ? "khop" : chenh > 0 ? "thua" : "thieu",
      tienThieu: chenh < 0 ? -chenh * gia : 0,
      productId: null,
      idSanPhamNguon: null,
    });
  }
  muc.push(...mucDot);

  const sanPhamThemVao: KetQuaDoiChieu["sanPhamThemVao"] = [];
  const sanPhamDot1DaTra: string[] = [];
  const khoaSp = new Set([...spHd.keys(), ...appTheoKhoa.keys()]);
  for (const k of khoaSp) {
    const hd = spHd.get(k);
    const a = appTheoKhoa.get(k);
    // Phần hoá đơn đã dành cho giỏ các đợt ≥ 2 không tính ở đây.
    const trenHoaDon = Math.max(0, (hd?.soLuong ?? 0) - (spChoDot.get(k) ?? 0));
    const khachChon = a?.soLuong ?? 0;
    const chenh = trenHoaDon - khachChon;
    if (chenh === 0 && trenHoaDon === 0) continue;
    // Hoá đơn nhiều hơn app: app tự thêm phần còn lại vào bộ (anh chốt 08/10) → "Thêm vào".
    const trangThai: TrangThaiMuc = chenh === 0 ? "khop" : chenh > 0 ? "them" : "thieu";
    if (chenh > 0 && !k.startsWith("app:")) {
      sanPhamThemVao.push({ idSanPhamNguon: k.startsWith("ten:") ? "" : k, ten: hd?.ten ?? a?.ten ?? "", soLuong: chenh });
    }
    if (a && chenh >= 0) sanPhamDot1DaTra.push(a.productId);
    muc.push({
      khoa: `sp:${k}`,
      loai: "san_pham",
      ten: a?.ten ?? hd?.ten ?? "",
      trenHoaDon,
      khachChon,
      chenh,
      trangThai,
      tienThieu: chenh < 0 ? -chenh * Math.max(0, a?.donGia ?? 0) : 0,
      productId: a?.productId ?? null,
      idSanPhamNguon: k.startsWith("app:") || k.startsWith("ten:") ? null : k,
      ...(a?.ghiChuGia ? { ghiChu: a.ghiChuGia } : {}),
    });
  }

  const coThieu = muc.some((m) => m.trangThai === "thieu");
  const coThua = muc.some((m) => m.trangThai === "thua");
  const trangThai: TrangThaiDoiChieu = coThieu && coThua ? "hon_hop" : coThieu ? "thieu" : coThua ? "thua" : "khop";
  const fileMuc = muc.find((m) => m.khoa === "file");
  return {
    trangThai,
    muc,
    tienThieu: muc.reduce((s, m) => s + m.tienThieu, 0),
    fileHoaDon,
    fileChoMuaThem,
    fileChoDot,
    fileNangHanMuc,
    fileDaTraConLai: fileMuc && fileMuc.chenh > 0 ? fileMuc.chenh : 0,
    sanPhamThemVao: sanPhamThemVao.filter((s) => s.idSanPhamNguon !== ""),
    dotDaTra,
    dotThieu,
    fileMuaThemDaTra: fileMuaThem > 0 && fileChoMuaThem >= fileMuaThem,
    sanPhamDot1DaTra,
    anhDot1Thieu: Math.max(0, fileVuot - fileChoVuot),
  };
}

/**
 * BB-395 vòng 2 — tiền ĐỢT ≥ 2 vào "Phải thu": đợt đã xác nhận, TRỪ đợt đã trả bằng hoá đơn
 * (`selection_rounds.ma_hoa_don` có giá trị). Tiền của đợt đó nằm trong sổ theo giá HOÁ ĐƠN và
 * được cộng vào "Phải thu" qua `TienHanMucHoaDon.ghiCoNgoaiVuot` — tính `tien_anh` lần nữa là
 * đòi hai lần (kể cả khi ai đó bấm "xác nhận đợt" theo đường cũ sau đó).
 */
export function dotTinhVaoPhaiThu<T extends { trangThai: string; maHoaDon: string | null | undefined }>(dot: readonly T[]): T[] {
  return dot.filter((d) => d.trangThai === "da_xac_nhan" && !d.maHoaDon);
}

/** Chia tiền file của hoá đơn cho phần nâng hạn mức (làm tròn đồng, phần lẻ về phần mua thêm). */
export function tienFileNangHanMuc(tienFile: number, fileHoaDon: number, fileNangHanMuc: number): number {
  if (fileHoaDon <= 0 || fileNangHanMuc <= 0) return 0;
  if (fileNangHanMuc >= fileHoaDon) return tienFile;
  return Math.round((tienFile * fileNangHanMuc) / fileHoaDon);
}

/**
 * Số tiền app GHI VÀO SỔ cho một hoá đơn: tiền các dòng "Edit file" (luôn thu qua app) + tiền
 * dòng sản phẩm CHỈ KHI cờ `thu_san_pham_qua_app` bật (tắt = sản phẩm thu qua Lark, ghi vào
 * sổ app là trừ nhầm vào tiền ảnh — BB-363). Không phải tổng phiếu thu (phiếu thu gồm cả tips).
 * Vòng 2 (anh chốt): sản phẩm tính theo GIÁ TRÊN HOÁ ĐƠN — hoá đơn là cái khách đã trả.
 */
export function tienGhiSoChoHoaDon(hd: HoaDonChuan, thuSanPhamQuaApp: boolean): { tienFile: number; tienSanPham: number; tong: number } {
  let tienFile = 0;
  let tienSanPham = 0;
  for (const d of hd.dong) {
    if (d.loai === "file_chinh") tienFile += Math.max(0, d.thanhTien);
    else if (d.loai === "san_pham") tienSanPham += Math.max(0, d.thanhTien);
  }
  const sp = thuSanPhamQuaApp ? tienSanPham : 0;
  return { tienFile, tienSanPham: sp, tong: tienFile + sp };
}

/**
 * Chia số tiền cần ghi sổ lên các phiếu thu (theo thứ tự), mỗi phiếu không quá số tiền của nó.
 * Kết quả: mỗi dòng sổ mang mã phiếu thu + phương thức của phiếu. Thiếu phiếu (hiếm — hoá đơn
 * đã đủ điều kiện) thì phần dư gắn vào phiếu cuối.
 */
export interface PhanGhiSo {
  maPhieuThu: string;
  soTien: number;
  phuongThuc: "tien_mat" | "chuyen_khoan";
  /** Phương thức lạ (không phải Tiền Mặt / Chuyển Khoản): ghi "chuyen_khoan" + chữ gốc vào ghi chú. */
  phuongThucGoc?: string;
}

function phanTuPhieu(p: HoaDonChuan["phieuThu"][number], soTien: number): PhanGhiSo {
  const phan: PhanGhiSo = { maPhieuThu: p.ma, soTien, phuongThuc: p.phuongThuc === "tien_mat" ? "tien_mat" : "chuyen_khoan" };
  if (p.phuongThuc === "khac") phan.phuongThucGoc = p.phuongThucGoc || "không rõ";
  return phan;
}

/** Ghi chú dòng sổ cho một phần tiền theo phiếu thu. */
export function ghiChuDongSo(maHoaDon: string, phan: PhanGhiSo): string {
  const goc = phan.phuongThucGoc ? ` (phương thức gốc: ${phan.phuongThucGoc})` : "";
  return `Xác nhận bằng hoá đơn ${maHoaDon}${goc}`.slice(0, 500);
}

export function chiaTienTheoPhieuThu(hd: HoaDonChuan, tong: number): PhanGhiSo[] {
  const ra: PhanGhiSo[] = [];
  let con = Math.max(0, Math.round(tong));
  for (const p of hd.phieuThu) {
    if (con <= 0) break;
    const lay = Math.min(con, Math.max(0, p.soTien));
    if (lay <= 0) continue;
    ra.push(phanTuPhieu(p, lay));
    con -= lay;
  }
  const cuoi = ra.at(-1);
  if (con > 0 && cuoi) cuoi.soTien += con;
  else if (con > 0 && hd.phieuThu[0]) ra.push(phanTuPhieu(hd.phieuThu[0], con));
  return ra;
}

// ---------------------------------------------------------------------------
// 4. Gợi ý bộ ảnh (một khách nhiều bộ)
// ---------------------------------------------------------------------------

export interface BoUngVien {
  galleryId: string;
  tieuDe: string;
  khoaKhach: string | null;
  maHauKy: string | null;
  /** File phát sinh đang chờ (vượt + mua thêm). */
  fileCho: number;
  /** Sản phẩm đang chờ, theo `idSanPhamNguon` → số lượng. */
  sanPhamCho: Record<string, number>;
}

export interface GoiYBo {
  galleryId: string;
  tieuDe: string;
  diem: number;
  lyDo: string[];
}

/**
 * Chỉ bộ CÙNG KHÁCH được xếp. Ưu tiên: link Hậu Kỳ của hoá đơn trỏ đúng bộ (+100) → số file
 * chờ bằng số file hoá đơn (+50; gần hơn thì hơn) → sản phẩm chờ trùng với hoá đơn (+10 mỗi
 * sản phẩm). Trả danh sách đã xếp; `goiY` = bộ đứng đầu (nhân viên vẫn phải BẤM chọn).
 */
export function goiYBoAnhChoHoaDon(hd: HoaDonChuan, ungVien: readonly BoUngVien[]): { ds: GoiYBo[]; goiY: string | null } {
  const fileHd = hd.dong.filter((d) => d.loai === "file_chinh").reduce((s, d) => s + d.soLuong, 0);
  const spHd = new Set(hd.dong.filter((d) => d.loai === "san_pham" && d.idSanPhamNguon).map((d) => d.idSanPhamNguon as string));
  const ds: GoiYBo[] = [];
  for (const b of ungVien) {
    if (kiemKhachHoaDon(hd, b.khoaKhach) !== "khop") continue;
    let diem = 0;
    const lyDo: string[] = [];
    if (b.maHauKy && hd.maHauKyNguon.includes(b.maHauKy)) {
      diem += 100;
      lyDo.push("Hoá đơn trỏ đúng dòng Hậu Kỳ của bộ");
    }
    if (fileHd > 0 && b.fileCho === fileHd) {
      diem += 50;
      lyDo.push(`Bộ đang chờ đúng ${fileHd} file`);
    } else if (fileHd > 0 && b.fileCho > 0) {
      diem += Math.max(0, 30 - Math.abs(b.fileCho - fileHd));
      lyDo.push(`Bộ đang chờ ${b.fileCho} file (hoá đơn ${fileHd})`);
    }
    for (const id of spHd) {
      if ((b.sanPhamCho[id] ?? 0) > 0) {
        diem += 10;
        lyDo.push("Có sản phẩm trùng hoá đơn");
      }
    }
    ds.push({ galleryId: b.galleryId, tieuDe: b.tieuDe, diem, lyDo });
  }
  ds.sort((a, b) => b.diem - a.diem);
  return { ds, goiY: ds[0]?.galleryId ?? null };
}
