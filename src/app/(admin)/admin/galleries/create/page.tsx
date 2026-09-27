import { Metadata } from "next";
import { vi } from "@/i18n";
import { CreateGalleryWizard } from "@/components/features/admin/create-gallery-wizard";
import { Button } from "@/components/ui/button";
import { PAGE_TITLE_CLASS } from "@/components/features/admin/page-header";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: `${vi.admin.galleries.createGalleryCta} | BabyBean Studio`,
};

export default function CreateGalleryPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/galleries">
          <Button variant="ghost" size="icon">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <h1 className={PAGE_TITLE_CLASS}>{vi.admin.galleries.createGalleryCta}</h1>
      </div>

      <CreateGalleryWizard />
    </div>
  );
}
