#!/usr/bin/env tsx
/**
 * Manually sync one gallery from Drive. Useful for debugging a folder that
 * fails through the UI.
 *
 * OWNER: DEV-INT. Task BB-014.
 * Usage: npm run drive:sync -- <galleryId>
 *
 * STATUS: scaffold. Shares the same service code as the API route — do not
 * duplicate the sync logic here.
 */

const galleryId = process.argv[2];

if (!galleryId) {
  console.error("Usage: npm run drive:sync -- <galleryId>");
  process.exit(1);
}

console.error(`Not implemented (BB-014). Gallery: ${galleryId}`);
process.exit(1);
