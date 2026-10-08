"use client";
import { khoaCuonTrang } from "@/lib/utils/khoa-cuon-trang";

/**
 * Màn so sánh nhiều tấm (BB-218) — xem 2–4 tấm cạnh nhau, bỏ bớt ngay tại chỗ.
 *
 * OWNER: DEV-FE. Lời chủ studio (24/09/2026): "So sánh hai tấm cạnh nhau — có
 * thể cạnh nhau hoặc không cạnh nhau nếu khách hàng muốn. Ví dụ chọn quá nhiều
 * cần bỏ bớt." Nên ba mẹ chọn BẤT KỲ 2–4 tấm trong lưới (không cần liền nhau),
 * xem chúng cạnh nhau ở đây, và bấm "Bỏ khỏi so sánh" ngay khi thấy dư.
 *
 * Bố cục tính ở `lib/gallery/so-sanh.ts` (toán thuần, có phép thử riêng):
 * 2 tấm xếp theo hướng màn (điện thoại dọc: trên/dưới — màn ngang/máy tính:
 * trái/phải); 3–4 tấm luôn lưới 2×2, không phụ thuộc hướng.
 *
 * Chạm hai lần vào một tấm KHÔNG phóng to tại chỗ (giữ tệp này gọn, không chép
 * lại toán của `phong-anh.ts`) — mở thẳng tấm đó trong màn xem lớn đã có sẵn
 * đủ cử chỉ phóng to (chỗ gọi `onPhongTo` lo việc đó).
 *
 * BB-310 mục 5 — báo cáo chấm độc lập vòng 4: nền tối `bg-bb-viewer-bg` (gần
 * đen) đứng lạc giữa hệ màu KEM của toàn màn khách — "hai mảng tối lạc giữa
 * hệ kem" cùng với tấm trượt "Tấm này dùng cho…" của `photo-lightbox.tsx`
 * (đã đổi ở đó). Màn này đổi SANG cùng hệ kem: nền #F3EDE5 (khối chữ) hoặc
 * #fdfbf9 (khối viền/nút), chữ mực #2E2A27 — CHỈ đổi các mảng CHROME (đầu
 * trang, dải nhãn, thanh điều khiển, khe hở giữa các tấm); các nút nổi TRÊN
 * ảnh (ghim, tim, mũi tên trượt) giữ nguyên nền tối bán trong suốt — ảnh bên
 * dưới đổi màu tuỳ ý, nút nổi trên ảnh cần tương phản với CHÍNH ẢNH, không
 * phải với trang.
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { X, Heart, Pin, PinOff, ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { CHIP_NGUYEN_KHOI } from "@/lib/utils/chip-nguyen-khoi";
import { vi } from "@/i18n";
import type { PhotoPublic } from "@/types/domain";
import { buildLightboxImageUrl, calculateSwipeAction } from "@/lib/utils/lightbox";
import {
  boCucSoSanh,
  danhSachVuotGhim,
  chiSoBanDauVuot,
  chiSoVuotKeTiep,
  chiSoVuotTruoc,
} from "@/lib/gallery/so-sanh";

export interface SoSanhAnhProps {
  /** 2–4 tấm đang so sánh, đúng thứ tự ba mẹ đã chọn. */
  photos: PhotoPublic[];
  mutatingIds: Set<string>;
  /** Khoá hoặc link không có quyền chọn — tim bị khoá như mọi nơi khác. */
  isLocked: boolean;
  onToggleHeart: (photo: PhotoPublic) => void;
  onBoKhoi: (photo: PhotoPublic) => void;
  onDong: () => void;
  /** Chạm hai lần vào một tấm — mở tấm đó trong màn xem lớn. */
  onPhongTo: (photo: PhotoPublic) => void;
  /** Tổng đã chọn / hạn mức gói — để ba mẹ biết mình đang vượt hay không NGAY tại đây. */
  daChon?: number;
  hanMuc?: number | null;
  /**
   * BB-242 — mọi tấm đã thả tim (chọn hoặc yêu thích) trong CẢ bộ ảnh, không
   * chỉ 2–4 tấm đang so sánh. Chế độ "Ghim & vuốt" dùng danh sách này làm
   * nguồn vuốt khi chỉ đánh dấu đúng 2 tấm so sánh (xem `danhSachVuotGhim`).
   */
  anhDaThaTim?: PhotoPublic[];
  /**
   * BB-370 — mọi tấm của bộ (đã tải), để khung vuốt vẫn vẽ được một tấm VỪA BỎ
   * TIM ngay tại chỗ (tấm đó rơi khỏi `anhDaThaTim` nhưng vẫn ở trong danh sách
   * vuốt đã chốt lúc bật "Ghim để vuốt" — bỏ nhầm thì thả tim lại được).
   */
  tatCaAnh?: PhotoPublic[];
  /** BB-400 — tấm đã chốt ở đợt trước (màn "Chọn thêm ảnh · Đợt N"): tim của RIÊNG tấm đó khoá, như `PhotoLightbox.khoaTimAnh`. */
  khoaTimAnh?: (photo: PhotoPublic) => boolean;
}

export function SoSanhAnh({
  photos,
  mutatingIds,
  isLocked,
  onToggleHeart,
  onBoKhoi,
  onDong,
  onPhongTo,
  daChon,
  hanMuc,
  anhDaThaTim = [],
  tatCaAnh = [],
  khoaTimAnh,
}: SoSanhAnhProps) {
  // Hướng màn đo bằng bề ngang/cao thật của cửa sổ — cùng cách LuoiAnh đo,
  // không dùng CSS orientation vì codebase này chọn cột theo bề ngang
  // (`soCotSoLe`), không theo hướng thiết bị.
  const [manHinhDoc, setManHinhDoc] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth < window.innerHeight,
  );

  useEffect(() => {
    const doLai = () => setManHinhDoc(window.innerWidth < window.innerHeight);
    doLai();
    window.addEventListener("resize", doLai);
    return () => window.removeEventListener("resize", doLai);
  }, []);

  // Khoá cuộn trang nền — cùng luật với photo-lightbox.tsx.
  // BB-329 — khoá CÓ ĐẾM (khoa-cuon-trang.ts).
  useEffect(() => khoaCuonTrang(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDong();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDong]);

  // ---------------------------------------------------------------------
  // BB-242 — "Ghim & vuốt": một tấm đứng yên (ghim), tấm còn lại vuốt qua
  // danh sách các tấm đã đánh dấu so sánh (hoặc mọi tấm đã thả tim, xem
  // `danhSachVuotGhim`). Toán chọn tấm kế/trước nằm ở `so-sanh.ts` (thuần,
  // có Vitest) — ở đây chỉ nối vào state + cử chỉ.
  // ---------------------------------------------------------------------
  const [cheDoGhim, setCheDoGhim] = useState(false);
  const [idGhim, setIdGhim] = useState<string>(photos[0]?.id ?? "");
  const [chiSoVuot, setChiSoVuot] = useState(0);

  const dsSoSanhIds = useMemo(() => photos.map((p) => p.id), [photos]);
  const idDaThaTim = useMemo(() => anhDaThaTim.map((p) => p.id), [anhDaThaTim]);
  /**
   * BB-370 — danh sách tấm đã thả tim CHỐT LẠI lúc bật "Ghim để vuốt". Anh muốn
   * "giữ tấm nào thì tim/bỏ tim tấm đó ngay tại chỗ (để bỏ bớt khi chọn quá
   * nhiều)": nếu danh sách vuốt đọc thẳng `anhDaThaTim`, bỏ tim tấm đang xem là
   * nó biến mất, khung nhảy sang tấm khác — không kịp thả tim lại khi bấm nhầm.
   */
  const [timDongBang, setTimDongBang] = useState<string[] | null>(null);
  const dsVuot = useMemo(
    () => danhSachVuotGhim(dsSoSanhIds, timDongBang ?? idDaThaTim, idGhim),
    [dsSoSanhIds, timDongBang, idDaThaTim, idGhim],
  );
  const banDoAnh = useMemo(() => {
    const m = new Map<string, PhotoPublic>();
    for (const p of tatCaAnh) m.set(p.id, p);
    for (const p of anhDaThaTim) m.set(p.id, p);
    for (const p of photos) m.set(p.id, p); // photos đang so sánh ưu tiên (mới nhất)
    return m;
  }, [photos, anhDaThaTim, tatCaAnh]);

  /**
   * Bật "Ghim để vuốt" với tấm `idGhimMoi` đứng yên (nút đầu màn: tấm đầu
   * danh sách; nút ghim trên một tấm ở lưới: chính tấm đó). Khung vuốt đứng
   * ngay ở tấm so sánh còn lại.
   */
  const batCheDoGhim = (idGhimMoi: string) => {
    const chot = idDaThaTim;
    setTimDongBang(chot);
    setIdGhim(idGhimMoi);
    const idKhac = dsSoSanhIds.find((id) => id !== idGhimMoi) ?? "";
    setChiSoVuot(chiSoBanDauVuot(danhSachVuotGhim(dsSoSanhIds, chot, idGhimMoi), idKhac));
    setCheDoGhim(true);
  };

  useEffect(() => {
    if (!cheDoGhim) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setChiSoVuot((i) => chiSoVuotKeTiep(dsVuot.length, i));
      if (e.key === "ArrowLeft") setChiSoVuot((i) => chiSoVuotTruoc(i));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cheDoGhim, dsVuot.length]);

  /** Bấm nút ghim trên tấm KHÔNG PHẢI đang ghim — tấm đó thành tấm ghim mới,
   * tấm ghim cũ chuyển sang làm tấm vuốt (đứng đúng vị trí của nó nếu còn
   * trong danh sách vuốt). */
  const troGhim = (idMoi: string) => {
    if (idMoi === idGhim) return;
    const idCu = idGhim;
    setIdGhim(idMoi);
    // Danh sách vuốt tính lại khi đổi tấm ghim (loại tấm ghim mới ra) — tìm
    // vị trí tấm ghim CŨ trong danh sách MỚI, không phải danh sách hiện tại.
    const viTriCu = danhSachVuotGhim(dsSoSanhIds, timDongBang ?? idDaThaTim, idMoi).indexOf(idCu);
    setChiSoVuot(viTriCu >= 0 ? viTriCu : 0);
  };

  const chamBatDauVuot = useRef<{ x: number; y: number } | null>(null);
  const vuotSang = (huong: "next" | "prev") => {
    if (huong === "next") setChiSoVuot((i) => chiSoVuotKeTiep(dsVuot.length, i));
    else setChiSoVuot((i) => chiSoVuotTruoc(i));
  };

  if (photos.length === 0) return null;

  const boCuc = boCucSoSanh(photos.length, manHinhDoc);
  const ghimPhoto = banDoAnh.get(idGhim) ?? photos[0] ?? null;
  const idVuotHienTai = dsVuot[chiSoVuot];
  const vuotPhoto = idVuotHienTai ? (banDoAnh.get(idVuotHienTai) ?? null) : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="So sánh nhiều tấm"
      className="fixed inset-0 z-50 flex flex-col bg-[#F3EDE5] text-[#2E2A27] select-none"
      data-con-tro="mac-dinh"
    >
      <header className="relative z-20 flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 sm:px-4">
        {/*
          BB-293 mục #11 — báo cáo chấm độc lập: tiêu đề dài "So sánh 2 tấm ·
          5 / 10 tấm đã chọn" bị cắt "…" trên điện thoại hẹp. Điện thoại dùng
          bản NGẮN "2 tấm · 5/10"; máy tính (đủ chỗ hơn, `sm:` trở lên) giữ
          câu đầy đủ như cũ.
        */}
        <span className="min-w-0 flex-1 truncate px-2 text-[13px] text-[#2E2A27]/75">
          <span className="sm:hidden">
            {photos.length} tấm
            {typeof daChon === "number" && (
              <span className="text-[#6b6057]">
                {" "}
                · {daChon}
                {hanMuc != null ? `/${hanMuc}` : ""}
              </span>
            )}
          </span>
          <span className="hidden sm:inline">
            So sánh {photos.length} tấm
            {typeof daChon === "number" && (
              <span className="text-[#6b6057]">
                {" "}
                · {daChon}
                {hanMuc != null ? ` / ${hanMuc}` : ""} tấm đã chọn
              </span>
            )}
          </span>
        </span>
        <button
          type="button"
          onClick={() => (cheDoGhim ? setCheDoGhim(false) : batCheDoGhim(dsSoSanhIds[0] ?? ""))}
          aria-pressed={cheDoGhim}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium transition active:scale-95",
            cheDoGhim ? "bg-[#2E2A27] text-[#F3EDE5]" : "bg-black/5 text-[#2E2A27]/85 hover:bg-black/10",
          )}
        >
          {cheDoGhim ? (
            <LayoutGrid className="h-3.5 w-3.5" strokeWidth={2} />
          ) : (
            <Pin className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {cheDoGhim ? vi.gallery.soSanh.cheDoLuoi : vi.gallery.soSanh.cheDoGhimVuot}
        </button>
        <button
          type="button"
          onClick={onDong}
          aria-label={vi.common.close}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[#2E2A27]/85 transition-colors hover:bg-black/5 active:scale-95 touch-manipulation focus:outline-hidden"
        >
          <X className="h-6 w-6" strokeWidth={1.8} />
        </button>
      </header>

      {cheDoGhim && ghimPhoto ? (
        <div
          className={cn(
            "flex min-h-0 flex-1 gap-px overflow-hidden bg-[#e5dcd2]",
            manHinhDoc ? "flex-col" : "flex-row",
          )}
        >
          <OTamGhimVuot
            photo={ghimPhoto}
            ghim
            dangGui={mutatingIds.has(ghimPhoto.id)}
            khoa={isLocked || (khoaTimAnh?.(ghimPhoto) ?? false)}
            onToggleHeart={onToggleHeart}
            onPhongTo={onPhongTo}
            onGhim={() => troGhim(ghimPhoto.id)}
          />
          <div
            data-testid="khung-vuot-so-sanh"
            className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#F3EDE5]"
            onTouchStart={(e) => {
              const t = e.touches[0];
              if (!t) return;
              chamBatDauVuot.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const bd = chamBatDauVuot.current;
              const t = e.changedTouches[0];
              if (!bd || !t) return;
              const huong = calculateSwipeAction(t.clientX - bd.x, t.clientY - bd.y);
              if (huong) vuotSang(huong);
              chamBatDauVuot.current = null;
            }}
          >
            {vuotPhoto ? (
              <OTamGhimVuot
                photo={vuotPhoto}
                ghim={false}
                dangGui={mutatingIds.has(vuotPhoto.id)}
                khoa={isLocked || (khoaTimAnh?.(vuotPhoto) ?? false)}
                onToggleHeart={onToggleHeart}
                onPhongTo={onPhongTo}
                onGhim={() => troGhim(vuotPhoto.id)}
              />
            ) : (
              <p className="px-6 text-center text-sm text-[#6b6057]">{vi.gallery.loiBean.chuaCoTamDeVuot}</p>
            )}

            {dsVuot.length > 0 && (
              <span className={cn(CHIP_NGUYEN_KHOI, "pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-[12px] font-medium text-white/90 backdrop-blur-md")}>
                {chiSoVuot + 1} / {dsVuot.length}
              </span>
            )}

            {dsVuot.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label={vi.gallery.soSanh.tamSoSanhTruoc}
                  onClick={() => vuotSang("prev")}
                  disabled={chiSoVuot === 0}
                  className="absolute left-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55 disabled:opacity-0 sm:flex"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label={vi.gallery.soSanh.tamSoSanhSau}
                  onClick={() => vuotSang("next")}
                  disabled={chiSoVuot === dsVuot.length - 1}
                  className="absolute right-2 top-1/2 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/55 disabled:opacity-0 sm:flex"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "grid min-h-0 flex-1 gap-px overflow-hidden bg-[#e5dcd2]",
            boCuc === "doc" && "grid-rows-2",
            boCuc === "ngang" && "grid-cols-2",
            boCuc === "luoi" && "grid-cols-2 grid-rows-2",
          )}
        >
          {photos.map((photo, i) => (
            <OTamSoSanh
              key={photo.id}
              photo={photo}
              thuTu={i + 1}
              dangGui={mutatingIds.has(photo.id)}
              khoa={isLocked || (khoaTimAnh?.(photo) ?? false)}
              onToggleHeart={onToggleHeart}
              onBoKhoi={onBoKhoi}
              onPhongTo={onPhongTo}
              onGhim={() => batCheDoGhim(photo.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface OTamGhimVuotProps {
  photo: PhotoPublic;
  /** true = tấm này đang được ghim (đứng yên); false = tấm đang vuốt. */
  ghim: boolean;
  dangGui: boolean;
  khoa: boolean;
  onToggleHeart: (photo: PhotoPublic) => void;
  onPhongTo: (photo: PhotoPublic) => void;
  /** Bấm nút ghim trên CHÍNH tấm này — nếu nó chưa phải tấm ghim thì trở thành tấm ghim mới. */
  onGhim: () => void;
}

function OTamGhimVuot({ photo, ghim, dangGui, khoa, onToggleHeart, onPhongTo, onGhim }: OTamGhimVuotProps) {
  const chamTruocRef = useRef(0);
  const daChon = photo.mark === "selected";

  const chamTam = () => {
    const bayGio = Date.now();
    if (bayGio - chamTruocRef.current < 300) {
      chamTruocRef.current = 0;
      onPhongTo(photo);
    } else {
      chamTruocRef.current = bayGio;
    }
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden bg-[#F3EDE5] p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={buildLightboxImageUrl(photo.id, 1600)}
        alt={photo.fileName || "Ảnh so sánh"}
        onClick={chamTam}
        className="h-auto max-h-full w-auto max-w-full cursor-pointer select-none object-contain"
      />

      {/*
        BB-310 mục 5 — nút nổi TRÊN ảnh (không phải trên trang): giữ quy ước
        cũ (nền tối bán trong suốt) vì cần tương phản với chính ảnh đang
        xem, màu ảnh thay đổi tuỳ tấm — chỉ đổi trạng thái "đang ghim" từ
        trắng phẳng (lạc tông so với hệ kem xung quanh khi nhìn cả màn) sang
        mực đậm, nhất quán với mọi trạng thái "đang chọn" khác trong app.
      */}
      <button
        type="button"
        onClick={onGhim}
        aria-pressed={ghim}
        aria-label={ghim ? vi.gallery.soSanh.boGhimTam : vi.gallery.soSanh.ghimTam}
        className={cn(
          "absolute left-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-md transition active:scale-90",
          ghim ? "bg-[#2E2A27] text-[#F3EDE5]" : "bg-black/55 text-white/90 hover:bg-black/70",
        )}
      >
        {ghim ? (
          <Pin className="h-4 w-4" fill="currentColor" strokeWidth={1.8} />
        ) : (
          <PinOff className="h-4 w-4" strokeWidth={1.8} />
        )}
      </button>

      {(!khoa || daChon) && (
        <button
          type="button"
          disabled={khoa || dangGui}
          onClick={() => onToggleHeart(photo)}
          aria-label={daChon ? vi.gallery.deselect : vi.gallery.select}
          aria-pressed={daChon}
          className={cn(
            "absolute bottom-3 right-3 z-10 grid h-14 w-14 place-items-center rounded-full transition-all active:scale-90 touch-manipulation focus:outline-hidden disabled:opacity-40",
            daChon
              ? "bg-[#c4645a] text-white shadow-[0_10px_26px_-6px_rgba(196,100,90,.65)]"
              : "bg-black/45 text-white ring-1 ring-white/50 backdrop-blur-sm hover:bg-black/60",
          )}
        >
          <Heart className="h-6 w-6" fill={daChon ? "currentColor" : "none"} strokeWidth={1.8} />
        </button>
      )}

      {/* BB-287 mục #3 — bỏ tên tệp khỏi màn khách (xem ghi chú ở luoi-anh.tsx). */}
    </div>
  );
}

interface OTamSoSanhProps {
  photo: PhotoPublic;
  thuTu: number;
  dangGui: boolean;
  khoa: boolean;
  onToggleHeart: (photo: PhotoPublic) => void;
  onBoKhoi: (photo: PhotoPublic) => void;
  onPhongTo: (photo: PhotoPublic) => void;
  /** BB-370 — ghim CHÍNH tấm này rồi vuốt tấm còn lại qua các tấm khác. */
  onGhim: () => void;
}

/**
 * BB-289 lượt 3 — Opus, đối chiếu `so-sanh-hai-tam-dien-thoai.html`: dải
 * điều khiển KHÔNG còn đè lên ảnh (nút "Bỏ khỏi so sánh" + tim to nổi góc
 * trước đây là `absolute`) — nay là một HÀNG 44px riêng, đứng NGAY DƯỚI mỗi
 * khung ảnh. Số thứ tự ("Tấm N") đứng ở một dải riêng phía TRÊN khung ảnh
 * (không đè lên ảnh — BB-293 vòng 1 mục #11).
 *
 * BB-293 vòng 2 mục #11 — giám đốc: dải điều khiển hiện đúng trạng thái
 * CHỌN, không còn khái niệm "giữ": đã chọn = chip "✓ Đã chọn" + nút viền
 * "Bỏ chọn"; chưa chọn = nút chính mực "Chọn tấm này" (không chip). Nút tim
 * đứng riêng đầu dải (trùng chức năng) đã bỏ. "Bỏ khỏi so sánh" (×, phải)
 * vẫn là việc KHÁC — gỡ tấm khỏi màn so sánh, không đụng trạng thái chọn.
 */
function OTamSoSanh({ photo, thuTu, dangGui, khoa, onToggleHeart, onBoKhoi, onPhongTo, onGhim }: OTamSoSanhProps) {
  /** Chạm hai lần trong 300ms — cùng ngưỡng với photo-lightbox.tsx. */
  const chamTruocRef = useRef(0);
  const daChon = photo.mark === "selected";

  const chamTam = () => {
    const bayGio = Date.now();
    if (bayGio - chamTruocRef.current < 300) {
      chamTruocRef.current = 0;
      onPhongTo(photo);
    } else {
      chamTruocRef.current = bayGio;
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
      {/*
        BB-293 mục #11 — báo cáo chấm độc lập: nhãn "TẤM n" từng `absolute`
        ĐÈ LÊN góc ảnh, bị ảnh che một phần trên máy tính. Đưa ra một dải
        riêng NGOÀI khung ảnh (giống dải điều khiển bên dưới) — luôn đọc
        được trọn vẹn, không phụ thuộc nội dung ảnh bên dưới nó.
      */}
      <div className="flex h-8 shrink-0 items-center justify-between bg-[#e5dcd2] pl-3 pr-1 text-[11px] uppercase tracking-[0.1em] text-[#6b6057]">
        <span>Tấm {thuTu}</span>
        {/* BB-370 — ghim tấm này (đứng yên bên trái/trên), tấm còn lại vuốt qua các tấm khác. */}
        <button
          type="button"
          onClick={onGhim}
          aria-label={vi.gallery.soSanh.ghimTam}
          title={vi.gallery.soSanh.ghimTam}
          className="flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium normal-case tracking-normal text-[#2E2A27] transition hover:bg-black/5 active:scale-95"
        >
          <Pin className="h-3.5 w-3.5" strokeWidth={1.8} aria-hidden="true" />
          {vi.gallery.soSanh.ghimTam}
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[#F3EDE5] p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={buildLightboxImageUrl(photo.id, 1600)}
          alt={photo.fileName || "Ảnh so sánh"}
          onClick={chamTam}
          // "cursor-pointer" (không phải cursor-zoom-in như photo-lightbox.tsx):
          // chạm một lần ở đây không làm gì thấy được — phải chạm HAI LẦN mới
          // phóng to (mở màn xem lớn). Xem tests/unit/con-tro-ban-tay.test.ts.
          className="h-auto max-h-full w-auto max-w-full cursor-pointer select-none object-contain"
        />
      </div>

      {/*
        BB-293 vòng 2 mục #11 — giám đốc quyết: nhãn phải phản ánh ĐÚNG trạng
        thái chọn, không bịa khái niệm "đang giữ trong phiên so sánh". Trước
        đây tim (trái) và pill "Giữ tấm này"/"✓ Đang giữ tấm này" (giữa) CÙNG
        gọi `onToggleHeart` — hai nút trùng chức năng khiến "giữ" nghe như
        một trạng thái riêng, trong khi nó chỉ là tim/thả tim thường. Bỏ nút
        tim đứng riêng ở ĐẦU dải (trùng chức năng với nút chính giữa), thay
        bằng: đã chọn thì hiện CHIP "✓ Đã chọn" (sage, không bấm được) + nút
        PHỤ viền "Bỏ chọn"; chưa chọn thì không có chip, chỉ một nút CHÍNH
        màu mực "Chọn tấm này". Hai tấm cùng đã chọn giờ cùng ghi "Đã chọn" —
        đúng sự thật, không còn mơ hồ.
      */}
      <div
        data-testid="dai-dieu-khien-so-sanh"
        className="flex h-11 shrink-0 items-center gap-2 border-t border-[#e5dcd2] bg-[#F3EDE5] px-3"
      >
        <div className="mx-auto flex min-w-0 items-center gap-2">
          {(!khoa || daChon) ? (
            daChon ? (
              <>
                {/* BB-310 mục 5 — sage nhạt trên nền kem, cùng công thức với
                    banner "Đã thêm vào giỏ" (cua-hang.tsx) — đã kiểm ở đó. */}
                <span className={cn(CHIP_NGUYEN_KHOI, "inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e3eee9] px-2.5 py-1 text-[12px] font-medium text-[#2f4a40]")}>
                  <span aria-hidden="true">✓</span>
                  Đã chọn
                </span>
                <button
                  type="button"
                  disabled={khoa || dangGui}
                  onClick={() => onToggleHeart(photo)}
                  aria-pressed={daChon}
                  className="flex h-8 shrink-0 items-center justify-center rounded-full border border-[#2E2A27]/25 px-4 text-[13px] font-medium text-[#2E2A27] transition hover:bg-black/5 disabled:opacity-40"
                >
                  Bỏ chọn
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={khoa || dangGui}
                onClick={() => onToggleHeart(photo)}
                aria-pressed={daChon}
                className="flex h-8 shrink-0 items-center justify-center rounded-full bg-[#2E2A27] px-4 text-[13px] font-medium text-[#F3EDE5] ring-1 ring-black/10 transition hover:opacity-90 disabled:opacity-40"
              >
                Chọn tấm này
              </button>
            )
          ) : (
            <span className="h-8 shrink-0" aria-hidden="true" />
          )}
        </div>

        <button
          type="button"
          onClick={() => onBoKhoi(photo)}
          aria-label="Bỏ khỏi so sánh"
          title="Bỏ khỏi so sánh"
          className="ml-auto shrink-0 rounded-full p-1.5 text-[#2E2A27]/70 transition hover:bg-black/5 active:scale-90"
        >
          <X className="h-5 w-5" strokeWidth={1.7} aria-hidden="true" />
        </button>
      </div>

      {/* BB-287 mục #3 — bỏ tên tệp khỏi màn khách (xem ghi chú ở luoi-anh.tsx). */}
    </div>
  );
}
