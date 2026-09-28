import React from "react";
import { tranhHanhTrinh, buocHanhTrinh, anhHanhTrinh } from "./hanh-trinh";
import { cn } from "@/components/ui/utils";

interface TheHanhTrinhProps {
  status: string;
  giaiDoan: number | null;
  nhanTienDo?: string | null;
  photoCount: number;
}

export function TheHanhTrinh({ status, giaiDoan, nhanTienDo, photoCount }: TheHanhTrinhProps) {
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
  const nhanText = nhanTienDo || (status === "submitted" ? "Studio đã nhận danh sách chọn" : "Tiến độ xử lý");
  const anh = anhHanhTrinh(tenTranh);

  return (
    <div className="flex flex-col items-center justify-center overflow-hidden rounded-[24px] bg-white text-center shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      {/*
        BB-258 — chủ studio 26/09/2026: tranh cũ nhét vuông giữa thẻ
        (`object-contain`, nền thẻ trắng lộ quanh tranh) nhìn như một ô vuông
        nổi lên — "viền lộ, thiếu thẩm mỹ". Nay tranh TRÀN ĐẦY phần trên của
        thẻ: rộng bằng thẻ, `object-cover`, bo góc trên THEO thẻ (bo bằng
        `overflow-hidden` ở khung ngoài, không tự bo lại ở <img>). Nền
        `#FBF7F2` phía sau phòng khi ảnh còn đang tải hoặc lỗi — trùng màu nền
        tranh gốc nên không lộ viền dù `object-cover` gần như luôn phủ kín.
      */}
      <div className="relative h-[160px] w-full bg-[#FBF7F2] sm:h-[180px] md:h-[200px]">
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
      <h3 className="kh-h3 max-w-[280px] text-[#2E2A27]">
        {nhanText}
      </h3>

      <div className="mt-12 w-full max-w-[300px]">
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
                    "absolute top-6 w-max text-[10px] font-medium sm:text-[11px] transition-colors",
                    daQua || dangHienTai ? "text-[#2E2A27]" : "text-[#2E2A27]/50"
                  )}
                >
                  {b}
                </span>
              </div>
            );
          })}
        </div>
        <div className="h-4" aria-hidden="true" />
      </div>
      </div>
    </div>
  );
}
