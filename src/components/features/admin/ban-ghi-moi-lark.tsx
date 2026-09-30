"use client";

/**
 * BB-332 — khối "Bản ghi mới từ Lark", ĐẦU Bàn làm việc.
 *
 * Dòng Hậu Kỳ mới bên Lark (đủ tên + SĐT + gói, Trạng Thái + Link app trống) chưa thành
 * bộ ảnh. Bấm "Tạo bộ ảnh" → thuật sĩ BB-325 đã điền sẵn mã hóa đơn + SĐT
 * (tra theo mã dòng, không đưa SĐT lên thanh địa chỉ).
 *
 * Dữ liệu: GET /api/admin/lark-moi (tự đồng bộ nếu lượt trước cũ hơn 5 phút),
 * nút "Đồng bộ ngay" = POST cùng đường.
 */
import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CARD_TITLE_CLASS } from "./page-header";

export interface DongBanGhiMoi {
  recordId: string;
  tenKhach: string;
  soDienThoai: string | null;
  goiChup: string;
  maHoaDon: string | null;
  ngayChup: string | null;
  chiNhanh: string | null;
  coDriveLink: boolean;
  thayLuc: string;
  trangThai: { ma: string; nhan: string };
}

interface DuLieu {
  dong: DongBanGhiMoi[];
  dongBoLuc: string | null;
  loiDongBo: string | null;
  chuaApMigration?: boolean;
}

function gioPhut(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });
}

function ngayVN(ymd: string | null): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  return `${d}/${m}/${y}`;
}

export function BanGhiMoiLark() {
  const [duLieu, setDuLieu] = useState<DuLieu | null>(null);
  const [dangDongBo, setDangDongBo] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const tai = useCallback(async (bamTay: boolean) => {
    if (bamTay) setDangDongBo(true);
    setLoi(null);
    try {
      const res = await fetch("/api/admin/lark-moi", { method: bamTay ? "POST" : "GET", cache: "no-store" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.data) {
        setLoi(body?.error?.message ?? "Không tải được bản ghi mới từ Lark");
        return;
      }
      setDuLieu(body.data as DuLieu);
    } catch {
      setLoi("Không kết nối được máy chủ");
    } finally {
      setDangDongBo(false);
    }
  }, []);

  useEffect(() => {
    void tai(false);
  }, [tai]);

  // Chưa áp migration 0079 → khối chưa có nghĩa, không vẽ gì.
  if (duLieu?.chuaApMigration) return null;
  if (!duLieu && !loi) return null;

  const dong = duLieu?.dong ?? [];

  return (
    <Card className="min-w-0" data-testid="ban-ghi-moi-lark">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
        <CardTitle className={CARD_TITLE_CLASS}>
          Bản ghi mới từ Lark
          {dong.length > 0 && (
            <span className="ml-2 align-middle text-sm font-normal tabular-nums text-[var(--bb-fg-muted)]">
              {dong.length}
            </span>
          )}
        </CardTitle>
        <div className="flex items-center gap-3 text-xs text-[var(--bb-fg-muted)]">
          <span>Đồng bộ lúc {gioPhut(duLieu?.dongBoLuc ?? null)}</span>
          <Button variant="outline" size="sm" onClick={() => void tai(true)} disabled={dangDongBo}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${dangDongBo ? "animate-spin" : ""}`} aria-hidden="true" />
            Đồng bộ ngay
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {(loi || duLieu?.loiDongBo) && (
          <p role="alert" className="px-6 pb-3 text-sm text-[var(--bb-danger)]">
            {loi ?? duLieu?.loiDongBo}
          </p>
        )}
        {dong.length === 0 ? (
          <p className="flex items-center gap-2.5 px-6 pb-4 text-sm text-[var(--bb-fg-muted)]" data-testid="ban-ghi-moi-lark-trong">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--bb-moss)]" aria-hidden="true" />
            Không có bản ghi mới nào chờ tạo bộ ảnh.
          </p>
        ) : (
          <ul data-testid="ban-ghi-moi-lark-dong">
            {dong.map((d) => (
              <li
                key={d.recordId}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[var(--bb-border)] px-6 py-3 first:border-t-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--bb-fg)]">{d.tenKhach}</p>
                  <p className="text-xs text-[var(--bb-fg-muted)] [overflow-wrap:anywhere]">
                    {[d.soDienThoai, d.goiChup, d.maHoaDon, d.chiNhanh, ngayVN(d.ngayChup)].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  {d.coDriveLink ? d.trangThai.nhan : `${d.trangThai.nhan} · chưa có link Drive`}
                </Badge>
                <Button asChild size="sm" className="shrink-0">
                  <Link href={`/admin/galleries/create?banGhiLark=${encodeURIComponent(d.recordId)}`}>Tạo bộ ảnh</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
