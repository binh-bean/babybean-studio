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

import React from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatKichThuoc, formatSo } from "@/lib/utils/dinh-dang";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { CAU_BIET_ANH_IN_CHAM, soDotKeTiep } from "@/lib/gallery/dot-chon";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";
import type { SanPhamCuaHang } from "@/lib/products/cau-hinh-cua-hang";
import type { PhotoPublic } from "@/types/domain";
import { vi } from "@/i18n";
import { LuoiAnh } from "./luoi-anh";
import { PhotoLightbox } from "./photo-lightbox";
import { CuaHang, type DongDaMua } from "./cua-hang";
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

/** Máy chủ nhận tối đa 20 cho mỗi dòng (`ChotDotChonSchema`). */
const SO_LUONG_TOI_DA = 20;
const KHONG_DANG_GUI = new Set<string>();
const KHONG_SO_SANH = new Map<string, number>();

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

const khoaDong = (productId: string, photoId: string | null) => `${productId}::${photoId ?? ""}`;

function datDong(gio: readonly DongGioDot[], productId: string, photoId: string | null, soLuong: number): DongGioDot[] {
  const con = gio.filter((d) => khoaDong(d.productId, d.photoId) !== khoaDong(productId, photoId));
  const n = Math.min(SO_LUONG_TOI_DA, Math.max(0, Math.floor(soLuong)));
  return n > 0 ? [...con, { productId, photoId, soLuong: n }] : con;
}

export function ManChonThemDot({
  photos,
  subfolders,
  tenBe,
  tenKhach,
  catalogue,
  tt,
  nhap,
  anhNhap,
  setNhap,
  onDong,
  onDaChot,
  onCanTaiLai,
}: {
  photos: PhotoPublic[];
  subfolders: string[];
  tenBe: string | null;
  tenKhach: string | null;
  catalogue: MonCatalogue[];
  tt: TrangThaiDotKhach;
  nhap: NhapDot;
  /** Ảnh nháp CÒN chọn được (đã lọc tấm khoá) — từ `useDotChon`. */
  anhNhap: string[];
  setNhap: (sua: (cu: NhapDot) => NhapDot) => void;
  onDong: () => void;
  onDaChot: (soDot: number) => void;
  /** Máy chủ báo có tấm vừa bị khoá: tải lại ảnh + trạng thái đợt. */
  onCanTaiLai: () => void;
}) {
  const [filter, setFilter] = React.useState<"all" | "selected" | "unselected">("all");
  const [nhom, setNhom] = React.useState("");
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null);
  const [moCuaHang, setMoCuaHang] = React.useState(false);
  const [hoi, setHoi] = React.useState(false);
  const [ten, setTen] = React.useState(tenKhach ?? "");
  const [bietAnhInCham, setBietAnhInCham] = React.useState(false);
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

  const dsAnh = React.useMemo(() => {
    const trongNhap = new Set(anhNhap);
    // Giữ NGUYÊN object của tấm không đổi — `TheAnh` được memo theo prop (LUẬT 2 luoi-anh).
    return photos.map((p) => (trongNhap.has(p.id) && p.mark !== "selected" ? { ...p, mark: "selected" as const } : p));
  }, [photos, anhNhap]);

  const dsLoc = React.useMemo(
    () =>
      dsAnh.filter((p) => {
        if (nhom && p.subfolder !== nhom) return false;
        if (filter === "selected") return p.mark === "selected";
        if (filter === "unselected") return p.mark !== "selected";
        return true;
      }),
    [dsAnh, filter, nhom],
  );
  const soDaChon = dsAnh.filter((p) => p.mark === "selected").length;

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
      setNhap((cu) => ({ ...cu, anh: doiAnhTrongNhap(cu.anh, photo.id, dot) }));
    },
    [dotKhoaTheoAnh, setNhap],
  );
  const moAnh = React.useCallback((i: number) => setLightboxIndex(i), []);
  const boQua = React.useCallback(() => {}, []);

  async function chot() {
    if (ten.trim().length === 0 || thieuTick) return;
    setDangGui(true);
    setLoi(null);
    try {
      const res = await fetch("/api/g/dot-chon/chot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenNguoiChot: ten.trim(),
          photoIds: anhNhap,
          items: gio.map((d) => ({ productId: d.productId, photoId: d.photoId, soLuong: d.soLuong })),
          ...(soMonChuaAnh > 0 ? { bietAnhInChamHon: bietAnhInCham } : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        data?: { soDot?: number };
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Chốt chưa được, ba mẹ thử lại giúp em nhé");
        // Có tấm vừa bị khoá ở chỗ khác (vd. tab khác vừa chốt): làm mới để huy hiệu đúng.
        if (res.status === 409) onCanTaiLai();
        return;
      }
      setNhap(() => ({ anh: [], gio: [] }));
      setHoi(false);
      onDaChot(json?.data?.soDot ?? soDot);
    } catch {
      setLoi("Không kết nối được, ba mẹ thử lại giúp em nhé");
    } finally {
      setDangGui(false);
    }
  }

  const nutLoc = (loai: "all" | "selected" | "unselected", nhan: string, so: number) => (
    <button
      type="button"
      onClick={() => setFilter(loai)}
      aria-pressed={filter === loai}
      className={cn(
        "shrink-0 whitespace-nowrap rounded-full border border-[#2e2a27] px-4 py-1.5 text-[14px] transition-colors",
        filter === loai ? "bg-[#2e2a27] text-[#fbf7f2]" : "bg-[#fbf7f2] text-[#2e2a27] hover:bg-[#2e2a27]/5",
      )}
    >
      {nhan}
      <span className="ml-1 opacity-70">{formatSo(so)}</span>
    </button>
  );

  const gia = dongDauManDot(tt.giaMoiAnh);
  const anhMoi = photos.filter((p) => anhNhap.includes(p.id));

  return (
    <div data-testid="man-chon-them-anh" className="min-h-[100dvh] bg-background pb-44 text-foreground lg:pb-32">
      {/* ĐẦU MÀN — MỘT dòng + hàng lọc, dính khi cuộn (cùng kiểu `#dau-luoi-anh`). */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/95 backdrop-blur-md">
        <div className="mx-auto max-w-[1600px] px-6 lg:flex lg:h-14 lg:items-center lg:px-10">
          <div className="flex min-h-14 items-center gap-1.5 lg:min-h-0">
            <button
              type="button"
              onClick={onDong}
              aria-label="Quay lại bộ ảnh"
              className="-ml-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-full transition hover:bg-surface-2"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <h1 data-testid="dong-dau-man-dot" className="min-w-0 text-[14px] leading-snug lg:text-[15px]">
              Chọn thêm ảnh cho <span className="font-display text-[16px] lg:text-[17px]">{cumTenBe(tenBe)}</span>
              {gia && <span className="whitespace-nowrap text-muted-foreground"> · {gia}</span>}
            </h1>
          </div>

          <span className="mx-6 hidden h-5 w-px shrink-0 bg-border lg:inline-block" aria-hidden="true" />

          <nav aria-label="Lọc ảnh" className="flex items-center gap-3 overflow-x-auto pb-4 pt-1 lg:p-0">
            {nutLoc("all", vi.gallery.filterAll, photos.length)}
            {nutLoc("selected", vi.gallery.filterSelected, soDaChon)}
            {nutLoc("unselected", vi.gallery.filterUnselected, photos.length - soDaChon)}
          </nav>
        </div>

        {subfolders.length > 1 && (
          <div
            aria-label={vi.gallery.subfolderTitle}
            className="mx-auto flex max-w-[1600px] gap-2 overflow-x-auto px-6 pb-3 lg:px-10"
          >
            {["", ...subfolders].map((f) => (
              <button
                key={f || "tat-ca"}
                type="button"
                onClick={() => setNhom(f)}
                aria-pressed={nhom === f}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors",
                  nhom === f ? "bg-foreground text-background" : "border border-border hover:bg-surface-2",
                )}
              >
                {f || vi.gallery.subfolderAll}
              </button>
            ))}
          </div>
        )}
      </header>

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
            soSanhBat={false}
            soSanhTheoAnh={KHONG_SO_SANH}
            dotKhoaTheoAnh={dotKhoaTheoAnh}
            onToggle={doiAnh}
            onOpen={moAnh}
            onToggleSoSanh={boQua}
          />
        )}
      </section>

      {/* THANH ĐÁY — MỘT câu + nút phụ (sản phẩm, tuỳ chọn) + nút chính. */}
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

      {/* SẢN PHẨM — cửa hàng đã duyệt, chạy trên giỏ của đợt (không gọi /api/g/addons). */}
      <CuaHang
        mo={moCuaHang}
        onDong={() => setMoCuaHang(false)}
        khoa={false}
        dangLuu={false}
        phuDe={`Tính vào đợt ${soDot}`}
        danhMuc={danhMuc}
        daMua={gio.map<DongDaMua>((d) => {
          const sp = theoMa.get(d.productId);
          return {
            id: khoaDong(d.productId, d.photoId),
            productId: d.productId,
            name: sp?.name ?? "",
            quantity: d.soLuong,
            totalPrice: (sp?.unitPrice ?? 0) * d.soLuong,
            photoId: d.photoId,
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
      />

      {/* XEM LỚN — đúng màn xem lớn của màn chính; tim tấm đã chốt đứng yên. */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={dsLoc}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onToggleHeart={doiAnh}
          mutatingIds={KHONG_DANG_GUI}
          isLocked={false}
          khoaTimAnh={(p) => (dotKhoaTheoAnh.get(p.id) ?? 0) > 0}
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
                Studio sẽ xác nhận đợt này rồi báo lại ba mẹ.
              </p>

              <div data-testid="noi-dung-xac-nhan" className="mt-5 space-y-2.5 rounded-2xl bg-surface-2 p-4 text-sm">
                {tom.soAnhMoi > 0 && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground">Ảnh mới</span>
                    <span className="tabular-nums">
                      <b className="font-semibold">{tom.soAnhMoi} ảnh</b> · {formatCurrencyVND(tom.tienAnh)}
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
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2.5 font-semibold">
                  <span>Tổng đợt {soDot}</span>
                  <span data-testid="tong-tien-dot" className="tabular-nums">
                    {formatCurrencyVND(tom.tong)}
                  </span>
                </div>
              </div>

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
                      ? `${formatKichThuoc(theoMa.get(monChuaAnh[0]!.productId)?.name ?? "Sản phẩm")} chưa có ảnh.`
                      : `${soMonChuaAnh} sản phẩm chưa có ảnh.`}
                  </p>
                  <label className="mt-2.5 flex items-start gap-2.5 leading-relaxed">
                    <Checkbox
                      checked={bietAnhInCham}
                      onCheckedChange={setBietAnhInCham}
                      className="mt-0.5"
                      aria-label={tt.cauDongY?.bietAnhInCham ?? CAU_BIET_ANH_IN_CHAM}
                    />
                    <span>{tt.cauDongY?.bietAnhInCham ?? CAU_BIET_ANH_IN_CHAM}</span>
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
