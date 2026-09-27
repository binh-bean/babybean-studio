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
 * Gợi ý này thay vào đó CHỜ một tín hiệu ba mẹ đã bắt đầu gắn bó với bộ ảnh:
 * thả tim tấm đầu tiên (chọn một tấm), hoặc quay lại mở link lần thứ hai.
 * Lúc đó câu "lưu ra màn hình để mở lại một chạm" mới có bối cảnh.
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
  /** Số tấm ba mẹ đã thả tim — 0 → >0 là tín hiệu "vừa thả tim tấm đầu". */
  daChon: number;
  onXemCachLuu: () => void;
}

export function LoiGoiYLuuApp({ daChon, onXemCachLuu }: LoiGoiYLuuAppProps) {
  const [hien, setHien] = useState(false);
  const daKichHoat = useRef(false); // đã tự hiện một lần trong phiên này chưa
  const daChonTruoc = useRef(daChon);
  // `daChon` khởi động ở 0 (giá trị mặc định của useState phía gallery-app.tsx)
  // RỒI mới đổi sang số thật khi tải xong bộ ảnh — kể cả với ba mẹ ĐÃ chọn ảnh
  // từ trước. So khớp "0 -> >0" ngay từ lúc mount sẽ hiểu nhầm cú đồng bộ dữ
  // liệu cũ đó là "vừa thả tim tấm đầu", nên gợi ý bật lại mỗi lần MỞ LẠI một
  // bộ ảnh đã từng chọn — kể cả sau khi ba mẹ đã bấm "Để sau". Chỉ bắt đầu so
  // khớp SAU khi `daChon` đã ổn định lại một giá trị mới (nghĩa là dữ liệu
  // ban đầu đã tải xong), không tính lần đổi giá trị đầu tiên đó.
  const daOnDinh = useRef(false);
  // React StrictMode (chỉ ở `next dev`) chủ động gọi mount -> cleanup -> mount
  // MỘT LẦN NỮA để lộ side-effect thiếu dọn dẹp. Effect đếm lượt mở bên dưới
  // ghi localStorage kiểu đọc-rồi-ghi (không nguyên tử), nên bị gọi hai lần
  // là đếm dư thành 2 ngay trong CÙNG một lượt mở — tưởng nhầm là "lần thứ
  // hai". Cờ này còn nguyên qua cả hai lần StrictMode gọi (cùng một instance
  // component), nên chỉ lượt gọi thật đầu tiên mới thật sự ghi.
  const daDemLuotMo = useRef(false);

  // Lần mở thứ hai trở đi: đếm mount, không đợi tín hiệu thả tim.
  useEffect(() => {
    if (daDemLuotMo.current) return;
    daDemLuotMo.current = true;
    if (dangChayNhuApp() || daAnGanDay()) return;
    const soLanTruoc = Number(docLuuTru(KHOA_SO_LAN_MO) ?? "0");
    const soLanMoi = soLanTruoc + 1;
    ghiLuuTru(KHOA_SO_LAN_MO, String(soLanMoi));
    if (soLanMoi >= 2 && !daKichHoat.current) {
      daKichHoat.current = true;
      setHien(true);
    }
    // Chỉ chạy một lần khi component dựng — đếm lượt MỞ TRANG, không phải
    // lượt render lại. Không phụ thuộc props/state nào nên mảng rỗng đúng.
  }, []);

  // Thả tim tấm đầu tiên: 0 -> >0, CHỈ TÍNH sau khi dữ liệu ban đầu đã ổn định.
  useEffect(() => {
    if (!daOnDinh.current) {
      // Lần đổi giá trị đầu tiên là cú đồng bộ từ server, không phải một cú
      // bấm tim thật — chỉ ghi nhận làm mốc, không xét kích hoạt.
      daOnDinh.current = true;
      daChonTruoc.current = daChon;
      return;
    }
    const truoc = daChonTruoc.current;
    daChonTruoc.current = daChon;
    if (truoc === 0 && daChon > 0 && !daKichHoat.current) {
      if (dangChayNhuApp() || daAnGanDay()) return;
      daKichHoat.current = true;
      setHien(true);
    }
  }, [daChon]);

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
        "mx-auto flex h-9 w-fit max-w-full items-center gap-2 rounded-full border border-[#e5dcd2] bg-white px-3.5 text-[14px] text-[#2e2a27] shadow-[0_2px_10px_-2px_rgba(46,42,39,0.12)]",
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
      <button
        type="button"
        onClick={xemCachLuu}
        className="truncate font-display hover:underline"
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
