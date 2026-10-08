"use client";

/**
 * Tab "Khách gửi ảnh chọn" ở /admin/viec-can-xu-ly — BB-337 mục 1.
 *
 * Chủ studio 01/10/2026: Việc cần xử lý thiếu mục "Khách gửi ảnh chọn". Một khách
 * có thể CÙNG LÚC vừa gửi danh sách, vừa mua thêm, vừa nhờ studio chọn giúp —
 * nên MỖI BỘ ẢNH MỘT DÒNG (route gom sẵn: `boAnh`, `src/lib/gallery/khach-gui-anh-chon.ts`).
 *
 * Bấm "Xử lý" mở ngăn chi tiết có ĐỦ công cụ để xong việc, toàn bộ là route có sẵn:
 *   · Đợt 1: Xác nhận (POST /confirm, BB-114) / Từ chối có lý do (POST /reopen);
 *   · Đợt mua thêm: `NutXuLyDot` (BB-321);
 *   · Studio chọn giúp: POST /studio-chon-giup (BB-337, migration 0082);
 *   · Xác nhận thanh toán: `PaymentForm` + `ghiThanhToan` (BB-320/BB-331);
 *   · Xuất danh sách: GET /export (cả bộ / chỉ đợt N);
 *   · Nhắn khách: `NutNhanKhach` (BB-331).
 * Xử lý xong việc cuối cùng thì dòng rời danh sách và số trên menu đếm lại
 * (`SU_KIEN_VIEC_DOI`).
 */

import React from "react";
import Link from "next/link";
import { formatGioVN, formatNgayVN, formatSo } from "@/lib/utils/dinh-dang";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { SU_KIEN_VIEC_DOI } from "@/lib/utils/viec-can-xu-ly-tabs";
import { useCapNhatTucThi } from "@/lib/utils/use-cap-nhat-tuc-thi";
import { NutXuLyDot, dongTomTatDot } from "./dot-chon-admin";
import { PaymentForm, cauSauKhiThu, ghiThanhToan, type TuyChonXacNhan } from "./form-thanh-toan";
import { KhoiHoaDon } from "./khoi-hoa-don";
import type { KhoaKhiThu } from "@/lib/gallery/khoa-khi-thu";
import { NutNhanKhach } from "./nut-nhan-khach";
import { NutXuLyDatChinhSua } from "./tim-gia-dinh-admin";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";
import { NhanNhaBoAnh } from "./nhan-nha-bo-anh";
import { NhanLamNhanh } from "./nhan-lam-nhanh";
import { xepLamNhanhLenDau } from "@/lib/dich-vu/lam-anh-nhanh";
import type { NhaCuaBo } from "@/lib/gia-dinh/nha-cua-bo";

interface DotMuaThemCho {
  soDot: number;
  soAnh: number;
  tong: number;
  soSanPhamInChuaAnh: number;
  submittedAt: string | null;
  sanPham: Array<{ ten: string; soLuong: number }>;
}

export interface DongKhachGuiView {
  galleryId: string;
  galleryTitle: string;
  branchName: string | null;
  customerName: string | null;
  guiLuc: string | null;
  dot1ChoXacNhan: boolean;
  dotMuaThem: DotMuaThemCho[];
  nhoStudioChonThem: number;
  soSanPhamInChuaAnh: number;
  /** BB-345 — gia đình (link mời) đặt chỉnh sửa các tấm đã thả tim. */
  datChinhSua?: Array<{
    id: string;
    soAnh: number;
    tamTinh: number;
    trangThai: string;
    nguoiGui: string | null;
    submittedAt: string | null;
  }>;
}

/** Phần dữ liệu của GET /api/admin/galleries/[id]/items mà ngăn xử lý cần. */
interface ChiTietBo {
  status: string;
  selectedCount: number;
  includedQuota: number | null;
  quotaKnown: boolean;
  dueAmount: number;
  paidAmount: number;
  discountAmount?: number;
  outstanding: number;
  /** BB-344 — số còn phải thu; 0 = chưa phát sinh, form thanh toán bị khoá. */
  amountToCollect: number;
  /** BB-360 — sản phẩm mua thêm thu qua Lark (không nằm trong `amountToCollect`). */
  sanPhamQuaLark?: number;
  /** BB-351 — cùng form BB-349: ô "khoá kèm thu" + "chắc chắn". */
  khoaKhiThu?: KhoaKhiThu;
  customerChatUrl?: string | null;
}

function gioNgay(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatGioVN(d)} · ${formatNgayVN(iso)}`;
}

const NUT_PHU =
  "inline-flex h-8 items-center whitespace-nowrap rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium text-[var(--bb-fg)] transition hover:bg-[var(--bb-surface-2)] disabled:opacity-40";
const NUT_CHINH =
  "inline-flex h-8 items-center whitespace-nowrap rounded-md bg-[var(--bb-fg)] px-3 text-xs font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40";

/** Các "việc" của một dòng, viết thành chữ ngắn — dùng cho dòng tóm tắt. */
export function cacViecCuaDong(d: DongKhachGuiView): string[] {
  const viec: string[] = [];
  if (d.dot1ChoXacNhan) viec.push("Đợt 1: chờ xác nhận danh sách");
  for (const m of d.dotMuaThem) viec.push(dongTomTatDot(m));
  if (d.nhoStudioChonThem > 0) viec.push(`Nhờ studio chọn thêm ${formatSo(d.nhoStudioChonThem)} ảnh`);
  if (d.soSanPhamInChuaAnh > 0) viec.push(`Còn ${formatSo(d.soSanPhamInChuaAnh)} sản phẩm in chưa chọn ảnh`);
  for (const c of d.datChinhSua ?? []) viec.push(`Gia đình đặt chỉnh sửa ${formatSo(c.soAnh)} tấm`);
  return viec;
}

export function KhachGuiAnhChonReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [dong, setDong] = React.useState<DongKhachGuiView[]>([]);
  const [canConfirm, setCanConfirm] = React.useState(false);
  const [nha, setNha] = React.useState<Record<string, NhaCuaBo>>({});
  /** BB-399 — bộ khách mua "Làm ảnh nhanh": nhãn + xếp lên đầu. */
  const [lamNhanh, setLamNhanh] = React.useState<Record<string, { soNgay: number; hanTra: string | null; uuTien?: boolean }>>({});
  const [dangMo, setDangMo] = React.useState<string | null>(null);

  const tai = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports/dot-chon-cho-xac-nhan", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? "Không tải được danh sách");
        return;
      }
      setError(null);
      setDong(json.data.boAnh ?? []);
      setCanConfirm(json.data.canConfirm === true);
      setNha(json.data.nha ?? {});
      setLamNhanh(json.data.lamNhanh ?? {});
    } catch {
      setError("Mất kết nối, thử lại giúp.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void tai();
  }, [tai]);
  // BB-342: khách chốt đợt / CSKH khác xác nhận — danh sách tự cập nhật, không cần F5.
  useCapNhatTucThi("nhan-vien", () => void tai());

  /** Một việc vừa xong: tải lại danh sách và báo menu/tab đếm lại. */
  const xongMotViec = React.useCallback(async () => {
    await tai();
    window.dispatchEvent(new Event(SU_KIEN_VIEC_DOI));
  }, [tai]);

  if (loading) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;
  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;

  return (
    <div className="flex flex-col gap-4" data-testid="khach-mua-them-report">
      <header>
        <h2 className="text-base font-medium">Khách gửi ảnh chọn — chờ xác nhận</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Mỗi bộ ảnh một dòng: danh sách đợt 1, đợt mua thêm, phần khách nhờ studio chọn giúp. Bấm
          &ldquo;Xử lý&rdquo; để xác nhận, ghi thanh toán, xuất danh sách hoặc nhắn khách.
        </p>
      </header>

      {dong.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">Không có bộ ảnh nào đang chờ — mọi việc đã được xử lý.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {xepLamNhanhLenDau(dong, (d) => !!lamNhanh[d.galleryId]?.uuTien).map((d) => {
            const mo = dangMo === d.galleryId;
            return (
              <li
                key={d.galleryId}
                data-testid="dong-khach-gui-anh-chon"
                data-gallery-id={d.galleryId}
                className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-surface)] p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/galleries/${encodeURIComponent(d.galleryId)}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {hienTieuDeBoAnh(d.galleryTitle)}
                    </Link>
                    <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
                      {[d.customerName, d.branchName].filter(Boolean).join(" · ")}
                      {d.guiLuc && ` · gửi ${gioNgay(d.guiLuc)}`}
                    </p>
                    <NhanNhaBoAnh nha={nha[d.galleryId]} className="mt-1" />
                    <NhanLamNhanh
                      lamNhanh={!!lamNhanh[d.galleryId]}
                      uuTien={lamNhanh[d.galleryId]?.uuTien ?? false}
                      hanTra={lamNhanh[d.galleryId]?.hanTra ?? null}
                      className="mt-1"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="nut-xu-ly-viec"
                      aria-expanded={mo}
                      onClick={() => setDangMo(mo ? null : d.galleryId)}
                      className={mo ? NUT_PHU : NUT_CHINH}
                    >
                      {mo ? "Đóng" : "Xử lý"}
                    </button>
                    <Link
                      href={`/admin/galleries/${encodeURIComponent(d.galleryId)}${d.dotMuaThem.length > 0 ? "#dot-chon" : ""}`}
                      data-testid="nut-mo-chi-tiet-bo-anh"
                      className={NUT_PHU}
                    >
                      Mở chi tiết bộ ảnh
                    </Link>
                  </div>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="cac-viec-cua-dong">
                  {cacViecCuaDong(d).map((v) => (
                    <li
                      key={v}
                      className="rounded-full border border-[var(--bb-warning)] bg-[var(--bb-warning)]/10 px-2.5 py-0.5 text-xs"
                    >
                      {v}
                    </li>
                  ))}
                </ul>
                {mo && <NganXuLy dong={d} canConfirm={canConfirm} onDone={xongMotViec} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Ngăn chi tiết của một bộ ảnh — đủ công cụ để xong việc mà không rời trang. */
function NganXuLy({
  dong,
  canConfirm,
  onDone,
}: {
  dong: DongKhachGuiView;
  canConfirm: boolean;
  onDone: () => Promise<void>;
}) {
  const gid = dong.galleryId;
  const co = encodeURIComponent(gid);
  const [ct, setCt] = React.useState<ChiTietBo | null>(null);
  const [loiTai, setLoiTai] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [thongBao, setThongBao] = React.useState<{ ok: boolean; cau: string } | null>(null);
  const [dangTuChoi, setDangTuChoi] = React.useState(false);
  const [lyDo, setLyDo] = React.useState("");

  const taiChiTiet = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/galleries/${co}/items`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoiTai(json?.error?.message ?? "Không tải được chi tiết bộ ảnh");
        return;
      }
      setLoiTai(null);
      setCt(json.data as ChiTietBo);
    } catch {
      setLoiTai("Mất kết nối, thử lại giúp.");
    }
  }, [co]);

  React.useEffect(() => {
    void taiChiTiet();
  }, [taiChiTiet]);

  async function goi(duongDan: string, body: unknown, cauXong: string) {
    setBusy(true);
    setThongBao(null);
    try {
      const res = await fetch(duongDan, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setThongBao({ ok: false, cau: json?.error?.message ?? "Không xử lý được, thử lại giúp." });
        return;
      }
      setThongBao({ ok: true, cau: cauXong });
      setDangTuChoi(false);
      setLyDo("");
      await taiChiTiet();
      await onDone();
    } catch {
      setThongBao({ ok: false, cau: "Mất kết nối, thử lại giúp." });
    } finally {
      setBusy(false);
    }
  }

  async function thanhToan(amount: number, method: string, note: string, pt: number | null, xn: TuyChonXacNhan) {
    setBusy(true);
    setThongBao(null);
    try {
      const kq = await ghiThanhToan(gid, amount, method, note, pt, xn);
      if (!kq.ok) {
        setThongBao({ ok: false, cau: kq.message });
        return;
      }
      setThongBao({ ok: true, cau: cauSauKhiThu(kq) });
      await taiChiTiet();
      await onDone();
    } catch {
      setThongBao({ ok: false, cau: "Mất kết nối, thử lại giúp." });
    } finally {
      setBusy(false);
    }
  }

  const khoi = "rounded-md border border-[var(--bb-border)] p-3";

  return (
    <div data-testid="ngan-xu-ly" className="mt-3 flex flex-col gap-3 border-t border-[var(--bb-border)] pt-3">
      {loiTai && <p className="text-sm text-[var(--bb-danger)]">{loiTai}</p>}
      {thongBao && (
        <p
          role="status"
          data-testid="thong-bao-xu-ly"
          className={`text-sm ${thongBao.ok ? "text-[var(--bb-fg-muted)]" : "text-[var(--bb-danger)]"}`}
        >
          {thongBao.cau}
        </p>
      )}

      {/* 1. Danh sách đợt 1 */}
      {dong.dot1ChoXacNhan && (
        <section className={khoi} data-testid="khoi-dot-1">
          <h3 className="text-sm font-medium">Đợt 1 · danh sách ảnh trong gói</h3>
          {ct && (
            <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
              Khách chọn {formatSo(ct.selectedCount)} ảnh
              {ct.quotaKnown && ct.includedQuota !== null && ` / hạn mức ${formatSo(ct.includedQuota)}`}
            </p>
          )}
          {!canConfirm ? (
            <p className="mt-2 text-xs text-[var(--bb-fg-muted)]">Bạn không có quyền xác nhận — cần quyền sửa bộ ảnh.</p>
          ) : ct && ct.status !== "submitted" ? (
            <p className="mt-2 text-xs text-[var(--bb-fg-muted)]">Đợt 1 đã được xử lý.</p>
          ) : dangTuChoi ? (
            <div className="mt-2">
              <label className="text-xs text-[var(--bb-fg-muted)]" htmlFor={`ly-do-dot-1-${gid}`}>
                Lý do từ chối — bộ ảnh mở lại cho khách chọn tiếp
              </label>
              <textarea
                id={`ly-do-dot-1-${gid}`}
                name="lyDoTuChoiDot1"
                rows={2}
                maxLength={500}
                value={lyDo}
                disabled={busy}
                onChange={(e) => setLyDo(e.target.value)}
                placeholder="Ví dụ: ba mẹ chọn dư 3 ảnh so với gói, ba mẹ bỏ bớt giúp Bean nhé ạ"
                className="mt-1 w-full rounded border border-[var(--bb-border)] p-2 text-sm"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy || lyDo.trim().length === 0}
                  onClick={() =>
                    void goi(`/api/admin/galleries/${co}/reopen`, { reason: lyDo.trim() }, "Đã từ chối và mở lại cho khách chọn tiếp.")
                  }
                  className="inline-flex h-8 items-center rounded-md border border-[var(--bb-danger)] px-3 text-xs font-medium text-[var(--bb-danger)] disabled:opacity-40"
                >
                  {busy ? "Đang gửi…" : "Xác nhận từ chối"}
                </button>
                <button type="button" disabled={busy} onClick={() => setDangTuChoi(false)} className={NUT_PHU}>
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                data-testid="nut-xac-nhan-dot-1"
                disabled={busy || !ct}
                onClick={() =>
                  void goi(`/api/admin/galleries/${co}/confirm`, undefined, "Đã xác nhận đợt 1 — bộ ảnh vào hàng chờ chỉnh sửa.")
                }
                className={NUT_CHINH}
              >
                {busy ? "Đang xử lý…" : "Xác nhận danh sách"}
              </button>
              <button type="button" disabled={busy} onClick={() => setDangTuChoi(true)} className={NUT_PHU}>
                Từ chối (lý do)
              </button>
            </div>
          )}
        </section>
      )}

      {/* 2. Đợt mua thêm */}
      {dong.dotMuaThem.map((m) => (
        <section key={m.soDot} className={khoi} data-testid={`khoi-dot-${m.soDot}`}>
          <h3 className="text-sm font-medium">{dongTomTatDot(m)}</h3>
          {m.sanPham.length > 0 && (
            <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
              Sản phẩm: {m.sanPham.map((s) => `${s.ten} ×${s.soLuong}`).join(", ")}
            </p>
          )}
          {m.soSanPhamInChuaAnh > 0 && (
            <p className="mt-0.5 text-xs font-medium">Còn {formatSo(m.soSanPhamInChuaAnh)} sản phẩm in chưa chọn ảnh</p>
          )}
          <div className="mt-2">
            <NutXuLyDot galleryId={gid} soDot={m.soDot} canConfirm={canConfirm} onDone={onDone} />
          </div>
        </section>
      ))}

      {/* 3. Phần studio chọn giúp */}
      {(dong.nhoStudioChonThem > 0 || dong.soSanPhamInChuaAnh > 0) && (
        <section className={khoi} data-testid="khoi-studio-chon-giup">
          <h3 className="text-sm font-medium">Khách để lại việc cho studio</h3>
          <ul className="mt-1 text-xs">
            {dong.nhoStudioChonThem > 0 && <li>Nhờ studio chọn thêm {formatSo(dong.nhoStudioChonThem)} ảnh</li>}
            {dong.soSanPhamInChuaAnh > 0 && <li>Còn {formatSo(dong.soSanPhamInChuaAnh)} sản phẩm in chưa chọn ảnh</li>}
          </ul>
          {canConfirm && (
            <button
              type="button"
              data-testid="nut-studio-chon-giup-xong"
              disabled={busy}
              onClick={() =>
                void goi(`/api/admin/galleries/${co}/studio-chon-giup`, undefined, "Đã ghi: studio đã chọn giúp xong.")
              }
              className={`mt-2 ${NUT_PHU}`}
            >
              Đã chọn giúp xong
            </button>
          )}
        </section>
      )}

      {/* 3b. BB-345 — gia đình đặt chỉnh sửa các tấm đã thả tim (yêu cầu mua thêm loại 'chinh_sua'). */}
      {(dong.datChinhSua ?? []).map((c) => (
        <section key={c.id} className={khoi} data-testid="khoi-dat-chinh-sua">
          <h3 className="text-sm font-medium">
            Gia đình đặt chỉnh sửa {formatSo(c.soAnh)} tấm · tạm tính {formatCurrencyVND(c.tamTinh)}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
            {[c.nguoiGui, c.trangThai === "da_lien_he" ? "đã gọi" : "mới gửi", c.submittedAt && gioNgay(c.submittedAt)]
              .filter(Boolean)
              .join(" · ")}
            {" — "}tên tệp và SĐT ở khối &ldquo;Yêu cầu mua thêm&rdquo; của bộ ảnh.
          </p>
          <div className="mt-2">
            <NutXuLyDatChinhSua
              galleryId={gid}
              yeuCauId={c.id}
              trangThai={c.trangThai}
              canConfirm={canConfirm}
              onDone={onDone}
            />
          </div>
        </section>
      ))}

      {/* 4. Xác nhận thanh toán (form BB-320, có giảm %) */}
      {ct && (
        <section className={khoi} data-testid="khoi-thanh-toan">
          <h3 className="text-sm font-medium">Xác nhận thanh toán</h3>
          <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
            Phải thu {formatCurrencyVND(ct.dueAmount)} · đã thu{" "}
            {formatCurrencyVND(ct.paidAmount - (ct.discountAmount ?? 0))}
            {(ct.discountAmount ?? 0) > 0 && ` · giảm giá ${formatCurrencyVND(ct.discountAmount ?? 0)}`} ·{" "}
            {ct.outstanding > 0 ? (
              <span className="text-[var(--bb-danger)]">còn thiếu {formatCurrencyVND(ct.outstanding)}</span>
            ) : ct.outstanding < 0 ? (
              <span className="text-[var(--bb-danger)]">khách trả DƯ {formatCurrencyVND(-ct.outstanding)}</span>
            ) : (
              "không còn thiếu"
            )}
          </p>
          {canConfirm && (
            // BB-395: xác nhận bằng mã hoá đơn; form nhập tay chỉ hiện (trong mục dự phòng) khi
            // máy chủ báo người xem có quyền `thanh_toan:nhap_tay`.
            <KhoiHoaDon
              galleryId={gid}
              onDaDongBo={taiChiTiet}
              nhapTay={
                <PaymentForm
                  disabled={busy}
                  conThieu={ct.amountToCollect}
                  chuaPhatSinh={ct.amountToCollect <= 0}
                  khoa={ct.khoaKhiThu}
                  sanPhamQuaLark={ct.sanPhamQuaLark ?? 0}
                  onSubmit={(a, m, n, pt, xn) => thanhToan(a, m, n, pt, xn)}
                />
              }
            />
          )}
        </section>
      )}

      {/* 5. Xuất danh sách + 6. Nhắn khách */}
      <div className="flex flex-wrap items-center gap-2" data-testid="khoi-xuat-nhan">
        <a href={`/api/admin/galleries/${co}/export`} download className={NUT_PHU}>
          Tải danh sách ảnh đã chọn
        </a>
        {dong.dotMuaThem.map((m) => (
          <a key={m.soDot} href={`/api/admin/galleries/${co}/export?dot=${m.soDot}`} download className={NUT_PHU}>
            Chỉ đợt {m.soDot}
          </a>
        ))}
        <NutNhanKhach url={ct?.customerChatUrl} />
        {ct && !ct.customerChatUrl && (
          <span className="text-xs text-[var(--bb-fg-muted)]">Chưa có link chat với khách trên Lark.</span>
        )}
      </div>
    </div>
  );
}
