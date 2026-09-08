#!/usr/bin/env node
/**
 * Apply db/schema.sql then db/policies.sql to the configured Supabase project.
 * OWNER: DEV-OPS. Task BB-003.
 *
 * STATUS: scaffold.
 *
 * Refuses to run against production unless ALLOW_PROD_PUSH=1 — schema.sql is a
 * full snapshot and would fight with anything already there. Production takes
 * migrations from db/migrations/, never this script.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

if (url.includes("prod") && process.env.ALLOW_PROD_PUSH !== "1") {
  console.error("Refusing to push a full schema to production. Use db/migrations/.");
  process.exit(1);
}

console.error("Not implemented (BB-003). Run db/schema.sql then db/policies.sql via psql or the Supabase SQL editor.");
process.exit(1);
