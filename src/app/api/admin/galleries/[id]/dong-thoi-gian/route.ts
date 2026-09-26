/**
 * GET /api/admin/galleries/[id]/dong-thoi-gian — khối "Dòng thời gian hoạt
 * động" ở màn chi tiết bộ ảnh quản trị.
 *
 * OWNER: task BB-259.
 * Bản vẽ: docs/thiet-ke/quan-tri-chi-tiet.webp — cột phải, dưới "Link gửi
 * khách".
 *
 * ---------------------------------------------------------------------------
 * CHỈ ĐỌC `activity_logs`
 * ---------------------------------------------------------------------------
 * Route này không ghi gì cả — không insert, không update. BB-255 từng bỏ qua
 * khối này vì tưởng chưa có dữ liệu; thật ra bảng đã ghi từ lâu qua
 * `src/lib/nhat-ky.ts` và nhiều route ghi thẳng, chỉ là chưa có màn nào đọc.
 *
 * ---------------------------------------------------------------------------
 * Vì sao kiểm CẢ HAI cột `gallery_id` và `entity_id`
 * ---------------------------------------------------------------------------
 * Route cũ ghi `entity_type = 'gallery'` kèm `entity_id`. Migration 0051 thêm
 * cột `gallery_id` riêng và có trigger đồng bộ hai chiều CHO TRƯỜNG HỢP
 * entity_type = 'gallery' — nhưng vài dòng (vd `selection.patch`) ghi
 * entity_type = 'gallery' với entity_id LÀ gallery_id ngay từ khi tạo (không
 * qua trigger cũ), nên kiểm cả hai vế cho chắc, không dựa hoàn toàn vào
 * trigger của một migration khác.
 *
 * ---------------------------------------------------------------------------
 * Không bao giờ trả `ip`, `user_agent`, `metadata` thô, hay tên/SĐT khách
 * ---------------------------------------------------------------------------
 * `xepDongThoiGian` chỉ trả `{ luc, nhom, cau, nguoi }` — bốn trường ĐÃ DỊCH.
 * Không select `ip`/`user_agent` từ DB, và không đưa `metadata` thô ra khỏi
 * route này dưới bất cứ hình thức nào.
 *
 * ---------------------------------------------------------------------------
 * Phân trang: cursor là `luc` của dòng ĐÃ HIỂN THỊ cuối cùng, không phải
 * created_at thô
 * ---------------------------------------------------------------------------
 * Gộp `selection.patch` làm nhiều dòng thô gộp thành một dòng hiển thị mang
 * `luc` = thời điểm MỚI NHẤT trong nhóm. Lọc `created_at < luc` ở trang sau
 * loại bỏ toàn bộ các dòng thô đã góp vào dòng hiển thị đó (mọi dòng trong
 * một nhóm đều có created_at <= luc của nhóm), nên không trùng, không hụt.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { xepDongThoiGian, type RawActivityRow } from "@/lib/nhat-ky/xep-dong-thoi-gian";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TRANG_MOI_LAN = 30;
// Lấy dư gấp ba trang hiển thị: bù cho các dòng sẽ bị GỘP (nhiều selection.patch
// dồn về một dòng) hay LỌC BỚT (chỉ giữ gallery.auth đầu tiên) trước khi cắt
// còn đúng TRANG_MOI_LAN dòng để trả về.
const GIOI_HAN_TRUY_VAN = TRANG_MOI_LAN * 3 + 1;

interface ActivityLogRow {
  id: string | number;
  created_at: string;
  actor_type: "staff" | "customer" | "system";
  actor_id: string | null;
  actor_label: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();

    const { id: galleryId } = await context.params;
    if (!galleryId || !UUID_REGEX.test(galleryId)) {
      return fail("INVALID_INPUT", "Mã bộ ảnh không hợp lệ");
    }

    const admin = createAdminClient();

    const { data: gallery, error: galleryError } = await admin
      .from("galleries")
      .select("id, branch_id")
      .eq("id", galleryId)
      .maybeSingle();

    if (galleryError) throw galleryError;
    if (!gallery) return fail("NOT_FOUND", "Không tìm thấy bộ ảnh");

    requireBranch(staff, gallery.branch_id);

    const url = new URL(request.url);
    const truoc = url.searchParams.get("truoc");

    let query = admin
      .from("activity_logs")
      .select("id, created_at, actor_type, actor_id, actor_label, action, metadata")
      .or(`gallery_id.eq.${galleryId},and(entity_type.eq.gallery,entity_id.eq.${galleryId})`)
      .order("created_at", { ascending: false })
      .limit(GIOI_HAN_TRUY_VAN);

    if (truoc) {
      const thoiDiem = new Date(truoc);
      if (Number.isNaN(thoiDiem.getTime())) return fail("INVALID_INPUT", "Tham số truoc không hợp lệ");
      query = query.lt("created_at", thoiDiem.toISOString());
    }

    const { data: rowsRaw, error } = await query;
    if (error) throw error;
    const rows = (rowsRaw ?? []) as ActivityLogRow[];

    // Tên nhân viên: tra full_name, actor_label chỉ là vai trò ("cs", "owner"…)
    // ở phần lớn route ghi trực tiếp, KHÔNG đọc được với chủ studio.
    const staffIds = Array.from(
      new Set(
        rows
          .filter((r) => r.actor_type === "staff" && r.actor_id)
          .map((r) => r.actor_id as string),
      ),
    );
    const staffMap = new Map<string, string>();
    if (staffIds.length > 0) {
      const { data: staffRows } = await admin
        .from("staff_profiles")
        .select("id, full_name")
        .in("id", staffIds);
      for (const s of staffRows ?? []) staffMap.set(s.id, s.full_name);
    }

    const raw: RawActivityRow[] = rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      actorType: r.actor_type,
      actorId: r.actor_id,
      actorLabel: r.actor_label,
      action: r.action,
      metadata: r.metadata ?? null,
      staffFullName:
        r.actor_type === "staff" && r.actor_id ? staffMap.get(r.actor_id) ?? null : null,
    }));

    const daXep = xepDongThoiGian(raw);
    const items = daXep.slice(0, TRANG_MOI_LAN);
    const conNuaTrongLoDaLay = daXep.length > TRANG_MOI_LAN;
    // Lô đã lấy đầy đúng giới hạn truy vấn: có thể còn dữ liệu cũ hơn chưa lấy.
    const coTheConNuaTrongDb = rows.length >= GIOI_HAN_TRUY_VAN;

    return ok(
      { items },
      {
        hasMore: conNuaTrongLoDaLay || coTheConNuaTrongDb,
        cursor: items.length > 0 ? items[items.length - 1]!.luc : undefined,
      },
    );
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
