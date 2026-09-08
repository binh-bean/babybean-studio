/**
 * Customer gallery — the screen that carries the whole product.
 *
 * OWNER: DEV-FE. Task BB-033.
 * Spec: docs/07-ui-ux.md §3.2
 *
 * STATUS: scaffold.
 *
 * Keep this a Server Component. It resolves the share token, checks the
 * session, and streams the first page of photos; PhotoGrid below it is the
 * only client component that needs to ship JavaScript.
 */

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ filter?: string; subfolder?: string }>;
}

export default async function GalleryPage({ params }: PageProps) {
  const { token } = await params;

  // TODO(BB-032/BB-033):
  //   1. Look up share_links by sha256(token) -> notFound() when absent.
  //      Return the same 404 for revoked and expired links so the page never
  //      reveals whether an album exists (docs/12-security.md T1).
  //   2. If requires_pin and there is no valid bb_gs cookie for this link,
  //      redirect to /g/<token>/pin.
  //   3. Stamp first_viewed_at and move status ready -> in_review on first view.
  //   4. Load the gallery plus the first 200 photos (cursor paginated) and
  //      render <PhotoGrid> + <SelectionBar>.

  return (
    <main style={{ padding: 24 }}>
      <h1>BabyBean — trang chọn ảnh</h1>
      <p>Chưa triển khai (BB-033). Token: {token.slice(0, 6)}…</p>
    </main>
  );
}
