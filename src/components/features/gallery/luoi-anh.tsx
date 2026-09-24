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

import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Heart, Printer } from "lucide-react";
import { cn } from "@/components/ui/utils";
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
  /** Vị trí trong lưới. Thiếu (nhánh dự phòng) thì thẻ tự xếp theo dòng chảy. */
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  onToggle: (photo: PhotoPublic) => void;
  onOpen: (thuTu: number) => void;
}

const TheAnh = memo(function TheAnh({
  photo,
  thuTu,
  daChon,
  dangGui,
  khoa,
  soSanPham,
  x,
  y,
  w,
  h,
  onToggle,
  onOpen,
}: TheAnhProps) {
  const coViTri = x !== undefined && y !== undefined && w !== undefined && h !== undefined;

  return (
    <div
      onClick={() => onOpen(thuTu)}
      // Chỗ bám cố định cho phép thử trình duyệt. "Ảnh đầu tiên trên trang"
      // không còn là ảnh trong lưới từ khi có ảnh bìa (23/09/2026).
      data-testid="the-anh"
      className={cn(
        "cursor-pointer",
        coViTri ? "absolute" : "relative mb-3 break-inside-avoid",
      )}
      style={coViTri ? { left: x, top: y, width: w, height: h! + CAO_CHU_THICH } : undefined}
    >
      {/* Ô ảnh — kích thước ĐÚNG ảnh, không lẫn với dòng chú thích bên dưới. */}
      <div
        className="group relative overflow-hidden rounded-[4px] bg-[#e9e1d6]"
        style={coViTri ? { width: w, height: h } : { aspectRatio: `1 / ${tiLeCuaAnh(photo.width, photo.height)}` }}
      >
        {/*
          Ảnh qua proxy `/api/img`. Hai cỡ 800 và 1600 giữ nguyên từ BB-162 (chủ
          studio chốt: ảnh xem nhỏ cũng phải NÉT). Khác trước ở `sizes`: nay biết
          CHÍNH XÁC bề ngang ô, nên trình duyệt chọn đúng cỡ theo độ nét của máy
          thay vì đoán theo phần trăm màn hình.
        */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/img/${photo.id}?w=800`}
          srcSet={`/api/img/${photo.id}?w=800 800w, /api/img/${photo.id}?w=1600 1600w`}
          sizes={w ? `${Math.ceil(w)}px` : "50vw"}
          alt={`Ảnh ${thuTu + 1}`}
          loading="lazy"
          decoding="async"
          width={photo.width ?? undefined}
          height={photo.height ?? undefined}
          className="pointer-events-none h-full w-full select-none object-cover transition-transform duration-500 ease-out group-hover:scale-[1.015]"
        />

        {daChon && (
          <span className="pointer-events-none absolute inset-0 rounded-[4px] ring-2 ring-inset ring-heart" />
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
        */}
        {(!khoa || daChon) && (
          <button
            type="button"
            disabled={khoa || dangGui}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(photo);
            }}
            aria-label={daChon ? vi.gallery.deselect : vi.gallery.select}
            aria-pressed={daChon}
            className="absolute bottom-0 right-0 z-10 grid h-12 w-12 place-items-center touch-manipulation focus:outline-hidden disabled:cursor-default"
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
        Tên tệp NGAY DƯỚI ảnh, không đè lên ảnh (BB-210, lời chủ studio
        24/09/2026): "hiện tên file để khách dễ kiểm soát và đối chiếu với
        file tải về cũng như danh sách mà CSKH tải về ảnh khách chọn chỉnh
        sửa". Trước đó (23/09) từng cố tình BỎ tên file vì nó đè lên mặt bé —
        nay chỗ này nằm ngoài khung ảnh nên không còn đụng vấn đề đó.
      */}
      {photo.fileName && (
        <p
          className="mt-1 truncate px-0.5 text-[11px] leading-[14px] text-muted-foreground"
          style={coViTri ? { height: CAO_CHU_THICH } : undefined}
          title={photo.fileName}
        >
          {photo.fileName}
        </p>
      )}
    </div>
  );
});

export interface LuoiAnhProps {
  photos: PhotoPublic[];
  mutatingIds: Set<string>;
  khoa: boolean;
  /** photoId -> tấm đó đang làm mấy sản phẩm. Thiếu khoá nghĩa là 0. */
  soSanPhamTheoAnh: Map<string, number>;
  onToggle: (photo: PhotoPublic) => void;
  onOpen: (thuTu: number) => void;
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
  onToggle,
  onOpen,
}: LuoiAnhProps) {
  const khungRef = useRef<HTMLDivElement | null>(null);

  // Đoán bề ngang ngay từ lượt dựng đầu (BB-131 đã đo: bắt đầu từ 0 là rơi
  // vào nhánh dự phòng, dựng đủ cả bộ rồi vứt đi — tác vụ chặn 706ms).
  const doMan = () => (typeof window === "undefined" ? 0 : window.innerWidth);
  const [rongMan, setRongMan] = useState(doMan);
  const [rongKhung, setRongKhung] = useState(() => {
    const w = doMan();
    return w === 0 ? 0 : w - (w >= 1024 ? 48 : 12);
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
              onToggle={onToggle}
              onOpen={onOpen}
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
                x={vt.x}
                y={vt.y}
                w={vt.w}
                h={vt.h}
                onToggle={onToggle}
                onOpen={onOpen}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
