/**
 * BB-371 — đọc ảnh chỉnh sửa của một bộ ảnh (máy chủ, service-role).
 *
 * Mọi route (khách, quản trị, ảnh) đọc qua đây để MỘT luật quyết định "tấm nào
 * là ảnh chỉnh" và "khách đã được thấy chưa" — luật nằm ở `nhan-dien.ts`.
 *
 * Chạy được khi migration 0091 CHƯA áp: cột/bảng/bucket mới đều dò trước rồi
 * mới dùng, thiếu thì lùi về bản an toàn (xem đầu tệp migration).
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { laThuMucChinhSua, ghepAnhChinhVoiGoc, khachThayAnhChinh } from "./nhan-dien";
import {
  KHOA_TRONG_GOI,
  dungNhomMuaThem,
  khachThayAnhChinhTheoDot,
  khoaCuaAnhGoc,
  type MocDot,
  type NhomMuaThem,
} from "./theo-dot";

/** Bucket ảnh mẫu khách tải lên (migration 0091). */
export const BUCKET_ANH_MAU = "yeu-cau-sua";
/** URL ký cho ảnh mẫu sống bấy nhiêu giây. */
export const HAN_URL_KY_GIAY = 600;

const TRANG = 1000;

/**
 * Lọc thô phía cơ sở dữ liệu (TẬP CHA của `laThuMucChinhSua`) để không kéo cả
 * nghìn dòng ảnh gốc về chỉ để biết tên thư mục. Lọc đúng chạy lại bằng
 * `laThuMucChinhSua` ở dưới. `_` = một ký tự bất kỳ (bắt "sửa" dạng NFC),
 * `su*a` bắt dạng NFD của máy Mac.
 */
export const LOC_THO =
  "subfolder.ilike.*ch*nh*,subfolder.ilike.*edit*,subfolder.ilike.*retouch*," +
  "subfolder.ilike.*s_a*,subfolder.ilike.*su*a*,subfolder.ilike.*h*u*k*";

export interface AnhChinhTho {
  id: string;
  file_name: string;
  subfolder: string;
  created_at: string;
  width: number | null;
  height: number | null;
  drive_file_id: string | null;
  sort_index: number;
}

/** Mọi ảnh chỉnh (status active) của bộ ảnh, theo thứ tự trong Drive. */
export async function docAnhChinh(db: SupabaseClient, galleryId: string): Promise<AnhChinhTho[]> {
  const ra: AnhChinhTho[] = [];
  for (let tu = 0; ; tu += TRANG) {
    const { data, error } = await db
      .from("photos")
      .select("id, file_name, subfolder, created_at, width, height, drive_file_id, sort_index")
      .eq("gallery_id", galleryId)
      .eq("status", "active")
      .not("subfolder", "is", null)
      .or(LOC_THO)
      .order("sort_index", { ascending: true })
      .range(tu, tu + TRANG - 1);
    if (error) throw error;
    const trang = (data ?? []) as AnhChinhTho[];
    for (const p of trang) if (laThuMucChinhSua(p.subfolder)) ra.push(p);
    if (trang.length < TRANG) break;
  }
  return ra;
}

export interface AnhGoc {
  id: string;
  file_name: string;
  width: number | null;
  height: number | null;
  drive_file_id: string | null;
  subfolder: string | null;
}

/** Ảnh gốc (không thuộc thư mục chỉnh sửa) — để ghép tên. Đọc theo trang. */
export async function docAnhGoc(db: SupabaseClient, galleryId: string): Promise<AnhGoc[]> {
  const ra: AnhGoc[] = [];
  for (let tu = 0; ; tu += TRANG) {
    const { data, error } = await db
      .from("photos")
      .select("id, file_name, width, height, drive_file_id, subfolder")
      .eq("gallery_id", galleryId)
      .eq("status", "active")
      .order("id", { ascending: true })
      .range(tu, tu + TRANG - 1);
    if (error) throw error;
    const trang = (data ?? []) as AnhGoc[];
    for (const p of trang) if (!laThuMucChinhSua(p.subfolder)) ra.push(p);
    if (trang.length < TRANG) break;
  }
  return ra;
}

/**
 * Lúc CSKH gửi khách duyệt gần nhất. `deliveries.anh_chinh_gui_luc` (0091);
 * chưa áp 0091 hoặc gửi theo đường cũ (link Drive, BB-121) thì lấy
 * `deliveries.updated_at` — route gửi khách cập nhật cột đó cùng lúc.
 * `null` = chưa gửi lần nào.
 */
export async function docMocGui(db: SupabaseClient, galleryId: string): Promise<string | null> {
  const { data, error } = await db.from("deliveries").select("*").eq("gallery_id", galleryId).maybeSingle();
  if (error || !data) return null;
  const d = data as { anh_chinh_gui_luc?: string | null; updated_at?: string | null };
  return d.anh_chinh_gui_luc ?? d.updated_at ?? null;
}

/** Mã lỗi Postgres/PostgREST nghĩa là "bảng/cột chưa có" (migration chưa áp). */
export function laLoiChuaCoBang(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code ?? "";
  return ["42P01", "42703", "PGRST204", "PGRST205", "PGRST200"].includes(code);
}

let nhoBang: { co: boolean; luc: number } | null = null;
let nhoBucket: { co: boolean; luc: number } | null = null;
const NHO_MS = 60_000;

/** Bảng `revision_request_items` đã có chưa (0091). Nhớ 60 giây. */
export async function coBangChiTiet(db: SupabaseClient): Promise<boolean> {
  if (nhoBang && Date.now() - nhoBang.luc < NHO_MS) return nhoBang.co;
  // KHÔNG dùng `head: true`: bảng thiếu thì yêu cầu HEAD trả 404 không thân, supabase-js
  // không dựng ra lỗi (đo thật 06/10 — dò ra "có bảng" khi chưa áp 0091).
  const { error } = await db.from("revision_request_items").select("id").limit(1);
  const co = !error;
  if (!error || laLoiChuaCoBang(error)) nhoBang = { co, luc: Date.now() };
  return co;
}

/** Bucket ảnh mẫu đã có chưa (0091). Nhớ 60 giây. */
export async function coBucketAnhMau(db: SupabaseClient): Promise<boolean> {
  if (nhoBucket && Date.now() - nhoBucket.luc < NHO_MS) return nhoBucket.co;
  const { data, error } = await db.storage.getBucket(BUCKET_ANH_MAU);
  const co = !error && !!data && data.public === false;
  nhoBucket = { co, luc: Date.now() };
  return co;
}

/** Cho phép thử: quên kết quả dò đã nhớ. */
export function quenNhoTinhNang(): void {
  nhoBang = null;
  nhoBucket = null;
}

/** Đường dẫn ảnh mẫu hợp lệ CỦA ĐÚNG bộ ảnh này: '<galleryId>/<uuid>.<đuôi>'. */
export function laDuongDanAnhMau(duongDan: unknown, galleryId: string): duongDan is string {
  if (typeof duongDan !== "string") return false;
  const m = /^([0-9a-f-]{36})\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic)$/.exec(duongDan);
  return !!m && m[1] === galleryId;
}

export interface MucChiTiet {
  revision_request_id: string;
  photo_id: string;
  original_photo_id: string | null;
  note: string;
  marks: unknown;
  reference_paths: string[];
}

/** Chi tiết từng tấm của các vòng sửa (rỗng khi chưa áp 0091). */
export async function docChiTietVong(db: SupabaseClient, galleryId: string): Promise<MucChiTiet[]> {
  if (!(await coBangChiTiet(db))) return [];
  const { data, error } = await db
    .from("revision_request_items")
    .select("revision_request_id, photo_id, original_photo_id, note, marks, reference_paths")
    .eq("gallery_id", galleryId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as MucChiTiet[];
}

/**
 * Tóm tắt cho màn khách (route bộ ảnh): ảnh chỉnh + hàm "khách thấy tấm này chưa".
 * KHÔNG BAO GIỜ NÉM — đọc hỏng thì coi như chưa có ảnh chỉnh (màn khách giữ đúng
 * như trước BB-371).
 *
 * BB-377: bộ có đợt mua thêm (và đã áp 0095) thì mỗi tấm theo mốc của ĐÚNG đợt nó —
 * phải ghép ảnh gốc để biết đợt, nên chỉ đọc ảnh gốc khi thật sự có đợt mua thêm.
 */
export async function docTomTatAnhChinh(
  db: SupabaseClient,
  galleryId: string,
): Promise<{ anh: AnhChinhTho[]; guiLuc: string | null; laThay: (trangThaiBo: string, a: AnhChinhTho) => boolean }> {
  const khongThay = () => false;
  try {
    const anh = await docAnhChinh(db, galleryId);
    if (anh.length === 0) return { anh, guiLuc: null, laThay: khongThay };
    const [guiLuc, mocDot, nhom] = await Promise.all([
      docMocGui(db, galleryId),
      docMocDot(db, galleryId),
      docNhomMuaThem(db, galleryId),
    ]);
    if (mocDot === null || nhom.length === 0) {
      return { anh, guiLuc, laThay: (tt, a) => khachThayAnhChinh(tt, guiLuc, a.created_at) };
    }
    const goc = await docAnhGoc(db, galleryId);
    const gocCua = ghepAnhChinhVoiGoc(
      anh.map((a) => ({ id: a.id, fileName: a.file_name })),
      goc.map((g) => ({ id: g.id, fileName: g.file_name })),
    );
    return {
      anh,
      guiLuc,
      laThay: (tt, a) =>
        khachThayAnhChinhTheoDot({
          trangThaiBo: tt,
          khoa: khoaCuaAnhGoc(gocCua.get(a.id), nhom),
          mocChung: guiLuc,
          mocDot,
          anhTaoLuc: a.created_at,
        }),
    };
  } catch {
    return { anh: [], guiLuc: null, laThay: khongThay };
  }
}

// ---------------------------------------------------------------------------
// BB-377 — ảnh chỉnh THEO ĐỢT (trong gói / mua thêm). Luật thuần ở `theo-dot.ts`.
// ---------------------------------------------------------------------------

let nhoBangDot: { co: boolean; luc: number } | null = null;

/** Bảng `anh_chinh_dot` + cột `dot_khoa` (0095) đã có chưa. Nhớ 60 giây. */
export async function coBangTheoDot(db: SupabaseClient): Promise<boolean> {
  if (nhoBangDot && Date.now() - nhoBangDot.luc < NHO_MS) return nhoBangDot.co;
  const [a, b] = await Promise.all([
    db.from("anh_chinh_dot").select("khoa").limit(1),
    db.from("revision_requests").select("dot_khoa").limit(1),
  ]);
  const co = !a.error && !b.error;
  if (co || laLoiChuaCoBang(a.error) || laLoiChuaCoBang(b.error)) nhoBangDot = { co, luc: Date.now() };
  return co;
}

/** Cho phép thử: quên kết quả dò bảng theo đợt. */
export function quenNhoTheoDot(): void {
  nhoBangDot = null;
  nhoBoiCanh.clear();
}

/** Mốc gửi/duyệt từng đợt mua thêm. `null` = chưa áp 0095 (mọi tấm đi luật cũ). */
export async function docMocDot(db: SupabaseClient, galleryId: string): Promise<Map<string, MocDot> | null> {
  if (!(await coBangTheoDot(db))) return null;
  const { data, error } = await db.from("anh_chinh_dot").select("khoa, gui_luc, duyet_luc").eq("gallery_id", galleryId);
  if (error) return laLoiChuaCoBang(error) ? null : new Map();
  return new Map(
    ((data ?? []) as { khoa: string; gui_luc: string | null; duyet_luc: string | null }[]).map((r) => [
      r.khoa,
      { guiLuc: r.gui_luc, duyetLuc: r.duyet_luc },
    ]),
  );
}

/**
 * Các nhóm mua thêm của bộ ảnh: đợt chọn còn khoá (BB-321) + yêu cầu chỉnh sửa của
 * người thân đã chốt (BB-345). Bảng/cột thiếu (migration cũ chưa áp) → bỏ phần đó.
 */
export async function docNhomMuaThem(db: SupabaseClient, galleryId: string): Promise<NhomMuaThem[]> {
  const [dot, yc] = await Promise.all([
    db.from("selection_rounds").select("so_dot, trang_thai, anh_ids").eq("gallery_id", galleryId),
    db
      .from("yeu_cau_mua_them")
      .select("id, loai, trang_thai, anh_ids, share_link_id, share_links(label), created_at")
      .eq("gallery_id", galleryId)
      .eq("loai", "chinh_sua")
      .order("created_at", { ascending: true }),
  ]);
  if (dot.error && !laLoiChuaCoBang(dot.error)) throw dot.error;
  if (yc.error && !laLoiChuaCoBang(yc.error)) throw yc.error;
  const motDong = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
  return dungNhomMuaThem(
    ((dot.data ?? []) as { so_dot: number; trang_thai: string; anh_ids: string[] | null }[]).map((d) => ({
      soDot: d.so_dot,
      trangThai: d.trang_thai,
      anhIds: d.anh_ids,
    })),
    (
      (yc.data ?? []) as unknown as {
        id: string;
        loai: string | null;
        trang_thai: string;
        anh_ids: string[] | null;
        share_link_id: string | null;
        share_links: { label: string | null } | { label: string | null }[] | null;
      }[]
    ).map((y) => ({
      id: y.id,
      loai: y.loai,
      trangThai: y.trang_thai,
      anhIds: y.anh_ids,
      coLink: !!y.share_link_id,
      nhanLink: motDong(y.share_links)?.label ?? null,
    })),
  );
}

export interface BoiCanhAnhChinh {
  anhChinh: AnhChinhTho[];
  goc: AnhGoc[];
  /** id ảnh chỉnh → id ảnh gốc ghép được (null = không ghép được). */
  gocCua: Map<string, string | null>;
  nhom: NhomMuaThem[];
  /** id ảnh chỉnh → khoá đợt ("goc" | "dot:N" | "mt:<id>"). */
  khoaCua: Map<string, string>;
  mocChung: string | null;
  /** null = chưa áp 0095. */
  mocDot: Map<string, MocDot> | null;
}

/**
 * Mọi thứ cần để quyết "tấm ảnh chỉnh này thuộc đợt nào, khách thấy chưa". Ảnh gốc
 * chỉ đọc khi cần (có ảnh chỉnh) — đọc theo trang.
 */
export async function docBoiCanhAnhChinh(db: SupabaseClient, galleryId: string): Promise<BoiCanhAnhChinh> {
  const [anhChinh, mocChung, mocDot, nhom] = await Promise.all([
    docAnhChinh(db, galleryId),
    docMocGui(db, galleryId),
    docMocDot(db, galleryId),
    docNhomMuaThem(db, galleryId),
  ]);
  const goc = anhChinh.length > 0 ? await docAnhGoc(db, galleryId) : [];
  const gocCua = ghepAnhChinhVoiGoc(
    anhChinh.map((a) => ({ id: a.id, fileName: a.file_name })),
    goc.map((g) => ({ id: g.id, fileName: g.file_name })),
  );
  const khoaCua = new Map(anhChinh.map((a) => [a.id, khoaCuaAnhGoc(gocCua.get(a.id), nhom)] as const));
  return { anhChinh, goc, gocCua, nhom, khoaCua, mocChung, mocDot };
}

/** Bản nhớ ngắn cho route ảnh (`/api/img`): một lưới 15 tấm không đọc lại ảnh gốc 15 lần. */
const nhoBoiCanh = new Map<string, { luc: number; p: Promise<BoiCanhAnhChinh> }>();
const NHO_BOI_CANH_MS = 15_000;

export function docBoiCanhAnhChinhCoNho(db: SupabaseClient, galleryId: string): Promise<BoiCanhAnhChinh> {
  const co = nhoBoiCanh.get(galleryId);
  if (co && Date.now() - co.luc < NHO_BOI_CANH_MS) return co.p;
  const p = docBoiCanhAnhChinh(db, galleryId);
  p.catch(() => nhoBoiCanh.delete(galleryId));
  nhoBoiCanh.set(galleryId, { luc: Date.now(), p });
  if (nhoBoiCanh.size > 200) nhoBoiCanh.delete(nhoBoiCanh.keys().next().value!);
  return p;
}

/** Tấm ảnh chỉnh trong bối cảnh này khách đã được thấy chưa. */
export function khachThayTrongBoiCanh(bc: BoiCanhAnhChinh, trangThaiBo: string, a: AnhChinhTho): boolean {
  return khachThayAnhChinhTheoDot({
    trangThaiBo,
    khoa: bc.khoaCua.get(a.id) ?? KHOA_TRONG_GOI,
    mocChung: bc.mocChung,
    mocDot: bc.mocDot,
    anhTaoLuc: a.created_at,
  });
}

export interface VongSuaTho {
  id: string;
  round: number;
  note: string;
  created_at: string;
  resolved_at: string | null;
  /** 0095; chưa áp → luôn null. null = trong gói. */
  dot_khoa: string | null;
}

/** Các vòng xin sửa của bộ (kèm `dot_khoa` khi đã áp 0095). */
export async function docVongSua(db: SupabaseClient, galleryId: string, tangDan: boolean): Promise<VongSuaTho[]> {
  const hoi = (cot: string) =>
    db.from("revision_requests").select(cot).eq("gallery_id", galleryId).order("round", { ascending: tangDan });
  let { data, error } = await hoi("id, round, note, created_at, resolved_at, dot_khoa");
  if (error && laLoiChuaCoBang(error)) ({ data, error } = await hoi("id, round, note, created_at, resolved_at"));
  if (error) throw error;
  return ((data ?? []) as unknown as Partial<VongSuaTho>[]).map((v) => ({
    id: v.id!,
    round: v.round!,
    note: v.note ?? "",
    created_at: v.created_at!,
    resolved_at: v.resolved_at ?? null,
    dot_khoa: v.dot_khoa ?? null,
  }));
}

/**
 * Cho route ảnh (`/api/img`): mốc gửi + đợt của MỘT tấm ảnh chỉnh. Chỉ ghép ảnh gốc
 * khi bộ thật sự có đợt mua thêm và đã áp 0095 (có bản nhớ 15 giây theo bộ).
 */
export async function docCongAnhChinh(
  db: SupabaseClient,
  galleryId: string,
  photoId: string,
): Promise<{ guiLuc: string | null; mocDot: Map<string, MocDot> | null; khoa: string }> {
  const [guiLuc, mocDot] = await Promise.all([docMocGui(db, galleryId), docMocDot(db, galleryId)]);
  if (mocDot === null) return { guiLuc, mocDot, khoa: KHOA_TRONG_GOI };
  const nhom = await docNhomMuaThem(db, galleryId);
  if (nhom.length === 0) return { guiLuc, mocDot, khoa: KHOA_TRONG_GOI };
  let bc = await docBoiCanhAnhChinhCoNho(db, galleryId);
  // Tấm mới đồng bộ sau bản nhớ: đọc lại, không đoán nó là "trong gói".
  if (!bc.khoaCua.has(photoId)) {
    nhoBoiCanh.delete(galleryId);
    bc = await docBoiCanhAnhChinhCoNho(db, galleryId);
  }
  return { guiLuc, mocDot, khoa: bc.khoaCua.get(photoId) ?? KHOA_TRONG_GOI };
}
