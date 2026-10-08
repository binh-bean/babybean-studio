/**
 * BB-399 — "Làm ảnh nhanh": phần ĐỌC/GHI cơ sở dữ liệu. Luật thuần ở `lam-anh-nhanh.ts`.
 *
 * Mọi hàm đọc ở đây KHÔNG làm sập màn gọi nó: màn khách / danh sách quản trị gặp lỗi đọc thì
 * coi như "không có làm nhanh" (ẩn ô, không nhãn) — một dịch vụ bán thêm không được phép làm
 * hỏng nút Chốt hay danh sách bộ ảnh. Riêng đường GHI (mua) ném lỗi để route báo thật.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  KHOA_BAT_LAM_NHANH,
  KHOA_SAN_PHAM_LAM_NHANH,
  KHOA_SO_NGAY_LAM_NHANH,
  KHOA_SO_NGAY_TRA_TIEU_CHUAN,
  TRANG_THAI_CON_HAN_TRA,
  TRANG_THAI_MUA_SAU_CHOT,
  chonSanPhamLamNhanh,
  chuanHoaGhim,
  docCaiDatHauKy,
  laBatLamNhanh,
  laSanPhamLamNhanh,
  laUuTienLamNhanh,
  tinhHanTra,
  type CaiDatHauKy,
  type HanTra,
  type LamAnhNhanhKhach,
  type SanPhamDichVu,
} from "./lam-anh-nhanh";

const COT_SAN_PHAM = "id, name, kind, lark_record_id, list_price, is_active";

export interface CaiDatLamNhanh extends CaiDatHauKy {
  /** Ghim áp cho chi nhánh đang xét (chi nhánh thắng chung). */
  ghim: string | null;
  /** MỌI ghim đang có (chung + mọi chi nhánh) — để nhận ra dòng đã mua. */
  cacGhim: Set<string>;
  /** BB-399 vòng 3 — công tắc nhận làm nhanh (CHUNG toàn hệ thống; thiếu dòng = bật). */
  bat: boolean;
}

type DongCaiDat = { key: string; value: unknown; branch_id: string | null };

/** Đọc 3 cài đặt. Dòng của chi nhánh thắng dòng chung. Lỗi đọc → mặc định (14 / 5 / không ghim). */
export async function docCaiDatLamNhanh(admin: SupabaseClient, branchId: string | null): Promise<CaiDatLamNhanh> {
  let rows: DongCaiDat[] = [];
  try {
    const { data, error } = await admin
      .from("settings")
      .select("key, value, branch_id")
      .in("key", [KHOA_SO_NGAY_TRA_TIEU_CHUAN, KHOA_SO_NGAY_LAM_NHANH, KHOA_SAN_PHAM_LAM_NHANH, KHOA_BAT_LAM_NHANH]);
    if (!error) rows = (data ?? []) as DongCaiDat[];
  } catch {
    rows = [];
  }
  const lay = (key: string): unknown => {
    const rieng = branchId ? rows.find((r) => r.key === key && r.branch_id === branchId) : undefined;
    return (rieng ?? rows.find((r) => r.key === key && r.branch_id == null))?.value;
  };
  const cacGhim = new Set(
    rows
      .filter((r) => r.key === KHOA_SAN_PHAM_LAM_NHANH)
      .map((r) => chuanHoaGhim(r.value))
      .filter((g): g is string => !!g),
  );
  return {
    ...docCaiDatHauKy({ tieuChuan: lay(KHOA_SO_NGAY_TRA_TIEU_CHUAN), nhanh: lay(KHOA_SO_NGAY_LAM_NHANH) }),
    ghim: chuanHoaGhim(lay(KHOA_SAN_PHAM_LAM_NHANH)),
    cacGhim,
    bat: laBatLamNhanh(rows.find((r) => r.key === KHOA_BAT_LAM_NHANH && r.branch_id == null)?.value),
  };
}

/** Sản phẩm "Làm ảnh nhanh" đang bán cho chi nhánh này (theo ghim, không thì theo tên). */
export async function timSanPhamLamNhanh(admin: SupabaseClient, ghim: string | null): Promise<SanPhamDichVu | null> {
  const q = ghim
    ? admin.from("products").select(COT_SAN_PHAM).eq("lark_record_id", ghim)
    : admin.from("products").select(COT_SAN_PHAM).in("kind", ["addon", "service"]).eq("is_active", true).ilike("name", "%nhanh%");
  const { data, error } = await q;
  if (error) throw error;
  return chonSanPhamLamNhanh((data ?? []) as SanPhamDichVu[], ghim);
}

export interface DaMuaLamNhanh {
  /** Lúc tạo dòng mua (ISO). */
  muaLuc: string;
  dot: number;
}

/** Bộ (lượt chọn) nào đã mua làm nhanh — Map<selectionId, dòng mua sớm nhất>. */
export async function docDaMuaLamNhanh(
  admin: SupabaseClient,
  selectionIds: readonly string[],
  cacGhim: ReadonlySet<string>,
): Promise<Map<string, DaMuaLamNhanh>> {
  const ra = new Map<string, DaMuaLamNhanh>();
  const ids = [...new Set(selectionIds)].filter(Boolean);
  if (ids.length === 0) return ra;
  // Chỉ dòng KHÔNG gắn ảnh: dịch vụ làm nhanh không bao giờ gắn ảnh.
  const { data, error } = await admin
    .from("selection_addons")
    .select("selection_id, created_at, dot, products(name, lark_record_id)")
    .in("selection_id", ids)
    .is("photo_id", null);
  if (error) throw error;
  type Dong = {
    selection_id: string;
    created_at: string;
    dot?: number | null;
    products?: { name: string | null; lark_record_id: string | null } | null;
  };
  for (const r of (data ?? []) as unknown as Dong[]) {
    if (!laSanPhamLamNhanh(r.products, cacGhim)) continue;
    const cu = ra.get(String(r.selection_id));
    if (!cu || r.created_at < cu.muaLuc) ra.set(String(r.selection_id), { muaLuc: r.created_at, dot: Number(r.dot ?? 1) });
  }
  return ra;
}

/**
 * Bộ ảnh đã mua làm nhanh chưa — xét lượt chọn của phiên VÀ lượt chọn chính của bộ (link gia
 * đình/người thân có lượt riêng; mua là của bộ). Ném lỗi đọc (đường ghi cần biết chắc).
 */
export async function daMuaCuaBo(
  admin: SupabaseClient,
  galleryId: string,
  selectionId: string,
  cacGhim: ReadonlySet<string>,
): Promise<DaMuaLamNhanh | null> {
  const { data: chinh, error } = await admin
    .from("selections")
    .select("id")
    .eq("gallery_id", galleryId)
    .eq("is_primary", true)
    .maybeSingle();
  if (error) throw error;
  const ids = [selectionId, (chinh as { id?: string } | null)?.id ?? ""].filter(Boolean);
  const m = await docDaMuaLamNhanh(admin, ids, cacGhim);
  const ds = [...m.values()].sort((a, b) => a.muaLuc.localeCompare(b.muaLuc));
  return ds[0] ?? null;
}

/**
 * Ghi MỘT dòng mua làm nhanh (không `photo_id`, đúng `dot`, đơn giá chốt lúc này). Gọi SAU khi
 * route đã kiểm "chưa mua". Trả dòng vừa ghi.
 */
export async function ghiMuaLamNhanh(
  admin: SupabaseClient,
  p: { selectionId: string; sanPham: SanPhamDichVu; dot: number },
): Promise<{ id: string; donGia: number } | null> {
  const donGia = Number(p.sanPham.list_price);
  const { data, error } = await admin
    .from("selection_addons")
    .insert({
      selection_id: p.selectionId,
      product_id: p.sanPham.id,
      photo_id: null,
      quantity: 1,
      unit_price: donGia,
      dot: p.dot,
    })
    .select("id")
    .single();
  // Hai lượt bấm cùng lúc: chỉ mục duy nhất (lượt, sản phẩm, đợt) của 0077 chặn dòng thứ hai —
  // coi như đã mua, không báo lỗi cho ba mẹ.
  if (error && (error as { code?: string }).code === "23505") return null;
  if (error || !data) throw error ?? new Error("Không ghi được dòng làm ảnh nhanh");
  return { id: String((data as { id: string }).id), donGia };
}

/**
 * Phần `lamAnhNhanh` cho màn khách (`/api/g/gallery`). Lỗi → null (màn khách không bao giờ
 * hỏng vì dịch vụ này).
 */
export async function thongTinLamNhanhChoKhach(
  admin: SupabaseClient,
  p: { galleryId: string; branchId: string | null; selectionId: string; trangThai: string; chotLuc: string | null },
): Promise<LamAnhNhanhKhach | null> {
  try {
    const caiDat = await docCaiDatLamNhanh(admin, p.branchId);
    const daMua = await daMuaCuaBo(admin, p.galleryId, p.selectionId, caiDat.cacGhim);
    const sanPham = await timSanPhamLamNhanh(admin, caiDat.ghim);
    const daChot = !!p.chotLuc && TRANG_THAI_CON_HAN_TRA.includes(p.trangThai);
    return {
      // BB-399 vòng 3 — công tắc tắt: không bán (ô/thẻ ẩn); bộ đã mua vẫn giữ "Đã chọn" + hạn.
      coBan: caiDat.bat && !!sanPham,
      gia: sanPham ? Number(sanPham.list_price) : 0,
      soNgayNhanh: caiDat.soNgayNhanh,
      soNgayTieuChuan: caiDat.soNgayTieuChuan,
      daMua: !!daMua,
      muaSauChot: caiDat.bat && !!sanPham && !daMua && !!p.chotLuc && TRANG_THAI_MUA_SAU_CHOT.includes(p.trangThai),
      hanTra: daChot
        ? tinhHanTra({
            chotLuc: p.chotLuc,
            lamNhanh: !!daMua,
            muaNhanhLuc: daMua?.muaLuc ?? null,
            soNgayTieuChuan: caiDat.soNgayTieuChuan,
            soNgayNhanh: caiDat.soNgayNhanh,
          })
        : null,
    };
  } catch (e) {
    console.error("[BB-399] Đọc làm ảnh nhanh cho màn khách hụt:", e instanceof Error ? e.message : e);
    return null;
  }
}

export interface HanTraBo extends HanTra {
  chotLuc: string | null;
  /** BB-399 vòng 3 — làm nhanh VÀ bộ còn chờ trả ảnh chỉnh → nhân viên xử lý TRƯỚC. */
  uuTien: boolean;
}

/**
 * Màn nhân viên — hạn trả dự kiến + cờ làm nhanh cho NHIỀU bộ một lượt. Chỉ bộ đã chốt có
 * dòng trong Map. Lỗi đọc → Map rỗng (không nhãn), không ném.
 */
export async function layHanTraNhieuBo(admin: SupabaseClient, galleryIds: readonly string[]): Promise<Map<string, HanTraBo>> {
  const ra = new Map<string, HanTraBo>();
  const ids = [...new Set(galleryIds)].filter(Boolean);
  if (ids.length === 0) return ra;
  try {
    const [caiDat, { data: sel, error }, { data: bo, error: eBo }] = await Promise.all([
      docCaiDatLamNhanh(admin, null),
      admin.from("selections").select("id, gallery_id, submitted_at").in("gallery_id", ids).eq("is_primary", true),
      admin.from("galleries").select("id, status").in("id", ids),
    ]);
    if (error) throw error;
    if (eBo) throw eBo;
    const trangThai = new Map(((bo ?? []) as { id: string; status: string }[]).map((b) => [String(b.id), String(b.status)]));
    const luot = ((sel ?? []) as { id: string; gallery_id: string; submitted_at: string | null }[]).filter((r) => r.submitted_at);
    const daMua = await docDaMuaLamNhanh(
      admin,
      luot.map((r) => String(r.id)),
      caiDat.cacGhim,
    );
    for (const r of luot) {
      const m = daMua.get(String(r.id)) ?? null;
      ra.set(String(r.gallery_id), {
        chotLuc: r.submitted_at,
        uuTien: laUuTienLamNhanh(!!m, trangThai.get(String(r.gallery_id))),
        ...tinhHanTra({
          chotLuc: r.submitted_at,
          lamNhanh: !!m,
          muaNhanhLuc: m?.muaLuc ?? null,
          soNgayTieuChuan: caiDat.soNgayTieuChuan,
          soNgayNhanh: caiDat.soNgayNhanh,
        }),
      });
    }
  } catch (e) {
    console.error("[BB-399] Đọc hạn trả nhiều bộ hụt:", e instanceof Error ? e.message : e);
    return new Map();
  }
  return ra;
}

export interface BoLamNhanhCho {
  galleryId: string;
  title: string;
  status: string;
  branchId: string | null;
  hanTra: string | null;
  soNgay: number;
}

/**
 * BB-399 vòng 3 — các bộ ƯU TIÊN làm nhanh đang chờ (đã mua làm nhanh, còn `submitted` /
 * `in_retouch`), hạn gần nhất lên đầu. `branchIds` null = mọi chi nhánh. Dùng cho: thứ tự máy
 * chủ của danh sách bộ ảnh, số "N bộ làm nhanh đang chờ" cạnh công tắc, thẻ ưu tiên ở bảng điều
 * khiển. Lỗi đọc → rỗng (không chặn màn nào).
 */
export async function layBoLamNhanhDangCho(admin: SupabaseClient, branchIds: readonly string[] | null): Promise<BoLamNhanhCho[]> {
  try {
    const caiDat = await docCaiDatLamNhanh(admin, null);
    const [theoTen, theoGhim] = await Promise.all([
      admin.from("products").select("id, name, lark_record_id").ilike("name", "%nhanh%"),
      caiDat.cacGhim.size
        ? admin.from("products").select("id, name, lark_record_id").in("lark_record_id", [...caiDat.cacGhim])
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (theoTen.error) throw theoTen.error;
    if (theoGhim.error) throw theoGhim.error;
    type Sp = { id: string; name: string | null; lark_record_id: string | null };
    const spIds = [...new Set([...((theoTen.data ?? []) as Sp[]), ...((theoGhim.data ?? []) as Sp[])]
      .filter((p) => laSanPhamLamNhanh(p, caiDat.cacGhim))
      .map((p) => String(p.id)))];
    if (spIds.length === 0) return [];
    const { data: mua, error: eMua } = await admin
      .from("selection_addons")
      .select("selection_id, created_at")
      .in("product_id", spIds)
      .is("photo_id", null);
    if (eMua) throw eMua;
    const muaTheoLuot = new Map<string, string>();
    for (const m of (mua ?? []) as { selection_id: string; created_at: string }[]) {
      const cu = muaTheoLuot.get(String(m.selection_id));
      if (!cu || m.created_at < cu) muaTheoLuot.set(String(m.selection_id), m.created_at);
    }
    if (muaTheoLuot.size === 0) return [];
    const { data: sel, error: eSel } = await admin
      .from("selections")
      .select("id, gallery_id, submitted_at")
      .in("id", [...muaTheoLuot.keys()])
      .eq("is_primary", true);
    if (eSel) throw eSel;
    const luot = ((sel ?? []) as { id: string; gallery_id: string; submitted_at: string | null }[]).filter((r) => r.submitted_at);
    if (luot.length === 0) return [];
    let q = admin
      .from("galleries")
      .select("id, title, status, branch_id")
      .in("id", luot.map((r) => String(r.gallery_id)))
      .in("status", [...TRANG_THAI_CON_HAN_TRA]);
    if (branchIds) q = q.in("branch_id", [...branchIds]);
    const { data: bo, error: eBo } = await q;
    if (eBo) throw eBo;
    const luotTheoBo = new Map(luot.map((r) => [String(r.gallery_id), r]));
    const ra: BoLamNhanhCho[] = [];
    for (const b of (bo ?? []) as { id: string; title: string; status: string; branch_id: string | null }[]) {
      const r = luotTheoBo.get(String(b.id));
      if (!r) continue;
      const han = tinhHanTra({
        chotLuc: r.submitted_at,
        lamNhanh: true,
        muaNhanhLuc: muaTheoLuot.get(String(r.id)) ?? null,
        soNgayTieuChuan: caiDat.soNgayTieuChuan,
        soNgayNhanh: caiDat.soNgayNhanh,
      });
      ra.push({ galleryId: String(b.id), title: String(b.title ?? ""), status: String(b.status), branchId: b.branch_id, hanTra: han.hanTra, soNgay: han.soNgay });
    }
    return ra.sort((a, b) => String(a.hanTra ?? "").localeCompare(String(b.hanTra ?? "")));
  } catch (e) {
    console.error("[BB-399] Đọc bộ làm nhanh đang chờ hụt:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** BB-399 vòng 3 — ghi công tắc CHUNG (sửa, không trúng dòng thì chèn — cùng khuôn route Cài đặt). */
export async function ghiCongTacLamNhanh(admin: SupabaseClient, bat: boolean): Promise<void> {
  const { data, error } = await admin
    .from("settings")
    .update({ value: bat })
    .eq("key", KHOA_BAT_LAM_NHANH)
    .is("branch_id", null)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    const { error: e2 } = await admin.from("settings").insert({ key: KHOA_BAT_LAM_NHANH, branch_id: null, value: bat });
    if (e2) throw e2;
  }
}
