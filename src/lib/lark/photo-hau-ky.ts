/**
 * BB-335 — cột "photo" của bảng Hậu Kỳ bên Lark → `galleries.lark_photo`.
 *
 * Đo schema Lark 30/09/2026 (chỉ đọc): cột tên "photo" (chữ thường), kiểu
 * Lookup (type 19) tra một cột NGƯỜI (User) ở bảng khác. API bản ghi trả ô dạng
 * `{ users: [{ id, userId, name, enName, notify }] }`; ô trống thì khoá vắng.
 * Hàm bóc chấp nhận thêm các hình dạng khác (User thường = mảng người, Text,
 * chọn-một) để nếu ai đổi kiểu cột bên Lark thì app vẫn đọc ra tên, không ra
 * "[object Object]".
 *
 * Ghi ở `ghiTrangThaiVaoGalleries` (doc-trang-thai-lark.ts) — cùng chỗ cron
 * /api/cron/hau-ky và hook Lark đã ghi trạng thái. CHỈ ĐỌC Lark.
 *
 * Migration 0081 (CHƯA ÁP) thêm cột. Chưa áp thì mọi hàm ở đây trả rỗng /
 * `chuaApMigration: true`, không ném, không 500 — cùng cách BB-332.
 */
import type pg from "pg";
import type { createAdminClient } from "@/lib/supabase/admin";

/** Tên cột bên Lark: "photo"/"Photo", bỏ khoảng trắng thừa. */
export const COT_PHOTO_LARK = /^\s*photo\s*$/i;

function tenNguoi(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string") return x.trim();
  if (typeof x === "number") return String(x);
  if (typeof x === "object") {
    const o = x as Record<string, unknown>;
    const v = o.name ?? o.enName ?? o.en_name ?? o.text ?? "";
    return typeof v === "string" ? v.trim() : "";
  }
  return "";
}

/**
 * Ô "photo" của Lark → tên thợ chụp ("A, B" khi nhiều người), null khi trống.
 * HÀM THUẦN — phép thử đơn vị canh.
 */
export function tenPhotoTuO(v: unknown): string | null {
  let ds: string[] = [];
  if (v == null) ds = [];
  else if (Array.isArray(v)) ds = v.map(tenNguoi);
  else if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.users)) ds = o.users.map(tenNguoi);
    // Lookup qua API search: { type, value: [...] }
    else if (Array.isArray(o.value)) ds = o.value.map(tenNguoi);
    else ds = [tenNguoi(o)];
  } else ds = [tenNguoi(v)];
  const sach = [...new Set(ds.map((t) => t.trim()).filter(Boolean))];
  return sach.length ? sach.join(", ") : null;
}

/** Lỗi "cột lark_photo chưa có" (0081 chưa áp) — Postgres 42703 hoặc PostgREST. */
export function laThieuCotLarkPhoto(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  return e.code === "42703" || /lark_photo/i.test(e.message ?? "");
}

/** Cột galleries.lark_photo đã có chưa (đường `pg`). */
export async function coCotLarkPhoto(client: pg.Client | pg.PoolClient): Promise<boolean> {
  const { rows } = await client.query<{ c: number }>(
    `select count(*)::int as c from information_schema.columns
      where table_schema = 'public' and table_name = 'galleries' and column_name = 'lark_photo'`,
  );
  return (rows[0]?.c ?? 0) > 0;
}

type KhachSupabase = ReturnType<typeof createAdminClient>;

/** Đọc lark_photo cho một loạt bộ ảnh. Chưa áp 0081 → map rỗng + cờ. */
export async function docLarkPhoto(
  admin: KhachSupabase,
  ids: string[],
): Promise<{ theoBo: Map<string, string | null>; chuaApMigration: boolean }> {
  const theoBo = new Map<string, string | null>();
  if (ids.length === 0) return { theoBo, chuaApMigration: false };
  const { data, error } = await admin.from("galleries").select("id, lark_photo").in("id", ids);
  if (error) {
    if (laThieuCotLarkPhoto(error)) return { theoBo, chuaApMigration: true };
    console.error(JSON.stringify({ evt: "lark_photo_doc_loi", loi: (error as { message?: string }).message }));
    return { theoBo, chuaApMigration: false };
  }
  for (const r of (data ?? []) as { id: string; lark_photo: string | null }[]) {
    theoBo.set(String(r.id), r.lark_photo ?? null);
  }
  return { theoBo, chuaApMigration: false };
}

/**
 * Các giá trị KHÁC NHAU của lark_photo — lựa chọn cho bộ lọc "Photo" ở danh
 * sách bộ ảnh. Nhân viên không gõ tay. "A, B" (nhiều thợ) tách thành A và B.
 */
export async function danhSachPhoto(
  admin: KhachSupabase,
): Promise<{ ds: string[]; chuaApMigration: boolean }> {
  const { data, error } = await admin.from("galleries").select("lark_photo").not("lark_photo", "is", null).limit(10000);
  if (error) return { ds: [], chuaApMigration: laThieuCotLarkPhoto(error) };
  return { ds: gopGiaTriPhoto((data ?? []).map((r) => (r as { lark_photo: string | null }).lark_photo)), chuaApMigration: false };
}

/** Hàm thuần: gộp, tách "A, B", bỏ trùng, xếp theo tiếng Việt. */
export function gopGiaTriPhoto(ds: (string | null)[]): string[] {
  const tap = new Set<string>();
  for (const v of ds) for (const t of String(v ?? "").split(",")) if (t.trim()) tap.add(t.trim());
  return [...tap].sort((a, b) => a.localeCompare(b, "vi"));
}
