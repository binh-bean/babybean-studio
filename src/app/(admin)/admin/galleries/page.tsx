import { Metadata } from "next";
import { vi } from "@/i18n";
import { GalleryList } from "@/components/features/admin/gallery-list";
import { CanXuLy } from "@/components/features/admin/can-xu-ly";
import { BoAnhPageHeader } from "@/components/features/admin/bo-anh-page-header";

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
        BB-290 lượt 2: H1 "Bộ ảnh" + dòng phụ "n bộ đang mở · m chi nhánh" +
        nút "+ Tạo bộ ảnh" theo quan-tri-bo-anh-bang.png (BoAnhPageHeader).
      */}
      <BoAnhPageHeader />

      {/* BB-257 → BB-290 lượt 2: một dải cảnh báo GỌN, không còn liệt kê chi
          tiết ở trang danh sách — chi tiết đã có ở /admin/viec-can-xu-ly. */}
      <CanXuLy />

      <GalleryList />
    </div>
  );
}
