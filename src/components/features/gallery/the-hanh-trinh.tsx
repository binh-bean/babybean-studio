import React from "react";
import { tranhHanhTrinh, buocHanhTrinh, anhHanhTrinh } from "./hanh-trinh";
import { trangThaiKhach } from "@/lib/lark/trang-thai-app-lark";
import { cn } from "@/components/ui/utils";

interface TheHanhTrinhProps {
  status: string;
  giaiDoan: number | null;
  /** Không còn dùng làm tiêu đề (BB-353): tiêu đề lấy từ `trangThaiKhach()`, chung nguồn với bìa. */
  nhanTienDo?: string | null;
  photoCount: number;
  /**
   * BB-355 — bản vẽ "Màn khách v8" (b): đã gửi, chờ Bean xác nhận. Thẻ GỘP thay
   * bốn khối cũ (thẻ tiến độ có tranh, thẻ khoá, thẻ đợt chọn, khối mời): tiêu đề
   * · 5 bước · một dòng phụ · hàng "Mời ông bà cùng xem". Không tranh (anh chốt).
   * Máy tính: dải ngang rộng bằng lưới — chữ trái, 5 bước giữa, nút phải.
   */
  gop?: { dongPhu: string | null; moiOngBa: React.ReactNode } | null;
}

/** BB-355 — thẻ gộp: không tranh, chữ trái; máy tính thành dải ngang. */
function TheGop({
  tieuDe,
  buoc,
  hienTai,
  dongPhu,
  moiOngBa,
}: {
  tieuDe: string;
  buoc: readonly string[];
  hienTai: number;
  dongPhu: string | null;
  moiOngBa: React.ReactNode;
}) {
  return (
    <div
      data-testid="the-tien-do-gop"
      className="rounded-[12px] border border-[#e5dcd2] bg-white px-5 pt-5 lg:grid lg:grid-cols-[minmax(0,1fr)_520px_auto] lg:items-center lg:gap-x-12 lg:px-7 lg:py-6"
    >
      <h3 className={cn("kh-h3 text-[#2E2A27] lg:col-start-1 lg:row-start-1", dongPhu ? "lg:self-end" : "lg:row-span-2")}>
        {tieuDe}
      </h3>
      <ol
        aria-label="5 bước"
        className="relative mt-[18px] grid grid-cols-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:mt-0"
      >
        <li aria-hidden="true" className="absolute left-[10%] right-[10%] top-[6px] h-[2px] bg-[#e5dcd2]" />
        {hienTai > 0 && (
          <li
            aria-hidden="true"
            className="absolute left-[10%] top-[6px] h-[2px] bg-[#2E2A27]"
            style={{ width: `${(hienTai / (buoc.length - 1)) * 80}%` }}
          />
        )}
        {buoc.map((b, idx) => {
          const dangHienTai = idx === hienTai;
          const daQua = idx < hienTai;
          return (
            <li
              key={b}
              aria-current={dangHienTai ? "step" : undefined}
              className="relative flex flex-col items-center gap-2 text-center lg:gap-2.5"
            >
              <span
                className={cn(
                  "rounded-full",
                  dangHienTai
                    ? "h-[14px] w-[14px] bg-[#2E2A27] shadow-[0_0_0_4px_#ece3d7]"
                    : daQua
                      ? "mt-[2px] h-[10px] w-[10px] bg-[#2E2A27]"
                      : "mt-[2px] h-[10px] w-[10px] bg-[#e5dcd2]",
                )}
              />
              <span
                className={cn(
                  "whitespace-pre-line text-[11px] leading-[1.3] lg:whitespace-nowrap lg:text-[13px]",
                  dangHienTai ? "font-semibold text-[#2E2A27]" : daQua ? "text-[#2E2A27]" : "text-[#6b6057]",
                )}
              >
                {/* Một phần tử chữ: điện thoại xuống hai dòng (pre-line), máy tính `nowrap` gộp lại một dòng. */}
                {b.replace(" ", "\n")}
              </span>
            </li>
          );
        })}
      </ol>
      {dongPhu && (
        <p
          data-testid="dong-phu-tien-do"
          className="mt-3.5 text-[13px] leading-snug text-[#6b6057] lg:col-start-1 lg:row-start-2 lg:mt-1.5 lg:self-start"
        >
          {dongPhu}
        </p>
      )}
      {moiOngBa ? (
        <div className="mt-3.5 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:mt-0">{moiOngBa}</div>
      ) : (
        <div className="h-5 lg:hidden" />
      )}
    </div>
  );
}

export function TheHanhTrinh({ status, giaiDoan, photoCount, gop }: TheHanhTrinhProps) {
  // Chỉ hiện khi status từ submitted trở đi (hoặc awaiting_approval, in_retouch).
  // Tuy nhiên, logic này sẽ được quyết định bên gallery-app, nhưng ta cũng kiểm tra ở đây để chắc chắn.
  // `approved` (ba mẹ đã duyệt, chờ in/giao) từng bị bỏ sót ở đây — đúng lúc
  // ba mẹ hay mở lại app nhất để hỏi "bao giờ có ảnh" (Opus soát BB-225).
  //
  // BB-298 — admin duyệt 28/09/2026 (XONG.md mục 4): khi ĐÃ GIAO, thanh 5
  // bước nhường chỗ cho MỘT dấu "Đã hoàn thiện" ở màn Đã giao (bìa) —
  // "thanh 5 bước chỉ hiện khi đang làm". Bỏ `"delivered"` khỏi danh sách
  // hiện thẻ này; component `DaGiaoBia` (gallery-app.tsx) đảm nhiệm việc báo
  // trạng thái đã giao thay cho thẻ hành trình.
  const isPostSubmit = ["submitted", "in_retouch", "awaiting_approval", "approved"].includes(status);
  
  if (!isPostSubmit) return null;

  const tenTranh = tranhHanhTrinh(status, giaiDoan, photoCount);
  if (!tenTranh) return null;

  const { buoc, hienTai } = buocHanhTrinh(status, giaiDoan);
  // BB-329 — vừa chốt, CSKH chưa xác nhận: nói đúng là đang CHỜ studio, không
  // nói "đã nhận"/"đã chốt" như thể bộ ảnh đã vào hàng chỉnh.
  // BB-353 (P0) — tiêu đề thẻ và câu trạng thái trên bìa (`cauBiaKhach`) đọc
  // CÙNG một dòng của `TRANG_THAI_BO_ANH` qua `trangThaiKhach()`.
  const nhanText = trangThaiKhach(status, giaiDoan).khach;
  if (gop) {
    return <TheGop tieuDe={nhanText} buoc={buoc} hienTai={hienTai} dongPhu={gop.dongPhu} moiOngBa={gop.moiOngBa} />;
  }
  const anh = anhHanhTrinh(tenTranh);

  return (
    <div className="flex flex-col items-center justify-center overflow-hidden rounded-[24px] bg-white text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      {/*
        BB-258 — chủ studio 26/09/2026: tranh cũ nhét vuông giữa thẻ
        (`object-contain`, nền thẻ trắng lộ quanh tranh) nhìn như một ô vuông
        nổi lên — "viền lộ, thiếu thẩm mỹ". Nay tranh TRÀN ĐẦY phần trên của
        thẻ: rộng bằng thẻ, `object-cover`, bo góc trên THEO thẻ (bo bằng
        `overflow-hidden` ở khung ngoài, không tự bo lại ở <img>). Nền
        `#fdfbf9` phía sau phòng khi ảnh còn đang tải hoặc lỗi — trùng màu nền
        tranh gốc nên không lộ viền dù `object-cover` gần như luôn phủ kín.
      */}
      <div className="relative h-[160px] w-full bg-[#fdfbf9] sm:h-[180px] md:h-[200px]">
        <img
          src={anh.src}
          srcSet={anh.srcSet}
          sizes="100vw"
          alt=""
          loading="lazy"
          width={anh.ngang ? 1280 : 640}
          height={anh.ngang ? 720 : 640}
          className="absolute inset-0 h-full w-full object-cover object-center animate-in fade-in duration-300 motion-reduce:animate-none"
        />
      </div>

      <div className="flex w-full flex-col items-center px-6 pb-10 pt-6">
      {/*
        BB-287 mục 1/#27 — báo cáo chấm: ba thẻ liền nhau trong "hành trình"
        (thẻ này, `ReviewPanel`, `MoiMuaLanHai`/`MoiNguoiThan` teaser) từng
        dùng ba cỡ chữ khác nhau (18/22 đậm/24→28). Cả bốn nay dùng chung
        `kh-h3` — CÙNG một bậc trong thang chữ 6 bậc.
      */}
      <h3 className="kh-h3 max-w-[280px] text-balance text-[#2E2A27]">
        {nhanText}
      </h3>

      {/* BB-329 — nhãn bước mới dài hơn ("Chờ xác nhận"): mỗi nhãn xuống HAI dòng ngắn
          (tách ở khoảng trắng đầu tiên), và đường chấm thu vào 12px mỗi bên — năm nhãn
          không đè nhau, nhãn đầu/cuối không tràn khỏi thẻ ở 390px. */}
      <div className="mt-12 w-full max-w-[300px] px-3">
        <div className="relative flex items-center justify-between">
          {/* Đường nối */}
          <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-[#E5DED6]" />
          <div 
            className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-[#2E2A27] transition-all duration-500"
            style={{ width: `${(hienTai / (buoc.length - 1)) * 100}%` }}
          />

          {buoc.map((b, idx) => {
            const daQua = idx < hienTai;
            const dangHienTai = idx === hienTai;
            
            return (
              <div 
                key={b} 
                className="relative z-10 flex flex-col items-center gap-2"
                aria-current={dangHienTai ? "step" : undefined}
              >
                <div 
                  className={cn(
                    "flex h-[14px] w-[14px] items-center justify-center rounded-full transition-colors",
                    daQua ? "bg-[#2E2A27]" : 
                    dangHienTai ? "bg-[#2E2A27] ring-[5px] ring-[#E5DED6] ring-offset-[3px] ring-offset-white" : 
                    "bg-[#E5DED6]"
                  )}
                />
                <span
                  className={cn(
                    "absolute top-6 w-max whitespace-pre-line text-center text-[11px] font-medium leading-tight transition-colors",
                    daQua || dangHienTai ? "text-[#2E2A27]" : "text-[#2E2A27]/50"
                  )}
                >
                  {b.replace(" ", "\n")}
                </span>
              </div>
            );
          })}
        </div>
        <div className="h-7" aria-hidden="true" />
      </div>
      </div>
    </div>
  );
}
