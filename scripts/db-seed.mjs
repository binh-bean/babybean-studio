import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const dbUrl = process.env.SUPABASE_DB_URL || "";

if (!supabaseUrl || !serviceRoleKey || !dbUrl) {
  console.error("Missing SUPABASE env vars. Check .env.local.");
  process.exit(1);
}

if (supabaseUrl.includes("prod") || dbUrl.includes("prod")) {
  console.error("Refusing to run seed against production.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { Client } = pg;

const DEMO_STAFF = [
  { email: 'owner@demo.babybean.vn', name: 'Đỗ Chủ Quán', role: 'owner', branches: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'] },
  { email: 'manager.q1@demo.babybean.vn', name: 'Lý Quản Lý', role: 'branch_manager', branches: ['11111111-1111-1111-1111-111111111111'] },
  { email: 'cs.q1@demo.babybean.vn', name: 'Trần Tiếp Tân', role: 'cs', branches: ['11111111-1111-1111-1111-111111111111'] },
  { email: 'photo.q1@demo.babybean.vn', name: 'Phạm Phó Nháy', role: 'photographer', branches: ['11111111-1111-1111-1111-111111111111'] },
  { email: 'retouch.td@demo.babybean.vn', name: 'Vũ Vịt Khang', role: 'retoucher', branches: ['22222222-2222-2222-2222-222222222222'] },
];

async function run() {
  console.log("--- 1. Creating Auth Users ---");
  const staffRecords = [];

  for (const staff of DEMO_STAFF) {
    let user;
    // Check if user exists
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      console.error("Error listing users:", listError.message);
      process.exit(1);
    }
    const existing = users.users.find(u => u.email === staff.email);
    if (existing) {
      user = existing;
      console.log(`User ${staff.email} already exists (id: ${user.id}).`);
    } else {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email: staff.email,
        password: 'SeedPassword123!',
        email_confirm: true,
      });
      if (createError) {
        console.error("Error creating user:", createError.message);
        process.exit(1);
      }
      user = created.user;
      console.log(`Created user ${staff.email} (id: ${user.id}).`);
    }
    staffRecords.push({ ...staff, id: user.id });
  }

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    console.log("Connected to db via pg.");

    console.log("--- 2. Running db/seed.sql ---");
    const seedSqlPath = path.resolve(__dirname, '../db/seed.sql');
    const seedSql = fs.readFileSync(seedSqlPath, 'utf8');
    await client.query('BEGIN');
    try {
      await client.query(seedSql);
      await client.query('COMMIT');
      console.log("Executed db/seed.sql.");
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Error running db/seed.sql:", e.message);
      process.exit(1);
    }

    console.log("--- 3. Inserting staff_profiles and staff_branches ---");
    await client.query('BEGIN');
    try {
      for (const st of staffRecords) {
        await client.query(`
          INSERT INTO staff_profiles (id, full_name, email, role)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, role = EXCLUDED.role;
        `, [st.id, st.name, st.email, st.role]);

        for (let i = 0; i < st.branches.length; i++) {
          const branchId = st.branches[i];
          const isPrimary = (i === 0);
          await client.query(`
            INSERT INTO staff_branches (staff_id, branch_id, is_primary)
            VALUES ($1, $2, $3)
            ON CONFLICT (staff_id, branch_id) DO NOTHING;
          `, [st.id, branchId, isPrimary]);
        }
      }
      await client.query('COMMIT');
      console.log("Staff records inserted.");
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Error inserting staff:", e.message);
      process.exit(1);
    }

    console.log("--- 4. Inserting photos ---");
    const galleries = [
      { id: 'dddddddd-0000-0000-0000-000000000001', count: 20 },
      { id: 'dddddddd-0000-0000-0000-000000000002', count: 15 },
      { id: 'dddddddd-0000-0000-0000-000000000003', count: 35 },
    ];

    const photoIds = [];
    await client.query('BEGIN');
    try {
      let photoCounter = 1;
      for (const gal of galleries) {
        for (let i = 0; i < gal.count; i++) {
          const photoId = \`eeeeeeee-0000-0000-0000-\${String(photoCounter).padStart(12, '0')}\`;
          if (gal.id === 'dddddddd-0000-0000-0000-000000000001') {
            photoIds.push(photoId); // Save for selection_items later
          }
          await client.query(`
            INSERT INTO photos (id, gallery_id, drive_file_id, file_name, mime_type, sort_index)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO NOTHING;
          `, [
            photoId,
            gal.id,
            \`FAKE_FILE_\${photoId}\`,
            \`IMG_\${photoCounter}.jpg\`,
            'image/jpeg',
            i
          ]);
          photoCounter++;
        }
      }
      await client.query('COMMIT');
      console.log("Photos inserted.");
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Error inserting photos:", e.message);
      process.exit(1);
    }

    console.log("--- 5. Inserting primary selection & items for Gallery 1 ---");
    await client.query('BEGIN');
    try {
      const shareLinkId = 'ffffffff-0000-0000-0000-000000000001';
      await client.query(`
        INSERT INTO share_links (id, gallery_id, token_hash, token_prefix, role, label, requires_pin, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING;
      `, [
        shareLinkId,
        'dddddddd-0000-0000-0000-000000000001',
        'FAKE_HASH', // sha256 mock
        'FAKE_T',
        'owner',
        'Mẹ bé',
        false,
        'active'
      ]);

      const selectionId = '12345678-0000-0000-0000-000000000001';
      await client.query(`
        INSERT INTO selections (id, gallery_id, share_link_id, is_primary, display_name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING;
      `, [
        selectionId,
        'dddddddd-0000-0000-0000-000000000001',
        shareLinkId,
        true,
        'Mẹ bé Bơ'
      ]);

      // Insert ~18 selection_items (15 selected, 3 favored, etc.)
      for (let i = 0; i < 18; i++) {
        if (!photoIds[i]) break;
        const mark = (i < 15) ? 'selected' : (i < 17 ? 'favorite' : 'rejected');
        await client.query(`
          INSERT INTO selection_items (selection_id, photo_id, gallery_id, mark)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (selection_id, photo_id) DO NOTHING;
        `, [
          selectionId,
          photoIds[i],
          'dddddddd-0000-0000-0000-000000000001',
          mark
        ]);
      }

      await client.query('COMMIT');
      console.log("Selections inserted.");
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Error inserting selections:", e.message);
      process.exit(1);
    }

    console.log("--- 6. Reporting row counts ---");
    const tables = ['staff_profiles', 'staff_branches', 'galleries', 'photos', 'selections', 'selection_items', 'share_links'];
    for (const t of tables) {
      const res = await client.query(`SELECT COUNT(*) FROM \${t}`);
      console.log(`\${t}: \${res.rows[0].count} rows`);
    }

    console.log("--- 7. Querying v_gallery_progress ---");
    const progressRes = await client.query('SELECT * FROM v_gallery_progress');
    console.table(progressRes.rows);

  } catch (err) {
    console.error("DB connection error:", err.message);
  } finally {
    await client.end();
  }
}

run();
