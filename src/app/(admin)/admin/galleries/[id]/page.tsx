/**
 * /admin/galleries/[id] — chi tiết bộ ảnh cho CSKH.
 *
 * OWNER: DEV-FE. Task BB-103.
 *
 * Màn hình chặn cho gọn; route API kiểm lại quyền, chi nhánh và trạng thái
 * khoá một lần nữa — màn hình không phải ranh giới an ninh.
 */

import Link from "next/link";
import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/lib/auth/staff";
import { GalleryDetail } from "@/components/features/admin/gallery-detail";
import { ManChanBoAnh } from "@/components/features/admin/man-chan-bo-anh";
import {
  duongDanSauDangNhap,
  quyenThaoTacBoAnh,
  xetQuyenXemBoAnh,
  type QuyenThaoTacBoAnh,
} from "@/lib/auth/quyen-xem-bo-anh";
import { QUYEN_XOA_BO_ANH, soNgayConLai } from "@/lib/thung-rac/thung-rac";
import { vi } from "@/i18n/vi";

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
  // BB-409: `deleted_at` — bộ đang ở thùng rác thì hiện băng báo và khoá thao tác.
  const { data: bo } = UUID_REGEX.test(id)
    ? await admin.from("galleries").select("id, branch_id, editor_id, deleted_at").eq("id", id).maybeSingle()
    : await admin
        .from("galleries")
        .select("id, branch_id, editor_id, deleted_at")
        .contains("lark_contract_codes", [maHoaDon])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

  if (!bo) return <ManChanBoAnh lyDo="khong-tim-thay" />;

  const lyDo = xetQuyenXemBoAnh(staff, bo as { branch_id: string; editor_id: string | null });
  if (lyDo) return <ManChanBoAnh lyDo={lyDo} />;

  const galleryId = bo.id as string;
  const deletedAt = (bo as { deleted_at?: string | null }).deleted_at ?? null;
  // BB-409: bộ trong thùng rác — chỉ XEM (mọi nút ghi ẩn), lối duy nhất là Khôi phục ở Thùng rác.
  const quyen = deletedAt ? CHI_XEM : quyenThaoTacBoAnh(staff.permissions);
  const coTheXoa = !deletedAt && staff.permissions.includes(QUYEN_XOA_BO_ANH);

  return (
    // BB-255: bản vẽ quan-tri-chi-tiet.webp dùng bố cục hai cột (nội dung
    // chính + cột phải mảnh cho bìa/link) — max-w-4xl cũ chỉ đủ cho một cột.
    // BB-290 (#31): bỏ `p-6` riêng — khung cuộn của layout đã tự đệm, thêm
    // lớp nữa ở đây là lý do H1 của trang chi tiết lệch x so với các trang
    // khác (cùng lỗi đã sửa ở viec-can-xu-ly/bao-cao/branches).
    <main className="mx-auto max-w-6xl">
      {deletedAt && <BangThungRac deletedAt={deletedAt} coQuyenThungRac={staff.permissions.includes(QUYEN_XOA_BO_ANH)} />}
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
      <GalleryDetail key={galleryId} galleryId={galleryId} quyen={quyen} coTheXoa={coTheXoa} />
    </main>
  );
}

/** BB-409 — bộ trong thùng rác: không bày nút ghi nào (route vẫn là ranh giới). */
const CHI_XEM: QuyenThaoTacBoAnh = {
  ghi: false,
  suaThongTin: false,
  dongBo: false,
  guiAnhChinh: false,
  guiLink: false,
  moLai: false,
  daGiao: false,
  xuat: false,
  nhapTay: false,
};

/** BB-409 — băng báo "Bộ ảnh đang ở thùng rác — còn N ngày" + lối sang Thùng rác. */
function BangThungRac({ deletedAt, coQuyenThungRac }: { deletedAt: string; coQuyenThungRac: boolean }) {
  const t = vi.admin.thungRac;
  const n = soNgayConLai(deletedAt);
  return (
    <div
      role="status"
      data-testid="bang-thung-rac"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--bb-radius-sm)] border border-[var(--bb-danger)] bg-[var(--bb-surface-2)] px-4 py-3"
    >
      <div className="min-w-0">
        <p className="font-medium text-[var(--bb-danger)]">
          {n <= 0 ? t.bannerHomNay : t.bannerTieuDe.replace("{n}", String(n))}
        </p>
        <p className="mt-0.5 text-sm text-[var(--bb-fg-muted)]">{t.bannerMoTa}</p>
      </div>
      {coQuyenThungRac && (
        <Link
          href="/admin/thung-rac"
          className="inline-flex h-9 shrink-0 items-center rounded-md border border-[var(--bb-border)] bg-[var(--bb-surface)] px-3 text-sm font-medium text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]"
        >
          {t.moThungRac}
        </Link>
      )}
    </div>
  );
}
