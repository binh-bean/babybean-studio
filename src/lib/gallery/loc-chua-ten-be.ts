/**
 * BB-379 — bộ lọc "Chưa có tên bé" của danh sách bộ ảnh quản trị.
 *
 * `get_admin_galleries` (RPC 0068) không có tham số này và đổi hàm SQL là đổi hợp đồng chung,
 * nên route đọc các trang của RPC rồi lọc ở máy chủ. Bộ chưa có bé trả `babyName`/`babyFullName`
 * rỗng (RPC lấy từ `babies` qua `galleries.baby_id`).
 */

export interface DongCoTenBe {
  babyName?: unknown;
  babyFullName?: unknown;
}

const trong = (v: unknown): boolean => typeof v !== "string" || v.trim() === "";

/** Bộ chưa có tên bé nào: không nickname, không họ tên. */
export function chuaCoTenBe(item: DongCoTenBe): boolean {
  return trong(item.babyName) && trong(item.babyFullName);
}

/**
 * Cắt trang cho danh sách đã lọc. Con trỏ là vị trí TRONG DANH SÁCH ĐÃ LỌC (không phải vị trí
 * trong RPC), nên đổi trang không lệch dù lọc loại bao nhiêu dòng.
 */
export function catTrang<T>(daLoc: readonly T[], offset: number, limit: number): { items: T[]; hasMore: boolean } {
  const items = daLoc.slice(offset, offset + limit);
  return { items, hasMore: offset + limit < daLoc.length };
}

/** Đếm theo trạng thái trên danh sách đã lọc — cùng dạng với `counts` của RPC (`all` + từng trạng thái). */
export function demTheoTrangThai(daLoc: ReadonlyArray<{ status?: unknown }>): Record<string, number> {
  const counts: Record<string, number> = { all: daLoc.length };
  for (const r of daLoc) {
    const s = typeof r.status === "string" ? r.status : "";
    if (s) counts[s] = (counts[s] ?? 0) + 1;
  }
  return counts;
}
