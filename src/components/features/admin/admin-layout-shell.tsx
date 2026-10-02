"use client";

import React, { useEffect, useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";
import { TucThiNhanVien } from "./tuc-thi-nhan-vien";
import { SU_KIEN_VIEC_DOI, demViecCanXuLy, type KetQuaDemViec } from "@/lib/utils/viec-can-xu-ly-tabs";
import { DemViecProvider } from "./dem-viec-context";

export function AdminLayoutShell({
  children,
  role,
  hoTen,
}: {
  children: React.ReactNode;
  /** Vai trò của người đang đăng nhập, để ẩn mục Nhân sự với người không có quyền. */
  role?: string;
  /** Tên người đang đăng nhập — máy quầy là máy chung (BB-185). */
  hoTen?: string | null;
}) {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // BB-327 (chủ studio 29/09/2026: "menu hiện 208 mà danh sách không có 208
  // việc"): huy hiệu = TỔNG số dòng của đúng các tab trang "Việc cần xử lý"
  // hiện cho vai này, đếm bằng đúng route từng tab tải
  // (src/lib/utils/viec-can-xu-ly-tabs.ts). Bản cũ (BB-283) cộng theo công
  // thức khối "Cần xử lý ngay" của Bàn làm việc — gồm cả bộ chưa có ảnh, chưa
  // có hạn mức, Lark báo đỏ/tím — những loại không có tab nào trong trang, nên
  // số trên menu không bao giờ khớp danh sách. Đếm lại khi một việc vừa được
  // xử lý (sự kiện SU_KIEN_VIEC_DOI) và khi quay lại cửa sổ. Lỗi thì ẩn.
  // BB-359: MỘT kết quả đếm (`demViecCanXuLy`) cho huy hiệu, Bàn làm việc (dòng phụ
  // + thẻ "Cần xử lý ngay") và số trên các tab — chia qua `DemViecProvider`.
  const [demViec, setDemViec] = useState<KetQuaDemViec | null>(null);
  const canXuLyCount = demViec ? demViec.tong : null;

  useEffect(() => {
    let alive = true;

    async function taiSoCanXuLy() {
      const kq = await demViecCanXuLy(role);
      if (!alive || !kq) return;
      setDemViec(kq);
    }

    let lanCuoi = 0;
    const demLai = () => {
      lanCuoi = Date.now();
      void taiSoCanXuLy();
    };
    // Quay lại cửa sổ: tối đa một lượt mỗi phút, không dội sáu route mỗi lần bấm qua lại.
    const khiQuayLai = () => {
      if (Date.now() - lanCuoi > 60_000) demLai();
    };
    demLai();
    window.addEventListener(SU_KIEN_VIEC_DOI, demLai);
    window.addEventListener("focus", khiQuayLai);
    return () => {
      alive = false;
      window.removeEventListener(SU_KIEN_VIEC_DOI, demLai);
      window.removeEventListener("focus", khiQuayLai);
    };
  }, [role]);

  return (
    // BB-294 (#19) — `giao-dien-quan-tri` khoanh vùng CSS cho nút chính màu
    // mực toàn quản trị; xem khối chú thích cạnh `.giao-dien-quan-tri` trong
    // src/styles/tokens.css.
    <DemViecProvider value={demViec}>
    <div className="giao-dien-quan-tri flex h-[100dvh] w-full bg-[var(--bb-bg)]">
      <AdminSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        role={role}
        canXuLyCount={canXuLyCount}
      />
      {/* BB-342: khách làm gì là huy hiệu đếm lại + thông báo góc màn, không F5. */}
      <TucThiNhanVien />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AdminHeader role={role} hoTen={hoTen} canXuLyCount={canXuLyCount} />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
    </DemViecProvider>
  );
}
