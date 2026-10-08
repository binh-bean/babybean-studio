/**
 * Khách duyệt ảnh đã chỉnh, hoặc yêu cầu sửa.
 *
 * OWNER: PM. Task BB-121.
 * Spec: docs/16 mục 4b
 *
 * ---------------------------------------------------------------------------
 * Không duyệt được thứ chưa xem
 * ---------------------------------------------------------------------------
 * Nút "duyệt" chỉ hiện khi có link bản đã chỉnh. Studio quên dán link mà khách
 * vẫn bấm duyệt được thì bộ ảnh đi thẳng vào xưởng in, và cái sai chỉ lộ ra
 * lúc khách cầm ảnh trên tay.
 *
 * ---------------------------------------------------------------------------
 * Yêu cầu sửa phải mở ra thành ô viết
 * ---------------------------------------------------------------------------
 * Bấm một nút là gửi ngay thì khách gửi "sửa" rỗng, người chỉnh ảnh phải gọi
 * lại hỏi sửa gì — khách trả lời hai lần cho một việc. Ô viết mở ra trước, nút
 * gửi tắt khi chưa có chữ.
 *
 * ---------------------------------------------------------------------------
 * Lịch sử để MỞ SẴN, không giấu sau một nút
 * ---------------------------------------------------------------------------
 * Đến vòng thứ ba, câu hỏi của cả hai bên đều là "lần trước đã nói gì rồi".
 * Giấu đi thì khách viết lại yêu cầu cũ, và người chỉnh ảnh sửa lại thứ đã sửa.
 *
 * BB-384 (07/10/2026) — anh: "vòng khách duyệt anh muốn như yêu cầu của anh ở bản
 * yêu cầu". Bỏ HẲN đường khách duyệt bằng link Drive + ô chữ chung: khung này chỉ
 * còn thông tin (đang chỉnh / đã nhận yêu cầu sửa / đã duyệt / lịch sử) và lời Bean
 * "đang chuẩn bị ảnh" khi bộ ở bước duyệt mà app chưa có ảnh chỉnh. Duyệt / xin sửa
 * từng tấm nằm ở `anh-chinh-sua-khach.tsx`. Các đoạn chú thích BB-121 ở trên là
 * lịch sử.
 *
 * BB-212 — đổi sang ngôn ngữ "cuốn album kỷ niệm" (font-display, nút viên
 * tròn màu mực, viền mảnh cho nút phụ). Hành vi và luật quyết định
 * giữ nguyên. BB-305 (28/09/2026): font-display
 * chuyển từ Fraunces sang Playfair Display (LUẬT PHÔNG mới).
 */

"use client";

import { vi } from "@/i18n";
import React from "react";
import { formatNgayVN } from "@/lib/utils/dinh-dang";
import { giuA } from "@/lib/utils/giu-a";
import { tomTatVongSua } from "@/lib/anh-chinh-sua/vong-duyet";
import { cauHanSua } from "@/lib/anh-chinh-sua/han-sua";

export interface ReviewRound {
  round: number;
  note: string;
  createdAt: string;
  resolved: boolean;
}

export interface ReviewData {
  /**
   * BB-371 — số ảnh chỉnh ba mẹ xem được NGAY TRONG APP (CSKH đã "Gửi khách
   * duyệt"). > 0 thì màn khách vẽ khối `AnhChinhSuaKhach` thay cho khung này.
   */
  soAnhChinhTrongApp?: number;
  finalDriveUrl: string | null;
  rounds: ReviewRound[];
  /**
   * BB-298 — ngày giao thật (`deliveries.delivered_at`), cho dấu "Đã hoàn
   * thiện · giao ngày dd/mm/yyyy" ở màn "Đã giao" (bản vẽ BB-297). `null` khi
   * chưa có dòng `deliveries` hoặc chưa ghi ngày giao — màn khách ẩn phần
   * ngày, không bịa.
   */
  deliveredAt?: string | null;
  /**
   * BB-387 — số ngày Bean ước tính gửi lại ảnh sửa (Cài đặt `gallery.revision_days_estimate`,
   * mặc định 3). Màn khách KHÔNG nêu tên thợ chỉnh nên không còn trường người chỉnh.
   */
  soNgaySua?: number;
  /** BB-402 — số đợt mua thêm CSKH đã gửi duyệt mà ba mẹ chưa duyệt (`loaiNutChinh`). */
  soDotMuaThemChoDuyet?: number;
}

/**
 * BB-295 mục #14 — báo cáo chấm độc lập: khi thẻ hành trình đã nói trạng
 * thái (`anCauTrangThai`) VÀ chưa có link ảnh đã chỉnh VÀ chưa tới lúc duyệt
 * VÀ chưa có lịch sử vòng sửa nào, `ReviewPanel` không còn gì để nói — nhưng
 * trước bản vá vẫn vẽ ra một thẻ viền + nền TRẮNG RỖNG (chỉ padding, không
 * chữ) giữa dòng thời gian và thẻ "Mời ông bà xem ảnh".
 *
 * Tách hàm thuần để phép thử đơn vị canh được đúng LUẬT, không phải canh
 * chuỗi HTML render ra (AGENTS.md §5a mục 4) — cùng cách `trangThaiSoTam`
 * ở `cam-on-sau-chot.tsx` đã làm.
 */
export function coNoiDungDeVe(
  anCauTrangThai: boolean,
  finalDriveUrl: string | null,
  showDecide: boolean,
  soVongSua: number,
): boolean {
  return !anCauTrangThai || finalDriveUrl !== null || showDecide || soVongSua > 0;
}

export function ReviewPanel({
  status,
  nhanTienDo,
  coTheHanhTrinh = false,
  review,
  dangChuanBi = false,
}: {
  status: string;
  /**
   * BB-200 (3/3) — chuỗi tiến độ tính từ mã Lark (`nhanHienThi().khach`,
   * docs/21 "Luồng hiển thị"). `null`/`undefined` = giữ câu cũ theo `status`.
   */
  nhanTienDo?: string | null;
  /**
   * BB-258 — thẻ hành trình đang hiện thì khung này BỎ câu trạng thái `in_retouch`
   * (đã lặp nguyên văn), giữ lịch sử sửa bên dưới.
   */
  coTheHanhTrinh?: boolean;
  review: ReviewData;
  /**
   * BB-384 — bộ ở bước duyệt (app `awaiting_approval` hoặc Lark "Đã gửi duyệt") mà
   * app CHƯA có ảnh chỉnh để ba mẹ xem: chỉ lời Bean, không nút (`khoiVungDuyet`).
   */
  dangChuanBi?: boolean;
}) {
  const t = vi.gallery.anhChinh;
  // BB-384 — khung này KHÔNG còn nút duyệt / ô chữ chung / link Drive: vòng duyệt luôn
  // đi trong app (`AnhChinhSuaKhach`). Ở đây chỉ còn thông tin.
  const anCauTrangThai = (coTheHanhTrinh && status === "in_retouch") || status === "delivered";
  const vongMo = review.rounds.filter((r) => !r.resolved);

  if (!dangChuanBi && !coNoiDungDeVe(anCauTrangThai, null, false, review.rounds.length)) {
    return null;
  }

  return (
    <div className="space-y-3.5 rounded-2xl border border-border bg-surface p-5" data-testid="khung-vong-duyet">
      {dangChuanBi ? (
        <div data-testid="bean-dang-chuan-bi-duyet">
          <p className="kh-h3">{t.chuanBiTieuDe}</p>
          <p className="mt-1 text-sm text-muted-foreground">{giuA(t.chuanBiMoTa)}</p>
        </div>
      ) : (
        !anCauTrangThai && (
          <p className="kh-h3">
            {status === "in_retouch"
              ? (nhanTienDo ?? vi.gallery.loiBean.dangChinhAnh)
              : status === "delivered"
                ? "Ảnh đã hoàn thiện"
                : "Ba mẹ đã duyệt bộ ảnh này"}
          </p>
        )
      )}

      {/* BB-371/384 — "Bean đã nhận yêu cầu sửa lần N": xác nhận RÕ đã nhận gì (số tấm,
          từng tấm, ghi chú chung), ai sửa và khi nào báo lại — ba mẹ đang không vui cần
          biết chắc lời mình đã tới nơi. */}
      {status === "in_retouch" && vongMo.length > 0 && (() => {
        const moi = vongMo.reduce((a, b) => (b.round > a.round ? b : a));
        const tt = tomTatVongSua(moi.note);
        return (
          <div className="space-y-1.5 text-sm" data-testid="da-nhan-yeu-cau-sua">
            <p className="font-medium">{giuA(t.daNhanTieuDe.replace("{n}", String(moi.round)))}</p>
            {tt.soTam > 0 && (
              <div data-testid="da-nhan-cac-tam">
                <p className="text-muted-foreground">{t.daNhanSoTam.replace("{n}", String(tt.soTam))}</p>
                <ul className="mt-0.5 list-disc pl-5">
                  {tt.tam.map((x) => (
                    <li key={x.ten}>
                      <span className="font-medium">{x.ten}</span> — {x.ghiChu}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {tt.ghiChuChung && (
              <p data-testid="da-nhan-ghi-chu-chung">
                <span className="text-muted-foreground">{t.daNhanGhiChuChung}</span>{" "}
                <span className="whitespace-pre-line">{tt.ghiChuChung}</span>
              </p>
            )}
            <p className="text-muted-foreground">{giuA(t.suaLoiBean)}</p>
            <p className="text-muted-foreground" data-testid="ai-dang-sua">
              {giuA(cauHanSua(review.soNgaySua))}
            </p>
          </div>
        );
      })()}

      {review.rounds.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-3" data-testid="lich-su-vong-sua">
          {review.rounds.map((r) => (
            <li key={r.round} className="text-xs">
              <span className="text-muted-foreground">
                {t.lanSua.replace("{n}", String(r.round))} · {formatNgayVN(r.createdAt)} ·{" "}
                {r.resolved ? t.beanDaSua : t.beanDangSua}
              </span>
              <br />
              <span className="whitespace-pre-line">{r.note}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
