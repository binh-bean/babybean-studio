/**
 * POST /api/g/review — khách duyệt ảnh đã chỉnh, hoặc yêu cầu sửa.
 *
 * OWNER: DEV-BE. Task BB-121.
 * Spec: docs/16 mục 4b
 *
 *   { decision: "approve" }              → approved, chuyển sang in
 *   { decision: "revise", note: "..." }  → quay lại in_retouch, ghi vòng mới
 *
 * ---------------------------------------------------------------------------
 * Một route cho hai quyết định, không phải hai route
 * ---------------------------------------------------------------------------
 * Hai quyết định này loại trừ nhau và cùng đọc một trạng thái. Tách đôi thì
 * phải kiểm cùng một điều kiện ở hai nơi, và hai nơi đó sẽ trôi khỏi nhau —
 * đúng chuyện đã xảy ra với danh sách trạng thái khoá ở 0034.
 *
 * ---------------------------------------------------------------------------
 * Yêu cầu sửa BẮT BUỘC viết gì đó
 * ---------------------------------------------------------------------------
 * "Yêu cầu sửa" mà không nói sửa gì thì người photoshop không làm được, và họ
 * sẽ gọi lại hỏi — tức là khách phải trả lời hai lần cho một việc.
 *
 * ---------------------------------------------------------------------------
 * Chỉ khách CHÍNH được quyết
 * ---------------------------------------------------------------------------
 * Cùng luật với lúc chốt chọn ảnh. Bà hay dì được mời vào xem và gợi ý, nhưng
 * quyết định cuối là của người đứng tên hợp đồng.
 */

import { vi } from "@/i18n";
import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { GallerySessionError } from "@/lib/auth/gallery-session";
import { requirePhienBoAnh } from "@/lib/auth/phien-bo-anh";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { enqueueLarkNotification, cheSoDienThoai } from "@/lib/lark/notify";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";
import { after } from "next/server";
import {
  chuanHoaVung,
  ghepGhiChu,
  TOI_DA_ANH_MAU,
  TOI_DA_ANH_SUA,
  TOI_DA_GHI_CHU,
  type MucSua,
} from "@/lib/anh-chinh-sua/nhan-dien";
import {
  coBangChiTiet,
  coBangTheoDot,
  docBoiCanhAnhChinh,
  docVongSua,
  khachThayTrongBoiCanh,
  laDuongDanAnhMau,
} from "@/lib/anh-chinh-sua/du-lieu";
import {
  KHOA_TRONG_GOI,
  duocQuyetAnhChinh,
  laKhoaMuaThem,
  lanSuaKeTiep,
  nhanCuaKhoa,
  trangThaiDuyetDot,
} from "@/lib/anh-chinh-sua/theo-dot";
import { ghiTrangThaiSuaLenLark } from "@/lib/lark/ghi-trang-thai-sua";
import { kiemQuyetTrongGoi } from "@/lib/anh-chinh-sua/vong-duyet";

export const runtime = "nodejs";

const MAX_NOTE = 1000;

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requirePhienBoAnh(request);
    if (!duocQuyetAnhChinh(session.role)) {
      return fail("FORBIDDEN", "Chỉ người nhận link chính mới duyệt được ảnh");
    }

    const jsonBody = await readJsonBody(request);
    const body = (jsonBody.ok ? jsonBody.data : null) as {
      decision?: string;
      note?: string;
      /** BB-371 — yêu cầu sửa CHI TIẾT trên ảnh chỉnh trong app. */
      items?: unknown;
      /** BB-377 — đợt đang duyệt: thiếu/"goc" = trong gói (vòng cũ), "dot:N"/"mt:<id>" = mua thêm. */
      khoa?: unknown;
    } | null;

    const decision = body?.decision;
    if (decision !== "approve" && decision !== "revise") {
      return fail("INVALID_INPUT", "Thiếu quyết định duyệt hoặc yêu cầu sửa");
    }

    const note = (body?.note ?? "").trim();
    const coMucChiTiet = Array.isArray(body?.items) && (body.items as unknown[]).length > 0;
    if (decision === "revise") {
      if (Array.isArray(body?.items) && (body.items as unknown[]).length > TOI_DA_ANH_SUA) {
        return fail("INVALID_INPUT", `Mỗi lần ba mẹ chọn tối đa ${TOI_DA_ANH_SUA} tấm cần sửa ạ.`);
      }
      if (note.length === 0 && !coMucChiTiet) {
        return fail("INVALID_INPUT", "Ba mẹ ghi giúp cần sửa gì, để bên chỉnh ảnh làm đúng ý");
      }
      if (note.length > MAX_NOTE) {
        return fail("INVALID_INPUT", `Ghi chú tối đa ${MAX_NOTE} ký tự`);
      }
    }

    const admin = createAdminClient();
    const { data: gallery } = await admin
      .from("galleries")
      .select("id, branch_id, status, title, customer_id, lark_hauky_record_id")
      .eq("id", session.galleryId)
      .maybeSingle();

    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    // Chỉ duyệt được khi đang chờ duyệt. Bấm hai lần, hoặc mở lại link cũ sau
    // khi đã duyệt, đều rơi vào đây — và câu trả lời phải nói rõ đang ở đâu
    // chứ không phải "có lỗi xảy ra".
    // BB-377 — đợt MUA THÊM: vòng duyệt riêng, không đụng trạng thái bộ ảnh.
    const khoaYeuCau = body?.khoa;
    if (khoaYeuCau !== undefined && khoaYeuCau !== null && khoaYeuCau !== KHOA_TRONG_GOI) {
      if (!laKhoaMuaThem(khoaYeuCau)) return fail("INVALID_INPUT", "Đợt ảnh không hợp lệ ạ.");
      return await quyetDotMuaThem({
        requestId,
        gallery: gallery as GalleryDuyet,
        khoa: khoaYeuCau,
        decision,
        note,
        items: coMucChiTiet ? (body!.items as unknown[]) : [],
      });
    }

    // BB-384 — bỏ HẲN đường "duyệt mù" theo link Drive (BB-121): vòng trong gói chỉ nhận
    // quyết định khi ba mẹ ĐANG thấy ảnh chỉnh trong app (CSKH đã "Gửi khách duyệt").
    // Vòng TRONG GÓI chỉ tính tấm trong gói (đã áp 0095); tấm mua thêm duyệt ở vòng của đợt.
    const bc = await docBoiCanhAnhChinh(admin, gallery.id);
    const duocXemTrongGoi = new Map(
      bc.anhChinh
        .filter(
          (a) =>
            khachThayTrongBoiCanh(bc, gallery.status, a) &&
            (bc.mocDot === null || !laKhoaMuaThem(bc.khoaCua.get(a.id))),
        )
        .map((a) => [a.id, a] as const),
    );
    const kiem = kiemQuyetTrongGoi({ status: gallery.status, soAnhKhachThay: duocXemTrongGoi.size });
    if (!kiem.ok) {
      return fail("INVALID_INPUT", gallery.status === "approved" ? vi.gallery.loiBean.daDuyetDangIn : kiem.loi);
    }

    const now = new Date().toISOString();

    // BB-284 — dữ liệu trang trí cho thẻ Lark (khách↔studio, LUÔN gửi bất kể
    // công tắc nhắc nội bộ). Đọc hụt thì thẻ vẫn dựng được, chỉ thiếu tên/SĐT —
    // không được phép làm hỏng quyết định của khách vì lỗi này.
    let tenKhach: string | null = null;
    let soKhach: string | null = null;
    if (gallery.customer_id) {
      const { data: khach } = await admin
        .from("customers")
        .select("full_name, phone")
        .eq("id", gallery.customer_id)
        .maybeSingle();
      tenKhach = (khach?.full_name as string | undefined) ?? null;
      soKhach = (khach?.phone as string | undefined) ?? null;
    }

    if (decision === "approve") {
      const { error } = await admin
        .from("galleries")
        .update({ status: "approved", updated_at: now })
        .eq("id", gallery.id);
      if (error) throw error;

      let qDong = admin
        .from("revision_requests")
        .update({ resolved_at: now })
        .eq("gallery_id", gallery.id)
        .is("resolved_at", null);
      // BB-377 — duyệt ảnh trong gói không đóng vòng sửa đang mở của đợt mua thêm.
      if (await coBangTheoDot(admin)) qDong = qDong.is("dot_khoa", null);
      const { error: resErr } = await qDong;
      if (resErr) throw resErr;

      // BB-052: đây là một QUYẾT ĐỊNH của khách, ngang với lúc chốt chọn ảnh.
      // Không ghi thì sau này "khách duyệt lúc nào, hay studio tự chuyển" chỉ
      // còn dựa vào `galleries.updated_at` — cột bị mọi lượt sửa khác ghi đè.
      await ghiNhatKy({
        actorType: "customer",
        actorLabel: "khách",
        branchId: gallery.branch_id,
        action: "gallery.review_approved",
        entityType: "gallery",
        entityId: gallery.id,
        galleryId: gallery.id,
      });

      // Báo nhóm Lark của chi nhánh — chiều khách→studio, LUÔN gửi (không nằm
      // dưới công tắc `lark.nhac_noi_bo`, xem `notify.ts`).
      await phatSuKienBoAnh({ galleryId: gallery.id, branchId: gallery.branch_id, loai: LOAI_TUC_THI.khachDuyetAnh });

      await enqueueLarkNotification({
        branchId: gallery.branch_id,
        event: "review.approved",
        payload: {
          galleryId: gallery.id,
          galleryTitle: gallery.title,
          customerName: tenKhach,
          customerPhone: cheSoDienThoai(soKhach),
        },
      });

      return ok({ status: "approved" });
    }

    // Yêu cầu sửa: ghi vòng mới rồi trả bộ ảnh về cho người photoshop.
    const { data: last } = await admin
      .from("revision_requests")
      .select("round")
      .eq("gallery_id", gallery.id)
      .order("round", { ascending: false })
      .limit(1)
      .maybeSingle();

    const round = lanSuaKeTiep(last ? [last] : []);

    // BB-371 — từng tấm ba mẹ xin sửa. Ảnh phải là ảnh CHỈNH của CHÍNH bộ này mà
    // ba mẹ ĐƯỢC xem (CSKH đã gửi) — id lạ/bộ khác/chưa gửi thì từ chối cả lượt.
    let cacMuc: (MucSua & { gocId: string | null; nhanDot?: string })[] = [];
    if (coMucChiTiet) {
      // BB-377 — vòng TRONG GÓI chỉ nhận tấm trong gói (khi đã áp 0095 và bộ có đợt mua
      // thêm); tấm mua thêm xin sửa ở vòng của đợt nó. (Tập đã tính ở cổng BB-384 phía trên.)
      const duocXem = duocXemTrongGoi;
      const daGap = new Set<string>();
      for (const raw of body!.items as unknown[]) {
        const m = (raw ?? {}) as { photoId?: unknown; note?: unknown; marks?: unknown; anhMau?: unknown };
        const anh = typeof m.photoId === "string" ? duocXem.get(m.photoId) : undefined;
        if (!anh || daGap.has(anh.id)) return fail("NOT_FOUND", "Không tìm thấy ảnh cần sửa ạ.");
        daGap.add(anh.id);
        const ghiChu = typeof m.note === "string" ? m.note.trim() : "";
        if (ghiChu.length > TOI_DA_GHI_CHU) {
          return fail("INVALID_INPUT", `Ghi chú mỗi tấm tối đa ${TOI_DA_GHI_CHU} ký tự ạ.`);
        }
        const anhMau = Array.isArray(m.anhMau) ? m.anhMau : [];
        if (anhMau.length > TOI_DA_ANH_MAU || !anhMau.every((d) => laDuongDanAnhMau(d, gallery.id))) {
          return fail("INVALID_INPUT", "Ảnh mẫu không hợp lệ ạ.");
        }
        cacMuc.push({
          photoId: anh.id,
          tenAnh: anh.file_name,
          ghiChu,
          vung: chuanHoaVung(m.marks),
          anhMau: anhMau as string[],
          gocId: null,
        });
      }
      cacMuc = cacMuc.map((c) => ({ ...c, gocId: bc.gocCua.get(c.photoId) ?? null }));
      // Chưa áp 0095: mọi tấm chung một vòng — ghi rõ đợt cho thợ chỉnh.
      if (bc.mocDot === null) {
        cacMuc = cacMuc.map((c) => {
          const k = bc.khoaCua.get(c.photoId);
          return laKhoaMuaThem(k) ? { ...c, nhanDot: nhanCuaKhoa(k, bc.nhom) } : c;
        });
      }
    }
    const noiDungVong = ghepGhiChu(note, cacMuc);

    // Giữ lại link bản khách đang xem lúc chê — vòng sau file khác rồi, không
    // lưu thì không ai biết khách chê BẢN NÀO.
    const { data: delivery } = await admin
      .from("deliveries")
      .select("final_drive_url")
      .eq("gallery_id", gallery.id)
      .maybeSingle();

    const { data: vongMoi, error: insErr } = await admin
      .from("revision_requests")
      .insert({
        gallery_id: gallery.id,
        round,
        note: noiDungVong,
        reviewed_url: delivery?.final_drive_url ?? null,
      })
      .select("id")
      .single();
    if (insErr) throw insErr;

    // BB-371 — chi tiết từng tấm (0091). Chưa áp 0091 thì bỏ qua: chữ của ba mẹ đã
    // nằm đủ trong `note` ở trên. Ghi hụt cũng không làm hỏng yêu cầu của ba mẹ.
    let daLuuChiTiet = false;
    if (cacMuc.length > 0 && vongMoi && (await coBangChiTiet(admin))) {
      const { error: ctErr } = await admin.from("revision_request_items").insert(
        cacMuc.map((c) => ({
          revision_request_id: vongMoi.id,
          gallery_id: gallery.id,
          photo_id: c.photoId,
          original_photo_id: c.gocId,
          note: c.ghiChu,
          marks: c.vung,
          reference_paths: c.anhMau,
        })),
      );
      if (ctErr) console.error(JSON.stringify({ evt: "bb371.chi_tiet_ghi_hut", requestId, code: ctErr.code }));
      else daLuuChiTiet = true;
    }

    const { error } = await admin
      .from("galleries")
      .update({ status: "in_retouch", updated_at: now })
      .eq("id", gallery.id);
    if (error) throw error;

    await ghiNhatKy({
      actorType: "customer",
      actorLabel: "khách",
      branchId: gallery.branch_id,
      action: "gallery.review_revise",
      entityType: "gallery",
      entityId: gallery.id,
      galleryId: gallery.id,
      // Nội dung khách viết nằm ở `revision_requests.note`; ở đây chỉ cần đủ
      // để lần ra đúng vòng đó.
      metadata: { round, soTam: cacMuc.length, daLuuChiTiet },
    });

    // Báo nhóm Lark của chi nhánh — chiều khách→studio, LUÔN gửi. Ghi chú
    // nguyên văn để người chỉnh ảnh không phải gọi lại hỏi sửa gì.
    await phatSuKienBoAnh({ galleryId: gallery.id, branchId: gallery.branch_id, loai: LOAI_TUC_THI.khachDuyetAnh });
    await enqueueLarkNotification({
      branchId: gallery.branch_id,
      event: "review.changes_requested",
      payload: {
        galleryId: gallery.id,
        galleryTitle: gallery.title,
        round,
        ghiChu: note || noiDungVong,
        // BB-371 — thẻ Lark liệt kê từng tấm (mẫu `cacTam` đã có ở notify.ts) + nút
        // "Mở bộ ảnh" dẫn thẳng tới màn quản trị bộ này.
        cacTam: cacMuc.map((c) => ({
          ten: c.nhanDot ? `${c.tenAnh} · ${c.nhanDot}` : c.tenAnh,
          ghiChu: [
            c.ghiChu,
            c.vung.length ? `khoanh ${c.vung.length} vùng` : "",
            c.anhMau.length ? `${c.anhMau.length} ảnh mẫu` : "",
          ]
            .filter(Boolean)
            .join(" · ") || "cần sửa",
        })),
        customerPhone: cheSoDienThoai(soKhach),
      },
    });

    // BB-371 — Trạng Thái dòng Hậu Kỳ bên Lark: "Sửa" (lần 1) / "Sửa lần 2, 3, 4".
    // Chạy SAU khi trả lời ba mẹ (after): bốn lượt gọi Lark không bắt ba mẹ ngồi chờ.
    // Hàm tự không bao giờ ném và tự chặn khi đang chạy phép thử (khongGuiRaLarkThat).
    const recordId = (gallery as { lark_hauky_record_id?: string | null }).lark_hauky_record_id ?? null;
    const ghiLark = async () => {
      const kq = await ghiTrangThaiSuaLenLark({ recordId, lanSua: round });
      if (!kq.ghiDuoc && !kq.chayThu) {
        console.error(JSON.stringify({ evt: "bb371.lark_trang_thai_hut", galleryId: gallery.id, lyDo: kq.lyDo }));
      }
    };
    try {
      after(ghiLark);
    } catch {
      // Gọi thẳng hàm route ngoài vòng yêu cầu của Next (phép thử): chạy luôn.
      await ghiLark();
    }

    return ok({ status: "in_retouch", round, soTam: cacMuc.length });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}

// ---------------------------------------------------------------------------
// BB-377 — duyệt / xin sửa ảnh chỉnh của một ĐỢT MUA THÊM
// ---------------------------------------------------------------------------
//
// Ảnh mua thêm (đợt chọn BB-321, hay yêu cầu của người thân BB-345) về sau khi
// bộ đã duyệt/đã giao là chuyện thường — kéo cả bộ về "chờ duyệt" là làm hỏng
// trạng thái in/giao của ảnh trong gói. Nên đợt mua thêm có vòng RIÊNG (bảng
// `anh_chinh_dot`, 0095): duyệt ghi `duyet_luc` của đợt; xin sửa ghi một vòng
// `revision_requests` gắn `dot_khoa`. Lần sửa vẫn đếm theo BỘ (Lark chỉ có một
// cột Trạng Thái cho dòng Hậu Kỳ của bộ — đợt mua thêm không có dòng riêng).

interface GalleryDuyet {
  id: string;
  branch_id: string;
  status: string;
  title: string;
  customer_id: string | null;
  lark_hauky_record_id?: string | null;
}

async function quyetDotMuaThem(p: {
  requestId: string;
  gallery: GalleryDuyet;
  khoa: string;
  decision: "approve" | "revise";
  note: string;
  items: unknown[];
}): Promise<Response> {
  const { gallery, khoa, decision, note, requestId } = p;
  const admin = createAdminClient();
  const bc = await docBoiCanhAnhChinh(admin, gallery.id);
  if (bc.mocDot === null) {
    // Chưa áp 0095: ảnh mua thêm đi chung vòng của bộ (gửi không kèm `khoa`).
    return fail("INVALID_INPUT", "Bộ ảnh chưa tới bước duyệt ảnh đã chỉnh.");
  }
  const nhan = nhanCuaKhoa(khoa, bc.nhom);
  const cuaDot = bc.anhChinh.filter((a) => bc.khoaCua.get(a.id) === khoa && khachThayTrongBoiCanh(bc, gallery.status, a));
  if (!bc.nhom.some((n) => n.khoa === khoa) || cuaDot.length === 0) {
    return fail("NOT_FOUND", "Không tìm thấy ảnh cần sửa ạ.");
  }
  const vong = await docVongSua(admin, gallery.id, false);
  const trangThai = trangThaiDuyetDot(
    bc.mocDot.get(khoa),
    vong.some((v) => v.resolved_at === null && v.dot_khoa === khoa),
  );
  if (trangThai !== "cho_duyet") {
    return fail(
      "INVALID_INPUT",
      trangThai === "da_duyet" ? "Ba mẹ đã duyệt các ảnh này rồi ạ." : "Ảnh này chưa tới bước duyệt ạ.",
    );
  }

  const now = new Date().toISOString();
  let soKhach: string | null = null;
  if (gallery.customer_id) {
    const { data: khach } = await admin.from("customers").select("phone").eq("id", gallery.customer_id).maybeSingle();
    soKhach = (khach?.phone as string | undefined) ?? null;
  }
  const tieuDe = `${gallery.title} · ${nhan}`;

  if (decision === "approve") {
    const { error } = await admin
      .from("anh_chinh_dot")
      .update({ duyet_luc: now, updated_at: now })
      .eq("gallery_id", gallery.id)
      .eq("khoa", khoa);
    if (error) throw error;
    await ghiNhatKy({
      actorType: "customer",
      actorLabel: "khách",
      branchId: gallery.branch_id,
      action: "gallery.review_approved",
      entityType: "gallery",
      entityId: gallery.id,
      galleryId: gallery.id,
      metadata: { khoa, nhan, soAnh: cuaDot.length },
    });
    await phatSuKienBoAnh({ galleryId: gallery.id, branchId: gallery.branch_id, loai: LOAI_TUC_THI.khachDuyetAnh });
    await enqueueLarkNotification({
      branchId: gallery.branch_id,
      event: "review.approved",
      payload: { galleryId: gallery.id, galleryTitle: tieuDe, customerPhone: cheSoDienThoai(soKhach) },
    });
    return ok({ status: gallery.status, khoa, daDuyet: true });
  }

  // Xin sửa: BẮT BUỘC chọn tấm — vòng của đợt mua thêm phải chỉ được đúng tấm nào.
  if (p.items.length === 0) return fail("INVALID_INPUT", "Ba mẹ chọn giúp Bean tấm cần sửa ạ.");
  const duocXem = new Map(cuaDot.map((a) => [a.id, a] as const));
  const daGap = new Set<string>();
  const cacMuc: (MucSua & { gocId: string | null })[] = [];
  for (const raw of p.items) {
    const m = (raw ?? {}) as { photoId?: unknown; note?: unknown; marks?: unknown; anhMau?: unknown };
    const anh = typeof m.photoId === "string" ? duocXem.get(m.photoId) : undefined;
    if (!anh || daGap.has(anh.id)) return fail("NOT_FOUND", "Không tìm thấy ảnh cần sửa ạ.");
    daGap.add(anh.id);
    const ghiChu = typeof m.note === "string" ? m.note.trim() : "";
    if (ghiChu.length > TOI_DA_GHI_CHU) return fail("INVALID_INPUT", `Ghi chú mỗi tấm tối đa ${TOI_DA_GHI_CHU} ký tự ạ.`);
    const anhMau = Array.isArray(m.anhMau) ? m.anhMau : [];
    if (anhMau.length > TOI_DA_ANH_MAU || !anhMau.every((d) => laDuongDanAnhMau(d, gallery.id))) {
      return fail("INVALID_INPUT", "Ảnh mẫu không hợp lệ ạ.");
    }
    cacMuc.push({
      photoId: anh.id,
      tenAnh: anh.file_name,
      ghiChu,
      vung: chuanHoaVung(m.marks),
      anhMau: anhMau as string[],
      gocId: bc.gocCua.get(anh.id) ?? null,
    });
  }

  // Lần sửa đếm theo BỘ ẢNH (mọi đợt) — đúng một cột Trạng Thái bên Lark.
  const round = lanSuaKeTiep(vong);
  const noiDung = `[${nhan}]\n${ghepGhiChu(note, cacMuc)}`;
  const { data: delivery } = await admin.from("deliveries").select("final_drive_url").eq("gallery_id", gallery.id).maybeSingle();
  const { data: vongMoi, error: insErr } = await admin
    .from("revision_requests")
    .insert({ gallery_id: gallery.id, round, note: noiDung, reviewed_url: delivery?.final_drive_url ?? null, dot_khoa: khoa })
    .select("id")
    .single();
  if (insErr) throw insErr;

  let daLuuChiTiet = false;
  if (vongMoi && (await coBangChiTiet(admin))) {
    const { error: ctErr } = await admin.from("revision_request_items").insert(
      cacMuc.map((c) => ({
        revision_request_id: vongMoi.id,
        gallery_id: gallery.id,
        photo_id: c.photoId,
        original_photo_id: c.gocId,
        note: c.ghiChu,
        marks: c.vung,
        reference_paths: c.anhMau,
      })),
    );
    if (ctErr) console.error(JSON.stringify({ evt: "bb377.chi_tiet_ghi_hut", requestId, code: ctErr.code }));
    else daLuuChiTiet = true;
  }

  await ghiNhatKy({
    actorType: "customer",
    actorLabel: "khách",
    branchId: gallery.branch_id,
    action: "gallery.review_revise",
    entityType: "gallery",
    entityId: gallery.id,
    galleryId: gallery.id,
    metadata: { round, soTam: cacMuc.length, daLuuChiTiet, khoa, nhan },
  });
  await phatSuKienBoAnh({ galleryId: gallery.id, branchId: gallery.branch_id, loai: LOAI_TUC_THI.khachDuyetAnh });
  await enqueueLarkNotification({
    branchId: gallery.branch_id,
    event: "review.changes_requested",
    payload: {
      galleryId: gallery.id,
      galleryTitle: tieuDe,
      round,
      ghiChu: note || noiDung,
      cacTam: cacMuc.map((c) => ({
        ten: c.tenAnh,
        ghiChu:
          [c.ghiChu, c.vung.length ? `khoanh ${c.vung.length} vùng` : "", c.anhMau.length ? `${c.anhMau.length} ảnh mẫu` : ""]
            .filter(Boolean)
            .join(" · ") || "cần sửa",
      })),
      customerPhone: cheSoDienThoai(soKhach),
    },
  });

  // Dòng Hậu Kỳ CỦA BỘ (đợt mua thêm không có dòng riêng): "Sửa" / "Sửa lần N".
  const ghiLark = async () => {
    const kq = await ghiTrangThaiSuaLenLark({ recordId: gallery.lark_hauky_record_id ?? null, lanSua: round });
    if (!kq.ghiDuoc && !kq.chayThu) {
      console.error(JSON.stringify({ evt: "bb377.lark_trang_thai_hut", galleryId: gallery.id, lyDo: kq.lyDo }));
    }
  };
  try {
    after(ghiLark);
  } catch {
    await ghiLark();
  }

  return ok({ status: gallery.status, khoa, round, soTam: cacMuc.length });
}
