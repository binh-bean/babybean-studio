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
import { formatKichThuoc } from "@/lib/utils/dinh-dang";
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

/**
 * BB-287 — báo cáo chấm mục #17: tiêu đề hộp lặp lại y hệt tên sản phẩm thô
 * đồng bộ từ Lark ("UV 10x15"). Tên hiển thị cho ba mẹ phải THÂN THIỆN, suy
 * từ NHÓM + chất liệu ("Ảnh in UV") — không phải chuỗi nội bộ dùng để đối
 * chiếu với Lark. `sp.name`/`sp.size` vẫn giữ nguyên cho mọi nơi khác (giỏ
 * hàng, đối chiếu tồn kho…), hàm này chỉ đổi CHỮ HIỂN THỊ ở khối tiêu đề.
 */
const TIEN_TO_NHOM: Record<NhomSanPham, string> = {
  anh_in: "Ảnh in",
  album: "Album",
  khung: "Khung",
};

/**
 * BB-293 mục #16 — báo cáo chấm độc lập: nhóm "khung" ghép với chất liệu
 * "Khung HQ" (đặt tên từ Lark, đã có sẵn chữ "Khung") ra "Khung Khung HQ" —
 * lặp chữ. Chất liệu đã tự nói tên nhóm thì bỏ tiền tố, chỉ còn lại tên chất
 * liệu; không thì ghép như cũ.
 */
export function tenThanThienSanPham(nhom: NhomSanPham, sp: SanPhamCuaHang | null): string {
  const tienTo = TIEN_TO_NHOM[nhom];
  if (!sp?.material) return tienTo;
  const chatLieu = sp.material.trim();
  if (chatLieu.toLowerCase().startsWith(tienTo.toLowerCase())) return chatLieu;
  return `${tienTo} ${chatLieu}`;
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
  /**
   * BB-296 mục #1 — báo cáo chấm độc lập lần 3: bấm "Xong" trong lưới chọn
   * nhiều tấm gọi thẳng `onMuaNhieu` (mua luôn), đóng lưới, KHÔNG có chỗ nào
   * hiện lại ảnh vừa chọn — ô "Ảnh" luôn trống, không có phản hồi, khách
   * tưởng thao tác không có tác dụng dù hộp chốt sau đó đã cộng tiền.
   *
   * Đổi hai bước: "Xong" trong lưới chỉ LƯU TẠM lựa chọn (state này) và hiện
   * hàng ảnh thu nhỏ trong ô Ảnh; nút chính đổi thành "Thêm vào giỏ · {tiền}"
   * — bấm nút đó mới thật sự gọi `onMuaNhieu`. Xong thì báo "Đã thêm vào
   * giỏ" và đặt lại cấu hình (ảnh, kích thước, chất liệu, số lượng) cho món
   * tiếp theo — đúng yêu cầu đề bài, không phải suy đoán thêm.
   */
  const [anhDaChonTrongLuoi, setAnhDaChonTrongLuoi] = React.useState<AnhChonDuoc[]>([]);
  /**
   * BB-299 mục 4 — bản vẽ `cua-hang-sau-them-*.html` đòi dòng xác nhận có
   * "Hoàn tác" xoá ĐÚNG món vừa thêm bằng API mua thêm có sẵn (không có
   * đường xoá riêng thì bỏ nút — LUẬT-DOT-8, không lách bằng cách khác).
   * `hoanTac: null` = không hoàn tác được (giữ đúng chữ, không hiện nút).
   */
  const [thongBaoDaThem, setThongBaoDaThem] = React.useState<{ text: string; hoanTac: (() => void) | null } | null>(
    null,
  );
  /** BB-299 mục 4 — bản vẽ: giỏ dài hơn 2 món chỉ hiện 2 + "Xem cả N món ›". */
  const [xemHetGio, setXemHetGio] = React.useState(false);
  /**
   * BB-299 mục 4 — điện thoại: bản vẽ `cua-hang-sau-them-dien-thoai.html`
   * (`.gio`) vẽ giỏ thành MỘT DÒNG PILL gọn "Giỏ · N món · tiền · Xem giỏ ›",
   * bấm mới mở ra danh sách đầy đủ — khác máy tính (`.day` của bản vẽ máy
   * tính) vốn LUÔN hiện danh sách ở đáy ngăn kéo (đủ chỗ ngang 520px). Từ
   * `sm` trở lên bỏ qua state này, luôn hiện danh sách (`sm:block`).
   */
  const [moGioMobile, setMoGioMobile] = React.useState(false);
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
    setAnhDaChonTrongLuoi([]);
    setThongBaoDaThem(null);
    setXemHetGio(false);
    setMoGioMobile(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mo, presetNhom]);

  // "Đã thêm vào giỏ" chỉ là phản hồi TỨC THỜI — tự ẩn sau 6s (bản vẽ BB-297:
  // "Giữ 6 giây rồi thu lại"), không cần khách bấm tắt.
  React.useEffect(() => {
    if (!thongBaoDaThem) return;
    const id = window.setTimeout(() => setThongBaoDaThem(null), 6000);
    return () => window.clearTimeout(id);
  }, [thongBaoDaThem]);

  /*
    BB-296 mục #1 kiểm ngược — báo lỗi thật khi chạy `bb-279-cua-hang.spec.ts`:
    truyền thẳng `anhDaChonTrongLuoi.map(...)` làm prop `daChonSan` của
    `ChonAnhNhieuTam` tạo một MẢNG MỚI mỗi lần CuaHang render lại (kể cả khi
    nội dung không đổi — vd poll `/api/g/thong-bao-khach` mỗi vài giây làm
    gallery-app re-render). `ChonAnhNhieuTam` có effect
    `useEffect(() => setDaChon(new Set(daChonSan)), [mo, daChonSan])` — mảng
    đổi THAM CHIẾU mỗi render khiến effect chạy lại, XOÁ SẠCH lựa chọn ba mẹ
    đang bấm dở trong lưới. `useMemo` giữ nguyên tham chiếu khi nội dung thật
    sự không đổi.
  */
  const idAnhDaChonTrongLuoi = React.useMemo(
    () => anhDaChonTrongLuoi.map((a) => a.id),
    [anhDaChonTrongLuoi],
  );

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
      onClick={() => {
        // BB-299 mục 4 — nhớ số lượng TRƯỚC khi thêm để "Hoàn tác" trả lại
        // đúng số cũ. `onMua` nhận SỐ LƯỢNG TUYỆT ĐỐI (không phải cộng dồn ở
        // máy chủ), nên hoàn tác chỉ cần gọi lại với số lượng cũ này.
        const truoc = daDat(sanPham.productId);
        onMua(sanPham.productId, truoc + soLuong, null);
        setThongBaoDaThem({
          text: `${soLuong} ${tenThanThienSanPham(nhomDangXem, sanPham)} · ${formatCurrencyVND(sanPham.unitPrice * soLuong)}`,
          hoanTac: () => onMua(sanPham.productId, truoc, null),
        });
      }}
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
  ) : anhDaChonTrongLuoi.length > 0 ? (
    // BB-296 mục #1 — đã chọn ảnh trong lưới (bước tạm), nút chính giờ mới
    // thật sự thêm vào giỏ, kèm tiền để khách biết đang mua gì hết bao nhiêu.
    <button
      type="button"
      disabled={khoa || dangLuu}
      onClick={() => {
        const anhVuaThem = anhDaChonTrongLuoi.map((a) => a.id);
        onMuaNhieu?.(sanPham.productId, soLuong, anhVuaThem);
        setThongBaoDaThem({
          text: `${anhVuaThem.length} ảnh ${tenThanThienSanPham(nhomDangXem, sanPham)} · ${formatCurrencyVND(sanPham.unitPrice * soLuong * anhVuaThem.length)}`,
          // BB-299 mục 4 — "Hoàn tác" xoá ĐÚNG món vừa thêm, dùng API mua
          // thêm có sẵn (đặt số lượng 0 cho đúng các photoId vừa thêm — cùng
          // đường "Xoá" của từng dòng giỏ ở đáy hộp, xem `<footer>` dưới).
          hoanTac: () => onMuaNhieu?.(sanPham.productId, 0, anhVuaThem),
        });
        // Đặt lại cấu hình cho món tiếp theo — không tự đóng cửa hàng, ba mẹ
        // có thể mua tiếp món khác ngay.
        setAnhDaChonTrongLuoi([]);
        setKichThuocChon(null);
        setChatLieuChon(null);
        setSoLuong(1);
      }}
      className="h-11 shrink-0 rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
    >
      Thêm vào giỏ · {formatCurrencyVND(sanPham.unitPrice * soLuong * anhDaChonTrongLuoi.length)}
    </button>
  ) : (
    <button
      type="button"
      disabled={khoa || dangLuu}
      onClick={() => setMoLuoiChon(true)}
      // BB-295 mục #8 — báo cáo chấm độc lập: nút này là hành động CHÍNH của
      // dòng sản phẩm (chọn ảnh cho sản phẩm), nhưng màu be nhạt cũ trông như
      // nút phụ bên cạnh "Thêm vào giỏ" mực đậm. Đổi về cùng nền mực #2E2A27
      // như mọi nút chính khác trên màn khách (bìa, "Chốt danh sách", "Thêm
      // vào giỏ") — chỉ đổi lớp màu, không đụng logic cửa hàng.
      className="h-11 shrink-0 rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
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
    <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-stretch sm:justify-end">
      {/*
        BB-299 mục 4 — bản vẽ `cua-hang-sau-them-may-tinh.html` (`.ngan`)
        đòi NGĂN KÉO PHẢI rộng 520, cao trọn màn — không còn hộp giữa màn
        480px cũ. Điện thoại giữ nguyên tấm trượt đáy (`.tam` của bản vẽ
        điện thoại).
      */}
      <div
        ref={hopThoaiRef}
        role="dialog"
        aria-modal="true"
        aria-label="Mua thêm sản phẩm"
        className="pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[22px] bg-background sm:h-full sm:max-h-full sm:w-[520px] sm:max-w-[520px] sm:rounded-none sm:shadow-[-12px_0_40px_rgba(46,42,39,0.2)]"
      >
        {/* Tay nắm — chỉ điện thoại, bản vẽ 40×4px. */}
        <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-[var(--bb-border)] sm:hidden" />

        <header className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-2.5 sm:px-7 sm:pt-6">
          <h2 className="kh-h2 text-foreground">
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
                    setAnhDaChonTrongLuoi([]);
                    setThongBaoDaThem(null);
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
                  {/* BB-305 — tên sản phẩm là nhãn nội dung, không phải tiêu
                      đề màn: bỏ font-display, dùng Be Vietnam Pro. */}
                  <p className="truncate text-lg font-medium leading-tight text-foreground">
                    {tenThanThienSanPham(nhomDangXem, sanPham)}
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
                    {/*
                      BB-287 mục 8 — báo cáo chấm #17: mười kích thước xếp
                      thành 3 hàng trên điện thoại. `flex-wrap` đổi thành
                      cuộn ngang MỘT hàng dưới `sm` (390px không đủ chỗ cho
                      quá vài chip); từ `sm` trở lên đủ rộng nên quay lại
                      xuống dòng bình thường.
                    */}
                    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
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
                          {formatKichThuoc(kt)}
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
                    {/*
                      BB-287 mục 8 — báo cáo chấm #17: nhóm chỉ có MỘT chất
                      liệu vẫn hiện một chip "UV" cô đơn, trông như còn phải
                      chọn. Chỉ một lựa chọn thì không có gì để chọn — hiện
                      thành chữ thường, không thành chip bấm được.
                    */}
                    {dsChatLieu.length === 1 ? (
                      <p className="text-sm text-foreground">{dsChatLieu[0]}</p>
                    ) : (
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
                    )}
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
                      {/* BB-305 — con số: Be Vietnam Pro + tabular-nums, không font-display. */}
                      <span className="w-4 text-center text-lg font-medium tabular-nums text-foreground">
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
                      {dangDatPresetChoNhomNay
                        ? "Ảnh · 1 tấm"
                        : anhDaChonTrongLuoi.length > 0
                          ? `Ảnh · ${anhDaChonTrongLuoi.length} tấm`
                          : "Ảnh"}
                    </p>
                    <div className="flex flex-wrap items-center gap-2.5">
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
                      ) : anhDaChonTrongLuoi.length > 0 ? (
                        // BB-296 mục #1 — ảnh vừa chọn ở lưới hiện thành hàng
                        // ảnh thu nhỏ tại đây, không còn "biến mất" sau khi
                        // bấm "Xong". Bấm vào hàng này mở lại lưới để đổi.
                        <button
                          type="button"
                          disabled={khoa || dangLuu}
                          onClick={() => setMoLuoiChon(true)}
                          aria-label={`Đổi ${anhDaChonTrongLuoi.length} ảnh đã chọn`}
                          className="flex items-center gap-1.5 rounded-[10px] disabled:opacity-40"
                        >
                          {anhDaChonTrongLuoi.slice(0, 4).map((a) => (
                            <span
                              key={a.id}
                              className="relative h-14 w-14 shrink-0 overflow-hidden rounded-[10px] border border-[var(--bb-border)]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/img/${a.id}?w=200`}
                                alt=""
                                className="h-full w-full object-cover"
                              />
                            </span>
                          ))}
                          {anhDaChonTrongLuoi.length > 4 && (
                            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[10px] border border-[var(--bb-border)] bg-[var(--bb-surface-2)] text-[12px] font-medium text-foreground">
                              +{anhDaChonTrongLuoi.length - 4}
                            </span>
                          )}
                        </button>
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
          Đáy dính — dòng xác nhận (sau khi thêm) + danh sách giỏ + tạm
          tính/đơn giá + viên "Thêm vào giỏ".

          BB-299 mục 4 — bản vẽ `cua-hang-sau-them-*.html` đổi hai chỗ so
          với BB-296:
            1. Dòng xác nhận đổi màu (tint sage, không còn nền xám trung
               tính) + vòng check + "Hoàn tác" xoá đúng món vừa thêm.
            2. Giỏ không còn gọn trong `<details>` — bản vẽ vẽ nó LUÔN HIỆN
               thành từng thẻ (điện thoại: một dòng pill "Giỏ · N món ·
               tiền · Xem giỏ ›"; máy tính: danh sách đầy đủ, tối đa 2 món +
               "Xem cả N món ›" khi dài hơn).
        */}
        <footer className="shrink-0 border-t border-[var(--bb-border)] bg-background px-5 py-3.5 sm:px-7">
          {/* BB-299 mục 4 — dòng xác nhận tint sage + Hoàn tác, tự ẩn 6s (xem effect ở trên). */}
          {thongBaoDaThem && (
            <div
              role="status"
              data-testid="da-them-vao-gio"
              className="mb-3 flex items-center gap-2.5 rounded-xl bg-[#e3eee9] px-3 py-2.5 text-[#2f4a40]"
            >
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#7FA99B] text-white">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <p className="min-w-0 flex-1 text-[13px] leading-snug">
                <span className="block font-semibold">Đã thêm vào giỏ</span>
                <span className="block truncate">{thongBaoDaThem.text}</span>
              </p>
              {thongBaoDaThem.hoanTac && (
                <button
                  type="button"
                  disabled={khoa || dangLuu}
                  onClick={() => {
                    thongBaoDaThem.hoanTac?.();
                    setThongBaoDaThem(null);
                  }}
                  className="shrink-0 self-start text-[13px] font-medium underline underline-offset-2 disabled:opacity-40"
                >
                  Hoàn tác
                </button>
              )}
            </div>
          )}

          {daMua.length > 0 && (
            <div className="mb-3" data-testid="gio-cua-hang">
              {/* Điện thoại — pill gọn, bấm để mở/đóng danh sách. */}
              <button
                type="button"
                onClick={() => setMoGioMobile((v) => !v)}
                aria-expanded={moGioMobile}
                className="mb-2 flex w-full items-center gap-2 rounded-xl bg-[var(--bb-surface-2)] px-3.5 py-2.5 text-[13px] sm:hidden"
              >
                <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M3 6h18" strokeLinecap="round" />
                  <path d="M16 10a4 4 0 0 1-8 0" strokeLinecap="round" />
                </svg>
                <span>
                  Giỏ · <b className="font-semibold">{daMua.length} món · {formatCurrencyVND(tongTien)}</b>
                </span>
                <span className="ml-auto flex shrink-0 items-center gap-1 font-medium">
                  Xem giỏ
                  <svg viewBox="0 0 24 24" className={cn("h-4 w-4 transition-transform", moGioMobile && "rotate-90")} fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </button>

              {/* Máy tính — luôn hiện; điện thoại — chỉ hiện khi bấm mở pill trên. */}
              <div className={cn(moGioMobile ? "block" : "hidden", "sm:block")}>
              <p className="mb-2 hidden text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:block">
                Giỏ của ba mẹ · {daMua.length} món · {formatCurrencyVND(tongTien)}
              </p>
              <ul className="space-y-1.5">
                {(xemHetGio ? daMua : daMua.slice(0, 2)).map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2.5 rounded-xl border border-[var(--bb-border)] bg-white px-3 py-2"
                  >
                    {d.photoId && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/img/${d.photoId}?w=200`}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-md object-cover"
                      />
                    )}
                    <span className="min-w-0 flex-1 text-[13px] leading-snug">
                      <span className="block truncate">{formatKichThuoc(d.name)}</span>
                      <span className="block text-[12px] text-muted-foreground">×{d.quantity}</span>
                    </span>
                    <span className="shrink-0 text-[14px] font-medium">{formatCurrencyVND(d.totalPrice)}</span>
                    <button
                      type="button"
                      aria-label={`Xoá ${d.name}`}
                      disabled={khoa || dangLuu}
                      onClick={() =>
                        d.photoId
                          ? onMuaNhieu?.(d.productId, 0, [d.photoId])
                          : onMua(d.productId, 0, null)
                      }
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-[var(--bb-surface-2)] disabled:opacity-30"
                    >
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 6h18" strokeLinecap="round" />
                        <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
              {!xemHetGio && daMua.length > 2 && (
                <button
                  type="button"
                  onClick={() => setXemHetGio(true)}
                  className="mt-1.5 text-[12.5px] font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                >
                  Xem cả {daMua.length} món ›
                </button>
              )}
              </div>
            </div>
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
                  {/* BB-305 — giá tiền là nội dung: bỏ font-display, thêm tabular-nums. */}
                  <p className="text-xl font-medium tabular-nums text-foreground">
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
        daChonSan={idAnhDaChonTrongLuoi}
        dangLuu={dangLuu}
        onXacNhan={(photoIds) => {
          // BB-296 mục #1 — CHỈ lưu tạm lựa chọn, không mua ngay. Nút "Thêm
          // vào giỏ" ở đáy hộp mới thật sự gọi `onMuaNhieu` (xem `nutHanhDong`
          // ở trên) — khách cần thấy ảnh đã chọn và giá trước khi trả tiền.
          const nguon = tatCaAnh ?? anhDaChon;
          setAnhDaChonTrongLuoi(nguon.filter((a) => photoIds.includes(a.id)));
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
