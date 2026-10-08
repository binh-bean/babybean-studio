/**
 * Báo cáo: bộ ảnh đã chọn vượt hạn mức mà chưa thu tiền.
 *
 * OWNER: DEV-FE. Task BB-120.
 * Spec: docs/15 mục 6.3
 *
 * ---------------------------------------------------------------------------
 * Con số này là SÀN, và màn hình phải nói ra điều đó
 * ---------------------------------------------------------------------------
 * Đây là con số dùng để đòi tiền khách. Chỉ cần một khách phản bác đúng một
 * lần là không ai dám mở bảng này nữa. Nên hai điều dưới đây hiện NGAY CẠNH số
 * tiền, không giấu trong tài liệu:
 *
 *   - Bộ ảnh chưa biết hạn mức KHÔNG vào báo cáo, nhưng được đếm riêng. Không
 *     đếm riêng thì người đọc tưởng những bộ đó không nợ gì.
 *   - Bộ ảnh khách chưa chọn xong thì chưa tính.
 *
 * ---------------------------------------------------------------------------
 * Mã hợp đồng là chỗ bấu víu
 * ---------------------------------------------------------------------------
 * Bộ ảnh nhập từ Lark đang che tên và số điện thoại khách (docs/16 mục 7.3),
 * nên mã hợp đồng là thứ duy nhất tra ngược được sang Lark. Cột đó phải chọn
 * và sao chép được, đừng cắt ngắn.
 *
 * ---------------------------------------------------------------------------
 * BB-331 — mỗi dòng tự xử lý được
 * ---------------------------------------------------------------------------
 * Anh 30/09: dòng vượt hạn mức chỉ để xem, không làm gì được. Nay mỗi dòng có
 * "Xác nhận thanh toán" (đúng form giảm giá % của BB-320, `form-thanh-toan`),
 * "Mở bộ ảnh", "Nhắc khách" (nhắc THANH TOÁN, chuông + thông báo) và "Nhắn
 * khách" (link chat Lark, nếu có). Ghi thu xong là tải lại — bộ đã hết nợ tự
 * rời danh sách, và số trên menu/tab đếm lại (SU_KIEN_VIEC_DOI).
 */

"use client";

import React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import Link from "next/link";
import { CARD_TITLE_CLASS } from "./page-header";
import { TheSoLieu } from "./the-so-lieu";
import { formatNgayVN, tinhTenBiaTuDuLieu, tinhTieuDeBoAnhQuanTri, formatSo } from "@/lib/utils/dinh-dang";
import { SU_KIEN_VIEC_DOI } from "@/lib/utils/viec-can-xu-ly-tabs";
import { PaymentForm, cauSauKhiThu, ghiThanhToan, type TuyChonXacNhan } from "./form-thanh-toan";
import type { KhoaKhiThu } from "@/lib/gallery/khoa-khi-thu";

/** BB-351 — số tiền + trạng thái khoá của bộ (GET /payments), cùng nguồn với màn chi tiết. */
interface ThongTinThu {
  amountToCollect: number;
  /** BB-360 — sản phẩm mua thêm thu qua Lark (không nằm trong `amountToCollect`). */
  sanPhamQuaLark?: number;
  khoaKhiThu: KhoaKhiThu;
  /** BB-395 — người xem có quyền nhập tay (dự phòng) không. */
  quyenNhapTay?: boolean;
}
import { GanHoaDonTheoKhach, KhoiHoaDon } from "./khoi-hoa-don";
import { NutNhacKhach } from "./nut-nhac-khach";
import { NutNhanKhach } from "./nut-nhan-khach";
import { NhanNhaBoAnh } from "./nhan-nha-bo-anh";
import type { NhaCuaBo } from "@/lib/gia-dinh/nha-cua-bo";

interface ReportItem {
  galleryId: string;
  galleryTitle: string;
  /** BB-320 (Q-D2): tên để CSKH biết gọi ai — bé trước, rồi khách. */
  customerName: string | null;
  babyNickname: string | null;
  babyFullName: string | null;
  branchName: string;
  contractCode: string | null;
  shootDate: string | null;
  quota: number | null;
  selectedCount: number;
  overCount: number;
  addonCount: number;
  unbilledCount: number;
  /** Đã TRỪ tiền đã thu và phần giảm giá (BB-320). */
  unbilledAmount: number;
  daThu?: number;
  giamGia?: number;
  /** BB-331: link "Chat với khách" từ Lark (đã lọc http/https). */
  chatUrl?: string | null;
}

interface ReportSummary {
  galleryCount: number;
  unbilledPhotoCount: number;
  totalUnbilledAmount: number;
  missingQuotaCount: number;
}

export function OverQuotaReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [summary, setSummary] = React.useState<ReportSummary | null>(null);
  const [items, setItems] = React.useState<ReportItem[]>([]);
  const [nha, setNha] = React.useState<Record<string, NhaCuaBo>>({});
  const [hoaDonCanXuLy, setHoaDonCanXuLy] = React.useState<
    { galleryId: string; galleryTitle: string; maHoaDon: string; trangThai: string }[]
  >([]);
  // BB-331: dòng đang mở form "Xác nhận thanh toán" + câu báo sau khi ghi.
  const [moThanhToan, setMoThanhToan] = React.useState<string | null>(null);
  const [dangGhi, setDangGhi] = React.useState(false);
  const [thongBao, setThongBao] = React.useState<{ id: string; ok: boolean; cau: string } | null>(null);
  // BB-351 — form ở đây là ĐÚNG form BB-349 (khoá kèm thu + "chắc chắn"): đọc trạng thái khoá
  // và số cần thu của bộ khi mở form, không dùng số của dòng báo cáo.
  const [thongTinThu, setThongTinThu] = React.useState<Record<string, ThongTinThu | "loi">>({});
  const alive = React.useRef(true);

  const taiThongTinThu = React.useCallback(async (galleryId: string) => {
    try {
      const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/payments`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive.current) return;
      setThongTinThu((cu) => ({
        ...cu,
        [galleryId]: res.ok && json?.data ? (json.data as ThongTinThu) : "loi",
      }));
    } catch {
      if (alive.current) setThongTinThu((cu) => ({ ...cu, [galleryId]: "loi" }));
    }
  }, []);

  const tai = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/reports/over-quota", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive.current) return;
      if (!res.ok) {
        setError(json?.error?.message ?? "Không tải được báo cáo");
        return;
      }
      setSummary(json.data.summary);
      setItems(json.data.items);
      setNha(json.data.nha ?? {});
      setHoaDonCanXuLy(json.data.hoaDonCanXuLy ?? []);
    } catch {
      if (alive.current) setError("Mất kết nối, thử lại giúp.");
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    alive.current = true;
    void tai();
    return () => {
      alive.current = false;
    };
  }, [tai]);

  async function xacNhanThanhToan(
    it: ReportItem,
    amount: number,
    method: string,
    note: string,
    discountPercent: number | null,
    xn: TuyChonXacNhan,
  ) {
    setDangGhi(true);
    setThongBao(null);
    try {
      const kq = await ghiThanhToan(it.galleryId, amount, method, note, discountPercent, xn);
      if (!kq.ok) {
        setThongBao({ id: it.galleryId, ok: false, cau: kq.message });
        return;
      }
      const cau = cauSauKhiThu(kq, "Khách đã trả đủ — dòng này rời danh sách.");
      setThongBao({ id: it.galleryId, ok: true, cau });
      setMoThanhToan(null);
      await tai();
      window.dispatchEvent(new Event(SU_KIEN_VIEC_DOI));
    } catch {
      setThongBao({ id: it.galleryId, ok: false, cau: "Mất kết nối, thử lại giúp." });
    } finally {
      setDangGhi(false);
    }
  }

  /** Hàng nút thao tác của một dòng — dùng chung cho thẻ (điện thoại) và bảng (máy tính). */
  function thaoTac(it: ReportItem) {
    return (
      <div className="flex flex-wrap items-center gap-2" data-testid="thao-tac-vuot-han-muc">
        <button
          type="button"
          data-testid="nut-xac-nhan-thanh-toan"
          aria-expanded={moThanhToan === it.galleryId}
          onClick={() => {
            setThongBao(null);
            const mo = moThanhToan === it.galleryId ? null : it.galleryId;
            setMoThanhToan(mo);
            if (mo) void taiThongTinThu(mo);
          }}
          className="inline-flex h-8 items-center whitespace-nowrap rounded-md bg-[var(--bb-fg)] px-3 text-xs font-medium text-[var(--bb-bg)] transition hover:opacity-90"
        >
          {moThanhToan === it.galleryId ? "Đóng" : "Xác nhận thanh toán"}
        </button>
        <Link
          href={`/admin/galleries/${encodeURIComponent(it.galleryId)}#thanh-toan`}
          data-testid="nut-mo-bo-anh"
          className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium text-[var(--bb-fg)] transition hover:bg-[var(--bb-surface-2)]"
        >
          Mở bộ ảnh
        </Link>
        <NutNhacKhach galleryId={it.galleryId} loai="thanh_toan" />
        <NutNhanKhach url={it.chatUrl} />
      </div>
    );
  }

  function khoiThanhToan(it: ReportItem) {
    return (
      <>
        {moThanhToan === it.galleryId && (
          <div data-testid="form-thanh-toan-vuot-han-muc" className="rounded-md border border-[var(--bb-border)] p-3">
            <p className="text-xs text-[var(--bb-fg-muted)]">
              Còn phải thu <strong className="text-[var(--bb-fg)]">{formatCurrencyVND(it.unbilledAmount)}</strong>
            </p>
            {(() => {
              const tt = thongTinThu[it.galleryId];
              if (tt === "loi") {
                return <p className="mt-2 text-sm text-[var(--bb-danger)]">Không tải được trạng thái thanh toán, đóng rồi mở lại giúp.</p>;
              }
              if (!tt) return <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;
              // BB-395: đường chính là mã hoá đơn; nhập tay chỉ cho Admin/Quản lý (dự phòng).
              return (
                <KhoiHoaDon
                  galleryId={it.galleryId}
                  onDaDongBo={async () => {
                    await Promise.all([tai(), taiThongTinThu(it.galleryId)]);
                  }}
                  nhapTay={
                    tt.quyenNhapTay ? (
                      <PaymentForm
                        disabled={dangGhi}
                        conThieu={tt.amountToCollect}
                        chuaPhatSinh={tt.amountToCollect <= 0}
                        khoa={tt.khoaKhiThu}
                        sanPhamQuaLark={tt.sanPhamQuaLark ?? 0}
                        onSubmit={(a, m, n, pt, xn) => xacNhanThanhToan(it, a, m, n, pt, xn)}
                      />
                    ) : null
                  }
                />
              );
            })()}
          </div>
        )}
        {thongBao?.id === it.galleryId && (
          <p
            role="status"
            className={`text-xs ${thongBao.ok ? "text-[var(--bb-fg-muted)]" : "text-[var(--bb-danger)]"}`}
          >
            {thongBao.cau}
          </p>
        )}
      </>
    );
  }

  if (loading) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải báo cáo…</p>;
  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;
  if (!summary) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* BB-280: tiêu đề cấp trang chuyển sang PageHeader của /admin/viec-can-xu-ly. */}
      <header>
        <h2 className={CARD_TITLE_CLASS}>Ảnh khách chọn vượt hạn mức, chưa thu tiền</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Bộ ảnh khách đã chọn nhiều hơn số ảnh đã trả tiền, và chưa mua thêm.
        </p>
      </header>

      {/* BB-320 (Q-N2): cùng thẻ số với mọi màn quản trị. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TheSoLieu label="Bộ ảnh" value={formatSo(summary.galleryCount)} />
        <TheSoLieu label="Ảnh chưa thu" value={formatSo(summary.unbilledPhotoCount)} />
        <TheSoLieu label="Tiền chưa thu" value={formatCurrencyVND(summary.totalUnbilledAmount)} chuNho />
        <TheSoLieu
          label="Chưa rõ hạn mức"
          value={formatSo(summary.missingQuotaCount)}
          ghiChu="không nằm trong số tiền bên cạnh"
        />
      </section>

      {/* Câu này đứng ngay dưới con số, không nằm trong chú thích cuối trang. */}
      <p className="rounded-md border border-[var(--bb-border)] p-3 text-sm">
        Số tiền trên là <strong>mức tối thiểu</strong>. Bộ ảnh chưa rõ hạn mức và bộ
        khách chưa chọn xong đều không được tính vào đây.
        {summary.missingQuotaCount > 0 && (
          <>
            {" "}
            Hiện có <strong>{formatSo(summary.missingQuotaCount)}</strong> bộ chưa rõ hạn mức —
            bổ sung dòng <em>Edit file</em> bên Lark thì chúng sẽ vào báo cáo.
          </>
        )}
      </p>

      {/* BB-395 — gán hoá đơn từ cấp KHÁCH + các bộ có hoá đơn còn Thiếu / Thừa / chưa đủ. */}
      <GanHoaDonTheoKhach onDaGan={tai} />
      {hoaDonCanXuLy.length > 0 && (
        <section data-testid="hoa-don-can-xu-ly" className="rounded-md border border-[var(--bb-border)] p-3">
          <h3 className="text-sm font-medium">Hoá đơn cần xử lý</h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {hoaDonCanXuLy.map((h) => (
              <li key={h.maHoaDon} className="flex flex-wrap items-center gap-2">
                <Link href={`/admin/galleries/${encodeURIComponent(h.galleryId)}#thanh-toan`} className="underline">
                  {h.galleryTitle || "Bộ ảnh"}
                </Link>
                <span className="text-[var(--bb-fg-muted)]">{h.maHoaDon}</span>
                <span className={h.trangThai === "thua" ? "text-[var(--bb-warning,#8a5a00)]" : "text-[var(--bb-danger)]"}>
                  {h.trangThai === "thua"
                    ? "Thừa — chờ khách chọn tiếp"
                    : h.trangThai === "chua_du_dieu_kien"
                      ? "Chưa đủ điều kiện"
                      : h.trangThai === "hon_hop"
                        ? "Thừa + thiếu"
                        : "Thiếu — liên hệ khách"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {thongBao && !items.some((it) => it.galleryId === thongBao.id) && (
        <p role="status" data-testid="thong-bao-da-xu-ly" className="text-sm text-[var(--bb-fg-muted)]">
          {thongBao.cau}
        </p>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">
          Chưa có bộ ảnh nào vượt hạn mức mà chưa thu tiền.
        </p>
      ) : (
        <>
          {/*
            Dưới `lg` mỗi bộ ảnh là một thẻ. Luật này đã có ở màn Nhân sự và
            màn Nhật ký; bảng tám cột rộng 736px nằm trong khung 293px thì trên
            điện thoại chỉ đọc được hai cột đầu, sáu cột tiền phải vuốt ngang.
          */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {items.map((it) => (
              <li
                key={it.galleryId}
                className="rounded-lg border border-[var(--bb-border)] p-3 text-sm"
              >
                <BoAnhCell it={it} nha={nha[it.galleryId]} />
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="select-all text-xs tabular-nums">{it.contractCode ?? "—"}</span>
                  <span className="text-xs text-[var(--bb-fg-muted)]">
                    {it.branchName} · {formatDate(it.shootDate)}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <span className="text-[var(--bb-fg-muted)]">Hạn mức</span>
                  <span className="text-right">{it.quota ?? "—"}</span>
                  <span className="text-[var(--bb-fg-muted)]">Đã chọn</span>
                  <span className="text-right">{formatSo(it.selectedCount)}</span>
                  <span className="text-[var(--bb-fg-muted)]">Đã mua thêm</span>
                  <span className="text-right">{formatSo(it.addonCount)}</span>
                  <span className="text-[var(--bb-fg-muted)]">Chưa thu</span>
                  <span className="text-right font-medium">{formatSo(it.unbilledCount)}</span>
                </div>
                <div className="mt-2 flex items-baseline justify-between border-t border-[var(--bb-border)] pt-2">
                  <span className="text-xs text-[var(--bb-fg-muted)]">Còn phải thu</span>
                  <span className="text-right">
                    <span className="font-medium">{formatCurrencyVND(it.unbilledAmount)}</span>
                    <TruCu it={it} />
                  </span>
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {thaoTac(it)}
                  {khoiThanhToan(it)}
                </div>
              </li>
            ))}
          </ul>

        <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bb-border)] text-left">
                <Th>Bộ ảnh</Th>
                <Th>Mã hợp đồng</Th>
                <Th>Chi nhánh</Th>
                <Th>Ngày chụp</Th>
                <Th className="text-right">Hạn mức</Th>
                <Th className="text-right">Đã chọn</Th>
                <Th className="text-right">Đã mua thêm</Th>
                <Th className="text-right">Chưa thu</Th>
                <Th className="text-right">Còn phải thu</Th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <React.Fragment key={it.galleryId}>
                <tr>
                  <td className="py-2 pr-3">
                    <BoAnhCell it={it} nha={nha[it.galleryId]} />
                  </td>
                  {/* select-all để CSKH bôi đen một phát rồi dán vào ô tìm kiếm bên Lark */}
                  <td className="select-all whitespace-nowrap py-2 pr-3 text-xs tabular-nums">
                    {it.contractCode ?? "—"}
                  </td>
                  <td className="py-2 pr-3">{it.branchName}</td>
                  <td className="py-2 pr-3">{formatDate(it.shootDate)}</td>
                  <td className="py-2 pr-3 text-right">{it.quota ?? "—"}</td>
                  <td className="py-2 pr-3 text-right">{formatSo(it.selectedCount)}</td>
                  <td className="py-2 pr-3 text-right">{formatSo(it.addonCount)}</td>
                  <td className="py-2 pr-3 text-right font-medium">{formatSo(it.unbilledCount)}</td>
                  <td className="py-2 text-right font-medium">
                    {formatCurrencyVND(it.unbilledAmount)}
                    <TruCu it={it} />
                  </td>
                </tr>
                {/* BB-331: hàng thao tác riêng của dòng, ngay dưới số liệu. */}
                <tr className="border-b border-[var(--bb-border)]">
                  <td colSpan={9} className="pb-3 pt-1">
                    <div className="flex flex-col gap-2">
                      {thaoTac(it)}
                      {khoiThanhToan(it)}
                    </div>
                  </td>
                </tr>
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}

/**
 * BB-320 (Q-D2): ô "Bộ ảnh" — tên bé (họ tên đầy đủ nếu không có biệt danh) và
 * tên khách, là liên kết mở thẳng chi tiết bộ. Không có cả hai thì rơi về tên
 * bộ ảnh thô (mã hợp đồng), không bịa tên.
 */
function BoAnhCell({ it, nha }: { it: ReportItem; nha?: NhaCuaBo }) {
  // BB-325 ("tên hiển thị" 29/09/2026) — dòng chính là TÊN MẸ, tên bé xuống dòng phụ.
  const tenBe = tinhTenBiaTuDuLieu(it.babyNickname, it.babyFullName);
  const { tieuDe: chinh } = tinhTieuDeBoAnhQuanTri({
    babyNickname: it.babyNickname,
    babyFullName: it.babyFullName,
    customerName: it.customerName,
    duPhong: it.galleryTitle,
  });
  const phu = tenBe && tenBe !== chinh ? tenBe : null;
  return (
    <div className="min-w-0">
      <Link
        href={`/admin/galleries/${encodeURIComponent(it.galleryId)}`}
        data-testid="mo-bo-anh"
        className="block truncate font-medium text-[var(--bb-fg)] hover:underline"
      >
        {chinh}
      </Link>
      {phu && <div className="truncate text-xs text-[var(--bb-fg-muted)]">{phu}</div>}
      <NhanNhaBoAnh nha={nha} className="mt-1" />
    </div>
  );
}

/** BB-320: nói rõ số này đã trừ những gì — tiền đã thu và phần giảm giá. */
function TruCu({ it }: { it: ReportItem }) {
  const phan = [
    it.daThu ? `đã thu ${formatCurrencyVND(it.daThu)}` : null,
    it.giamGia ? `giảm giá ${formatCurrencyVND(it.giamGia)}` : null,
  ].filter(Boolean);
  if (phan.length === 0) return null;
  return <span className="block text-xs font-normal text-[var(--bb-fg-muted)]">đã trừ {phan.join(" · ")}</span>;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`whitespace-nowrap py-2 pr-3 font-medium ${className ?? ""}`}>{children}</th>;
}

function formatDate(value: string | null): string {
  return (value && formatNgayVN(value)) || "—";
}
