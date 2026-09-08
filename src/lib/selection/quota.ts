/**
 * Quota arithmetic for photo selection.
 *
 * OWNER: DEV-BE. Task BB-037 depends on this.
 * Spec: docs/01-prd.md §A3.2
 *
 * Pure functions only — no I/O. The server recomputes counts from the database
 * on every write and at submit time; numbers coming from the client are never
 * trusted, they are only used for optimistic rendering.
 */

import type { SelectionCounts } from "@/types/domain";

export interface QuotaRules {
  includedQuota: number;
  extraPhotoPrice: number;
  /** null = unlimited paid extras. */
  maxSelection: number | null;
  /** false = the customer may not exceed includedQuota at all. */
  allowExtra: boolean;
}

export interface QuotaState extends SelectionCounts {
  includedQuota: number;
  /** Free slots still unused. 0 once the customer is at or past quota. */
  remainingFree: number;
  /** Hard ceiling, or null when there is none. */
  hardLimit: number | null;
  atHardLimit: boolean;
}

/** The effective ceiling: an explicit cap, or the quota itself when extras are off. */
export function hardLimitOf(rules: QuotaRules): number | null {
  if (!rules.allowExtra) return rules.includedQuota;
  return rules.maxSelection;
}

export function computeQuota(
  selectedCount: number,
  favoriteCount: number,
  rules: QuotaRules,
): QuotaState {
  const extraCount = Math.max(0, selectedCount - rules.includedQuota);
  const hardLimit = hardLimitOf(rules);

  return {
    selectedCount,
    favoriteCount,
    extraCount,
    extraAmount: extraCount * rules.extraPhotoPrice,
    includedQuota: rules.includedQuota,
    remainingFree: Math.max(0, rules.includedQuota - selectedCount),
    hardLimit,
    atHardLimit: hardLimit !== null && selectedCount >= hardLimit,
  };
}

export type SelectDecision =
  | { allowed: true; willBecomeExtra: boolean; extraPrice: number }
  | { allowed: false; reason: "QUOTA_EXCEEDED"; hardLimit: number };

/**
 * Can the customer select `additional` more photos right now?
 *
 * Used twice: on the client to warn before the first paid photo, and on the
 * server to reject a batch. A batch that would cross the hard limit is refused
 * whole — partial application would make the counter unpredictable.
 */
export function canSelectMore(
  currentSelected: number,
  additional: number,
  rules: QuotaRules,
): SelectDecision {
  const hardLimit = hardLimitOf(rules);
  const after = currentSelected + additional;

  if (hardLimit !== null && after > hardLimit) {
    return { allowed: false, reason: "QUOTA_EXCEEDED", hardLimit };
  }

  return {
    allowed: true,
    willBecomeExtra: after > rules.includedQuota,
    extraPrice: rules.extraPhotoPrice,
  };
}

/** Vietnamese summary for the sticky selection bar. */
export function formatQuotaSummary(state: QuotaState): string {
  const base = `Đã chọn ${state.selectedCount}/${state.includedQuota}`;
  if (state.extraCount === 0) return base;
  return `${base} · thêm ${state.extraCount} ảnh = ${formatVnd(state.extraAmount)}`;
}

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(amount);
}
