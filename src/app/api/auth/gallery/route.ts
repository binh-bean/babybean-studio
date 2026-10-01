/**
 * POST /api/auth/gallery — exchange a share token (+ PIN) for a session cookie.
 *
 * OWNER: SEC-ARCH. Task BB-030.
 * Spec: docs/04-api-spec.md §3.1, docs/12-security.md §3
 *
 * The cookie is set on the returned response rather than through next/headers
 * `cookies()`. Both work in production; only this one can be called directly
 * from a test, and a security route nobody can test is a security route nobody
 * checks.
 */

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { dangNhapBangMa, datCookiePhien } from "@/lib/auth/dang-nhap-bang-ma";

export const runtime = "nodejs";

const schema = z.object({
  token: z.string().min(1).max(200),
});

/*
  BB-341 — toàn bộ luật đổi mã lấy phiên (giới hạn lượt theo IP, nhật ký, tra
  mã, lượt chọn theo link, đếm lượt mở) nay ở `dangNhapBangMa()`
  (src/lib/auth/dang-nhap-bang-ma.ts), dùng chung với `GET /api/g/gallery`
  khi chưa có phiên. Đường này giữ nguyên hợp đồng: cùng mã lỗi, cùng dữ
  liệu trả, cùng cookie.
*/
export async function POST(req: NextRequest): Promise<NextResponse> {
  const reqId = crypto.randomUUID();

  try {
    const body = await readJsonBody(req);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) return fail("INVALID_INPUT");

    const kq = await dangNhapBangMa(parsed.data.token, req);

    // -------------------------------------------------------------------
    // Trả lời gì cho link không dùng được — đọc kỹ trước khi sửa
    // -------------------------------------------------------------------
    // Bản đầu cho **không tồn tại, đã thu hồi và hết hạn** trả lời giống hệt
    // nhau, để người đang dò mã không biết mình đã trúng.
    //
    // BB-183 tách RIÊNG ca hết hạn, và đó là đánh đổi có tính toán:
    //
    //   - Mã link dài 22 ký tự (~131 bit). Dò trúng là chuyện không xảy ra được,
    //     nên cái được che ở đây gần như bằng không.
    //   - Ngược lại, ba mẹ cầm một link thật đã quá hai tháng mà thấy "không tìm
    //     thấy" sẽ nghĩ studio xoá mất ảnh con mình. Đó mới là thiệt hại có thật.
    //
    // **Ca ĐÃ THU HỒI vẫn trả NOT_FOUND** — không được đổi. Link bị thu hồi
    // thường là vì nó đã lọt ra ngoài; nói cho người đang cầm nó biết "link này
    // từng thật, gọi studio đi" là chỉ đường cho đúng người không nên biết.
    if (!kq.ok) return fail(kq.code, kq.message);

    const response = ok({
      customerId: kq.phien.customerId,
      galleryId: kq.phien.galleryId,
      role: kq.phien.role,
      expiresAt: kq.cookie.expiresAt.toISOString(),
    });
    datCookiePhien(response, kq.cookie);
    return response;
  } catch (err) {
    return failUnexpected(err, reqId);
  }
}
