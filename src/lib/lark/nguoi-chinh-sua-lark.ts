/**
 * BB-369 mục 5 (chủ studio 06/10/2026): "người chỉnh sửa" của bộ ảnh lấy từ hai
 * cột bảng Hậu Kỳ bên Lark, hiện ở màn chi tiết bộ ảnh cạnh người chụp.
 *
 * Schema Lark đo 06/10/2026 (chỉ đọc, API fields):
 *   - "Người Photoshop" — kiểu Người (User, type 11): ô = [{ id, name, en_name }]
 *   - "Photoshop CTV"   — chọn một (SingleSelect, type 3): ô = "Tên CTV"
 * `tenPhotoTuO` (photo-hau-ky.ts) đọc được cả hai hình dạng.
 *
 * Lưu text vào `galleries.lark_nguoi_photoshop` + `galleries.lark_photoshop_ctv`
 * (migration 0094, VIẾT CHƯA ÁP). Chưa áp: đọc trả null, ghi bỏ qua êm — không
 * ném, không 500, không làm hỏng lượt ghi trạng thái/photo.
 */
import type pg from "pg";
import type { createAdminClient } from "@/lib/supabase/admin";
import { tenPhotoTuO } from "@/lib/lark/photo-hau-ky";
import type { NguoiChinhSua } from "@/lib/lark/nguoi-chinh-sua-ten";

export { nhanNguoiChinhSua, type NguoiChinhSua } from "@/lib/lark/nguoi-chinh-sua-ten";

export const COT_NGUOI_PHOTOSHOP = /^\s*ng[uư][oờ]i\s*photoshop\s*$/i;
export const COT_PHOTOSHOP_CTV = /^\s*photoshop\s*ctv\s*$/i;

/** Ô Lark → tên (thuần). */
export function tenNguoiChinhSua(v: unknown): string | null {
  return tenPhotoTuO(v);
}

/** Lỗi "cột chưa có" (0094 chưa áp) — Postgres 42703 hoặc PostgREST. */
export function laThieuCotNguoiChinhSua(err: unknown): boolean {
  if (!err) return false;
  const e = err as { code?: string; message?: string };
  return e.code === "42703" || /lark_nguoi_photoshop|lark_photoshop_ctv/i.test(e.message ?? "");
}

export async function coCotNguoiChinhSua(client: pg.Client | pg.PoolClient): Promise<boolean> {
  const { rows } = await client.query<{ c: number }>(
    `select count(*)::int as c from information_schema.columns
      where table_schema = 'public' and table_name = 'galleries'
        and column_name in ('lark_nguoi_photoshop', 'lark_photoshop_ctv')`,
  );
  return (rows[0]?.c ?? 0) === 2;
}

/**
 * Ghi người chỉnh sửa theo mã dòng Lark. Dòng mà lượt đọc KHÔNG đọc hai cột
 * (undefined) thì không đụng. Chỉ cập nhật dòng đổi giá trị.
 */
export async function ghiNguoiChinhSuaVaoGalleries(
  client: pg.Client | pg.PoolClient,
  doc: Map<string, { nguoiPhotoshop?: string | null; photoshopCtv?: string | null }>,
): Promise<{ doi: number; chuaApMigration: boolean }> {
  const coDoc = [...doc.entries()].filter(([, d]) => d.nguoiPhotoshop !== undefined || d.photoshopCtv !== undefined);
  if (coDoc.length === 0) return { doi: 0, chuaApMigration: false };
  if (!(await coCotNguoiChinhSua(client))) return { doi: 0, chuaApMigration: true };
  const { rows } = await client.query<{
    id: string;
    lark_hauky_record_id: string;
    lark_nguoi_photoshop: string | null;
    lark_photoshop_ctv: string | null;
  }>(
    `select id, lark_hauky_record_id, lark_nguoi_photoshop, lark_photoshop_ctv from galleries
      where lark_hauky_record_id = any($1::text[]) and status <> 'archived'`,
    [coDoc.map(([r]) => r)],
  );
  let doi = 0;
  for (const g of rows) {
    const d = doc.get(g.lark_hauky_record_id);
    if (!d) continue;
    const ps = d.nguoiPhotoshop === undefined ? g.lark_nguoi_photoshop : d.nguoiPhotoshop;
    const ctv = d.photoshopCtv === undefined ? g.lark_photoshop_ctv : d.photoshopCtv;
    if ((g.lark_nguoi_photoshop ?? null) === (ps ?? null) && (g.lark_photoshop_ctv ?? null) === (ctv ?? null)) continue;
    await client.query(`update galleries set lark_nguoi_photoshop = $2, lark_photoshop_ctv = $3 where id = $1`, [
      g.id,
      ps ?? null,
      ctv ?? null,
    ]);
    doi++;
  }
  return { doi, chuaApMigration: false };
}

type KhachSupabase = ReturnType<typeof createAdminClient>;

/** Đọc cho màn chi tiết bộ ảnh. 0094 chưa áp → null cả hai, không ném. */
export async function docNguoiChinhSua(admin: KhachSupabase, galleryId: string): Promise<NguoiChinhSua> {
  const rong: NguoiChinhSua = { nguoiPhotoshop: null, photoshopCtv: null };
  const { data, error } = await admin
    .from("galleries")
    .select("lark_nguoi_photoshop, lark_photoshop_ctv")
    .eq("id", galleryId)
    .maybeSingle();
  if (error) {
    if (!laThieuCotNguoiChinhSua(error)) {
      console.error(JSON.stringify({ evt: "lark_nguoi_chinh_sua_doc_loi", loi: (error as { message?: string }).message }));
    }
    return rong;
  }
  const r = (data ?? null) as { lark_nguoi_photoshop?: string | null; lark_photoshop_ctv?: string | null } | null;
  return { nguoiPhotoshop: r?.lark_nguoi_photoshop ?? null, photoshopCtv: r?.lark_photoshop_ctv ?? null };
}
