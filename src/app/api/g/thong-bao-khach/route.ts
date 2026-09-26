/**
 * GET /api/g/thong-bao-khach — 20 thông báo mới nhất của bộ ảnh + số chưa đọc.
 * PATCH /api/g/thong-bao-khach — đánh dấu đã đọc (một thông báo, hoặc tất cả).
 *
 * OWNER: Sonnet (BB-261). Chủ studio 26/09/2026: chuông ở góc phải màn khách,
 * có chấm/số chưa đọc, bấm mở ra thấy danh sách; thông báo chưa đọc được nhắc
 * lại (xem src/lib/thong-bao/nhac-chua-doc.ts).
 *
 * ---------------------------------------------------------------------------
 * Người chỉ xem (viewer) cũng đọc và đánh dấu được
 * ---------------------------------------------------------------------------
 * `requireGallerySession()` không truyền `allowedRoles` — BB-254 cho ông bà
 * (vai `viewer`) xem bộ ảnh; hộp thư thông báo không phải quyết định trên bộ
 * ảnh (không đổi tiền, không đổi lựa chọn), nên không có lý do khoá vai này.
 *
 * ---------------------------------------------------------------------------
 * PATCH theo `id`: chỉ thông báo của ĐÚNG bộ ảnh trong phiên
 * ---------------------------------------------------------------------------
 * `id` đến từ thân request (không tin cậy) — điều kiện `gallery_id =
 * session.galleryId` nằm ngay trong câu UPDATE, không phải một bước kiểm tra
 * riêng dễ quên. Không khớp dòng nào (id không tồn tại, hoặc thuộc bộ ảnh
 * khác) → 404, không tiết lộ thông báo đó có tồn tại ở bộ ảnh khác hay không.
 *
 * ---------------------------------------------------------------------------
 * Không ghi nhật ký (activity_logs)
 * ---------------------------------------------------------------------------
 * Cùng lý do với BB-246 (`g/thong-bao`, xem NGOAI_LE trong
 * tests/unit/bb-052-moi-thao-tac-co-nhat-ky.test.ts): đánh dấu đã đọc không
 * đổi trạng thái bộ ảnh, không đổi tiền, không có gì để tra lại sáu tháng sau
 * — bản thân dòng `thong_bao_khach.da_doc_luc` đã là bằng chứng.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireGallerySession, GallerySessionError } from "@/lib/auth/gallery-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { DanhDauDaDocSchema } from "./schema";

export const runtime = "nodejs";

const SO_LUONG_MOI_NHAT = 20;

export async function GET(): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();
    const admin = createAdminClient();

    const { data: ds, error } = await admin
      .from("thong_bao_khach")
      .select("id, loai, tieu_de, noi_dung, created_at, da_doc_luc")
      .eq("gallery_id", session.galleryId)
      .order("created_at", { ascending: false })
      .limit(SO_LUONG_MOI_NHAT);
    if (error) throw error;

    const { count: soChuaDoc, error: demErr } = await admin
      .from("thong_bao_khach")
      .select("id", { count: "exact", head: true })
      .eq("gallery_id", session.galleryId)
      .is("da_doc_luc", null);
    if (demErr) throw demErr;

    return ok({
      thongBao: (ds ?? []).map((d) => ({
        id: d.id as string,
        loai: d.loai as string,
        tieuDe: d.tieu_de as string,
        noiDung: d.noi_dung as string,
        createdAt: d.created_at as string,
        daDoc: d.da_doc_luc !== null,
      })),
      soChuaDoc: soChuaDoc ?? 0,
    });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const session = await requireGallerySession();

    const jsonBody = await readJsonBody(request);
    if (!jsonBody.ok) {
      return fail("INVALID_INPUT", "Request body phải là JSON hợp lệ");
    }

    const parsed = DanhDauDaDocSchema.safeParse(jsonBody.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }
    const input = parsed.data;

    const admin = createAdminClient();
    const now = new Date().toISOString();

    if (input.tatCa) {
      const { error } = await admin
        .from("thong_bao_khach")
        .update({ da_doc_luc: now })
        .eq("gallery_id", session.galleryId)
        .is("da_doc_luc", null);
      if (error) throw error;
      return ok({ danhDau: "tatCa" });
    }

    // input.id chắc chắn có mặt — Zod refine đã bắt đúng một trong hai trường.
    const { data, error } = await admin
      .from("thong_bao_khach")
      .update({ da_doc_luc: now })
      .eq("id", input.id as string)
      .eq("gallery_id", session.galleryId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) {
      return fail("NOT_FOUND", "Không tìm thấy thông báo");
    }

    return ok({ danhDau: "mot", id: input.id });
  } catch (err) {
    if (err instanceof GallerySessionError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
