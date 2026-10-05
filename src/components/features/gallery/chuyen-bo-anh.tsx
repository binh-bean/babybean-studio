"use client";

/**
 * BB-334B — chuyển buổi chụp ngay trong một bộ (bản vẽ 03 điện thoại: tấm
 * trượt từ đáy; 04 máy tính: bảng thả xuống dưới tên bộ).
 *
 * OWNER: DEV-FE.
 *
 * Đổi sang bộ khác là TẢI LẠI TRANG (thẻ `<a>` thường, không điều hướng phía
 * trình duyệt): mỗi trang `/k/<mã>/<n>` một vùng JS sạch — bộ ảnh của
 * `goiApiKhach` đặt đúng một lần, hàng chờ tim/nháp của bộ cũ không thể gửi
 * nhầm sang bộ mới. "Về trang album gia đình" thì dùng `Link` (trang gia
 * đình không gọi `/api/g/*` theo bộ).
 */
import Link from "next/link";
import { useEffect } from "react";
import { Check, ChevronRight, LayoutGrid } from "lucide-react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { giuA } from "@/lib/utils/giu-a";
import { duongDanBo, duongDanNha, tenBoHienThi, type BoAnhGiaDinh } from "@/lib/utils/trang-gia-dinh";

const G = vi.gallery.giaDinh;
const TONG_BIA = ["#e7d3c6", "#d6e2da", "#ead9cf", "#efe7dc"];

export interface GiaDinhTrongBo {
  /** Mã link gia đình trên địa chỉ. */
  ma: string;
  /** Mọi bộ đang hiện của nhà (từ `GET /api/k/<mã>`). */
  boAnh: BoAnhGiaDinh[];
  /** uuid bộ đang mở ở trang này. */
  boHienTaiId: string;
}

function ODong({ bo, ma, chiSo, dangXem }: { bo: BoAnhGiaDinh; ma: string; chiSo: number; dangXem: boolean }) {
  const noiDung = (
    <>
      <span
        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl lg:h-[72px] lg:w-[72px]"
        style={{ background: TONG_BIA[chiSo % TONG_BIA.length] }}
      >
        {bo.anhBiaId && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/img/${bo.anhBiaId}?w=200`} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-[1.3] text-[#2e2a27]">{tenBoHienThi(bo)}</span>
        <span className="block truncate text-[13px] leading-[1.45] text-[#6f665f]">{giuA(bo.trangThai.khach)}</span>
      </span>
      {dangXem ? (
        <span className="inline-flex shrink-0 items-center gap-1 text-[13px] font-medium text-[#2e2a27]">
          <Check className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
          <span className="lg:sr-only">{G.dangXem}</span>
        </span>
      ) : (
        <ChevronRight className="h-5 w-5 shrink-0 text-[#6f665f] lg:hidden" strokeWidth={1.5} aria-hidden="true" />
      )}
    </>
  );
  const lop = cn(
    "flex w-full items-center gap-3.5 rounded-xl py-3 text-left lg:px-3",
    dangXem ? "lg:bg-[#f3ede6]" : "lg:hover:bg-[#fbf7f2]",
  );
  if (dangXem) {
    return (
      <div data-testid="dong-chuyen-bo" data-so-thu-tu={bo.soThuTu} aria-current="page" className={lop}>
        {noiDung}
      </div>
    );
  }
  return (
    <a data-testid="dong-chuyen-bo" data-so-thu-tu={bo.soThuTu} href={duongDanBo(ma, bo.soThuTu)} className={lop}>
      {noiDung}
    </a>
  );
}

export function ChuyenBoAnh({ giaDinh, mo, onDong }: { giaDinh: GiaDinhTrongBo; mo: boolean; onDong: () => void }) {
  useEffect(() => {
    if (!mo) return;
    const phim = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDong();
    };
    window.addEventListener("keydown", phim);
    return () => window.removeEventListener("keydown", phim);
  }, [mo, onDong]);

  if (!mo) return null;
  const chiSo = new Map(giaDinh.boAnh.map((b, i) => [b.id, i]));
  const danhSach = giaDinh.boAnh.map((bo) => (
    <ODong key={bo.id} bo={bo} ma={giaDinh.ma} chiSo={chiSo.get(bo.id) ?? 0} dangXem={bo.id === giaDinh.boHienTaiId} />
  ));

  return (
    <div className="fixed inset-0 z-[60]" data-testid="chuyen-bo-anh">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onDong}
        className="absolute inset-0 h-full w-full cursor-default bg-[rgba(42,36,32,.45)] lg:bg-transparent"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={G.cacBuoiCuaGiaDinh}
        className={cn(
          "absolute bg-[#fffdf9] text-[#2e2a27]",
          // Điện thoại: tấm trượt từ đáy.
          "inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-[24px] px-4 pb-[max(20px,env(safe-area-inset-bottom))]",
          // Máy tính: bảng thả xuống ngay dưới tên bộ.
          "lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-[82px] lg:w-[384px] lg:-translate-x-1/2 lg:rounded-[16px] lg:border lg:border-[#e5dcd2] lg:px-2 lg:pb-2 lg:shadow-[0_8px_32px_rgb(46_42_39/12%)]",
        )}
      >
        <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 rounded-sm bg-[#e5dcd2] lg:hidden" />
        <h2 className="mt-4 border-b border-[#e5dcd2] pb-3 font-display text-[24px] font-normal not-italic leading-tight lg:hidden">
          {G.cacBuoiCuaGiaDinh}
        </h2>
        <p className="hidden px-3 pb-2 pt-4 text-[11px] font-medium uppercase tracking-[0.12em] text-[#6f665f] lg:block">
          {G.cacBuoiCuaGiaDinh}
        </p>
        <div className="divide-y divide-[#e5dcd2] lg:divide-y-0">{danhSach}</div>
        <Link
          href={duongDanNha(giaDinh.ma)}
          data-testid="ve-trang-gia-dinh"
          className={cn(
            "mt-4 flex h-12 items-center justify-center gap-2 rounded-full border border-[#e5dcd2] text-[15px] font-medium",
            "lg:mt-1 lg:h-11 lg:justify-start lg:rounded-none lg:border-0 lg:border-t lg:px-3 lg:text-[14px]",
          )}
        >
          <LayoutGrid className="h-[18px] w-[18px] lg:hidden" strokeWidth={1.5} aria-hidden="true" />
          {G.veTrangGiaDinh}
        </Link>
      </div>
    </div>
  );
}
