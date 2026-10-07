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
 * BB-212 — đổi sang ngôn ngữ "cuốn album kỷ niệm" (font-display, nền kem, nút
 * viên tròn màu mực). Hành vi giữ nguyên. BB-305 (28/09/2026): font-display
 * chuyển từ Fraunces sang Playfair Display (LUẬT PHÔNG mới, Fraunces bị loại
 * hẳn khỏi hệ thống).
 *
 * BB-378 (P2, anh: "các màn phụ còn kiểu cũ") — dựng lại theo ngôn ngữ trang gia
 * đình `/k` (BB-334B): nền kem, logo hạt đậu, nhãn nhỏ + tiêu đề Playfair, mỗi
 * buổi là một dòng có bìa, chữ "bộ ảnh" (không "album" — album là sản phẩm in),
 * giọng Bean, và nút "Nhắn Bean" ở cuối. Hành vi (GET/POST /api/g/buoi-chup,
 * chặn bấm hai lần) giữ nguyên.
 */

import { vi } from "@/i18n";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronRight, AlertCircle, MessageCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/utils";
import { formatSo } from "@/lib/utils/dinh-dang";
import { giuA } from "@/lib/utils/giu-a";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";

const C = vi.gallery.chonBuoi;
/** Ô bìa chưa có ảnh: khối màu trơn (cùng bảng màu trang gia đình `/k`). */
const TONG_BIA = ["#e7d3c6", "#d6e2da", "#ead9cf", "#efe7dc"];

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
  /** BB-378 — `settings.chat.page_url` cho nút "Nhắn Bean"; null thì ẩn nút. */
  chatUrl?: string | null;
}

/** "2026-08-01" → "01.08.2026". Ba mẹ đọc ngày kiểu Việt, không đọc ISO. */
function ngayVietNam(raw: string | null): string | null {
  if (!raw) return null;
  const [nam, thang, ngay] = raw.slice(0, 10).split("-");
  if (!nam || !thang || !ngay) return null;
  return `${ngay}.${thang}.${nam}`;
}

export function DanhSachBuoiChup({ onDaChonBuoi, chatUrl = null }: Props) {
  const [dangTai, setDangTai] = useState(true);
  const [danhSach, setDanhSach] = useState<BuoiChupTomTat[]>([]);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangMo, setDangMo] = useState<string | null>(null);

  const tai = useCallback(async () => {
    try {
      setDangTai(true);
      setLoi(null);
      const res = await goiApiKhach("/api/g/buoi-chup", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? vi.gallery.loiBean.chuaMoDuocDanhSachBuoi);
        return;
      }
      setDanhSach((json?.data?.buoiChup ?? []) as BuoiChupTomTat[]);
    } catch {
      setLoi(vi.gallery.loiBean.kiemTraMangThuLai);
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
      const res = await goiApiKhach("/api/g/buoi-chup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buoiChupId: id }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setLoi(json?.error?.message ?? vi.gallery.loiBean.chuaMoDuocBuoi);
        setDangMo(null);
        return;
      }
      onDaChonBuoi();
    } catch {
      setLoi(vi.gallery.loiBean.khongKetNoi);
      setDangMo(null);
    }
  };

  const nutNhan =
    chatUrl && /^https?:\/\//i.test(chatUrl) ? (
      <a
        data-testid="chon-buoi-nhan-bean"
        href={chatUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e5dcd2] bg-white px-5 text-[14px] font-medium text-[#2e2a27] transition hover:bg-[#f3ede6]"
      >
        <MessageCircle className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        {vi.gallery.manLoi.nhanBean}
      </a>
    ) : null;

  if (dangTai) {
    return (
      <KhungChonBuoi>
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-3">
          <Spinner className="h-8 w-8 text-primary" />
          <p className="text-sm text-[#6f665f]">{C.dangMo}</p>
        </div>
      </KhungChonBuoi>
    );
  }

  // Không có buổi nào để xem. Thường là ảnh chưa lên kịp — nên câu chữ phải
  // trấn an và chỉ việc tiếp theo, chứ không để ba mẹ tưởng mất ảnh.
  if (danhSach.length === 0 && !loi) {
    return (
      <KhungChonBuoi>
        <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 text-center">
          <div className="relative mb-6 h-[160px] w-[160px] md:h-[200px] md:w-[200px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/hanh-trinh/chua-co-anh-640.webp"
              srcSet="/hanh-trinh/chua-co-anh-320.webp 320w, /hanh-trinh/chua-co-anh-640.webp 640w"
              sizes="(max-width: 768px) 160px, 200px"
              alt=""
              loading="lazy"
              width={640}
              height={640}
              className="absolute inset-0 h-full w-full object-contain mix-blend-multiply animate-in fade-in duration-300 motion-reduce:animate-none"
            />
          </div>
          <h1 className="font-display text-[28px] font-normal not-italic leading-tight">{C.dangChuanBiTieuDe}</h1>
          <p className="mb-6 mt-2 text-pretty text-[15px] leading-relaxed text-[#6f665f]">
            {giuA(vi.gallery.loiBean.dangSapAnh)} {giuA(vi.gallery.loiBean.linkKhongHetHan)}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => void tai()}
              className="h-11 rounded-full bg-[#2e2a27] px-6 text-[14px] font-medium text-[#fbf7f2] transition hover:bg-[#2e2a27]/90"
            >
              {C.taiLai}
            </button>
            {nutNhan}
          </div>
        </div>
      </KhungChonBuoi>
    );
  }

  return (
    <KhungChonBuoi>
      <div data-testid="chon-buoi-chup" className="mx-auto max-w-[640px] px-4 pb-14 pt-6 lg:pt-12">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#6f665f]">{C.nhan}</p>
        <h1 className="mt-2 font-display text-[30px] font-normal not-italic leading-[1.15] lg:text-[38px]">{C.tieuDe}</h1>
        <p className="mt-1.5 text-pretty text-[13.5px] leading-[1.5] text-[#6f665f] lg:text-[15px]">
          {giuA(C.moTa)}
        </p>

        {loi && (
          <div className="mt-5 flex items-start gap-2 rounded-2xl border border-[#e8a598]/60 bg-[#e8a598]/10 p-4 text-sm text-[#2e2a27]">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#c0705f]" />
            <span>{giuA(loi)}</span>
          </div>
        )}

        <ul className="mt-5 border-t border-[#e5dcd2]">
          {danhSach.map((buoi, i) => {
            const ngay = ngayVietNam(buoi.ngayChup);
            const dangMoBuoiNay = dangMo === buoi.id;

            return (
              <li key={buoi.id} className="border-b border-[#e5dcd2]">
                <button
                  type="button"
                  data-testid="dong-buoi-chup"
                  onClick={() => void moBuoi(buoi.id)}
                  disabled={dangMo !== null}
                  className={cn(
                    // Ô chạm cao ≥ 88px: ba mẹ bấm trên điện thoại một tay, thường là đang bế bé.
                    "group flex min-h-[96px] w-full touch-manipulation items-center gap-3.5 py-3.5 text-left transition focus:outline-hidden",
                    dangMo !== null && !dangMoBuoiNay && "opacity-50",
                  )}
                >
                  <div
                    className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl"
                    style={{ background: TONG_BIA[i % TONG_BIA.length] }}
                  >
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
                      <span
                        aria-hidden="true"
                        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_30%_20%,rgba(255,255,255,.35),transparent_60%)]"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium leading-[1.3]">{buoi.ten}</p>
                    <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6f665f]">
                      {ngay ? C.chup.replace("{ngay}", ngay) : C.chuaGhiNgay}
                      {" · "}
                      {C.soAnh.replace("{so}", formatSo(buoi.soAnh))}
                    </p>
                    <span className="mt-1.5 inline-flex h-6 max-w-full items-center gap-1.5 rounded-full bg-[#f3ede6] px-2.5 text-[12px] font-medium text-[#6f665f]">
                      <i aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                      <span className="truncate">{buoi.dangXem ? C.dangXem : buoi.nhanTrangThai}</span>
                    </span>
                  </div>

                  {dangMoBuoiNay ? (
                    <Spinner className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <ChevronRight
                      className="h-5 w-5 shrink-0 text-[#6f665f] transition-transform group-hover:translate-x-0.5"
                      strokeWidth={1.5}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        {nutNhan && <div className="mt-8 flex justify-center">{nutNhan}</div>}
      </div>
    </KhungChonBuoi>
  );
}

/** Khung chung: nền kem + đầu trang logo hạt đậu (cùng trang gia đình `/k`). */
function KhungChonBuoi({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-[#fbf7f2] text-[#2e2a27]">
      <header className="sticky top-0 z-20 flex h-14 items-center justify-center border-b border-[#e5dcd2] bg-[rgba(251,247,242,.94)] backdrop-blur-md">
        <span className="inline-flex items-center gap-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/logo-hat-dau-64.png" alt="" aria-hidden="true" className="h-[18px] w-[18px]" />
          <span className="font-display text-[15px] font-normal not-italic uppercase tracking-[0.2em]">Baby Bean</span>
        </span>
      </header>
      {children}
    </div>
  );
}
