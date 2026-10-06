"use client";

import { taiAnhSongSong } from "@/lib/utils/tai-anh-song-song";
import dynamic from "next/dynamic";
import { isGalleryLocked } from "@/lib/gallery-status";
import { ReviewPanel, type ReviewData } from "@/components/features/gallery/review-panel";
import { TheHanhTrinh } from "@/components/features/gallery/the-hanh-trinh";
import { AnhChinhSuaKhach } from "@/components/features/gallery/anh-chinh-sua-khach";
import { tranhHanhTrinh, anhHanhTrinh } from "@/components/features/gallery/hanh-trinh";
import { DanhSachBuoiChup } from "@/components/features/gallery/danh-sach-buoi-chup";
import { BangSanPhamCuaAnh } from "@/components/features/gallery/bang-san-pham-cua-anh";
import { dangMoChoKhachXem } from "@/lib/gallery/mo-cho-khach-xem";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";
import { locHangInTrongGoi, conThieuAnh } from "@/lib/products/hang-in-trong-goi";
import { LuoiAnh } from "@/components/features/gallery/luoi-anh";
import { useTimGiaDinh } from "@/components/features/gallery/use-tim-gia-dinh";
import { ThanhDatChinhSua } from "@/components/features/gallery/thanh-dat-chinh-sua";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { ThanhChon } from "@/components/features/gallery/thanh-chon";
import { ChuongThongBao } from "@/components/features/gallery/chuong-thong-bao";
import { YeuCauMoLaiTrangThai } from "@/components/features/gallery/yeu-cau-mo-lai-trang-thai";
import { DotChonTrenManChinh, useDotChon } from "@/components/features/gallery/chon-them-anh";
import { useCapNhatTucThi } from "@/lib/utils/use-cap-nhat-tuc-thi";
import { useMoLaiAnhThuGon } from "@/lib/gallery/use-mo-lai-anh";
import {
  cauConThieuTrongGoi,
  coGuiChotDot1,
  duOTickChotDot1,
  oTickChotDot1,
} from "@/components/features/gallery/dot-chon-khach";
import { CAU_BIET_ANH_IN_CHAM, CAU_DONG_Y_STUDIO_CHON, dangCheDoChonThem } from "@/lib/gallery/dot-chon";
import { Checkbox } from "@/components/ui/checkbox";
import { demMon, demMonInChuaAnhHienThi } from "@/lib/gallery/dem-mon";
import { giuA, giuCuoi } from "@/lib/utils/giu-a";
import { MenuTaiAnh } from "@/components/features/gallery/menu-tai-anh";
import { PhotoLightbox } from "@/components/features/gallery/photo-lightbox";
import { LoiGoiYLuuApp } from "@/components/features/gallery/loi-goi-y-luu-app";
import { NutLenDauTrang } from "@/components/features/gallery/nut-len-dau-trang";
import { CamOnSauChot } from "@/components/features/gallery/cam-on-sau-chot";
import {
  themVaoSoSanh,
  boKhoiSoSanh,
  duSoSanh,
  daDuSoSanh,
  SO_SANH_TOI_DA,
  SO_SANH_TOI_THIEU,
} from "@/lib/gallery/so-sanh";

/**
 * BB-272 — tách tải chậm cho những khối KHÔNG cần ngay lúc vào trang.
 *
 * Đo trước (dev, CPU chậm 4×, 390×844): JS tải về cho `/g/[token]` ≈ 11,7MB,
 * phần lớn là các màn hình modal/dưới-cuộn này bị gộp thẳng vào bundle chính
 * dù phần lớn khách chưa bao giờ mở tới (cửa hàng, so sánh, treo tường, xem
 * lớn, hướng dẫn lưu app…). Tất cả các component dưới đây đã tự trả `null`
 * khi chưa cần hiện (xem `if (!mo) return null` / tương tự trong từng tệp)
 * NÊN tách tải chậm không đổi một pixel nào lúc đóng — chỉ đổi lúc JS của nó
 * được tải, không đổi lúc nó được VẼ.
 *
 * `ChuongThongBao` (chuông góc phải) KHÔNG tách: nó hiện NGAY trong thanh
 * công cụ từ giây đầu (không có nhánh `return null` khi đóng), nên tách tải
 * chậm ở đây sẽ gây nháy layout — đổi giao diện nhìn thấy, luật cấm của task.
 *
 * `PhotoLightbox` GIỮ TĨNH (không tách): đo thử cho thấy tách nó làm màn xem
 * lớn không mở được trong `e11-bo-anh-lon.spec.ts` (bộ 1.000 ảnh, cuộn liên
 * tục trước khi bấm mở) — nghi do đúng lúc bấm mở thì trình duyệt còn đang
 * bận xử lý cuộn/long-task nên chunk lazy-load không kịp trong 15s của phép
 * thử cũ. Đây là màn hình khách bấm vào NGAY LẦN ĐẦU chạm ảnh (không phải
 * một modal hiếm dùng), nên rủi ro làm chậm/màn hình trắng lúc mở không đáng
 * đổi lấy vài trăm KB — khác các modal hiếm dùng bên dưới.
 */
const ManTreoTuong = dynamic(
  () => import("@/components/features/gallery/man-treo-tuong").then((m) => m.ManTreoTuong),
  { ssr: false },
);
const CuaHang = dynamic(() => import("@/components/features/gallery/cua-hang").then((m) => m.CuaHang), {
  ssr: false,
});
const MoiMuaLanHai = dynamic(
  () => import("@/components/features/gallery/moi-mua-lan-hai").then((m) => m.MoiMuaLanHai),
  { ssr: false },
);
// BB-321 — màn "Chọn thêm ảnh · Đợt N" (thay cả trang khi mở, xem nhánh `moManDot`).
const ManChonThemDot = dynamic(
  () => import("@/components/features/gallery/man-chon-them-dot").then((m) => m.ManChonThemDot),
  { ssr: false },
);
const MoiNguoiThan = dynamic(
  () => import("@/components/features/gallery/moi-nguoi-than").then((m) => m.MoiNguoiThan),
  { ssr: false },
);
const TomTatSanPhamIn = dynamic(
  () => import("@/components/features/gallery/tom-tat-san-pham-in").then((m) => m.TomTatSanPhamIn),
  { ssr: false },
);
// BB-339 mục 3 — lưới chọn ảnh cho MỘT món trong gói (mở từ khối "Trong gói
// của ba mẹ", từ hộp chốt "Chọn ảnh ngay", và từ cửa hàng).
const ChonAnhNhieuTam = dynamic(
  () => import("@/components/features/gallery/chon-anh-nhieu-tam").then((m) => m.ChonAnhNhieuTam),
  { ssr: false },
);
const ChonBiaAlbum = dynamic(
  () => import("@/components/features/gallery/chon-bia-album").then((m) => m.ChonBiaAlbum),
  { ssr: false },
);
const HuongDanThemManHinh = dynamic(
  () => import("@/components/features/gallery/huong-dan-them-man-hinh").then((m) => m.HuongDanThemManHinh),
  { ssr: false },
);
const SoSanhAnh = dynamic(() => import("@/components/features/gallery/so-sanh-anh").then((m) => m.SoSanhAnh), {
  ssr: false,
});
import { Columns2, X as XIcon } from "lucide-react";
import { taiTheoLo, doDocDuocDungLuong, type TienDoTai } from "@/lib/utils/tai-anh";
import {
  tinhTenBiaTuDuLieu,
  tieuDeHopChot,
  cauYeuCauBiaAlbum,
  chuanHoaKyHieuKichThuocTrongGallery,
  tenKemSoLuong,
  tenSanPhamChoKhach,
  tenDongTrongGoiChoKhach,
  formatKichThuoc,
  formatSo,
} from "@/lib/utils/dinh-dang";
import { layerMoVuong } from "@/lib/utils/tranh-tan-nen";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { buildHeartPayload, buildGhiChuPayload } from "@/lib/selection/heart-payload";
import { useHangChoTim } from "@/components/features/gallery/use-hang-cho-tim";
import { useNutBackDong } from "@/components/features/gallery/use-nut-back-dong";
import { DaiKhoaTrangThai } from "@/components/features/gallery/dai-khoa-trang-thai";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, MessageCircle, LayoutGrid, ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";
import { ChuyenBoAnh, type GiaDinhTrongBo } from "@/components/features/gallery/chuyen-bo-anh";
import { duongDanNha, tenBoHienThi } from "@/lib/utils/trang-gia-dinh";
import { ThuongHieuBoAnh } from "@/components/features/gallery/thuong-hieu-bo-anh";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { Spinner } from "@/components/ui/spinner";
import type { PhotoPublic } from "@/types/domain";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";

interface GalleryAppProps {
  token: string;
  /**
   * BB-334B — màn chọn ảnh dựng trong trang `/k/<mã>/<n>` (link gia đình):
   * mọi bộ của nhà + bộ đang mở, cho nút về trang gia đình và bộ chuyển buổi
   * chụp (bản vẽ 03/04). Không có (đường `/g/<mã>`) = màn y như cũ.
   */
  giaDinh?: GiaDinhTrongBo;
}

interface GalleryApiResponse {
  id: string;
  title: string;
  welcomeMessage: string | null;
  status: string;
  giaiDoanTienDo?: number | null;
  /**
   * BB-200 (3/3) — chuỗi tiến độ tính từ trạng thái app + mã Lark
   * (docs/21 "Luồng hiển thị"). `null` = giữ nguyên chữ cũ theo `status`.
   */
  nhanTienDo?: string | null;
  /**
   * BB-285 — máy chủ đã gộp: app `LOCKED_STATUSES` HOẶC Lark ≥ "Đã chọn hình"
   * HOẶC quá hạn 60 ngày. Dùng field này thay vì tự suy từ `status`, vì màn
   * khách không nhận mã Lark thô (xem `/api/g/gallery`).
   */
  khoaChonTheoLark?: boolean;
  /** BB-285 — luật 60 ngày (docs/21 GĐ1): file gốc coi như đã bị xoá. */
  quaHan60Ngay?: boolean;
  /** BB-359 — danh sách ảnh đã thu gọn (bộ cũ > 6 tháng); màn tự Đồng bộ lại từ Drive. */
  thuGon?: boolean;
  babyName: string | null;
  /**
   * BB-310 mục 6/7 — hai trường THÔ (không gộp sẵn như `babyName`), để
   * `tinhTenBiaTuDuLieu()` tự quyết định tên gọi lớn (nickname, hay chữ cuối
   * họ tên đầy đủ khi mất nickname) và họ tên đầy đủ cho dòng phụ nhỏ.
   */
  babyNickname?: string | null;
  babyFullName?: string | null;
  /** BB-212: tên khách hàng đứng bộ ảnh — điền sẵn ô "người xác nhận" lúc chốt. */
  customerName?: string | null;
  shootDate: string | null;
  /**
   * BB-298 — "loại buổi chụp" (Thôi nôi, Newborn, Sinh nhật…), lấy từ
   * `shoots.concept`. `null`/`undefined` khi bộ ảnh không gắn buổi chụp hoặc
   * buổi chụp chưa ghi loại — bìa ẩn phần này, không bịa.
   */
  sessionType?: string | null;
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
  /** Ảnh bìa CSKH đã chọn; `null` thì bìa lấy tấm đầu tiên. */
  coverPhotoId?: string | null;
  /** Tiêu đề bìa CSKH tự viết (BB-215); `null` thì bìa rơi về tên bé. */
  coverHeadline?: string | null;
  /** Vai trò của link đang mở: owner, co_editor, suggester hoặc viewer. */
  myRole?: string;
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
  /**
   * BB-374 — suất "Ảnh album không chỉnh sửa" (CSKH thêm vào hợp đồng, 0 ₫, không vào hạn
   * mức): `soSuat` tấm ba mẹ được chọn thêm cho album; `photoIds` tấm đã chọn.
   */
  albumKhongChinh?: { soSuat: number; photoIds: string[] };
  /** BB-202 — bìa của mỗi album TRONG GÓI. Rỗng = gói không có album nào. */
  albumBia?: Array<{
    galleryItemId: string;
    name: string;
    coverPhotoId: string | null;
    coverFileName: string | null;
  }>;
  // Vòng duyệt ảnh đã chỉnh. null khi bộ ảnh chưa tới bước đó.
  review?: ReviewData | null;
  /**
   * BB-312 — trạng thái "xin mở lại" của CHÍNH bộ ảnh này (khác `review` ở
   * trên: đó là vòng duyệt ẢNH ĐÃ CHỈNH). `khong_co` = chưa từng xin.
   */
  reopenRequest?: {
    trangThai: "khong_co" | "cho_xu_ly" | "da_mo" | "bi_tu_choi";
    lucGuiGanNhat: string | null;
    lyDoKhach: string | null;
    lyDoTuChoi: string | null;
    lucXuLy: string | null;
    lanThu: number;
  } | null;
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
// LƯỚI ẢNH — nay ở `luoi-anh.tsx` (xếp so le, giữ đúng khung, cuộn ảo).
// Bảng số đo hiệu năng của BB-131 đi cùng nó sang đó.
// ---------------------------------------------------------------------------

/** BB-317 K-g — MỘT câu duy nhất khi hạn mức chưa biết (≤ 12 chữ), dùng cho cả thông báo lẫn thẻ trên lưới. */
const CAU_CHUA_CO_HAN_MUC = vi.gallery.loiBean.chuaCoHanMuc;
/** BB-319 K-D2 — thả tim lúc chưa biết hạn mức: nói rõ tim CÓ được giữ hay không (không), mỗi câu ≤ 12 chữ. */
const CAU_TIM_CHUA_LUU = `${CAU_CHUA_CO_HAN_MUC} ${vi.gallery.loiBean.timChuaLuu}`;

export function GalleryApp({ token, giaDinh }: GalleryAppProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  /**
   * BB-317 K-g — thông báo nổi KHÔNG được che hàng chip lọc. Thanh dính
   * `#dau-luoi-anh` (logo + chip) đang nằm ở đầu màn thì thông báo trượt xuống
   * NGAY DƯỚI nó; thanh chưa tới đầu màn (bìa còn trong khung nhìn) thì giữ vị
   * trí cũ ở mép trên. Đo lúc thông báo hiện, không đoán chiều cao.
   */
  const [thongBaoTop, setThongBaoTop] = useState(16);
  useEffect(() => {
    if (!statusMessage) return;
    const el = document.getElementById("dau-luoi-anh");
    if (!el) {
      setThongBaoTop(16);
      return;
    }
    const r = el.getBoundingClientRect();
    setThongBaoTop(r.top < window.innerHeight * 0.5 && r.bottom > 0 ? Math.round(r.bottom) + 12 : 16);
  }, [statusMessage]);

  /**
   * Phiên đang là link gắn theo KHÁCH và chưa chọn buổi chụp nào (BB-130).
   *
   * Không phải một màn hình khác: cùng một link, chỉ là ba mẹ phải nói muốn
   * xem buổi nào trước. Chọn xong thì cờ này tắt và mọi thứ phía dưới chạy y
   * như link kiểu cũ.
   */
  const [phaiChonBuoiChup, setPhaiChonBuoiChup] = useState(false);

  const [gallery, setGallery] = useState<GalleryApiResponse | null>(null);

  // BB-232 — hàng chờ thả tim ngoại tuyến. Toàn bộ logic (gộp/triệt tiêu, tự
  // gửi lại, localStorage) sống trong hook riêng — xem use-hang-cho-tim.ts.
  // Máy chủ từ chối hẳn một lô gửi lại (4xx): báo và tải lại bộ ảnh cho tim
  // khớp dữ liệu thật. Ref vì loadGallery khai báo SAU và phụ thuộc hangChoTim.
  const taiLaiRef = React.useRef<() => void>(() => {});
  // BB-334B — một mã gia đình mở được nhiều bộ: hàng chờ tim ngoại tuyến tách
  // theo TỪNG bộ, không thì tim chờ gửi của bộ 1 bị gửi lên khi đang ở bộ 2.
  const hangChoTim = useHangChoTim(giaDinh ? `${token}~${giaDinh.boHienTaiId}` : token, {
    khiBiTuChoi: (_code, message) => {
      setStatusMessage(
        message
          ? vi.gallery.loiBean.matMangChuaLuuLyDo.replace("{lyDo}", message)
          : vi.gallery.loiBean.matMangChuaLuu,
      );
      taiLaiRef.current();
    },
  });


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
  const [filter, setFilter] = useState<"all" | "selected" | "unselected" | "giaDinh">("all");
  const [selectedSubfolder, setSelectedSubfolder] = useState<string>("");
  // BB-213 — tấm trượt "Lưu app ra màn hình chính", mở từ nút ở đầu trang.
  const [moHuongDanLuuApp, setMoHuongDanLuuApp] = useState(false);
  /** BB-334B — bộ chuyển buổi chụp (bản vẽ 03/04), chỉ trên trang /k/<mã>/<n>. */
  const [moChuyenBo, setMoChuyenBo] = useState(false);

  const [selectionCounts, setSelectionCounts] = useState({
    selectedCount: 0,
    extraCount: 0,
    extraAmount: 0,
  });

  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  // BB-289 — vừa chốt xong trong PHIÊN NÀY: hiện màn "Cảm ơn ba mẹ" thay vì
  // để `loadGallery()` (không `silent`, xem ghi chú BB-287 mục #24 ở hàm đó)
  // xoá cả trang thành "Đang tải…". `gallery` lúc này VẪN còn dữ liệu CŨ
  // (đúng lúc vừa chốt — số tấm/bìa/mua thêm không đổi bởi chính lượt tải
  // lại này) nên dùng thẳng để hiện màn cảm ơn, không cần đợi tải xong.
  const [vuaChotXong, setVuaChotXong] = useState(false);
  // Thời điểm bấm "Xác nhận" THẬT — hiện lên màn Cảm ơn ("Đã chốt · dd/mm/
  // yyyy"), không phải ngày bịa hay lấy lúc render.
  const [chotLuc, setChotLuc] = useState<Date | null>(null);
  // "Xem tiến độ" ở màn Cảm ơn: đóng màn Cảm ơn rồi cuộn tới thẻ hành trình
  // — nhưng `loading` vẫn có thể còn true lúc đó (lượt `loadGallery()` sau
  // chốt chưa xong), nên phải ĐỢI trang chính dựng xong mới cuộn được.
  const [cuonToiHanhTrinhSauCamOn, setCuonToiHanhTrinhSauCamOn] = useState(false);
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

  // BB-289 lượt 2 — "Xem tiến độ" ở màn Cảm ơn đóng màn đó lại (`vuaChotXong`
  // false) rồi cần cuộn tới thẻ hành trình (`#the-hanh-trinh`), nhưng lúc bấm
  // nút đó `loading` có thể VẪN true (lượt `loadGallery()` sau chốt chưa
  // xong) — trang chính (và cùng nó, `#the-hanh-trinh`) chưa có trong DOM.
  // Đợi đúng lúc `loading` chuyển sang false rồi mới cuộn, không đoán bằng
  // `setTimeout` cố định (dev server có thể chậm hơn số mili giây đoán).
  useEffect(() => {
    if (!cuonToiHanhTrinhSauCamOn || loading) return;
    setCuonToiHanhTrinhSauCamOn(false);
    // Một khung hình để React dựng xong cây DOM của trang chính trước khi đo.
    requestAnimationFrame(() => {
      document.getElementById("the-hanh-trinh")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [cuonToiHanhTrinhSauCamOn, loading]);

  /**
   * BB-212 — điền sẵn tên người xác nhận bằng tên khách hàng của bộ.
   *
   * Chủ studio 22/09/2026: "tên người xác nhận là tên khách hàng trong bộ".
   * Chỉ điền khi ô còn TRỐNG (`prev || …`) — ba mẹ gõ tay rồi thì giữ nguyên,
   * không để lần tải lại (sau khi mua thêm, ví dụ) ghi đè chữ họ vừa sửa.
   * Thiếu tên khách thì ô vẫn trống như trước — không tự bịa ra một cái tên.
   */
  useEffect(() => {
    if (gallery?.customerName) {
      setTenXacNhan((prev) => prev || gallery.customerName!);
    }
  }, [gallery?.customerName]);
  /** Hộp "xin sửa lại" — chỉ dùng khi bộ ảnh đã khoá. */
  const [xinSuaLai, setXinSuaLai] = useState(false);
  const [lyDoSuaLai, setLyDoSuaLai] = useState("");
  const [dangXin, setDangXin] = useState(false);
  const [dongY, setDongY] = useState(false);
  /**
   * BB-321 — hai ô tick mới của hộp chốt đợt 1 (chủ studio 29/09/2026, bản vẽ
   * `5-hop-chot-dot1`): chọn THIẾU so với hạn mức → đồng ý ảnh studio chọn dùm;
   * còn sản phẩm in chưa có ảnh → biết nhận ảnh chậm hơn. Cả hai BẮT BUỘC khi
   * khối tương ứng hiện; máy chủ (`/api/g/submit`) tự kiểm lại.
   */
  const [dongYStudioChon, setDongYStudioChon] = useState(false);
  const [bietAnhInChamDot1, setBietAnhInChamDot1] = useState(false);
  /** BB-321 — màn "Chọn thêm ảnh · Đợt N" đang mở (thay cả trang). */
  const [moManDot, setMoManDot] = useState(false);
  // BB-289 — bản vẽ hộp chốt (BB-285) thêm "Xem chi tiết" mở NGAY TRONG hộp:
  // lưới tấm đã chọn (đã có sẵn ở dải cuộn ngang phía dưới), ô bìa từng
  // album, và từng món mua thêm kèm ảnh/số lượng/tiền/tổng — mặc định ĐÓNG để
  // hộp chốt không dài lê thê với bộ ảnh nhiều lựa chọn.
  const [xemChiTietHopChot, setXemChiTietHopChot] = useState(false);
  // BB-319 — hộp chốt đã cuộn: tiêu đề (đứng ngoài vùng cuộn) có vạch + bóng mảnh ngăn với
  // phần chữ trôi bên dưới, không để nhãn ô nhập bị cắt nửa ngay sát tiêu đề.
  const [hopChotDaCuon, setHopChotDaCuon] = useState(false);
  useEffect(() => {
    if (!showSubmitModal) setHopChotDaCuon(false);
  }, [showSubmitModal]);
  const [placements, setPlacements] = useState<{ photoId: string; galleryItemId: string }[]>([]);
  /** BB-374 — tấm ba mẹ chọn cho album, KHÔNG chỉnh (tách hẳn khỏi tim/hạn mức). */
  const [anhKhongChinh, setAnhKhongChinh] = useState<string[]>([]);
  const [placing, setPlacing] = useState(false);
  /** BB-339 mục 3 — món trong gói đang mở lưới chọn ảnh (galleryItemId), hoặc null. */
  const [monDangChonAnh, setMonDangChonAnh] = useState<string | null>(null);
  /** BB-339 — cặp (ảnh, món) đang chờ máy chủ: bấm lặp lại trong lúc chờ thì bỏ qua. */
  const placementDangGuiRef = useRef<Set<string>>(new Set());
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  /**
   * BB-218 — màn xem lớn thường xem trong danh sách đã LỌC (`filteredPhotos`).
   * Mở từ "So sánh với tấm khác" thì tấm đó có thể không nằm trong bộ lọc
   * hiện tại (ví dụ đang lọc "Chưa chọn" mà tấm so sánh đã được thả tim) — khi
   * đó phải mở trong danh sách ĐẦY ĐỦ, không thì mất tấm/lệch chỉ số.
   */
  const [lightboxDungDanhSachDay, setLightboxDungDanhSachDay] = useState(false);

  /**
   * BB-218 — So sánh nhiều tấm. Lời chủ studio (24/09/2026): "So sánh hai
   * tấm cạnh nhau — có thể cạnh nhau hoặc không cạnh nhau nếu khách hàng
   * muốn. Ví dụ chọn quá nhiều cần bỏ bớt." Nên đây là MỘT chế độ riêng: bật
   * lên thì bấm ảnh trong lưới là đánh dấu so sánh (tối đa 4), không mở màn
   * xem lớn. Toán thêm/bớt/giới hạn nằm ở `lib/gallery/so-sanh.ts`.
   */
  const [soSanhBat, setSoSanhBat] = useState(false);
  const [dsSoSanh, setDsSoSanh] = useState<string[]>([]);
  const [moSoSanh, setMoSoSanh] = useState(false);

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
  // BB-355 (c) — người được mời mở màn mua ảnh in/album từ nút túi ở thanh đáy.
  const [moMuaNguoiXem, setMoMuaNguoiXem] = useState(false);
  /**
   * BB-279 — đường thứ hai vào cửa hàng: "Đặt in tấm này" ở màn xem ảnh lớn
   * mở thẳng ĐÚNG nhóm sản phẩm với tấm đang xem đã chọn sẵn, bỏ qua bước
   * lưới ảnh (xem `bang-san-pham-cua-anh.tsx` → `onDatInTamNay`).
   */
  const [presetCuaHang, setPresetCuaHang] = useState<{
    nhom: NhomSanPham;
    photoId: string;
  } | null>(null);
  /**
   * BB-217 — màn "treo ảnh của con lên tường", mở từ nút trong bảng sản phẩm
   * của màn xem ảnh lớn. Nhớ ID ảnh đang xem lúc bấm, không phải chỉ true/
   * false: màn treo tường cho lướt sang tấm khác trong danh sách đã chọn, và
   * lúc đóng lại thì màn xem ảnh lớn phải quay về ĐÚNG tấm ba mẹ đang xem
   * trước đó, không nhảy về tấm đầu.
   */
  const [manTreoTuongTuAnh, setManTreoTuongTuAnh] = useState<string | null>(null);

  /*
    BB-258 — thanh nổi (ThanhChon) từng nằm cố định giữa đáy màn và CHE tên
    mục/thanh lọc khi bìa còn cao (chủ studio 26/09/2026). Ba quy tắc hiện/ẩn:
      1) Bìa còn trong khung nhìn (kể cả một phần) → ẩn hẳn, vì lúc đó chưa
         có gì để "chốt" và bìa cần sạch chữ, không có thanh đè lên.
      2) Đang cuộn XUỐNG → ẩn/thu nhỏ, nhường tầm nhìn cho ảnh đang lướt qua.
      3) Dừng cuộn hoặc cuộn LÊN (dù chỉ một chút) → hiện lại ngay — ba mẹ
         luôn lấy lại được nút chính bằng một cú vuốt lên nhỏ.
    Dùng IntersectionObserver cho (1) — không đọc `getBoundingClientRect` mỗi
    lần cuộn (tốn), và một trình lắng nghe cuộn nhẹ (chỉ so sánh chiều) cho
    (2)/(3), có bộ đếm giờ ngắn để coi "vừa dừng cuộn" là một dạng "cuộn lên".
    Khai báo Ở ĐẦU hàm (trước mọi `return` sớm của trạng thái loading/lỗi bên
    dưới) — đặt sau một `if` sớm là vi phạm rules-of-hooks (ESLint bắt được).
    Phụ thuộc theo `loading`/`phaiChonBuoiChup`/`error`/`gallery`: đây là các
    điều kiện quyết định lúc nào cây DOM chứa `biaRef` mới thật sự dựng lên
    (trước đó `elBia` luôn `null` vì màn đang tải/lỗi không có bìa) — không
    chạy lại theo các điều kiện này thì observer gắn vào `null` một lần rồi
    thôi, không bao giờ thấy bìa thật khi tải xong.
  */
  const biaRef = useRef<HTMLDivElement>(null);
  const [thanhNoiAn, setThanhNoiAn] = useState(true);
  /**
   * BB-306 — bìa máy tính (layout "ben-canh"/BB-298) không tràn `100svh`
   * (`lg:min-h-0 lg:h-auto`, xem `bia-bo-anh.tsx`), nên `#dau-luoi-anh` (dính
   * ngay sau bìa) lọt vào khung nhìn máy tính TỪ LÚC MỞ TRANG, chưa cuộn gì —
   * "Baby Bean" hiện HAI LẦN cùng lúc: thanh thương hiệu đầu trang + hàng
   * logo trong thanh dính. Tái dùng ĐÚNG observer đo `biaConHien` phía trên
   * (không mở thêm observer thứ hai) — `entry.isIntersecting === false` là
   * bìa đã cuộn QUA HẲN (0% còn trong khung nhìn), đúng lúc thanh dính bắt
   * đầu "dính" ở mép trên. Cụm logo+chữ máy tính trong `#dau-luoi-anh` chỉ
   * hiện khi `true` — điện thoại không cần (bìa điện thoại luôn tràn màn nên
   * không có lỗi lặp này), giữ nguyên hàng 1 điện thoại không đổi.
   */
  const [hienLogoDinhMayTinh, setHienLogoDinhMayTinh] = useState(false);

  /**
   * BB-298 (điều hành, sau khi giám đốc duyệt phần lớn) — bìa điện thoại
   * tràn màn `min-h-[100svh]` cộng thêm hai khối đứng TRÊN nó (thanh thương
   * hiệu + chip "Lưu ra màn hình chính") đẩy nút "Bắt đầu chọn ảnh" và dòng
   * "N ảnh | M tấm | Chọn trước" xuống dưới mép màn hình 844px — bắt được
   * qua ảnh `1-bia-390x844.png` giám đốc chụp lại.
   *
   * Sửa bằng ĐO THẬT, không đoán: `phanTrenBiaRef` bọc đúng hai khối đứng
   * trên bìa (thanh thương hiệu + chip, chip có thể ẩn/hiện tuỳ trạng thái
   * "đã ẩn gần đây" của `LoiGoiYLuuApp` nên chiều cao đổi động — dùng
   * `ResizeObserver`, không phải một hằng số cộng dồn hai chiều cao đoán
   * trước). Chiều cao đo được đưa xuống làm biến CSS `--bb-phan-tren-bia`
   * trên chính khối bọc `<BiaBoAnh>` (`biaRef`) — `bia-bo-anh.tsx` trừ đúng
   * số đó ra khỏi `100svh` ở khối ảnh điện thoại. Máy tính không đụng gì
   * (giữ `lg:min-h-0`, không dùng biến này).
   */
  const phanTrenBiaRef = useRef<HTMLDivElement>(null);
  const [phanTrenBiaCao, setPhanTrenBiaCao] = useState(0);
  /**
   * BB-361 (người chấm vòng 9, mục 3) — 390, bộ đã giao: bìa ngắn nên khung đầu
   * thấy CÙNG LÚC thanh thương hiệu (chat · logo · tải · chuông) và hàng 1 của
   * thanh dính (chat · logo · so sánh · chuông) — hai bộ chat + chuông. Cùng luật
   * BB-358 đã áp ở 1440: thanh thương hiệu (có chat + chuông) còn thấy thì hàng
   * dính KHÔNG lặp bộ thứ hai. Đo thẳng thanh thương hiệu (không suy từ bìa), để
   * không có quãng cuộn nào mất cả hai bộ.
   */
  const thanhThuongHieuRef = useRef<HTMLDivElement>(null);
  const [dauTrangConThay, setDauTrangConThay] = useState(true);
  useEffect(() => {
    const el = thanhThuongHieuRef.current;
    if (!el) return;
    const quanSat = new IntersectionObserver(([entry]) => {
      setDauTrangConThay(entry ? entry.isIntersecting && entry.intersectionRect.height >= 1 : false);
    });
    quanSat.observe(el);
    return () => quanSat.disconnect();
  }, [loading, phaiChonBuoiChup, error, gallery]);
  useEffect(() => {
    const el = phanTrenBiaRef.current;
    if (!el) return;
    const capNhat = () => setPhanTrenBiaCao(el.offsetHeight);
    capNhat();
    const ro = new ResizeObserver(capNhat);
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, phaiChonBuoiChup, error, gallery]);
  useEffect(() => {
    const elBia = biaRef.current;
    if (!elBia) return;

    let biaConHien = true;
    let dangCuonXuong = false;
    let yTruoc = typeof window !== "undefined" ? window.scrollY : 0;
    let hetGioDung: ReturnType<typeof setTimeout> | null = null;

    const capNhat = () => setThanhNoiAn(biaConHien || dangCuonXuong);

    const quanSat = new IntersectionObserver(
      ([entry]) => {
        // "Bìa còn hiện" = bìa còn chiếm PHẦN LỚN màn (>40% chiều cao), không
        // phải chỉ lộ một mép: đã cuộn tới lưới + thanh lọc mà thanh nổi (nút
        // chốt, Mua thêm) vẫn giấu là quá tay (Opus soát BB-258).
        biaConHien = entry
          ? entry.isIntersecting && entry.intersectionRect.height > window.innerHeight * 0.4
          : true;
        capNhat();
        // BB-306 — xem ghi chú ở khai báo `hienLogoDinhMayTinh` phía trên.
        // BB-319 — bìa cuộn tới ĐÚNG mép trên (đáy bìa = 0) vẫn là "chạm mép" với
        // IntersectionObserver (`isIntersecting` true, cao 0px): K2 máy tính từng mất logo
        // trong thanh dính trong khi K3 có — hai kiểu thanh dính. Coi dải < 1px là đã qua bìa.
        setHienLogoDinhMayTinh(entry ? !entry.isIntersecting || entry.intersectionRect.height < 1 : false);
      },
      { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] },
    );
    quanSat.observe(elBia);

    const khiCuon = () => {
      const y = window.scrollY;
      dangCuonXuong = y > yTruoc;
      yTruoc = y;
      capNhat();
      if (hetGioDung) clearTimeout(hetGioDung);
      // Dừng cuộn ~150ms thì coi như "không còn cuộn xuống nữa" → hiện lại.
      hetGioDung = setTimeout(() => {
        dangCuonXuong = false;
        capNhat();
      }, 150);
    };
    window.addEventListener("scroll", khiCuon, { passive: true });

    return () => {
      quanSat.disconnect();
      window.removeEventListener("scroll", khiCuon);
      if (hetGioDung) clearTimeout(hetGioDung);
    };
  }, [loading, phaiChonBuoiChup, error, gallery]);

  // BB-338 — `submitted` mà máy chủ đã khoá (Lark "Đã chọn hình" trở lên, hoặc
  // quá hạn 60 ngày) thì KHÔNG còn là "chờ xác nhận, ba mẹ tự mở lại được":
  // nút "Chọn thêm ảnh" ở nhánh này bấm xong vẫn bị máy chủ chặn. Rơi sang
  // nhánh "Yêu cầu sửa lại" — cùng luật với `/api/g/xin-sua-lai`.
  const daChotChoXacNhan =
    gallery?.status === "submitted" && !moKhoaChon && gallery?.khoaChonTheoLark !== true;

  const isLocked = useMemo(() => {
    if (!gallery) return false;
    // BB-285: ưu tiên field máy chủ đã tính sẵn (gộp cả Lark + hạn 60 ngày).
    // `undefined` (bản API cũ hơn, hoặc phép thử không gửi field này) thì rơi
    // về cách tính cũ để không vỡ hành vi sẵn có.
    const khoaTheoMayChu = gallery.khoaChonTheoLark ?? isGalleryLocked(gallery.status);
    return khoaTheoMayChu || daChotChoXacNhan;
  }, [gallery, daChotChoXacNhan]);

  // BB-295 mục #15 — hai nút lọc "Đã chọn/Chưa chọn" ẩn khi đã khoá (xem nhánh
  // `nutLoc` trong JSX); nếu ba mẹ đang đứng ở một trong hai bộ lọc đó lúc bộ
  // ảnh chuyển sang khoá (vừa chốt xong), đưa về "Tất cả" — không để lưới kẹt
  // ở một bộ lọc không còn nút nào bấm lại được.
  useEffect(() => {
    if (isLocked) setFilter((f) => (f === "all" || f === "giaDinh" ? f : "all")); // BB-345: chip gia đình vẫn còn khi khoá
  }, [isLocked]);

  /*
    BB-321 — đợt chọn. Chỉ tự đọc `/api/g/dot-chon` khi bộ ảnh CÓ THỂ đang ở
    chế độ chọn thêm (trạng thái app, hoặc máy chủ đã gộp khoá theo Lark) và
    phiên không phải người chỉ xem; máy chủ mới là bên quyết `cheDoChonThem`.
  */
  const dotChon = useDotChon({
    galleryId: gallery?.id ?? null,
    bat:
      !!gallery &&
      (gallery.myRole ?? "owner") !== "viewer" &&
      (dangCheDoChonThem(gallery.status) || gallery.khoaChonTheoLark === true),
    anh: photos,
  });
  const taiLaiDotChon = dotChon.taiLai;

  // Hộp chốt đợt 1 mở: làm mới số sản phẩm in chưa có ảnh (máy chủ đếm) và bỏ tick cũ.
  // Nút Xác nhận chờ lượt đọc này xong (`daDocDot1`) — không thì khối "sản phẩm in chưa có
  // ảnh" có thể hiện SAU khi ba mẹ đã bấm, và máy chủ trả lỗi thay vì màn nói trước.
  const [daDocDot1, setDaDocDot1] = useState(false);
  useEffect(() => {
    if (!showSubmitModal) return;
    let conMo = true;
    setDongYStudioChon(false);
    setBietAnhInChamDot1(false);
    setDaDocDot1(false);
    void taiLaiDotChon().finally(() => {
      if (conMo) setDaDocDot1(true);
    });
    return () => {
      conMo = false;
    };
  }, [showSubmitModal, taiLaiDotChon]);


  /**
   * BB-287 — báo cáo chấm mục #24: chọn ảnh bìa album gọi lại `loadGallery()`
   * (để lấy `coverPhotoId` mới), hàm này luôn `setLoading(true)` ở đầu — vốn
   * đúng cho lượt tải đầu tiên, nhưng dùng lại cho một thao tác NHỎ (đổi một
   * ảnh bìa) thì xoá sạch cả trang thành "Đang tải…" trong lúc khách vẫn đang
   * đứng giữa lưới ảnh, mất luôn vị trí cuộn. `silent: true` bỏ qua đúng hai
   * dòng `setLoading`/không đụng gì khác — lượt tải đầu và các nơi gọi khác
   * (nộp bộ ảnh, hết hạn phiên…) giữ nguyên hành vi cũ.
   */
  const loadGallery = useCallback(async (opts?: { silent?: boolean; boQuaAnh?: boolean }) => {
    const silent = opts?.silent ?? false;
    try {
      if (!silent) setLoading(true);
      setError(null);
      setPhaiChonBuoiChup(false);

      // BB-187: gửi KÈM mã trên thanh địa chỉ. Máy chủ băm nó rồi so với link
      // của phiên đang cầm; lệch thì trả 409 SESSION_MISMATCH. Không gửi thì
      // máy chủ không có cách nào biết ba mẹ vừa bấm vào link nào.
      const duongGallery = `/api/g/gallery?token=${encodeURIComponent(token)}`;

      let res = await goiApiKhach(duongGallery, { cache: "no-store" });

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
      // BB-341: máy chủ nay TỰ đổi mã lấy phiên ngay trong lượt GET đầu (một
      // vòng thay vì ba). Nó đã thử mà hỏng (`daThuMa`) thì POST lại cũng hỏng
      // y vậy — hiện lỗi luôn, không tốn thêm vòng.
      const daThuMa =
        !res.ok && (await res.clone().json().catch(() => null))?.error?.details?.daThuMa === true;
      const phienCuHong =
        !daThuMa && (res.status === 410 || res.status === 403 || res.status === 409);
      if (phienCuHong) {
        // Đăng nhập lại bằng mã trên URL sẽ thay cookie cũ bằng phiên mới.
        res = new Response(null, { status: 401 });
      }

      if (res.status === 401 && !daThuMa) {
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
          // BB-334B — trang /k/<mã>/<n> đã nêu bộ bằng `x-bb-bo` (goiApiKhach):
          // không hỏi lại buổi chụp, gọi lại đúng bộ đó.
          if (!authData?.data?.galleryId && authData?.data?.customerId && !giaDinh) {
            setPhaiChonBuoiChup(true);
            setLoading(false);
            return;
          }
          // Thử gọi lại gallery sau khi đã có cookie phiên
          res = await goiApiKhach(duongGallery, { cache: "no-store" });
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

      // BB-319 K-N1 — "10x15" từ Lark hiện là "10×15" ở MỌI nơi (dữ liệu gốc giữ nguyên).
      const gData = chuanHoaKyHieuKichThuocTrongGallery(json.data as GalleryApiResponse);
      setGallery(gData);
      setPlacements(gData.placements ?? []);
      setAnhKhongChinh(gData.albumKhongChinh?.photoIds ?? []);
      setSelectionCounts({
        selectedCount: gData.selection?.selectedCount ?? 0,
        extraCount: gData.selection?.extraCount ?? 0,
        extraAmount: gData.selection?.extraAmount ?? 0,
      });

      // BB-319 — thao tác chỉ đổi GIỎ/BÌA ALBUM (mua thêm, chọn bìa) không đổi danh sách
      // ảnh: bỏ qua vòng nạp lại 400 tấm để giỏ cập nhật ngay (cửa hàng đợi lượt tải này
      // xong mới báo "Đã thêm vào giỏ" — nạp lại cả bộ làm thông báo trễ nhiều giây).
      if (opts?.boQuaAnh) return;

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
      // BB-341 — xin các trang CÙNG LÚC thay vì nối đuôi (bộ 425 ảnh: 3 vòng →
      // 1), trang đầu về là hiện ngay. Luật ghép/đi tiếp ở taiAnhSongSong.
      // BB-232 — áp hàng chờ ngoại tuyến lên MỖI lần danh sách dài thêm.
      await taiAnhSongSong<PhotoPublic>({
        soAnhDuKien: gData.photoCount ?? 0,
        goiTrang: async ({ sau, cursor, limit }) => {
          const q = new URLSearchParams({ limit: String(limit) });
          if (sau !== undefined) q.set("sau", String(sau));
          if (cursor) q.set("cursor", cursor);
          const photosRes = await goiApiKhach(`/api/g/photos?${q}`, { cache: "no-store" });
          const photosJson = await photosRes.json().catch(() => null);
          if (!photosRes.ok || !Array.isArray(photosJson?.data)) return null;
          return {
            data: photosJson.data as PhotoPublic[],
            hasMore: !!photosJson.meta?.hasMore,
            cursor: photosJson.meta?.cursor,
          };
        },
        khiCoThem: (anh) => setPhotos(hangChoTim.apDungLenAnh(anh)),
      });
      // Tải xong (hoặc còn mất mạng và dừng giữa chừng) — thử gửi luôn hàng
      // chờ cũ nếu mạng đã có lại từ lúc reload tới giờ.
      void hangChoTim.guiNgay();
    } catch {
      setError({
        code: "NETWORK_ERROR",
        message: vi.gallery.loiBean.khongKetNoiMayChu,
      });
    } finally {
      setLoading(false);
      setPhotosLoading(false);
    }
    // BB-232 — phụ thuộc vào TỪNG HÀM ổn định của hangChoTim (apDungLenAnh,
    // guiNgay), KHÔNG phụ thuộc vào cả object `hangChoTim`. Object đó đổi
    // định danh mỗi khi soChuaGui đổi (đúng ý — để ThanhChon re-render đúng
    // số), nhưng đưa cả object vào đây làm loadGallery bị TẠO LẠI mỗi lần một
    // tấm vào/ra hàng chờ, kéo theo useEffect(loadGallery) chạy lại — tải cả
    // bộ ảnh lại liên tục trong lúc offline, virtualizer của LuoiAnh không
    // bao giờ đứng yên đủ để Playwright bấm trúng nút (đã thấy thật: "element
    // was detached from the DOM, retrying" chạy tới hết 60s không dừng).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, router, hangChoTim.apDungLenAnh, hangChoTim.guiNgay]);
  taiLaiRef.current = () => void loadGallery();

  // BB-342: studio xác nhận/từ chối đợt, mở lại, ghi nhận thanh toán, giao ảnh,
  // nhắc… — màn tự cập nhật (tiến độ, khoá/mở) mà không F5. Không nạp lại ảnh:
  // phía studio không đổi tim của ba mẹ.
  // BB-351 — đang ở màn Cảm ơn mà studio MỞ LẠI (bộ về `in_review`): rời màn đó ngay để ba mẹ
  // thấy lưới ảnh + câu "Studio đã mở lại", không phải F5.
  useEffect(() => {
    if (vuaChotXong && gallery?.status === "in_review") setVuaChotXong(false);
  }, [vuaChotXong, gallery?.status]);

  // BB-359 — bộ đang thu gọn: sự kiện tức thì (`studio.mo_lai_anh` khi Đồng bộ lại xong)
  // phải nạp lại CẢ danh sách ảnh, không chỉ phần đầu trang.
  const dangThuGonRef = React.useRef(false);
  dangThuGonRef.current = gallery?.thuGon === true;
  useCapNhatTucThi(
    "khach",
    () => {
      void loadGallery({ silent: true, boQuaAnh: !dangThuGonRef.current });
      void taiLaiDotChon();
    },
    { bat: Boolean(gallery?.id), khoa: gallery?.id },
  );

  // BB-359 (2b) — mở bộ đã thu gọn: tự Đồng bộ lại ở nền, ảnh bìa + ảnh đã chọn hiện
  // ngay, đủ ảnh thì nạp lại lưới không cần F5. BB-360: ông bà (link mời) cũng kích được.
  const { dangMo: dangMoLaiAnh } = useMoLaiAnhThuGon({
    thuGon: gallery?.thuGon === true,
    coPhien: Boolean(gallery?.myRole),
    khiXong: () => void loadGallery({ silent: true }),
  });

  /**
   * Khách duyệt hoặc yêu cầu sửa. Tải lại cả bộ ảnh sau đó — quyết định này
   * đổi trạng thái, mà trạng thái chi phối gần như mọi thứ trên màn hình.
   */
  const decideReview = useCallback(
    async (decision: "approve" | "revise", note?: string) => {
      const res = await goiApiKhach("/api/g/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMessage(json?.error?.message ?? vi.gallery.loiBean.khongGuiDuoc);
        return;
      }
      setStatusMessage(
        decision === "approve"
          ? vi.gallery.loiBean.duyetChuyenIn
          : vi.gallery.loiBean.daNhanYeuCauSua,
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
        setStatusMessage(vi.gallery.loiBean.daChotKhongDoi);
        return;
      }

      if (!gallery?.quotaKnown) {
        setStatusMessage(CAU_TIM_CHUA_LUU);
        return;
      }

      const isCurrentlySelected = photo.mark === "selected";
      const nextMark = isCurrentlySelected ? null : "selected";

      // 1. Cập nhật giao diện tức thì (Optimistic)
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, mark: nextMark } : p))
      );
      // BB-374 — thả tim = ảnh CHỈNH SỬA: tấm rời suất "cho album · không chỉnh" (máy chủ gỡ
      // cùng lúc trong /api/g/selection). Một tấm không thể là cả hai.
      if (nextMark === "selected" && gallery?.myRole !== "suggester") {
        setAnhKhongChinh((prev) => prev.filter((id) => id !== photo.id));
      }
      // BB-232 — bộ đếm ở ThanhChon (`dem-da-chon`) đọc từ selectionCounts,
      // không đọc trực tiếp mảng photos. Lúc mất mạng không còn phản hồi máy
      // chủ để lấy con số chuẩn, nên tự cộng/trừ optimistic — sai lệch (phụ
      // phí, hạn mức) tự sửa lại khi hàng chờ gửi thành công và loadGallery
      // chạy lại; đúng đủ cho việc DUY NHẤT ba mẹ cần thấy ngay: "mình vừa
      // chọn/bỏ, con số đã nhích".
      const lechDaChon = (nextMark === "selected" ? 1 : 0) - (isCurrentlySelected ? 1 : 0);
      setSelectionCounts((prev) => ({ ...prev, selectedCount: prev.selectedCount + lechDaChon }));

      setMutatingIds((prev) => new Set(prev).add(photo.id));

      // BB-232 — biết chắc đang mất mạng thì khỏi phí một lượt gọi API rồi
      // chờ nó timeout: xếp hàng NGAY, không hoàn tác (E-6, docs/10-testing-qa
      // §5). Đây là NHÁNH DUY NHẤT thêm vào giữa optimistic update và fetch —
      // mọi lỗi mạng phát hiện muộn hơn (fetch tự ném) rơi xuống catch bên
      // dưới, cùng một xử lý.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        // BB-232 — hàng chờ chỉ hiểu 'selected' | null (ngữ nghĩa của thả
        // tim); photo.mark rộng hơn (có thể 'suggested'/'rejected' của vai
        // suggester) nên chuẩn hoá về đúng hai giá trị trước khi xếp hàng.
        hangChoTim.xepHangTim(photo.id, nextMark, isCurrentlySelected ? "selected" : null);
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(photo.id);
          return next;
        });
        return;
      }

      try {
        const res = await goiApiKhach("/api/g/selection", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildHeartPayload(photo.id, isCurrentlySelected, crypto.randomUUID()),
          ),
        });

        const json = await res.json().catch(() => null);

        if (!res.ok) {
          // Rollback giao diện khi API lỗi — LỖI NGHIỆP VỤ (GALLERY_LOCKED,
          // QUOTA_EXCEEDED, ...), không phải mất mạng, nên KHÔNG xếp hàng chờ
          // (BB-232: chỉ hàng đợi lỗi mạng, lỗi nghiệp vụ báo và hoàn tác như
          // cũ — xếp hàng một thao tác máy chủ đã từ chối là gửi lại vô ích).
          setPhotos((prev) =>
            prev.map((p) => (p.id === photo.id ? { ...p, mark: photo.mark } : p))
          );
          setSelectionCounts((prev) => ({ ...prev, selectedCount: prev.selectedCount - lechDaChon }));

          const code = json?.error?.code;
          const msg = json?.error?.message;

          if (code === "QUOTA_UNKNOWN") {
            setStatusMessage(CAU_TIM_CHUA_LUU);
          } else if (code === "QUOTA_EXCEEDED") {
            setStatusMessage(
              gallery?.maxSelection
                ? vi.gallery.quotaHardLimit.replace("{max}", String(gallery.maxSelection))
                : vi.gallery.loiBean.vuotGoi
            );
          } else if (code === "GALLERY_LOCKED") {
            setStatusMessage(vi.gallery.loiBean.daChotKhongChonThem);
          } else {
            setStatusMessage(msg || vi.gallery.loiBean.khongLuuDuoc);
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
        // BB-232 (E-6) — fetch chỉ ném ở đây khi MẤT MẠNG (lỗi máy chủ đã rẽ
        // vào nhánh `!res.ok` phía trên và return sớm, không rơi xuống đây).
        // KHÔNG hoàn tác: ba mẹ bấm tim, mạng rớt, tim tắt lại ngay trước mắt
        // họ và không ai biết tấm nào đã lưu — đúng lỗi mà AGENTS.md §2.3 và
        // E-6 (docs/10-testing-qa.md §5) đòi sửa. Giữ optimistic update, xếp
        // vào hàng chờ để tự gửi lại khi có mạng (use-hang-cho-tim.ts).
        hangChoTim.xepHangTim(photo.id, nextMark, isCurrentlySelected ? "selected" : null);
      } finally {
        setMutatingIds((prev) => {
          const next = new Set(prev);
          next.delete(photo.id);
          return next;
        });
      }
    },
    // Cùng lý do ở loadGallery: phụ thuộc vào hàm ổn định `xepHangTim`, không
    // phụ thuộc cả object `hangChoTim`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLocked, gallery?.quotaKnown, gallery?.maxSelection, gallery?.myRole, hangChoTim.xepHangTim],
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
        const res = await goiApiKhach("/api/g/selection", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildGhiChuPayload(photo.id, ghiChu, crypto.randomUUID())),
        });
        if (!res.ok) return false;
        // Máy chủ trả 200 kể cả khi TỪ CHỐI riêng op này (ảnh chưa có dòng chọn
        // — ví dụ ghi chú tới trước lượt thả tim). Chỉ xem res.ok thì báo "Đã
        // lưu" trong khi ghi chú mất trắng (BB-230 E-3, 24/09/2026).
        const json = (await res.json().catch(() => null)) as
          | { data?: { rejected?: { photoId: string }[] } }
          | null;
        if (json?.data?.rejected?.some((r) => r.photoId === photo.id)) return false;
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

  /**
   * BB-218 — đánh dấu/bỏ đánh dấu một tấm để so sánh. Bấm ảnh trong lưới khi
   * chế độ so sánh đang bật gọi thẳng hàm này (xem `onToggle` của LuoiAnh).
   *
   * Đã đủ 4 tấm mà bấm thêm một tấm mới thì KHÔNG lặng lẽ bỏ qua — báo cho ba
   * mẹ biết vì sao bấm không thấy gì xảy ra (cùng cơ chế `statusMessage` đã
   * dùng cho các lỗi chọn ảnh khác).
   */
  const onToggleSoSanh = useCallback(
    (photo: PhotoPublic) => {
      // Đọc danh sách hiện tại rồi mới đặt — báo lỗi nằm NGOÀI hàm cập nhật
      // trạng thái, vì React có thể gọi hàm cập nhật hai lần.
      if (dsSoSanh.includes(photo.id)) {
        setDsSoSanh(boKhoiSoSanh(dsSoSanh, photo.id));
        return;
      }
      if (daDuSoSanh(dsSoSanh)) {
        setStatusMessage(
          vi.gallery.loiBean.soSanhToiDa.replace("{n}", String(SO_SANH_TOI_DA)),
        );
        return;
      }
      setDsSoSanh(themVaoSoSanh(dsSoSanh, photo.id));
    },
    [dsSoSanh],
  );

  /**
   * Bỏ một tấm ngay trong màn so sánh. Còn dưới 2 tấm thì ĐÓNG màn so sánh
   * luôn — nếu chỉ ẩn nó đi (moSoSanh vẫn bật), lần sau ba mẹ đánh dấu thêm
   * một tấm ở lưới thì màn so sánh tự bật lên không báo trước.
   */
  const boKhoiManSoSanh = useCallback(
    (photo: PhotoPublic) => {
      const conLai = boKhoiSoSanh(dsSoSanh, photo.id);
      setDsSoSanh(conLai);
      if (!duSoSanh(conLai)) setMoSoSanh(false);
    },
    [dsSoSanh],
  );

  /** Huỷ hẳn chế độ so sánh: tắt chế độ chọn VÀ xoá danh sách đang đánh dấu. */
  const huySoSanh = useCallback(() => {
    setSoSanhBat(false);
    setDsSoSanh([]);
    setMoSoSanh(false);
  }, []);

  /**
   * BB-218 — "So sánh với tấm khác" trong màn xem lớn: đưa tấm đang xem vào
   * danh sách so sánh, đóng màn xem lớn, quay về lưới ở chế độ chọn (bật
   * `soSanhBat` nếu chưa bật) để ba mẹ chọn thêm tấm còn lại.
   */
  const onSoSanhTuLightbox = useCallback((photo: PhotoPublic) => {
    setDsSoSanh((cu) => (cu.includes(photo.id) ? cu : themVaoSoSanh(cu, photo.id)));
    setSoSanhBat(true);
    setLightboxIndex(null);
  }, []);

  /**
   * BB-218 — chạm hai lần một tấm trong màn so sánh: mở tấm đó trong màn xem
   * lớn (đã có sẵn phóng to — không chép lại toán đó ở màn so sánh).
   *
   * Dùng danh sách ĐẦY ĐỦ (`photos`), không phải `filteredPhotos`: tấm này
   * có thể đã bị lọc khỏi bộ lọc hiện tại (ví dụ đang lọc "Chưa chọn" mà tấm
   * so sánh vừa được thả tim ngay trong màn so sánh).
   */
  const onPhongToTuSoSanh = useCallback(
    (photo: PhotoPublic) => {
      const idx = photos.findIndex((p) => p.id === photo.id);
      if (idx < 0) return;
      setLightboxDungDanhSachDay(true);
      setLightboxIndex(idx);
      setMoSoSanh(false);
    },
    [photos],
  );

  const handleSubmitSelection = async () => {
    if (isLocked) return;

    // BB-232 việc 5 — còn hàng chờ ngoại tuyến thì KHÔNG cho chốt thẳng.
    //
    // Chốt thiếu tấm (vì vài thao tác thả tim còn kẹt trong hàng chờ chưa
    // gửi) là lỗi nghiêm trọng hơn hẳn bắt ba mẹ chờ thêm vài giây hoặc thấy
    // một dòng báo — bộ ảnh bị lock ngay khi submit thành công, và "xin sửa
    // lại" sau đó phải qua CSKH. Chọn đường AN TOÀN: thử gửi hết hàng chờ
    // trước; còn sót lại (vẫn mất mạng) thì CHẶN, báo rõ lý do, không gọi
    // /api/g/submit.
    if (hangChoTim.soChuaGui > 0) {
      const guiHetChua = await hangChoTim.guiNgay();
      if (!guiHetChua) {
        setStatusMessage(
          vi.gallery.loiBean.chuaLuuDoMatMang,
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await goiApiKhach("/api/g/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmedByName: tenXacNhan.trim(),
          agreed: true,
          // Tên trường bên máy chủ là `generalNote`; gửi `customerNote` thì lời
          // dặn của ba mẹ rơi vào hư không kể cả khi mọi thứ khác đúng.
          generalNote: customerNote.trim() || undefined,
          // BB-321 — cờ đồng ý của hai ô tick mới, đúng tên trường `SubmitSelectionSchema`.
          ...coGuiChotDot1(oTickDot1, { dongYStudioChon, bietAnhInCham: bietAnhInChamDot1 }),
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setStatusMessage(json?.error?.message || vi.gallery.loiBean.chotChuaDuocLucNay);
        return;
      }

      setShowSubmitModal(false);
      // Chốt lại là đóng khoá mềm: danh sách vừa chốt phải đứng yên cho tới
      // khi ba mẹ chủ động mở ra lần nữa.
      setMoKhoaChon(false);
      setStatusMessage(vi.gallery.loiBean.daChotDanhSach);
      // BB-289 — bật màn "Cảm ơn ba mẹ" TRƯỚC lượt tải lại bên dưới, để
      // `loading` không còn xoá trang thành "Đang tải…" ngay sau một hành
      // động ba mẹ vừa làm xong (xem nhánh render `vuaChotXong` phía dưới).
      setChotLuc(new Date());
      setVuaChotXong(true);
      // Tải lại để cập nhật trạng thái đã chốt
      await loadGallery();
    } catch {
      setStatusMessage(vi.gallery.loiBean.chotMatMang);
    } finally {
      setSubmitting(false);
    }
  };

  /*
    BB-338 mục 2c — anh báo 01/10/2026: "link mời không chọn được ảnh riêng".
    Người được mời (vai viewer) KHÔNG chạm danh sách trong gói của ba mẹ (máy
    chủ vẫn chặn 403 ở /api/g/selection), nhưng được THẢ TIM tấm mình thích
    để đặt chỉnh sửa / mua thêm. Tim của người xem là của RIÊNG máy đó (lưu ở
    trình duyệt, theo bộ ảnh) — không ghi vào cơ sở dữ liệu, không lẫn với
    tim của ba mẹ. Lưới và màn xem lớn của người xem hiện tim CỦA HỌ.
    BB-345 — tim lưu trên máy chủ (bảng `tim_gia_dinh`, 0083), trình duyệt chỉ
    là bộ nhớ đệm; ba mẹ thấy "Gia đình thích (N)". Xem `use-tim-gia-dinh.ts`.
  */
  // BB-353 mục 2 — người chấm vòng 7 (V7-K19): ở 375/390, bấm Back khi đang
  // xem lớn, mở cửa hàng hay hộp chốt đều RỜI hẳn bộ ảnh (mở từ Zalo là văng
  // khỏi app). Ba lớp này nay dùng chung `useNutBackDong` (BB-338): mỗi lớp mở
  // đẩy một mục lịch sử, Back đóng lớp trên cùng, giữ nguyên địa chỉ bộ ảnh.
  // Gọi ở ĐÂY (component cha luôn gắn sẵn) chứ không trong component lớp phủ:
  // lớp phủ gắn lúc `mo` đã true thì StrictMode gắn-gỡ-gắn đẩy hai mục.
  const dongXemLon = useNutBackDong(lightboxIndex !== null, () => {
    setLightboxIndex(null);
    setLightboxDungDanhSachDay(false);
    // Mở từ màn so sánh (chạm hai lần) thì đóng xong quay lại màn so
    // sánh — ba mẹ đang so dở, không phải đang xem lưới.
    if (lightboxDungDanhSachDay && soSanhBat && duSoSanh(dsSoSanh)) setMoSoSanh(true);
  });
  const dongCuaHang = useNutBackDong(moCuaHang, () => {
    setMoCuaHang(false);
    setPresetCuaHang(null);
  });
  const dongHopChot = useNutBackDong(showSubmitModal, () => setShowSubmitModal(false));

  const laNguoiXem = gallery?.myRole === "viewer";
  const {
    timCuaToi: timNguoiXem,
    doiTim: doiTimNguoiXem,
    giaDinhThich,
    chuaApMigration: timChuaAp0083,
  } = useTimGiaDinh(gallery?.id, laNguoiXem);
  /** Nguồn ảnh cho lưới/màn xem lớn: người xem thấy tim CỦA HỌ, ba mẹ thấy như cũ. */
  const nguonAnh = useMemo(
    () =>
      laNguoiXem
        ? photos.map((p) => ({ ...p, mark: timNguoiXem.has(p.id) ? ("selected" as const) : null }))
        : photos,
    [laNguoiXem, photos, timNguoiXem],
  );

  // Lọc danh sách ảnh
  const filteredPhotos = useMemo(() => {
    return nguonAnh.filter((p) => {
      if (selectedSubfolder && p.subfolder !== selectedSubfolder) {
        return false;
      }
      if (filter === "selected") return p.mark === "selected";
      if (filter === "unselected") return p.mark !== "selected";
      if (filter === "giaDinh") return giaDinhThich.has(p.id);
      return true;
    });
  }, [nguonAnh, filter, selectedSubfolder, giaDinhThich]);

  /**
   * BB-218 — photoId -> thứ tự 1–4 trong danh sách so sánh. Map (không phải
   * mảng) truyền vào LuoiAnh để TheAnh chỉ nhận một SỐ nguyên thô (giá trị
   * đơn) mỗi lần dựng, đúng LUẬT 2 ở đầu `luoi-anh.tsx`.
   */
  const soSanhTheoAnh = useMemo(() => {
    const m = new Map<string, number>();
    dsSoSanh.forEach((id, i) => m.set(id, i + 1));
    return m;
  }, [dsSoSanh]);

  /** Các tấm đang so sánh, đúng thứ tự ba mẹ đã chọn — dùng cho màn so sánh. */
  const anhDangSoSanh = useMemo(
    () => dsSoSanh.map((id) => photos.find((p) => p.id === id)).filter((p): p is PhotoPublic => !!p),
    [dsSoSanh, photos],
  );

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
   * BB-202 — mọi ảnh ĐÃ THẢ TIM, hình dạng mà `goiYBiaAlbum` cần.
   *
   * "Thả tim" ở màn khách nghĩa là `mark === 'selected'` — cùng định nghĩa
   * `handleToggleHeart` đang dùng, không phải enum `mark === 'favorite'`
   * (một tầng khác, không lộ ra ở nút trái tim).
   */
  const anhDaThaTimChoBia = useMemo(
    () =>
      photos
        .filter((p) => p.mark === "selected")
        .map((p) => ({
          selectionItemId: "", // không cần ở màn khách — API tự tra lại theo photoId
          photoId: p.id,
          fileName: p.fileName,
          retouchNote: p.retouchNote,
          orderIndex: p.orderIndex,
          sortIndex: p.sortIndex,
        })),
    [photos],
  );

  /** BB-202 — album trong gói chưa có bìa (hoặc bìa đã mất hiệu lực). */
  const albumThieuBia = useMemo(
    () => (gallery?.albumBia ?? []).filter((a) => !a.coverPhotoId),
    [gallery?.albumBia],
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
   * BB-317 K-e — mỗi sản phẩm in còn thiếu ảnh MỘT dòng nhắc, kèm số ảnh thiếu.
   * Album chưa có bìa đã có dòng YÊU CẦU riêng (bìa là bắt buộc) nên không lặp
   * lại ở đây; cuốn album đã có bìa mà chưa có ảnh nào vẫn được nhắc như thường.
   */
  const dongNhacThieuAnh = useMemo(
    () =>
      sanPhamThieuAnh
        .filter((sp) => !albumThieuBia.some((a) => a.galleryItemId === sp.galleryItemId))
        .map((sp) => ({
          galleryItemId: sp.galleryItemId,
          name: tenDongTrongGoiChoKhach(sp.name, sp.nhom),
          soThieu: Math.max(1, sp.quantity - demAnhTrongDongHang(sp.galleryItemId)),
          nhom: sp.nhom,
        })),
    [sanPhamThieuAnh, albumThieuBia, demAnhTrongDongHang],
  );

  /**
   * BB-321 — hộp chốt đợt 1 cần ô tick nào. Số sản phẩm in chưa có ảnh là số
   * MÁY CHỦ đếm (`/api/g/dot-chon`, tải lại mỗi lần mở hộp); chưa có số đó thì
   * tạm dùng số dòng nhắc ẢNH IN/KHUNG trên màn — album đã có bìa máy chủ coi là
   * đủ (ảnh ruột đưa vào sau), album chưa có bìa thì đã bị chặn riêng (BB-202).
   */
  const dongInThieuAnh = dongNhacThieuAnh.filter((d) => d.nhom !== "album");
  const oTickDot1 = oTickChotDot1({
    hanMuc: gallery?.quotaKnown ? (gallery.includedQuota ?? 0) : null,
    daChon: selectionCounts.selectedCount,
    soSanPhamInChuaAnh: dotChon.tt?.soSanPhamInChuaAnh ?? dongInThieuAnh.length,
  });
  /** BB-358 — số món in chưa có ảnh ba mẹ THẤY: trừ album đang thiếu bìa (đã nhắc ở dòng bìa). */
  const soMonInChuaAnhHienThi = demMonInChuaAnhHienThi(
    dotChon.tt?.soSanPhamInChuaAnh ?? dongInThieuAnh.reduce((n, d) => n + d.soThieu, 0),
    albumThieuBia.map((a) => ({
      quantity: Math.max(1, sanPhamThieuAnh.find((sp) => sp.galleryItemId === a.galleryItemId)?.quantity ?? 1),
    })),
  );
  const duTickDot1 = duOTickChotDot1(oTickDot1, {
    dongYStudioChon,
    bietAnhInCham: bietAnhInChamDot1,
  });

  /**
   * BB-212 — dải ảnh nhỏ trong hộp "Chốt danh sách": những tấm ba mẹ SẮP chốt.
   *
   * Đây là lúc cuối để ba mẹ thấy lại đúng những gì mình đã thả tim trước khi
   * bấm nút không sửa được nữa. Bộ thật tới 1.235 tấm nên chỉ hiện 40 tấm đầu
   * kèm số còn lại — cuộn ngang cả nghìn ảnh trong một hộp thoại là vô ích.
   */
  const anhDaChonHopThoai = useMemo(
    () => photos.filter((p) => p.mark === "selected" || p.isFavorite),
    [photos],
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

  /**
   * Gắn/bỏ một tấm ảnh vào một món TRONG GÓI.
   *
   * BB-339 mục 3 — chủ studio: "ảnh chọn cập nhật chậm". Bản cũ đã cập nhật
   * lạc quan nhưng vẫn bật `placing` (cờ TOÀN CỤC) suốt lúc chờ máy chủ — mọi
   * nút "Trong gói" ở bảng xem lớn bị khoá và mờ đi (`dangLuu`) cho tới khi
   * mạng trả lời, nên nhìn như app chậm. Nay: đổi ngay trên màn, KHÔNG khoá
   * cả bảng; chỉ bỏ qua cú bấm lặp trên ĐÚNG cặp đang chờ; máy chủ từ chối
   * thì hoàn ĐÚNG thay đổi đó (không ghi đè cả mảng bằng bản chụp cũ — bản
   * chụp cũ làm mất các thay đổi khác vừa bấm trong lúc chờ).
   */
  const changePlacement = useCallback(
    async (photoId: string, galleryItemId: string, add: boolean): Promise<boolean> => {
      const khoaCap = `${photoId}|${galleryItemId}`;
      if (placementDangGuiRef.current.has(khoaCap)) return false;
      placementDangGuiRef.current.add(khoaCap);
      const apDung = (them: boolean) =>
        setPlacements((prev) => {
          const bo = prev.filter((x) => !(x.photoId === photoId && x.galleryItemId === galleryItemId));
          return them ? [...bo, { photoId, galleryItemId }] : bo;
        });
      apDung(add);
      try {
        const res = await goiApiKhach("/api/g/placements", {
          method: add ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId, galleryItemId }),
        });
        if (!res.ok) {
          apDung(!add);
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? "Chưa lưu được, ba mẹ thử lại giúp Bean nhé ạ.");
          return false;
        }
        return true;
      } catch {
        apDung(!add);
        setStatusMessage("Mất kết nối, ba mẹ thử lại giúp Bean nhé ạ.");
        return false;
      } finally {
        placementDangGuiRef.current.delete(khoaCap);
      }
    },
    [],
  );

  /**
   * BB-374 — chọn / bỏ một tấm cho suất "Ảnh album không chỉnh sửa". Lạc quan, rồi lấy
   * danh sách CHUẨN từ máy chủ (máy chủ giữ luật: không vượt số suất, không nhận tấm
   * đang thả tim). Không đụng tim, hạn mức hay tiền.
   */
  const albumKhongChinhDangGuiRef = useRef<Set<string>>(new Set());
  const doiAnhKhongChinh = useCallback(
    async (photoId: string, chon: boolean): Promise<boolean> => {
      if (albumKhongChinhDangGuiRef.current.has(photoId)) return false;
      albumKhongChinhDangGuiRef.current.add(photoId);
      const apDung = (them: boolean) =>
        setAnhKhongChinh((prev) => {
          const bo = prev.filter((id) => id !== photoId);
          return them ? [...bo, photoId] : bo;
        });
      apDung(chon);
      try {
        const res = await goiApiKhach("/api/g/album-khong-chinh", {
          method: chon ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          apDung(!chon);
          setStatusMessage(json?.error?.message ?? vi.gallery.loiBean.khongLuuDuoc);
          return false;
        }
        if (Array.isArray(json?.data?.photoIds)) setAnhKhongChinh(json.data.photoIds as string[]);
        return true;
      } catch {
        apDung(!chon);
        setStatusMessage("Mất kết nối, ba mẹ thử lại giúp Bean nhé ạ.");
        return false;
      } finally {
        albumKhongChinhDangGuiRef.current.delete(photoId);
      }
    },
    [],
  );
  const soSuatKhongChinh = gallery?.albumKhongChinh?.soSuat ?? 0;
  const tapAnhKhongChinh = useMemo(() => new Set(anhKhongChinh), [anhKhongChinh]);

  /**
   * BB-339 mục 3/4 — "Xong" trong lưới chọn ảnh của một món trong gói: so với
   * ảnh đang gắn, bỏ những tấm bị bỏ chọn TRƯỚC (nhường suất), rồi gắn tấm mới.
   * Mỗi thay đổi đi qua `changePlacement` (lạc quan, hoàn đúng tấm lỗi).
   */
  const ganAnhChoMonTrongGoi = useCallback(
    async (galleryItemId: string, photoIds: string[]) => {
      const dangCo = placements.filter((pl) => pl.galleryItemId === galleryItemId).map((pl) => pl.photoId);
      const bo = dangCo.filter((id) => !photoIds.includes(id));
      const them = photoIds.filter((id) => !dangCo.includes(id));
      // Tấm chưa thả tim: máy chủ tự thêm vào danh sách chọn khi gắn
      // (placements route) — tải lại lặng lẽ để tim/đếm trên màn khớp.
      const canTaiLai = them.some((id) => photos.find((p) => p.id === id)?.mark !== "selected");
      await Promise.all(bo.map((id) => changePlacement(id, galleryItemId, false)));
      await Promise.all(them.map((id) => changePlacement(id, galleryItemId, true)));
      if (canTaiLai) await loadGallery({ silent: true });
    },
    [placements, photos, changePlacement, loadGallery],
  );

  /**
   * Đặt số lượng một sản phẩm mua thêm.
   *
   * Gửi SỐ LƯỢNG MONG MUỐN (0 là bỏ mua), rồi tải lại bộ ảnh để con số tiền
   * trên màn hình đúng bằng con số máy chủ vừa tính — tiền là chỗ không được
   * phép đoán ở máy khách.
   */
  const datSoLuongMuaThem = useCallback(
    // BB-319 (luật 5) — trả `true` CHỈ khi máy chủ đã lưu và giỏ đã tải lại: cửa hàng
    // dựa vào đó mới báo "Đã thêm vào giỏ" (xem `onMua` ở `cua-hang.tsx`).
    async (productId: string, soLuong: number, photoId?: string | null): Promise<boolean> => {
      setPlacing(true);
      try {
        const res = await goiApiKhach("/api/g/addons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, quantity: soLuong, photoId: photoId ?? null }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? vi.gallery.loiBean.khongLuuDuoc);
          return false;
        }
        // BB-293 mục #1 — báo cáo chấm độc lập: thêm vào giỏ rồi đổi tab trong
        // cửa hàng xoá cả trang thành "Đang tải…", hộp cửa hàng biến mất, trang
        // cuộn về đầu. Cùng lỗi `loadGallery()` không truyền `silent` đã vá ở
        // mục #24 (chọn ảnh bìa, xem ghi chú ngay trên) — chỉ khác nơi gọi.
        await loadGallery({ silent: true, boQuaAnh: true });
        return true;
      } catch {
        setStatusMessage(vi.gallery.loiBean.matKetNoi);
        return false;
      } finally {
        setPlacing(false);
      }
    },
    [loadGallery],
  );

  /**
   * BB-279 — đặt một sản phẩm gắn ảnh cho NHIỀU tấm cùng lúc (nhánh batch của
   * `/api/g/addons`). Cùng logic tải lại như `datSoLuongMuaThem`: không đoán
   * tiền ở máy khách, luôn lấy số máy chủ vừa tính.
   */
  const datNhieuAnhMuaThem = useCallback(
    async (productId: string, soLuong: number, photoIds: string[]): Promise<boolean> => {
      if (photoIds.length === 0) return false;
      setPlacing(true);
      try {
        const res = await goiApiKhach("/api/g/addons", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, quantity: soLuong, photoIds }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? vi.gallery.loiBean.khongLuuDuoc);
          return false;
        }
        // BB-293 mục #1 — xem chú thích ở `datSoLuongMuaThem` bên trên: đổi
        // tab cửa hàng sau khi mua không được xoá cả trang.
        await loadGallery({ silent: true, boQuaAnh: true });
        return true;
      } catch {
        setStatusMessage(vi.gallery.loiBean.matKetNoi);
        return false;
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
      const res = await goiApiKhach("/api/g/xin-sua-lai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyDo: lyDoSuaLai.trim() }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMessage(json?.error?.message ?? vi.gallery.loiBean.khongGuiDuoc);
        return;
      }
      setXinSuaLai(false);
      setLyDoSuaLai("");
      setStatusMessage(json?.data?.loiNhan ?? "Bean đã nhận yêu cầu của ba mẹ ạ.");
      // BB-312 — tải lại để `gallery.reopenRequest` chuyển sang "cho_xu_ly":
      // nút chính đổi nhãn "Đã gửi yêu cầu · lần N" và dải trạng thái hiện ra,
      // không phải đợi khách tự tải lại trang mới thấy.
      await loadGallery({ silent: true });
    } catch {
      setStatusMessage(vi.gallery.loiBean.matKetNoi);
    } finally {
      setDangXin(false);
    }
  }, [lyDoSuaLai, loadGallery]);

  const datAnhVaoAlbum = useCallback(
    async (photoId: string, addonId: string, dat: boolean) => {
      setPlacing(true);
      try {
        const res = await goiApiKhach("/api/g/placements", {
          method: dat ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId, addonId }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? vi.gallery.loiBean.khongLuuDuoc);
          return;
        }
        await loadGallery();
      } catch {
        setStatusMessage(vi.gallery.loiBean.matKetNoi);
      } finally {
        setPlacing(false);
      }
    },
    [loadGallery],
  );

  /**
   * BB-202 — chọn (hoặc đổi) ảnh bìa cho một album TRONG GÓI.
   *
   * Khác `datAnhVaoAlbum` ở trên (album MUA THÊM, nay đã khoá): đây là bìa của
   * album ĐÃ CÓ SẴN trong hợp đồng, gọi `/api/g/album-cover`, và chỉ có ĐÚNG
   * một ảnh mỗi lần (không cộng dồn).
   */
  const chonBiaAlbum = useCallback(
    async (galleryItemId: string, photoId: string) => {
      setPlacing(true);
      try {
        // Tim được GOM rồi gửi sau một nhịp (hàng chờ BB-232). Ba mẹ thả tim
        // xong chọn NGAY tấm đó làm bìa thì máy chủ chưa có tim → "Ảnh không
        // thuộc lượt chọn này". Đẩy hàng chờ lên trước (Opus soát BB-202 —
        // e2e bắt được sau khi áp 0075).
        await hangChoTim.guiNgay();
        const res = await goiApiKhach("/api/g/album-cover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ galleryItemId, photoId }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? vi.gallery.loiBean.khongLuuDuocBia);
          return;
        }
        // BB-310 mục 2 — báo cáo chấm độc lập vòng 4: chọn bìa xong mở lại
        // hộp chốt, nút Xác nhận còn khoá thêm 3,8–7,6 giây vì hộp chốt đọc
        // `albumThieuBia` từ `gallery.albumBia`, mà trước đây chỗ này chỉ
        // cập nhật field đó SAU khi `loadGallery` tải lại TOÀN BỘ. Vá NGAY
        // tại đây — LẠC QUAN, đúng field hộp chốt đọc — ngay khi máy chủ xác
        // nhận lưu xong, không chờ vòng tải lại (vẫn chạy dưới để đối chiếu
        // lại toàn bộ dữ liệu như cũ).
        setGallery((g) =>
          g
            ? {
                ...g,
                albumBia: (g.albumBia ?? []).map((a) =>
                  a.galleryItemId === galleryItemId ? { ...a, coverPhotoId: photoId } : a,
                ),
              }
            : g,
        );
        // BB-287 — tải lại NGẦM: giữ nguyên lưới ảnh và vị trí cuộn, không xoá
        // cả trang thành "Đang tải…" cho một thao tác đổi ảnh bìa (mục #24).
        await loadGallery({ silent: true, boQuaAnh: true });
      } catch {
        setStatusMessage(vi.gallery.loiBean.matKetNoi);
      } finally {
        setPlacing(false);
      }
    },
    [loadGallery, hangChoTim.guiNgay],
  );

  // BB-289 — vừa chốt xong: hiện màn "Cảm ơn ba mẹ" với dữ liệu ĐANG CÓ SẴN
  // (đúng lúc vừa chốt), KHÔNG chờ `loading` — đặt TRƯỚC nhánh `if (loading)`
  // ngay dưới đây có chủ đích, để lượt `loadGallery()` không-`silent` sau khi
  // chốt không còn xoá trang thành "Đang tải…" (đúng lỗi admin báo).
  if (vuaChotXong && gallery) {
    const coBia = (gallery.albumBia?.length ?? 0) > 0 ? albumThieuBia.length === 0 : null;
    // Tính lại tại chỗ (không dùng biến `hanMuc` — khai báo bên dưới điểm
    // này trong hàm, tới sau nhánh `if (loading)`).
    const hanMucChot = gallery.quotaKnown ? (gallery.includedQuota ?? 0) : null;
    // BB-310 mục 6 — dùng chung `tinhTenBiaTuDuLieu()` với bìa/đã giao/đầu
    // lưới, để không bao giờ lệch tên gọi giữa các màn.
    const tenBeChot = tinhTenBiaTuDuLieu(gallery.babyNickname, gallery.babyFullName);
    return (
      <CamOnSauChot
        tenBe={tenBeChot || null}
        trangThai={gallery.status}
        giaiDoan={gallery.giaiDoanTienDo ?? null}
        chotLuc={chotLuc ?? new Date()}
        soTamDaChon={selectionCounts.selectedCount}
        hanMuc={hanMucChot}
        coBia={coBia}
        soMonMuaThem={demMon(gallery.addons?.items ?? [])}
        tienMuaThem={gallery.addons?.totalAmount ?? 0}
        onXemTienDo={() => {
          setVuaChotXong(false);
          setCuonToiHanhTrinhSauCamOn(true);
        }}
        // BB-351 — studio xác nhận (tín hiệu tức thì đã tải lại `gallery`) → chữ đổi ngay.
        studioDaXacNhan={gallery.status !== "submitted" && gallery.status !== "in_review"}
      />
    );
  }

  // BB-212 — màn đang tải, đổi sang ngôn ngữ "cuốn album kỷ niệm": nền kem
  // (`bg-background` bên trong `.giao-dien-khach`), chữ mực, không còn nền
  // trắng lạnh của khung quản trị.
  if (loading) {
    return (
      // BB-293 — `data-testid` riêng cho ĐÚNG màn "Đang tải…" TOÀN TRANG này
      // (khác các chữ "Đang tải…" cục bộ khác trong app — chuông thông báo,
      // báo cáo quản trị…) để e2e đo chính xác, không lẫn.
      <div
        data-testid="man-dang-tai-toan-trang"
        className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 bg-background p-6 text-foreground"
      >
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

  // BB-212 — màn lỗi / link hết hạn / không tìm thấy, cùng ngôn ngữ mới.
  if (error || !gallery) {
    // BB-258 — chủ studio 26/09/2026: link KHÔNG TỒN TẠI (khác LINK_EXPIRED)
    // trước dùng tạm tranh "chua-co-anh" (hành trình xử lý ảnh — sai ngữ
    // cảnh, gallery còn chưa từng tồn tại thì không có "hành trình" nào cả).
    // Nay có tranh riêng "khung ảnh trống" (`public/minh-hoa/khong-tim-thay`,
    // ngang 16:9) đúng nghĩa hơn. LINK_EXPIRED giữ nguyên tranh đồng hồ cát
    // "link-het-han" — nay cũng đã có bản ngang trong `CO_BAN_NGANG`.
    const laHetHan = error?.code === "LINK_EXPIRED";
    const anhLoi = laHetHan
      ? anhHanhTrinh("link-het-han")
      : { src: "/minh-hoa/khong-tim-thay-1280.webp", srcSet: "/minh-hoa/khong-tim-thay-640.webp 640w, /minh-hoa/khong-tim-thay-1280.webp 1280w" };
    return (
      <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center bg-background p-6 text-center text-foreground">
        <div className="relative mb-6 h-[120px] w-full max-w-[280px] overflow-hidden rounded-[16px] bg-[#fdfbf9] md:h-[150px]">
          {/* Đồng hồ cát chỉ cho link HẾT HẠN; link không có thật thì nói
              "hết hạn" bằng hình là sai (Opus soát BB-225). */}
          <img
            src={anhLoi.src}
            srcSet={anhLoi.srcSet}
            sizes="280px"
            alt=""
            loading="lazy"
            width={1280}
            height={720}
            className="absolute inset-0 h-full w-full object-cover object-center animate-in fade-in duration-300 motion-reduce:animate-none"
          />
        </div>
        <h1 className="font-display text-2xl font-light">
          {error?.code === "LINK_EXPIRED" ? vi.gallery.expiredTitle : vi.gallery.notFoundTitle}
        </h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          {error?.message || vi.gallery.notFoundBody}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="h-11 rounded-full border border-border px-6 text-sm font-medium transition hover:bg-surface-2"
        >
          {vi.common.retry}
        </button>
      </div>
    );
  }

  const hanMuc = gallery.quotaKnown ? (gallery.includedQuota ?? 0) : null;

  /*
    Link nào được làm gì — CÙNG luật với máy chủ (EDITING_ROLES, SUBMIT_ROLES
    trong lib/auth/gallery-session). Máy chủ vẫn là chỗ chặn thật; ở đây chỉ
    để không bày ra nút mà bấm vào thì nhận lỗi.

    Trước 23/09/2026 link chỉ-xem vẫn thấy "Chốt danh sách", tim và "Mua
    thêm" — bấm là một cái 403 "không có quyền". Người cầm link chỉ-xem
    thường là ông bà: họ không biết vì sao, và nghĩ app hỏng.

    `myRole` thiếu (bản trả về cũ) thì coi như link chính — để không khoá nhầm
    ba mẹ; máy chủ vẫn chặn nếu sai.
  */
  const vaiTro = gallery.myRole ?? "owner";
  const duocChon = vaiTro === "owner" || vaiTro === "co_editor" || vaiTro === "suggester";
  const duocChot = vaiTro === "owner";
  const khoaTim = isLocked || !duocChon;
  // BB-287 mục #7 — báo cáo chấm: bấm liền vài tim thì "Đã chọn" (đọc từ
  // `selectionCounts`, cập nhật lạc quan theo TỪNG cú bấm) và "Chưa chọn"
  // (trước đây tự đếm lại `photos.filter(mark==="selected")`) là HAI PHÉP
  // ĐẾM ĐỘC LẬP — ảnh vừa thả tim cập nhật `mark` ở một chỗ, cập nhật
  // `selectionCounts` ở chỗ khác, không cùng lúc với mọi thao tác đang xếp
  // hàng (hàng chờ ngoại tuyến, rollback lỗi mạng…). Trừ thẳng từ
  // `selectionCounts.selectedCount` — CÙNG MỘT NGUỒN với thanh chọn và bìa —
  // để "Tất cả"/"Đã chọn"/"Chưa chọn" luôn cộng đúng lại thành tổng số ảnh.
  const soChuaChon = photos.length - selectionCounts.selectedCount;
  // BB-310 mục 6/7 — NGUỒN DUY NHẤT cho tên gọi bé ở màn khách (bìa, đầu
  // lưới; "cảm ơn"/"đã giao" tính riêng ở nhánh return sớm của chúng vì
  // `gallery` chưa chắc còn giữ tham chiếu này lúc đó). Chỉ đạo admin
  // 28/09/2026: còn nickname thì dùng nguyên nickname (qua `tenGoiBe`); mất
  // nickname thì bìa in NGUYÊN HỌ TÊN ĐẦY ĐỦ (không rút gọn, không thêm
  // "Bé ") — `bia-bo-anh.tsx` tự co cỡ chữ theo độ dài (`coChuTieuDeBia`).
  const tenBeHienThi = tinhTenBiaTuDuLieu(gallery.babyNickname, gallery.babyFullName);
  const anhBia = gallery.coverPhotoId
    ? { id: gallery.coverPhotoId }
    : photos[0]
      ? { id: photos[0].id }
      : null;

  /** Từ ảnh bìa cuộn xuống đầu lưới — nút "Bắt đầu chọn ảnh". */
  const cuonToiLuoi = () =>
    document.getElementById("dau-luoi-anh")?.scrollIntoView({ behavior: "smooth", block: "start" });

  /*
    Nút chính của thanh đáy — cùng một câu hỏi "bước tiếp theo là gì" mà
    đầu trang cũ trả lời, nay chỉ trả lời ở MỘT chỗ.
  */
  // BB-317 K-g — hạn mức chưa biết: nút "Chốt danh sách" trông như bị khoá và
  // bấm ra đúng MỘT câu giải thích, không mở hộp chốt (chưa chọn được tấm nào).
  const chotBiChan = !isLocked && !gallery.quotaKnown;
  const nutChinh = !duocChot
    ? null
    : !isLocked
    ? {
        nhan: vi.gallery.submitCta,
        onClick: () => (chotBiChan ? setStatusMessage(CAU_CHUA_CO_HAN_MUC) : setShowSubmitModal(true)),
      }
    : daChotChoXacNhan
      ? // Đã chốt, CSKH chưa xác nhận: mở lại là việc của chính ba mẹ.
        // BB-362 (vòng 9–10) — "Chọn thêm ảnh" đã là lối mua đợt 2 (trả tiền) sau khi
        // Bean xác nhận; ở đây là sửa lại danh sách trong gói, nên gọi đúng việc.
        { nhan: "Sửa danh sách", onClick: () => setMoKhoaChon(true) }
      : // Đã khoá thật: không sửa thẳng được, nhưng phải có ĐƯỜNG NÓI.
        // BB-312 — đang có yêu cầu CHƯA XỬ LÝ thì nhãn nói rõ, tránh cảm
        // giác "bấm gửi yêu cầu mới" khi thật ra chỉ có chỗ xem lại trạng
        // thái (hộp thoại tự ẩn ô viết/nút gửi khi đang chờ, xem bên dưới).
        gallery.reopenRequest?.trangThai === "cho_xu_ly"
          ? { nhan: `Đã gửi yêu cầu · lần ${gallery.reopenRequest.lanThu}`, onClick: () => setXinSuaLai(true) }
          : { nhan: "Yêu cầu sửa lại", onClick: () => setXinSuaLai(true) };

  /*
    BB-258 — chủ studio 26/09/2026: "Bộ ảnh đã được ghi nhận yêu cầu" hiện HAI
    LẦN liền nhau — tiêu đề thẻ hành trình (`the-hanh-trinh.tsx`) và khung
    trạng thái bên dưới (`review-panel.tsx`), cả hai cùng đọc `nhanTienDo`.
    Tính đúng LOGIC HIỆN/ẨN của thẻ hành trình ở đây (cùng điều kiện với bên
    trong `TheHanhTrinh`: trạng thái hậu-submit VÀ có tranh để vẽ) rồi truyền
    xuống `ReviewPanel` — khung đó bỏ câu trạng thái của riêng nó khi thẻ đã
    nói rồi, không cần đoán lại từ `gallery-app`.
  */
  const theHanhTrinhDangHien =
    !laNguoiXem &&
    ["submitted", "in_retouch", "awaiting_approval", "approved", "delivered"].includes(gallery.status) &&
    tranhHanhTrinh(gallery.status, gallery.giaiDoanTienDo ?? null, gallery.photoCount) != null;

  /*
    BB-321 — màn "Chọn thêm ảnh · Đợt N" THAY cả trang (không phải lớp phủ): lưới
    cuộn ảo theo cửa sổ (BB-131). Chỉ ba mẹ đứng tên (owner) chốt được đợt.
  */
  if (moManDot && dotChon.tt?.cheDoChonThem && dotChon.tt.coTheChot) {
    const taiLaiSauDot = () => {
      void loadGallery({ silent: true });
      void dotChon.taiLai();
    };
    const veTheDot = () =>
      requestAnimationFrame(() =>
        document.querySelector('[data-testid="chon-them-anh"]')?.scrollIntoView({ block: "center" }),
      );
    return (
      <>
        {statusMessage && (
          <div
            data-testid="thong-bao-trang-thai"
            className="fixed left-4 right-4 top-4 z-[60] mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-[#2a2420] p-4 text-[#fffdf9] shadow-lg"
          >
            <span className="text-sm">{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              aria-label={vi.common.close}
              className="px-2 py-1 text-sm opacity-70"
            >
              ✕
            </button>
          </div>
        )}
        <ManChonThemDot
          photos={photos}
          subfolders={gallery.subfolders}
          tenBe={tenBeHienThi || null}
          tenKhach={gallery.customerName ?? null}
          catalogue={gallery.addons?.catalogue ?? []}
          tt={dotChon.tt}
          nhap={dotChon.nhap}
          anhNhap={dotChon.anhNhap}
          setNhap={dotChon.setNhap}
          onDong={() => {
            setMoManDot(false);
            veTheDot();
          }}
          onDaChot={(soDot) => {
            setMoManDot(false);
            setStatusMessage(vi.gallery.loiBean.daNhanDot.replace("{n}", String(soDot)));
            taiLaiSauDot();
            veTheDot();
          }}
          onCanTaiLai={taiLaiSauDot}
        />
      </>
    );
  }

  const nutLoc = (loai: "all" | "selected" | "unselected" | "giaDinh", nhan: string, so: number) => (
    <button
      type="button"
      onClick={() => setFilter(loai)}
      aria-pressed={filter === loai}
      className={cn(
        // BB-319 — điện thoại 13px + `px-2.5` + khe 2: ba chip ("Tất cả 400 · Đã chọn 17 · Chưa chọn 383")
        // vừa MỘT hàng 342px, không chip nào cụt ở mép phải. Máy tính giữ 14px/`px-4`.
        "shrink-0 whitespace-nowrap rounded-full border border-[#2e2a27] px-2.5 py-1.5 text-[13px] transition-colors lg:px-4 lg:text-[14px]",
        filter === loai
          ? "bg-[#2e2a27] text-[#fdfbf9]"
          : "bg-[#fdfbf9] text-[#2e2a27] hover:bg-[#2e2a27]/5",
      )}
    >
      {nhan}
      <span className="ml-1 opacity-70">{formatSo(so)}</span>
    </button>
  );

  /** BB-319 (luật 1 + 5) — MỘT tên cho một món ở mọi chỗ (xem lớn, hộp chốt, cửa hàng): "Ảnh in UV 10×15". */
  const tenMonGio = (productId: string, ten: string) => {
    const sp = gallery.addons?.catalogue?.find((c) => c.productId === productId);
    return tenSanPhamChoKhach(sp ?? { name: ten });
  };

  /**
   * BB-319 K-S1 — các thẻ bán hàng ("Mua thêm/đặt in", "Mời ông bà"). Bộ chưa giao:
   * nằm trong dải thông báo trước lưới như cũ. Bộ ĐÃ GIAO: ba mẹ mở ra phải thấy
   * NGAY lưới ảnh hoàn thiện, nên các thẻ này dời xuống SAU lưới.
   */
  const dangGiao = gallery.status === "delivered";
  // BB-321 — thẻ "Chọn thêm ảnh" (trạng thái từng đợt + lối vào đợt mới). BB-323: đặt
  // thành biến để bộ ĐÃ GIAO dời nó xuống sau lưới như `theBanHang` (luật K-S1).
  const theDotChon = duocChon ? (
    <DotChonTrenManChinh
      tt={dotChon.tt}
      tenBe={tenBeHienThi || null}
      soAnhNhap={dotChon.anhNhap.length}
      soMonNhap={dotChon.nhap.gio.length}
      onMo={() => setMoManDot(true)}
    />
  ) : null;
  /*
    BB-330 — "Mời ông bà cùng xem" (BB-254) cho MỌI trạng thái của ba mẹ, cả
    điện thoại lẫn máy tính. Gate GIỐNG hệt route (`/api/g/moi-nguoi-than` chặn
    403 nếu phiên là viewer): `duocChon` đúng bằng "vaiTro !== 'viewer'".
  */
  const theMoiOngBa = duocChon ? <MoiNguoiThan /> : null;
  /*
    BB-355 — bản vẽ "Màn khách v8". (b) Vừa gửi, chờ Bean xác nhận: MỘT thẻ tiến độ
    gộp (tiêu đề · 5 bước · dòng phụ · hàng "Mời ông bà") thay bốn khối cũ đứng
    giữa chip và lưới (thẻ tiến độ có tranh, thẻ khoá, thẻ đợt chọn, khối mời).
    "Chọn thêm ảnh" đã là nút chính của thanh chọn; cửa hàng vào bằng nút túi.
    (a) Đang chọn: "Mời ông bà" là nút viền thứ hai trên bìa — không còn khối
    nào giữa chip và hàng ảnh đầu.
  */
  const theGop = gallery.status === "submitted" && !laNguoiXem;
  const nutMoiTrenBia =
    duocChon && !dangGiao && !theGop ? <MoiNguoiThan kieu="nut-bia" /> : undefined;
  /*
    BB-355 (c) — người được mời: thẻ "Link này để xem ảnh cùng gia đình" + thẻ mời
    mua (nút đen "Xem thêm") từng chen giữa chip và lưới. Câu giải thích đã lên
    bìa; màn mua mở từ nút túi ở thanh đáy (`ThanhDatChinhSua`). Biến này chỉ còn
    là màn mua (và thẻ "đã gửi yêu cầu" nếu có), đặt SAU lưới.
  */
  const theBanHangCu = (
    <>
    {/* BB-321 — thẻ "Mời mua lần hai" của ba mẹ đã NGHỈ, thay bằng mua theo đợt (DotChonTrenManChinh). */}

    {/*
      BB-254 — "Mời ông bà cùng xem" từng nằm ở đây. BB-330: dời ra thành
      khối riêng `theMoiOngBa` (xem ngay dưới) — đứng trong `theBanHang` nó bị
      kẹt sau cổng "thông báo trạng thái" (chỉ dựng khi có review/khoá/chưa
      có hạn mức…), nên bộ ảnh đang chọn bình thường KHÔNG có thẻ mời, trên
      cả máy tính lẫn điện thoại.
    */}

    {!duocChon && (
      <div className="mt-10 space-y-3 empty:hidden">
        {/* BB-338 mục 2b — câu anh duyệt 01/10/2026 nay nằm trên bìa (`vi.gallery.loiBean.nguoiThanGiaiThich`). */}

        {/*
          BB-254 — ông bà XEM và MUA: gửi yêu cầu mua thêm không cần chờ
          ba mẹ duyệt xong (`moGate` thay cho luật `duocMoiMuaLanHai` chỉ
          dành cho ba mẹ). Route `/api/g/mua-them` tự kiểm lại đúng luật
          này theo `session.role === "viewer"` — không tin giao diện.
        */}
        <MoiMuaLanHai
          status={gallery.status}
          soVongSua={0}
          moGate={dangMoChoKhachXem(gallery.status)}
          batBuocNguoiMua
          tieuDe="Đặt in ảnh này / Mua thêm"
          moTa="Gia đình chọn sản phẩm, để lại tên và số điện thoại, Bean sẽ gọi báo giá ạ."
          anhThich={[...timNguoiXem]}
          danhMuc={(gallery.addons?.catalogue ?? []).map((sp) => ({
            productId: sp.productId,
            name: sp.name,
            material: sp.material,
            size: sp.size,
            unitPrice: sp.unitPrice,
            nhom: sp.nhom as NhomSanPham,
            canGanAnh: sp.canGanAnh,
          }))}
          anhDaChon={photos.map((p) => ({ id: p.id, fileName: p.fileName }))}
          moNgoai={moMuaNguoiXem}
          onDoiMo={setMoMuaNguoiXem}
        />
      </div>
    )}

    </>
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-28 text-foreground">
      {/* Thông báo trạng thái */}
      {statusMessage && (
        <div
          data-testid="thong-bao-trang-thai"
          style={{ top: thongBaoTop }}
          className="fixed left-6 right-6 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-[#2a2420] p-4 text-[#fffdf9] shadow-lg animate-in fade-in slide-in-from-top-4"
        >
          <div className="flex min-w-0 items-start gap-2 text-sm">
            <Info className="mt-0.5 h-5 w-5 shrink-0 opacity-80" />
            <div className="min-w-0">
              <span data-testid="thong-bao-trang-thai-chu" className="text-pretty">{giuA(statusMessage)}</span>
              {/* BB-319 K-D2 — chưa biết hạn mức thì có ngay MỘT hành động: nhắn studio (xuống dòng riêng, không ép chữ). */}
              {statusMessage.startsWith(CAU_CHUA_CO_HAN_MUC) && gallery?.branch.chatUrl && (
                <a
                  data-testid="thong-bao-nhan-studio"
                  href={gallery.branch.chatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2.5 flex h-9 w-fit items-center rounded-full border border-[#fffdf9]/40 px-4 text-[13px] font-medium text-[#fffdf9] hover:bg-[#fffdf9]/10"
                >
                  {vi.gallery.messageStudio}
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            aria-label={vi.common.close}
            className="px-2 py-1 text-sm opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/*
        BB-278 — thanh thương hiệu ĐẦU TRANG, đứng NGOÀI ảnh bìa (không phải
        lớp phủ đè lên ảnh): chủ studio 27/09/2026 "để phía trên như bản
        trước không đưa xuống dưới". Đây là phần tử ĐẦU TIÊN của trang — nằm
        trong luồng bình thường (KHÔNG `sticky`) nên "Baby Bean" hiện ngay khi
        mở trang (chưa cuộn), cả điện thoại lẫn máy tính. Nền riêng (không
        phải overlay trong suốt) nên không phụ thuộc độ sáng ảnh bìa như chữ
        trong bìa. Không dùng `sticky`: từng thử dính lại khi cuộn, nhưng cộng
        dồn với `#dau-luoi-anh` (cũng sticky ngay dưới) chiếm vĩnh viễn ~44px
        đầu màn — ở bộ ảnh ngắn, cuộn tới đáy thì thẻ ảnh CUỐI rơi đúng vào dải
        đó và bị che (bb-274/bb-275 bắt được: "Xem ảnh N"/"Chọn ảnh này" bị
        che bởi thanh thương hiệu).

        BB-281 — dựng đúng bản vẽ `babybean-assets/BB-281/thanh-chon-*.png`:
        điện thoại "BABY BEAN" CĂN GIỮA cỡ 20px, máy tính chữ nằm TRÁI cỡ
        18px. Lưới 3 cột (`grid-cols-[1fr_auto_1fr]`) — cột 1 là Ô GIỮ CHỖ
        rỗng cùng bề rộng linh hoạt với cột 3 (cụm biểu tượng), nên tên
        thương hiệu ở cột giữa canh ĐÚNG GIỮA MÀN HÌNH bất kể cụm biểu tượng
        rộng bao nhiêu — không phải đoán bằng margin tay. Từ lg chuyển hẳn
        sang flex trái-phải (cột giữ chỗ ẩn đi) vì bản vẽ máy tính không căn
        giữa.

        Chuông thông báo VÀ hai việc phụ ("Nhắn cho studio", tải ảnh) đều dồn
        về đây — quyết định điều hành 27/09/2026: điện thoại từng có HAI
        thanh đầu trang chồng nhau (thanh thương hiệu + thanh dính lặp tên bộ
        ảnh + hai nút to). Nay thanh dính bên dưới (`#dau-luoi-anh`) chỉ còn
        hàng chip lọc; "Nhắn cho studio" thu thành biểu tượng nhỏ (giữ
        `aria-label`, không mất chức năng) đứng cạnh nút tải và chuông.
      */}
      {/*
        BB-298 — `phanTrenBiaRef` bọc đúng hai khối đứng TRÊN bìa điện thoại
        (thanh thương hiệu + chip Lưu app) để đo chiều cao THẬT bằng
        `ResizeObserver` (xem ghi chú lớn ở khai báo `phanTrenBiaRef` phía
        trên) — không phải một `<div>` trang trí, chỉ để đo.
      */}
      <div ref={phanTrenBiaRef}>
      <div
        ref={thanhThuongHieuRef}
        data-testid="thanh-thuong-hieu"
        className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-[#e5dcd2] bg-[#fdfbf9] px-3.5 py-3.5 sm:px-6 lg:flex lg:justify-between lg:px-10 lg:py-3"
      >
        {/*
          Opus soát lần 2 (27/09/2026) — `1fr` cùng ĐƠN VỊ nhưng KHÔNG cùng
          "sàn tối thiểu": mặc định một cột `1fr` không thể co dưới bề rộng
          NỘI DUNG của nó (`min-width: auto`), nên khi cụm 3 nút bên phải rộng
          hơn cột trống bên trái, cột phải bị "kéo" rộng thêm để vừa nội
          dung — lấy mất phần lẽ ra chia đều, đẩy chữ lệch trái (đo được tâm
          chữ ~170px/390 thay vì 195px). `minmax(0,1fr)` bỏ sàn tối thiểu đó
          — hai cột luôn chia đúng-đều phần còn lại, không phụ thuộc cột phải
          rộng bao nhiêu. Đo lại bằng `tests/e2e/bb-278-dau-trang-bia.spec.ts`
          (|tâm chữ − 195| ≤ 4px ở 390×844).
        */}
        {/*
          Opus soát lần 3 — chữ căn giữa THẬT + ba biểu tượng bên phải không
          đủ chỗ ở 390px (nhắn tin đè chữ "BEAN"). Điện thoại: nhắn tin sang
          ô TRÁI cho cân, bên phải còn tải + chuông. Máy tính: về cụm phải.
        */}
        <div className="flex items-center justify-self-start lg:hidden">
          {/* BB-334B (anh chốt Q4 ★) — trên link gia đình, góc trái là nút về trang gia đình
              thay biểu tượng chat; chat vẫn có ở bìa (BiaBoAnh) và đầu trang máy tính. */}
          {giaDinh ? (
            <Link
              href={duongDanNha(giaDinh.ma)}
              aria-label={vi.gallery.giaDinh.veTrangGiaDinh}
              title={vi.gallery.giaDinh.veTrangGiaDinh}
              data-testid="nut-ve-gia-dinh"
              className="grid h-10 w-10 place-items-center rounded-full text-foreground transition hover:bg-surface-2"
            >
              <LayoutGrid className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </Link>
          ) : gallery.branch.chatUrl && (
            <a
              href={gallery.branch.chatUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={vi.gallery.messageStudio}
              title={vi.gallery.messageStudio}
              className="grid h-10 w-10 place-items-center rounded-full text-foreground transition hover:bg-surface-2"
            >
              <MessageCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </a>
          )}
        </div>
        {giaDinh && (
          <Link
            href={duongDanNha(giaDinh.ma)}
            data-testid="nut-ve-gia-dinh-may-tinh"
            className="hidden items-center gap-2 text-[15px] font-medium text-foreground transition hover:opacity-80 lg:inline-flex lg:w-[200px]"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.5} aria-hidden="true" />
            {vi.gallery.giaDinh.albumGiaDinh}
          </Link>
        )}
        {/*
          BB-306 — logo hạt đậu đứng TRƯỚC chữ, căn giữa dọc theo chữ
          (`items-center`). `data-testid="ten-thuong-hieu"` VÀ `justify-self-center`
          dời từ chữ sang khối bọc này — bb-278 đo bounding box của đúng
          testid này để kiểm căn giữa màn hình, nay đo cả logo+chữ như MỘT
          cụm thương hiệu, không phải căn giữa riêng chữ nữa (logo cố định
          gắn liền chữ là thay đổi thiết kế có chủ đích, không phải hồi quy).
        */}
        {(() => {
          // BB-370 — cụm thương hiệu dùng chung với khung xem trước bìa (quản trị).
          const thuongHieu = <ThuongHieuBoAnh />;
          if (!giaDinh) return thuongHieu;
          // BB-334B (bản vẽ 03/04) — tên bộ đang mở ngay dưới logo, bấm để đổi buổi chụp.
          const boDangMo = giaDinh.boAnh.find((b) => b.id === giaDinh.boHienTaiId);
          return (
            <div className="flex min-w-0 flex-col items-center justify-self-center">
              {thuongHieu}
              <button
                type="button"
                data-testid="nut-doi-buoi-chup"
                aria-haspopup="dialog"
                aria-expanded={moChuyenBo}
                aria-label={vi.gallery.giaDinh.doiBuoiChup}
                onClick={() => setMoChuyenBo((v) => !v)}
                className="mt-1 inline-flex max-w-[220px] items-center gap-1 rounded-full px-2 py-0.5 text-[13px] font-medium text-[#2e2a27] transition hover:bg-surface-2 lg:mt-1.5 lg:max-w-[320px] lg:bg-[#f3ede6] lg:px-3 lg:py-1"
              >
                <span className="truncate">{boDangMo ? tenBoHienThi(boDangMo) : vi.gallery.giaDinh.doiBuoiChup}</span>
                <ChevronDown
                  className={cn("h-4 w-4 shrink-0 transition-transform", moChuyenBo && "rotate-180")}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            </div>
          );
        })()}
        <div className="flex items-center justify-self-end gap-1">
          {/*
            BB-281 — "Nhắn cho studio" thu thành biểu tượng (trước là pill có
            chữ) để vừa chỗ cạnh chuông trên điện thoại; `aria-label` giữ
            đúng nghĩa cũ, hành vi (mở link chat của chi nhánh) không đổi.

            Opus soát lần 2 — bản vẽ chỉ có biểu tượng nét MẢNH, KHÔNG viền/
            không nền (ba nút viền tròn trước đó nặng, không khớp). Bỏ
            `border`/nền mặc định, giữ vùng chạm ≥40px (`h-10 w-10`) và
            `hover:bg-surface-2` làm phản hồi khi bấm — không phải viền tĩnh.
          */}
          {gallery.branch.chatUrl && (
            <a
              href={gallery.branch.chatUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={vi.gallery.messageStudio}
              title={vi.gallery.messageStudio}
              className="hidden h-10 w-10 place-items-center rounded-full text-foreground transition hover:bg-surface-2 lg:grid"
            >
              <MessageCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </a>
          )}
          {choPhepTai && photos.length > 0 && (
            <MenuTaiAnh
              soAnh={photos.length}
              dungLuong={doDocDuocDungLuong(gallery.tongDungLuongAnh)}
              soDaChon={soAnhDaChon}
              onTaiDaChon={taiAnhDaChon}
              onTaiCaBo={taiCaBo}
            />
          )}
          <ChuongThongBao galleryId={gallery.id} status={gallery.status} />
        </div>
      </div>

      {/*
        BB-278/BB-281 — lời gợi ý "Lưu app" dời từ thẻ nổi ở ĐÁY (che thanh
        chọn/chốt sau khi thanh đó thu nhỏ — ảnh chụp máy thật chủ studio gửi
        27/09/2026) sang một chip nhỏ MỘT DÒNG ngay dưới thanh thương hiệu.
        Không `fixed` nên không bao giờ chồng lên `ThanhChon` ở đáy — tách
        biệt bằng vị trí trong trang, xem ghi chú ở `loi-goi-y-luu-app.tsx`.
      */}
      {/*
        BB-298 — bản vẽ bìa máy tính (`bia-may-tinh-tap-chi.html`, admin
        duyệt 28/09/2026) không có chip này ở đầu trang — nửa phải của bìa
        chia đôi đã đủ đầy (tên, lời chào, thông tin, nút, dải ảnh), thêm chip
        "Lưu ra màn hình chính" phía trên nữa là thừa. Điện thoại GIỮ NGUYÊN
        (chip vẫn đúng chỗ, đúng lý do — xem `loi-goi-y-luu-app.tsx`).
      */}
      </div>

      {/* MÀN 1 — ẢNH BÌA (tràn toàn màn, xem BB-258) */}
      <div
        ref={biaRef}
        style={{ ["--bb-phan-tren-bia" as string]: `${phanTrenBiaCao}px` }}
      >
        <BiaBoAnh
          anhBia={anhBia}
          coverHeadline={gallery.coverHeadline ?? null}
          tenBe={tenBeHienThi || null}
          sessionType={gallery.sessionType}
          ngayChup={gallery.shootDate}
          chiNhanh={gallery.branch.name}
          loiChao={gallery.welcomeMessage}
          soAnh={photos.length || gallery.photoCount}
          // BB-353 mục 5 — người thân được mời không chọn ảnh vào gói: không bày hạn mức/hạn chọn.
          hanMuc={laNguoiXem ? null : hanMuc}
          daChon={selectionCounts.selectedCount}
          hanChot={laNguoiXem ? null : gallery.dueAt}
          khoa={isLocked}
          chatUrl={gallery.branch.chatUrl}
          // BB-298 — dải "Vài khoảnh khắc trong bộ" ở chân bìa máy tính, 4 tấm
          // đầu tiên đã tải (không gọi thêm API riêng cho dải này).
          anhXemTruoc={photos.slice(0, 4)}
          choPhepTai={choPhepTai}
          onTaiCaBo={taiCaBo}
          ngayGiao={gallery.review?.deliveredAt ?? null}
          trangThai={gallery.status}
          giaiDoanTienDo={gallery.giaiDoanTienDo ?? null}
          laNguoiXem={laNguoiXem}
          nutMoiOngBa={nutMoiTrenBia}
          onBatDau={cuonToiLuoi}
        />
      </div>

      {/*
        BB-317 K-b — chip "Lưu ra màn hình chính" (điện thoại) rời khỏi vùng
        bìa: nằm NGAY DƯỚI dải kem của bìa, không còn dính mép trên ảnh. Ảnh bìa
        sạch, chip vẫn hiện đúng chỗ, đúng lý do (xem `loi-goi-y-luu-app.tsx`).
      */}
      {/* BB-319 K-S1 — bộ đã giao: KHÔNG hiện viên "Lưu ra màn hình chính" chen trước lưới ảnh hoàn thiện. */}
      {!dangGiao && (
        <div className="flex justify-center bg-[#fdfbf9] px-6 pb-4 empty:hidden lg:hidden">
          <LoiGoiYLuuApp
            daChon={selectionCounts.selectedCount}
            onXemCachLuu={() => setMoHuongDanLuuApp(true)}
            laNguoiXem={laNguoiXem}
          />
        </div>
      )}

      {/*
        BB-299 — ĐẦU LƯỚI GỘP: bản vẽ đã duyệt `babybean-assets/BB-297/html/
        luoi-may-tinh.html` + `luoi-dien-thoai.html` vẽ MỘT thanh dính duy
        nhất (logo, vạch, "tên bé · …", cụm chip lọc, So sánh NGAY SAU cụm
        chip, tin nhắn/chuông ở bên phải) — không còn hai thanh tách rời
        (thương hiệu không dính phía trên + chip dính `#dau-luoi-anh` phía
        dưới, kiểu BB-278/281 cũ).

        GIỮ NGUYÊN `id="dau-luoi-anh"` VÀ VỊ TRÍ (ngay sau ảnh bìa): rất
        nhiều chỗ phụ thuộc đúng điểm neo này để "cuộn qua khỏi bìa" —
        `cuonToiLuoi()` (nút "Bắt đầu chọn ảnh" ở bìa) VÀ hơn chục tệp phép
        thử e2e (`bb-166`, `bb-202`, `bb-240`, `bb-246`, `bb-248`, `bb-258`,
        `bb-275`, `bb-279`, `bb-287`, `bb-289`, `bb-293`, `bb-295`, `bb-296`…)
        gọi `scrollIntoView` trên chính id này. Dời hẳn thanh lên TRƯỚC ảnh
        bìa (đúng nghĩa đen "một thanh dính từ đầu trang") sẽ biến mọi lệnh
        cuộn đó thành vô tác dụng (phần tử đã nằm sẵn trong khung nhìn) —
        gãy cả nút "Bắt đầu chọn ảnh" lẫn hàng loạt phép thử ngoài phạm vi
        BB-299. Nên "gộp" ở đây nghĩa là: NỘI DUNG của thanh thương hiệu
        (logo, tên) được thêm vào bên trong `#dau-luoi-anh`, còn thanh
        thương hiệu không-dính phía trên bìa (`thanh-thuong-hieu`, hiện
        NGAY khi mở trang — chủ studio 27/09/2026 "để phía trên như bản
        trước") GIỮ NGUYÊN không đổi. Vì thanh đó không `sticky`, nó luôn
        cuộn khuất khi tới lưới — không bao giờ chồng lên `#dau-luoi-anh`,
        nên không tái phát lỗi "hai thanh dính chồng nhau che thẻ ảnh cuối"
        của BB-278 (ở đây CHỈ CÓ MỘT phần tử `sticky` trên trang).

        Testid "ten-thuong-hieu-dinh"/không gắn testid cho bản sao logo/tin
        nhắn bên trong thanh này — CỐ Ý khác `data-testid="ten-thuong-hieu"`
        của thanh thương hiệu phía trên, để `getByTestId("ten-thuong-hieu")`
        (bb-278) không bao giờ khớp hai phần tử cùng lúc (Playwright strict
        mode). `data-testid="nhan-studio-dinh"` CHỈ đặt ở bản điện thoại
        (hàng 1 bên dưới) vì `bb-289-theo-ban-ve.spec.ts` dò đúng testid này
        ở khổ 390×844 sau khi cuộn — đặt thêm ở bản máy tính sẽ khớp hai
        phần tử cùng lúc và vỡ đúng phép thử đó.
      */}
      <header
        id="dau-luoi-anh"
        className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-md"
      >
        {/*
          BB-289 lượt 3 — Opus: chế độ so sánh cần "thanh đầu riêng", đúng
          bản vẽ `so-sanh-dien-thoai.html` (`.dau`): câu lệnh rõ ràng + nút
          Huỷ. Đặt trên hàng chip lọc (không THAY hàng chip — chip lọc và
          nhắn/chuông dính vẫn cần dùng được trong lúc so sánh, gỡ chúng ra
          rủi ro hồi quy các phép thử BB-217/218 hiện có) — bù đúng phần còn
          thiếu: một câu chỉ dẫn + Huỷ đứng riêng một hàng.
        */}
        {soSanhBat && (
          <div
            data-testid="thanh-dau-so-sanh"
            className="border-b border-border/70 bg-background px-6 py-3 lg:px-10"
          >
            <div className="mx-auto flex max-w-[1600px] items-center justify-between">
              <span className="font-medium text-[14px] text-foreground">
                Chọn 2–4 tấm để so sánh
              </span>
              <button type="button" onClick={huySoSanh} className="text-[14px] text-muted-foreground hover:text-foreground">
                Huỷ
              </button>
            </div>
            <p className="mx-auto mt-1 max-w-[1600px] text-[12px] text-muted-foreground">
              {vi.gallery.loiBean.soSanhHuongDan}
            </p>
          </div>
        )}

        {/*
          Hàng 1 — CHỈ điện thoại (bản vẽ `luoi-dien-thoai.html` .dau1): logo
          căn giữa THẬT bằng lưới 3 cột (giữ đúng thủ thuật `minmax` mà Opus
          đã soát ở thanh thương hiệu phía trên — cột trái/phải cùng 44px
          cố định nên không cần `minmax(0,1fr)` ở đây), tin nhắn trái/chuông
          phải. Máy tính gộp thẳng vào MỘT hàng duy nhất bên dưới, ẩn hàng
          này (`lg:hidden`).
        */}
        {/* BB-319 — hai cột bên 88px: bên phải thêm nút So sánh (biểu tượng) cạnh chuông, để hàng
            chip lọc bên dưới vừa MỘT hàng 390px, không còn chip "Chưa chọn…" bị cắt ở mép phải. */}
        <div className="grid h-14 grid-cols-[88px_1fr_88px] items-center border-b border-[#e5dcd2] pl-3 pr-3.5 lg:hidden">
          {/* BB-361 — thanh thương hiệu còn thấy thì chat + chuông ở hàng này ẨN (giữ chỗ để logo vẫn căn giữa). */}
          <div
            data-testid="bieu-tuong-hang-dinh-trai"
            className={cn("flex items-center justify-self-start", dauTrangConThay && "invisible")}
          >
            {giaDinh ? (
              <Link
                href={duongDanNha(giaDinh.ma)}
                aria-label={vi.gallery.giaDinh.veTrangGiaDinh}
                title={vi.gallery.giaDinh.veTrangGiaDinh}
                className="grid h-11 w-11 place-items-center rounded-full text-foreground transition hover:bg-surface-2"
              >
                <LayoutGrid className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </Link>
            ) : gallery.branch.chatUrl && (
              <a
                href={gallery.branch.chatUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={vi.gallery.messageStudio}
                title={vi.gallery.messageStudio}
                data-testid="nhan-studio-dinh"
                className="grid h-11 w-11 place-items-center rounded-full text-foreground transition hover:bg-surface-2"
              >
                <MessageCircle className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </a>
            )}
          </div>
          {/* BB-306 — logo hạt đậu trước chữ, testid dời sang khối bọc (xem ghi chú ở thanh-thuong-hieu phía trên).
              BB-317 (Cảm xúc) — tên bé đứng NGAY DƯỚI logo, chữ nhỏ Be Vietnam Pro (nội dung; Playfair chỉ
              cho logo/tên lớn): thanh dính điện thoại gọi tên bé như bản máy tính, không chen vào hàng logo. */}
          <div className="flex min-w-0 flex-col items-center justify-self-center">
            <span
              data-testid="ten-thuong-hieu-dinh"
              className="inline-flex items-center gap-[6px]"
            >
              <img
                data-testid="logo-hat-dau"
                src="/brand/logo-hat-dau-64.png"
                alt=""
                aria-hidden="true"
                className="h-[18px] w-[18px] shrink-0"
              />
              <span className="font-display text-[16px] uppercase tracking-[0.2em] text-[#2e2a27]">
                Baby Bean
              </span>
            </span>
            {giaDinh ? (
              <button
                type="button"
                onClick={() => setMoChuyenBo(true)}
                aria-haspopup="dialog"
                aria-label={vi.gallery.giaDinh.doiBuoiChup}
                className="mt-0.5 inline-flex max-w-[190px] items-center gap-0.5 text-[12px] leading-none text-muted-foreground"
              >
                <span className="truncate">
                  {(() => {
                    const b = giaDinh.boAnh.find((x) => x.id === giaDinh.boHienTaiId);
                    return b ? tenBoHienThi(b) : tenBeHienThi;
                  })()}
                </span>
                <ChevronDown className="h-3 w-3 shrink-0" strokeWidth={1.5} aria-hidden="true" />
              </button>
            ) : tenBeHienThi && (
              <span
                data-testid="ten-be-thanh-dinh"
                className="mt-0.5 max-w-[190px] truncate text-[12px] leading-none text-muted-foreground"
              >
                {tenBeHienThi}
              </span>
            )}
          </div>
          <div className="flex items-center justify-self-end">
            <button
              type="button"
              onClick={() => (soSanhBat ? huySoSanh() : setSoSanhBat(true))}
              aria-pressed={soSanhBat}
              aria-label="So sánh"
              title="So sánh"
              className={cn(
                "grid h-10 w-10 place-items-center rounded-full transition",
                soSanhBat ? "bg-foreground text-background" : "text-foreground hover:bg-surface-2",
              )}
            >
              <Columns2 className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
            </button>
            <span data-testid="chuong-hang-dinh" className={cn("contents", dauTrangConThay && "[&>*]:invisible")}>
              <ChuongThongBao galleryId={gallery.id} status={gallery.status} />
            </span>
          </div>
        </div>

        <div className="mx-auto max-w-[1600px] px-6 lg:px-10">
          <nav
            aria-label="Lọc ảnh"
            className="flex items-center gap-3 overflow-x-auto pt-3 pb-4 lg:h-14 lg:gap-0 lg:overflow-visible lg:py-0"
          >
            {/*
              Máy tính — MỘT hàng duy nhất (bản vẽ `luoi-may-tinh.html`
              .dau): logo, vạch, "tên bé", rồi mới tới cụm chip lọc (đẩy
              sang phải 40px `lg:ml-10` đúng số đo chú thích bản vẽ). Điện
              thoại đã có logo ở hàng 1 phía trên nên ẩn ở đây.
            */}
            {/*
              BB-306 — cụm logo+chữ máy tính CHỈ dựng khi `hienLogoDinhMayTinh`
              (đã cuộn qua hẳn bìa) — xem ghi chú lớn ở khai báo state. Vạch
              ngăn đi kèm (chỉ ngăn logo với tên bé, không có gì để ngăn khi
              logo chưa hiện) nên gộp cùng điều kiện, không tách riêng.
            */}
            {hienLogoDinhMayTinh && (
              <>
                <span
                  data-testid="ten-thuong-hieu-dinh"
                  className="hidden shrink-0 items-center gap-[6px] lg:inline-flex"
                >
                  <img
                    data-testid="logo-hat-dau"
                    src="/brand/logo-hat-dau-64.png"
                    alt=""
                    aria-hidden="true"
                    className="h-[18px] w-[18px] shrink-0"
                  />
                  <span className="font-display text-[16px] uppercase tracking-[0.12em] text-[#2e2a27]">
                    Baby Bean
                  </span>
                </span>
                <span className="mx-5 hidden h-5 w-px shrink-0 bg-[#e5dcd2] lg:inline-block" aria-hidden="true" />
              </>
            )}
            {/*
              BB-299 — không có trường "loại buổi chụp" riêng trong dữ liệu
              (`GalleryApiResponse` chỉ có `babyName`/`title` nội bộ quản
              trị) — theo LUẬT-DOT-8 "không có trường thì ẩn, ghi vào bàn
              giao": chỉ hiện tên bé, dùng lại đúng câu dự phòng đã duyệt ở
              bìa (`bia-bo-anh.tsx`) khi thiếu tên, không bịa thêm "loại
              buổi chụp".
            */}
            <span className="hidden shrink-0 whitespace-nowrap text-[13px] text-muted-foreground lg:inline">
              {tenBeHienThi || "Khoảnh khắc của con"}
            </span>

            <div className="flex shrink-0 items-center gap-2 lg:ml-10 lg:gap-3">
              {/*
                BB-293 mục #12: chế độ "chọn để so sánh" ẩn hàng chip lọc (ba mẹ đang CHỌN, không LỌC).
                BB-295 mục #15: bộ ảnh đã khoá thì ẩn "Đã chọn/Chưa chọn", giữ "Tất cả".
              */}
              {!soSanhBat && (
                <>
                  {nutLoc("all", vi.gallery.filterAll, photos.length)}
                  {laNguoiXem
                    ? timNguoiXem.size > 0 && nutLoc("selected", "Gia đình thích", timNguoiXem.size)
                    : !isLocked && nutLoc("selected", vi.gallery.filterSelected, selectionCounts.selectedCount)}
                  {!laNguoiXem && !isLocked && nutLoc("unselected", vi.gallery.filterUnselected, soChuaChon)}
                  {/* BB-345 — ba mẹ thấy tấm gia đình (link mời) thích; không tự thêm vào gói. */}
                  {!laNguoiXem && giaDinhThich.size > 0 && nutLoc("giaDinh", "Gia đình thích", giaDinhThich.size)}
                  {photosLoading && <Spinner className="mb-2.5 h-4 w-4 shrink-0 text-muted-foreground lg:mb-0" />}
                </>
              )}
            </div>

            {/* Vạch ngăn CHỈ máy tính — bản vẽ: "So sánh liền cụm chip". */}
            <span className="mx-3 hidden h-5 w-px shrink-0 bg-[#e5dcd2] lg:inline-block" aria-hidden="true" />

            {/*
              BB-218 — bật/tắt chế độ "chọn để so sánh". Điện thoại: đẩy về
              mép phải như bản vẽ cũ (`ml-auto`, tin nhắn/chuông không còn ở
              hàng này nên So sánh là phần tử cuối). Máy tính: đứng NGAY SAU
              cụm chip (`lg:ml-0`, bản vẽ "So sánh liền cụm chip" — trước
              đây `ml-auto` đẩy nó ra tít mép phải cùng tin nhắn/chuông,
              đúng lỗi báo cáo chấm BB-299 mục 1).
            */}
            <button
              type="button"
              onClick={() => (soSanhBat ? huySoSanh() : setSoSanhBat(true))}
              aria-pressed={soSanhBat}
              className={cn(
                // BB-319 — điện thoại: So sánh là biểu tượng ở hàng 1 phía trên; ở đây chỉ máy tính.
                "mb-2.5 ml-auto hidden shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors lg:mb-0 lg:ml-0 lg:flex",
                soSanhBat
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              So sánh
            </button>

            {/*
              Tin nhắn + chuông — CHỈ máy tính ở đây (`hidden lg:flex`, đẩy
              hẳn về mép phải bằng `lg:ml-auto`). Điện thoại đã có hai biểu
              tượng này ở hàng 1 phía trên (cùng một `#dau-luoi-anh` dính),
              không lặp lại ở hàng chip — bản vẽ điện thoại (`.dau2`) không
              có tin nhắn/chuông trong hàng chip.
            */}
            {/* BB-358 (A7) — đầu trang (có chat + chuông) còn thấy thì dải chip không lặp bộ thứ hai. */}
            <div
              data-testid="bieu-tuong-dai-chip"
              className={cn("hidden shrink-0 items-center gap-0.5 lg:ml-auto", hienLogoDinhMayTinh && "lg:flex")}
            >
              {gallery.branch.chatUrl && (
                <a
                  href={gallery.branch.chatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={vi.gallery.messageStudio}
                  title={vi.gallery.messageStudio}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-foreground transition hover:bg-surface-2"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                </a>
              )}
              <ChuongThongBao galleryId={gallery.id} status={gallery.status} />
            </div>
          </nav>

          {/*
            BB-293 mục #12 — báo cáo chấm độc lập: bỏ câu "Chọn quá nhiều
            ảnh…" — cùng với hàng chip lọc đã ẩn ở trên, câu gợi ý lọc theo
            "Đã chọn" không còn chỗ đứng hợp lý (chip lọc nó trỏ tới đang bị
            ẩn), và ba dòng chỉ dẫn chồng nhau là đúng thứ report chê rối.
          */}

          {/*
            BB-180 — nhóm ảnh (thư mục con trong Drive), thành thẻ bấm được.
            Chỉ hiện khi có từ HAI nhóm: một thẻ "Quân JPG 300" duy nhất không
            lọc được gì, chỉ thêm chữ.
          */}
          {gallery.subfolders.length > 1 && (
            <div
              aria-label={vi.gallery.subfolderTitle}
              className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-3 sm:mx-0 sm:px-0"
            >
              {["", ...gallery.subfolders].map((folder) => (
                <button
                  key={folder || "tat-ca"}
                  type="button"
                  onClick={() => setSelectedSubfolder(folder)}
                  aria-pressed={selectedSubfolder === folder}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs transition-colors",
                    selectedSubfolder === folder
                      ? "bg-foreground text-background"
                      : "border border-border hover:bg-surface-2",
                  )}
                >
                  {folder || vi.gallery.subfolderAll}
                  <span className="ml-1.5 opacity-60">
                    {folder ? (demTheoNhom.get(folder) ?? 0) : photos.length}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      {/* BB-319 K-S1 — đã giao thì thẻ hành trình không hiện (BB-298): bỏ luôn khối bọc để không
          còn 20px trống giữa hàng chip và lưới ảnh. Các trạng thái khác giữ nguyên (nút "Xem tiến độ"
          ở màn Cảm ơn cuộn tới đúng khối này). */}
      {/* BB-355 — người được mời (c): chip → LƯỚI NGAY, không thẻ tiến độ. (b) thẻ gộp rộng
          bằng lưới trên máy tính (lề 40), chip → thẻ 16, thẻ → ảnh 16 (đt) / 24 (mt). */}
      {!dangGiao && !laNguoiXem && (
        <div
          id="the-hanh-trinh"
          className={
            theGop
              ? "mx-auto max-w-[1600px] px-6 pb-2 pt-4 lg:px-10 lg:pb-0 lg:pt-6"
              : "mx-auto max-w-3xl px-6 pt-5 empty:hidden"
          }
        >
          <TheHanhTrinh
            status={gallery.status}
            giaiDoan={gallery.giaiDoanTienDo ?? null}
            nhanTienDo={gallery.nhanTienDo}
            photoCount={gallery.photoCount}
            gop={
              theGop
                ? {
                    dongPhu: daChotChoXacNhan ? vi.gallery.loiBean.vanChonThemDuoc : null,
                    moiOngBa: duocChon ? <MoiNguoiThan kieu="hang" /> : null,
                  }
                : null
            }
          />
        </div>
      )}

      {/*
        BB-258 — chủ studio 26/09/2026: bỏ dòng "Bật thông báo để biết ngay
        khi ảnh chỉnh xong" đang lơ lửng mép trái. CHỈ gỡ chỗ GẮN ở đây — một
        Sonnet khác đang làm chuông thông báo góc phải thay thế, Opus sẽ gắn
        lúc gộp. Component `bat-thong-bao.tsx` và `src/lib/thong-bao/**`,
        `public/sw.js`, `src/app/api/g/thong-bao/**` GIỮ NGUYÊN, không đụng.
      */}

      {/* Thông báo trạng thái bộ ảnh — chỉ hiện khi có điều cần nói. */}
      {(gallery.review ||
        isLocked ||
        !gallery.quotaKnown ||
        !duocChon ||
        (gallery.reopenRequest && gallery.reopenRequest.trangThai !== "khong_co")) && (
        <div className="mx-auto max-w-3xl space-y-3 px-6 pt-5 empty:hidden">
          {/* BB-371 — CSKH đã gửi ảnh chỉnh trong app: ba mẹ xem, so trước/sau, duyệt
              hoặc xin sửa chi tiết NGAY TẠI ĐÂY (không mở Drive). */}
          {gallery.review && (gallery.review.soAnhChinhTrongApp ?? 0) > 0 && (
            <AnhChinhSuaKhach
              onDaQuyet={async ({ quyetDinh, lan }) => {
                setStatusMessage(
                  quyetDinh === "approve"
                    ? vi.gallery.loiBean.duyetChuyenIn
                    : vi.gallery.anhChinh.daNhan.replace("{n}", String(lan ?? 1)),
                );
                await loadGallery();
              }}
            />
          )}
          {gallery.review && !((gallery.review.soAnhChinhTrongApp ?? 0) > 0) && (
            <ReviewPanel
              status={gallery.status}
              nhanTienDo={gallery.nhanTienDo}
              coTheHanhTrinh={theHanhTrinhDangHien}
              review={gallery.review}
              hotline={gallery.branch.hotline}
              onDecide={decideReview}
            />
          )}

          {/* BB-312 — "đã gửi yêu cầu / studio đã mở lại / studio từ chối kèm
              lý do", cùng số lần đã xin. Đứng NGOÀI hộp thoại "Yêu cầu sửa
              lại" (form gửi yêu cầu MỚI) — dải này luôn hiện, kể cả sau khi
              bộ ảnh đã hết khoá (nút gửi yêu cầu biến mất, nhưng ba mẹ vẫn
              cần biết vừa xảy ra chuyện gì). */}
          <YeuCauMoLaiTrangThai
            reopenRequest={gallery.reopenRequest}
            hotline={gallery.branch.hotline}
            zaloOa={gallery.branch.zaloOa}
          />

          {/* BB-321 — bản vẽ `4-trang-thai-dot` anh duyệt: khối "Bộ ảnh đang ở chế độ
              xem lại" đứng TRÊN thẻ các đợt. */}
          {/*
            BB-310 mục 3 — báo cáo chấm độc lập vòng 4: màn Đã giao có 4 thẻ
            thừa đứng trước lưới ảnh, khác hẳn bố cục bản vẽ
            `babybean-assets/BB-297/da-giao-*.png` (bìa rồi thẳng xuống
            lưới). Thẻ này là một trong số đó: bìa (`bia-bo-anh.tsx`, nhánh
            "delivered") đã tự nói "Đã hoàn thiện", còn câu "Chọn thêm ảnh"
            bên dưới còn SAI hẳn — không còn sửa được sau khi đã giao.
          */}
          {/* BB-355 (b) — vừa gửi, chờ xác nhận: thẻ khoá trùng ý với thẻ tiến độ gộp, bỏ. */}
          {/* BB-358 — thẻ tiến trình đang hiện thì nó ĐÃ nói câu trạng thái (`trangThaiKhach`): bỏ dải khoá lặp nguyên văn. */}
          {isLocked && gallery.status !== "delivered" && !daChotChoXacNhan && !theHanhTrinhDangHien && (
            // BB-353 (P0) — dòng trạng thái đọc `trangThaiKhach()`, chung nguồn với bìa + thẻ tiến trình.
            <DaiKhoaTrangThai
              status={gallery.status}
              giaiDoan={gallery.giaiDoanTienDo ?? null}
              daChotChoXacNhan={daChotChoXacNhan}
            />
          )}


          {/* BB-321 — "Chọn thêm ảnh": từ khi studio xác nhận đợt 1, ba mẹ mua thêm
              ảnh/sản phẩm theo từng ĐỢT (có tiền, có xác nhận của CSKH). Thay thẻ
              "Mời mua lần hai" (BB-245) — không còn hai đường mua song song; ông bà
              (viewer) vẫn dùng thẻ mua hộ ở nhánh !duocChon bên dưới. MỘT thẻ đứng
              ngay dưới dải BB-312 (bản vẽ `4-trang-thai-dot`): trạng thái từng đợt
              + lối vào màn đợt mới. Tự ẩn khi máy chủ nói chưa tới giai đoạn này.
              BB-323 — bộ ĐÃ GIAO: thẻ này là thẻ bán hàng, theo luật K-S1 của BB-319
              (lưới ảnh hoàn thiện đứng ngay sau bìa) nó dời xuống SAU lưới cùng
              `theBanHang`; đứng ở đây nó đẩy tấm ảnh đầu xuống y≈1012 ở 390×844. */}
          {/* BB-355 (b) — chờ xác nhận: lối "Chọn thêm ảnh" là nút chính của thanh chọn. */}
          {!dangGiao && !daChotChoXacNhan && theDotChon}

          {/* Hạn mức CHƯA BIẾT (quotaKnown = false) */}
          {!gallery.quotaKnown && !isLocked && duocChon && (
            <div
              data-testid="the-chua-co-han-muc"
              className="flex items-center gap-3 rounded-2xl border border-[#e7cf9f] bg-[#fbf3e2] p-4 text-[#5c4413]"
            >
              <AlertTriangle className="h-[18px] w-[18px] shrink-0" />
              {/* BB-317 K-g — MỘT câu, không kèm "liên hệ CSKH" (studio tự báo lại). */}
              <p className="min-w-0 flex-1 text-pretty text-sm font-medium">{giuA(CAU_CHUA_CO_HAN_MUC)}</p>
              {gallery.branch.chatUrl && (
                <a
                  data-testid="the-han-muc-nhan-studio"
                  href={gallery.branch.chatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-9 shrink-0 items-center rounded-full border border-[#5c4413]/40 px-4 text-[13px] font-medium hover:bg-[#5c4413]/10"
                >
                  {vi.gallery.messageStudio}
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* BB-355 — khối "Mời ông bà" giữa chip và lưới đã gỡ: lối vào nằm trên bìa (a) hoặc
          trong thẻ tiến độ gộp (b); BB-330 (mọi trạng thái của ba mẹ đều mời được) vẫn giữ. */}

      {/* BB-359 — bộ cũ đã thu gọn danh sách: một dòng nhẹ trong lúc Đồng bộ lại ở nền. */}
      {dangMoLaiAnh && (
        <p
          role="status"
          data-testid="dang-mo-lai-anh"
          className="mx-auto max-w-[1600px] px-6 pt-4 text-center text-sm text-muted-foreground lg:px-10"
        >
          {gallery?.myRole === "owner" ? vi.gallery.dangMoLaiAnh : vi.gallery.dangMoLaiAnhGiaDinh}
        </p>
      )}

      {/* MÀN 2 — LƯỚI ẢNH so le, giữ đúng khung */}
      <section
        aria-label="Ảnh của buổi chụp"
        // BB-319 (luật 2) — lưới ảnh có lề RIÊNG theo một token: 8 px điện thoại (bản vẽ
        // `luoi-dien-thoai.html`: "lề 8, khe 4"), 40 px máy tính = lề trang. Nội dung chữ: 24/40 px.
        className="mx-auto max-w-[1600px] px-2 pt-2 lg:px-10 lg:pt-6"
      >
        {filteredPhotos.length === 0 ? (
          <div className="mx-auto my-12 max-w-md rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">{vi.gallery.emptyFilter}</p>
          </div>
        ) : (
          <LuoiAnh
            photos={filteredPhotos}
            mutatingIds={mutatingIds}
            khoa={laNguoiXem ? false : khoaTim}
            soSanPhamTheoAnh={soSanPhamTheoAnh}
            soSanhBat={soSanhBat}
            soSanhTheoAnh={soSanhTheoAnh}
            onToggle={laNguoiXem ? doiTimNguoiXem : handleToggleHeart}
            onOpen={(idx) => {
              setLightboxDungDanhSachDay(false);
              setLightboxIndex(idx);
            }}
            onToggleSoSanh={onToggleSoSanh}
            giaDinhThich={laNguoiXem ? undefined : giaDinhThich}
            khongChinh={laNguoiXem ? undefined : tapAnhKhongChinh}
          />
        )}
      </section>
      {/* BB-345 — thanh "Gia đình đã thả tim N tấm · Đặt chỉnh sửa" của người được mời. */}
      {laNguoiXem && (
        <>
          {/* Thẻ "đã gửi yêu cầu mua" (nếu có) nằm SAU lưới; màn mua mở từ nút túi. */}
          <div className="mx-auto max-w-3xl px-6">{theBanHangCu}</div>
          <ThanhDatChinhSua
            an={thanhNoiAn}
            soTim={timNguoiXem.size}
            giaMoiAnh={gallery.extraPhotoPrice}
            chuaApMigration={timChuaAp0083}
            onMoMua={dangMoChoKhachXem(gallery.status) ? () => setMoMuaNguoiXem(true) : undefined}
          />
        </>
      )}

      {/* BB-319 K-S1 — bộ đã giao: thẻ bán hàng SAU lưới, cùng lề 24/40 px với các khối dưới. */}
      {dangGiao && (
        <div
          data-testid="the-ban-hang-sau-luoi"
          className="mx-auto mt-14 grid max-w-[1600px] gap-4 px-6 empty:hidden lg:grid-cols-2 lg:px-10"
        >
          {theDotChon}
          {theMoiOngBa}
        </div>
      )}

      {/*
        TRONG GÓI CỦA BA MẸ — CHỈ ĐỌC, chỉ điều ba mẹ dùng được. Nằm sau lưới
        vì đây là thông tin để đối chiếu, không phải việc phải làm trước; chỗ
        gán ảnh vào sản phẩm là màn xem ảnh lớn.

        BB-240 (2-3) — chủ studio 22/09/2026: khối "Thành phần hợp đồng /
        Edit file x15 / Tổng cộng 0 ₫" trước đây nằm ở đây là dữ liệu NỘI BỘ
        của hợp đồng — khách không dùng được, và "Tổng cộng 0 ₫" còn gây hiểu
        lầm là ba mẹ nợ tiền. `<ContractBreakdown>` bỏ khỏi màn khách (component
        vẫn còn trong `src/components/ui/contract-breakdown.tsx`, chưa dùng ở
        màn quản trị nào — không xoá tệp). Thay bằng đúng hai điều ba mẹ cần:
        hạn mức ảnh chỉnh (nếu CSKH đã nhập), và danh sách sản phẩm in có sẵn
        trong gói (đã có ở TomTatSanPhamIn).
      */}
      {/*
        BB-202 — "Chọn ảnh bìa album". Đặt TRƯỚC khối "Trong gói của ba mẹ":
        chọn bìa là việc BẮT BUỘC trước khi chốt, còn khối dưới chỉ là tra cứu.
      */}
      {/*
        BB-295 mục #22 — báo cáo chấm độc lập: khối này dùng `max-w-3xl`
        (768px, còn 736px sau padding) trong khi lưới ảnh/đầu trang dùng
        `max-w-[1600px]` — trên máy tính rộng khối trôi thành một cột hẹp
        căn giữa, lệch hẳn mép trái với mọi khối khác trên trang. Đổi về
        cùng bề rộng lưới trang; nội dung bên trong (thẻ, chữ) vẫn giữ được
        độ rộng đọc dễ vì `ChonBiaAlbum`/`TomTatSanPhamIn` tự xếp lưới ảnh
        nhiều cột, không phải một khối chữ dài tràn hết 1600px.
      */}
      {/*
        BB-296 mục #5 — báo cáo chấm độc lập lần 3: bộ ảnh ĐÃ GIAO vẫn hiện
        khối "chọn bìa album" + dòng đỏ "Chưa có tấm nào trong cuốn này" ở
        `TomTatSanPhamIn` bên dưới — ba mẹ đã nhận ảnh xong, không còn gì để
        chọn nữa, dòng đỏ chỉ gây hoang mang. Ẩn hẳn khối chọn bìa album khi
        đã khoá (`isLocked` đúng cho cả "đã chốt chờ CSKH" lẫn "đã giao" — cả
        hai đều không sửa thẳng được nữa, các nút bên trong vốn đã `disabled`
        khi khoá, ẩn nguyên khối gọn hơn là để một khối xám không bấm được).
      */}
      {/*
        BB-374 — suất "Ảnh album không chỉnh sửa": nói rõ ngay trên trang (giọng Bean) và đếm
        "x / N" RIÊNG, tách khỏi bộ đếm ảnh chỉnh sửa. Chọn tấm ở màn xem lớn (mục cùng tên).
      */}
      {soSuatKhongChinh > 0 && !laNguoiXem && gallery.myRole !== "suggester" && (
        <div className="mx-auto mt-4 w-full max-w-[1600px] px-4 sm:px-6">
          <div
            data-testid="the-album-khong-chinh"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#4F5B45]/[0.07] px-4 py-3 ring-1 ring-[#4F5B45]/20"
          >
            <p className="min-w-0 flex-1 text-pretty text-sm text-[#2E2A27]">
              {giuA(vi.gallery.loiBean.albumKhongChinhLoiMoi.replace("{n}", String(soSuatKhongChinh)))}
              <span className="block text-xs text-[#6b6057]">{vi.gallery.loiBean.albumKhongChinhHuongDan}</span>
            </p>
            <span
              data-testid="dem-the-album-khong-chinh"
              className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-semibold tabular-nums text-[#4F5B45] ring-1 ring-[#4F5B45]/25"
            >
              {anhKhongChinh.length}/{soSuatKhongChinh} tấm cho album
            </span>
          </div>
        </div>
      )}
      {albumTrongGoi.length > 0 && !isLocked && (
        <div className="mx-auto mt-14 max-w-[1600px] px-6 lg:px-10">
          <ChonBiaAlbum
            albums={gallery.albumBia ?? albumTrongGoi.map((a) => ({
              galleryItemId: a.galleryItemId,
              name: a.name,
              coverPhotoId: null,
              coverFileName: null,
            }))}
            anhDaThaTim={anhDaThaTimChoBia}
            coverPhotoIdBoAnh={gallery.coverPhotoId ?? null}
            khoa={isLocked}
            dangLuu={placing}
            onChonBia={chonBiaAlbum}
          />
        </div>
      )}

      {/* BB-370 mục 5b (anh 06/10) — khối "Trong gói của ba mẹ" ở chân trang không còn
          việc gì để làm khi bộ đã chốt (chỉ đọc, ba mẹ không đổi được) hoặc gói không có
          sản phẩm in (chỉ còn một câu hạn mức — đã có ở bìa "N tấm trong gói"): bỏ hẳn.
          Còn giữ khi bộ đang mở VÀ có sản phẩm in — đó là chỗ ba mẹ xếp ảnh vào album. */}
      {!isLocked && hangInTrongGoi.length > 0 && (
        <div id="trong-goi-cua-ba-me" className="mx-auto mt-14 max-w-[1600px] space-y-5 px-6 lg:px-10">
          <h2 className="kh-h2">Trong gói của ba mẹ</h2>
          {hanMuc != null && (
            <p className="text-sm text-muted-foreground">
              {vi.gallery.packageQuotaLine.replace("{n}", String(hanMuc))}
            </p>
          )}
          <TomTatSanPhamIn
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
            khoa={isLocked}
            onChonAnh={duocChon ? setMonDangChonAnh : undefined}
          />
        </div>
      )}

      <CuaHang
        donDaGui={gallery.selection.submittedAt != null}
        mo={moCuaHang}
        onDong={dongCuaHang}
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
        tatCaAnh={photos.map((p) => ({ id: p.id, fileName: p.fileName }))}
        // BB-319 (luật 5) — TRẢ promise (không bọc `void`): cửa hàng đợi lưu + tải lại
        // giỏ xong rồi mới báo "Đã thêm vào giỏ", và không báo gì khi lưu hỏng.
        onMua={(productId, soLuong, photoId) => datSoLuongMuaThem(productId, soLuong, photoId)}
        onMuaNhieu={(productId, soLuong, photoIds) => datNhieuAnhMuaThem(productId, soLuong, photoIds)}
        presetPhotoId={presetCuaHang?.photoId ?? null}
        presetNhom={presetCuaHang?.nhom ?? null}
        // BB-339 mục 4 — "Trong gói: x/y ảnh" + chọn ảnh cho món trong gói ngay tại cửa hàng.
        trongGoi={{
          hanMuc,
          daChon: selectionCounts.selectedCount,
          mon: hangInTrongGoi.map((sp) => ({
            galleryItemId: sp.galleryItemId,
            // BB-362 — một tên cho một món: "Ảnh in UV 10×15" như giỏ và xem lớn.
            name: tenDongTrongGoiChoKhach(sp.name, sp.nhom),
            quantity: sp.quantity,
            laAlbum: sp.nhom === "album",
            soAnh: demAnhTrongDongHang(sp.galleryItemId),
          })),
          onChonAnh: duocChon && !isLocked ? setMonDangChonAnh : undefined,
        }}
      />

      {/* BB-339 mục 3/4 — lưới chọn ảnh cho MỘT món trong gói (z-60, nổi trên cửa hàng). */}
      {(() => {
        const mon = monDangChonAnh ? hangInTrongGoi.find((sp) => sp.galleryItemId === monDangChonAnh) : null;
        if (!mon) return null;
        const daGan = placements.filter((pl) => pl.galleryItemId === mon.galleryItemId).map((pl) => pl.photoId);
        return (
          <ChonAnhNhieuTam
            key={mon.galleryItemId}
            mo
            onDong={() => setMonDangChonAnh(null)}
            tieuDe={`Ảnh cho ${tenKemSoLuong(mon.name, mon.quantity)}`}
            toiDa={mon.nhom === "album" ? undefined : mon.quantity}
            choXongKhiTrong={daGan.length > 0}
            anhDaThaTim={photos.filter((p) => p.mark === "selected").map((p) => ({ id: p.id, fileName: p.fileName }))}
            tatCaAnh={photos.map((p) => ({ id: p.id, fileName: p.fileName }))}
            daChonSan={daGan}
            dangLuu={false}
            onXacNhan={(photoIds) => {
              setMonDangChonAnh(null);
              void ganAnhChoMonTrongGoi(mon.galleryItemId, photoIds);
            }}
          />
        );
      })()}

      {/* BB-330 — nút tròn "Lên đầu trang", đứng trên thanh đáy (không che). */}
      <NutLenDauTrang />

      {/* THANH ĐÁY — một viên duy nhất: đã chọn mấy tấm, bước tiếp theo. */}
      {soSanhBat ? (
        /*
          BB-218 — thanh đáy đổi hẳn sang thanh so sánh khi chế độ này đang
          bật (không chồng lên ThanhChon): hai thanh cùng đáy màn hình cùng
          lúc là hai câu hỏi tranh nhau chỗ ngón cái, và "đang so sánh" với
          "bước tiếp theo của việc chốt ảnh" là hai việc khác nhau ba mẹ chỉ
          làm MỘT lúc.
        */
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-6 pb-[max(12px,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto flex h-[60px] max-w-xl items-center gap-1 rounded-full bg-[#2a2420] pl-4 pr-2 text-[#fffdf9] shadow-[0_14px_32px_-10px_rgba(27,23,20,.55)]">
            <button
              type="button"
              onClick={() => duSoSanh(dsSoSanh) && setMoSoSanh(true)}
              disabled={!duSoSanh(dsSoSanh)}
              className="min-w-0 flex-1 truncate text-left text-[14px] font-medium disabled:cursor-default disabled:opacity-70"
            >
              {duSoSanh(dsSoSanh)
                ? `Đã chọn ${dsSoSanh.length} tấm để so sánh · Xem`
                : `Chọn ít nhất 2 tấm để so sánh (đã chọn ${dsSoSanh.length})`}
            </button>
            <button
              type="button"
              onClick={huySoSanh}
              aria-label="Huỷ so sánh"
              title="Huỷ so sánh"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-white/80 transition hover:bg-white/10"
            >
              <XIcon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </button>
          </div>
        </div>
      ) : (
        /*
          BB-254 — ẩn HẲN thanh này với ông bà/người thân (viewer): nó hiện số
          tấm ba mẹ đã chọn và tiền phụ thu (`tienThem`) — đúng thứ chủ studio
          chốt "ông bà không thấy tiền hợp đồng/tiền phát sinh của ba mẹ".
          Tim của ông bà vốn đã không cộng vào `selectionCounts` (route chặn ở
          `EDITING_ROLES`), nhưng bản thân thanh này vẫn là CỦA BA MẸ.
        */
        // BB-310 mục 3 — báo cáo chấm độc lập vòng 4: màn Đã giao vẫn hiện
        // "Còn 5 · Yêu cầu sửa lại" ở đáy, sai cả hai vế sau khi đã giao
        // (không còn gì "còn thiếu" để chọn, và "Yêu cầu sửa lại" là luồng
        // của lúc duyệt ảnh chỉnh). Bản vẽ `da-giao-*.png` không có thanh
        // đáy — bỏ hẳn khi đã giao.
        duocChon && gallery.status !== "delivered" && (
        <ThanhChon
          an={thanhNoiAn}
          daChon={selectionCounts.selectedCount}
          hanMuc={hanMuc}
          soTamThem={gallery.quotaKnown ? selectionCounts.extraCount : 0}
          tienThem={gallery.quotaKnown ? selectionCounts.extraAmount : 0}
          nutChinh={nutChinh}
          muaThem={
            // BB-355 (b) — chờ xác nhận: cửa hàng vào bằng nút túi (thẻ đợt chọn đã gỡ).
            (gallery.addons?.catalogue?.length ?? 0) > 0 && (!isLocked || daChotChoXacNhan) && duocChon
              ? {
                  tien: gallery.addons?.totalAmount ?? 0,
                  // BB-299 mục 3 — bản vẽ `luoi-may-tinh.html`/`luoi-dien-thoai.html`
                  // vẽ huy hiệu túi là MỘT SỐ (đã có mấy món), không phải chấm
                  // tròn như bản cũ.
                  soMon: demMon(gallery.addons?.items ?? []),
                  onClick: () => setMoCuaHang(true),
                }
              : null
          }
          soChuaGui={hangChoTim.soChuaGui}
          nutChinhBiChan={chotBiChan}
        />
        )
      )}

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

          BB-240 (2-2) — hai sửa tiếp, 25/09/2026:
          1) `max-w-4xl` là MỘT max-width riêng khác hẳn bìa/đầu trang/lưới ảnh
             (đều `max-w-[1600px]`) — bốn khối bốn mép trái khác nhau trên máy
             tính rộng dù cùng "thụt vào". Đổi chân trang sang cùng
             `max-w-[1600px]` + cùng bậc lề (`lg:px-10`) như ba khối kia.
          2) Tên chi nhánh / địa chỉ / nút "Nhắn cho studio" trước xếp DỌC ở
             mọi bề rộng — trên máy tính rộng nhìn rời rạc, lệch hẳn sang trái
             trong khi phần bên phải màn hình trống trơn. `sm:flex-row` xếp
             chúng thành MỘT dải ngang (chi nhánh trái, nút phải); điện thoại
             (`flex-col` mặc định) giữ nguyên xếp dọc.
      */}
      <footer className="mt-16 border-t border-border text-sm">
        <div className="mx-auto max-w-[1600px] px-6 pt-6 pb-10 lg:px-10 lg:py-8">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {vi.gallery.studioInfo}
          </h2>
          {/* BB-370 mục 5b — máy tính: khối chi nhánh + nút nhắn GỌN trong một dải ~760px
              (trước đây tên chi nhánh sát trái, nút trôi tận mép phải 1600px). */}
          <div className="mt-3 flex flex-col gap-4 sm:max-w-[760px] sm:flex-row sm:items-center sm:justify-between sm:gap-10">
            <div className="space-y-1">
              {/* BB-305 — tên chi nhánh trong "Thông tin studio" là nội
                  dung, không phải H1/H2 của màn: bỏ font-display, dùng Be
                  Vietnam Pro. `data-testid` thay cho selector `p.font-display`
                  cũ (bb-240) vì lớp đó không còn gắn ở đây nữa. */}
              <p data-testid="chan-trang-ten-chi-nhanh" className="text-xl font-medium text-foreground">
                {gallery.branch.name}
              </p>
              {gallery.branch.address && <p className="text-muted-foreground">{gallery.branch.address}</p>}
              {gallery.branch.hotline && (
                <p>
                  <a
                    href={`tel:${gallery.branch.hotline.replace(/[^+\d]/g, "")}`}
                    className="font-medium text-foreground hover:underline"
                  >
                    {gallery.branch.hotline}
                  </a>
                  <span className="ml-1.5 text-muted-foreground opacity-70">— {vi.gallery.callUs}</span>
                </p>
              )}
              {/*
                BB-295 mục #24 — báo cáo chấm độc lập: "Thông tin studio" chỉ
                có tên chi nhánh + nút nhắn tin. Thêm Zalo OA — cột
                `branches.zalo_oa` ĐÃ có trong máy chủ (`route.ts` đã trả về
                `zaloOa`, chỉ chưa ai vẽ ra màn khách). Không bịa đường dẫn
                zalo.me: chuỗi lưu trong cột có thể là handle hoặc link tuỳ
                cách CSKH nhập, nên chỉ biến thành link khi RÕ RÀNG là URL.
                Trường trống thì ẩn hẳn dòng này.

                "Giờ mở cửa" và "địa chỉ ngắn" KHÔNG thêm được: `branches`
                không có cột giờ mở cửa, và không có cột địa chỉ rút gọn
                riêng — bịa số/chuỗi này là đúng điều đề bài cấm. Ghi vào bàn
                giao BB-295 để CSKH/ARCH quyết có mở cột mới không.
              */}
              {gallery.branch.zaloOa && (
                <p>
                  {/^https?:\/\//i.test(gallery.branch.zaloOa) ? (
                    <a
                      href={gallery.branch.zaloOa}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-foreground hover:underline"
                    >
                      Zalo: {gallery.branch.zaloOa}
                    </a>
                  ) : (
                    <span className="text-muted-foreground">Zalo: {gallery.branch.zaloOa}</span>
                  )}
                </p>
              )}
            </div>
            {/* BB-362 (vòng 10, K12) — thông báo "Bean đang cập nhật gói" đã mang nút
                "Nhắn Bean": lúc nó đang hiện, chân trang không lặp nút thứ hai. */}
            {gallery.branch.chatUrl && !(statusMessage?.startsWith(CAU_CHUA_CO_HAN_MUC) ?? false) && (
              <a
                data-testid="chan-trang-nhan-bean"
                href={gallery.branch.chatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-border px-5 font-medium text-foreground transition hover:bg-surface-2 sm:h-10"
              >
                {vi.gallery.messageStudio}
              </a>
            )}
          </div>

          {/*
            BB-289 lượt 2 — dựng nốt theo `chan-trang-khach.png`: câu kết +
            dòng bản quyền. KHÔNG thêm "giờ mở cửa": schema hiện không có
            trường lưu giờ mở cửa chi nhánh (`db/schema.sql` không có cột nào
            như vậy) — bịa số này là đúng thứ đề bài BB-289 cấm ("không có
            nguồn thật thì bỏ dòng đó, không bịa"). Khi nào `branches` có cột
            giờ mở cửa thật thì thêm lại đúng chỗ này.
          */}
          {/*
            BB-305 — câu kết "Cảm ơn ba mẹ…" là một đoạn văn (nội dung), không
            phải tiêu đề: bỏ font-display + italic, dùng Be Vietnam Pro mặc
            định theo LUẬT PHÔNG mới. Việc này cũng gỡ luôn khoản kiểm ngược
            BB-240 cũ (`footer.locator("p.font-display")` từng phải đếm ĐÚNG
            MỘT phần tử) vì giờ không còn `<p>` nào trong chân trang mang lớp
            đó — bài thử đã đổi sang `data-testid="chan-trang-ten-chi-nhanh"`
            cho tên chi nhánh, không phụ thuộc lớp phông nữa.
          */}
          <div className="mt-10 flex flex-col items-center gap-2 border-t border-border pt-8 text-center">
            {/*
              BB-292 vòng 2 — giám đốc chấm: `ngang-chan-trang` (tranh bàn
              rộng cắt còn một dải) làm vật trong tranh chỉ còn vài điểm ảnh,
              không đọc ra là gì. Cắt sát riêng bằng sharp từ
              `babybean-assets/BB-291/5-chan-trang.png` (vùng cành bạch đàn +
              tim, đệm ~15% quanh) → `chan-trang-vat-{160,320}.webp`. Tệp
              nguồn giữ nguyên, không sửa. Cao ~56px (< 120px cho phép), kèm
              `mix-blend-mode: multiply` + mặt nạ toả tròn (`layerMoVuong`)
              để tan vào nền `#fdfbf9` thay vì hiện thành khối kem tách biệt.
              `alt=""` vì trang trí, không mang thông tin.
            */}
            <img
              src="/minh-hoa/chan-trang-vat-320.webp"
              srcSet="/minh-hoa/chan-trang-vat-160.webp 160w, /minh-hoa/chan-trang-vat-320.webp 320w"
              sizes="82px"
              alt=""
              width={320}
              height={220}
              className="h-[56px] w-auto object-contain opacity-90"
              style={layerMoVuong}
            />
            <p className="text-lg text-foreground">Cảm ơn ba mẹ và các con đã yêu thương Bean ạ</p>
            {/* BB-338 mục 1 — anh: "Đổi thành Yours truly Bean". Lời ký của studio, Playfair không nghiêng. */}
            <p data-testid="loi-ky-bean" className="font-display text-[20px] font-normal not-italic text-foreground">
              Yours truly Bean
            </p>
            <p className="text-[11px] uppercase tracking-[0.06em] text-muted-foreground">
              © {new Date().getFullYear()} Baby Bean Studio
            </p>
          </div>
        </div>
      </footer>

      {/*
        BB-212 — làm lại theo ngôn ngữ "cuốn album kỷ niệm": tấm trượt từ dưới
        lên trên điện thoại, bảng giữa màn trên máy tính (từ `sm`). Nút chính
        viên tròn màu mực, nút phụ chỉ viền — cùng kiểu với ThanhChon/BiaBoAnh.
      */}
      {xinSuaLai && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2a2420]/55 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="w-full max-h-[88svh] overflow-y-auto rounded-t-[28px] bg-surface p-6 pb-[max(24px,env(safe-area-inset-bottom))] shadow-2xl animate-in slide-in-from-bottom duration-300 sm:max-w-md sm:rounded-3xl sm:p-7 sm:pb-7 sm:slide-in-from-bottom-4">
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border sm:hidden" aria-hidden="true" />
            <h3 className="kh-h2">Yêu cầu sửa lại</h3>

            {/*
              BB-312 — đang có một yêu cầu CHƯA XỬ LÝ: đây chỉ còn là chỗ XEM
              LẠI trạng thái, không phải form gửi mới (nút chính bên ngoài đã
              đổi nhãn "Đã gửi yêu cầu · lần N" cho khớp). Không cho gửi
              trùng — chỉ còn nút Đóng.
            */}
            {gallery.reopenRequest?.trangThai === "cho_xu_ly" ? (
              <>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Bean đã nhận yêu cầu và sẽ liên hệ ba mẹ sớm ạ.
                </p>
                <div className="mt-5 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => setXinSuaLai(false)}
                    className="h-11 rounded-full border border-border px-5 text-sm font-medium transition hover:bg-surface-2"
                  >
                    Đóng
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Bộ ảnh đã khoá chọn nên ba mẹ không tự sửa được nữa ạ. Ba mẹ ghi giúp
                  Bean muốn sửa gì, Bean sẽ báo lại ngay nhé ạ.
                </p>
                {/* BB-312 — vừa bị từ chối thì nhắc lại lý do ngay trong form
                    gửi lần mới, để ba mẹ không phải nhớ lại đã đọc ở đâu. */}
                {gallery.reopenRequest?.trangThai === "bi_tu_choi" && gallery.reopenRequest.lyDoTuChoi && (
                  <p className="mt-2 rounded-xl bg-[#fbf3e2] p-2.5 text-[13px] text-[#5c4413]">
                    Lần trước Bean phản hồi: {gallery.reopenRequest.lyDoTuChoi}
                  </p>
                )}
                <textarea
                  value={lyDoSuaLai}
                  onChange={(e) => setLyDoSuaLai(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Ví dụ: đổi tấm số 12 sang tấm số 15"
                  className="mt-4 h-24 w-full resize-none rounded-2xl border border-border bg-background p-3 text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
                <div className="mt-5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setXinSuaLai(false)}
                    disabled={dangXin}
                    className="h-11 rounded-full border border-border px-5 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-50"
                  >
                    {vi.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={() => void guiXinSuaLai()}
                    disabled={dangXin || lyDoSuaLai.trim().length === 0}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                  >
                    {dangXin && <Spinner className="h-4 w-4" />}
                    {vi.gallery.loiBean.guiChoBean}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/*
        BB-212 — HỘP "CHỐT DANH SÁCH", làm lại theo ngôn ngữ "cuốn album kỷ
        niệm". Tấm trượt từ dưới lên trên điện thoại, bảng giữa màn trên máy
        tính. Thứ tự chủ studio đặt ra 22/09/2026: tên người xác nhận (điền
        sẵn tên khách hàng), rồi TÓM TẮT (số ảnh, thiếu gì, dải ảnh đã chọn),
        rồi mới tới ô tích "đúng thông tin" — để ba mẹ tích SAU KHI đã đọc lại,
        không phải tích trước rồi mới thấy tóm tắt.
      */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2a2420]/55 backdrop-blur-xs sm:items-center sm:p-4">
          <div
            data-testid="hop-chot"
            className="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[28px] bg-background shadow-2xl animate-in slide-in-from-bottom duration-300 sm:max-w-lg sm:rounded-3xl sm:slide-in-from-bottom-4"
          >
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />

            {/* BB-319 — tiêu đề gọi tên bé đứng NGOÀI vùng cuộn: cuộn xuống tới nút Xác nhận
                (điện thoại) vẫn thấy mình đang chốt cho bé nào (K8 điện thoại từng mất tiêu đề). */}
            <div
              className={cn(
                "relative z-10 shrink-0 border-b px-6 pb-2 pt-4 transition-[border-color,box-shadow] sm:px-7 sm:pt-7",
                hopChotDaCuon
                  ? "border-border shadow-[0_8px_14px_-12px_rgba(46,42,39,0.35)]"
                  : "border-transparent",
              )}
            >
              <h3 className="kh-h2 text-balance">
                {tieuDeHopChot(tenBeHienThi) || vi.gallery.submitConfirmTitle}
              </h3>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-0 sm:px-7 sm:pb-6"
              onScroll={(e) => setHopChotDaCuon(e.currentTarget.scrollTop > 4)}
            >
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {vi.gallery.submitConfirm}
              </p>

              {/*
                Hai ô BẮT BUỘC — máy chủ đòi từ đầu. Xem ghi chú ở chỗ khai
                `tenXacNhan`: tên người xác nhận là tên khách hàng của bộ,
                điền sẵn nhưng vẫn sửa được (chủ studio 22/09/2026).
              */}
              <div className="mt-5">
                <label
                  htmlFor="confirm-name-input"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  {vi.gallery.parentName}
                </label>
                <input
                  id="confirm-name-input"
                  value={tenXacNhan}
                  onChange={(e) => setTenXacNhan(e.target.value)}
                  placeholder={vi.gallery.parentNamePlaceholder}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="mt-4">
                <label
                  htmlFor="customer-note-input"
                  className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground"
                >
                  Ghi chú chung cho Bean (nếu có)
                </label>
                <textarea
                  id="customer-note-input"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="Lời nhắn thêm cho thợ chỉnh sửa ạ…"
                  rows={3}
                  className="h-20 w-full resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* ---------------------------------------------------------
                  TÓM TẮT — số ảnh, thiếu gì, và dải ảnh đã chọn.
                  --------------------------------------------------------- */}
              <div className="mt-5 space-y-2.5 rounded-2xl bg-surface-2 p-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Số ảnh đã chọn</span>
                  <span className="font-semibold">{formatSo(selectionCounts.selectedCount)} tấm</span>
                </div>
                {gallery.quotaKnown && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Số ảnh trong gói</span>
                      <span>{gallery.includedQuota ?? 0} tấm</span>
                    </div>
                    {selectionCounts.extraCount > 0 && (
                      // BB-355 (bản vẽ v8 d) — chữ mực đậm, không hồng (hồng chỉ dành cho tim).
                      <div className="flex items-center justify-between text-[#2e2a27]">
                        <span>Số ảnh chọn thêm</span>
                        <span className="font-semibold">
                          {formatSo(selectionCounts.extraCount)} tấm · {formatCurrencyVND(selectionCounts.extraAmount)}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {(gallery.addons?.items?.length ?? 0) > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Mua thêm</span>
                    <span className="font-semibold">
                      {demMon(gallery.addons?.items ?? [])} món · {formatCurrencyVND(gallery.addons?.totalAmount ?? 0)}
                    </span>
                  </div>
                )}

                {/*
                  BB-289 — "Xem chi tiết" mở NGAY TRONG hộp chốt (bản vẽ
                  BB-285): lưới tấm đã chọn (dải ảnh phía dưới), ô bìa từng
                  album, từng món mua thêm kèm ảnh/số lượng/tiền/tổng.
                */}
                {((gallery.albumBia?.length ?? 0) > 0 || (gallery.addons?.items?.length ?? 0) > 0) && (
                  <button
                    type="button"
                    onClick={() => setXemChiTietHopChot((v) => !v)}
                    aria-expanded={xemChiTietHopChot}
                    data-testid="nut-xem-chi-tiet-hop-chot"
                    className="mt-1 text-xs font-medium text-foreground underline underline-offset-4"
                  >
                    {xemChiTietHopChot ? "Ẩn chi tiết" : "Xem chi tiết"}
                  </button>
                )}
              </div>

              {xemChiTietHopChot && (
                <div data-testid="chi-tiet-hop-chot" className="mt-3 space-y-4 rounded-2xl border border-border p-4 text-sm">
                  {(gallery.albumBia?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Bìa album
                      </p>
                      <ul className="space-y-2">
                        {(gallery.albumBia ?? []).map((al) => (
                          <li key={al.galleryItemId} className="flex items-center gap-2.5">
                            {al.coverPhotoId ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/img/${al.coverPhotoId}?w=200`}
                                alt=""
                                loading="lazy"
                                className="h-10 w-10 shrink-0 rounded-lg object-cover"
                              />
                            ) : (
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-[11px] text-muted-foreground">
                                Chưa chọn
                              </span>
                            )}
                            <span className="min-w-0 truncate">{al.name}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(gallery.addons?.items?.length ?? 0) > 0 && (
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Mua thêm
                      </p>
                      <ul data-testid="danh-sach-mua-them-hop-chot" className="space-y-2">
                        {(gallery.addons?.items ?? []).map((m) => (
                          <li key={m.id} className="flex items-center gap-2.5">
                            {m.photoId ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={`/api/img/${m.photoId}?w=200`}
                                alt=""
                                loading="lazy"
                                className="h-10 w-10 shrink-0 rounded-lg object-cover"
                              />
                            ) : (
                              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-surface-2 text-[11px] text-muted-foreground">
                                —
                              </span>
                            )}
                            <span className="min-w-0 flex-1 truncate">
                              {tenKemSoLuong(tenMonGio(m.productId, m.name), m.quantity)}
                            </span>
                            <span className="shrink-0 font-medium">{formatCurrencyVND(m.totalPrice)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2.5 flex items-center justify-between border-t border-border pt-2.5 font-semibold">
                        <span>Tổng mua thêm</span>
                        <span>{formatCurrencyVND(gallery.addons?.totalAmount ?? 0)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ----------------------------------------------------------------
                  BB-180 — NHẮC chọn ảnh phóng và bìa album, KHÔNG CHẶN
                  ----------------------------------------------------------------
                  Chủ studio chốt 17/09. Khách chốt thiếu thì CSKH phải gọi lại, và
                  có ca quên hẳn — việc này đang làm studio mất tiền.

                  Nhưng **không chặn nút Chốt**. Khách đang cầm điện thoại, đang bế
                  con; chặn là họ bỏ dở giữa chừng. Chỉ nói rõ cái được nếu chọn
                  luôn, rồi để họ tự quyết.
              */}
              {/*
                BB-202 — khác khối "nhắc, không chặn" ngay dưới đây: thiếu bìa
                album là CHẶN THẬT (chủ studio 26/09: "BẮT BUỘC chọn trước khi
                chốt"). Máy chủ cũng từ chối (409 CONFLICT) nếu lỡ bấm được,
                nhưng chặn ở đây trước để ba mẹ không mất công gõ tên rồi mới
                biết chưa xong.
              */}
              {/*
                BB-295 mục #6 — báo cáo chấm độc lập: hai hộp đỏ (chặn thiếu
                bìa + nhắc thiếu ảnh sản phẩm) cho cùng một album trông như
                hai lỗi khác nhau, đỏ gắt lấn át toàn hộp chốt. Gộp thành MỘT
                lời nhắc dịu màu kem (#F3E6DC theo `hop-chot-dien-thoai.png`)
                — chỉ một nút hành động "Chọn bìa ngay" cho việc THẬT SỰ chặn
                (thiếu bìa album); việc chỉ nhắc (thiếu ảnh sản phẩm) đứng
                chung khối nhưng không có nút riêng, không tô đỏ.
              */}
              {/*
                BB-317 K-e — MỘT luật cho MỖI sản phẩm, hai dòng riêng, đều gọi
                tên sản phẩm và ≤ 12 chữ: (1) bìa album là YÊU CẦU (nút Xác
                nhận khoá), (2) sản phẩm in thiếu ảnh chỉ là LỜI NHẮC. Câu 25
                chữ cũ ("chọn luôn thì… để sau cũng được, CSKH sẽ hỏi lại") bị
                bỏ vì đứng ngay dưới "để xác nhận" nghe như hai luật ngược nhau.
              */}
              {albumThieuBia.length > 0 && (
                <div
                  data-testid="loi-nhac-hop-chot"
                  className="mt-3 space-y-2 rounded-2xl bg-[#F3E6DC] p-3.5 text-xs text-[#2a2420]"
                >
                  {albumThieuBia.length > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <p data-testid="ly-do-khoa-nut-chot" className="font-medium">
                        {cauYeuCauBiaAlbum(albumThieuBia.map((a) => a.name))}
                      </p>
                      <button
                        type="button"
                        data-testid="nut-chon-bia-ngay"
                        onClick={() => {
                          setShowSubmitModal(false);
                          const dauTien = albumThieuBia[0];
                          if (dauTien) {
                            document
                              .getElementById(`chon-bia-album-${dauTien.galleryItemId}`)
                              ?.scrollIntoView({ behavior: "smooth", block: "center" });
                          }
                        }}
                        className="shrink-0 font-semibold underline underline-offset-4"
                      >
                        Chọn bìa ngay
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/*
                BB-321 — hai khối mới (chủ studio 29/09/2026, bản vẽ `5-hop-chot-dot1`
                anh duyệt). Cùng nền kem nhắc; mỗi khối MỘT ô tick BẮT BUỘC.
                  A. Chọn THIẾU so với hạn mức → "nhờ studio chọn giúp" + đồng ý.
                  B. Còn sản phẩm in chưa có ảnh → biết nhận ảnh chậm hơn. Khối này
                     THAY dòng nhắc cũ (BB-317 K-e) — một món không bị nhắc hai lần.
              */}
              {oTickDot1.canDongYStudioChon && (
                <div
                  data-testid="nhac-nho-studio-chon"
                  className="mt-3 rounded-2xl bg-[#F3E6DC] p-3.5 text-[13px] text-[#2a2420]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium">{cauConThieuTrongGoi(oTickDot1.soThieu)}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubmitModal(false);
                        setFilter("unselected");
                        cuonToiLuoi();
                      }}
                      className="shrink-0 font-semibold underline underline-offset-4"
                    >
                      Chọn tiếp
                    </button>
                  </div>
                  <label className="mt-2.5 flex items-start gap-2.5 leading-relaxed">
                    <Checkbox checked={dongYStudioChon} onCheckedChange={setDongYStudioChon} className="mt-0.5" />
                    <span>{dotChon.tt?.cauDongY?.studioChon ?? CAU_DONG_Y_STUDIO_CHON}</span>
                  </label>
                </div>
              )}

              {oTickDot1.canBietAnhInCham && (
                <div
                  data-testid="nhac-in-chua-anh"
                  className="mt-3 rounded-2xl bg-[#F3E6DC] p-3.5 text-[13px] text-[#2a2420]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 font-medium">
                      {dongInThieuAnh.length > 0 ? (
                        dongInThieuAnh.map((dong) => (
                          <p key={dong.galleryItemId} data-testid="nhac-thieu-anh-san-pham">
                            {vi.gallery.loiBean.spThieuAnh.replace("{ten}", formatKichThuoc(dong.name)).replace("{n}", String(dong.soThieu))}
                          </p>
                        ))
                      ) : (
                        // BB-358 — album thiếu bìa đã có dòng "chọn ảnh bìa" ngay trên: không đếm lần hai.
                        soMonInChuaAnhHienThi > 0 && (
                          <p data-testid="nhac-thieu-anh-san-pham" className="text-pretty">
                            {giuA(vi.gallery.loiBean.spInChuaCoAnh.replace("{n}", String(soMonInChuaAnhHienThi)))}
                          </p>
                        )
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowSubmitModal(false);
                        // BB-339 mục 3 — mở THẲNG lưới chọn ảnh của món đầu tiên còn
                        // thiếu (bấm vào ảnh là chọn được), không chỉ cuộn tới khối
                        // tóm tắt chỉ-đọc như trước.
                        const dau = dongInThieuAnh[0];
                        if (dau && !isLocked) {
                          setMonDangChonAnh(dau.galleryItemId);
                          return;
                        }
                        requestAnimationFrame(() =>
                          document
                            .getElementById("trong-goi-cua-ba-me")
                            ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                        );
                      }}
                      className="shrink-0 font-semibold underline underline-offset-4"
                    >
                      Chọn ảnh ngay
                    </button>
                  </div>
                  <label className="mt-2.5 flex items-start gap-2.5 leading-relaxed">
                    <Checkbox checked={bietAnhInChamDot1} onCheckedChange={setBietAnhInChamDot1} className="mt-0.5" />
                    <span>{giuCuoi(dotChon.tt?.cauDongY?.bietAnhInCham ?? CAU_BIET_ANH_IN_CHAM)}</span>
                  </label>
                </div>
              )}

              {anhDaChonHopThoai.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Ảnh đã chọn
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {anhDaChonHopThoai.slice(0, 40).map((a) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={a.id}
                        src={`/api/img/${a.id}?w=200`}
                        alt={a.fileName}
                        loading="lazy"
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    ))}
                    {anhDaChonHopThoai.length > 40 && (
                      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-surface-2 text-xs text-muted-foreground">
                        +{anhDaChonHopThoai.length - 40}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/*
                Ô tích — đặt SAU tóm tắt, để ba mẹ đọc lại rồi mới xác nhận.
                BB-295 mục #6 — báo cáo chấm: ô tích mặc định của trình duyệt
                (vuông xanh dương) lạc tông với hệ thiết kế; đổi sang
                `Checkbox` dùng chung (vuông bo góc, tích khi chọn là màu mực
                theo token `--bb-primary`).
              */}
              <label className="mt-5 flex items-start gap-2.5 text-sm leading-relaxed">
                <Checkbox
                  data-testid="o-xac-nhan-chot"
                  checked={dongY}
                  onCheckedChange={setDongY}
                  className="mt-0.5"
                />
                <span>{vi.gallery.submitAgree}</span>
              </label>

            </div>

            {/* BB-353 mục 4 — người chấm vòng 7 (K07-mt/K08-mt): ở 1440×900 hộp cao
                864px, hai nút Huỷ/Xác nhận nằm cuối vùng cuộn nên bị mép dưới hộp cắt
                nửa. Chân hộp nay đứng NGOÀI vùng cuộn (`shrink-0`), luôn hiện trọn;
                thân hộp `min-h-0 flex-1` cuộn bên trong `max-h` của hộp. */}
            <div
              data-testid="hop-chot-chan"
              className="flex shrink-0 flex-col items-end gap-2 border-t border-border bg-background px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-7 sm:pb-5"
            >
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={dongHopChot}
                    disabled={submitting}
                    className="h-11 rounded-full border border-border px-5 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-50"
                  >
                    {vi.common.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitSelection}
                    // Khoá nút khi chưa đủ hai ô: bấm rồi nhận "Dữ liệu không hợp
                    // lệ" thì ba mẹ không biết thiếu gì, và câu đó không nói ra.
                    // BB-202: thêm điều kiện thiếu bìa album — chặn THẬT, không
                    // chỉ nhắc (khác `sanPhamThieuAnh`).
                    disabled={
                      submitting ||
                      !daDocDot1 ||
                      tenXacNhan.trim().length === 0 ||
                      !dongY ||
                      albumThieuBia.length > 0 ||
                      !duTickDot1
                    }
                    data-da-doc-dot1={daDocDot1 ? "1" : "0"}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                  >
                    {submitting && <Spinner className="h-4 w-4" />}
                    {vi.common.confirm}
                  </button>
                </div>
                {/*
                  BB-295 mục #6 — bản vẽ `hop-chot-dien-thoai.png`: khi nút bị
                  khoá, lý do đứng NGAY DƯỚI nút thay vì im lặng. Chỉ một lý do
                  ưu tiên nhất (thiếu bìa album chặn thật; hai ô bắt buộc còn
                  lại chỉ hiện khi KHÔNG có lý do bìa, để không đọc hai câu
                  cùng lúc).
                */}
                {/* BB-317 K-e — lý do thiếu bìa đã nằm ở khối nhắc phía trên (một dòng, có tên
                    sản phẩm); không nhắc lần hai dưới nút. */}
                {!submitting && albumThieuBia.length === 0 && tenXacNhan.trim().length === 0 && (
                  <p data-testid="ly-do-khoa-nut-chot" className="text-xs text-muted-foreground">
                    {vi.gallery.loiBean.khoaChotThieuTen}
                  </p>
                )}
                {!submitting && albumThieuBia.length === 0 && tenXacNhan.trim().length > 0 && !duTickDot1 && (
                  <p data-testid="ly-do-khoa-nut-chot" className="text-xs text-muted-foreground">
                    {vi.gallery.loiBean.khoaChotThieuTick}
                  </p>
                )}
                {!submitting && albumThieuBia.length === 0 && tenXacNhan.trim().length > 0 && duTickDot1 && !dongY && (
                  <p data-testid="ly-do-khoa-nut-chot" className="text-xs text-muted-foreground">
                    {vi.gallery.loiBean.khoaChotThieuDongY}
                  </p>
                )}
            </div>
          </div>
        </div>
      )}

      {/* TẢI ẢNH VỀ MÁY — BB-156.
          Nút chọn tải nay ở đầu trang (MenuTaiAnh). Ở đây chỉ còn ô báo tiến độ
          khi đang tải nhiều tấm, nổi ngay trên thanh đáy chứ không đè lên nó.
          BB-330 — z-[60]: tải nhiều tấm từ màn xem lớn (z-50) thì ô tiến độ vẫn phải nổi lên trên. */}
      {choPhepTai && tienDoTai && tienDoTai.tong > 1 && (
        <div className="fixed inset-x-6 bottom-[84px] z-[60] mx-auto max-w-xl rounded-2xl border border-border bg-surface p-3 text-sm shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              Đang tải {formatSo(tienDoTai.daXong)} / {formatSo(tienDoTai.tong)} tấm
              {tienDoTai.dangTai ? ` · ${tienDoTai.dangTai}` : ""}
            </span>
            {tienDoTai.daXong < tienDoTai.tong && (
              <button
                type="button"
                onClick={() => { dungTaiRef.current = true; }}
                className="shrink-0 rounded-full border border-border px-3 py-1 text-xs"
              >
                Dừng
              </button>
            )}
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${Math.round((tienDoTai.daXong / tienDoTai.tong) * 100)}%` }}
            />
          </div>
          {tienDoTai.loi && (
            <p className={cn("mt-1.5 text-xs", tienDoTai.hetChoTrongMay ? "text-[var(--bb-danger)]" : "text-muted-foreground")}>
              {tienDoTai.loi}
            </p>
          )}
        </div>
      )}

      {/* MÀN XEM ẢNH LỚN (PhotoLightbox) — BB-143 */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          // BB-218: mở từ "So sánh với tấm khác" dùng danh sách ĐẦY ĐỦ vì
          // tấm đó có thể không nằm trong bộ lọc đang xem (xem khai báo
          // `lightboxDungDanhSachDay`).
          photos={lightboxDungDanhSachDay ? nguonAnh : filteredPhotos}
          initialIndex={lightboxIndex}
          tenBe={tenBeHienThi || null}
          onClose={dongXemLon}
          onToggleHeart={laNguoiXem ? doiTimNguoiXem : handleToggleHeart}
          onTaiAnh={choPhepTai ? (p) => taiMotAnh({ id: p.id, fileName: p.fileName }) : null}
          // BB-330 — nút tải ở màn xem lớn mở cùng thực đơn với màn ngoài.
          menuTai={
            choPhepTai
              ? {
                  soAnh: photos.length,
                  dungLuong: doDocDuocDungLuong(gallery.tongDungLuongAnh),
                  soDaChon: soAnhDaChon,
                  onTaiDaChon: taiAnhDaChon,
                  onTaiCaBo: taiCaBo,
                }
              : null
          }
          mutatingIds={mutatingIds}
          isLocked={laNguoiXem ? false : khoaTim}
          daChon={laNguoiXem ? timNguoiXem.size : soAnhDaChon}
          hanMuc={laNguoiXem ? null : gallery.quotaKnown ? (gallery.includedQuota ?? null) : null}
          onLuuGhiChu={laNguoiXem ? undefined : luuGhiChuAnh}
          onSoSanh={onSoSanhTuLightbox}
          dungCho={(anh) => {
            // Gộp đủ ba đường một tấm ảnh thành hàng — cùng ba nguồn với dấu
            // rêu trên lưới (`soSanPhamTheoAnh`), để hai chỗ không nói khác nhau.
            const nhan: string[] = [];
            for (const pl of placements) {
              if (pl.photoId !== anh.id) continue;
              const sp = hangInTrongGoi.find((h) => h.galleryItemId === pl.galleryItemId);
              if (sp) nhan.push(`${tenDongTrongGoiChoKhach(sp.name, sp.nhom)} · trong gói`);
            }
            for (const m of gallery.addons?.items ?? []) {
              if (m.photoId === anh.id) nhan.push(tenKemSoLuong(tenMonGio(m.productId, m.name), m.quantity));
            }
            for (const ap of gallery.albumPlacements ?? []) {
              if (ap.photoId !== anh.id) continue;
              const al = gallery.addons?.items?.find((m) => m.id === ap.addonId);
              if (al) nhan.push(tenMonGio(al.productId, al.name));
            }
            return nhan;
          }}
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
                    alt="Ưu đãi của Bean"
                    className="max-h-[70vh] w-full rounded-xl object-contain"
                  />
                </a>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={gallery.banner.imageUrl}
                  alt="Ưu đãi của Bean"
                  className="max-h-[70vh] w-full rounded-xl object-contain"
                />
              )
            ) : null
          }
          bangSanPham={laNguoiXem ? undefined : (anh, tong) => (
            <BangSanPhamCuaAnh
              tong={tong}
              anhDaChon={anh.mark === "selected"}
              // BB-374 — người thân gợi ý (suggester) không quyết ảnh in vào album (route chặn).
              albumKhongChinh={
                soSuatKhongChinh > 0 && gallery.myRole !== "suggester"
                  ? {
                      soSuat: soSuatKhongChinh,
                      daChon: anhKhongChinh.length,
                      coAnhNay: tapAnhKhongChinh.has(anh.id),
                      onDoi: (chon) => void doiAnhKhongChinh(anh.id, chon),
                    }
                  : undefined
              }
              khoa={isLocked}
              dangLuu={placing}
              suatTrongGoi={suatInTrongGoi.map((sp) => ({
                galleryItemId: sp.galleryItemId,
                name: tenDongTrongGoiChoKhach(sp.name, sp.nhom),
                quantity: sp.quantity,
                daDat: demAnhTrongDongHang(sp.galleryItemId),
                coAnhNay: placements.some(
                  (pl) => pl.galleryItemId === sp.galleryItemId && pl.photoId === anh.id,
                ),
              }))}
              albumTrongGoi={albumTrongGoi.map((sp) => ({
                galleryItemId: sp.galleryItemId,
                name: tenKemSoLuong(tenDongTrongGoiChoKhach(sp.name, sp.nhom), sp.quantity),
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
              donDaGui={gallery.selection.submittedAt != null}
              albumDaMua={(gallery.addons?.items ?? [])
                .filter((m) => !m.photoId)
                .map((m) => ({
                  addonId: m.id,
                  laAlbum:
                    (gallery.addons?.catalogue ?? []).find((c) => c.productId === m.productId)?.nhom === "album",
                  name: tenKemSoLuong(tenMonGio(m.productId, m.name), m.quantity),
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
              // BB-217 — chỉ hiện lối vào màn treo tường khi tấm đang xem đã
              // được chọn (đúng đề bài) và danh mục thật sự có ảnh in để treo.
              onXemTuong={
                anh.mark === "selected" &&
                (gallery.addons?.catalogue ?? []).some((sp) => sp.nhom === "anh_in")
                  ? () => setManTreoTuongTuAnh(anh.id)
                  : undefined
              }
              // BB-279 — "Đặt in tấm này": mở cửa hàng thẳng vào nhóm này với
              // tấm đang xem đã chọn sẵn (đường thứ hai vào cửa hàng).
              //
              // Đóng màn xem lớn TRƯỚC khi mở cửa hàng: cả hai đều là hộp
              // thoại toàn màn hình `z-50`, cùng bậc — nếu không đóng, màn
              // xem lớn (đứng sau trong cây DOM) vẽ ĐÈ LÊN cửa hàng, và nút
              // "Thêm vào giỏ" tuy có mặt trong DOM nhưng không bấm được (lộ
              // ra qua e2e: `locator.click` treo vì "subtree intercepts
              // pointer events" từ `<main>` của màn xem lớn).
              onDatInTamNay={(nhom) => {
                setLightboxIndex(null);
                setPresetCuaHang({ nhom, photoId: anh.id });
                setMoCuaHang(true);
              }}
            />
          )}
        />
      )}

      {/* MÀN SO SÁNH NHIỀU TẤM (BB-218) — 2–4 tấm cạnh nhau, bỏ bớt ngay tại chỗ. */}
      {moSoSanh && anhDangSoSanh.length >= SO_SANH_TOI_THIEU && (
        <SoSanhAnh
          photos={anhDangSoSanh}
          mutatingIds={mutatingIds}
          isLocked={khoaTim}
          onToggleHeart={handleToggleHeart}
          onBoKhoi={boKhoiManSoSanh}
          onDong={() => setMoSoSanh(false)}
          onPhongTo={onPhongToTuSoSanh}
          daChon={soAnhDaChon}
          hanMuc={gallery.quotaKnown ? (gallery.includedQuota ?? null) : null}
          // BB-242: chế độ "Ghim & vuốt" vuốt qua toàn bộ tấm đã thả tim khi
          // chỉ đánh dấu đúng 2 tấm so sánh — cần danh sách này để vẽ đúng.
          anhDaThaTim={anhDaChonHopThoai}
          // BB-370 — khung vuốt vẽ được cả tấm vừa bỏ tim ngay tại chỗ.
          tatCaAnh={photos}
        />
      )}

      {/* BB-217 — màn "treo ảnh của con lên tường", toàn màn hình. */}
      {manTreoTuongTuAnh && (
        <ManTreoTuong
          mo
          onDong={() => setManTreoTuongTuAnh(null)}
          anh={anhDaChonHopThoai.map((p) => ({
            id: p.id,
            fileName: p.fileName,
            width: p.width,
            height: p.height,
          }))}
          chiSoBanDau={Math.max(
            0,
            anhDaChonHopThoai.findIndex((p) => p.id === manTreoTuongTuAnh)
          )}
          danhMuc={(gallery.addons?.catalogue ?? [])
            .filter((sp) => sp.nhom === "anh_in" || sp.nhom === "khung")
            .map((sp) => ({
              productId: sp.productId,
              name: sp.name,
              material: sp.material,
              size: sp.size,
              unitPrice: sp.unitPrice,
              nhom: sp.nhom as NhomSanPham,
            }))}
          suatTrongGoi={suatInTrongGoi.map((sp) => ({
            galleryItemId: sp.galleryItemId,
            name: tenDongTrongGoiChoKhach(sp.name, sp.nhom),
            quantity: sp.quantity,
          }))}
          placements={placements}
          addonsDaDat={(gallery.addons?.items ?? []).map((m) => ({
            productId: m.productId,
            photoId: m.photoId ?? null,
            quantity: m.quantity,
          }))}
          khoa={isLocked}
          duocChon={duocChon}
          dangLuu={placing}
          onDatVaoGoi={(photoId, galleryItemId, dat) => changePlacement(photoId, galleryItemId, dat)}
          onDatMuaThem={(photoId, productId, soLuong) =>
            void datSoLuongMuaThem(productId, soLuong, photoId)
          }
        />
      )}

      {/*
        BB-213 — tấm hướng dẫn "Lưu app", mở từ chip BB-278/BB-281 ở đầu
        trang (`LoiGoiYLuuApp` nay render ngay dưới thanh thương hiệu, phía
        trên `biaRef` — không còn ở đây).
      */}
      <HuongDanThemManHinh mo={moHuongDanLuuApp} onDong={() => setMoHuongDanLuuApp(false)} laNguoiXem={laNguoiXem} />
      {giaDinh && <ChuyenBoAnh giaDinh={giaDinh} mo={moChuyenBo} onDong={() => setMoChuyenBo(false)} />}
    </div>
  );
}
