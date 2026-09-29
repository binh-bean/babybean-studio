"use client";

/**
 * "Chọn ảnh bìa album" — khối riêng cho mỗi album TRONG GÓI.
 *
 * OWNER: DEV-FE. Task BB-202.
 * Spec: docs/19-ban-yeu-cau-dot-1.md mục 1.
 *
 * Chủ studio 26/09/2026:
 *
 *     "album ảnh là một quyển album được ghép từ 20-30 ảnh … mỗi một album sẽ
 *      có một ảnh bìa … gợi ý chọn ảnh bìa cho album nếu trong gói khách hàng
 *      có album."
 *
 * Chốt thêm: bìa = MỘT tấm trong những tấm ĐÃ THẢ TIM; app gợi ý sẵn 3–4 tấm;
 * BẮT BUỘC chọn trước khi chốt (chặn ở máy chủ, `/api/g/submit`).
 *
 * Đặt ở TRANG CHÍNH (không phải trong lightbox như `BangSanPhamCuaAnh`) vì đây
 * là việc của CẢ BỘ ẢNH — chọn một tấm đại diện cho một cuốn album — không
 * phải câu hỏi "tấm đang xem dùng làm gì" của từng ảnh riêng lẻ.
 */

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { goiYBiaAlbum, type UngVienBiaAlbum } from "@/lib/products/goi-y-bia-album";

export interface AlbumCanChonBia {
  galleryItemId: string;
  name: string;
  coverPhotoId: string | null;
  coverFileName: string | null;
}

export interface ChonBiaAlbumProps {
  albums: AlbumCanChonBia[];
  /** MỌI ảnh đã thả tim (`mark === 'selected'`) của lượt chọn đang mở. */
  anhDaThaTim: UngVienBiaAlbum[];
  /** `galleries.cover_photo_id` — ảnh bìa của cả bộ, dùng để ưu tiên gợi ý. */
  coverPhotoIdBoAnh: string | null;
  khoa: boolean;
  dangLuu: boolean;
  onChonBia: (galleryItemId: string, photoId: string) => void;
  className?: string;
}

/**
 * Một khối cho một album: ảnh bìa hiện tại (nếu có), 3–4 gợi ý, và "Xem tất cả
 * tấm đã thả tim" để chọn tấm khác ngoài gợi ý.
 */
function KhoiMotAlbum({
  album,
  anhDaThaTim,
  coverPhotoIdBoAnh,
  khoa,
  dangLuu,
  onChonBia,
}: {
  album: AlbumCanChonBia;
  anhDaThaTim: UngVienBiaAlbum[];
  coverPhotoIdBoAnh: string | null;
  khoa: boolean;
  dangLuu: boolean;
  onChonBia: (galleryItemId: string, photoId: string) => void;
}) {
  const [xemTatCa, setXemTatCa] = React.useState(false);

  /*
   * BB-295 mục #25 — báo cáo chấm độc lập: bấm chọn ảnh bìa xong, 1–1,2 giây
   * sau tấm vẫn ghi "Chưa chọn ảnh bìa" (chỉ mờ đi trong lúc đang lưu) — vì
   * trạng thái "đang là bìa" trước đây đọc THẲNG từ `album.coverPhotoId`,
   * một prop chỉ đổi SAU khi `loadGallery({silent:true})` ở gallery-app.tsx
   * tải xong. Thêm lớp phản hồi LẠC QUAN tại chỗ: bấm là đổi ngay, không chờ
   * mạng — đồng bộ lại với prop thật khi nó tới (hoặc khi đổi album).
   */
  const [biaLacQuan, setBiaLacQuan] = React.useState<{ photoId: string; fileName: string } | null>(null);
  React.useEffect(() => {
    setBiaLacQuan(null);
  }, [album.coverPhotoId, album.galleryItemId]);

  const coverPhotoIdHienThi = biaLacQuan?.photoId ?? album.coverPhotoId;
  const coverFileNameHienThi = biaLacQuan?.fileName ?? album.coverFileName;

  const goiY = React.useMemo(
    () => goiYBiaAlbum(anhDaThaTim, coverPhotoIdBoAnh),
    [anhDaThaTim, coverPhotoIdBoAnh],
  );

  const daChonBiaChuaCoTrongGoiY =
    coverPhotoIdHienThi !== null && !goiY.some((u) => u.photoId === coverPhotoIdHienThi);

  // Ảnh đang là bìa (nếu có) nhưng không nằm trong bốn gợi ý — vẫn phải hiện
  // để ba mẹ thấy đang chọn tấm nào, không phải im lặng bỏ nó khỏi lưới.
  const anhHienThi = daChonBiaChuaCoTrongGoiY
    ? [
        ...goiY,
        anhDaThaTim.find((u) => u.photoId === coverPhotoIdHienThi) ?? {
          selectionItemId: "",
          photoId: coverPhotoIdHienThi as string,
          fileName: coverFileNameHienThi ?? "",
          retouchNote: null,
          orderIndex: null,
          sortIndex: 0,
        },
      ]
    : goiY;

  const danhSachXem = xemTatCa ? anhDaThaTim : anhHienThi;

  return (
    <div
      id={`chon-bia-album-${album.galleryItemId}`}
      className={cn(
        "rounded-2xl border p-4 transition-colors",
        coverPhotoIdHienThi ? "border-border bg-surface" : "border-heart/40 bg-heart/[0.04]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {/*
            BB-293 mục cũ #5: bỏ tên tệp "BBS_0005.jpg", thay bằng ảnh thu nhỏ đang là bìa.
            BB-295 mục #25: chọn xong hiện ngay "✓ Đã chọn làm bìa" (lạc quan).
          */}
          {coverPhotoIdHienThi && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/img/${coverPhotoIdHienThi}?w=200`}
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg object-cover"
            />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{album.name}</p>
            <p
              className={cn(
                "mt-0.5 flex items-center gap-1 text-xs",
                coverPhotoIdHienThi ? "font-medium text-moss" : "text-muted-foreground",
              )}
            >
              {coverPhotoIdHienThi ? (
                <>
                  <Check className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden="true" />
                  Đã chọn làm bìa
                </>
              ) : (
                "Chưa chọn ảnh bìa"
              )}
            </p>
          </div>
        </div>
        {!coverPhotoIdHienThi && (
          <span className="shrink-0 rounded-full bg-heart/15 px-2.5 py-1 text-[11px] font-medium text-heart">
            Bắt buộc chọn
          </span>
        )}
      </div>

      {anhDaThaTim.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Thả tim vài tấm trước, rồi chọn một tấm làm bìa.
        </p>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {danhSachXem.map((u) => {
              const dangLaBia = coverPhotoIdHienThi === u.photoId;
              return (
                <button
                  key={u.photoId}
                  type="button"
                  disabled={khoa || dangLuu}
                  onClick={() => {
                    // Phản hồi lạc quan: đổi ngay tại chỗ, không chờ
                    // `loadGallery({silent:true})` tải lại xong.
                    setBiaLacQuan({ photoId: u.photoId, fileName: u.fileName });
                    onChonBia(album.galleryItemId, u.photoId);
                  }}
                  title={u.fileName}
                  aria-label={`Chọn ảnh bìa ${u.fileName}`}
                  className={cn(
                    "relative overflow-hidden rounded-xl border-2 transition-colors disabled:opacity-50",
                    dangLaBia ? "border-moss" : "border-transparent hover:border-border",
                  )}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/img/${u.photoId}?w=200`}
                    alt={u.fileName}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                  {dangLaBia && (
                    <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded-full bg-moss px-1.5 py-0.5 text-[11px] font-bold text-white">
                      <Check className="h-2.5 w-2.5" strokeWidth={3} aria-hidden="true" />
                      Bìa
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {!xemTatCa && anhDaThaTim.length > anhHienThi.length && (
            <button
              type="button"
              onClick={() => setXemTatCa(true)}
              className="mt-2.5 text-xs font-medium text-primary underline underline-offset-2"
            >
              Xem tất cả tấm đã chọn ({anhDaThaTim.length})
            </button>
          )}
          {xemTatCa && (
            <button
              type="button"
              onClick={() => setXemTatCa(false)}
              className="mt-2.5 text-xs font-medium text-muted-foreground underline underline-offset-2"
            >
              Thu gọn
            </button>
          )}
        </>
      )}
    </div>
  );
}

export function ChonBiaAlbum({
  albums,
  anhDaThaTim,
  coverPhotoIdBoAnh,
  khoa,
  dangLuu,
  onChonBia,
  className,
}: ChonBiaAlbumProps) {
  if (albums.length === 0) return null;

  return (
    <section className={cn("space-y-3", className)}>
      {/*
        Tranh minh hoạ ngang (BabyBean vẽ riêng cho BB-202): album xanh rêu với
        một ô bìa còn trống — mở đầu khối để ba mẹ hiểu ngay đây là việc
        "chọn ảnh cho quyển album", không chỉ là một danh sách sản phẩm khác.
        `alt=""` vì tranh chỉ trang trí, tiêu đề chữ ngay dưới đã nói rõ việc.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/minh-hoa/ngang-bia-album-1280.webp"
        srcSet="/minh-hoa/ngang-bia-album-640.webp 640w, /minh-hoa/ngang-bia-album-1280.webp 1280w"
        sizes="100vw"
        alt=""
        loading="lazy"
        width={1376}
        height={768}
        className="h-[160px] w-full rounded-2xl object-cover sm:h-[200px]"
      />
      <div>
        <h3 className="kh-h2">Chọn ảnh bìa album</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {/* BB-319 (luật 4) — hai câu ngắn thay một câu 21 chữ. */}
          Gói của ba mẹ có {albums.length > 1 ? `${albums.length} cuốn album` : "một cuốn album"}. Chọn bìa
          trong những tấm đã thả tim.
        </p>
      </div>
      {albums.map((album) => (
        <KhoiMotAlbum
          key={album.galleryItemId}
          album={album}
          anhDaThaTim={anhDaThaTim}
          coverPhotoIdBoAnh={coverPhotoIdBoAnh}
          khoa={khoa}
          dangLuu={dangLuu}
          onChonBia={onChonBia}
        />
      ))}
    </section>
  );
}
