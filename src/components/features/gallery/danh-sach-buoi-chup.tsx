"use client";

/**
 * Danh sách buổi chụp của một khách — màn hình đầu tiên của link theo khách.
 *
 * OWNER: DEV-BE. Task BB-130.
 * Spec: docs/16 mục 6f
 *
 * ---------------------------------------------------------------------------
 * Vì sao có màn này
 * ---------------------------------------------------------------------------
 * Link kiểu cũ trỏ thẳng vào một bộ ảnh, mở ra là thấy lưới ảnh ngay. Link
 * theo khách (`0010`) là ĐỊA CHỈ VĨNH VIỄN của ba mẹ, mà chủ studio đã chốt
 * "một khách hàng nhiều buổi chụp" — nên mở ra chưa biết ba mẹ muốn xem buổi
 * nào. Đây là chỗ hỏi.
 *
 * Bấm vào một buổi thì máy chủ ký lại phiên cho trỏ vào bộ ảnh đó, rồi màn
 * hình tải lại theo đường cũ. Không có nhánh hiển thị nào mới phía sau: từ
 * giây đó trở đi ba mẹ đang ở đúng màn chọn ảnh vẫn chạy lâu nay.
 *
 * BB-212 — đổi sang ngôn ngữ "cuốn album kỷ niệm" (font-display Fraunces,
 * nền kem, nút viên tròn màu mực). Hành vi giữ nguyên.
 */

import { useCallback, useEffect, useState } from "react";
import { Camera, ChevronRight, AlertCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/utils";

export interface BuoiChupTomTat {
  id: string;
  ten: string;
  ngayChup: string | null;
  soAnh: number;
  trangThai: string;
  nhanTrangThai: string;
  anhBiaId: string | null;
  dangXem: boolean;
}

interface Props {
  /** Gọi sau khi phiên đã trỏ sang buổi chụp ba mẹ chọn. */
  onDaChonBuoi: () => void;
}

/** "2026-08-01" → "01.08.2026". Ba mẹ đọc ngày kiểu Việt, không đọc ISO. */
function ngayVietNam(raw: string | null): string | null {
  if (!raw) return null;
  const [nam, thang, ngay] = raw.slice(0, 10).split("-");
  if (!nam || !thang || !ngay) return null;
  return `${ngay}.${thang}.${nam}`;
}

export function DanhSachBuoiChup({ onDaChonBuoi }: Props) {
  const [dangTai, setDangTai] = useState(true);
  const [danhSach, setDanhSach] = useState<BuoiChupTomTat[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangMo, setDangMo] = useState<string | null>(null);

  const tai = useCallback(async () => {
    try {
      setDangTai(true);
      setLoi(null);
      const res = await fetch("/api/g/buoi-chup", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Chưa mở được danh sách buổi chụp, ba mẹ thử lại giúp");
        return;
      }
      setDanhSach((json?.data?.buoiChup ?? []) as BuoiChupTomTat[]);
    } catch {
      setLoi("Không kết nối được, ba mẹ kiểm tra giúp đường mạng rồi thử lại");
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  /**
   * Chặn bấm hai lần: mỗi lần bấm là một lần ký lại cookie phiên, và hai lần
   * ký chồng nhau có thể để ba mẹ rơi vào buổi chụp họ bấm TRƯỚC.
   */
  const moBuoi = async (id: string) => {
    if (dangMo) return;
    setDangMo(id);
    setLoi(null);
    try {
      const res = await fetch("/api/g/buoi-chup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buoiChupId: id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setLoi(json?.error?.message ?? "Chưa mở được buổi chụp này, ba mẹ thử lại giúp");
        setDangMo(null);
        return;
      }
      onDaChonBuoi();
    } catch {
      setLoi("Không kết nối được, ba mẹ thử lại giúp");
      setDangMo(null);
    }
  };

  if (dangTai) {
    return (
      <div className="flex min-h-[80dvh] flex-col items-center justify-center gap-3 bg-background p-6 text-foreground">
        <Spinner className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">Đang mở album của ba mẹ…</p>
      </div>
    );
  }

  // Không có buổi nào để xem. Thường là ảnh chưa lên kịp — nên câu chữ phải
  // trấn an và chỉ việc tiếp theo, chứ không để ba mẹ tưởng mất ảnh.
  if (danhSach.length === 0 && !loi) {
    return (
      <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col items-center justify-center bg-background p-6 text-center text-foreground">
        <div className="relative mb-6 h-[160px] w-[160px] md:h-[200px] md:w-[200px]">
          <img
            src="/hanh-trinh/chua-co-anh-640.webp"
            srcSet="/hanh-trinh/chua-co-anh-320.webp 320w, /hanh-trinh/chua-co-anh-640.webp 640w"
            sizes="(max-width: 768px) 160px, 200px"
            alt=""
            loading="lazy"
            width={640}
            height={640}
            className="absolute inset-0 h-full w-full object-contain animate-in fade-in duration-300 motion-reduce:animate-none"
          />
        </div>
        <h1 className="font-display text-2xl font-light">Album đang được chuẩn bị</h1>
        <p className="mb-6 mt-2 text-sm text-muted-foreground">
          Studio đang sắp ảnh buổi chụp của bé. Ba mẹ mở lại link này sau một chút giúp nhé,
          link không hết hạn đâu ạ.
        </p>
        <button
          type="button"
          onClick={() => void tai()}
          className="h-11 rounded-full border border-border px-6 text-sm font-medium transition hover:bg-surface-2"
        >
          Tải lại
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <header className="mb-6 sm:mb-8">
          <h1 className="font-display text-3xl font-light tracking-tight sm:text-4xl">
            Album của bé
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ba mẹ chọn buổi chụp muốn xem ạ. Link này là của riêng gia đình mình và không hết hạn,
            ba mẹ lưu lại để xem ảnh bất cứ lúc nào.
          </p>
        </header>

        {loi && (
          <div className="mb-5 flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{loi}</span>
          </div>
        )}

        <ul className="flex flex-col gap-3">
          {danhSach.map((buoi) => {
            const ngay = ngayVietNam(buoi.ngayChup);
            const dangMoBuoiNay = dangMo === buoi.id;

            return (
              <li key={buoi.id}>
                <button
                  type="button"
                  onClick={() => void moBuoi(buoi.id)}
                  disabled={dangMo !== null}
                  className={cn(
                    // Ô chạm cao ≥ 88px: ba mẹ bấm trên điện thoại một tay,
                    // thường là đang bế bé.
                    "group flex w-full items-center gap-4 rounded-2xl border border-border bg-surface p-3 text-left transition-all",
                    "min-h-[88px] touch-manipulation focus:outline-hidden",
                    dangMo !== null && !dangMoBuoiNay && "opacity-50",
                    buoi.dangXem ? "border-primary/50 ring-1 ring-primary/30" : "hover:border-foreground/20",
                  )}
                >
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-surface-2 sm:h-20 sm:w-20">
                    {buoi.anhBiaId ? (
                      /* Ảnh đi qua proxy, không lộ id tệp bên Drive. */
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={`/api/img/${buoi.anhBiaId}?w=400`}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Camera className="h-6 w-6" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{buoi.ten}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {ngay ? `Chụp ngày ${ngay}` : "Chưa ghi ngày chụp"}
                      {" · "}
                      {buoi.soAnh} ảnh
                    </p>
                    <p className="mt-1 text-xs text-moss">{buoi.nhanTrangThai}</p>
                  </div>

                  {dangMoBuoiNay ? (
                    <Spinner className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
