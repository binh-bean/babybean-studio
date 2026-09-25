/**
 * GET / PATCH /api/admin/customers/:id — hồ sơ một khách: bé, lịch sử chụp,
 * và hồ sơ trùng số điện thoại ở chi nhánh khác.
 *
 * OWNER: DEV-BE. Task BB-061.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { UpdateCustomerSchema } from "../schema";

export const runtime = "nodejs";

/** Chỉ giữ chữ số — đúng cách cột generated `phone_normalized` được tính. */
function chuanHoaSo(phone: string | null): string | null {
  if (!phone) return null;
  const so = phone.replace(/\D/g, "");
  return so === "" ? null : so;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "customers:read");

    const { id } = await context.params;
    const admin = createAdminClient();

    const { data: khach, error } = await admin
      .from("customers")
      .select(
        "id, branch_id, full_name, phone, phone_normalized, email, zalo, facebook, address, note, source, created_at, lark_customer_key",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!khach) return fail("NOT_FOUND", "Không tìm thấy khách hàng");

    // Khách thuộc chi nhánh nào thì chỉ người của chi nhánh đó mở được.
    requireBranch(staff, String(khach.branch_id));

    const { data: be, error: loiBe } = await admin
      .from("babies")
      .select("id, full_name, nickname, birth_date, gender, note")
      .eq("customer_id", id)
      .order("birth_date", { ascending: true, nullsFirst: false });
    if (loiBe) throw loiBe;

    /**
     * Lịch sử chụp chỉ gồm bộ ảnh Ở CHI NHÁNH NGƯỜI XEM ĐƯỢC PHÉP THẤY.
     *
     * Khách thuộc chi nhánh A vẫn có thể đi chụp ở chi nhánh B — `galleries`
     * mang `branch_id` riêng (docs/03 mục 2.2). Lấy hết theo `customer_id` là
     * đường vòng để nhân viên một chi nhánh đọc dữ liệu chi nhánh khác.
     */
    const thayHet = staff.permissions.includes("system:superuser");
    let truyVanBo = admin
      .from("galleries")
      .select(
        "id, title, status, branch_id, created_at, submitted_at, photo_count, included_quota, lark_contract_codes",
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (!thayHet) truyVanBo = truyVanBo.in("branch_id", staff.branchIds);

    const { data: boAnh, error: loiBo } = await truyVanBo;
    if (loiBo) throw loiBo;

    /**
     * Hồ sơ trùng số ở chi nhánh khác.
     *
     * `uq_customers_phone_branch` chỉ chặn trùng TRONG một chi nhánh, nên cùng
     * một nhà đi chụp hai nơi là hai hồ sơ. CSKH cần biết để không sửa một bên
     * rồi tưởng đã xong. Tên và số của hồ sơ bên kia chỉ hiện khi người xem có
     * quyền ở chi nhánh đó — còn lại chỉ nói "có hồ sơ ở chi nhánh X".
     */
    const so = khach.phone_normalized ? String(khach.phone_normalized) : null;
    const { data: trung } = so
      ? await admin
          .from("customers")
          .select("id, full_name, phone, branch_id")
          .eq("phone_normalized", so)
          .neq("id", id)
      : { data: [] };

    const { data: chiNhanh } = await admin.from("branches").select("id, name");
    const tenChiNhanh = new Map((chiNhanh ?? []).map((b) => [String(b.id), String(b.name)]));

    return ok({
      khach: {
        id: khach.id,
        fullName: khach.full_name,
        phone: khach.phone,
        email: khach.email,
        zalo: khach.zalo,
        facebook: khach.facebook,
        address: khach.address,
        note: khach.note,
        source: khach.source,
        branchId: khach.branch_id,
        branchName: tenChiNhanh.get(String(khach.branch_id)) ?? "—",
        createdAt: khach.created_at,
        tuLark: khach.lark_customer_key !== null,
        /**
         * Sửa ở đây rồi bị đồng bộ ghi đè lại là bẫy có thật.
         *
         * Cả hai đường đồng bộ Lark đều ghi đè VÔ ĐIỀU KIỆN `full_name`
         * (scripts/sync-lark-hauky.mjs: `full_name = excluded.full_name`,
         * src/lib/lark/sync-retouch.ts: `full_name = $2`), `note` theo bản
         * Lark, và ghi đè `phone` khi bên Lark có số. Nên màn hình phải nói
         * trước: những ô này sửa bên Lark mới giữ được.
         */
        truongBiGhiDe:
          khach.lark_customer_key !== null ? ["fullName", "phone", "note"] : [],
      },
      be: (be ?? []).map((b) => ({
        id: b.id,
        fullName: b.full_name,
        nickname: b.nickname,
        birthDate: b.birth_date,
        gender: b.gender,
        note: b.note,
      })),
      boAnh: (boAnh ?? []).map((g) => ({
        id: g.id,
        title: g.title,
        status: g.status,
        branchName: tenChiNhanh.get(String(g.branch_id)) ?? "—",
        createdAt: g.created_at,
        submittedAt: g.submitted_at,
        photoCount: g.photo_count,
        includedQuota: g.included_quota,
        contractCodes: g.lark_contract_codes ?? [],
      })),
      trungSdt: (trung ?? []).map((t) => {
        const xemDuoc = thayHet || staff.branchIds.includes(String(t.branch_id));
        return {
          id: xemDuoc ? t.id : null,
          branchName: tenChiNhanh.get(String(t.branch_id)) ?? "—",
          fullName: xemDuoc ? t.full_name : null,
          phone: xemDuoc ? t.phone : null,
        };
      }),
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "customers:write");

    const { id } = await context.params;
    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = UpdateCustomerSchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", parsed.error.issues[0]?.message, {
        issues: parsed.error.issues,
      });
    }
    const input = parsed.data;
    const admin = createAdminClient();

    const { data: hienTai } = await admin
      .from("customers")
      .select("id, branch_id, full_name, phone, lark_customer_key")
      .eq("id", id)
      .maybeSingle();
    if (!hienTai) return fail("NOT_FOUND", "Không tìm thấy khách hàng");
    requireBranch(staff, String(hienTai.branch_id));

    /**
     * Chống trùng số TRƯỚC khi ghi, để trả câu tiếng Việt thay vì lỗi Postgres.
     *
     * `uq_customers_phone_branch` vẫn là chốt chặn thật — nếu hai người sửa
     * cùng lúc thì câu update vẫn bị cơ sở dữ liệu từ chối, và nhánh 23505 bên
     * dưới dịch lỗi đó ra tiếng Việt.
     *
     * Kiểm ngược ngày 22/09/2026: tắt đoạn này đi thì phép thử 8 VẪN xanh —
     * đường 23505 chạy đúng. Nên phần thêm của đoạn này chỉ là câu báo nói rõ
     * số đó đang thuộc hồ sơ NÀO, chứ không phải lớp chặn.
     */
    if (input.phone !== undefined) {
      const soMoi = chuanHoaSo(input.phone);
      if (soMoi) {
        const { data: daCo } = await admin
          .from("customers")
          .select("id, full_name")
          .eq("branch_id", hienTai.branch_id)
          .eq("phone_normalized", soMoi)
          .neq("id", id)
          .maybeSingle();
        if (daCo) {
          return fail(
            "CONFLICT",
            `Số này đã thuộc hồ sơ "${daCo.full_name}" trong cùng chi nhánh`,
            { customerId: daCo.id },
          );
        }
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.fullName !== undefined) patch.full_name = input.fullName;
    if (input.phone !== undefined) patch.phone = input.phone === "" ? null : input.phone;
    if (input.email !== undefined) patch.email = input.email;
    if (input.zalo !== undefined) patch.zalo = input.zalo;
    if (input.address !== undefined) patch.address = input.address;
    if (input.note !== undefined) patch.note = input.note;

    const { error } = await admin.from("customers").update(patch).eq("id", id);
    if (error) {
      if (String((error as { code?: string }).code) === "23505") {
        return fail("CONFLICT", "Số điện thoại này đã có hồ sơ khác trong cùng chi nhánh");
      }
      throw error;
    }

    const { error: logErr } = await admin.from("activity_logs").insert({
      actor_type: "staff",
      actor_id: staff.staffId,
      branch_id: hienTai.branch_id,
      action: "customer.update",
      entity_type: "customer",
      entity_id: id,
      // Không ghi giá trị cũ/mới của tên và số vào nhật ký: nhật ký đọc được
      // bởi nhiều vai hơn danh sách khách (docs/12).
      metadata: { fields: Object.keys(input), tuLark: hienTai.lark_customer_key !== null },
    });
    if (logErr) console.error("[activity_logs] Ghi hụt:", logErr);

    return ok({ id, updated: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
