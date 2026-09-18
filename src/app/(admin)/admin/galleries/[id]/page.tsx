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
      {/* `key` KHÔNG phải trang trí — nó là lớp chặn thứ nhất của một lỗi
          nghiêm trọng.

          Điều hướng từ bộ A sang bộ B trong Next.js giữ nguyên component đang
          dựng và chỉ đổi prop. Mọi trạng thái bên trong **ở lại** — trong đó có
          `linkMoi`, chuỗi link gửi khách.

          Hậu quả đo được ngày 17/09: CSKH tạo link cho nhà A, bấm sang bộ của
          nhà B, và khung "Link gửi khách" vẫn treo link của nhà A dưới tiêu đề
          của nhà B — kèm dòng chữ "gửi thẳng cho khách". Gửi đi là nhà B mở
          được ảnh con nhà A.

          `key` đổi thì React tháo component cũ và dựng lại từ đầu, nên mọi trạng
          thái — kể cả trạng thái ai đó thêm sau này — đều sạch. Đừng gỡ dòng này. */}
      <GalleryDetail key={id} galleryId={id} />
    </main>
  );
}
