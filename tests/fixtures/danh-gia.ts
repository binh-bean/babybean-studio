/**
 * Dữ liệu mẫu cho phép thử chụp màn hình đánh giá thẩm mỹ — BB-316, vòng 5.
 *
 * OWNER: QA-BOT. Dùng CHUNG mọi vòng chấm kể từ vòng 5 (rubric §4).
 *
 * Mọi dữ liệu ở đây là GIẢ — xem AGENTS.md §6. Tên khách/bé bịa, SĐT dải
 * 0901000001…, không có drive_folder_id thật, không ảnh trẻ em thật (ảnh mock
 * là gradient trừu tượng, xem tests/fixtures/anh-mock-jpeg.cjs).
 *
 * Không đụng dòng dữ liệu thật nào: mọi bảng CHỈ ghi hàng có branch/khách/bộ
 * ảnh do CHÍNH lượt chạy này tạo ra (đánh dấu `runId`), và `donDep()` xoá
 * đúng những id đó — không xoá theo tiền tố chung (script khác có thể đang
 * chạy song song).
 */

import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";

export const NHAN_GOC = "Fixture DANHGIA5";

export interface BoAnhFixture {
  id: string;
  token: string;
  status: string;
}

export interface DuLieuDanhGia5 {
  runId: string;
  pg: Client;
  branchId: string;
  emailOwner: string;
  emailQl: string;
  password: string;
  ownerId: string;
  qlId: string;
  /** bộ chính — ready, không biệt danh, 400 ảnh, vượt hạn mức 2 tấm. */
  chinh: BoAnhFixture;
  /** bộ phụ — "Bé Na", concept "Thôi nôi", gói không có album. */
  phu: BoAnhFixture;
  /** bộ dùng để CHỐT SỐNG trong phép thử (K9) — nhỏ, không album, hạn mức rộng rãi. */
  choChot: BoAnhFixture;
  /** đã chốt sẵn trong CSDL (Q4) — có ảnh đã chọn + đã mua thêm. */
  daChot: BoAnhFixture;
  /** đang chỉnh sửa (K10). */
  dangChinh: BoAnhFixture;
  /** đã giao, đủ bìa + lưới hoàn thiện + tải được (K11). */
  daGiao: BoAnhFixture;
  /** chưa biết hạn mức — không có dòng Edit file (K12). */
  hanMucChuaBiet: BoAnhFixture;
}

// ---------------------------------------------------------------------------

function randPhoneSuffix(i: number): string {
  return `0901${String(1 + i).padStart(6, "0")}`;
}

function tokenMoi(): string {
  return randomBytes(32).toString("base64url");
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

async function chenAnh(
  pg: Client,
  galleryId: string,
  nhanRieng: string,
  soAnh: number,
): Promise<Map<number, string>> {
  const { rows } = await pg.query(
    `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
     select
       $1,
       'dg5-' || $2 || '-' || x,
       'IMG_' || (1000 + x)::text || '.JPG',
       'image/jpeg',
       x,
       'active',
       case when x % 6 = 2 then 1500 else 1000 end,
       case when x % 6 = 2 then 1000 else 1500 end
     from generate_series(1, $3::int) as x
     returning id, sort_index`,
    [galleryId, nhanRieng, soAnh],
  );
  const map = new Map<number, string>();
  for (const r of rows as { id: string; sort_index: number }[]) map.set(r.sort_index, r.id);
  return map;
}

interface TaoBoOpts {
  runId: string;
  branchId: string;
  ten: string;
  khachTen: string;
  babyFullName: string;
  babyNickname: string | null;
  concept: string | null;
  status: string;
  soAnh: number;
  coAlbum: boolean;
  editFileQty: number | null; // null = KHÔNG thêm dòng Edit file (dùng cho QUOTA_UNKNOWN)
  themDongKhac?: boolean; // thêm một dòng hợp đồng khác (không phải Edit file) để exists() true nhưng vẫn QUOTA_UNKNOWN
  soLuongIndex: number; // index cho phone/drive_folder_id không trùng
}

async function taoBo(
  pg: Client,
  albumProductId: string,
  editFileProductId: string,
  uvProductId: string,
  opts: TaoBoOpts,
): Promise<{ bo: BoAnhFixture; customerId: string; babyId: string; anhTheoSort: Map<number, string> }> {
  const { rows: kh } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [opts.branchId, `${NHAN_GOC}-${opts.runId} ${opts.khachTen}`, randPhoneSuffix(opts.soLuongIndex)],
  );
  const customerId = kh[0].id as string;

  const { rows: bb } = await pg.query(
    `insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id`,
    [customerId, opts.babyFullName, opts.babyNickname],
  );
  const babyId = bb[0].id as string;

  const { rows: sh } = await pg.query(
    `insert into shoots (branch_id, customer_id, baby_id, shoot_date, concept) values ($1,$2,$3, current_date - 20, $4) returning id`,
    [opts.branchId, customerId, babyId, opts.concept],
  );
  const shootId = sh[0].id as string;

  const { rows: g } = await pg.query(
    `insert into galleries
       (branch_id, shoot_id, customer_id, baby_id, title, status,
        drive_folder_id, drive_folder_url, photo_count, extra_photo_price, download_enabled)
     values ($1,$2,$3,$4,$5,$6,$7,'https://example.com/x',$8,50000,true)
     returning id`,
    [
      opts.branchId,
      shootId,
      customerId,
      babyId,
      // KHÔNG mở đầu bằng "Fixture": bảng điều khiển và mọi báo cáo loại bộ ảnh có tiêu đề
      // bắt đầu "Fixture" (src/lib/bao-cao/loc-chung.ts, api/admin/dashboard) — để tiêu đề đó thì
      // Q2/Q10 luôn trống. Dọn theo id/chi nhánh (tên chi nhánh, khách, nhân sự vẫn mang nhãn).
      `${opts.babyNickname ?? opts.babyFullName} · ${opts.concept || "Ảnh chụp"}`,
      opts.status,
      `fixture-danhgia5-${opts.runId}-${opts.soLuongIndex}`,
      opts.soAnh,
    ],
  );
  const galleryId = g[0].id as string;

  if (opts.coAlbum) {
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,1,1100000)`,
      [galleryId, albumProductId],
    );
  }
  if (opts.editFileQty !== null) {
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,$3,$4)`,
      [galleryId, editFileProductId, opts.editFileQty, opts.editFileQty * 50000],
    );
  } else if (opts.themDongKhac) {
    // Có dòng hợp đồng (exists() true) nhưng KHÔNG có Edit file -> QUOTA_UNKNOWN.
    await pg.query(
      `insert into gallery_items (gallery_id, product_id, quantity, unit_price) values ($1,$2,1,20000)`,
      [galleryId, uvProductId],
    );
  }

  const anhTheoSort = await chenAnh(pg, galleryId, `${opts.runId}-${opts.soLuongIndex}`, opts.soAnh);

  const bo: BoAnhFixture = { id: galleryId, token: "", status: opts.status };
  return { bo, customerId, babyId, anhTheoSort };
}

async function taoShareLink(
  pg: Client,
  galleryId: string,
  nhan: string,
): Promise<string> {
  const token = tokenMoi();
  await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
     values ($1,$2,$3,'owner',$4,'active')`,
    [galleryId, sha256(token), token.slice(0, 6), nhan],
  );
  return token;
}

async function taoSelectionSan(
  pg: Client,
  galleryId: string,
  shareLinkToken: string,
  displayName: string,
): Promise<string> {
  const { rows: link } = await pg.query(`select id from share_links where token_hash = $1`, [sha256(shareLinkToken)]);
  const shareLinkId = link[0].id as string;
  const { rows: sel } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary) values ($1,$2,$3,true) returning id`,
    [galleryId, shareLinkId, displayName],
  );
  return sel[0].id as string;
}

async function chonAnh(
  pg: Client,
  galleryId: string,
  selectionId: string,
  photoId: string,
  mark: "selected" | "favorite",
  ghiChu?: string,
): Promise<void> {
  await pg.query(
    `insert into selection_items (selection_id, photo_id, gallery_id, mark, retouch_note) values ($1,$2,$3,$4,$5)`,
    [selectionId, photoId, galleryId, mark, ghiChu ?? null],
  );
}

async function muaThem(pg: Client, selectionId: string, uvProductId: string, soLuong: number): Promise<void> {
  // Ràng buộc uq_selection_addons_khong_anh: một dòng cho mỗi sản phẩm -> gộp số lượng.
  await pg.query(
    `insert into selection_addons (selection_id, product_id, quantity, unit_price) values ($1,$2,$3,20000)`,
    [selectionId, uvProductId, soLuong],
  );
}

const CHI_SO_DA_CHON_CHINH = [1, 2, 15, 50, 100, 150, 200, 250, 296, 297, 298, 299, 300, 330, 350, 370, 390];

interface TrangThaiDangDung {
  pg?: Client;
  branchId?: string;
  staffIds: string[];
}

export async function duLieuDanhGia5(): Promise<DuLieuDanhGia5> {
  const dang: TrangThaiDangDung = { staffIds: [] };
  try {
    return await duLieuDanhGia5Trong(dang);
  } catch (e) {
    // Dựng dở thì dọn ngay đúng phần đã tạo, không để rác trên bb-dev.
    if (dang.pg && dang.branchId) await donTheoChiNhanh(dang.pg, dang.branchId, dang.staffIds).catch(() => {});
    throw e;
  }
}

async function duLieuDanhGia5Trong(dang: TrangThaiDangDung): Promise<DuLieuDanhGia5> {
  const runId = Math.random().toString(36).slice(2, 8);
  const pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  dang.pg = pg;

  // Dọn rác cũ (> 2 giờ) của các lượt chạy TRƯỚC — không đụng lượt đang chạy song song.
  try {
    const { rows: cuBranch } = await pg.query(
      `select id from branches where name like $1 and created_at < now() - interval '2 hours'`,
      [`${NHAN_GOC}%`],
    );
    for (const r of cuBranch as { id: string }[]) {
      await pg.query(`delete from activity_logs where branch_id = $1`, [r.id]).catch(() => {});
      await pg.query(`delete from notifications where branch_id = $1`, [r.id]).catch(() => {});
      await pg.query(`delete from galleries where branch_id = $1`, [r.id]).catch(() => {});
      await pg.query(`delete from customers where branch_id = $1`, [r.id]).catch(() => {});
      await pg.query(`delete from staff_branches where branch_id = $1`, [r.id]).catch(() => {});
      await pg.query(`delete from branches where id = $1`, [r.id]).catch(() => {});
    }
  } catch {
    // dọn rác cũ là best-effort, không chặn lượt chạy này
  }

  const { rows: br } = await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
    `FXDG5-${runId}`,
    `${NHAN_GOC}-${runId} Chi nhánh`,
  ]);
  const branchId = br[0].id as string;
  dang.branchId = branchId;

  const { rows: albumRows } = await pg.query(
    `select id from products where is_active and material ilike '%album%' and list_price is not null
       and price_confidence >= 0.8 and price_samples >= 5 order by list_price limit 1`,
  );
  const albumProductId = albumRows[0]?.id as string;

  const { rows: editRows } = await pg.query(
    `select id from products where is_active and kind = 'edited_photo' and name = 'Edit file' limit 1`,
  );
  const editFileProductId = editRows[0]?.id as string;

  const { rows: uvRows } = await pg.query(
    `select id from products where is_active and kind = 'print' and material = 'UV' and size = '10x15' limit 1`,
  );
  const uvProductId = uvRows[0]?.id as string;

  if (!albumProductId || !editFileProductId || !uvProductId) {
    throw new Error(
      "Thiếu sản phẩm gốc trong danh mục (Album/Edit file/UV 10x15) — cần npm run db:seed hoặc đồng bộ Lark trước.",
    );
  }

  // -------------------------------------------------------------------------
  // 1. Bộ CHÍNH — ready, không biệt danh, 400 ảnh, quota 15 đã chọn 17.
  // -------------------------------------------------------------------------
  const chinhRaw = await taoBo(pg, albumProductId, editFileProductId, uvProductId, {
    runId,
    branchId,
    ten: "Bộ chính",
    khachTen: "Nguyễn Thị Lan",
    babyFullName: "Nguyễn Ngọc Bảo An",
    babyNickname: null,
    concept: "",
    status: "ready",
    soAnh: 400,
    coAlbum: true,
    editFileQty: 15,
    soLuongIndex: 1,
  });
  const chinhToken = await taoShareLink(pg, chinhRaw.bo.id, `${NHAN_GOC}-${runId}`);
  const chinhSelectionId = await taoSelectionSan(pg, chinhRaw.bo.id, chinhToken, "Mẹ Lan");
  for (const idx of CHI_SO_DA_CHON_CHINH) {
    const photoId = chinhRaw.anhTheoSort.get(idx);
    if (!photoId) continue;
    const ghiChu = idx === 2 ? "Làm mịn da giúp em, giữ màu ấm nhé" : undefined;
    await chonAnh(pg, chinhRaw.bo.id, chinhSelectionId, photoId, "selected", ghiChu);
  }
  await muaThem(pg, chinhSelectionId, uvProductId, 3);
  const chinhCoverId = chinhRaw.anhTheoSort.get(8);
  if (chinhCoverId) await pg.query(`update galleries set cover_photo_id = $1 where id = $2`, [chinhCoverId, chinhRaw.bo.id]);

  // -------------------------------------------------------------------------
  // 2. Bộ PHỤ — "Bé Na", concept "Thôi nôi", gói KHÔNG có album.
  // -------------------------------------------------------------------------
  const phuRaw = await taoBo(pg, albumProductId, editFileProductId, uvProductId, {
    runId,
    branchId,
    ten: "Bộ phụ",
    khachTen: "Trần Thu Hà",
    babyFullName: "Trần Gia Hân",
    babyNickname: "Bé Na",
    concept: "Thôi nôi",
    status: "ready",
    soAnh: 40,
    coAlbum: false,
    editFileQty: 10,
    soLuongIndex: 2,
  });
  const phuToken = await taoShareLink(pg, phuRaw.bo.id, `${NHAN_GOC}-${runId}`);
  const phuCoverId = phuRaw.anhTheoSort.get(2);
  if (phuCoverId) await pg.query(`update galleries set cover_photo_id = $1 where id = $2`, [phuCoverId, phuRaw.bo.id]);

  // -------------------------------------------------------------------------
  // 3. Bộ CHỐT SỐNG (K9) — nhỏ, không album, hạn mức rộng rãi.
  // -------------------------------------------------------------------------
  const choChotRaw = await taoBo(pg, albumProductId, editFileProductId, uvProductId, {
    runId,
    branchId,
    ten: "Bộ chốt thử",
    khachTen: "Lê Minh Anh",
    babyFullName: "Lê Bảo Ngọc",
    babyNickname: "Bé Bơ",
    concept: "",
    status: "ready",
    soAnh: 24,
    coAlbum: false,
    editFileQty: 20,
    soLuongIndex: 3,
  });
  const choChotToken = await taoShareLink(pg, choChotRaw.bo.id, `${NHAN_GOC}-${runId}`);

  // -------------------------------------------------------------------------
  // 4. Bộ ĐÃ CHỐT sẵn trong CSDL (Q4) — có ảnh chọn + đã mua thêm.
  // -------------------------------------------------------------------------
  const daChotRaw = await taoBo(pg, albumProductId, editFileProductId, uvProductId, {
    runId,
    branchId,
    ten: "Bộ đã chốt",
    khachTen: "Võ Hồng Nhung",
    babyFullName: "Võ Gia Bảo",
    babyNickname: "Bé Cam",
    concept: "",
    status: "submitted",
    soAnh: 60,
    coAlbum: true,
    editFileQty: 15,
    soLuongIndex: 4,
  });
  const daChotToken = await taoShareLink(pg, daChotRaw.bo.id, `${NHAN_GOC}-${runId}`);
  const daChotSelectionId = await taoSelectionSan(pg, daChotRaw.bo.id, daChotToken, "Mẹ Nhung");
  for (let i = 1; i <= 15; i++) {
    const photoId = daChotRaw.anhTheoSort.get(i);
    if (photoId) await chonAnh(pg, daChotRaw.bo.id, daChotSelectionId, photoId, "selected");
  }
  await muaThem(pg, daChotSelectionId, uvProductId, 2);
  await pg.query(
    `update selections set submitted_at = now() - interval '1 day', submitted_by_name = 'Mẹ Nhung',
       snapshot_selected_count = 15, snapshot_extra_count = 0, snapshot_extra_amount = 0 where id = $1`,
    [daChotSelectionId],
  );
  await pg.query(`update galleries set submitted_at = now() - interval '1 day' where id = $1`, [daChotRaw.bo.id]);
  const daChotCoverId = daChotRaw.anhTheoSort.get(2);
  if (daChotCoverId) await pg.query(`update galleries set cover_photo_id = $1 where id = $2`, [daChotCoverId, daChotRaw.bo.id]);

  // -------------------------------------------------------------------------
  // 5. Bộ ĐANG CHỈNH (K10).
  // -------------------------------------------------------------------------
  const dangChinhRaw = await taoBo(pg, albumProductId, editFileProductId, uvProductId, {
    runId,
    branchId,
    ten: "Bộ đang chỉnh",
    khachTen: "Phạm Lan Anh",
    babyFullName: "Phạm Nhật Minh",
    babyNickname: "Bé Mít",
    concept: "",
    status: "in_retouch",
    soAnh: 40,
    coAlbum: true,
    editFileQty: 12,
    soLuongIndex: 5,
  });
  const dangChinhToken = await taoShareLink(pg, dangChinhRaw.bo.id, `${NHAN_GOC}-${runId}`);
  const dangChinhSelectionId = await taoSelectionSan(pg, dangChinhRaw.bo.id, dangChinhToken, "Mẹ Lan Anh");
  for (let i = 1; i <= 12; i++) {
    const photoId = dangChinhRaw.anhTheoSort.get(i);
    if (photoId) await chonAnh(pg, dangChinhRaw.bo.id, dangChinhSelectionId, photoId, "selected");
  }
  await pg.query(`update selections set submitted_at = now() - interval '3 days' where id = $1`, [dangChinhSelectionId]);
  await pg.query(`update galleries set submitted_at = now() - interval '3 days' where id = $1`, [dangChinhRaw.bo.id]);
  const dangChinhCoverId = dangChinhRaw.anhTheoSort.get(2);
  if (dangChinhCoverId)
    await pg.query(`update galleries set cover_photo_id = $1 where id = $2`, [dangChinhCoverId, dangChinhRaw.bo.id]);

  // -------------------------------------------------------------------------
  // 6. Bộ ĐÃ GIAO (K11) — bìa + lưới hoàn thiện + nút tải.
  // -------------------------------------------------------------------------
  const daGiaoRaw = await taoBo(pg, albumProductId, editFileProductId, uvProductId, {
    runId,
    branchId,
    ten: "Bộ đã giao",
    khachTen: "Đỗ Thu Thảo",
    babyFullName: "Đỗ Khánh Vy",
    babyNickname: "Bé Xoài",
    concept: "",
    status: "delivered",
    soAnh: 40,
    coAlbum: true,
    editFileQty: 12,
    soLuongIndex: 6,
  });
  const daGiaoToken = await taoShareLink(pg, daGiaoRaw.bo.id, `${NHAN_GOC}-${runId}`);
  const daGiaoSelectionId = await taoSelectionSan(pg, daGiaoRaw.bo.id, daGiaoToken, "Mẹ Thảo");
  for (let i = 1; i <= 12; i++) {
    const photoId = daGiaoRaw.anhTheoSort.get(i);
    if (photoId) await chonAnh(pg, daGiaoRaw.bo.id, daGiaoSelectionId, photoId, "selected");
  }
  await pg.query(`update selections set submitted_at = now() - interval '10 days' where id = $1`, [daGiaoSelectionId]);
  await pg.query(`update galleries set submitted_at = now() - interval '10 days' where id = $1`, [daGiaoRaw.bo.id]);
  const daGiaoCoverId = daGiaoRaw.anhTheoSort.get(2);
  if (daGiaoCoverId) await pg.query(`update galleries set cover_photo_id = $1 where id = $2`, [daGiaoCoverId, daGiaoRaw.bo.id]);

  // -------------------------------------------------------------------------
  // 7. Bộ CHƯA BIẾT HẠN MỨC (K12) — không có dòng Edit file.
  // -------------------------------------------------------------------------
  const hanMucChuaBietRaw = await taoBo(pg, albumProductId, editFileProductId, uvProductId, {
    runId,
    branchId,
    ten: "Bộ chưa biết hạn mức",
    khachTen: "Ngô Bích Ngọc",
    babyFullName: "Ngô Gia Huy",
    babyNickname: null,
    concept: "",
    status: "ready",
    soAnh: 30,
    coAlbum: false,
    editFileQty: null,
    themDongKhac: true,
    soLuongIndex: 7,
  });
  const hanMucChuaBietToken = await taoShareLink(pg, hanMucChuaBietRaw.bo.id, `${NHAN_GOC}-${runId}`);

  // -------------------------------------------------------------------------
  // Tài khoản nhân sự: owner (toàn quyền) + branch_manager (QL chi nhánh).
  // -------------------------------------------------------------------------
  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const password = "Password123!";
  const emailOwner = `fixture.danhgia5.owner.${runId}@demo.babybean.vn`;
  const emailQl = `fixture.danhgia5.ql.${runId}@demo.babybean.vn`;

  const rOwner = await supa.auth.admin.createUser({ email: emailOwner, password, email_confirm: true });
  if (rOwner.error || !rOwner.data.user) throw rOwner.error ?? new Error("không tạo được tài khoản owner");
  const ownerId = rOwner.data.user.id;
  dang.staffIds.push(ownerId);
  await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`, [
    ownerId,
    `${NHAN_GOC}-${runId} Chủ studio`,
    emailOwner,
  ]);
  await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [ownerId, branchId]);

  const rQl = await supa.auth.admin.createUser({ email: emailQl, password, email_confirm: true });
  if (rQl.error || !rQl.data.user) throw rQl.error ?? new Error("không tạo được tài khoản quản lý");
  const qlId = rQl.data.user.id;
  dang.staffIds.push(qlId);
  await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'branch_manager')`, [
    qlId,
    `${NHAN_GOC}-${runId} Quản lý chi nhánh`,
    emailQl,
  ]);
  await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [qlId, branchId]);

  return {
    runId,
    pg,
    branchId,
    emailOwner,
    emailQl,
    password,
    ownerId,
    qlId,
    chinh: { id: chinhRaw.bo.id, token: chinhToken, status: "ready" },
    phu: { id: phuRaw.bo.id, token: phuToken, status: "ready" },
    choChot: { id: choChotRaw.bo.id, token: choChotToken, status: "ready" },
    daChot: { id: daChotRaw.bo.id, token: daChotToken, status: "submitted" },
    dangChinh: { id: dangChinhRaw.bo.id, token: dangChinhToken, status: "in_retouch" },
    daGiao: { id: daGiaoRaw.bo.id, token: daGiaoToken, status: "delivered" },
    hanMucChuaBiet: { id: hanMucChuaBietRaw.bo.id, token: hanMucChuaBietToken, status: "ready" },
  };
}

async function xoaBoAnh(pg: Client, id: string): Promise<void> {
  const q = (s: string) => pg.query(s, [id]).catch(() => {});
  await q("delete from album_covers where gallery_id = $1");
  await q("delete from selection_addons where selection_id in (select id from selections where gallery_id=$1)");
  await q("delete from selection_placements where selection_item_id in (select id from selection_items where gallery_id=$1)");
  await q("delete from selection_items where gallery_id = $1");
  await q("delete from selections where gallery_id = $1");
  await q("delete from share_links where gallery_id = $1");
  await q("delete from activity_logs where entity_id = $1");
  await q("delete from notifications where payload->>'galleryId' = $1::text");
  await q("delete from gallery_items where gallery_id = $1");
  // BB-331: danh sách trên thiếu các bảng mới (gallery_payments, deliveries,
  // yêu cầu mở lại, hộp thư khách, đợt chọn…) — `delete from galleries` gãy
  // khoá ngoại, `.catch` nuốt lỗi, và chi nhánh "Fixture DANHGIA5-…" nằm lại
  // trên bb-dev (2 chi nhánh thấy ngày 30/09, lên cả "Theo chi nhánh"). Quét
  // MỌI bảng trỏ vào galleries theo information_schema, vài vòng cho đủ thứ tự.
  const { rows: fk } = await pg
    .query(
      `select tc.table_name t, kcu.column_name c
         from information_schema.table_constraints tc
         join information_schema.key_column_usage kcu
           on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema
         join information_schema.constraint_column_usage ccu
           on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
        where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
          and ccu.table_name = 'galleries' and ccu.column_name = 'id' and tc.table_name <> 'galleries'`,
    )
    .catch(() => ({ rows: [] as { t: string; c: string }[] }));
  await q("update galleries set cover_photo_id = null where id = $1");
  for (let vong = 0; vong < 3; vong++) {
    for (const f of fk as { t: string; c: string }[]) {
      if (!/^[a-z_][a-z0-9_]*$/.test(f.t) || !/^[a-z_][a-z0-9_]*$/.test(f.c)) continue;
      await q(`delete from public.${f.t} where ${f.c} = $1`);
    }
  }
  await q("delete from photos where gallery_id = $1");
  await q("delete from galleries where id = $1");
}

async function donTheoChiNhanh(pg: Client, branchId: string, staffIds: string[]): Promise<void> {
  const { rows: bo } = await pg.query(`select id from galleries where branch_id = $1`, [branchId]);
  for (const b of bo as { id: string }[]) await xoaBoAnh(pg, b.id);

  const { rows: khach } = await pg.query(`select id from customers where branch_id = $1`, [branchId]);
  for (const k of khach as { id: string }[]) {
    await pg.query(`delete from shoots where customer_id = $1`, [k.id]).catch(() => {});
    await pg.query(`delete from babies where customer_id = $1`, [k.id]).catch(() => {});
    await pg.query(`delete from activity_logs where entity_id = $1`, [k.id]).catch(() => {});
    await pg.query(`delete from customers where id = $1`, [k.id]).catch(() => {});
  }

  const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  for (const staffId of staffIds) {
    await pg.query(`delete from activity_logs where actor_id = $1`, [staffId]).catch(() => {});
    await pg.query(`delete from staff_branches where staff_id = $1`, [staffId]).catch(() => {});
    await pg.query(`delete from staff_profiles where id = $1`, [staffId]).catch(() => {});
    await supa.auth.admin.deleteUser(staffId).catch(() => {});
  }

  await pg.query(`delete from activity_logs where branch_id = $1`, [branchId]).catch(() => {});
  await pg.query(`delete from notifications where branch_id = $1`, [branchId]).catch(() => {});
  await pg.query(`delete from branches where id = $1`, [branchId]).catch(() => {});
}

export async function donDep(d: DuLieuDanhGia5): Promise<{ conFixture: number }> {
  const { pg } = d;
  await donTheoChiNhanh(pg, d.branchId, [d.ownerId, d.qlId]);
  const { rows } = await pg.query(`select count(*)::int n from galleries g join branches b on b.id = g.branch_id where b.name like $1`, [`${NHAN_GOC}%`]);
  const conFixture = rows[0].n as number;
  await pg.end();
  return { conFixture };
}
