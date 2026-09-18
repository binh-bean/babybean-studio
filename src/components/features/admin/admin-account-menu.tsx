"use client";

/**
 * Góc tài khoản: ai đang đăng nhập, và nút thoát ra.
 *
 * OWNER: DEV-FE. Task BB-185.
 *
 * ---------------------------------------------------------------------------
 * Hiện TÊN, không chỉ hiện nút
 * ---------------------------------------------------------------------------
 * Máy quầy là máy chung. Cái hỏng không phải là "không thoát được" — nó là
 * người ngồi vào **không biết mình đang là ai**. Ca chiều mở app lên, thấy
 * đúng giao diện quen thuộc, làm việc bình thường, và mọi dòng nhật ký ghi tên
 * người ca sáng.
 *
 * Nên tên và vai trò đứng ngay cạnh nút, luôn hiện. Một dòng chữ nhỏ ở đây rẻ
 * hơn nhiều so với đi truy lại `activity_logs` xem thật ra ai đã bấm.
 *
 * Trên màn hẹp chỉ còn vai trò — tên khách hàng thì giấu được, tên nhân viên
 * của chính mình thì không cần giấu, nhưng chỗ thì thật sự không đủ.
 */

import React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { vi } from "@/i18n/vi";

export function AdminAccountMenu({
  hoTen,
  role,
}: {
  hoTen?: string | null;
  role?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const tenVai = role
    ? ((vi.admin.staff.roles as Record<string, string>)[role] ?? role)
    : "";

  async function dangXuat() {
    setBusy(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Mất mạng giữa chừng: vẫn đi tiếp xuống /login. Cookie có thể còn, nhưng
      // đứng im ở màn quản trị sau khi bấm Đăng xuất là tệ hơn hẳn — người ta
      // sẽ bỏ đi và tưởng mình đã thoát.
    }
    // `replace` chứ không `push`: bấm nút Lùi sau khi thoát mà quay lại được
    // màn quản trị (dù chỉ là bản trong bộ nhớ đệm) là đúng thứ làm người ta
    // tưởng nút này không chạy.
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden text-right text-xs leading-tight sm:block">
        {hoTen ? <span className="block font-medium">{hoTen}</span> : null}
        <span className="block text-[var(--bb-fg-muted)]">{tenVai}</span>
      </span>
      <Button
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => void dangXuat()}
        title="Đăng xuất khỏi máy này"
      >
        <LogOut className="h-4 w-4" />
        <span className="ml-2 hidden sm:inline">Đăng xuất</span>
      </Button>
    </div>
  );
}
