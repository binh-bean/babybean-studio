"use client";

/**
 * Lời gợi ý "Lưu app" — ĐÚNG LÚC, thay cho nút biểu tượng ở đầu trang.
 *
 * OWNER: DEV-FE. Task BB-241. Chủ studio 24/09/2026:
 *
 *     "lưu app ra màn hình chính — nếu không phải người thiết kế thì không
 *      biết nó để làm gì; tư duy để cần nó giống như gợi ý cho khách biết"
 *
 * ---------------------------------------------------------------------------
 * Vì sao KHÔNG còn là một nút biểu tượng ở đầu trang
 * ---------------------------------------------------------------------------
 * Nút cũ (`<Smartphone />` trong header) đúng về chức năng nhưng sai về THỜI
 * ĐIỂM: nó hiện ngay khi ba mẹ vừa mở link, trước khi họ biết bộ ảnh này có
 * gì đáng để "lưu lại mở nhanh hơn". Một biểu tượng điện thoại không giải
 * thích được lý do — chỉ người đã quen PWA mới đoán ra nó làm gì.
 *
 * ---------------------------------------------------------------------------
 * BB-289 — sửa lỗi admin báo: chip KHÔNG BAO GIỜ hiện cho khách đã có tim
 * ---------------------------------------------------------------------------
 * Bản trước CHỜ một tín hiệu "vừa gắn bó": thả tim tấm đầu (0 -> >0) hoặc mở
 * lại link lần thứ hai. Với khách MỞ LINK TỪ TIN NHẮN CŨ mà đã từng thả tim
 * trước đó (bộ ảnh mở tab mới, hoặc mở lại sau nhiều ngày), `daChon` khởi
 * động thẳng ở một số > 0 — không có cú 0 -> >0 nào để bắt, còn "lần mở thứ
 * hai" đếm theo lượt MOUNT của component này (thường bị reset khi khác
 * `token`/thiết bị) nên khách đó có thể không bao giờ thấy chip. Sửa tận
 * gốc: hiện NGAY khi mở trang (không chờ tín hiệu nào), chỉ trừ khi đang
 * chạy như app đã cài hoặc khách vừa bấm ẩn trong `NGAY_AN` ngày gần đây.
 *
 * ---------------------------------------------------------------------------
 * Không chồng lời mời với PWAInstallPrompt
 * ---------------------------------------------------------------------------
 * `src/components/ui/pwa-install-prompt.tsx` đã tự ẩn trên mọi trang bắt đầu
 * bằng `/g/` (xem ghi chú BB-213 trong tệp đó) — đúng nơi component này được
 * dựng. Không cần thêm điều kiện loại trừ ở đây.
 *
 * ---------------------------------------------------------------------------
 * BB-278/BB-281 — chuyển từ thẻ nổi ở ĐÁY sang chip nhỏ ở ĐẦU trang
 * ---------------------------------------------------------------------------
 * Bản cũ là một thẻ `fixed` gần đáy màn, tính khoảng cách CỐ ĐỊNH để đứng
 * trên `ThanhChon`. Ảnh chụp máy thật chủ studio gửi 27/09/2026 cho thấy nó
 * ĐÈ lên thanh chọn/chốt sau khi thanh đó được thu nhỏ lại (BB-278 mục 3) —
 * khoảng cách cố định đó không còn đúng nữa, và hai thẻ `fixed` canh nhau
 * bằng số đo tay luôn dễ vỡ khi MỘT bên đổi kích thước.
 *
 * Sửa tận gốc: bỏ hẳn kiểu `fixed`, đưa xuống thành một chip MỘT DÒNG, gọn,
 * nằm trong DÒNG CHẢY bình thường của trang — `GalleryApp` render nó ngay
 * dưới thanh thương hiệu "Baby Bean" (`thanh-thuong-hieu`), phía trên ảnh
 * bìa. Không `fixed` = không có gì để tính khoảng cách/che nhau với thanh
 * chọn/chốt ở đáy nữa — tách biệt bằng VỊ TRÍ, không phải bằng con số.
 */

import React, { useEffect, useRef, useState } from "react";
import { Smartphone, Plus, X } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { vi } from "@/i18n";

const KHOA_DA_DONG = "bb_luu_app_da_dong_luc"; // timestamp lần bấm "Để sau" / "Xem cách lưu" gần nhất
const KHOA_SO_LAN_MO = "bb_luu_app_so_lan_mo"; // đếm số lần màn khách này từng mount
const NGAY_AN = 7;

function dangChayNhuApp(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** Đọc/ghi localStorage bọc try/catch — riêng tư trình duyệt hoặc quota đầy không được làm vỡ màn khách. */
function docLuuTru(khoa: string): string | null {
  try {
    return window.localStorage.getItem(khoa);
  } catch {
    return null;
  }
}
function ghiLuuTru(khoa: string, giaTri: string): void {
  try {
    window.localStorage.setItem(khoa, giaTri);
  } catch {
    // Bỏ qua — chế độ ẩn danh hoặc quota đầy. Gợi ý có thể hiện lại lần sau,
    // không phải lỗi cần chặn màn khách.
  }
}

function daAnGanDay(): boolean {
  const luc = docLuuTru(KHOA_DA_DONG);
  if (!luc) return false;
  const soNgay = (Date.now() - Number(luc)) / (1000 * 60 * 60 * 24);
  return Number.isFinite(soNgay) && soNgay < NGAY_AN;
}

export interface LoiGoiYLuuAppProps {
  /** Không còn dùng để quyết định thời điểm hiện chip (BB-289) — giữ lại cho
   *  tương thích chữ ký cũ, không đọc giá trị bên trong component. */
  daChon: number;
  onXemCachLuu: () => void;
}

export function LoiGoiYLuuApp({ onXemCachLuu }: LoiGoiYLuuAppProps) {
  const [hien, setHien] = useState(false);
  const daKichHoat = useRef(false); // đã tự hiện một lần trong phiên này chưa

  // BB-289 — hiện NGAY khi mở trang, không chờ tín hiệu thả tim/lượt mở thứ
  // hai nữa (xem ghi chú lớn ở đầu tệp: khách đã có tim từ trước không bao
  // giờ tạo ra cú 0 -> >0 để bắt). Vẫn giữ đếm số lần mở (`KHOA_SO_LAN_MO`)
  // vì các nơi khác trong mã có thể còn tham chiếu, nhưng không còn dùng nó
  // để quyết định hiện/ẩn.
  useEffect(() => {
    if (daKichHoat.current) return;
    if (dangChayNhuApp() || daAnGanDay()) return;
    const soLanTruoc = Number(docLuuTru(KHOA_SO_LAN_MO) ?? "0");
    ghiLuuTru(KHOA_SO_LAN_MO, String(soLanTruoc + 1));
    daKichHoat.current = true;
    setHien(true);
    // Chỉ chạy một lần khi component dựng — mảng rỗng đúng.
  }, []);

  const dong = () => {
    setHien(false);
    ghiLuuTru(KHOA_DA_DONG, String(Date.now()));
  };

  const xemCachLuu = () => {
    ghiLuuTru(KHOA_DA_DONG, String(Date.now()));
    setHien(false);
    onXemCachLuu();
  };

  if (!hien) return null;

  return (
    // BB-278/BB-281 — chip MỘT DÒNG, dựng đúng
    // `babybean-assets/BB-281/goi-y-luu-app.png`: nền TRẮNG (không phải kem),
    // viền mảnh, bóng rất nhẹ, icon điện thoại có dấu + màu rêu/sage
    // (`--bb-accent-sage`, xem tokens.css), chữ serif, nút × mảnh. Nằm trong
    // dòng chảy bình thường (KHÔNG `fixed`) ngay dưới thanh thương hiệu, tự
    // canh giữa — xem ghi chú lớn ở đầu tệp. Bấm vào chip (trừ nút ×) mở tấm
    // hướng dẫn đầy đủ.
    <div
      role="status"
      aria-label={vi.gallery.saveAppPrompt.message}
      data-testid="goi-y-luu-app"
      className={cn(
        // BB-330 — câu dài hơn (nói rõ để làm gì) nên cho xuống 2 dòng ở 390px: bỏ `h-9`
        // cố định + `truncate`, bo góc 18px thay vì viên tròn.
        "mx-auto flex min-h-9 w-fit max-w-full items-center gap-2 rounded-[18px] border border-[#e5dcd2] bg-white px-3.5 py-1.5 text-[13px] leading-snug text-[#2e2a27] shadow-[0_2px_10px_-2px_rgba(46,42,39,0.12)]",
        "animate-in fade-in slide-in-from-top-2 duration-300",
      )}
    >
      {/* Điện thoại + dấu "+" nhỏ màu sage — bản vẽ không có icon lucide khớp
          y hệt nên ghép hai icon mảnh lại, giữ đúng Ý (điện thoại + thêm). */}
      <span className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center">
        <Smartphone className="h-4 w-4 text-muted-foreground" strokeWidth={1.6} aria-hidden="true" />
        <Plus
          className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-white text-[var(--bb-accent)]"
          strokeWidth={3}
          aria-hidden="true"
        />
      </span>
      {/*
        BB-295 mục cũ #9 — báo cáo chấm: chữ serif (`font-display`, Fraunces)
        trên một chip trạng thái nhỏ đọc lạc điệu — serif dành cho tiêu đề
        cảm xúc, không phải nhãn tiện ích một dòng. Bản vẽ `goi-y-luu-app.png`
        không có trong kho bản vẽ hiện có, nên chỉ làm đúng yêu cầu: đổi
        sang chữ sans mặc định (theo `body`), không sáng tác thêm chi tiết.
      */}
      <button
        type="button"
        onClick={xemCachLuu}
        className="text-left font-medium hover:underline"
      >
        {vi.gallery.saveAppPrompt.shortLabel}
      </button>
      <button
        type="button"
        onClick={dong}
        // Tên riêng, không "Đóng": trùng tên nút đóng màn xem ảnh lớn.
        aria-label="Ẩn gợi ý lưu app"
        className="ml-0.5 shrink-0 rounded-full p-0.5 text-muted-foreground transition hover:bg-surface-2"
      >
        <X className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />
      </button>
    </div>
  );
}
