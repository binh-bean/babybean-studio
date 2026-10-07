"use client";

/**
 * Màn "Gói chụp" — BB-385 (BB-062 nâng P0).
 *
 * OWNER: DEV-FE.
 *
 * Cột Lark (tên, giá gói, số ảnh chỉnh, sản phẩm đi kèm) chỉ đọc. Cột app làm
 * chủ duy nhất: giá ảnh chọn thêm (riêng theo gói, hoặc giá chung). Ô sửa chỉ
 * hiện cho Admin (`settings:system`) — route kiểm lại, màn hình không phải ranh
 * giới an ninh.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Badge, Card, Spinner, EmptyState } from "@/components/ui";
import { PageHeader } from "./page-header";
import { vi } from "@/i18n/vi";
import { formatTien } from "@/lib/utils/dinh-dang";
import { dinhDangNghin, docSoNghin } from "@/lib/utils/so-tien-nhap";
import { GIA_ANH_THEM_TOI_DA, type GoiChupHang } from "@/lib/gallery/gia-goi-chup";

const t = vi.admin.goiChup;

interface DuLieu {
  goi: GoiChupHang[];
  giaChung: number;
  chuaApMigration: boolean;
  coTheSuaGia: boolean;
}

function giaHopLe(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= GIA_ANH_THEM_TOI_DA;
}

export function GoiChupManager() {
  const [duLieu, setDuLieu] = useState<DuLieu | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [baoTin, setBaoTin] = useState<string | null>(null);
  const [tim, setTim] = useState("");
  const [giaChungNhap, setGiaChungNhap] = useState<string>("");
  const [dangSua, setDangSua] = useState<string | null>(null);
  const [giaNhap, setGiaNhap] = useState<string>("");
  const [dangGhi, setDangGhi] = useState(false);

  const tai = useCallback(async () => {
    setDangTai(true);
    try {
      const res = await fetch("/api/admin/goi-chup", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không tải được danh sách gói");
      setDuLieu(body.data as DuLieu);
      setGiaChungNhap(dinhDangNghin((body.data as DuLieu).giaChung));
      setLoi(null);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Không tải được danh sách gói");
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  const ds = useMemo(() => {
    const q = tim.trim().toLowerCase();
    const goi = duLieu?.goi ?? [];
    return q ? goi.filter((g) => g.ten.toLowerCase().includes(q)) : goi;
  }, [duLieu, tim]);

  async function luuGiaChung() {
    const gia = docSoNghin(giaChungNhap);
    if (!giaHopLe(gia)) return setLoi(t.giaKhongHopLe);
    setDangGhi(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thayDoi: [{ key: "gallery.extra_photo_price_default", value: gia }] }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không lưu được giá chung");
      setBaoTin(t.daLuu);
      setLoi(null);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Không lưu được giá chung");
    } finally {
      setDangGhi(false);
    }
  }

  async function luuGiaRieng(g: GoiChupHang, gia: number | null) {
    if (gia !== null && !giaHopLe(gia)) return setLoi(t.giaKhongHopLe);
    setDangGhi(true);
    try {
      const res = await fetch("/api/admin/goi-chup", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenGoi: g.ten, gia }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không lưu được giá");
      setDangSua(null);
      setBaoTin(t.daLuu);
      setLoi(null);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : "Không lưu được giá");
    } finally {
      setDangGhi(false);
    }
  }

  if (dangTai && !duLieu) {
    return (
      <div className="flex items-center gap-3 p-8 text-[var(--bb-fg-muted)]">
        <Spinner /> Đang tải…
      </div>
    );
  }

  const suaDuoc = !!duLieu?.coTheSuaGia;
  const suaRiengDuoc = suaDuoc && !duLieu?.chuaApMigration;

  function oGiaAnhThem(g: GoiChupHang) {
    if (dangSua === g.maGoi) {
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name={`gia-${g.maGoi}`}
            aria-label={`${t.colGiaAnhThem} ${g.ten}`}
            inputMode="numeric"
            className="w-32"
            value={giaNhap}
            onChange={(e) => setGiaNhap(dinhDangNghin(docSoNghin(e.target.value)))}
          />
          <Button size="sm" disabled={dangGhi} onClick={() => luuGiaRieng(g, docSoNghin(giaNhap))}>
            {t.luu}
          </Button>
          {g.giaAnhThemRieng !== null && (
            <Button size="sm" variant="secondary" disabled={dangGhi} onClick={() => luuGiaRieng(g, null)}>
              {t.boGiaRieng}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={dangGhi} onClick={() => setDangSua(null)}>
            {t.huy}
          </Button>
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap font-medium text-[var(--bb-fg)]">{formatTien(g.giaAnhThemApDung)}</span>
        <Badge variant={g.giaAnhThemRieng !== null ? "default" : "secondary"}>
          {g.giaAnhThemRieng !== null ? t.giaRieng : t.dungGiaChung}
        </Badge>
        {suaRiengDuoc && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setDangSua(g.maGoi);
              setGiaNhap(dinhDangNghin(g.giaAnhThemApDung));
            }}
          >
            {t.sua}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.subtitle} />

      {loi && (
        <div
          role="alert"
          className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-danger)] bg-[var(--bb-surface-2)] px-4 py-3 text-sm text-[var(--bb-danger)]"
        >
          {loi}
        </div>
      )}
      {baoTin && (
        <div
          role="status"
          className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface-2)] px-4 py-3 text-sm text-[var(--bb-fg)]"
        >
          {baoTin}
        </div>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--bb-fg)]">{t.giaChungTitle}</h2>
            <p className="text-sm text-[var(--bb-fg-muted)]">{t.giaChungMoTa}</p>
          </div>
          {suaDuoc ? (
            <div className="flex items-center gap-2">
              <Input
                name="gia-chung"
                aria-label={t.giaChungTitle}
                inputMode="numeric"
                className="w-36"
                value={giaChungNhap}
                onChange={(e) => setGiaChungNhap(dinhDangNghin(docSoNghin(e.target.value)))}
              />
              <span className="text-sm text-[var(--bb-fg-muted)]">₫</span>
              <Button size="sm" disabled={dangGhi} onClick={luuGiaChung}>
                {t.luu}
              </Button>
            </div>
          ) : (
            <span className="text-lg font-semibold text-[var(--bb-fg)]">{formatTien(duLieu?.giaChung ?? null)}</span>
          )}
        </div>
        <p className="text-sm text-[var(--bb-fg-muted)]">{t.khongHoiTo}</p>
        {!suaDuoc && <p className="text-sm text-[var(--bb-fg-muted)]">{t.chiXem}</p>}
        {duLieu?.chuaApMigration && <p className="text-sm text-[var(--bb-warning,var(--bb-fg))]">{t.chuaApMigration}</p>}
      </Card>

      <Input
        name="tim-goi"
        aria-label={t.timGoi}
        placeholder={t.timGoi}
        className="max-w-sm"
        value={tim}
        onChange={(e) => setTim(e.target.value)}
      />

      {ds.length === 0 ? (
        <EmptyState title={t.trong} description={t.trongMoTa} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bb-border)] text-left text-[var(--bb-fg-muted)]">
                <th className="px-4 py-3 font-medium">{t.colTen}</th>
                <th className="px-4 py-3 font-medium">
                  {t.colGiaGoi} <span className="font-normal">· {t.tuLark}</span>
                </th>
                <th className="px-4 py-3 font-medium">
                  {t.colSoAnh} <span className="font-normal">· {t.tuLark}</span>
                </th>
                <th className="px-4 py-3 font-medium">
                  {t.colDiKem} <span className="font-normal">· {t.tuLark}</span>
                </th>
                <th className="px-4 py-3 text-right font-medium">{t.colSoBo}</th>
                <th className="px-4 py-3 font-medium">{t.colGiaAnhThem}</th>
              </tr>
            </thead>
            <tbody>
              {ds.map((g) => (
                <tr
                  key={g.maGoi}
                  className={`border-b border-[var(--bb-border)] align-top last:border-0 ${g.dangBan ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--bb-fg)]">{g.ten}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {!g.dangBan && <Badge variant="secondary">{t.ngungBan}</Badge>}
                      {!g.coTrongDanhMuc && <Badge variant="secondary">{t.ngoaiDanhMuc}</Badge>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--bb-fg)]">
                    {g.giaGoi !== null ? formatTien(g.giaGoi) : <span className="text-[var(--bb-fg-muted)]">{t.chuaBan}</span>}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-[var(--bb-fg)]">
                    {g.soAnhChinh !== null ? g.soAnhChinh : <span className="text-[var(--bb-fg-muted)]">{t.khongCoHopDong}</span>}
                  </td>
                  <td className="px-4 py-3 text-[var(--bb-fg)]">
                    {g.sanPhamDiKem.length > 0 ? g.sanPhamDiKem.join(", ") : "—"}
                    {g.soHopDongKhac > 0 && (
                      <div className="text-xs text-[var(--bb-fg-muted)]">
                        {t.hopDongKhac.replace("{n}", String(g.soHopDongKhac))}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-[var(--bb-fg)]">{g.soBoAnh}</td>
                  <td className="px-4 py-3">{oGiaAnhThem(g)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
