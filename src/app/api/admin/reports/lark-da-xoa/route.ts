/**
 * GET  /api/admin/reports/lark-da-xoa — tab "Dòng Lark đã bị xoá" ở Việc cần xử lý.
 * POST /api/admin/reports/lark-da-xoa — { galleryId }: "Đã xử lý" (bỏ đánh dấu).
 *
 * BB-332. Bộ ảnh đã gửi khách / có ảnh chọn mà dòng Hậu Kỳ neo của nó bị xoá
 * trên Lark: app KHÔNG xoá bộ ảnh (luật chủ studio 30/09/2026), chỉ đánh dấu
 * `galleries.lark_dong_da_xoa_luc` để CSKH quyết: gắn lại dòng Lark khác (khối
 * "Gắn dòng Lark" trong chi tiết bộ ảnh) hoặc lưu trữ. Xong thì bấm "Đã xử lý".
 *
 * Cột đến từ migration 0079 (CHƯA ÁP) — chưa áp thì trả danh sách rỗng.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import type { StaffSession } from "@/types/domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { ghiNhatKy } from "@/lib/nhat-ky";
import { docNhaCuaCacBoKhongLoi } from "@/lib/gia-dinh/nha-cua-bo";
import { layLinkChatTheoBo } from "@/lib/lien-lac/link-chat-khach-server";

export const runtime = "nodejs";

const BLOCKED_ROLES = ["photoshop_ctv"];

function thieuCot(err: { code?: string } | null): boolean {
  return err?.code === "42703" || err?.code === "PGRST204";
}

function chiNhanhDuocXem(staff: StaffSession): string[] | null {
  return staff.permissions.includes("system:superuser") ? null : staff.branchIds;
}

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) return fail("FORBIDDEN", "Vai trò này không xem được danh sách này");
    const branchIds = chiNhanhDuocXem(staff);
    if (branchIds && branchIds.length === 0) return ok({ items: [] });

    let q = createAdminClient()
      .from("galleries")
      .select("id, title, status, lark_contract_code, lark_dong_da_xoa_luc, branches(name), customers(full_name)")
      .not("lark_dong_da_xoa_luc", "is", null)
      .neq("status", "archived")
      .order("lark_dong_da_xoa_luc", { ascending: false })
      .limit(200);
    if (branchIds) q = q.in("branch_id", branchIds);
    const { data, error } = await q;
    if (error) {
      if (thieuCot(error)) return ok({ items: [] });
      return failUnexpected(error, requestId);
    }
    const ten = (v: unknown, k: string): string | null => {
      const x = Array.isArray(v) ? v[0] : v;
      return x && typeof x === "object" ? ((x as Record<string, string | null>)[k] ?? null) : null;
    };
    const items = (data ?? []).map((g: Record<string, unknown>) => ({
      galleryId: g.id as string,
      title: g.title as string,
      status: g.status as string,
      maHoaDon: (g.lark_contract_code as string | null) ?? null,
      branchName: ten(g.branches, "name"),
      customerName: ten(g.customers, "full_name"),
      thayLuc: g.lark_dong_da_xoa_luc as string,
    }));
    // BB-394 — nhãn nhà (khách có ≥ 2 bộ); lỗi đọc thì bỏ nhãn, danh sách vẫn đủ.
    const nha = await docNhaCuaCacBoKhongLoi(createAdminClient(), items.map((i) => i.galleryId));
    // BB-404 — link chat riêng của khách theo bộ (một truy vấn) cho icon "Nhắn khách" trên từng dòng.
    const chatTheoBo = await layLinkChatTheoBo(createAdminClient(), items.map((i) => i.galleryId));
    return ok({ items, nha, chatTheoBo });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}

const Body = z.object({ galleryId: z.string().uuid() });

export async function POST(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "galleries:write");
    const body = await readJsonBody(request);
    const parsed = body.ok ? Body.safeParse(body.data) : null;
    if (!parsed?.success) return fail("INVALID_INPUT");

    const admin = createAdminClient();
    const { data: g, error: loiDoc } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", parsed.data.galleryId)
      .maybeSingle();
    if (loiDoc) return failUnexpected(loiDoc, requestId);
    if (!g) return fail("NOT_FOUND");
    const branchIds = chiNhanhDuocXem(staff);
    if (branchIds && !branchIds.includes(g.branch_id as string)) return fail("FORBIDDEN");

    const { error } = await admin.from("galleries").update({ lark_dong_da_xoa_luc: null }).eq("id", g.id);
    if (error) return failUnexpected(error, requestId);
    // BB-336 (luật BB-052): "Đã xử lý" là quyết định của CSKH trên một bộ ảnh
    // mất dòng Lark — sáu tháng sau phải tra được ai bỏ đánh dấu, lúc nào.
    await ghiNhatKy({
      actorType: "staff",
      actorId: staff.staffId,
      branchId: String(g.branch_id),
      action: "gallery.lark_dong_da_xoa_da_xu_ly",
      entityType: "gallery",
      entityId: String(g.id),
      galleryId: String(g.id),
    });
    return ok({ galleryId: g.id });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.code);
    return failUnexpected(err, requestId);
  }
}
