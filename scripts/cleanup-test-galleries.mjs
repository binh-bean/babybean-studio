#!/usr/bin/env node
/**
 * cleanup-test-galleries — dọn dữ liệu thử còn sót trong cơ sở dữ liệu.
 *
 * OWNER: DEV-OPS. Chủ studio yêu cầu 16.09.2026.
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần, và vì sao phải chạy lại được
 * ---------------------------------------------------------------------------
 * Ba nguồn rác, và cả ba đều sinh thêm chứ không tự hết:
 *
 *   1. `db/seed.sql` — năm khách và ba bộ ảnh bịa, nạp lúc dựng bb-dev.
 *   2. Phép thử e2e — mỗi lượt chạy dựng khách và bộ ảnh mang tiền tố
 *      "Fixture BB-xxx". Lượt nào hỏng giữa chừng là để lại nguyên đống.
 *   3. Thử tay — "Khách Mới Test" và những thứ cùng loại.
 *
 * Trước 16.09 chúng lẫn giữa vài trăm bộ thật mà không ai thấy. Giờ bb-dev
 * mang tên khách thật, một bộ tên "Bé Bơ 3 tháng tuổi" nằm giữa danh sách là
 * nhân viên phải dừng lại hỏi bộ này của nhà nào.
 *
 * ---------------------------------------------------------------------------
 * Nhận diện theo DẤU VẾT DỰNG RA, không theo cảm tính
 * ---------------------------------------------------------------------------
 * Ba dấu, mỗi dấu là một thứ dữ liệu thật không bao giờ có:
 *
 *   - UUID cố định của seed: `cccccccc-…` (khách), `dddddddd-…` (bộ ảnh).
 *   - Thư mục Drive giả: `SEED_FOLDER_ID_*`, `mock-*`. Bộ thật luôn mang mã
 *     Drive thật, 33 ký tự.
 *   - Tiền tố "Fixture " ở đầu tên — do chính phép thử đặt.
 *
 * KHÔNG lọc theo chữ "test" nằm giữa tên: có khách tên thật chứa chuỗi đó, và
 * xoá nhầm một nhà thật thì không có đường lấy lại.
 *
 * ---------------------------------------------------------------------------
 * KHÔNG đụng vào sáu tài khoản @demo.babybean.vn
 * ---------------------------------------------------------------------------
 * Trông như rác nhưng là giàn giáo: `tests/security/rbac.test.ts` cần sẵn hai
 * nhân viên trong vai cs / photographer / branch_manager (dòng 300) và một
 * nhân viên vai cs (sáu chỗ khác). Xoá chúng là bộ phép thử bảo mật đỏ, mà đó
 * là lưới đỡ chính của dự án. Muốn danh sách Nhân sự sạch thì phải sửa phép
 * thử để tự dựng nhân viên trước — việc riêng, không gộp vào đây.
 *
 * Cách chạy:
 *   npm run db:cleanup            # xem trước, không ghi gì
 *   npm run db:cleanup -- --write # xoá thật
 */

import pg from "pg";
import { choPhepTenThat } from "../src/lib/lark/muc-tieu-du-lieu.ts";

const write = process.argv.includes("--write");

/** Bộ ảnh do máy dựng ra. */
const BO_THU = `(
  g.id::text like 'dddddddd-0000-0000-0000-%'
  or g.drive_folder_id like 'SEED_FOLDER_ID_%'
  or g.drive_folder_id like 'mock-%'
  or g.title like 'Fixture %'
)`;

/**
 * Nhân sự do phép thử dựng ra.
 *
 * `tests/security/rbac.test.ts` dựng nhân viên trong một giao dịch rồi hoàn tác.
 * Lượt nào hỏng giữa chừng thì dòng ấy ở lại — và nó ở lại **không có chi
 * nhánh nào**. Phiền hơn rác thường: chính `rbac.test.ts` bốc nhân viên bằng
 * `LIMIT 2` không sắp thứ tự, trúng phải dòng rác này là phép thử đỏ trong khi
 * không ai sửa gì sai. Đo ngày 17/09: một dòng như vậy làm cả bộ phép thử
 * bảo mật đỏ trên `main`.
 *
 * KHÔNG đụng sáu tài khoản `@demo.babybean.vn` — xem ghi chú đầu tệp.
 */
const NHAN_SU_THU = `(
  sp.full_name like 'Fixture %'
  and sp.email not like '%@demo.babybean.vn'
)`;

/** Khách do máy dựng ra. */
const KHACH_THU = `(
  cu.id::text like 'cccccccc-0000-0000-0000-%'
  or cu.full_name like 'Fixture %'
  or cu.full_name = 'Khách Mới Test'
)`;

async function main() {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Thiếu SUPABASE_DB_URL. Chạy: npm run db:cleanup");
    process.exit(2);
  }

  // Chốt cứng: đây là lệnh XOÁ. bb-prod có 427 nhà thật và không có bản sao
  // lưu tự động nào. Không có lý do chính đáng nào để chạy nó ở đó.
  if (choPhepTenThat(dbUrl) && /hecpaiizklbuckqvdndk/i.test(dbUrl)) {
    console.error("Đây là bb-prod. Script xoá không chạy trên bb-prod.");
    process.exit(2);
  }

  const u = new URL(dbUrl);
  const client = new pg.Client({
    host: u.hostname,
    port: Number(u.port) || 5432,
    database: u.pathname.slice(1),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25_000,
  });
  await client.connect();

  try {
    const { rows: bo } = await client.query(
      `select g.id, g.title, g.drive_folder_id,
              (select count(*)::int from photos p where p.gallery_id = g.id) anh
         from galleries g where ${BO_THU} order by g.title`,
    );
    const { rows: kh } = await client.query(
      `select cu.id, cu.full_name from customers cu where ${KHACH_THU} order by cu.full_name`,
    );

    console.log(`Bộ ảnh do máy dựng: ${bo.length}`);
    for (const b of bo) console.log(`   ${b.title}  —  ${b.anh} ảnh  (${b.drive_folder_id})`);
    const { rows: nsXem } = await client.query(
      `select sp.full_name from staff_profiles sp where ${NHAN_SU_THU} order by sp.full_name`,
    );
    console.log(`Nhân sự do phép thử dựng: ${nsXem.length}`);
    for (const x of nsXem) console.log(`   ${x.full_name}`);
    console.log(`Khách do máy dựng: ${kh.length}`);
    for (const k of kh) console.log(`   ${k.full_name}`);

    const { rows: giu } = await client.query(
      `select (select count(*)::int from galleries g where not ${BO_THU}) bo,
              (select count(*)::int from customers cu where not ${KHACH_THU}) khach`,
    );
    console.log(`\nGiữ nguyên: ${giu[0].bo} bộ ảnh thật, ${giu[0].khach} khách thật.`);

    const { rows: tbXem } = await client.query(
      `select count(*)::int n from notifications
        where payload->>'galleryTitle' like 'Test BB%'
           or payload->>'galleryTitle' like 'Fixture %'`,
    );
    console.log(`Thông báo do phép thử dựng: ${tbXem[0].n}`);

    if (!bo.length && !kh.length && !nsXem.length && !tbXem[0].n) {
      console.log("Không có gì để dọn.");
      return;
    }
    if (!write) {
      console.log("\nXem trước, chưa xoá gì. Thêm -- --write để xoá thật.");
      return;
    }

    // Một giao dịch: gãy giữa chừng thì hoàn tác sạch, không để lại một bộ ảnh
    // mất nửa số ảnh mà vẫn nằm trong danh sách.
    await client.query("begin");

    const gIds = bo.map((b) => b.id);
    const cIds = kh.map((k) => k.id);
    const dem = {};
    const xoa = async (ten, sql, val) => {
      const r = await client.query(sql, val);
      if (r.rowCount) dem[ten] = r.rowCount;
    };

    // Thông báo do phép thử dựng ra. Không gắn với bộ ảnh nào — bảng
    // `notifications` chỉ có `branch_id` — nên phải nhận theo nội dung.
    await xoa(
      "thông báo do phép thử dựng",
      `delete from notifications
        where payload->>'galleryTitle' like 'Test BB%'
           or payload->>'galleryTitle' like 'Fixture %'`,
    );

    if (gIds.length) {
      // Thứ tự đi từ lá vào gốc. `galleries.cover_photo_id` trỏ sang `photos`
      // nên phải gỡ trước, không thì xoá ảnh là gãy khoá ngoại.
      await xoa("ảnh đặt vào sản phẩm in",
        `delete from selection_placements where selection_item_id in
           (select id from selection_items where gallery_id = any($1))`, [gIds]);
      await xoa("ảnh đã chọn", `delete from selection_items where gallery_id = any($1)`, [gIds]);
      await xoa("mua thêm", `delete from selection_addons where selection_id in
           (select id from selections where gallery_id = any($1))`, [gIds]);
      await xoa("thao tác chọn", `delete from selection_ops where selection_id in
           (select id from selections where gallery_id = any($1))`, [gIds]);
      await xoa("thanh toán", `delete from gallery_payments where gallery_id = any($1)`, [gIds]);
      await xoa("lượt chọn", `delete from selections where gallery_id = any($1)`, [gIds]);
      await xoa("link chia sẻ", `delete from share_links where gallery_id = any($1)`, [gIds]);
      await xoa("yêu cầu sửa", `delete from revision_requests where gallery_id = any($1)`, [gIds]);
      await xoa("lượt giao", `delete from deliveries where gallery_id = any($1)`, [gIds]);
      await xoa("dòng hàng", `delete from gallery_items where gallery_id = any($1)`, [gIds]);
      await client.query(`update galleries set cover_photo_id = null where id = any($1)`, [gIds]);
      await xoa("ảnh", `delete from photos where gallery_id = any($1)`, [gIds]);
      await xoa("bộ ảnh", `delete from galleries where id = any($1)`, [gIds]);
    }

    const { rows: ns } = await client.query(
      `select sp.id, sp.full_name from staff_profiles sp where ${NHAN_SU_THU}`,
    );
    if (ns.length) {
      const nIds = ns.map((x) => x.id);
      // Nhân sự có dấu vết thật thì KHÔNG xoá — giữ lịch sử trên bộ ảnh cũ,
      // đúng nguyên tắc docs/13 §8.
      const { rows: vet } = await client.query(
        `select count(*)::int n from galleries where created_by = any($1)
            or photographer_id = any($1) or editor_id = any($1) or cskh_id = any($1)`,
        [nIds],
      );
      if (vet[0].n > 0) {
        console.log(`   ${ns.length} nhân sự Fixture nhưng có dấu vết trên bộ ảnh — GIỮ LẠI.`);
      } else {
        await xoa("gán chi nhánh", `delete from staff_branches where staff_id = any($1)`, [nIds]);
        await xoa("nhân sự do phép thử dựng", `delete from staff_profiles where id = any($1)`, [nIds]);
      }
    }

    if (cIds.length) {
      // Bộ ảnh thật của một khách thử thì không tồn tại — nhưng kiểm vẫn hơn:
      // dừng lại còn hơn xoá nhầm một nhà thật vì trùng tên.
      const { rows: con } = await client.query(
        `select count(*)::int n from galleries where customer_id = any($1)`, [cIds]);
      if (con[0].n > 0) {
        throw new Error(
          `${con[0].n} bộ ảnh vẫn gắn với khách sắp xoá. Dừng lại — xem lại bộ lọc.`,
        );
      }
      await xoa("buổi chụp", `delete from shoots where customer_id = any($1)`, [cIds]);
      await xoa("bé", `delete from babies where customer_id = any($1)`, [cIds]);
      await xoa("khách", `delete from customers where id = any($1)`, [cIds]);
    }

    await client.query("commit");

    console.log("\nĐã xoá:");
    for (const [k, v] of Object.entries(dem)) console.log(`   ${String(v).padStart(5)}  ${k}`);
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
