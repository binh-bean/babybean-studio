"use client";

/**
 * /admin/staff — "Nhân sự & vai trò", hai tab gộp một trang.
 *
 * Task BB-280. Trước đây "Nhân sự" (BB-063) và "Vai trò" (BB-172) là hai mục
 * menu rời trong nhóm Hệ thống — cùng chủ đề "ai được làm gì trong hệ thống"
 * nên gộp lại, /admin/roles cũ đổi hướng sang tab thứ hai (next.config.ts).
 *
 * Component `StaffManager`/`RolesManager` giữ NGUYÊN logic — chỉ bỏ tiêu đề
 * riêng của `StaffManager` (chuyển lên `PageHeader` ở đây) để không in tiêu
 * đề hai lần.
 */

import { useCallback, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { PageHeader } from "./page-header";
import { StaffManager } from "./staff-manager";
import { RolesManager } from "./roles-manager";
import { vi } from "@/i18n/vi";

type TabValue = "nhan-su" | "vai-tro";

function laTabHopLe(v: string | null): v is TabValue {
  return v === "nhan-su" || v === "vai-tro";
}

export function NhanSuVaiTro() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const active: TabValue = laTabHopLe(tabParam) ? tabParam : "nhan-su";
  // BB-320 (Q-N1): nút chính "Thêm nhân viên" đứng trong khối tiêu đề như mọi
  // màn khác; state mở form nằm ở đây để StaffManager và nút dùng chung.
  const [moFormNhanVien, setMoFormNhanVien] = useState(false);

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
        title="Nhân sự & vai trò"
        description={active === "vai-tro" ? vi.admin.vaiTro.subtitle : vi.admin.staff.subtitle}
        actions={
          active === "nhan-su" ? (
            <Button onClick={() => setMoFormNhanVien((v) => !v)}>{vi.admin.staff.addButton}</Button>
          ) : undefined
        }
      />
      <Tabs value={active} onValueChange={onChange}>
        <TabsList>
          <TabsTrigger value="nhan-su" data-testid="tab-nhan-su">
            Nhân sự
          </TabsTrigger>
          <TabsTrigger value="vai-tro" data-testid="tab-vai-tro">
            Vai trò
          </TabsTrigger>
        </TabsList>
        <TabsContent value="nhan-su" className="mt-6">
          <StaffManager showForm={moFormNhanVien} onShowFormChange={setMoFormNhanVien} />
        </TabsContent>
        <TabsContent value="vai-tro" className="mt-6">
          <RolesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
