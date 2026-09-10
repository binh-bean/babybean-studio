import Link from "next/link";
import { Metadata } from "next";
import { vi } from "@/i18n";
import { GalleryList } from "@/components/features/admin/gallery-list";
import { GalleryFilters } from "@/components/features/admin/gallery-filters";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";

export const metadata: Metadata = {
  title: `${vi.admin.galleries.title} | BabyBean Studio`,
};

export default function AdminGalleriesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-display font-bold text-[var(--bb-fg)]">
          {vi.admin.galleries.title}
        </h1>
        <Link
          href="/admin/galleries/create"
          className="inline-flex h-10 items-center rounded-[var(--bb-radius-sm)] bg-[var(--bb-primary)] px-4 text-sm font-medium text-[var(--bb-primary-fg)] hover:opacity-90"
        >
          Tạo album
        </Link>
      </div>
      </div>

      <GalleryFilters />
      
      <GalleryList />
      
      {/* Example pagination */}
      <div className="pt-4 flex justify-end">
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious disabled />
            </PaginationItem>
            <PaginationItem>
              <PaginationLink isActive>1</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationLink>2</PaginationLink>
            </PaginationItem>
            <PaginationItem>
              <PaginationNext />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
