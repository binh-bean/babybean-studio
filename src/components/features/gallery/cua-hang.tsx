"use client";
import { vi } from "@/i18n";
import { khoaCuonTrang } from "@/lib/utils/khoa-cuon-trang";

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
  chatLieuCuaNhom,
  kichThuocTheoChatLieu,
  chonSanPham,
  type SanPhamCuaHang,
} from "@/lib/products/cau-hinh-cua-hang";
import { tranhCuaSanPham } from "@/lib/products/tranh-san-pham";
import { formatKichThuoc, nhanTrangThaiGio, tenKemSoLuong, tenSanPhamChoKhach } from "@/lib/utils/dinh-dang";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { ChonAnhNhieuTam, type AnhTrongLuoiChon } from "./chon-anh-nhieu-tam";
import { tenChatLieuChoKhach } from "@/lib/products/nhom-san-pham";
import { chiaDongGio, demMon, demMonCuaSanPham } from "@/lib/gallery/dem-mon";
import { anhNhoTheoO, thuLaiAnhQuaRoute } from "@/lib/utils/chon-co-anh";

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
  /** BB-319 K-D1 — đơn đã gửi chưa: chưa gửi thì món chỉ "Trong giỏ", đã gửi mới "Đã đặt mua". */
  donDaGui?: boolean;
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
  /**
   * Mua trực tiếp, không gắn ảnh (album).
   *
   * BB-310 mục 1 — báo cáo chấm độc lập vòng 4: chữ ký cũ `=> void` khiến
   * component gọi xong là hiện banner "Đã thêm vào giỏ" NGAY LẬP TỨC, trong
   * khi máy chủ còn đang lưu — banner/"Hoàn tác" hiện SUỐT lúc lưu (đo được
   * 5,4 giây trên máy dev) rồi tự ẩn mà chưa ai bấm được. Cho phép trả về
   * Promise để component `await` xong xuôi mới hiện banner (xem
   * `nutHanhDong`).
   */
  onMua: (productId: string, soLuong: number, photoId: string | null) => void | boolean | Promise<void | boolean>;
  /**
   * BB-279 — mua một sản phẩm gắn ảnh cho NHIỀU tấm cùng lúc (nhánh batch).
   *
   * BB-319 (luật 5) — trả `false` khi máy chủ TỪ CHỐI: cửa hàng không hiện
   * "Đã thêm vào giỏ". Trước bản vá nơi gọi bọc `void …` nên hàm trả ngay
   * `undefined` — thông báo hiện TRƯỚC khi lưu xong (giỏ bên dưới còn số cũ,
   * vòng 6: "Đã thêm 3 ảnh" cạnh "Giỏ · 1 món"), và vẫn hiện khi lưu hỏng.
   */
  onMuaNhieu?: (productId: string, soLuong: number, photoIds: string[]) => void | boolean | Promise<void | boolean>;
  /**
   * BB-279 — đường thứ hai: mở cửa hàng thẳng vào đúng nhóm này với tấm đang
   * xem đã chọn sẵn ("Đặt in tấm này" từ màn xem ảnh lớn).
   */
  presetPhotoId?: string | null;
  presetNhom?: NhomSanPham | null;
  /**
   * BB-321 — một dòng phụ dưới tiêu đề, vd "Tính vào đợt 2" khi cửa hàng mở từ
   * màn "Chọn thêm ảnh · Đợt N" (bản vẽ anh duyệt 29/09/2026). Thiếu = như cũ.
   */
  phuDe?: string | null;
  /**
   * BB-339 mục 4 (ảnh 4443ab79) — màn mua thêm không báo số ảnh trong gói, và
   * không chọn được ảnh cho món TRONG GÓI ngay tại đây. Thiếu = không hiện khối.
   */
  trongGoi?: {
    hanMuc: number | null;
    daChon: number;
    mon: Array<{ galleryItemId: string; name: string; quantity: number; laAlbum: boolean; soAnh: number }>;
    /** Mở lưới chọn ảnh cho một món trong gói (gallery-app). Thiếu = chỉ xem. */
    onChonAnh?: (galleryItemId: string) => void;
  };
}

/** BB-339 — một dòng giỏ đang mở xem lớn (để kiểm tra / đổi ảnh / bỏ). */
type DongDangXem = DongDaMua & { photoId: string };

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
  if (!sp) return "Ba mẹ chọn kích thước và chất liệu còn bán bên dưới nhé ạ.";
  // BB-319 — chất liệu đã nằm trong tên ở dòng trên ("Ảnh in UV"), dòng này chỉ nói khổ.
  if (sp.size) return `Khổ ${formatKichThuoc(sp.size)} cm`;
  return sp.material ?? vi.gallery.loiBean.moTaSanPhamMacDinh;
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
  // BB-319 — tên nội bộ "Edit file" không lên màn khách (cùng luật `tenSanPhamChoKhach`).
  if (sp && /^edit file$/i.test(sp.name.trim())) return tenSanPhamChoKhach(sp);
  if (!sp?.material) return tienTo;
  // BB-339 — "Cavas/Kim tuyến" (tên Lark) hiện là "Kim Tuyến".
  const chatLieu = tenChatLieuChoKhach(sp.material.trim()) ?? sp.material.trim();
  // BB-361 — "Tờ Album (Ultra HD)" đã chứa "Album": không thành "Album Tờ Album …".
  if (chatLieu.toLowerCase().includes(tienTo.toLowerCase())) return chatLieu;
  return `${tienTo} ${chatLieu}`;
}

export function CuaHang({
  donDaGui = false,
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
  phuDe,
  trongGoi,
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
  const [thongBaoDaThem, setThongBaoDaThem] = React.useState<{
    text: string;
    hoanTac: (() => unknown) | null;
  } | null>(null);
  /**
   * BB-310 mục 1 — hai cờ BUSY CỤC BỘ, tách khỏi `dangLuu` (cờ TOÀN CỤC của
   * `gallery-app.tsx`, dùng chung cho mọi lượt lưu — chọn bìa album, đổi
   * tim…). Trước bản vá, mọi nút phụ trong hộp (số lượng, chip, ảnh, xoá
   * dòng giỏ) đều khoá theo `dangLuu` nên suốt lúc chờ máy chủ (đo 5,4 giây
   * trên máy dev chạy song song nhiều agent) CẢ HỘP nhìn như bị mờ/đơ — báo
   * cáo chấm độc lập vòng 4 gọi đúng là "cả form đang mờ". `dangGuiThem` chỉ
   * bật đúng lúc NÚT "Thêm vào giỏ" của nó đang gửi; `dangHoanTac` chỉ bật
   * đúng lúc nút "Hoàn tác" đang gửi — không đụng gì tới nhau hay tới phần
   * còn lại của hộp.
   */
  const [dangGuiThem, setDangGuiThem] = React.useState(false);
  const [dangHoanTac, setDangHoanTac] = React.useState(false);
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
  /**
   * BB-339 mục 4 — dòng giỏ đang mở xem lớn. Trước đây ảnh trong giỏ chỉ là một
   * ô 32px không bấm được: ba mẹ không kiểm tra được đã mua tấm nào, muốn đổi
   * tấm khác thì không biết làm sao. Nay bấm vào dòng → xem lớn + "Đổi ảnh"/"Bỏ".
   */
  const [dongDangXem, setDongDangXem] = React.useState<DongDangXem | null>(null);
  /** BB-339 — đang đổi ảnh cho dòng này (lưới chọn ảnh mở ở chế độ chọn 1 tấm). */
  const [doiAnhCho, setDoiAnhCho] = React.useState<DongDangXem | null>(null);
  const hopThoaiRef = React.useRef<HTMLDivElement>(null);

  // BB-277 — hộp thoại toàn màn hình phải giữ focus bên trong (Tab quẩn lại)
  // và Esc đóng được, focus trả về đúng nút đã mở cửa hàng.
  useBayFocusHopThoai(mo, onDong, hopThoaiRef);

  // BB-329 — tấm trượt phủ cả màn: khoá cuộn nền khi mở, NHẢ khi đóng (khoá
  // có đếm — mở từ "Đặt in tấm này" thì màn xem lớn vừa nhả khoá của nó).
  React.useEffect(() => {
    if (!mo) return;
    return khoaCuonTrang();
  }, [mo]);

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
    setDangGuiThem(false);
    setDangHoanTac(false);
    setDongDangXem(null);
    setDoiAnhCho(null);
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
  // Cùng lý do `useMemo` như trên: giữ tham chiếu để lưới không tự xoá lựa chọn.
  const idDoiAnhChon = React.useMemo(() => (doiAnhCho ? [doiAnhCho.photoId] : []), [doiAnhCho]);

  // BB-329 mục 4 — CHẤT LIỆU TRƯỚC, kích thước lọc theo chất liệu (lý do ở
  // `chatLieuCuaNhom`, `src/lib/products/cau-hinh-cua-hang.ts`). Bậc cũ
  // (kích thước trước) để khổ mặc định 10×15 chỉ còn đúng một chất liệu UV —
  // ba mẹ không thấy có gì để chọn.
  const dsChatLieu = React.useMemo(
    () => chatLieuCuaNhom(danhMuc, nhomDangXem),
    [danhMuc, nhomDangXem],
  );
  const canChatLieu = dsChatLieu.length > 0;

  // Giá trị HIỆU LỰC: lựa chọn của ba mẹ nếu còn hợp lệ trong danh sách hiện
  // tại, không thì phần tử đầu — tính lại mỗi render, không cần effect.
  const chatLieu = !canChatLieu
    ? null
    : chatLieuChon && dsChatLieu.includes(chatLieuChon)
      ? chatLieuChon
      : dsChatLieu[0] ?? null;

  const dsKichThuoc = React.useMemo(
    () => kichThuocTheoChatLieu(danhMuc, nhomDangXem, canChatLieu ? chatLieu : null),
    [danhMuc, nhomDangXem, canChatLieu, chatLieu],
  );
  const canKichThuoc = dsKichThuoc.length > 0;

  // Đổi chất liệu mà khổ đang chọn vẫn có ở chất liệu mới thì GIỮ khổ đó.
  const kichThuoc = !canKichThuoc
    ? null
    : kichThuocChon && dsKichThuoc.includes(kichThuocChon)
      ? kichThuocChon
      : dsKichThuoc[0] ?? null;

  if (!mo) return null;

  const sanPham = chonSanPham(
    danhMuc,
    nhomDangXem,
    canKichThuoc ? kichThuoc : null,
    canChatLieu ? chatLieu : null,
  );

  /** Số lượng đã đặt của một sản phẩm (cộng mọi tấm ảnh). */
  // BB-358 — một luật đếm (lib/gallery/dem-mon.ts): món = cộng số lượng, ở thẻ, viên giỏ, hộp chốt.
  const daDat = (productId: string) => demMonCuaSanPham(daMua, productId);
  const soMonTrongGio = demMon(daMua);
  // BB-362 — phần giỏ đang nấp sau "Xem cả giỏ": dòng "+N món khác · X ₫" bù đúng tiêu đề.
  const gioChia = chiaDongGio(daMua, xemHetGio);

  const dangDatPresetChoNhomNay = Boolean(presetPhotoId) && nhomDangXem === presetNhom;

  // Nút hành động chính của tấm/thẻ đáy — ba nhánh y hệt logic BB-279 cũ,
  // chỉ gom vào thanh đáy dính thay vì nằm giữa nội dung cuộn.
  /** BB-319 — tên hiển thị DUY NHẤT của một món (tiêu đề, giỏ, thông báo, xem lớn, hộp chốt). */
  const tenMon = (productId: string, tenGoc: string) => {
    const sp = danhMuc.find((m) => m.productId === productId);
    return sp ? tenSanPhamChoKhach(sp) : tenSanPhamChoKhach({ name: tenGoc });
  };

  const nutHanhDong = !sanPham ? null : !sanPham.canGanAnh ? (
    <button
      type="button"
      disabled={khoa || dangGuiThem}
      onClick={async () => {
        // BB-299 mục 4 — nhớ số lượng TRƯỚC khi thêm để "Hoàn tác" trả lại
        // đúng số cũ. `onMua` nhận SỐ LƯỢNG TUYỆT ĐỐI (không phải cộng dồn ở
        // máy chủ), nên hoàn tác chỉ cần gọi lại với số lượng cũ này.
        //
        // BB-310 mục 1 — báo cáo chấm độc lập vòng 4: dòng "Đã thêm vào giỏ"
        // (và "Hoàn tác" bên trong) chỉ hiện SAU KHI `onMua` lưu xong, không
        // phải ngay lúc bấm — nên đồng hồ 6 giây tự ẩn (effect phía trên)
        // cũng chỉ bắt đầu đếm từ lúc lưu xong, và Hoàn tác luôn bấm được
        // ngay khi vừa hiện vì không còn request nào đang treo lúc đó.
        const truoc = daDat(sanPham.productId);
        setDangGuiThem(true);
        try {
          // BB-319 (luật 5) — chỉ báo "Đã thêm vào giỏ" khi máy chủ ĐÃ lưu (`false` = lỗi, đã báo riêng).
          const ok = await onMua(sanPham.productId, truoc + soLuong, null);
          if (ok === false) return;
          setThongBaoDaThem({
            text: `${tenKemSoLuong(tenSanPhamChoKhach(sanPham), soLuong)} · ${formatCurrencyVND(sanPham.unitPrice * soLuong)}`,
            hoanTac: () => onMua(sanPham.productId, truoc, null),
          });
        } finally {
          setDangGuiThem(false);
        }
      }}
      className="h-11 shrink-0 rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
    >
      Thêm vào giỏ
    </button>
  ) : dangDatPresetChoNhomNay ? (
    <button
      type="button"
      disabled={khoa || dangGuiThem}
      onClick={async () => {
        setDangGuiThem(true);
        let ok: boolean | void = undefined;
        try {
          ok = await onMuaNhieu?.(sanPham.productId, soLuong, [presetPhotoId as string]);
        } finally {
          setDangGuiThem(false);
        }
        if (ok !== false) onDong();
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
      disabled={khoa || dangGuiThem}
      onClick={async () => {
        const anhVuaThem = anhDaChonTrongLuoi.map((a) => a.id);
        setDangGuiThem(true);
        try {
          // BB-319 (luật 5) — "Đã thêm vào giỏ" chỉ hiện SAU khi máy chủ lưu xong và giỏ đã tải lại,
          // nên dòng giỏ bên dưới đếm đúng số món ngay lúc thông báo hiện.
          const ok = await onMuaNhieu?.(sanPham.productId, soLuong, anhVuaThem);
          if (ok === false) return;
          setThongBaoDaThem({
            text: `${tenSanPhamChoKhach(sanPham)} · ${demMon([{ quantity: soLuong * anhVuaThem.length }])} món · ${formatCurrencyVND(sanPham.unitPrice * soLuong * anhVuaThem.length)}`,
            // BB-299 mục 4 — "Hoàn tác" xoá ĐÚNG món vừa thêm, dùng API mua
            // thêm có sẵn (đặt số lượng 0 cho đúng các photoId vừa thêm — cùng
            // đường "Xoá" của từng dòng giỏ ở đáy hộp, xem `<footer>` dưới).
            hoanTac: () => onMuaNhieu?.(sanPham.productId, 0, anhVuaThem),
          });
          // Đặt lại cấu hình cho món tiếp theo — không tự đóng cửa hàng, ba
          // mẹ có thể mua tiếp món khác ngay.
          setAnhDaChonTrongLuoi([]);
          setKichThuocChon(null);
          setChatLieuChon(null);
          setSoLuong(1);
        } finally {
          setDangGuiThem(false);
        }
      }}
      className="h-11 shrink-0 rounded-full bg-[var(--bb-fg)] px-6 text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
    >
      Thêm vào giỏ · {formatCurrencyVND(sanPham.unitPrice * soLuong * anhDaChonTrongLuoi.length)}
    </button>
  ) : (
    <button
      type="button"
      disabled={khoa || dangGuiThem}
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

        <header className="flex shrink-0 items-center justify-between gap-3 px-6 pb-2 pt-2.5 sm:px-7 sm:pt-6">
          <div className="min-w-0">
            <h2 className="kh-h2 text-foreground">
              Mua thêm sản phẩm
            </h2>
            {phuDe && <p className="mt-0.5 text-[13px] text-muted-foreground">{phuDe}</p>}
          </div>
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
          <div className="flex shrink-0 justify-center px-6 pb-4 sm:px-7">
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

        <div className="flex-1 overflow-y-auto px-6 sm:px-7">
          {nhomKhaDung.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {vi.gallery.loiBean.cuaHangTrong}
            </p>
          ) : (
            <div className="mx-auto max-w-xl pb-6">
              {trongGoi && (trongGoi.hanMuc != null || trongGoi.mon.length > 0) && (
                <section
                  data-testid="trong-goi-cua-hang"
                  className="mb-1 rounded-2xl border border-[var(--bb-border)] bg-[var(--bb-surface-2)]/60 px-3.5 py-3"
                >
                  <p className="text-[13px] text-foreground">
                    <span className="font-medium">Trong gói</span>
                    {trongGoi.hanMuc != null && (
                      <>
                        {": "}
                        <span data-testid="trong-goi-dem" className="tabular-nums">
                          {trongGoi.daChon} / {trongGoi.hanMuc} tấm
                        </span>
                      </>
                    )}
                  </p>
                  {trongGoi.mon.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {trongGoi.mon.map((m) => {
                        const thieu = m.laAlbum ? m.soAnh === 0 : m.soAnh < m.quantity;
                        return (
                          <li key={m.galleryItemId} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-[13px] text-foreground">
                              {tenKemSoLuong(m.name, m.quantity)}
                              <span className={cn("ml-1.5 tabular-nums", thieu ? "font-medium text-foreground" : "text-muted-foreground")}>
                                {m.laAlbum ? `${m.soAnh} tấm` : `${m.soAnh} / ${m.quantity} tấm`}
                              </span>
                            </span>
                            {trongGoi.onChonAnh && !khoa && (
                              <button
                                type="button"
                                onClick={() => trongGoi.onChonAnh?.(m.galleryItemId)}
                                aria-label={`${thieu ? "Chọn" : "Đổi"} ảnh trong gói cho ${tenKemSoLuong(m.name, m.quantity)}`}
                                className="h-7 shrink-0 rounded-full border border-[var(--bb-border)] bg-white px-3 text-[12px] font-medium text-foreground transition hover:bg-surface-2"
                              >
                                {thieu ? "Chọn" : "Đổi"}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              )}

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
                  {/* BB-339 mục 2 — ảnh UV là ảnh giấy, CHƯA có khung: nói rõ để ba mẹ không hiểu nhầm. */}
                  {nhomDangXem === "anh_in" && chatLieu === "UV" && (
                    <p data-testid="mo-ta-uv" className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
                      {vi.gallery.treoTuong.moTaChatLieu.UV}
                    </p>
                  )}
                  {daDat(sanPham?.productId ?? "") > 0 && (
                    <p data-testid="nhan-gio-san-pham" className="mt-0.5 text-[12px] font-medium text-[var(--bb-heart,#C4645A)]">
                      {nhanTrangThaiGio(donDaGui)} · {daDat(sanPham?.productId ?? "")}
                    </p>
                  )}
                </div>
              </div>

              {/* Các bước ngăn bằng vạch mảnh, nhãn CHỮ HOA giãn — bản vẽ .buoc/.nhan. */}
              <div className="divide-y divide-[var(--bb-border)] border-t border-[var(--bb-border)]">
                {canChatLieu && (
                  <div className="py-3.5" data-testid="buoc-chat-lieu">
                    <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      Chất liệu
                    </p>
                    {/*
                      BB-287 mục 8 — nhóm chỉ có MỘT chất liệu (album, khung)
                      thì hiện chữ thường, không thành chip. BB-329: ảnh in có
                      nhiều chất liệu nên từ nay luôn là chip bấm được, đứng
                      TRƯỚC kích thước.
                    */}
                    {dsChatLieu.length === 1 ? (
                      <p className="text-sm text-foreground">{tenChatLieuChoKhach(dsChatLieu[0] ?? null)}</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {dsChatLieu.map((cl) => (
                          <button
                            key={cl}
                            type="button"
                            aria-pressed={cl === chatLieu}
                            onClick={() => setChatLieuChon(cl)}
                            className={chipButton(cl === chatLieu)}
                          >
                            {tenChatLieuChoKhach(cl)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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
                    {/* BB-319 — mép phải mờ dần trên điện thoại: báo còn chip để cuộn (vòng 5 ghi nhận chip cụt ở mép). */}
                    <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-1 [mask-image:linear-gradient(to_right,#000_calc(100%-40px),transparent)] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 sm:[mask-image:none]">
                      {dsKichThuoc.map((kt) => (
                        <button
                          key={kt}
                          type="button"
                          aria-pressed={kt === kichThuoc}
                          onClick={() => setKichThuocChon(kt)}
                          className={chipButton(kt === kichThuoc)}
                        >
                          {formatKichThuoc(kt)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {sanPham && (
                  <div className="flex items-center justify-between py-3.5">
                    {/* BB-329 — chủ studio khoanh "mỗi tấm" (khó hiểu): nói rõ là số bản in cho MỖI ảnh chọn. */}
                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {sanPham.canGanAnh ? "Số bản cho mỗi ảnh" : "Số lượng"}
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
                          disabled={khoa || dangGuiThem}
                          onClick={() => setMoLuoiChon(true)}
                          aria-label={`Đổi ${anhDaChonTrongLuoi.length} tấm đã chọn`}
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
                          disabled={khoa || dangGuiThem}
                          onClick={() => setMoLuoiChon(true)}
                          // Tên hỗ trợ tiếp cận RIÊNG với nút "Chọn ảnh" ở đáy
                          // dính — cả hai cùng mở một lưới, nhưng trùng tên
                          // "Chọn ảnh" làm `getByRole("button",{name:"Chọn
                          // ảnh"})` (không exact, không phân biệt hoa/thường)
                          // khớp CẢ HAI, vỡ phép thử (bb-279-cua-hang.spec.ts).
                          // Không được chứa cụm con "chọn ảnh" — đổi hẳn cách
                          // nói, không chỉ thêm chữ quanh nó.
                          aria-label="Thêm ảnh vào tấm này"
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border-[1.5px] border-dashed border-[var(--bb-border)] text-center text-[11px] leading-tight text-muted-foreground transition hover:bg-surface-2 disabled:opacity-40"
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
                  {vi.gallery.loiBean.loaiChuaBan}
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
        <footer className="shrink-0 border-t border-[var(--bb-border)] bg-background px-6 py-3.5 sm:px-7">
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
                  // BB-310 mục 1 — CHỈ khoá theo `khoa` (album thật sự đã
                  // chốt) và `dangHoanTac` (đúng lượt Hoàn tác này đang gửi),
                  // KHÔNG theo `dangLuu` toàn cục — banner này chỉ hiện SAU
                  // khi lượt thêm đã lưu xong (xem `nutHanhDong`), nên không
                  // còn request nào đang treo lúc nó vừa hiện: bấm được ngay.
                  disabled={khoa || dangHoanTac}
                  onClick={async () => {
                    setDangHoanTac(true);
                    try {
                      await thongBaoDaThem.hoanTac?.();
                      setThongBaoDaThem(null);
                    } finally {
                      setDangHoanTac(false);
                    }
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
                  Giỏ · <b className="font-semibold">{soMonTrongGio} món · {formatCurrencyVND(tongTien)}</b>
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
              {/* BB-319 — cùng một lời với viên giỏ điện thoại ("Giỏ · N món · tiền"), không hai cách gọi. */}
              <p className="mb-2 hidden text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground sm:block">
                Giỏ · {soMonTrongGio} món · {formatCurrencyVND(tongTien)}
              </p>
              <ul className="space-y-1.5">
                {gioChia.hien.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center gap-2.5 rounded-xl border border-[var(--bb-border)] bg-white px-3 py-2"
                  >
                    {/* BB-339 mục 4 — dòng có ảnh: bấm vào để xem lớn, đổi ảnh hoặc bỏ. */}
                    <button
                      type="button"
                      disabled={!d.photoId}
                      onClick={() => d.photoId && setDongDangXem({ ...d, photoId: d.photoId })}
                      aria-label={d.photoId ? `Xem ảnh của ${tenMon(d.productId, d.name)}` : undefined}
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left enabled:cursor-pointer enabled:hover:opacity-80"
                    >
                      {d.photoId && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/img/${d.photoId}?w=200`}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-md object-cover"
                        />
                      )}
                      <span className="min-w-0 flex-1 text-[13px] leading-snug">
                        <span className="block truncate">{tenMon(d.productId, d.name)}</span>
                        <span className="block text-[12px] text-muted-foreground">
                          {nhanTrangThaiGio(donDaGui)} · ×{d.quantity}
                          {d.photoId && <span className="ml-1 underline underline-offset-2">Xem</span>}
                        </span>
                      </span>
                    </button>
                    <span className="shrink-0 text-[14px] font-medium">{formatCurrencyVND(d.totalPrice)}</span>
                    <button
                      type="button"
                      aria-label={`Xoá ${d.name}`}
                      disabled={khoa || dangGuiThem}
                      onClick={async () => {
                        setDangGuiThem(true);
                        try {
                          if (d.photoId) await onMuaNhieu?.(d.productId, 0, [d.photoId]);
                          else await onMua(d.productId, 0, null);
                        } finally {
                          setDangGuiThem(false);
                        }
                      }}
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
              {gioChia.an.soDong > 0 && (
                <button
                  type="button"
                  data-testid="gio-phan-an"
                  onClick={() => setXemHetGio(true)}
                  className="mt-1.5 flex w-full items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--bb-border)] px-3 py-2 text-left text-[12px] text-muted-foreground transition hover:text-foreground"
                >
                  <span>
                    +{gioChia.an.soMon} món khác · <span className="tabular-nums">{formatCurrencyVND(gioChia.an.tien)}</span>
                  </span>
                  <span className="shrink-0 font-medium underline underline-offset-2">Xem cả giỏ ›</span>
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

      {/* BB-339 mục 4 — xem lớn một dòng giỏ có ảnh: kiểm tra, đổi ảnh, hoặc bỏ. */}
      {dongDangXem && !doiAnhCho && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh đã mua"
          data-testid="xem-dong-gio"
          className="pointer-events-auto fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          // BB-346 — cố ý KHÔNG hiện bàn tay trên nền: con trỏ kế thừa xuống tấm
          // ảnh và hộp bên trong (cùng lý lẽ nền lightbox ở photo-lightbox.tsx).
          // Bấm chỗ trống thì đóng, nút "Đóng xem ảnh" vẫn là lối chính.
          // Xem tests/unit/con-tro-ban-tay.test.ts.
          data-con-tro="mac-dinh"
          onClick={() => setDongDangXem(null)}
        >
          <div
            className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-2xl bg-background"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-[#1b1714]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                {...anhNhoTheoO(dongDangXem.photoId)}
                sizes="(min-width: 480px) 448px, 92vw"
                alt={tenMon(dongDangXem.productId, dongDangXem.name)}
                className="mx-auto max-h-[60dvh] w-full object-contain"
                onError={(e) => thuLaiAnhQuaRoute(e.currentTarget)}
              />
              <button
                type="button"
                aria-label="Đóng xem ảnh"
                onClick={() => setDongDangXem(null)}
                className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-black/45 text-lg leading-none text-white"
              >
                ×
              </button>
            </div>
            <div className="space-y-3 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="min-w-0 truncate text-sm font-medium text-foreground">
                  {tenMon(dongDangXem.productId, dongDangXem.name)} · ×{dongDangXem.quantity}
                </p>
                <p className="shrink-0 text-sm font-medium tabular-nums">{formatCurrencyVND(dongDangXem.totalPrice)}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={khoa || dangGuiThem}
                  onClick={() => setDoiAnhCho(dongDangXem)}
                  className="h-10 flex-1 rounded-full bg-[var(--bb-fg)] text-sm font-medium text-[var(--bb-bg)] transition hover:opacity-90 disabled:opacity-40"
                >
                  Đổi ảnh
                </button>
                <button
                  type="button"
                  disabled={khoa || dangGuiThem}
                  onClick={async () => {
                    const d = dongDangXem;
                    setDangGuiThem(true);
                    try {
                      const ok = await onMuaNhieu?.(d.productId, 0, [d.photoId]);
                      if (ok !== false) setDongDangXem(null);
                    } finally {
                      setDangGuiThem(false);
                    }
                  }}
                  className="h-10 flex-1 rounded-full border border-[var(--bb-border)] text-sm font-medium text-foreground transition hover:bg-surface-2 disabled:opacity-40"
                >
                  Bỏ khỏi giỏ
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BB-339 mục 4 — đổi ảnh của một dòng giỏ: chọn ĐÚNG 1 tấm thay thế. */}
      <ChonAnhNhieuTam
        mo={doiAnhCho != null}
        onDong={() => setDoiAnhCho(null)}
        tieuDe="Đổi sang tấm khác"
        toiDa={1}
        anhDaThaTim={anhDaChon}
        tatCaAnh={tatCaAnh ?? anhDaChon}
        daChonSan={idDoiAnhChon}
        dangLuu={dangGuiThem}
        onXacNhan={async (photoIds) => {
          const d = doiAnhCho;
          const moi = photoIds[0];
          setDoiAnhCho(null);
          if (!d || !moi || moi === d.photoId) return;
          setDangGuiThem(true);
          try {
            // Thêm tấm mới với ĐÚNG số lượng cũ, rồi bỏ tấm cũ — số lượng là
            // tuyệt đối theo từng tấm (cùng đường "Xoá" của dòng giỏ).
            const ok = await onMuaNhieu?.(d.productId, d.quantity, [moi]);
            if (ok === false) return;
            await onMuaNhieu?.(d.productId, 0, [d.photoId]);
            setDongDangXem(null);
          } finally {
            setDangGuiThem(false);
          }
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
      // BB-329 — tranh nằm TRONG hộp thoại cố định có vùng cuộn riêng: Safari iOS
      // có lúc không kích hoạt tải lười ở đó → ô tranh trắng. Tranh nhỏ, tải ngay.
      loading="eager"
      width={kichThuoc}
      height={kichThuoc}
      className="shrink-0 rounded-xl object-cover"
      style={{ width: kichThuoc, height: kichThuoc }}
    />
  );
}
