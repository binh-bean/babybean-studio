/**
 * Service-role Supabase client. BYPASSES ROW LEVEL SECURITY.
 *
 * OWNER: DEV-BE.
 * Spec: docs/02-architecture.md §2.4
 *
 * ────────────────────────────────────────────────────────────────────────────
 * READ THIS BEFORE USING IT
 *
 * There is no database-level protection on this client. It may only be used
 * from src/app/api/** and scripts/**, and every query made on behalf of a
 * customer MUST be constrained by the gallery_id taken from the signed session
 * cookie — never from the request body, query string, or route params.
 *
 *   BAD:  .from("photos").eq("gallery_id", body.galleryId)
 *   GOOD: .from("photos").eq("gallery_id", session.galleryId)
 *
 * If this key ever reaches the browser, treat it as a security incident:
 * rotate it in Supabase immediately.
 * ────────────────────────────────────────────────────────────────────────────
 */

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Supabase admin client is not configured: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
    );
  }

  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cached;
}

/** Reset cached client — intended for test environments only. */
export function _resetAdminClientForTesting(): void {
  cached = null;
}

