/**
 * BB-409 — chặn đồng bộ Lark SINH LẠI bộ ảnh đã xoá.
 *
 * Bộ ảnh vào app từ dòng Hậu Kỳ bên Lark (hook `/api/lark/hook`, cron hậu kỳ,
 * nút "Đồng bộ", khối "Bản ghi mới từ Lark") — tất cả đi qua
 * `syncSingleRetouchRecord`. Studio xoá bộ trên app nhưng dòng Lark vẫn còn, nên
 * không chặn thì lượt đồng bộ kế tiếp tạo lại đúng bộ vừa xoá.
 *
 * Dấu nằm ở bảng `bo_anh_da_xoa` (0109) và sống tiếp sau khi dọn hẳn. Admin bỏ
 * dấu ("Cho Lark tạo lại") thì dòng đó đồng bộ lại bình thường. Không ghi gì lên Lark.
 */
import { bamThuMucDrive, laDongBiChan, type DauDaXoa } from "./thung-rac";

/** Tối thiểu cái `pg.Client` cần có — để phép thử dựng được bằng dữ liệu giả. */
export interface CoTheQuery {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export async function dongLarkBiChan(
  client: CoTheQuery,
  dong: { recordId?: string | null; driveFolderId?: string | null },
): Promise<boolean> {
  const recordId = dong.recordId ?? null;
  const bam = bamThuMucDrive(dong.driveFolderId);
  if (!recordId && !bam) return false;
  try {
    const kq = await client.query(
      `select lark_hauky_record_id, drive_folder_hash, bo_dau_luc
         from bo_anh_da_xoa
        where bo_dau_luc is null
          and (lark_hauky_record_id = $1 or drive_folder_hash = $2)
        limit 5`,
      [recordId, bam],
    );
    const rows = (kq?.rows ?? []) as DauDaXoa[];
    return laDongBiChan(rows, { recordId, driveFolderId: dong.driveFolderId });
  } catch (err) {
    // Chưa áp 0109 (bảng chưa có) → chưa ai xoá được bộ nào → không có gì để chặn.
    if ((err as { code?: string })?.code === "42P01") return false;
    throw err;
  }
}
