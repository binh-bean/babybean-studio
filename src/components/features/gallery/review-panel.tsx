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
 */

"use client";

import React from "react";
import { Button } from "@/components/ui/button";
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
  review,
  hotline,
  onDecide,
}: {
  status: string;
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

  return (
    <div className="p-4 rounded-xl border bg-surface space-y-3">
      <div>
        <p className="font-semibold text-sm">
          {status === "in_retouch"
            ? "Studio đang chỉnh ảnh"
            : status === "awaiting_approval"
              ? "Ảnh đã chỉnh xong, mời ba mẹ xem"
              : "Ba mẹ đã duyệt bộ ảnh này"}
        </p>
        {status === "in_retouch" && review.rounds.some((r) => !r.resolved) && (
          <p className="text-xs mt-1 text-muted-foreground">
            Studio đang sửa theo yêu cầu của ba mẹ, xong sẽ gửi lại link mới.
          </p>
        )}
      </div>

      {review.finalDriveUrl && (
        <a
          href={review.finalDriveUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm font-medium underline"
        >
          Mở thư mục ảnh đã chỉnh
        </a>
      )}

      {canDecide && !review.finalDriveUrl && (
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Chưa có link ảnh đã chỉnh. Ba mẹ gọi giúp hotline{" "}
          <span className="font-semibold">{hotline}</span> để studio gửi lại.
        </p>
      )}

      {showDecide && !writing && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={busy} onClick={() => void send("approve")}>
            Duyệt, cho in
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setWriting(true)}>
            Yêu cầu sửa
          </Button>
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
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={busy || !canRequestRevision(state, note)}
              onClick={() => void send("revise")}
            >
              Gửi yêu cầu sửa
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setWriting(false)}>
              Quay lại
            </Button>
          </div>
        </div>
      )}

      {review.rounds.length > 0 && (
        <ul className="space-y-1 border-t pt-3">
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
