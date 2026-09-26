/**
 * POST   /api/g/moi-nguoi-than — Ba mẹ tạo link vai 'viewer' mời một người
 *        thân (ông bà…) cùng xem và mua thêm — KHÔNG chọn ảnh.
 * GET    /api/g/moi-nguoi-than — Ba mẹ liệt kê những người đã mời cho bộ ảnh
 *        này (nhãn, lúc tạo, trạng thái — KHÔNG bao giờ trả lại mã).
 * DELETE /api/g/moi-nguoi-than?id=<shareLinkId> — Ba mẹ thu hồi một lời mời.
 *
 * OWNER: DEV-BE. Task BB-254.
 * Chủ studio chốt 26/09/2026: "ba mẹ tự mời trong app; ông bà/người thân được
 * mời thì XEM và MUA (gửi yêu cầu mua thêm cho CSKH gọi lại chính ông bà).
 * Ông bà KHÔNG chọn ảnh, không thấy tiền hợp đồng/tiền phát sinh của ba mẹ,
 * không tải ảnh gốc, không mời tiếp người khác."
 *
 * ---------------------------------------------------------------------------
 * Tái dùng ĐÚNG cơ chế link hiện có — không dựng đường thứ hai
 * ---------------------------------------------------------------------------
 * "Mời ông bà" chỉ là một CÁCH TẠO thêm cho `share_links` với `role: 'viewer'`
 * — đúng vai đã có sẵn (SHARE_ROLES, EDITING_ROLES/SUBMIT_ROLES trong
 * `gallery-session.ts`). Băm mã bằng `bamMaLink`/SHA-256 hệt route CSKH tạo
 * link (`/api/admin/galleries/[id]/share-link`) — mã trần KHÔNG bao giờ chạm
 * cơ sở dữ liệu, chỉ trả về đúng MỘT LẦN trong phản hồi POST này.
 *
 * KHÔNG lưu `share_link_ma` (bản mã hoá để hiện lại) như route CSKH: màn
 * quản trị không cần hiện lại link của ông bà, và ba mẹ đã cầm link ngay lúc
 * tạo — thêm một bảng ghi mã hoá ở đây là thêm bề mặt rò rỉ không đổi lại
 * được gì.
 *
 * ---------------------------------------------------------------------------
 * Vì sao CHỈ phiên KHÔNG PHẢI viewer được gọi
 * ---------------------------------------------------------------------------
 * "Ông bà không mời tiếp người khác" — chặn ở TẦNG MÁY CHỦ, không chỉ ẩn nút:
 * một phiên viewer gọi thẳng route này (bỏ qua giao diện) vẫn phải nhận 403.
 *
 * ---------------------------------------------------------------------------
 * Hạn dùng: THEO ĐÚNG hạn link của ba mẹ, không tự đặt số mới
 * ---------------------------------------------------------------------------
 * Đọc `expires_at` của chính link đang đăng nhập (`session.shareLinkId`) rồi
 * gán y hệt cho link viewer mới — không bịa ra một hạn khác, và không tự ý
 * cho vô hạn khi link ba mẹ có hạn.
 *
 * ---------------------------------------------------------------------------
 * Hai chốt chặn lạm dụng, kiểm SÁT trước khi ghi
 * ---------------------------------------------------------------------------
 * 1. Tối đa 5 link viewer ĐANG HOẠT ĐỘNG cho một bộ ảnh (409 CONFLICT).
 * 2. Tối đa 10 lượt TẠO trong 24 giờ gần nhất cho một bộ ảnh (429 RATE_LIMITED)
 *    — đếm cả link đã thu hồi, vì đây là chặn hành vi tạo dồn dập, không phải
 *    đếm link còn sống (mục 1 đã lo việc đó).
 */

import { randomUUID, randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { MoiNguoiThanSchema } from "./schema";
import { diaChiDayDu } from "@/lib/lark/ghi-link-app";

export const runtime = "nodejs";

/** Tối đa link viewer đang hoạt động cho một bộ ảnh. */
const TOI_DA_LINK_HOAT_DONG = 5;
/** Tối đa lượt tạo trong 24 giờ gần nhất cho một bộ ảnh. */
const TOI_DA_TAO_MOI_NGAY = 10;

/** 32 byte ngẫu nhiên, base64url — cùng cách sinh mã với route CSKH tạo link. */
function taoMa(): string {
  return randomBytes(32).toString("base64url");
}

const bam = (s: string) => createHash("sha256").update(s).digest("hex");

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();

    if (session.role === "viewer") {
      return fail("FORBIDDEN", "Người được mời không mời tiếp được người khác");
    }

    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = MoiNguoiThanSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const { nhan } = parsed.data;

    const admin = createAdminClient();

    // 1. Bộ ảnh phải tồn tại.
    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id")
      .eq("id", session.galleryId)
      .maybeSingle();
    if (galleryError || !gallery) {
      return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    }

    // 2. Hạn dùng: chép nguyên từ link đang đăng nhập (link của ba mẹ).
    const { data: linkBaMe, error: linkError } = await admin
      .from("share_links")
      .select("expires_at")
      .eq("id", session.shareLinkId)
      .maybeSingle();
    if (linkError || !linkBaMe) {
      return fail("NOT_FOUND", "Không tìm thấy link hiện tại");
    }

    // 3. Chống lạm dụng — kiểm SÁT trước khi ghi.
    const { count: soLinkHoatDong, error: demHoatDongError } = await admin
      .from("share_links")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", session.galleryId)
      .eq("role", "viewer")
      .eq("status", "active");
    if (demHoatDongError) throw demHoatDongError;
    if ((soLinkHoatDong ?? 0) >= TOI_DA_LINK_HOAT_DONG) {
      return fail(
        "CONFLICT",
        `Đã mời tối đa ${TOI_DA_LINK_HOAT_DONG} người cho bộ ảnh này. Thu hồi bớt một lời mời cũ để mời người mới.`,
      );
    }

    const hai4GioTruoc = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: soTaoTrongNgay, error: demNgayError } = await admin
      .from("share_links")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", session.galleryId)
      .eq("role", "viewer")
      .gte("created_at", hai4GioTruoc);
    if (demNgayError) throw demNgayError;
    if ((soTaoTrongNgay ?? 0) >= TOI_DA_TAO_MOI_NGAY) {
      return fail(
        "RATE_LIMITED",
        "Ba mẹ đã tạo khá nhiều lời mời trong hôm nay, thử lại vào ngày mai giúp em nhé",
      );
    }

    // 4. Sinh mã, ghi link.
    const ma = taoMa();
    const { data: link, error: insertError } = await admin
      .from("share_links")
      .insert({
        gallery_id: session.galleryId,
        token_hash: bam(ma),
        token_prefix: ma.slice(0, 6),
        role: "viewer",
        label: nhan,
        status: "active",
        expires_at: linkBaMe.expires_at,
      })
      .select("id, created_at")
      .single();
    if (insertError) throw insertError;

    // 5. Nhật ký — SÁU ký tự đầu, không bao giờ cả mã (cùng luật với route CSKH).
    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: "Customer",
      action: "moi_nguoi_than.tao",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: { shareLinkId: link.id, tokenPrefix: ma.slice(0, 6), nhan },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    const duongDan = `/g/${ma}`;

    return NextResponse.json(
      {
        data: {
          shareLinkId: link.id,
          nhan,
          // Địa chỉ ĐẦY ĐỦ, trả về ĐÚNG MỘT LẦN — không đọc lại được sau lượt
          // này (cùng luật với mã link nói chung, xem `bam-ma-link.ts`).
          diaChiDayDu: diaChiDayDu(duongDan) ?? duongDan,
          duongDan,
          createdAt: link.created_at,
        },
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();

    if (session.role === "viewer") {
      return fail("FORBIDDEN", "Người được mời không xem được danh sách này");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("share_links")
      .select("id, label, status, created_at, expires_at, revoked_at")
      .eq("gallery_id", session.galleryId)
      .eq("role", "viewer")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json(
      {
        data: {
          items: (data ?? []).map((d) => ({
            id: d.id,
            nhan: d.label,
            trangThai: d.status,
            createdAt: d.created_at,
            expiresAt: d.expires_at,
            revokedAt: d.revoked_at,
          })),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();

    if (session.role === "viewer") {
      return fail("FORBIDDEN", "Người được mời không thu hồi được lời mời");
    }

    const id = new URL(request.url).searchParams.get("id");
    if (!id) return fail("INVALID_INPUT", "Thiếu mã lời mời cần thu hồi");

    const admin = createAdminClient();

    // Chỉ thu hồi link VAI VIEWER, ĐÚNG BỘ ẢNH của phiên đang gọi — link của
    // bộ ảnh khác (hoặc không phải vai viewer, hoặc không tồn tại) đều 404
    // như nhau, không lộ ra "có tồn tại nhưng không phải của bạn".
    const { data: link, error: findError } = await admin
      .from("share_links")
      .select("id, status")
      .eq("id", id)
      .eq("gallery_id", session.galleryId)
      .eq("role", "viewer")
      .maybeSingle();
    if (findError) throw findError;
    if (!link) return fail("NOT_FOUND", "Không tìm thấy lời mời này");

    if (link.status === "active") {
      const { error: revokeError } = await admin
        .from("share_links")
        .update({ status: "revoked", revoked_at: new Date().toISOString() })
        .eq("id", id);
      if (revokeError) throw revokeError;
    }

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: "Customer",
      action: "moi_nguoi_than.thu_hoi",
      entity_type: "gallery",
      entity_id: session.galleryId,
      metadata: { shareLinkId: id },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return NextResponse.json({ data: { id } }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof GallerySessionError) {
      return fail(err.code);
    }
    return failUnexpected(err, requestId);
  }
}
