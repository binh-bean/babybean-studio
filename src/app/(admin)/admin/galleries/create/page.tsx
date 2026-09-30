import { Metadata } from "next";
import { vi } from "@/i18n";
import { CreateGalleryWizard } from "@/components/features/admin/create-gallery-wizard";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/features/admin/page-header";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: `${vi.admin.galleries.createGalleryCta} | BabyBean Studio`,
};

/**
 * BB-332 — `?banGhiLark=<mã dòng Lark>` (từ khối "Bản ghi mới từ Lark"): thuật
 * sĩ tự đọc dòng đó (GET /api/admin/lark-moi?ma=…) để điền sẵn. SĐT không bao
 * giờ đi trên thanh địa chỉ — chỉ mã dòng.
 */
export default async function CreateGalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ banGhiLark?: string }>;
}) {
  const { banGhiLark } = await searchParams;
  const maDong = banGhiLark && /^rec[A-Za-z0-9]{3,40}$/.test(banGhiLark) ? banGhiLark : null;
  return (
    <div className="space-y-6">
      {/* BB-320 (Q-N1): cùng khối tiêu đề trang với mọi màn quản trị. */}
      <PageHeader
        title={vi.admin.galleries.createGalleryCta}
        description="Nhập thông tin buổi chụp để tạo bộ ảnh cho khách."
        actions={
          <Link href="/admin/galleries">
            <Button variant="outline" size="sm">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Về danh sách bộ ảnh
            </Button>
          </Link>
        }
      />

      <CreateGalleryWizard banGhiLark={maDong} />
    </div>
  );
}
