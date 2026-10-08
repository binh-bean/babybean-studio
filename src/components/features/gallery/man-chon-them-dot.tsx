"use client";

/**
 * Màn "Chọn thêm ảnh · Đợt N" — ba mẹ chọn thêm ảnh (và tuỳ ý thêm sản phẩm)
 * rồi chốt thành một đợt mới, KHÔNG cần xin mở lại.
 *
 * OWNER: DEV-FE. Task BB-321 — dựng theo bản vẽ anh duyệt 29/09/2026
 * (`babybean-assets/BB-321/ban-ve/1-…`, `2-…`, `3-…`), sau khi bản đầu bị bác
 * (ảnh `images/8.jpg`). Ba lý do bị bác và cách màn này tránh:
 *
 *   1. Sản phẩm bày thành lưới thẻ, mỗi thẻ một nút "Chọn ảnh" → màn này MỞ RA LÀ
 *      LƯỚI ẢNH, dùng ĐÚNG `LuoiAnh` + `PhotoLightbox` của màn chọn chính (tim,
 *      bộ lọc, xem lớn). Sản phẩm là tuỳ chọn, gấp sau MỘT nút phụ "Thêm ảnh in,
 *      khung, album" mở CỬA HÀNG ĐÃ DUYỆT (`cua-hang.tsx`, BB-293/310) — màn này
 *      không tự vẽ danh sách sản phẩm nào.
 *   2. "Edit file" bị bán như hàng → danh mục đi qua `sanPhamBanTrongDot`.
 *   3. Chữ tự mâu thuẫn → thanh đáy và hộp xác nhận đọc CÙNG MỘT object
 *      `tomTatDot(...)`. Kích thước qua `formatKichThuoc` ("10×15").
 *
 * Nháp (ảnh + giỏ) nằm ở `useDotChon` của màn chính — đóng màn này rồi mở lại
 * không mất gì. Chỉ lúc bấm "Chốt đợt N" mới có MỘT lượt gọi
 * `POST /api/g/dot-chon/chot` ghi cả ảnh lẫn sản phẩm của đợt.
 *
 * Màn này THAY cả trang (gallery-app trả nó sớm), không phải lớp phủ: `LuoiAnh`
 * cuộn ảo theo cuộn của CỬA SỔ, đặt trong một hộp cuộn riêng là mất luật hiệu
 * năng của nó (BB-131).
 */

import { dotDuocDongKhung } from "@/lib/products/khung-gan-anh-in";
import React from "react";
import { Printer } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatKichThuoc, formatSo } from "@/lib/utils/dinh-dang";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { CAU_BIET_ANH_IN_CHAM, soDotKeTiep } from "@/lib/gallery/dot-chon";
import { giuCuoi } from "@/lib/utils/giu-a";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";
import type { SanPhamCuaHang } from "@/lib/products/cau-hinh-cua-hang";
import type { PhotoPublic } from "@/types/domain";
import { vi } from "@/i18n";
import {
  cachDatTuManTreo,
  chipLocLuotChon,
  congCuLuotChon,
  datGhiChuNhap,
  ghiChuGuiKemDot,
  locAnhLuotChon,
  type LoaiLoc,
} from "@/lib/gallery/luot-chon";
import { LuoiAnh } from "./luoi-anh";
import { PhotoLightbox, type PhotoLightboxProps } from "./photo-lightbox";
import { CuaHang, type DongDaMua } from "./cua-hang";
import { SoSanhAnh } from "./so-sanh-anh";
import { BangSanPhamCuaAnh } from "./bang-san-pham-cua-anh";
import { ManTreoTuong } from "./man-treo-tuong";
import { albumXemTrongNha } from "./xem-trong-nha";
import {
  DauManLuotChon,
  demAnhTheoNhom,
  propsCongCuXemLon,
  ThanhDayLuot,
  ThanhDaySoSanh,
  useSoSanhLuotChon,
} from "./cong-cu-luot-chon";
import type { NhapDot, TrangThaiDotKhach } from "./chon-them-anh";
import {
  cumTenBe,
  dongDauManDot,
  dotKhoaCuaAnh,
  doiAnhTrongNhap,
  sanPhamBanTrongDot,
  soMonChuaCoAnhTrongGio,
  tieuDeHopChotDot,
  tomTatDot,
  type DongGioDot,
} from "./dot-chon-khach";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";
import { OLamAnhNhanh } from "./lam-anh-nhanh-khach";
import type { LamAnhNhanhKhach } from "@/lib/dich-vu/lam-anh-nhanh";

/** Máy chủ nhận tối đa 20 cho mỗi dòng (`ChotDotChonSchema`). */
const SO_LUONG_TOI_DA = 20;
const KHONG_DANG_GUI = new Set<string>();
const KHONG_GIA_DINH_THICH = new Set<string>();
// BB-400 — công cụ của lượt "dotThem" (ba mẹ chọn thêm): CÙNG hàm với đợt 1.
const NGU_CANH = "dotThem" as const;
const khongLamGi = () => {};

export interface MonCatalogue {
  productId: string;
  name: string;
  kind: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
  nhom: string | null;
  canGanAnh: boolean;
}

// BB-398 vòng 3 — khung gắn dòng in là dòng RIÊNG theo dòng in (không trùng khung lẻ / khung theo ảnh).
const khoaDong = (productId: string, photoId: string | null, ganVoiAddonId?: string | null) =>
  ganVoiAddonId ? `${productId}::gan::${ganVoiAddonId}` : `${productId}::${photoId ?? ""}`;

export function datDong(
  gio: readonly DongGioDot[],
  productId: string,
  photoId: string | null,
  soLuong: number,
  ganVoiAddonId: string | null = null,
): DongGioDot[] {
  const khoa = khoaDong(productId, photoId, ganVoiAddonId);
  const con = gio.filter((d) => khoaDong(d.productId, d.photoId, d.ganVoiAddonId) !== khoa);
  const n = Math.min(SO_LUONG_TOI_DA, Math.max(0, Math.floor(soLuong)));
  if (n <= 0) return con;
  return [...con, ganVoiAddonId ? { productId, photoId, soLuong: n, ganVoiAddonId } : { productId, photoId, soLuong: n }];
}

export function ManChonThemDot({
  photos,
  subfolders,
  tenBe,
  tenKhach,
  catalogue,
  lamAnhNhanh = null,
  dongDaLuu = [],
  tt,
  nhap,
  anhNhap,
  setNhap,
  onDong,
  onDaChot,
  onCanTaiLai,
  giaDinhThich = KHONG_GIA_DINH_THICH,
  taiAnh = null,
  chatUrl = null,
  onBao,
  xemLonBanDau = null,
  goiY = null,
}: {
  photos: PhotoPublic[];
  subfolders: string[];
  tenBe: string | null;
  tenKhach: string | null;
  catalogue: MonCatalogue[];
  /** BB-399 — "Làm ảnh nhanh" (giá Lark + số ngày, đã mua chưa). null = ẩn ô. */
  lamAnhNhanh?: LamAnhNhanhKhach | null;
  /**
   * BB-398 vòng 3 — mọi dòng mua thêm ĐÃ LƯU (mọi đợt, có `dot`). Lối "Đóng khung ảnh đã đặt
   * in" chỉ lấy tấm in đợt 1 / đợt đã xác nhận (`dotDuocDongKhung`), cùng luật máy chủ.
   */
  dongDaLuu?: Array<DongDaMua & { dot: number }>;
  tt: TrangThaiDotKhach;
  nhap: NhapDot;
  /** Ảnh nháp CÒN chọn được (đã lọc tấm khoá) — từ `useDotChon`. */
  anhNhap: string[];
  setNhap: (sua: (cu: NhapDot) => NhapDot) => void;
  onDong: () => void;
  onDaChot: (soDot: number) => void;
  /** Máy chủ báo có tấm vừa bị khoá: tải lại ảnh + trạng thái đợt. */
  onCanTaiLai: () => void;
  /** BB-400 — tấm gia đình (link mời) đã thả tim: dấu "Gia đình" + chip "Gia đình thích" như đợt 1. */
  giaDinhThich?: Set<string>;
  /** BB-400 — nút tải của màn xem lớn (bộ ảnh cho tải); null = không cho tải. Cùng thực đơn với đợt 1. */
  taiAnh?: Pick<PhotoLightboxProps, "onTaiAnh" | "menuTai"> | null;
  /** BB-400 — "Nhắn Bean" ở đầu màn, cùng chỗ với đợt 1. */
  chatUrl?: string | null;
  /** BB-400 — câu báo ngắn (vd. đã đủ 4 tấm so sánh) — màn chính hiện ở dải thông báo. */
  onBao?: (cau: string) => void;
  /** Mở thẳng màn xem lớn ở tấm thứ N của lưới (vd. vào màn đợt từ đúng một tấm). */
  xemLonBanDau?: number | null;
  /**
   * BB-400 vòng 2 — người cùng chọn / người gợi ý ở đợt N: CÙNG màn này, tim là GỢI Ý lưu
   * chung trên máy chủ (`/api/g/tim-gia-dinh`), ba mẹ thấy dấu "Gia đình thích" trên lưới
   * đợt. Không giỏ, không ghi chú, không chốt — chỉ ba mẹ chốt và trả tiền.
   */
  goiY?: { timCuaToi: Set<string>; doiTim: (photo: { id: string }) => void } | null;
}) {
  const laGoiY = goiY != null;
  const [filter, setFilter] = React.useState<LoaiLoc>("all");
  const [nhom, setNhom] = React.useState("");
  /** Màn xem lớn: chỉ số + danh sách nguồn ("loc" = đang lọc; "day" = cả bộ, mở từ màn so sánh). */
  const [xemLon, setXemLon] = React.useState<{ i: number; nguon: "loc" | "day" } | null>(
    xemLonBanDau === null ? null : { i: xemLonBanDau, nguon: "loc" },
  );
  const [moCuaHang, setMoCuaHang] = React.useState(false);
  const [presetCuaHang, setPresetCuaHang] = React.useState<{ nhom: NhomSanPham; photoId: string | null } | null>(null);
  const [treoTuongTuAnh, setTreoTuongTuAnh] = React.useState<string | null>(null);
  const [hoi, setHoi] = React.useState(false);
  const [ten, setTen] = React.useState(tenKhach ?? "");
  const [bietAnhInCham, setBietAnhInCham] = React.useState(false);
  /** BB-399 — ô làm nhanh của hộp chốt đợt (không tích sẵn). */
  const [chonLamNhanh, setChonLamNhanh] = React.useState(false);
  const laChonLamNhanh = chonLamNhanh && !!lamAnhNhanh?.coBan && !lamAnhNhanh.daMua;
  const giaLamNhanh = laChonLamNhanh ? (lamAnhNhanh?.gia ?? 0) : 0;
  const [dangGui, setDangGui] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);
  const hopRef = React.useRef<HTMLDivElement>(null);

  // Vào màn là về đầu trang: màn chính có thể đang cuộn tới giữa lưới.
  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  useBayFocusHopThoai(hoi, () => !dangGui && setHoi(false), hopRef);

  const soDot = soDotKeTiep(tt.cacDot);

  // ---- Danh mục: bỏ "Edit file", đổi sang hình dạng cửa hàng dùng ----------
  const danhMuc = React.useMemo<SanPhamCuaHang[]>(
    () =>
      sanPhamBanTrongDot(catalogue)
        .filter((sp) => sp.nhom !== null)
        .map((sp) => ({
          productId: sp.productId,
          name: sp.name,
          material: sp.material,
          size: sp.size,
          unitPrice: sp.unitPrice,
          nhom: sp.nhom as NhomSanPham,
          canGanAnh: sp.canGanAnh,
        })),
    [catalogue],
  );
  const theoMa = React.useMemo(() => new Map(danhMuc.map((sp) => [sp.productId, sp])), [danhMuc]);
  // BB-398 vòng 3 — dòng ĐÃ LƯU dùng cho lối đóng khung: dòng in của đợt 1 / đợt đã xác nhận, và
  // MỌI khung đã gắn (đếm trần "khung ≤ số in"). Dòng in của đợt còn chờ: đóng khung sau khi xác nhận.
  const dongInDuocDongKhung = React.useMemo(
    () => dongDaLuu.filter((d) => d.ganVoiAddonId || dotDuocDongKhung(d.dot, tt.cacDot)),
    [dongDaLuu, tt.cacDot],
  );
  // Giỏ chỉ giữ món CÒN bán trong đợt (nháp cũ có thể còn món nay đã ngừng / bị loại).
  const gio = React.useMemo(() => nhap.gio.filter((d) => theoMa.has(d.productId)), [nhap.gio, theoMa]);

  // ---- Khoá theo đợt + nháp → danh sách ảnh cho lưới -----------------------
  const dotKhoaTheoAnh = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const p of photos) {
      const dot = dotKhoaCuaAnh(p, tt.dotTheoAnh);
      if (dot > 0) m.set(p.id, dot);
    }
    return m;
  }, [photos, tt.dotTheoAnh]);

  const ghiChuNhap = nhap.ghiChu;
  const timGoiY = goiY?.timCuaToi ?? null;
  const dsAnh = React.useMemo(() => {
    if (timGoiY) {
      // Người gợi ý: tấm khoá theo đợt giữ nguyên; tấm khác hiện tim GỢI Ý của chính họ.
      return photos.map((p) => {
        if ((dotKhoaTheoAnh.get(p.id) ?? 0) > 0) return p;
        const mark = timGoiY.has(p.id) ? ("selected" as const) : null;
        return p.mark === mark ? p : { ...p, mark };
      });
    }
    const trongNhap = new Set(anhNhap);
    // Giữ NGUYÊN object của tấm không đổi — `TheAnh` được memo theo prop (LUẬT 2 luoi-anh).
    // BB-400 — tấm mới mang ghi chú của nháp (dấu bút trên thẻ + ô ghi chú xem lớn).
    return photos.map((p) => {
      if (!trongNhap.has(p.id) || p.mark === "selected") return p;
      const chu = ghiChuNhap?.[p.id] ?? null;
      return { ...p, mark: "selected" as const, retouchNote: chu ?? p.retouchNote ?? null };
    });
  }, [photos, anhNhap, ghiChuNhap, timGoiY, dotKhoaTheoAnh]);

  // BB-400 — cùng hàm lọc, cùng hàng chip với đợt 1.
  const dsLoc = React.useMemo(
    () => locAnhLuotChon(dsAnh, filter, nhom, giaDinhThich),
    [dsAnh, filter, nhom, giaDinhThich],
  );
  const soDaChon = dsAnh.filter((p) => p.mark === "selected").length;
  const demTheoNhom = React.useMemo(() => demAnhTheoNhom(photos), [photos]);
  const nguCanh = laGoiY ? ("goiY" as const) : NGU_CANH;
  const congCu = congCuLuotChon(nguCanh, { choPhepTai: taiAnh != null, dotThem: true });
  const chips = chipLocLuotChon(nguCanh, {
    tong: photos.length,
    daChon: soDaChon,
    giaDinhThich: congCu.giaDinhThich ? giaDinhThich.size : 0,
    khoa: false,
  });
  const soSanh = useSoSanhLuotChon(dsAnh, onBao ?? khongLamGi);

  const soSanPhamTheoAnh = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const d of gio) if (d.photoId) m.set(d.photoId, (m.get(d.photoId) ?? 0) + d.soLuong);
    return m;
  }, [gio]);

  // ---- MỘT lần tính cho mọi con số của đợt ---------------------------------
  const tom = tomTatDot({
    soAnhMoi: anhNhap.length,
    giaMoiAnh: tt.giaMoiAnh,
    gio,
    donGia: (id) => theoMa.get(id)?.unitPrice ?? 0,
  });
  const soMonChuaAnh = soMonChuaCoAnhTrongGio(gio, (id) => theoMa.get(id)?.nhom ?? null);
  const monChuaAnh = gio.filter((d) => d.photoId === null && theoMa.get(d.productId)?.nhom === "album");
  const trong = anhNhap.length === 0 && gio.length === 0;
  // Hộp xác nhận liệt kê THEO MÓN (2 tấm cùng "UV 10×15" là một dòng ×2), không theo từng tấm.
  const gioTheoMon = Array.from(
    gio
      .reduce((m, d) => m.set(d.productId, (m.get(d.productId) ?? 0) + d.soLuong), new Map<string, number>())
      .entries(),
  ).map(([productId, soLuong]) => ({ productId, soLuong, sp: theoMa.get(productId) }));
  const thieuTick = soMonChuaAnh > 0 && !bietAnhInCham;

  const doiAnh = React.useCallback(
    (photo: PhotoPublic) => {
      const dot = dotKhoaTheoAnh.get(photo.id) ?? 0;
      if (dot > 0) return;
      // BB-400 vòng 2 — người gợi ý: tim là gợi ý chung (máy chủ), không chạm nháp của ba mẹ.
      if (goiY) {
        goiY.doiTim(photo);
        return;
      }
      setNhap((cu) => ({ ...cu, anh: doiAnhTrongNhap(cu.anh, photo.id, dot) }));
    },
    [dotKhoaTheoAnh, setNhap, goiY],
  );
  const moAnh = React.useCallback((i: number) => setXemLon({ i, nguon: "loc" }), []);
  const khoaTimAnh = React.useCallback((p: PhotoPublic) => (dotKhoaTheoAnh.get(p.id) ?? 0) > 0, [dotKhoaTheoAnh]);

  /**
   * BB-400 — ghi chú cho thợ của tấm MỚI: ghi vào nháp ngay (phản hồi tức thì như tim của
   * đợt), gửi kèm lúc chốt. Tấm đã chốt đợt trước: ô ghi chú chỉ đọc (`khoaTimAnh`).
   */
  const luuGhiChu = React.useCallback(
    async (photo: PhotoPublic, chu: string): Promise<boolean> => {
      if ((dotKhoaTheoAnh.get(photo.id) ?? 0) > 0 || !anhNhap.includes(photo.id)) return false;
      setNhap((cu) => ({ ...cu, ghiChu: datGhiChuNhap(cu.ghiChu, photo.id, chu) }));
      return true;
    },
    [anhNhap, dotKhoaTheoAnh, setNhap],
  );

  const datMon = React.useCallback(
    (productId: string, photoId: string | null, soLuong: number) =>
      setNhap((cu) => ({ ...cu, gio: datDong(cu.gio, productId, photoId, soLuong) })),
    [setNhap],
  );
  const moCuaHangVoi = (preset: { nhom: NhomSanPham; photoId: string | null } | null) => {
    setXemLon(null);
    setPresetCuaHang(preset);
    setMoCuaHang(true);
  };
  const coAnhIn = danhMuc.some((sp) => sp.nhom === "anh_in");
  /** BB-400 vòng 4 — mở "Xem trên tường / bàn nhà" (chồng lên màn xem lớn, đóng là về đúng tấm). */
  const moTreo = congCu.xemTuong && coAnhIn ? (anh: { id: string }) => setTreoTuongTuAnh(anh.id) : null;
  const dsTreoDot = React.useMemo(() => {
    const daChon = dsAnh.filter((p) => p.mark === "selected");
    const tamDau = treoTuongTuAnh ? dsAnh.find((p) => p.id === treoTuongTuAnh) : undefined;
    return tamDau && !daChon.some((p) => p.id === tamDau.id) ? [tamDau, ...daChon] : daChon;
  }, [dsAnh, treoTuongTuAnh]);
  // BB-405 — nút "Xem trong nhà" trên từng ô: hàm ỔN ĐỊNH (TheAnh được memo — LUẬT 2 luoi-anh).
  const xemTrongNhaTuO = React.useCallback((p: PhotoPublic) => setTreoTuongTuAnh(p.id), []);

  async function chot() {
    if (ten.trim().length === 0 || thieuTick) return;
    setDangGui(true);
    setLoi(null);
    try {
      const res = await goiApiKhach("/api/g/dot-chon/chot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenNguoiChot: ten.trim(),
          photoIds: anhNhap,
          items: gio.map((d) => ({
            productId: d.productId,
            photoId: d.photoId,
            soLuong: d.soLuong,
            ...(d.ganVoiAddonId ? { ganVoiAddonId: d.ganVoiAddonId } : {}),
          })),
          // BB-400 — ghi chú cho thợ của tấm mới (chỉ tấm còn trong đợt).
          ghiChu: ghiChuGuiKemDot(anhNhap, nhap.ghiChu),
          ...(soMonChuaAnh > 0 ? { bietAnhInChamHon: bietAnhInCham } : {}),
          ...(laChonLamNhanh ? { lamAnhNhanh: true } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { soDot?: number };
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        setLoi(json?.error?.message ?? vi.gallery.loiBean.chotChuaDuoc);
        // Có tấm vừa bị khoá ở chỗ khác (vd. tab khác vừa chốt): làm mới để huy hiệu đúng.
        if (res.status === 409) onCanTaiLai();
        return;
      }
      setNhap(() => ({ anh: [], gio: [], ghiChu: {} }));
      setHoi(false);
      onDaChot(json?.data?.soDot ?? soDot);
    } catch {
      setLoi(vi.gallery.loiBean.khongKetNoi);
    } finally {
      setDangGui(false);
    }
  }

  const gia = dongDauManDot(tt.giaMoiAnh);
  const anhMoi = photos.filter((p) => anhNhap.includes(p.id));

  return (
    <div data-testid="man-chon-them-anh" className="min-h-[100dvh] bg-background pb-44 text-foreground lg:pb-32">
      {/* ĐẦU MÀN — MỘT dòng + hàng lọc, dính khi cuộn (cùng kiểu `#dau-luoi-anh`). */}
      <DauManLuotChon
        testIdTieuDe="dong-dau-man-dot"
        tieuDe={
          laGoiY ? (
            <>
              Gợi ý thêm ảnh cho <span className="font-display text-[16px] lg:text-[17px]">{cumTenBe(tenBe)}</span>
            </>
          ) : (
            <>
              Chọn thêm ảnh cho <span className="font-display text-[16px] lg:text-[17px]">{cumTenBe(tenBe)}</span>
              {gia && <span className="whitespace-nowrap text-muted-foreground"> · {gia}</span>}
            </>
          )
        }
        onDong={onDong}
        chips={chips}
        loc={filter}
        onLoc={setFilter}
        soSanh={soSanh}
        coSoSanh={congCu.soSanh}
        chatUrl={chatUrl}
        nhom={subfolders}
        nhomDangChon={nhom}
        onChonNhom={setNhom}
        demTheoNhom={demTheoNhom}
        tong={photos.length}
      />

      {/* LƯỚI — đúng component của màn chọn chính. Lề điện thoại 24. */}
      <section aria-label="Ảnh của buổi chụp" className="mx-auto max-w-[1600px] px-6 pt-4 lg:px-10 lg:pt-6">
        {dsLoc.length === 0 ? (
          <div className="mx-auto my-12 max-w-md rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">{vi.gallery.emptyFilter}</p>
          </div>
        ) : (
          <LuoiAnh
            photos={dsLoc}
            mutatingIds={KHONG_DANG_GUI}
            khoa={false}
            soSanPhamTheoAnh={soSanPhamTheoAnh}
            soSanhBat={soSanh.soSanhBat}
            soSanhTheoAnh={soSanh.soSanhTheoAnh}
            dotKhoaTheoAnh={dotKhoaTheoAnh}
            giaDinhThich={congCu.giaDinhThich ? giaDinhThich : undefined}
            onToggle={doiAnh}
            onOpen={moAnh}
            onToggleSoSanh={soSanh.onToggleSoSanh}
            onXemTrongNha={moTreo ? xemTrongNhaTuO : undefined}
          />
        )}
      </section>

      {/* THANH ĐÁY — MỘT câu + nút phụ (sản phẩm, tuỳ chọn) + nút chính.
          BB-400 — đang chọn tấm để so sánh: thanh so sánh THAY thanh đợt, như đợt 1. */}
      {soSanh.soSanhBat ? (
        <ThanhDaySoSanh ds={soSanh.dsSoSanh} onXem={() => soSanh.setMoSoSanh(true)} onHuy={soSanh.huySoSanh} />
      ) : laGoiY ? (
        // BB-400 vòng 2 — người gợi ý: MỘT câu, không nút chốt (chỉ ba mẹ chốt và trả tiền).
        <ThanhDayLuot
          testId="thanh-day-goi-y"
          cau={vi.gallery.goiYDotCau.replace("{n}", formatSo(goiY?.timCuaToi.size ?? 0))}
        />
      ) : (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-6 pb-[max(16px,env(safe-area-inset-bottom))] lg:pb-6">
        <div
          data-testid="thanh-day-dot"
          className="pointer-events-auto mx-auto max-w-[560px] rounded-[22px] border border-border bg-background/95 p-3 shadow-[0_14px_32px_-12px_rgba(46,42,39,0.35)] backdrop-blur-md lg:flex lg:w-fit lg:max-w-none lg:items-center lg:gap-4 lg:rounded-full lg:py-2 lg:pl-6 lg:pr-2"
        >
          <p
            data-testid="cau-tong-dot"
            aria-live="polite"
            className="pl-1.5 text-[15px] font-medium leading-snug tabular-nums lg:whitespace-nowrap lg:pl-0"
          >
            {tom.cau}
          </p>
          <span className="hidden h-[22px] w-px shrink-0 bg-border lg:block" aria-hidden="true" />
          <div className="mt-2.5 grid grid-cols-[minmax(0,1fr)_auto] gap-2 lg:mt-0 lg:flex">
            <button
              type="button"
              onClick={() => setMoCuaHang(true)}
              disabled={danhMuc.length === 0}
              className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full border border-border bg-white px-2.5 text-[13px] font-medium transition hover:bg-surface-2 disabled:opacity-40 lg:px-4"
            >
              <Printer className="hidden h-4 w-4 shrink-0 lg:block" strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">Thêm ảnh in, khung, album</span>
            </button>
            <button
              type="button"
              data-testid="nut-chot-dot"
              disabled={trong}
              onClick={() => {
                setLoi(null);
                setHoi(true);
              }}
              className="h-10 shrink-0 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40 lg:px-5"
            >
              Chốt đợt {soDot}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* SẢN PHẨM — cửa hàng đã duyệt, chạy trên giỏ của đợt (không gọi /api/g/addons). */}
      <CuaHang
        mo={moCuaHang}
        onDong={() => {
          setMoCuaHang(false);
          setPresetCuaHang(null);
        }}
        // BB-400 — "Đặt in tấm này" từ màn xem lớn mở thẳng nhóm + tấm đó (như đợt 1, BB-279).
        presetNhom={presetCuaHang?.nhom ?? null}
        presetPhotoId={presetCuaHang?.photoId ?? null}
        khoa={false}
        dangLuu={false}
        phuDe={`Tính vào đợt ${soDot}`}
        danhMuc={danhMuc}
        daMua={gio.map<DongDaMua>((d) => {
          const sp = theoMa.get(d.productId);
          return {
            id: khoaDong(d.productId, d.photoId, d.ganVoiAddonId),
            productId: d.productId,
            name: sp?.name ?? "",
            quantity: d.soLuong,
            totalPrice: (sp?.unitPrice ?? 0) * d.soLuong,
            photoId: d.photoId,
            ganVoiAddonId: d.ganVoiAddonId ?? null,
            kind: sp ? (catalogue.find((c) => c.productId === d.productId)?.kind ?? null) : null,
            material: sp?.material ?? null,
            size: sp?.size ?? null,
          };
        })}
        tongTien={tom.tienSanPham}
        anhDaChon={dsAnh.filter((p) => p.mark === "selected").map((p) => ({ id: p.id, fileName: p.fileName }))}
        tatCaAnh={photos.map((p) => ({ id: p.id, fileName: p.fileName }))}
        onMua={(productId, soLuong, photoId) =>
          setNhap((cu) => ({ ...cu, gio: datDong(cu.gio, productId, photoId, soLuong) }))
        }
        onMuaNhieu={(productId, soLuong, photoIds) =>
          setNhap((cu) => ({
            ...cu,
            gio: photoIds.reduce((g, id) => datDong(g, productId, id, soLuong), cu.gio),
          }))
        }
        // BB-398 vòng 3 — "Đóng khung ảnh đã đặt in" cho tấm in ĐÃ LƯU (đợt 1 / đợt đã xác nhận):
        // khung vào giỏ đợt này, gắn dòng in; máy chủ kiểm lại lúc chốt (`kiemKhungGanInTrongDot`).
        dongDaLuu={dongInDuocDongKhung}
        onDongKhung={(ganVoiAddonId, productId, soLuong) => {
          const dongIn = dongDaLuu.find((d) => d.id === ganVoiAddonId);
          setNhap((cu) => ({
            ...cu,
            gio: datDong(cu.gio, productId, dongIn?.photoId ?? null, soLuong, ganVoiAddonId),
          }));
        }}
      />

      {/* XEM LỚN — đúng màn xem lớn của màn chính, ĐỦ công cụ như đợt 1 (BB-400): tim, ghi
          chú, "Đặt in" theo ảnh, xem trên tường, tải; tim + ghi chú tấm đã chốt đứng yên. */}
      {xemLon !== null && (
        <PhotoLightbox
          photos={xemLon.nguon === "day" ? dsAnh : dsLoc}
          initialIndex={xemLon.i}
          tenBe={tenBe}
          onClose={() => {
            const tuSoSanh = xemLon.nguon === "day";
            setXemLon(null);
            // Mở từ màn so sánh (chạm hai lần) thì đóng xong quay lại màn so sánh — như đợt 1.
            if (tuSoSanh && soSanh.soSanhBat && soSanh.dsSoSanh.length >= 2) soSanh.setMoSoSanh(true);
          }}
          onToggleHeart={doiAnh}
          mutatingIds={KHONG_DANG_GUI}
          isLocked={false}
          khoaTimAnh={khoaTimAnh}
          {...propsCongCuXemLon(congCu, {
            luuGhiChu,
            taiAnh,
            // BB-400 vòng 4 — "Trên tường" cố định ở màn xem lớn, cả ba mẹ lẫn người gợi ý.
            xemTuong: moTreo ?? undefined,
            bangSanPham: (anh, tong) => (
                  <BangSanPhamCuaAnh
                    tong={tong}
                    anhDaChon={anh.mark === "selected"}
                    khoa={false}
                    dangLuu={false}
                    // Đợt N không có suất trong gói — chỉ sản phẩm mua thêm vào giỏ của đợt.
                    suatTrongGoi={[]}
                    albumTrongGoi={[]}
                    albumDaMua={[]}
                    donDaGui={false}
                    monMuaThem={danhMuc
                      .filter((sp) => sp.canGanAnh)
                      .map((sp) => ({
                        ...sp,
                        soLuong: gio.find((d) => d.productId === sp.productId && d.photoId === anh.id)?.soLuong ?? 0,
                      }))}
                    albumBanDuoc={danhMuc
                      .filter((sp) => sp.nhom === "album")
                      .map((sp) => ({
                        ...sp,
                        soLuong: gio.find((d) => d.productId === sp.productId && d.photoId === null)?.soLuong ?? 0,
                      }))}
                    onDatVaoGoi={khongLamGi}
                    onDatVaoAlbum={khongLamGi}
                    onDatMuaThem={(productId, soLuong) => datMon(productId, anh.id, soLuong)}
                    onXemBanAlbum={() => moCuaHangVoi({ nhom: "album", photoId: null })}
                    // BB-398 — tấm nào cũng XEM trên tường được; BB-400 vòng 4 — cùng hàm với nút cố định.
                    onXemTuong={moTreo ? () => moTreo(anh) : undefined}
                    onDatInTamNay={(nhomSp) => moCuaHangVoi({ nhom: nhomSp, photoId: anh.id })}
                  />
                ),
          })}
          dungCho={(p) => {
            const nhan: string[] = [];
            const dot = dotKhoaTheoAnh.get(p.id) ?? 0;
            if (dot > 0) nhan.push(`Đã chốt đợt ${dot}`);
            for (const d of gio) {
              if (d.photoId !== p.id) continue;
              const tenSp = formatKichThuoc(theoMa.get(d.productId)?.name ?? "");
              nhan.push(d.soLuong > 1 ? `${tenSp} ×${d.soLuong}` : tenSp);
            }
            return nhan;
          }}
        />
      )}

      {/* SO SÁNH — đúng màn so sánh của đợt 1 (BB-218); tim tấm đã chốt đứng yên. */}
      {soSanh.moSoSanh && soSanh.anhDangSoSanh.length >= 2 && (
        <SoSanhAnh
          photos={soSanh.anhDangSoSanh}
          mutatingIds={KHONG_DANG_GUI}
          isLocked={false}
          khoaTimAnh={khoaTimAnh}
          onToggleHeart={doiAnh}
          onBoKhoi={soSanh.boKhoiManSoSanh}
          onDong={() => soSanh.setMoSoSanh(false)}
          onPhongTo={(p) => {
            const i = dsAnh.findIndex((x) => x.id === p.id);
            if (i < 0) return;
            soSanh.setMoSoSanh(false);
            setXemLon({ i, nguon: "day" });
          }}
          anhDaThaTim={dsAnh.filter((p) => p.mark === "selected")}
          tatCaAnh={dsAnh}
        />
      )}

      {/* XEM TRÊN TƯỜNG NHÀ — đúng màn BB-217; món chọn ở đây vào giỏ của đợt. */}
      {treoTuongTuAnh && (
        <ManTreoTuong
          mo
          onDong={() => setTreoTuongTuAnh(null)}
          // BB-400 vòng 4 — người gợi ý XEM được; nút đặt thành "Gợi ý tấm này" (không mua thay ba mẹ).
          loiDatKhac={
            laGoiY
              ? {
                  nhan: vi.gallery.datLoiGoiY,
                  onBam: (photoId) => {
                    if (!goiY?.timCuaToi.has(photoId) && (dotKhoaTheoAnh.get(photoId) ?? 0) === 0) {
                      goiY?.doiTim({ id: photoId });
                    }
                    setTreoTuongTuAnh(null);
                  },
                }
              : null
          }
          // Cùng cách đợt 1 (BB-398): tấm đang xem đứng đầu nếu chưa chọn, rồi các tấm đã chọn.
          anh={dsTreoDot.map((p) => ({ id: p.id, fileName: p.fileName, width: p.width, height: p.height, maTepDrive: (p as { maTepDrive?: string | null }).maTepDrive ?? null }))}
          chiSoBanDau={Math.max(0, dsTreoDot.findIndex((p) => p.id === treoTuongTuAnh))}
          danhMuc={danhMuc
            .filter((sp) => sp.nhom === "anh_in" || sp.nhom === "khung")
            .map((sp) => ({
              productId: sp.productId,
              name: sp.name,
              material: sp.material,
              size: sp.size,
              unitPrice: sp.unitPrice,
              nhom: sp.nhom,
            }))}
          suatTrongGoi={[]}
          placements={[]}
          addonsDaDat={gio.map((d) => ({ productId: d.productId, photoId: d.photoId, quantity: d.soLuong }))}
          khoa={false}
          duocChon={cachDatTuManTreo({ nguCanh, trongManGio: true, khoa: false, dotMoiMo: true, moChoGiaDinh: true }) === "gio"}
          dangLuu={false}
          onDatVaoGoi={khongLamGi}
          onDatMuaThem={(photoId, productId, soLuong) => datMon(productId, photoId, soLuong)}
          // BB-405 — "Album trên bàn": cuốn vào giỏ của đợt (người gợi ý đi `loiDatKhac` ở trên).
          album={albumXemTrongNha(danhMuc, {
            nguCanh,
            trongManGio: true,
            onDat: (productId, soLuong) => datMon(productId, null, soLuong),
            // BB-405 vòng 2 — người gợi ý: không đặt album, chỉ gợi ý tấm cho ba mẹ (như màn tường).
            loiDatKhac: laGoiY
              ? {
                  nhan: vi.gallery.datLoiGoiY,
                  onBam: (photoId) => {
                    if (!goiY?.timCuaToi.has(photoId) && (dotKhoaTheoAnh.get(photoId) ?? 0) === 0) {
                      goiY?.doiTim({ id: photoId });
                    }
                    setTreoTuongTuAnh(null);
                  },
                }
              : null,
          })}
        />
      )}

      {/* HỘP XÁC NHẬN — cùng kiểu hộp chốt đợt 1 (bản vẽ 3-hop-chot-dot2). */}
      {hoi && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2a2420]/55 backdrop-blur-xs sm:items-center sm:p-4">
          <div
            ref={hopRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tieu-de-hop-chot-dot"
            data-testid="hop-xac-nhan-dot"
            className="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl animate-in slide-in-from-bottom duration-300 sm:max-w-lg sm:rounded-3xl sm:slide-in-from-bottom-4"
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />
            <div className="overflow-y-auto px-6 pb-6 pt-4 sm:p-7">
              <h3 id="tieu-de-hop-chot-dot" className="kh-h2 text-balance">
                {tieuDeHopChotDot(soDot, tenBe)}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {vi.gallery.loiBean.seXacNhanDot}
              </p>

              <div data-testid="noi-dung-xac-nhan" className="mt-5 space-y-2.5 rounded-2xl bg-surface-2 p-4 text-sm">
                {tom.soAnhMoi > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Ảnh mới</span>
                    <span className="tabular-nums">
                      <b className="font-semibold">{tom.soAnhMoi} tấm</b> · {formatCurrencyVND(tom.tienAnh)}
                    </span>
                  </div>
                )}
                {gio.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Sản phẩm</span>
                      <span className="tabular-nums">
                        <b className="font-semibold">{tom.soSanPham} món</b> · {formatCurrencyVND(tom.tienSanPham)}
                      </span>
                    </div>
                    <ul className="mt-1.5 space-y-1 pl-3 text-[13px] text-muted-foreground">
                      {gioTheoMon.map(({ productId, soLuong, sp }) => (
                        <li key={productId} className="flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {formatKichThuoc(sp?.name ?? "")} ×{soLuong}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatCurrencyVND((sp?.unitPrice ?? 0) * soLuong)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {laChonLamNhanh && (
                  <div data-testid="dong-lam-nhanh-dot" className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">{vi.gallery.lamNhanh.ten}</span>
                    <span className="tabular-nums">{formatCurrencyVND(giaLamNhanh)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5 font-semibold">
                  <span>Tổng đợt {soDot}</span>
                  <span data-testid="tong-tien-dot" className="tabular-nums">
                    {formatCurrencyVND(tom.tong + giaLamNhanh)}
                  </span>
                </div>
              </div>

              {/* BB-399 — "Làm ảnh nhanh" (không tích sẵn; đã mua → "Đã chọn", không bán lần hai). */}
              <OLamAnhNhanh thongTin={lamAnhNhanh} chon={chonLamNhanh} onChon={setChonLamNhanh} />

              {anhMoi.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Ảnh mới</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {anhMoi.slice(0, 40).map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={`/api/img/${a.id}?w=200`}
                        alt=""
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ))}
                    {anhMoi.length > 40 && (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs text-muted-foreground">
                        +{anhMoi.length - 40}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Luật 29/09: còn món in chưa có ảnh → nhắc + ô tick BẮT BUỘC (máy chủ tự kiểm lại). */}
              {soMonChuaAnh > 0 && (
                <div data-testid="nhac-in-chua-anh-dot" className="mt-4 rounded-2xl bg-[#F3E6DC] p-3.5 text-[13px] text-[#2a2420]">
                  <p className="font-medium">
                    {monChuaAnh.length === 1
                      ? vi.gallery.loiBean.nhacChuaCoAnh.replace("{ten}", formatKichThuoc(theoMa.get(monChuaAnh[0]!.productId)?.name ?? "Sản phẩm"))
                      : vi.gallery.loiBean.spInChuaCoAnh.replace("{n}", String(soMonChuaAnh))}
                  </p>
                  <label className="mt-2.5 flex items-start gap-2.5 leading-relaxed">
                    <Checkbox
                      checked={bietAnhInCham}
                      onCheckedChange={setBietAnhInCham}
                      className="mt-0.5"
                      aria-label={tt.cauDongY?.bietAnhInCham ?? CAU_BIET_ANH_IN_CHAM}
                    />
                    <span>{giuCuoi(tt.cauDongY?.bietAnhInCham ?? CAU_BIET_ANH_IN_CHAM)}</span>
                  </label>
                </div>
              )}

              <div className="mt-5">
                <label
                  htmlFor="ten-nguoi-chot-dot"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {vi.gallery.parentName}
                </label>
                <input
                  id="ten-nguoi-chot-dot"
                  name="tenNguoiChot"
                  value={ten}
                  maxLength={200}
                  onChange={(e) => setTen(e.target.value)}
                  disabled={dangGui}
                  placeholder={vi.gallery.parentNamePlaceholder}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              {loi && (
                <p role="alert" className="mt-3 text-sm text-heart">
                  {loi}
                </p>
              )}

              <div className="mt-6 flex flex-col items-end gap-2">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setHoi(false)}
                    disabled={dangGui}
                    className="h-11 rounded-full border border-border px-5 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-50"
                  >
                    Xem lại
                  </button>
                  <button
                    type="button"
                    data-testid="nut-xac-nhan-chot-dot"
                    onClick={() => void chot()}
                    disabled={dangGui || ten.trim().length === 0 || thieuTick}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                  >
                    {dangGui && <Spinner className="h-4 w-4" />}
                    Chốt đợt {soDot}
                  </button>
                </div>
                {!dangGui && thieuTick && (
                  <p data-testid="ly-do-khoa-chot-dot" className="text-xs text-muted-foreground">
                    Tích ô bên trên để chốt
                  </p>
                )}
                {!dangGui && !thieuTick && ten.trim().length === 0 && (
                  <p data-testid="ly-do-khoa-chot-dot" className="text-xs text-muted-foreground">
                    Điền tên người xác nhận để tiếp tục
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
