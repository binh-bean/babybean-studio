"use client";

/**
 * BB-334B — trang `/k/<mã>/<n>`: tra bộ thứ n của nhà rồi dựng LẠI màn chọn
 * ảnh hiện có (`GalleryApp`), không viết màn mới.
 *
 * OWNER: DEV-FE. Hợp đồng: docs/29-link-gia-dinh.md §1, §6.
 *
 *  1. `GET /api/k/<mã>` — đặt cookie phiên của đúng link + danh sách bộ.
 *  2. `traBoTheoSoThuTu` → uuid bộ thứ n.
 *  3. `datBoAnhKhach({ ma, galleryId })` TRƯỚC khi `GalleryApp` dựng: từ đó mọi
 *     `goiApiKhach("/api/g/…")` của tab này mang `x-bb-bo` của đúng bộ này.
 */
import Link from "next/link";
import { useEffect } from "react";
import { vi } from "@/i18n";
import { Spinner } from "@/components/ui/spinner";
import { giuA } from "@/lib/utils/giu-a";
import { datBoAnhKhach } from "@/lib/utils/goi-api-khach";
import { duongDanNha, traBoTheoSoThuTu } from "@/lib/utils/trang-gia-dinh";
import { useNhaGiaDinh } from "@/components/features/gallery/use-nha-gia-dinh";
import { GalleryApp } from "@/components/features/gallery/gallery-app";

const G = vi.gallery.giaDinh;

let henBoBo: ReturnType<typeof setTimeout> | null = null;

export function BoAnhTrongNha({ ma, n }: { ma: string; n: string }) {
  const { trangThai, taiLai } = useNhaGiaDinh(ma);
  const nha = trangThai.loai === "xong" ? trangThai.nha : null;
  const bo = nha ? traBoTheoSoThuTu(nha.boAnh, n) : null;

  // Đặt NGAY trong lượt dựng (không đợi effect): effect của GalleryApp — nơi
  // gọi /api/g/gallery đầu tiên — chạy trước effect của component cha.
  // Chỉ ở trình duyệt (`datBoAnhKhach` tự bỏ qua trên máy chủ).
  if (bo) datBoAnhKhach({ ma, galleryId: bo.id });

  // Rời trang (về trang gia đình) thì bỏ bộ. Bỏ TRỄ một nhịp: chế độ Strict của
  // React (dev) gỡ rồi gắn lại effect ngay lập tức, và effect của GalleryApp chạy
  // lại TRƯỚC effect này — xoá ngay thì lượt gọi lại đó đi thiếu `x-bb-bo`.
  useEffect(() => {
    if (henBoBo) clearTimeout(henBoBo);
    henBoBo = null;
    return () => {
      henBoBo = setTimeout(() => datBoAnhKhach(null), 0);
    };
  }, []);

  if (trangThai.loai === "dang_tai") {
    return (
      <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 p-6 text-foreground">
        <Spinner className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">{G.dangMo}</p>
      </div>
    );
  }

  if (trangThai.loai === "loi" || !bo || !nha) {
    const cau =
      trangThai.loai === "loi"
        ? trangThai.ma === "NOT_FOUND" || trangThai.ma === "LINK_EXPIRED"
          ? G.linkHetHan
          : G.loiMo
        : G.khongThayBuoi;
    return (
      <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-4 px-6 text-center text-foreground">
        <p data-testid="loi-bo-trong-nha" className="max-w-sm text-[15px] leading-relaxed">
          {giuA(cau)}
        </p>
        {trangThai.loai === "loi" ? (
          <button
            type="button"
            onClick={() => void taiLai()}
            className="h-11 rounded-full border border-border px-6 text-sm font-medium transition hover:bg-surface-2"
          >
            {G.thuLai}
          </button>
        ) : (
          <Link
            href={duongDanNha(ma)}
            className="inline-flex h-11 items-center rounded-full border border-border px-6 text-sm font-medium transition hover:bg-surface-2"
          >
            {G.veTrangGiaDinh}
          </Link>
        )}
      </div>
    );
  }

  return <GalleryApp key={bo.id} token={ma} giaDinh={{ ma, boAnh: nha.boAnh, boHienTaiId: bo.id }} />;
}
