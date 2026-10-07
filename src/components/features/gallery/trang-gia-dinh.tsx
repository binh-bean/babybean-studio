"use client";

/**
 * BB-334B — trang album gia đình `/k/<mã>` (bản vẽ 01 điện thoại, 02 máy tính:
 * babybean-assets/BB-334/ban-ve). Thay màn "Album của bé" (danh-sach-buoi-chup,
 * BB-130) cho đường `/k/`; đường `/g/` giữ nguyên màn cũ.
 *
 * OWNER: DEV-FE. Hợp đồng: docs/29-link-gia-dinh.md §2.1.
 *
 *  · Điện thoại: bộ CẦN ba mẹ làm nổi lên đầu thành thẻ lớn; còn lại là dòng
 *    gọn. Nhà chỉ một bộ → một thẻ lớn (anh chốt Q3 ★).
 *  · Máy tính: lưới 3 cột, mọi bộ là thẻ; bộ cần làm đứng đầu, nút đặc + bóng.
 *  · Nhãn trạng thái lấy NGUYÊN `trangThai.khach` của máy chủ (BB-353).
 *  · Tự cập nhật: nghe `kenhTucThi` (kênh BB-342 của mọi bộ đang hiện).
 */
import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useState, type ReactNode } from "react";
import { ChevronRight, Clock, Heart, Lock, Printer, Images } from "lucide-react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { Spinner } from "@/components/ui/spinner";
import { giuA } from "@/lib/utils/giu-a";
import { formatSo } from "@/lib/utils/dinh-dang";
import { BUOC_KHACH } from "@/lib/lark/trang-thai-app-lark";
import { useCapNhatTucThi } from "@/lib/utils/use-cap-nhat-tuc-thi";
import {
  canBaMeLam,
  duongDanBo,
  loaiChip,
  ngayChupHienThi,
  tenBoHienThi,
  xepBoTrenTrang,
  type BoAnhGiaDinh,
  type NhaGiaDinh,
} from "@/lib/utils/trang-gia-dinh";
import { useNhaGiaDinh } from "@/components/features/gallery/use-nha-gia-dinh";
import { LoiGoiYLuuApp } from "@/components/features/gallery/loi-goi-y-luu-app";
import { MoiNguoiThan } from "@/components/features/gallery/moi-nguoi-than";
import { ManLoiLink, loaiLoiTuMa } from "@/components/features/gallery/man-loi-link";

const HuongDanThemManHinh = dynamic(
  () => import("@/components/features/gallery/huong-dan-them-man-hinh").then((m) => m.HuongDanThemManHinh),
  { ssr: false },
);

const G = vi.gallery.giaDinh;

/** Ô bìa chưa có ảnh: khối màu trơn, hai tông của bản vẽ (không người, không em bé). */
const TONG_BIA = ["#e7d3c6", "#d6e2da", "#ead9cf", "#efe7dc"];

/** "Nhà bé Mít" → "bé Mít"; "Bé Mít & Na" → "bé Mít & Na"; "Baby Bean" → null. */
export function tenBeTrongLoiChao(tenNha: string): string | null {
  const t = tenNha.trim();
  if (!t || /^baby ?bean$/i.test(t)) return null;
  const bo = t.replace(/^nhà\s+/i, "");
  return /^bé\s/i.test(bo) ? `bé ${bo.slice(3)}` : bo;
}

function BiaBo({ bo, chiSo, className, children }: { bo: BoAnhGiaDinh; chiSo: number; className?: string; children?: ReactNode }) {
  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: TONG_BIA[chiSo % TONG_BIA.length] }}
    >
      {bo.anhBiaId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/img/${bo.anhBiaId}?w=800`}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_30%_20%,rgba(255,255,255,.35),transparent_60%)]"
        />
      )}
      {children}
    </div>
  );
}

export function ChipTrangThai({ bo, trenBia = false, className }: { bo: BoAnhGiaDinh; trenBia?: boolean; className?: string }) {
  const loai = loaiChip(bo);
  return (
    <span
      data-testid="chip-trang-thai-bo"
      data-loai={loai}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium",
        loai === "can" && "bg-[rgba(232,165,152,.28)] text-[#2e2a27]",
        loai === "cho" && "bg-[#dfeae5] text-[#2f4a40]",
        loai === "xong" && "bg-[#f3ede6] text-[#6f665f]",
        trenBia && loai !== "cho" && "bg-[rgba(255,253,249,.92)]",
        className,
      )}
    >
      <i
        aria-hidden="true"
        className={cn("h-1.5 w-1.5 shrink-0 rounded-full", loai === "can" ? "bg-[#e8a598]" : "bg-current")}
      />
      <span className="truncate">{giuA(bo.trangThai.khach)}</span>
    </span>
  );
}

function ThanhTienDo({ bo }: { bo: BoAnhGiaDinh }) {
  const buoc = bo.trangThai.buocKhach;
  return (
    <div data-testid="tien-do-bo" data-buoc={buoc ?? ""}>
      <div className="mt-3 flex gap-1">
        {BUOC_KHACH.map((_, i) => (
          <i
            key={i}
            aria-hidden="true"
            className={cn("h-[3px] flex-1 rounded-sm", buoc !== null && i <= buoc ? "bg-[#2e2a27]" : "bg-[#e5dcd2]")}
          />
        ))}
      </div>
      <div className="mt-1.5 grid grid-cols-5 gap-1 text-[10.5px] leading-tight text-[#6f665f] sm:text-[11px]">
        {BUOC_KHACH.map((nhan, i) => (
          <span
            key={nhan}
            className={cn(
              "min-w-0 break-words",
              i === 0 ? "text-left" : i === BUOC_KHACH.length - 1 ? "text-right" : "text-center",
              buoc === i && "font-medium text-[#2e2a27]",
            )}
          >
            {nhan}
          </span>
        ))}
      </div>
    </div>
  );
}

function ViecTiepTheo({ bo }: { bo: BoAnhGiaDinh }) {
  const ma = bo.buocTiepTheo.ma;
  const loai = loaiChip(bo);
  const [BieuTuong, cau] =
    ma === "chon_anh"
      ? [Heart, G.viec.chon_anh]
      : ma === "duyet_anh"
        ? [Images, G.viec.duyet_anh]
        : ma === "nhan_bean"
          ? [Lock, G.viec.nhan_bean]
          : loai === "xong"
            ? [Printer, G.viec.da_xong]
            : [Clock, G.viec.dang_lam];
  return (
    <div
      data-testid="viec-tiep-theo"
      className="mt-3 flex items-start gap-2.5 rounded-xl bg-[#fbf7f2] p-3 text-[13.5px] leading-[1.45] text-[#2e2a27]"
    >
      <BieuTuong className="mt-px h-[18px] w-[18px] shrink-0" strokeWidth={1.5} aria-hidden="true" />
      <span>
        {canBaMeLam(bo) && <b className="font-medium">{G.buocTiepTheo} </b>}
        {giuA(cau)}
      </span>
    </div>
  );
}

function dongPhu(bo: BoAnhGiaDinh): string {
  const ngay = ngayChupHienThi(bo.ngayChup);
  const so = G.soAnh.replace("{so}", formatSo(bo.soAnh));
  return ngay ? `${G.chup.replace("{ngay}", ngay)} · ${so}` : so;
}

function nhanNut(bo: BoAnhGiaDinh): string {
  const ma = bo.buocTiepTheo.ma;
  return ma === "chon_anh" ? G.nut.chon_anh : ma === "duyet_anh" ? G.nut.duyet_anh : G.nut.xem_anh;
}

function TheLon({ bo, ma, chiSo, noiBat, className }: { bo: BoAnhGiaDinh; ma: string; chiSo: number; noiBat: boolean; className?: string }) {
  const href = duongDanBo(ma, bo.soThuTu);
  return (
    <article
      data-testid="the-bo-anh"
      data-so-thu-tu={bo.soThuTu}
      className={cn(
        "flex flex-col overflow-hidden rounded-[18px] border bg-white",
        noiBat
          ? "border-[#d9cdbf] lg:shadow-[0_1px_3px_rgb(46_42_39/8%),0_8px_24px_rgb(46_42_39/6%)]"
          : "border-[#e5dcd2]",
        className,
      )}
    >
      <Link href={href} tabIndex={-1} aria-hidden="true">
        <BiaBo bo={bo} chiSo={chiSo} className="h-[176px] lg:h-[220px]">
          <ChipTrangThai bo={bo} trenBia className="absolute left-3 top-3 z-[1] lg:left-3.5 lg:top-3.5" />
        </BiaBo>
      </Link>
      <div className="flex flex-1 flex-col px-4 pb-4 pt-3.5 lg:px-[18px] lg:pb-[18px]">
        <h2 className="font-display text-[20px] font-normal not-italic leading-[1.25] text-[#2e2a27]">
          {tenBoHienThi(bo)}
        </h2>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-[#6f665f]">{dongPhu(bo)}</p>
        <ThanhTienDo bo={bo} />
        <ViecTiepTheo bo={bo} />
        <Link
          href={href}
          data-testid="nut-mo-bo"
          className={cn(
            "mt-3 inline-flex h-11 w-full items-center justify-center rounded-full px-5 text-[14px] font-medium transition lg:mt-auto",
            noiBat
              ? "bg-[#2e2a27] text-[#fbf7f2] hover:bg-[#2e2a27]/90"
              : "border border-[#e5dcd2] bg-white text-[#2e2a27] hover:bg-[#f3ede6]",
          )}
        >
          {nhanNut(bo)}
        </Link>
      </div>
    </article>
  );
}

function DongGon({ bo, ma, chiSo }: { bo: BoAnhGiaDinh; ma: string; chiSo: number }) {
  return (
    <Link
      href={duongDanBo(ma, bo.soThuTu)}
      data-testid="dong-bo-anh"
      data-so-thu-tu={bo.soThuTu}
      className="flex items-center gap-3.5 border-b border-[#e5dcd2] py-3.5 last:border-b-0"
    >
      <BiaBo bo={bo} chiSo={chiSo} className="h-[72px] w-[72px] shrink-0 rounded-xl" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-[1.3] text-[#2e2a27]">{tenBoHienThi(bo)}</span>
        <span className="block text-[13px] leading-[1.45] text-[#6f665f]">{dongPhu(bo)}</span>
        <ChipTrangThai bo={bo} className="mt-1.5" />
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-[#6f665f]" strokeWidth={1.5} aria-hidden="true" />
    </Link>
  );
}

function Logo({ lon = false }: { lon?: boolean }) {
  return (
    <span data-testid="ten-thuong-hieu" className="inline-flex items-center gap-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/logo-hat-dau-64.png"
        alt=""
        aria-hidden="true"
        className={lon ? "h-[22px] w-[22px] shrink-0" : "h-[18px] w-[18px] shrink-0"}
      />
      <span
        className={cn(
          "font-display font-normal not-italic uppercase text-[#2e2a27]",
          lon ? "text-[17px] tracking-[0.12em]" : "text-[16px] tracking-[0.2em]",
        )}
      >
        Baby Bean
      </span>
    </span>
  );
}

function ManTrangThai({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 px-6 text-center text-[#2e2a27]">
      {children}
    </div>
  );
}

export function TrangGiaDinh({ ma, chatUrl = null }: { ma: string; chatUrl?: string | null }) {
  const { trangThai, taiLai } = useNhaGiaDinh(ma);
  const [moHuongDan, setMoHuongDan] = useState(false);
  const nha = trangThai.loai === "xong" ? trangThai.nha : null;

  const taiNgam = useCallback(() => void taiLai(true), [taiLai]);
  useCapNhatTucThi("khach", taiNgam, {
    bat: !!nha && nha.kenhTucThi.length > 0,
    tenKenh: nha?.kenhTucThi,
  });

  if (trangThai.loai === "dang_tai") {
    return (
      <ManTrangThai>
        <Spinner className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">{G.dangMo}</p>
      </ManTrangThai>
    );
  }
  if (trangThai.loai === "loi") {
    // BB-378 — cùng màn với `/g/`: hết hạn / không tìm thấy (gồm thu hồi) / lỗi mở, có "Nhắn Bean".
    return (
      <div data-testid="loi-trang-gia-dinh">
        <ManLoiLink loai={loaiLoiTuMa(trangThai.ma)} chatUrl={chatUrl} onThuLai={() => void taiLai()} />
      </div>
    );
  }

  return <NoiDungTrangGiaDinh ma={ma} nha={nha!} onXemCachLuu={() => setMoHuongDan(true)} moHuongDan={moHuongDan} onDongHuongDan={() => setMoHuongDan(false)} />;
}

function NoiDungTrangGiaDinh({
  ma,
  nha,
  onXemCachLuu,
  moHuongDan,
  onDongHuongDan,
}: {
  ma: string;
  nha: NhaGiaDinh;
  onXemCachLuu: () => void;
  moHuongDan: boolean;
  onDongHuongDan: () => void;
}) {
  const laNguoiXem = nha.vai === "viewer";
  const duocMoi = nha.vai === "owner" && nha.loaiLink === "gia_dinh";
  const be = tenBeTrongLoiChao(nha.tenNha);
  const chao = be ? G.chao.replace("{be}", be) : G.chaoChung;
  const { theLon, conLai } = xepBoTrenTrang(nha.boAnh);
  const thuTuMayTinh = theLon ? [theLon, ...conLai] : conLai;
  const chiSo = new Map(nha.boAnh.map((b, i) => [b.id, i]));

  return (
    <div data-testid="trang-gia-dinh" className="min-h-[100dvh] bg-[#fbf7f2] text-[#2e2a27]">
      {/* Đầu màn — điện thoại: logo + tên nhà căn giữa; máy tính: logo trái, Mời ông bà phải. */}
      <header className="sticky top-0 z-20 border-b border-[#e5dcd2] bg-[rgba(251,247,242,.94)] backdrop-blur-md">
        <div className="grid h-14 grid-cols-[44px_1fr_44px] items-center px-2 lg:hidden">
          <span />
          <div className="flex min-w-0 flex-col items-center">
            <Logo />
            <p data-testid="ten-nha" className="mt-0.5 max-w-full truncate text-[12px] leading-none text-[#6f665f]">
              {nha.tenNha}
            </p>
          </div>
          <span />
        </div>
        <div className="mx-auto hidden h-[72px] max-w-[1360px] items-center justify-between px-10 lg:flex">
          <Logo lon />
          <div className="flex items-center gap-3">{duocMoi && <MoiNguoiThan kieu="hang" />}</div>
        </div>
      </header>

      <main className="mx-auto max-w-[1120px] px-4 pb-16 pt-6 lg:px-0 lg:pt-16">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#6f665f]">{G.nhanTrang}</p>
        <h1
          data-testid="loi-chao-gia-dinh"
          className="mt-2 font-display text-[32px] font-normal not-italic leading-[1.15] lg:text-[40px]"
        >
          {chao}
        </h1>
        <p className="mt-1.5 text-[13px] leading-[1.45] text-[#6f665f] lg:mt-2 lg:text-[15px]">
          {giuA(G.moTa.replace("{so}", String(nha.boAnh.length)))}
        </p>

        <div className="mt-4 flex lg:hidden empty:hidden">
          <LoiGoiYLuuApp daChon={0} onXemCachLuu={onXemCachLuu} laNguoiXem={laNguoiXem} />
        </div>

        {nha.boAnh.length === 0 ? (
          <p data-testid="chua-co-buoi" className="mt-8 text-[15px] leading-relaxed text-[#6f665f]">
            {giuA(G.chuaCoBuoi)}
          </p>
        ) : (
          <>
            {/* Điện thoại (bản vẽ 01). */}
            <div className="lg:hidden">
              {theLon && (
                <TheLon bo={theLon} ma={ma} chiSo={chiSo.get(theLon.id) ?? 0} noiBat={canBaMeLam(theLon)} className="mt-5" />
              )}
              {conLai.length > 0 && (
                <>
                  {theLon && (
                    <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.12em] text-[#6f665f]">
                      {G.cacBuoiKhac}
                    </p>
                  )}
                  <div className={cn("border-t border-[#e5dcd2]", theLon ? "mt-2" : "mt-5")}>
                    {conLai.map((bo) => (
                      <DongGon key={bo.id} bo={bo} ma={ma} chiSo={chiSo.get(bo.id) ?? 0} />
                    ))}
                  </div>
                </>
              )}
              {duocMoi && (
                <div className="mt-6 border-b border-[#e5dcd2]">
                  <MoiNguoiThan kieu="hang" />
                </div>
              )}
            </div>

            {/* Máy tính (bản vẽ 02): lưới 3 cột, khe 24, xuống hàng khi > 3 bộ. */}
            <div className="mt-8 hidden grid-cols-3 gap-6 lg:grid">
              {thuTuMayTinh.map((bo) => (
                <TheLon
                  key={bo.id}
                  bo={bo}
                  ma={ma}
                  chiSo={chiSo.get(bo.id) ?? 0}
                  noiBat={bo === theLon && canBaMeLam(bo)}
                />
              ))}
            </div>
          </>
        )}
      </main>
      <HuongDanThemManHinh mo={moHuongDan} onDong={onDongHuongDan} laNguoiXem={laNguoiXem} />
    </div>
  );
}
