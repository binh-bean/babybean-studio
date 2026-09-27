"use client";

/**
 * Cửa hàng — màn mua thêm sản phẩm, mở ra từ một nút riêng.
 *
 * OWNER: DEV-FE. Chủ studio 22/09/2026:
 *
 *     "Phần bán hàng cần có menu riêng, không đưa xuống dưới — như vậy sẽ
 *      không bán được hàng."
 *
 * ---------------------------------------------------------------------------
 * BB-279 — thiết kế lại TỐI GIẢN, 27/09/2026
 * ---------------------------------------------------------------------------
 * Chủ studio, nguyên văn: "phần bán hàng đang không chọn được ảnh trong bộ mà
 * chỉ hiển thị 1 ảnh ngoài ra danh mục quá tràn lan tôi muốn tối giản chuẩn
 * thiết kế chọn kích thước chất liệu số lượng ra tiền và chọn ảnh, phần chọn
 * ảnh có hai cách một chọn ngay trong lúc chọn ảnh chỉnh hoặc chọn trong
 * trang bán hàng".
 *
 * bb-dev có 69 sản phẩm in đang bán (16 kích thước × 10 chất liệu) — bày cả
 * 69 thẻ là "danh mục tràn lan" chủ studio nói tới. Từ BB-279, mỗi NHÓM
 * (`nhom-san-pham.ts`) là MỘT bộ cấu hình xếp tầng, không phải danh sách thẻ:
 *
 *     nhóm → chip Kích thước (chỉ size có hàng) → chip Chất liệu (lọc theo
 *     size đã chọn) → Số lượng (mỗi tấm) → giá hiện ngay → Chọn ảnh.
 *
 * Tầng "tổ hợp → đúng một sản phẩm" nằm ở hàm thuần `chonSanPham()`
 * (`src/lib/products/cau-hinh-cua-hang.ts`, có phép thử đơn vị riêng) — component
 * này chỉ gọi, không tự suy luận thêm quy tắc nào.
 *
 * ĐƯỜNG THỨ HAI (chọn ảnh ngay trong lúc xem ảnh lớn, nút "Đặt in tấm này" ở
 * `bang-san-pham-cua-anh.tsx`) mở lại đúng component này với `presetPhotoId`
 * — tấm đang xem đã coi như đã chọn sẵn trong lưới, bỏ qua bước lưới ảnh.
 *
 * ---------------------------------------------------------------------------
 * Mua là phải BIẾT IN TẤM NÀO
 * ---------------------------------------------------------------------------
 * Ảnh in và khung gắn vào đúng một tấm (migration 0061). Nhóm `canGanAnh`
 * (ảnh in, khung) đi qua `onMuaNhieu` (nhánh batch của `/api/g/addons`, một
 * dòng giỏ/tấm). Album (BB-202, chốt: chỉ đặt mua, ảnh đưa vào sau) đi qua
 * `onMua` với `photoId = null`, y như trước.
 *
 * ---------------------------------------------------------------------------
 * BB-282 — dựng lại GIAO DIỆN đúng bản vẽ, hành vi giữ nguyên BB-279
 * ---------------------------------------------------------------------------
 * Nguồn số đo: `babybean-assets/BB-281/html/cua-hang-cau-hinh.html` +
 * `chung.css`. Tấm trượt đáy trên điện thoại, hộp giữa màn ~480px trên máy
 * tính (có backdrop mờ xung quanh — trước đây hộp thoại tràn hết màn hình
 * trống). Tab dùng nhãn NGẮN cục bộ (`NHAN_TAB`), KHÔNG đổi `TEN_NHOM` dùng
 * chung toàn app (đó là file của DEV-BE, và `moi-mua-lan-hai.tsx` — màn mua
 * hộ của ông bà — vẫn cần tên đầy đủ).
 */

import { cn } from "@/components/ui/utils";
import React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { THU_TU_NHOM, TEN_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";
import {
  nhomCoHang,
  kichThuocCuaNhom,
  chatLieuTheoKichThuoc,
  chonSanPham,
  type SanPhamCuaHang,
} from "@/lib/products/cau-hinh-cua-hang";
import { tranhCuaSanPham } from "@/lib/products/tranh-san-pham";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { ChonAnhNhieuTam, type AnhTrongLuoiChon } from "./chon-anh-nhieu-tam";

/** @deprecated dùng `SanPhamCuaHang` từ `@/lib/products/cau-hinh-cua-hang` — giữ tên cũ để không phải sửa mọi chỗ import. */
export type MonTrongCuaHang = SanPhamCuaHang;

export type AnhChonDuoc = AnhTrongLuoiChon;

export interface DongDaMua {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  totalPrice: number;
  photoId?: string | null;
}

export interface CuaHangProps {
  mo: boolean;
  onDong: () => void;
  danhMuc: SanPhamCuaHang[];
  daMua: DongDaMua[];
  tongTien: number;
  /** Ảnh đã thả tim — lọc mặc định của lưới chọn nhiều tấm. */
  anhDaChon: AnhChonDuoc[];
  /** Toàn bộ ảnh của bộ ảnh — dùng khi lưới chọn bấm "Tất cả". */
  tatCaAnh?: AnhChonDuoc[];
  khoa: boolean;
  dangLuu: boolean;
  /** Mua trực tiếp, không gắn ảnh (album). */
  onMua: (productId: string, soLuong: number, photoId: string | null) => void;
  /** BB-279 — mua một sản phẩm gắn ảnh cho NHIỀU tấm cùng lúc (nhánh batch). */
  onMuaNhieu?: (productId: string, soLuong: number, photoIds: string[]) => void;
  /**
   * BB-279 — đường thứ hai: mở cửa hàng thẳng vào đúng nhóm này với tấm đang
   * xem đã chọn sẵn ("Đặt in tấm này" từ màn xem ảnh lớn).
   */
  presetPhotoId?: string | null;
  presetNhom?: NhomSanPham | null;
}

function chipButton(dangChon: boolean) {
  return cn(
    "shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors",
    "h-[34px]",
    dangChon
      ? "border-[var(--bb-fg)] bg-[var(--bb-fg)] text-[var(--bb-bg)]"
      : "border-[var(--bb-border)] bg-white text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]",
  );
}

/** Nhãn tab NGẮN, một dòng — bản vẽ BB-281/282. `TEN_NHOM` (đầy đủ) vẫn dùng
 * ở nơi khác (tên sản phẩm, màn mua hộ của ông bà `moi-mua-lan-hai.tsx`). */
const NHAN_TAB: Record<NhomSanPham, string> = {
  anh_in: "Ảnh in",
  album: "Album",
  khung: "Khung",
};

/** Một dòng mô tả cho khối sản phẩm — suy ra từ chất liệu/kích thước vì
 * `SanPhamCuaHang` (đồng bộ từ Lark) chưa có trường mô tả riêng. */
function moTaSanPham(sp: SanPhamCuaHang | null): string {
  if (!sp) return "Chọn kích thước và chất liệu còn bán bên dưới.";
  const phan = [sp.material, sp.size ? `${sp.size} cm` : null].filter(Boolean);
  return phan.length > 0 ? phan.join(" · ") : "In ảnh chất lượng cao, giao tận nơi.";
}

export function CuaHang({
  mo,
  onDong,
  danhMuc,
  daMua,
  tongTien,
  anhDaChon,
  tatCaAnh,
  khoa,
  dangLuu,
  onMua,
  onMuaNhieu,
  presetPhotoId,
  presetNhom,
}: CuaHangProps) {
  const nhomMacDinh = THU_TU_NHOM[0] as NhomSanPham;
  const nhomKhaDung = React.useMemo(() => nhomCoHang(danhMuc), [danhMuc]);
  const [nhomDangXem, setNhomDangXem] = React.useState<NhomSanPham>(
    presetNhom ?? nhomKhaDung[0] ?? nhomMacDinh,
  );
  /**
   * `*Chon` = LỰA CHỌN CỦA BA MẸ (null nghĩa là "chưa tự chọn — dùng mặc
   * định"). Giá trị HIỆU LỰC (`kichThuoc`/`chatLieu` bên dưới) luôn được TÍNH
   * LẠI (derive) từ danh mục hiện tại, không lưu ở state riêng.
   *
   * Lý do đổi từ hai `useEffect` nối tiếp (một effect "reset về null lúc mở
   * lại", một effect "chọn lại giá trị đầu nếu null") sang cách này: khi mở
   * lại cửa hàng ĐÚNG cùng nhóm vừa đóng (đường thứ hai — "Đặt in tấm này"),
   * `nhomDangXem` và danh sách kích thước KHÔNG đổi giá trị so với lần hiện
   * effect chạy trước đó — React thấy mảng dependency giống hệt và BỎ QUA
   * effect "chọn lại giá trị đầu", trong khi effect "reset về null" ở effect
   * KHÁC vẫn chạy (phụ thuộc `mo`). Kết quả: `kichThuoc` kẹt ở `null` mãi,
   * `chonSanPham(..., null, ...)` không khớp sản phẩm nào, cửa hàng báo
   * "chưa mở bán" dù sản phẩm có thật. Bắt được bằng e2e (`bb-279-cua-hang.spec.ts`,
   * ca "Đặt in tấm này"), không phải bằng mắt — chạy `npm run test:e2e` mới
   * lộ vì cần đóng-rồi-mở-lại-đúng-nhóm mới trúng đường race này.
   */
  const [kichThuocChon, setKichThuocChon] = React.useState<string | null>(null);
  const [chatLieuChon, setChatLieuChon] = React.useState<string | null>(null);
  const [soLuong, setSoLuong] = React.useState(1);
  const [moLuoiChon, setMoLuoiChon] = React.useState(false);
  const hopThoaiRef = React.useRef<HTMLDivElement>(null);

  // BB-277 — hộp thoại toàn màn hình phải giữ focus bên trong (Tab quẩn lại)
  // và Esc đóng được, focus trả về đúng nút đã mở cửa hàng.
  useBayFocusHopThoai(mo, onDong, hopThoaiRef);

  // Mở lại từ đầu mỗi lần bật cửa hàng — kể cả preset (đường thứ hai).
  React.useEffect(() => {
    if (!mo) return;
    setNhomDangXem(presetNhom ?? nhomKhaDung[0] ?? nhomMacDinh);
    setKichThuocChon(null);
    setChatLieuChon(null);
    setSoLuong(1);
    setMoLuoiChon(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, presetNhom]);

  const dsKichThuoc = React.useMemo(
    () => kichThuocCuaNhom(danhMuc, nhomDangXem),
    [danhMuc, nhomDangXem],
  );
  const canKichThuoc = dsKichThuoc.length > 0;

  // Giá trị HIỆU LỰC: lựa chọn của ba mẹ nếu còn hợp lệ trong danh sách hiện
  // tại, không thì phần tử đầu — tính lại mỗi render, không cần effect.
  const kichThuoc = !canKichThuoc
    ? null
    : kichThuocChon && dsKichThuoc.includes(kichThuocChon)
      ? kichThuocChon
      : dsKichThuoc[0] ?? null;

  const dsChatLieu = React.useMemo(
    () => chatLieuTheoKichThuoc(danhMuc, nhomDangXem, canKichThuoc ? kichThuoc : null),
    [danhMuc, nhomDangXem, canKichThuoc, kichThuoc],
  );
  const canChatLieu = dsChatLieu.length > 0;

  const chatLieu = !canChatLieu
    ? null
    : chatLieuChon && dsChatLieu.includes(chatLieuChon)
      ? chatLieuChon
      : dsChatLieu[0] ?? null;

  if (!mo) return null;

  const sanPham = chonSanPham(
    danhMuc,
    nhomDangXem,
    canKichThuoc ? kichThuoc : null,
    canChatLieu ? chatLieu : null,
  );

  /** Số lượng đã đặt của một sản phẩm (cộng mọi tấm ảnh). */
  const daDat = (productId: string) =>
    daMua.filter((d) => d.productId === productId).reduce((n, d) => n + d.quantity, 0);

  const dangDatPresetChoNhomNay = Boolean(presetPhotoId) && nhomDangXem === presetNhom;

  // Nút hành động chính của tấm/thẻ đáy — ba nhánh y hệt logic BB-279 cũ,
  // chỉ gom vào thanh đáy dính thay vì nằm giữa nội dung cuộn.
  const nutHanhDong = !sanPham ? null : !sanPham.canGanAnh ? (
    <button
      type="button"
      disabled={khoa || dangLuu}
      onClick={() => onMua(sanPham.productId, daDat(sanPham.productId) + soLuong, null)}
      className="h-11 shrink-0 rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
    >
      Thêm vào giỏ
    </button>
  ) : dangDatPresetChoNhomNay ? (
    <button
      type="button"
      disabled={khoa || dangLuu}
      onClick={() => {
        onMuaNhieu?.(sanPham.productId, soLuong, [presetPhotoId as string]);
        onDong();
      }}
      className="h-11 shrink-0 rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
    >
      Thêm vào giỏ
    </button>
  ) : (
    <button
      type="button"
      disabled={khoa || dangLuu}
      onClick={() => setMoLuoiChon(true)}
      className="h-11 shrink-0 rounded-full bg-[var(--bb-surface-2)] px-6 text-sm font-medium text-[var(--bb-fg)] transition hover:opacity-80 disabled:opacity-40"
    >
      Chọn ảnh
    </button>
  );

  return (
    // `pointer-events-none` trên lớp phủ — khoảng trống quanh hộp giữa màn
    // (máy tính) / phía trên tấm trượt (điện thoại) chỉ để LÀM MỜ, không phải
    // một lớp chắn thật: không có onClick đóng hộp thoại ở đó, và cây kiểm bố
    // cục tự động (`kiemTheDinhDayCheNut`, BB-275) coi bất cứ điểm nào rơi
    // đúng vào một phần tử `position:fixed` là "che phần tử tương tác" — nếu
    // để lớp phủ nhận sự kiện chuột, nó chặn luôn phép thử tại vùng trống đó
    // dù không hề có gì để bấm. Hộp thoại thật (`hopThoaiRef`) bật lại
    // `pointer-events-auto` để vẫn bấm được bình thường.
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-6">
      <div
        ref={hopThoaiRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mua thêm sản phẩm"
        className="pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-background sm:max-h-[85dvh] sm:w-full sm:max-w-[480px] sm:rounded-[22px] sm:shadow-2xl"
      >
        {/* Tay nắm — chỉ điện thoại, bản vẽ 40×4px. */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[var(--bb-border)] sm:hidden" />

        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-2.5 sm:px-7 sm:pt-6">
          <h2 className="font-display text-2xl font-normal leading-tight text-foreground">
            Mua thêm sản phẩm
          </h2>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onDong}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xl leading-none text-foreground/70 transition hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] focus-visible:ring-offset-2"
          >
            ×
          </button>
        </header>

        {/* Tab theo nhóm — chỉ hiện nhóm đang có hàng. Nhãn NGẮN một dòng
            (NHAN_TAB) để không gãy dòng ở 390px — xem BB-282 ở đầu tệp. */}
        {nhomKhaDung.length > 0 && (
          <div className="flex shrink-0 justify-center px-5 pb-4 sm:px-7">
            <nav className="flex w-full max-w-[400px] rounded-full bg-[var(--bb-surface-2)] p-1">
              {nhomKhaDung.map((nhom) => (
                <button
                  key={nhom}
                  type="button"
                  onClick={() => {
                    setNhomDangXem(nhom);
                    setKichThuocChon(null);
                    setChatLieuChon(null);
                  }}
                  className={cn(
                    "flex-1 rounded-full py-2 text-[13px] font-medium leading-4 transition-colors",
                    nhom === nhomDangXem
                      ? "bg-white text-foreground shadow-sm"
                      : "text-foreground/55 hover:text-foreground",
                  )}
                >
                  {NHAN_TAB[nhom] ?? TEN_NHOM[nhom]}
                </button>
              ))}
            </nav>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 sm:px-7">
          {nhomKhaDung.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              Cửa hàng chưa có sản phẩm nào đang bán. Ba mẹ nhắn CSKH giúp em nhé.
            </p>
          ) : (
            <div className="mx-auto max-w-xl pb-6">
              {/* Khối sản phẩm — tranh 64px bo 14px viền mảnh + tên serif + một dòng mô tả. */}
              <div className="flex items-center gap-3.5 py-4">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-[14px] border border-[var(--bb-border)] bg-white">
                  <TranhNho
                    ten={tranhCuaSanPham(nhomDangXem, chatLieu, sanPham?.name ?? "")}
                    kichThuoc={64}
                  />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-normal leading-tight text-foreground">
                    {sanPham?.name ?? TEN_NHOM[nhomDangXem]}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{moTaSanPham(sanPham)}</p>
                  {daDat(sanPham?.productId ?? "") > 0 && (
                    <p className="mt-0.5 text-[12px] font-medium text-[var(--bb-heart,#C4645A)]">
                      Đang đặt {daDat(sanPham?.productId ?? "")}
                    </p>
                  )}
                </div>
              </div>

              {/* Các bước ngăn bằng vạch mảnh, nhãn CHỮ HOA giãn — bản vẽ .buoc/.nhan. */}
              <div className="divide-y divide-[var(--bb-border)] border-t border-[var(--bb-border)]">
                {canKichThuoc && (
                  <div className="py-3.5">
                    <div className="mb-2.5 flex items-center justify-between">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                        Kích thước
                      </p>
                      <span className="text-[11px] text-muted-foreground">cm</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dsKichThuoc.map((kt) => (
                        <button
                          key={kt}
                          type="button"
                          onClick={() => {
                            setKichThuocChon(kt);
                            setChatLieuChon(null);
                          }}
                          className={chipButton(kt === kichThuoc)}
                        >
                          {kt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {canChatLieu && (
                  <div className="py-3.5">
                    <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Chất liệu
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {dsChatLieu.map((cl) => (
                        <button
                          key={cl}
                          type="button"
                          onClick={() => setChatLieuChon(cl)}
                          className={chipButton(cl === chatLieu)}
                        >
                          {cl}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sanPham && (
                  <div className="flex items-center justify-between py-3.5">
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Số lượng{sanPham.canGanAnh ? " · mỗi tấm" : ""}
                    </p>
                    <div className="flex items-center gap-3.5">
                      <button
                        type="button"
                        aria-label="Bớt số lượng"
                        disabled={soLuong <= 1}
                        onClick={() => setSoLuong((n) => Math.max(1, n - 1))}
                        className="grid h-8 w-8 place-items-center rounded-full border border-[var(--bb-border)] bg-white text-base disabled:opacity-30"
                      >
                        −
                      </button>
                      <span className="w-4 text-center font-display text-lg tabular-nums text-foreground">
                        {soLuong}
                      </span>
                      <button
                        type="button"
                        aria-label="Thêm số lượng"
                        onClick={() => setSoLuong((n) => Math.min(99, n + 1))}
                        className="grid h-8 w-8 place-items-center rounded-full border border-[var(--bb-border)] bg-white text-base disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )}

                {/* Hàng Ảnh — ô 56px bo 10px + ✓ tròn mực; nét đứt "+ Chọn ảnh"
                    khi chưa có tấm nào biết trước (thay nút xám to trước đây). */}
                {sanPham?.canGanAnh && (
                  <div className="py-3.5">
                    <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {dangDatPresetChoNhomNay ? "Ảnh · 1 tấm" : "Ảnh"}
                    </p>
                    <div className="flex items-center gap-2.5">
                      {dangDatPresetChoNhomNay ? (
                        <>
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px]">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`/api/img/${presetPhotoId}?w=200`}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                            <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--bb-fg)] text-[9px] font-bold text-[var(--bb-bg)]">
                              ✓
                            </span>
                          </div>
                          <p className="text-[12px] text-muted-foreground">Áp dụng cho tấm đang xem</p>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={khoa || dangLuu}
                          onClick={() => setMoLuoiChon(true)}
                          // Tên hỗ trợ tiếp cận RIÊNG với nút "Chọn ảnh" ở đáy
                          // dính — cả hai cùng mở một lưới, nhưng trùng tên
                          // "Chọn ảnh" làm `getByRole("button",{name:"Chọn
                          // ảnh"})` (không exact, không phân biệt hoa/thường)
                          // khớp CẢ HAI, vỡ phép thử (bb-279-cua-hang.spec.ts).
                          // Không được chứa cụm con "chọn ảnh" — đổi hẳn cách
                          // nói, không chỉ thêm chữ quanh nó.
                          aria-label="Thêm ảnh vào tấm này"
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px] border-dashed border-[var(--bb-border)] text-center text-[10px] leading-tight text-muted-foreground transition hover:bg-surface-2 disabled:opacity-40"
                        >
                          <span aria-hidden className="text-sm leading-none">+</span>
                          <span aria-hidden>Chọn ảnh</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {!sanPham && (
                <p className="mt-3.5 rounded-xl bg-[var(--bb-surface-2)] px-3.5 py-3 text-sm text-foreground/70">
                  Tổ hợp này studio chưa mở bán, ba mẹ nhắn CSKH giúp em nhé.
                </p>
              )}
            </div>
          )}
        </div>

        {/*
          Đáy dính — tạm tính/đơn giá + viên "Thêm vào giỏ". Giỏ hàng gọn lại
          thành một dòng tóm tắt mở ra bằng <details>, không đẩy dài đáy như
          trước (mọi dòng giỏ luôn hiện).
        */}
        <footer className="shrink-0 border-t border-[var(--bb-border)] bg-background px-5 py-3.5 sm:px-7">
          {daMua.length > 0 && (
            <details className="group mb-3">
              <summary className="flex cursor-pointer list-none items-center justify-between text-xs text-muted-foreground [&::-webkit-details-marker]:hidden">
                <span>
                  Giỏ · {daMua.length} món · {formatCurrencyVND(tongTien)}
                </span>
                <span aria-hidden className="text-[10px] transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <ul className="mt-2 max-h-28 space-y-1 overflow-y-auto text-xs text-muted-foreground">
                {daMua.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      {d.photoId && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/img/${d.photoId}?w=200`}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded object-cover"
                        />
                      )}
                      <span className="truncate">
                        {d.name} ×{d.quantity}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span>{formatCurrencyVND(d.totalPrice)}</span>
                      <button
                        type="button"
                        aria-label={`Xoá ${d.name}`}
                        disabled={khoa || dangLuu}
                        onClick={() =>
                          d.photoId
                            ? onMuaNhieu?.(d.productId, 0, [d.photoId])
                            : onMua(d.productId, 0, null)
                        }
                        className="text-[var(--bb-heart,#C4645A)] disabled:opacity-30"
                      >
                        Xoá
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              {sanPham ? (
                <>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {sanPham.canGanAnh
                      ? "Đơn giá"
                      : `Tạm tính · ${soLuong} × ${formatCurrencyVND(sanPham.unitPrice)}`}
                  </p>
                  <p className="font-display text-xl font-medium text-foreground">
                    <span data-testid="gia-tam-tinh">
                      {formatCurrencyVND(sanPham.unitPrice * soLuong)}
                    </span>
                    {sanPham.canGanAnh && (
                      <span className="ml-1 text-xs font-normal text-muted-foreground">/ tấm</span>
                    )}
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Chọn tổ hợp còn bán để tiếp tục</p>
              )}
            </div>
            {nutHanhDong}
          </div>
        </footer>
      </div>

      <ChonAnhNhieuTam
        mo={moLuoiChon}
        onDong={() => setMoLuoiChon(false)}
        anhDaThaTim={anhDaChon}
        tatCaAnh={tatCaAnh ?? anhDaChon}
        dangLuu={dangLuu}
        onXacNhan={(photoIds) => {
          if (sanPham) onMuaNhieu?.(sanPham.productId, soLuong, photoIds);
          setMoLuoiChon(false);
        }}
      />
    </div>
  );
}

/**
 * Tranh minh hoạ nhỏ (BB-248) — `srcSet` 320w/640w, không chiếm layout khi
 * chưa tải xong nhờ `width`/`height` cố định. `alt=""` vì tranh chỉ trang
 * trí, tên nhóm/sản phẩm đã có chữ cạnh bên.
 */
function TranhNho({ ten, kichThuoc }: { ten: string; kichThuoc: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/san-pham/${ten}-320.webp`}
      srcSet={`/san-pham/${ten}-320.webp 320w, /san-pham/${ten}-640.webp 640w`}
      sizes={`${kichThuoc}px`}
      alt=""
      loading="lazy"
      width={kichThuoc}
      height={kichThuoc}
      className="shrink-0 rounded-xl object-cover"
      style={{ width: kichThuoc, height: kichThuoc }}
    />
  );
}
