"use client";

import { isGalleryLocked } from "@/lib/gallery-status";
import { getCustomerProgressStep } from "@/lib/gallery/progress";
import type { GalleryStatus } from "@/types/domain";
import { ReviewPanel, type ReviewData } from "@/components/features/gallery/review-panel";
import { DanhSachBuoiChup } from "@/components/features/gallery/danh-sach-buoi-chup";
import { PhotoLightbox } from "@/components/features/gallery/photo-lightbox";
import { BangSanPhamCuaAnh } from "@/components/features/gallery/bang-san-pham-cua-anh";
import { CuaHang } from "@/components/features/gallery/cua-hang";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";
import { locHangInTrongGoi, conThieuAnh } from "@/lib/products/hang-in-trong-goi";
import { TomTatSanPhamIn } from "@/components/features/gallery/tom-tat-san-pham-in";
import { taiTheoLo, doDocDuocDungLuong, type TienDoTai } from "@/lib/utils/tai-anh";
import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, memo } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { buildHeartPayload } from "@/lib/selection/heart-payload";
import { useRouter } from "next/navigation";
import { Heart, AlertTriangle, AlertCircle, Info, ChevronRight, Lock, Printer } from "lucide-react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { QuotaDisplay } from "@/components/ui/quota-display";
import { CustomerProgress } from "@/components/ui/customer-progress";
import { ContractBreakdown, type ContractItem, formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PhotoPublic } from "@/types/domain";

interface GalleryAppProps {
  token: string;
}

interface GalleryApiResponse {
  id: string;
  title: string;
  welcomeMessage: string | null;
  status: string;
  babyName: string | null;
  shootDate: string | null;
  branch: {
    name: string;
    address?: string | null;
    hotline: string;
    zaloOa?: string;
    chatUrl?: string | null;
  };
  photoCount: number;
  /** BB-156: tổng dung lượng ảnh, để nói trước cho ba mẹ biết bộ này nặng bao nhiêu. */
  tongDungLuongAnh?: number;
  options?: { download?: boolean; notes?: boolean; invite?: boolean };
  quotaKnown: boolean;
  includedQuota: number | null;
  extraPhotoPrice: number;
  maxSelection: number | null;
  allowExtra: boolean;
  dueAt: string | null;
  subfolders: string[];
  selection: {
    id: string;
    selectedCount: number;
    favoriteCount: number;
    extraCount: number;
    extraAmount: number;
    addonsAmount: number;
    generalNote: string | null;
    submittedAt: string | null;
  };
  contract?: {
    totalValue: number;
    items: Array<{
      id: string;
      productId: string;
      name: string;
      // kind phân biệt gói chụp, hàng in, ảnh chỉnh sửa. API vẫn luôn trả
      // trường này; bản khai đầu của giao diện bỏ sót nên không lọc được sản
      // phẩm in ra khỏi gói chụp.
      kind: string;
      // `material` là thứ phân biệt ALBUM với ảnh in — "Album (Ultra HD)" so
      // với "Gỗ", "UV". Máy chủ vẫn luôn trả trường này (lib/selection/contract),
      // bản khai cũ của giao diện bỏ sót nên album trong gói bị đếm như một
      // suất in một tấm.
      material?: string | null;
      quantity: number;
      unitPrice: number | null;
      totalPrice: number | null;
      components: Array<{
        id: string;
        name: string;
        kind: string;
        material?: string | null;
        quantity: number;
      }>;
    }>;
  };
  placements?: Array<{ photoId: string; galleryItemId: string }>;
  /** Ảnh nào nằm trong album mua thêm nào (migration 0062). */
  albumPlacements?: Array<{ addonId: string; photoId: string }>;
  // Vòng duyệt ảnh đã chỉnh. null khi bộ ảnh chưa tới bước đó.
  review?: ReviewData | null;
  /**
   * Dải quảng cáo của studio, hiện ở khoảng trống bên tấm ảnh đang xem lớn.
   * `null` khi chủ studio chưa đặt ảnh trong màn Cài đặt.
   */
  banner?: { imageUrl: string; linkUrl: string | null } | null;
  addons?: {
    totalAmount: number;
    items: Array<{
      id: string;
      productId: string;
      name: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
      size: string | null;
      /** Tấm ảnh sản phẩm này in ra (migration 0061). */
      photoId?: string | null;
    }>;
    /** Danh mục ba mẹ CÓ THỂ mua thêm — xem ghi chú ở `/api/g/gallery`. */
    catalogue?: Array<{
      productId: string;
      name: string;
      kind: string;
      material: string | null;
      size: string | null;
      unitPrice: number;
      nhom: string | null;
      canGanAnh: boolean;
    }>;
  };
}

// ---------------------------------------------------------------------------
// LƯỚI ẢNH — phần chịu tải của màn khách
// ---------------------------------------------------------------------------
//
// Đo trên bản dựng production, điện thoại 375×812 (màn nét gấp đôi), CPU chậm
// 4×, mạng 1,6 Mbps trễ 150ms. Bộ 1.235 tấm — số tấm, tỉ lệ khung và số thư
// mục con lấy từ bộ THẬT lớn nhất trên bb-dev; ảnh và tên file là dữ liệu mẫu
// vì repo này công khai. Mỗi cột là số giữa của ba lượt chạy.
//
//                              trước      sau
//   tấm đầu tiên hiện ra       6.134ms    3.959ms
//   đầy một màn hình (6 tấm)   6.224ms    4.851ms
//   thẻ ảnh nằm trong DOM      1.235      10
//   nút DOM                    11.262     244
//   tác vụ chặn dài nhất       360ms      179ms
//   bộ nhớ JS                  9,2 MB     5,4 MB
//   thả tim ở tấm thứ 900      44ms       4,8ms   (chậm nhất 62ms → 11ms)
//   dung lượng một tấm         92,8 KB    31,4 KB
//
// Ba nguyên nhân, ba chỗ sửa ở ngay dưới đây.

/** Khoảng cách giữa các thẻ, khớp với `gap-2.5 sm:gap-4` của Tailwind. */
const KHE_HEP = 10; // gap-2.5 dưới 640px
const KHE_RONG = 16; // gap-4 từ 640px

/** Số cột, khớp với `grid-cols-2 sm:grid-cols-3 md:grid-cols-4`. */
function soCot(rongMan: number): number {
  if (rongMan >= 768) return 4;
  if (rongMan >= 640) return 3;
  return 2;
}

interface TheAnhProps {
  photo: PhotoPublic;
  thuTu: number;
  daChon: boolean;
  dangGui: boolean;
  khoa: boolean;
  /**
   * Tấm này đang được dùng làm bao nhiêu sản phẩm (in, khung, album, mua thêm).
   *
   * Là một CON SỐ chứ không phải mảng hay Map: `TheAnh` được `memo`, và một
   * tham chiếu đổi mỗi lần dựng lại là memo thành vô dụng (xem ghi chú ngay
   * dưới đây về 1.235 thẻ).
   */
  soSanPham: number;
  onToggle: (photo: PhotoPublic) => void;
  onOpen: (thuTu: number) => void;
}

/**
 * Một thẻ ảnh. `memo` KHÔNG phải để cho đẹp.
 *
 * Thả tim gọi `setPhotos(prev => prev.map(...))`, tức là dựng lại cả mảng
 * 1.235 phần tử. Khi thẻ ảnh còn viết thẳng trong thân `GalleryApp`, React
 * dựng lại toàn bộ 1.235 thẻ cho MỘT cú chạm: 44ms từ lúc bấm tới lúc tim đổi
 * màu ở tấm thứ 900, lúc chậm nhất 62ms. Chưa tới mức ba mẹ bấm lại lần nữa,
 * nhưng cái giá đó tăng THEO SỐ ẢNH — bộ ảnh to gấp đôi thì chậm gấp đôi, mà
 * 1.235 tấm mới là bộ lớn nhất HÔM NAY.
 *
 * Tách ra + `memo` + prop toàn giá trị đơn (không truyền cả Set `mutatingIds`
 * xuống, vì Set đổi tham chiếu mỗi lần là memo thành vô dụng) nên chỉ đúng một
 * thẻ dựng lại: còn 4,8ms, và không còn phụ thuộc bộ ảnh to bao nhiêu.
 */
const TheAnh = memo(function TheAnh({
  photo,
  thuTu,
  daChon,
  dangGui,
  khoa,
  soSanPham,
  onToggle,
  onOpen,
}: TheAnhProps) {
  return (
    <div
      onClick={() => onOpen(thuTu)}
      className={cn(
        "group relative aspect-square rounded-xl overflow-hidden border bg-surface/80 transition-all cursor-pointer",
        daChon
          ? "ring-2 ring-rose-500 border-rose-500/50 shadow-xs"
          : "hover:border-foreground/20",
      )}
    >
      {/* Ảnh tải qua proxy an toàn.

          BB-162 — chủ studio chốt 15.09.2026: ảnh xem nhỏ cũng phải NÉT.

          Bản cũ (BB-131) chọn 200/400/800 để tiết kiệm đường truyền: trên điện
          thoại 375px màn hình nét gấp đôi, trình duyệt lấy bản 400 nặng 31,4 KB.
          Nhẹ thật, nhưng thẻ ảnh chỉ 165px mà ảnh 400px thì nhìn vẫn mềm — và
          ba mẹ đang chọn ảnh cho con, không phải lướt tin.

          Giờ còn 800 và 1600: máy thường lấy 800 (92,8 KB), máy nét gấp đôi trở
          lên lấy 1600 (146 KB). Cuộn ảo của BB-131 chỉ giữ khoảng 24 tấm trong
          trang, nên mỗi màn hình tốn cỡ 2–3,5 MB thay vì 0,8 MB.

          Đánh đổi đã biết và chấp nhận: tốn đường truyền hơn, đổi lấy ảnh nét.
          Bộ nhớ đệm của BB-137 gánh phần hạn mức Google, nên chi phí nằm ở
          đường truyền của khách chứ không ở phía Google.

          KHÔNG đổi đường API: vẫn `/api/img/<id>?w=<cỡ>`, và cả hai cỡ đều nằm
          trong `THUMBNAIL_WIDTHS` mà route ảnh đã nhận. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/img/${photo.id}?w=800`}
        srcSet={`/api/img/${photo.id}?w=800 800w, /api/img/${photo.id}?w=1600 1600w`}
        sizes="(min-width: 768px) 210px, (min-width: 640px) 195px, 45vw"
        alt={photo.fileName || `Ảnh ${thuTu + 1}`}
        loading="lazy"
        decoding="async"
        // Kích thước thật lấy từ cơ sở dữ liệu (cột width/height, bộ 1.235 tấm
        // không thiếu tấm nào). Trình duyệt biết khung ảnh trước khi byte đầu
        // tiên về nên không phải vẽ lại khi ảnh tới.
        width={photo.width ?? undefined}
        height={photo.height ?? undefined}
        className="w-full h-full object-cover select-none pointer-events-none"
      />

      {/* Lớp gradient nhẹ bảo đảm nút tim luôn nổi bật */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30 pointer-events-none" />

      {/* NÚT THẢ TIM = CHỌN ẢNH (Kích thước chạm lớn ≥44px cho mobile 375px) */}
      <button
        type="button"
        disabled={khoa || dangGui}
        onClick={(e) => {
          e.stopPropagation();
          onToggle(photo);
        }}
        aria-label={daChon ? vi.gallery.deselect : vi.gallery.select}
        className={cn(
          "absolute top-1.5 right-1.5 z-10 flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90 touch-manipulation focus:outline-hidden",
          daChon
            ? "bg-rose-500 text-white shadow-md"
            : "bg-black/40 text-white/90 backdrop-blur-xs hover:bg-black/60 hover:text-white",
        )}
      >
        <Heart
          className={cn(
            "h-6 w-6 transition-all",
            daChon ? "fill-current text-white scale-110" : "stroke-[2.2]",
          )}
        />
      </button>

      {/*
        DẤU "TẤM NÀY ĐÃ ĐẶT IN".

        Chủ studio 22/09/2026: "các ảnh chọn ảnh in phân biệt hiển thị với các
        ảnh khác thế nào". Trước đây không phân biệt được gì: tim đỏ nghĩa là
        "đã chọn", còn tấm nào đã xếp vào khung 40x60 thì phải mở từng tấm ra
        mới biết. Trong bộ 460 tấm thì đó là không biết.

        Đặt bên TRÁI, màu ngọc, để không đấu với tim đỏ bên phải — hai thứ
        khác nhau: tim là "con muốn tấm này", dấu này là "tấm này in ra cái gì".
      */}
      {soSanPham > 0 && (
        <span
          className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded-full bg-emerald-500 px-2 py-1 text-[11px] font-bold text-white shadow-md pointer-events-none"
          title={`Tấm này đang làm ${soSanPham} sản phẩm`}
        >
          <Printer className="h-3.5 w-3.5" />
          {soSanPham}
        </span>
      )}

      {/* Thông tin tên file và thư mục con */}
      <div className="absolute bottom-1.5 left-2 right-2 text-white text-[11px] truncate drop-shadow-xs pointer-events-none">
        <span className="font-mono">{photo.fileName}</span>
        {photo.subfolder && <span className="ml-1 opacity-75">({photo.subfolder})</span>}
      </div>
    </div>
  );
});

interface LuoiAnhProps {
  photos: PhotoPublic[];
  mutatingIds: Set<string>;
  khoa: boolean;
  /** photoId -> tấm đó đang làm mấy sản phẩm. Thiếu khoá nghĩa là 0. */
  soSanPhamTheoAnh: Map<string, number>;
  onToggle: (photo: PhotoPublic) => void;
  onOpen: (thuTu: number) => void;
}

/**
 * Lưới ảnh chỉ dựng những hàng đang trong tầm nhìn.
 *
 * Vì sao phải cuộn ảo chứ không chỉ đổi cỡ ảnh: 1.235 thẻ nằm hết trong DOM là
 * 11.262 nút và một trang cao 109.779 pixel. Mỗi lần React đụng vào danh sách
 * — thả tim, đổi bộ lọc, trang ảnh mới về — trình duyệt phải tính lại bố cục
 * cho từng ấy nút. Đo được tác vụ chặn luồng chính dài nhất 360ms lúc dựng
 * trang; trong 360ms đó điện thoại không nhận chạm, không cuộn, không gì cả.
 * Còn 244 nút thì xuống 179ms, và bộ nhớ JS từ 9,2 MB xuống 5,4 MB.
 *
 * Quan trọng hơn con số hôm nay: chi phí cũ tăng theo số ảnh, chi phí mới thì
 * không. 1.235 là bộ lớn nhất hiện có, không phải trần.
 *
 * Giữ nguyên cách chia cột và khoảng cách của bản cũ (2 / 3 / 4 cột theo bề
 * ngang màn hình) để giao diện không đổi — chỉ đổi chỗ ai dựng thẻ nào.
 */
function LuoiAnh({
  photos,
  mutatingIds,
  khoa,
  soSanPhamTheoAnh,
  onToggle,
  onOpen,
}: LuoiAnhProps) {
  const khungRef = useRef<HTMLDivElement | null>(null);

  // Đoán bề ngang NGAY từ lượt dựng đầu, đừng bắt đầu từ 0.
  //
  // Đo được cái giá của việc bắt đầu từ 0: lượt dựng đầu rơi vào nhánh dự
  // phòng, React dựng đủ 1.235 thẻ rồi `useLayoutEffect` đo xong mới thay bằng
  // lưới cuộn ảo. Trình duyệt không kịp vẽ ra, nhưng công thì đã làm — tác vụ
  // chặn dài nhất 706ms (thay vì 237ms) và đống rác để lại nâng bộ nhớ JS từ
  // 5,5 MB lên 11,5 MB. Công vứt đi, mà vứt đúng lúc trang đang tải.
  //
  // `window.innerWidth` có sẵn ở lượt dựng đầu phía trình duyệt. Khung lưới
  // nằm trong `max-w-4xl` (896px) với `px-4` (16px mỗi bên) — xem thẻ bọc ở
  // `GalleryApp`. Con số đoán chỉ cần đủ đúng để chọn nhánh cuộn ảo; phép đo
  // thật trong `useLayoutEffect` sửa lại trước khi vẽ.
  const doMan = () => (typeof window === "undefined" ? 0 : window.innerWidth);
  const [rongMan, setRongMan] = useState(doMan);
  const [rongKhung, setRongKhung] = useState(() => {
    const w = doMan();
    return w === 0 ? 0 : Math.min(896, w) - 32;
  });
  // Khoảng cách từ đầu trang tới lưới. Cửa sổ là thứ cuộn, nên bộ cuộn ảo phải
  // biết lưới bắt đầu ở đâu mới tính đúng hàng nào đang trong tầm nhìn.
  const [lechDau, setLechDau] = useState(0);

  // `useLayoutEffect` chứ không phải `useEffect`: đo xong TRƯỚC khi trình duyệt
  // vẽ. Dùng `useEffect` thì nhánh dự phòng ở dưới kịp vẽ ra một khung hình đầy
  // đủ 1.235 thẻ — đúng cái giá mà cuộn ảo sinh ra để tránh.
  //
  // Không sợ cảnh báo khi dựng ở máy chủ: lúc đó `loading` còn bật nên
  // `GalleryApp` trả về vòng quay, `LuoiAnh` chưa hề được dựng.
  useLayoutEffect(() => {
    const el = khungRef.current;
    if (!el) return;
    const doLai = () => {
      setRongKhung(el.clientWidth);
      setRongMan(window.innerWidth);
      setLechDau(el.getBoundingClientRect().top + window.scrollY);
    };
    doLai();
    const ro = new ResizeObserver(doLai);
    ro.observe(el);
    window.addEventListener("resize", doLai);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", doLai);
    };
  }, []);

  // Lưới nằm dưới các khối hạn mức, hợp đồng… nên vị trí của nó xê dịch khi
  // những khối đó hiện/ẩn. Đo lại mỗi khi số ảnh đổi.
  useEffect(() => {
    const el = khungRef.current;
    if (el) setLechDau(el.getBoundingClientRect().top + window.scrollY);
  }, [photos.length]);

  const cot = soCot(rongMan);
  const khe = rongMan >= 640 ? KHE_RONG : KHE_HEP;
  const rongThe = rongKhung > 0 ? (rongKhung - khe * (cot - 1)) / cot : 0;
  // Thẻ vuông (`aspect-square`), nên cao một hàng = bề ngang thẻ + khoảng cách.
  const caoHang = rongThe > 0 ? rongThe + khe : 200;
  const soHang = Math.ceil(photos.length / cot);

  const ao = useWindowVirtualizer({
    count: soHang,
    estimateSize: () => caoHang,
    overscan: 3, // dựng sẵn 3 hàng trên và dưới để cuộn nhanh không thấy ô trống
    scrollMargin: lechDau,
    getItemKey: (i) => photos[i * cot]?.id ?? i,
  });

  const hang = ao.getVirtualItems();

  return (
    <div ref={khungRef}>
      {/* Chưa đo được bề ngang (máy không có ResizeObserver, hoặc phép đo hỏng)
          thì đổ ra lưới thường ĐỦ CẢ BỘ.

          Chậm còn hơn thiếu: cắt bớt ở đây là dựng lại đúng lỗi BB-128 vừa sửa
          — khách trả tiền một buổi chụp rồi chỉ thấy một phần ảnh, mà không có
          dấu hiệu nào cho biết còn ảnh phía sau. Nhánh này trên thực tế không
          chạy (phép đo nằm trong `useLayoutEffect`, xong trước khi vẽ), nên cái
          giá của nó là giả định chứ cái mất kia thì có thật. */}
      {rongThe <= 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4">
          {photos.map((photo, idx) => (
            <TheAnh
              key={photo.id}
              photo={photo}
              thuTu={idx}
              daChon={photo.mark === "selected"}
              dangGui={mutatingIds.has(photo.id)}
              khoa={khoa}
              soSanPham={soSanPhamTheoAnh.get(photo.id) ?? 0}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          ))}
        </div>
      ) : (
        <div className="relative w-full" style={{ height: ao.getTotalSize() }}>
          {hang.map((h) => {
            const dau = h.index * cot;
            const trongHang = photos.slice(dau, dau + cot);
            return (
              <div
                key={h.key}
                className="absolute left-0 w-full grid"
                style={{
                  top: 0,
                  transform: `translateY(${h.start - ao.options.scrollMargin}px)`,
                  height: caoHang,
                  gridTemplateColumns: `repeat(${cot}, minmax(0, 1fr))`,
                  gap: khe,
                  paddingBottom: khe,
                }}
              >
                {trongHang.map((photo, i) => (
                  <TheAnh
                    key={photo.id}
                    photo={photo}
                    thuTu={dau + i}
                    daChon={photo.mark === "selected"}
                    dangGui={mutatingIds.has(photo.id)}
                    khoa={khoa}
                    soSanPham={soSanPhamTheoAnh.get(photo.id) ?? 0}
                    onToggle={onToggle}
                    onOpen={onOpen}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GalleryApp({ token }: GalleryAppProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  /**
   * Phiên đang là link gắn theo KHÁCH và chưa chọn buổi chụp nào (BB-130).
   *
   * Không phải một màn hình khác: cùng một link, chỉ là ba mẹ phải nói muốn
   * xem buổi nào trước. Chọn xong thì cờ này tắt và mọi thứ phía dưới chạy y
   * như link kiểu cũ.
   */
  const [phaiChonBuoiChup, setPhaiChonBuoiChup] = useState(false);

  const [gallery, setGallery] = useState<GalleryApiResponse | null>(null);


  const [tienDoTai, setTienDoTai] = useState<TienDoTai | null>(null);
  const dungTaiRef = React.useRef(false);
  const [photos, setPhotos] = useState<PhotoPublic[]>([]);

  // BB-156 — tải ảnh về máy khách.
  //
  // Bộ nào tắt cho tải thì KHÔNG hiện nút — quyết định số 4 ở docs/13 để studio
  // bật tắt theo từng bộ, không phải bật đại cho tất cả.
  const choPhepTai = gallery?.options?.download === true;
  const soAnhDaChon = photos.filter((p) => p.mark === "selected" || p.isFavorite).length;

  const chayTai = useCallback(
    async (danhSach: { id: string; fileName: string }[]) => {
      if (danhSach.length === 0) return;
      dungTaiRef.current = false;
      setTienDoTai({ daXong: 0, tong: danhSach.length, dangTai: null, loi: null, hetChoTrongMay: false });
      await taiTheoLo(danhSach, setTienDoTai, () => dungTaiRef.current);
    },
    [],
  );

  const taiMotAnh = useCallback(
    (anh: { id: string; fileName: string }) => void chayTai([{ id: anh.id, fileName: anh.fileName }]),
    [chayTai],
  );

  /** BB-161: chỉ tải những tấm ba mẹ đã thả tim. */
  const taiAnhDaChon = useCallback(() => {
    const daChon = photos.filter((p) => p.mark === "selected" || p.isFavorite);
    void chayTai(daChon.map((p) => ({ id: p.id, fileName: p.fileName })));
  }, [chayTai, photos]);

  const taiCaBo = useCallback(() => {
    // Ảnh đã tải đủ vào bộ nhớ từ lúc mở màn (vòng lặp nạp hết ở trên), nên
    // không phải gọi lại máy chủ chỉ để biết danh sách.
    void chayTai(photos.map((p) => ({ id: p.id, fileName: p.fileName })));
  }, [chayTai, photos]);
  const [filter, setFilter] = useState<"all" | "selected" | "unselected">("all");
  const [selectedSubfolder, setSelectedSubfolder] = useState<string>("");

  const [selectionCounts, setSelectionCounts] = useState({
    selectedCount: 0,
    extraCount: 0,
    extraAmount: 0,
  });

  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [customerNote, setCustomerNote] = useState("");
  /**
   * Tên người xác nhận và ô đồng ý — BẮT BUỘC, và trước 22/09/2026 màn hình
   * KHÔNG có hai ô này.
   *
   * `/api/g/submit` đòi `confirmedByName` (không rỗng) và `agreed: true` ngay
   * từ đầu. Màn khách thì gửi `{ confirmNotes, customerNote }` — sai cả ba
   * trường. Nên mỗi lần ba mẹ bấm Xác nhận là một cái 400 "Dữ liệu không hợp
   * lệ", và KHÔNG AI CHỐT ĐƯỢC BỘ ẢNH.
   *
   * Không phép thử nào đỏ: phép thử đơn vị gọi thẳng API với payload đúng, còn
   * đường e2e thì chưa bao giờ đi tới bước chốt. Lỗi lộ ra đúng lúc E-1 được
   * viết (BB-053).
   */
  const [tenXacNhan, setTenXacNhan] = useState("");
  /** Hộp "xin sửa lại" — chỉ dùng khi bộ ảnh đã khoá. */
  const [xinSuaLai, setXinSuaLai] = useState(false);
  const [lyDoSuaLai, setLyDoSuaLai] = useState("");
  const [dangXin, setDangXin] = useState(false);
  const [dongY, setDongY] = useState(false);
  const [placements, setPlacements] = useState<{ photoId: string; galleryItemId: string }[]>([]);
  const [placing, setPlacing] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  /**
   * Ba mẹ đã bấm Chốt, CSKH chưa xác nhận → màn hình KHOÁ MỀM.
   *
   * Chủ studio 22/09/2026: "khi khách nhấn chốt danh sách xong mà muốn chọn
   * thêm khi CSKH chưa chốt danh sách thì vẫn cần có nút mở khoá chọn".
   *
   * Máy chủ đã mở từ migration 0060 — về kỹ thuật ba mẹ sửa được ngay. Nhưng
   * nếu màn hình cũng mở toang thì cái nút Chốt vừa bấm chẳng có nghĩa gì: thả
   * tim nhầm một cái là danh sách đã chốt đổi mà không ai biết.
   *
   * Nên: khoá MỀM. Danh sách đứng yên như vừa chốt, kèm một nút mở ra — bấm
   * một cái là chọn tiếp, không phải gọi ai.
   */
  const [moKhoaChon, setMoKhoaChon] = useState(false);
  /** Cửa hàng mua thêm — mở từ nút riêng, không nằm cuối trang. */
  const [moCuaHang, setMoCuaHang] = useState(false);

  const daChotChoXacNhan = gallery?.status === "submitted" && !moKhoaChon;

  const isLocked = useMemo(() => {
    if (!gallery) return false;
    return isGalleryLocked(gallery.status) || daChotChoXacNhan;
  }, [gallery, daChotChoXacNhan]);


  const loadGallery = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setPhaiChonBuoiChup(false);

      // BB-187: gửi KÈM mã trên thanh địa chỉ. Máy chủ băm nó rồi so với link
      // của phiên đang cầm; lệch thì trả 409 SESSION_MISMATCH. Không gửi thì
      // máy chủ không có cách nào biết ba mẹ vừa bấm vào link nào.
      const duongGallery = `/api/g/gallery?token=${encodeURIComponent(token)}`;

      let res = await fetch(duongGallery, { cache: "no-store" });

      // BB-157: phiên CŨ trong máy không được chặn link MỚI trên thanh địa chỉ.
      //
      // Trước đây chỉ 401 mới đi đăng nhập lại bằng mã trên URL. Nhưng khi
      // studio cấp lại link, phiên cũ trong trình duyệt trỏ vào link ĐÃ THU HỒI
      // và /api/g/gallery trả 410 LINK_EXPIRED — không phải 401. Ba mẹ mở link
      // mới toanh vẫn thấy "Link đã hết hạn", và bấm lại bao nhiêu lần cũng vậy
      // cho tới khi ai đó biết đường xoá cookie. Chủ studio gặp đúng cảnh này
      // ngày 15.09.2026 với một link vừa tạo xong một phút trước.
      //
      // 410 và 403 nghĩa là phiên đang cầm đã hỏng. Mã trên URL mới là thứ ba mẹ
      // vừa bấm vào, nên nó phải được ưu tiên.
      // BB-187 thêm 409: phiên CÒN SỐNG nhưng thuộc về MỘT BỘ KHÁC.
      //
      // BB-157 trên đây chỉ vá ca phiên HỎNG. Ca còn lại nặng hơn hẳn: hai nhà
      // dùng chung một máy, hoặc một nhà chụp hai bộ — phiên cũ còn hạn nên máy
      // chủ trả 200, và màn khách hiện ảnh của bộ KIA. Chủ studio gặp ngày
      // 18.09.2026: mở link bộ 210 ảnh (Pasteur) mà màn hiện bộ 261 ảnh (Thảo
      // Điền). Đo lại trong cơ sở dữ liệu: mã link đúng, lỗi nằm ở chỗ này.
      //
      // Nguyên tắc chốt lại, áp cho cả ba mã: **mã trên thanh địa chỉ là nguồn
      // đúng, phiên chỉ là thứ tiện lợi.** Lệch thì phiên thua, luôn luôn.
      const phienCuHong =
        res.status === 410 || res.status === 403 || res.status === 409;
      if (phienCuHong) {
        // Đăng nhập lại bằng mã trên URL sẽ thay cookie cũ bằng phiên mới.
        res = new Response(null, { status: 401 });
      }

      if (res.status === 401) {
        // Thử đăng nhập phiên khách với token nếu link không yêu cầu PIN
        const authRes = await fetch("/api/auth/gallery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const authData = await authRes.json().catch(() => null);



        if (authRes.ok) {
          // Link gắn theo KHÁCH: phiên vừa ký chưa trỏ vào bộ ảnh nào, vì một
          // khách có nhiều buổi chụp (BB-130). Hỏi ba mẹ trước đã.
          if (!authData?.data?.galleryId && authData?.data?.customerId) {
            setPhaiChonBuoiChup(true);
            setLoading(false);
            return;
          }
          // Thử gọi lại gallery sau khi đã có cookie phiên
          res = await fetch(duongGallery, { cache: "no-store" });
        } else {
          const errCode = authData?.error?.code || "NOT_FOUND";
          setError({
            code: errCode,
            message: authData?.error?.message || vi.gallery.notFoundTitle,
          });
          setLoading(false);
          return;
        }
      }

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const code = json?.error?.code || "INTERNAL";

        // Ba mẹ quay lại bằng cookie còn hạn của link theo khách, nhưng phiên
        // chưa trỏ vào buổi nào — mời chọn lại thay vì hiện màn lỗi (BB-130).
        if (json?.error?.details?.canChonBuoiChup) {
          setPhaiChonBuoiChup(true);
          setLoading(false);
          return;
        }
        setError({
          code,
          message: json?.error?.message || vi.gallery.notFoundTitle,
        });
        setLoading(false);
        return;
      }

      const gData = json.data as GalleryApiResponse;
      setGallery(gData);
      setPlacements(gData.placements ?? []);
      setSelectionCounts({
        selectedCount: gData.selection?.selectedCount ?? 0,
        extraCount: gData.selection?.extraCount ?? 0,
        extraAmount: gData.selection?.extraAmount ?? 0,
      });

      // Tải danh sách ảnh — TẤT CẢ, không chỉ trang đầu.
      //
      // Bản cũ gọi đúng một lần với limit=200 rồi dừng. Lúc viết, bộ ảnh mẫu
      // nhiều nhất 35 tấm nên không ai chạm tới con số đó. Ngày 14.09.2026 kéo
      // ảnh thật từ Drive về: trung bình 425 tấm một bộ, cao nhất 1.235, và
      // 333/359 bộ vượt 200 — tức là 82.274 tấm khách sẽ KHÔNG BAO GIỜ nhìn
      // thấy, mà cũng không có dấu hiệu gì cho biết còn ảnh ở phía sau.
      //
      // Khách trả tiền một buổi chụp rồi chỉ được chọn trong nửa số ảnh.
      setPhotosLoading(true);
      const tatCaAnh: PhotoPublic[] = [];
      let cursor: string | undefined;
      // Chặn trên để một lỗi con trỏ không thành vòng lặp vô tận: 1.235 tấm là
      // bộ lớn nhất hiện có, 60 trang × 200 là dư gấp nhiều lần.
      for (let trang = 0; trang < 60; trang++) {
        const q = new URLSearchParams({ limit: "200" });
        if (cursor) q.set("cursor", cursor);
        const photosRes = await fetch(`/api/g/photos?${q}`, { cache: "no-store" });
        const photosJson = await photosRes.json().catch(() => null);
        if (!photosRes.ok || !Array.isArray(photosJson?.data)) break;

        tatCaAnh.push(...photosJson.data);
        // Hiện dần từng trang thay vì chờ trắng màn hình tới tấm cuối: bộ 1.235
        // tấm mất vài giây, và vài giây nhìn vào trang trống là đủ để ba mẹ
        // tưởng link hỏng.
        setPhotos([...tatCaAnh]);

        if (!photosJson.meta?.hasMore || !photosJson.meta?.cursor) break;
        cursor = photosJson.meta.cursor;
      }
    } catch {
      setError({
        code: "NETWORK_ERROR",
        message: "Không thể kết nối đến máy chủ. Vui lòng thử lại sau.",
      });
    } finally {
      setLoading(false);
      setPhotosLoading(false);
    }
  }, [token, router]);

  /**
   * Khách duyệt hoặc yêu cầu sửa. Tải lại cả bộ ảnh sau đó — quyết định này
   * đổi trạng thái, mà trạng thái chi phối gần như mọi thứ trên màn hình.
   */
  const decideReview = useCallback(
    async (decision: "approve" | "revise", note?: string) => {
      const res = await fetch("/api/g/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMessage(json?.error?.message ?? "Không gửi được, ba mẹ thử lại giúp");
        return;
      }
      setStatusMessage(
        decision === "approve"
          ? "Cảm ơn ba mẹ. Studio chuyển bộ ảnh sang in."
          : "Đã gửi yêu cầu sửa cho studio.",
      );
      await loadGallery();
    },
    [loadGallery],
  );

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  /**
   * Thao tác THẢ TIM = CHỌN ẢNH.
   * CẢNH BÁO BẢO VỆ:
   * - Trái tim trên màn hình GỬI: { mark: "selected" } khi chọn, { mark: null } khi bỏ chọn.
   * - TUYỆT ĐỐI KHÔNG gửi isFavorite!
   * - quotaKnown = false -> Chặn chọn ảnh, báo studio sẽ báo lại.
   * - Không tự tính tiền ở client; lấy extraCount và extraAmount trả về từ API.
   */
  const handleToggleHeart = useCallback(
    async (photo: PhotoPublic) => {
      if (isLocked) {
        setStatusMessage("Bộ ảnh đã được chốt, không thể thay đổi danh sách chọn.");
        return;
      }

      if (!gallery?.quotaKnown) {
        setStatusMessage("Studio sẽ báo lại số ảnh trong gói, vui lòng liên hệ CSKH.");
        return;
      }

      const isCurrentlySelected = photo.mark === "selected";
      const nextMark = isCurrentlySelected ? null : "selected";

      // 1. Cập nhật giao diện tức thì (Optimistic)
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, mark: nextMark } : p))
      );

      setMutatingIds((prev) => new Set(prev).add(photo.id));

      try {
        const res = await fetch("/api/g/selection", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildHeartPayload(photo.id, isCurrentlySelected, crypto.randomUUID()),
          ),
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          // Rollback giao diện khi API lỗi
          setPhotos((prev) =>
            prev.map((p) => (p.id === photo.id ? { ...p, mark: photo.mark } : p))
          );

          const code = json?.error?.code;
          const msg = json?.error?.message;

          if (code === "QUOTA_UNKNOWN") {
            setStatusMessage("Studio sẽ báo lại số ảnh trong gói, vui lòng liên hệ CSKH.");
          } else if (code === "QUOTA_EXCEEDED") {
            setStatusMessage(
              gallery?.maxSelection
                ? vi.gallery.quotaHardLimit.replace("{max}", String(gallery.maxSelection))
                : "Đã vượt quá số lượng ảnh cho phép của gói chụp."
            );
          } else if (code === "GALLERY_LOCKED") {
            setStatusMessage("Bộ ảnh đã được chốt, không thể chọn thêm.");
          } else {
            setStatusMessage(msg || "Không thể lưu lựa chọn, vui lòng thử lại.");
          }
          return;
        }

        // 2. Lấy con số tính toán chuẩn xác trực tiếp từ backend API
        if (json?.data) {
          setSelectionCounts({
            selectedCount: json.data.selectedCount,
            extraCount: json.data.extraCount,
            extraAmount: json.data.extraAmount,
          });
        }
      } catch {
        // Rollback khi mất mạng
        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, mark: photo.mark } : p))
        );
        setStatusMessage("Mất kết nối mạng. Lựa chọn chưa được lưu.");
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(photo.id);
          return next;
        });
      }
    },
    [isLocked, gallery?.quotaKnown, gallery?.maxSelection],
  );

  /**
   * BB-180 — lưu ghi chú cho một ảnh, gọi từ màn xem lớn.
   *
   * Dùng lại đúng đường của BB-144 (`PATCH /api/g/selection`, trường
   * `retouchNote`) — không dựng đường lưu thứ hai.
   */
  const luuGhiChuAnh = useCallback(
    async (photo: PhotoPublic, ghiChu: string): Promise<boolean> => {
      if (isLocked) return false;
      try {
        const res = await fetch("/api/g/selection", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ops: [{ photoId: photo.id, retouchNote: ghiChu.trim() || null }],
          }),
        });
        if (!res.ok) return false;
        setPhotos((truoc) =>
          truoc.map((x) =>
            x.id === photo.id ? { ...x, retouchNote: ghiChu.trim() || null } : x,
          ),
        );
        return true;
      } catch {
        return false;
      }
    },
    [isLocked],
  );


  const handleSubmitSelection = async () => {
    if (isLocked) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/g/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmedByName: tenXacNhan.trim(),
          agreed: true,
          // Tên trường bên máy chủ là `generalNote`; gửi `customerNote` thì lời
          // dặn của ba mẹ rơi vào hư không kể cả khi mọi thứ khác đúng.
          generalNote: customerNote.trim() || undefined,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setStatusMessage(json?.error?.message || "Không thể chốt danh sách lúc này.");
        return;
      }

      setShowSubmitModal(false);
      // Chốt lại là đóng khoá mềm: danh sách vừa chốt phải đứng yên cho tới
      // khi ba mẹ chủ động mở ra lần nữa.
      setMoKhoaChon(false);
      setStatusMessage("Đã chốt danh sách chọn ảnh thành công! Studio đã nhận được thông tin.");
      // Tải lại để cập nhật trạng thái đã chốt
      await loadGallery();
    } catch {
      setStatusMessage("Không thể gửi yêu cầu chốt bộ ảnh. Vui lòng kiểm tra lại mạng.");
    } finally {
      setSubmitting(false);
    }
  };

  // Lọc danh sách ảnh
  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      if (selectedSubfolder && p.subfolder !== selectedSubfolder) {
        return false;
      }
      if (filter === "selected") return p.mark === "selected";
      if (filter === "unselected") return p.mark !== "selected";
      return true;
    });
  }, [photos, filter, selectedSubfolder]);

  // Chuyển đổi thành phần hợp đồng cho component ContractBreakdown
  /**
   * Sản phẩm in mà hợp đồng THẬT SỰ có.
   *
   * Lấy từ cả hai tầng: dòng hợp đồng (khách mua lẻ một tấm ảnh phóng) và
   * thành phần của gói (ảnh phóng nằm sẵn trong gói chụp). Cả hai đều là dòng
   * trong gallery_items nên đều có id để đặt ảnh vào.
   *
   * Hợp đồng không mua hàng in thì mảng này rỗng, và component tự ẩn. Đây là
   * luật "chỉ hiện ô chọn cho sản phẩm hợp đồng thật sự có" ở docs/16 mục 3.3 —
   * và nó được thực thi ở ĐÂY chứ không phải bằng cách giấu nút, vì API cũng
   * từ chối dòng hàng không thuộc bộ ảnh.
   */
  const hangInTrongGoi = useMemo(
    // Luật "dòng này ăn một tấm hay cả chục tấm" nằm ở `lib/products/
    // hang-in-trong-goi`, không chép lại ở đây: đã có sáu bản chép tay của
    // danh sách trạng thái khoá trong mã này rồi, không thêm bản thứ bảy của
    // một luật khác.
    () => locHangInTrongGoi(gallery?.contract?.items ?? []),
    [gallery],
  );

  /** Số ảnh đã xếp vào một dòng hàng trong gói. */
  const demAnhTrongDongHang = useCallback(
    (galleryItemId: string) =>
      placements.filter((pl) => pl.galleryItemId === galleryItemId).length,
    [placements],
  );

  /**
   * SUẤT in — ảnh phóng và khung: mỗi suất đúng MỘT tấm.
   *
   * "Gỗ 40x60 ×2" nghĩa là hai tấm ảnh, in ra hai bản. Hết hai suất là hết.
   */
  const suatInTrongGoi = useMemo(
    () => hangInTrongGoi.filter((sp) => sp.nhom !== "album"),
    [hangInTrongGoi],
  );

  /**
   * ALBUM trong gói — chủ studio 22/09/2026: **"album không phải là một ảnh"**.
   *
   * Một cuốn album trong hợp đồng là MỘT CUỐN, và cuốn đó nhận bao nhiêu tấm là
   * tuỳ ba mẹ. Bản cũ gộp album vào cùng danh sách suất in nên "Album (Ultra HD)
   * 15x21 ×1" hiện thành "0/1 ảnh · còn thiếu": đưa một tấm vào là app báo đầy
   * cuốn, đưa tấm thứ hai thì hết đường. Đó là lý do phải tách hẳn ra đây.
   *
   * Số tờ ruột (bao nhiêu tấm thì đủ một cuốn) là việc của studio lúc dựng
   * cuốn, không phải việc của màn chọn ảnh — nên ở đây không chặn theo số.
   */
  const albumTrongGoi = useMemo(
    () => hangInTrongGoi.filter((sp) => sp.nhom === "album"),
    [hangInTrongGoi],
  );

  /**
   * BB-180 — đếm số ảnh của từng nhóm (thư mục con trong Drive).
   *
   * Đo trên bb-dev ngày 17/09: 148.881/152.637 ảnh đã mang tên thư mục, 184
   * concept khác nhau. Dữ liệu có sẵn từ lâu, chỉ thiếu chỗ cho khách thấy.
   *
   * Đây cũng là nền cho việc sau: ảnh đã chỉnh, ảnh sửa lại, layout ghép album
   * cho khách duyệt — mỗi loại là một thư mục. Nên **không ghi cứng tên concept
   * nào vào mã**; nhóm theo cái gì có trong dữ liệu.
   */
  const demTheoNhom = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of photos) {
      if (!p.subfolder) continue;
      m.set(p.subfolder, (m.get(p.subfolder) ?? 0) + 1);
    }
    return m;
  }, [photos]);

  /**
   * BB-180 — sản phẩm in còn thiếu ảnh, để nhắc trước khi chốt.
   *
   * Chủ studio chốt 17/09: **nhắc chứ không chặn**. Khách đang cầm điện
   * thoại, đang bế con — chặn là họ bỏ dở giữa chừng. Chỉ nói rõ cái được
   * nếu chọn luôn, rồi để họ tự quyết.
   */
  const sanPhamThieuAnh = useMemo(
    () =>
      hangInTrongGoi.filter((sp) => conThieuAnh(sp, demAnhTrongDongHang(sp.galleryItemId))),
    [hangInTrongGoi, demAnhTrongDongHang],
  );

  /**
   * "Tấm này đang làm mấy sản phẩm" — cho dấu ngọc trên lưới ảnh.
   *
   * Gộp cả ba đường một tấm ảnh có thể biến thành hàng:
   *   · `placements`       — suất in/khung/album TRONG GÓI
   *   · `albumPlacements`  — ảnh đưa vào album MUA THÊM
   *   · `addons.items`     — ảnh in/khung mua thêm, gắn thẳng vào tấm (0061)
   *
   * Đếm theo SỐ LƯỢNG chứ không theo số dòng: mua ba bản cùng một tấm thì tấm
   * đó đang làm ba sản phẩm, dù chỉ là một dòng trong đơn.
   */
  /**
   * Mở đúng một tấm ảnh ra màn xem lớn, dù nó đang bị bộ lọc giấu đi.
   *
   * Màn xem lớn chạy theo DANH SÁCH ĐANG LỌC, nên phải gỡ bộ lọc trước rồi mới
   * tính thứ tự — bỏ bước gỡ thì bấm vào tấm trong bảng tóm tắt lúc đang lọc
   * "Chưa chọn" sẽ mở ra một tấm khác hẳn.
   */
  const moAnhTheoId = useCallback(
    (photoId: string) => {
      const thuTu = photos.findIndex((p) => p.id === photoId);
      if (thuTu < 0) return;
      setFilter("all");
      setSelectedSubfolder("");
      setLightboxIndex(thuTu);
    },
    [photos],
  );

  const soSanPhamTheoAnh = useMemo(() => {
    const m = new Map<string, number>();
    const cong = (photoId: string | null | undefined, n = 1) => {
      if (!photoId || n <= 0) return;
      m.set(photoId, (m.get(photoId) ?? 0) + n);
    };
    for (const pl of placements) cong(pl.photoId);
    for (const ap of gallery?.albumPlacements ?? []) cong(ap.photoId);
    for (const ad of gallery?.addons?.items ?? []) cong(ad.photoId, ad.quantity);
    return m;
  }, [placements, gallery]);

  const changePlacement = useCallback(
    async (photoId: string, galleryItemId: string, add: boolean) => {
      // Cập nhật giao diện trước, trả lại nếu máy chủ từ chối — cùng cách với
      // nút thả tim, để khách không phải chờ một vòng mạng mới thấy phản hồi.
      const before = placements;
      setPlacements((prev) =>
        add
          ? [...prev, { photoId, galleryItemId }]
          : prev.filter((x) => !(x.photoId === photoId && x.galleryItemId === galleryItemId)),
      );
      setPlacing(true);
      try {
        const res = await fetch("/api/g/placements", {
          method: add ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId, galleryItemId }),
        });
        if (!res.ok) {
          setPlacements(before);
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? "Không lưu được, ba mẹ thử lại giúp.");
        }
      } catch {
        setPlacements(before);
        setStatusMessage("Mất kết nối, ba mẹ thử lại giúp.");
      } finally {
        setPlacing(false);
      }
    },
    [placements],
  );

  /**
   * Đặt số lượng một sản phẩm mua thêm.
   *
   * Gửi SỐ LƯỢNG MONG MUỐN (0 là bỏ mua), rồi tải lại bộ ảnh để con số tiền
   * trên màn hình đúng bằng con số máy chủ vừa tính — tiền là chỗ không được
   * phép đoán ở máy khách.
   */
  const datSoLuongMuaThem = useCallback(
    async (productId: string, soLuong: number, photoId?: string | null) => {
      setPlacing(true);
      try {
        const res = await fetch("/api/g/addons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, quantity: soLuong, photoId: photoId ?? null }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? "Không lưu được, ba mẹ thử lại giúp.");
          return;
        }
        await loadGallery();
      } catch {
        setStatusMessage("Mất kết nối, ba mẹ thử lại giúp.");
      } finally {
        setPlacing(false);
      }
    },
    [loadGallery],
  );

  /**
   * Đưa tấm ảnh vào (hoặc lấy ra khỏi) một album ĐÃ MUA.
   *
   * Đi cùng đường với việc đặt ảnh vào dòng hàng trong gói, chỉ khác đích:
   * `addonId` thay cho `galleryItemId` (migration 0062).
   */
  /**
   * Xin CSKH mở lại bộ ảnh đã khoá.
   *
   * Chỉ có nghĩa sau khi CSKH đã xác nhận (migration 0060) — trước đó ba mẹ
   * sửa thẳng được. Máy chủ kiểm lại điều này, nên nút chỉ hiện khi đã khoá là
   * chuyện tử tế với người dùng, không phải chốt an toàn.
   */
  const guiXinSuaLai = useCallback(async () => {
    setDangXin(true);
    try {
      const res = await fetch("/api/g/xin-sua-lai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyDo: lyDoSuaLai.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMessage(json?.error?.message ?? "Chưa gửi được, ba mẹ thử lại giúp.");
        return;
      }
      setXinSuaLai(false);
      setLyDoSuaLai("");
      setStatusMessage(json?.data?.loiNhan ?? "Bên mình đã nhận yêu cầu của ba mẹ.");
    } catch {
      setStatusMessage("Mất kết nối, ba mẹ thử lại giúp.");
    } finally {
      setDangXin(false);
    }
  }, [lyDoSuaLai]);

  const datAnhVaoAlbum = useCallback(
    async (photoId: string, addonId: string, dat: boolean) => {
      setPlacing(true);
      try {
        const res = await fetch("/api/g/placements", {
          method: dat ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId, addonId }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? "Không lưu được, ba mẹ thử lại giúp.");
          return;
        }
        await loadGallery();
      } catch {
        setStatusMessage("Mất kết nối, ba mẹ thử lại giúp.");
      } finally {
        setPlacing(false);
      }
    },
    [loadGallery],
  );

  const contractBreakdownItems = useMemo<ContractItem[]>(() => {
    if (!gallery?.contract?.items) return [];
    return gallery.contract.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.totalPrice,
      children: item.components?.map((comp) => ({
        id: comp.id,
        name: comp.name,
        quantity: comp.quantity,
      })),
    }));
  }, [gallery]);

  if (loading) {
    return (
      <div className="min-h-[80dvh] flex flex-col items-center justify-center p-6 gap-3">
        <Spinner className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">{vi.common.loading}</p>
      </div>
    );
  }

  // Link theo khách: hỏi buổi chụp trước khi hiện lưới ảnh. Đặt TRƯỚC nhánh
  // lỗi bên dưới, vì lúc này `gallery` còn rỗng — rơi xuống đó là ba mẹ nhận
  // "không tìm thấy album" đúng vào lúc album của họ vẫn còn nguyên.
  if (phaiChonBuoiChup) {
    return <DanhSachBuoiChup onDaChonBuoi={() => void loadGallery()} />;
  }

  if (error || !gallery) {
    return (
      <div className="min-h-[80dvh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold mb-2">
          {error?.code === "LINK_EXPIRED" ? vi.gallery.expiredTitle : vi.gallery.notFoundTitle}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {error?.message || vi.gallery.notFoundBody}
        </p>
        <Button onClick={() => window.location.reload()} variant="outline">
          {vi.common.retry}
        </Button>
      </div>
    );
  }

  const stepNumber = getCustomerProgressStep(gallery.status as GalleryStatus);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-32">
      {/* Thông báo banner trạng thái nếu có */}
      {statusMessage && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto p-4 bg-primary text-primary-foreground rounded-xl shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Info className="w-5 h-5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-primary-foreground/80 hover:text-primary-foreground text-sm font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header trang khách */}
      <header className="border-b bg-surface sticky top-0 z-20 backdrop-blur-md bg-background/90">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold truncate">
              {gallery.babyName ? `Ảnh của bé ${gallery.babyName}` : gallery.title}
            </h1>
            {/*
              Hai chỗ sửa, đo trên điện thoại 375px ngày 22/09/2026:

              1. Dòng này `truncate`, và "Nhắn cho studio" nằm cuối nên bị cắt
                 thành "Nhắn cho…". Đó là đường duy nhất ba mẹ liên lạc với
                 studio ngay trên màn đang xem ảnh — không được phép cụt.
                 Nay nó đứng riêng một dòng, không nằm trong phần bị cắt.
              2. Chi nhánh chưa điền hotline thì hiện "Tên • " rồi " • " nữa,
                 tức hai dấu chấm tròn liền nhau quanh một khoảng trống. Ghép
                 bằng mảng đã lọc nên thiếu phần nào thì mất luôn dấu của phần
                 đó.
            */}
            <p className="text-xs text-muted-foreground truncate">
              {[gallery.branch.name, gallery.branch.hotline].filter(Boolean).join(" • ")}
            </p>
            {gallery.branch.chatUrl && (
              <a
                href={gallery.branch.chatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-primary underline underline-offset-2"
              >
                {vi.gallery.messageStudio}
              </a>
            )}
          </div>

          {!isLocked ? (
            <Button
              size="sm"
              onClick={() => setShowSubmitModal(true)}
              className="shrink-0 font-medium"
            >
              {vi.gallery.submitCta}
            </Button>
          ) : daChotChoXacNhan ? (
            /*
              Đã chốt nhưng CSKH chưa xác nhận: mở lại là việc của chính ba mẹ,
              một cú bấm, không phải một cuộc gọi.
            */
            <Button
              size="sm"
              variant="outline"
              onClick={() => setMoKhoaChon(true)}
              className="shrink-0 font-medium"
            >
              Chọn thêm ảnh
            </Button>
          ) : (
            /*
              Bộ ảnh đã khoá: CSKH đã xác nhận và chuyển cho thợ chỉnh ảnh.
              Ba mẹ không sửa thẳng được nữa, nhưng phải có ĐƯỜNG NÓI — không
              có nút thì họ đi tìm số điện thoại, và cuộc gọi đó rơi vào lúc
              CSKH đang bận với khách khác.
            */
            <Button
              size="sm"
              variant="outline"
              onClick={() => setXinSuaLai(true)}
              className="shrink-0 font-medium"
            >
              Yêu cầu sửa lại
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-6">
        {/* Dải tiến trình 6 bước của khách */}
        <div className="bg-surface rounded-xl border p-4 shadow-2xs">
          <CustomerProgress currentStep={stepNumber} />
        </div>

        {gallery.review && (
          <ReviewPanel
            status={gallery.status}
            review={gallery.review}
            hotline={gallery.branch.hotline}
            onDecide={decideReview}
          />
        )}

        {/* Cảnh báo bộ ảnh đã chốt */}
        {isLocked && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <Lock className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Bộ ảnh đang ở chế độ xem lại</p>
              <p className="text-xs mt-0.5 opacity-90">
                {vi.gallery.lockedBanner.replace(
                  "{date}",
                  gallery.selection.submittedAt
                    ? new Date(gallery.selection.submittedAt).toLocaleDateString("vi-VN")
                    : ""
                )}
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo khi HẠN MỨC CHƯA BIẾT (quotaKnown = false) */}
        {!gallery.quotaKnown && !isLocked && (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <div className="text-sm">
              <p className="font-bold">Studio sẽ báo lại số ảnh trong gói</p>
              <p className="text-xs mt-1 leading-relaxed">
                Hạn mức ảnh chỉnh sửa của gói chụp đang được CSKH cập nhật. Quý khách vui lòng liên hệ hotline{" "}
                <span className="font-semibold">{gallery.branch.hotline}</span> để mở chọn ảnh.
              </p>
            </div>
          </div>
        )}

        {/* KHỐI 4 CON SỐ HẠN MỨC */}
        <section aria-labelledby="quota-stats-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="quota-stats-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Hạn mức chọn ảnh
            </h2>
            <QuotaDisplay
              includedQuota={gallery.quotaKnown ? gallery.includedQuota : null}
              extraPrice={gallery.extraPhotoPrice}
              selectedCount={selectionCounts.selectedCount}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Số ảnh đã chọn */}
            <div className="p-3.5 rounded-xl border bg-surface flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">1. Đã chọn</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-black tracking-tight text-rose-500">
                  {selectionCounts.selectedCount}
                </span>
                <span className="text-xs text-muted-foreground">ảnh</span>
              </div>
            </div>

            {/* 2. Số ảnh đã thanh toán */}
            <div className="p-3.5 rounded-xl border bg-surface flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">2. Trong gói</span>
              <div className="mt-2">
                {gallery.quotaKnown ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black tracking-tight text-foreground">
                      {gallery.includedQuota ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground">ảnh</span>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block pt-1">
                    Chưa có (báo lại)
                  </span>
                )}
              </div>
            </div>

            {/* 3. Số ảnh chọn thừa */}
            <div className="p-3.5 rounded-xl border bg-surface flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">3. Chọn thêm</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-2xl font-black tracking-tight",
                    selectionCounts.extraCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                  )}
                >
                  {gallery.quotaKnown ? selectionCounts.extraCount : "—"}
                </span>
                {gallery.quotaKnown && <span className="text-xs text-muted-foreground">ảnh</span>}
              </div>
            </div>

            {/* 4. Tiền của số ảnh thừa */}
            <div className="p-3.5 rounded-xl border bg-surface flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">4. Phụ phí thêm</span>
              <div className="mt-2">
                {gallery.quotaKnown ? (
                  <span
                    className={cn(
                      "text-base sm:text-lg font-black tracking-tight block",
                      selectionCounts.extraAmount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                    )}
                  >
                    {formatCurrencyVND(selectionCounts.extraAmount)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground block pt-1">—</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* BỘ LỌC VÀ DANH SÁCH ẢNH */}
        <section aria-labelledby="photos-grid-heading" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <h2 id="photos-grid-heading" className="text-base font-bold">
                Danh sách ảnh ({filteredPhotos.length})
              </h2>
              {photosLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
            </div>

            {/* Các nút bấm lọc */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  filter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border text-muted-foreground hover:text-foreground"
                )}
              >
                {vi.gallery.filterAll} ({photos.length})
              </button>

              <button
                type="button"
                onClick={() => setFilter("selected")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5",
                  filter === "selected"
                    ? "bg-rose-500 text-white"
                    : "bg-surface border text-muted-foreground hover:text-foreground"
                )}
              >
                <Heart className="w-3.5 h-3.5 fill-current" />
                {vi.gallery.filterSelected} ({selectionCounts.selectedCount})
              </button>

              <button
                type="button"
                onClick={() => setFilter("unselected")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  filter === "unselected"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border text-muted-foreground hover:text-foreground"
                )}
              >
                {vi.gallery.filterUnselected}
              </button>

            </div>
          </div>

          {/* ----------------------------------------------------------------
              BB-180 — NHÓM ẢNH, hiện thành thẻ bấm được thay vì danh sách thả xuống
              ----------------------------------------------------------------
              Danh sách thả xuống giấu mất thông tin: ba mẹ phải bấm ra mới biết bộ
              ảnh có những nhóm nào, và không bao giờ thấy nhóm nào có bao nhiêu tấm.

              **KHÔNG nhét tiêu đề nhóm vào giữa lưới ảnh.** Lưới đang cuộn ảo theo
              hàng đều nhau (BB-131, chịu được 1.235 tấm trên điện thoại). Chèn hàng
              cao thấp khác nhau vào đó là đụng đúng phần đã tối ưu cho bộ ảnh lớn —
              cái giá không đáng so với cái được.
          */}
          {gallery.subfolders.length > 0 && (
            <section aria-label={vi.gallery.subfolderTitle} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {vi.gallery.subfolderTitle}
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedSubfolder("")}
                  aria-pressed={selectedSubfolder === ""}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                    selectedSubfolder === ""
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface border text-foreground hover:bg-surface-2",
                  )}
                >
                  {vi.gallery.subfolderAll}
                  <span className="ml-1.5 opacity-70">{photos.length}</span>
                </button>
                {gallery.subfolders.map((folder) => (
                  <button
                    key={folder}
                    type="button"
                    onClick={() => setSelectedSubfolder(folder)}
                    aria-pressed={selectedSubfolder === folder}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                      selectedSubfolder === folder
                        ? "bg-primary text-primary-foreground"
                        : "bg-surface border text-foreground hover:bg-surface-2",
                    )}
                  >
                    {folder}
                    <span className="ml-1.5 opacity-70">{demTheoNhom.get(folder) ?? 0}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Lưới ảnh responsive (tối ưu từ mobile 375px) */}
          {filteredPhotos.length === 0 ? (
            <div className="py-12 text-center rounded-xl border border-dashed bg-surface/50 p-6">
              <p className="text-sm text-muted-foreground">{vi.gallery.emptyFilter}</p>
            </div>
          ) : (
            <LuoiAnh
              photos={filteredPhotos}
              mutatingIds={mutatingIds}
              khoa={isLocked}
              soSanPhamTheoAnh={soSanPhamTheoAnh}
              onToggle={handleToggleHeart}
              onOpen={(idx) => setLightboxIndex(idx)}
            />
          )}
        </section>

        {/* THÀNH PHẦN HỢP ĐỒNG HAI TẦNG */}
        {contractBreakdownItems.length > 0 && (
          <section aria-labelledby="contract-breakdown-heading" className="pt-4">
            <ContractBreakdown items={contractBreakdownItems} />
          </section>
        )}

        {/* SẢN PHẨM IN TRONG GÓI — bảng tóm tắt, CHỈ ĐỌC.
            Chỗ gán ảnh nay nằm ở bảng bên phải màn xem ảnh lớn, nơi ba mẹ đang
            nhìn thấy tấm ảnh thật. Xem ghi chú đầu `tom-tat-san-pham-in.tsx`. */}
        <TomTatSanPhamIn
          className="mt-4"
          dong={hangInTrongGoi.map((sp) => ({
            galleryItemId: sp.galleryItemId,
            name: sp.name,
            quantity: sp.quantity,
            nhom: sp.nhom,
            anh: placements
              .filter((pl) => pl.galleryItemId === sp.galleryItemId)
              .map((pl) => {
                const a = photos.find((p) => p.id === pl.photoId);
                return { id: pl.photoId, fileName: a?.fileName ?? "" };
              }),
          }))}
          onMoAnh={moAnhTheoId}
        />

        {/* SẢN PHẨM MUA THÊM (ADDON) — khối cũ, nay thay bằng cửa hàng riêng. */}
        {/*
          Khối "mua thêm" ĐÃ RỜI khỏi cuối trang.

          Chủ studio 22/09/2026: "phần bán hàng cần có menu riêng, không đưa
          xuống dưới như vậy sẽ không bán được hàng". Bộ ảnh thật có 460 tấm,
          nên một khối nằm sau lưới ảnh chỉ gặp được sau khi cuộn hết 460 tấm —
          và lúc đó ba mẹ đang đi tìm nút Chốt, không đi mua khung.

          Nay có nút riêng ở thanh dưới đáy, mở ra `CuaHang`.
        */}
      </div>

      <CuaHang
        mo={moCuaHang}
        onDong={() => setMoCuaHang(false)}
        khoa={isLocked}
        dangLuu={placing}
        danhMuc={(gallery.addons?.catalogue ?? []).map((sp) => ({
          productId: sp.productId,
          name: sp.name,
          material: sp.material,
          size: sp.size,
          unitPrice: sp.unitPrice,
          nhom: sp.nhom as NhomSanPham,
          canGanAnh: sp.canGanAnh,
        }))}
        daMua={(gallery.addons?.items ?? []).map((m) => ({
          id: m.id,
          productId: m.productId,
          name: m.name,
          quantity: m.quantity,
          totalPrice: m.totalPrice,
          photoId: m.photoId ?? null,
        }))}
        tongTien={gallery.addons?.totalAmount ?? 0}
        anhDaChon={photos
          .filter((p) => p.mark === "selected")
          .map((p) => ({ id: p.id, fileName: p.fileName }))}
        onMua={(productId, soLuong, photoId) =>
          void datSoLuongMuaThem(productId, soLuong, photoId)
        }
      />

      {/* THANH ĐIỀU HƯỚNG DÍNH DƯỚI ĐÁY CHO MOBILE (Sticky Bottom Bar) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md px-4 py-3 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">Đã chọn:</span>
              <span className="text-base font-black text-rose-500">
                {selectionCounts.selectedCount}
              </span>
              {gallery.quotaKnown && (
                <span className="text-xs text-muted-foreground">
                  / {gallery.includedQuota ?? 0} ảnh
                </span>
              )}
            </div>

            {gallery.quotaKnown && selectionCounts.extraCount > 0 ? (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Vượt {selectionCounts.extraCount} ảnh (+{formatCurrencyVND(selectionCounts.extraAmount)})
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {gallery.quotaKnown ? "Trong hạn mức gói" : "Hạn mức chưa xác định"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/*
              CỬA RIÊNG CHO PHẦN BÁN HÀNG.

              Đứng cạnh nút Chốt, ở thanh luôn nhìn thấy — không phải cuộn hết
              460 tấm mới gặp. Ẩn khi chưa có gì bán được, và khi bộ ảnh đã
              khoá thật (CSKH xác nhận rồi thì đặt thêm phải qua CSKH).
            */}
            {(gallery.addons?.catalogue?.length ?? 0) > 0 && !isLocked && (
              <Button
                variant="outline"
                onClick={() => setMoCuaHang(true)}
                className="h-11 rounded-xl px-4 font-semibold"
              >
                Mua thêm
                {(gallery.addons?.totalAmount ?? 0) > 0 && (
                  <span className="ml-1.5 text-xs text-muted-foreground">
                    {formatCurrencyVND(gallery.addons?.totalAmount ?? 0)}
                  </span>
                )}
              </Button>
            )}

            {!isLocked && (
              <Button
                onClick={() => setShowSubmitModal(true)}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-5 h-11 rounded-xl shadow-md flex items-center gap-2"
              >
                <span>{vi.gallery.submitCta}</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}

            {daChotChoXacNhan && (
              <Button
                variant="outline"
                onClick={() => setMoKhoaChon(true)}
                className="h-11 rounded-xl px-4 font-semibold"
              >
                Chọn thêm ảnh
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* HỘP THOẠI XÁC NHẬN CHỐT BỘ ẢNH */}
      {/* ------------------------------------------------------------------
          BB-180 — CHÂN MÀN KHÁCH: thông tin studio
          ------------------------------------------------------------------
          Ba mẹ xem ảnh xong thường có việc muốn hỏi, mà trước đây chỉ có một dòng
          hotline bé xíu ở đầu màn, cuộn xuống là mất.

          Thời gian lưu ảnh (2 tháng, `docs/13 §11`) **cố ý chưa hiện ở đây**. Đo
          ngày 17/09: 0/15 link có ngày hết hạn và chưa có đường tự hết hạn — mọi link
          đang sống vĩnh viễn. In con số đó lên trong khi hệ thống không tôn trọng nó
          là dạy khách đừng tin những gì app nói. Bật sau khi BB-183 xong.
      */}
      {/*
          Chủ studio 22/09/2026: "lỗi cả thông tin ở chân trang".

          Chân trang trước đây nằm NGOÀI thẻ bọc `max-w-4xl mx-auto px-4`, nên
          chữ dính sát mép trái màn hình trong khi mọi khối khác đều thụt vào —
          nhìn như trang bị vỡ. Viền `border-t` vẫn kéo hết bề ngang (đó là
          đường ngăn, phải chạm mép), còn CHỮ thì vào đúng cột như phần trên.
      */}
      <footer className="mt-10 border-t text-sm">
        <div className="mx-auto max-w-4xl px-4 pt-6 pb-10">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {vi.gallery.studioInfo}
          </h2>
          <p className="mt-2 font-semibold text-foreground">{gallery.branch.name}</p>
          <div className="mt-1 space-y-1 text-muted-foreground">
            {gallery.branch.address && <p>{gallery.branch.address}</p>}
            {gallery.branch.hotline && (
              <p>
                <a
                  href={`tel:${gallery.branch.hotline.replace(/[^+\d]/g, "")}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {gallery.branch.hotline}
                </a>
                <span className="ml-1.5 opacity-70">— {vi.gallery.callUs}</span>
              </p>
            )}
            {gallery.branch.chatUrl && (
              <p>
                <a
                  href={gallery.branch.chatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {vi.gallery.messageStudio}
                </a>
              </p>
            )}
          </div>
        </div>
      </footer>

      {xinSuaLai && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md space-y-4 rounded-2xl border bg-surface p-6 shadow-2xl">
            <h3 className="text-lg font-bold">Yêu cầu sửa lại</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Bộ ảnh đã chuyển cho bên chỉnh ảnh nên ba mẹ không tự sửa được nữa. Ba mẹ ghi
              giúp muốn sửa gì, bên mình xem còn kịp không rồi báo lại ngay ạ.
            </p>
            <textarea
              value={lyDoSuaLai}
              onChange={(e) => setLyDoSuaLai(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ví dụ: em muốn đổi tấm số 12 sang tấm 15 giúp em"
              className="h-24 w-full resize-none rounded-xl border bg-background p-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={() => setXinSuaLai(false)} disabled={dangXin}>
                {vi.common.cancel}
              </Button>
              <Button
                onClick={() => void guiXinSuaLai()}
                disabled={dangXin || lyDoSuaLai.trim().length === 0}
                className="bg-primary font-bold text-primary-foreground"
              >
                Gửi cho studio
              </Button>
            </div>
          </div>
        </div>
      )}

      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-surface border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold">{vi.gallery.submitConfirmTitle}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {vi.gallery.submitConfirm}
            </p>

            {/* ----------------------------------------------------------------
                BB-180 — NHẮC chọn ảnh phóng và bìa album, KHÔNG CHẶN
                ----------------------------------------------------------------
                Chủ studio chốt 17/09. Khách chốt thiếu thì CSKH phải gọi lại, và
                có ca quên hẳn — việc này đang làm studio mất tiền.

                Nhưng **không chặn nút Chốt**. Khách đang cầm điện thoại, đang bế
                con; chặn là họ bỏ dở giữa chừng. Chỉ nói rõ cái được nếu chọn
                luôn, rồi để họ tự quyết.
            */}
            {sanPhamThieuAnh.length > 0 && (
              <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-xs dark:border-amber-500/30 dark:bg-amber-500/10">
                <p className="font-semibold text-amber-900 dark:text-amber-200">
                  Bạn chưa chọn ảnh cho:
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-amber-900/90 dark:text-amber-100/90">
                  {sanPhamThieuAnh.map((sp) => (
                    <li key={sp.galleryItemId}>{sp.name}</li>
                  ))}
                </ul>
                <p className="mt-2 leading-relaxed text-amber-900/80 dark:text-amber-100/80">
                  Chọn luôn thì bên mình làm nhanh hơn — để sau cũng được, CSKH sẽ
                  hỏi lại.
                </p>
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="mt-2.5 rounded-lg bg-amber-200/70 px-3 py-1.5 font-semibold text-amber-950 hover:bg-amber-200 dark:bg-amber-400/20 dark:text-amber-100 dark:hover:bg-amber-400/30"
                >
                  Để tôi chọn thêm
                </button>
              </div>
            )}

            <div className="p-3 bg-surface-2 rounded-xl text-xs space-y-1">
              <div className="flex justify-between font-medium">
                <span>Số ảnh đã chọn:</span>
                <span className="font-bold">{selectionCounts.selectedCount} ảnh</span>
              </div>
              {gallery.quotaKnown && (
                <>
                  <div className="flex justify-between">
                    <span>Số ảnh trong gói:</span>
                    <span>{gallery.includedQuota ?? 0} ảnh</span>
                  </div>
                  {selectionCounts.extraCount > 0 && (
                    <div className="flex justify-between text-amber-600 font-medium">
                      <span>Số ảnh mua thêm:</span>
                      <span>{selectionCounts.extraCount} ảnh ({formatCurrencyVND(selectionCounts.extraAmount)})</span>
                    </div>
                  )}
                </>
              )}
            </div>

            {/*
              Hai ô BẮT BUỘC — máy chủ đòi từ đầu, màn hình thì chưa từng có.
              Xem ghi chú ở chỗ khai `tenXacNhan`.

              Tên người xác nhận không phải thủ tục: bộ ảnh chốt xong là khoá,
              và sáu tháng sau câu hỏi "ai chốt" chỉ trả lời được bằng dòng này
              (`selections.submitted_by_name`).
            */}
            <div>
              <label htmlFor="confirm-name-input" className="block text-xs font-semibold mb-1 text-muted-foreground">
                {vi.gallery.parentName}
              </label>
              <input
                id="confirm-name-input"
                value={tenXacNhan}
                onChange={(e) => setTenXacNhan(e.target.value)}
                placeholder={vi.gallery.parentNamePlaceholder}
                className="w-full p-2.5 rounded-xl border bg-background text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <label className="flex items-start gap-2 text-xs leading-relaxed">
              <input
                type="checkbox"
                checked={dongY}
                onChange={(e) => setDongY(e.target.checked)}
                className="mt-0.5"
              />
              <span>{vi.gallery.submitAgree}</span>
            </label>

            <div>
              <label htmlFor="customer-note-input" className="block text-xs font-semibold mb-1 text-muted-foreground">
                Ghi chú chung cho studio (nếu có):
              </label>
              <textarea
                id="customer-note-input"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Lời nhắn thêm cho thợ chỉnh sửa..."
                className="w-full p-2.5 rounded-xl border bg-background text-sm resize-none h-20 focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                {vi.common.cancel}
              </Button>
              <Button
                onClick={handleSubmitSelection}
                // Khoá nút khi chưa đủ hai ô: bấm rồi nhận "Dữ liệu không hợp
                // lệ" thì ba mẹ không biết thiếu gì, và câu đó không nói ra.
                disabled={submitting || tenXacNhan.trim().length === 0 || !dongY}
                className="bg-primary text-primary-foreground font-bold"
              >
                {submitting ? <Spinner className="w-4 h-4 mr-2" /> : null}
                {vi.common.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* TẢI ẢNH VỀ MÁY — BB-156.
          Chủ studio chốt: từng ảnh, và cả bộ tải dần từng lô, hết lô tự tiếp. */}
      {choPhepTai && photos.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-[var(--bb-border)] bg-surface p-3 text-sm shadow-lg">
          {tienDoTai && tienDoTai.tong > 1 ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span>
                  Đang tải {tienDoTai.daXong}/{tienDoTai.tong} ảnh
                  {tienDoTai.dangTai ? ` · ${tienDoTai.dangTai}` : ""}
                </span>
                <button
                  type="button"
                  onClick={() => { dungTaiRef.current = true; }}
                  className="rounded-md border border-[var(--bb-border)] px-3 py-1"
                >
                  Dừng
                </button>
              </div>
              {tienDoTai.loi && (
                <p className={tienDoTai.hetChoTrongMay ? "text-[var(--bb-danger)]" : "text-[var(--bb-fg-muted)]"}>
                  {tienDoTai.loi}
                </p>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[var(--bb-fg-muted)]">
                Cả bộ {photos.length} ảnh · {doDocDuocDungLuong(gallery?.tongDungLuongAnh)} · ảnh gốc
              </span>
              <div className="flex flex-wrap gap-2">
                {soAnhDaChon > 0 && (
                  <button
                    type="button"
                    onClick={taiAnhDaChon}
                    className="flex items-center gap-2 rounded-md border border-[var(--bb-border)] px-4 py-2"
                  >
                    <MuiTenTaiXuong />
                    Tải {soAnhDaChon} ảnh đã chọn
                  </button>
                )}
                <button
                  type="button"
                  onClick={taiCaBo}
                  className="flex items-center gap-2 rounded-md bg-[var(--bb-accent)] px-4 py-2 text-white"
                >
                  <MuiTenTaiXuong />
                  Tải cả bộ
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MÀN XEM ẢNH LỚN (PhotoLightbox) — BB-143 */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={filteredPhotos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onToggleHeart={handleToggleHeart}
          onTaiAnh={choPhepTai ? (p) => taiMotAnh({ id: p.id, fileName: p.fileName }) : null}
          mutatingIds={mutatingIds}
          isLocked={isLocked}
          daChon={soAnhDaChon}
          hanMuc={gallery.quotaKnown ? (gallery.includedQuota ?? null) : null}
          onLuuGhiChu={luuGhiChuAnh}
          banner={
            gallery.banner ? (
              // Quảng cáo KHÔNG chen vào chỗ bấm: nó nằm ở cột riêng, không
              // đè lên ảnh, không nổi lên trên, và không có gì tự đóng.
              gallery.banner.linkUrl ? (
                <a
                  href={gallery.banner.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gallery.banner.imageUrl}
                    alt="Ưu đãi của studio"
                    className="max-h-[70vh] w-full rounded-xl object-contain"
                  />
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={gallery.banner.imageUrl}
                  alt="Ưu đãi của studio"
                  className="max-h-[70vh] w-full rounded-xl object-contain"
                />
              )
            ) : null
          }
          bangSanPham={(anh) => (
            <BangSanPhamCuaAnh
              anhDaChon={anh.mark === "selected"}
              khoa={isLocked}
              dangLuu={placing}
              suatTrongGoi={suatInTrongGoi.map((sp) => ({
                galleryItemId: sp.galleryItemId,
                name: sp.name,
                quantity: sp.quantity,
                daDat: demAnhTrongDongHang(sp.galleryItemId),
                coAnhNay: placements.some(
                  (pl) => pl.galleryItemId === sp.galleryItemId && pl.photoId === anh.id,
                ),
              }))}
              albumTrongGoi={albumTrongGoi.map((sp) => ({
                galleryItemId: sp.galleryItemId,
                name: sp.quantity > 1 ? `${sp.name} ×${sp.quantity}` : sp.name,
                soAnh: demAnhTrongDongHang(sp.galleryItemId),
                coAnhNay: placements.some(
                  (pl) => pl.galleryItemId === sp.galleryItemId && pl.photoId === anh.id,
                ),
              }))}
              monMuaThem={(gallery.addons?.catalogue ?? [])
                .filter((sp) => sp.canGanAnh)
                .map((sp) => ({
                  productId: sp.productId,
                  name: sp.name,
                  material: sp.material,
                  size: sp.size,
                  unitPrice: sp.unitPrice,
                  nhom: sp.nhom as NhomSanPham,
                  canGanAnh: sp.canGanAnh,
                  // Số lượng của ĐÚNG tấm đang xem, không phải tổng cả bộ.
                  soLuong:
                    gallery.addons?.items?.find(
                      (m) => m.productId === sp.productId && m.photoId === anh.id,
                    )?.quantity ?? 0,
                }))}
              albumDaMua={(gallery.addons?.items ?? [])
                .filter((m) => !m.photoId)
                .map((m) => ({
                  addonId: m.id,
                  name: m.quantity > 1 ? `${m.name} ×${m.quantity}` : m.name,
                  coAnhNay: (gallery.albumPlacements ?? []).some(
                    (ap) => ap.addonId === m.id && ap.photoId === anh.id,
                  ),
                  soAnh: (gallery.albumPlacements ?? []).filter((ap) => ap.addonId === m.id).length,
                }))}
              albumBanDuoc={(gallery.addons?.catalogue ?? [])
                .filter((sp) => sp.nhom === "album")
                .map((sp) => ({
                  productId: sp.productId,
                  name: sp.name,
                  material: sp.material,
                  size: sp.size,
                  unitPrice: sp.unitPrice,
                  nhom: "album" as NhomSanPham,
                  canGanAnh: false,
                  soLuong:
                    gallery.addons?.items?.find((m) => m.productId === sp.productId && !m.photoId)
                      ?.quantity ?? 0,
                }))}
              onDatVaoAlbum={(addonId, dat) => void datAnhVaoAlbum(anh.id, addonId, dat)}
              onMuaAlbum={(productId, soLuong) =>
                // Album mua KHÔNG gắn ảnh: ảnh đưa vào sau, từng tấm một.
                void datSoLuongMuaThem(productId, soLuong, null)
              }
              onDatVaoGoi={(galleryItemId, dat) => changePlacement(anh.id, galleryItemId, dat)}
              onDatMuaThem={(productId, soLuong) =>
                void datSoLuongMuaThem(productId, soLuong, anh.id)
              }
            />
          )}
        />
      )}
    </div>
  );
}

/** Mũi tên tải xuống — BB-161, chủ studio chốt dùng biểu tượng thay cho chữ. */
function MuiTenTaiXuong() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3v12" />
      <path d="M7 12l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}
