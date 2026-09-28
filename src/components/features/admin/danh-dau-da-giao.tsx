"use client";

/**
 * Nút "Đã giao ảnh" + hộp xác nhận — CSKH đánh dấu bộ ảnh này ĐÃ GIAO cho
 * khách (ảnh in đã giao tận tay), sau khi khách đã duyệt (`approved`).
 *
 * OWNER: DEV-BE. Task BB-311 (P1) — báo cáo vận hành độc lập phát hiện: sau
 * khi khách duyệt, không nơi nào trong mã nguồn từng đặt `status = 'delivered'`,
 * nên mốc "Đã giao tháng này" không bao giờ đạt được bằng thao tác thật.
 *
 * Route đứng sau nút này: `POST /api/admin/galleries/[id]/delivered` — xem
 * file đó để biết vì sao đây PHẢI là bước THỦ CÔNG (ADR-0004: `galleries.status`
 * cố tình không đọc theo Lark) và vì sao chỉ đi được từ 'approved'.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tách thành component riêng
 * ---------------------------------------------------------------------------
 * `gallery-detail.tsx` đang được một đội khác (BB-308) sửa song song trong
 * cùng lịch sử git. Gom hết logic của nút này vào một file MỚI, rồi chỉ thêm
 * một dòng import + một chỗ render vào `gallery-detail.tsx`, để giảm rủi ro
 * đụng độ lúc gộp.
 *
 * ---------------------------------------------------------------------------
 * Vì sao có hộp xác nhận
 * ---------------------------------------------------------------------------
 * Đổi trạng thái bộ ảnh là một hành động không thể hoàn tác từ màn hình (không
 * có nút "Huỷ đã giao"). Dùng lại `Dialog` sẵn có (src/components/ui/dialog.tsx),
 * cùng khuôn với hộp "Xoá vai trò" ở roles-manager.tsx — không tự chế modal mới.
 */
import React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export function DanhDauDaGiao({
  galleryId,
  status,
  canMarkDelivered,
  disabled,
  onDelivered,
}: {
  galleryId: string;
  /** `detail.status` — nút chỉ hiện khi đúng bằng 'approved'. */
  status: string;
  /** `detail.canMarkDelivered` — nhân viên hiện tại có quyền `deliveries:write` không. */
  canMarkDelivered?: boolean;
  /** Bận việc khác ở màn cha (vd đang gửi request khác) — khoá nút theo. */
  disabled?: boolean;
  /** Gọi lại sau khi đánh dấu thành công, để màn cha tải lại dữ liệu. */
  onDelivered: () => void | Promise<void>;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);

  // Màn hình không phải ranh giới an ninh — route API mới là chỗ chặn thật
  // (cùng luật với RetouchSender/ReopenForm ở gallery-detail.tsx). Ẩn nút chỉ
  // để không bày ra thứ chắc chắn sẽ bị route từ chối.
  if (status !== "approved" || !canMarkDelivered) return null;

  async function xacNhan() {
    setBusy(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/delivered`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Không đánh dấu được");
        return;
      }
      setOpen(false);
      await onDelivered();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setLoi(null);
          setOpen(true);
        }}
        disabled={disabled || busy}
      >
        Đã giao ảnh
      </Button>

      <Dialog open={open} onOpenChange={(m) => !busy && setOpen(m)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Xác nhận đã giao ảnh</DialogTitle>
          </DialogHeader>
          <DialogDescription>
            Đánh dấu bộ ảnh này là ĐÃ GIAO cho khách (ảnh in đã giao tận tay). Thao
            tác này đổi trạng thái bộ ảnh và báo cho khách — không có nút hoàn tác
            trên màn hình.
          </DialogDescription>
          {loi && <p className="text-sm text-[var(--bb-danger)]">{loi}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Huỷ
            </Button>
            <Button onClick={() => void xacNhan()} disabled={busy}>
              {busy ? "Đang lưu…" : "Xác nhận đã giao"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
