"use client";

/**
 * Trang chi tiết khách — BB-337 mục 3. Bố cục theo bản vẽ BB-334
 * (`babybean-assets/BB-334/ban-ve/05-nv-gui-link-mt.png`): cột trái hẹp (link app
 * gia đình, thông tin khách, con số), cột phải rộng (bộ ảnh, lịch sử mua).
 *
 * Phần CHƯA có (link app chung của gia đình, ghi chú chăm sóc) thì ẨN HẲN, không bày thẻ
 * "sắp có" ra cho nhân viên (BB-354); có dữ liệu thì thêm thẻ vào cột trái.
 * Dữ liệu: GET /api/admin/customers/[id]/lich-su (chỉ đọc).
 */

import React from "react";
import Link from "next/link";
import { PageHeader, CARD_TITLE_CLASS } from "./page-header";
import { TheSoLieu } from "./the-so-lieu";
import { NutNhanKhach } from "./nut-nhan-khach";
import { KhoiLinkGiaDinh } from "./khoi-link-gia-dinh";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatNgayVN, formatSdt, formatSo } from "@/lib/utils/dinh-dang";

interface LichSu {
  khach: { id: string; fullName: string; phone: string | null; chatUrl: string | null; createdAt: string; tuLark: boolean };
  lichSuChup: Array<{
    id: string;
    title: string;
    concept: string | null;
    ngayChup: string | null;
    branchName: string;
    trangThai: string;
    soAnh: number;
    maHopDong: string[];
    linkApp: { tinhTrang: string; maDau: string; luotMo: number; hetHan: string | null } | null;
  }>;
  muaThem: Array<{ id: string; galleryId: string | null; galleryTitle: string | null; ten: string; soLuong: number; thanhTien: number; ngay: string | null }>;
  thanhToan: Array<{ id: string; galleryId: string; galleryTitle: string | null; soTien: number; hinhThuc: string; laGiamGia: boolean; ghiChu: string | null; ngay: string }>;
  tong: { tongMuaThem: number; tongDaThu: number; tongGiamGia: number; tongGiaTri: number };
  luotGhe: { nam: number; soLuot: number; chiNhanh: Array<{ ten: string; soLuot: number }> };
}

const KHUNG = "rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] p-4 md:p-5";

function nhanLinkApp(l: LichSu["lichSuChup"][number]["linkApp"]): { chu: string; kieu: "success" | "outline" | "danger" } {
  if (!l) return { chu: "Chưa có link", kieu: "outline" };
  if (l.tinhTrang === "da_thu_hoi" || l.tinhTrang === "revoked") return { chu: "Đã thu hồi", kieu: "danger" };
  if (l.tinhTrang === "active") return { chu: `Đang dùng · ${l.maDau}…`, kieu: "success" };
  return { chu: "Hết hạn", kieu: "outline" };
}

export function TrangKhachHang({ customerId }: { customerId: string }) {
  const [ls, setLs] = React.useState<LichSu | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);

  React.useEffect(() => {
    let song = true;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/customers/${encodeURIComponent(customerId)}/lich-su`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!song) return;
        if (!res.ok) {
          setLoi(res.status === 403 ? "Khách này thuộc chi nhánh bạn không được xem." : (json?.error?.message ?? "Không tải được khách hàng."));
          return;
        }
        setLs(json.data as LichSu);
      } catch {
        if (song) setLoi("Mất kết nối, thử lại giúp.");
      }
    })();
    return () => {
      song = false;
    };
  }, [customerId]);

  if (loi) return <p className="text-sm text-[var(--bb-danger)]">{loi}</p>;
  if (!ls) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;

  const { khach, lichSuChup, muaThem, thanhToan, tong, luotGhe } = ls;

  return (
    <div className="flex flex-col gap-6" data-testid="trang-khach-hang">
      <PageHeader
        title={khach.fullName}
        description={[formatSdt(khach.phone) || "Chưa có số", khach.tuLark ? "Đồng bộ từ Lark" : null]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <NutNhanKhach url={khach.chatUrl} />
            <Link
              href="/admin/customers"
              className="inline-flex h-8 items-center rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium hover:bg-[var(--bb-surface-2)]"
            >
              Danh sách khách
            </Link>
          </>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="so-lieu-khach">
        <TheSoLieu
          label="Tổng giá trị đã mua"
          value={formatCurrencyVND(tong.tongGiaTri)}
          ghiChu="Mua thêm + đã thu trong app"
          chuNho
          testId="tong-gia-tri-khach"
        />
        <TheSoLieu label="Đã thu" value={formatCurrencyVND(tong.tongDaThu)} chuNho />
        <TheSoLieu label="Số buổi chụp" value={formatSo(lichSuChup.length)} />
        <TheSoLieu
          label={`Lượt ghé năm ${luotGhe.nam}`}
          value={formatSo(luotGhe.soLuot)}
          ghiChu={luotGhe.chiNhanh.length > 0 ? luotGhe.chiNhanh.map((c) => `${c.ten} (${c.soLuot})`).join(", ") : "Chưa ghé năm nay"}
          testId="luot-ghe-nam-nay"
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {/* BB-334C — link app chung của gia đình (bản vẽ 05/06). 403 → khối tự ẩn. */}
          <KhoiLinkGiaDinh customerId={customerId} chatUrl={khach.chatUrl} />
          <section className={KHUNG}>
            <h2 className={CARD_TITLE_CLASS}>Thông tin khách</h2>
            <dl className="mt-3 grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
              <dt className="text-[var(--bb-fg-muted)]">Tên</dt>
              <dd>{khach.fullName}</dd>
              <dt className="text-[var(--bb-fg-muted)]">Điện thoại</dt>
              <dd className="tabular-nums">{formatSdt(khach.phone) || "Chưa có số"}</dd>
              <dt className="text-[var(--bb-fg-muted)]">Nguồn</dt>
              <dd>{khach.tuLark ? "Lark (Hậu Kỳ)" : "Nhập trong app"}</dd>
              <dt className="text-[var(--bb-fg-muted)]">Ngày tạo</dt>
              <dd className="tabular-nums">{formatNgayVN(khach.createdAt)}</dd>
            </dl>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <section className={KHUNG} data-testid="lich-su-chup">
            <h2 className={CARD_TITLE_CLASS}>Lịch sử chụp ({formatSo(lichSuChup.length)})</h2>
            {lichSuChup.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">Chưa có buổi chụp nào ở chi nhánh bạn được xem.</p>
            ) : (
              <ul className="mt-3 divide-y divide-[var(--bb-border)]">
                {lichSuChup.map((g) => {
                  const nhan = nhanLinkApp(g.linkApp);
                  return (
                    <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-3 text-sm" data-testid="dong-lich-su-chup">
                      <div className="min-w-0 flex-1 basis-56">
                        <Link href={`/admin/galleries/${encodeURIComponent(g.id)}`} className="font-medium hover:underline">
                          {g.concept ? `${g.concept} · ` : ""}
                          {g.title}
                        </Link>
                        <p className="text-xs text-[var(--bb-fg-muted)] tabular-nums">
                          {[g.ngayChup ? formatNgayVN(g.ngayChup) : "Chưa rõ ngày chụp", g.branchName, `${formatSo(g.soAnh)} ảnh`]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <Badge variant="outline">{g.trangThai}</Badge>
                      <Badge variant={nhan.kieu} title="Link app của bộ ảnh — chép đầy đủ ở chi tiết bộ ảnh">
                        {nhan.chu}
                      </Badge>
                      <Link
                        href={`/admin/galleries/${encodeURIComponent(g.id)}`}
                        className="text-xs text-[var(--bb-fg-muted)] hover:text-[var(--bb-fg)]"
                      >
                        Mở ›
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className={KHUNG} data-testid="lich-su-mua">
            <h2 className={CARD_TITLE_CLASS}>Lịch sử mua</h2>
            {muaThem.length === 0 && thanhToan.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">Khách chưa mua thêm và chưa có khoản thu nào ghi trong app.</p>
            ) : (
              <>
                {muaThem.length > 0 && (
                  <>
                    <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-[var(--bb-fg-muted)]">Mua thêm</h3>
                    <ul className="mt-1 divide-y divide-[var(--bb-border)] text-sm">
                      {muaThem.map((m) => (
                        <li key={m.id} className="flex items-baseline justify-between gap-3 py-2">
                          <span className="min-w-0">
                            {m.ten} ×{m.soLuong}
                            <span className="block text-xs text-[var(--bb-fg-muted)]">
                              {[m.galleryTitle, m.ngay ? formatNgayVN(m.ngay) : null].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums">{formatCurrencyVND(m.thanhTien)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
                {thanhToan.length > 0 && (
                  <>
                    <h3 className="mt-4 text-xs font-medium uppercase tracking-wide text-[var(--bb-fg-muted)]">Thanh toán đã ghi</h3>
                    <ul className="mt-1 divide-y divide-[var(--bb-border)] text-sm">
                      {thanhToan.map((p) => (
                        <li key={p.id} className="flex items-baseline justify-between gap-3 py-2">
                          <span className="min-w-0">
                            {p.laGiamGia ? "Giảm giá" : "Đã thu"}
                            {p.ghiChu ? ` · ${p.ghiChu}` : ""}
                            <span className="block text-xs text-[var(--bb-fg-muted)]">
                              {[p.galleryTitle, formatNgayVN(p.ngay)].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <span className="shrink-0 tabular-nums">{formatCurrencyVND(p.soTien)}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
