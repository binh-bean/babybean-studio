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
  mark: z.enum(["selected", "suggested", "favorite", "rejected"]).nullable().optional(),
  retouchNote: z.string().max(500).nullable().optional(),
  noteTags: z.array(z.string().max(40)).max(10).optional(),
});

/** At most 50 ops per request — see docs/04-api-spec.md §3.4. */
export const SelectionPatchSchema = z.object({
  clientOpId: z.string().uuid(),
  ops: z.array(SelectionOpSchema).min(1).max(50),
});

export type SelectionPatchInput = z.infer<typeof SelectionPatchSchema>;
