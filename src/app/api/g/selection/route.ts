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
import { ok, fail, failUnexpected } from "@/lib/api-response";
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
    const { patchSelection } = await import("@/lib/selection/mutate");
    const ip = request.headers.get("x-forwarded-for") || null;
    const userAgent = request.headers.get("user-agent") || null;

    const { data, error } = await patchSelection(session, parsed.data, ip, userAgent);
    if (error) {
      return fail(error.code, error.message);
    }

    return ok(data);

  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
