"use client";

/**
 * BB-395 — khối "Xác nhận bằng mã hoá đơn" (khu Tiền phát sinh). Dùng ở chi tiết bộ ảnh, tab
 * "Ảnh vượt hạn mức" và "Khách gửi ảnh chọn".
 *
 * Nhân viên nhập mã hoá đơn (thêm được nhiều mã) → "Đồng bộ từ Lark". Máy chủ đọc hoá đơn,
 * kiểm khách + điều kiện, đối chiếu từng mục, xác nhận. Khối hiện: tóm tắt hoá đơn, bảng
 * Trên hoá đơn | Khách chọn | Chênh, trạng thái bằng chữ + màu, ô "Bỏ" cho mục dư (Thiếu),
 * dòng "Còn N ảnh đã trả" + lối chọn hộ (Thừa).
 *
 * Form NHẬP TAY cũ chỉ còn trong mục "Nhập tay (dự phòng)" — và chỉ hiện khi máy chủ báo
 * người xem có quyền `thanh_toan:nhap_tay` (Admin/Quản lý). Máy chủ cũng chặn (payments/route.ts).
 */
import * as React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";

interface MucDoiChieu {
  khoa: string;
  loai: "file" | "dot" | "san_pham";
  ten: string;
  trenHoaDon: number;
  khachChon: number;
  chenh: number;
  trangThai: "khop" | "thua" | "thieu" | "them";
  tienThieu: number;
  productId: string | null;
  ghiChu?: string;
}
interface DoiChieu {
  trangThai: "khop" | "thua" | "thieu" | "hon_hop";
  muc: MucDoiChieu[];
  tienThieu: number;
  fileDaTraConLai: number;
}
interface KetQuaLuu {
  tongPhaiThu?: number;
  daThu?: number;
  conLai?: number;
  trangThaiNguon?: string;
  phieuThu?: { ma: string; soTien: number; phuongThuc: string }[];
  lyDo?: string[];
  doiChieu?: DoiChieu;
}
interface DongGan {
  id: string;
  ma: string;
  trangThai: string;
  ketQua: KetQuaLuu | null;
  epGanLyDo: string | null;
  dongBoLuc: string | null;
}
interface NhomAnh {
  dot: number;
  thieu: number;
  anh: { id: string; photoId: string; tenTep: string; tichSan: boolean }[];
}
interface DuLieu {
  hoaDon: DongGan[];
  tien: { phaiThu: number; daGhiCo: number; conThieu: number };
  quyenNhapTay: boolean;
  /** Vòng 2 — ảnh khách chọn vượt phần đã trả (tích sẵn N ảnh chọn sau cùng). */
  anhCoTheBo?: NhomAnh[];
}

/**
 * Vòng 2 (anh chốt "tích chọn bỏ") — danh sách ảnh thu nhỏ + tên tệp, TÍCH SẴN N ảnh chọn sau
 * cùng; nhân viên đổi tích được. Nút chỉ bật khi mỗi nhóm tích 1…N ảnh; tích ít hơn N thì hiện
 * "còn thiếu". Bỏ = bỏ khỏi lượt chọn (máy chủ ghi nhật ký kèm id ảnh).
 */
function DanhSachAnhBo({ nhom, busy, onBo }: { nhom: NhomAnh[]; busy: boolean; onBo: (ids: string[]) => void }) {
  const [tich, setTich] = React.useState<Record<string, boolean>>({});
  React.useEffect(() => {
    const dau: Record<string, boolean> = {};
    for (const n of nhom) for (const a of n.anh) dau[a.id] = a.tichSan;
    setTich(dau);
  }, [nhom]);
  const daTich = nhom.flatMap((n) => n.anh.filter((a) => tich[a.id]).map((a) => a.id));
  const quaSo = nhom.some((n) => n.anh.filter((a) => tich[a.id]).length > n.thieu);
  return (
    <div data-testid="ds-anh-bo" className="mt-3">
      {nhom.map((n) => {
        const soTich = n.anh.filter((a) => tich[a.id]).length;
        return (
          <div key={n.dot} className="mt-2" data-testid="nhom-anh-bo" data-dot={n.dot}>
            <p className="text-xs">
              {n.dot === 1 ? "Ảnh đợt 1" : `Ảnh đợt ${n.dot}`} khách chọn vượt phần đã trả — cần bỏ <strong>{n.thieu}</strong> ảnh
              (đã tích {soTich}
              {soTich < n.thieu ? `, còn thiếu ${n.thieu - soTich}` : soTich > n.thieu ? `, nhiều hơn ${soTich - n.thieu}` : ""}).
            </p>
            <ul className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {n.anh.map((a) => (
                <li key={a.id}>
                  <label className="flex cursor-pointer flex-col gap-1 rounded-md border border-[var(--bb-border)] p-1 text-[11px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/img/${a.photoId}?w=200`} alt="" className="aspect-square w-full rounded object-cover" />
                    <span className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        name={`bo-anh-${a.id}`}
                        data-testid="tich-bo-anh"
                        checked={Boolean(tich[a.id])}
                        onChange={(e) => setTich((cu) => ({ ...cu, [a.id]: e.target.checked }))}
                      />
                      <span className="truncate">{a.tenTep || "ảnh"}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <button
        type="button"
        data-testid="nut-bo-anh"
        disabled={busy || daTich.length === 0 || quaSo}
        className={`${NUT} mt-2`}
        onClick={() => onBo(daTich)}
      >
        Bỏ {daTich.length} ảnh đã tích
      </button>
      {quaSo && <p className="mt-1 text-xs text-[var(--bb-danger)]">Tích nhiều hơn số cần bỏ — bỏ bớt tích giúp.</p>}
    </div>
  );
}

const NHAN_TRANG_THAI: Record<string, { chu: string; lop: string }> = {
  khop: { chu: "Khớp", lop: "bg-[var(--bb-success-bg,#e7f6ec)] text-[var(--bb-success,#17663a)]" },
  thua: { chu: "Thừa", lop: "bg-[var(--bb-warning-bg,#fff6e0)] text-[var(--bb-warning,#8a5a00)]" },
  thieu: { chu: "Thiếu", lop: "bg-[var(--bb-danger-bg,#fdecec)] text-[var(--bb-danger,#b42318)]" },
  hon_hop: { chu: "Thừa + thiếu", lop: "bg-[var(--bb-danger-bg,#fdecec)] text-[var(--bb-danger,#b42318)]" },
  them: { chu: "Thêm vào bộ", lop: "bg-[var(--bb-surface-2)] text-[var(--bb-fg)]" },
  chua_du_dieu_kien: { chu: "Chưa đủ điều kiện", lop: "bg-[var(--bb-surface-2)] text-[var(--bb-fg-muted)]" },
  cho_dong_bo: { chu: "Chờ đồng bộ", lop: "bg-[var(--bb-surface-2)] text-[var(--bb-fg-muted)]" },
};

function Nhan({ tt }: { tt: string }) {
  const n = NHAN_TRANG_THAI[tt] ?? { chu: tt, lop: "bg-[var(--bb-surface-2)]" };
  return (
    <span data-testid="nhan-trang-thai-hoa-don" data-trang-thai={tt} className={`rounded px-1.5 py-0.5 text-xs font-medium ${n.lop}`}>
      {n.chu}
    </span>
  );
}

const NUT = "inline-flex h-8 items-center rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium hover:bg-[var(--bb-surface-2)] disabled:opacity-50";
const NUT_CHINH = "inline-flex h-8 items-center rounded-md bg-[var(--bb-fg)] px-3 text-xs font-medium text-[var(--bb-bg)] disabled:opacity-50";

interface UngVien {
  galleryId: string;
  tieuDe: string;
  fileCho: number;
  diem: number;
  lyDo: string[];
}

/**
 * BB-395 — gán hoá đơn từ CẤP KHÁCH (một khách nhiều bộ): nhập mã → app liệt kê các bộ của
 * khách đó, GỢI Ý bộ khớp nhất; nhân viên BẤM chọn (không bao giờ tự gán âm thầm, kể cả khi
 * chỉ có một bộ — vẫn một chạm xác nhận). Gán thật đi qua `POST …/[id]/hoa-don` (kiểm khách lại).
 */
export function GanHoaDonTheoKhach({
  onDaGan,
  customerId,
}: {
  onDaGan?: () => void | Promise<void>;
  /** Trang khách hàng: chỉ bộ của khách này; hoá đơn của khách khác → báo rõ. */
  customerId?: string;
}) {
  const [ma, setMa] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [kq, setKq] = React.useState<{ ma: string; ds: UngVien[]; goiY: string | null; daGanCho: string | null; lyDoChuaDu: string[] } | null>(null);
  const [daGan, setDaGan] = React.useState<string | null>(null);
  const [canXacNhanHauKy, setCanXacNhanHauKy] = React.useState<string | null>(null);

  async function tim() {
    setBusy(true);
    setLoi(null);
    setKq(null);
    setDaGan(null);
    try {
      const res = await fetch("/api/admin/hoa-don/goi-y", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ma: ma.trim(), ...(customerId ? { customerId } : {}) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) {
        setLoi(body?.error?.message ?? "Không tìm được hoá đơn.");
        return;
      }
      const d = body.data;
      setKq({ ma: d.hoaDon.ma, ds: d.ds, goiY: d.goiY, daGanCho: d.daGanCho, lyDoChuaDu: d.hoaDon.lyDoChuaDu ?? [] });
    } catch {
      setLoi("Mất kết nối, thử lại giúp.");
    } finally {
      setBusy(false);
    }
  }

  async function gan(galleryId: string, xacNhanHauKy = false) {
    if (!kq) return;
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/hoa-don`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ma: kq.ma, xacNhanHauKy }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        if (body?.error?.details?.canXacNhanHauKy) setCanXacNhanHauKy(galleryId);
        setLoi(body?.error?.message ?? "Không gán được.");
        return;
      }
      setCanXacNhanHauKy(null);
      setDaGan(body?.data?.ketQua?.message ?? "Đã gán và đồng bộ.");
      await onDaGan?.();
    } catch {
      setLoi("Mất kết nối, thử lại giúp.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="gan-hoa-don-theo-khach" className="rounded-md border border-[var(--bb-border)] p-3">
      <h3 className="text-sm font-medium">Gán mã hoá đơn theo khách</h3>
      <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
        Nhập mã hoá đơn — app tìm các bộ ảnh của đúng khách trên hoá đơn và gợi ý bộ khớp nhất. Bấm chọn bộ để gán.
      </p>
      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (ma.trim()) void tim();
        }}
      >
        <input
          name="maHoaDonTheoKhach"
          data-testid="o-ma-hoa-don-theo-khach"
          value={ma}
          onChange={(e) => setMa(e.target.value)}
          placeholder="HD_20260910#5071"
          className="h-8 w-52 rounded-md border border-[var(--bb-border)] bg-transparent px-2 text-sm"
          autoComplete="off"
        />
        <button type="submit" disabled={busy || !ma.trim()} className={NUT_CHINH} data-testid="nut-tim-bo-theo-hoa-don">
          {busy ? "Đang tìm…" : "Tìm bộ ảnh"}
        </button>
      </form>
      {loi && <p className="mt-2 text-xs text-[var(--bb-danger)]">{loi}</p>}
      {daGan && (
        <p role="status" className="mt-2 text-xs">
          {daGan}
        </p>
      )}
      {kq && (
        <div className="mt-2 text-xs">
          {kq.lyDoChuaDu.map((l) => (
            <p key={l} className="text-[var(--bb-danger)]">
              {l}
            </p>
          ))}
          {kq.daGanCho && <p className="text-[var(--bb-fg-muted)]">Mã này đã gán cho một bộ — bấm bộ đó để đồng bộ lại.</p>}
          {kq.ds.length === 0 ? (
            <p>Khách này chưa có bộ ảnh nào bạn xem được.</p>
          ) : (
            <ul className="mt-1 flex flex-col gap-1" data-testid="ds-bo-ung-vien">
              {kq.ds.map((b) => (
                <li key={b.galleryId} data-testid="bo-ung-vien" data-goi-y={b.galleryId === kq.goiY ? "1" : "0"} className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--bb-surface-2)] p-2">
                  <span className="font-medium">{b.tieuDe}</span>
                  {b.galleryId === kq.goiY && <span className="rounded bg-[var(--bb-fg)] px-1.5 text-[var(--bb-bg)]">Gợi ý</span>}
                  {kq.daGanCho === b.galleryId && <span className="text-[var(--bb-fg-muted)]">đang gán</span>}
                  <span className="text-[var(--bb-fg-muted)]">{b.fileCho} file chờ{b.lyDo.length > 0 ? ` · ${b.lyDo.join(" · ")}` : ""}</span>
                  <button
                    type="button"
                    disabled={busy || (kq.daGanCho !== null && kq.daGanCho !== b.galleryId)}
                    className={`${NUT} ml-auto`}
                    onClick={() => void gan(b.galleryId, canXacNhanHauKy === b.galleryId)}
                  >
                    {canXacNhanHauKy === b.galleryId ? "Đúng bộ này, gán tiếp" : "Gán vào bộ này"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function KhoiHoaDon({
  galleryId,
  onDaDongBo,
  nhapTay,
}: {
  galleryId: string;
  /** Gọi sau khi đồng bộ/bỏ mục/gỡ gán xong — màn cha tải lại số tiền, hạn mức. */
  onDaDongBo?: () => void | Promise<void>;
  /** Form nhập tay cũ — chỉ hiện khi người xem có quyền dự phòng. */
  nhapTay?: React.ReactNode;
}) {
  const [duLieu, setDuLieu] = React.useState<DuLieu | null>(null);
  const [loiTai, setLoiTai] = React.useState<string | null>(null);
  const [ma, setMa] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [thongBao, setThongBao] = React.useState<{ ok: boolean; cau: string; canhBao?: string[] } | null>(null);
  const [canXacNhanHauKy, setCanXacNhanHauKy] = React.useState<string | null>(null);
  const [epGan, setEpGan] = React.useState<{ ma: string; lyDo: string } | null>(null);
  const [tichBo, setTichBo] = React.useState<Record<string, boolean>>({});
  const [goGan, setGoGan] = React.useState<{ ma: string; lyDo: string } | null>(null);
  const duongDan = `/api/admin/galleries/${encodeURIComponent(galleryId)}/hoa-don`;

  const tai = React.useCallback(async () => {
    try {
      const res = await fetch(duongDan, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) {
        setLoiTai(body?.error?.message ?? "Không tải được hoá đơn của bộ ảnh.");
        return;
      }
      setLoiTai(null);
      setDuLieu(body.data as DuLieu);
    } catch {
      setLoiTai("Không tải được hoá đơn của bộ ảnh.");
    }
  }, [duongDan]);

  React.useEffect(() => {
    void tai();
  }, [tai]);

  async function gui(than: Record<string, unknown>, method: "POST" | "DELETE" = "POST") {
    setBusy(true);
    setThongBao(null);
    try {
      const res = await fetch(duongDan, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(than),
      });
      const body = await res.json().catch(() => null);
      const tt = (body?.data ?? body?.error?.details?.trangThai) as DuLieu | undefined;
      if (tt?.hoaDon) setDuLieu(tt);
      if (!res.ok) {
        const d = body?.error?.details ?? {};
        if (d.canXacNhanHauKy) setCanXacNhanHauKy(String(than.ma ?? ""));
        if (d.choPhepEpGan) setEpGan({ ma: String(than.ma ?? ""), lyDo: "" });
        setThongBao({ ok: false, cau: body?.error?.message ?? "Không đồng bộ được. Thử lại giúp." });
        return;
      }
      setCanXacNhanHauKy(null);
      setEpGan(null);
      setGoGan(null);
      setTichBo({});
      setMa("");
      const kq = body?.data?.ketQua;
      setThongBao({ ok: true, cau: kq?.message ?? body?.data?.message ?? "Đã cập nhật.", canhBao: kq?.canhBao ?? [] });
      await onDaDongBo?.();
    } catch {
      setThongBao({ ok: false, cau: "Mất kết nối — chưa có gì được ghi. Thử lại giúp." });
    } finally {
      setBusy(false);
    }
  }

  async function moTrangKhach() {
    try {
      const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/link-khach`, { cache: "no-store" });
      const body = await res.json().catch(() => null);
      const url: string | undefined = body?.data?.shareUrl ?? (body?.data?.duongDan ? `${window.location.origin}${body.data.duongDan}` : undefined);
      if (!res.ok || !url) {
        setThongBao({ ok: false, cau: body?.error?.message ?? "Không lấy được link khách." });
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch {
      setThongBao({ ok: false, cau: "Không lấy được link khách." });
    }
  }

  const dongMoiNhat = duLieu?.hoaDon.filter((h) => h.ketQua?.doiChieu).at(-1);
  const doiChieu = dongMoiNhat?.ketQua?.doiChieu ?? null;
  const mucTich = (doiChieu?.muc ?? []).filter((m) => m.trangThai === "thieu" && tichBo[m.khoa]);

  return (
    <div data-testid="khoi-hoa-don" className="mt-3 rounded-md border border-[var(--bb-border)] p-3">
      <h3 className="text-sm font-medium">Xác nhận bằng mã hoá đơn</h3>
      <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
        Đủ điều kiện = hoá đơn có phiếu thu và Còn Lại ≤ 0. Nhiều mã của một bộ được cộng dồn.
      </p>

      <form
        className="mt-2 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void gui(ma.trim() ? { ma: ma.trim() } : {});
        }}
      >
        <label className="sr-only" htmlFor={`ma-hoa-don-${galleryId}`}>
          Mã hoá đơn
        </label>
        <input
          id={`ma-hoa-don-${galleryId}`}
          name="maHoaDon"
          data-testid="o-ma-hoa-don"
          value={ma}
          onChange={(e) => setMa(e.target.value)}
          placeholder="HD_20260910#5071"
          className="h-8 w-52 rounded-md border border-[var(--bb-border)] bg-transparent px-2 text-sm"
          autoComplete="off"
        />
        <button type="submit" data-testid="nut-dong-bo-hoa-don" disabled={busy || (!ma.trim() && !duLieu?.hoaDon.length)} className={NUT_CHINH}>
          {busy ? "Đang đồng bộ…" : "Đồng bộ từ Lark"}
        </button>
      </form>

      {loiTai && <p className="mt-2 text-xs text-[var(--bb-danger)]">{loiTai}</p>}

      {canXacNhanHauKy && (
        <div data-testid="canh-bao-hau-ky" className="mt-2 rounded-md bg-[var(--bb-warning-bg,#fff6e0)] p-2 text-xs text-[var(--bb-warning,#8a5a00)]">
          Hoá đơn trỏ tới dòng Hậu Kỳ của một bộ khác cùng khách. Chắc chắn đúng bộ này?{" "}
          <button type="button" disabled={busy} className={NUT} onClick={() => void gui({ ma: canXacNhanHauKy, xacNhanHauKy: true })}>
            Đúng bộ này, gán tiếp
          </button>
        </div>
      )}

      {epGan && duLieu?.quyenNhapTay && (
        <div data-testid="khoi-ep-gan" className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <input
            name="lyDoEpGan"
            value={epGan.lyDo}
            onChange={(e) => setEpGan({ ...epGan, lyDo: e.target.value })}
            placeholder="Lý do ép gán (bắt buộc)"
            className="h-8 w-64 rounded-md border border-[var(--bb-border)] bg-transparent px-2"
          />
          <button
            type="button"
            disabled={busy || epGan.lyDo.trim().length < 3}
            className={NUT}
            onClick={() => void gui({ ma: epGan.ma, epGanLyDo: epGan.lyDo.trim(), xacNhanHauKy: true })}
          >
            Ép gán (Admin/Quản lý)
          </button>
        </div>
      )}

      {thongBao && (
        <div role="status" data-testid="thong-bao-hoa-don" className={`mt-2 text-xs ${thongBao.ok ? "" : "text-[var(--bb-danger)]"}`}>
          {thongBao.cau}
          {(thongBao.canhBao ?? []).map((c) => (
            <p key={c} className="text-[var(--bb-warning,#8a5a00)]">
              {c}
            </p>
          ))}
        </div>
      )}

      {(duLieu?.hoaDon ?? []).length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="ds-hoa-don">
          {duLieu!.hoaDon.map((h) => (
            <li key={h.id} className="rounded-md bg-[var(--bb-surface-2)] p-2 text-xs" data-testid="dong-hoa-don" data-ma={h.ma}>
              <div className="flex flex-wrap items-center gap-2">
                <strong className="text-sm">{h.ma}</strong>
                <Nhan tt={h.trangThai} />
                {h.epGanLyDo && <span className="text-[var(--bb-fg-muted)]">ép gán: {h.epGanLyDo}</span>}
                {duLieu!.quyenNhapTay && (
                  <button type="button" className="ml-auto underline" onClick={() => setGoGan({ ma: h.ma, lyDo: "" })}>
                    Gỡ gán
                  </button>
                )}
              </div>
              {h.ketQua && (
                <p className="mt-1">
                  Tổng {formatCurrencyVND(h.ketQua.tongPhaiThu ?? 0)} · đã thu {formatCurrencyVND(h.ketQua.daThu ?? 0)} · còn lại{" "}
                  {formatCurrencyVND(h.ketQua.conLai ?? 0)}
                  {(h.ketQua.phieuThu ?? []).length > 0 && (
                    <> · phiếu thu {(h.ketQua.phieuThu ?? []).map((p) => `${p.ma} (${p.phuongThuc})`).join(", ")}</>
                  )}
                </p>
              )}
              {(h.ketQua?.lyDo ?? []).map((l) => (
                <p key={l} className="mt-1 text-[var(--bb-danger)]">
                  {l}
                </p>
              ))}
              {goGan?.ma === h.ma && (
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input
                    name="lyDoGoGan"
                    value={goGan.lyDo}
                    onChange={(e) => setGoGan({ ...goGan, lyDo: e.target.value })}
                    placeholder="Lý do gỡ gán (bắt buộc)"
                    className="h-7 w-56 rounded-md border border-[var(--bb-border)] bg-transparent px-2"
                  />
                  <button
                    type="button"
                    disabled={busy || goGan.lyDo.trim().length < 3}
                    className={NUT}
                    onClick={() => void gui({ ma: h.ma, lyDo: goGan.lyDo.trim() }, "DELETE")}
                  >
                    Xác nhận gỡ
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {doiChieu && (
        <div className="mt-3" data-testid="bang-doi-chieu">
          <div className="flex items-center gap-2 text-xs">
            Đối chiếu: <Nhan tt={doiChieu.trangThai} />
          </div>
          <table className="mt-1 w-full text-xs">
            <thead className="text-left text-[var(--bb-fg-muted)]">
              <tr>
                <th className="py-1 font-normal">Mục</th>
                <th className="py-1 text-right font-normal">Trên hoá đơn</th>
                <th className="py-1 text-right font-normal">Khách chọn</th>
                <th className="py-1 text-right font-normal">Chênh</th>
                <th className="py-1 pl-2 font-normal">Trạng thái</th>
                <th className="py-1 pl-2 font-normal">Bỏ</th>
              </tr>
            </thead>
            <tbody>
              {doiChieu.muc.map((m) => (
                <tr key={m.khoa} data-testid="dong-doi-chieu" data-khoa={m.khoa} className="border-t border-[var(--bb-border)]">
                  <td className="py-1">{m.ten}</td>
                  <td className="py-1 text-right">{m.trenHoaDon}</td>
                  <td className="py-1 text-right">{m.khachChon}</td>
                  <td className="py-1 text-right">
                    {m.chenh > 0 ? `+${m.chenh}` : m.chenh}
                    {m.tienThieu > 0 && (
                      <span className="text-[var(--bb-danger)]">
                        {" "}
                        ({formatCurrencyVND(m.tienThieu)}
                        {m.ghiChu ? `, ${m.ghiChu}` : ""})
                      </span>
                    )}
                  </td>
                  <td className="py-1 pl-2">
                    <Nhan tt={m.trangThai} />
                  </td>
                  <td className="py-1 pl-2">
                    {/* Ảnh dư (đợt 1 / đợt ≥ 2) bỏ bằng danh sách tích ảnh bên dưới; ô này chỉ cho sản phẩm. */}
                    {m.trangThai === "thieu" && m.loai === "san_pham" && m.productId && (
                      <input
                        type="checkbox"
                        name={`bo-${m.khoa}`}
                        aria-label={`Bỏ ${-m.chenh} ${m.ten}`}
                        checked={Boolean(tichBo[m.khoa])}
                        onChange={(e) => setTichBo((cu) => ({ ...cu, [m.khoa]: e.target.checked }))}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {doiChieu.tienThieu > 0 && (
            <p className="mt-1 text-xs text-[var(--bb-danger)]">
              Khách chọn nhiều hơn hoá đơn: thiếu {formatCurrencyVND(doiChieu.tienThieu)}. Liên hệ khách rồi tích bỏ mục dư, hoặc gán
              thêm mã hoá đơn bổ sung.
            </p>
          )}
          {(duLieu?.anhCoTheBo ?? []).length > 0 && (
            <DanhSachAnhBo nhom={duLieu!.anhCoTheBo!} busy={busy} onBo={(ids) => void gui({ hanhDong: "bo_anh", anh: ids })} />
          )}
          {mucTich.length > 0 && (
            <button
              type="button"
              data-testid="nut-bo-muc"
              disabled={busy}
              className={`${NUT} mt-2`}
              onClick={() =>
                void gui({
                  hanhDong: "bo_muc",
                  muc: mucTich.map((m) => ({ khoa: m.khoa, soLuong: -m.chenh, productId: m.productId })),
                })
              }
            >
              Bỏ mục đã tích
            </button>
          )}
          {doiChieu.fileDaTraConLai > 0 && (
            <p data-testid="con-anh-da-tra" className="mt-2 text-xs">
              Còn <strong>{doiChieu.fileDaTraConLai}</strong> ảnh đã trả — chờ khách chọn.{" "}
              <button type="button" className="underline" onClick={() => void moTrangKhach()}>
                Mở trang khách để chọn hộ
              </button>
            </p>
          )}
        </div>
      )}

      {duLieu?.quyenNhapTay && nhapTay && (
        <details data-testid="nhap-tay-du-phong" className="mt-3">
          <summary className="cursor-pointer text-xs text-[var(--bb-fg-muted)]">Nhập tay (dự phòng — Admin/Quản lý, bắt ghi lý do)</summary>
          {nhapTay}
        </details>
      )}
    </div>
  );
}
