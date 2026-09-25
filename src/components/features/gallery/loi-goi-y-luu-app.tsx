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
 */

import React, { useEffect, useRef, useState } from "react";
import { Sparkles, X } from "lucide-react";
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
    <div
      role="status"
      aria-label={vi.gallery.saveAppPrompt.message}
      // LUÔN nằm TRÊN thanh đáy (ThanhChon cao 60px + lề 12px + vùng an toàn), ở
      // MỌI cỡ màn. Bản đầu trên máy tính đặt góc dưới phải và che đúng nút
      // "Chốt danh sách" — chặn thao tác quan trọng nhất (Opus soát, 25/09).
      className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 mx-auto max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300 sm:right-6 sm:left-auto sm:mx-0"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5 pr-3 text-sm shadow-lg">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="leading-relaxed text-foreground">{vi.gallery.saveAppPrompt.message}</p>
          <div className="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              onClick={xemCachLuu}
              className="h-9 rounded-full bg-foreground px-4 text-xs font-medium text-background transition hover:opacity-90"
            >
              {vi.gallery.saveAppPrompt.howTo}
            </button>
            <button
              type="button"
              onClick={dong}
              className="h-9 rounded-full px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface-2"
            >
              {vi.gallery.saveAppPrompt.later}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dong}
          // Tên riêng, không "Đóng": trùng tên nút đóng màn xem ảnh lớn.
          aria-label="Ẩn gợi ý lưu app"
          className="shrink-0 rounded-full p-1 text-muted-foreground transition hover:bg-surface-2"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
