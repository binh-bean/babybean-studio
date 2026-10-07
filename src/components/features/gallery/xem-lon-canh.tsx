"use client";

/**
 * BB-378 — xem lớn CẢ CẢNH ướm ảnh (ảnh phòng/bàn + ảnh của bé), phóng/kéo được.
 *
 * OWNER: DEV-FE. Anh (Bản yêu cầu, "Ghép mua ảnh trong không gian"): "không mở
 * lớn ảnh được để xem". Bản cũ (BB-243) chạm khung chỉ mở RIÊNG tấm của bé —
 * ba mẹ mất cái mình muốn xem: tấm ảnh ĐANG Ở TRÊN TƯỜNG trông ra sao. Nay chạm
 * khung → cả cảnh hiện toàn màn (ảnh nền đầy đủ, không cắt `cover`), chụm hai
 * ngón / chạm hai lần / lăn chuột để phóng, kéo để xem chỗ khác. BB-393: máy
 * tính NHẤP MỘT LẦN là phóng quanh con trỏ, nhấp lần nữa là thu về (như BB-370).
 *
 * Component chỉ lo khung nhìn + phóng/kéo; NỘI DUNG cảnh do nơi gọi vẽ trong
 * hệ toạ độ của ảnh nền (`rong` × `cao` px gốc), nhận bề rộng sân khấu (px màn
 * hình) để quy đổi những gì đo bằng px (viền khung, bóng).
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { vi } from "@/i18n";
import { laNhapChuot } from "@/lib/gallery/phong-anh";

const T = vi.gallery.treoTuong;
const PHONG_TOI_DA = 4;
const PHONG_CHAM_HAI_LAN = 2.5;

export interface XemLonCanhProps {
  /** Kích thước ảnh nền gốc (px). */
  rong: number;
  cao: number;
  onDong: () => void;
  /** Vẽ cảnh trong sân khấu rộng `rongSanKhau` px (cao theo đúng tỉ lệ ảnh nền). */
  children: (rongSanKhau: number) => React.ReactNode;
}

interface BienDoi {
  s: number;
  x: number;
  y: number;
}

/** Giữ cảnh không trôi ra khỏi khung nhìn: chỉ kéo được trong phần đã phóng vượt khung. */
export function kepBienDoi(b: BienDoi, sanKhau: { w: number; h: number }, khung: { w: number; h: number }): BienDoi {
  const s = Math.min(PHONG_TOI_DA, Math.max(1, b.s));
  const duX = Math.max(0, (sanKhau.w * s - khung.w) / 2);
  const duY = Math.max(0, (sanKhau.h * s - khung.h) / 2);
  return { s, x: Math.min(duX, Math.max(-duX, b.x)), y: Math.min(duY, Math.max(-duY, b.y)) };
}

/** Phóng tới `s2` mà điểm (px, py) — tính từ TÂM khung nhìn — đứng yên dưới ngón tay/con trỏ. */
export function phongQuanhDiem(b: BienDoi, s2: number, px: number, py: number): BienDoi {
  const k = s2 / b.s;
  return { s: s2, x: px - (px - b.x) * k, y: py - (py - b.y) * k };
}

/** Ngón tay: chạm (không phải kéo) khi đi dưới ngần này px và nhấc trong CHAM_TOI_DA_MS. */
const CHAM_DI_TOI_DA_PX = 8;
const CHAM_TOI_DA_MS = 300;
/** Hai lần chạm cách nhau dưới ngần này ms và CHAM_LECH_TOI_DA_PX px là "chạm hai lần". */
const CHAM_HAI_LAN_MS = 320;
const CHAM_LECH_TOI_DA_PX = 30;

export type HanhDongKhiTha = "doi-phong" | "nho-cham" | "khong";

/**
 * BB-393 — nhấc chuột/ngón tay khỏi khung nhìn thì làm gì.
 *   · Chuột (máy tính): NHẤP MỘT LẦN là bật/tắt phóng quanh con trỏ — cùng luật
 *     `laNhapChuot` với màn xem lớn ảnh chính (BB-370); đi quá ngưỡng là kéo, không đổi phóng.
 *     Trước đây chuột phải nhấp ĐÚP (`onDoubleClick`) — anh: "sửa thành nhấp chuột 1 lần".
 *   · Ngón tay / bút: giữ nguyên chạm HAI lần — lần đầu chỉ ghi nhớ ("nho-cham").
 */
export function hanhDongKhiTha(v: {
  loaiTro: string;
  /** Quãng đường xa nhất đã đi từ lúc nhấn (px); chụm hai ngón = 99. */
  quangDuong: number;
  /** ms từ lúc nhấn tới lúc nhấc. */
  thoiGianNhan: number;
  chamTruoc: { luc: number; x: number; y: number } | null;
  bayGio: number;
  x: number;
  y: number;
}): HanhDongKhiTha {
  if (v.loaiTro === "mouse") return laNhapChuot(v.quangDuong) ? "doi-phong" : "khong";
  if (v.quangDuong >= CHAM_DI_TOI_DA_PX || v.thoiGianNhan >= CHAM_TOI_DA_MS) return "khong";
  const t = v.chamTruoc;
  if (t && v.bayGio - t.luc < CHAM_HAI_LAN_MS && Math.hypot(v.x - t.x, v.y - t.y) < CHAM_LECH_TOI_DA_PX) {
    return "doi-phong";
  }
  return "nho-cham";
}

export function XemLonCanh({ rong, cao, onDong, children }: XemLonCanhProps) {
  const khungRef = useRef<HTMLDivElement | null>(null);
  const [khung, setKhung] = useState({ w: 0, h: 0 });
  const [bd, setBd] = useState<BienDoi>({ s: 1, x: 0, y: 0 });
  const [goiY, setGoiY] = useState(true);
  const [dangKeo, setDangKeo] = useState(false);
  const ngon = useRef(new Map<number, { x: number; y: number }>());
  const batDau = useRef<{ bd: BienDoi; kc: number; giua: { x: number; y: number }; diChuyen: number; luc: number } | null>(null);
  const chamTruoc = useRef<{ luc: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const el = khungRef.current;
    if (!el) return;
    const doLai = () => setKhung({ w: el.clientWidth, h: el.clientHeight });
    doLai();
    const ro = new ResizeObserver(doLai);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setGoiY(false), 2800);
    return () => clearTimeout(t);
  }, []);

  const tiLe = khung.w > 0 && rong > 0 && cao > 0 ? Math.min(khung.w / rong, khung.h / cao) : 0;
  const sanKhau = { w: rong * tiLe, h: cao * tiLe };

  const datBd = useCallback(
    (b: BienDoi) => setBd(kepBienDoi(b, sanKhau, khung)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sanKhau.w, sanKhau.h, khung.w, khung.h],
  );

  /** Toạ độ điểm so với TÂM khung nhìn. */
  const tuTam = (clientX: number, clientY: number) => {
    const r = khungRef.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  };

  // Lăn chuột: phải gắn không-passive để chặn cuộn trang.
  useEffect(() => {
    const el = khungRef.current;
    if (!el) return;
    const lan = (e: WheelEvent) => {
      e.preventDefault();
      const p = tuTam(e.clientX, e.clientY);
      setBd((b) => kepBienDoi(phongQuanhDiem(b, Math.min(PHONG_TOI_DA, Math.max(1, b.s * Math.exp(-e.deltaY * 0.0015))), p.x, p.y), sanKhau, khung));
    };
    el.addEventListener("wheel", lan, { passive: false });
    return () => el.removeEventListener("wheel", lan);
  });

  const doiPhongTaiDiem = (px: number, py: number) => {
    setGoiY(false);
    if (bd.s > 1.05) datBd({ s: 1, x: 0, y: 0 });
    else datBd(phongQuanhDiem(bd, PHONG_CHAM_HAI_LAN, px, py));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    // Chuột: chỉ nút trái phóng/kéo (nút phải để mở trình đơn của trình duyệt).
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDangKeo(true);
    ngon.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ds = [...ngon.current.values()];
    const giua = ds.length >= 2 ? { x: (ds[0]!.x + ds[1]!.x) / 2, y: (ds[0]!.y + ds[1]!.y) / 2 } : ds[0]!;
    const kc = ds.length >= 2 ? Math.hypot(ds[0]!.x - ds[1]!.x, ds[0]!.y - ds[1]!.y) : 0;
    batDau.current = { bd, kc, giua, diChuyen: batDau.current && ds.length >= 2 ? 99 : 0, luc: Date.now() };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!ngon.current.has(e.pointerId) || !batDau.current) return;
    ngon.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const ds = [...ngon.current.values()];
    const bdau = batDau.current;
    if (ds.length >= 2 && bdau.kc > 0) {
      setGoiY(false);
      const kc = Math.hypot(ds[0]!.x - ds[1]!.x, ds[0]!.y - ds[1]!.y);
      const giua = { x: (ds[0]!.x + ds[1]!.x) / 2, y: (ds[0]!.y + ds[1]!.y) / 2 };
      const p = tuTam(bdau.giua.x, bdau.giua.y);
      const phong = phongQuanhDiem(bdau.bd, bdau.bd.s * (kc / bdau.kc), p.x, p.y);
      datBd({ ...phong, x: phong.x + (giua.x - bdau.giua.x), y: phong.y + (giua.y - bdau.giua.y) });
      bdau.diChuyen = 99;
    } else if (ds.length === 1) {
      const dx = e.clientX - bdau.giua.x;
      const dy = e.clientY - bdau.giua.y;
      bdau.diChuyen = Math.max(bdau.diChuyen, Math.hypot(dx, dy));
      if (bdau.bd.s > 1) datBd({ ...bdau.bd, x: bdau.bd.x + dx, y: bdau.bd.y + dy });
    }
  };

  const tha = (e: React.PointerEvent, biHuy: boolean) => {
    if (!ngon.current.has(e.pointerId)) return;
    const bdau = batDau.current;
    ngon.current.delete(e.pointerId);
    if (ngon.current.size > 0) {
      // Nhấc một ngón khi đang chụm: lấy ngón còn lại làm mốc kéo mới.
      const con = [...ngon.current.values()][0]!;
      batDau.current = { bd, kc: 0, giua: con, diChuyen: 99, luc: Date.now() };
      return;
    }
    batDau.current = null;
    setDangKeo(false);
    if (!bdau || biHuy) return;
    const bayGio = Date.now();
    const hd = hanhDongKhiTha({
      loaiTro: e.pointerType,
      quangDuong: bdau.diChuyen,
      thoiGianNhan: bayGio - bdau.luc,
      chamTruoc: chamTruoc.current,
      bayGio,
      x: e.clientX,
      y: e.clientY,
    });
    if (hd === "doi-phong") {
      chamTruoc.current = null;
      const p = tuTam(e.clientX, e.clientY);
      doiPhongTaiDiem(p.x, p.y);
    } else if (hd === "nho-cham") {
      chamTruoc.current = { luc: bayGio, x: e.clientX, y: e.clientY };
    }
  };

  const nutPhong = (heSo: number) => {
    setGoiY(false);
    datBd(phongQuanhDiem(bd, Math.min(PHONG_TOI_DA, Math.max(1, bd.s * heSo)), 0, 0));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={T.xemLonAnhBe}
      data-testid="xem-lon-canh"
      data-phong={bd.s.toFixed(2)}
      className="fixed inset-0 z-[70] bg-[#141210] animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      <div
        ref={khungRef}
        data-testid="xem-lon-canh-khung-nhin"
        data-con-tro="mac-dinh"
        className={
          "absolute inset-0 touch-none select-none overflow-hidden " +
          (bd.s > 1.05 ? (dangKeo ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in")
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => tha(e, false)}
        onPointerCancel={(e) => tha(e, true)}
      >
        {tiLe > 0 && (
          <div
            data-testid="xem-lon-canh-san-khau"
            className="absolute origin-center will-change-transform"
            style={{
              left: (khung.w - sanKhau.w) / 2,
              top: (khung.h - sanKhau.h) / 2,
              width: sanKhau.w,
              height: sanKhau.h,
              transform: `translate(${bd.x}px, ${bd.y}px) scale(${bd.s})`,
              transition: dangKeo ? "none" : "transform 200ms ease-out",
            }}
          >
            {children(sanKhau.w)}
          </div>
        )}
      </div>

      {goiY && (
        <p className="pointer-events-none absolute inset-x-0 bottom-[calc(max(20px,env(safe-area-inset-bottom))+56px)] mx-auto w-fit rounded-full bg-black/45 px-3.5 py-1.5 text-center text-[12.5px] text-white/90 backdrop-blur-sm">
          {/* BB-393 — máy có chuột thấy câu "nhấp", máy cảm ứng thấy câu "chụm / chạm hai lần". */}
          <span className="pointer-fine:hidden">{T.goiYPhongTo}</span>
          <span className="hidden pointer-fine:inline">{T.goiYPhongToChuot}</span>
        </p>
      )}

      <div className="absolute bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/45 p-1 text-white backdrop-blur-sm">
        <button
          type="button"
          onClick={() => nutPhong(1 / 1.6)}
          disabled={bd.s <= 1.001}
          aria-label={T.thuNho}
          className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/15 disabled:opacity-35"
        >
          <ZoomOut className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => nutPhong(1.6)}
          disabled={bd.s >= PHONG_TOI_DA - 0.001}
          aria-label={T.phongTo}
          className="flex h-10 w-10 items-center justify-center rounded-full transition hover:bg-white/15 disabled:opacity-35"
        >
          <ZoomIn className="h-5 w-5" />
        </button>
      </div>

      <button
        type="button"
        onClick={onDong}
        aria-label={T.dongXemLon}
        className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition hover:bg-black/60"
      >
        <X className="h-5 w-5" />
      </button>
    </div>
  );
}
