/**
 * PATCH /api/g/selection — batched, idempotent selection writes.
 *
 * OWNER: DEV-BE. Task BB-035.
 * Spec: docs/04-api-spec.md §3.4
 *
 * STATUS: scaffold. This file is the reference shape for every customer-facing
 * route handler. Keep the order of operations exactly as commented — parse,
 * authenticate, authorize, mutate, log, respond.
 */

import { randomUUID } from "node:crypto";
// `ok` will be imported once step 3 below returns real counts.
import { fail, failUnexpected } from "@/lib/api-response";
import {
  requireGallerySession,
  GallerySessionError,
  EDITING_ROLES,
} from "@/lib/auth/gallery-session";
import { SelectionPatchSchema } from "./schema";

export const runtime = "nodejs";

export async function PATCH(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Parse ------------------------------------------------------------
    const parsed = SelectionPatchSchema.safeParse(await request.json());
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }

    // 2. Authenticate + authorize ----------------------------------------
    // The gallery is taken from the signed cookie, never from the body.
    const session = await requireGallerySession(EDITING_ROLES);

    // 3. Mutate -----------------------------------------------------------
    // TODO(BB-035) implement in src/lib/selection/mutate.ts:
    //   a. INSERT client_op_id into selection_ops; on conflict, return current
    //      counts with applied = 0 (idempotent retry, HTTP 200, not an error).
    //   b. Load the gallery FOR SHARE; reject with GALLERY_LOCKED when
    //      status is 'submitted', 'delivered' or 'archived'.
    //   c. Force mark 'selected' -> 'suggested' when session.role is
    //      'suggester' (see docs/05-rbac.md §4).
    //   d. Verify every photoId belongs to session.galleryId. A foreign id is
    //      an attack, not a mistake: reject the whole batch with FORBIDDEN.
    //   e. Check canSelectMore() from lib/selection/quota.ts. Over the hard
    //      limit the batch is refused whole — never partially applied.
    //   f. Upsert selection_items on (selection_id, photo_id).
    //   g. Recount from the database. Client-sent counts are display only.
    //
    // 4. Log --------------------------------------------------------------
    //   Write activity_logs in the SAME transaction as the mutation.

    void session;
    return fail("INTERNAL", "Chưa triển khai (BB-035)", { requestId });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
