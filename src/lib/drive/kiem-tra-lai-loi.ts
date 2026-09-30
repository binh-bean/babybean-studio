/**
 * BB-326 mục 5 — bộ ảnh lỗi Drive TỰ LÀNH khi thư mục đã được chia sẻ.
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần
 * ---------------------------------------------------------------------------
 * 29/09/2026 có 76 bộ mang `sync_error = "Thư mục chưa được chia sẻ công khai"`
 * (73 bộ trạng thái `sync_error`, 3 bộ `in_review`), cả 76 bộ 0 ảnh. Nhân
 * viên đã bật chia sẻ, nhưng KHÔNG có gì chạy lại: lỗi chỉ được xoá khi có ai
 * bấm đồng bộ đúng bộ đó (`batDauDongBo` xoá `sync_error`), và không cron nào
 * đụng tới bộ lỗi. Nên màn hình cứ báo lỗi mãi.
 *
 * ---------------------------------------------------------------------------
 * Cách kiểm, và giữ trong hạn mức Drive
 * ---------------------------------------------------------------------------
 * Mỗi bộ đi qua HAI bước:
 *   1. MỘT lời gọi metadata thư mục (`assertFolderReadable`). Vẫn không đọc
 *      được thì dừng ở đây — ghi lại đúng lý do, không đổi trạng thái. 76 bộ
 *      là 76 lời gọi, nhỏ hơn rất xa trần 10.000 lời gọi / 100 giây.
 *   2. Đọc được thì đồng bộ đầy đủ bằng CHÍNH đường `batDauDongBo` →
 *      `dongBoBoAnh` của nút "Đồng bộ lại" (không chép logic): lỗi được xoá,
 *      ảnh kéo về, bộ đang ở giai đoạn đầu chuyển `ready`.
 *
 * Chạy TUẦN TỰ, có trần số bộ và mốc hết giờ (route Vercel sống tối đa 60s).
 * Bộ lấy theo `updated_at` tăng dần; bước 1 hỏng vẫn ghi lại `sync_error`
 * (trigger đẩy `updated_at`), nên lượt sau tự xoay sang những bộ chưa kiểm.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertFolderReadable } from "./list-files";
import {
  batDauDongBo,
  dongBoBoAnh,
  ghiLoiDongBo,
  moTaLoi,
  GalleryNotFoundError,
} from "./sync-gallery";

export interface KetQuaKiemTraLai {
  galleryId: string;
  /** true: Drive đọc được, đã đồng bộ xong, lỗi đã xoá. */
  hetLoi: boolean;
  soAnh?: number;
  /** Lý do còn lỗi, câu tiếng Việt cho nhân viên đọc. */
  loi?: string;
}

/** Kiểm lại MỘT bộ. Không ném lỗi Drive — trả kết quả để chỗ gọi báo lại. */
export async function kiemTraLaiMotBo(
  db: SupabaseClient,
  galleryId: string,
  requestId: string,
): Promise<KetQuaKiemTraLai> {
  const { data: g, error } = await db
    .from("galleries")
    .select("drive_folder_id")
    .eq("id", galleryId)
    .maybeSingle();
  if (error) throw error;
  if (!g) throw new GalleryNotFoundError(galleryId);

  const folderId = (g.drive_folder_id as string | null) ?? "";
  if (!folderId) return { galleryId, hetLoi: false, loi: "Chưa gắn thư mục Drive" };

  // Bước 1 — một lời gọi rẻ.
  try {
    await assertFolderReadable(folderId, { requestId, folderId });
  } catch (err) {
    const loi = moTaLoi(err);
    // BB-336: ghi hụt thì phải kêu (BB-190) — `sync_error` không được ghi thì
    // `updated_at` không nhích, lượt sau cứ quay lại đúng bộ này mà không ai
    // biết. Ném lên giống `ghiLoiDongBo`: `kiemTraLaiCacBoLoi` bắt từng bộ và
    // ghi console, route một bộ trả lỗi chung.
    const { error: loiGhi } = await db.from("galleries").update({ sync_error: loi }).eq("id", galleryId);
    if (loiGhi) throw loiGhi;
    return { galleryId, hetLoi: false, loi };
  }

  // Bước 2 — đồng bộ đầy đủ, cùng đường với nút "Đồng bộ lại".
  const thongTin = await batDauDongBo(db, galleryId);
  try {
    const kq = await dongBoBoAnh(db, galleryId, thongTin, requestId);
    return { galleryId, hetLoi: true, soAnh: kq.photoCount };
  } catch (err) {
    await ghiLoiDongBo(db, galleryId, thongTin.giaiDoanDau, err);
    return { galleryId, hetLoi: false, loi: moTaLoi(err) };
  }
}

export interface KetQuaKiemTraLaiNhieu {
  /** Số bộ đang lỗi TRƯỚC lượt này (trong phạm vi chi nhánh). */
  loiTruoc: number;
  daKiem: number;
  hetLoi: number;
  vanLoi: number;
  /** Số bộ còn lỗi SAU lượt này (đếm lại, không suy ra). */
  loiSau: number;
  /** Có bộ lỗi chưa tới lượt (chạm trần số bộ hoặc hết giờ). */
  conChuaKiem: boolean;
}

/**
 * Kiểm lại mọi bộ đang lỗi trong phạm vi `branchIds` (null = mọi chi nhánh,
 * chỉ dùng cho cron). Tuần tự, dừng khi chạm `gioiHan` bộ hoặc qua `hetGioLuc`.
 */
export async function kiemTraLaiCacBoLoi(
  db: SupabaseClient,
  opts: {
    branchIds: string[] | null;
    gioiHan: number;
    hetGioLuc: number;
    requestId: string;
  },
): Promise<KetQuaKiemTraLaiNhieu> {
  const demLoi = async () => {
    let q = db.from("galleries").select("id", { count: "exact", head: true }).not("sync_error", "is", null);
    if (opts.branchIds) q = q.in("branch_id", opts.branchIds);
    const { count, error } = await q;
    if (error) throw error;
    return count ?? 0;
  };

  const loiTruoc = await demLoi();

  let q = db
    .from("galleries")
    .select("id")
    .not("sync_error", "is", null)
    .order("updated_at", { ascending: true })
    .limit(opts.gioiHan);
  if (opts.branchIds) q = q.in("branch_id", opts.branchIds);
  const { data: rows, error } = await q;
  if (error) throw error;

  let daKiem = 0;
  let hetLoi = 0;
  for (const r of (rows ?? []) as { id: string }[]) {
    if (Date.now() > opts.hetGioLuc) break;
    try {
      const kq = await kiemTraLaiMotBo(db, r.id, `${opts.requestId}:${r.id.slice(0, 8)}`);
      if (kq.hetLoi) hetLoi += 1;
    } catch (err) {
      // Một bộ hỏng bất ngờ (lỗi cơ sở dữ liệu) không được kéo cả lượt chết.
      console.error(
        JSON.stringify({
          evt: "kiem_tra_lai_loi.mot_bo_hong",
          galleryId: r.id,
          lyDo: err instanceof Error ? err.message : String(err),
        }),
      );
    }
    daKiem += 1;
  }

  const loiSau = await demLoi();
  return {
    loiTruoc,
    daKiem,
    hetLoi,
    vanLoi: daKiem - hetLoi,
    loiSau,
    conChuaKiem: loiTruoc > daKiem,
  };
}
