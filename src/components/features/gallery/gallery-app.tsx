"use client";

import { isGalleryLocked } from "@/lib/gallery-status";
import { getCustomerProgressStep } from "@/lib/gallery/progress";
import type { GalleryStatus } from "@/types/domain";
import { ReviewPanel, type ReviewData } from "@/components/features/gallery/review-panel";
import { DanhSachBuoiChup } from "@/components/features/gallery/danh-sach-buoi-chup";
import { PhotoLightbox } from "@/components/features/gallery/photo-lightbox";
import { taiTheoLo, doDocDuocDungLuong, type TienDoTai } from "@/lib/utils/tai-anh";
import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, memo } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { buildHeartPayload } from "@/lib/selection/heart-payload";
import { useRouter } from "next/navigation";
import { Heart, AlertTriangle, AlertCircle, Info, ChevronRight, Lock } from "lucide-react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { QuotaDisplay } from "@/components/ui/quota-display";
import { CustomerProgress } from "@/components/ui/customer-progress";
import { ContractBreakdown, type ContractItem, formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { PhotoPlacementPicker } from "@/components/ui/photo-placement-picker";
import { AddonSelector, type AddonProduct } from "@/components/ui/addon-selector";
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
      quantity: number;
      unitPrice: number | null;
      totalPrice: number | null;
      components: Array<{
        id: string;
        name: string;
        kind: string;
        quantity: number;
      }>;
    }>;
  };
  placements?: Array<{ photoId: string; galleryItemId: string }>;
  // Vòng duyệt ảnh đã chỉnh. null khi bộ ảnh chưa tới bước đó.
  review?: ReviewData | null;
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
    }>;
    /** Danh mục ba mẹ CÓ THỂ mua thêm — xem ghi chú ở `/api/g/gallery`. */
    catalogue?: Array<{
      productId: string;
      name: string;
      kind: string;
      material: string | null;
      size: string | null;
      unitPrice: number;
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
function LuoiAnh({ photos, mutatingIds, khoa, onToggle, onOpen }: LuoiAnhProps) {
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
  const [dongY, setDongY] = useState(false);
  const [placements, setPlacements] = useState<{ photoId: string; galleryItemId: string }[]>([]);
  const [placing, setPlacing] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const isLocked = useMemo(() => {
    if (!gallery) return false;
    return isGalleryLocked(gallery.status);
  }, [gallery]);

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
  const printProducts = useMemo(() => {
    const items = gallery?.contract?.items ?? [];
    const out: { galleryItemId: string; name: string; quantity: number }[] = [];
    for (const item of items) {
      if (item.kind === "print") {
        out.push({ galleryItemId: item.id, name: item.name, quantity: item.quantity });
      }
      for (const comp of item.components ?? []) {
        if (comp.kind === "print") {
          out.push({ galleryItemId: comp.id, name: comp.name, quantity: comp.quantity });
        }
      }
    }
    return out;
  }, [gallery]);

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
      printProducts.filter(
        (sp) =>
          placements.filter((pl) => pl.galleryItemId === sp.galleryItemId).length <
          sp.quantity,
      ),
    [printProducts, placements],
  );

  /** Chỉ ảnh ĐÃ CHỌN mới đặt được vào sản phẩm in — ảnh in lấy từ tập đã chỉnh. */
  const placeablePhotos = useMemo(
    () =>
      photos
        .filter((p) => p.mark === "selected")
        .map((p) => ({ id: p.id, thumbnailUrl: `/api/img/${p.id}?w=200` })),
    [photos],
  );

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
    async (productId: string, soLuong: number) => {
      setPlacing(true);
      try {
        const res = await fetch("/api/g/addons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, quantity: soLuong }),
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

  /**
   * Danh sách sản phẩm bày ra cho ba mẹ chọn mua thêm.
   *
   * Lấy từ DANH MỤC (`addons.catalogue`), không phải từ những dòng đã mua.
   * Bản cũ lấy từ `addons.items` — tức là chỉ hiện những thứ ba mẹ ĐÃ mua, nên
   * khi chưa mua gì thì danh sách rỗng và component tự ẩn. Không bao giờ có
   * cái gì để bấm mua lần đầu.
   */
  const addonProducts = useMemo<AddonProduct[]>(() => {
    const dm = gallery?.addons?.catalogue;
    if (!dm?.length) return [];
    return dm.map((sp) => ({
      id: sp.productId,
      name: sp.name,
      unitPrice: sp.unitPrice,
      unit: sp.size || undefined,
      // Máy chủ đã lọc theo ba luật tiền của BB-105 trước khi gửi xuống.
      priceReliable: true,
    }));
  }, [gallery]);

  const addonQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    if (gallery?.addons?.items) {
      for (const item of gallery.addons.items) {
        map[item.productId] = item.quantity;
      }
    }
    return map;
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

          {!isLocked && (
            <Button
              size="sm"
              onClick={() => setShowSubmitModal(true)}
              className="shrink-0 font-medium"
            >
              {vi.gallery.submitCta}
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

        {/* ĐẶT ẢNH VÀO SẢN PHẨM IN
            Component tự ẩn khi hợp đồng không có hàng in. Khoá lại sau khi
            khách đã chốt — cùng luật với nút thả tim. */}
        {!isLocked && (
          <PhotoPlacementPicker
            className="mt-4"
            products={printProducts}
            selectedPhotos={placeablePhotos}
            placements={placements}
            busy={placing}
            onPlace={(photoId, itemId) => changePlacement(photoId, itemId, true)}
            onRemove={(photoId, itemId) => changePlacement(photoId, itemId, false)}
          />
        )}

        {/* SẢN PHẨM MUA THÊM (ADDON) */}
        {addonProducts.length > 0 && (
          <section aria-labelledby="addons-heading" className="pt-4">
            <AddonSelector
              products={addonProducts}
              value={addonQuantities}
              disabled={isLocked || placing}
              onChange={(soLuongMoi) => {
                // Chỉ gửi sản phẩm VỪA ĐỔI, không gửi cả bảng: mỗi lượt gọi là
                // một dòng nhật ký, và gửi cả bảng là ghi lại cả những thứ ba
                // mẹ không đụng tới.
                const cu = addonQuantities;
                for (const [productId, sl] of Object.entries(soLuongMoi)) {
                  if ((cu[productId] ?? 0) !== sl) {
                    void datSoLuongMuaThem(productId, sl);
                    return;
                  }
                }
                // Sản phẩm bị bỏ hẳn khỏi bảng mới = đặt về 0.
                for (const productId of Object.keys(cu)) {
                  if (!(productId in soLuongMoi)) {
                    void datSoLuongMuaThem(productId, 0);
                    return;
                  }
                }
              }}
            />
          </section>
        )}
      </div>

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

          {!isLocked && (
            <Button
              onClick={() => setShowSubmitModal(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-5 h-11 rounded-xl shadow-md flex items-center gap-2"
            >
              <span>{vi.gallery.submitCta}</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
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
      <footer className="mt-10 border-t pt-6 pb-10 text-sm">
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
      </footer>

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
