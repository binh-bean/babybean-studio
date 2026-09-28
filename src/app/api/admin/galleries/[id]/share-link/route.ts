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
 * Link hiện ĐÚNG MỘT LẦN — đã đổi ở BB-201 (25/09/2026), xem cuối đoạn
 * ---------------------------------------------------------------------------
 * Cơ sở dữ liệu chỉ giữ bản băm SHA-256 của mã, không giữ mã. Mất thì tạo link
 * mới chứ không đọc lại được — cùng luật với PIN.
 *
 * Lý do không lưu mã gốc: ai đọc được bảng là mở được mọi bộ ảnh của mọi khách.
 * Bảng này CTV thời vụ không đọc được, nhưng "không đọc được hôm nay" không
 * phải là thứ nên đem ra đánh cược ảnh của trẻ con.
 *
 * BB-201: chủ studio cần link hiện lại như link Drive. Vẫn KHÔNG lưu mã gốc —
 * lưu bản MÃ HOÁ (AES-256-GCM, khoá ở máy chủ) trong bảng riêng share_link_ma
 * mà chỉ service_role đọc được (0070). Lộ riêng cơ sở dữ liệu vẫn vô dụng.
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
import { after } from "next/server";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiLinkAppVeLark, diaChiDayDu } from "@/lib/lark/ghi-link-app";
import { maHoaMaLink } from "@/lib/auth/ma-link";
import { soNgayHanChot, hanChotTuHomNay } from "@/lib/gallery/han-chot";
import { lamNongAnhBia } from "@/lib/drive/lam-nong-cache";
import { qua60NgayFileGoc } from "@/lib/lark/trang-thai-hau-ky";

export const runtime = "nodejs";
// GIẢ ĐỊNH HẠ TẦNG: gói Hobby — 60 giây là mức TỐI ĐA Hobby cho phép (mặc
// định chỉ 10s). Tạo link xong thì làm nóng ĐÚNG MỘT LÔ ảnh (40 tấm, xem
// `lam-nong-cache.ts`) CHẠY NỀN qua after() (xem cuối tệp) — đủ lo trước màn
// hình đầu tiên khách sẽ thấy, KHÔNG đủ nong hết một bộ 1.235 ảnh trong một
// lượt gọi trên gói Hobby. Muốn nong hết cả bộ thì bấm "Làm nóng ảnh" ở màn
// chi tiết (route riêng, trình duyệt tự gọi lặp). Không chặn phản hồi tạo
// link: CSKH phải cầm được link ngay, làm nóng hỏng hay chậm không được làm
// hỏng việc đó.
export const maxDuration = 60;

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

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as {
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
      .select(
        "id, branch_id, customer_id, status, photo_count, lark_hauky_record_id, sent_at, due_at, lark_trang_thai, lark_trang_thai_tu",
      )
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

    // BB-285 — luật 60 ngày (docs/21 GĐ1): Lark còn "Đã gửi file gốc" quá 60
    // ngày thì file gốc coi như đã bị xoá; tạo link mới lúc này là gửi khách
    // một link mở ra ảnh không còn.
    if (
      qua60NgayFileGoc(
        gallery.lark_trang_thai,
        gallery.lark_trang_thai_tu ? new Date(gallery.lark_trang_thai_tu) : null,
        new Date(),
      )
    ) {
      return fail(
        "INVALID_INPUT",
        "Bộ ảnh đã quá 60 ngày ở \"Đã gửi file gốc\" — đóng theo quy định (docs/21). Liên hệ khách để mở lại nếu thật sự cần.",
      );
    }

    // BB-285 — chặn tạo link khi CHƯA BIẾT hạn mức, cùng lý do với bộ rỗng ở
    // trên: khách mở link ra không chọn được ảnh nào, chỉ gọi điện hỏi.
    const { data: quotaVal, error: quotaErr } = await admin.rpc("gallery_quota", {
      p_gallery_id: galleryId,
    });
    if (quotaErr) throw quotaErr;
    if (quotaVal === null || quotaVal === undefined) {
      return fail(
        "INVALID_INPUT",
        "Bộ ảnh chưa biết hạn mức. Điền hạn mức (hoặc dòng hợp đồng) xong rồi hãy tạo link.",
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

    /*
      BB-201 — giữ bản MÃ HOÁ của mã để màn quản trị hiện lại link (0070).
      Hỏng ở đây KHÔNG làm hỏng việc tạo link: link vẫn trả về và vẫn ghi sang
      Lark như cũ; chỉ là màn quản trị không hiện lại được link này — ghi log
      để biết, không ném.
    */
    {
      const { error: maErr } = await admin
        .from("share_link_ma")
        .insert({ share_link_id: link.id, ma_hoa: maHoaMaLink(ma) });
      if (maErr) {
        console.error(
          JSON.stringify({ evt: "share_link_ma.insert_failed", requestId, shareLinkId: link.id, lyDo: maErr.message }),
        );
      }
    }

    /**
     * ĐÂY là lúc bộ ảnh thật sự đến tay khách — nên đây là lúc đặt mốc.
     *
     * `sent_at` chỉ đặt LẦN ĐẦU. CSKH tạo lại link (link cũ lộ, hay khách xin
     * link mới) không phải là gửi lại từ đầu; ghi đè mốc ấy là xoá mất câu trả
     * lời cho "bộ này nằm chờ khách bao lâu rồi".
     *
     * `due_at` cũng chỉ đặt khi đang rỗng, vì lý do ngược lại: nếu mỗi lần tạo
     * link lại dời hạn thêm bảy ngày thì cái hạn đó không còn là hạn. Muốn cho
     * khách thêm thời gian thì có đường riêng và có ghi lý do — nút "Mở lại"
     * (`/reopen`), chính nó dời hạn.
     *
     * Không chặn phản hồi nếu ghi hụt: link đã nằm trong cơ sở dữ liệu rồi,
     * CSKH phải cầm được link. Ghi ra log để lượt soát sau nhặt được.
     */
    const capNhat: Record<string, unknown> = {};
    if (!gallery.sent_at) capNhat.sent_at = new Date().toISOString();
    if (!gallery.due_at) {
      capNhat.due_at = hanChotTuHomNay(await soNgayHanChot(admin, gallery.branch_id));
    }
    if (Object.keys(capNhat).length > 0) {
      const { error: mocErr } = await admin
        .from("galleries")
        .update({ ...capNhat, updated_at: new Date().toISOString() })
        .eq("id", galleryId);
      if (mocErr) console.error("[share-link] không đặt được mốc gửi/hạn chốt:", mocErr);
    }

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

    // --- BB-286, đơn giản hoá BB-311 mục A: làm nóng ẢNH BÌA, CHẠY NỀN, sau
    // khi phản hồi đã rời máy chủ.
    //
    // Từ 28/09/2026 lưới ảnh KHÔNG còn đệm (xem `/api/img/[photoId]/route.ts`)
    // — chỉ còn đúng MỘT ảnh (bìa) × hai cỡ (1600, 2048) đáng làm nóng, không
    // còn cần cơ chế lô/con trỏ của `lamNongMotLo` (giữ lại, không xoá, nhưng
    // không còn nơi nào gọi). Hỏng ở đây chỉ log: link đã tạo xong, CSKH đã
    // cầm được link.
    const chayLamNongNen = async () => {
      try {
        const ketQua = await lamNongAnhBia(admin, galleryId, requestId);
        if (ketQua.dungVìQuota) {
          console.info(
            JSON.stringify({
              evt: "lam_nong.dung_vi_quota",
              requestId,
              galleryId,
            }),
          );
        }
      } catch (err) {
        console.error(
          JSON.stringify({
            evt: "lam_nong.that_bai_khi_tao_link",
            requestId,
            galleryId,
            loi: err instanceof Error ? err.message : String(err),
          }),
        );
      }
    };

    try {
      // `after()` chỉ dùng được TRONG một yêu cầu thật của Next.js. Gọi thẳng
      // route handler ngoài ngữ cảnh đó (phép thử gọi trực tiếp hàm POST) làm
      // nó ném lỗi ngay tại đây — xem chú thích cùng loại ở `/api/img`.
      after(chayLamNongNen);
    } catch {
      // Không có ngữ cảnh để hoãn tới: chạy nhưng KHÔNG đợi — vẫn giữ đúng
      // yêu cầu "không chặn phản hồi tạo link", chỉ khác chỗ chạy ngay sau
      // thay vì sau khi phản hồi rời máy chủ.
      void chayLamNongNen();
    }

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
