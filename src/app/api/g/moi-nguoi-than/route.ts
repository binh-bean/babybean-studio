/**
 * POST   /api/g/moi-nguoi-than — Ba mẹ tạo link vai 'viewer' mời một người
 *        thân (ông bà…) cùng xem và mua thêm — KHÔNG chọn ảnh.
 * GET    /api/g/moi-nguoi-than — Ba mẹ liệt kê những người đã mời cho bộ ảnh
 *        này (nhãn, lúc tạo, trạng thái; link CÒN SỐNG thì kèm địa chỉ để
 *        ba mẹ chép/chia sẻ lại — BB-338).
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
 * BB-338 (anh báo 01/10/2026): "ba mẹ mời và tạo link xong, thoát ra vào lại
 * thì không thấy link để gửi hoặc kiểm tra, chỉ có thu hồi". Trước đây route
 * này CỐ Ý không lưu bản mã hoá — nay lưu, theo ĐÚNG khuôn mẫu đã duyệt của
 * link CSKH (BB-201, migration 0070 `share_link_ma`: AES-256-GCM, khoá ở máy
 * chủ, bảng thu hết quyền của anon/authenticated). Không cần migration mới.
 *   - Chỉ GET của chính phiên ba mẹ (owner/co_editor) ĐÚNG bộ ảnh mới nhận lại
 *     địa chỉ; viewer vẫn 403 như cũ.
 *   - Chỉ trả cho link CÒN SỐNG (active); thu hồi/hết hạn thì không trả.
 *   - Giải mã xong ĐỐI CHIẾU với `token_hash` — lệch thì thà không trả.
 *   - Link tạo TRƯỚC bản vá (không có bản mã) → `diaChi: null`; màn ba mẹ
 *     cho "Tạo lại link" (thu hồi link cũ + tạo link mới cùng nhãn).
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

import { vi } from "@/i18n";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { MoiNguoiThanSchema } from "./schema";
import { diaChiDayDu } from "@/lib/lark/ghi-link-app";
import { giaiMaMaLink, maHoaMaLink } from "@/lib/auth/ma-link";

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

/**
 * Chỉ ba mẹ (chủ bộ ảnh, người cùng chọn) được mời/xem/thu hồi lời mời. Chặn
 * theo DANH SÁCH ĐƯỢC PHÉP, không chặn riêng "viewer" — vai "gợi ý" hay vai mới
 * về sau cũng không tự nhiên có quyền mời (Opus soát BB-254).
 */
const DUOC_MOI: readonly string[] = ["owner", "co_editor"];

/**
 * BB-334A — phạm vi lời mời. Phiên link GIA ĐÌNH (customerId) mời theo KHÁCH:
 * ông bà thấy mọi bộ, kể cả bộ sau này (anh chốt Q6 ★); giới hạn 5 link sống /
 * 10 lượt tạo mỗi ngày tính theo khách. Phiên link cũ theo bộ: y như trước.
 */
function phamVi(session: { customerId: string; galleryId: string }): {
  theoKhach: boolean;
  cot: "customer_id" | "gallery_id";
  id: string;
  tienTo: "/k/" | "/g/";
} {
  return session.customerId
    ? { theoKhach: true, cot: "customer_id", id: session.customerId, tienTo: "/k/" }
    : { theoKhach: false, cot: "gallery_id", id: session.galleryId, tienTo: "/g/" };
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requirePhienBoAnh(request, undefined, { khongCanBoAnh: true });

    if (!DUOC_MOI.includes(session.role)) {
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
    const pv = phamVi(session);

    // 1. Bộ ảnh phải tồn tại (link gia đình: mời theo KHÁCH, không cần bộ — Q6 ★).
    if (!pv.theoKhach) {
      const { data: gallery, error: galleryError } = await admin
        .from("galleries")
        .select("id")
        .eq("id", session.galleryId)
        .maybeSingle();
      if (galleryError || !gallery) {
        return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
      }
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
      .eq(pv.cot, pv.id)
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
      .eq(pv.cot, pv.id)
      .eq("role", "viewer")
      .gte("created_at", hai4GioTruoc);
    if (demNgayError) throw demNgayError;
    if ((soTaoTrongNgay ?? 0) >= TOI_DA_TAO_MOI_NGAY) {
      return fail(
        "RATE_LIMITED",
        vi.gallery.loiBean.quaNhieuLoiMoi,
      );
    }

    // 4. Sinh mã, ghi link.
    const ma = taoMa();
    const { data: link, error: insertError } = await admin
      .from("share_links")
      .insert({
        // BB-334A — link gia đình mời CẢ NHÀ (customer_id); link theo bộ mời đúng bộ đó.
        [pv.cot]: pv.id,
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

    // 4b. BB-338 — lưu bản MÃ HOÁ để ba mẹ vào lại vẫn thấy link (khuôn mẫu
    // BB-201/BB-320 của route CSKH). Hỏng ở đây KHÔNG làm hỏng việc tạo link —
    // link vẫn trả về lần này; chỉ là lần sau không hiện lại được (log để biết).
    let luuDiaChiDuoc = true;
    try {
      const { error: maErr } = await admin
        .from("share_link_ma")
        .insert({ share_link_id: link.id, ma_hoa: maHoaMaLink(ma) });
      if (maErr) throw new Error(maErr.message);
    } catch (err) {
      luuDiaChiDuoc = false;
      console.error(
        JSON.stringify({
          evt: "share_link_ma.insert_failed",
          requestId,
          shareLinkId: link.id,
          lyDo: err instanceof Error ? err.message : String(err),
        }),
      );
    }

    // 5. Nhật ký — SÁU ký tự đầu, không bao giờ cả mã (cùng luật với route CSKH).
    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "customer",
      actor_id: session.selectionId,
      actor_label: "Customer",
      action: "moi_nguoi_than.tao",
      entity_type: pv.theoKhach ? "customer" : "gallery",
      entity_id: pv.id,
      metadata: { shareLinkId: link.id, tokenPrefix: ma.slice(0, 6), nhan },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    const duongDan = `${pv.tienTo}${ma}`;

    return NextResponse.json(
      {
        data: {
          shareLinkId: link.id,
          nhan,
          // Địa chỉ ĐẦY ĐỦ. BB-338: GET đọc lại được nhờ bản mã hoá ở trên.
          diaChiDayDu: diaChiDayDu(duongDan) ?? duongDan,
          duongDan,
          createdAt: link.created_at,
          luuDiaChiDuoc,
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

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requirePhienBoAnh(request, undefined, { khongCanBoAnh: true });

    if (!DUOC_MOI.includes(session.role)) {
      return fail("FORBIDDEN", "Người được mời không xem được danh sách này");
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("share_links")
      .select("id, label, status, created_at, expires_at, revoked_at, token_hash")
      .eq(phamVi(session).cot, phamVi(session).id)
      .eq("role", "viewer")
      .order("created_at", { ascending: false });
    if (error) throw error;

    // BB-338 — link CÒN SỐNG thì giải bản mã hoá để ba mẹ chép/chia sẻ lại.
    const dangSong = (data ?? []).filter((d) => d.status === "active");
    const maTheoLink = new Map<string, string>();
    if (dangSong.length > 0) {
      const { data: maRows, error: maErr } = await admin
        .from("share_link_ma")
        .select("share_link_id, ma_hoa")
        .in(
          "share_link_id",
          dangSong.map((d) => d.id),
        );
      if (maErr) {
        console.error(JSON.stringify({ evt: "share_link_ma.read_failed", requestId, lyDo: maErr.message }));
      }
      for (const r of maRows ?? []) {
        const link = dangSong.find((d) => d.id === r.share_link_id);
        let ma: string | null = null;
        try {
          ma = giaiMaMaLink(r.ma_hoa);
        } catch {
          ma = null;
        }
        // Đối chiếu băm: bản mã lệch link thì thà không trả còn hơn trả nhầm.
        if (link && ma && bam(ma) === link.token_hash) maTheoLink.set(link.id, ma);
      }
    }

    return NextResponse.json(
      {
        data: {
          items: (data ?? []).map((d) => {
            const ma = maTheoLink.get(d.id);
            const duongDan = ma ? `${phamVi(session).tienTo}${ma}` : null;
            return {
              id: d.id,
              nhan: d.label,
              trangThai: d.status,
              createdAt: d.created_at,
              expiresAt: d.expires_at,
              revokedAt: d.revoked_at,
              // null = link đã thu hồi/hết hạn, hoặc tạo trước BB-338 (không có bản mã).
              duongDan,
              diaChiDayDu: duongDan ? (diaChiDayDu(duongDan) ?? duongDan) : null,
            };
          }),
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
    const session = await requirePhienBoAnh(request, undefined, { khongCanBoAnh: true });

    if (!DUOC_MOI.includes(session.role)) {
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
      .eq(phamVi(session).cot, phamVi(session).id)
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
      entity_type: phamVi(session).theoKhach ? "customer" : "gallery",
      entity_id: phamVi(session).id,
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
