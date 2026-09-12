/**
 * /admin/galleries/[id] — chi tiết bộ ảnh cho CSKH.
 *
 * OWNER: DEV-FE. Task BB-103.
 *
 * Màn hình chặn cho gọn; route API kiểm lại quyền, chi nhánh và trạng thái
 * khoá một lần nữa — màn hình không phải ranh giới an ninh.
 */

import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { GalleryDetail } from "@/components/features/admin/gallery-detail";

export const dynamic = "force-dynamic";

export default async function GalleryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireStaff();
  } catch (err) {
    if (err instanceof AuthError) redirect("/login?next=%2Fadmin%2Fgalleries");
    throw err;
  }

  const { id } = await params;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <GalleryDetail galleryId={id} />
    </main>
  );
}
