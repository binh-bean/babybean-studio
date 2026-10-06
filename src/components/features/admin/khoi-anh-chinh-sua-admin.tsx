/**
 * BB-371 — khối "Ảnh chỉnh sửa" ở trang chi tiết bộ ảnh (quản trị).
 *
 *   · ảnh trong thư mục ảnh chỉnh sửa của link Drive, tấm nào MỚI chưa gửi khách,
 *     ảnh gốc ghép theo tên;
 *   · nút "Gửi khách duyệt" — chỉ sau nút này khách mới thấy ảnh chỉnh;
 *   · các lần khách xin sửa: từng tấm, ghi chú, vùng khoanh (vẽ đè lên ảnh), ảnh
 *     mẫu (URL ký 10 phút).
 *
 * Bộ không có ảnh chỉnh và chưa có yêu cầu sửa chi tiết nào thì khối tự ẩn.
 */

"use client";

import React from "react";
import { formatNgayVN, formatSo } from "@/lib/utils/dinh-dang";
import { SU_KIEN_VIEC_DOI } from "@/lib/utils/viec-can-xu-ly-tabs";
import type { VungKhoanh } from "@/lib/anh-chinh-sua/nhan-dien";
import { trangThaiLarkTheoLanSua } from "@/lib/anh-chinh-sua/nhan-dien";
import { AnhKhoanhVung } from "@/components/features/gallery/anh-khoanh-vung";
import { cauHoiGuiKhach, ghiChuChungCuaVong } from "@/lib/anh-chinh-sua/quan-tri";

interface DuLieu {
  trangThai: string;
  guiLuc: string | null;
  anh: {
    id: string;
    fileName: string;
    width: number | null;
    height: number | null;
    chuaGui: boolean;
    goc: { id: string; fileName: string } | null;
  }[];
  soChuaGui: number;
  coTheGui: boolean;
  vongSua: {
    round: number;
    note: string;
    createdAt: string;
    resolved: boolean;
    items: { photoId: string; fileName: string; gocId: string | null; note: string; marks: VungKhoanh[]; anhMau: string[] }[];
  }[];
  tinhNang: { chiTiet: boolean };
}

export function KhoiAnhChinhSuaAdmin({
  galleryId,
  canWrite,
  onDaGui,
  onBietCoAnhChinh,
}: {
  galleryId: string;
  canWrite: boolean;
  onDaGui?: () => void | Promise<void>;
  /** Báo cho trang chi tiết: bộ có ảnh chỉnh trong app không (để ẩn khối link Drive cũ). */
  onBietCoAnhChinh?: (co: boolean | null) => void;
}) {
  const [d, setD] = React.useState<DuLieu | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [ban, setBan] = React.useState(false);
  const [thongBao, setThongBao] = React.useState<string | null>(null);
  const [hoiLai, setHoiLai] = React.useState(false);

  const tai = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/anh-chinh-sua`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Không tải được ảnh chỉnh sửa");
        return;
      }
      setLoi(null);
      setD(json.data as DuLieu);
      onBietCoAnhChinh?.((json.data as DuLieu).anh.length > 0);
    } catch {
      setLoi("Mất kết nối, thử lại giúp.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onBietCoAnhChinh là setState ổn định
  }, [galleryId]);

  React.useEffect(() => {
    void tai();
  }, [tai]);

  async function guiKhach() {
    setHoiLai(false);
    setBan(true);
    setThongBao(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/anh-chinh-sua/gui-khach`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setThongBao(json?.error?.message ?? "Gửi chưa được, thử lại giúp.");
        return;
      }
      setThongBao(`Đã gửi ${formatSo(json.data.soAnh)} ảnh cho khách duyệt. Khách nhận thông báo trên app.`);
      window.dispatchEvent(new Event(SU_KIEN_VIEC_DOI));
      await tai();
      await onDaGui?.();
    } finally {
      setBan(false);
    }
  }

  if (loi) return <p className="text-sm text-[var(--bb-danger)]">{loi}</p>;
  if (!d) return null;
  const coChiTiet = d.vongSua.some((v) => v.items.length > 0);
  if (d.anh.length === 0 && !coChiTiet) return null;

  const tenAnh = new Map(d.anh.map((a) => [a.id, a]));

  return (
    <section id="anh-chinh-sua" data-testid="khoi-anh-chinh-admin" className="rounded-lg border border-[var(--bb-border)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-medium">Ảnh chỉnh sửa ({formatSo(d.anh.length)} tấm)</h2>
          <p className="mt-1 text-sm text-[var(--bb-fg-muted)]" data-testid="trang-thai-gui-anh-chinh">
            {d.soChuaGui > 0
              ? `${formatSo(d.soChuaGui)} tấm mới chưa gửi khách — kiểm rồi bấm “Gửi khách duyệt”.`
              : d.guiLuc
                ? `Đã gửi khách lúc ${formatNgayVN(d.guiLuc)}.`
                : "Chưa gửi khách."}
          </p>
        </div>
        {canWrite && d.coTheGui && (
          <button
            type="button"
            disabled={ban}
            onClick={() => setHoiLai(true)}
            data-testid="nut-gui-khach-duyet"
            className="h-9 rounded-md bg-[var(--bb-fg)] px-4 text-sm font-medium text-[var(--bb-bg)] disabled:opacity-40"
          >
            {ban ? "Đang gửi…" : "Gửi khách duyệt"}
          </button>
        )}
      </div>
      {hoiLai && (() => {
        const cau = cauHoiGuiKhach(d.trangThai, d.anh.length);
        return (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="hoi-gui-khach-tieu-de"
            data-testid="hop-hoi-gui-khach"
            className="mt-3 rounded-md border border-[var(--bb-fg)] bg-[var(--bb-surface)] p-4 text-sm"
          >
            <p id="hoi-gui-khach-tieu-de" className="font-medium">{cau.tieuDe}</p>
            <ul className="mt-1 list-disc pl-5">
              {cau.chiTiet.map((c) => (
                <li key={c} className={cau.seXacNhanVaKhoa && c === cau.chiTiet[0] ? "font-medium text-[var(--bb-danger)]" : ""}>
                  {c}
                </li>
              ))}
            </ul>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => void guiKhach()}
                data-testid="dong-y-gui-khach"
                className="h-9 rounded-md bg-[var(--bb-fg)] px-4 font-medium text-[var(--bb-bg)]"
              >
                {cau.seXacNhanVaKhoa ? "Đồng ý, xác nhận và gửi" : "Đồng ý, gửi khách"}
              </button>
              <button
                type="button"
                onClick={() => setHoiLai(false)}
                data-testid="huy-gui-khach"
                className="h-9 rounded-md border border-[var(--bb-border)] px-4"
              >
                Huỷ
              </button>
            </div>
          </div>
        );
      })()}
      {thongBao && <p className="mt-2 text-sm">{thongBao}</p>}

      {d.anh.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {d.anh.map((a) => (
            <li key={a.id} className="text-[11px] text-[var(--bb-fg-muted)]">
              <div className="relative aspect-square overflow-hidden rounded-md bg-[var(--bb-surface-2)]">
                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive qua /api/img */}
                <img src={`/api/img/${a.id}?w=400`} alt={a.fileName} loading="lazy" className="h-full w-full object-cover" />
                {a.chuaGui && (
                  <span className="absolute left-1 top-1 rounded bg-[var(--bb-danger)] px-1.5 text-[10px] font-medium text-white">
                    Mới
                  </span>
                )}
              </div>
              <p className="mt-1 truncate" title={a.fileName}>{a.fileName}</p>
              <p className="truncate" title={a.goc?.fileName ?? ""}>
                {a.goc ? `gốc: ${a.goc.fileName}` : "chưa ghép được ảnh gốc"}
              </p>
            </li>
          ))}
        </ul>
      )}

      {d.vongSua.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {d.vongSua.map((v) => (
            <div
              key={v.round}
              data-testid="vong-sua-admin"
              className={`rounded-md border p-3 text-sm ${v.resolved ? "border-[var(--bb-border)]" : "border-[var(--bb-danger)]"}`}
            >
              <p className="font-medium">
                Khách yêu cầu sửa lần {v.round} · {formatNgayVN(v.createdAt)} ·{" "}
                {v.resolved ? "đã xử lý" : "đang chờ"}
                <span className="ml-2 text-xs font-normal text-[var(--bb-fg-muted)]">
                  Lark: {trangThaiLarkTheoLanSua(v.round).nhan}
                </span>
              </p>
              {/* BB-375 — có chi tiết từng tấm (0091) thì ghi chú của tấm đã nằm dưới ảnh;
                  ở đây chỉ còn ghi chú CHUNG, không lặp lại. */}
              {(() => {
                const chung = ghiChuChungCuaVong(
                  v.note,
                  v.items.map((it) => it.fileName),
                );
                return chung ? (
                  <p className="mt-1 whitespace-pre-line text-[var(--bb-fg-muted)]" data-testid="ghi-chu-chung-vong-sua">
                    {chung}
                  </p>
                ) : null;
              })()}
              {v.items.length > 0 && (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {v.items.map((it) => {
                    const a = tenAnh.get(it.photoId);
                    return (
                      <li key={it.photoId} data-testid="muc-sua-admin" className="rounded-md bg-[var(--bb-surface-2)] p-2">
                        <AnhKhoanhVung
                          src={`/api/img/${it.photoId}?w=800`}
                          alt={it.fileName}
                          tiLe={a?.width && a?.height ? a.height / a.width : null}
                          vung={it.marks}
                        />
                        <p className="mt-1 text-xs font-medium">{it.fileName}</p>
                        {it.note && <p className="text-sm" data-testid="ghi-chu-muc-sua">{it.note}</p>}
                        {it.marks.length > 0 && (
                          <p className="text-xs text-[var(--bb-fg-muted)]">{formatSo(it.marks.length)} vùng khoanh</p>
                        )}
                        {it.anhMau.length > 0 && (
                          <div className="mt-1 flex gap-2">
                            {it.anhMau.map((u, i) => (
                              <a key={i} href={u} target="_blank" rel="noopener noreferrer" title="Ảnh mẫu khách gửi">
                                {/* eslint-disable-next-line @next/next/no-img-element -- URL ký Storage, sống 10 phút */}
                                <img src={u} alt={`Ảnh mẫu ${i + 1}`} className="h-16 w-16 rounded object-cover" />
                              </a>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
          {!d.tinhNang.chiTiet && (
            <p className="text-xs text-[var(--bb-fg-muted)]">
              Vùng khoanh và ảnh mẫu cần áp migration 0091 — hiện chỉ lưu ghi chú chữ.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
