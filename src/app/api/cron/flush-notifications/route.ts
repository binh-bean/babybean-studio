/**
 * /api/cron/flush-notifications — gửi lại những tin Lark chưa đi được.
 *
 * OWNER: DEV-INT. Task BB-167.
 *
 * ---------------------------------------------------------------------------
 * Đây là LƯỚI ĐỠ, không phải đường đi chính
 * ---------------------------------------------------------------------------
 * `docs/08 §2` thiết kế: đẩy vào hàng đợi, cron này gửi mỗi 5 phút. Nhưng
 * `docs/11 §5` ghi rõ **gói Hobby chỉ cho cron chạy một lần mỗi ngày** — và
 * chính vì thế dòng cron của đường này đã bị gỡ khỏi `vercel.json` từ lâu.
 *
 * Nên BB-167 đảo lại thứ tự: `enqueueLarkNotification` **gửi ngay** trong lượt
 * gọi, còn hàng đợi là sổ cái và là đường thử lại. Đường này chỉ chạm tới
 * những tin đã hỏng — mà tin hỏng là ngoại lệ, nên một lượt mỗi ngày là đủ.
 *
 * Route tồn tại sẵn ở đây để khi studio có chỗ chạy dày hơn (nâng gói Vercel,
 * hoặc một lịch GitHub Actions) thì chỉ cần thêm lịch, không phải viết mã.
 * `expire-galleries` cũng gọi cùng hàm này trong lượt chạy hằng ngày, nên
 * **không cần thêm dòng nào vào `vercel.json`** để lưới đỡ hoạt động.
 *
 * Nhận cả GET lẫn POST, và nhận cả hai khoá — cùng luật với
 * `expire-galleries`, xem ghi chú dài ở tệp đó về hai lỗi im lặng của BB-186.
 */

import { NextResponse } from "next/server";
import { guiLaiThongBaoDangCho } from "@/lib/lark/notify";

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
    const stats = await guiLaiThongBaoDangCho();
    console.info(JSON.stringify({ evt: "cron.flush_notifications", ...stats }));
    return NextResponse.json({ message: "Success", stats });
  } catch (err) {
    console.error("[cron/flush-notifications]", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return chay(request);
}

export async function POST(request: Request) {
  return chay(request);
}
