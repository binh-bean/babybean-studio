/**
 * Network-level interceptor for Google Drive image requests.
 *
 * OWNER: QA-BOT. Task BB-134.
 *
 * Loaded via --require when the Next.js dev server starts for E2E tests.
 * Replaces globalThis.fetch so that any request to lh3.googleusercontent.com
 * or drive.google.com/thumbnail returns a valid 1x1 JPEG instead of hitting
 * the internet.
 *
 * DOES NOT mock createAdminClient, Supabase queries, cookie signing, or any
 * permission check — those all run for real. Only the final Drive HTTP call
 * is intercepted, at the same layer the real code uses (globalThis.fetch).
 */

// A valid 1x1 PNG — the smallest image that makes naturalWidth > 0 in a
// real browser, which is the whole point of BB-134.
// PNG chosen over JPEG because minimal JPEGs need complex Huffman tables
// that some encoders get wrong; a minimal PNG is 70 bytes and universally
// 10x10 PNG trong suốt
const IMG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC',
  'base64'
);

const origFetch = globalThis.fetch;

globalThis.fetch = async function patchedFetch(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (
    url.includes("lh3.googleusercontent.com") ||
    url.includes("drive.google.com/thumbnail")
  ) {
    // Clone to a plain Uint8Array so the Response body is a single-chunk
    // ReadableStream that Next.js can forward without corruption.  Add an
    // explicit Content-Length so the browser knows the exact size.
    const body = new Uint8Array(IMG_1x1);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Length": String(body.byteLength),
      },
    });
  }

  return origFetch(input, init);
};
