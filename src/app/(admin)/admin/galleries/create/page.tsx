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

export default function CreateGalleryPage() {
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

      <CreateGalleryWizard />
    </div>
  );
}
