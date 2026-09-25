import React from "react";
import { tranhHanhTrinh, buocHanhTrinh } from "./hanh-trinh";
import { cn } from "@/components/ui/utils";

interface TheHanhTrinhProps {
  status: string;
  giaiDoan: number | null;
  nhanTienDo?: string | null;
  photoCount: number;
}

export function TheHanhTrinh({ status, giaiDoan, nhanTienDo, photoCount }: TheHanhTrinhProps) {
  // Chỉ hiện khi status từ submitted trở đi (hoặc đã giao, awaiting_approval, in_retouch).
  // Tuy nhiên, logic này sẽ được quyết định bên gallery-app, nhưng ta cũng kiểm tra ở đây để chắc chắn.
  const isPostSubmit = status === "submitted" || status === "in_retouch" || status === "awaiting_approval" || status === "delivered";
  
  if (!isPostSubmit) return null;

  const tenTranh = tranhHanhTrinh(status, giaiDoan, photoCount);
  if (!tenTranh) return null;

  const { buoc, hienTai } = buocHanhTrinh(status, giaiDoan);
  const nhanText = nhanTienDo || (status === "submitted" ? "Studio đã nhận danh sách chọn" : "Tiến độ xử lý");

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-border bg-[#f5efe6] p-6 text-center shadow-sm">
      <div className="relative mb-6 h-[160px] w-[160px] md:h-[200px] md:w-[200px]">
        <img
          src={`/hanh-trinh/${tenTranh}-640.webp`}
          srcSet={`/hanh-trinh/${tenTranh}-320.webp 320w, /hanh-trinh/${tenTranh}-640.webp 640w`}
          sizes="(max-width: 768px) 160px, 200px"
          alt=""
          loading="lazy"
          width={640}
          height={640}
          className="absolute inset-0 h-full w-full object-contain animate-in fade-in duration-300 motion-reduce:animate-none"
        />
      </div>

      <h3 className="mb-6 font-display text-xl font-medium text-foreground md:text-2xl">
        {nhanText}
      </h3>

      <div className="w-full max-w-md">
        <div className="flex items-center justify-between relative">
          {/* Đường nối */}
          <div className="absolute left-0 top-1/2 h-[2px] w-full -translate-y-1/2 bg-surface-2" />
          <div 
            className="absolute left-0 top-1/2 h-[2px] -translate-y-1/2 bg-primary transition-all duration-500"
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
                    "flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors",
                    daQua ? "border-primary bg-primary" : 
                    dangHienTai ? "border-primary bg-background ring-4 ring-primary/20" : 
                    "border-surface-2 bg-background"
                  )}
                />
                <span 
                  className={cn(
                    "absolute top-6 w-max text-[10px] font-medium sm:text-xs transition-colors",
                    daQua || dangHienTai ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {b}
                </span>
              </div>
            );
          })}
        </div>
        <div className="h-8" aria-hidden="true" />
      </div>
    </div>
  );
}
