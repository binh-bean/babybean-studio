/**
 * Lark notifications.
 *
 * OWNER: DEV-INT. Task BB-080 (Phase 3).
 * Spec: docs/08-lark-integration.md
 *
 * STATUS: scaffold — Phase 3. The signature is fixed now so Phase 1 code can
 * enqueue events without waiting for the integration.
 */

import "server-only";

export type LarkEvent =
  | "gallery.sent"
  | "gallery.first_view"
  | "selection.submitted"
  | "gallery.due_soon"
  | "gallery.overdue"
  | "gallery.sync_error"
  | "delivery.ready";

export interface LarkNotification {
  branchId: string;
  event: LarkEvent;
  payload: Record<string, unknown>;
}

/**
 * Queues a notification. Never sends inline: a customer pressing "submit" must
 * not wait on Lark, and a Lark outage must not fail the submit.
 *
 * TODO(BB-080): insert into `notifications` (channel='lark'); the
 * flush-notifications cron builds the message card and posts it.
 *
 * Never put photo URLs in the payload, and mask phone numbers as 090***4567
 * (docs/08-lark-integration.md §5).
 */
export async function enqueueLarkNotification(_notification: LarkNotification): Promise<void> {
  throw new Error("Not implemented (BB-080)");
}
