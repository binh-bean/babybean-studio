/**
 * BB-334B — dữ liệu thử màn khách link gia đình, dựng TRÊN fixture BB-334A
 * (tests/fixtures/bb-334a.ts — chi nhánh riêng "Fixture BB-334A-…", khách A có
 * 2 bộ A1/A2 + link gia đình sống + link cũ theo bộ A1; khách B một bộ).
 *
 * Thêm cho giống bản vẽ: một bé (biệt danh giả "Mít"), hai buổi chụp có ngày,
 * tên bộ, ảnh bìa (ảnh giả qua mock — không người). Mọi dòng thêm được dọn THEO
 * ID ở `donBb334b` trước khi gọi `donBb334a` (dọn và đọc lại của BB-334A).
 */
import { taoBb334a, donBb334a, type DuLieuBb334a } from "./bb-334a";

export interface DuLieuBb334b extends DuLieuBb334a {
  beId: string;
  shootIds: string[];
}

export async function taoBb334b(): Promise<DuLieuBb334b> {
  const d = await taoBb334a();
  const { pg } = d;
  const them: { beId?: string; shootIds: string[] } = { shootIds: [] };
  try {
    const { rows: be } = await pg.query(
      `insert into babies (customer_id, full_name, nickname) values ($1, $2, 'Mít') returning id`,
      [d.khachA, `Fixture BB-334B-${d.runId} Mít`],
    );
    them.beId = be[0].id as string;
    const buoi = async (boId: string, ngay: string, tieuDe: string, anhBia: string) => {
      const { rows } = await pg.query(
        `insert into shoots (branch_id, customer_id, baby_id, shoot_date) values ($1,$2,$3,$4) returning id`,
        [d.branchId, d.khachA, them.beId, ngay],
      );
      them.shootIds.push(rows[0].id as string);
      await pg.query(
        `update galleries set shoot_id = $2, baby_id = $3, title = $4, cover_photo_id = $5 where id = $1`,
        [boId, rows[0].id, them.beId, tieuDe, anhBia],
      );
    };
    // A1 tạo trước (số thứ tự 1), A2 tạo sau (số thứ tự 2) — xem fixture BB-334A.
    await buoi(d.A1.id, "2026-03-03", "Đầy tháng", d.A1.anh[0]!);
    await buoi(d.A2.id, "2026-09-12", "Thôi nôi", d.A2.anh[0]!);
    return { ...d, beId: them.beId, shootIds: them.shootIds };
  } catch (e) {
    await donBb334b({ ...d, beId: them.beId ?? "", shootIds: them.shootIds }).catch(() => {});
    throw e;
  }
}

export async function donBb334b(d: DuLieuBb334b): Promise<void> {
  const { pg } = d;
  const boIds = [d.A1?.id, d.A2?.id, d.B1?.id].filter(Boolean) as string[];
  await pg.query(
    `update galleries set shoot_id = null, baby_id = null, cover_photo_id = null where id = any($1::uuid[]) and branch_id = $2`,
    [boIds, d.branchId],
  );
  if (d.shootIds.length) {
    await pg.query(`delete from shoots where id = any($1::uuid[]) and branch_id = $2`, [d.shootIds, d.branchId]);
  }
  if (d.beId) await pg.query(`delete from babies where id = $1 and customer_id = $2`, [d.beId, d.khachA]);
  await donBb334a(d);
}
