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
import { ManChanBoAnh } from "@/components/features/admin/man-chan-bo-anh";
import {
  duongDanSauDangNhap,
  quyenThaoTacBoAnh,
  xetQuyenXemBoAnh,
} from "@/lib/auth/quyen-xem-bo-anh";

export const dynamic = "force-dynamic";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function GalleryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let staff;
  try {
    staff = await requireStaff();
  } catch (err) {
    // BB-382 — link "Quản lý bộ ảnh" bấm từ Lark: đăng nhập xong phải quay về
    // ĐÚNG bộ này (trước đây `next=/admin/galleries` — mất id, nhân viên rơi
    // vào danh sách và không biết mình vừa bấm bộ nào).
    if (err instanceof AuthError) redirect(duongDanSauDangNhap(id));
    throw err;
  }

  // BB-382 — vai không có quyền xem bộ ảnh thì dừng TRƯỚC khi tra bộ: không
  // để lộ cả chuyện bộ có tồn tại hay không.
  if (!staff.permissions.includes("galleries:read")) {
    return <ManChanBoAnh lyDo="chua-co-quyen-xem" />;
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // Link cũ dạng `/admin/galleries/<mã hoá đơn>` vẫn mở được (trùng mã thì lấy
  // bộ mới nhất).
  let maHoaDon = id;
  try {
    maHoaDon = decodeURIComponent(id);
  } catch {
    // Chuỗi % hỏng — tra nguyên văn.
  }
  const { data: bo } = UUID_REGEX.test(id)
    ? await admin.from("galleries").select("id, branch_id, editor_id").eq("id", id).maybeSingle()
    : await admin
        .from("galleries")
        .select("id, branch_id, editor_id")
        .contains("lark_contract_codes", [maHoaDon])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!bo) return <ManChanBoAnh lyDo="khong-tim-thay" />;

  const lyDo = xetQuyenXemBoAnh(staff, bo as { branch_id: string; editor_id: string | null });
  if (lyDo) return <ManChanBoAnh lyDo={lyDo} />;

  const galleryId = bo.id as string;

  return (
    // BB-255: bản vẽ quan-tri-chi-tiet.webp dùng bố cục hai cột (nội dung
    // chính + cột phải mảnh cho bìa/link) — max-w-4xl cũ chỉ đủ cho một cột.
    // BB-290 (#31): bỏ `p-6` riêng — khung cuộn của layout đã tự đệm, thêm
    // lớp nữa ở đây là lý do H1 của trang chi tiết lệch x so với các trang
    // khác (cùng lỗi đã sửa ở viec-can-xu-ly/bao-cao/branches).
    <main className="mx-auto max-w-6xl">
      {/* `key` KHÔNG phải trang trí — nó là lớp chặn thứ nhất của một lỗi
          nghiêm trọng (BB-184).

          Điều hướng từ bộ A sang bộ B trong Next.js giữ nguyên component đang
          dựng và chỉ đổi prop. Mọi trạng thái bên trong **ở lại** — trong đó có
          `linkMoi`, chuỗi link gửi khách.

          Hậu quả đo được ngày 17/09: CSKH tạo link cho nhà A, bấm sang bộ của
          nhà B, và khung "Link gửi khách" vẫn treo link của nhà A dưới tiêu đề
          của nhà B — kèm dòng chữ "gửi thẳng cho khách". Gửi đi là nhà B mở
          được ảnh con nhà A.

          Khoá theo `galleryId` đã tra xong, không theo `id` trên địa chỉ: hai địa
          chỉ khác nhau trỏ về cùng một bộ ảnh thì không cần dựng lại màn. Đừng gỡ. */}
      <GalleryDetail key={galleryId} galleryId={galleryId} quyen={quyenThaoTacBoAnh(staff.permissions)} />
    </main>
  );
}
