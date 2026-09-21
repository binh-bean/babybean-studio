/**
 * POST /api/admin/galleries/[id]/share-link — CSKH tạo link gửi khách.
 *
 * OWNER: PM. Task BB-127.
 * Spec: docs/16 mục 2
 *
 * Chủ studio mô tả từ đầu: *"nhân viên tạo link app của khách và gán lại vào
 * cột link app trong hậu kỳ Lark"*. Cho tới hôm nay **không có đường nào tạo
 * link**: chỉ có đường đổi PIN, và link duy nhất trong cơ sở dữ liệu là của dữ
 * liệu mẫu.
 *
 * ---------------------------------------------------------------------------
 * Link hiện ĐÚNG MỘT LẦN
 * ---------------------------------------------------------------------------
 * Cơ sở dữ liệu chỉ giữ bản băm SHA-256 của mã, không giữ mã. Mất thì tạo link
 * mới chứ không đọc lại được — cùng luật với PIN.
 *
 * Lý do không lưu mã gốc: ai đọc được bảng là mở được mọi bộ ảnh của mọi khách.
 * Bảng này CTV thời vụ không đọc được, nhưng "không đọc được hôm nay" không
 * phải là thứ nên đem ra đánh cược ảnh của trẻ con.
 *
 * ---------------------------------------------------------------------------
 * Tạo link mới thì THU HỒI link cũ
 * ---------------------------------------------------------------------------
 * Hai link còn sống cùng lúc nghĩa là mã cũ đã gửi cho ai đó vẫn mở được, kể
 * cả khi CSKH tạo link mới chính vì nghi mã cũ lọt ra ngoài. Tạo mới là thu
 * hồi cũ, trừ khi nói rõ là giữ.
 *
 * ---------------------------------------------------------------------------
 * Link gắn với BỘ ẢNH, không gắn với khách — và vì sao
 * ---------------------------------------------------------------------------
 * Ràng buộc `chk_share_link_target` bắt chọn đúng một trong hai: gắn bộ ảnh,
 * hoặc gắn khách hàng. `0010` đã đổi mô hình sang **một link cho một khách**,
 * làm địa chỉ vĩnh viễn, vì link hết hạn khiến phụ huynh không xem lại được
 * ảnh con mình.
 *
 * Nhưng nửa còn lại của mô hình đó CHƯA làm xong: link theo khách mint ra
 * phiên có `galleryId` rỗng và không tạo lượt chọn, vì một khách có nhiều
 * buổi chụp và chưa có trang cho khách chọn xem buổi nào. Dùng nó hôm nay là
 * gửi khách một link mở ra lỗi.
 *
 * Nên ở đây gắn theo bộ ảnh. Cũng đúng với quy trình chủ studio mô tả: cột
 * *link app* bên bảng Hậu Kỳ là **một dòng một buổi chụp**.
 *
 * ---------------------------------------------------------------------------
 * BB-132 — ghi thẳng sang cột *Link app* bên Lark
 * ---------------------------------------------------------------------------
 * Phần "gán lại vào cột link app" trước nay là CHÉP TAY: CSKH sao link trên
 * màn hình rồi dán sang Lark. Mỗi lần chép tay là một lần có thể dán nhầm
 * dòng, và dán nhầm nghĩa là khách A nhận link xem ảnh của khách B.
 *
 * Ghi sang Lark làm SAU khi link đã nằm trong cơ sở dữ liệu, và KHÔNG BAO GIỜ
 * chặn phản hồi: `ghiLinkAppVeLark` không ném lỗi, mọi sự cố quy về một câu
 * tiếng Việt trong `lark.lyDo`. Lark chết mà chặn luôn việc tạo link là làm cả
 * studio đứng — CSKH vẫn phải cầm được link để dán tay.
 *
 * Ý định của `0010` vẫn giữ được: KHÔNG đặt `expires_at`, nên link không hết
 * hạn. Cái `0010` muốn bỏ là hạn dùng, không phải là việc gắn theo bộ ảnh.
 *
 * ---------------------------------------------------------------------------
 * Vai 'owner', không phải 'viewer'
 * ---------------------------------------------------------------------------
 * Mặc định của cột là 'viewer' (đặt ở 0021 để link lỡ tạo nhầm thì không cho
 * sửa gì). Nhưng link CSKH gửi cho khách CHÍNH phải là 'owner' — chỉ vai đó
 * mới chốt chọn ảnh và duyệt ảnh đã chỉnh được. Vì thế ở đây ghi rõ, không dựa
 * vào mặc định.
 */

import { randomUUID, randomBytes, createHash } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiLinkAppVeLark, diaChiDayDu } from "@/lib/lark/ghi-link-app";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


/**
 * 32 byte ngẫu nhiên, viết ở dạng base64url → 43 ký tự.
 *
 * Dùng `randomBytes`, không dùng `Math.random()`: mã đoán được thì ai cũng mở
 * được ảnh của khách bất kỳ.
 */
function taoMa(): string {
  return randomBytes(32).toString("base64url");
}

const bam = (s: string) => createHash("sha256").update(s).digest("hex");

const MAX_LABEL = 100;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:share");

    const { id: galleryId } = await context.params;
    if (!UUID_RE.test(galleryId)) return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");

    const body = (await request.json().catch(() => null)) as {
      label?: unknown;
      giuLinkCu?: unknown;
    } | null;

    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (label.length > MAX_LABEL) {
      return fail("INVALID_INPUT", `Nhãn tối đa ${MAX_LABEL} ký tự`);
    }
    const giuLinkCu = body?.giuLinkCu === true;

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      // lark_hauky_record_id: mã DÒNG Hậu Kỳ bên Lark, sẽ ghi link vào đúng
      // dòng đó. Tên cột là `lark_hauky_record_id` chứ không phải
      // `lark_record_id` — xem db/migrations/0027 và 0028.
      .select("id, branch_id, customer_id, status, photo_count, lark_hauky_record_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");
    requireBranch(staff, gallery.branch_id);

    // Gửi link cho khách khi bộ ảnh chưa có tấm nào là để khách mở ra thấy
    // trang trắng rồi gọi điện. Chặn ở đây rẻ hơn một cuộc gọi.
    if (gallery.photo_count === 0) {
      return fail(
        "INVALID_INPUT",
        "Bộ ảnh chưa có tấm nào. Đồng bộ ảnh từ Drive xong rồi hãy tạo link.",
      );
    }

    if (!giuLinkCu) {
      const { error: revokeErr } = await admin
        .from("share_links")
        .update({
          status: "revoked",
          revoked_at: new Date().toISOString(),
          revoked_by: staff.staffId,
        })
        .eq("gallery_id", galleryId)
        .eq("status", "active");
      if (revokeErr) throw revokeErr;
    }

    const { data: ttlData } = await admin
      .from("settings")
      .select("value")
      .eq("key", "gallery.link_ttl_days")
      .is("branch_id", null)
      .maybeSingle();

    let ttlDays = 60;
    if (ttlData?.value && typeof ttlData.value === "number") {
      ttlDays = ttlData.value;
    }
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + ttlDays);

    const ma = taoMa();
    const { data: link, error } = await admin
      .from("share_links")
      .insert({
        gallery_id: galleryId,
        // customer_id để TRỐNG: ràng buộc chk_share_link_target bắt chọn đúng
        // một trong hai, và đặt cả hai thì cơ sở dữ liệu từ chối thẳng.
        token_hash: bam(ma),
        token_prefix: ma.slice(0, 6),
        role: "owner",
        label: label.length > 0 ? label : null,
        status: "active",
        // BB-183: Đặt expires_at theo cấu hình. Link cũ vẫn giữ vô hạn (null).
        expires_at: expiresAt.toISOString(),
        created_by: staff.staffId,
      })
      .select("id")
      .single();

    if (error) throw error;

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      actor_label: staff.role,
      action: "share_link.created",
      entity_type: "gallery",
      entity_id: galleryId,
      // SÁU ký tự đầu, không bao giờ ghi cả mã. Nhật ký đọc được rộng hơn bảng
      // link nhiều, nên ghi cả mã vào đây là dựng sẵn một đường vòng.
      metadata: { shareLinkId: link.id, tokenPrefix: ma.slice(0, 6) },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    const duongDan = `/g/${ma}`;

    // --- BB-132: gán link vào cột "Link app" của đúng dòng Hậu Kỳ ----------
    //
    // Sau khi link đã nằm trong cơ sở dữ liệu, không phải trước: ghi sang Lark
    // một link chưa chắc tồn tại là tự tạo ra dòng Lark trỏ vào hư không.
    const diaChi = diaChiDayDu(duongDan);
    const lark: { ghiDuoc: boolean; lyDo?: string } = diaChi
      ? // `ghiLinkAppVeLark` cam kết không ném lỗi, nhưng vẫn bọc `.catch` ở
        // đây: link ĐÃ nằm trong cơ sở dữ liệu rồi, và một lỗi bất ngờ ở đoạn
        // này sẽ biến thành 500, khiến CSKH không bao giờ nhìn thấy cái link
        // vừa tạo — mà cũng không tạo lại được vì mã chỉ hiện đúng một lần.
        await ghiLinkAppVeLark({
          recordId: gallery.lark_hauky_record_id ?? "",
          diaChi,
          // Đường này ghi THẬT. Công tắc chạy thử `--that` nằm ở
          // scripts/ghi-link-app-len-lark.ts, dành cho lúc soát trước khi mở.
          ghiThat: true,
        }).catch((err: unknown) => ({
          ghiDuoc: false,
          lyDo: `Không ghi được sang Lark: ${err instanceof Error ? err.message : String(err)}`,
        }))
      : {
          ghiDuoc: false,
          lyDo: "Thiếu NEXT_PUBLIC_APP_URL nên không dựng được địa chỉ đầy đủ để ghi sang Lark.",
        };

    // Nhật ký: SÁU ký tự đầu, không bao giờ cả mã — cùng luật với bản ghi
    // share_link.created ở trên. Nhật ký đọc được rộng hơn bảng link nhiều.
    console.info(
      JSON.stringify({
        evt: "share_link.lark_write",
        requestId,
        galleryId,
        tokenPrefix: ma.slice(0, 6),
        ghiDuoc: lark.ghiDuoc,
        lyDo: lark.lyDo ?? null,
      }),
    );

    return ok({
      shareLinkId: link.id,
      // Trả về ĐƯỜNG DẪN, không phải địa chỉ đầy đủ: máy chủ không biết chắc
      // tên miền nào khách sẽ dùng, và đoán sai thì CSKH gửi đi một link chết.
      duongDan,
      tokenPrefix: ma.slice(0, 6),
      // Màn CSKH đọc hai trường này để nói "đã ghi sang Lark" hay "chưa ghi
      // được, dán tay giúp" — hai câu dẫn tới hai việc khác hẳn nhau, nên
      // không gộp thành một dòng chung chung được.
      daGhiLark: lark.ghiDuoc,
      lyDoKhongGhiLark: lark.ghiDuoc ? null : (lark.lyDo ?? null),
      // Địa chỉ ĐÃ ghi sang Lark, chỉ có khi ghi được.
      //
      // Trả về để màn CSKH hiện ĐÚNG chuỗi khách sẽ nhận. Máy chủ ghép theo
      // NEXT_PUBLIC_APP_URL còn trình duyệt ghép theo tên miền đang mở; hai
      // cái lệch nhau (nhân viên vào bằng địa chỉ nội bộ chẳng hạn) thì CSKH
      // đọc một link còn khách nhận một link khác, và khi khách báo lỗi thì
      // không ai đối chiếu ra.
      diaChiDaGhiLark: lark.ghiDuoc ? diaChi : null,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail("FORBIDDEN", "Không có quyền tạo link");
    return failUnexpected(err, requestId);
  }
}
