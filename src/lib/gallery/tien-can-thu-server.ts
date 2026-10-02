/**
 * BB-344 — đọc số TIỀN CÒN PHẢI THU của một bộ ảnh (phía máy chủ). Một nguồn cho
 * `GET /api/admin/galleries/[id]/items` (khối "Xác nhận thanh toán" bấm được hay
 * không) và `POST /api/admin/galleries/[id]/payments` (có nhận dòng tiền không).
 *
 * Công thức thuần ở `tienCanThuCuaBo` (tien-phat-sinh.ts); tệp này chỉ gom nguyên
 * liệu từ cơ sở dữ liệu, cùng các nguồn mà báo cáo `over-quota` đọc:
 *   · số lúc khách chốt  = `selections.snapshot_extra_amount` (lượt chọn chính);
 *   · số theo ảnh        = `v_over_quota_unbilled.unbilled_amount` (không có dòng = 0);
 *   · đã ghi có          = tổng `gallery_payments.amount` (thu + giảm giá);
 *   · đợt mua thêm       = `selection_rounds` đợt ≥ 2 đang `da_xac_nhan`;
 *   · BB-359: sản phẩm mua thêm ở đợt 1 = `selection_addons` (dot 1) của lượt chọn chính đã chốt;
 *   · BB-360: tách TIỀN ẢNH (luôn thu qua app) khỏi TIỀN SẢN PHẨM (ảnh in / khung / album —
 *     chỉ vào "Phải thu" khi cài đặt `thanh_toan.thu_san_pham_qua_app` bật; mặc định tắt,
 *     thu qua Lark). "Edit file" (`products.kind = 'edited_photo'`) là tiền ẢNH.
 *   · BB-363: cờ KHÔNG hồi tố — chỉ giỏ chốt từ mốc bật cờ (`thanh_toan.thu_san_pham_qua_app_tu`)
 *     mới vào "Phải thu" (đợt 1 theo lúc chốt lượt chọn chính, đợt ≥ 2 theo lúc gửi đợt).
 *   · BB-348: dòng hạn mức do thanh toán (`han-muc-thanh-toan.ts`) — cộng lại giá trị
 *     của chúng để tăng hạn mức không làm số tiền bị trừ hai lần.
 * Chưa áp migration 0077 (không có bảng đợt) thì đợt mua thêm = 0, không hỏng.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KHOA_THU_SAN_PHAM_QUA_APP,
  KHOA_THU_SAN_PHAM_QUA_APP_TU,
  docMocThuSanPhamQuaApp,
  laBatThuSanPhamQuaApp,
  sanPhamThuTrongApp,
  tienCanThuCuaBo,
  tienSanPhamTinhVaoPhaiThu,
  tienVuotHanMucConPhaiThu,
  tongPhaiThuCuaBo,
} from "@/lib/gallery/tien-phat-sinh";
import { laLoiChuaApMigration } from "@/lib/gallery/dot-chon-server";
import { layDongThanhToanTheoBo, tinhTienQuyDoi } from "@/lib/gallery/han-muc-thanh-toan";

export interface TienCanThuBo {
  /** Số còn phải thu — 0 nghĩa là chưa phát sinh (hoặc đã thu đủ): khối thanh toán không bấm được. */
  tienCanThu: number;
  /**
   * BB-351 — TỔNG PHẢI THU của bộ (chưa trừ khoản ghi có) = phần vượt hạn mức (số lúc chốt
   * MỚI NHẤT + hạn mức đã quy đổi trước lần chốt đó; chưa chốt thì số theo ảnh + mọi quy đổi)
   * + các đợt mua thêm đã xác nhận. Đây là "Phải thu" duy nhất trên mọi màn hình; trước đây
   * màn chi tiết và phản hồi /payments lấy riêng `snapshot_extra_amount` nên sau mở lại/đợt 2
   * báo "khách trả DƯ" sai.
   */
  tongPhaiThu: number;
  /** BB-351 — `tongPhaiThu − daGhiCo`, CÓ DẤU: âm = khách thật sự trả dư. `tienCanThu = max(0, conThieu)`. */
  conThieu: number;
  tienLucChot: number;
  tienTheoAnh: number;
  /** BB-360 — TIỀN ẢNH của phần mua thêm: đợt ≥ 2 `tien_anh` + "Edit file" (mọi đợt). Luôn thu qua app. */
  tienDotMuaThem: number;
  /** BB-360 — TIỀN SẢN PHẨM (ảnh in / khung / album), đợt 1 đã chốt + đợt ≥ 2 đã xác nhận. */
  tienSanPham: number;
  /** BB-360 — cài đặt `thanh_toan.thu_san_pham_qua_app` (mặc định false). */
  thuSanPhamQuaApp: boolean;
  /** BB-363 — mốc hiệu lực của cờ (ISO) — chỉ giỏ chốt từ mốc này mới thu sản phẩm qua app. */
  thuSanPhamQuaAppTu: string | null;
  /** BB-360 — phần sản phẩm thu qua Lark, KHÔNG nằm trong tongPhaiThu (0 khi cờ bật). */
  tienSanPhamQuaLark: number;
  daGhiCo: number;
  /** BB-348 — số ảnh vượt CHƯA thu theo hạn mức hiện tại (`v_over_quota_unbilled.unbilled_count`). */
  anhVuotChuaThu: number;
  /** BB-348 — tổng số ảnh hạn mức đã tăng do thanh toán. */
  soAnhQuyDoi: number;
  /** BB-348 — phần VƯỢT HẠN MỨC còn phải thu (không kể đợt mua thêm), sau mọi khoản ghi có. */
  conThieuVuot: number;
  /** BB-348 — giá một ảnh vượt: theo lúc chốt khi có, không thì giá ảnh thêm hiện tại. */
  giaMotAnh: number;
}

export async function layTienCanThu(admin: SupabaseClient, galleryId: string): Promise<TienCanThuBo> {
  const kq = await layTienCanThuNhieuBo(admin, [galleryId]);
  return kq.get(galleryId) as TienCanThuBo;
}

/**
 * BB-351 — cùng công thức cho NHIỀU bộ một lượt (báo cáo "Ảnh vượt hạn mức", tab "Khách gửi
 * ảnh chọn"): mỗi nguồn một câu `in (...)`, không gọi từng bộ.
 */
export async function layTienCanThuNhieuBo(
  admin: SupabaseClient,
  galleryIds: string[],
): Promise<Map<string, TienCanThuBo>> {
  const ids = [...new Set(galleryIds)];
  const ketQua = new Map<string, TienCanThuBo>();
  if (ids.length === 0) return ketQua;
  const [sel, pay, theoAnh, dot, bo, dongTT, caiDat] = await Promise.all([
    admin
      .from("selections")
      .select("id, gallery_id, snapshot_extra_amount, snapshot_extra_count, submitted_at")
      .in("gallery_id", ids)
      .eq("is_primary", true),
    admin.from("gallery_payments").select("gallery_id, amount").in("gallery_id", ids),
    admin.from("v_over_quota_unbilled").select("gallery_id, unbilled_amount, unbilled_count").in("gallery_id", ids),
    admin
      .from("selection_rounds")
      .select("gallery_id, tien_anh, tien_san_pham, san_pham, submitted_at")
      .in("gallery_id", ids)
      .eq("trang_thai", "da_xac_nhan")
      .gte("so_dot", 2),
    admin.from("galleries").select("id, extra_photo_price").in("id", ids),
    layDongThanhToanTheoBo(admin, ids),
    admin
      .from("settings")
      .select("key, value")
      .in("key", [KHOA_THU_SAN_PHAM_QUA_APP, KHOA_THU_SAN_PHAM_QUA_APP_TU])
      .is("branch_id", null),
  ]);
  // Đọc hụt cài đặt = tắt (mặc định): không chặn màn tiền vì một dòng cài đặt.
  const caiDatTheoKhoa = new Map(
    (caiDat.error ? [] : ((caiDat.data ?? []) as { key: string; value: unknown }[])).map((r) => [r.key, r.value]),
  );
  const thuSanPhamQuaApp = laBatThuSanPhamQuaApp(caiDatTheoKhoa.get(KHOA_THU_SAN_PHAM_QUA_APP));
  // BB-363: cờ không hồi tố — chỉ giỏ chốt từ mốc bật cờ trở đi (xem `sanPhamThuTrongApp`).
  const coSanPham = { bat: thuSanPhamQuaApp, tu: docMocThuSanPhamQuaApp(caiDatTheoKhoa.get(KHOA_THU_SAN_PHAM_QUA_APP_TU)) };
  if (sel.error) throw sel.error;
  if (pay.error) throw pay.error;
  if (theoAnh.error) throw theoAnh.error;
  if (dot.error && !laLoiChuaApMigration(dot.error)) throw dot.error;
  if (bo.error) throw bo.error;

  type Luot = {
    gallery_id: string;
    snapshot_extra_amount: number | string | null;
    snapshot_extra_count: number | null;
    submitted_at: string | null;
  };
  const luotTheoBo = new Map(((sel.data ?? []) as Luot[]).map((r) => [String(r.gallery_id), r]));
  const ghiCoTheoBo = new Map<string, number>();
  for (const r of (pay.data ?? []) as { gallery_id: string; amount: number | string }[]) {
    ghiCoTheoBo.set(String(r.gallery_id), (ghiCoTheoBo.get(String(r.gallery_id)) ?? 0) + Number(r.amount));
  }
  type VRow = { gallery_id: string; unbilled_amount: number | string | null; unbilled_count: number | null };
  const vTheoBo = new Map(((theoAnh.data ?? []) as VRow[]).map((r) => [String(r.gallery_id), r]));
  // BB-360 — hai túi: tiền ẢNH (luôn thu qua app) và tiền SẢN PHẨM (ảnh in / khung / album).
  const dotTheoBo = new Map<string, number>();
  const sanPhamTheoBo = new Map<string, number>();
  /** BB-363 — phần tiền sản phẩm của các giỏ chốt TỪ mốc hiệu lực (thu qua app). */
  const sanPhamTrongAppTheoBo = new Map<string, number>();
  const cong = (m: Map<string, number>, g: string, tien: number) => {
    if (Number.isFinite(tien) && tien > 0) m.set(g, (m.get(g) ?? 0) + tien);
  };
  if (!dot.error) {
    type DongSp = { productId?: string; donGia?: number | string; soLuong?: number | string };
    type DotRow = {
      gallery_id: string;
      tien_anh: number | string | null;
      tien_san_pham: number | string | null;
      san_pham: unknown;
      submitted_at?: string | null;
    };
    const dotRows = (dot.data ?? []) as DotRow[];
    const dongSp = (r: DotRow) => (Array.isArray(r.san_pham) ? r.san_pham : []) as DongSp[];
    // "Edit file" trong giỏ đợt ≥ 2 là tiền ẢNH: cần loại sản phẩm của từng dòng.
    const spIds = new Set<string>();
    for (const r of dotRows) for (const d of dongSp(r)) if (d?.productId) spIds.add(String(d.productId));
    const loaiSp = new Map<string, string | null>();
    if (spIds.size > 0) {
      const { data: sps, error: eSp } = await admin.from("products").select("id, kind").in("id", [...spIds]);
      if (eSp) throw eSp;
      for (const p of (sps ?? []) as { id: string; kind: string | null }[]) loaiSp.set(String(p.id), p.kind);
    }
    for (const r of dotRows) {
      const g = String(r.gallery_id);
      let tienEdit = 0;
      for (const d of dongSp(r)) {
        if (d?.productId && loaiSp.get(String(d.productId)) === "edited_photo") {
          tienEdit += Number(d.donGia ?? 0) * Number(d.soLuong ?? 0);
        }
      }
      const tienSp = Math.max(0, Number(r.tien_san_pham ?? 0) || 0);
      tienEdit = Number.isFinite(tienEdit) ? Math.min(Math.max(0, tienEdit), tienSp) : 0;
      cong(dotTheoBo, g, Number(r.tien_anh ?? 0) + tienEdit);
      cong(sanPhamTheoBo, g, tienSp - tienEdit);
      // Đợt ≥ 2: lúc ĐỢT đó được gửi.
      if (sanPhamThuTrongApp(coSanPham, r.submitted_at)) cong(sanPhamTrongAppTheoBo, g, tienSp - tienEdit);
    }
  }
  // BB-359 (vòng 8 A, Q-4: "Mua thêm 40.000 ₫" cạnh "Phải thu 0 ₫ · đã trả đủ") — sản phẩm
  // khách mua thêm NGAY Ở ĐỢT 1 (`selection_addons` của lượt chọn chính, `dot` = 1) chưa
  // từng nằm trong "Phải thu": `snapshot_extra_amount` chỉ là tiền ẢNH vượt hạn mức, còn
  // phần sản phẩm chỉ được cộng từ đợt ≥ 2 (`selection_rounds.tien_san_pham`). Cộng vào
  // khi lượt chọn chính ĐÃ CHỐT (giỏ chưa chốt chưa phải khoản phải thu). Đợt ≥ 2 đã có
  // dòng riêng (`dot` ≥ 2) nên không đếm hai lần.
  const luotDaChot = ((sel.data ?? []) as (Luot & { id: string })[]).filter((r) => r.submitted_at);
  const boTheoLuot = new Map(luotDaChot.map((r) => [String(r.id), String(r.gallery_id)]));
  const chotLucTheoLuot = new Map(luotDaChot.map((r) => [String(r.id), r.submitted_at]));
  if (boTheoLuot.size > 0) {
    type AddonRow = {
      selection_id: string;
      quantity: number | string;
      unit_price: number | string | null;
      dot?: number | null;
      products?: { kind: string | null } | null;
    };
    let addon: { data: unknown[] | null; error: { message: string; code?: string } | null } = await admin
      .from("selection_addons")
      .select("selection_id, quantity, unit_price, dot, products(kind)")
      .in("selection_id", [...boTheoLuot.keys()]);
    if (addon.error && laLoiChuaApMigration(addon.error)) {
      // Chưa áp 0077 (chưa có cột `dot`): mọi dòng là đợt 1.
      addon = await admin
        .from("selection_addons")
        .select("selection_id, quantity, unit_price, products(kind)")
        .in("selection_id", [...boTheoLuot.keys()]);
    }
    if (addon.error) throw addon.error;
    for (const r of (addon.data ?? []) as AddonRow[]) {
      if (r.dot != null && Number(r.dot) !== 1) continue;
      const g = boTheoLuot.get(String(r.selection_id));
      if (!g) continue;
      const tien = Number(r.unit_price ?? 0) * Number(r.quantity ?? 0);
      // BB-360: "Edit file" = tiền ẢNH; ảnh in / khung / album = tiền SẢN PHẨM.
      const laAnh = r.products?.kind === "edited_photo";
      cong(laAnh ? dotTheoBo : sanPhamTheoBo, g, tien);
      // Đợt 1: lúc lượt chọn chính chốt.
      if (!laAnh && sanPhamThuTrongApp(coSanPham, chotLucTheoLuot.get(String(r.selection_id)))) {
        cong(sanPhamTrongAppTheoBo, g, tien);
      }
    }
  }

  const giaTheoBo = new Map(
    ((bo.data ?? []) as { id: string; extra_photo_price: number | string | null }[]).map((r) => [
      String(r.id),
      Number(r.extra_photo_price ?? 0),
    ]),
  );

  for (const galleryId of ids) {
    const luot = luotTheoBo.get(galleryId) ?? null;
    const tienLucChot = Number(luot?.snapshot_extra_amount ?? 0);
    const vRow = vTheoBo.get(galleryId) ?? null;
    const tienTheoAnh = Number(vRow?.unbilled_amount ?? 0);
    const anhVuotChuaThu = Number(vRow?.unbilled_count ?? 0);
    const daGhiCo = ghiCoTheoBo.get(galleryId) ?? 0;
    const tienDotMuaThem = dotTheoBo.get(galleryId) ?? 0;
    const tienSanPham = sanPhamTheoBo.get(galleryId) ?? 0;
    // BB-363: chỉ phần chốt từ mốc hiệu lực đi vào công thức; phần trước mốc vẫn "thu qua Lark".
    const tienSanPhamTrongApp = Math.min(tienSanPham, sanPhamTrongAppTheoBo.get(galleryId) ?? 0);
    const giaAnhHienTai = giaTheoBo.get(galleryId) ?? 0;
    const quyDoi = tinhTienQuyDoi(dongTT.get(galleryId) ?? [], giaAnhHienTai, luot?.submitted_at);
    const soAnhLucChot = Number(luot?.snapshot_extra_count ?? 0);
    const giaMotAnh = tienLucChot > 0 && soAnhLucChot > 0 ? tienLucChot / soAnhLucChot : giaAnhHienTai;
    const congThuc = { tienTheoAnh, tienLucChot, tienDotMuaThem, tienSanPham: tienSanPhamTrongApp, thuSanPhamQuaApp, quyDoi };
    const tongPhaiThu = tongPhaiThuCuaBo(congThuc);
    ketQua.set(galleryId, {
      tienCanThu: tienCanThuCuaBo({ ...congThuc, daGhiCo }),
      tongPhaiThu,
      conThieu: tongPhaiThu - daGhiCo,
      tienLucChot,
      tienTheoAnh,
      tienDotMuaThem,
      tienSanPham,
      thuSanPhamQuaApp,
      thuSanPhamQuaAppTu: coSanPham.tu,
      // Phần KHÔNG vào "Phải thu": cờ tắt = cả tiền sản phẩm; cờ bật = phần chốt trước mốc.
      tienSanPhamQuaLark: tienSanPham - tienSanPhamTinhVaoPhaiThu(tienSanPhamTrongApp, thuSanPhamQuaApp),
      daGhiCo,
      anhVuotChuaThu,
      soAnhQuyDoi: quyDoi.soAnh,
      conThieuVuot: tienVuotHanMucConPhaiThu({ tienTheoAnh, tienLucChot, daGhiCo, quyDoi }),
      giaMotAnh,
    });
  }
  return ketQua;
}
