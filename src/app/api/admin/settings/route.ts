/**
 * GET   /api/admin/settings — đọc những cài đặt sửa được
 * PATCH /api/admin/settings — sửa một hoặc nhiều cài đặt
 *
 * OWNER: DEV-BE. Task BB-197.
 *
 * Trước hôm nay, mười một dòng trong bảng `settings` điều khiển app thật —
 * hạn chốt, ngày nhắc khách, hạn link, watermark, cho tải, link Messenger,
 * webhook Lark — mà **không màn nào sửa được dòng nào**. Muốn đổi "nhắc ngày 3
 * và 6" thành ngày 2 và 5 thì phải có người gõ SQL thẳng vào cơ sở dữ liệu.
 */

import { randomUUID } from "node:crypto";
import { ok, fail, failUnexpected, readJsonBody } from "@/lib/api-response";
import { requireStaff, requirePermission, AuthError } from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";
import { CAI_DAT_SUA_DUOC, PatchSettingsSchema, cheBot, kieuCaiDat, timDinhNghia } from "./schema";
import { KHOA_THU_SAN_PHAM_QUA_APP, KHOA_THU_SAN_PHAM_QUA_APP_TU, laBatThuSanPhamQuaApp } from "@/lib/gallery/tien-phat-sinh";
import { KHOA_BAT_LAM_NHANH, KHOA_SAN_PHAM_LAM_NHANH, cauTrangThaiSanPhamLamNhanh, chuanHoaGhim } from "@/lib/dich-vu/lam-anh-nhanh";
import { timSanPhamLamNhanh } from "@/lib/dich-vu/lam-anh-nhanh-server";

export const runtime = "nodejs";


export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "settings:system");

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("settings")
      .select("key, value")
      .is("branch_id", null)
      .in(
        "key",
        CAI_DAT_SUA_DUOC.map((c) => c.key),
      );
    // Đọc hụt thì nói ra. Trả danh sách rỗng ở đây là vẽ ra một màn Cài đặt
    // trắng trơn, và người dùng tưởng studio chưa cấu hình gì.
    if (error) throw error;

    const dangCo = new Map((data ?? []).map((d) => [d.key, d.value]));

    const items = CAI_DAT_SUA_DUOC.map((c) => {
      // BB-399 vòng 3 — công tắc làm nhanh mặc định BẬT: thiếu dòng thì hiện "Đang bật", đúng như app chạy.
      const giaTri = dangCo.get(c.key) ?? (c.key === KHOA_BAT_LAM_NHANH ? true : null);
      return {
        key: c.key,
        nhom: c.nhom,
        kieu: kieuCaiDat(c),
        biMat: Boolean(c.biMat),
        // Giá trị bí mật KHÔNG đi ra khỏi máy chủ nguyên vẹn: màn hình chỉ cần
        // biết "đã có cấu hình chưa", không cần biết webhook là chuỗi gì.
        value: c.biMat ? cheBot(giaTri) : giaTri,
        daCauHinh: giaTri !== null && giaTri !== "",
      };
    });

    // BB-399 vòng 2 — dòng trạng thái chỉ đọc cạnh ô record id "Làm ảnh nhanh": sản phẩm app
    // đang dùng (ghim, không thì theo tên). Tra hỏng thì không có dòng — không chặn màn Cài đặt.
    const ghim = chuanHoaGhim(dangCo.get(KHOA_SAN_PHAM_LAM_NHANH) ?? null);
    const spNhanh = await timSanPhamLamNhanh(admin, ghim).then(
      (sp) => ({ ok: true as const, sp }),
      () => ({ ok: false as const, sp: null }),
    );
    const itemsCoTrangThai = items.map((it) =>
      it.key === KHOA_SAN_PHAM_LAM_NHANH && spNhanh.ok ? { ...it, trangThai: cauTrangThaiSanPhamLamNhanh(spNhanh.sp) } : it,
    );

    return ok({ items: itemsCoTrangThai });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  const requestId = randomUUID();
  try {
    const staff = await requireStaff();
    requirePermission(staff, "settings:system");

    const body = await readJsonBody(request);
    if (!body.ok) return fail("INVALID_INPUT");
    const parsed = PatchSettingsSchema.safeParse(body.data);
    if (!parsed.success) {
      return fail("INVALID_INPUT", undefined, { issues: parsed.error.issues });
    }

    const admin = createAdminClient();

    // Đọc giá trị CŨ trước khi ghi: nhật ký phải kể được "từ gì sang gì".
    // Ghi mỗi giá trị mới thì lúc có tranh cãi không ai dựng lại được chuyện.
    const { data: truoc, error: loiDoc } = await admin
      .from("settings")
      .select("key, value")
      .is("branch_id", null)
      .in(
        "key",
        parsed.data.thayDoi.map((t) => t.key),
      );
    if (loiDoc) throw loiDoc;
    const giaTriCu = new Map((truoc ?? []).map((d) => [d.key, d.value]));

    const daGhi: { key: string; cu: unknown; moi: unknown }[] = [];
    /** BB-363 — mốc hiệu lực vừa ghi (khi cờ thu sản phẩm qua app vừa được bật). */
    let moCoSanPham: string | null = null;

    for (const thay of parsed.data.thayDoi) {
      const dinhNghia = timDinhNghia(thay.key);
      if (!dinhNghia) return fail("INVALID_INPUT", `Khoá ${thay.key} không sửa được`);

      const kiem = dinhNghia.schema.safeParse(thay.value);
      if (!kiem.success) {
        return fail("INVALID_INPUT", `Giá trị của ${thay.key} không hợp lệ`, {
          key: thay.key,
          issues: kiem.error.issues,
        });
      }

      const cu = giaTriCu.get(thay.key) ?? null;
      const moi = kiem.data;
      if (JSON.stringify(cu) === JSON.stringify(moi)) continue;

      // KHÔNG dùng `upsert`: chỉ mục duy nhất của bảng này là
      // `(key, coalesce(branch_id, '000…'))` — một chỉ mục theo BIỂU THỨC, mà
      // `onConflict: "key,branch_id"` thì không khớp được với nó. Nên sửa
      // trước, không trúng dòng nào thì mới chèn.
      //
      // Nhánh chèn không thừa: trên một môi trường dựng sau, khoá có thể chưa
      // tồn tại — đúng chuyện đã xảy ra với `chat.page_url` ở bb-prod.
      const { data: daSua, error: loiGhi } = await admin
        .from("settings")
        .update({ value: moi })
        .eq("key", thay.key)
        .is("branch_id", null)
        .select("id");
      if (loiGhi) throw loiGhi;

      if (!daSua || daSua.length === 0) {
        const { error: loiChen } = await admin
          .from("settings")
          .insert({ key: thay.key, branch_id: null, value: moi });
        if (loiChen) throw loiChen;
      }

      daGhi.push({ key: thay.key, cu, moi });

      // BB-363 (anh chốt 02/10/2026): cờ thu sản phẩm qua app KHÔNG hồi tố. Lúc chuyển từ
      // tắt sang BẬT, máy chủ ghi mốc hiệu lực = bây giờ; chỉ giỏ chốt từ mốc này mới thu qua
      // app (`sanPhamThuTrongApp`). Khoá mốc không nằm trong CAI_DAT_SUA_DUOC — không ai sửa
      // tay được. Tắt cờ thì giữ mốc cũ (vô hiệu khi cờ tắt); bật lại thì mốc MỚI.
      if (thay.key === KHOA_THU_SAN_PHAM_QUA_APP && laBatThuSanPhamQuaApp(moi) && !laBatThuSanPhamQuaApp(cu)) {
        const tu = new Date().toISOString();
        const { data: suaMoc, error: loiMoc } = await admin
          .from("settings")
          .update({ value: tu })
          .eq("key", KHOA_THU_SAN_PHAM_QUA_APP_TU)
          .is("branch_id", null)
          .select("id");
        if (loiMoc) throw loiMoc;
        if (!suaMoc || suaMoc.length === 0) {
          const { error: loiChenMoc } = await admin
            .from("settings")
            .insert({ key: KHOA_THU_SAN_PHAM_QUA_APP_TU, branch_id: null, value: tu });
          if (loiChenMoc) throw loiChenMoc;
        }
        moCoSanPham = tu;
      }
    }

    if (daGhi.length > 0) {
      const { error: loiNhatKy } = await admin.from("activity_logs").insert(
        daGhi.map((g) => ({
          actor_type: "staff",
          actor_id: staff.staffId,
          action: "settings.update",
          entity_type: "settings",
          metadata: {
            key: g.key,
            // Giá trị bí mật không được nằm trong nhật ký — nhật ký nhiều người
            // đọc hơn bảng settings.
            cu: timDinhNghia(g.key)?.biMat ? "(đã che)" : g.cu,
            moi: timDinhNghia(g.key)?.biMat ? "(đã che)" : g.moi,
          },
        })),
      );
      // Ghi nhật ký hụt thì kêu, nhưng không chặn: cài đặt đã đổi thật rồi,
      // ném ở đây là báo cho người dùng một lỗi sai sự thật.
      if (loiNhatKy) console.error("[settings] ghi activity_logs hụt:", loiNhatKy);
    }
    if (moCoSanPham) {
      // Nhật ký riêng, tên chứa "thanh_toan" → bộ dọn KHÔNG BAO GIỜ xoá (NHAT_KY_LUON_GIU).
      const { error: loiNhatKyMoc } = await admin.from("activity_logs").insert({
        actor_type: "staff",
        actor_id: staff.staffId,
        action: "thanh_toan.bat_thu_san_pham_qua_app",
        entity_type: "settings",
        metadata: { key: KHOA_THU_SAN_PHAM_QUA_APP_TU, tu: moCoSanPham },
      });
      if (loiNhatKyMoc) console.error("[settings] ghi nhật ký mốc hụt:", loiNhatKyMoc);
    }

    return ok({ daDoi: daGhi.map((g) => g.key), ...(moCoSanPham ? { thuSanPhamQuaAppTu: moCoSanPham } : {}) });
  } catch (err) {
    if (err instanceof AuthError) {
      return fail(err.code, err.code === "UNAUTHENTICATED" ? "Vui lòng đăng nhập lại" : undefined);
    }
    return failUnexpected(err, requestId);
  }
}
