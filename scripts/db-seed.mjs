#!/usr/bin/env node
/**
 * Create the demo auth users, then apply db/seed.sql.
 * OWNER: DEV-BE. Task BB-008.
 *
 * STATUS: scaffold.
 *
 * Order matters: staff_profiles.id references auth.users(id), so the auth
 * users must exist before the seed runs. Create five users covering the roles
 * owner / branch_manager / cs / photographer / retoucher, insert the matching
 * staff_profiles and staff_branches rows, then run db/seed.sql.
 *
 * Never run against production.
 */

console.error("Not implemented (BB-008).");
process.exit(1);
