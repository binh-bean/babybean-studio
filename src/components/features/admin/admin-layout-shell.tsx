"use client";

import React, { useEffect, useState } from "react";
import { AdminSidebar } from "./admin-sidebar";
import { AdminHeader } from "./admin-header";
import { SU_KIEN_VIEC_DOI, tabsChoVai, tongViecCanXuLy, type TabViecCanXuLy } from "@/lib/utils/viec-can-xu-ly-tabs";

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
  const [canXuLyCount, setCanXuLyCount] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function taiSoCanXuLy() {
      const demSo: Partial<Record<TabViecCanXuLy, number>> = {};
      let coNguonNaoOk = false;
      await Promise.all(
        tabsChoVai(role).map(async (tab) => {
          try {
            const res = await fetch(tab.api, { cache: "no-store" });
            const json = await res.json().catch(() => null);
            if (!res.ok || !json?.data) return;
            coNguonNaoOk = true;
            demSo[tab.value] = tab.demSo(json.data);
          } catch {
            // Một tab hỏng thì coi là 0 — huy hiệu là phụ.
          }
        }),
      );
      if (!alive || !coNguonNaoOk) return;
      setCanXuLyCount(tongViecCanXuLy(demSo));
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
    <div className="giao-dien-quan-tri flex h-[100dvh] w-full bg-[var(--bb-bg)]">
      <AdminSidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        role={role}
        canXuLyCount={canXuLyCount}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AdminHeader role={role} hoTen={hoTen} canXuLyCount={canXuLyCount} />
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
