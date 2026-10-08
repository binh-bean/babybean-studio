/**
 * Dữ liệu thử BB-395 (e2e) — xác nhận phát sinh bằng MÃ HOÁ ĐƠN, trên nền Fixture riêng
 * (`dungNenFixture`: chi nhánh + khách "Fixture BB-395 …"), dọn theo id ở `donDepBB395`.
 *
 * Khách Fixture mang `lark_customer_key = KHOA_KHACH_FIXTURE` — khớp khách của các hoá đơn GIẢ
 * (`HOA_DON_FIXTURE`, mã HD_20990101#9xxx). Máy chủ thử chạy với `PHEP_THU_TRINH_DUYET=1` nên
 * nguồn hoá đơn là nguồn giả: KHÔNG gọi Lark.
 *
 * Mỗi bộ: hạn mức gốc 10 (một dòng hợp đồng "Edit file × 10" dùng sản phẩm ảnh chỉnh sửa có sẵn
 * của danh mục — chỉ trỏ tới, không sửa), giá ảnh thêm 50.000, khách chọn N ảnh (ảnh giả,
 * không có người, không Drive):
 *   · khop  : `submitted`, chọn 12 (vượt 2), chụp lúc chốt 2 × 50.000 → HĐ 9002 (2 file) = Khớp.
 *   · thieu : `in_review`, chọn 12 (vượt 2) → HĐ 9004 (1 file) = Thiếu 1 → bỏ 1 → Khớp.
 *   · thua  : `in_review`, chọn 13 (vượt 3) → HĐ 9003 (5 file) = Thừa 2 → khách thấy "còn 2 ảnh".
 *   · haiBoD, haiBoE : cùng khách, mỗi bộ vượt 2; bộ E có dòng Hậu Kỳ MA_HAU_KY_FIXTURE → HĐ 9009 gợi ý E.
 *   · chuaNoi (BB-397): khách THỨ HAI, `lark_customer_key` NULL (như khách tạo bằng thuật sĩ);
 *     bộ có hoá đơn gốc 9011 (cùng khách nguồn với HĐ phát sinh 9012), vượt 2 → 9012 khớp qua
 *     hoá đơn gốc và app nối khoá `KHOA_KHACH_FIXTURE_CHUA_NOI` vào khách.
 * Hai nhân sự: CSKH (không có quyền nhập tay) và chủ studio.
 */
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";
import { dungNenFixture, donNenFixture } from "./nen-fixture";
import { KHOA_KHACH_FIXTURE, MA_HAU_KY_FIXTURE } from "@/lib/hoa-don/nguon-hoa-don";

export interface DuLieuBB395 {
  pg: Client;
  runId: string;
  branchId: string;
  customerId: string;
  /** BB-397: khách chưa nối khoá Lark. */
  khachChuaNoi: string;
  staffIds: string[];
  emailCs: string;
  emailOwner: string;
  password: string;
  bo: { khop: string; thieu: string; thua: string; haiBoD: string; haiBoE: string; dot2: string; dot2b: string; chuaNoi: string };
  /** Token link khách (chữ rõ) của bộ "thua" — để mở màn khách. */
  tokenThua: string;
}

async function taoBo(
  pg: Client,
  p: { branchId: string; customerId: string; runId: string; ten: string; status: string; soChon: number; chot: boolean; hauKy?: string; anhChinhId: string; maGoc?: string },
): Promise<{ id: string; token: string }> {
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            included_quota, extra_photo_price, photo_count, lark_hauky_record_id,
                            lark_contract_code, lark_contract_codes)
     values ($1,$2,$3,$4,$5,'https://example.com/x',10,50000,$6,$7,$8,$9) returning id`,
    [
      p.branchId,
      p.customerId,
      `Fixture BB-395-${p.runId} ${p.ten}`,
      p.status,
      `SEED_FOLDER_ID_395_${p.runId}_${p.ten}`,
      p.soChon,
      p.hauKy ?? null,
      p.maGoc ?? null,
      // `lark_contract_codes` NOT NULL (mặc định '{}') — bộ không có mã gốc là mảng rỗng, không phải null.
      p.maGoc ? [p.maGoc] : [],
    ],
  );
  const id = g[0].id as string;
  // Dòng hợp đồng gốc → hạn mức 10 (không phải dòng hoá đơn: `lark_record_id` riêng của phép thử).
  await pg.query(
    `insert into gallery_items (gallery_id, product_id, quantity, lark_contract_code, lark_record_id)
     values ($1,$2,10,null,$3)`,
    [id, p.anhChinhId, `fx395-goc-${p.runId}-${p.ten}`],
  );
  const token = randomBytes(16).toString("hex");
  const { rows: sl } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active') returning id`,
    [id, createHash("sha256").update(token).digest("hex"), token.slice(0, 6), `Fixture BB-395-${p.runId}`],
  );
  const vuot = Math.max(0, p.soChon - 10);
  const { rows: sel } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary, submitted_at,
                             snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
     values ($1,$2,'Fixture BB-395',true,$3,$4,$5,$6) returning id`,
    [id, sl[0].id, p.chot ? new Date().toISOString() : null, p.chot ? p.soChon : null, p.chot ? vuot : 0, p.chot ? vuot * 50000 : 0],
  );
  for (let i = 0; i < p.soChon; i++) {
    const { rows: ph } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
      [id, `bb395-${p.runId}-${p.ten}-${i}`, `R01_${String(i + 1).padStart(4, "0")}.JPG`, i + 1],
    );
    await pg.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index) values ($1,$2,$3,'selected',$4)`,
      [sel[0].id, ph[0].id, id, i + 1],
    );
  }
  return { id, token };
}

export async function duLieuBB395(): Promise<DuLieuBB395> {
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const nen = await dungNenFixture(pg, "BB-395");
  const password = "Password123!";
  const staffIds: string[] = [];
  let khachChuaNoi = "";
  try {
    await pg.query(`update customers set lark_customer_key = $1 where id = $2`, [KHOA_KHACH_FIXTURE, nen.customerId]);
    const { rows: sp } = await pg.query(
      `select id from products where kind = 'edited_photo' and is_active order by (lark_record_id is null), created_at limit 1`,
    );
    if (!sp[0]) throw new Error("Danh mục chưa có sản phẩm ảnh chỉnh sửa");
    const chung = { branchId: nen.branchId, customerId: nen.customerId, runId: nen.runId, anhChinhId: sp[0].id as string };
    const khop = await taoBo(pg, { ...chung, ten: "khop", status: "submitted", soChon: 12, chot: true });
    const thieu = await taoBo(pg, { ...chung, ten: "thieu", status: "in_review", soChon: 12, chot: false });
    const thua = await taoBo(pg, { ...chung, ten: "thua", status: "in_review", soChon: 13, chot: false });
    const haiBoD = await taoBo(pg, { ...chung, ten: "hai-bo-d", status: "in_review", soChon: 12, chot: false });
    const haiBoE = await taoBo(pg, { ...chung, ten: "hai-bo-e", status: "in_review", soChon: 12, chot: false, hauKy: `${MA_HAU_KY_FIXTURE}` });
    // Vòng 2/3 — bộ đã xác nhận đợt 1 (không vượt: 10/10), khách chọn thêm ĐỢT 2: 2 ảnh × 50.000
    // chờ xác nhận. `dot2` trả bằng hoá đơn; `dot2b` đi đường cũ (kiểm view 0103 không đếm ảnh đợt 2).
    const themDot2 = async (galleryId: string, ten: string) => {
      const { rows: s } = await pg.query(`select id from selections where gallery_id = $1 and is_primary`, [galleryId]);
      const anhIds: string[] = [];
      for (let i = 0; i < 2; i++) {
        const { rows: ph } = await pg.query(
          `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
           values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
          [galleryId, `bb395-${nen.runId}-${ten}-${i}`, `R02_${String(i + 1).padStart(4, "0")}.JPG`, 100 + i],
        );
        anhIds.push(ph[0].id as string);
        await pg.query(
          `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index, dot) values ($1,$2,$3,'selected',$4,2)`,
          [s[0].id, ph[0].id, galleryId, 100 + i],
        );
      }
      await pg.query(
        `insert into selection_rounds (gallery_id, selection_id, so_dot, trang_thai, so_anh, so_anh_tinh_tien, gia_moi_anh,
                                       tien_anh, tien_san_pham, anh_ids)
         values ($1,$2,2,'cho_xac_nhan',2,2,50000,100000,0,$3)`,
        [galleryId, s[0].id, anhIds],
      );
    };
    const dot2 = await taoBo(pg, { ...chung, ten: "dot-2", status: "in_retouch", soChon: 10, chot: true });
    await themDot2(dot2.id, "dot2");
    const dot2b = await taoBo(pg, { ...chung, ten: "dot-2b", status: "in_retouch", soChon: 10, chot: true });
    await themDot2(dot2b.id, "dot2b");
    // BB-397: khách thứ hai KHÔNG có khoá Lark + bộ mang hoá đơn gốc giả 9011.
    const { rows: kc } = await pg.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [
      nen.branchId,
      `Fixture BB-397-${nen.runId} Nguyễn Thị Mai`,
    ]);
    khachChuaNoi = kc[0].id as string;
    const chuaNoi = await taoBo(pg, {
      ...chung,
      customerId: khachChuaNoi,
      ten: "chua-noi",
      status: "in_review",
      soChon: 12,
      chot: false,
      maGoc: "HD_20990101#9011",
    });

    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const taoNv = async (vai: "cs" | "owner") => {
      const email = `fixture.bb395.${vai}.${nen.runId}@demo.babybean.vn`;
      const r = await supa.auth.admin.createUser({ email, password, email_confirm: true });
      if (r.error || !r.data.user) throw r.error ?? new Error("không tạo được tài khoản");
      staffIds.push(r.data.user.id);
      await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,$4)`, [
        r.data.user.id,
        `Fixture BB-395-${nen.runId} ${vai}`,
        email,
        vai,
      ]);
      await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [r.data.user.id, nen.branchId]);
      return email;
    };
    const emailCs = await taoNv("cs");
    const emailOwner = await taoNv("owner");
    return {
      pg,
      runId: nen.runId,
      branchId: nen.branchId,
      customerId: nen.customerId,
      khachChuaNoi,
      staffIds,
      emailCs,
      emailOwner,
      password,
      bo: { khop: khop.id, thieu: thieu.id, thua: thua.id, haiBoD: haiBoD.id, haiBoE: haiBoE.id, dot2: dot2.id, dot2b: dot2b.id, chuaNoi: chuaNoi.id },
      tokenThua: thua.token,
    };
  } catch (e) {
    await donNenFixture(pg, { branchIds: [nen.branchId], customerIds: [nen.customerId, ...(khachChuaNoi ? [khachChuaNoi] : [])], staffIds }).catch(() => {});
    await pg.end().catch(() => {});
    throw e;
  }
}

/** Dọn theo id (bộ ảnh kéo theo hoá đơn gán, dòng sổ, dòng hàng qua cascade) — lỗi dọn là ĐỎ. */
export async function donDepBB395(d: DuLieuBB395): Promise<void> {
  try {
    // Dòng sổ có khoá ngoại tới nhân sự (confirmed_by) — xoá trước để xoá được nhân sự.
    await d.pg.query(`delete from gallery_payments where gallery_id = any($1::uuid[])`, [Object.values(d.bo)]);
    await d.pg.query(`delete from hoa_don_bo_anh where gallery_id = any($1::uuid[])`, [Object.values(d.bo)]);
    await donNenFixture(d.pg, {
      galleryIds: Object.values(d.bo),
      customerIds: [d.customerId, d.khachChuaNoi],
      branchIds: [d.branchId],
      staffIds: d.staffIds,
    });
  } finally {
    await d.pg.end().catch(() => {});
  }
}
