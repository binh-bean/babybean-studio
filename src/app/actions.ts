"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export async function getActiveBranches() {
  try {
    const supabase = createAdminClient();
    const { data: branches } = await supabase
      .from("branches")
      .select("name, address, hotline")
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    return branches || [];
  } catch {
    return [];
  }
}

export async function getPrimaryHotline(): Promise<string | null> {
  const branches = await getActiveBranches();
  return branches[0]?.hotline || null;
}

