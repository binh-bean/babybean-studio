/**
 * GET /api/admin/customers — danh sách khách hàng, tìm theo tên hoặc số điện thoại
 *
 * OWNER: DEV-BE. Task BB-061.
 *
 * Vì sao màn này cần tồn tại: CSKH nhận cuộc gọi "chị muốn hỏi ảnh của bé nhà
 * em", và thứ duy nhất họ có là **số điện thoại**. Trước màn này, đường duy
 * nhất để tra là mở danh sách bộ ảnh rồi gõ số vào ô tìm — tức phải biết trước
 * rằng khách ĐÃ có bộ ảnh. Khách gọi trước khi ảnh lên thì không tra được.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/** Một trang 50 dòng: đủ cho một lượt tra, và không kéo cả 447 khách về máy. */
const SO_DONG = 50;

interface DongKhach {
  id: string;
  full_name: string;
  phone: string | null;
  phone_normalized: string | null;
  branch_id: string;
  created_at: string;
}

export async function GET(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "customers:read");

    if (staff.branchIds.length === 0) return ok({ items: [], total: 0 });

    const url = new URL(request.url);
    const branchFilter = url.searchParams.get("branchId");
    const branchIds = branchFilter
      ? staff.branchIds.filter((b) => b === branchFilter)
      : staff.branchIds;
    if (branchIds.length === 0) return fail("FORBIDDEN", "Không có quyền xem chi nhánh này");

    const q = (url.searchParams.get("q") ?? "").trim();
    const admin = createAdminClient();

    let truyVan = admin
      .from("customers")
      .select("id, full_name, phone, phone_normalized, branch_id, created_at", {
        count: "exact",
      })
      .in("branch_id", branchIds)
      .order("created_at", { ascending: false })
      .limit(SO_DONG);

    if (q) {
      /**
       * Gõ số thì tìm theo số, gõ chữ thì tìm theo tên.
       *
       * Số điện thoại người ta đọc cho nhau kiểu "0938 125 568" hoặc
       * "(+84) 938125568" — nên so theo `phone_normalized` (chỉ còn chữ số) và
       * bỏ luôn số 0 hay +84 đứng đầu ở câu người dùng gõ.
       *
       * Điều kiện là câu gõ CHỈ gồm chữ số và dấu của số điện thoại, chứ không
       * phải "có đủ ba chữ số". Tên khách trong bảng có mã kiểu "BB-061" lẫn
       * trong đó; đếm chữ số thôi thì gõ tên cũng bị coi là gõ số, và kết quả
       * trả về một danh sách không liên quan mà không báo gì.
       */
      const chiSo = q.replace(/\D/g, "");
      const laSoDienThoai = /^[\d\s().+-]+$/.test(q) && chiSo.length >= 3;
      truyVan = laSoDienThoai
        ? truyVan.ilike("phone_normalized", `%${chiSo.replace(/^(84|0)/, "")}%`)
        : truyVan.ilike("full_name", `%${q}%`);
    }

    const { data, error, count } = await truyVan;
    if (error) throw error;

    const khach = (data ?? []) as DongKhach[];
    const ids = khach.map((k) => k.id);

    // Số bộ ảnh và ngày chụp gần nhất của từng khách — CSKH cần biết ngay
    // "nhà này đã chụp mấy lần" trước khi mở bộ ảnh.
    const { data: boAnh, error: loiBo } = ids.length
      ? await admin.from("galleries").select("id, customer_id, created_at").in("customer_id", ids)
      : { data: [], error: null };
    if (loiBo) throw loiBo;

    const demBo = new Map<string, { so: number; moiNhat: string | null }>();
    for (const g of boAnh ?? []) {
      const k = String(g.customer_id);
      const cu = demBo.get(k) ?? { so: 0, moiNhat: null };
      demBo.set(k, {
        so: cu.so + 1,
        moiNhat:
          !cu.moiNhat || String(g.created_at) > cu.moiNhat ? String(g.created_at) : cu.moiNhat,
      });
    }

    /**
     * Trùng số điện thoại GIỮA các chi nhánh.
     *
     * Trong một chi nhánh thì không thể trùng — `uq_customers_phone_branch`
     * chặn sẵn. Nhưng cùng một nhà đi chụp ở hai chi nhánh thì thành hai hồ sơ
     * khách, và CSKH gọi lại sẽ thấy hai kết quả mà không hiểu vì sao. Đánh dấu
     * ra thay vì để họ tự đoán.
     */
    const soDienThoai = khach.map((k) => k.phone_normalized).filter(Boolean) as string[];
    const { data: trung, error: loiTrung } = soDienThoai.length
      ? await admin
          .from("customers")
          .select("id, phone_normalized, branch_id")
          .in("phone_normalized", soDienThoai)
      : { data: [], error: null };
    if (loiTrung) throw loiTrung;

    const demSo = new Map<string, Set<string>>();
    for (const t of trung ?? []) {
      const k = String(t.phone_normalized);
      if (!demSo.has(k)) demSo.set(k, new Set());
      demSo.get(k)!.add(String(t.branch_id));
    }

    const { data: chiNhanh } = await admin.from("branches").select("id, name");
    const tenChiNhanh = new Map((chiNhanh ?? []).map((b) => [String(b.id), String(b.name)]));

    return ok({
      total: count ?? khach.length,
      items: khach.map((k) => {
        const bo = demBo.get(k.id);
        return {
          id: k.id,
          fullName: k.full_name,
          phone: k.phone,
          branchId: k.branch_id,
          branchName: tenChiNhanh.get(String(k.branch_id)) ?? "—",
          soBoAnh: bo?.so ?? 0,
          boAnhMoiNhat: bo?.moiNhat ?? null,
          trungSdtChiNhanhKhac: (demSo.get(String(k.phone_normalized))?.size ?? 0) > 1,
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
