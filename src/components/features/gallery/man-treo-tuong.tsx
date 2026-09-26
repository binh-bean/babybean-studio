"use client";

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
  type CoKhungCm,
} from "@/lib/gallery/khung-tren-tuong";
import { MAU_KHUNG, MAU_KHUNG_MAC_DINH } from "@/lib/gallery/mau-khung";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";

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
  /** Sản phẩm mua thêm đã đặt cho ảnh nào, để nút "Thêm vào đơn" cộng dồn đúng. */
  addonsDaDat: Array<{ productId: string; photoId: string | null; quantity: number }>;
  khoa: boolean;
  duocChon: boolean;
  dangLuu: boolean;
  onDatVaoGoi: (photoId: string, galleryItemId: string, dat: boolean) => void;
  onDatMuaThem: (photoId: string, productId: string, soLuong: number) => void;
}

/**
 * Tỉ lệ px-ảnh-gốc → px-hiển-thị của phép `object-fit: cover` — CÙNG một số
 * `scale` phải dùng cho mọi thứ đo bằng px trên ảnh gốc (vị trí khung, và bề
 * dày viền khung mẫu bên dưới), không thì viền khung sẽ không cùng tỉ lệ với
 * khung ảnh khi phóng to/thu nhỏ màn hình.
 */
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
  "Cavas/Kim tuyến": "Canvas",
  "Tráng gương": "Tráng gương",
  "Thủy tinh": "Thủy tinh",
  "Mica HD": "Mica HD",
  UV: "UV bóng",
};

/**
 * BB-243 — mô tả chất liệu dài, gấp sau nút "i" (không hiện mặc định). Ép
 * kiểu `Record<string, string>` (không `as any`) để đọc được bằng khoá động
 * — nguồn chữ vẫn ở `src/i18n/vi.ts` như đề bài yêu cầu, đây chỉ là một biến
 * tham chiếu cùng dữ liệu với chỉ số [string] hợp lệ về kiểu.
 */
const MO_TA_CHAT_LIEU: Record<string, string> = vi.gallery.treoTuong.moTaChatLieu;

/** Mỗi chất liệu một cách "vẽ" bằng CSS thuần — không ảnh, không thư viện. */
function lopChatLieu(chatLieu: string | null): React.CSSProperties & { className: string } {
  switch (chatLieu) {
    case "Gỗ":
      return {
        className: "vien-go",
        padding: "3.2%",
        background: "linear-gradient(155deg,#a9744a,#6d4726 65%,#5a3a1f)",
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,.08), inset 0 2px 6px rgba(0,0,0,.35)",
      };
    case "Cavas/Kim tuyến":
      return {
        className: "vien-canvas",
        padding: "1.6%",
        background: "#efe8da",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
      };
    case "Tráng gương":
      return {
        className: "vien-guong",
        padding: "0.9%",
        background: "linear-gradient(140deg,#d9dee2,#9aa4ab 55%,#c7ccd0)",
      };
    case "Thủy tinh":
      return {
        className: "vien-thuytinh",
        padding: "0.7%",
        background: "linear-gradient(140deg,#dfeaea,#a9c2c2 55%,#cfe0e0)",
      };
    case "Mica HD":
      return {
        className: "vien-mica",
        padding: "0.7%",
        background: "linear-gradient(140deg,#f2f2f2,#c9c9c9 55%,#e8e8e8)",
      };
    default:
      // UV và mọi chất liệu chưa đặt tên riêng: viền phẳng mảnh.
      return {
        className: "vien-uv",
        padding: "0.5%",
        background: "#f4f2ee",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,.08)",
      };
  }
}

/** Vân vải canvas — SVG noise nhúng thẳng bằng data URI, không thêm tệp. */
const VAN_CANVAS =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='7' height='7'%3E%3Cpath d='M0 7 7 0M-1 1 1 -1M6 8 8 6' stroke='%23000' stroke-opacity='0.05'/%3E%3C/svg%3E\")";

const BONG_THEO_HUONG: Record<AnhPhong["huongSang"], string> = {
  // Sáng từ trái → bóng đổ chếch phải-dưới. Sáng từ phải → chếch trái-dưới.
  // Sáng từ trên → bóng gọn ngay dưới, gần như đối xứng.
  trai: "10px 16px 28px rgba(20,14,8,.42), -3px -3px 8px rgba(255,255,255,.05)",
  phai: "-10px 16px 28px rgba(20,14,8,.42), 3px -3px 8px rgba(255,255,255,.05)",
  tren: "0px 14px 24px rgba(20,14,8,.4)",
};

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
}: ManTreoTuongProps) {
  const [chiSo, setChiSo] = useState(chiSoBanDau);
  const [maPhong, setMaPhong] = useState<MaPhong>("phong-khach");
  const [chatLieu, setChatLieu] = useState<string | null>(null);
  const [co, setCo] = useState<CoKhungCm>("40x60");
  const [coKhung, setCoKhung] = useState(false);
  const [maMauKhung, setMaMauKhung] = useState(MAU_KHUNG_MAC_DINH.ma);
  const [manRong, setManRong] = useState(false);

  // BB-243 — bảng điều khiển gọn: ẩn được để xem trọn tường; chi tiết (mô tả
  // chất liệu, câu "chỉ để tham khảo") gấp sau nút "i"; xem lớn tấm của bé.
  const [banAn, setBanAn] = useState(false);
  const [chiTietMo, setChiTietMo] = useState(false);
  const [xemLon, setXemLon] = useState(false);

  const mauKhungDaChon = useMemo(
    () => MAU_KHUNG.find((m) => m.ma === maMauKhung) ?? MAU_KHUNG_MAC_DINH,
    [maMauKhung]
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [khungRef, setKhungRef] = useState({ w: 0, h: 0 });
  const chamBatDau = useRef<{ x: number; y: number } | null>(null);

  // Reset về ảnh vừa mở mỗi lần bấm "Xem trên tường" từ một tấm khác — và gấp
  // lại chi tiết/xem lớn, hiện lại bảng, để không mang trạng thái ẩn/mở của
  // lần xem trước sang lần mở mới.
  useEffect(() => {
    if (mo) {
      setChiSo(chiSoBanDau);
      setBanAn(false);
      setChiTietMo(false);
      setXemLon(false);
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
    const doLai = () => setKhungRef({ w: el.clientWidth, h: el.clientHeight });
    doLai();
    const ro = new ResizeObserver(doLai);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mo]);

  // Esc đóng ĐÚNG MỘT LỚP — bắt ở pha capture và chặn lan, vì màn xem lớn
  // (PhotoLightbox) nằm ngay dưới cũng nghe Esc: không chặn thì một lần bấm
  // đóng luôn cả hai lớp. Lớp "xem lớn tấm của bé" (BB-243) mở TRÊN màn tường
  // này nên Esc phải đóng nó trước, giống cách photo-lightbox.tsx tự đóng lớp
  // con (tamMo) trước khi đóng cả màn.
  useEffect(() => {
    if (!mo) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      if (xemLon) {
        setXemLon(false);
        return;
      }
      onDong();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [mo, onDong, xemLon]);

  // Khoá cuộn trang nền — màn này chiếm toàn màn hình.
  useEffect(() => {
    if (!mo) return;
    const cu = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = cu;
    };
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

  useEffect(() => {
    if (chatLieu !== null) return;
    if (monTrongGoi?.material && monTrongGoi.size) {
      setChatLieu(monTrongGoi.material);
      setCo(monTrongGoi.size);
      return;
    }
    const dau = dsChatLieu[0];
    if (dau) setChatLieu(dau);
  }, [chatLieu, dsChatLieu, monTrongGoi]);

  const kho: KhoAnhPhong = manRong ? "ngang" : "doc";
  const phong = PHONG_TREO[maPhong][kho];

  // Hướng khung theo TẤM ẢNH CỦA BÉ (dọc/ngang), không theo khổ ảnh phòng —
  // đúng đề bài "ảnh dọc 40×60 = rộng 40 cao 60".
  const huongKhung: "doc" | "ngang" =
    anhDangXem?.width && anhDangXem?.height && anhDangXem.height >= anhDangXem.width ? "doc" : "ngang";

  // Chỉ hiện cỡ nào THẬT SỰ có bán VÀ vừa mảng tường của đúng phòng+khổ đang
  // xem — quét lại mỗi khi đổi phòng/khổ màn hình, không chỉ lúc mở màn.
  const coCoBan = useMemo(
    () =>
      cacCoTuDanhMuc(monAnhIn.filter((m) => m.material === chatLieu).map((m) => m.size)),
    [monAnhIn, chatLieu]
  );
  const coVua = useMemo(
    () =>
      coCoBan.filter(
        (c) => tinhKhungTrenTuong(phong, c, huongKhung, coKhung, mauKhungDaChon.vienCm).vua
      ),
    [coCoBan, phong, huongKhung, coKhung, mauKhungDaChon]
  );

  useEffect(() => {
    const dau = coVua[0];
    if (dau && !coVua.includes(co)) setCo(dau);
  }, [coVua, co]);

  const ketQuaKhung = useMemo(
    () => tinhKhungTrenTuong(phong, co, huongKhung, coKhung, mauKhungDaChon.vienCm),
    [phong, co, huongKhung, coKhung, mauKhungDaChon]
  );

  const viTriHienThi = useMemo(() => {
    if (!ketQuaKhung.vua || khungRef.w === 0) return null;
    return quyDoiKhungHienThi(khungRef.w, khungRef.h, phong.rongAnhPx, phong.caoAnhPx, ketQuaKhung.hinh);
  }, [ketQuaKhung, khungRef, phong]);

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
    soLuongDaDat,
  ]);

  const lui = useCallback(() => setChiSo((i) => (i > 0 ? i - 1 : i)), []);
  const toi = useCallback(() => setChiSo((i) => (i < anh.length - 1 ? i + 1 : i)), [anh.length]);

  if (!mo || !anhDangXem) return null;

  const style = lopChatLieu(chatLieu);

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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={phong.tep}
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

        {viTriHienThi && sanPhamAnh && (
          <div
            role="button"
            tabIndex={0}
            aria-label={vi.gallery.treoTuong.xemLonAnhBe}
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
            {/*
              Khung HQ = viền vẽ bằng border-image theo mẫu khung ba mẹ chọn
              (BB-222, chỉ để tham khảo). border-image-slice lấy từ số đo
              pixel trong chính ảnh mẫu (`mau-khung.ts`); border width (viền
              dày bao nhiêu TRÊN MÀN HÌNH) quy đổi từ cm thật theo đúng tỉ lệ
              hiển thị `object-fit: cover` — không phải một số cố định.
            */}
            <div
              className="h-full w-full"
              style={
                coKhung
                  ? {
                      borderStyle: "solid",
                      borderWidth: `${vienKhungPx}px`,
                      borderImageSource: `url(${mauKhungDaChon.anh})`,
                      borderImageSlice: mauKhungDaChon.slicePx,
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
                  borderRadius: coKhung ? 1 : 2,
                }}
              >
                <div className="relative h-full w-full overflow-hidden" style={{ borderRadius: 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={buildLightboxImageUrl(anhDangXem.id, 1600)}
                    alt={anhDangXem.fileName}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  {chatLieu === "Cavas/Kim tuyến" && (
                    <div
                      className="pointer-events-none absolute inset-0 mix-blend-multiply"
                      style={{ backgroundImage: VAN_CANVAS }}
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
                {/* Gợi ý bấm được — khung ảnh của bé chiếm phần lớn màn hình,
                    icon nhỏ này báo cho ba mẹ biết chạm vào để xem lớn. */}
                <span className="pointer-events-none absolute bottom-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/45 text-white/90 backdrop-blur-sm">
                  <ZoomIn className="h-3.5 w-3.5" strokeWidth={2} />
                </span>
              </div>
            </div>
          </div>
        )}

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
              className="absolute right-3 top-1/2 z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 disabled:opacity-0 md:flex"
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

        {/* 4 phòng — thẻ nhỏ chọn ảnh nền. */}
        <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 gap-2 rounded-full bg-black/35 p-1.5 backdrop-blur-sm">
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
        BẢNG ĐIỀU KHIỂN (BB-243) — một thanh gọn ĐÈ LÊN ảnh phòng, không còn
        chiếm riêng một cột đẩy ảnh hẹp lại. Nền mờ (backdrop-blur) để vẫn đọc
        được chữ trên mọi ảnh phòng. Chỉ hiện nhãn ngắn (chip chất liệu/cỡ đã
        sẵn ngắn); mô tả dài + câu "chỉ để tham khảo" gấp sau nút "i".
        Ẩn hẳn được bằng nút "Ẩn bảng" hoặc chạm vào ảnh phòng.
      */}
      <div
        className={cn(
          "giao-dien-khach absolute z-10 flex flex-col gap-3 overflow-y-auto rounded-t-3xl bg-bb-bg/80 p-4 backdrop-blur-md transition-transform duration-300 ease-out",
          "inset-x-0 bottom-0 max-h-[52vh]",
          // md:pt-16: cột phải trên máy tính chừa chỗ cho nút "Ẩn bảng"/"Đóng"
          // (z-20, top-4 right-4 của ảnh phòng) — thiếu khoảng này, hàng đầu
          // của bảng (tiêu đề + nút "Chi tiết") nằm ĐÚNG dưới hai nút đó, và
          // vì hai nút kia z CAO HƠN nên chặn mất cú bấm vào "Chi tiết" (tự bắt
          // bằng Playwright: click "Chi tiết" bị nút "Đóng" chặn pointer-events).
          "md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:w-[300px] md:rounded-none md:pt-16",
          // "invisible" (không chỉ translate ra ngoài khung nhìn) để Playwright
          // và trình đọc màn hình đều coi đây là ĐÃ ẨN thật, không phải một
          // khối vẫn "nhìn thấy được" nhưng trôi ra ngoài rìa màn hình.
          banAn && "invisible translate-y-full md:translate-x-full md:translate-y-0",
        )}
        style={{ boxShadow: "0 -8px 30px rgba(0,0,0,.25)" }}
        aria-hidden={banAn}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {/*
              BB-275 kiểm ngược — trên máy tính (`md:w-[300px]`) cột chữ chỉ còn
              ~184px cạnh nút "Chi tiết", và `truncate` cắt tiêu đề còn "Treo
              lên tư…". Bỏ `truncate`, cho xuống dòng: cột có chiều cao tự do
              (`md:max-h-none`, cuộn được), không như thanh ngang hẹp cần cắt
              một dòng.
            */}
            <h2 className="font-display text-lg font-light leading-tight text-bb-fg">
              Treo lên tường nhà mình
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setChiTietMo((v) => !v)}
            aria-pressed={chiTietMo}
            aria-label={chiTietMo ? vi.gallery.treoTuong.anChiTiet : vi.gallery.treoTuong.chiTiet}
            className={cn(
              "flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium transition",
              chiTietMo ? "bg-bb-fg text-bb-bg" : "bg-bb-surface-2 text-bb-fg-muted hover:bg-bb-border",
            )}
          >
            <Info className="h-3 w-3" strokeWidth={2} />
            {vi.gallery.treoTuong.chiTiet}
          </button>
        </div>

        {dsChatLieu.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {dsChatLieu.map((cl) => (
              <button
                key={cl}
                type="button"
                onClick={() => setChatLieu(cl)}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  cl === chatLieu
                    ? "bg-bb-fg text-bb-bg"
                    : "bg-bb-surface-2 text-bb-fg hover:bg-bb-border",
                ].join(" ")}
              >
                {TEN_CHAT_LIEU[cl] ?? cl}
              </button>
            ))}
          </div>
        )}

        {coVua.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {coVua.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCo(c)}
                className={[
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  c === co ? "bg-bb-fg text-bb-bg" : "bg-bb-surface-2 text-bb-fg hover:bg-bb-border",
                ].join(" ")}
              >
                {c.replace("x", "×")} cm
              </button>
            ))}
          </div>
        )}

        {coVua.length === 0 && (
          <p className="text-xs text-bb-fg-muted">
            Phòng này chưa có cỡ nào vừa mảng tường — ba mẹ thử đổi phòng khác nhé.
          </p>
        )}

        {monKhung.length > 0 && (
          <div className="space-y-2">
            <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-bb-surface-2 px-3.5 py-2">
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
                      m.ma === maMauKhung
                        ? "bg-bb-fg/10 ring-2 ring-bb-fg"
                        : "ring-1 ring-transparent hover:bg-bb-surface-2",
                    ].join(" ")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={m.anh}
                      alt=""
                      className="h-8 w-8 rounded-md object-cover"
                      draggable={false}
                    />
                    <span className="text-[10px] font-medium text-bb-fg">{m.ten}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Chi tiết gấp lại (BB-243): mô tả chất liệu + câu "chỉ để tham khảo"
            của khung — chỉ hiện khi bấm nút "i" ở trên, không choán chỗ mặc định. */}
        {chiTietMo && (
          <div className="space-y-1.5 rounded-2xl bg-bb-surface-2/70 p-3 text-[11px] leading-relaxed text-bb-fg-muted">
            {chatLieu && MO_TA_CHAT_LIEU[chatLieu] && <p>{MO_TA_CHAT_LIEU[chatLieu]}</p>}
            {coKhung && <p>{vi.gallery.treoTuong.thamKhaoKhung}</p>}
          </div>
        )}

        <div className="mt-auto space-y-1 border-t border-bb-border pt-2.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="text-bb-fg-muted">
              {sanPhamAnh ? (TEN_CHAT_LIEU[sanPhamAnh.material ?? ""] ?? sanPhamAnh.material) : "—"}
              {sanPhamAnh?.size ? ` · ${sanPhamAnh.size}` : ""}
            </span>
            <span className="font-medium text-bb-fg">
              {suatAnhVua ? "Trong gói · 0 ₫" : formatCurrencyVND(giaAnh)}
            </span>
          </div>
          {coKhung && sanPhamKhung && (
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-bb-fg-muted">Khung HQ</span>
              <span className="font-medium text-bb-fg">
                {suatKhungVua ? "Trong gói · 0 ₫" : formatCurrencyVND(giaKhung)}
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1.5 text-base">
            <span className="font-medium text-bb-fg">Tổng cộng</span>
            <span className="font-display text-xl font-medium text-bb-fg">
              {formatCurrencyVND(tongGia)}
            </span>
          </div>
        </div>

        {!xemDuocThoi && (
          <button
            type="button"
            disabled={!sanPhamAnh || dangLuu}
            onClick={themVaoDon}
            className="h-12 shrink-0 rounded-full bg-bb-fg text-sm font-medium text-bb-bg transition hover:opacity-90 disabled:opacity-40"
          >
            {dangLuu ? "Đang lưu…" : "Thêm vào đơn"}
          </button>
        )}
        {xemDuocThoi && (
          <p className="text-center text-xs text-bb-fg-muted">Bộ ảnh đang chỉ xem, chưa đặt được.</p>
        )}
      </div>

      {/* BB-243 — mở lớn tấm của bé: toàn màn, nền tối, đè trên cả màn tường. */}
      {xemLon && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={vi.gallery.treoTuong.xemLonAnhBe}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/95"
          onClick={() => setXemLon(false)}
          data-con-tro="mac-dinh"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={buildLightboxImageUrl(anhDangXem.id, 2048)}
            alt={anhDangXem.fileName}
            className="max-h-[92vh] max-w-[92vw] object-contain"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setXemLon(false)}
            aria-label={vi.gallery.treoTuong.dongXemLon}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
