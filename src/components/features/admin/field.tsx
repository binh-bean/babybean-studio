"use client";

/**
 * Nhãn cho một ô nhập, dùng chung cho các form quản trị.
 *
 * OWNER: DEV-FE. Task BB-063.
 *
 * Luôn nói rõ ô nào bắt buộc, ô nào không. Người dùng điền xong bấm Lưu rồi mới
 * biết mình thiếu một ô là trải nghiệm tệ, và với form nhiều ô thì họ không
 * đoán được ô nào đang thiếu.
 *
 * Đánh dấu cả hai chiều — dấu sao đỏ cho ô bắt buộc, chữ "không bắt buộc" cho ô
 * còn lại — chứ không chỉ đánh dấu một bên. Nếu chỉ có dấu sao thì người ta vẫn
 * phải suy ra ý nghĩa của việc *không* có dấu sao.
 */

import type { ReactNode } from "react";

export function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex flex-wrap items-baseline gap-x-2 text-sm font-medium text-[var(--bb-fg)]">
        {label}
        {required ? (
          <span className="text-[var(--bb-danger)]" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="text-xs font-normal text-[var(--bb-fg-muted)]">(không bắt buộc)</span>
        )}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--bb-fg-muted)]">{hint}</span>}
    </label>
  );
}

/** Chú thích đặt cuối form, giải nghĩa dấu sao một lần cho cả form. */
export function RequiredLegend() {
  return (
    <p className="text-xs text-[var(--bb-fg-muted)]">
      <span className="text-[var(--bb-danger)]">*</span> là ô bắt buộc
    </p>
  );
}
