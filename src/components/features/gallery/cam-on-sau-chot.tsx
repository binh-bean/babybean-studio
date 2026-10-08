"use client";

/**
 * Màn "Cảm ơn ba mẹ" — hiện NGAY sau khi chốt danh sách thành công.
 *
 * OWNER: BB-289. Admin báo trên app thật: bấm "Xác nhận chốt" xong màn khách
 * xoá sạch thành trang trắng "Đang tải…" (vì `handleSubmitSelection` gọi lại
 * `loadGallery()` KHÔNG `silent`, xem ghi chú BB-287 mục #24 ngay phía trên
 * hàm đó trong `gallery-app.tsx`) trong lúc dữ liệu mới đang tải về — vài
 * giây trắng trơn ngay sau một hành động quan trọng.
 *
 * Bản vẽ đã duyệt `babybean-assets/BB-285/cam-on-sau-chot-dien-thoai.png`:
 * tranh màu nước tròn (BB-292: `/minh-hoa/cam-on-phong-thu-*.webp`, vẽ riêng
 * theo đúng bản vẽ này — trước đó tạm dùng tranh hành trình `chot-thanh-cong`
 * dùng chung với thẻ khác; huy hiệu tích sage đè lên), nhãn "ĐÃ CHỐT ·
 * dd/mm/yyyy", tiêu đề serif lớn, thẻ tóm tắt,
 * nút "Xem tiến độ" (không phải "Xem chi tiết" — quyết định Opus lượt 2,
 * BB-289: nút này đưa ba mẹ tới đúng thẻ hành trình 5 bước đã có sẵn trên
 * trang, không mở lại hộp chốt).
 *
 * DỮ LIỆU: chỉ dùng số liệu THẬT đã có trong tay ngay sau khi submit thành
 * công — không gọi thêm API nào (đây là màn ĐỆM lấp chỗ "Đang tải", không
 * phải màn thay hẳn `loadGallery()`). Ngày "ĐÃ CHỐT" là thời điểm bấm Xác
 * nhận THẬT (truyền từ `gallery-app.tsx` lúc submit thành công), không phải
 * ngày bịa. Ngày dự kiến "khoảng 10 ngày" KHÔNG có nguồn thật trong schema
 * hiện tại (không trường nào lưu hạn chỉnh riêng biệt với hạn CHỌN `dueAt`)
 * — bỏ hẳn dòng đó, không bịa số, đúng luật đề bài BB-289.
 *
 * BB-289 lượt 2 — sửa "Đủ gói" hiện SAI khi mới chọn 1/10 tấm (đo <, không
 * phải >): "Đủ gói" chỉ đúng khi đã chọn ĐỦ HOẶC VƯỢT hạn mức, không phải
 * "chưa vượt". Ba trường hợp, không phải hai:
 *   - thiếu (đã chọn < hạn mức): "N/hạn mức tấm"
 *   - đúng (đã chọn = hạn mức): "Đủ gói"
 *   - vượt (đã chọn > hạn mức): "N/hạn mức · thêm X tấm"
 * Phép thử đỏ-khi-hoàn-nguyên: `tests/unit/cam-on-sau-chot.test.tsx`.
 */

import { vi } from "@/i18n";
import { cauBiaKhach, trangThaiVuaChot } from "@/lib/lark/trang-thai-app-lark";
import React from "react";
import { Check } from "lucide-react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatNgayVN } from "@/lib/utils/dinh-dang";

/**
 * BB-319 (K9, Ghi nhận) — MỘT dòng nói đủ "đã chọn bao nhiêu / gói có bao nhiêu",
 * thay cho hai chỗ lặp số ("6 tấm ảnh chỉnh sửa" + "6/20 tấm") mà không nói 20 là gì.
 */
export function dongSoTamCamOn(soTamDaChon: number, hanMuc: number | null): string {
  if (hanMuc == null) return `Đã chọn ${soTamDaChon} tấm`;
  if (soTamDaChon === hanMuc) return `Đã chọn ${soTamDaChon} tấm, đủ gói`;
  if (soTamDaChon < hanMuc) return `Đã chọn ${soTamDaChon} / ${hanMuc} tấm trong gói`;
  return `Đã chọn ${soTamDaChon} / ${hanMuc} tấm, thêm ${soTamDaChon - hanMuc} tấm`;
}

export interface CamOnSauChotProps {
  tenBe: string | null;
  /**
   * BB-353 (P0) — trạng thái bộ ảnh lúc hiện màn cảm ơn (thường `submitted`).
   * Tiêu đề lấy từ `cauBiaKhach()`, cùng nguồn với bìa + thẻ tiến trình.
   */
  trangThai?: string;
  giaiDoan?: number | null;
  chotLuc: Date;
  soTamDaChon: number;
  hanMuc: number | null;
  coBia: boolean | null; // null = bộ ảnh không có album trong gói nào cần bìa
  soMonMuaThem: number;
  tienMuaThem: number;
  onXemTienDo: () => void;
  /**
   * BB-351 (vòng 7, B mục 2) — studio đã xác nhận danh sách (bộ rời `submitted`). Màn này nghe
   * tín hiệu tức thì qua `gallery-app.tsx` (useCapNhatTucThi → loadGallery), nên đổi chữ NGAY,
   * không phải F5: hết "Chờ studio xác nhận… Vẫn thêm được ảnh".
   */
  studioDaXacNhan?: boolean;
  /**
   * BB-399 — khối "Bean trả ảnh chỉnh trong khoảng N ngày" (+ mua làm nhanh). Truyền sẵn từ
   * `gallery-app.tsx` (`TheLamAnhNhanhSauChot`) — màn đệm này không tự gọi API.
   */
  lamAnhNhanh?: React.ReactNode;
}

export function CamOnSauChot({
  tenBe,
  trangThai = "submitted",
  giaiDoan = null,
  chotLuc,
  soTamDaChon,
  hanMuc,
  coBia,
  soMonMuaThem,
  tienMuaThem,
  onXemTienDo,
  studioDaXacNhan = false,
  lamAnhNhanh = null,
}: CamOnSauChotProps) {
  return (
    <div
      data-testid="cam-on-sau-chot"
      role="status"
      aria-label="Đã gửi danh sách chọn ảnh"
      // BB-317 (K9) — máy tính: cả khối canh GIỮA theo chiều dọc màn, hết nửa dưới trống.
      // Điện thoại giữ nguyên (nội dung bắt đầu từ trên, nút ngay sau nội dung).
      className="mx-auto flex w-full max-w-md flex-col items-center bg-background px-6 pb-10 pt-8 text-center text-foreground sm:min-h-[100dvh] sm:justify-center sm:py-14"
    >
      {/*
        Tranh màu nước tròn đúng bản vẽ — `chot-thanh-cong` là tranh hành
        trình sẵn có (`public/hanh-trinh/`), dùng bản VUÔNG (không phải bản
        ngang 16:9 trong `CO_BAN_NGANG`) vì cắt vào khung tròn 1:1 đúng hơn.
        Huy hiệu tích trắng viền, màu sage, đè góc dưới-phải như bản vẽ.
      */}
      {/*
        BB-295 mục #13 — báo cáo chấm độc lập: huy hiệu ✓ hiện đủ vòng tròn
        trên điện thoại nhưng bị cắt còn nửa hình tròn trên máy tính. Gốc lỗi:
        huy hiệu từng là CON của khối `overflow-hidden rounded-full` bọc ảnh —
        khối đó tự cắt mọi con nằm ngoài đường tròn, kể cả huy hiệu đặt ở góc.
        Nay huy hiệu là ANH EM (sibling) của khối ảnh, không còn nằm trong
        vùng bị cắt tròn — không phụ thuộc bề rộng màn hình.
      */}
      <div className="relative h-[140px] w-[140px] shrink-0 sm:h-[180px] sm:w-[180px]">
        <div className="h-full w-full overflow-hidden rounded-full">
          <img
            src="/minh-hoa/cam-on-phong-thu-640.webp"
            srcSet="/minh-hoa/cam-on-phong-thu-320.webp 320w, /minh-hoa/cam-on-phong-thu-640.webp 640w"
            sizes="180px"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <span className="absolute bottom-1 right-1 grid h-9 w-9 place-items-center rounded-full border border-[#e5dcd2] bg-white text-[var(--bb-accent-sage,#7a9482)] shadow-sm">
          <Check className="h-4 w-4" strokeWidth={2.4} aria-hidden="true" />
        </span>
      </div>

      <p className="mt-4 text-[12px] uppercase tracking-[0.14em] text-muted-foreground">
        {/* BB-329 — vừa bấm Xác nhận là đã GỬI, chưa "đã chốt". Câu trạng thái nằm ở
            tiêu đề `cam-on-trang-thai` (BB-353, một hàm `trangThaiKhach`). */}
        Đã gửi · {formatNgayVN(chotLuc)}
      </p>
      <h1 data-testid="cam-on-trang-thai" className="mt-2 font-display text-[28px] font-light leading-[1.15] sm:text-[32px]">
        {cauBiaKhach(trangThaiVuaChot(trangThai), giaiDoan, tenBe, { khoa: true })}
      </h1>
      <p className="mt-2.5 text-[15px] text-muted-foreground">
        {vi.gallery.loiBean.camOnChonTungKhoanhKhac}
      </p>
      {/* BB-338 mục 1 — lời ký của studio, Playfair không nghiêng. */}
      <p data-testid="loi-ky-bean" className="mt-1.5 font-display text-[18px] font-normal not-italic text-foreground">
        Yours truly Bean
      </p>

      {/* BB-362 (vòng 9–10, K09) — khối tóm tắt CHỈ ĐỌC: nền be, không viền trắng
          (viền + nền trắng trông như ô nhập). */}
      <div data-testid="cam-on-tom-tat" className="mt-6 w-full rounded-2xl bg-surface-2 px-4 text-left">
        <div className="flex h-[46px] items-center gap-3 text-[15px]">
          <span data-testid="cam-on-dong-so-tam">{dongSoTamCamOn(soTamDaChon, hanMuc)}</span>
        </div>
        {coBia != null && (
          <div className="flex h-[46px] items-center gap-3 border-t border-[var(--bb-border)] text-[15px]">
            <span>Bìa album</span>
            <span className="ml-auto text-[13px] text-muted-foreground">{coBia ? "Đã chọn" : "Cần chọn"}</span>
          </div>
        )}
        {soMonMuaThem > 0 && (
          <div className="flex h-[46px] items-center gap-3 border-t border-[var(--bb-border)] text-[15px]">
            <span>Mua thêm {soMonMuaThem} món</span>
            <span className="ml-auto text-[13px] text-muted-foreground">{formatCurrencyVND(tienMuaThem)}</span>
          </div>
        )}
      </div>

      {lamAnhNhanh && <div className="mt-3 w-full empty:hidden">{lamAnhNhanh}</div>}

      {/*
        BB-289 lượt 2 — nút NGAY SAU nội dung (không `mt-auto`/`min-h-[80dvh]`
        đẩy xuống đáy màn): chủ studio/Opus soát thấy bố cục "trống lửng
        giữa màn" trên máy cao. Khoảng trống ba mẹ thấy là khoảng padding
        `pb-10` cố định ở cuối, không phải một cụm bị kéo giãn.
      */}
      <div className="mt-8 w-full">
        <button
          type="button"
          onClick={onXemTienDo}
          className="h-[52px] w-full rounded-full bg-[#2e2a27] text-[15px] font-medium text-[#fdfbf9] transition hover:bg-[#2e2a27]/90 active:scale-[0.98]"
        >
          Xem tiến độ
        </button>
        <p data-testid="cam-on-chu-thich" className="mt-3 text-[13px] text-muted-foreground">
          {studioDaXacNhan
            ? `Bean đang chỉnh ảnh của ${tenBe?.trim() || "bé"}, danh sách đã khoá ạ.`
            : vi.gallery.loiBean.vanThemDuocAnh}
        </p>
      </div>
    </div>
  );
}
