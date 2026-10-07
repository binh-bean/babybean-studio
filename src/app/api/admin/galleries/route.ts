/**
 * POST /api/admin/galleries — tạo gallery + share_link.
 *
 * OWNER: DEV-BE. Task BB-023.
 * Spec: docs/04-api-spec.md §4.1, docs/05-rbac.md §5
 *
 * Order of operations: parse -> authenticate -> authorize -> mutate -> log -> respond.
 */

import { keoDongHopDongTuLark } from "@/lib/lark/dong-hop-dong";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import {
  requireStaff,
  requirePermission,
  requireBranch,
  AuthError,
} from "@/lib/auth/staff";
import { createServerClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseDriveFolderId, InvalidDriveLinkError } from "@/lib/drive/parse-link";
import { CreateGallerySchema, GetGalleriesQuerySchema } from "./schema";
import { nhanHienThi, mauCanhBao, TRANG_THAI_LARK } from "@/lib/lark/trang-thai-hau-ky";
import { GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import { anhBiaTheoBo } from "@/lib/selection/anh-bia";
import { docDongHauKy, LoiTraLark, duoiSoDienThoai } from "@/lib/lark/tra-hau-ky";
import { boAnhTheoDongLark, boAnhTheoThuMuc } from "@/lib/gallery/bo-anh-da-co";
import { timHoacTaoGoiLark } from "@/lib/gallery/goi-chup-lark";
import { giaAnhThemChoBoMoi, giaRiengTheoTenGoi } from "@/lib/gallery/gia-goi-chup";
import { docBangGiaRieng } from "@/lib/gallery/gia-goi-chup-server";
import { giaAnhChonThemMacDinh } from "@/lib/gallery/gia-anh-chon-them";
import { docLarkPhoto } from "@/lib/lark/photo-hau-ky";
import { chuaCoTenBe, catTrang, demTheoTrangThai } from "@/lib/gallery/loc-chua-ten-be";

export const runtime = "nodejs";
// BB-331: tạo bộ xong kéo luôn dòng hợp đồng từ Lark (3–9 giây, đo 30/09).
export const maxDuration = 30;

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function generateBase62Token(length = 22): string {
  const bytes = randomBytes(length);
  let token = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[i] ?? 0;
    token += BASE62_CHARS[byte % 62];
  }
  return token;
}

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Parse & validate Zod input ----------------------------------------
    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = CreateGallerySchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    // Validate and parse Google Drive folder link
    let driveFolderId: string;
    try {
      driveFolderId = parseDriveFolderId(input.driveUrl);
    } catch (err) {
      if (err instanceof InvalidDriveLinkError) {
        return fail("INVALID_INPUT", err.message);
      }
      return fail("INVALID_INPUT", "Link Google Drive không hợp lệ");
    }

    // 2. Authenticate ------------------------------------------------------
    const staff = await requireStaff();

    // 3. Authorize: cs+ and must belong to branch ---------------------------
    requirePermission(staff, "galleries:write");
    requireBranch(staff, input.branchId);

    // 3b. BB-325 — đọc LẠI dòng Hậu Kỳ từ Lark (không tin dữ liệu trình duyệt).
    // Mọi thông tin khách/bé/gói/ngày chụp/mã hóa đơn lấy từ đây.
    let dong;
    try {
      dong = await docDongHauKy(input.larkHaukyRecordId);
    } catch (err) {
      if (err instanceof LoiTraLark) return fail("INTERNAL", err.thongDiep);
      throw err;
    }
    if (!dong) {
      return fail("NOT_FOUND", "Không đọc được dòng Hậu Kỳ này bên Lark — tra lại mã hóa đơn và số điện thoại.");
    }
    const duoiSdt = duoiSoDienThoai(dong.soDienThoai);
    if (!dong.tenMe || !duoiSdt || !dong.maHoaDon) {
      return fail(
        "INVALID_INPUT",
        "Dòng Hậu Kỳ bên Lark còn thiếu tên khách, số điện thoại hoặc mã hóa đơn. Bổ sung bên Lark rồi tra lại.",
      );
    }
    if (!dong.goiChup) {
      return fail("INVALID_INPUT", "Dòng Hậu Kỳ bên Lark chưa có Gói chụp. Bổ sung bên Lark rồi tra lại.");
    }

    const admin = createAdminClient();
    const daCoTheoLark = await boAnhTheoDongLark(admin, dong.recordId);
    if (daCoTheoLark) {
      return fail("CONFLICT", `Dòng Hậu Kỳ ${dong.maHoaDon} đã có bộ ảnh "${daCoTheoLark.tieuDe}".`, {
        boAnhDaCo: daCoTheoLark,
      });
    }
    const daCoTheoThuMuc = await boAnhTheoThuMuc(admin, driveFolderId);
    if (daCoTheoThuMuc) {
      return fail("CONFLICT", `Thư mục Google Drive này đã được gắn với bộ ảnh "${daCoTheoThuMuc.tieuDe}".`, {
        boAnhDaCo: daCoTheoThuMuc,
      });
    }

    // Khách: một SĐT một khách trong một chi nhánh (uq_customers_phone_branch).
    // Trước BB-325 thuật sĩ luôn gửi `newCustomer` — khách cũ quay lại chụp là
    // đụng ràng buộc duy nhất và nhận nhầm câu "thư mục Drive đã được gắn".
    const { data: khachCu } = await admin
      .from("customers")
      .select("id")
      .eq("branch_id", input.branchId)
      .like("phone_normalized", `%${duoiSdt}`)
      .limit(1)
      .maybeSingle();
    const customerId = (khachCu as { id: string } | null)?.id ?? null;

    let babyId: string | null = null;
    if (customerId && dong.tenBe) {
      const { data: beCu } = await admin
        .from("babies")
        .select("id")
        .eq("customer_id", customerId)
        .eq("full_name", dong.tenBe)
        .limit(1)
        .maybeSingle();
      babyId = (beCu as { id: string } | null)?.id ?? null;
    }

    // Gói chính = mục ĐẦU của ô "Gói chụp" (các mục sau là dịch vụ thêm: "Thêm set chụp"…).
    const goiChinh = dong.goiChup.split(",")[0]?.trim() || dong.goiChup;
    const packageId = await timHoacTaoGoiLark(admin, goiChinh, dong.tongFileEdit);

    // BB-385 — giá ảnh chọn thêm của bộ MỚI: số CSKH gửi lên (thuật sĩ đã điền
    // sẵn theo gói) → giá riêng của gói → giá chung → 50.000. Chép vào bộ đúng
    // một lần ở đây; đổi giá sau này không đụng bộ đã tạo.
    const giaAnhThem =
      input.extraPhotoPrice !== undefined
        ? input.extraPhotoPrice
        : giaAnhThemChoBoMoi({
            giaRiengCuaGoi: giaRiengTheoTenGoi(
              (await docBangGiaRieng(admin).catch(() => ({ bang: {} as Record<string, number> }))).bang,
              goiChinh,
            ),
            giaChung: await giaAnhChonThemMacDinh(admin),
          });

    // 4. Mutate & Log (in a single database transaction) -------------------
    // Generate 22-character Base62 token. Only store sha256 hash in database.
    const token = generateBase62Token(22);
    const tokenPrefix = token.substring(0, 6);
    const tokenHash = createHash("sha256").update(token).digest("hex");

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = request.headers.get("user-agent") || null;

    const supabase = await createServerClient();

    const { data: result, error: rpcError } = await supabase.rpc("create_gallery_bundle", {
      p_branch_id: input.branchId,
      p_customer_id: customerId,
      p_new_customer: customerId ? null : { fullName: dong.tenMe, phone: dong.soDienThoai },
      p_baby_id: babyId,
      p_new_baby: !babyId && dong.tenBe ? { fullName: dong.tenBe } : null,
      p_package_id: packageId,
      p_photographer_id: input.photographerId || null,
      p_shoot_date: dong.ngayChup,
      // Tên thô của bộ = mã hóa đơn (chỉ là dự phòng khi thiếu tên người, xem
      // tinhTieuDeBoAnhQuanTri) — cùng quy ước với bộ đồng bộ từ Lark.
      p_title: dong.maHoaDon,
      p_drive_folder_id: driveFolderId,
      p_drive_folder_url: input.driveUrl,
      p_drive_folder_name: null,
      p_included_quota: input.includedQuota ?? null,
      p_extra_photo_price: giaAnhThem,
      p_max_selection: input.maxSelection ?? null,
      p_due_at: input.dueAt ?? null,
      p_welcome_message: input.welcomeMessage || null,
      p_watermark_enabled: false,
      p_download_enabled: input.options.download,
      p_notes_enabled: input.options.notes,
      p_invite_enabled: input.options.invite,
      p_token_hash: tokenHash,
      p_token_prefix: tokenPrefix,
      p_staff_id: staff.staffId,
      p_actor_label: staff.role,
      p_ip: ip,
      p_user_agent: userAgent,
    });

    if (rpcError) {
      // Unique violation: thư mục Drive (đã tra ở trên, đây là ca hai người bấm
      // cùng lúc) hoặc SĐT khách trùng trong chi nhánh.
      if (rpcError.code === "23505") {
        const trung = await boAnhTheoThuMuc(admin, driveFolderId);
        return fail(
          "CONFLICT",
          trung
            ? `Thư mục Google Drive này đã được gắn với bộ ảnh "${trung.tieuDe}".`
            : "Dữ liệu bị trùng (khách hàng hoặc thư mục Drive) — tải lại trang rồi thử lại.",
          trung ? { boAnhDaCo: trung } : undefined,
        );
      }
      if (rpcError.message.includes("CUSTOMER_NOT_FOUND")) {
        return fail("NOT_FOUND", "Khách hàng không tồn tại hoặc không thuộc chi nhánh này");
      }
      if (rpcError.message.includes("PACKAGE_NOT_FOUND")) {
        return fail("NOT_FOUND", "Gói chụp không tồn tại");
      }
      if (rpcError.message.includes("chk_max_selection")) {
        return fail("INVALID_INPUT", "maxSelection không được nhỏ hơn số lượng ảnh miễn phí");
      }
      return failUnexpected(rpcError, requestId);
    }

    // BB-325 — neo bộ vào dòng Hậu Kỳ: Link app của bộ này ghi về ĐÚNG dòng đó
    // (yêu cầu "đi về đâu"). `lark_contract_codes[1]` phải bằng
    // `lark_contract_code` (chk_contract_code_first, 0028).
    const galleryIdMoi = (result as { gallery_id: string }).gallery_id;
    {
      const { error: loiNeo } = await admin
        .from("galleries")
        .update({
          lark_hauky_record_id: dong.recordId,
          lark_contract_code: dong.maHoaDon,
          lark_contract_codes: [dong.maHoaDon],
        })
        .eq("id", galleryIdMoi);
      if (loiNeo) {
        console.error(JSON.stringify({ evt: "gallery_create_lark_link_failed", requestId, galleryId: galleryIdMoi, loi: loiNeo.message }));
        return fail("INTERNAL", "Đã tạo bộ ảnh nhưng chưa gắn được dòng Lark — mở bộ ảnh và gắn lại.", { galleryId: galleryIdMoi });
      }
    }


    // BB-331: bộ vừa neo vào hóa đơn Lark → kéo luôn dòng hợp đồng (hạn mức
    // tính từ các dòng này, `app.gallery_quota`). Hỏng thì bộ vẫn tạo xong —
    // màn chi tiết có nút "Kéo dòng hợp đồng từ Lark" để thử lại.
    try {
      await keoDongHopDongTuLark(admin, galleryIdMoi);
    } catch (err) {
      console.error(JSON.stringify({ evt: "gallery_create_keo_dong_loi", requestId, galleryId: galleryIdMoi, loi: String((err as Error)?.message ?? err) }));
    }

    // BB-183: Cập nhật hạn sử dụng của link vừa tạo theo cấu hình (mặc định 60 ngày)
    const { data: ttlData } = await supabase
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

    const { error: updErr } = await supabase
      .from("share_links")
      .update({ expires_at: expiresAt.toISOString() })
      .eq("id", (result as { share_link_id: string }).share_link_id);
    if (updErr) throw updErr;

    // No fallback on purpose. This used to guess "https://chon-anh.babybean.vn",
    // a domain the studio does not own and nobody has registered — so a missing
    // variable would mint share links pointing into thin air, and whoever
    // registered that domain later would start receiving gallery tokens from
    // parents clicking them. A base URL we cannot know is a configuration
    // error, and it should stop the request loudly rather than be invented.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
    if (!appUrl) {
      console.error(JSON.stringify({ evt: "missing_app_url", requestId }));
      return fail("INTERNAL", "Thiếu cấu hình địa chỉ trang web, chưa tạo được link chia sẻ");
    }
    const shareUrl = `${appUrl.replace(/\/$/, "")}/g/${token}`;

    // 5. Respond -----------------------------------------------------------
    return NextResponse.json(
      {
        data: {
          galleryId: galleryIdMoi,
          shareUrl,
          lark: { recordId: dong.recordId, maHoaDon: dong.maHoaDon, linkLark: dong.linkLark },
        },
      },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      // BB-223: err.message của AuthError mặc định CHÍNH LÀ mã lỗi trần
      // ("FORBIDDEN"/"UNAUTHENTICATED") khi không ai truyền message riêng —
      // xem src/lib/auth/staff.ts. Truyền thẳng err.message vào đây là đúng
      // lỗi đã thấy thật: nhân viên chi nhánh khác mở nhầm bộ ảnh thấy chữ
      // "FORBIDDEN" trần thay vì câu tiếng Việt.
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    // 1. Authenticate staff ------------------------------------------------
    const staff = await requireStaff();

    // 2. Parse & validate query parameters ---------------------------------
    const url = new URL(request.url);
    const rawParams: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (key === "status") {
        const existing = url.searchParams.getAll("status");
        rawParams[key] = existing.length > 1 ? existing : value;
      } else {
        rawParams[key] = value;
      }
    }

    const parsed = GetGalleriesQuerySchema.safeParse(rawParams);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const query = parsed.data;

    // 3. Authorize branch access -------------------------------------------
    let targetBranchIds: string[] | null = null;
    if (query.branchId) {
      requireBranch(staff, query.branchId);
      targetBranchIds = [query.branchId];
    } else {
      if (staff.role === "owner" || staff.role === "admin") {
        targetBranchIds = null; // Toàn quyền xem mọi chi nhánh
      } else {
        targetBranchIds = staff.branchIds;
      }
    }

    // 4. Decode cursor -----------------------------------------------------
    let offset = 0;
    if (query.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
        if (typeof decoded.o === "number" && decoded.o >= 0) {
          offset = decoded.o;
        }
      } catch {
        return fail("INVALID_INPUT", "Cursor không hợp lệ");
      }
    }

    // 5. Query via stored procedure (chặn trần 200) ------------------------
    const limit = Math.min(query.limit, 200);
    const admin = createAdminClient();

    const goiRpc = (pOffset: number, pLimit: number, pStatus: string[] | null) => admin.rpc("get_admin_galleries", {
      p_branch_ids: targetBranchIds,
      p_status: pStatus,
      p_photographer_id: query.photographerId || null,
      p_editor_id: query.editorId || null,
      p_cskh_id: query.cskhId || null,
      p_shoot_date_from: query.dateFrom || query.fromShootDate || null,
      p_shoot_date_to: query.dateTo || query.toShootDate || null,
      p_expiring_soon: query.expiringSoon ?? false,
      p_search: query.q || query.search || null,
      p_sort_by: query.sortBy,
      p_sort_order: query.sortOrder,
      p_offset: pOffset,
      p_limit: pLimit,
      // BB-335: CHỈ gửi khi đang lọc Photo — bản RPC trước 0081 không có tham số này.
      ...(query.photo ? { p_lark_photo: query.photo } : {}),
    });

    const trangThaiLoc = query.status && query.status.length > 0 ? query.status : null;
    // BB-379 — "Chưa có tên bé": RPC không có tham số này, nên đọc hết các trang (kho ~500 bộ,
    // 200/trang) KHÔNG lọc trạng thái, lọc ở đây rồi tự cắt trang + tự đếm theo trạng thái.
    // Lọc trạng thái cũng làm ở đây để các số đếm theo trạng thái vẫn đủ.
    let result: unknown;
    let rpcError: { code?: string; message?: string } | null;
    if (query.chuaTenBe) {
      const daLoc: Array<Record<string, unknown>> = [];
      let off = 0;
      let heTrang = false;
      rpcError = null;
      for (let vong = 0; vong < 10 && !heTrang; vong++) {
        const { data: trang, error: loiTrang } = await goiRpc(off, 200, null);
        if (loiTrang) {
          rpcError = loiTrang;
          break;
        }
        const t = (trang ?? {}) as { items?: Array<Record<string, unknown>>; hasMore?: boolean };
        for (const it of t.items ?? []) if (chuaCoTenBe(it)) daLoc.push(it);
        heTrang = !t.hasMore || (t.items ?? []).length === 0;
        off += (t.items ?? []).length;
      }
      const theoTrangThai = trangThaiLoc ? daLoc.filter((r) => trangThaiLoc.includes(String(r.status) as never)) : daLoc;
      const { items: trangNay, hasMore: conNua } = catTrang(theoTrangThai, offset, limit);
      result = { items: trangNay, counts: demTheoTrangThai(daLoc), hasMore: conNua, limit, offset };
    } else {
      const kq = await goiRpc(offset, limit, trangThaiLoc);
      result = kq.data;
      rpcError = kq.error;
    }

    if (rpcError) {
      // BB-335: lọc Photo khi 0081 chưa áp (PostgREST không thấy hàm có p_lark_photo)
      // → danh sách rỗng kèm cờ, không 500.
      if (query.photo && (rpcError.code === "PGRST202" || /p_lark_photo/i.test(rpcError.message ?? ""))) {
        return ok({ items: [], counts: {}, nextCursor: null, hasMore: false, chuaApMigration: true }, { hasMore: false });
      }
      return failUnexpected(rpcError, requestId);
    }

    type AdminGalleriesRpcResult = {
      items: unknown[];
      counts: Record<string, number>;
      hasMore: boolean;
      limit: number;
      offset: number;
    };

    const rpcData = (result ?? {}) as AdminGalleriesRpcResult;
    const rawItems = rpcData.items || [];
    const hasMore = Boolean(rpcData.hasMore);

    /**
     * BB-200 (2/3) — nhãn quản trị và mức cảnh báo tính TỪ MÃ LARK thô mà RPC
     * (0068) vừa trả (larkTrangThai/larkCanhBao/larkDocLuc), dùng đúng luật
     * dùng chung với màn khách (`nhanHienThi`/`mauCanhBao` ở
     * src/lib/lark/trang-thai-hau-ky.ts) — không tính lại luật ở đây.
     *
     * Không trả `larkTrangThai`/`larkCanhBao` (mã thô) ra ngoài: màn hình chỉ
     * cần nhãn đã tính (`statusLabel`) và mức màu (`warningColor`), giữ mã Lark
     * là chi tiết triển khai nội bộ.
     */
    /**
     * BB-303 (bản vẽ BB-301, admin duyệt 28/09/2026) — "ảnh bìa nhỏ đầu hàng
     * LUÔN hiện". `get_admin_galleries` (RPC, 0068) không trả `cover_photo_id`
     * — không sửa RPC (đổi hàm SQL là đổi hợp đồng chung, brief BB-303 cấm
     * migration) — nên đọc thẳng cột đó từ `galleries` cho đúng các id RPC vừa
     * trả, rồi suy bìa/tấm-đầu bằng `anhBiaTheoBo()` (dùng chung với khối
     * "Việc hôm nay" của Bảng điều khiển).
     */
    const idsTrangNay = rawItems.map((raw) => String((raw as Record<string, unknown>).id));
    const coverMap = new Map<string, string | null>();
    const packageNameMap = new Map<string, string | null>();
    const maHoaDonMap = new Map<string, string | null>();
    const boCoLink = new Set<string>();
    let traLinkDuoc = true;
    if (idsTrangNay.length > 0) {
      const { data: biaRows, error: loiBia } = await admin
        .from("galleries")
        .select("id, cover_photo_id, package_id, lark_contract_code")
        .in("id", idsTrangNay);
      if (loiBia) {
        console.error(JSON.stringify({ evt: "galleries_list_cover_lookup_failed", requestId, loi: loiBia.message }));
      } else {
        for (const r of biaRows ?? []) {
          coverMap.set(String(r.id), (r.cover_photo_id as string | null) ?? null);
          maHoaDonMap.set(String(r.id), (r.lark_contract_code as string | null) ?? null);
          packageNameMap.set(String(r.id), (r.package_id as string | null) ?? null); // tạm giữ package_id, đổi thành tên bên dưới
        }
        const packageIds = [...new Set([...packageNameMap.values()].filter((v): v is string => !!v))];
        if (packageIds.length > 0) {
          const { data: goiRows } = await admin.from("packages").select("id, name").in("id", packageIds);
          const tenGoi = new Map((goiRows ?? []).map((g) => [String(g.id), String(g.name)]));
          for (const [galleryId, pid] of packageNameMap) {
            packageNameMap.set(galleryId, pid ? tenGoi.get(pid) ?? null : null);
          }
        } else {
          for (const galleryId of packageNameMap.keys()) packageNameMap.set(galleryId, null);
        }
      }
      // BB-320 (mục 3, Link app): bộ nào ĐÃ có link còn hiệu lực — nút "Chép link" ở
      // cột Làm nhanh mờ đi (kèm chú thích) với bộ chưa có link, thay vì bấm rồi mới
      // nhận lỗi. Một truy vấn theo đúng các id của trang này. Tra hỏng thì coi như
      // CÓ link (không khoá nhầm nút): việc chép vẫn tự báo lỗi nếu thật sự không có.
      {
        const { data: linkRows, error: loiLink } = await admin
          .from("share_links")
          .select("gallery_id")
          .in("gallery_id", idsTrangNay)
          .is("revoked_at", null);
        if (loiLink) {
          traLinkDuoc = false;
          console.error(JSON.stringify({ evt: "galleries_list_link_lookup_failed", requestId, loi: loiLink.message }));
        } else {
          for (const l of linkRows ?? []) boCoLink.add(String(l.gallery_id));
        }
      }
      const anhBia = await anhBiaTheoBo(
        admin,
        idsTrangNay.map((id) => ({ id, coverPhotoId: coverMap.get(id) ?? null })),
      );
      for (const [id, photoId] of anhBia) coverMap.set(id, photoId);
    }
    // BB-335 — "Photo" (thợ chụp) từ cột Lark; 0081 chưa áp → rỗng, không 500.
    const { theoBo: photoMap } = await docLarkPhoto(admin, idsTrangNay);

    const items = rawItems.map((raw) => {
      const item = raw as Record<string, unknown>;
      const status = String(item.status ?? "");
      const larkTrangThai = (item.larkTrangThai as string | null) ?? null;
      const larkCanhBao = (item.larkCanhBao as string | null) ?? null;
      const { larkTrangThai: _lt, larkCanhBao: _lcb, larkDocLuc: _ldl, larkPhoto: _lp, ...rest } = item;
      return {
        ...rest,
        statusLabel: nhanHienThi(status, larkTrangThai, (s) => GALLERY_STATUS_LABEL[s] ?? s).quanTri,
        warningColor: mauCanhBao(larkCanhBao),
        /** BB-318: tên GỐC trên Lark, để màn quản trị hiện trong tooltip khi nhãn app đã đổi chữ ("hình" → "ảnh"). */
        larkTenTrangThai: larkTrangThai
          ? (TRANG_THAI_LARK as Record<string, { ten: string }>)[larkTrangThai as string]?.ten ?? null
          : null,
        coverPhotoId: coverMap.get(String(item.id)) ?? null,
        // BB-303 — "Loại buổi" (tên gói chụp) cho tiêu đề "Loại buổi · Bé …"
        // ở danh sách/chi tiết bộ ảnh (bo-anh-danh-sach.png). `null` khi bộ
        // ảnh không gắn gói (hợp đồng cũ trước khi có packages, hoặc lỗi tra).
        packageName: packageNameMap.get(String(item.id)) ?? null,
        // BB-325 — mã hóa đơn cho dòng thông tin "tên bé · SĐT · mã hóa đơn · gói".
        maHoaDon: maHoaDonMap.get(String(item.id)) ?? null,
        // BB-320 (Link app): true khi bộ có link chưa thu hồi (hoặc không tra được — xem trên).
        coLinkApp: traLinkDuoc ? boCoLink.has(String(item.id)) : true,
        // BB-335 — tên thợ chụp đọc từ cột "photo" bên Lark; null khi trống / chưa áp 0081.
        larkPhoto: photoMap.get(String(item.id)) ?? null,
      };
    });

    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ o: offset + items.length })).toString("base64url")
      : null;

    return ok(
      {
        items,
        counts: rpcData.counts,
        nextCursor,
        hasMore,
      },
      {
        cursor: nextCursor ?? undefined,
        hasMore,
      },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
