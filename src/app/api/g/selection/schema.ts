/**
 * Request schemas for /api/g/selection.
 *
 * OWNER: DEV-BE. Spec: docs/04-api-spec.md §3.4
 *
 * Schemas live beside route.ts, not inside it: Next.js route modules may only
 * export the HTTP verbs and a fixed set of route config values, so exporting a
 * schema from route.ts fails the build.
 */

import { z } from "zod";

export const SelectionOpSchema = z.object({
  photoId: z.string().uuid(),
  // "suggested" is assigned by the server for the suggester role, never sent
  // by a client. "favorite" stays accepted only until 0007 finishes retiring
  // it from the enum; use isFavorite.
  mark: z.enum(["selected", "rejected"]).nullable().optional(),
  /** Independent of mark: a photo can be chosen, hearted, both or neither. */
  isFavorite: z.boolean().optional(),
  retouchNote: z.string().max(500).nullable().optional(),
  noteTags: z.array(z.string().max(40)).max(10).optional(),
});

/** At most 50 ops per request — see docs/04-api-spec.md §3.4. */
export const SelectionPatchSchema = z.object({
  clientOpId: z.string().uuid(),
  ops: z.array(SelectionOpSchema).min(1).max(50),
});

export type SelectionPatchInput = z.infer<typeof SelectionPatchSchema>;
