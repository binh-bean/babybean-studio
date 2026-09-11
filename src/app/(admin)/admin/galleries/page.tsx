import { Metadata } from "next";
import { vi } from "@/i18n";
import { GalleryList } from "@/components/features/admin/gallery-list";

export const metadata: Metadata = {
  title: `${vi.admin.galleries.title} | BabyBean Studio`,
};

export default function AdminGalleriesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-display font-bold text-[var(--bb-fg)]">
          {vi.admin.galleries.title}
        </h1>
      </div>

      <GalleryList />
    </div>
  );
}
