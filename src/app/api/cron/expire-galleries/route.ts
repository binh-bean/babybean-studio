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

    // KHÔNG nuốt lỗi rồi báo thành công.
    //
    // Đường này do máy gọi, không ai ngồi nhìn log. Trả 200 khi bên trong hỏng
    // nghĩa là GitHub Actions báo xanh hàng ngày trong khi không link nào hết hạn,
    // và ba tháng sau mới có người phát hiện. Đúng hình dạng của lỗi BB-164:
    // tính năng chưa từng chạy mà mọi thứ đều báo ổn.
    if (rpcError) {
      console.error("[cron/expire-galleries] hỏng khi cho bộ ảnh hết hạn:", rpcError);
      return NextResponse.json(
        { error: "EXPIRE_GALLERIES_FAILED", message: rpcError.message },
        { status: 500 },
      );
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
      console.error("[cron/expire-galleries] hỏng khi cho link hết hạn:", linksError);
      return NextResponse.json(
        { error: "EXPIRE_LINKS_FAILED", message: linksError.message },
        { status: 500 },
      );
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
