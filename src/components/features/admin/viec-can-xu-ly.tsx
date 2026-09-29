"use client";

/**
 * /admin/viec-can-xu-ly — "Việc cần xử lý", ba hàng đợi gộp một trang.
 *
 * Task BB-280. Trước đây ba việc này là ba mục menu rời: "Bộ ảnh lỗi tải"
 * (BB-129), "Link sắp hết hạn" (BB-186), "Ảnh vượt hạn mức" (BB-120) — cùng
 * một bản chất (hàng đợi việc CSKH phải xử lý trước khi khách gặp vấn đề)
 * nhưng nằm rải trong menu phẳng 12 mục, đúng thứ chủ studio gọi là "lộn xộn
 * không logic từ tư duy quản trị hệ thống" (27/09/2026).
 *
 * Component của TỪNG báo cáo giữ NGUYÊN — chỉ đổi chỗ đặt (ba `<TabsContent>`
 * thay vì ba trang), không viết lại logic đã có.
 *
 * ---------------------------------------------------------------------------
 * Vì sao đếm bằng một lượt gọi API riêng, không đợi từng tab tự tải
 * ---------------------------------------------------------------------------
 * Ba component con (`LoiDongBoReport`, `LinkSapHetHanReport`,
 * `OverQuotaReport`) đều tự `fetch` dữ liệu của mình khi được render —
 * nhưng `TabsContent` (src/components/ui/tabs.tsx) chỉ render tab đang chọn,
 * nên số đếm của HAI tab còn lại sẽ trống cho tới khi người dùng bấm vào.
 * Số đếm ngay trên nhãn tab là thứ CSKH liếc để biết việc nào đang tồn đọng
 * mà không cần bấm — nên gọi thẳng BA route đã có sẵn (không route mới, không
 * truy vấn nặng thêm) một lần khi trang mở, chỉ lấy độ dài mảng.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "./page-header";
import { LoiDongBoReport } from "./loi-dong-bo-report";
import { LinkSapHetHanReport } from "./link-sap-het-han-report";
import { OverQuotaReport } from "./over-quota-report";
import { YeuCauMoLaiReport } from "./yeu-cau-mo-lai-report";
import { KhachMuaThemReport } from "./dot-chon-admin";
import { formatSo } from "@/lib/utils/dinh-dang";

type TabValue =
  | "loi-dong-bo"
  | "link-sap-het-han"
  | "over-quota"
  | "yeu-cau-mo-lai"
  | "khach-mua-them";

interface DinhNghiaTab {
  value: TabValue;
  label: string;
  api: string;
  /**
   * Vai bị chặn XEM tab này. Giữ nguyên đúng luật hiển thị của ba menu cũ —
   * BB-280 chỉ sắp lại chỗ đặt, không đổi ai xem được gì.
   */
  hiddenForRoles?: string[];
  /** Đếm số việc từ đáp trả JSON của `api`. */
  demSo: (data: unknown) => number;
}

const TABS: DinhNghiaTab[] = [
  {
    value: "loi-dong-bo",
    label: "Bộ ảnh lỗi tải",
    api: "/api/admin/reports/loi-dong-bo",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: (data) => {
      const d = data as { summary?: { galleryCount?: number } } | null;
      return d?.summary?.galleryCount ?? 0;
    },
  },
  {
    value: "link-sap-het-han",
    label: "Link sắp hết hạn",
    api: "/api/admin/reports/link-sap-het-han",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: (data) => {
      const d = data as { items?: unknown[] } | null;
      return d?.items?.length ?? 0;
    },
  },
  {
    value: "over-quota",
    label: "Ảnh vượt hạn mức",
    api: "/api/admin/reports/over-quota",
    // Không hiddenForRoles: menu cũ cho MỌI vai thấy mục này, kể cả
    // photoshop_ctv — giữ nguyên.
    demSo: (data) => {
      const d = data as { items?: unknown[] } | null;
      return d?.items?.length ?? 0;
    },
  },
  {
    // BB-312 — cùng nguồn với huy hiệu "Cần xử lý ngay"
    // (src/lib/utils/can-xu-ly.ts → choMoLai), một công thức, một chỗ (BB-283).
    value: "yeu-cau-mo-lai",
    label: "Yêu cầu mở lại",
    api: "/api/admin/reports/yeu-cau-mo-lai",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: (data) => {
      const d = data as { items?: unknown[] } | null;
      return d?.items?.length ?? 0;
    },
  },
  {
    // BB-321 — đợt mua thêm khách đã chốt, chờ CSKH xác nhận/từ chối. Cùng nguồn
    // với huy hiệu "Cần xử lý ngay" (src/lib/utils/can-xu-ly.ts → choDotChon).
    value: "khach-mua-them",
    label: "Khách mua thêm",
    api: "/api/admin/reports/dot-chon-cho-xac-nhan",
    hiddenForRoles: ["photoshop_ctv"],
    demSo: (data) => {
      const d = data as { items?: unknown[]; viecDot1?: unknown[] } | null;
      return (d?.items?.length ?? 0) + (d?.viecDot1?.length ?? 0);
    },
  },
];

function laTabHopLe(v: string | null): v is TabValue {
  return (
    v === "loi-dong-bo" ||
    v === "link-sap-het-han" ||
    v === "over-quota" ||
    v === "yeu-cau-mo-lai" ||
    v === "khach-mua-them"
  );
}

export function ViecCanXuLy({ role }: { role?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tabsChoVai = TABS.filter((tab) => !(role && tab.hiddenForRoles?.includes(role)));
  const tabParam = searchParams.get("tab");
  const macDinh = tabsChoVai[0]?.value ?? "over-quota";
  const active: TabValue =
    laTabHopLe(tabParam) && tabsChoVai.some((t) => t.value === tabParam) ? tabParam : macDinh;

  const [demSo, setDemSo] = useState<Partial<Record<TabValue, number>>>({});

  useEffect(() => {
    let alive = true;
    for (const tab of tabsChoVai) {
      fetch(tab.api, { cache: "no-store" })
        .then((res) => res.json().catch(() => null).then((json) => ({ ok: res.ok, json })))
        .then(({ ok, json }) => {
          if (!alive || !ok || !json?.data) return;
          setDemSo((truoc) => ({ ...truoc, [tab.value]: tab.demSo(json.data) }));
        })
        .catch(() => {
          // Đếm là phụ — hỏng thì thôi, không chặn tab chạy.
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- danh sách tab theo vai, không đổi trong một phiên
  }, [role]);

  const onChange = useCallback(
    (value: string) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("tab", value);
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [pathname, router, searchParams]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Việc cần xử lý"
        description="Những việc CSKH cần xử lý trước khi khách gặp vấn đề — bộ ảnh chưa tải được, link sắp hết hạn, ảnh vượt hạn mức, yêu cầu mở lại, khách mua thêm chờ xác nhận."
      />
      <Tabs value={active} onValueChange={onChange}>
        {/* BB-318: hàng tab xuống dòng thay vì tràn ngang — trên 390px bốn tab không vừa một hàng, và bấm tab từng làm CẢ TRANG trượt sang bên. */}
        <TabsList className="h-auto flex-wrap justify-start gap-1">
          {tabsChoVai.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} data-testid={`tab-${tab.value}`}>
              <span className="flex items-center gap-1.5">
                {tab.label}
                {/* BB-294 (mục cũ #39) — số huy hiệu sans tabular, không xô lệch khi đổi số. */}
                {typeof demSo[tab.value] === "number" && demSo[tab.value]! > 0 && (
                  <Badge variant="outline" className="tabular-nums">
                    {formatSo(demSo[tab.value])}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {tabsChoVai.some((t) => t.value === "loi-dong-bo") && (
          <TabsContent value="loi-dong-bo" className="mt-6">
            <LoiDongBoReport />
          </TabsContent>
        )}
        {tabsChoVai.some((t) => t.value === "link-sap-het-han") && (
          <TabsContent value="link-sap-het-han" className="mt-6">
            <LinkSapHetHanReport />
          </TabsContent>
        )}
        {tabsChoVai.some((t) => t.value === "over-quota") && (
          <TabsContent value="over-quota" className="mt-6">
            <OverQuotaReport />
          </TabsContent>
        )}
        {tabsChoVai.some((t) => t.value === "yeu-cau-mo-lai") && (
          <TabsContent value="yeu-cau-mo-lai" className="mt-6">
            <YeuCauMoLaiReport />
          </TabsContent>
        )}
        {tabsChoVai.some((t) => t.value === "khach-mua-them") && (
          <TabsContent value="khach-mua-them">
            <KhachMuaThemReport />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
