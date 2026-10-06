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
import { LOC_THO } from "./du-lieu";
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

  // 2. Ba mẹ xin sửa, vòng đang mở -----------------------------------------
  let qv = db
    .from("revision_requests")
    .select("id, round, created_at, galleries!inner(id, title, branch_id, status)")
    .is("resolved_at", null)
    .eq("galleries.status", "in_retouch")
    .order("created_at", { ascending: false });
  if (branchIds) qv = qv.in("galleries.branch_id", branchIds);
  const { data: vong, error: loiVong } = await qv;
  if (loiVong) throw loiVong;
  const dsVong = (vong ?? []) as unknown as {
    id: string;
    round: number;
    created_at: string;
    galleries: GalleryNhung | GalleryNhung[];
  }[];

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
    if (!g || daCo.has(g.id)) continue;
    daCo.add(g.id);
    viec.push({
      loai: "khach_sua",
      galleryId: g.id,
      title: g.title,
      branchId: g.branch_id,
      status: g.status,
      soAnh: soTamTheoVong.get(v.id) ?? 0,
      lan: v.round,
      luc: v.created_at,
    });
  }

  // Mới nhất lên đầu.
  return viec.sort((a, b) => (a.luc < b.luc ? 1 : a.luc > b.luc ? -1 : 0));
}
