import React from "react";
import { Lock } from "lucide-react";
import { trangThaiKhach } from "@/lib/lark/trang-thai-app-lark";

/**
 * BB-353 (P0) — dải khoá đầu lưới (bộ ảnh đã khoá, chưa giao). Tách nguyên
 * khối từ `gallery-app.tsx` (giữ y bố cục) để dòng trạng thái đọc CÙNG hàm
 * `trangThaiKhach()` với bìa, thẻ tiến trình và màn cảm ơn — trước đây dải này
 * tự viết câu riêng ("chế độ chỉ xem", "Bean đang xác nhận… ạ!") nên nói lệch
 * với thẻ tiến trình ngay dưới.
 */
export interface DaiKhoaTrangThaiProps {
  status: string;
  giaiDoan: number | null;
  /** Vừa chốt, CSKH chưa xác nhận (BB-329): nói là đã GỬI, chưa "chốt". */
  daChotChoXacNhan: boolean;
}

export function DaiKhoaTrangThai({ status, giaiDoan, daChotChoXacNhan }: DaiKhoaTrangThaiProps) {
  const tt = trangThaiKhach(status, giaiDoan, { khoa: true });
  return (
    <div data-testid="dai-khoa-trang-thai" className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
      <Lock className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" />
      <div className="text-sm">
        <p className="font-medium">
          {daChotChoXacNhan ? "Ba mẹ đã gửi danh sách ạ" : "Bộ ảnh đang ở chế độ xem lại ạ"}
        </p>
        <p data-testid="dai-khoa-nhan" className="mt-0.5 text-[13px] text-muted-foreground">
          {tt.khach}
        </p>
      </div>
    </div>
  );
}
