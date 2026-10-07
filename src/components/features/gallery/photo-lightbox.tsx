"use client";
import { urlAnhDuPhong, type CoMaTepDrive } from "@/lib/utils/anh-lh3";
import { khoaCuonTrang } from "@/lib/utils/khoa-cuon-trang";

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Heart, Minimize2, Printer, PenLine } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { CHIP_NGUYEN_KHOI } from "@/lib/utils/chip-nguyen-khoi";
import { vi } from "@/i18n";
import type { PhotoPublic } from "@/types/domain";
import {
  getVisibleIndices,
  buildLightboxImageUrl,
  buildLightboxSrcSet,
  calculateSwipeAction,
} from "@/lib/utils/lightbox";
import {
  kepBien,
  kepTiLe,
  phongQuanhDiem,
  tiLeSauChamHaiLan,
  tiLeTuCuonChuot,
  NGUONG_ANH_NET,
  laNhapChuot,
  TI_LE_NHO_NHAT,
  type TrangThaiPhong,
} from "@/lib/gallery/phong-anh";
import { formatSo } from "@/lib/utils/dinh-dang";
import { giuA } from "@/lib/utils/giu-a";
import { MenuTaiAnh, type MenuTaiAnhProps } from "@/components/features/gallery/menu-tai-anh";

export interface PhotoLightboxProps {
  /** BB-319 (Ghi nhận K4/K5) — tên bé, hiện nhỏ dưới số thứ tự: xem lớn vẫn "gọi tên bé". */
  tenBe?: string | null;
  photos: PhotoPublic[];
  initialIndex: number;
  onClose: () => void;
  onToggleHeart: (photo: PhotoPublic) => void;
  /** BB-156: null = bộ ảnh này không cho tải. */
  onTaiAnh?: ((photo: PhotoPublic) => void) | null;
  /**
   * BB-330 — nút tải ở màn xem lớn mở CÙNG thực đơn với màn ngoài (Tải ảnh
   * đang xem / Tải ảnh đã chọn / Tải cả bộ) thay vì tải ngay tấm đang xem.
   * Truyền kèm `onTaiAnh` (lựa chọn "đang xem"). Thiếu prop này thì giữ nút
   * tải một tấm như cũ.
   */
  menuTai?: Omit<MenuTaiAnhProps, "onTaiDangXem" | "nutClassName"> | null;
  mutatingIds: Set<string>;
  isLocked: boolean;
  /** BB-180: so anh da chon va han muc, hien thuong truc trong man xem lon. */
  daChon?: number;
  hanMuc?: number | null;
  /** BB-180: luu ghi chu cho tho chinh anh. Duong luu da co tu BB-144. */
  onLuuGhiChu?: (photo: PhotoPublic, ghiChu: string) => Promise<boolean>;
  /**
   * Bảng "tấm này in ra cái gì" — dựng bên ngoài rồi truyền vào, vì nó cần dữ
   * liệu hợp đồng và danh mục giá mà lightbox không có.
   *
   * Nhận HÀM chứ không nhận phần tử dựng sẵn: bảng phụ thuộc vào tấm ĐANG XEM,
   * mà lightbox mới là chỗ biết tấm nào đang xem.
   *
   * BB-293 vòng 2 mục #3 — tham số thứ hai `tong` cho biết bảng đang được vẽ
   * trên nền gì: `"sang"` ở cột phải máy tính (nền kính sáng), `"toi"` ở tấm
   * trượt tối trên điện thoại — chỗ gọi (`gallery-app.tsx`) truyền lại đúng
   * tông xuống `BangSanPhamCuaAnh`.
   */
  bangSanPham?: (photo: PhotoPublic, tong?: "sang" | "toi") => React.ReactNode;
  /** Ô quảng cáo của studio, chỉ hiện ở màn rộng. */
  banner?: React.ReactNode;
  /**
   * Tấm này đang được dùng cho những sản phẩm nào — "Gỗ 40x60 · trong gói",
   * "Album"… Hiện thành một hàng nhãn ngay trên nút tim, để ba mẹ biết tấm
   * đang xem sẽ in ra cái gì mà không phải mở bảng sản phẩm.
   */
  dungCho?: (photo: PhotoPublic) => string[];
  /**
   * BB-218 — "So sánh với tấm khác": đưa tấm đang xem vào danh sách so sánh
   * rồi đóng màn xem lớn (chỗ gọi tự quay về lưới ở chế độ chọn so sánh).
   * Thiếu prop này thì không hiện nút — màn xem lớn dùng ở chỗ khác (nếu có)
   * không bị ép phải biết về tính năng so sánh.
   */
  onSoSanh?: (photo: PhotoPublic) => void;
  /**
   * BB-321 — màn "Chọn thêm ảnh · Đợt N": tấm đã chốt ở đợt trước KHÔNG bỏ
   * chọn được, dù bộ ảnh không khoá chung (`isLocked = false` để tấm chưa chọn
   * vẫn thả tim được). Trả `true` thì nút tim của RIÊNG tấm đó bị khoá. Thiếu
   * prop này thì hành vi y như cũ.
   */
  khoaTimAnh?: (photo: PhotoPublic) => boolean;
}

/**
 * Màn xem ảnh lớn (Lightbox) — BB-143.
 *
 * OWNER: DEV-FE.
 *
 * Đáp ứng các yêu cầu từ buổi dùng thật của chủ studio:
 * 1. Mở ảnh chất lượng cao w=1600 (/api/img/<id>?w=1600).
 * 2. BB-289 lượt 2 — nền KÍNH TRONG (không còn đặc `--bb-viewer-bg`), đúng
 *    bản vẽ `babybean-assets/BB-285/xem-lon-dien-thoai.html` (`.kinh`):
 *    `rgba(253,251,249,.66)` + `backdrop-filter: blur(8px)` — thấy lưới ảnh
 *    bên dưới mờ qua lớp kính, không phải nền tối đặc như trước. Các chip
 *    điều khiển ngồi TRÊN lớp kính (số thứ tự, nút đóng/tải) đổi sang chữ
 *    mực + nền sáng hơn (khớp `.so{background:rgba(255,255,255,.7)}` của
 *    bản vẽ) vì chữ trắng cũ không còn đủ tương phản trên nền sáng. Các chip
 *    vốn đã có nền riêng đủ đậm (thanh dưới, mũi tên máy tính, tấm trượt sản
 *    phẩm — toàn nền tối `#2E2A27`/`#231e1a` hoặc `bg-black/*` riêng) GIỮ
 *    NGUYÊN, không đổi, vì chúng không phụ thuộc màu nền gốc.
 * 3. Tự xoay và thích ứng theo thiết bị: ảnh vừa khít màn hình, không tràn, không cắt.
 *    Điện thoại xoay ngang thì ảnh ngang chiếm trọn bề ngang màn hình.
 * 4. Thao tác điều hướng: Touch Swipe trên điện thoại, phím mũi tên và Esc trên máy tính.
 * 5. Thả tim chọn ảnh NGAY TRONG màn xem lớn, đồng bộ tức thì.
 * 6. KHÔNG PHÁ cuộn ảo BB-131: Dùng cửa sổ trượt (sliding window) chỉ dựng
 *    tối đa 3 ảnh lân cận [currentIndex - 1, currentIndex, currentIndex + 1]
 *    trong DOM, giải phóng toàn bộ ảnh khác để không phình bộ nhớ với bộ 1.235 tấm.
 */
export function PhotoLightbox({
  tenBe,
  photos,
  initialIndex,
  onClose,
  onToggleHeart,
  onTaiAnh,
  menuTai,
  mutatingIds,
  isLocked,
  
  
  onLuuGhiChu,
  bangSanPham,
  banner,
  dungCho,
  khoaTimAnh,
}: PhotoLightboxProps) {
  /**
   * Tấm trượt từ dưới lên trên điện thoại: bảng sản phẩm hoặc ô ghi chú.
   *
   * Bản cũ đặt cả hai thẳng dưới tấm ảnh (bảng cao tới 38% màn hình, cộng ô
   * ghi chú) — ảnh bị ép còn hơn nửa màn. Nay chúng chỉ mở ra khi ba mẹ bấm,
   * và tấm ảnh được trọn chiều cao.
   */
  const [tamMo, setTamMo] = useState<null | "san-pham" | "ghi-chu">(null);
  const chamTruocRef = useRef(0);
  // BB-180: o ghi chu cho tung anh, ngay trong man xem lon.
  //
  // BB-144 da dung xong duong luu (PATCH /api/g/selection, truong retouchNote)
  // nhung khach chua bao gio co o de nhap. Day la nua con lai.
  const [ghiChu, setGhiChu] = useState("");
  const [dangLuuGhiChu, setDangLuuGhiChu] = useState(false);
  const [ketQuaLuu, setKetQuaLuu] = useState<"ok" | "loi" | null>(null);

  const [currentIndex, setCurrentIndex] = useState(() => {
    if (initialIndex < 0) return 0;
    if (initialIndex >= photos.length) return Math.max(0, photos.length - 1);
    return initialIndex;
  });

  // Khóa cuộn trang nền khi mở lightbox
  // BB-329 — khoá CÓ ĐẾM, không tự nhớ/trả `overflow` (lý do ở khoa-cuon-trang.ts).
  useEffect(() => khoaCuonTrang(), []);

  // BB-277 — focus quay về đúng tấm ảnh (hoặc nút) đã mở màn xem lớn khi đóng.
  // Ghi lại phần tử đang giữ focus NGAY LÚC MỞ (còn là tấm bấm/Enter trong
  // lưới), rồi trả focus về đó lúc màn này gỡ khỏi DOM (đóng, theo mọi
  // đường: nút X, Esc, hay bấm nền).
  const focusTruocKhiMoRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    focusTruocKhiMoRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const veLai = focusTruocKhiMoRef.current;
      if (veLai && document.contains(veLai)) veLai.focus();
    };
  }, []);

  const total = photos.length;
  const currentPhoto = photos[currentIndex];

  // Doi anh thi nap lai ghi chu cua anh do, va xoa thong bao cua anh truoc.
  // Khong lam viec nay thi khach go ghi chu cho anh A roi vuot sang anh B van
  // thay nguyen chu do, tuong minh da ghi cho B.
  //
  // CHỈ theo id, không theo retouchNote: lưu xong thì gallery-app ghi
  // retouchNote mới vào ảnh, và nếu effect này nghe cả retouchNote thì nó
  // xoá ngay chữ "Đã lưu ghi chú" vừa hiện — ba mẹ không bao giờ thấy lưu
  // được (BB-230 E-3, 24/09/2026).
  useEffect(() => {
    setGhiChu(currentPhoto?.retouchNote ?? "");
    setKetQuaLuu(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPhoto?.id]);


  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < total - 1 ? prev + 1 : prev));
  }, [total]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  // Xử lý phím tắt bàn phím
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (tamMo) setTamMo(null);
        else onClose();
      } else if (tamMo) {
        // Đang gõ ghi chú thì mũi tên là để di con trỏ chữ, không phải để lật ảnh.
        return;
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev, onClose, tamMo]);

  // Hỗ trợ Touch Swipe mượt mà trên thiết bị di động
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  /** Ngón tay có trượt đi không — trượt là lật ảnh, không phải chạm. */
  const daDiChuyenRef = useRef(false);

  // -------------------------------------------------------------------
  // PHÓNG ẢNH (BB-210) — chụm hai ngón / cuộn chuột / chạm hai lần / nhấp
  // đúp, kéo khi đang phóng, kẹp biên. Toán tách riêng ở phong-anh.ts.
  //
  // MƯỢT: không setState React ở mỗi sự kiện chạm/di chuột. Trạng thái sống
  // trong `zoomRef` và được ghi thẳng vào `style.transform` của ảnh qua
  // requestAnimationFrame — setState chỉ chạy khi ranh giới "đang phóng hay
  // không" đổi (để hiện nút "Thu về"), và khi đổi cỡ ảnh nét hơn.
  // -------------------------------------------------------------------
  const mainRef = useRef<HTMLElement | null>(null);
  // BB-298 — "Ghi chú"/"Đặt in" trong thanh Tim · Ghi chú · Đặt in (máy tính)
  // đưa mắt/tiêu điểm tới đúng mục đã có sẵn trong cột phải, không dựng lại
  // một đường lưu thứ hai.
  const asideRef = useRef<HTMLElement | null>(null);
  const anhHienTaiRef = useRef<HTMLImageElement | null>(null);
  const zoomRef = useRef<TrangThaiPhong>({ scale: 1, x: 0, y: 0 });
  const rafPhongRef = useRef<number | null>(null);
  const pinchRef = useRef<{ khoangCachDau: number; tiLeDau: number } | null>(null);
  const keoRef = useRef<{ x: number; y: number; xDau: number; yDau: number } | null>(null);
  const chuotDangKeoRef = useRef(false);
  // BB-370 — nhấp một lần phóng/thu (xem handleImgClick).
  const nhanXuongRef = useRef<{ x: number; y: number } | null>(null);
  const daKeoChuotRef = useRef(false);
  const chamGanNhatRef = useRef(0);
  const [dangPhong, setDangPhong] = useState(false);
  const [anhNet, setAnhNet] = useState(false);

  const capNhatBoundaryPhong = useCallback(() => {
    const dangPhongMoi = zoomRef.current.scale > TI_LE_NHO_NHAT + 0.01;
    setDangPhong((cu) => (cu === dangPhongMoi ? cu : dangPhongMoi));
    const anhNetMoi = zoomRef.current.scale > NGUONG_ANH_NET;
    setAnhNet((cu) => (cu === anhNetMoi ? cu : anhNetMoi));
  }, []);

  const apDungPhong = useCallback(() => {
    rafPhongRef.current = null;
    const el = anhHienTaiRef.current;
    if (!el) return;
    const { scale, x, y } = zoomRef.current;
    el.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    // Đang phóng thì kéo được ảnh → con trỏ "nắm"; về 1× thì trả lại kính
    // lúp của lớp cursor-zoom-in (gán rỗng = dùng lại giá trị từ className).
    el.style.cursor = scale > 1.01 ? "grab" : "";
  }, []);

  const lenLichApDungPhong = useCallback(() => {
    if (rafPhongRef.current != null) return;
    rafPhongRef.current = requestAnimationFrame(apDungPhong);
  }, [apDungPhong]);

  /** Khung để kẹp biên: kích thước THẬT của ảnh ở 1× (transform không đổi layout box). */
  const khungAnh = useCallback(() => {
    const el = anhHienTaiRef.current;
    return { w: el?.offsetWidth ?? 0, h: el?.offsetHeight ?? 0 };
  }, []);

  /** Điểm chạm/chuột, tính từ TÂM khung ảnh — cùng hệ toạ độ với phong-anh.ts. */
  const diemTuTam = useCallback((clientX: number, clientY: number) => {
    const rect = mainRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: clientX - (rect.left + rect.width / 2), y: clientY - (rect.top + rect.height / 2) };
  }, []);

  const apDungTiLeMoiQuanhDiem = useCallback(
    (tiLeMoi: number, diem: { x: number; y: number }) => {
      const sau = phongQuanhDiem(zoomRef.current, tiLeMoi, diem);
      const khung = khungAnh();
      const { x, y } = kepBien(sau.x, sau.y, sau.scale, khung.w, khung.h);
      zoomRef.current = { scale: sau.scale, x, y };
      capNhatBoundaryPhong();
    },
    [khungAnh, capNhatBoundaryPhong],
  );

  const datLaiPhong = useCallback(
    (mem = false) => {
      zoomRef.current = { scale: 1, x: 0, y: 0 };
      const el = anhHienTaiRef.current;
      if (el) {
        el.style.transition = mem ? "transform .22s ease-out" : "none";
        el.style.transform = "translate(0px, 0px) scale(1)";
        el.style.cursor = "";
        if (mem) {
          window.setTimeout(() => {
            if (anhHienTaiRef.current === el) el.style.transition = "";
          }, 240);
        } else {
          el.style.transition = "";
        }
      }
      capNhatBoundaryPhong();
    },
    [capNhatBoundaryPhong],
  );

  const chamHaiLanPhong = useCallback(
    (diem: { x: number; y: number }) => {
      const tiLeMoi = tiLeSauChamHaiLan(zoomRef.current.scale);
      if (tiLeMoi <= TI_LE_NHO_NHAT) {
        datLaiPhong(true);
        return;
      }
      apDungTiLeMoiQuanhDiem(tiLeMoi, diem);
      const el = anhHienTaiRef.current;
      if (el) {
        el.style.transition = "transform .22s ease-out";
        window.setTimeout(() => {
          if (anhHienTaiRef.current === el) el.style.transition = "";
        }, 240);
      }
      apDungPhong();
    },
    [apDungTiLeMoiQuanhDiem, apDungPhong, datLaiPhong],
  );

  // Đổi tấm thì về 1× — không mang độ phóng của tấm cũ sang tấm mới.
  useEffect(() => {
    datLaiPhong(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex]);

  // Lăn chuột / chụm trên bàn di chuột (wheel + ctrlKey) — phóng quanh con
  // trỏ. Gắn listener THẬT (không qua React onWheel) vì React đặt listener
  // wheel ở chế độ passive mặc định, nên preventDefault() trong handler
  // React sẽ KHÔNG chặn được cử chỉ phóng trang mặc định của trình duyệt.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const diem = diemTuTam(e.clientX, e.clientY);
      const tiLeMoi = tiLeTuCuonChuot(zoomRef.current.scale, e.deltaY);
      apDungTiLeMoiQuanhDiem(tiLeMoi, diem);
      lenLichApDungPhong();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [diemTuTam, apDungTiLeMoiQuanhDiem, lenLichApDungPhong]);

  // Kéo bằng chuột khi đang phóng (máy tính không có cảm ứng).
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!chuotDangKeoRef.current || !keoRef.current) return;
      const dx = e.clientX - keoRef.current.x;
      const dy = e.clientY - keoRef.current.y;
      if (!laNhapChuot(Math.hypot(dx, dy))) daKeoChuotRef.current = true;
      const khung = khungAnh();
      const { x, y } = kepBien(
        keoRef.current.xDau + dx,
        keoRef.current.yDau + dy,
        zoomRef.current.scale,
        khung.w,
        khung.h,
      );
      zoomRef.current = { ...zoomRef.current, x, y };
      lenLichApDungPhong();
    };
    const onUp = () => {
      chuotDangKeoRef.current = false;
      keoRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [khungAnh, lenLichApDungPhong]);

  /**
   * BB-370 (anh 06/10, ảnh f68609f4) — máy tính: NHẤP MỘT LẦN là phóng to quanh
   * con trỏ, nhấp lần nữa là thu về; đang phóng thì kéo để di ảnh. Trước đây
   * phải nhấp ĐÚP — khách không biết, tưởng không phóng được.
   *
   * Nhấp và kéo cùng bắt đầu bằng `mousedown`: ghi điểm nhấn xuống, chuột đi
   * quá NGUONG_KEO_PX (luật chung ở lib/gallery/phong-anh.ts — `laNhapChuot`) thì coi là KÉO (thả ra không bật/tắt phóng).
   * Điện thoại: chạm sinh ra cả `click` giả — bỏ qua `click` đến ngay sau một
   * lượt chạm (`chamGanNhatRef`), cử chỉ chạm (chụm, chạm hai lần, vuốt) giữ
   * nguyên ở handleTouch*.
   */

  const handleImgMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    nhanXuongRef.current = { x: e.clientX, y: e.clientY };
    daKeoChuotRef.current = false;
    if (zoomRef.current.scale <= TI_LE_NHO_NHAT + 0.01) return;
    e.preventDefault();
    e.stopPropagation();
    chuotDangKeoRef.current = true;
    keoRef.current = { x: e.clientX, y: e.clientY, xDau: zoomRef.current.x, yDau: zoomRef.current.y };
  };

  const handleImgClick = (e: React.MouseEvent) => {
    // Ngăn click vào ảnh kích hoạt backdrop close
    e.stopPropagation();
    // Click giả của trình duyệt sau một lượt chạm — điện thoại đã xử lý ở handleTouchEnd.
    if (Date.now() - chamGanNhatRef.current < 800) return;
    const pt = (e.nativeEvent as PointerEvent).pointerType;
    if (pt === "touch" || pt === "pen") return;
    const xuong = nhanXuongRef.current;
    nhanXuongRef.current = null;
    if (daKeoChuotRef.current) {
      daKeoChuotRef.current = false;
      return;
    }
    if (xuong && !laNhapChuot(Math.hypot(e.clientX - xuong.x, e.clientY - xuong.y))) return;
    chamHaiLanPhong(diemTuTam(e.clientX, e.clientY));
  };

  // Khung ảnh cho slide đang xoá trượt (swipe) — cùng nguyên tắc ref + rAF,
  // tách khỏi transform phóng vì nằm trên phần tử KHÁC (div bọc ngoài, ảnh
  // phóng nằm trên chính thẻ <img>).
  const truotHienTaiRef = useRef<HTMLDivElement | null>(null);
  const rafTruotRef = useRef<number | null>(null);
  /**
   * Giữ độ trượt hiện tại ở REF, không chỉ ở DOM: một lượt dựng lại không
   * liên quan (gõ ghi chú, đổi ghi chú lưu…) sẽ khiến React nạp lại `style`
   * theo JSX — nếu JSX không đọc từ đây, độ trượt đang kéo dở sẽ bị giật về 0.
   */
  const swipeXRef = useRef(0);
  const apDungTruot = useCallback((px: number) => {
    swipeXRef.current = px;
    if (rafTruotRef.current != null) cancelAnimationFrame(rafTruotRef.current);
    rafTruotRef.current = requestAnimationFrame(() => {
      rafTruotRef.current = null;
      const el = truotHienTaiRef.current;
      if (el) el.style.transform = `translateX(${swipeXRef.current}px)`;
    });
  }, []);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Chụm hai ngón: bắt đầu phóng, huỷ mọi theo dõi vuốt lật ảnh.
      touchStartRef.current = null;
      keoRef.current = null;
      const [t1, t2] = [e.touches[0]!, e.touches[1]!];
      pinchRef.current = {
        khoangCachDau: Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY),
        tiLeDau: zoomRef.current.scale,
      };
      return;
    }
    if (zoomRef.current.scale > TI_LE_NHO_NHAT + 0.01) {
      // Đang phóng: một ngón để DI ảnh, không lật ảnh.
      const t = e.touches[0];
      if (t) keoRef.current = { x: t.clientX, y: t.clientY, xDau: zoomRef.current.x, yDau: zoomRef.current.y };
      return;
    }
    const touch = e.touches[0];
    if (touch) {
      touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      daDiChuyenRef.current = false;
      apDungTruot(0);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const [t1, t2] = [e.touches[0]!, e.touches[1]!];
      const khoangCach = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      const giua = { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
      const tiLeMoi = kepTiLe(pinchRef.current.tiLeDau * (khoangCach / Math.max(1, pinchRef.current.khoangCachDau)));
      apDungTiLeMoiQuanhDiem(tiLeMoi, diemTuTam(giua.x, giua.y));
      lenLichApDungPhong();
      return;
    }
    if (keoRef.current) {
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - keoRef.current.x;
      const dy = t.clientY - keoRef.current.y;
      const khung = khungAnh();
      const { x, y } = kepBien(
        keoRef.current.xDau + dx,
        keoRef.current.yDau + dy,
        zoomRef.current.scale,
        khung.w,
        khung.h,
      );
      zoomRef.current = { ...zoomRef.current, x, y };
      lenLichApDungPhong();
      return;
    }

    const touch = e.touches[0];
    if (!touchStartRef.current || !touch) return;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) daDiChuyenRef.current = true;

    // Nếu vuốt ngang rõ rệt hơn vuốt dọc thì cập nhật offset
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // Giảm độ dịch nếu ở đầu hoặc cuối danh sách (hiệu ứng cản)
      const px =
        (currentIndex === 0 && deltaX > 0) || (currentIndex === total - 1 && deltaX < 0)
          ? deltaX * 0.3
          : deltaX;
      apDungTruot(px);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    chamGanNhatRef.current = Date.now();
    if (pinchRef.current) {
      pinchRef.current = null;
      if (e.touches.length === 0) capNhatBoundaryPhong();
      return;
    }
    if (keoRef.current) {
      if (e.touches.length === 0) keoRef.current = null;
      return;
    }
    if (!touchStartRef.current) return;
    touchStartRef.current = null;

    if (!daDiChuyenRef.current) {
      // Chạm không trượt: có thể là chạm hai lần (bật/tắt phóng).
      const cham = e.changedTouches[0];
      const bayGio = Date.now();
      if (cham && bayGio - chamTruocRef.current < 300) {
        chamTruocRef.current = 0;
        chamHaiLanPhong(diemTuTam(cham.clientX, cham.clientY));
      } else {
        chamTruocRef.current = bayGio;
      }
      apDungTruot(0);
      return;
    }

    const deltaX = swipeXRef.current;
    const el = truotHienTaiRef.current;

    const action = calculateSwipeAction(deltaX, 0);
    if (action === "next" || action === "prev") {
      // Tấm mới dựng lại từ translateX(0) (xem style ở JSX bên dưới) — đưa
      // ref về 0 luôn, để không mang độ trượt cũ sang tấm kế tiếp.
      swipeXRef.current = 0;
      if (action === "next") goNext();
      else goPrev();
    } else if (el) {
      // Không đủ để lật ảnh: bật về vị trí gốc, có hiệu ứng.
      swipeXRef.current = 0;
      el.style.transition = "transform .25s cubic-bezier(.2,.8,.2,1)";
      el.style.transform = "translateX(0px)";
      window.setTimeout(() => {
        if (truotHienTaiRef.current === el) el.style.transition = "";
      }, 260);
    }
  };

  /**
   * CỬA SỔ TRƯỢT (SLIDING WINDOW):
   * Chỉ giữ các tấm ảnh trong bán kính ±1 quanh currentIndex.
   * Tất cả các tấm ảnh còn lại trong số 1.235 tấm KHÔNG được đưa vào DOM.
   */
  const luuGhiChu = useCallback(async () => {
    // Ghi chú nằm trên `selection_items`, không phải trên `photos`. Ảnh chưa chọn
    // thì không có dòng nào để cập nhật, và `.update()` chạy trúng 0 dòng vẫn
    // báo THÀNH CÔNG. Không chặn ở đây thì khách gõ ghi chú, thấy báo "đã lưu",
    // mà chữ mất trắng — và thợ chỉnh ảnh không bao giờ biết là có dặn dò.
    if (!onLuuGhiChu || !currentPhoto || isLocked) return;
    if (currentPhoto.mark !== "selected") return;
    if ((currentPhoto.retouchNote ?? "") === ghiChu) return;
    setDangLuuGhiChu(true);
    setKetQuaLuu(null);
    try {
      const xong = await onLuuGhiChu(currentPhoto, ghiChu);
      setKetQuaLuu(xong ? "ok" : "loi");
      // BB-287 mục #12 — chữ "Đã lưu ghi chú" đứng mãi tới khi ba mẹ gõ tiếp;
      // chủ studio muốn nó tự mờ sau 2 giây thay vì phải tự xoá bằng mắt.
      // Chỉ tự ẩn khi lưu THÀNH CÔNG — báo lỗi (`"loi"`) phải đứng yên cho
      // đến khi ba mẹ thử lại, ẩn tự động ở đó sẽ giấu mất lỗi.
      if (xong) {
        window.setTimeout(() => {
          setKetQuaLuu((hienTai) => (hienTai === "ok" ? null : hienTai));
        }, 2000);
      }
    } catch {
      setKetQuaLuu("loi");
    } finally {
      setDangLuuGhiChu(false);
    }
  }, [onLuuGhiChu, currentPhoto, ghiChu, isLocked]);

  const visibleIndices = useMemo(() => {
    return getVisibleIndices(currentIndex, total, 1);
  }, [currentIndex, total]);

  if (!currentPhoto) return null;

  const isCurrentSelected = currentPhoto.mark === "selected";

  // Lượt thả tim của tấm này còn đang gửi thì chưa có dòng chọn trên máy chủ —
  // ghi chú gửi lúc này bị từ chối. Khoá ô ghi chú tới khi tim lưu xong.
  const isMutating = mutatingIds.has(currentPhoto.id);
  // BB-321 — tấm đã chốt ở đợt trước: tim đứng yên (xem `khoaTimAnh`).
  const timBiKhoa = isLocked || (khoaTimAnh?.(currentPhoto) ?? false);
  const nhanDungCho = dungCho?.(currentPhoto) ?? [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={vi.common.view || "Xem ảnh"}
      // BB-298 — bản vẽ `xem-lon-may-tinh.html` (admin duyệt 28/09/2026, mục
      // #5 XONG.md): vùng trái màn xem lớn MÁY TÍNH phải là MỘT MÀU kem
      // #F3EDE5, KHÔNG "nhoè lưới phía sau" như nền trong mờ + blur cũ.
      //
      // BB-310 mục 4 — báo cáo chấm độc lập vòng 4: điện thoại vẫn dùng nền
      // trong mờ + blur cũ, lộ bóng lưới ảnh và chữ phía sau qua lớp kính —
      // "trông đục" (kh-dt-06b-xem-lon-anh-ngang). Áp CÙNG một nền kem đặc
      // cho cả hai khổ — không còn khác biệt theo `lg:`.
      className="fixed inset-0 z-50 flex flex-col justify-between bg-[#F3EDE5] text-[#2e2a27] select-none overflow-hidden touch-none"
      // Cố ý KHÔNG hiện bàn tay trên nền: con trỏ kế thừa xuống mọi thứ bên
      // trong (tấm ảnh, ô ghi chú), và nền trống chỉ là một dải mỏng quanh
      // ảnh. Xem tests/unit/con-tro-ban-tay.test.ts.
      data-con-tro="mac-dinh"
      onClick={(e) => {
        // Bấm vào vùng trống bên ngoài ảnh thì đóng lightbox
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      {/* THANH TRÊN — thứ tự ảnh, tải về, đóng. */}
      {/* ------------------------------------------------------------------
          Tim đã rời góc trên xuống ĐÁY màn hình (chủ studio duyệt 23/09/2026).

          Góc trên bên phải là chỗ xa ngón cái nhất khi cầm điện thoại một tay —
          mà thả tim là việc ba mẹ làm nhiều nhất ở màn này.

          Tên tệp — BB-210 (24/09/2026) từng đưa vào ("khách dễ kiểm soát và
          đối chiếu file tải về"), BB-289 lượt 3 (Opus, đối chiếu bản vẽ
          `xem-lon-dien-thoai.html`) BỎ LẠI: bản vẽ không có tên tệp ở đây,
          và BB-287 đã bỏ tên tệp khỏi lưới ảnh cùng lý do — khách không cần
          biết `BB289A_0001.jpg` nghĩa là gì, CSKH đối chiếu bằng số thứ tự
          hoặc công cụ nội bộ, không qua màn khách.
      */}
      {/* BB-319 (luật 2) — 13px + vùng chạm 44px: NÉT biểu tượng Đóng/Tải đứng đúng lề 24px như mọi màn khách. */}
      <header className="relative z-20 grid shrink-0 grid-cols-[1fr_auto_1fr] items-start px-[13px] py-4">
        <div className="flex justify-start">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label={vi.common.close}
            title={vi.common.close}
            className="flex h-11 w-11 items-center justify-center rounded-full text-[#2e2a27]/85 transition-colors hover:bg-black/5 active:scale-90 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
          >
            <X className="h-[22px] w-[22px]" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex min-w-0 flex-col items-center pt-1">
          {/* BB-289 lượt 2 — chip số thứ tự đúng bản vẽ (`.so`): nền trắng
              70% + viền mảnh + chữ mực, không còn `bg-white/10 text-white`
              (gần vô hình trên nền kính sáng mới). */}
          <div
            data-testid="chi-so-anh"
            className="flex h-[28px] items-center justify-center rounded-full border border-[#e5dcd2] bg-white/70 px-4 text-[13px] text-[#2e2a27]"
          >
            {/*
              BB-258 kiểm ngược — BB-253 tách "1 / 2" thành ba <span> không có
              khoảng trắng thật giữa các chữ số (chỉ cách nhau bằng CSS
              `mx-1`), nên `getByText(/1 \/ 2/)` của `e12-dien-thoai.spec.ts`
              không khớp `textContent` nữa ("1/2" không dấu cách). Giữ dấu
              cách THẬT trong span giữa để chữ vẫn đọc được bằng screen reader
              lẫn bằng phép thử tìm chữ.
            */}
            <span className="tabular-nums font-medium">{formatSo(currentIndex + 1)}</span>
            <span className="mx-1 text-[#6b6057]"> / </span>
            <span className="text-[#6b6057]">{formatSo(total)}</span>
          </div>
          {tenBe && (
            <span data-testid="xem-lon-ten-be" className="mt-1 max-w-full truncate text-[12px] text-[#6b6057]">
              {tenBe}
            </span>
          )}
        </div>

        <div className="flex justify-end">
          {onTaiAnh && menuTai && (
            // Chặn nổi bọt: bấm trong thực đơn không được lọt xuống lớp đóng màn xem lớn.
            <div onClick={(e) => e.stopPropagation()}>
              <MenuTaiAnh
                {...menuTai}
                onTaiDangXem={() => onTaiAnh(currentPhoto)}
                nutClassName="flex h-11 w-11 items-center justify-center rounded-full text-[#2e2a27]/85 transition-colors hover:bg-black/5 active:scale-90 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
              />
            </div>
          )}
          {onTaiAnh && !menuTai && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onTaiAnh(currentPhoto);
              }}
              aria-label={vi.gallery.downloadThis}
              title={vi.gallery.downloadThis}
              className="flex h-11 w-11 items-center justify-center rounded-full text-[#2e2a27]/85 transition-colors hover:bg-black/5 active:scale-90 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
            >
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {/*
        BỐ CỤC BA CỘT TỪ `lg`: quảng cáo — ảnh — bảng sản phẩm.

        Chủ studio 22/09/2026 chỉ vào ảnh chụp màn hình: hai bên tấm ảnh đang
        trống trơn trên máy tính, mà đó chính là chỗ nên hỏi "tấm này in ra cái
        gì". Dưới `lg` thì không chia cột — điện thoại chỉ đủ chỗ cho tấm ảnh,
        bảng sản phẩm rơi xuống dưới ô ghi chú.
      */}
      <div className="relative flex min-h-0 flex-1 w-full">
        {banner && (
          <aside className="hidden w-56 shrink-0 items-center justify-center p-3 xl:flex">
            {banner}
          </aside>
        )}

      <main
        ref={mainRef}
        className="relative flex-1 w-full h-full min-h-0 flex items-center justify-center overflow-hidden p-2 sm:p-4"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        // Cùng lý do với nền ngoài cùng: vùng này phần lớn là tấm ảnh.
        data-con-tro="mac-dinh"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            onClose();
          }
        }}
      >
        {/* Render cửa sổ trượt (tối đa 3 phần tử) */}
        {visibleIndices.map((idx) => {
          const photo = photos[idx];
          if (!photo) return null;
          const isCurrent = idx === currentIndex;
          const offsetDiff = idx - currentIndex;
          // Từ 1,5× trở lên nạp bản ảnh nét hơn (route /api/img đã có cỡ
          // 2048 trong THUMBNAIL_WIDTHS — không thêm cỡ mới). Bỏ luôn
          // `srcSet`/`sizes` khi dùng bản nét: trình duyệt chọn theo `sizes`
          // (không biết ảnh đang bị phóng), nên phải ép thẳng qua `src`.
          const dungAnhNet = isCurrent && anhNet;

          return (
            <div
              key={photo.id}
              ref={isCurrent ? truotHienTaiRef : undefined}
              className={cn(
                // BB-319 — máy tính: thanh Tim/Ghi chú/Đặt in nổi ở đáy vùng ảnh (xem <footer>), chừa đáy 84px để không đè ảnh.
                "absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none p-2 sm:p-4 lg:pb-[84px]",
                isCurrent ? "opacity-100 z-10" : "opacity-0 z-0 transition-transform duration-200 ease-out"
              )}
              style={{
                // Đọc từ REF, không phải hằng số: một lượt dựng lại KHÔNG do
                // đổi tấm (gõ ghi chú…) phải giữ đúng độ trượt/độ phóng đang
                // dở, không được để JSX ép nó về giá trị gốc.
                transform: isCurrent
                  ? `translateX(${swipeXRef.current}px)`
                  : `translateX(${offsetDiff * 100}%)`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={isCurrent ? anhHienTaiRef : undefined}
                src={buildLightboxImageUrl(photo.id, dungAnhNet ? 2048 : 1600, (photo as CoMaTepDrive).maTepDrive)}
                srcSet={dungAnhNet ? undefined : buildLightboxSrcSet(photo.id, (photo as CoMaTepDrive).maTepDrive)}
                sizes={dungAnhNet ? undefined : "100vw"}
                alt={photo.fileName || `Ảnh ${idx + 1}`}
                decoding="async"
                // Kính lúp thay cho bàn tay: nhấp vào ảnh là PHÓNG TO
                // (BB-210; BB-370 đổi nhấp đúp → nhấp một lần), nên con trỏ nói đúng việc đó. Đang phóng thì
                // handleImgMouseDown kéo ảnh — con trỏ đổi sang "nắm".
                // BB-289 lượt 3 — Opus chấm ảnh chụp: `w-auto h-auto` để
                // trình duyệt tự đo theo KÍCH THƯỚC GỐC của ảnh; máy chủ ảnh
                // môi trường thử (`playwright.config.ts`) trả một ảnh giả cỡ
                // rất nhỏ, nên ảnh chính hiện thành một CHẤM ~4px giữa màn —
                // bắt được đúng lỗi ẩn: cách cũ vốn cũng khiến một ảnh gốc độ
                // phân giải thấp (ảnh cũ quét lại, ảnh chụp màn hình…) hiện bé
                // tương tự trên PRODUCTION, không chỉ trong môi trường thử.
                // `w-full h-full` buộc khung ảnh LUÔN lấp đầy vùng dành cho
                // nó (viền `main`/`p-2 sm:p-4`), `object-contain` vẫn giữ
                // đúng tỉ lệ ảnh gốc bên trong khung đó — không cắt, không
                // méo, chỉ khác chỗ khung không còn phụ thuộc độ phân giải
                // ảnh gốc nữa. Đo bằng `tests/e2e/bb-289-theo-ban-ve.spec.ts`.
                // BB-310 mục 4 — báo cáo chấm độc lập vòng 4: ảnh dọc trên
                // máy tính "nằm trên tấm trắng giữa nền kem, thành hai tông"
                // (kh-mt-06-xem-lon). `w-full h-full` (giữ nguyên, lý do ở
                // trên) khiến khung <img> LUÔN bằng cả vùng `main` — với ảnh
                // dọc trên màn rộng, `shadow-2xl` (bóng đổ lớn) vẽ quanh
                // TRỌN khung đó, không phải quanh phần ảnh THẬT (object-
                // contain co lại ở giữa) — tạo cảm giác một "tấm" riêng nổi
                // trên nền. Bỏ bóng đổ từ `lg:` — ảnh đặt thẳng trên nền kem,
                // không có khung nổi nào bao quanh. Điện thoại giữ nguyên
                // (bóng đổ hợp lý hơn trên nền tràn màn không có viền khác).
                // BB-319 — bỏ bóng đổ ở CẢ điện thoại: bóng vẽ quanh TRỌN khung <img> (không
                // phải quanh phần ảnh thật khi object-contain), thành một "tấm" sáng có dải
                // trống trên/dưới ảnh ngang (vòng 5 + 6 đều ghi nhận). Ảnh nằm thẳng trên nền kem.
                className="w-full h-full object-contain select-none pointer-events-auto cursor-zoom-in"
                style={
                  isCurrent
                    ? {
                        transform: `translate(${zoomRef.current.x}px, ${zoomRef.current.y}px) scale(${zoomRef.current.scale})`,
                      }
                    : undefined
                }
                onClick={isCurrent ? handleImgClick : (e) => e.stopPropagation()}
                onMouseDown={isCurrent ? handleImgMouseDown : undefined}
                data-testid={isCurrent ? "anh-xem-lon" : undefined}
                // BB-314: `srcSet` (buildLightboxSrcSet) có ứng viên 800w —
                // cỡ đó nay bị `/api/img` điều hướng 302 sang lh3. Nếu lh3
                // lỗi (cho BẤT KỲ ứng viên nào trình duyệt chọn, kể cả
                // src chính 1600/2048), thử lại ĐÚNG MỘT LẦN qua route cũ
                // với `?qua=1` — bỏ luôn `srcSet` để trình duyệt không tự
                // chọn lại một ứng viên khác vẫn đang hỏng. `currentSrc` giữ
                // đúng URL trình duyệt vừa thử (không nhất thiết là `src`
                // gốc khi có `srcSet`). `dataset.qua` chặn lỗi lần hai gọi
                // lại chính nó — tránh vòng lặp lỗi vô hạn.
                onError={(e) => {
                  const img = e.currentTarget;
                  if (img.dataset.qua === "1") return;
                  img.dataset.qua = "1";
                  const urlLoi = img.currentSrc || img.src;
                  const url = new URL(urlLoi, window.location.origin);
                  img.removeAttribute("srcset");
                  // BB-341 — ảnh đi THẲNG lh3 lỗi: lùi về route cũ qua proxy, đúng cỡ đang xem.
                  if (url.origin !== window.location.origin) {
                    img.src = urlAnhDuPhong(photo.id, dungAnhNet ? 2048 : 1600);
                    return;
                  }
                  url.searchParams.set("qua", "1");
                  img.src = url.toString();
                }}
              />
            </div>
          );
        })}

        {/* Thu về 1× — chỉ hiện khi đang phóng. */}
        {dangPhong && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              datLaiPhong(true);
            }}
            className="absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[13px] text-white/90 backdrop-blur-md active:scale-95"
          >
            <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Thu về
          </button>
        )}

        {/* Nút lùi ảnh (Desktop & Tablet) */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label={vi.ui.pagination.previous}
            // BB-298 — bản vẽ: vùng trái máy tính nay nền kem đặc, mũi tên tối
            // trên nền kem lạc tông; đổi sang viên kem/viền mảnh + icon mực từ
            // `lg:` (mục ".mui" trong `xem-lon-may-tinh.html`). Điện thoại giữ
            // nguyên viên tối cũ.
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md hover:bg-black/70 hover:text-white transition-all active:scale-90 lg:h-12 lg:w-12 lg:bg-[rgba(253,251,249,0.9)] lg:text-[#2e2a27] lg:ring-1 lg:ring-[#e5dcd2] lg:backdrop-blur-none lg:hover:bg-white"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}

        {/* Nút tiến ảnh (Desktop & Tablet) */}
        {currentIndex < total - 1 && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label={vi.ui.pagination.next}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 hidden sm:flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-white/90 backdrop-blur-md hover:bg-black/70 hover:text-white transition-all active:scale-90 lg:bg-[rgba(253,251,249,0.9)] lg:text-[#2e2a27] lg:ring-1 lg:ring-[#e5dcd2] lg:backdrop-blur-none lg:hover:bg-white"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </main>

        {/*
          Bảng "tấm này in ra cái gì" — cột phải trên máy tính.

          BB-293 vòng 2 mục #3 — giám đốc: LÀM LẠI. Nền tối đặc (vòng 1) trái
          với quyết định của admin trên bản vẽ BB-285 ("không phải nền tối mà
          là nền trong nhìn được bên dưới"). Đúng bản vẽ
          `xem-lon-dat-in-dien-thoai.png`: nền KÍNH SÁNG
          `rgba(253,251,249,.92)` + `backdrop-blur`, chữ mực #2E2A27, chữ phụ
          #6b6057, viền trái 1px #e5dcd2 — cùng công thức với tấm trượt sản
          phẩm trên điện thoại (`.kinh` toàn màn), không phải nền đặc như
          `#2E2A27` nữa. `BangSanPhamCuaAnh` nhận `tong="sang"` để đổi chữ
          trắng cũ (dựng cho tấm trượt TỐI trên điện thoại) sang tông sáng —
          tấm trượt điện thoại bên dưới gọi lại đúng như cũ (không truyền
          `tong`, mặc định `"toi"`), không đổi gì ở đó.
        */}
        {(bangSanPham || onLuuGhiChu) && currentPhoto && (
          <aside
            ref={asideRef}
            className="hidden w-72 shrink-0 space-y-4 overflow-y-auto border-l border-[#e5dcd2] bg-[rgba(253,251,249,0.92)] p-4 text-[#2E2A27] backdrop-blur-md lg:block"
            onClick={(e) => e.stopPropagation()}
          >
            {bangSanPham?.(currentPhoto, "sang")}

            {onLuuGhiChu && (
              <div>
                <label
                  htmlFor="ghi-chu-anh-ben-phai"
                  className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#6b6057]"
                >
                  Ghi chú cho thợ chỉnh ảnh
                </label>
                {/* BB-370 (anh 06/10, ảnh 1c8e9516) — bộ đã chốt: ô nhập bị khoá + mờ 50% nên
                    ghi chú ba mẹ đã gửi gần như KHÔNG đọc được (chỉ thấy chữ mờ "đã chốt").
                    Nay hiện nguyên văn ghi chú, chữ đậm rõ, chỉ đọc. */}
                {isLocked ? (
                  <GhiChuChiDoc ghiChu={currentPhoto.retouchNote} />
                ) : (
                <textarea
                  id="ghi-chu-anh-ben-phai"
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  onBlur={luuGhiChu}
                  disabled={isLocked || dangLuuGhiChu || !isCurrentSelected || isMutating}
                  rows={3}
                  maxLength={500}
                  placeholder={
                    isLocked
                      ? vi.gallery.noteLocked
                      : !isCurrentSelected
                        ? vi.gallery.noteNeedsSelect
                        : vi.gallery.noteHint
                  }
                  className="w-full resize-none rounded-xl border border-[#e5dcd2] bg-white px-3 py-2 text-xs text-[#2E2A27] outline-hidden placeholder:text-[#8a8078] focus:border-[#2E2A27]/40 disabled:opacity-50"
                />
                )}
                <div className="mt-1 h-4 text-[11px]" aria-live="polite">
                  {/*
                    BB-293 vòng 2 mục #3 — giám đốc chốt màu "Đã lưu ghi chú"
                    trên nền sáng là sage ĐẬM #4F5B45 (không phải
                    `--bb-accent` #7fa99b — quá nhạt trên nền kem, dưới
                    4.5:1). #4F5B45 trên #fdfbf9 đạt ~5.2:1.
                  */}
                  {ketQuaLuu === "ok" && (
                    <span className="inline-flex items-center gap-1 text-[#4F5B45]">
                      <span aria-hidden="true">✓</span>
                      {vi.gallery.noteSaved}
                    </span>
                  )}
                  {ketQuaLuu === "loi" && (
                    <span className="text-[var(--bb-heart,#C4645A)]">{vi.gallery.noteSaveFailed}</span>
                  )}
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* ------------------------------------------------------------------
          THANH ĐÁY.
          ------------------------------------------------------------------
          BB-289 lượt 3 — Opus chấm ảnh chụp: viên tối kiểu cũ không khớp bản
          vẽ `xem-lon-dien-thoai.html` (`.thanh`): dải KEM KÍNH TRONG
          (`rgba(253,251,249,.6)` + blur), BA CỘT ĐỀU Tim · Ghi chú · Đặt in
          — mỗi cột icon 22px + nhãn chữ 11px NGAY DƯỚI, chữ mực; tim đã chọn
          tô hồng đất (`#C4645A`). Khác điện thoại, MÁY TÍNH (`lg`) đã có cột
          phải riêng cho ghi chú/sản phẩm (`bangSanPham` render thẳng trong
          `<aside>` ở trên) nên dải đáy ở `lg` chỉ còn đúng nút tim — giữ
          nguyên cách làm cũ cho `lg`, chỉ đổi bản ĐIỆN THOẠI.

          Thanh này KHÔNG phủ lên ảnh: nó là một hàng riêng dưới tấm ảnh, nên
          chân ảnh (thường là chân bé) không bị che — đúng điều chủ studio đã
          chốt ngày 17/09 khi bỏ hai nút to đè lên đáy ảnh.
      */}
      <footer
        // BB-310 mục 4 — cùng nền kem đặc như gốc (không còn kính mờ trên
        // điện thoại), xem ghi chú ở nền gốc phía trên.
        // BB-319 — máy tính: thanh đáy NỔI trên đáy cột ảnh (absolute, chừa đúng bề rộng cột
        // phải `w-72`), để cột phải chạy trọn chiều cao màn — không còn một tấm dừng lơ lửng
        // ở y≈818 với dải trống bên dưới (K4/K5 máy tính).
        className="relative z-20 shrink-0 border-t border-[#e5dcd2] bg-[#F3EDE5] pb-[max(10px,env(safe-area-inset-bottom))] lg:absolute lg:bottom-0 lg:left-0 lg:right-72 lg:border-0 lg:bg-transparent lg:px-4 lg:pt-2"
        onClick={(e) => e.stopPropagation()}
      >
        {nhanDungCho.length > 0 && (
          <div className="mx-auto flex max-w-md flex-wrap justify-center gap-1.5 pt-2.5 lg:mb-2.5 lg:pt-0">
            {nhanDungCho.map((n) => (
              <span
                key={n}
                className={cn(CHIP_NGUYEN_KHOI, "overflow-hidden text-ellipsis rounded-full border border-[#9db08b]/60 bg-[#6c7a5f]/15 px-3 py-1 text-[12px] text-[#4a5a41]")}
              >
                — {n}
              </span>
            ))}
          </div>
        )}

        {/* ĐIỆN THOẠI/BẢNG — ba cột đều, đúng bản vẽ. */}
        <div
          data-testid="thanh-day-3-cot"
          className={cn(
            "mx-auto grid max-w-md py-2.5 lg:hidden",
            onLuuGhiChu && bangSanPham ? "grid-cols-3" : onLuuGhiChu || bangSanPham ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          <button
            type="button"
            disabled={timBiKhoa || isMutating}
            onClick={() => onToggleHeart(currentPhoto)}
            aria-label={isCurrentSelected ? vi.gallery.deselect : vi.gallery.select}
            aria-pressed={isCurrentSelected}
            className="flex flex-col items-center gap-1.5 py-1 text-[11px] tracking-wide text-[#2e2a27] transition active:scale-95 disabled:opacity-40 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
          >
            <Heart
              className="h-[22px] w-[22px]"
              style={isCurrentSelected ? { color: "#C4645A" } : undefined}
              fill={isCurrentSelected ? "currentColor" : "none"}
              strokeWidth={isCurrentSelected ? 0 : 1.6}
            />
            Tim
          </button>

          {onLuuGhiChu && (
            <button
              type="button"
              onClick={() => {
                if (tamMo === "ghi-chu") {
                  void luuGhiChu();
                  setTamMo(null);
                } else {
                  setTamMo("ghi-chu");
                }
              }}
              aria-label="Ghi chú cho thợ chỉnh ảnh"
              aria-expanded={tamMo === "ghi-chu"}
              className={cn(
                "flex flex-col items-center gap-1.5 py-1 text-[11px] tracking-wide transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2",
                tamMo === "ghi-chu" || currentPhoto.retouchNote ? "text-[#C4645A]" : "text-[#2e2a27]",
              )}
            >
              <PenLine className="h-[22px] w-[22px]" strokeWidth={1.6} />
              Ghi chú
            </button>
          )}

          {bangSanPham && (
            <button
              type="button"
              onClick={() => setTamMo("san-pham")}
              aria-label="Sản phẩm cho tấm ảnh này"
              aria-expanded={tamMo === "san-pham"}
              className="flex flex-col items-center gap-1.5 py-1 text-[11px] tracking-wide text-[#2e2a27] transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
            >
              <Printer className="h-[22px] w-[22px]" strokeWidth={1.6} />
              Đặt in
            </button>
          )}
        </div>

        <div className={cn("mx-auto max-w-md overflow-hidden px-6 transition-all duration-300 lg:hidden", tamMo === "ghi-chu" ? "max-h-[150px] pb-3 opacity-100" : "max-h-0 opacity-0")}>
          {onLuuGhiChu && isLocked && <GhiChuChiDoc ghiChu={currentPhoto.retouchNote} />}
          {onLuuGhiChu && !isLocked && (
            <input
              id="ghi-chu-anh"
              type="text"
              value={ghiChu}
              onChange={(e) => setGhiChu(e.target.value)}
              onBlur={luuGhiChu}
              disabled={isLocked || dangLuuGhiChu || !isCurrentSelected || isMutating}
              maxLength={500}
              placeholder={
                isLocked
                  ? vi.gallery.noteLocked
                  : !isCurrentSelected
                    ? vi.gallery.noteNeedsSelect
                    : "Ghi chú cho thợ chỉnh ảnh"
              }
              // BB-329 mục 2 — 16px: dưới 16px Safari iOS tự phóng to trang khi
              // chạm ô này và không thu lại; màn xem lớn khoá cử chỉ nên ba mẹ
              // kẹt ở màn phóng, tràn phải (ảnh 6ce23a90). Xem globals.css.
              className="w-full rounded-[12px] border border-[#2e2a27]/20 bg-white/70 px-4 py-3 text-[16px] text-[#2e2a27] placeholder-[#6b6057] focus:border-[#2e2a27]/50 focus:outline-hidden disabled:opacity-50"
            />
          )}
        </div>

        {/*
          MÁY TÍNH (`lg`) — bản vẽ `xem-lon-may-tinh.html` (admin duyệt
          28/09/2026, mục #6 XONG.md): thanh Tim · Ghi chú · Đặt in, ba cột
          đều trong MỘT viên kem, vạch ngăn mảnh giữa các cột — không còn chỉ
          một nút tim tròn riêng lẻ.

          "Ghi chú" và "Đặt in" không mở tấm trượt riêng như điện thoại — cột
          phải (`asideRef`) đã hiện sẵn cả hai mục đó ở máy tính, nên hai nút
          này chỉ đưa mắt/tiêu điểm tới đúng chỗ đã có, không dựng đường lưu
          thứ hai. Vị trí: trong dòng chảy của `footer` (không `absolute` đè
          lên ảnh như bản vẽ) — tránh chồng lấn với các phép thử đo khung ảnh
          hiện có (`bb-289-theo-ban-ve.spec.ts`); nhóm ba nút + vạch ngăn +
          nhãn dưới icon vẫn đúng bản vẽ.
        */}
        <div className="mx-auto hidden max-w-md lg:block lg:pb-2">
          <div className="mx-auto flex h-[56px] w-fit items-center gap-1 rounded-full border border-[#e5dcd2] bg-[rgba(253,251,249,0.92)] px-2 shadow-[0_10px_28px_-14px_rgba(46,42,39,0.3)]">
            <button
              type="button"
              disabled={timBiKhoa || isMutating}
              onClick={() => onToggleHeart(currentPhoto)}
              aria-label={isCurrentSelected ? vi.gallery.deselect : vi.gallery.select}
              aria-pressed={isCurrentSelected}
              className={cn(
                "flex h-[44px] items-center gap-2 rounded-full px-5 text-[14px] font-medium transition active:scale-95 disabled:opacity-40",
                isCurrentSelected ? "text-[#C4645A]" : "text-[#2e2a27]",
              )}
            >
              <Heart
                className="h-5 w-5"
                fill={isCurrentSelected ? "currentColor" : "none"}
                strokeWidth={isCurrentSelected ? 0 : 1.8}
              />
              Tim
            </button>

            {onLuuGhiChu && (
              <>
                <span className="h-[22px] w-px bg-[#e5dcd2]" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => {
                    document.getElementById("ghi-chu-anh-ben-phai")?.focus();
                  }}
                  aria-label="Ghi chú cho thợ chỉnh ảnh"
                  className="flex h-[44px] items-center gap-2 rounded-full px-5 text-[14px] font-medium text-[#2e2a27] transition active:scale-95"
                >
                  <PenLine className="h-5 w-5" strokeWidth={1.8} />
                  Ghi chú
                </button>
              </>
            )}

            {bangSanPham && (
              <>
                <span className="h-[22px] w-px bg-[#e5dcd2]" aria-hidden="true" />
                <button
                  type="button"
                  onClick={() => {
                    asideRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  aria-label="Sản phẩm cho tấm ảnh này"
                  className="flex h-[44px] items-center gap-2 rounded-full px-5 text-[14px] font-medium text-[#2e2a27] transition active:scale-95"
                >
                  <Printer className="h-5 w-5" strokeWidth={1.8} />
                  Đặt in
                </button>
              </>
            )}
          </div>
        </div>
      </footer>

      {/* ------------------------------------------------------------------
          TẤM TRƯỢT (điện thoại) — bảng sản phẩm hoặc ô ghi chú.
          ------------------------------------------------------------------
          Gốc của màn xem lớn chặn mọi cử chỉ chạm (`touch-none`) để vuốt lật
          ảnh không làm trang nhảy. Tấm trượt cần cuộn được, nên mở lại cử chỉ
          cuộn dọc riêng cho nó (`touch-pan-y`).
      */}
      {tamMo === "san-pham" && (
        <div
          className="fixed inset-0 z-40 flex flex-col justify-end bg-black/55 lg:hidden cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            if (e.target === e.currentTarget) {
              setTamMo(null);
            }
          }}
        >
          <div
            role="dialog"
            // BB-289 lượt 3 — kiểm ngược bắt được: đổi aria-label này thành
            // "Tấm này dùng cho…" ở lượt 2 làm ĐỎ test có sẵn
            // `bb-277-ban-phim.spec.ts` ("Bù độ phủ BB-275…" đợi
            // `getByRole("dialog", {name: "In ảnh này"})`). Tên TRUY CẬP
            // (aria-label) và TIÊU ĐỀ NHÌN THẤY (h2 "Tấm này dùng cho…" ngay
            // dưới) không bắt buộc trùng nhau — giữ nguyên tên truy cập cũ,
            // chỉ đổi chữ hiển thị theo bản vẽ.
            aria-label="In ảnh này"
            data-testid="tam-truot-dung-cho"
            // BB-310 mục 5 — báo cáo chấm độc lập vòng 4: nền gần đen
            // (#231e1a) lạc hẳn khỏi hệ màu kem của toàn app ("mảng tối lạc
            // giữa hệ kem" — kh-dt-07b-san-pham-tam-nay). Đổi sang cùng hệ
            // kem #fdfbf9 + chữ mực #2E2A27 như mọi tấm trượt khác, và
            // `bangSanPham` gọi với `tong="sang"` (đã có sẵn ở
            // `bang-san-pham-cua-anh.tsx`, dựng cho đúng trường hợp nền
            // sáng này) thay vì mặc định `tong="toi"`.
            className="max-h-[75vh] cursor-auto touch-pan-y overflow-y-auto rounded-t-[28px] bg-[#fdfbf9] px-6 pb-[max(20px,env(safe-area-inset-bottom))] pt-3 text-[#2E2A27] shadow-2xl animate-in slide-in-from-bottom-8"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#2E2A27]/15" aria-hidden="true" />
            {/*
              BB-289 lượt 2 — tiêu đề đúng bản vẽ `xem-lon-dat-in-dien-thoai.png`:
              "Tấm này dùng cho…" + phụ đề số thứ tự, nút × đóng cùng hàng.
              Trước đây tấm trượt không có tiêu đề riêng, mở thẳng vào hai
              khối "Trong gói"/"Mua thêm" — ba mẹ không rõ đang cấu hình cho
              tấm nào nếu đã cuộn qua vài lần.
            */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-2xl font-normal">Tấm này dùng cho…</h2>
                <p className="mt-1 text-[13px] text-[#6b6057]">
                  Tấm {currentIndex + 1} · chọn được nhiều mục
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTamMo(null)}
                aria-label={vi.common.close}
                className="shrink-0 rounded-full p-1.5 text-[#2E2A27]/70 transition hover:bg-black/5"
              >
                <X className="h-5 w-5" strokeWidth={1.6} aria-hidden="true" />
              </button>
            </div>
            {bangSanPham?.(currentPhoto, "sang")}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * BB-370 — ghi chú đã lưu của tấm đang xem, CHỈ ĐỌC (bộ đã chốt). Chữ mực đủ
 * tương phản (không `opacity-50` như ô nhập bị khoá), xuống dòng đúng như ba mẹ
 * đã gõ. Không có ghi chú thì một dòng phụ nhỏ — không để ô trống trơn.
 */
function GhiChuChiDoc({ ghiChu }: { ghiChu: string | null | undefined }) {
  const chu = ghiChu?.trim();
  return (
    <div data-testid="ghi-chu-chi-doc">
      {chu ? (
        <>
          <p className="whitespace-pre-wrap break-words rounded-xl border border-[#e5dcd2] bg-white px-3 py-2.5 text-[13px] leading-relaxed text-[#2E2A27]">
            {chu}
          </p>
          <p className="mt-1.5 text-[11px] text-[#6b6057]">{giuA(vi.gallery.noteLocked)}</p>
        </>
      ) : (
        <p className="text-[12px] text-[#6b6057]">{giuA(vi.gallery.noteKhongCo)}</p>
      )}
    </div>
  );
}
