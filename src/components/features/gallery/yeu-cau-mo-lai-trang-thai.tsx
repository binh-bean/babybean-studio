/**
 * Dải trạng thái "xin mở lại" ở màn khách — CẢ BA trạng thái đã xử lý xong
 * (đang chờ / đã mở / bị từ chối). `khong_co` (chưa từng xin) không vẽ gì.
 *
 * OWNER: DEV-FE. Task BB-312 (P0, chủ studio): "Màn khách không cho ba mẹ
 * biết đã xin bao nhiêu lần, yêu cầu trước đang ở trạng thái nào và vì sao."
 *
 * Đứng NGOÀI hộp thoại "Yêu cầu sửa lại" (form gửi yêu cầu MỚI, đã có sẵn
 * trong `gallery-app.tsx`) — hộp thoại đó chỉ mở khi ba mẹ CHỦ ĐỘNG bấm nút;
 * dải này LUÔN hiện ngay trên trang khi có gì để nói, kể cả sau khi CSKH đã
 * MỞ LẠI bộ ảnh (lúc đó nút "Yêu cầu sửa lại" đã biến mất vì bộ ảnh hết khoá,
 * nhưng ba mẹ vẫn cần biết CHUYỆN GÌ VỪA XẢY RA).
 */

"use client";

import React from "react";
import { formatNgayVN } from "@/lib/utils/dinh-dang";

export interface ReopenRequestTrangThai {
  trangThai: "khong_co" | "cho_xu_ly" | "da_mo" | "bi_tu_choi";
  lucGuiGanNhat: string | null;
  lyDoKhach: string | null;
  lyDoTuChoi: string | null;
  lucXuLy: string | null;
  lanThu: number;
}

function gioNgay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const gio = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return `${gio} · ${formatNgayVN(iso)}`;
}

export function YeuCauMoLaiTrangThai({
  reopenRequest,
  hotline,
  zaloOa,
}: {
  reopenRequest: ReopenRequestTrangThai | null | undefined;
  hotline?: string;
  zaloOa?: string;
}) {
  if (!reopenRequest || reopenRequest.trangThai === "khong_co") return null;

  const lienHe = zaloOa
    ? { nhan: "Nhắn cho studio", href: `https://zalo.me/${zaloOa}` }
    : hotline
      ? { nhan: "Gọi cho studio", href: `tel:${hotline}` }
      : null;

  if (reopenRequest.trangThai === "cho_xu_ly") {
    return (
      <div
        data-testid="yeu-cau-mo-lai-trang-thai"
        className="rounded-2xl border border-border bg-surface p-4 text-sm"
      >
        <p className="font-medium">
          Đã gửi yêu cầu mở lại
          {reopenRequest.lucGuiGanNhat && <> lúc {gioNgay(reopenRequest.lucGuiGanNhat)}</>}
          {reopenRequest.lanThu > 1 && <> · lần {reopenRequest.lanThu}</>}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Studio sẽ phản hồi sớm — chưa cần gửi lại.
        </p>
      </div>
    );
  }

  if (reopenRequest.trangThai === "bi_tu_choi") {
    return (
      <div
        data-testid="yeu-cau-mo-lai-trang-thai"
        className="rounded-2xl border border-[#e7cf9f] bg-[#fbf3e2] p-4 text-[#5c4413]"
      >
        <p className="text-sm font-medium">
          Studio phản hồi: {reopenRequest.lyDoTuChoi ?? "Chưa mở lại được lúc này"}
        </p>
        {reopenRequest.lanThu > 0 && (
          <p className="mt-0.5 text-[13px] opacity-90">Lần {reopenRequest.lanThu}</p>
        )}
        {lienHe && (
          <a
            href={lienHe.href}
            target={lienHe.href.startsWith("http") ? "_blank" : undefined}
            rel={lienHe.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="mt-2 inline-flex h-9 items-center rounded-full border border-[#5c4413]/30 px-4 text-[13px] font-medium hover:bg-[#5c4413]/10"
          >
            {lienHe.nhan}
          </a>
        )}
      </div>
    );
  }

  // trangThai === "da_mo"
  return (
    <div
      data-testid="yeu-cau-mo-lai-trang-thai"
      className="rounded-2xl border border-[#bcd0ae] bg-[#eef4e7] p-4 text-[#37471f]"
    >
      <p className="text-sm font-medium">Studio đã mở lại, ba mẹ chọn tiếp nhé</p>
    </div>
  );
}
