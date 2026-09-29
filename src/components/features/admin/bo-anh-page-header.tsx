"use client";

/**
 * Tiêu đề trang "Bộ ảnh" — BB-290 lượt 2.
 *
 * Theo quan-tri-bo-anh-bang.png: H1 "Bộ ảnh", dòng phụ "{n} bộ đang mở ·
 * {m} chi nhánh", nút mực "+ Tạo bộ ảnh" bên phải. Tách khỏi `GalleryList`
 * (đã có state `counts`/`branches` riêng) vì trang cần dòng phụ này NGAY
 * TRONG PageHeader — không muốn kéo cả state lọc/bảng của GalleryList lên
 * page.tsx chỉ để lấy hai con số.
 *
 * Một lượt gọi thêm `/api/admin/galleries?limit=1` + `/api/admin/galleries/
 * options` — hai route đã tồn tại, không có logic mới. Hỏng thì dòng phụ chỉ
 * ẩn, không chặn PageHeader hay trang render.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { PageHeader } from "./page-header";
import { vi } from "@/i18n/vi";
import { formatSo } from "@/lib/utils/dinh-dang";

export function BoAnhPageHeader() {
  const [moTa, setMoTa] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [resDs, resTuyChon] = await Promise.all([
          fetch("/api/admin/galleries?limit=1", { cache: "no-store" }),
          fetch("/api/admin/galleries/options", { cache: "no-store" }),
        ]);
        const [jsonDs, jsonTuyChon] = await Promise.all([
          resDs.json().catch(() => null),
          resTuyChon.json().catch(() => null),
        ]);
        if (!alive) return;
        if (!resDs.ok || !resTuyChon.ok) return;

        const counts = jsonDs?.data?.counts as Record<string, number> | undefined;
        const branches = jsonTuyChon?.data?.branches as unknown[] | undefined;
        if (!counts || !branches) return;

        // "Đang mở" = mọi bộ ảnh CHƯA lưu trữ — lưu trữ là trạng thái đóng hẳn,
        // các trạng thái còn lại (kể cả đã giao) vẫn coi là bộ đang chạy trong
        // hệ thống, khớp con số "48 bộ đang mở" trên bản vẽ.
        const dangMo = Math.max(0, (counts.all ?? 0) - (counts.archived ?? 0));
        setMoTa(`${formatSo(dangMo)} bộ đang mở · ${formatSo(branches.length)} chi nhánh`);
      } catch {
        // Dòng phụ là phần đánh bóng — hỏng thì ẩn, không báo lỗi ra trang.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <PageHeader
      title="Bộ ảnh"
      description={moTa}
      actions={
        <Link href="/admin/galleries/create">
          <Button className="bg-[var(--bb-fg)] text-[var(--bb-bg)] hover:opacity-90" size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            {vi.admin.galleries.createGalleryCta}
          </Button>
        </Link>
      }
    />
  );
}
