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
  let galleryId = id;

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!UUID_REGEX.test(id)) {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const decodedId = decodeURIComponent(id);
    
    // Tìm bộ ảnh chứa mã hợp đồng này (trùng mã thì lấy mới nhất)
    const { data } = await admin
      .from("galleries")
      .select("id")
      .contains("lark_contract_codes", [decodedId])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      galleryId = data.id;
    }
  }

  return (
    <main className="mx-auto max-w-4xl p-6">
      <GalleryDetail galleryId={galleryId} />
    </main>
  );
}
