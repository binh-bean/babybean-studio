/**
 * GET /api/admin/customers/:id/lich-su — dữ liệu trang chi tiết khách
 * (/admin/customers/[id]), mở đường cho CRM.
 *
 * OWNER: DEV-BE. Task BB-337 mục 3.
 *
 * Chỉ ĐỌC. Trả:
 *   · lịch sử chụp: mỗi bộ ảnh (ngày chụp, chi nhánh, trạng thái theo `trangThaiBoAnh()`
 *     BB-332, link app: tình trạng + 6 ký tự đầu — địa chỉ đầy đủ chỉ ở chi tiết bộ ảnh,
 *     nơi đã kiểm quyền `galleries:share`);
 *   · lịch sử mua: món mua thêm (`selection_addons` của lượt chọn chính đã chốt) + sổ thu
 *     (`gallery_payments`, tách dòng giảm giá);
 *   · tổng giá trị đã mua (mua thêm + đã thu, xem `tong-gia-tri.ts`) + tổng đã thu;
 *   · số lượt ghé trong năm nay (theo ngày chụp) và ở những chi nhánh nào.
 *
 * Phạm vi chi nhánh: giống GET /api/admin/customers/:id — chỉ bộ ảnh ở chi nhánh
 * người xem được phép (superuser thấy hết).
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected } from "@/lib/api-response";
import { requireStaff, requirePermission, requireBranch, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { trangThaiBoAnh } from "@/lib/lark/trang-thai-app-lark";
import { tomTatLuotGhe } from "@/lib/khach-hang/luot-ghe";
import { tinhTongKhach } from "@/lib/khach-hang/tong-gia-tri";

export const runtime = "nodejs";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type MotHoacMang<T> = T | T[] | null;
const mot = <T,>(v: MotHoacMang<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "customers:read");

    const { id } = await context.params;
    if (!UUID_REGEX.test(id)) return fail("INVALID_INPUT", "Mã khách không hợp lệ");
    const admin = createAdminClient();

    const { data: khach, error } = await admin
      .from("customers")
      .select("id, branch_id, full_name, phone, facebook, created_at, lark_customer_key")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!khach) return fail("NOT_FOUND", "Không tìm thấy khách hàng");
    requireBranch(staff, String(khach.branch_id));

    const thayHet = staff.permissions.includes("system:superuser");
    let qBo = admin
      .from("galleries")
      .select(
        "id, title, status, branch_id, created_at, submitted_at, photo_count, lark_contract_codes, " +
          "lark_trang_thai, lark_trang_thai_tu, reopened_at, lark_hauky_record_id, drive_folder_url, " +
          "branches(name), shoots(shoot_date, concept)",
      )
      .eq("customer_id", id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (!thayHet) qBo = qBo.in("branch_id", staff.branchIds);
    const { data: boTho, error: loiBo } = await qBo;
    if (loiBo) throw loiBo;

    type Bo = {
      id: string;
      title: string;
      status: string;
      branch_id: string;
      created_at: string;
      submitted_at: string | null;
      photo_count: number | null;
      lark_contract_codes: string[] | null;
      lark_trang_thai: string | null;
      lark_trang_thai_tu: string | null;
      reopened_at: string | null;
      lark_hauky_record_id: string | null;
      drive_folder_url: string | null;
      branches: MotHoacMang<{ name: string }>;
      shoots: MotHoacMang<{ shoot_date: string | null; concept: string | null }>;
    };
    const bo = (boTho ?? []) as unknown as Bo[];
    const ids = bo.map((g) => g.id);

    const [linkRes, selRes, payRes] = await Promise.all([
      ids.length
        ? admin
            .from("share_links")
            .select("gallery_id, status, token_prefix, expires_at, revoked_at, created_at, view_count, role")
            .in("gallery_id", ids)
            .eq("role", "owner")
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? admin
            .from("selections")
            .select("id, gallery_id, submitted_at")
            .in("gallery_id", ids)
            .eq("is_primary", true)
            .not("submitted_at", "is", null)
        : Promise.resolve({ data: [], error: null }),
      ids.length
        ? admin
            .from("gallery_payments")
            .select("id, gallery_id, amount, payment_method, note, confirmed_at")
            .in("gallery_id", ids)
            .order("confirmed_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (linkRes.error) throw linkRes.error;
    if (selRes.error) throw selRes.error;
    if (payRes.error) throw payRes.error;

    // Link mới nhất của mỗi bộ (đã sắp giảm dần).
    type Link = { gallery_id: string; status: string; token_prefix: string; expires_at: string | null; revoked_at: string | null; view_count: number };
    const linkTheoBo = new Map<string, Link>();
    for (const l of (linkRes.data ?? []) as Link[]) if (!linkTheoBo.has(l.gallery_id)) linkTheoBo.set(l.gallery_id, l);

    const sel = (selRes.data ?? []) as { id: string; gallery_id: string; submitted_at: string }[];
    const boCuaSel = new Map(sel.map((s) => [s.id, s]));
    const { data: addonTho, error: loiAddon } = sel.length
      ? await admin
          .from("selection_addons")
          .select("id, selection_id, quantity, unit_price, products(name)")
          .in("selection_id", sel.map((s) => s.id))
      : { data: [], error: null };
    if (loiAddon) throw loiAddon;

    const tenBo = new Map(bo.map((g) => [g.id, g.title]));
    const muaThem = ((addonTho ?? []) as unknown as {
      id: string;
      selection_id: string;
      quantity: number;
      unit_price: number | string;
      products: MotHoacMang<{ name: string }>;
    }[]).map((a) => {
      const s = boCuaSel.get(a.selection_id);
      const soLuong = Number(a.quantity);
      const donGia = Number(a.unit_price);
      return {
        id: a.id,
        galleryId: s?.gallery_id ?? null,
        galleryTitle: s ? (tenBo.get(s.gallery_id) ?? null) : null,
        ten: mot(a.products)?.name ?? "Sản phẩm",
        soLuong,
        thanhTien: soLuong * donGia,
        ngay: s?.submitted_at ?? null,
      };
    });

    const thanhToan = ((payRes.data ?? []) as {
      id: string;
      gallery_id: string;
      amount: number | string;
      payment_method: string;
      note: string | null;
      confirmed_at: string;
    }[]).map((p) => ({
      id: p.id,
      galleryId: p.gallery_id,
      galleryTitle: tenBo.get(p.gallery_id) ?? null,
      soTien: Number(p.amount),
      hinhThuc: p.payment_method,
      laGiamGia: p.payment_method === "giam_gia",
      ghiChu: p.note,
      ngay: p.confirmed_at,
    }));

    const tong = tinhTongKhach(muaThem, thanhToan);

    const lichSuChup = bo.map((g) => {
      const tt = trangThaiBoAnh({
        status: g.status,
        larkTrangThai: g.lark_trang_thai,
        larkTrangThaiTu: g.lark_trang_thai_tu,
        reopenedAt: g.reopened_at,
        coBanGhiLark: !!g.lark_hauky_record_id,
        coDriveLink: !!g.drive_folder_url,
        coLinkApp: linkTheoBo.get(g.id)?.status === "active",
      });
      const l = linkTheoBo.get(g.id);
      const shoot = mot(g.shoots);
      return {
        id: g.id,
        title: g.title,
        concept: shoot?.concept ?? null,
        ngayChup: shoot?.shoot_date ?? null,
        branchName: mot(g.branches)?.name ?? "—",
        trangThai: tt.quanTri,
        soAnh: g.photo_count ?? 0,
        maHopDong: g.lark_contract_codes ?? [],
        linkApp: l
          ? { tinhTrang: l.revoked_at ? "da_thu_hoi" : l.status, maDau: l.token_prefix, luotMo: l.view_count, hetHan: l.expires_at }
          : null,
      };
    });

    const namNay = new Date().getFullYear();
    const luotGhe = tomTatLuotGhe(
      lichSuChup.map((g) => ({ ngayChup: g.ngayChup, branchName: g.branchName })),
      namNay,
    );

    return ok({
      khach: {
        id: khach.id,
        fullName: khach.full_name,
        phone: khach.phone,
        chatUrl: khach.facebook,
        createdAt: khach.created_at,
        tuLark: khach.lark_customer_key !== null,
      },
      lichSuChup,
      muaThem,
      thanhToan,
      tong,
      luotGhe,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
