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
 * BB-212 — đổi sang ngôn ngữ "cuốn album kỷ niệm" (font-display Fraunces, nút
 * viên tròn màu mực, viền mảnh cho nút phụ). Hành vi và luật quyết định
 * (`lib/selection/review-rules`) giữ nguyên.
 */

"use client";

import React from "react";
import { canApprove, canRequestRevision } from "@/lib/selection/review-rules";

export interface ReviewRound {
  round: number;
  note: string;
  createdAt: string;
  resolved: boolean;
}

export interface ReviewData {
  finalDriveUrl: string | null;
  rounds: ReviewRound[];
}

export function ReviewPanel({
  status,
  nhanTienDo,
  coTheHanhTrinh = false,
  review,
  hotline,
  onDecide,
}: {
  status: string;
  /**
   * BB-200 (3/3) — chuỗi tiến độ tính từ mã Lark (`nhanHienThi().khach`,
   * docs/21 "Luồng hiển thị"). CSKH xác nhận xong mà Lark còn "Đã chọn hình"
   * (bộ ảnh XẾP HÀNG, chưa ai chỉnh) thì khách phải thấy "Bộ ảnh đã được ghi
   * nhận yêu cầu", KHÔNG phải "Studio đang chỉnh ảnh" — nói đang làm trong
   * khi chưa ai đụng vào là hứa sai. `null`/`undefined` = giữ câu cũ theo
   * `status` (chưa đọc được Lark, hoặc bộ đã ở giai đoạn không cần Lark).
   */
  nhanTienDo?: string | null;
  /**
   * BB-258 — chủ studio 26/09/2026: câu trạng thái ("Bộ ảnh đã được ghi nhận
   * yêu cầu") hiện HAI LẦN liền nhau — tiêu đề thẻ hành trình
   * (`the-hanh-trinh.tsx`) và khung này, cả hai cùng đọc `nhanTienDo`. Khi thẻ
   * hành trình đang hiện (gallery-app tính, truyền vào đây) thì khung này BỎ
   * câu trạng thái của riêng nó cho trường hợp `in_retouch` — đúng cái đã lặp
   * — nhưng GIỮ nguyên lịch sử sửa và nút duyệt/xin sửa bên dưới.
   */
  coTheHanhTrinh?: boolean;
  review: ReviewData;
  hotline: string;
  onDecide: (decision: "approve" | "revise", note?: string) => Promise<void>;
}) {
  const [writing, setWriting] = React.useState(false);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  // Luật nằm ở @/lib/selection/review-rules — có phép thử gọi thẳng vào đó.
  const state = { status, finalDriveUrl: review.finalDriveUrl };
  const canDecide = status === "awaiting_approval";
  const showDecide = canApprove(state);

  async function send(decision: "approve" | "revise") {
    setBusy(true);
    try {
      await onDecide(decision, decision === "revise" ? note.trim() : undefined);
      setNote("");
      setWriting(false);
    } finally {
      setBusy(false);
    }
  }

  // BB-258 — chỉ bỏ câu trạng thái ở NHÁNH `in_retouch`: đó là nhánh đọc
  // cùng `nhanTienDo` với tiêu đề thẻ hành trình nên mới thật sự lặp lại
  // nguyên văn. Nhánh `awaiting_approval`/đã duyệt dùng câu RIÊNG của khung
  // này (không đọc `nhanTienDo`), không lặp, nên vẫn hiện như cũ.
  const anCauTrangThai = coTheHanhTrinh && status === "in_retouch";

  return (
    <div className="space-y-3.5 rounded-2xl border border-border bg-surface p-5">
      {!anCauTrangThai && (
        <div>
          <p className="font-display text-lg font-light leading-tight">
            {status === "in_retouch"
              ? (nhanTienDo ?? "Studio đang chỉnh ảnh")
              : status === "awaiting_approval"
                ? "Ảnh đã chỉnh xong, mời ba mẹ xem"
                : "Ba mẹ đã duyệt bộ ảnh này"}
          </p>
          {status === "in_retouch" && review.rounds.some((r) => !r.resolved) && (
            <p className="mt-1 text-xs text-muted-foreground">
              Studio đang sửa theo yêu cầu của ba mẹ, xong sẽ gửi lại link mới.
            </p>
          )}
        </div>
      )}

      {review.finalDriveUrl && (
        <a
          href={review.finalDriveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium text-primary underline underline-offset-2"
        >
          Mở thư mục ảnh đã chỉnh
        </a>
      )}

      {canDecide && !review.finalDriveUrl && (
        <p className="text-xs text-heart">
          Chưa có link ảnh đã chỉnh. Ba mẹ gọi giúp hotline{" "}
          <span className="font-semibold">{hotline}</span> để studio gửi lại.
        </p>
      )}

      {showDecide && !writing && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void send("approve")}
            className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            Duyệt, cho in
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setWriting(true)}
            className="h-10 rounded-full border border-border px-5 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-40"
          >
            Yêu cầu sửa
          </button>
        </div>
      )}

      {showDecide && writing && (
        <div className="space-y-2">
          <label htmlFor="revision-note" className="block text-xs text-muted-foreground">
            Ba mẹ ghi giúp cần sửa gì, càng rõ càng nhanh (ví dụ: ảnh số 3 sáng quá).
          </label>
          <textarea
            id="revision-note"
            name="note"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !canRequestRevision(state, note)}
              onClick={() => void send("revise")}
              className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
            >
              Gửi yêu cầu sửa
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setWriting(false)}
              className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground transition hover:bg-surface-2 disabled:opacity-40"
            >
              Quay lại
            </button>
          </div>
        </div>
      )}

      {review.rounds.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-3">
          {review.rounds.map((r) => (
            <li key={r.round} className="text-xs">
              <span className="text-muted-foreground">
                Lần {r.round} · {new Date(r.createdAt).toLocaleDateString("vi-VN")}
                {r.resolved ? " · studio đã sửa" : " · studio đang sửa"}
              </span>
              <br />
              {r.note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
