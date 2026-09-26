import { Metadata } from "next";
import { vi } from "@/i18n";
import { GalleryList } from "@/components/features/admin/gallery-list";
import { CanXuLy } from "@/components/features/admin/can-xu-ly";

export const metadata: Metadata = {
  title: `${vi.admin.galleries.title} | BabyBean Studio`,
};

export default function AdminGalleriesPage() {
  return (
    <div className="space-y-4 lg:space-y-6">
      {/*
        Trên điện thoại, tên màn đã nằm ngay cạnh chữ BabyBean ở thanh trên
        cùng (xem `admin-header.tsx`), nên tiêu đề to ở đây là dòng thứ hai nói
        cùng một điều — và nó đẩy danh sách xuống thêm 56px trên một màn cao
        812px. Chủ studio 22/09/2026: "dồn gọn lên hết, sát với chữ BabyBean".
      */}
      <div className="hidden flex-wrap items-center justify-between gap-3 lg:flex">
        <h1 className="text-2xl font-display font-bold text-[var(--bb-fg)]">
          {vi.admin.galleries.title}
        </h1>
      </div>

      {/* BB-257: khối cảnh báo "cần xử lý trước khi gửi khách" — tự ẩn khi rỗng. */}
      <CanXuLy />

      <GalleryList />
    </div>
  );
}
