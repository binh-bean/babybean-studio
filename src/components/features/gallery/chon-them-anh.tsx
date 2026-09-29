"use client";

/**
 * "Chọn thêm ảnh" trên MÀN CHÍNH của khách — dữ liệu đợt + trạng thái từng đợt
 * + lối vào màn đợt mới.
 *
 * OWNER: DEV-FE. Task BB-321 — dựng theo bản vẽ anh duyệt 29/09/2026
 * (`babybean-assets/BB-321/ban-ve/4-trang-thai-dot-*.png`).
 *
 * Luật doanh thu của chủ studio 29/09/2026: ảnh đợt 1 khoá sau khi studio xác
 * nhận, nhưng MUA THÊM thì ba mẹ vẫn chọn ảnh và chốt từng đợt riêng — không
 * cần xin mở lại, và không có gì được cản đường mua.
 *
 * Tệp này chỉ gồm phần NHẸ chạy ngay trên màn chính:
 *   · `useDotChon`   — đọc `/api/g/dot-chon` + giữ nháp đợt đang chọn (trình
 *                      duyệt, bọc try/catch). Màn chính và màn đợt dùng chung
 *                      MỘT nháp, nên nút lối vào biết "Tiếp tục đợt N".
 *   · `DotChonTrenManChinh` — MỘT thẻ, đứng ngay dưới dải "Đã gửi yêu cầu"
 *                      (BB-312): trạng thái từng đợt (chờ / đã xác nhận / chưa
 *                      nhận kèm lý do), rồi lối vào "Chọn thêm ảnh".
 * Màn chọn ảnh của đợt ở `man-chon-them-dot.tsx` (tải chậm).
 */

import React from "react";
import { Check, Clock, RotateCcw, X } from "lucide-react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatKichThuoc } from "@/lib/utils/dinh-dang";
import { nhanTrangThaiDotChoKhach, soDotKeTiep, type TrangThaiDot } from "@/lib/gallery/dot-chon";
import { cumTenBe, dongDauManDot, locNhapConChonDuoc, type DongGioDot } from "./dot-chon-khach";

// ---------------------------------------------------------------------------
// Dữ liệu `/api/g/dot-chon` (hợp đồng của DEV-BE, `layTrangThaiDotChoKhach`)
// ---------------------------------------------------------------------------

export interface DotCuaKhach {
  soDot: number;
  trangThai: TrangThaiDot;
  soAnh: number;
  tienAnh: number;
  tienSanPham: number;
  tong: number;
  lyDoTuChoi: string | null;
  sanPham: Array<{ ten: string; soLuong: number }>;
}

export interface TrangThaiDotKhach {
  /** Máy chủ quyết (trạng thái app HOẶC Lark đã chốt) — màn khách không tự suy. */
  cheDoChonThem: boolean;
  coTheChot: boolean;
  giaMoiAnh: number;
  hanMuc: number | null;
  daChonTruoc: number;
  cacDot: DotCuaKhach[];
  /** photoId → số đợt, chỉ đợt ≥ 2 (tấm đã chọn mà không có ở đây là đợt 1). */
  dotTheoAnh: Record<string, number>;
  banNhap: {
    anhIds: string[];
    sanPham: DongGioDot[];
    lyDo: string | null;
  } | null;
  /** Số sản phẩm in ĐỢT 1 hiện chưa gắn ảnh (máy chủ đếm) — hộp chốt đợt 1 dùng. */
  soSanPhamInChuaAnh?: number;
  /** Số ảnh còn thiếu so với hạn mức (null = chưa biết hạn mức). */
  soAnhThieu?: number | null;
  /** Câu CHÍNH XÁC của hai ô tick (chủ studio duyệt) — giao diện dùng đúng câu này. */
  cauDongY?: { studioChon: string; bietAnhInCham: string };
}

export interface NhapDot {
  anh: string[];
  gio: DongGioDot[];
}

const NHAP_RONG: NhapDot = { anh: [], gio: [] };
const khoaNhap = (galleryId: string) => `bb.dot-chon.${galleryId}`;

function docNhap(galleryId: string): NhapDot | null {
  try {
    const raw = window.localStorage.getItem(khoaNhap(galleryId));
    if (!raw) return null;
    const j = JSON.parse(raw) as { anh?: unknown; gio?: unknown };
    const anh = Array.isArray(j.anh) ? j.anh.filter((x): x is string => typeof x === "string") : [];
    const gio = Array.isArray(j.gio)
      ? (j.gio as DongGioDot[]).filter(
          (d) =>
            d &&
            typeof d.productId === "string" &&
            typeof d.soLuong === "number" &&
            d.soLuong > 0 &&
            (d.photoId === null || typeof d.photoId === "string"),
        )
      : [];
    return { anh, gio };
  } catch {
    return null;
  }
}

function ghiNhap(galleryId: string, nhap: NhapDot) {
  try {
    if (nhap.anh.length === 0 && nhap.gio.length === 0) window.localStorage.removeItem(khoaNhap(galleryId));
    else window.localStorage.setItem(khoaNhap(galleryId), JSON.stringify(nhap));
  } catch {
    // Trình duyệt chặn lưu trữ thì thôi — nháp chỉ mất khi tải lại trang.
  }
}

/**
 * Đọc trạng thái đợt + giữ nháp đợt đang chọn.
 *
 * `bat` = bộ ảnh có thể đang ở chế độ chọn thêm (đã khoá) VÀ phiên không phải
 * người chỉ xem. Tắt thì không tự gọi mạng, nhưng `taiLai()` vẫn gọi được (hộp
 * chốt đợt 1 cần số sản phẩm in chưa có ảnh do máy chủ đếm).
 */
export function useDotChon(p: {
  galleryId: string | null;
  bat: boolean;
  anh: ReadonlyArray<{ id: string; mark: string | null | undefined }>;
}) {
  const { galleryId, bat, anh } = p;
  const [tt, setTt] = React.useState<TrangThaiDotKhach | null>(null);
  const [nhap, setNhapTho] = React.useState<NhapDot>(NHAP_RONG);
  const daNapNhap = React.useRef<string | null>(null);

  const taiLai = React.useCallback(async (): Promise<TrangThaiDotKhach | null> => {
    try {
      const res = await fetch("/api/g/dot-chon", { cache: "no-store" });
      if (!res.ok) return null;
      const json = (await res.json().catch(() => null)) as { data?: TrangThaiDotKhach } | null;
      if (json?.data) {
        setTt(json.data);
        return json.data;
      }
    } catch {
      // Không tải được thì thẻ tự ẩn — không chặn màn chính.
    }
    return null;
  }, []);

  React.useEffect(() => {
    if (!bat) return;
    void taiLai();
  }, [bat, taiLai]);

  // Nạp nháp MỘT lần cho mỗi bộ ảnh: nháp trong máy trước; không có thì lấy phần
  // studio vừa trả lại — CHỈ khi đợt gần nhất là đợt bị trả (đợt sau đã chốt lại
  // rồi thì không điền lại ảnh của đợt cũ nữa).
  React.useEffect(() => {
    if (!galleryId || !tt || !tt.cheDoChonThem || daNapNhap.current === galleryId) return;
    daNapNhap.current = galleryId;
    const cu = docNhap(galleryId);
    if (cu && (cu.anh.length > 0 || cu.gio.length > 0)) {
      setNhapTho(cu);
      return;
    }
    const cuoi = tt.cacDot[tt.cacDot.length - 1];
    if (tt.banNhap && cuoi && (cuoi.trangThai === "tu_choi" || cuoi.trangThai === "da_mo_lai")) {
      setNhapTho({ anh: tt.banNhap.anhIds, gio: tt.banNhap.sanPham });
    }
  }, [galleryId, tt]);

  const setNhap = React.useCallback(
    (sua: (cu: NhapDot) => NhapDot) => {
      setNhapTho((cu) => {
        const moi = sua(cu);
        if (galleryId) ghiNhap(galleryId, moi);
        return moi;
      });
    },
    [galleryId],
  );

  /** Ảnh nháp CÒN chọn được (bỏ tấm nay đã khoá theo đợt / không còn trong bộ). */
  const anhNhap = React.useMemo(
    () => (tt ? locNhapConChonDuoc(nhap.anh, anh, tt.dotTheoAnh) : []),
    [nhap.anh, anh, tt],
  );

  return { tt, taiLai, nhap, setNhap, anhNhap };
}

// ---------------------------------------------------------------------------
// Thẻ trên màn chính
// ---------------------------------------------------------------------------

function BieuTuongTrangThai({ trangThai }: { trangThai: TrangThaiDot }) {
  const cls = "mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground";
  if (trangThai === "da_xac_nhan") return <Check className={cls} strokeWidth={1.6} aria-hidden="true" />;
  if (trangThai === "tu_choi") return <X className={cls} strokeWidth={1.6} aria-hidden="true" />;
  if (trangThai === "da_mo_lai") return <RotateCcw className={cls} strokeWidth={1.6} aria-hidden="true" />;
  return <Clock className={cls} strokeWidth={1.6} aria-hidden="true" />;
}

/**
 * MỘT thẻ, MỘT kiểu cho mọi trạng thái đợt (cùng kiểu dải "Đã gửi yêu cầu" của
 * BB-312: viền mảnh, nền surface, bo 16). Trạng thái khác nhau bằng biểu tượng
 * nhỏ và câu chữ, không bằng màu nền. Đợt mới nhất ở trên cùng.
 */
export function DotChonTrenManChinh({
  tt,
  tenBe,
  soAnhNhap,
  soMonNhap,
  onMo,
}: {
  tt: TrangThaiDotKhach | null;
  tenBe: string | null;
  soAnhNhap: number;
  soMonNhap: number;
  onMo: () => void;
}) {
  if (!tt || !tt.cheDoChonThem) return null;

  const cacDot = [...tt.cacDot].sort((a, b) => b.soDot - a.soDot);
  if (cacDot.length === 0 && !tt.coTheChot) return null;

  const soDotMoi = soDotKeTiep(tt.cacDot);
  const coNhap = soAnhNhap > 0 || soMonNhap > 0;
  const gia = dongDauManDot(tt.giaMoiAnh);

  return (
    <section
      data-testid="chon-them-anh"
      aria-label="Chọn thêm ảnh"
      className="rounded-2xl border border-border bg-surface p-4 text-sm"
    >
      {cacDot.length > 0 && (
        <ul data-testid="trang-thai-cac-dot" className="divide-y divide-border">
          {cacDot.map((d) => (
            <li
              key={d.soDot}
              data-testid={`trang-thai-dot-${d.soDot}`}
              className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
            >
              <BieuTuongTrangThai trangThai={d.trangThai} />
              <div className="min-w-0 flex-1">
                <p className="font-medium tabular-nums">
                  Đợt {d.soDot} · {d.soAnh} ảnh
                  {d.tong > 0 && <> · {formatCurrencyVND(d.tong)}</>}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">{nhanTrangThaiDotChoKhach(d.trangThai)}</p>
                {d.trangThai === "tu_choi" && d.lyDoTuChoi && (
                  <p data-testid={`ly-do-dot-${d.soDot}`} className="mt-0.5 text-[13px] text-foreground">
                    Lý do: {d.lyDoTuChoi}
                  </p>
                )}
                {d.sanPham.length > 0 && (
                  <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                    {d.sanPham.map((s) => `${formatKichThuoc(s.ten)} ×${s.soLuong}`).join(", ")}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {tt.coTheChot && (
        <div
          className={
            cacDot.length > 0
              ? "mt-3.5 flex flex-wrap items-center gap-3 border-t border-border pt-3.5"
              : "flex flex-wrap items-center gap-3"
          }
        >
          {/* Tranh màu nước riêng của thẻ này (banana, BB-321 `ban-ve/prompt-banana.md`) — trang trí, alt rỗng. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/san-pham/moi-chon-them-anh-320.webp"
            srcSet="/san-pham/moi-chon-them-anh-320.webp 320w, /san-pham/moi-chon-them-anh-640.webp 640w"
            sizes="56px"
            alt=""
            width={56}
            height={56}
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded-xl bg-[var(--bb-surface-2)] object-cover"
          />
          <div className="min-w-0 flex-1 basis-[calc(100%-68px)] sm:basis-auto">
            <p className="font-medium">Thêm ảnh cho {cumTenBe(tenBe)}</p>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              {gia ? `${gia} · không cần xin mở lại` : "Không cần xin mở lại"}
            </p>
          </div>
          <button
            type="button"
            onClick={onMo}
            className="h-11 w-full shrink-0 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 sm:h-10 sm:w-auto"
          >
            {coNhap ? `Tiếp tục đợt ${soDotMoi}` : "Chọn thêm ảnh"}
          </button>
        </div>
      )}
    </section>
  );
}
