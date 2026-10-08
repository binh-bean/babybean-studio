"use client";
import { useLopHopThoai } from "@/lib/utils/lop-hop-thoai";
import { khoaCuonTrang } from "@/lib/utils/khoa-cuon-trang";

/**
 * "Ướm ảnh của con lên tường nhà mình" — màn toàn màn hình mở từ nút
 * "Xem trên tường" trong bảng sản phẩm của màn xem ảnh lớn (BB-217).
 *
 * OWNER: DEV-FE. Chủ studio 22/09/2026, bản mẫu đầu vẽ căn phòng bằng mảng
 * màu phẳng:
 *
 *     "Giao diện phải thật đẹp và hiện đại chứ không phải 2D đổ màu như bản
 *      hôm qua."
 *
 * Ba mẹ mua ảnh treo tường khi THẤY nó trên tường, không phải khi đọc bảng
 * giá — nên ảnh phòng (BB-220, Nano Banana, đo tay tỷ lệ thật) phải tràn kín
 * màn hình và khung phải nằm ĐÚNG chỗ, đúng cỡ.
 *
 * ---------------------------------------------------------------------------
 * Toạ độ PHẦN TRĂM CỦA VÙNG HIỂN THỊ THẬT — không phải của ảnh gốc
 * ---------------------------------------------------------------------------
 * Ảnh phòng dùng `object-fit: cover` để tràn khung trên mọi tỉ lệ màn hình,
 * nghĩa là phần lớn màn hình sẽ CẮT bớt ảnh gốc (viền trên/dưới hoặc
 * trái/phải, tuỳ tỉ lệ màn so với tỉ lệ ảnh). Toạ độ đo tay trong
 * `tuong-do-lai.json` là px trên ẢNH GỐC — quy thẳng sang % của khung chứa mà
 * không trừ phần bị cắt thì khung ảnh trôi lệch trên mọi màn không đúng tỉ lệ
 * 4:5 (dọc) hay 16:9 (ngang) tuyệt đối. Hàm `quyDoiKhungHienThi` bên dưới làm
 * đúng phép toán `object-fit: cover` (scale = max theo hai chiều, trừ phần bị
 * cắt đối xứng) rồi mới đổi ra %, để component chỉ cần đặt `style={{ left,
 * top, width, height }}` bằng %.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, Info, EyeOff, Eye, ZoomIn } from "lucide-react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatKichThuoc } from "@/lib/utils/dinh-dang";
import { calculateSwipeAction, buildLightboxImageUrl } from "@/lib/utils/lightbox";
import {
  PHONG_TREO,
  THU_TU_PHONG,
  type MaPhong,
  type KhoAnhPhong,
  type AnhPhong,
} from "@/lib/gallery/phong-treo";
import {
  tinhKhungTrenTuong,
  cacCoTuDanhMuc,
  tachCoKhung,
  type CoKhungCm,
} from "@/lib/gallery/khung-tren-tuong";
import { MAU_KHUNG, MAU_KHUNG_MAC_DINH } from "@/lib/gallery/mau-khung";
import { BAN_UV, tinhAnhGiayTrenBan, vungNhinTrenAnh } from "@/lib/gallery/ban-uv";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";
import { coTheBocKhung, laChatLieuUV } from "@/lib/products/nhom-san-pham";
import { XemLonCanh } from "@/components/features/gallery/xem-lon-canh";

export interface AnhTreoTuong {
  id: string;
  fileName: string;
  width: number | null;
  height: number | null;
}

/** Một dòng danh mục bán — CÙNG hình dạng với `MonMuaThem` ở bảng sản phẩm. */
export interface MonTreoTuong {
  productId: string;
  name: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
  nhom: NhomSanPham;
}

/** Suất còn trong hợp đồng — chỉ cần tên (để đối chiếu) và tổng số lượng. */
export interface SuatTreoTuong {
  galleryItemId: string;
  name: string;
  quantity: number;
}

export interface ManTreoTuongProps {
  mo: boolean;
  onDong: () => void;
  /** Ảnh ba mẹ ĐÃ CHỌN — lướt đổi giữa chúng ngay trong màn này. */
  anh: AnhTreoTuong[];
  chiSoBanDau: number;
  /** Danh mục mua thêm, đã lọc còn hai nhóm gắn được vào ảnh: ảnh in và khung. */
  danhMuc: MonTreoTuong[];
  suatTrongGoi: SuatTreoTuong[];
  /** Suất nào đã gắn vào ảnh nào — để biết còn trống và tấm nào đang dùng suất gì. */
  placements: Array<{ photoId: string; galleryItemId: string }>;
  /** Sản phẩm mua thêm đã đặt cho ảnh nào, để nút "Thêm vào giỏ" cộng dồn đúng. */
  addonsDaDat: Array<{ productId: string; photoId: string | null; quantity: number }>;
  khoa: boolean;
  duocChon: boolean;
  dangLuu: boolean;
  onDatVaoGoi: (photoId: string, galleryItemId: string, dat: boolean) => void;
  onDatMuaThem: (photoId: string, productId: string, soLuong: number) => void;
  /**
   * BB-398 — mở từ CỬA HÀNG: chất liệu + khổ (+ khung) ba mẹ vừa chọn ở đó. Thiếu = màn
   * treo tự chọn mặc định như cũ (gói đã mua → cỡ lớn nhất vừa tường).
   */
  chatLieuBanDau?: string | null;
  coBanDau?: string | null;
  coKhungBanDau?: boolean;
  /**
   * BB-398 — "Bọc khung HQ" cho tấm in MUA THÊM: thêm tấm in rồi thêm khung GẮN đúng dòng
   * in đó (`gan_voi_addon_id`, migration 0104). Thiếu = hai dòng rời như cũ.
   */
  onDatInKemKhung?: (photoId: string, productIdIn: string, soLuongIn: number, productIdKhung: string) => void;
  /**
   * BB-400 vòng 4 — vai/trạng thái KHÔNG đặt thẳng vào giỏ ở đây (gia đình được mời, bộ đã
   * khoá, người gợi ý ở đợt N): nút chính dẫn sang LỐI MUA của vai đó với đúng tấm đang xem.
   * Thiếu = chỉ xem (một dòng giải thích như cũ).
   */
  loiDatKhac?: { nhan: string; onBam: (photoId: string) => void } | null;
}

/**
 * Tỉ lệ px-ảnh-gốc → px-hiển-thị của phép `object-fit: cover` — CÙNG một số
 * `scale` phải dùng cho mọi thứ đo bằng px trên ảnh gốc (vị trí khung, và bề
 * dày viền khung mẫu bên dưới), không thì viền khung sẽ không cùng tỉ lệ với
 * khung ảnh khi phóng to/thu nhỏ màn hình.
 */
/** BB-335 — khoảng hở giữa đáy cụm chọn phòng và mép trên khung ảnh (px màn hình). */
const KHOANG_HO_DUOI_CUM_PHONG_PX = 8;

function tiLeHienThi(containerW: number, containerH: number, anhW: number, anhH: number): number {
  if (containerW <= 0 || containerH <= 0 || anhW <= 0 || anhH <= 0) return 0;
  return Math.max(containerW / anhW, containerH / anhH);
}

function quyDoiKhungHienThi(
  containerW: number,
  containerH: number,
  anhW: number,
  anhH: number,
  hinh: { x: number; y: number; rong: number; cao: number }
): { leftPct: number; topPct: number; widthPct: number; heightPct: number } {
  if (containerW <= 0 || containerH <= 0) {
    return { leftPct: 0, topPct: 0, widthPct: 0, heightPct: 0 };
  }
  const scale = tiLeHienThi(containerW, containerH, anhW, anhH);
  const disW = anhW * scale;
  const disH = anhH * scale;
  const offsetX = (disW - containerW) / 2;
  const offsetY = (disH - containerH) / 2;
  const leftPx = hinh.x * scale - offsetX;
  const topPx = hinh.y * scale - offsetY;
  return {
    leftPct: (leftPx / containerW) * 100,
    topPct: (topPx / containerH) * 100,
    widthPct: ((hinh.rong * scale) / containerW) * 100,
    heightPct: ((hinh.cao * scale) / containerH) * 100,
  };
}

const TEN_CHAT_LIEU: Record<string, string> = {
  Gỗ: "Gỗ",
  // BB-339 — "Cavas/Kim tuyến" trên Lark là ảnh in KIM TUYẾN (không phải canvas).
  "Cavas/Kim tuyến": "Kim Tuyến",
  "Tráng gương": "Tráng gương",
  "Thủy tinh": "Thủy tinh",
  "Mica HD": "Mica HD",
  // BB-358 (anh 02/10) — tên cho khách chỉ là "UV" (dữ liệu giữ nguyên).
  UV: "UV",
};

/**
 * BB-243 — mô tả chất liệu dài, gấp sau nút "i" (không hiện mặc định). Ép
 * kiểu `Record<string, string>` (không `as any`) để đọc được bằng khoá động
 * — nguồn chữ vẫn ở `src/i18n/vi.ts` như đề bài yêu cầu, đây chỉ là một biến
 * tham chiếu cùng dữ liệu với chỉ số [string] hợp lệ về kiểu.
 */
const MO_TA_CHAT_LIEU: Record<string, string> = vi.gallery.treoTuong.moTaChatLieu;

/**
 * Mỗi chất liệu một lớp CSS thuần — không ảnh, không thư viện.
 *
 * BB-339 (chủ studio 01/10/2026, ảnh b4865942): thực tế MỌI chất liệu đều in
 * TRÀN VIỀN, KHÔNG KHUNG, KHÔNG BO GÓC. Bản cũ vẽ viền gỗ dày, viền bạc… như
 * khung treo tường — gây hiểu nhầm. Nay không còn padding/viền nền nào: tấm ảnh
 * phủ kín khối, góc vuông; chỉ giữ một nét mép 1px để tách tấm ảnh khỏi tường.
 * Khung CHỈ được vẽ khi ba mẹ chọn thêm khung (`coKhung`, xem JSX).
 */
function lopChatLieu(chatLieu: string | null): React.CSSProperties & { className: string } {
  const lop = (className: string): React.CSSProperties & { className: string } => ({
    className,
    padding: 0,
    background: "transparent",
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,.10)",
  });
  switch (chatLieu) {
    case "Gỗ":
      return lop("vien-go");
    case "Cavas/Kim tuyến":
      return lop("vien-kimtuyen");
    case "Tráng gương":
      return lop("vien-guong");
    case "Thủy tinh":
      return lop("vien-thuytinh");
    case "Mica HD":
      return lop("vien-mica");
    default:
      return lop("vien-uv");
  }
}

/** BB-339 — ánh lấp lánh nhẹ của chất liệu Kim Tuyến (thay vân vải canvas cũ). */
const ANH_KIM_TUYEN =
  "radial-gradient(circle at 20% 30%, rgba(255,255,255,.22) 0 1px, transparent 2px), radial-gradient(circle at 70% 60%, rgba(255,255,255,.18) 0 1px, transparent 2px), radial-gradient(circle at 45% 80%, rgba(255,255,255,.16) 0 1px, transparent 2px)";

const BONG_THEO_HUONG: Record<AnhPhong["huongSang"], string> = {
  // Sáng từ trái → bóng đổ chếch phải-dưới. Sáng từ phải → chếch trái-dưới.
  // Sáng từ trên → bóng gọn ngay dưới, gần như đối xứng.
  trai: "10px 16px 28px rgba(20,14,8,.42), -3px -3px 8px rgba(255,255,255,.05)",
  phai: "-10px 16px 28px rgba(20,14,8,.42), 3px -3px 8px rgba(255,255,255,.05)",
  tren: "0px 14px 24px rgba(20,14,8,.4)",
};

/** BB-365 — lề trắng của tấm ảnh giấy UV (ảnh in có lề mỏng), theo cm thật. */
const LE_ANH_GIAY_CM = 0.4;
/** BB-365 — bảng điều khiển máy tính (`md:w-[360px]`) + khoảng hở 16px. */
const BANG_MAY_TINH_PX = 376;

/**
 * BB-365 — bóng của tấm ảnh giấy NẰM PHẲNG trên bàn: nắng từ cửa sổ phía trên
 * ảnh nên bóng đổ xuống dưới, ngắn và mềm (giấy sát mặt bàn), tính theo cm
 * thật × px-màn-hình-mỗi-cm để ảnh to thì bóng to theo, không phải số cố định.
 */
function bongAnhGiay(pxManHinhMoiCm: number): string {
  const s = pxManHinhMoiCm;
  return [
    `0 ${(0.45 * s).toFixed(1)}px ${(1.1 * s).toFixed(1)}px -${(0.15 * s).toFixed(1)}px rgba(70,45,20,.38)`,
    `0 ${(0.08 * s).toFixed(1)}px ${(0.18 * s).toFixed(1)}px rgba(70,45,20,.30)`,
  ].join(", ");
}

export function ManTreoTuong({
  mo,
  onDong,
  anh,
  chiSoBanDau,
  danhMuc,
  suatTrongGoi,
  placements,
  addonsDaDat,
  khoa,
  duocChon,
  dangLuu,
  onDatVaoGoi,
  onDatMuaThem,
  chatLieuBanDau = null,
  coBanDau = null,
  coKhungBanDau = false,
  onDatInKemKhung,
  loiDatKhac = null,
}: ManTreoTuongProps) {
  const [chiSo, setChiSo] = useState(chiSoBanDau);
  const [maPhong, setMaPhong] = useState<MaPhong>("phong-khach");
  // BB-398 — mở từ cửa hàng: bắt đầu ĐÚNG chất liệu/khổ đã chọn ở đó (khổ không vừa tường
  // phòng đang xem thì hiệu ứng "cỡ vừa" bên dưới tự đổi sang cỡ vừa, như mọi lần đổi phòng).
  const [chatLieu, setChatLieu] = useState<string | null>(chatLieuBanDau);
  // BB-293 mục #4 — báo cáo chấm độc lập: khởi tạo cứng "40x60" từng khiến
  // hiệu ứng chọn mặc định-lớn-nhất bên dưới KHÔNG chạy nếu "40x60" TÌNH CỜ
  // đã là một cỡ hợp lệ (`coVua.includes(co)` đúng ngay từ đầu) — dù danh
  // mục có cỡ lớn hơn 40×60 cũng vừa tường. Bắt đầu từ rỗng để hiệu ứng mặc
  // định (ưu tiên gói đã mua, rồi tới cỡ lớn nhất đang bán) luôn tự chạy lúc
  // mở màn.
  const [co, setCo] = useState<CoKhungCm>(coBanDau ?? "");
  const [coKhung, setCoKhung] = useState(coKhungBanDau && coTheBocKhung(chatLieuBanDau));
  // BB-358 (anh 02/10) — UV là ảnh giấy: không bọc khung. Đổi sang UV thì bỏ khung đang bật.
  useEffect(() => {
    if (!coTheBocKhung(chatLieu)) setCoKhung(false);
  }, [chatLieu]);
  const [maMauKhung, setMaMauKhung] = useState(MAU_KHUNG_MAC_DINH.ma);
  const [manRong, setManRong] = useState(false);

  // BB-243 — bảng điều khiển gọn: ẩn được để xem trọn tường; chi tiết (mô tả
  // chất liệu, câu "chỉ để tham khảo") gấp sau nút "i"; xem lớn tấm của bé.
  const [banAn, setBanAn] = useState(false);
  const [chiTietMo, setChiTietMo] = useState(false);
  const [xemLon, setXemLon] = useState(false);
  // BB-378 — bảng điện thoại: thấp (mặc định, ≤30vh) / cao (kéo lên); `keoBang` = độ lệch khi đang kéo.
  const [bangCao, setBangCao] = useState(false);
  const [keoBang, setKeoBang] = useState<number | null>(null);
  const keoBatDau = useRef<number | null>(null);

  const mauKhungDaChon = useMemo(
    () => MAU_KHUNG.find((m) => m.ma === maMauKhung) ?? MAU_KHUNG_MAC_DINH,
    [maMauKhung]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  // BB-335 — cụm chọn phòng (nổi trên ảnh phòng): đo mép DƯỚI của nó, tính từ
  // mép trên ảnh phòng, để khung ảnh không chờm lên (xem phongDeTinhKhung).
  const cumPhongRef = useRef<HTMLDivElement | null>(null);
  const [khungRef, setKhungRef] = useState({ w: 0, h: 0, mepTren: 0 });
  const chamBatDau = useRef<{ x: number; y: number } | null>(null);

  // BB-365 — cảnh bàn UV: khung chứa ảnh bàn (trên điện thoại chừa đáy cho
  // bảng) + câu "UV in trên giấy ảnh…" nổi phía trên (đo mép dưới để ảnh của
  // bé không nằm dưới chữ). UV là ảnh giấy: không treo tường, không khung.
  const laUv = laChatLieuUV(chatLieu);
  const canhBanRef = useRef<HTMLDivElement | null>(null);
  const loiBeanRef = useRef<HTMLParagraphElement | null>(null);
  const [canhBanDo, setCanhBanDo] = useState({ w: 0, h: 0, cheTren: 0 });

  // Reset về ảnh vừa mở mỗi lần bấm "Xem trên tường" từ một tấm khác — và gấp
  // lại chi tiết/xem lớn, hiện lại bảng, để không mang trạng thái ẩn/mở của
  // lần xem trước sang lần mở mới.
  useEffect(() => {
    if (mo) {
      setChiSo(chiSoBanDau);
      setBanAn(false);
      setChiTietMo(false);
      setXemLon(false);
      setBangCao(false);
    }
  }, [mo, chiSoBanDau]);

  useEffect(() => {
    if (!mo) return;
    const doMan = () => setManRong(window.innerWidth >= 768);
    doMan();
    window.addEventListener("resize", doMan);
    return () => window.removeEventListener("resize", doMan);
  }, [mo]);

  useEffect(() => {
    if (!mo) return;
    const el = containerRef.current;
    if (!el) return;
    const doLai = () => {
      const cum = cumPhongRef.current;
      const mepTren = cum
        ? Math.max(0, cum.getBoundingClientRect().bottom - el.getBoundingClientRect().top + KHOANG_HO_DUOI_CUM_PHONG_PX)
        : 0;
      setKhungRef({ w: el.clientWidth, h: el.clientHeight, mepTren });
    };
    doLai();
    const ro = new ResizeObserver(doLai);
    ro.observe(el);
    if (cumPhongRef.current) ro.observe(cumPhongRef.current);
    return () => ro.disconnect();
  }, [mo]);

  useEffect(() => {
    if (!mo || !laUv) return;
    const el = canhBanRef.current;
    if (!el) return;
    const doLai = () => {
      const loi = loiBeanRef.current;
      const cheTren = loi
        ? Math.max(0, loi.getBoundingClientRect().bottom - el.getBoundingClientRect().top + KHOANG_HO_DUOI_CUM_PHONG_PX)
        : 0;
      setCanhBanDo({ w: el.clientWidth, h: el.clientHeight, cheTren });
    };
    doLai();
    const ro = new ResizeObserver(doLai);
    ro.observe(el);
    if (loiBeanRef.current) ro.observe(loiBeanRef.current);
    return () => ro.disconnect();
  }, [mo, laUv]);

  // Esc đóng ĐÚNG MỘT LỚP — bắt ở pha capture và chặn lan, vì màn xem lớn
  // (PhotoLightbox) nằm ngay dưới cũng nghe Esc: không chặn thì một lần bấm
  // đóng luôn cả hai lớp. Lớp "xem lớn tấm của bé" (BB-243) mở TRÊN màn tường
  // này nên Esc phải đóng nó trước, giống cách photo-lightbox.tsx tự đóng lớp
  // con (tamMo) trước khi đóng cả màn.
  // BB-398 vòng 2 — màn treo là một LỚP: mở đè cửa hàng thì cửa hàng không nhận Esc/Tab.
  const laLopTren = useLopHopThoai(mo);
  useEffect(() => {
    if (!mo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Có lớp khác đè lên màn treo (hiếm) thì để lớp đó xử lý.
      if (!laLopTren()) return;
      e.stopImmediatePropagation();
      if (xemLon) {
        setXemLon(false);
        return;
      }
      onDong();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mo, onDong, xemLon, laLopTren]);

  // Khoá cuộn trang nền — màn này chiếm toàn màn hình.
  useEffect(() => {
    if (!mo) return;
    // BB-329 — khoá CÓ ĐẾM (khoa-cuon-trang.ts): màn này mở CHỒNG lên màn xem lớn.
    return khoaCuonTrang();
  }, [mo]);

  const anhDangXem = anh[chiSo] ?? anh[0] ?? null;

  // Chất liệu đầu tiên trong danh mục "ảnh in" — chọn sẵn để khung hiện ngay,
  // ba mẹ không phải tự bấm mới thấy được gì.
  const monAnhIn = useMemo(() => danhMuc.filter((m) => m.nhom === "anh_in"), [danhMuc]);
  const monKhung = useMemo(() => danhMuc.filter((m) => m.nhom === "khung"), [danhMuc]);
  const dsChatLieu = useMemo(
    () => Array.from(new Set(monAnhIn.map((m) => m.material).filter((m): m is string => !!m))),
    [monAnhIn]
  );

  /**
   * Ảnh in CÓ SẴN trong gói (khớp tên với suất hợp đồng) — mở màn là thấy
   * ngay đúng tấm ba mẹ sẽ nhận, không phải một chất liệu/cỡ ngẫu nhiên đầu
   * danh mục rồi tự dò lại.
   */
  const monTrongGoi = useMemo(
    () => monAnhIn.find((m) => m.material && m.size && suatTrongGoi.some((s) => s.name === m.name)) ?? null,
    [monAnhIn, suatTrongGoi]
  );

  const kho: KhoAnhPhong = manRong ? "ngang" : "doc";
  const phong = PHONG_TREO[maPhong][kho];

  /**
   * BB-296 mục #3 — báo cáo chấm độc lập lần 3: trên điện thoại, khung nằm ở
   * y≈500–600px, phần lớn bị bảng điều khiển (`max-h-[30vh]` dính đáy màn,
   * xem JSX bên dưới) che khuất. Luật 2/3 của `tinhKhungTrenTuong` đặt khung
   * SÁT ĐÁY mảng tường trống (`tuong.cao` đo trên ảnh phòng GỐC) — không biết
   * gì về bảng nổi phía trên nó ở màn hình THẬT. Trừ bớt chiều cao bảng (quy
   * đổi ngược từ px container về px ảnh gốc qua đúng `scale` của
   * `object-fit: cover`) khỏi `tuong.cao` TRƯỚC khi tính khung — khung tự lùi
   * lên nằm trong phần tường còn lại phía trên bảng. Chỉ áp dụng trên điện
   * thoại (bảng máy tính là cột dọc bên phải, không che theo chiều cao).
   */
  const TY_LE_CHIEU_CAO_BANG_DIEN_THOAI = 0.3; // khớp `max-h-[30vh]` trong JSX
  /*
    BB-329 mục 3 — chủ studio 30/09/2026 (iPhone, ảnh 1ebf1731/ce4da593/
    7269b908): phòng ngủ khung ảnh bị đẩy lên sát trần đè cả đèn; phòng thứ
    tư (sảnh) KHÔNG hiện ảnh. Gốc lỗi: bản BB-296 trừ NGUYÊN chiều cao bảng
    (30% màn) khỏi mảng tường bất kể đáy tường có thật sự nằm dưới bảng hay
    không — và trừ cả khi ba mẹ đã ẩn bảng ("Hiện bảng"). Trên iPhone (màn dọc
    cao) đáy tường phòng ngủ/sảnh nằm TRÊN mép bảng, nên phép trừ chỉ làm mảng
    tường hụt oan ~600px ảnh gốc: khung bị đẩy lên đỉnh tường, và ở sảnh không
    còn cỡ nào của chất liệu đang chọn vừa → không vẽ khung.
    Nay chỉ CẮT phần tường thật sự nằm dưới mép trên của bảng (quy đổi đúng
    phép `object-fit: cover`), và không cắt gì khi bảng đang ẩn.
  */
  /*
    BB-335 — MÉP TRÊN, cùng cách với mép dưới: trên điện thoại cụm chọn phòng
    nổi ở top-16 đè lên phần trên của ảnh phòng. Hạ ngưỡng giá (BB-335) làm
    danh mục có thêm khổ lớn (120×180, 100×150…), và luật "cỡ lớn nhất vừa
    tường" chọn đúng khổ lớn đó → khung chờm lên cụm chọn phòng (e2e bb-329
    mục 3, "Phòng của bé"). Nay cắt phần tường nằm TRÊN mép dưới của cụm phòng
    (đo thật bằng getBoundingClientRect, quy đổi đúng phép `object-fit: cover`)
    trước khi tính khung — `macDinhTuToanDanhMuc`/`coVua` tự chọn cỡ lớn nhất
    VỪA phần tường còn lại. Cắt cả khi bảng đang ẩn: cụm phòng luôn hiện.
  */
  const phongDeTinhKhung = useMemo(() => {
    if (manRong || khungRef.h === 0) return phong;
    const scale = tiLeHienThi(khungRef.w, khungRef.h, phong.rongAnhPx, phong.caoAnhPx);
    if (scale <= 0) return phong;
    const offsetY = (phong.caoAnhPx * scale - khungRef.h) / 2;
    let tuong = phong.tuong;
    if (khungRef.mepTren > 0) {
      const mepCumPhongGoc = (khungRef.mepTren + offsetY) / scale;
      if (tuong.y < mepCumPhongGoc) {
        const day = tuong.y + tuong.cao;
        tuong = { ...tuong, y: mepCumPhongGoc, cao: Math.max(0, day - mepCumPhongGoc) };
      }
    }
    if (!banAn) {
      const mepBangGoc = (khungRef.h * (1 - TY_LE_CHIEU_CAO_BANG_DIEN_THOAI) + offsetY) / scale;
      const dayTuong = tuong.y + tuong.cao;
      if (dayTuong > mepBangGoc) tuong = { ...tuong, cao: Math.max(0, mepBangGoc - tuong.y) };
    }
    return tuong === phong.tuong ? phong : { ...phong, tuong };
  }, [phong, manRong, banAn, khungRef]);

  // Hướng khung theo TẤM ẢNH CỦA BÉ (dọc/ngang), không theo khổ ảnh phòng —
  // đúng đề bài "ảnh dọc 40×60 = rộng 40 cao 60".
  const huongKhung: "doc" | "ngang" =
    anhDangXem?.width && anhDangXem?.height && anhDangXem.height >= anhDangXem.width ? "doc" : "ngang";

  /**
   * BB-293 vòng 2 mục #4/#10 — vòng 1 chỉ chọn CỠ lớn nhất trong đúng CHẤT
   * LIỆU đã lỡ chọn sẵn (chất liệu đầu tiên theo thứ tự danh mục). Ca thật
   * bắt được lỗi: "UV" đứng đầu danh mục nhưng chỉ bán tới 20×30, trong khi
   * "Gỗ" cùng bộ ảnh có tới 60×90 — mặc định vẫn ra khung nhỏ, gần như vô
   * hình trên tường (`test-results/bb-293/4-treo-tuong-dt.png`, chụp trước
   * khi vá). Nay gộp CHẤT LIỆU + CỠ vào MỘT phép chọn: xét mọi tổ hợp
   * (material, size) của TOÀN BỘ ảnh in đang bán, chỉ giữ tổ hợp vừa tường,
   * ưu tiên diện tích ≥ 40×60, chọn tổ hợp lớn nhất — không phụ thuộc nó
   * thuộc chất liệu nào.
   */
  const macDinhTuToanDanhMuc = useMemo(() => {
    const NGUONG_DIEN_TICH = 40 * 60;
    const ungVien: Array<{ material: string; size: string; dienTich: number }> = [];
    for (const m of monAnhIn) {
      if (!m.material || !m.size) continue;
      const k = tachCoKhung(m.size);
      if (!k) continue;
      const fit = tinhKhungTrenTuong(phongDeTinhKhung, m.size, huongKhung, coKhung, mauKhungDaChon.vienCm);
      if (!fit.vua) continue;
      ungVien.push({ material: m.material, size: m.size, dienTich: k.canhNgan * k.canhDai });
    }
    if (ungVien.length === 0) return null;
    const duLon = ungVien.filter((u) => u.dienTich >= NGUONG_DIEN_TICH);
    const nguon = duLon.length > 0 ? duLon : ungVien;
    let lonNhat = nguon[0]!;
    for (const u of nguon) if (u.dienTich > lonNhat.dienTich) lonNhat = u;
    return lonNhat;
  }, [monAnhIn, phongDeTinhKhung, huongKhung, coKhung, mauKhungDaChon]);

  useEffect(() => {
    if (chatLieu !== null) return;
    if (monTrongGoi?.material && monTrongGoi.size) {
      setChatLieu(monTrongGoi.material);
      setCo(monTrongGoi.size);
      return;
    }
    if (macDinhTuToanDanhMuc) {
      setChatLieu(macDinhTuToanDanhMuc.material);
      setCo(macDinhTuToanDanhMuc.size);
      return;
    }
    const dau = dsChatLieu[0];
    if (dau) setChatLieu(dau);
  }, [chatLieu, dsChatLieu, monTrongGoi, macDinhTuToanDanhMuc]);

  // Chỉ hiện cỡ nào THẬT SỰ có bán VÀ vừa mảng tường của đúng phòng+khổ đang
  // xem — quét lại mỗi khi đổi phòng/khổ màn hình, không chỉ lúc mở màn.
  const coCoBan = useMemo(
    () =>
      cacCoTuDanhMuc(monAnhIn.filter((m) => m.material === chatLieu).map((m) => m.size)),
    [monAnhIn, chatLieu]
  );
  // BB-365 — UV không treo tường: cỡ nào vừa MẶT BÀN (không ra khỏi bàn, không
  // che bình hoa/hộp ảnh) thì hiện, không xét mảng tường của phòng đang chọn.
  const canhBan = BAN_UV[kho];
  const coVua = useMemo(
    () =>
      coCoBan.filter((c) =>
        laUv
          ? tinhAnhGiayTrenBan(canhBan, c, huongKhung).vua
          : tinhKhungTrenTuong(phongDeTinhKhung, c, huongKhung, coKhung, mauKhungDaChon.vienCm).vua
      ),
    [coCoBan, laUv, canhBan, phongDeTinhKhung, huongKhung, coKhung, mauKhungDaChon]
  );

  /**
   * BB-293 mục #4/#10 — báo cáo chấm độc lập: mặc định là cỡ NHỎ NHẤT vừa
   * tường (`coVua[0]`, danh sách sắp xếp nhỏ→lớn) — điện thoại đầu tiên gặp
   * 10×15, gần như không thấy khung trên tường. LUAT-DOT-8: mặc định phải là
   * cỡ LỚN NHẤT hợp lý CÓ TRONG DANH MỤC ĐANG BÁN (không bịa cỡ), ưu tiên
   * ≥ 40×60; không có cỡ nào ≥ 40×60 thì lấy cỡ lớn nhất đang bán và vừa
   * tường. Không đổi luật "vừa tường" (vẫn chỉ chọn trong `coVua`) — chỉ đổi
   * PHẦN TỬ NÀO trong đó được chọn làm mặc định.
   */
  const coMacDinhTuDanhMuc = useMemo(() => {
    if (coVua.length === 0) return null;
    const dienTich = (c: CoKhungCm) => {
      const k = tachCoKhung(c);
      return k ? k.canhNgan * k.canhDai : 0;
    };
    const NGUONG_DIEN_TICH = 40 * 60;
    const duLon = coVua.filter((c) => dienTich(c) >= NGUONG_DIEN_TICH);
    const nguon = duLon.length > 0 ? duLon : coVua;
    // `coVua` đã sắp nhỏ→lớn (kế thừa từ `cacCoTuDanhMuc`) — lớn nhất là phần tử cuối.
    return nguon[nguon.length - 1] ?? null;
  }, [coVua]);

  useEffect(() => {
    if (coMacDinhTuDanhMuc && !coVua.includes(co)) setCo(coMacDinhTuDanhMuc);
  }, [coVua, co, coMacDinhTuDanhMuc]);

  // BB-329 mục 3 — đổi sang phòng mà chất liệu ĐANG CHỌN không có cỡ nào vừa
  // tường (vd Thuỷ tinh nhỏ nhất 35×50 ở sảnh) thì trước đây không vẽ khung
  // nào cả, ba mẹ thấy bức tường trống. Nay chuyển sang tổ hợp chất liệu + cỡ
  // lớn nhất vừa tường của đúng phòng này (cùng luật mặc định lúc mở màn).
  useEffect(() => {
    if (chatLieu === null || coVua.length > 0 || !macDinhTuToanDanhMuc) return;
    setChatLieu(macDinhTuToanDanhMuc.material);
    setCo(macDinhTuToanDanhMuc.size);
  }, [chatLieu, coVua, macDinhTuToanDanhMuc]);

  const ketQuaKhung = useMemo(
    () => tinhKhungTrenTuong(phongDeTinhKhung, co, huongKhung, coKhung, mauKhungDaChon.vienCm),
    [phongDeTinhKhung, co, huongKhung, coKhung, mauKhungDaChon]
  );

  const viTriHienThi = useMemo(() => {
    if (!ketQuaKhung.vua || khungRef.w === 0) return null;
    return quyDoiKhungHienThi(khungRef.w, khungRef.h, phong.rongAnhPx, phong.caoAnhPx, ketQuaKhung.hinh);
  }, [ketQuaKhung, khungRef, phong]);

  /**
   * BB-365 — tấm ảnh giấy UV trên bàn: cm × pxMoiCm của ảnh bàn (đo tay ở
   * `ban-uv.ts`), quy đổi sang % khung chứa bằng CÙNG phép `object-fit: cover`
   * của ảnh phòng. Chỉ đặt trong phần bàn ba mẹ nhìn thấy: trừ dải chữ nổi phía
   * trên, và trên máy tính trừ cột bảng bên phải khi bảng đang mở (trên điện
   * thoại khung chứa đã chừa đáy cho bảng).
   */
  const anhGiay = useMemo(() => {
    if (!laUv || canhBanDo.w === 0) return null;
    const vungNhin = vungNhinTrenAnh(canhBanDo.w, canhBanDo.h, canhBan.rongAnhPx, canhBan.caoAnhPx, {
      tren: canhBanDo.cheTren,
      phai: manRong && !banAn ? BANG_MAY_TINH_PX : 0,
    });
    const kq = tinhAnhGiayTrenBan(canhBan, co, huongKhung, vungNhin);
    if (!kq.vua) return null;
    const scale = tiLeHienThi(canhBanDo.w, canhBanDo.h, canhBan.rongAnhPx, canhBan.caoAnhPx);
    return {
      ...quyDoiKhungHienThi(canhBanDo.w, canhBanDo.h, canhBan.rongAnhPx, canhBan.caoAnhPx, kq.hinh),
      gocXoayDo: kq.gocXoayDo,
      /** BB-378 — vị trí trên ảnh bàn GỐC (px), cho cảnh xem lớn. */
      hinhGoc: kq.hinh,
      pxManHinhMoiCm: canhBan.pxMoiCm * scale,
      rongPx: kq.hinh.rong * scale,
    };
  }, [laUv, canhBanDo, canhBan, co, huongKhung, manRong, banAn]);

  // Bề dày viền khung mẫu QUY ĐỔI ĐÚNG TỈ LỆ hiển thị — cùng `scale` với vị trí
  // khung ở trên, không thì viền phình to/nhỏ sai khi đổi cỡ màn hình.
  const vienKhungPx = useMemo(() => {
    if (khungRef.w === 0) return 0;
    const scale = tiLeHienThi(khungRef.w, khungRef.h, phong.rongAnhPx, phong.caoAnhPx);
    return mauKhungDaChon.vienCm * phong.pxMoiCm * scale;
  }, [khungRef, phong, mauKhungDaChon]);

  const sanPhamAnh = useMemo(
    () => monAnhIn.find((m) => m.material === chatLieu && m.size === co) ?? null,
    [monAnhIn, chatLieu, co]
  );
  const sanPhamKhung = useMemo(
    () => monKhung.find((m) => m.size === co) ?? null,
    [monKhung, co]
  );

  const timSuatVua = useCallback(
    (ten: string | undefined, photoId: string) => {
      if (!ten) return null;
      const suat = suatTrongGoi.find((s) => s.name === ten);
      if (!suat) return null;
      const daDat = placements.filter((p) => p.galleryItemId === suat.galleryItemId).length;
      const coAnhNay = placements.some(
        (p) => p.galleryItemId === suat.galleryItemId && p.photoId === photoId
      );
      return coAnhNay || daDat < suat.quantity ? suat : null;
    },
    [suatTrongGoi, placements]
  );

  const photoIdHienTai = anhDangXem?.id ?? "";
  const suatAnhVua = timSuatVua(sanPhamAnh?.name, photoIdHienTai);
  const suatKhungVua = coKhung ? timSuatVua(sanPhamKhung?.name, photoIdHienTai) : null;

  const giaAnh = suatAnhVua ? 0 : (sanPhamAnh?.unitPrice ?? 0);
  const giaKhung = coKhung ? (suatKhungVua ? 0 : (sanPhamKhung?.unitPrice ?? 0)) : 0;
  const tongGia = giaAnh + giaKhung;

  const soLuongDaDat = useCallback(
    (productId: string, photoId: string) =>
      addonsDaDat
        .filter((a) => a.productId === productId && a.photoId === photoId)
        .reduce((n, a) => n + a.quantity, 0),
    [addonsDaDat]
  );

  const xemDuocThoi = khoa || !duocChon;

  const themVaoDon = useCallback(() => {
    if (xemDuocThoi || !sanPhamAnh || !anhDangXem) return;
    // BB-398 — tấm in MUA THÊM + "Bọc khung HQ" (khung cũng mua thêm): một lượt ghi
    // in rồi khung GẮN đúng dòng in đó, thay vì hai dòng rời chỉ chung ảnh.
    if (!suatAnhVua && coKhung && sanPhamKhung && !suatKhungVua && onDatInKemKhung) {
      onDatInKemKhung(
        anhDangXem.id,
        sanPhamAnh.productId,
        soLuongDaDat(sanPhamAnh.productId, anhDangXem.id) + 1,
        sanPhamKhung.productId,
      );
      return;
    }
    if (suatAnhVua) {
      onDatVaoGoi(anhDangXem.id, suatAnhVua.galleryItemId, true);
    } else {
      onDatMuaThem(anhDangXem.id, sanPhamAnh.productId, soLuongDaDat(sanPhamAnh.productId, anhDangXem.id) + 1);
    }
    if (coKhung && sanPhamKhung) {
      if (suatKhungVua) {
        onDatVaoGoi(anhDangXem.id, suatKhungVua.galleryItemId, true);
      } else {
        onDatMuaThem(
          anhDangXem.id,
          sanPhamKhung.productId,
          soLuongDaDat(sanPhamKhung.productId, anhDangXem.id) + 1
        );
      }
    }
  }, [
    xemDuocThoi,
    sanPhamAnh,
    anhDangXem,
    suatAnhVua,
    coKhung,
    sanPhamKhung,
    suatKhungVua,
    onDatVaoGoi,
    onDatMuaThem,
    onDatInKemKhung,
    soLuongDaDat,
  ]);

  const lui = useCallback(() => setChiSo((i) => (i > 0 ? i - 1 : i)), []);
  const toi = useCallback(() => setChiSo((i) => (i < anh.length - 1 ? i + 1 : i)), [anh.length]);

  if (!mo || !anhDangXem) return null;

  // BB-358 (anh 02/10) — UV là ảnh giấy: KHÔNG BAO GIỜ treo lên tường, không khung.
  // BB-365: nằm trên ảnh chụp thật mặt bàn, to nhỏ theo cỡ (xem `anhGiay`).
  const laUvKhongKhung = laUv;
  const tenChatLieu = sanPhamAnh ? (TEN_CHAT_LIEU[sanPhamAnh.material ?? ""] ?? sanPhamAnh.material) : null;
  const dongTomTat = [tenChatLieu, sanPhamAnh?.size ? `${formatKichThuoc(sanPhamAnh.size)} cm` : null, coKhung && sanPhamKhung ? "Khung HQ" : null]
    .filter(Boolean)
    .join(" · ");
  const caHaiTrongGoi = !!suatAnhVua && (!coKhung || !!suatKhungVua);

  /** BB-378 — kéo tay cầm của bảng (điện thoại): lên = mở cao, xuống = thu thấp / ẩn. */
  const keoXong = (dy: number) => {
    if (dy < -36) setBangCao(true);
    else if (dy > 36) {
      if (bangCao) setBangCao(false);
      else setBanAn(true);
    } else if (Math.abs(dy) < 6) setBangCao((v) => !v);
    setKeoBang(null);
    keoBatDau.current = null;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Xem ảnh trên tường"
      className="fixed inset-0 z-[60] overflow-hidden bg-black"
    >
      {/*
        ẢNH PHÒNG TRÀN MÀN HÌNH (BB-243 — "nhìn từ góc ba mẹ: ảnh phòng + tấm
        của bé là chính, chữ là phụ"). Bảng điều khiển bên dưới không còn là
        một cột riêng đẩy ảnh hẹp lại — nó ĐÈ LÊN ảnh bằng absolute + backdrop
        blur, và ẩn được hẳn để xem trọn tường.
      */}
      <div
        ref={containerRef}
        className="absolute inset-0 select-none overflow-hidden"
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (!t) return;
          chamBatDau.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const bd = chamBatDau.current;
          const t = e.changedTouches[0];
          if (!bd || !t) return;
          const huong = calculateSwipeAction(t.clientX - bd.x, t.clientY - bd.y);
          if (huong === "next") toi();
          if (huong === "prev") lui();
          chamBatDau.current = null;
        }}
      >
        {/*
          BB-365 (anh 04/10) — UV là ẢNH GIẤY: ướm lên ảnh chụp thật "bàn gỗ cạnh
          cửa sổ" (album gài ảnh, hộp ảnh gia đình, vài tấm ảnh rời), tấm của bé
          nằm trên bàn như một tấm ảnh in có lề trắng, to nhỏ ĐÚNG theo cỡ UV ba
          mẹ chọn (cm × pxMoiCm — `ban-uv.ts`), giống cách ảnh in lên tường.
          Trên điện thoại khung ảnh bàn chừa đáy cho bảng (30vh) để thấy trọn
          mặt bàn; ẩn bảng thì tràn màn hình như ảnh phòng.
        */}
        {laUvKhongKhung && (
          <div
            ref={canhBanRef}
            data-testid="nen-ban-uv"
            // Như ảnh phòng: chạm nền ẩn/hiện bảng, không hiện bàn tay (tests/unit/con-tro-ban-tay.test.ts).
            data-con-tro="mac-dinh"
            className="absolute inset-x-0 top-0 overflow-hidden bg-[#e9dcc8]"
            style={{ bottom: !manRong && !banAn ? `${TY_LE_CHIEU_CAO_BANG_DIEN_THOAI * 100}vh` : 0 }}
            onClick={() => setBanAn((v) => !v)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={canhBan.tep}
              src={`/tuong/${canhBan.tep}`}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 h-full w-full object-cover"
              draggable={false}
            />
            {anhGiay && sanPhamAnh && (
              <div
                data-testid="uv-anh-giay"
                data-co={co}
                role="button"
                tabIndex={0}
                aria-label={vi.gallery.treoTuong.xemLonAnhBe}
                onClick={(e) => {
                  e.stopPropagation();
                  setXemLon(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setXemLon(true);
                  }
                }}
                className="absolute origin-center cursor-pointer transition-all duration-300 ease-out"
                style={{
                  left: `${anhGiay.leftPct}%`,
                  top: `${anhGiay.topPct}%`,
                  width: `${anhGiay.widthPct}%`,
                  height: `${anhGiay.heightPct}%`,
                  transform: `rotate(${anhGiay.gocXoayDo}deg)`,
                }}
              >
                <AnhGiayUv anh={anhDangXem} pxManHinhMoiCm={anhGiay.pxManHinhMoiCm} />
                {anhGiay.rongPx >= 96 && (
                  <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-sm">
                    <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={phong.tep}
          hidden={laUvKhongKhung}
          src={`/tuong/${phong.tep}`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          draggable={false}
          // BB-243: chạm vào ẢNH PHÒNG (không phải khung ảnh của bé) ẩn/hiện
          // bảng điều khiển — để ba mẹ xem trọn tường. Cố tình không hiện bàn
          // tay ở đây: phần lớn màn hình là ảnh phòng, hiện bàn tay trên toàn
          // bộ ảnh sẽ nói sai rằng chạm vào đâu cũng "bấm được một nút".
          // Xem tests/unit/con-tro-ban-tay.test.ts.
          data-con-tro="mac-dinh"
          onClick={() => setBanAn((v) => !v)}
        />

        {/*
          BB-339/BB-358 — câu giải thích UV là ảnh giấy, nổi trên phần rèm cửa
          (chỗ của cụm chọn phòng, vốn ẩn khi UV). Mép dưới của nó được đo để
          tấm ảnh của bé không nằm dưới chữ (xem `canhBanDo.cheTren`).
        */}
        {laUvKhongKhung && (
          <div className="pointer-events-none absolute inset-x-0 top-16 z-20 flex justify-center px-4 md:top-4 md:pr-[376px]">
            <p
              ref={loiBeanRef}
              data-testid="uv-loi-bean"
              className="max-w-[480px] text-balance rounded-full bg-white/70 px-4 py-2 text-center text-[13px] leading-snug text-[#2e2a27] shadow-[0_2px_10px_-4px_rgba(46,42,39,.25)] backdrop-blur-md"
            >
              {vi.gallery.treoTuong.uvLaAnhGiay}
            </p>
          </div>
        )}

        {viTriHienThi && sanPhamAnh && !laUvKhongKhung && (
          <div
            role="button"
            tabIndex={0}
            aria-label={vi.gallery.treoTuong.xemLonAnhBe}
            data-testid="khung-tren-tuong"
            onClick={() => setXemLon(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setXemLon(true);
              }
            }}
            className="absolute origin-center cursor-pointer transition-all duration-300 ease-out"
            style={{
              left: `${viTriHienThi.leftPct}%`,
              top: `${viTriHienThi.topPct}%`,
              width: `${viTriHienThi.widthPct}%`,
              height: `${viTriHienThi.heightPct}%`,
              boxShadow: BONG_THEO_HUONG[phong.huongSang],
            }}
          >
            <KhungAnhBe
              anh={anhDangXem}
              chatLieu={chatLieu}
              coKhung={coKhung}
              mauKhung={mauKhungDaChon}
              vienPx={vienKhungPx}
              coIconPhong
            />
          </div>
        )}

        {/*
          BB-339 — dòng nhỏ luôn hiện. BB-378: rời khỏi bảng (bảng chỉ còn chất
          liệu · cỡ · giá), nằm mờ ở góc cảnh, ngay trên mép bảng.
        */}
        <p
          data-testid="tham-khao-demo"
          className="pointer-events-none absolute left-3 z-[5] rounded-full bg-black/30 px-2.5 py-1 text-[11px] text-white/90 backdrop-blur-sm md:bottom-3"
          style={{ bottom: manRong ? undefined : banAn ? 12 : `calc(${TY_LE_CHIEU_CAO_BANG_DIEN_THOAI * 100}vh + 8px)` }}
        >
          {vi.gallery.treoTuong.thamKhaoDemo}
        </p>

        {/*
          Mũi tên lướt, nút đóng/ẩn bảng, thẻ chọn phòng — TẤT CẢ đều z-20,
          CAO HƠN bảng điều khiển (z-10, xem bên dưới). Từ khi bảng chuyển
          sang ĐÈ LÊN ảnh (BB-243) thay vì đứng cạnh, cột phải của bảng trên
          máy tính rộng 300px trùng đúng vùng các nút này — thiếu z-20 thì
          bảng che mất, bấm không trúng (đã tự bắt lỗi này bằng Playwright:
          "Ẩn bảng" bị `<h2>` của bảng chặn pointer-events).
        */}
        {/* Mũi tên lướt — chỉ hiện khi có nhiều hơn một tấm đã chọn. */}
        {anh.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Tấm trước"
              onClick={lui}
              disabled={chiSo === 0}
              className="absolute left-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 disabled:opacity-0 md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Tấm sau"
              onClick={toi}
              disabled={chiSo === anh.length - 1}
              className={cn(
                "absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 disabled:opacity-0 md:flex",
                // BB-293 mục #10 — bảng đang mở (chưa ẩn) thì lùi nút ra khỏi vùng bảng.
                !banAn && "md:right-[376px]",
              )}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          {/* BB-243 — "Ẩn bảng": xem trọn tường không bị bảng che. Luôn nổi
              trên ảnh (kể cả khi bảng đang ẩn) để bấm lại được ngay. */}
          <button
            type="button"
            onClick={() => setBanAn((v) => !v)}
            aria-pressed={banAn}
            className="flex h-10 items-center gap-1.5 rounded-full bg-black/40 px-3 text-xs font-medium text-white backdrop-blur-sm transition hover:bg-black/55"
          >
            {banAn ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {banAn ? vi.gallery.treoTuong.hienBang : vi.gallery.treoTuong.anBang}
          </button>
          <button
            type="button"
            onClick={onDong}
            aria-label="Đóng"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/*
          4 phòng — thẻ nhỏ chọn ảnh nền. BB-293 mục #4: điện thoại đẩy cụm
          phòng xuống một hàng riêng (top-16), dưới hàng "Ẩn bảng"/"Đóng".
        */}
        <div
          ref={cumPhongRef}
          // BB-358 — UV không treo tường: không bày ảnh phòng nên ẩn cụm chọn phòng.
          hidden={laUvKhongKhung}
          className="absolute left-1/2 top-16 z-20 flex -translate-x-1/2 gap-2 rounded-full bg-black/35 p-1.5 backdrop-blur-sm sm:top-4"
        >
          {THU_TU_PHONG.map((ma) => (
            <button
              key={ma}
              type="button"
              onClick={() => setMaPhong(ma)}
              className={[
                "h-9 w-9 overflow-hidden rounded-full border-2 transition",
                ma === maPhong ? "border-white" : "border-transparent opacity-70 hover:opacity-100",
              ].join(" ")}
              aria-label={PHONG_TREO[ma].ten}
              title={PHONG_TREO[ma].ten}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/tuong/${PHONG_TREO[ma][kho].tep}`}
                alt=""
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>
      </div>

      {/*
        BẢNG ĐIỀU KHIỂN — BB-243 (đè lên ảnh, ẩn được) → BB-378 (anh: "text quá
        nhiều. Text gọn và làm hiệu ứng mờ đi, hãy nhìn từ góc khách hàng"):
         · Chỉ còn chất liệu · cỡ · giá + nút chính. Mô tả chất liệu, câu tham
           khảo khung, tách giá ảnh/khung gấp sau "Chi tiết".
         · Nền KÍNH MỜ (trong hơn, blur mạnh) — thấy cảnh phía sau.
         · Điện thoại: bảng KÉO LÊN/XUỐNG bằng tay cầm, mặc định THẤP (≤30vh —
           khung trên tường đã được tính để nằm trên mép này); kéo xuống khi
           đang thấp là ẩn hẳn. Máy tính: thẻ nổi bên phải, cùng bề ngang cũ.
      */}
      <div
        data-testid="bang-treo-tuong"
        data-muc={bangCao ? "cao" : "thap"}
        className={cn(
          "giao-dien-khach absolute z-10 flex flex-col overflow-hidden border border-white/55 text-bb-fg",
          "shadow-[0_-8px_30px_rgba(0,0,0,.18)] backdrop-blur-xl backdrop-saturate-150",
          keoBang === null && "transition-[transform,max-height] duration-300 ease-out",
          "inset-x-0 bottom-0 rounded-t-3xl border-b-0",
          bangCao ? "max-h-[72vh] min-h-[52vh]" : "max-h-[30vh]",
          // md:top-[72px]: chừa chỗ cho nút "Ẩn bảng"/"Đóng" (z-20, top-4 right-4)
          // — thiếu khoảng này, hàng đầu của bảng nằm ĐÚNG dưới hai nút đó.
          // Rộng 344 + lề 16 = 360 (khớp BANG_MAY_TINH_PX 376 = 360 + 16 khe).
          "md:bottom-auto md:left-auto md:right-4 md:top-[72px] md:max-h-[calc(100dvh-88px)] md:w-[344px] md:rounded-3xl md:border-b",
          // "invisible" (không chỉ translate) để Playwright và trình đọc màn hình
          // đều coi đây là ĐÃ ẨN thật.
          banAn && "invisible translate-y-full md:translate-x-[calc(100%+16px)] md:translate-y-0",
        )}
        style={{
          // Nền kính TRONG: đặt inline — luật `.giao-dien-khach { background }` (tokens.css,
          // ngoài @layer) đè mọi lớp bg-* của Tailwind, bảng cũ vì thế đặc kín, không mờ.
          backgroundColor: "rgba(251,247,242,0.66)",
          ...(keoBang === null
            ? {}
            : keoBang > 0
              ? { transform: `translateY(${keoBang}px)` }
              : { maxHeight: `calc(${bangCao ? 72 : 30}vh + ${-keoBang}px)` }),
        }}
        aria-hidden={banAn}
      >
        {/* Tay cầm kéo — chỉ điện thoại. */}
        <button
          type="button"
          data-testid="tay-cam-bang"
          aria-label={bangCao ? vi.gallery.treoTuong.thuBang : vi.gallery.treoTuong.keoBang}
          aria-expanded={bangCao}
          className="flex h-6 w-full shrink-0 touch-none items-center justify-center md:hidden"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
            keoBatDau.current = e.clientY;
            setKeoBang(0);
          }}
          onPointerMove={(e) => {
            if (keoBatDau.current === null) return;
            setKeoBang(e.clientY - keoBatDau.current);
          }}
          onPointerUp={(e) => {
            if (keoBatDau.current === null) return;
            keoXong(e.clientY - keoBatDau.current);
          }}
          onPointerCancel={() => {
            setKeoBang(null);
            keoBatDau.current = null;
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setBangCao((v) => !v);
            }
          }}
        >
          <span className="h-1 w-10 rounded-full bg-bb-fg/25" />
        </button>

        <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-4 pb-3 md:px-5 md:pt-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 text-[14px] font-medium leading-tight text-bb-fg">
              {laUvKhongKhung ? vi.gallery.treoTuong.tieuDeAnhGiay : "Treo lên tường nhà mình"}
            </h2>
            <button
              type="button"
              onClick={() => {
                setChiTietMo((v) => !v);
                if (!chiTietMo) setBangCao(true);
              }}
              aria-pressed={chiTietMo}
              aria-label={chiTietMo ? vi.gallery.treoTuong.anChiTiet : vi.gallery.treoTuong.chiTiet}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition",
                chiTietMo ? "bg-bb-fg text-bb-bg" : "bg-white/55 text-bb-fg-muted hover:bg-white/80",
              )}
            >
              <Info className="h-3 w-3" strokeWidth={2} />
              {vi.gallery.treoTuong.chiTiet}
            </button>
          </div>

          {dsChatLieu.length > 0 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {dsChatLieu.map((cl) => (
                <button
                  key={cl}
                  type="button"
                  onClick={() => setChatLieu(cl)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition",
                    cl === chatLieu ? "bg-bb-fg text-bb-bg" : "bg-white/55 text-bb-fg hover:bg-white/85",
                  )}
                >
                  {TEN_CHAT_LIEU[cl] ?? cl}
                </button>
              ))}
            </div>
          )}

          {coVua.length > 0 && (
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
              {coVua.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCo(c)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium tabular-nums transition",
                    c === co ? "bg-bb-fg text-bb-bg" : "bg-white/55 text-bb-fg hover:bg-white/85",
                  )}
                >
                  {formatKichThuoc(c)} cm
                </button>
              ))}
            </div>
          )}

          {coVua.length === 0 && <p className="text-xs text-bb-fg-muted">{vi.gallery.loiBean.phongChuaVuaTuong}</p>}

          {/* BB-358 — Khung Hàn Quốc chỉ bọc chất liệu đã cán (Gỗ, Tráng gương…); UV là ảnh giấy, không có khung. */}
          {monKhung.length > 0 && coTheBocKhung(chatLieu) && (
            <div className="space-y-2">
              <label
                data-testid="tuy-chon-boc-khung"
                className="flex cursor-pointer items-center justify-between rounded-2xl bg-white/55 px-3.5 py-2"
              >
                <span className="text-xs font-medium text-bb-fg">Bọc khung HQ</span>
                <input
                  type="checkbox"
                  checked={coKhung}
                  onChange={(e) => setCoKhung(e.target.checked)}
                  className="h-4 w-4 accent-bb-fg"
                />
              </label>

              {coKhung && (
                <div className="flex flex-wrap gap-2">
                  {MAU_KHUNG.map((m) => (
                    <button
                      key={m.ma}
                      type="button"
                      aria-pressed={m.ma === maMauKhung}
                      onClick={() => setMaMauKhung(m.ma)}
                      className={[
                        "flex flex-col items-center gap-1 rounded-xl p-1 transition",
                        m.ma === maMauKhung ? "bg-bb-fg/10 ring-2 ring-bb-fg" : "ring-1 ring-transparent hover:bg-white/55",
                      ].join(" ")}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.anh} alt="" className="h-8 w-8 rounded-md object-cover" draggable={false} />
                      <span className="text-[11px] font-medium text-bb-fg">{m.ten}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Chi tiết gấp lại: mô tả chất liệu, câu tham khảo khung, giá tách ảnh/khung. */}
          {chiTietMo && (
            <div data-testid="chi-tiet-treo-tuong" className="space-y-1.5 rounded-2xl bg-white/50 p-3 text-[11.5px] leading-relaxed text-bb-fg-muted">
              {chatLieu && MO_TA_CHAT_LIEU[chatLieu] && <p>{MO_TA_CHAT_LIEU[chatLieu]}</p>}
              {coKhung && <p>{vi.gallery.treoTuong.thamKhaoKhung}</p>}
              {sanPhamAnh && (
                <p className="flex justify-between gap-2 pt-1 text-bb-fg">
                  <span>{tenChatLieu}{sanPhamAnh.size ? ` · ${formatKichThuoc(sanPhamAnh.size)}` : ""}</span>
                  <span className="tabular-nums">{suatAnhVua ? vi.gallery.treoTuong.trongGoi : formatCurrencyVND(giaAnh)}</span>
                </p>
              )}
              {coKhung && sanPhamKhung && (
                <p className="flex justify-between gap-2 text-bb-fg">
                  <span>Khung HQ</span>
                  <span className="tabular-nums">{suatKhungVua ? vi.gallery.treoTuong.trongGoi : formatCurrencyVND(giaKhung)}</span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Chân bảng — luôn thấy: chất liệu · cỡ · giá + nút chính. */}
        <div className="flex shrink-0 items-center gap-3 border-t border-white/60 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] md:px-5 md:pb-4">
          <div className="min-w-0 flex-1">
            <p data-testid="tom-tat-treo-tuong" className="truncate text-[12px] text-bb-fg-muted">
              {dongTomTat || "—"}
            </p>
            {/* BB-305 — giá tiền: không font-display, có tabular-nums. */}
            <p className="text-[18px] font-medium leading-tight tabular-nums text-bb-fg">
              {caHaiTrongGoi ? vi.gallery.treoTuong.trongGoi : formatCurrencyVND(tongGia)}
            </p>
          </div>
          {!xemDuocThoi ? (
            <button
              type="button"
              disabled={!sanPhamAnh || dangLuu}
              onClick={themVaoDon}
              className="h-11 shrink-0 rounded-full bg-bb-fg px-5 text-sm font-medium text-bb-bg transition hover:opacity-90 disabled:opacity-40"
            >
              {dangLuu ? "Đang lưu…" : "Thêm vào giỏ"}
            </button>
          ) : loiDatKhac && anhDangXem ? (
            // BB-400 vòng 4 — xem được mà không đặt thẳng được: dẫn sang lối mua của vai.
            <button
              type="button"
              data-testid="nut-dat-loi-khac-treo-tuong"
              onClick={() => loiDatKhac.onBam(anhDangXem.id)}
              className="h-11 shrink-0 rounded-full bg-bb-fg px-5 text-sm font-medium text-bb-bg transition hover:opacity-90"
            >
              {loiDatKhac.nhan}
            </button>
          ) : (
            <p className="max-w-[55%] text-right text-[11.5px] leading-snug text-bb-fg-muted">
              {vi.gallery.loiBean.dangChiXemChuaDat}
            </p>
          )}
        </div>
      </div>

      {/*
        BB-378 — chạm khung/tấm giấy → xem lớn CẢ CẢNH (ảnh nền đầy đủ + ảnh của
        bé đúng chỗ, đúng cỡ), phóng/kéo được. Toạ độ khung lấy thẳng từ phép
        tính trên ảnh GỐC (`ketQuaKhung.hinh` / `anhGiay.hinhGoc`), nên khớp
        đúng vị trí ba mẹ vừa thấy, chỉ không bị cắt `cover`.
      */}
      {xemLon && (
        <XemLonCanh
          rong={laUvKhongKhung ? canhBan.rongAnhPx : phong.rongAnhPx}
          cao={laUvKhongKhung ? canhBan.caoAnhPx : phong.caoAnhPx}
          onDong={() => setXemLon(false)}
        >
          {(rongSanKhau) => {
            if (laUvKhongKhung) {
              const tl = rongSanKhau / canhBan.rongAnhPx;
              const h = anhGiay?.hinhGoc;
              return (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/tuong/${canhBan.tep}`} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
                  {h && (
                    <div
                      data-testid="xem-lon-canh-anh-be"
                      className="absolute"
                      style={{
                        left: `${(h.x / canhBan.rongAnhPx) * 100}%`,
                        top: `${(h.y / canhBan.caoAnhPx) * 100}%`,
                        width: `${(h.rong / canhBan.rongAnhPx) * 100}%`,
                        height: `${(h.cao / canhBan.caoAnhPx) * 100}%`,
                        transform: `rotate(${anhGiay?.gocXoayDo ?? 0}deg)`,
                      }}
                    >
                      <AnhGiayUv anh={anhDangXem} pxManHinhMoiCm={canhBan.pxMoiCm * tl} doPhanGiai={2048} />
                    </div>
                  )}
                </>
              );
            }
            const tl = rongSanKhau / phong.rongAnhPx;
            const h = ketQuaKhung.vua ? ketQuaKhung.hinh : null;
            return (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/tuong/${phong.tep}`} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
                {h && (
                  <div
                    data-testid="xem-lon-canh-anh-be"
                    className="absolute"
                    style={{
                      left: `${(h.x / phong.rongAnhPx) * 100}%`,
                      top: `${(h.y / phong.caoAnhPx) * 100}%`,
                      width: `${(h.rong / phong.rongAnhPx) * 100}%`,
                      height: `${(h.cao / phong.caoAnhPx) * 100}%`,
                      boxShadow: BONG_THEO_HUONG[phong.huongSang],
                    }}
                  >
                    <KhungAnhBe
                      anh={anhDangXem}
                      chatLieu={chatLieu}
                      coKhung={coKhung}
                      mauKhung={mauKhungDaChon}
                      vienPx={mauKhungDaChon.vienCm * phong.pxMoiCm * tl}
                      doPhanGiai={2048}
                    />
                  </div>
                )}
              </>
            );
          }}
        </XemLonCanh>
      )}
    </div>
  );
}

/**
 * Tấm ảnh của bé trên tường: (khung HQ nếu chọn) → chất liệu tràn viền → ảnh.
 * Dùng chung cho cảnh ướm và cảnh xem lớn (BB-378) — cùng một cách vẽ, chỉ khác
 * bề dày viền (px màn hình) theo tỉ lệ hiển thị.
 */
function KhungAnhBe({
  anh,
  chatLieu,
  coKhung,
  mauKhung,
  vienPx,
  coIconPhong = false,
  doPhanGiai = 1600,
}: {
  anh: AnhTreoTuong;
  chatLieu: string | null;
  coKhung: boolean;
  mauKhung: (typeof MAU_KHUNG)[number];
  vienPx: number;
  coIconPhong?: boolean;
  doPhanGiai?: 1600 | 2048;
}) {
  const style = lopChatLieu(chatLieu);
  return (
    /*
      Khung HQ = viền vẽ bằng border-image theo mẫu khung ba mẹ chọn (BB-222, chỉ
      để tham khảo). border-image-slice lấy từ số đo pixel trong chính ảnh mẫu
      (`mau-khung.ts`); bề dày viền trên màn hình quy đổi từ cm thật theo đúng tỉ
      lệ hiển thị — không phải một số cố định.
    */
    <div
      className="h-full w-full"
      style={
        coKhung
          ? {
              borderStyle: "solid",
              borderWidth: `${vienPx}px`,
              borderImageSource: `url(${mauKhung.anh})`,
              borderImageSlice: mauKhung.slicePx,
              borderImageRepeat: "stretch",
              boxSizing: "border-box",
            }
          : undefined
      }
    >
      <div
        className={`relative h-full w-full ${style.className}`}
        style={{
          padding: style.padding,
          background: style.background,
          boxShadow: style.boxShadow,
          // BB-339 — tràn viền, góc vuông (không bo) cho mọi chất liệu.
          borderRadius: 0,
        }}
      >
        <div className="relative h-full w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={buildLightboxImageUrl(anh.id, doPhanGiai)}
            alt={anh.fileName}
            className="h-full w-full object-cover"
            draggable={false}
          />
          {chatLieu === "Cavas/Kim tuyến" && (
            <div
              className="pointer-events-none absolute inset-0 mix-blend-screen"
              style={{ backgroundImage: ANH_KIM_TUYEN, backgroundSize: "9px 9px" }}
            />
          )}
          {(chatLieu === "Tráng gương" || chatLieu === "Thủy tinh" || chatLieu === "Mica HD") && (
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(115deg, rgba(255,255,255,.32) 0%, rgba(255,255,255,0) 22%, rgba(255,255,255,0) 78%, rgba(255,255,255,.18) 100%)",
              }}
            />
          )}
        </div>
        {/* Gợi ý bấm được — chạm vào để xem lớn cả cảnh. */}
        {coIconPhong && (
          <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm">
            <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
          </span>
        )}
      </div>
    </div>
  );
}

/** BB-365 — tấm ảnh giấy UV nằm trên bàn: lề trắng + bóng theo cm thật + nắng từ cửa sổ. */
function AnhGiayUv({
  anh,
  pxManHinhMoiCm,
  doPhanGiai = 1600,
}: {
  anh: AnhTreoTuong;
  pxManHinhMoiCm: number;
  doPhanGiai?: 1600 | 2048;
}) {
  return (
    <div
      className="relative h-full w-full bg-[#fbf9f4]"
      style={{
        padding: `${Math.max(1.5, LE_ANH_GIAY_CM * pxManHinhMoiCm)}px`,
        boxShadow: bongAnhGiay(pxManHinhMoiCm),
      }}
    >
      <div className="relative h-full w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={buildLightboxImageUrl(anh.id, doPhanGiai)}
          alt={anh.fileName}
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
      {/* Nắng từ cửa sổ phía trên: mép trên tấm ảnh sáng ấm hơn, mép dưới hơi tối — cả lề lẫn ảnh. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(175deg, rgba(255,240,215,.16) 0%, rgba(255,240,215,0) 45%, rgba(70,45,20,.07) 100%)",
        }}
      />
    </div>
  );
}
