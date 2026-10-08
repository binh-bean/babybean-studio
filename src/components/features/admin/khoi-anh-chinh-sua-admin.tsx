/**
 * BB-371 — khối "Ảnh chỉnh sửa" ở trang chi tiết bộ ảnh (quản trị).
 *
 *   · ảnh trong thư mục ảnh chỉnh sửa của link Drive, tấm nào MỚI chưa gửi khách,
 *     ảnh gốc ghép theo tên;
 *   · nút "Gửi khách duyệt" — chỉ sau nút này khách mới thấy ảnh chỉnh;
 *   · các lần khách xin sửa: từng tấm, ghi chú, vùng khoanh (vẽ đè lên ảnh), ảnh
 *     mẫu (qua route cùng origin `…/anh-chinh-sua/anh-mau`, xét quyền mỗi lần xem).
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
    khoa: string;
    goc: { id: string; fileName: string } | null;
  }[];
  soChuaGui: number;
  coTheGui: boolean;
  theoDot: boolean;
  nhom: NhomDot[];
  vongSua: {
    round: number;
    note: string;
    createdAt: string;
    resolved: boolean;
    khoa: string;
    nhan: string;
    deXuatBoi: string | null;
    items: {
      photoId: string;
      fileName: string;
      gocId: string | null;
      nhan: string;
      deXuatBoi: string | null;
      note: string;
      marks: VungKhoanh[];
      anhMau: string[];
    }[];
  }[];
  tinhNang: { chiTiet: boolean; theoDot: boolean };
  /**
   * BB-401 vòng 2 — tấm khách đã bấm "Duyệt tấm này" (còn hiệu lực trong vòng gửi hiện tại).
   * `null`/thiếu = chưa áp migration 0108.
   */
  duyetTam?: {
    tong: number;
    daDuyet: { photoId: string; fileName: string; nhan: string; duyetLuc: string }[];
  } | null;
  /** BB-384 — số ảnh chỉnh trong gói khách đang thấy trong app. */
  soAnhKhachThay?: number;
  /** BB-384 — "Khách chưa xem được ảnh chỉnh — …" khi bộ ở bước duyệt mà khách không thấy tấm nào. */
  canhBao?: string | null;
}

interface NhomDot {
  khoa: string;
  nhan: string;
  deXuatBoi: string | null;
  soAnh: number;
  soChuaGui: number;
  trangThai: "chua_gui" | "cho_duyet" | "dang_sua" | "da_duyet";
  guiLuc: string | null;
  duyetLuc: string | null;
  coTheGui: boolean | null;
}

const CHU_TRANG_THAI_DOT: Record<NhomDot["trangThai"], string> = {
  chua_gui: "Chưa gửi khách",
  cho_duyet: "Chờ khách duyệt",
  dang_sua: "Khách yêu cầu sửa",
  da_duyet: "Khách đã duyệt",
};

export function KhoiAnhChinhSuaAdmin({
  galleryId,
  canWrite,
  onDaGui,
  onBietCoAnhChinh,
  onDongBo,
}: {
  galleryId: string;
  canWrite: boolean;
  /** BB-384 — kéo ảnh từ Drive (cả thư mục con "ảnh chỉnh sửa") — nút trong cảnh báo. */
  onDongBo?: () => void | Promise<void>;
  onDaGui?: () => void | Promise<void>;
  /** Báo cho trang chi tiết: bộ có ảnh chỉnh trong app không (để ẩn khối link Drive cũ). */
  onBietCoAnhChinh?: (co: boolean | null) => void;
}) {
  const [d, setD] = React.useState<DuLieu | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [ban, setBan] = React.useState(false);
  const [thongBao, setThongBao] = React.useState<string | null>(null);
  const [hoiLai, setHoiLai] = React.useState(false);
  /** BB-377 — đợt mua thêm CSKH đang định gửi (hộp hỏi lại). */
  const [hoiDot, setHoiDot] = React.useState<NhomDot | null>(null);

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

  async function guiKhach(dot?: NhomDot) {
    setHoiLai(false);
    setHoiDot(null);
    setBan(true);
    setThongBao(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/anh-chinh-sua/gui-khach`, {
        method: "POST",
        ...(dot ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ khoa: dot.khoa }) } : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setThongBao(json?.error?.message ?? "Gửi chưa được, thử lại giúp.");
        return;
      }
      setThongBao(
        dot
          ? `Đã gửi ${formatSo(json.data.soAnh)} ảnh ${dot.nhan} cho khách duyệt. Khách nhận thông báo trên app.`
          : `Đã gửi ${formatSo(json.data.soAnh)} ảnh cho khách duyệt. Khách nhận thông báo trên app.`,
      );
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
  // BB-384 — bộ ở bước khách duyệt mà khách không thấy ảnh chỉnh nào trong app.
  const canhBao = d.canhBao ? (
    <div
      role="alert"
      data-testid="canh-bao-khach-chua-xem-anh-chinh"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--bb-danger)] p-3 text-sm"
    >
      <p className="min-w-0 flex-1 font-medium text-[var(--bb-danger)]">{d.canhBao}</p>
      {canWrite && onDongBo && (
        <button
          type="button"
          disabled={ban}
          onClick={() => void onDongBo()}
          data-testid="nut-dong-bo-tu-canh-bao"
          className="h-8 rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium disabled:opacity-40"
        >
          Đồng bộ ảnh
        </button>
      )}
    </div>
  ) : null;
  if (d.anh.length === 0 && !coChiTiet) {
    return canhBao ? (
      <section id="anh-chinh-sua" data-testid="khoi-anh-chinh-admin" className="rounded-lg border border-[var(--bb-border)] p-4">
        <h2 className="text-base font-medium">Ảnh chỉnh sửa (0 tấm)</h2>
        {canhBao}
      </section>
    ) : null;
  }

  const tenAnh = new Map(d.anh.map((a) => [a.id, a]));
  const coMuaThem = d.nhom.some((n) => n.khoa !== "goc") || d.vongSua.some((v) => v.khoa !== "goc");

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
      {canhBao}
      {hoiLai && (() => {
        const cau = cauHoiGuiKhach(d.trangThai, d.theoDot ? d.anh.filter((a) => a.khoa === "goc").length : d.anh.length);
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

      {coMuaThem && !d.theoDot && (
        <p className="mt-2 text-xs text-[var(--bb-fg-muted)]" data-testid="goi-y-0095">
          Gửi riêng từng đợt mua thêm cần áp migration 0095 — hiện nút “Gửi khách duyệt” gửi chung cả bộ.
        </p>
      )}
      {hoiDot && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="hoi-gui-dot-tieu-de"
          data-testid="hop-hoi-gui-dot"
          className="mt-3 rounded-md border border-[var(--bb-fg)] bg-[var(--bb-surface)] p-4 text-sm"
        >
          <p id="hoi-gui-dot-tieu-de" className="font-medium">Gửi ảnh {hoiDot.nhan} cho khách duyệt?</p>
          <p className="mt-1">
            Khách sẽ thấy {formatSo(hoiDot.soAnh)} ảnh chỉnh của {hoiDot.nhan} ngay trong app và nhận thông báo. Trạng
            thái bộ ảnh giữ nguyên.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void guiKhach(hoiDot)}
              data-testid="dong-y-gui-dot"
              className="h-9 rounded-md bg-[var(--bb-fg)] px-4 font-medium text-[var(--bb-bg)]"
            >
              Đồng ý, gửi khách
            </button>
            <button type="button" onClick={() => setHoiDot(null)} className="h-9 rounded-md border border-[var(--bb-border)] px-4">
              Huỷ
            </button>
          </div>
        </div>
      )}

      {d.nhom.map((n) => (
        <div key={n.khoa} className="mt-3" data-testid="nhom-anh-chinh-admin" data-khoa={n.khoa}>
          {coMuaThem && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {n.nhan} ({formatSo(n.soAnh)} tấm)
                {n.deXuatBoi && (
                  <span className="ml-2 text-xs font-normal text-[var(--bb-fg-muted)]">đề xuất bởi {n.deXuatBoi}</span>
                )}
                {(d.theoDot || n.khoa === "goc") && (
                  <span className="ml-2 text-xs font-normal text-[var(--bb-fg-muted)]" data-testid="trang-thai-nhom">
                    {n.soChuaGui > 0 ? `${formatSo(n.soChuaGui)} tấm mới chưa gửi` : CHU_TRANG_THAI_DOT[n.trangThai]}
                  </span>
                )}
              </p>
              {canWrite && d.theoDot && n.coTheGui && (
                <button
                  type="button"
                  disabled={ban}
                  onClick={() => setHoiDot(n)}
                  data-testid="nut-gui-dot"
                  className="h-8 rounded-md bg-[var(--bb-fg)] px-3 text-xs font-medium text-[var(--bb-bg)] disabled:opacity-40"
                >
                  Gửi khách duyệt {n.nhan}
                </button>
              )}
            </div>
          )}
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {d.anh.filter((a) => a.khoa === n.khoa).map((a) => (
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
        </div>
      ))}

      {/* BB-401 vòng 2 — thợ/CSKH biết khách đã ưng những tấm nào (đừng đụng khi sửa). */}
      {d.duyetTam && d.duyetTam.tong > 0 && (
        <div className="mt-4 rounded-md border border-[var(--bb-border)] p-3 text-sm" data-testid="duyet-tam-admin">
          <p className="font-medium" data-testid="dem-duyet-tam-admin">
            Khách đã duyệt {formatSo(d.duyetTam.daDuyet.length)}/{formatSo(d.duyetTam.tong)} tấm
          </p>
          {d.duyetTam.daDuyet.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">
              {d.duyetTam.daDuyet.map((x) => (
                <li
                  key={x.photoId}
                  data-testid="tam-da-duyet-admin"
                  className="rounded-full bg-[var(--bb-surface-2)] px-2.5 py-0.5 text-xs"
                  title={`Duyệt lúc ${formatNgayVN(x.duyetLuc)}`}
                >
                  ✓ {x.fileName}
                  {coMuaThem ? ` · ${x.nhan}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
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
                {coMuaThem && (
                  <span className="ml-2 text-xs font-normal" data-testid="dot-vong-sua">
                    · {v.nhan}
                    {v.deXuatBoi ? ` · đề xuất bởi ${v.deXuatBoi}` : ""}
                  </span>
                )}
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
                        {coMuaThem && (
                          <p className="text-xs text-[var(--bb-fg-muted)]" data-testid="dot-muc-sua">
                            {it.nhan}
                            {it.deXuatBoi ? ` · đề xuất bởi ${it.deXuatBoi}` : ""}
                          </p>
                        )}
                        {it.note && <p className="text-sm" data-testid="ghi-chu-muc-sua">{it.note}</p>}
                        {it.marks.length > 0 && (
                          <p className="text-xs text-[var(--bb-fg-muted)]">{formatSo(it.marks.length)} vùng khoanh</p>
                        )}
                        {it.anhMau.length > 0 && (
                          // BB-401 — ảnh minh hoạ khách tải lên khi bấm "Cần sửa tấm này" (bấm để mở to).
                          <div className="mt-1" data-testid="anh-minh-hoa-admin">
                            <p className="text-xs text-[var(--bb-fg-muted)]">
                              Ảnh minh hoạ khách gửi ({formatSo(it.anhMau.length)})
                            </p>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {it.anhMau.map((u, i) => (
                                <a key={i} href={u} target="_blank" rel="noopener noreferrer" title="Ảnh minh hoạ khách gửi">
                                  {/* eslint-disable-next-line @next/next/no-img-element -- ảnh mẫu qua route quản trị cùng origin (bucket riêng tư) */}
                                  <img src={u} alt={`Ảnh minh hoạ ${i + 1}`} className="h-20 w-20 rounded object-cover" />
                                </a>
                              ))}
                            </div>
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
