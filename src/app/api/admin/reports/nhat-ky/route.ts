import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const BLOCKED_ROLES = ["photoshop_ctv"];

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();

  try {
    const staff = await requireStaff();
    if (BLOCKED_ROLES.includes(staff.role)) {
      return fail("FORBIDDEN", "Vai trò này không xem được nhật ký thao tác");
    }
    if (staff.branchIds.length === 0) {
      return ok({ items: [], total: 0 });
    }

    const url = new URL(request.url);
    const branchFilter = url.searchParams.get("branchId");
    const branchIds = branchFilter
      ? staff.branchIds.filter((b) => b === branchFilter)
      : staff.branchIds;
    
    if (branchIds.length === 0) return fail("FORBIDDEN", "Không có quyền xem chi nhánh này");

    const actorType = url.searchParams.get("actorType") || "staff"; // Mặc định là nhân viên
    const actorId = url.searchParams.get("actorId");
    const action = url.searchParams.get("action");
    const tuNgay = url.searchParams.get("tuNgay");
    const denNgay = url.searchParams.get("denNgay");

    const admin = createAdminClient();

    let query = admin
      .from("activity_logs")
      .select("id, created_at, actor_type, actor_id, actor_label, action, entity_type, entity_id, metadata", { count: "exact" })
      .in("branch_id", branchIds)
      .order("created_at", { ascending: false })
      .limit(200);

    if (actorType !== "all") {
      query = query.eq("actor_type", actorType);
    }
    if (actorId) {
      query = query.eq("actor_id", actorId);
    }
    if (action) {
      query = query.eq("action", action);
    }
    if (tuNgay) {
      query = query.gte("created_at", tuNgay);
    }
    if (denNgay) {
      query = query.lte("created_at", denNgay);
    }

    const { data: rows, error, count } = await query;
    if (error) throw error;

    // Fetch staff names to map actor_id when actor_type is 'staff'
    const { data: staffData } = await admin
      .from("staff_profiles")
      .select("id, full_name, status");
    const staffMap = new Map(staffData?.map(s => [s.id, s]) || []);

    type Row = {
      id: string;
      created_at: string;
      actor_type: string;
      actor_id: string | null;
      actor_label: string | null;
      action: string;
      entity_type: string | null;
      entity_id: string | null;
      metadata: Record<string, unknown>;
    };

    const items = ((rows ?? []) as unknown as Row[]).map((r) => {
      let displayName = r.actor_label; // Khách hoặc system thì giữ nguyên
      let isInactive = false;
      
      if (r.actor_type === "staff" && r.actor_id) {
        const staffProf = staffMap.get(r.actor_id);
        if (staffProf) {
          displayName = staffProf.full_name;
          isInactive = staffProf.status === "inactive";
        } else {
          // Trường hợp staff_profile đã bị xóa hẳn (không nên có theo rule)
          displayName = "(không rõ)";
          isInactive = true;
        }
      }

      return {
        id: r.id,
        createdAt: r.created_at,
        actorType: r.actor_type,
        actorId: r.actor_id,
        actorLabel: r.actor_label,
        actorName: displayName,
        isInactive,
        action: r.action,
        entityType: r.entity_type,
        entityId: r.entity_id,
        metadata: r.metadata,
      };
    });

    return ok({ items, total: count || 0 });
  } catch (err) {
    return failUnexpected(err, requestId);
  }
}
