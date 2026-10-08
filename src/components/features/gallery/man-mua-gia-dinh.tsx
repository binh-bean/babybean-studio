"use client";

/**
 * BB-400 vòng 2 — màn "Đặt in / mua thêm" của GIA ĐÌNH ĐƯỢC MỜI (link vai `viewer`).
 *
 * OWNER: DEV-FE. Thay cho lớp phủ + tấm chọn ảnh riêng của `MoiMuaLanHai` (ô ảnh nhỏ, dấu ✓)
 * — anh 08/10/2026: "các lượt chọn của gia đình cũng cần giống nhau". Màn này THAY cả trang
 * như màn "Chọn thêm ảnh · Đợt N" và dựng từ CÙNG các mảnh:
 *   - đầu màn `DauManLuotChon` (chip lọc, So sánh, nhóm ảnh, Nhắn Bean),
 *   - lưới `LuoiAnh` (tim = tim GIA ĐÌNH của chính link này, `/api/g/tim-gia-dinh`),
 *   - xem lớn `PhotoLightbox` với bảng "Tấm này dùng cho…" (`BangSanPhamCuaAnh`),
 *   - so sánh `SoSanhAnh`, cửa hàng `CuaHang`, thanh đáy `ThanhDayLuot`.
 *
 * Luồng tiền GIỮ NGUYÊN: không có giỏ của ba mẹ (`/api/g/addons` chặn viewer); bấm "Gửi yêu
 * cầu" là MỘT lượt `POST /api/g/mua-them` với tên + SĐT người gửi (route tự kiểm lại), CSKH
 * gọi báo giá. Giỏ chờ gửi do màn chính giữ (đóng màn rồi mở lại không mất).
 */

import React from "react";
import { Printer } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { formatKichThuoc, formatSo, tenSanPhamChoKhach } from "@/lib/utils/dinh-dang";
import { useBayFocusHopThoai } from "@/lib/utils/bay-focus-hop-thoai";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";
import {
  cachDatTuManTreo,
  chipLocLuotChon,
  congCuLuotChon,
  locAnhLuotChon,
  type LoaiLoc,
} from "@/lib/gallery/luot-chon";
import type { NhomSanPham } from "@/lib/products/nhom-san-pham";
import type { SanPhamCuaHang } from "@/lib/products/cau-hinh-cua-hang";
import type { PhotoPublic } from "@/types/domain";
import { vi } from "@/i18n";
import { LuoiAnh } from "./luoi-anh";
import { PhotoLightbox, type PhotoLightboxProps } from "./photo-lightbox";
import { CuaHang, type DongDaMua } from "./cua-hang";
import { SoSanhAnh } from "./so-sanh-anh";
import { BangSanPhamCuaAnh } from "./bang-san-pham-cua-anh";
import { ManTreoTuong } from "./man-treo-tuong";
import { cumTenBe } from "./dot-chon-khach";
import {
  DauManLuotChon,
  demAnhTheoNhom,
  propsCongCuXemLon,
  ThanhDayLuot,
  ThanhDaySoSanh,
  useSoSanhLuotChon,
} from "./cong-cu-luot-chon";

/** Một dòng chờ gửi — cùng hình dạng dòng của `/api/g/mua-them` (tối đa 20 mỗi dòng). */
export interface DongGioGiaDinh {
  productId: string;
  photoId: string | null;
  soLuong: number;
}

const SO_LUONG_TOI_DA = 20;
const SDT_VN = /^0[0-9]{9}$/;
const KHONG_DANG_GUI = new Set<string>();
const KHONG_SO_SP = new Map<string, number>();
const khongLamGi = () => {};
const khoa = (productId: string, photoId: string | null) => `${productId}::${photoId ?? ""}`;

/** Đặt số lượng một dòng (0 = bỏ dòng) — thuần, không đổi mảng cũ. */
export function datDongGioGiaDinh(
  gio: readonly DongGioGiaDinh[],
  productId: string,
  photoId: string | null,
  soLuong: number,
): DongGioGiaDinh[] {
  const con = gio.filter((d) => khoa(d.productId, d.photoId) !== khoa(productId, photoId));
  const n = Math.min(SO_LUONG_TOI_DA, Math.max(0, Math.floor(soLuong)));
  return n > 0 ? [...con, { productId, photoId, soLuong: n }] : con;
}

export function ManMuaGiaDinh({
  photos,
  subfolders,
  tenBe,
  danhMuc,
  gio,
  setGio,
  onToggleHeart,
  onDong,
  onDaGui,
  chatUrl = null,
  taiAnh = null,
  onBao,
  xemLonBanDau = null,
  datInTamBanDau = null,
}: {
  /** Ảnh của bộ, `mark` = tim GIA ĐÌNH của chính link này. */
  photos: PhotoPublic[];
  subfolders: string[];
  tenBe: string | null;
  danhMuc: SanPhamCuaHang[];
  gio: DongGioGiaDinh[];
  setGio: (sua: (cu: DongGioGiaDinh[]) => DongGioGiaDinh[]) => void;
  onToggleHeart: (photo: PhotoPublic) => void;
  onDong: () => void;
  /** Gửi xong: màn chính đóng màn này + làm mới thẻ "đã gửi yêu cầu". */
  onDaGui: () => void;
  chatUrl?: string | null;
  taiAnh?: Pick<PhotoLightboxProps, "onTaiAnh" | "menuTai"> | null;
  onBao?: (cau: string) => void;
  xemLonBanDau?: number | null;
  /** "Đặt in tấm này" từ màn xem lớn của trang chính: mở thẳng cửa hàng với tấm đó. */
  datInTamBanDau?: string | null;
}) {
  const [filter, setFilter] = React.useState<LoaiLoc>("all");
  const [nhom, setNhom] = React.useState("");
  const [xemLon, setXemLon] = React.useState<{ i: number; nguon: "loc" | "day" } | null>(
    xemLonBanDau === null ? null : { i: xemLonBanDau, nguon: "loc" },
  );
  const [cuaHang, setCuaHang] = React.useState<{ nhom: NhomSanPham | null; photoId: string | null } | null>(
    datInTamBanDau ? { nhom: "anh_in", photoId: datInTamBanDau } : null,
  );
  const [hoi, setHoi] = React.useState(false);
  /** BB-400 vòng 4 — đang ướm tấm nào trên tường / bàn nhà (null = đóng). */
  const [treoTuong, setTreoTuong] = React.useState<string | null>(null);
  const [ten, setTen] = React.useState("");
  const [sdt, setSdt] = React.useState("");
  const [dangGui, setDangGui] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);
  const hopRef = React.useRef<HTMLDivElement>(null);
  useBayFocusHopThoai(hoi, () => !dangGui && setHoi(false), hopRef);

  React.useEffect(() => {
    window.scrollTo({ top: 0 });
  }, []);

  const congCu = congCuLuotChon("giaDinh", { choPhepTai: taiAnh != null });
  const theoMa = React.useMemo(() => new Map(danhMuc.map((sp) => [sp.productId, sp])), [danhMuc]);
  const dsLoc = React.useMemo(() => locAnhLuotChon(photos, filter, nhom, new Set<string>()), [photos, filter, nhom]);
  const soThich = photos.filter((p) => p.mark === "selected").length;
  const demTheoNhom = React.useMemo(() => demAnhTheoNhom(photos), [photos]);
  const chips = chipLocLuotChon("giaDinh", { tong: photos.length, daChon: soThich, giaDinhThich: 0, khoa: false });
  const soSanh = useSoSanhLuotChon(photos, onBao ?? khongLamGi);

  const soMon = gio.reduce((n, d) => n + d.soLuong, 0);
  const tamTinh = gio.reduce((t, d) => t + (theoMa.get(d.productId)?.unitPrice ?? 0) * d.soLuong, 0);
  const datMon = (productId: string, photoId: string | null, soLuong: number) =>
    setGio((cu) => datDongGioGiaDinh(cu, productId, photoId, soLuong));
  const thieuNguoiGui = ten.trim().length === 0 || !SDT_VN.test(sdt.trim());
  // BB-400 vòng 4 — gia đình cũng XEM trên tường / bàn nhà; "Thêm vào giỏ" ở đó vào giỏ yêu cầu.
  const moTreo =
    congCu.xemTuong && danhMuc.some((sp) => sp.nhom === "anh_in")
      ? (anh: { id: string }) => setTreoTuong(anh.id)
      : null;
  const dsTreo = React.useMemo(() => {
    const thich = photos.filter((p) => p.mark === "selected");
    const tamDau = treoTuong ? photos.find((p) => p.id === treoTuong) : undefined;
    return tamDau && !thich.some((p) => p.id === tamDau.id) ? [tamDau, ...thich] : thich;
  }, [photos, treoTuong]);

  async function gui() {
    if (gio.length === 0) return;
    if (thieuNguoiGui) {
      setLoi(vi.gallery.loiBean.xinTenSdt);
      return;
    }
    setDangGui(true);
    setLoi(null);
    try {
      const res = await goiApiKhach("/api/g/mua-them", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: gio.map((d) => ({ productId: d.productId, photoId: d.photoId, soLuong: d.soLuong })),
          tenNguoiMua: ten.trim(),
          sdtNguoiMua: sdt.trim(),
        }),
      });
      const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setLoi(json?.error?.message ?? vi.gallery.loiBean.guiChuaDuoc);
        return;
      }
      setGio(() => []);
      setHoi(false);
      onDaGui();
    } catch {
      setLoi(vi.gallery.loiBean.khongKetNoi);
    } finally {
      setDangGui(false);
    }
  }

  const g = vi.gallery;
  return (
    <div data-testid="man-mua-gia-dinh" className="min-h-[100dvh] bg-background pb-44 text-foreground lg:pb-32">
      <DauManLuotChon
        testIdTieuDe="dong-dau-man-mua-gia-dinh"
        tieuDe={
          <>
            {g.muaGiaDinhTieuDe} <span className="font-display text-[16px] lg:text-[17px]">{cumTenBe(tenBe)}</span>
          </>
        }
        onDong={onDong}
        chips={chips}
        loc={filter}
        onLoc={setFilter}
        soSanh={soSanh}
        coSoSanh={congCu.soSanh}
        chatUrl={chatUrl}
        nhom={subfolders}
        nhomDangChon={nhom}
        onChonNhom={setNhom}
        demTheoNhom={demTheoNhom}
        tong={photos.length}
      />

      <section aria-label="Ảnh của buổi chụp" className="mx-auto max-w-[1600px] px-6 pt-4 lg:px-10 lg:pt-6">
        {dsLoc.length === 0 ? (
          <div className="mx-auto my-12 max-w-md rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">{g.emptyFilter}</p>
          </div>
        ) : (
          <LuoiAnh
            photos={dsLoc}
            mutatingIds={KHONG_DANG_GUI}
            khoa={false}
            soSanPhamTheoAnh={KHONG_SO_SP}
            soSanhBat={soSanh.soSanhBat}
            soSanhTheoAnh={soSanh.soSanhTheoAnh}
            onToggle={onToggleHeart}
            onOpen={(i) => setXemLon({ i, nguon: "loc" })}
            onToggleSoSanh={soSanh.onToggleSoSanh}
          />
        )}
      </section>

      {soSanh.soSanhBat ? (
        <ThanhDaySoSanh ds={soSanh.dsSoSanh} onXem={() => soSanh.setMoSoSanh(true)} onHuy={soSanh.huySoSanh} />
      ) : (
        <ThanhDayLuot
          testId="thanh-day-mua-gia-dinh"
          cau={
            gio.length === 0
              ? g.muaGiaDinhCauTrong
              : g.muaGiaDinhCau.replace("{n}", formatSo(soMon)).replace("{tien}", formatCurrencyVND(tamTinh))
          }
          nutPhu={
            <button
              type="button"
              onClick={() => setCuaHang({ nhom: null, photoId: null })}
              disabled={danhMuc.length === 0}
              className="inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-full border border-border bg-white px-2.5 text-[13px] font-medium transition hover:bg-surface-2 disabled:opacity-40 lg:px-4"
            >
              <Printer className="hidden h-4 w-4 shrink-0 lg:block" strokeWidth={1.5} aria-hidden="true" />
              <span className="truncate">{g.muaGiaDinhNutPhu}</span>
            </button>
          }
          nutChinh={
            <button
              type="button"
              data-testid="nut-gui-mua-gia-dinh"
              disabled={gio.length === 0}
              onClick={() => {
                setLoi(null);
                setHoi(true);
              }}
              className="h-10 shrink-0 whitespace-nowrap rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40 lg:px-5"
            >
              {g.muaGiaDinhNutGui}
            </button>
          }
        />
      )}

      <CuaHang
        mo={cuaHang !== null}
        onDong={() => setCuaHang(null)}
        khoa={false}
        dangLuu={false}
        phuDe={g.giaDinhDatInGiaiThich}
        presetNhom={cuaHang?.nhom ?? null}
        presetPhotoId={cuaHang?.photoId ?? null}
        danhMuc={danhMuc}
        daMua={gio.map<DongDaMua>((d) => ({
          id: khoa(d.productId, d.photoId),
          productId: d.productId,
          name: theoMa.get(d.productId)?.name ?? "",
          quantity: d.soLuong,
          totalPrice: (theoMa.get(d.productId)?.unitPrice ?? 0) * d.soLuong,
          photoId: d.photoId,
        }))}
        tongTien={tamTinh}
        anhDaChon={photos.filter((p) => p.mark === "selected").map((p) => ({ id: p.id, fileName: p.fileName }))}
        tatCaAnh={photos.map((p) => ({ id: p.id, fileName: p.fileName }))}
        onMua={(productId, soLuong, photoId) => datMon(productId, photoId, soLuong)}
        onMuaNhieu={(productId, soLuong, photoIds) =>
          setGio((cu) => photoIds.reduce((gg, id) => datDongGioGiaDinh(gg, productId, id, soLuong), cu))
        }
      />

      {xemLon !== null && (
        <PhotoLightbox
          photos={xemLon.nguon === "day" ? photos : dsLoc}
          initialIndex={xemLon.i}
          tenBe={tenBe}
          onClose={() => {
            const tuSoSanh = xemLon.nguon === "day";
            setXemLon(null);
            if (tuSoSanh && soSanh.soSanhBat && soSanh.dsSoSanh.length >= 2) soSanh.setMoSoSanh(true);
          }}
          onToggleHeart={onToggleHeart}
          mutatingIds={KHONG_DANG_GUI}
          isLocked={false}
          {...propsCongCuXemLon(congCu, {
            taiAnh,
            xemTuong: moTreo ?? undefined,
            // Trong màn mua, "Đặt in" là CÙNG bảng của ba mẹ — món vào giỏ chờ gửi của gia đình.
            bangSanPham: (anh, tong) => (
              <BangSanPhamCuaAnh
                tong={tong}
                anhDaChon={anh.mark === "selected"}
                khoa={false}
                dangLuu={false}
                suatTrongGoi={[]}
                albumTrongGoi={[]}
                albumDaMua={[]}
                donDaGui={false}
                monMuaThem={danhMuc
                  .filter((sp) => sp.canGanAnh)
                  .map((sp) => ({
                    ...sp,
                    soLuong: gio.find((d) => d.productId === sp.productId && d.photoId === anh.id)?.soLuong ?? 0,
                  }))}
                albumBanDuoc={danhMuc
                  .filter((sp) => sp.nhom === "album")
                  .map((sp) => ({
                    ...sp,
                    soLuong: gio.find((d) => d.productId === sp.productId && d.photoId === null)?.soLuong ?? 0,
                  }))}
                onDatVaoGoi={khongLamGi}
                onDatVaoAlbum={khongLamGi}
                onDatMuaThem={(productId, soLuong) => datMon(productId, anh.id, soLuong)}
                onXemBanAlbum={() => {
                  setXemLon(null);
                  setCuaHang({ nhom: "album", photoId: null });
                }}
                onXemTuong={moTreo ? () => moTreo(anh) : undefined}
                onDatInTamNay={(nhomSp) => {
                  setXemLon(null);
                  setCuaHang({ nhom: nhomSp, photoId: anh.id });
                }}
              />
            ),
          })}
          dungCho={(p) =>
            gio
              .filter((d) => d.photoId === p.id)
              .map((d) => {
                const t = formatKichThuoc(tenSanPhamChoKhach(theoMa.get(d.productId) ?? { name: "" }));
                return d.soLuong > 1 ? `${t} ×${d.soLuong}` : t;
              })
          }
        />
      )}

      {soSanh.moSoSanh && soSanh.anhDangSoSanh.length >= 2 && (
        <SoSanhAnh
          photos={soSanh.anhDangSoSanh}
          mutatingIds={KHONG_DANG_GUI}
          isLocked={false}
          onToggleHeart={onToggleHeart}
          onBoKhoi={soSanh.boKhoiManSoSanh}
          onDong={() => soSanh.setMoSoSanh(false)}
          onPhongTo={(p) => {
            const i = photos.findIndex((x) => x.id === p.id);
            if (i < 0) return;
            soSanh.setMoSoSanh(false);
            setXemLon({ i, nguon: "day" });
          }}
          anhDaThaTim={photos.filter((p) => p.mark === "selected")}
          tatCaAnh={photos}
        />
      )}

      {/* XEM TRÊN TƯỜNG / BÀN NHÀ — đúng màn BB-217; "Thêm vào giỏ" vào giỏ yêu cầu của gia đình. */}
      {treoTuong && (
        <ManTreoTuong
          mo
          onDong={() => setTreoTuong(null)}
          anh={dsTreo.map((p) => ({ id: p.id, fileName: p.fileName, width: p.width, height: p.height }))}
          chiSoBanDau={Math.max(0, dsTreo.findIndex((p) => p.id === treoTuong))}
          danhMuc={danhMuc
            .filter((sp) => sp.nhom === "anh_in" || sp.nhom === "khung")
            .map((sp) => ({
              productId: sp.productId,
              name: sp.name,
              material: sp.material,
              size: sp.size,
              unitPrice: sp.unitPrice,
              nhom: sp.nhom,
            }))}
          suatTrongGoi={[]}
          placements={[]}
          addonsDaDat={gio.map((d) => ({ productId: d.productId, photoId: d.photoId, quantity: d.soLuong }))}
          khoa={false}
          duocChon={cachDatTuManTreo({ nguCanh: "giaDinh", trongManGio: true, khoa: false, dotMoiMo: false, moChoGiaDinh: true }) === "gio"}
          dangLuu={false}
          onDatVaoGoi={khongLamGi}
          onDatMuaThem={(photoId, productId, soLuong) => datMon(productId, photoId, soLuong)}
        />
      )}

      {/* HỘP GỬI — tên + SĐT người gửi (route `/api/g/mua-them` đòi với viewer). */}
      {hoi && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#2a2420]/55 backdrop-blur-xs sm:items-center sm:p-4">
          <div
            ref={hopRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="tieu-de-hop-gui-gia-dinh"
            data-testid="hop-gui-mua-gia-dinh"
            className="flex max-h-[92svh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl sm:max-w-lg sm:rounded-3xl"
          >
            <div className="overflow-y-auto px-6 pb-6 pt-5 sm:p-7">
              <h3 id="tieu-de-hop-gui-gia-dinh" className="kh-h2 text-balance">
                {g.muaGiaDinhNutGui}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{g.giaDinhDatInGiaiThich}</p>
              <ul className="mt-4 space-y-1 rounded-2xl bg-surface-2 p-4 text-[13px]">
                {gio.map((d) => (
                  <li key={khoa(d.productId, d.photoId)} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {formatKichThuoc(theoMa.get(d.productId)?.name ?? "")} ×{d.soLuong}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {formatCurrencyVND((theoMa.get(d.productId)?.unitPrice ?? 0) * d.soLuong)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 grid gap-3">
                <input
                  name="tenNguoiMua"
                  value={ten}
                  onChange={(e) => setTen(e.target.value)}
                  maxLength={200}
                  placeholder="Tên người gửi"
                  aria-label="Tên người gửi"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[16px] focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
                <input
                  name="sdtNguoiMua"
                  value={sdt}
                  onChange={(e) => setSdt(e.target.value)}
                  inputMode="tel"
                  maxLength={10}
                  placeholder="Số điện thoại (10 số)"
                  aria-label="Số điện thoại"
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-[16px] focus:outline-hidden focus:ring-1 focus:ring-primary"
                />
              </div>
              {loi && (
                <p role="alert" className="mt-3 text-sm text-heart">
                  {loi}
                </p>
              )}
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setHoi(false)}
                  disabled={dangGui}
                  className="h-11 rounded-full border border-border px-5 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-50"
                >
                  Xem lại
                </button>
                <button
                  type="button"
                  data-testid="nut-xac-nhan-gui-gia-dinh"
                  onClick={() => void gui()}
                  disabled={dangGui || thieuNguoiGui}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                >
                  {dangGui && <Spinner className="h-4 w-4" />}
                  {g.muaGiaDinhNutGui}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
