import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.SYNC_CRON_SECRET;
  
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    // 1. Chuyển album quá hạn sang 'expired'
    const { data: expiredGalleriesCount, error: rpcError } = await admin.rpc("expire_overdue_galleries");

    if (rpcError) {
      console.error("[cron/expire-galleries] Error expiring galleries:", rpcError);
    }

    // 2. BB-183: Chuyển link quá hạn sang 'expired'
    const now = new Date().toISOString();
    const { count: expiredLinksCount, error: linksError } = await admin
      .from("share_links")
      .update({ status: "expired" }, { count: "exact" })
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lt("expires_at", now);

    if (linksError) {
      console.error("[cron/expire-galleries] Error expiring links:", linksError);
    }

    return NextResponse.json({
      message: "Success",
      stats: {
        expiredGalleries: expiredGalleriesCount || 0,
        expiredLinks: expiredLinksCount || 0,
      }
    });

  } catch (err) {
    console.error("[cron/expire-galleries] Unexpected error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
