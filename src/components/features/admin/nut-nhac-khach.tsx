"use client";

/**
 * Nút "Nhắc khách" — BB-327. Gửi THẬT (chuông + thông báo đẩy) qua
 * `POST /api/admin/galleries/[id]/nhac-khach`, rồi hiện ngay "Đã gửi nhắc lúc
 * HH:mm · …". Dùng chung cho Việc hôm nay và danh sách bộ ảnh — trước đây hai
 * nơi chỉ chép một câu vào clipboard nên khách không nhận được gì.
 */

import React from "react";
import { Send, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatGioVN } from "@/lib/utils/dinh-dang";
import { cauDaGuiNhac } from "@/lib/gallery/nhac-khach-ngay";

export function NutNhacKhach({
  galleryId,
  gonNho = false,
  loai = "chon_anh",
}: {
  galleryId: string;
  gonNho?: boolean;
  /** BB-331: "thanh_toan" = nhắc khách trả phần ảnh vượt hạn mức. */
  loai?: "chon_anh" | "thanh_toan";
}) {
  const [dangGui, setDangGui] = React.useState(false);
  const [ketQua, setKetQua] = React.useState<{ ok: boolean; cau: string } | null>(null);

  async function gui() {
    setDangGui(true);
    setKetQua(null);
    try {
      const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/nhac-khach`, {
        method: "POST",
        ...(loai === "thanh_toan"
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loai }) }
          : {}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setKetQua({ ok: false, cau: json?.error?.message ?? "Chưa gửi được, thử lại giúp" });
        return;
      }
      const d = json?.data as { luc: string; daVaoChuong: boolean; soMayNhanDay: number };
      setKetQua({ ok: true, cau: cauDaGuiNhac(d, formatGioVN(new Date(d.luc))) });
    } catch {
      setKetQua({ ok: false, cau: "Mất kết nối, thử lại giúp" });
    } finally {
      setDangGui(false);
    }
  }

  const chuKetQua = ketQua && (
    <span
      role="status"
      data-testid="ket-qua-nhac-khach"
      // BB-331: xuống dòng gọn trong bề rộng cột nút, không tràn sang trái.
      className={`max-w-[15rem] whitespace-normal break-words text-right text-[11px] leading-snug ${ketQua.ok ? "text-[var(--bb-moss,var(--bb-fg-muted))]" : "text-[var(--bb-danger)]"}`}
    >
      {ketQua.cau}
    </span>
  );

  if (gonNho) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {chuKetQua}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => void gui()}
          disabled={dangGui}
          title={ketQua?.cau ?? "Nhắc khách chọn ảnh (chuông + thông báo)"}
          aria-label="Nhắc khách"
        >
          {ketQua?.ok ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </Button>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 whitespace-nowrap text-xs"
        onClick={() => void gui()}
        disabled={dangGui}
      >
        {ketQua?.ok ? <Check className="mr-1 h-3.5 w-3.5" /> : <Send className="mr-1 h-3.5 w-3.5" />}
        {dangGui ? "Đang gửi…" : ketQua?.ok ? "Nhắc lại" : "Nhắc khách"}
      </Button>
      {chuKetQua}
    </span>
  );
}
