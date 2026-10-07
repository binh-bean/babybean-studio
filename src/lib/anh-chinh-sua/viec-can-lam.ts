/**
 * BB-371 — hàng đợi "Ảnh chỉnh sửa" cho CSKH (Việc cần xử lý + Bàn làm việc).
 *
 * Hai loại việc, mỗi BỘ ẢNH một dòng:
 *   · `cho_gui`   — bộ có N ảnh chỉnh mới về (thư mục ảnh chỉnh sửa trong link
 *                   Drive) mà CSKH chưa gửi khách: "kiểm rồi gửi khách".
 *   · `khach_sua` — ba mẹ vừa xin sửa (vòng đang mở): việc của thợ chỉnh + CSKH.
 *
 * Chỉ xét bộ còn ở giai đoạn gửi được (`TRANG_THAI_GUI_DUOC`) và Lark chưa qua
 * "Đã chốt chưa in" — bộ đã giao từ lâu có thư mục ảnh chỉnh là chuyện bình
 * thường, không phải việc tồn đọng.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { laThuMucChinhSua, laAnhChuaGui, TRANG_THAI_GUI_DUOC } from "./nhan-dien";
import { LOC_THO, coBangTheoDot, docBoiCanhAnhChinh, docNhomMuaThem } from "./du-lieu";
import { KHOA_TRONG_GOI, TRANG_THAI_VONG_MUA_THEM, laKhoaMuaThem, mocGuiCuaKhoa, nhanCuaKhoa } from "./theo-dot";
import { giaiDoanCua } from "@/lib/lark/trang-thai-hau-ky";

export interface ViecAnhChinh {
  loai: "cho_gui" | "khach_sua";
  galleryId: string;
  title: string;
  branchId: string;
  status: string;
  /** cho_gui: số ảnh chưa gửi; khach_sua: số tấm ba mẹ chọn sửa (0 = chỉ có ghi chú chung). */
  soAnh: number;
  /** khach_sua: lần sửa thứ mấy. */
  lan?: number;
  /** BB-377 — đợt mua thêm của dòng việc ("Mua thêm đợt 2"); vắng = trong gói / cả bộ. */
  nhanDot?: string;
  khoa?: string;
  luc: string;
}

type GalleryNhung = { id: string; title: string; branch_id: string; status: string; lark_trang_thai: string | null };
const motDong = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function layViecAnhChinh(db: SupabaseClient, branchIds: string[] | null): Promise<ViecAnhChinh[]> {
  const viec: ViecAnhChinh[] = [];

  // 1. Ảnh chỉnh chưa gửi ---------------------------------------------------
  // Lấy BỘ ẢNH ứng viên trước (trạng thái gửi được, đúng chi nhánh), rồi mới hỏi ảnh
  // theo từng nhóm bộ — đi đúng chỉ mục (gallery_id, subfolder). Quét thẳng bảng ảnh
  // (hàng trăm nghìn dòng) với ilike thì hết giờ câu lệnh (đo 06/10: 57014 sau 30 giây).
  const ungVien: GalleryNhung[] = [];
  for (let tu = 0; ; tu += 1000) {
    let qg = db
      .from("galleries")
      .select("id, title, branch_id, status, lark_trang_thai")
      .in("status", [...TRANG_THAI_GUI_DUOC])
      .order("id", { ascending: true })
      .range(tu, tu + 999);
    if (branchIds) qg = qg.in("branch_id", branchIds);
    const { data, error } = await qg;
    if (error) throw error;
    const trang = (data ?? []) as GalleryNhung[];
    for (const g of trang) {
      const gd = giaiDoanCua(g.lark_trang_thai);
      if (gd === null || gd < 7) ungVien.push(g);
    }
    if (trang.length < 1000) break;
  }

  const theoBo = new Map<string, { g: GalleryNhung; tao: string[] }>();
  const gTheoId = new Map(ungVien.map((g) => [g.id, g]));
  const NHOM = 40;
  for (let i = 0; i < ungVien.length; i += NHOM) {
    const ids = ungVien.slice(i, i + NHOM).map((g) => g.id);
    for (let tu = 0; ; tu += 1000) {
      const { data, error } = await db
        .from("photos")
        .select("gallery_id, subfolder, created_at")
        .in("gallery_id", ids)
        .eq("status", "active")
        .not("subfolder", "is", null)
        .or(LOC_THO)
        .order("id", { ascending: true })
        .range(tu, tu + 999);
      if (error) throw error;
      const trang = (data ?? []) as { gallery_id: string; subfolder: string; created_at: string }[];
      for (const p of trang) {
        if (!laThuMucChinhSua(p.subfolder)) continue;
        const g = gTheoId.get(p.gallery_id);
        if (!g) continue;
        const bo = theoBo.get(g.id) ?? { g, tao: [] };
        bo.tao.push(p.created_at);
        theoBo.set(g.id, bo);
      }
      if (trang.length < 1000) break;
    }
  }

  if (theoBo.size > 0) {
    const { data: giao } = await db.from("deliveries").select("*").in("gallery_id", [...theoBo.keys()]);
    const guiLuc = new Map<string, string | null>();
    for (const d of (giao ?? []) as { gallery_id: string; anh_chinh_gui_luc?: string | null; updated_at?: string | null }[]) {
      guiLuc.set(d.gallery_id, d.anh_chinh_gui_luc ?? d.updated_at ?? null);
    }
    for (const { g, tao } of theoBo.values()) {
      const moc = guiLuc.get(g.id) ?? null;
      const chuaGui = tao.filter((t) => laAnhChuaGui(moc, t));
      if (chuaGui.length === 0) continue;
      viec.push({
        loai: "cho_gui",
        galleryId: g.id,
        title: g.title,
        branchId: g.branch_id,
        status: g.status,
        soAnh: chuaGui.length,
        luc: chuaGui.sort().at(-1)!,
      });
    }
  }

  // 1b. BB-377 — ảnh chỉnh MUA THÊM chưa gửi, theo từng đợt (đã áp 0095). Bộ có đợt
  // mua thêm có thể đã duyệt/đã giao — không lọc theo giai đoạn Lark: ảnh mua thêm
  // về sau khi in là chuyện thường và vẫn phải tới tay khách.
  const theoDot = await coBangTheoDot(db);
  if (theoDot) {
    const coDot = new Set<string>();
    const [{ data: r1 }, { data: r2 }] = await Promise.all([
      db.from("selection_rounds").select("gallery_id").in("trang_thai", ["cho_xac_nhan", "da_xac_nhan"]),
      db.from("yeu_cau_mua_them").select("gallery_id").eq("loai", "chinh_sua").in("trang_thai", ["da_chot", "da_thanh_toan"]),
    ]);
    for (const r of [...(r1 ?? []), ...(r2 ?? [])] as { gallery_id: string }[]) coDot.add(r.gallery_id);
    if (coDot.size > 0) {
      let qg = db
        .from("galleries")
        .select("id, title, branch_id, status, lark_trang_thai")
        .in("id", [...coDot])
        .in("status", [...TRANG_THAI_VONG_MUA_THEM]);
      if (branchIds) qg = qg.in("branch_id", branchIds);
      const { data: cacBo } = await qg;
      for (const g of (cacBo ?? []) as GalleryNhung[]) {
        const nhom = await docNhomMuaThem(db, g.id);
        if (nhom.length === 0) continue;
        const bc = await docBoiCanhAnhChinh(db, g.id);
        for (const n of nhom) {
          const moc = mocGuiCuaKhoa(n.khoa, bc.mocChung, bc.mocDot);
          const chuaGui = bc.anhChinh
            .filter((a) => bc.khoaCua.get(a.id) === n.khoa && laAnhChuaGui(moc, a.created_at))
            .map((a) => a.created_at);
          if (chuaGui.length === 0) continue;
          viec.push({
            loai: "cho_gui",
            galleryId: g.id,
            title: g.title,
            branchId: g.branch_id,
            status: g.status,
            soAnh: chuaGui.length,
            nhanDot: n.nhan,
            khoa: n.khoa,
            luc: chuaGui.sort().at(-1)!,
          });
        }
        // Dòng "trong gói" ở bước 1 đã đếm cả tấm mua thêm — trừ ra cho đúng.
        const dong = viec.find((v) => v.loai === "cho_gui" && v.galleryId === g.id && !v.khoa);
        if (dong) {
          const soTrongGoi = bc.anhChinh.filter(
            (a) => (bc.khoaCua.get(a.id) ?? KHOA_TRONG_GOI) === KHOA_TRONG_GOI && laAnhChuaGui(bc.mocChung, a.created_at),
          ).length;
          if (soTrongGoi === 0) viec.splice(viec.indexOf(dong), 1);
          else dong.soAnh = soTrongGoi;
        }
      }
    }
  }

  // 2. Ba mẹ xin sửa, vòng đang mở -----------------------------------------
  // BB-377 — vòng của đợt mua thêm (`dot_khoa`) mở dù bộ đã duyệt/đã giao.
  const hoiVong = (cot: string, chiDangChinh: boolean) => {
    let q = db
      .from("revision_requests")
      .select(cot)
      .is("resolved_at", null)
      .order("created_at", { ascending: false });
    if (chiDangChinh) q = q.eq("galleries.status", "in_retouch");
    else q = q.not("dot_khoa", "is", null);
    if (branchIds) q = q.in("galleries.branch_id", branchIds);
    return q;
  };
  const { data: vong, error: loiVong } = await hoiVong(
    "id, round, created_at, galleries!inner(id, title, branch_id, status)",
    true,
  );
  if (loiVong) throw loiVong;
  type DongVong = { id: string; round: number; created_at: string; dot_khoa?: string | null; galleries: GalleryNhung | GalleryNhung[] };
  const dsVong = (vong ?? []) as unknown as DongVong[];
  if (theoDot) {
    const { data: vongDot } = await hoiVong("id, round, created_at, dot_khoa, galleries!inner(id, title, branch_id, status)", false);
    for (const v of (vongDot ?? []) as unknown as DongVong[]) if (!dsVong.some((x) => x.id === v.id)) dsVong.push(v);
    dsVong.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }

  const soTamTheoVong = new Map<string, number>();
  if (dsVong.length > 0) {
    const { data: ct, error: loiCt } = await db
      .from("revision_request_items")
      .select("revision_request_id")
      .in("revision_request_id", dsVong.map((v) => v.id));
    if (!loiCt) for (const r of ct ?? []) soTamTheoVong.set(r.revision_request_id, (soTamTheoVong.get(r.revision_request_id) ?? 0) + 1);
  }
  const daCo = new Set<string>();
  for (const v of dsVong) {
    const g = motDong(v.galleries);
    const khoa = laKhoaMuaThem(v.dot_khoa) ? v.dot_khoa : undefined;
    if (!g || daCo.has(`${g.id}|${khoa ?? ""}`)) continue;
    daCo.add(`${g.id}|${khoa ?? ""}`);
    const nhanDot = khoa ? nhanCuaKhoa(khoa, await docNhomMuaThem(db, g.id)) : undefined;
    viec.push({
      loai: "khach_sua",
      galleryId: g.id,
      title: g.title,
      branchId: g.branch_id,
      status: g.status,
      soAnh: soTamTheoVong.get(v.id) ?? 0,
      lan: v.round,
      ...(khoa ? { khoa, nhanDot } : {}),
      luc: v.created_at,
    });
  }

  // Mới nhất lên đầu.
  return viec.sort((a, b) => (a.luc < b.luc ? 1 : a.luc > b.luc ? -1 : 0));
}
