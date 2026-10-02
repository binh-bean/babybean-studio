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
 *   - Tiền tố cũ "Test BB" + số (vd "Test BB105 Gallery …") — quy ước trước
 *     khi đổi sang "Fixture " (BB-350). Chỉ khớp khi ngay sau "Test BB" là chữ
 *     số, ở ĐẦU tên.
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
 *   npm run db:cleanup -- --tuoi-gio 1   # sản phẩm thử: hạ mốc tuổi 6 giờ -> 1 giờ
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
  or g.title ~ '^Test BB[0-9]'
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
 * KHÔNG đụng các tài khoản seed `@demo.babybean.vn` (liệt kê đúng từng email ở trên,
 * khớp `scripts/db-seed.mjs`) — xem ghi chú đầu tệp.
 *
 * BB-354: trước đây điều kiện là `email not like '%@demo.babybean.vn'` — nhưng phép thử
 * `tests/fixtures/danh-gia.ts` đặt email nhân sự Fixture của nó cũng ở miền
 * `@demo.babybean.vn` (fixture.danhgia5.*), nên script này bỏ qua đúng chúng và bốn tài
 * khoản "Fixture DANHGIA5-…" nằm lại ở màn Nhân sự. Tên "Fixture " ở đầu đã đủ loại
 * các tài khoản seed (tên thật của chúng không bắt đầu bằng chữ này).
 */
const NHAN_SU_THU = `(
  (
    sp.full_name like 'Fixture %'
    -- BB-359: tài khoản bb-141-admin-galleries.spec.ts dựng trước khi đổi sang "Fixture "
    -- ("Test Admin <runId>", email test_admin_<runId>@demo.babybean.vn). Khớp CẢ tên lẫn
    -- email theo đúng khuôn của phép thử — không bắt chữ "test" nằm giữa tên thật.
    or (sp.full_name ~ '^Test Admin [a-z0-9]{6,10}$'
        and sp.email ~ '^test_admin_[a-z0-9]{6,10}@demo\.babybean\.vn$')
  )
  and sp.email not in (
    'owner@demo.babybean.vn', 'manager.q1@demo.babybean.vn', 'cs.q1@demo.babybean.vn',
    'photo.q1@demo.babybean.vn', 'retouch.td@demo.babybean.vn'
  )
)`;

/** Khách do máy dựng ra. */
const KHACH_THU = `(
  cu.id::text like 'cccccccc-0000-0000-0000-%'
  or cu.full_name like 'Fixture %'
  or cu.full_name ~ '^Test BB[0-9]'
  or cu.full_name = 'Khách Mới Test'
)`;

/**
 * Sản phẩm do phép thử dựng ra (BB-309, BB-352). Bốn tiền tố, và CHỈ bốn tiền tố:
 *
 *   "Fixture"   quy ước hiện hành (xem AGENTS.md, tests/unit/addons.test.ts).
 *               BB-352: bỏ dấu cách sau chữ — một sản phẩm "Fixture" trần cũng
 *               nhận ra. 01/10/2026 tám sản phẩm "Fixture Gói Baby 01"… còn đang
 *               bán trên bb-dev (rò từ placements-and-watermark và
 *               submit-and-confirm).
 *   "Test BB"   quy ước cũ ("Test BB105 …") trước khi đổi sang "Fixture".
 *   "TEST "     tiền tố cũ hơn nữa, có từ BB-309 — giữ nguyên, không mở rộng.
 *   "Mẫu kiểm thử"  tên MỚI (BB-352) cho hàng phép thử phải MUA được qua API — tên
 *               "Fixture …" bị `sanPhamBanChoKhach()` chặn nên không dùng được. Hàng
 *               này nằm trong bảng giá nên một dòng rò là khách THẤY và MUA được:
 *               cần lưới đỡ theo tuổi y như ba tiền tố trên.
 *
 * KHÔNG lọc theo chữ "test" nằm giữa tên, cùng lý do với KHACH_THU ở trên.
 *
 * CHỈ nhận sản phẩm cũ hơn `tuoiGio` GIỜ (`created_at`), mặc định 6. Bộ test tự
 * dọn đúng sản phẩm của mình ở `afterAll` — dọn ở đây chỉ nên vá lượt nào CHẾT
 * GIỮA CHỪNG. Không có mốc tuổi, script này (chạy tay hoặc theo lịch) có thể
 * xoá/tắt một sản phẩm Fixture của một bộ test ĐANG CHẠY DỞ trên máy khác, làm
 * ca đó đỏ oan. Cờ `--tuoi-gio <số>` hạ mốc xuống khi người chạy biết chắc không
 * phép thử nào đang chạy (vd sau sự cố rò, khi chưa qua mốc 6 giờ).
 */
function sanPhamThu(tuoiGio) {
  return `(
  (p.name like 'Fixture%' or p.name like 'Test BB%' or p.name like 'TEST %' or p.name like 'Mẫu kiểm thử%')
  and p.created_at < now() - interval '${Number(tuoiGio)} hours'
)`;
}

/** Đọc `--tuoi-gio <số>`; mặc định 6. Số không hợp lệ thì dừng, không đoán. */
function docTuoiGio(argv) {
  const i = argv.indexOf("--tuoi-gio");
  if (i === -1) return 6;
  const v = Number(argv[i + 1]);
  if (!Number.isFinite(v) || v < 0) {
    console.error("--tuoi-gio cần một số >= 0 (giờ). Vd: --tuoi-gio 1");
    process.exit(2);
  }
  return v;
}

const SAN_PHAM_THU = sanPhamThu(docTuoiGio(process.argv));

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
    for (const x of nsXem) console.log(`   ${x.full_name}  (cùng tài khoản đăng nhập sẽ bị xoá theo)`);
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

    const { rows: logXem } = await client.query(
      `select count(*)::int n from activity_logs
        where entity_type = 'gallery' and entity_id not in (select id from galleries)`
    );
    console.log(`Nhật ký mồ côi (do phép thử xoá bộ ảnh): ${logXem[0].n}`);

    const { rows: spXem } = await client.query(
      `select p.id, p.name, p.is_active,
              (select count(*)::int from selection_addons sa where sa.product_id = p.id)
            + (select count(*)::int from gallery_items gi where gi.product_id = p.id) as dau_vet
         from products p where ${SAN_PHAM_THU} order by p.name`,
    );
    console.log(`Sản phẩm do phép thử dựng: ${spXem.length}`);
    for (const s of spXem) {
      const trang_thai = s.is_active ? "đang bán" : "đã tắt";
      const ke_hoach = s.dau_vet > 0 ? `còn ${s.dau_vet} dấu vết trên đơn — sẽ TẮT, không xoá` : "không dấu vết — sẽ XOÁ";
      console.log(`   ${s.name}  —  ${trang_thai}  —  ${ke_hoach}`);
    }

    if (!bo.length && !kh.length && !nsXem.length && !tbXem[0].n && !logXem[0].n && !spXem.length) {
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

    await xoa(
      "nhật ký mồ côi",
      `delete from activity_logs
        where entity_type = 'gallery' and entity_id not in (select id from galleries)`
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

    // Sản phẩm do phép thử dựng (BB-309). Đọc LẠI trong giao dịch, SAU khi
    // gallery_items/selection_addons của các bộ ảnh Fixture đã bị xoá ở trên
    // — một sản phẩm chỉ còn "dấu vết" từ chính những dòng hàng vừa xoá thì
    // giờ đã rảnh để xoá hẳn, không cần đợi lượt chạy sau.
    const { rows: sp } = await client.query(
      `select p.id, p.name, p.is_active,
              (select count(*)::int from selection_addons sa where sa.product_id = p.id)
            + (select count(*)::int from gallery_items gi where gi.product_id = p.id) as dau_vet
         from products p where ${SAN_PHAM_THU}`,
    );
    if (sp.length) {
      const khongDauVet = sp.filter((s) => Number(s.dau_vet) === 0);
      const conDauVet = sp.filter((s) => Number(s.dau_vet) > 0);
      if (khongDauVet.length) {
        await xoa(
          "sản phẩm do phép thử dựng (xoá hẳn, không còn dấu vết)",
          `delete from products where id = any($1)`,
          [khongDauVet.map((s) => s.id)],
        );
      }
      const canTat = conDauVet.filter((s) => s.is_active);
      if (canTat.length) {
        await xoa(
          "sản phẩm do phép thử dựng (tắt, còn dấu vết trên đơn — không xoá)",
          `update products set is_active = false, updated_at = now() where id = any($1)`,
          [canTat.map((s) => s.id)],
        );
      }
      if (conDauVet.length && !canTat.length) {
        console.log(`   ${conDauVet.length} sản phẩm Fixture còn dấu vết trên đơn, đã tắt từ trước — giữ nguyên.`);
      }
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
        // BB-354: nhân sự còn được ~20 bảng khác trỏ tới (người tạo link, người xác nhận
        // thanh toán, …). Gỡ theo information_schema trong một savepoint: cột cho phép
        // null thì đặt null; cột bắt buộc còn dòng thì GIỮ nhân sự lại và báo, không ép.
        const { rows: tham } = await client.query(
          `select cl.relname t, a.attname c, a.attnotnull nn
             from pg_constraint k
             join pg_class cl on cl.oid = k.conrelid
             join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
             join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
            where k.contype = 'f' and k.confrelid = 'public.staff_profiles'::regclass
              and cl.relname not in ('staff_branches')`,
        );
        await client.query("savepoint nhan_su_thu");
        try {
          for (const t of tham) {
            if (!/^[a-z_][a-z0-9_]*$/.test(t.t) || !/^[a-z_][a-z0-9_]*$/.test(t.c)) continue;
            if (t.nn) {
              const { rows: con } = await client.query(`select count(*)::int n from public.${t.t} where ${t.c} = any($1)`, [nIds]);
              if (con[0].n > 0) throw new Error(`${con[0].n} dòng ở ${t.t}.${t.c} còn trỏ vào nhân sự Fixture`);
            } else {
              await client.query(`update public.${t.t} set ${t.c} = null where ${t.c} = any($1)`, [nIds]);
            }
          }
          await xoa("gán chi nhánh", `delete from staff_branches where staff_id = any($1)`, [nIds]);
          await xoa("nhân sự do phép thử dựng", `delete from staff_profiles where id = any($1)`, [nIds]);
          // Mỗi nhân viên còn một tài khoản đăng nhập (Supabase Auth) cùng `id`. Xoá hồ sơ
          // mà để tài khoản lại là rác ngầm; xoá tài khoản thì hồ sơ tự theo (on delete cascade).
          await xoa("tài khoản đăng nhập của nhân sự Fixture", `delete from auth.users where id = any($1)`, [nIds]);
          await client.query("release savepoint nhan_su_thu");
        } catch (e) {
          await client.query("rollback to savepoint nhan_su_thu");
          console.log(`   Giữ ${ns.length} nhân sự Fixture: ${e.message}`);
        }
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

    // Chi nhánh do phép thử dựng (tên bắt đầu "Fixture"/"FIXTURE-"). Chi nhánh
    // thật có tên riêng, không bao giờ mang tiền tố này. Chỉ xoá khi đã hết bộ
    // ảnh, khách và nhân sự gắn vào — còn dấu vết thì giữ lại và báo, không ép.
    const { rows: cn } = await client.query(
      `select id, name from branches where name ilike 'fixture%'`,
    );
    for (const c of cn) {
      const { rows: vet } = await client.query(
        `select (select count(*) from galleries where branch_id = $1)
              + (select count(*) from customers where branch_id = $1)
              + (select count(*) from staff_branches where branch_id = $1) as n`,
        [c.id],
      );
      if (Number(vet[0].n) > 0) {
        console.log(`   Giữ chi nhánh "${c.name}": còn ${vet[0].n} dòng gắn vào.`);
        continue;
      }
      await client.query("savepoint chi_nhanh_thu");
      try {
        await xoa("thông báo của chi nhánh thử", `delete from notifications where branch_id = $1`, [c.id]);
        await xoa("cài đặt của chi nhánh thử", `delete from settings where branch_id = $1`, [c.id]);
        await xoa("chi nhánh do phép thử dựng", `delete from branches where id = $1`, [c.id]);
        await client.query("release savepoint chi_nhanh_thu");
      } catch (e) {
        // Một bảng khác còn trỏ vào chi nhánh này — giữ lại, không làm gãy cả lượt dọn.
        await client.query("rollback to savepoint chi_nhanh_thu");
        console.log(`   Giữ chi nhánh "${c.name}": ${e.message}`);
      }
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
