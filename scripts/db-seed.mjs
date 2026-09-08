import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
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
  let seedPassword = process.env.SEED_PASSWORD;
  if (!seedPassword) {
    seedPassword = crypto.randomBytes(8).toString('hex') + 'A1!';
    console.log(`Generated random seed password: ${seedPassword}`);
  }

  const staffRecords = [];
  for (const staff of DEMO_STAFF) {
    let user;
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
        password: seedPassword,
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
          const photoId = `eeeeeeee-0000-0000-0000-${String(photoCounter).padStart(12, '0')}`;
          if (gal.id === 'dddddddd-0000-0000-0000-000000000001') {
            photoIds.push(photoId); // Save for selection_items later
          }
          await client.query(`
            INSERT INTO photos (id, gallery_id, drive_file_id, file_name, mime_type, sort_index)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET 
              file_name = EXCLUDED.file_name,
              drive_file_id = EXCLUDED.drive_file_id,
              mime_type = EXCLUDED.mime_type,
              sort_index = EXCLUDED.sort_index;
          `, [
            photoId,
            gal.id,
            `FAKE_FILE_${photoId}`,
            `IMG_${photoCounter}.jpg`,
            'image/jpeg',
            i
          ]);
          photoCounter++;
        }
      }
      await client.query('UPDATE galleries SET photo_count = (SELECT count(*) FROM photos WHERE photos.gallery_id = galleries.id)');
      await client.query('COMMIT');
      console.log("Photos inserted and photo_count updated.");
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Error inserting photos:", e.message);
      process.exit(1);
    }

    console.log("--- 5. Inserting primary selection & items for Gallery 1 ---");
    await client.query('BEGIN');
    try {
      const shareLinkId1 = 'ffffffff-0000-0000-0000-000000000001';
      const token1 = 'DEMO-TOKEN-NO-PIN';
      const hash1 = crypto.createHash('sha256').update(token1).digest('hex');
      
      await client.query(`
        INSERT INTO share_links (id, gallery_id, token_hash, token_prefix, role, label, requires_pin, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          token_prefix = EXCLUDED.token_prefix,
          role = EXCLUDED.role,
          label = EXCLUDED.label,
          requires_pin = EXCLUDED.requires_pin,
          status = EXCLUDED.status;
      `, [
        shareLinkId1,
        'dddddddd-0000-0000-0000-000000000001',
        hash1,
        token1.substring(0, 6),
        'owner',
        'Mẹ bé',
        false,
        'active'
      ]);

      const shareLinkId2 = 'ffffffff-0000-0000-0000-000000000002';
      const token2 = 'dev_token_with_pin_123';
      const tokenHash2 = crypto.createHash('sha256').update(token2).digest('hex');
      
      await client.query(`
        INSERT INTO share_links (id, gallery_id, token_hash, token_prefix, role, label, requires_pin, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          token_hash = EXCLUDED.token_hash,
          token_prefix = EXCLUDED.token_prefix,
          role = EXCLUDED.role,
          label = EXCLUDED.label,
          requires_pin = EXCLUDED.requires_pin,
          status = EXCLUDED.status;
      `, [
        shareLinkId2,
        'dddddddd-0000-0000-0000-000000000001',
        tokenHash2,
        'dev_pi',
        'co_editor',
        'Bố bé',
        true,
        'active'
      ]);

      const selectionId = '12345678-0000-0000-0000-000000000001';
      await client.query(`
        INSERT INTO selections (id, gallery_id, share_link_id, is_primary, display_name)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET
          is_primary = EXCLUDED.is_primary,
          display_name = EXCLUDED.display_name;
      `, [
        selectionId,
        'dddddddd-0000-0000-0000-000000000001',
        shareLinkId1,
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
          ON CONFLICT (selection_id, photo_id) DO UPDATE SET
            mark = EXCLUDED.mark;
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
    const countQueries = {
      staff_profiles: 'SELECT COUNT(*) as count FROM staff_profiles',
      staff_branches: 'SELECT COUNT(*) as count FROM staff_branches',
      galleries: 'SELECT COUNT(*) as count FROM galleries',
      photos: 'SELECT COUNT(*) as count FROM photos',
      selections: 'SELECT COUNT(*) as count FROM selections',
      selection_items: 'SELECT COUNT(*) as count FROM selection_items',
      share_links: 'SELECT COUNT(*) as count FROM share_links'
    };

    for (const [table, query] of Object.entries(countQueries)) {
      const res = await client.query(query);
      console.log(`${table}: ${res.rows[0].count} rows`);
    }

    console.log("--- 7. Querying v_gallery_progress ---");
    const progressRes = await client.query('SELECT * FROM v_gallery_progress');
    console.table(progressRes.rows);

    console.log("\n============================================================");
    console.log("SEEDING COMPLETED. USE THESE CREDENTIALS FOR TESTING:");
    console.log(`Staff Password : ${seedPassword}`);
    console.log(`Gallery Link 1 : /g/DEMO-TOKEN-NO-PIN`);
    console.log(`Gallery Link 2 : /g/dev_token_with_pin_123 (PIN: 1234)`);
    console.log("============================================================\n");

  } catch (err) {
    console.error("DB connection error:", err.message);
  } finally {
    await client.end();
  }
}

run();
