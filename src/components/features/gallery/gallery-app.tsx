"use client";

import { isGalleryLocked } from "@/lib/gallery-status";
import { ReviewPanel, type ReviewData } from "@/components/features/gallery/review-panel";
import { TheHanhTrinh } from "@/components/features/gallery/the-hanh-trinh";
import { DanhSachBuoiChup } from "@/components/features/gallery/danh-sach-buoi-chup";
import { PhotoLightbox } from "@/components/features/gallery/photo-lightbox";
import { BangSanPhamCuaAnh } from "@/components/features/gallery/bang-san-pham-cua-anh";
import { ManTreoTuong } from "@/components/features/gallery/man-treo-tuong";
import { CuaHang } from "@/components/features/gallery/cua-hang";
import { MoiMuaLanHai } from "@/components/features/gallery/moi-mua-lan-hai";
import { MoiNguoiThan } from "@/components/features/gallery/moi-nguoi-than";
import { dangMoChoKhachXem } from "@/lib/gallery/mo-cho-khach-xem";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";
import { locHangInTrongGoi, conThieuAnh } from "@/lib/products/hang-in-trong-goi";
import { TomTatSanPhamIn } from "@/components/features/gallery/tom-tat-san-pham-in";
import { LuoiAnh } from "@/components/features/gallery/luoi-anh";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { ThanhChon } from "@/components/features/gallery/thanh-chon";
import { MenuTaiAnh } from "@/components/features/gallery/menu-tai-anh";
import { HuongDanThemManHinh } from "@/components/features/gallery/huong-dan-them-man-hinh";
import { LoiGoiYLuuApp } from "@/components/features/gallery/loi-goi-y-luu-app";
import { BatThongBao } from "@/components/features/gallery/bat-thong-bao";
import { SoSanhAnh } from "@/components/features/gallery/so-sanh-anh";
import {
  themVaoSoSanh,
  boKhoiSoSanh,
  duSoSanh,
  daDuSoSanh,
  SO_SANH_TOI_DA,
  SO_SANH_TOI_THIEU,
} from "@/lib/gallery/so-sanh";
import { Columns2, X as XIcon } from "lucide-react";
import { taiTheoLo, doDocDuocDungLuong, type TienDoTai } from "@/lib/utils/tai-anh";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { buildHeartPayload, buildGhiChuPayload } from "@/lib/selection/heart-payload";
import { useHangChoTim } from "@/components/features/gallery/use-hang-cho-tim";
import { useRouter } from "next/navigation";
import { AlertTriangle, Info, Lock } from "lucide-react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
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
  giaiDoanTienDo?: number | null;
  /**
   * BB-200 (3/3) — chuỗi tiến độ tính từ trạng thái app + mã Lark
   * (docs/21 "Luồng hiển thị"). `null` = giữ nguyên chữ cũ theo `status`.
   */
  nhanTienDo?: string | null;
  babyName: string | null;
  /** BB-212: tên khách hàng đứng bộ ảnh — điền sẵn ô "người xác nhận" lúc chốt. */
  customerName?: string | null;
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
// LƯỚI ẢNH — nay ở `luoi-anh.tsx` (xếp so le, giữ đúng khung, cuộn ảo).
// Bảng số đo hiệu năng của BB-131 đi cùng nó sang đó.
// ---------------------------------------------------------------------------

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

  // BB-232 — hàng chờ thả tim ngoại tuyến. Toàn bộ logic (gộp/triệt tiêu, tự
  // gửi lại, localStorage) sống trong hook riêng — xem use-hang-cho-tim.ts.
  // Máy chủ từ chối hẳn một lô gửi lại (4xx): báo và tải lại bộ ảnh cho tim
  // khớp dữ liệu thật. Ref vì loadGallery khai báo SAU và phụ thuộc hangChoTim.
  const taiLaiRef = React.useRef<() => void>(() => {});
  const hangChoTim = useHangChoTim(token, {
    khiBiTuChoi: (_code, message) => {
      setStatusMessage(
        message
          ? `Có ảnh chọn lúc mất mạng chưa lưu được: ${message}`
          : "Có ảnh chọn lúc mất mạng chưa lưu được — bên mình đã tải lại danh sách đúng.",
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
  const [filter, setFilter] = useState<"all" | "selected" | "unselected">("all");
  const [selectedSubfolder, setSelectedSubfolder] = useState<string>("");
  // BB-213 — tấm trượt "Lưu app ra màn hình chính", mở từ nút ở đầu trang.
  const [moHuongDanLuuApp, setMoHuongDanLuuApp] = useState(false);

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
  const [placements, setPlacements] = useState<{ photoId: string; galleryItemId: string }[]>([]);
  const [placing, setPlacing] = useState(false);
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
  /**
   * BB-217 — màn "treo ảnh của con lên tường", mở từ nút trong bảng sản phẩm
   * của màn xem ảnh lớn. Nhớ ID ảnh đang xem lúc bấm, không phải chỉ true/
   * false: màn treo tường cho lướt sang tấm khác trong danh sách đã chọn, và
   * lúc đóng lại thì màn xem ảnh lớn phải quay về ĐÚNG tấm ba mẹ đang xem
   * trước đó, không nhảy về tấm đầu.
   */
  const [manTreoTuongTuAnh, setManTreoTuongTuAnh] = useState<string | null>(null);

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
        //
        // BB-232 — áp hàng chờ ngoại tuyến (nếu còn) lên MỖI trang vừa nhận:
        // reload lúc còn mất mạng thì tim đã bấm không hiện lại tắt trong lúc
        // chờ trang cuối tải xong.
        setPhotos(hangChoTim.apDungLenAnh([...tatCaAnh]));

        if (!photosJson.meta?.hasMore || !photosJson.meta?.cursor) break;
        cursor = photosJson.meta.cursor;
      }
      // Tải xong (hoặc còn mất mạng và dừng giữa chừng) — thử gửi luôn hàng
      // chờ cũ nếu mạng đã có lại từ lúc reload tới giờ.
      void hangChoTim.guiNgay();
    } catch {
      setError({
        code: "NETWORK_ERROR",
        message: "Không thể kết nối đến máy chủ. Vui lòng thử lại sau.",
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
        const res = await fetch("/api/g/selection", {
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
    [isLocked, gallery?.quotaKnown, gallery?.maxSelection, hangChoTim.xepHangTim],
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
          `Chỉ so sánh được tối đa ${SO_SANH_TOI_DA} tấm — bỏ bớt một tấm đang so sánh trước đã nhé.`,
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
          "Còn ảnh vừa chọn chưa lưu được vì mất mạng — thử lại khi có mạng rồi chốt danh sách nhé.",
        );
        return;
      }
    }

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

  // BB-212 — màn đang tải, đổi sang ngôn ngữ "cuốn album kỷ niệm": nền kem
  // (`bg-background` bên trong `.giao-dien-khach`), chữ mực, không còn nền
  // trắng lạnh của khung quản trị.
  if (loading) {
    return (
      <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 bg-background p-6 text-foreground">
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
    const tranhLoi = error?.code === "LINK_EXPIRED" ? "link-het-han" : "chua-co-anh";
    return (
      <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center bg-background p-6 text-center text-foreground">
        <div className="relative mb-6 h-[160px] w-[160px] md:h-[200px] md:w-[200px]">
          {/* Đồng hồ cát chỉ cho link HẾT HẠN; link không có thật thì nói
              "hết hạn" bằng hình là sai (Opus soát BB-225). */}
          <img
            src={`/hanh-trinh/${tranhLoi}-640.webp`}
            srcSet={`/hanh-trinh/${tranhLoi}-320.webp 320w, /hanh-trinh/${tranhLoi}-640.webp 640w`}
            sizes="(max-width: 768px) 160px, 200px"
            alt=""
            loading="lazy"
            width={640}
            height={640}
            className="absolute inset-0 h-full w-full object-contain animate-in fade-in duration-300 motion-reduce:animate-none"
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
  const soChuaChon = photos.length - photos.filter((p) => p.mark === "selected").length;
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
  const nutChinh = !duocChot
    ? null
    : !isLocked
    ? { nhan: vi.gallery.submitCta, onClick: () => setShowSubmitModal(true) }
    : daChotChoXacNhan
      ? // Đã chốt, CSKH chưa xác nhận: mở lại là việc của chính ba mẹ.
        { nhan: "Chọn thêm ảnh", onClick: () => setMoKhoaChon(true) }
      : // Đã khoá thật: không sửa thẳng được, nhưng phải có ĐƯỜNG NÓI.
        { nhan: "Yêu cầu sửa lại", onClick: () => setXinSuaLai(true) };

  const nutLoc = (loai: "all" | "selected" | "unselected", nhan: string, so: number) => (
    <button
      type="button"
      onClick={() => setFilter(loai)}
      aria-pressed={filter === loai}
      className={cn(
        "shrink-0 whitespace-nowrap pb-2.5 text-[13.5px] transition-colors",
        filter === loai
          ? "font-medium text-foreground shadow-[inset_0_-2px_0_currentColor]"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {nhan}
      <span className="ml-1 opacity-60">{so.toLocaleString("vi-VN")}</span>
    </button>
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-28 text-foreground">
      {/* Thông báo trạng thái */}
      {statusMessage && (
        <div className="fixed left-4 right-4 top-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl bg-[#2a2420] p-4 text-[#fffdf9] shadow-lg animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2 text-sm">
            <Info className="h-5 w-5 shrink-0 opacity-80" />
            <span>{statusMessage}</span>
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

      {/* MÀN 1 — ẢNH BÌA */}
      <BiaBoAnh
        anhBia={anhBia}
        coverHeadline={gallery.coverHeadline ?? null}
        tenBe={gallery.babyName}
        ngayChup={gallery.shootDate}
        chiNhanh={gallery.branch.name}
        loiChao={gallery.welcomeMessage}
        soAnh={photos.length || gallery.photoCount}
        hanMuc={hanMuc}
        daChon={selectionCounts.selectedCount}
        hanChot={gallery.dueAt}
        khoa={isLocked}
        onBatDau={cuonToiLuoi}
      />

      {/*
        ĐẦU TRANG DÍNH — gọn còn tên, bộ lọc, và hai việc phụ (nhắn studio,
        tải ảnh). Thanh 6 bước và 4 ô số đã rời khỏi đây: ba mẹ không cần biết
        quy trình nội bộ của studio, và số tấm đã có ở thanh đáy.
      */}
      <header
        id="dau-luoi-anh"
        className="sticky top-0 z-20 border-b border-border/70 bg-background/90 backdrop-blur-md"
      >
        <div className="mx-auto max-w-[1600px] px-3 sm:px-6 lg:px-10">
          <div className="flex items-end justify-between gap-3 pt-3">
            <div className="min-w-0">
              <p className="truncate font-display text-[22px] leading-tight">
                {gallery.babyName || "Khoảnh khắc của con"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {gallery.branch.name}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {/*
                "Nhắn cho studio" giữ nguyên CHỮ, không thu thành biểu tượng:
                đây là đường duy nhất ba mẹ liên lạc với studio ngay trên màn
                đang xem ảnh, và một biểu tượng bong bóng chat thì nhiều người
                không bấm.
              */}
              {gallery.branch.chatUrl && (
                <a
                  href={gallery.branch.chatUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-9 items-center rounded-full border border-border px-3 text-xs font-medium transition hover:bg-surface-2"
                >
                  {vi.gallery.messageStudio}
                </a>
              )}
              {/*
                BB-241 — nút biểu tượng "Lưu app" ở đây bỏ hẳn: chủ studio
                24/09/2026 "nếu không phải người thiết kế thì không biết nó để
                làm gì". Thay bằng lời gợi ý ĐÚNG LÚC (`LoiGoiYLuuApp`, dựng ở
                cuối màn) — hiện sau khi ba mẹ thả tim tấm đầu hoặc ở lần mở
                thứ hai, đúng lúc họ đã thấy giá trị của bộ ảnh thay vì hiện
                ngay từ đầu như một nút không rõ nghĩa.
              */}
              {choPhepTai && photos.length > 0 && (
                <MenuTaiAnh
                  soAnh={photos.length}
                  dungLuong={doDocDuocDungLuong(gallery.tongDungLuongAnh)}
                  soDaChon={soAnhDaChon}
                  onTaiDaChon={taiAnhDaChon}
                  onTaiCaBo={taiCaBo}
                />
              )}
            </div>
          </div>

          <nav aria-label="Lọc ảnh" className="mt-3 flex items-center gap-5 overflow-x-auto">
            {nutLoc("all", vi.gallery.filterAll, photos.length)}
            {nutLoc("selected", vi.gallery.filterSelected, selectionCounts.selectedCount)}
            {nutLoc("unselected", vi.gallery.filterUnselected, soChuaChon)}
            {photosLoading && <Spinner className="mb-2.5 h-4 w-4 shrink-0 text-muted-foreground" />}

            {/*
              BB-218 — bật/tắt chế độ "chọn để so sánh". Đặt cuối hàng bộ lọc
              (không xen giữa Tất cả/Đã chọn/Chưa chọn) vì đây là một CHẾ ĐỘ
              thao tác, không phải thêm một bộ lọc thứ tư.
            */}
            <button
              type="button"
              onClick={() => (soSanhBat ? huySoSanh() : setSoSanhBat(true))}
              aria-pressed={soSanhBat}
              className={cn(
                "mb-2.5 ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                soSanhBat
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
              So sánh
            </button>
          </nav>

          {/*
            Gợi ý đúng lúc chủ studio đã nói (24/09/2026): "Ví dụ chọn quá
            nhiều cần bỏ bớt" — chỗ dễ dùng nhất là đang lọc "Đã chọn". Chỉ
            hiện khi ba mẹ đang ở chế độ so sánh nhưng CHƯA lọc theo Đã chọn.
          */}
          {soSanhBat && filter !== "selected" && (
            <p className="pb-2.5 text-[12px] text-muted-foreground">
              Chọn quá nhiều ảnh, cần bỏ bớt? Lọc theo &ldquo;{vi.gallery.filterSelected}&rdquo; rồi so sánh cho dễ.
            </p>
          )}

          {/*
            BB-180 — nhóm ảnh (thư mục con trong Drive), thành thẻ bấm được.
            Chỉ hiện khi có từ HAI nhóm: một thẻ "Quân JPG 300" duy nhất không
            lọc được gì, chỉ thêm chữ.
          */}
          {gallery.subfolders.length > 1 && (
            <div
              aria-label={vi.gallery.subfolderTitle}
              className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-3 sm:mx-0 sm:px-0"
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

      <div className="mx-auto max-w-3xl px-4 pt-5">
        <TheHanhTrinh
          status={gallery.status}
          giaiDoan={gallery.giaiDoanTienDo ?? null}
          nhanTienDo={gallery.nhanTienDo}
          photoCount={gallery.photoCount}
        />
      </div>

      {/*
        BB-246 — nút "Bật thông báo". Đặt NGOÀI header sticky (không tranh chỗ
        với tên bé/bộ lọc) nhưng vẫn ngay đầu trang, đúng chỗ ba mẹ nhìn thấy
        lúc bộ ảnh chuyển sang "chờ duyệt". Tự ẩn hẳn khi chưa đủ điều kiện
        (thiếu khoá VAPID, trình duyệt không hỗ trợ, bộ ảnh chưa chốt...) — xem
        bat-thong-bao.tsx.
      */}
      <div className="mx-auto max-w-[1600px] px-3 pt-2 sm:px-6 lg:px-10">
        <BatThongBao
          galleryId={gallery.id}
          status={gallery.status}
          onMoHuongDanLuuApp={() => setMoHuongDanLuuApp(true)}
        />
      </div>

      {/* Thông báo trạng thái bộ ảnh — chỉ hiện khi có điều cần nói. */}
      {(gallery.review || isLocked || !gallery.quotaKnown || !duocChon) && (
        <div className="mx-auto max-w-3xl space-y-3 px-4 pt-5">
          {gallery.review && (
            <ReviewPanel
              status={gallery.status}
              nhanTienDo={gallery.nhanTienDo}
              review={gallery.review}
              hotline={gallery.branch.hotline}
              onDecide={decideReview}
            />
          )}

          {/* Người chỉ xem (link mời ông bà) không gửi được yêu cầu theo luật
              BB-245 (đã duyệt, không vòng sửa) — route trả 403/409 nếu bấm
              thẳng bằng luật ba mẹ, nên không hiện thẻ NÀY cho họ (Opus soát
              BB-245). Ông bà có thẻ mua thêm RIÊNG ở nhánh !duocChon dưới. */}
          {duocChon && (
          <MoiMuaLanHai
            status={gallery.status}
            soVongSua={gallery.review?.rounds.length ?? 0}
            danhMuc={(gallery.addons?.catalogue ?? []).map((sp) => ({
              productId: sp.productId,
              name: sp.name,
              material: sp.material,
              size: sp.size,
              unitPrice: sp.unitPrice,
              nhom: sp.nhom as NhomSanPham,
              canGanAnh: sp.canGanAnh,
            }))}
            anhDaChon={photos
              .filter((p) => p.mark === "selected")
              .map((p) => ({ id: p.id, fileName: p.fileName }))}
          />
          )}

          {/*
            BB-254 — "Mời ông bà cùng xem". Gate GIỐNG hệt route
            (`/api/g/moi-nguoi-than` chặn 403 nếu phiên là viewer): `duocChon`
            đúng bằng "vaiTro !== 'viewer'" (owner/co_editor/suggester).
          */}
          {duocChon && <MoiNguoiThan />}

          {!duocChon && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-border bg-surface p-4 text-sm">
                <p className="font-medium">Link này để xem ảnh cùng gia đình</p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  Việc chọn ảnh do ba mẹ đứng tên hợp đồng. Thích tấm nào, nhắn ba mẹ nhé.
                </p>
              </div>

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
                moTa="Chọn sản phẩm và để lại tên, số điện thoại — studio gọi lại báo giá."
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
              />
            </div>
          )}

          {isLocked && (
            <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4">
              <Lock className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" />
              <div className="text-sm">
                <p className="font-medium">
                  {daChotChoXacNhan ? "Ba mẹ đã chốt danh sách" : "Bộ ảnh đang ở chế độ xem lại"}
                </p>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {daChotChoXacNhan
                    ? "Bên mình đang xác nhận. Muốn đổi hay chọn thêm, ba mẹ bấm “Chọn thêm ảnh” ở dưới nhé."
                    : vi.gallery.lockedBanner.replace(
                        "{date}",
                        gallery.selection.submittedAt
                          ? new Date(gallery.selection.submittedAt).toLocaleDateString("vi-VN")
                          : "",
                      )}
                </p>
              </div>
            </div>
          )}

          {/* Hạn mức CHƯA BIẾT (quotaKnown = false) */}
          {!gallery.quotaKnown && !isLocked && duocChon && (
            <div className="flex items-start gap-3 rounded-2xl border border-[#e7cf9f] bg-[#fbf3e2] p-4 text-[#5c4413]">
              <AlertTriangle className="mt-0.5 h-[18px] w-[18px] shrink-0" />
              <div className="text-sm">
                <p className="font-medium">Studio sẽ báo lại số ảnh trong gói</p>
                {/*
                  Nói ĐÚNG điều app làm: khi chưa có hạn mức, thả tim bị chặn
                  (handleToggleHeart trả về câu "vui lòng liên hệ CSKH"). Bảo ba
                  mẹ "cứ thả tim" ở đây là hứa một việc app không cho làm.
                */}
                <p className="mt-0.5 text-[13px] leading-relaxed opacity-90">
                  CSKH đang cập nhật số ảnh chỉnh sửa của gói. Ba mẹ xem ảnh trước nhé — bên mình mở
                  chọn ảnh ngay khi xong
                  {gallery.branch.hotline ? (
                    <>
                      , cần gấp thì gọi <span className="font-medium">{gallery.branch.hotline}</span>
                    </>
                  ) : null}
                  .
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MÀN 2 — LƯỚI ẢNH so le, giữ đúng khung */}
      <section
        aria-label="Ảnh của buổi chụp"
        className="mx-auto max-w-[1600px] px-1.5 pt-1.5 sm:px-3 sm:pt-3 lg:px-10 lg:pt-6"
      >
        {filteredPhotos.length === 0 ? (
          <div className="mx-auto my-12 max-w-md rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">{vi.gallery.emptyFilter}</p>
          </div>
        ) : (
          <LuoiAnh
            photos={filteredPhotos}
            mutatingIds={mutatingIds}
            khoa={khoaTim}
            soSanPhamTheoAnh={soSanPhamTheoAnh}
            soSanhBat={soSanhBat}
            soSanhTheoAnh={soSanhTheoAnh}
            onToggle={handleToggleHeart}
            onOpen={(idx) => {
              setLightboxDungDanhSachDay(false);
              setLightboxIndex(idx);
            }}
            onToggleSoSanh={onToggleSoSanh}
          />
        )}
      </section>

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
      {(hanMuc != null || hangInTrongGoi.length > 0) && (
        <div className="mx-auto mt-14 max-w-3xl space-y-5 px-4">
          <h2 className="font-display text-[28px] font-light leading-tight">Trong gói của ba mẹ</h2>
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
          />
        </div>
      )}

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

      {/* THANH ĐÁY — một viên duy nhất: đã chọn mấy tấm, bước tiếp theo. */}
      {soSanhBat ? (
        /*
          BB-218 — thanh đáy đổi hẳn sang thanh so sánh khi chế độ này đang
          bật (không chồng lên ThanhChon): hai thanh cùng đáy màn hình cùng
          lúc là hai câu hỏi tranh nhau chỗ ngón cái, và "đang so sánh" với
          "bước tiếp theo của việc chốt ảnh" là hai việc khác nhau ba mẹ chỉ
          làm MỘT lúc.
        */
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
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
        duocChon && (
        <ThanhChon
          daChon={selectionCounts.selectedCount}
          hanMuc={hanMuc}
          soTamThem={gallery.quotaKnown ? selectionCounts.extraCount : 0}
          tienThem={gallery.quotaKnown ? selectionCounts.extraAmount : 0}
          nutChinh={nutChinh}
          muaThem={
            (gallery.addons?.catalogue?.length ?? 0) > 0 && !isLocked && duocChon
              ? { tien: gallery.addons?.totalAmount ?? 0, onClick: () => setMoCuaHang(true) }
              : null
          }
          soChuaGui={hangChoTim.soChuaGui}
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
        <div className="mx-auto max-w-[1600px] px-4 pt-6 pb-10 sm:px-6 lg:px-10 lg:py-8">
          <h2 className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {vi.gallery.studioInfo}
          </h2>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="space-y-1">
              <p className="font-display text-xl text-foreground">{gallery.branch.name}</p>
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
            </div>
            {gallery.branch.chatUrl && (
              <a
                href={gallery.branch.chatUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-border px-5 font-medium text-foreground transition hover:bg-surface-2 sm:h-10"
              >
                {vi.gallery.messageStudio}
              </a>
            )}
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
            <h3 className="font-display text-2xl font-light">Yêu cầu sửa lại</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Bộ ảnh đã chuyển cho bên chỉnh ảnh nên ba mẹ không tự sửa được nữa. Ba mẹ ghi
              giúp muốn sửa gì, bên mình xem còn kịp không rồi báo lại ngay ạ.
            </p>
            <textarea
              value={lyDoSuaLai}
              onChange={(e) => setLyDoSuaLai(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Ví dụ: em muốn đổi tấm số 12 sang tấm 15 giúp em"
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
                Gửi cho studio
              </button>
            </div>
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
          <div className="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl animate-in slide-in-from-bottom duration-300 sm:max-w-lg sm:rounded-3xl sm:slide-in-from-bottom-4">
            <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-border sm:hidden" aria-hidden="true" />

            <div className="overflow-y-auto px-6 pb-6 pt-4 sm:p-7">
              <h3 className="font-display text-[26px] font-light leading-tight">
                {vi.gallery.submitConfirmTitle}
              </h3>
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
                  Ghi chú chung cho studio (nếu có)
                </label>
                <textarea
                  id="customer-note-input"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="Lời nhắn thêm cho thợ chỉnh sửa..."
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
                  <span className="font-semibold">{selectionCounts.selectedCount} ảnh</span>
                </div>
                {gallery.quotaKnown && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Số ảnh trong gói</span>
                      <span>{gallery.includedQuota ?? 0} ảnh</span>
                    </div>
                    {selectionCounts.extraCount > 0 && (
                      <div className="flex items-center justify-between text-heart">
                        <span>Số ảnh chọn thêm</span>
                        <span className="font-semibold">
                          {selectionCounts.extraCount} ảnh · {formatCurrencyVND(selectionCounts.extraAmount)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

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
                <div className="mt-3 rounded-2xl border border-heart/25 bg-heart/[0.06] p-3.5 text-xs">
                  <p className="font-semibold text-heart">Ba mẹ chưa chọn ảnh cho:</p>
                  <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[#2a2420]/80">
                    {sanPhamThieuAnh.map((sp) => (
                      <li key={sp.galleryItemId}>{sp.name}</li>
                    ))}
                  </ul>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    Chọn luôn thì bên mình làm nhanh hơn — để sau cũng được, CSKH sẽ
                    hỏi lại.
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowSubmitModal(false)}
                    className="mt-2.5 rounded-full border border-heart/40 px-3 py-1.5 font-medium text-heart transition hover:bg-heart/10"
                  >
                    Để tôi chọn thêm
                  </button>
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

              {/* Ô tích — đặt SAU tóm tắt, để ba mẹ đọc lại rồi mới xác nhận. */}
              <label className="mt-5 flex items-start gap-2.5 text-sm leading-relaxed">
                <input
                  type="checkbox"
                  checked={dongY}
                  onChange={(e) => setDongY(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>{vi.gallery.submitAgree}</span>
              </label>

              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
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
                  disabled={submitting || tenXacNhan.trim().length === 0 || !dongY}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                >
                  {submitting && <Spinner className="h-4 w-4" />}
                  {vi.common.confirm}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TẢI ẢNH VỀ MÁY — BB-156.
          Nút chọn tải nay ở đầu trang (MenuTaiAnh). Ở đây chỉ còn ô báo tiến độ
          khi đang tải nhiều tấm, nổi ngay trên thanh đáy chứ không đè lên nó. */}
      {choPhepTai && tienDoTai && tienDoTai.tong > 1 && (
        <div className="fixed inset-x-3 bottom-[84px] z-30 mx-auto max-w-xl rounded-2xl border border-border bg-surface p-3 text-sm shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate">
              Đang tải {tienDoTai.daXong}/{tienDoTai.tong} ảnh
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
          photos={lightboxDungDanhSachDay ? photos : filteredPhotos}
          initialIndex={lightboxIndex}
          onClose={() => {
            setLightboxIndex(null);
            setLightboxDungDanhSachDay(false);
            // Mở từ màn so sánh (chạm hai lần) thì đóng xong quay lại màn so
            // sánh — ba mẹ đang so dở, không phải đang xem lưới.
            if (lightboxDungDanhSachDay && soSanhBat && duSoSanh(dsSoSanh)) setMoSoSanh(true);
          }}
          onToggleHeart={handleToggleHeart}
          onTaiAnh={choPhepTai ? (p) => taiMotAnh({ id: p.id, fileName: p.fileName }) : null}
          mutatingIds={mutatingIds}
          isLocked={khoaTim}
          daChon={soAnhDaChon}
          hanMuc={gallery.quotaKnown ? (gallery.includedQuota ?? null) : null}
          onLuuGhiChu={luuGhiChuAnh}
          onSoSanh={onSoSanhTuLightbox}
          dungCho={(anh) => {
            // Gộp đủ ba đường một tấm ảnh thành hàng — cùng ba nguồn với dấu
            // rêu trên lưới (`soSanPhamTheoAnh`), để hai chỗ không nói khác nhau.
            const nhan: string[] = [];
            for (const pl of placements) {
              if (pl.photoId !== anh.id) continue;
              const sp = hangInTrongGoi.find((h) => h.galleryItemId === pl.galleryItemId);
              if (sp) nhan.push(`${sp.name} · trong gói`);
            }
            for (const m of gallery.addons?.items ?? []) {
              if (m.photoId === anh.id) nhan.push(m.quantity > 1 ? `${m.name} ×${m.quantity}` : m.name);
            }
            for (const ap of gallery.albumPlacements ?? []) {
              if (ap.photoId !== anh.id) continue;
              const al = gallery.addons?.items?.find((m) => m.id === ap.addonId);
              if (al) nhan.push(al.name);
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
              // BB-217 — chỉ hiện lối vào màn treo tường khi tấm đang xem đã
              // được chọn (đúng đề bài) và danh mục thật sự có ảnh in để treo.
              onXemTuong={
                anh.mark === "selected" &&
                (gallery.addons?.catalogue ?? []).some((sp) => sp.nhom === "anh_in")
                  ? () => setManTreoTuongTuAnh(anh.id)
                  : undefined
              }
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
            name: sp.name,
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

      {/* BB-213 — tấm hướng dẫn "Lưu app", mở từ lời gợi ý BB-241 bên dưới. */}
      <HuongDanThemManHinh mo={moHuongDanLuuApp} onDong={() => setMoHuongDanLuuApp(false)} />

      {/* BB-241 — lời gợi ý "Lưu app" đúng lúc, thay cho nút biểu tượng cũ. */}
      <LoiGoiYLuuApp
        daChon={selectionCounts.selectedCount}
        onXemCachLuu={() => setMoHuongDanLuuApp(true)}
      />
    </div>
  );
}
