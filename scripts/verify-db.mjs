#!/usr/bin/env node
/**
 * verify-db — asserts that the database actually looks the way a task claims.
 *
 * OWNER: PM / reviewer gate. Agents run it, they do not edit it.
 *
 * Why this exists: an agent reported "ran npm run db:seed" and moved on while
 * every table still held zero rows — the script had died on a syntax error.
 * Checking that by hand after every task does not scale, so the check lives
 * here and the Definition of Done requires it to pass.
 *
 * Exit code 0 = every check passed. Anything else = do not claim the task done.
 *
 * Usage:
 *   npm run verify:db            structure only (works on an empty database)
 *   npm run verify:db -- --seed  also require seed data to be present
 */

import pg from "pg";

const REQUIRE_SEED = process.argv.includes("--seed");

const EXPECTED_TABLES = [
  "activity_logs", "babies", "branches", "customers", "deliveries", "galleries",
  "notifications", "packages", "photos", "selection_items", "selection_ops",
  "selections", "settings", "share_links", "shoots", "staff_branches",
  "staff_profiles",
  // BB-100 — danh mục sản phẩm và dòng hàng hợp đồng.
  "gallery_items", "products",
  // BB-101 — khách mua thêm và ảnh đặt vào sản phẩm in.
  "selection_addons", "selection_placements",
  // BB-115 — ghi nhận thanh toán phát sinh.
  "gallery_payments",
];

const EXPECTED_VIEWS = ["v_gallery_progress", "v_share_links"];
const EXPECTED_STAFF_ROLES = ["owner", "branch_manager", "cs", "photographer", "retoucher"];

const results = [];
const check = (name, pass, detail = "") => results.push({ name, pass, detail });

function env(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`Thiếu biến ${key}. Kiểm tra .env.local.`);
    process.exit(2);
  }
  return v;
}

async function main() {
  const dbUrl = env("SUPABASE_DB_URL");
  const apiUrl = env("NEXT_PUBLIC_SUPABASE_URL").replace(/\/$/, "");
  const publishableKey = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");

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

  // --- structure ----------------------------------------------------------

  const tables = await client.query(
    `select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename`,
  );
  const names = tables.rows.map((r) => r.tablename);
  const missing = EXPECTED_TABLES.filter((t) => !names.includes(t));
  check(`${EXPECTED_TABLES.length} bảng tồn tại`, missing.length === 0,
    missing.length ? `thiếu: ${missing.join(", ")}` : `${names.length} bảng`);

  // RLS is the whole security model; a single table without it is a hole.
  const noRls = tables.rows.filter((r) => !r.rowsecurity).map((r) => r.tablename);
  check("RLS bật trên mọi bảng", noRls.length === 0,
    noRls.length ? `chưa bật: ${noRls.join(", ")}` : `${EXPECTED_TABLES.length}/${EXPECTED_TABLES.length}`);

  const views = await client.query(
    `select viewname from pg_views where schemaname = 'public'`,
  );
  const viewNames = views.rows.map((r) => r.viewname);
  const missingViews = EXPECTED_VIEWS.filter((v) => !viewNames.includes(v));
  check("2 view báo cáo", missingViews.length === 0,
    missingViews.length ? `thiếu: ${missingViews.join(", ")}` : "đủ");

  const policies = await client.query(
    `select count(*)::int n from pg_policies where schemaname = 'public'`,
  );
  check("Có policy RLS", policies.rows[0].n >= 30, `${policies.rows[0].n} policy`);

  // Postgres checks privileges BEFORE policies, so a missing grant looks
  // nothing like an RLS denial. Both roles need explicit grants because the
  // project disables Supabase's automatic ones.
  for (const role of ["authenticated", "service_role"]) {
    const g = await client.query(
      `select count(distinct table_name)::int n
         from information_schema.role_table_grants
        where table_schema = 'public' and grantee = $1`,
      [role],
    );
    check(`Quyền bảng cho ${role}`, g.rows[0].n >= 15, `${g.rows[0].n} bảng`);
  }

  // --- the publishable key must never read business data ------------------

  let leaked = [];
  for (const t of ["galleries", "photos", "customers", "share_links", "activity_logs"]) {
    const r = await fetch(`${apiUrl}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
    });
    if (r.status === 200) leaked.push(t);
  }
  check("Khoá publishable không đọc được bảng nào", leaked.length === 0,
    leaked.length ? `LỘ: ${leaked.join(", ")}` : "bị từ chối hết");

  // --- consistency, whatever the row counts are ---------------------------

  // photo_count phải khớp số ảnh đang hoạt động.
  //
  // BỎ QUA album vừa tạo trong 10 phút gần đây. bb-dev dùng chung cho PM và
  // mọi agent; khi ai đó đang chạy npm test, fixture của họ tồn tại vài giây
  // với photo_count chưa kịp cập nhật, và cổng này báo hỏng oan. Ngày
  // 12.09.2026 nó báo hỏng hai lần liên tiếp rồi tự xanh lại, chỉ vì ARCH đang
  // chạy test BB-106 — mất thời gian truy một lỗi không tồn tại.
  //
  // Lệch photo_count thật là trạng thái ĐỌNG LẠI, không phải cửa sổ 30 giây:
  // nó do đồng bộ Drive hỏng giữa chừng và nằm đó cho tới khi có người sửa.
  // Nên cắt cửa sổ 10 phút không làm yếu phép kiểm, mà làm nó thôi kêu nhầm.
  // Một cổng kêu nhầm là một cổng người ta học cách phớt lờ.
  const drift = await client.query(
    `select g.title,
            g.photo_count as declared,
            (select count(*)::int from photos p where p.gallery_id = g.id and p.status = 'active') as actual
       from galleries g
      where g.created_at < now() - interval '10 minutes'
        and g.photo_count <> (select count(*)::int from photos p where p.gallery_id = g.id and p.status = 'active')`,
  );
  const fresh = await client.query(
    `select count(*)::int n from galleries where created_at >= now() - interval '10 minutes'`,
  );
  const freshNote = fresh.rows[0].n
    ? ` (bỏ qua ${fresh.rows[0].n} album vừa tạo — có thể là test đang chạy)`
    : "";
  check("photo_count khớp số ảnh thật", drift.rowCount === 0,
    drift.rowCount
      ? drift.rows.map((r) => `${r.title}: khai ${r.declared} / thật ${r.actual}`).join(" · ")
      : `khớp${freshNote}`);

  // One primary selection per gallery, enforced by a unique index — verified
  // here too so a bad seed shows up as a failed check, not a confusing 500.
  const dupPrimary = await client.query(
    `select gallery_id, count(*)::int n from selections
      where is_primary group by gallery_id having count(*) > 1`,
  );
  check("Mỗi album tối đa 1 selection primary", dupPrimary.rowCount === 0,
    dupPrimary.rowCount ? `${dupPrimary.rowCount} album vi phạm` : "đúng");

  const orphan = await client.query(
    `select count(*)::int n from selection_items si
       join selections s on s.id = si.selection_id
      where si.gallery_id <> s.gallery_id`,
  );
  check("selection_items.gallery_id nhất quán", orphan.rows[0].n === 0,
    `${orphan.rows[0].n} dòng lệch`);

  // --- seed data (only when asked) ----------------------------------------


    // A SECURITY DEFINER function runs as its owner, so RLS does not apply to
    // what it touches. If `anon` may execute one, then anyone holding the
    // publishable key — which ships inside every browser bundle by design —
    // can reach past the share token, the PIN, the session cookie and RLS in
    // one call. On 2026-09-10 get_gallery_photos, patch_selection_batch and
    // create_gallery_bundle were all reachable that way: passing a gallery id
    // as a parameter returned that gallery's photos with HTTP 200.
    // These functions are meant to be called by the server with the service
    // key. Nothing else should be able to call them at all.
    const definerFns = await client.query(`
      select p.proname,
             has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
    `);
    const reachable = definerFns.rows.filter((r) => r.anon_can).map((r) => r.proname);
    check(
      "Khoá công khai không gọi được hàm SECURITY DEFINER",
      reachable.length === 0,
      reachable.length
        ? `GỌI ĐƯỢC: ${reachable.join(", ")} — đi vòng qua token, PIN, cookie và RLS`
        : `${definerFns.rows.length} hàm, đã chặn hết`,
    );

    // Hạn mức chưa biết phải CHẶN chọn ảnh, không được mở trần.
    //
    // 0009 kiểm `if v_hard_limit is not null and v_selected_count > v_hard_limit`.
    // Mệnh đề đó đúng cho trường hợp "cho mua thêm không giới hạn", nhưng nó
    // nuốt luôn trường hợp hạn mức null: null làm cả mệnh đề thành null,
    // Postgres coi như false, trần biến mất. Khách chọn bao nhiêu cũng được và
    // tiền phụ trội trả về null. Không có màn hình đỏ nào cả.
    //
    // 0016 đặt một cổng chặn ngay đầu hàm. Cổng này canh cái cổng đó: ai viết
    // lại patch_selection_batch mà quên chép cổng sang thì hỏng ở đây, chứ
    // không hỏng ở hoá đơn ba tháng sau.
    const quotaGuard = await client.query(`
      select pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'patch_selection_batch'
    `);
    const guarded = quotaGuard.rows.filter((r) => r.src.includes("QUOTA_UNKNOWN"));
    check(
      "Hạn mức chưa biết thì chặn chọn ảnh",
      quotaGuard.rows.length > 0 && guarded.length === quotaGuard.rows.length,
      quotaGuard.rows.length === 0
        ? "KHÔNG THẤY patch_selection_batch"
        : guarded.length === quotaGuard.rows.length
          ? "có cổng QUOTA_UNKNOWN"
          : `${quotaGuard.rows.length - guarded.length}/${quotaGuard.rows.length} bản THIẾU cổng — trần chọn ảnh đang mở`,
    );

    // authenticated không được có TRUNCATE, TRIGGER hay REFERENCES.
    //
    // TRUNCATE KHÔNG đi qua RLS: có quyền đó là xoá sạch bảng được, bất kể
    // policy viết gì. Ngày 12.09.2026 cả 26/26 bảng đều đang cấp nó, trong đó
    // có gallery_payments — bảng vừa được dựng theo kiểu chỉ-ghi-thêm với
    // policy chặn update và delete. Policy đúng, quyền bảng phá nó.
    //
    // Nguồn là mặc định của Supabase (cấp ALL cho anon/authenticated/
    // service_role), không phải mã của dự án. policies.sql đã thu hồi của anon
    // nhưng bỏ sót authenticated. 0025 thu hồi, kèm alter default privileges
    // để bảng mới không nhận lại.
    //
    // Cổng này canh chỗ đó, vì một migration sau chỉ cần một dòng grant là mở
    // lại mà không ai để ý.
    const looseGrants = await client.query(`
      select table_name,
             string_agg(privilege_type, ',' order by privilege_type) as privs
      from information_schema.role_table_grants
      where grantee = 'authenticated'
        and table_schema = 'public'
        and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES')
      group by table_name
      order by table_name
    `);
    check(
      "authenticated không có TRUNCATE/TRIGGER/REFERENCES",
      looseGrants.rowCount === 0,
      looseGrants.rowCount
        ? `${looseGrants.rowCount} bảng còn: ` +
            looseGrants.rows.slice(0, 4).map((r) => `${r.table_name}(${r.privs})`).join(" · ") +
            (looseGrants.rowCount > 4 ? ` …` : "") +
            " — TRUNCATE không đi qua RLS"
        : "đã thu hồi hết",
    );


  if (REQUIRE_SEED) {
    const counts = {};
    for (const t of ["branches", "packages", "customers", "galleries", "photos",
                     "staff_profiles", "selections", "selection_items"]) {
      const r = await client.query(`select count(*)::int n from ${t}`);
      counts[t] = r.rows[0].n;
    }

    check("branches có dữ liệu", counts.branches >= 3, `${counts.branches} dòng`);
    check("packages có dữ liệu", counts.packages >= 3, `${counts.packages} dòng`);
    check("customers có dữ liệu", counts.customers >= 3, `${counts.customers} dòng`);
    check("galleries có dữ liệu", counts.galleries >= 3, `${counts.galleries} dòng`);
    check("photos có dữ liệu", counts.photos > 0, `${counts.photos} dòng`);
    check("selection_items có dữ liệu", counts.selection_items > 0,
      `${counts.selection_items} dòng`);

    const roles = await client.query(
      `select role::text, count(*)::int n from staff_profiles group by role`,
    );
    const have = roles.rows.map((r) => r.role);
    const missingRoles = EXPECTED_STAFF_ROLES.filter((r) => !have.includes(r));
    check("Đủ 5 vai nhân sự", missingRoles.length === 0,
      missingRoles.length ? `thiếu: ${missingRoles.join(", ")}` : have.join(", "));

    // Every staff row must be attached to a branch, or RLS hides everything
    // from them and the app looks broken for no visible reason.
    const unassigned = await client.query(
      `select count(*)::int n from staff_profiles sp
        where not exists (select 1 from staff_branches sb where sb.staff_id = sp.id)`,
    );
    check("Nhân sự nào cũng thuộc ít nhất 1 chi nhánh", unassigned.rows[0].n === 0,
      `${unassigned.rows[0].n} người chưa gán`);

    const progress = await client.query(`select count(*)::int n from v_gallery_progress`);
    check("v_gallery_progress có số liệu", progress.rows[0].n >= 3,
      `${progress.rows[0].n} dòng`);
  }

  await client.end();

  // --- report -------------------------------------------------------------

  const failed = results.filter((r) => !r.pass);
  console.info(`\n=== verify:db ${REQUIRE_SEED ? "(kèm kiểm seed)" : "(chỉ cấu trúc)"} ===\n`);
  for (const r of results) {
    console.info(`  ${r.pass ? "ĐẠT " : "HỎNG"}  ${r.name.padEnd(42)} ${r.detail}`);
  }
  console.info(`\n${results.length - failed.length}/${results.length} đạt\n`);

  if (failed.length) {
    console.error("Chưa đạt. Đừng đánh dấu task DONE khi còn dòng HỎNG.\n");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("verify:db lỗi:", err.message);
  process.exit(2);
});
