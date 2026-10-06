/**
 * BB-371 — dữ liệu thử "ảnh chỉnh sửa": nền Fixture riêng (chi nhánh + khách
 * "Fixture BB-371 …"), mỗi bộ ảnh có 4 ảnh gốc (thư mục "JPG") + 2 ảnh trong
 * thư mục con "anh chinh sua" (một tấm "-Edit", một tấm trùng tên gốc).
 * Dọn theo id bằng `donNenFixture` (bộ ảnh cascade ảnh/link/vòng sửa/giao).
 * Dữ liệu giả theo AGENTS.md §6.
 */
import type { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { dungNenFixture, type NenFixture } from "./nen-fixture";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export interface BoBb371 {
  id: string;
  customerId: string;
  maBaMe: string;
  selectionId: string;
  ownerLinkId: string;
  goc: { id: string; fileName: string }[];
  chinh: { id: string; fileName: string }[];
}

export async function dungBoBb371(
  pg: Client,
  nen: NenFixture,
  ten: string,
  opts: { status: string; customerId?: string; daGui?: boolean },
): Promise<BoBb371> {
  const customerId = opts.customerId ?? nen.customerId;
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, extra_photo_price, download_enabled)
     values ($1,$2,$3,$4,$5,'https://example.com/bb371',6,4,50000,false) returning id`,
    [nen.branchId, customerId, `Fixture BB-371 ${nen.runId} ${ten}`, opts.status, `SEED_FOLDER_ID_BB371_${nen.runId}_${ten}`],
  );
  const id = g[0].id as string;
  const goc: BoBb371["goc"] = [];
  const chinh: BoBb371["chinh"] = [];
  const them = async (fileName: string, subfolder: string, i: number) => {
    const { rows } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, subfolder, width, height,
                           created_at)
       values ($1,$2,$3,'image/jpeg',$4,'active',$5,1200,1800, now() - interval '1 hour') returning id`,
      [id, `bb371fixture${nen.runId}${ten}${i}`, fileName, i, subfolder],
    );
    return rows[0].id as string;
  };
  // "anh chinh sua" xếp trước "JPG" theo tên thư mục, đúng thứ tự đồng bộ Drive.
  chinh.push({ id: await them("IMG_0001-Edit.jpg", "anh chinh sua", 1), fileName: "IMG_0001-Edit.jpg" });
  chinh.push({ id: await them("IMG_0003.jpg", "anh chinh sua", 2), fileName: "IMG_0003.jpg" });
  for (let i = 1; i <= 4; i++) {
    const fileName = `IMG_000${i}.jpg`;
    goc.push({ id: await them(fileName, "JPG", i + 2), fileName });
  }
  const maBaMe = randomBytes(32).toString("base64url");
  const { rows: l } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
     values ($1,$2,$3,'owner','active') returning id`,
    [id, sha256(maBaMe), maBaMe.slice(0, 6)],
  );
  const { rows: s } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary) values ($1,$2,$3,true) returning id`,
    [id, l[0].id, `Fixture BB-371 ${nen.runId} ${ten}`],
  );
  if (opts.daGui) {
    await pg.query(
      `insert into deliveries (gallery_id, branch_id, status, updated_at) values ($1,$2,'ready', now())`,
      [id, nen.branchId],
    );
  }
  return { id, customerId, maBaMe, selectionId: s[0].id, ownerLinkId: l[0].id, goc, chinh };
}

export async function dungNenBb371(pg: Client): Promise<{ nen: NenFixture; customerB: string }> {
  const nen = await dungNenFixture(pg, "BB-371");
  const { rows } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000002') returning id`,
    [nen.branchId, `Fixture BB-371 Khách B ${nen.runId}`],
  );
  return { nen, customerB: rows[0].id as string };
}
