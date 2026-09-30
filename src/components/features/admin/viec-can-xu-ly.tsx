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
import { LarkDaXoaReport } from "./lark-da-xoa-report";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "./page-header";
import { LoiDongBoReport } from "./loi-dong-bo-report";
import { LinkSapHetHanReport } from "./link-sap-het-han-report";
import { OverQuotaReport } from "./over-quota-report";
import { YeuCauMoLaiReport } from "./yeu-cau-mo-lai-report";
import { KhachMuaThemReport } from "./dot-chon-admin";
import { QuenMatKhauReport } from "./quen-mat-khau-report";
import { formatSo } from "@/lib/utils/dinh-dang";
import { SU_KIEN_VIEC_DOI, TABS_VIEC_CAN_XU_LY, tabsChoVai as locTabTheoVai, type TabViecCanXuLy } from "@/lib/utils/viec-can-xu-ly-tabs";

type TabValue = TabViecCanXuLy;

function laTabHopLe(v: string | null): v is TabValue {
  return TABS_VIEC_CAN_XU_LY.some((t) => t.value === v);
}

export function ViecCanXuLy({ role }: { role?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // BB-327: định nghĩa tab + cách đếm dùng CHUNG với huy hiệu menu
  // (admin-layout-shell.tsx) — số trên menu luôn bằng tổng số trên các tab.
  const [khongCoQuyenQuenMk, setKhongCoQuyenQuenMk] = useState(false);
  const tabsChoVai = locTabTheoVai(role).filter((t) => !(t.value === "quen-mat-khau" && khongCoQuyenQuenMk));
  const tabParam = searchParams.get("tab");
  const macDinh = tabsChoVai[0]?.value ?? "over-quota";
  const active: TabValue =
    laTabHopLe(tabParam) && tabsChoVai.some((t) => t.value === tabParam) ? tabParam : macDinh;

  const [demSo, setDemSo] = useState<Partial<Record<TabValue, number>>>({});

  useEffect(() => {
    let alive = true;
    function demLai() {
      for (const tab of locTabTheoVai(role)) {
        fetch(tab.api, { cache: "no-store" })
          .then((res) => res.json().catch(() => null).then((json) => ({ ok: res.ok, json })))
          .then(({ ok, json }) => {
            if (!alive || !ok || !json?.data) return;
            if (tab.value === "quen-mat-khau" && json.data.coQuyen === false) setKhongCoQuyenQuenMk(true);
            setDemSo((truoc) => ({ ...truoc, [tab.value]: tab.demSo(json.data) }));
          })
          .catch(() => {
            // Đếm là phụ — hỏng thì thôi, không chặn tab chạy.
          });
      }
    }
    demLai();
    // BB-327: xử lý xong một việc (mở lại, từ chối…) thì đếm lại ngay.
    window.addEventListener(SU_KIEN_VIEC_DOI, demLai);
    return () => {
      alive = false;
      window.removeEventListener(SU_KIEN_VIEC_DOI, demLai);
    };
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
        description="Những việc CSKH cần xử lý trước khi khách gặp vấn đề — bộ ảnh chưa tải được, link sắp hết hạn, ảnh vượt hạn mức, yêu cầu mở lại, khách mua thêm chờ xác nhận, nhân viên quên mật khẩu."
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
        {tabsChoVai.some((t) => t.value === "lark-da-xoa") && (
          <TabsContent value="lark-da-xoa">
            <LarkDaXoaReport />
          </TabsContent>
        )}
        {tabsChoVai.some((t) => t.value === "quen-mat-khau") && (
          <TabsContent value="quen-mat-khau" className="mt-6">
            <QuenMatKhauReport />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
