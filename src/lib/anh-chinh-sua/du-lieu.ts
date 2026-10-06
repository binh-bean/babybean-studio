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
import { laThuMucChinhSua } from "./nhan-dien";

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
 * Tóm tắt cho màn khách (route bộ ảnh): ảnh chỉnh + mốc gửi. KHÔNG BAO GIỜ NÉM —
 * đọc hỏng thì coi như chưa có ảnh chỉnh (màn khách giữ đúng như trước BB-371).
 */
export async function docTomTatAnhChinh(
  db: SupabaseClient,
  galleryId: string,
): Promise<{ anh: AnhChinhTho[]; guiLuc: string | null }> {
  try {
    const anh = await docAnhChinh(db, galleryId);
    if (anh.length === 0) return { anh, guiLuc: null };
    return { anh, guiLuc: await docMocGui(db, galleryId) };
  } catch {
    return { anh: [], guiLuc: null };
  }
}
