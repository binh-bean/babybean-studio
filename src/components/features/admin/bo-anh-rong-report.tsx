"use client";

/**
 * BB-381 — hai tab ở /admin/viec-can-xu-ly cho bộ ảnh 0 tấm (route chung
 * `GET /api/admin/reports/bo-anh-rong`, luật ở src/lib/gallery/bo-anh-rong.ts):
 *
 *   · "Gói chụp chưa có ảnh" — hoá đơn có gói chụp mà chưa có ảnh: lý do + hướng dẫn một
 *     dòng; tự rời danh sách khi đồng bộ có ảnh. Không gửi Lark, không gửi khách.
 *   · "Đơn hậu kỳ mua thêm" — hoá đơn không có dịch vụ chụp (in thêm, chỉnh thêm file…):
 *     gắn với bộ gốc của khách, theo dõi tới khi Lark "Đã giao". Không có link khách.
 */
import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CARD_TITLE_CLASS } from "./page-header";
import { SU_KIEN_VIEC_DOI } from "@/lib/utils/viec-can-xu-ly-tabs";
import { tenMeThat, formatSo } from "@/lib/utils/dinh-dang";
import { NutKeoDongHopDong } from "./nut-keo-dong-hop-dong";
import type { KetQuaBoAnhRong } from "@/lib/gallery/bo-anh-rong";
import { NHAN_LY_DO, type LyDoChuaCoAnh } from "@/lib/gallery/phan-loai-hoa-don";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";
import { NhanNhaBoAnh } from "./nhan-nha-bo-anh";
import { NutNhanKhach } from "./nut-nhan-khach";
import type { NhaCuaBo } from "@/lib/gia-dinh/nha-cua-bo";

function useBoAnhRong() {
  const [data, setData] = React.useState<(KetQuaBoAnhRong & { nha?: Record<string, NhaCuaBo>; chatTheoBo?: Record<string, string | null> }) | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);
  const tai = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports/bo-anh-rong", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) {
        setLoi(json?.error?.message ?? "Không tải được danh sách");
        return;
      }
      setLoi(null);
      setData(json.data as KetQuaBoAnhRong & { nha?: Record<string, NhaCuaBo>; chatTheoBo?: Record<string, string | null> });
    } catch {
      setLoi("Mất kết nối, thử lại giúp.");
    }
  }, []);
  React.useEffect(() => {
    void tai();
  }, [tai]);
  return { data, loi, tai };
}

const ngay = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

export function GoiChuaCoAnhReport() {
  const { data, loi, tai } = useBoAnhRong();
  const [dangDongBo, setDangDongBo] = React.useState<string | null>(null);
  const [cau, setCau] = React.useState<Record<string, string>>({});

  async function dongBo(galleryId: string) {
    setDangDongBo(galleryId);
    try {
      const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/sync`, { method: "POST" });
      const json = await res.json().catch(() => null);
      setCau((c) => ({
        ...c,
        [galleryId]: res.ok ? "Đang kéo ảnh từ Drive — có ảnh là dòng này tự rời danh sách." : (json?.error?.message ?? "Chưa đồng bộ được"),
      }));
      if (res.ok) {
        // Đồng bộ chạy nền (202): đọc lại sau ít giây cho dòng tự rời khi đã có ảnh.
        window.setTimeout(() => {
          void tai().then(() => window.dispatchEvent(new Event(SU_KIEN_VIEC_DOI)));
        }, 5000);
      }
    } finally {
      setDangDongBo(null);
    }
  }

  if (!data && !loi) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;
  const items = data?.goiChuaCoAnh ?? [];
  const loiTai = Object.entries(data?.dangOLoiTai ?? {}).filter(([, n]) => (n ?? 0) > 0) as Array<[LyDoChuaCoAnh, number]>;
  const tongLoiTai = loiTai.reduce((t, [, n]) => t + n, 0);

  return (
    <div className="flex flex-col gap-4" data-testid="bang-goi-chua-co-anh">
      <header>
        <h2 className={CARD_TITLE_CLASS}>Bộ có gói chụp nhưng chưa có ảnh</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Hoá đơn có gói chụp mà bộ ảnh chưa có tấm nào. Xử lý theo lý do bên dưới; đồng bộ có ảnh là dòng tự rời danh sách.
        </p>
      </header>
      {loi && <p role="alert" className="text-sm text-[var(--bb-danger)]">{loi}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">Không có bộ có gói chụp nào đang chờ ảnh.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bb-border)] rounded-lg border border-[var(--bb-border)]">
          {items.map((it) => (
            <li
              key={it.galleryId}
              data-testid="dong-goi-chua-co-anh"
              data-ly-do={it.lyDo}
              data-loai={it.loai}
              className="flex flex-wrap items-start gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--bb-fg)]">
                  <span className="[overflow-wrap:anywhere]">{tenMeThat(it.customerName) || hienTieuDeBoAnh(it.title)}</span>
                  <Badge variant="outline">{it.nhanLyDo}</Badge>
                  {it.loai === "chua_ro" && <Badge variant="outline">Chưa rõ gói</Badge>}
                </p>
                <p className="text-xs text-[var(--bb-fg-muted)] [overflow-wrap:anywhere]">
                  {[it.maHoaDon, it.branchName, `tạo ${ngay(it.createdAt)}`].filter(Boolean).join(" · ")}
                </p>
                <NhanNhaBoAnh nha={data?.nha?.[it.galleryId]} className="mt-1" />
                <p className="mt-1 text-xs text-[var(--bb-fg)]" data-testid="huong-dan-goi-chua-co-anh">
                  {it.huongDan}
                </p>
                {cau[it.galleryId] && (
                  <p role="status" className="mt-1 text-xs text-[var(--bb-fg-muted)]">
                    {cau[it.galleryId]}
                  </p>
                )}
                {it.loai === "chua_ro" && (
                  <NutKeoDongHopDong
                    galleryId={it.galleryId}
                    onDone={async () => {
                      await tai();
                      window.dispatchEvent(new Event(SU_KIEN_VIEC_DOI));
                    }}
                  />
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {it.driveFolderUrl && it.lyDo !== "chua_co_link" && (
                  <Button asChild variant="ghost" size="sm">
                    <a href={it.driveFolderUrl} target="_blank" rel="noreferrer noopener">
                      Mở Drive
                    </a>
                  </Button>
                )}
                {it.lyDo !== "chua_co_link" && (
                  <Button size="sm" variant="outline" disabled={dangDongBo === it.galleryId} onClick={() => void dongBo(it.galleryId)}>
                    {dangDongBo === it.galleryId ? "Đang gửi…" : "Đồng bộ"}
                  </Button>
                )}
                {/* BB-404 — nhắn khách ngay trên dòng. */}
                <NutNhanKhach url={data?.chatTheoBo?.[it.galleryId]} gonNho />
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/galleries/${encodeURIComponent(it.galleryId)}`}>Mở bộ ảnh</Link>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {tongLoiTai > 0 && (
        <p className="text-sm text-[var(--bb-fg-muted)]" data-testid="goi-chua-co-anh-o-loi-tai">
          Thêm {formatSo(tongLoiTai)} bộ có gói chụp đang lỗi Drive (
          {loiTai.map(([lyDo, n]) => `${NHAN_LY_DO[lyDo].nhan.toLowerCase()} ${formatSo(n)}`).join(", ")}) — xử lý ở tab{" "}
          <Link href="/admin/viec-can-xu-ly?tab=loi-dong-bo" className="underline hover:text-[var(--bb-fg)]">
            Bộ ảnh lỗi tải
          </Link>
          .
        </p>
      )}
    </div>
  );
}

export function DonHauKyReport() {
  const { data, loi } = useBoAnhRong();
  if (!data && !loi) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;
  const items = data?.donHauKy ?? [];
  return (
    <div className="flex flex-col gap-4" data-testid="bang-don-hau-ky">
      <header>
        <h2 className={CARD_TITLE_CLASS}>Đơn hậu kỳ mua thêm</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Hoá đơn không có dịch vụ chụp — khách cũ mua thêm (in thêm ảnh, chỉnh thêm file…). Không gửi link cho khách; làm theo bộ gốc, Lark báo Đã giao là dòng tự rời danh sách.
        </p>
      </header>
      {loi && <p role="alert" className="text-sm text-[var(--bb-danger)]">{loi}</p>}
      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">Không có đơn hậu kỳ mua thêm nào đang làm.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bb-border)] rounded-lg border border-[var(--bb-border)]">
          {items.map((it) => (
            <li key={it.galleryId} data-testid="dong-don-hau-ky" className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1 text-sm">
                <p className="flex flex-wrap items-center gap-2 font-medium text-[var(--bb-fg)]">
                  <span className="[overflow-wrap:anywhere]">{tenMeThat(it.customerName) || hienTieuDeBoAnh(it.title)}</span>
                  {it.trangThaiLark && <Badge variant="outline">{it.trangThaiLark}</Badge>}
                </p>
                <p className="text-xs text-[var(--bb-fg-muted)] [overflow-wrap:anywhere]">
                  {[it.maHoaDon, it.branchName, `tạo ${ngay(it.createdAt)}`].filter(Boolean).join(" · ")}
                </p>
                <NhanNhaBoAnh nha={data?.nha?.[it.galleryId]} className="mt-1" />
                <p className="mt-1 text-xs text-[var(--bb-fg)] [overflow-wrap:anywhere]" data-testid="thanh-phan-don-hau-ky">
                  {it.thanhPhan || "Chưa có dòng hàng"}
                </p>
                <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
                  {it.boGoc ? (
                    <>
                      Bộ gốc:{" "}
                      <Link
                        href={`/admin/galleries/${encodeURIComponent(it.boGoc.id)}`}
                        className="underline hover:text-[var(--bb-fg)]"
                        data-testid="link-bo-goc"
                      >
                        {hienTieuDeBoAnh(it.boGoc.title)}
                      </Link>
                    </>
                  ) : (
                    "Khách chưa có bộ ảnh gốc trong app — lấy ảnh từ thư mục Drive cũ của khách."
                  )}
                </p>
              </div>
              {/* BB-404 — nhắn khách ngay trên dòng. */}
              <NutNhanKhach url={data?.chatTheoBo?.[it.galleryId]} gonNho />
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/galleries/${encodeURIComponent(it.galleryId)}`}>Mở đơn</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
