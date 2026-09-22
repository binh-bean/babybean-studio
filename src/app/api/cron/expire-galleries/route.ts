/**
 * /api/cron/expire-galleries — cho bộ ảnh và link quá hạn chuyển sang 'expired'.
 *
 * OWNER: DEV-OPS. BB-183, sửa lại ở BB-186.
 *
 * ---------------------------------------------------------------------------
 * BB-186 — đường này CHƯA BAO GIỜ CHẠY, và không có gì báo
 * ---------------------------------------------------------------------------
 * `vercel.json` xếp lịch gọi nó mỗi ngày lúc 18:00. Nhưng:
 *
 *   1. Tệp này trước đây **chỉ có `POST`**. Vercel Cron gọi bằng **GET**, nên
 *      mỗi lượt chạy là một cái 405 — và không ai nhìn.
 *   2. Nó kiểm `SYNC_CRON_SECRET`, còn Vercel Cron gửi `Bearer $CRON_SECRET`.
 *      Tức là kể cả sửa được (1) thì vẫn 401.
 *
 * Hai lỗi chồng nhau, cùng hình dạng với BB-164: tính năng chưa từng chạy mà
 * mọi thứ đều báo ổn. Hôm nay chưa ai thấy vì bb-dev chưa có link nào tới hạn
 * — link đầu tiên chết vào khoảng tháng 11.2026. Lúc đó cột `status` vẫn ghi
 * 'active' trong khi ba mẹ nhìn trang báo hết hạn, và CSKH mở màn quản trị ra
 * đọc được đúng một điều sai.
 *
 * ---------------------------------------------------------------------------
 * Nhận cả hai khoá, và nhận cả GET lẫn POST
 * ---------------------------------------------------------------------------
 * `CRON_SECRET` là tên Vercel tự dùng — đặt biến đó là Vercel tự gắn header.
 * `SYNC_CRON_SECRET` là khoá sẵn có của dự án, dùng cho GitHub Actions và cho
 * lúc gọi tay bằng `curl -X POST`. Nhận cả hai thì không phải chọn, và không
 * phải nhớ đường nào đi bằng khoá nào.
 *
 * Thiếu CẢ HAI thì từ chối. Không có nhánh "chưa cấu hình thì cho qua": đường
 * này sửa dữ liệu của mọi chi nhánh.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { guiLaiThongBaoDangCho } from "@/lib/lark/notify";
import { quetNhacKhachChuaChot } from "@/lib/gallery/nhac-khach";

export const runtime = "nodejs";

function duocPhep(request: Request): boolean {
  const header = request.headers.get("authorization");
  if (!header) return false;

  const khoa = [process.env.CRON_SECRET, process.env.SYNC_CRON_SECRET].filter(
    (k): k is string => typeof k === "string" && k.length > 0,
  );
  if (khoa.length === 0) return false;

  return khoa.some((k) => header === `Bearer ${k}`);
}

async function chay(request: Request) {
  if (!duocPhep(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();

    // 1. Chuyển album quá hạn sang 'expired'
    const { data: expiredGalleriesCount, error: rpcError } = await admin.rpc(
      "expire_overdue_galleries",
    );

    // KHÔNG nuốt lỗi rồi báo thành công.
    //
    // Đường này do máy gọi, không ai ngồi nhìn log. Trả 200 khi bên trong hỏng
    // nghĩa là lịch chạy báo xanh hàng ngày trong khi không link nào hết hạn,
    // và ba tháng sau mới có người phát hiện.
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

    // 3. BB-186: đếm link sắp chết, và ghi ra log.
    //
    // Phần bắn tin cho CSKH nằm ở mục 4 bên dưới (BB-167).
    // Nhưng con số này phải có mặt từ bây giờ: nó là thứ chứng minh lượt chạy
    // hôm nay THẬT SỰ nhìn vào dữ liệu, chứ không phải chạy rỗng rồi báo xanh.
    //
    // CSKH đọc cùng con số này ở /admin/reports/link-sap-het-han.
    const bayNgayNua = new Date();
    bayNgayNua.setDate(bayNgayNua.getDate() + 7);
    const { count: sapChet } = await admin
      .from("share_links")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .not("expires_at", "is", null)
      .gte("expires_at", now)
      .lte("expires_at", bayNgayNua.toISOString());

    // 4. BB-167: quét lại những tin Lark chưa gửi được.
    //
    // Đi nhờ lượt chạy này thay vì xin thêm một dòng cron: gói Hobby chỉ cho
    // một lượt mỗi ngày, và chủ studio đã có bốn việc tay phải nhớ rồi. Đây là
    // lưới đỡ — đường gửi chính là gửi ngay lúc khách bấm Chốt — nên chậm tới
    // một ngày là chấp nhận được.
    //
    // Bọc riêng: phần cho link hết hạn ở trên đã CHẠY XONG rồi. Một lỗi ở đường
    // bắn tin không được phép biến cả lượt chạy thành 500 — lịch sẽ báo đỏ hằng
    // ngày trong khi việc chính vẫn đang tốt.
    let lark: unknown = { boQua: "không chạy được" };
    try {
      lark = await guiLaiThongBaoDangCho();
    } catch (err) {
      console.error("[cron/expire-galleries] quét lại tin Lark hỏng:", err);
      lark = { loi: err instanceof Error ? err.message : String(err) };
    }

    // 5. BB-068: nhắc những bộ khách chưa chốt, theo `gallery.reminder_days`.
    //
    // Cũng đi nhờ lượt chạy này, cùng lý do như mục 4. Bọc riêng vì cùng lý do
    // nốt: mấy phần trên ĐÃ xong việc rồi, một lỗi ở đường bắn tin không được
    // phép biến cả lượt chạy thành 500.
    let nhac: unknown = { boQua: "không chạy được" };
    try {
      nhac = await quetNhacKhachChuaChot();
    } catch (err) {
      console.error("[cron/expire-galleries] quét nhắc khách hỏng:", err);
      nhac = { loi: err instanceof Error ? err.message : String(err) };
    }

    const stats = {
      expiredGalleries: expiredGalleriesCount || 0,
      expiredLinks: expiredLinksCount || 0,
      linkChetTrong7Ngay: sapChet ?? 0,
      larkGuiLai: lark,
      nhacKhachChuaChot: nhac,
    };

    console.info(JSON.stringify({ evt: "cron.expire_galleries", ...stats }));

    return NextResponse.json({ message: "Success", stats });
  } catch (err) {
    console.error("[cron/expire-galleries] Unexpected error:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** Vercel Cron gọi bằng GET. Đây mới là đường chạy thật hàng ngày. */
export async function GET(request: Request) {
  return chay(request);
}

/** Giữ POST cho GitHub Actions và cho lúc gọi tay bằng `curl -X POST`. */
export async function POST(request: Request) {
  return chay(request);
}
