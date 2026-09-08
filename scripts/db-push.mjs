#!/usr/bin/env node
/**
 * Apply db/schema.sql then db/policies.sql to the configured Supabase project.
 * OWNER: DEV-OPS. Task BB-003.
 *
 * Refuses to run against production unless ALLOW_PROD_PUSH=1 — schema.sql is a
 * full snapshot and would fight with anything already there. Production takes
 * migrations from db/migrations/, never this script.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const dbUrl = process.env.SUPABASE_DB_URL || "";

if (supabaseUrl.includes("prod") && process.env.ALLOW_PROD_PUSH !== "1") {
  console.error("Refusing to push a full schema to production. Use db/migrations/.");
  process.exit(1);
}

if (!dbUrl) {
  console.error("SUPABASE_DB_URL is missing. Please check .env.local.");
  process.exit(1);
}

const { Client } = pg;

async function run() {
  const client = new Client({
    connectionString: dbUrl,
  });

  try {
    await client.connect();
    console.log("Connected to database successfully.");

    // Check if database is already initialized
    const checkRes = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'branches'
      );
    `);

    if (checkRes.rows[0].exists) {
      console.log("Database đã được khởi tạo. Bỏ qua chạy schema.");
      process.exit(0);
    }
    
    // Push schema
    const schemaPath = path.resolve(__dirname, '../db/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log("Applying db/schema.sql in transaction...");
    await client.query('BEGIN');
    try {
      await client.query(schemaSql);
      await client.query('COMMIT');
      console.log("Successfully applied db/schema.sql.");
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Error applying schema.sql:", e.message);
      process.exit(1);
    }
    
    // Push policies
    const policiesPath = path.resolve(__dirname, '../db/policies.sql');
    const policiesSql = fs.readFileSync(policiesPath, 'utf8');
    
    console.log("Applying db/policies.sql in transaction...");
    await client.query('BEGIN');
    try {
      await client.query(policiesSql);
      await client.query('COMMIT');
      console.log("Successfully applied db/policies.sql.");
    } catch (e) {
      await client.query('ROLLBACK');
      console.error("Error applying policies.sql:", e.message);
      process.exit(1);
    }
    
    console.log("All done.");
  } catch (err) {
    console.error("Connection error:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
