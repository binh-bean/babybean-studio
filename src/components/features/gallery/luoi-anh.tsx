"use client";

/**
 * Lưới ảnh của màn khách — xếp so le, giữ đúng khung, chỉ dựng tấm đang nhìn.
 *
 * OWNER: DEV-FE. Chủ studio duyệt 23/09/2026 hướng "cuốn album kỷ niệm".
 *
 * Tách khỏi `gallery-app.tsx` (khi đó đã hơn 2.100 dòng) vì phần này có luật
 * riêng về hiệu năng, và luật đó dễ bị phá nhất khi ai đó sửa giao diện.
 *
 * ---------------------------------------------------------------------------
 * BA LUẬT HIỆU NĂNG ĐÃ ĐO (BB-131, bộ 1.235 tấm, điện thoại CPU chậm 4×)
 * ---------------------------------------------------------------------------
 *  1. Chỉ dựng tấm trong tầm nhìn (± một màn hình). Dựng đủ 1.235 tấm là
 *     11.262 nút DOM và tác vụ chặn 360ms — trong 360ms đó điện thoại không
 *     nhận chạm.
 *  2. `TheAnh` được `memo`, và MỌI prop của nó là giá trị đơn (số, chuỗi,
 *     boolean) hoặc hàm ổn định. Truyền một Set hay một object style mới mỗi
 *     lần dựng là memo thành vô dụng: thả tim một tấm lại dựng lại cả lưới.
 *  3. Cửa sổ dựng chỉ đổi khi cuộn qua nửa màn hình, không đổi theo từng pixel
 *     cuộn — nên cuộn không kéo theo một lượt dựng mỗi khung hình.
 *
 * Bảng đo gốc của BB-131 (lưới vuông cũ, bản dựng production, 375×812, CPU
 * chậm 4×, mạng 1,6 Mbps). Lưới so le giữ nguyên ba luật trên, nên phải giữ
 * được các con số cột "sau" — đo lại nếu đổi cách dựng:
 *
 *                              trước      sau
 *   tấm đầu tiên hiện ra       6.134ms    3.959ms
 *   thẻ ảnh nằm trong DOM      1.235      10
 *   nút DOM                    11.262     244
 *   tác vụ chặn dài nhất       360ms      179ms
 *   bộ nhớ JS                  9,2 MB     5,4 MB
 *   thả tim ở tấm thứ 900      44ms       4,8ms
 */

import { urlAnh, urlAnhDuPhong } from "@/lib/utils/anh-lh3";
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Heart, Lock, Printer } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { chonCoAnhTheoO } from "@/lib/utils/chon-co-anh";
import { vi } from "@/i18n";
import type { PhotoPublic } from "@/types/domain";
import {
  kheSoLe,
  oTrongTamNhin,
  soCotSoLe,
  tiLeCuaAnh,
  xepSoLe,
} from "@/lib/gallery/xep-so-le";

/**
 * Chiều cao dành cho dòng chú thích tên tệp dưới mỗi ô ảnh (BB-210) — khớp
 * với `caoChuThich` cộng vào `xepSoLe` bên dưới. Đủ cho một dòng 11px cộng
 * khoảng cách nhỏ phía trên, không cần đo chữ thật vì luôn cắt một dòng.
 */
const CAO_CHU_THICH = 18;

interface TheAnhProps {
  photo: PhotoPublic;
  thuTu: number;
  daChon: boolean;
  dangGui: boolean;
  khoa: boolean;
  /** Tấm này đang làm bao nhiêu sản phẩm (in, khung, album, mua thêm). */
  soSanPham: number;
  /**
   * BB-218 — chế độ "chọn để so sánh" đang bật: bấm ảnh là ĐÁNH DẤU so sánh,
   * không mở màn xem lớn. Giá trị đơn (boolean), giống mọi prop khác của thẻ
   * này — xem LUẬT 2 đầu tệp.
   */
  soSanhBat: boolean;
  /** Thứ tự 1–4 trong danh sách so sánh; 0 = tấm này chưa được đánh dấu. */
  soSanhThuTu: number;
  /**
   * BB-321 — màn "Chọn thêm ảnh · Đợt N": số đợt đã chốt tấm này (1, 2, …);
   * 0 = tấm chưa thuộc đợt nào. > 0 thì KHÔNG có tim: huy hiệu khoá "Đợt N"
   * đứng đúng chỗ tim (bản vẽ BB-321 anh duyệt 29/09/2026) — một dấu duy nhất,
   * không có nút bấm giả. Giá trị đơn — LUẬT 2 đầu tệp.
   */
  dotKhoa: number;
  /** BB-345 — gia đình (link mời) đã thả tim tấm này. Chỉ lưới của ba mẹ truyền. */
  giaDinhThich?: boolean;
  /** Vị trí trong lưới. Thiếu (nhánh dự phòng) thì thẻ tự xếp theo dòng chảy. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  onToggle: (photo: PhotoPublic) => void;
  onOpen: (thuTu: number) => void;
  onToggleSoSanh: (photo: PhotoPublic) => void;
}

const TheAnh = memo(function TheAnh({
  photo,
  thuTu,
  daChon,
  dangGui,
  khoa,
  soSanPham,
  soSanhBat,
  soSanhThuTu,
  dotKhoa,
  giaDinhThich = false,
  x,
  y,
  w,
  h,
  onToggle,
  onOpen,
  onToggleSoSanh,
}: TheAnhProps) {
  const coViTri = x !== undefined && y !== undefined && w !== undefined && h !== undefined;

  const moAnhHoacSoSanh = () => (soSanhBat ? onToggleSoSanh(photo) : onOpen(thuTu));

  return (
    <div
      // BB-277 kiểm ngược — nhiều phép thử E2E có TỪ TRƯỚC (bb-274/275, e11,
      // bb-202, bb-240) bấm thẳng qua DOM bằng
      // `theAnhEl.evaluate(el => el.click())` lên CHÍNH div này (lý do: thẻ
      // ảnh nằm trên khung toạ độ tuyệt đối do toán xếp so le tính, nên
      // `locator.click()` thật của Playwright đôi lúc bị chặn bởi phép kiểm
      // "phần tử đã đứng yên"). Bỏ hẳn onClick ở đây (dồn hết vào nút "Xem ảnh
      // N" bên trong) làm mọi phép thử đó BẤM KHÔNG TRÚNG GÌ — màn xem lớn
      // không bao giờ mở, và các ca liên quan treo tới hết timeout.
      //
      // Giữ onClick ở đây SONG SONG với nút bên trong, nhưng chỉ chạy khi
      // đích bấm là CHÍNH div này (`e.target === e.currentTarget`) — bấm thật
      // vào nút con sẽ nổi bọt lên đây với `target` là nút, nên bị chặn ở đây,
      // tránh gọi hành động hai lần (mở/so sánh) cho một cú bấm chuột thật.
      onClick={(e) => {
        if (e.target !== e.currentTarget) return;
        moAnhHoacSoSanh();
      }}
      // Chỗ bám cố định cho phép thử trình duyệt. "Ảnh đầu tiên trên trang"
      // không còn là ảnh trong lưới từ khi có ảnh bìa (23/09/2026).
      data-testid="the-anh"
      className={cn("cursor-pointer", coViTri ? "absolute" : "relative mb-3 break-inside-avoid")}
      style={coViTri ? { left: x, top: y, width: w, height: h! + CAO_CHU_THICH } : undefined}
    >
      {/* Ô ảnh — kích thước ĐÚNG ảnh, không lẫn với dòng chú thích bên dưới. */}
      <div
        className="group relative overflow-hidden rounded-[4px] bg-[#e9e1d6]"
        style={coViTri ? { width: w, height: h } : { aspectRatio: `1 / ${tiLeCuaAnh(photo.width, photo.height)}` }}
      >
        {/*
          BB-277 kiểm ngược (axe `nested-interactive`) — trước bản vá, cả Ô này
          (div) LẪN nút tim bên trong đều mang vai trò bấm-được, một cái lồng
          trong cái kia — trình đọc màn hình không phân biệt được đâu là widget
          nào. Nút "mở ảnh lớn" nay là một <button> RIÊNG, phủ kín Ô ảnh, đứng
          NGANG HÀNG (không lồng) với nút tim — nút tim nằm SAU trong DOM và có
          `z-10` nên vẫn nhận đúng cú bấm/phím ở góc của nó, còn bấm chỗ khác
          trong Ô mới rơi vào nút mở ảnh lớn này.
        */}
        <button
          type="button"
          onClick={moAnhHoacSoSanh}
          aria-label={soSanhBat ? `Đánh dấu ảnh ${thuTu + 1} để so sánh` : `Xem ảnh ${thuTu + 1}`}
          className="absolute inset-0 z-0 block h-full w-full cursor-pointer rounded-[4px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
        />

        {/*
          BB-311 (mục #5, báo cáo vận hành vòng 4): TỰ chọn cỡ theo bề rộng ô
          thật × DPR GIỚI HẠN ở 2 (`chonCoAnhTheoO`), thay vì để trình duyệt tự
          chọn qua `srcSet`/`sizes` theo `devicePixelRatio` THẬT. Trên điện
          thoại DPR 3 đo trong báo cáo, một ô 186px trước đây luôn kéo bản
          800w (136KB); giới hạn DPR ở 2 chỉ cần bậc 400w (45KB, giảm ~67%) mà
          vẫn đủ nét cho ảnh XEM LƯỚT — không phải ảnh xem lớn (xem
          `photo-lightbox.tsx`, vẫn dùng DPR thật). Bỏ `srcSet`/`sizes`: đã tự
          chọn đúng cỡ, không cần trình duyệt chọn lại. Cỡ này giờ KHÔNG được
          đệm Storage nữa (`/api/img` chỉ đệm ảnh bìa) — luôn lấy trực tiếp từ
          Google, nên chọn nhỏ đúng mức càng quan trọng hơn trước.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          // BB-341 — thẳng lh3 khi `/api/g/photos` đã trả mã tệp (bỏ vòng 302 qua hàm).
          src={urlAnh(photo, chonCoAnhTheoO(w))}
          alt={`Ảnh ${thuTu + 1}`}
          loading="lazy"
          decoding="async"
          width={photo.width ?? undefined}
          height={photo.height ?? undefined}
          className="pointer-events-none relative h-full w-full select-none object-cover transition-transform duration-500 ease-out group-hover:scale-[1.015]"
          // BB-314: cỡ này (w<=800) nay được `/api/img` điều hướng 302 thẳng
          // sang lh3.googleusercontent.com (xem route). Nếu lh3 lỗi ngay
          // trên trình duyệt khách (chặn CORS lạ, quá tải tạm thời…), thử
          // lại ĐÚNG MỘT LẦN qua chính route cũ với `?qua=1` — route thấy cờ
          // này thì bỏ qua điều hướng, tự kéo ảnh qua Vercel như trước bản
          // vá. Đánh dấu bằng `dataset.qua` để lần lỗi THỨ HAI không tự gọi
          // lại chính nó — tránh vòng lặp lỗi vô hạn.
          onError={(e) => {
            const img = e.currentTarget;
            if (img.dataset.qua === "1") return;
            img.dataset.qua = "1";
            img.src = urlAnhDuPhong(photo.id, chonCoAnhTheoO(w));
          }}
        />
        {/*
          BB-287 mục #6 — viền 1px đen quanh tấm đã chọn từng nhìn như lỗi
          hiển thị, không giống một trạng thái "đã chọn". Chủ studio 23/09
          (bản vẽ BB-281) không có viền này: trạng thái chọn chỉ thể hiện
          bằng tim đặc terracotta + lớp phủ ấm 6% để vẫn nhận ra tấm đã chọn
          cả khi tim nằm ngoài vùng nhìn (ảnh dài, đã cuộn qua tim).
        */}
        {daChon && dotKhoa === 0 && (
          <span className="pointer-events-none absolute inset-0 rounded-[4px] bg-[#c4645a]/[0.06]" />
        )}

        {/*
          BB-218 — dấu số 1–4 khi tấm đang được đánh dấu để so sánh. Góc PHẢI
          TRÊN: bên trái đã có dấu sản phẩm in, bên dưới phải là tim.
        */}
        {/*
          BB-296 mục #4 — báo cáo chấm độc lập lần 3: vòng số ở GÓC TRÊN bị
          thanh đầu dính của lưới (sticky, không thuộc phần sở hữu của mục
          này — xem AGENTS "Không đụng: ... lưới, thanh đầu lưới") che gần
          hết mỗi khi tấm vừa chọn nằm ngay dưới thanh đầu. Đề bài cho hai
          lối ra, chọn lối KHÔNG đụng thanh đầu: đặt vòng số ở GÓC DƯỚI —
          tim đã ẩn khi `soSanhBat` (xem chú thích dưới) nên không tranh chỗ.
        */}
        {soSanhBat && soSanhThuTu > 0 && (
          <span className="pointer-events-none absolute bottom-2 right-2 z-10 grid h-6 w-6 place-items-center rounded-full bg-[#2a2420] text-[12px] font-semibold text-white shadow-sm">
            {soSanhThuTu}
          </span>
        )}

        {/* BB-345 — dấu nhỏ "gia đình thích", góc DƯỚI TRÁI: không tranh chỗ tim (dưới phải) và huy hiệu in (trên trái). */}
        {giaDinhThich && !soSanhBat && (
          <span
            data-testid="dau-gia-dinh-thich"
            className="pointer-events-none absolute bottom-2 left-2 z-10 flex items-center gap-1 rounded-full bg-[#fffdf9]/90 px-2 py-[3px] text-[11px] font-medium text-[#8a4b3c] shadow-sm"
            title="Gia đình đã thả tim tấm này"
          >
            <Heart className="h-3 w-3 fill-current" aria-hidden="true" />
            Gia đình
          </span>
        )}

        {/* Tấm đã dùng làm sản phẩm in — màu rêu, bên TRÁI, không đấu với tim. */}
        {soSanPham > 0 && (
          <span
            className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded-full bg-[#fffdf9]/90 px-2 py-[3px] text-[11px] font-medium text-moss shadow-sm"
            title={`Tấm này đang làm ${soSanPham} sản phẩm`}
          >
            <Printer className="h-3 w-3" aria-hidden="true" />
            {soSanPham}
          </span>
        )}

        {/*
          TIM: vùng chạm 48×48 ở góc, hình vẽ chỉ 32px.

          Tim cũ là vòng tròn đen 44px trên MỌI tấm — lưới 300 tấm thành 300 chấm
          đen. Hình nhỏ lại cho ảnh là thứ nổi bật, nhưng vùng chạm vẫn đủ lớn cho
          ngón tay.

          Bộ ảnh đã khoá thì tấm chưa chọn không hiện tim: một nút bấm không được
          là một lời hứa sai.

          BB-289 lượt 2 — bản vẽ `so-sanh-dien-thoai.html` (lưới CHỌN tấm để
          so sánh): mỗi ô chỉ có MỘT dấu duy nhất, vòng số thứ tự (1–4), không
          còn tim. Hai việc khác nhau ở cùng một ô (thả tim VÀ đánh dấu so
          sánh) tranh nhau đúng một cú chạm — ẩn tim khi `soSanhBat` để cú
          chạm vào ô chỉ còn một nghĩa. Tim quay lại bình thường khi tắt chế
          độ so sánh; màn SO SÁNH THẬT (`so-sanh-anh.tsx`, dải điều khiển dưới
          ảnh) vẫn giữ tim riêng của nó, không đụng ở đây.
        */}
        {/*
          BB-321 — tấm đã chốt ở đợt trước (màn "Chọn thêm ảnh · Đợt N"): huy
          hiệu khoá "Đợt N" THAY CHỖ tim, cùng góc dưới phải — mỗi ô chỉ một
          dấu, và không có nút nào trông bấm được mà bấm không ăn thua.
        */}
        {dotKhoa > 0 && !soSanhBat && (
          <span
            data-testid="huy-hieu-khoa"
            aria-label={`Ảnh ${thuTu + 1} đã chốt đợt ${dotKhoa}`}
            className="pointer-events-none absolute bottom-2 right-2 z-10 flex h-[26px] items-center gap-1 rounded-full bg-[#fffdf9]/92 pl-2 pr-2.5 text-[11.5px] font-medium text-[#2a2420] shadow-sm"
          >
            <Lock className="h-[13px] w-[13px]" strokeWidth={1.8} aria-hidden="true" />
            Đợt {dotKhoa}
          </span>
        )}

        {(!khoa || daChon) && !soSanhBat && dotKhoa === 0 && (
          <button
            type="button"
            disabled={khoa || dangGui}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(photo);
            }}
            aria-label={daChon ? vi.gallery.deselect : vi.gallery.select}
            aria-pressed={daChon}
            className="absolute bottom-0 right-0 z-10 grid h-12 w-12 place-items-center touch-manipulation rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2 disabled:cursor-default"
          >
            <span
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full transition-all duration-150 active:scale-90",
                daChon
                  ? "bg-heart text-white shadow-md"
                  : "bg-[#fffdf9]/80 text-[#2a2420] backdrop-blur-sm group-hover:bg-[#fffdf9]",
                dangGui && "opacity-60",
              )}
            >
              <Heart
                className="h-[17px] w-[17px]"
                fill={daChon ? "currentColor" : "none"}
                strokeWidth={2}
                aria-hidden="true"
              />
            </span>
          </button>
        )}
      </div>

      {/*
        BB-287 mục #3/#5 — báo cáo chấm "khách khó tính": tên tệp BBS_0001.jpg
        dưới mỗi ảnh "trông như ổ đĩa, không giống album". BB-210 (24/09) đã
        thêm nó theo yêu cầu lúc đó ("khách dễ kiểm soát, đối chiếu file tải
        về"), nhưng chủ studio chốt lại 27/09/2026: bỏ tên tệp khỏi MÀN KHÁCH
        — CSKH/nhân viên vẫn đối chiếu được qua danh sách tải từ quản trị, và
        màn khách hiện KHÔNG có vai xem riêng cho nhân viên (route `/g/[token]`
        dùng chung cho mọi người cầm link). `CAO_CHU_THICH` vẫn giữ giá trị cũ
        cho `xepSoLe`/`TheAnh` để không phải đo lại lưới so le — chừa đúng
        khoảng trống trước đây dành cho dòng chữ, tránh ảnh xô sát nhau.
      */}
    </div>
  );
});

export interface LuoiAnhProps {
  photos: PhotoPublic[];
  mutatingIds: Set<string>;
  khoa: boolean;
  /** photoId -> tấm đó đang làm mấy sản phẩm. Thiếu khoá nghĩa là 0. */
  soSanPhamTheoAnh: Map<string, number>;
  /** BB-218 — chế độ "chọn để so sánh" đang bật. */
  soSanhBat: boolean;
  /** photoId -> thứ tự 1–4 trong danh sách so sánh. Thiếu khoá nghĩa là 0. */
  soSanhTheoAnh: Map<string, number>;
  /**
   * BB-321 — photoId -> số đợt đã chốt tấm đó (màn "Chọn thêm ảnh"). Thiếu
   * prop hoặc thiếu khoá nghĩa là 0 (không khoá riêng) — lưới chính không
   * truyền, hành vi y như cũ.
   */
  dotKhoaTheoAnh?: Map<string, number>;
  /** BB-345 — các tấm gia đình (link mời) đã thả tim. Thiếu prop = không có dấu. */
  giaDinhThich?: Set<string>;
  onToggle: (photo: PhotoPublic) => void;
  onOpen: (thuTu: number) => void;
  onToggleSoSanh: (photo: PhotoPublic) => void;
}

/** Cửa sổ dựng tính theo "bậc" nửa màn hình — xem luật 3 ở đầu tệp. */
function cuaSoTheoBac(bac: number, caoMan: number) {
  const buoc = caoMan / 2;
  return { tu: bac * buoc - caoMan, den: bac * buoc + caoMan * 2 };
}

export function LuoiAnh({
  photos,
  mutatingIds,
  khoa,
  soSanPhamTheoAnh,
  soSanhBat,
  soSanhTheoAnh,
  dotKhoaTheoAnh,
  giaDinhThich,
  onToggle,
  onOpen,
  onToggleSoSanh,
}: LuoiAnhProps) {
  const khungRef = useRef<HTMLDivElement | null>(null);

  // Đoán bề ngang ngay từ lượt dựng đầu (BB-131 đã đo: bắt đầu từ 0 là rơi
  // vào nhánh dự phòng, dựng đủ cả bộ rồi vứt đi — tác vụ chặn 706ms).
  const doMan = () => (typeof window === "undefined" ? 0 : window.innerWidth);
  const [rongMan, setRongMan] = useState(doMan);
  const [rongKhung, setRongKhung] = useState(() => {
    const w = doMan();
    // Trừ đúng lề hai bên của khung lưới (gallery-app: `px-2` = 8px điện thoại, `lg:px-10` = 40px).
    return w === 0 ? 0 : w - (w >= 1024 ? 80 : 16);
  });
  const [caoMan, setCaoMan] = useState(() => (typeof window === "undefined" ? 800 : window.innerHeight));
  const [bac, setBac] = useState(0);

  const doBac = useCallback(() => {
    const el = khungRef.current;
    if (!el) return;
    // Khoảng đã cuộn QUA đầu lưới. Đo trực tiếp thay vì nhớ "lưới bắt đầu ở
    // đâu": ảnh bìa, thông báo trạng thái… đổi chiều cao là vị trí đó sai ngay.
    const daQua = -el.getBoundingClientRect().top;
    const b = Math.floor(daQua / (window.innerHeight / 2));
    setBac((cu) => (cu === b ? cu : b));
  }, []);

  useLayoutEffect(() => {
    const el = khungRef.current;
    if (!el) return;
    const doLai = () => {
      setRongKhung(el.clientWidth);
      setRongMan(window.innerWidth);
      setCaoMan(window.innerHeight);
      doBac();
    };
    doLai();
    const ro = new ResizeObserver(doLai);
    ro.observe(el);
    window.addEventListener("resize", doLai);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", doLai);
    };
  }, [doBac]);

  useEffect(() => {
    let cho = 0;
    const khiCuon = () => {
      if (cho) return;
      cho = requestAnimationFrame(() => {
        cho = 0;
        doBac();
      });
    };
    window.addEventListener("scroll", khiCuon, { passive: true });
    return () => {
      window.removeEventListener("scroll", khiCuon);
      if (cho) cancelAnimationFrame(cho);
    };
  }, [doBac]);

  // Đổi bộ lọc thì danh sách ngắn lại, lưới có thể đang ở bậc cuộn cũ.
  useEffect(() => {
    doBac();
  }, [photos.length, doBac]);

  const cot = soCotSoLe(rongMan);
  const khe = kheSoLe(rongMan);
  const tiLe = useMemo(() => photos.map((p) => tiLeCuaAnh(p.width, p.height)), [photos]);
  const { o, cao } = useMemo(
    () => xepSoLe(tiLe, rongKhung, cot, khe, CAO_CHU_THICH),
    [tiLe, rongKhung, cot, khe],
  );
  const { tu, den } = cuaSoTheoBac(bac, caoMan);
  const hien = useMemo(() => oTrongTamNhin(o, tu, den), [o, tu, den]);

  return (
    <div ref={khungRef}>
      {/*
        Chưa đo được bề ngang thì đổ ra ĐỦ CẢ BỘ theo dòng chảy CSS. Chậm còn
        hơn thiếu: cắt bớt ở đây là lỗi BB-128 — khách chỉ thấy một phần ảnh mà
        không biết còn ảnh phía sau.
      */}
      {rongKhung <= 0 ? (
        <div className="columns-2 gap-1.5 sm:columns-3 lg:columns-4 xl:columns-5">
          {photos.map((photo, idx) => (
            <TheAnh
              key={photo.id}
              photo={photo}
              thuTu={idx}
              daChon={photo.mark === "selected"}
              dangGui={mutatingIds.has(photo.id)}
              khoa={khoa}
              soSanPham={soSanPhamTheoAnh.get(photo.id) ?? 0}
              soSanhBat={soSanhBat}
              soSanhThuTu={soSanhTheoAnh.get(photo.id) ?? 0}
              dotKhoa={dotKhoaTheoAnh?.get(photo.id) ?? 0}
              giaDinhThich={giaDinhThich?.has(photo.id) ?? false}
              onToggle={onToggle}
              onOpen={onOpen}
              onToggleSoSanh={onToggleSoSanh}
            />
          ))}
        </div>
      ) : (
        <div className="relative w-full" style={{ height: cao }}>
          {hien.map((i) => {
            const photo = photos[i]!;
            const vt = o[i]!;
            return (
              <TheAnh
                key={photo.id}
                photo={photo}
                thuTu={i}
                daChon={photo.mark === "selected"}
                dangGui={mutatingIds.has(photo.id)}
                khoa={khoa}
                soSanPham={soSanPhamTheoAnh.get(photo.id) ?? 0}
                soSanhBat={soSanhBat}
                soSanhThuTu={soSanhTheoAnh.get(photo.id) ?? 0}
                dotKhoa={dotKhoaTheoAnh?.get(photo.id) ?? 0}
              giaDinhThich={giaDinhThich?.has(photo.id) ?? false}
                x={vt.x}
                y={vt.y}
                w={vt.w}
                h={vt.h}
                onToggle={onToggle}
                onOpen={onOpen}
                onToggleSoSanh={onToggleSoSanh}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
