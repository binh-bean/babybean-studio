/**
 * BB-380 — dải "Sáu con số điều hành" ở Bàn làm việc.
 *
 * Đọc CHÍNH báo cáo `sau-con-so` của khung báo cáo (`/api/admin/bao-cao/sau-con-so`):
 * route đó tự lọc chi nhánh theo vai (Admin thấy mọi chi nhánh; vai khác chỉ chi
 * nhánh mình — chọn chi nhánh khác bị 403) và tự ẩn tiền khi thiếu quyền doanh thu.
 * Nhân viên không có quyền xem báo cáo (403) thì dải tự ẩn.
 *
 * Mỗi thẻ là một liên kết sang báo cáo chi tiết, giữ kỳ và chi nhánh đang chọn.
 */
"use client";

import React from "react";
import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CARD_TITLE_CLASS } from "../page-header";
import { TheSoLieu } from "../the-so-lieu";
import type { TheSoBaoCao } from "@/lib/bao-cao/loai";
import { dinhDangNgayVN, kyTuMaDungSan, type MaKyDungSan } from "@/lib/bao-cao/ky";
import { bienDongLaTot } from "@/lib/utils/bang-dieu-khien";
import { formatSo } from "@/lib/utils/dinh-dang";

const CAC_KY: { ma: MaKyDungSan; ten: string }[] = [
  { ma: "7-ngay", ten: "7 ngày" },
  { ma: "30-ngay", ten: "30 ngày" },
  { ma: "thang-nay", ten: "Tháng này" },
];

/** Kỳ → `tu`/`den` (yyyy-mm-dd, `den` tính cả ngày) đúng như trang Báo cáo gửi lên. */
export function kyGui(ma: MaKyDungSan, now: Date = new Date()): { tu: string; den: string } {
  const k = kyTuMaDungSan(ma, now);
  return { tu: dinhDangNgayVN(k.tu), den: dinhDangNgayVN(new Date(k.den.getTime() - 1)) };
}

export function DaiSauConSo({ branchId }: { branchId: string }) {
  const [ky, setKy] = React.useState<MaKyDungSan>("30-ngay");
  const [theSo, setTheSo] = React.useState<TheSoBaoCao[] | null>(null);
  const [trangThai, setTrangThai] = React.useState<"tai" | "xong" | "loi" | "an">("tai");

  React.useEffect(() => {
    let conSong = true;
    const { tu, den } = kyGui(ky);
    const sp = new URLSearchParams({ tu, den, soSanh: "1" });
    if (branchId) sp.set("chiNhanh", branchId);
    setTrangThai("tai");
    fetch(`/api/admin/bao-cao/sau-con-so?${sp.toString()}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (!conSong) return;
        if (res.status === 403 || res.status === 401) {
          setTrangThai("an");
          return;
        }
        if (!res.ok || !json?.data?.ketQua) {
          setTrangThai("loi");
          return;
        }
        setTheSo(json.data.ketQua.theSo as TheSoBaoCao[]);
        setTrangThai("xong");
      })
      .catch(() => {
        if (conSong) setTrangThai("loi");
      });
    return () => {
      conSong = false;
    };
  }, [ky, branchId]);

  if (trangThai === "an") return null;

  const lienKet = (ma: string | undefined) => {
    const sp = new URLSearchParams({ ma: ma ?? "sau-con-so", kyPreset: ky, soSanh: "1" });
    if (branchId) sp.set("chiNhanh", branchId);
    return `/admin/bao-cao?${sp.toString()}`;
  };

  return (
    <Card data-testid="dai-sau-con-so">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className={CARD_TITLE_CLASS}>Sáu con số điều hành</CardTitle>
        <div role="group" aria-label="Chọn kỳ" className="flex gap-1">
          {CAC_KY.map((k) => (
            <button
              key={k.ma}
              type="button"
              onClick={() => setKy(k.ma)}
              aria-pressed={ky === k.ma}
              className={`h-9 rounded-full border px-3 text-xs ${
                ky === k.ma
                  ? "border-[var(--bb-fg)] bg-[var(--bb-fg)] text-[var(--bb-bg)]"
                  : "border-[var(--bb-border)] text-[var(--bb-fg-muted)] hover:text-[var(--bb-fg)]"
              }`}
            >
              {k.ten}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {trangThai === "tai" && !theSo && <p className="text-sm text-[var(--bb-fg-muted)]">Đang tính số liệu…</p>}
        {trangThai === "loi" && <p className="text-sm text-[var(--bb-danger)]">Chưa tải được số liệu, thử lại sau.</p>}
        {theSo && (
          <ul
            className={`grid grid-cols-2 gap-3 md:grid-cols-3 ${trangThai === "tai" ? "opacity-60" : ""}`}
            aria-label="Sáu con số điều hành"
          >
            {theSo.map((t) => {
              const chenh = typeof t.chenhLechPhanTram === "number" ? t.chenhLechPhanTram : null;
              const laTot = bienDongLaTot(chenh, t.tangLaTot !== false);
              const laTien = t.donVi === "đ";
              return (
                <li key={t.nhan} className="min-w-0">
                  <Link
                    href={lienKet(t.maChiTiet)}
                    data-testid="so-dieu-hanh"
                    className="block h-full rounded-[var(--bb-radius)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--bb-fg)]"
                  >
                    <TheSoLieu
                      testId="the-so-dieu-hanh"
                      className="h-full transition-colors hover:border-[var(--bb-fg-muted)]"
                      label={t.nhan}
                      title={t.giaiThich ? `${t.nhan} — ${t.giaiThich}` : t.nhan}
                      value={typeof t.giaTri === "number" ? formatSo(t.giaTri, 1) : String(t.giaTri)}
                      phu={laTien ? "₫" : t.donVi}
                      chuNho={laTien}
                      ghiChu={
                        t.kyTruoc !== undefined
                          ? `Kỳ trước: ${typeof t.kyTruoc === "number" ? formatSo(t.kyTruoc, 1) : t.kyTruoc}`
                          : undefined
                      }
                      gocPhai={
                        chenh !== null ? (
                          <Badge
                            variant={laTot === true ? "soft-accent" : laTot === false ? "default" : "secondary"}
                            className="gap-0.5 px-1.5 py-0.5"
                            aria-label={`${chenh >= 0 ? "Tăng" : "Giảm"} ${Math.abs(Math.round(chenh))}% so với kỳ trước`}
                          >
                            {chenh >= 0 ? (
                              <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                            ) : (
                              <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                            )}
                            {Math.abs(Math.round(chenh))}%
                          </Badge>
                        ) : undefined
                      }
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
