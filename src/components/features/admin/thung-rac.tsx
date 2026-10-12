"use client";

/**
 * /admin/thung-rac — BB-409: bộ ảnh đã xoá (Admin + Quản lý, quyền `bo_anh:xoa`).
 *
 * Hai khối:
 *   - "Trong thùng rác": còn khôi phục được trong 10 ngày; "Xoá hẳn ngay" bắt gõ
 *     lại mã bộ (route cũng kiểm lại — màn hình không phải ranh giới an ninh).
 *   - "Đã xoá hẳn": dấu chặn Lark tạo lại; "Cho Lark tạo lại" bỏ dấu.
 *
 * Dữ liệu: GET /api/admin/thung-rac. Thao tác: POST /api/admin/thung-rac/:id.
 * Mobile-first: mỗi bộ một thẻ, đọc theo chiều dọc — cùng luật với màn Nhân sự.
 */

import React from "react";
import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Spinner,
} from "@/components/ui";
import { toast } from "@/components/ui/toast";
import { PageHeader, CARD_TITLE_CLASS } from "./page-header";
import { formatGioVN, formatNgayVN } from "@/lib/utils/dinh-dang";
import { vi } from "@/i18n/vi";

const t = vi.admin.thungRac;

interface BoTrongThungRac {
  id: string;
  maBo: string;
  tieuDe: string | null;
  chiNhanh: string | null;
  xoaLuc: string;
  nguoiXoa: string | null;
  conNgay: number;
  donHanLuc: string;
  tuLark: boolean;
}

interface BoDaDonHan {
  id: string;
  maBo: string;
  xoaLuc: string;
  donLuc: string;
  tuLark: boolean;
}

type HanhDong = "khoi_phuc" | "xoa_han" | "bo_dau";

function ngayGio(iso: string): string {
  const ngay = formatNgayVN(iso);
  const gio = formatGioVN(iso);
  return ngay ? `${gio} ${ngay}`.trim() : t.khongRo;
}

function thay(cau: string, ma: string): string {
  return cau.replace("{ma}", ma);
}

/** Cùng luật với `xacNhanDungMa` của route: bỏ khoảng trắng, không phân biệt hoa thường. */
function goDungMa(goLai: string, maBo: string): boolean {
  return goLai.trim().toLowerCase() === maBo.toLowerCase();
}

export function ThungRac() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [trongThungRac, setTrongThungRac] = React.useState<BoTrongThungRac[]>([]);
  const [daDonHan, setDaDonHan] = React.useState<BoDaDonHan[]>([]);
  const [dangLam, setDangLam] = React.useState<string | null>(null);
  const [boXoaHan, setBoXoaHan] = React.useState<BoTrongThungRac | null>(null);
  const [goLaiMa, setGoLaiMa] = React.useState("");
  const [loiHop, setLoiHop] = React.useState<string | null>(null);
  const [boBoDau, setBoBoDau] = React.useState<BoDaDonHan | null>(null);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/admin/thung-rac", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error?.message ?? t.loiTai);
        return;
      }
      setTrongThungRac(json?.data?.trongThungRac ?? []);
      setDaDonHan(json?.data?.daDonHan ?? []);
    } catch {
      setError(t.loiTai);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  /** Gửi một thao tác; trả `null` khi xong, hoặc câu lỗi của máy chủ. */
  async function lam(id: string, hanhDong: HanhDong, xacNhan?: string): Promise<string | null> {
    setDangLam(id);
    try {
      const res = await fetch(`/api/admin/thung-rac/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(xacNhan === undefined ? { hanhDong } : { hanhDong, xacNhan }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) return json?.error?.message ?? t.loiThaoTac;
      await load();
      return null;
    } catch {
      return t.loiThaoTac;
    } finally {
      setDangLam(null);
    }
  }

  async function khoiPhuc(bo: BoTrongThungRac) {
    const loi = await lam(bo.id, "khoi_phuc");
    if (loi) toast.error(loi);
    else toast.success(thay(t.daKhoiPhuc, bo.maBo));
  }

  async function xoaHan() {
    if (!boXoaHan || !goDungMa(goLaiMa, boXoaHan.maBo)) return;
    setLoiHop(null);
    const bo = boXoaHan;
    const loi = await lam(bo.id, "xoa_han", goLaiMa.trim());
    if (loi) {
      setLoiHop(loi);
      return;
    }
    setBoXoaHan(null);
    setGoLaiMa("");
    toast.success(thay(t.daXoaHan, bo.maBo));
  }

  async function boDau() {
    if (!boBoDau) return;
    setLoiHop(null);
    const bo = boBoDau;
    const loi = await lam(bo.id, "bo_dau");
    if (loi) {
      setLoiHop(loi);
      return;
    }
    setBoBoDau(null);
    toast.success(thay(t.daBoDau, bo.maBo));
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.subtitle} />

      {loading ? (
        <div className="flex items-center gap-3 p-8 text-[var(--bb-fg-muted)]">
          <Spinner /> Đang tải…
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-danger)] bg-[var(--bb-surface-2)] px-4 py-3 text-sm text-[var(--bb-danger)]"
        >
          {error}
        </div>
      ) : (
        <>
          {trongThungRac.length === 0 ? (
            <EmptyState title={t.trongTieuDe} description={t.trongMoTa} />
          ) : (
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {trongThungRac.map((bo) => (
                <li key={bo.id}>
                  <Card data-testid="the-thung-rac" className="flex h-full min-w-0 flex-col gap-3 p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-[var(--bb-fg-muted)]">{t.colMaBo}</p>
                        <code className="bb-so text-sm font-medium tabular-nums text-[var(--bb-fg)]">{bo.maBo}</code>
                      </div>
                      <Badge variant={bo.conNgay <= 1 ? "danger" : "warning"} className="shrink-0 whitespace-nowrap">
                        {bo.conNgay <= 0 ? t.xoaDemNay : t.conNgay.replace("{n}", String(bo.conNgay))}
                      </Badge>
                    </div>

                    <Link
                      href={`/admin/galleries/${bo.id}`}
                      className="break-words font-medium text-[var(--bb-fg)] underline-offset-2 hover:underline"
                    >
                      {bo.tieuDe?.trim() || t.khongTieuDe}
                    </Link>

                    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-[var(--bb-fg-muted)]">{t.colChiNhanh}</dt>
                      <dd className="min-w-0 truncate text-[var(--bb-fg)]">{bo.chiNhanh ?? t.khongRo}</dd>
                      <dt className="text-[var(--bb-fg-muted)]">{t.colNgayXoa}</dt>
                      <dd className="text-[var(--bb-fg)] tabular-nums">{ngayGio(bo.xoaLuc)}</dd>
                      <dt className="text-[var(--bb-fg-muted)]">{t.colNguoiXoa}</dt>
                      <dd className="min-w-0 truncate text-[var(--bb-fg)]">{bo.nguoiXoa ?? t.khongRo}</dd>
                    </dl>

                    <div className="mt-auto flex flex-wrap gap-2 border-t border-[var(--bb-border)] pt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={dangLam !== null}
                        onClick={() => void khoiPhuc(bo)}
                      >
                        <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {dangLam === bo.id ? t.dangKhoiPhuc : t.khoiPhuc}
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        disabled={dangLam !== null}
                        onClick={() => {
                          setGoLaiMa("");
                          setLoiHop(null);
                          setBoXoaHan(bo);
                        }}
                      >
                        <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {t.xoaHanNgay}
                      </Button>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}

          {daDonHan.length > 0 && (
            <section className="space-y-3">
              <header>
                <h2 className={CARD_TITLE_CLASS}>{t.daDonHanTieuDe}</h2>
                <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">{t.daDonHanMoTa}</p>
              </header>
              <ul className="flex flex-col divide-y divide-[var(--bb-border)] rounded-lg border border-[var(--bb-border)] bg-[var(--bb-surface)]">
                {daDonHan.map((bo) => (
                  <li
                    key={bo.id}
                    data-testid="dong-da-don-han"
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <code className="bb-so font-medium tabular-nums text-[var(--bb-fg)]">{bo.maBo}</code>
                      <p className="text-xs text-[var(--bb-fg-muted)] tabular-nums">
                        {t.colNgayXoa}: {ngayGio(bo.xoaLuc)} · {t.colDonLuc}: {ngayGio(bo.donLuc)}
                      </p>
                    </div>
                    {bo.tuLark ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={dangLam !== null}
                        onClick={() => {
                          setLoiHop(null);
                          setBoBoDau(bo);
                        }}
                      >
                        {t.choLarkTaoLai}
                      </Button>
                    ) : (
                      <span className="text-xs text-[var(--bb-fg-muted)]">{t.khongTuLark}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Xoá hẳn ngay — phải gõ lại đúng mã bộ (không hoàn tác được). */}
      <Dialog
        open={boXoaHan !== null}
        onOpenChange={(mo) => {
          if (!mo && dangLam === null) setBoXoaHan(null);
        }}
      >
        <DialogContent aria-labelledby="tieu-de-xoa-han">
          {boXoaHan && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void xoaHan();
              }}
            >
              <DialogHeader>
                <DialogTitle id="tieu-de-xoa-han">{thay(t.hoiXoaHanTieuDe, boXoaHan.maBo)}</DialogTitle>
                <DialogDescription>{t.hoiXoaHanMoTa}</DialogDescription>
              </DialogHeader>
              <div>
                <label htmlFor="go-lai-ma-bo" className="mb-1 block text-sm font-medium text-[var(--bb-fg)]">
                  {thay(t.goLaiMa, boXoaHan.maBo)}
                </label>
                <Input
                  id="go-lai-ma-bo"
                  name="go-lai-ma-bo"
                  value={goLaiMa}
                  onChange={(e) => {
                    setGoLaiMa(e.target.value);
                    setLoiHop(null);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                />
              </div>
              {loiHop && (
                <p role="alert" className="text-sm text-[var(--bb-danger)]">
                  {loiHop}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={dangLam !== null}
                  onClick={() => setBoXoaHan(null)}
                >
                  {t.huy}
                </Button>
                <Button
                  type="submit"
                  variant="danger"
                  disabled={dangLam !== null || !goDungMa(goLaiMa, boXoaHan.maBo)}
                >
                  {dangLam === boXoaHan.id ? t.dangXoaHan : t.xacNhanXoaHan}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Cho Lark tạo lại — bỏ dấu chặn của bộ đã xoá hẳn. */}
      <Dialog
        open={boBoDau !== null}
        onOpenChange={(mo) => {
          if (!mo && dangLam === null) setBoBoDau(null);
        }}
      >
        <DialogContent aria-labelledby="tieu-de-bo-dau">
          {boBoDau && (
            <>
              <DialogHeader>
                <DialogTitle id="tieu-de-bo-dau">{t.choLarkTaoLai}</DialogTitle>
                <DialogDescription>{thay(t.hoiBoDau, boBoDau.maBo)}</DialogDescription>
              </DialogHeader>
              {loiHop && (
                <p role="alert" className="text-sm text-[var(--bb-danger)]">
                  {loiHop}
                </p>
              )}
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={dangLam !== null}
                  onClick={() => setBoBoDau(null)}
                >
                  {t.huy}
                </Button>
                <Button type="button" disabled={dangLam !== null} onClick={() => void boDau()}>
                  {t.choLarkTaoLai}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
