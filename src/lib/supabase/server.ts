/**
 * Supabase client for authenticated staff requests. RLS IS ENFORCED.
 *
 * OWNER: DEV-BE. Use this for everything an employee does; use admin.ts only
 * for customer-facing work and background jobs.
 */

import "server-only";
import { cookies } from "next/headers";
import { createServerClient as createSSRClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Shape @supabase/ssr passes to setAll. */
interface CookieToSet {
  name: string;
  value: string;
  options?: Record<string, unknown>;
}

export async function createServerClient(): Promise<SupabaseClient> {
  const store = await cookies();

  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list: CookieToSet[]) => {
          // Read-only in Server Components; middleware refreshes the session.
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            /* noop */
          }
        },
      },
    },
  );
}
