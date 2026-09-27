"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Inbox,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { bienDongLaTot } from "@/lib/utils/bang-dieu-khien";
import { dongCanXuLy, type CanXuLyTongHop } from "@/lib/utils/can-xu-ly";
import { CARD_TITLE_CLASS } from "./page-header";

type DashboardStats = {
  waitingForSelection: number;
  dueSoon: number;
  overdue: number;
  waitingForRetouch: number;
  deliveredThisMonth: number;
  totalGalleries: number;
};

/** So kỳ trước cho một thẻ số — chỉ thẻ "trong kỳ" mới có mục ở đây (BB-270). */
type SoSanhKy = {
  kyTruoc: number;
  chenhLechPhanTram: number | null;
};

type TienDoChiNhanh = {
  branchId: string;
  branchName: string;
  dangHoatDong: number;
  daChot: number;
  tyLeChot: number | null;
};

type ActionRequiredItem = {
  id: string;
  title: string;
  customer_name: string;
  branch_name: string;
  status: string;
  due_at: string | null;
  selected_count: number;
  included_quota: number | null;
  urgency: string;
};

type ChartData = {
  date: string;
  count: number;
};

type DashboardData = {
  stats: DashboardStats;
  soSanhKy: Partial<Record<keyof DashboardStats, SoSanhKy>>;
  tienDoChiNhanh: TienDoChiNhanh[];
  actionRequired: ActionRequiredItem[];
  chartData: ChartData[];
};

export function Dashboard() {
  const searchParams = useSearchParams();
  const branchId = searchParams?.get("branchId") || "";

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // BB-283 (soát 27/09/2026): "Cần xử lý ngay" giờ đọc CÙNG nguồn với huy
  // hiệu sidebar (`admin-layout-shell.tsx`) — `driveChuaChiaSe`/`chuaCoAnh`
  // từ `GET /api/admin/can-xu-ly`, gộp với `dueSoon`/`overdue` đã có sẵn
  // trong `data.stats`. Tải riêng, không chặn khối chính: hỏng thì khối chỉ
  // thiếu hai loại kia, không sập cả trang.
  const [canXuLy, setCanXuLy] = useState<{ driveChuaChiaSe?: unknown[]; chuaCoAnh?: unknown[] } | null>(null);

  useEffect(() => {
    let active = true;

    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const query = branchId ? `?branchId=${branchId}` : "";
        const res = await fetch(`/api/admin/dashboard${query}`);
        const result = await res.json();

        if (!active) return;

        if (!res.ok) {
          setError(result.error?.message || "Lỗi tải dữ liệu");
        } else {
          setData(result.data);
        }
      } catch (err: unknown) {
        console.error("Lỗi khi tải bảng điều khiển:", err);
        if (active) setError("Lỗi kết nối tới máy chủ");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [branchId]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/can-xu-ly", { cache: "no-store" })
      .then((res) => res.json().catch(() => null).then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!active || !ok || !json?.data) return;
        setCanXuLy(json.data);
      })
      .catch(() => {
        // Phụ — hỏng thì khối "Cần xử lý ngay" chỉ thiếu hai loại này.
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Đang tải dữ liệu...</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive border border-destructive/20">
          <p className="font-semibold">Không thể tải bảng điều khiển</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (data.stats.totalGalleries === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center rounded-xl border border-dashed bg-muted/20">
        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
          <Inbox className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-bold mb-2">Chưa có bộ ảnh nào</h3>
        <p className="text-muted-foreground max-w-md mb-6">
          Chi nhánh này hiện chưa có bộ ảnh nào. Hãy bắt đầu bằng việc đồng bộ ảnh chụp cho khách hàng.
        </p>
        <Button asChild>
          <Link href="/admin/galleries">Đi tới Quản lý bộ ảnh</Link>
        </Button>
      </div>
    );
  }

  const maxChartValue = Math.max(1, ...data.chartData.map(d => d.count));

  // `key`: tên trong `data.stats`/`data.soSanhKy` để tra chip so kỳ trước.
  // `huongTangLaTot`: chỉ đọc khi có chip — thẻ "trong kỳ" mới có mục trong
  // `soSanhKy` (API không trả cho thẻ số dồn hiện tại, xem route.ts).
  //
  // BB-283 (soát 27/09/2026): bỏ icon tròn nhiều màu ở góc thẻ — bản vẽ
  // quan-tri-menu-nhom.png không có, chỉ nhãn hoa + số serif + chip %.
  const stats: {
    key: keyof DashboardStats;
    label: string;
    value: number;
    huongTangLaTot: boolean;
  }[] = [
    { key: "waitingForSelection", label: "Chờ khách chọn", value: data.stats.waitingForSelection, huongTangLaTot: false },
    { key: "dueSoon", label: "Sắp hết hạn", value: data.stats.dueSoon, huongTangLaTot: false },
    { key: "overdue", label: "Quá hạn", value: data.stats.overdue, huongTangLaTot: false },
    { key: "waitingForRetouch", label: "Chờ retouch", value: data.stats.waitingForRetouch, huongTangLaTot: false },
    { key: "deliveredThisMonth", label: "Đã giao tháng này", value: data.stats.deliveredThisMonth, huongTangLaTot: true },
  ];

  return (
    <div className="space-y-8">
      {/*
        BB-280: chủ studio 27/09/2026 chốt lại tư duy màn Tổng quan — khối
        "Cần xử lý" phải lên ĐẦU trang, trước cả hàng thẻ số. Trước đây nó
        đứng thứ hai, sau hàng thẻ số — đúng thứ tự CSKH quan tâm là "việc gì
        cần làm ngay" trước rồi mới tới "số liệu tổng quan".
      */}
      {(() => {
        // BB-283 (soát 27/09/2026): MỘT khối, MỘT nguồn — không còn bảng
        // riêng của BB-270 (due_soon/overdue) đứng cạnh huy hiệu sidebar nói
        // điều khác. `merged`/`dong`/`tong` dùng ĐÚNG hàm sidebar dùng
        // (`src/lib/utils/can-xu-ly.ts`), nên tổng các dòng ở đây LUÔN khớp
        // số trên huy hiệu — không tính lại theo cách khác ở đây.
        const merged: CanXuLyTongHop = {
          driveChuaChiaSe: canXuLy?.driveChuaChiaSe,
          chuaCoAnh: canXuLy?.chuaCoAnh,
          dueSoon: data.stats.dueSoon,
          overdue: data.stats.overdue,
        };
        const dong = dongCanXuLy(merged);
        return (
          <Card className="flex flex-col overflow-hidden min-w-0">
            <CardHeader>
              <CardTitle className={CARD_TITLE_CLASS}>Cần xử lý ngay</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {dong.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 py-12">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500/50" />
                  <p>Tuyệt vời! Không có bộ ảnh nào cần xử lý gấp.</p>
                </div>
              ) : (
                <ul data-testid="can-xu-ly-ngay-rows">
                  {dong.map((d) => (
                    <li key={d.key} className="border-t border-[var(--bb-border)] first:border-t-0">
                      <Link
                        href={d.href}
                        className="flex items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-[var(--bb-surface-2)]"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: d.mauCham }}
                        />
                        <span className="flex-1 font-medium text-[var(--bb-fg)]">{d.nhan}</span>
                        <span className="font-mono text-[var(--bb-fg-muted)]">{d.soLuong}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--bb-fg-muted)]" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Hàng thẻ số — bản vẽ quan-tri-bang-dieu-khien.webp: nhãn nhỏ trên
          cùng, số lớn bên dưới, chip % so kỳ trước ở góc phải (BB-270). Thẻ
          không có mục trong `soSanhKy` (số dồn hiện tại, không phải "trong
          kỳ") thì không hiện chip — xem định nghĩa ở route.ts. */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat, i) => {
          const soSanh = data.soSanhKy[stat.key];
          const laTot = soSanh ? bienDongLaTot(soSanh.chenhLechPhanTram, stat.huongTangLaTot) : null;
          return (
            <Card key={i}>
              <CardContent className="p-5 space-y-3">
                <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--bb-fg-muted)]">
                  {stat.label}
                </span>
                <div className="flex items-end justify-between gap-2">
                  <div className="font-display text-[32px] font-normal text-[var(--bb-fg)]">{stat.value}</div>
                  {soSanh && soSanh.chenhLechPhanTram !== null && (
                    <Badge
                      // Bản vẽ: chip "so kỳ trước" nền sage NHẠT — chỉ đúng khi biến động
                      // là TỐT (laTot === true). Biến động xấu vẫn phải nổi bật khác màu
                      // (variant="default", hồng đất) để CSKH nhận ra ngay — đó là dữ liệu
                      // thật từ BB-270, không phải trang trí, nên KHÔNG gộp về một màu.
                      variant={laTot === true ? "soft-accent" : laTot === false ? "default" : "secondary"}
                      className="gap-0.5 px-1.5 py-0.5"
                      title={`Kỳ trước: ${soSanh.kyTruoc}`}
                    >
                      {soSanh.chenhLechPhanTram >= 0 ? (
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      ) : (
                        <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                      )}
                      {Math.abs(Math.round(soSanh.chenhLechPhanTram))}%
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/*
        `min-w-0` trên hai thẻ con: ô lưới mặc định rộng tối thiểu bằng nội
        dung (`min-width: auto`). Biểu đồ 14 ngày có nhãn `whitespace-nowrap`,
        nên nó đẩy cả cột rộng 653px trên màn 375px — đo thật ngày 21/09/2026:
        bảng điều khiển phải kéo ngang mới đọc được trên điện thoại.
      */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Biểu đồ cột */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className={CARD_TITLE_CLASS}>Bộ ảnh mới (14 ngày)</CardTitle>
          </CardHeader>
          <CardContent>
            {/*
              Biểu đồ cuộn ngang TRONG thẻ của nó, chứ không kéo giãn cả thẻ:
              14 cột với nhãn ngày không nhét vừa 375px, và thu nhỏ nữa thì
              nhãn chồng lên nhau, đọc được mới là thứ đáng giữ.
            */}
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Biểu đồ số bộ ảnh mới 14 ngày qua, cuộn ngang"
            >
              <div className="h-64 flex items-end gap-2 pt-4 min-w-[26rem]">
              {data.chartData.map((d, i) => {
                const heightPercent = (d.count / maxChartValue) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <div
                      className="w-full bg-[var(--bb-fg)]/15 rounded-t-sm group-hover:bg-[var(--bb-fg)] transition-colors relative"
                      style={{ height: `${Math.max(heightPercent, 2)}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold bg-background shadow-sm border px-1.5 py-0.5 rounded">
                        {d.count}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground whitespace-nowrap -rotate-45 origin-top-left mt-2 pl-1">
                      {d.date.split('-').slice(1).join('/')}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/*
          4. Tiến độ theo chi nhánh — bản vẽ quan-tri-bang-dieu-khien.webp:
          tên chi nhánh + thanh ngang mảnh. Thanh thể hiện TỈ LỆ ĐÃ CHỐT trong
          số bộ ảnh đang hoạt động của chi nhánh đó (định nghĩa đầy đủ ở
          `src/lib/utils/bang-dieu-khien.ts`) — không phải % trên tổng số bộ
          ảnh mọi thời, để một chi nhánh cũ nhiều bộ ảnh đã xong không luôn
          hiện thanh gần đầy so với chi nhánh mới còn ít việc.
        */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className={CARD_TITLE_CLASS}>Tiến độ theo chi nhánh</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.tienDoChiNhanh.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có chi nhánh nào để hiện.</p>
            ) : (
              data.tienDoChiNhanh.map((cn) => (
                <div key={cn.branchId} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--bb-fg)] truncate">{cn.branchName}</span>
                    <span className="text-xs text-[var(--bb-fg-muted)] shrink-0">
                      {cn.tyLeChot === null ? "—" : `${Math.round(cn.tyLeChot * 100)}%`}
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full rounded-full bg-[var(--bb-fg)]/10 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={cn.tyLeChot === null ? 0 : Math.round(cn.tyLeChot * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Tiến độ ${cn.branchName}: ${cn.daChot}/${cn.dangHoatDong} bộ ảnh đã chốt`}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--bb-accent)] transition-[width]"
                      style={{ width: `${cn.tyLeChot === null ? 0 : Math.round(cn.tyLeChot * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-[var(--bb-fg-muted)]">
                    {cn.dangHoatDong === 0
                      ? "Không có bộ ảnh nào đang hoạt động"
                      : `${cn.daChot}/${cn.dangHoatDong} bộ đã chốt`}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
