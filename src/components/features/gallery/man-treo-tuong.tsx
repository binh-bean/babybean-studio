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
import { X, ChevronLeft, ChevronRight } from "lucide-react";
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
  DANH_SACH_CO_KHUNG,
  type CoKhungCm,
} from "@/lib/gallery/khung-tren-tuong";
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
  const scale = Math.max(containerW / anhW, containerH / anhH);
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
  const [manRong, setManRong] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [khungRef, setKhungRef] = useState({ w: 0, h: 0 });
  const chamBatDau = useRef<{ x: number; y: number } | null>(null);

  // Reset về ảnh vừa mở mỗi lần bấm "Xem trên tường" từ một tấm khác.
  useEffect(() => {
    if (mo) setChiSo(chiSoBanDau);
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

  useEffect(() => {
    const dau = dsChatLieu[0];
    if (chatLieu === null && dau) setChatLieu(dau);
  }, [chatLieu, dsChatLieu]);

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
      DANH_SACH_CO_KHUNG.filter((c) => monAnhIn.some((m) => m.material === chatLieu && m.size === c)),
    [monAnhIn, chatLieu]
  );
  const coVua = useMemo(
    () =>
      coCoBan.filter((c) => tinhKhungTrenTuong(phong, c, huongKhung, coKhung).vua),
    [coCoBan, phong, huongKhung, coKhung]
  );

  useEffect(() => {
    const dau = coVua[0];
    if (dau && !coVua.includes(co)) setCo(dau);
  }, [coVua, co]);

  const ketQuaKhung = useMemo(
    () => tinhKhungTrenTuong(phong, co, huongKhung, coKhung),
    [phong, co, huongKhung, coKhung]
  );

  const viTriHienThi = useMemo(() => {
    if (!ketQuaKhung.vua || khungRef.w === 0) return null;
    return quyDoiKhungHienThi(khungRef.w, khungRef.h, phong.rongAnhPx, phong.caoAnhPx, ketQuaKhung.hinh);
  }, [ketQuaKhung, khungRef, phong]);

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
    <div className="fixed inset-0 z-[60] flex flex-col bg-black md:flex-row">
      {/* ẢNH PHÒNG TRÀN KHUNG */}
      <div
        ref={containerRef}
        className="relative flex-1 select-none overflow-hidden"
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
        />

        {viTriHienThi && sanPhamAnh && (
          <div
            className="absolute origin-center transition-all duration-300 ease-out"
            style={{
              left: `${viTriHienThi.leftPct}%`,
              top: `${viTriHienThi.topPct}%`,
              width: `${viTriHienThi.widthPct}%`,
              height: `${viTriHienThi.heightPct}%`,
              boxShadow: BONG_THEO_HUONG[phong.huongSang],
            }}
          >
            {/* Khung HQ = viền đen mờ mảnh bọc ngoài tấm đã có chất liệu riêng. */}
            <div
              className={coKhung ? "h-full w-full p-[3%]" : "h-full w-full"}
              style={
                coKhung
                  ? {
                      background: "rgba(18,14,10,.92)",
                      boxShadow: "inset 0 0 0 1px rgba(255,255,255,.06), inset 0 1px 3px rgba(0,0,0,.6)",
                      borderRadius: 2,
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
              </div>
            </div>
          </div>
        )}

        {/* Mũi tên lướt — chỉ hiện khi có nhiều hơn một tấm đã chọn. */}
        {anh.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Tấm trước"
              onClick={lui}
              disabled={chiSo === 0}
              className="absolute left-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 disabled:opacity-0 md:flex"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Tấm sau"
              onClick={toi}
              disabled={chiSo === anh.length - 1}
              className="absolute right-3 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm transition hover:bg-black/50 disabled:opacity-0 md:flex"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onDong}
          aria-label="Đóng"
          className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55"
        >
          <X className="h-5 w-5" />
        </button>

        {/* 4 phòng — thẻ nhỏ chọn ảnh nền. */}
        <div className="absolute left-1/2 top-4 flex -translate-x-1/2 gap-2 rounded-full bg-black/35 p-1.5 backdrop-blur-sm">
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

      {/* BẢNG ĐIỀU KHIỂN — tấm trượt kính mờ dưới đáy trên điện thoại, cột phải trên máy tính. */}
      <div
        className="giao-dien-khach relative z-10 flex max-h-[62vh] shrink-0 flex-col gap-4 overflow-y-auto rounded-t-3xl border-t border-white/10 bg-bb-bg/95 p-5 backdrop-blur-md md:max-h-none md:w-[380px] md:rounded-none md:border-l md:border-t-0 md:border-border md:bg-bb-bg md:backdrop-blur-0"
        style={{ boxShadow: "0 -8px 30px rgba(0,0,0,.18)" }}
      >
        <div>
          <h2 className="font-display text-2xl font-light leading-tight text-bb-fg">
            Treo lên tường nhà mình
          </h2>
          <p className="mt-1 text-xs text-bb-fg-muted">{anhDangXem.fileName}</p>
        </div>

        {dsChatLieu.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-bb-fg-muted">
              Chất liệu
            </p>
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
          </div>
        )}

        {coVua.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-bb-fg-muted">
              Kích thước ({huongKhung === "doc" ? "dọc" : "ngang"})
            </p>
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
          </div>
        )}

        {coVua.length === 0 && (
          <p className="text-xs text-bb-fg-muted">
            Phòng này chưa có cỡ nào vừa mảng tường — ba mẹ thử đổi phòng khác nhé.
          </p>
        )}

        {monKhung.length > 0 && (
          <label className="flex cursor-pointer items-center justify-between rounded-2xl bg-bb-surface-2 px-3.5 py-2.5">
            <span className="text-xs font-medium text-bb-fg">Bọc khung HQ</span>
            <input
              type="checkbox"
              checked={coKhung}
              onChange={(e) => setCoKhung(e.target.checked)}
              className="h-4 w-4 accent-bb-fg"
            />
          </label>
        )}

        <div className="mt-auto space-y-1 border-t border-bb-border pt-3">
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
    </div>
  );
}
