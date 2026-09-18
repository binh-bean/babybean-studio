"use server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaff } from "@/lib/auth/staff";

export async function getContractCodesForGalleries(galleryIds: string[]) {
  await requireStaff();
  if (!galleryIds || galleryIds.length === 0) return {};
  
  const admin = createAdminClient();
  const { data } = await admin
    .from("galleries")
    .select("id, lark_contract_codes")
    .in("id", galleryIds);
    
  if (!data) return {};
  
  const map: Record<string, string> = {};
  data.forEach((g) => {
    if (g.lark_contract_codes && g.lark_contract_codes.length > 0) {
      map[g.id] = g.lark_contract_codes[0]; // Trùng mã thì chọn dứt khoát -> lấy phần tử đầu
    }
  });
  return map;
}

export async function getShareLinkInfo(galleryId: string) {
  await requireStaff();
  const admin = createAdminClient();
  const { data } = await admin
    .from("share_links")
    .select("id, status, created_at, expires_at, view_count, token_prefix")
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}
