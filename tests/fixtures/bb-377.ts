/**
 * BB-377 — dữ liệu thử "ảnh chỉnh của ảnh MUA THÊM": dựng trên bộ BB-371 (4 ảnh gốc
 * + 2 ảnh chỉnh trong gói), thêm 2 ảnh gốc IMG_0005/IMG_0006 được mua ở ĐỢT 2
 * (`selection_rounds` đã xác nhận) và 2 ảnh chỉnh của chúng trong cùng thư mục
 * "anh chinh sua", về SAU lần gửi khách trong gói. Dữ liệu giả theo AGENTS.md §6;
 * dọn theo id bằng `donNenFixture` (bộ ảnh cascade ảnh/đợt/vòng sửa/giao).
 */
import type { Client } from "pg";
import type { NenFixture } from "./nen-fixture";
import { dungBoBb371, type BoBb371 } from "./bb-371";

export interface BoBb377 extends BoBb371 {
  gocMuaThem: { id: string; fileName: string }[];
  chinhMuaThem: { id: string; fileName: string }[];
}

export async function dungBoBb377(
  pg: Client,
  nen: NenFixture,
  ten: string,
  opts: { status: string; customerId?: string; guiTrongGoi?: boolean },
): Promise<BoBb377> {
  const bo = await dungBoBb371(pg, nen, ten, { status: opts.status, customerId: opts.customerId });
  const them = async (fileName: string, subfolder: string, i: number, tuoi: string) => {
    const { rows } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, subfolder, width, height, created_at)
       values ($1,$2,$3,'image/jpeg',$4,'active',$5,1200,1800, now() - $6::interval) returning id`,
      [bo.id, `bb377fixture${nen.runId}${ten}${i}`, fileName, i, subfolder, tuoi],
    );
    return { id: rows[0].id as string, fileName };
  };
  const gocMuaThem = [await them("IMG_0005.jpg", "JPG", 7, "1 hour"), await them("IMG_0006.jpg", "JPG", 8, "1 hour")];
  // Ảnh chỉnh mua thêm về SAU lần gửi trong gói (mốc chung = 30 phút trước).
  const chinhMuaThem = [
    await them("IMG_0005-Edit.jpg", "anh chinh sua", 9, "5 minutes"),
    await them("IMG_0006-Edit.jpg", "anh chinh sua", 10, "5 minutes"),
  ];
  await pg.query(
    `insert into selection_rounds (gallery_id, selection_id, so_dot, trang_thai, so_anh, so_anh_tinh_tien, anh_ids, confirmed_at)
     values ($1,$2,2,'da_xac_nhan',2,2,$3::uuid[], now() - interval '50 minutes')`,
    [bo.id, bo.selectionId, gocMuaThem.map((g) => g.id)],
  );
  if (opts.guiTrongGoi) {
    // Ảnh trong gói đã gửi khách 30 phút trước (mốc chung) — ảnh mua thêm về sau đó.
    await pg.query(
      `insert into deliveries (gallery_id, branch_id, status, updated_at) values ($1,$2,'ready', now() - interval '30 minutes')`,
      [bo.id, nen.branchId],
    );
    await pg
      .query(`update deliveries set anh_chinh_gui_luc = now() - interval '30 minutes' where gallery_id = $1`, [bo.id])
      .catch(() => {});
  }
  return { ...bo, gocMuaThem, chinhMuaThem };
}
