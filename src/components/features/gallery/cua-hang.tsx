"use client";

/**
 * Cửa hàng — màn mua thêm sản phẩm, mở ra từ một nút riêng.
 *
 * OWNER: DEV-FE. Chủ studio 22/09/2026:
 *
 *     "Phần bán hàng cần có menu riêng, không đưa xuống dưới — như vậy sẽ
 *      không bán được hàng."
 *
 * ---------------------------------------------------------------------------
 * Vì sao một khối ở cuối trang thì không bán được
 * ---------------------------------------------------------------------------
 * Bộ ảnh thật có 460 tấm. Khối "mua thêm" nằm SAU lưới ảnh nghĩa là ba mẹ chỉ
 * gặp nó khi đã cuộn hết 460 tấm — mà lúc đó họ đang đi tìm nút Chốt, không
 * phải đi mua khung. Thứ bán được phải có cửa riêng, mở lúc nào cũng được.
 *
 * ---------------------------------------------------------------------------
 * Mua là phải BIẾT IN TẤM NÀO
 * ---------------------------------------------------------------------------
 * Ảnh in và khung gắn vào đúng một tấm (migration 0061), nên trong cửa hàng ba
 * mẹ chọn sản phẩm rồi chọn luôn tấm ảnh — không có đường "mua chung chung" để
 * CSKH phải gọi hỏi sau.
 *
 * Album thì khác: mua trước, ảnh đưa vào sau, từng tấm một (migration 0062).
 *
 * ---------------------------------------------------------------------------
 * BB-212 — đổi sang ngôn ngữ "cuốn album kỷ niệm"
 * ---------------------------------------------------------------------------
 * CHỈ đổi giao diện (tiêu đề Fraunces, thẻ sản phẩm thoáng, giá rõ, nút viên
 * tròn màu mực, tổng tiền dính đáy). HÀNH VI VÀ PROPS GIỮ NGUYÊN — khái niệm
 * album đúng nghĩa là việc riêng của người điều phối (BB-202), không đụng ở
 * đây.
 *
 * ---------------------------------------------------------------------------
 * BB-248 — tranh minh hoạ màu nước cạnh mỗi nhóm, cạnh thẻ sản phẩm canvas
 * ---------------------------------------------------------------------------
 * Chủ studio vừa vẽ 6 tranh cùng phong cách `public/hanh-trinh/`, đặt ở
 * `public/san-pham/`. `tranhCuaSanPham()` (`src/lib/products/tranh-san-pham.ts`)
 * chọn đúng tên tranh theo nhóm/chất liệu — không tự suy đoán ở đây. CHỈ thêm
 * hình, không đổi props/hành vi nào khác.
 */

import { cn } from "@/components/ui/utils";
import React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { THU_TU_NHOM, TEN_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";
import { tranhCuaSanPham } from "@/lib/products/tranh-san-pham";

export interface MonTrongCuaHang {
  productId: string;
  name: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
  nhom: NhomSanPham;
  canGanAnh: boolean;
}

export interface AnhChonDuoc {
  id: string;
  fileName: string;
}

export interface DongDaMua {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  totalPrice: number;
  photoId?: string | null;
}

export interface CuaHangProps {
  mo: boolean;
  onDong: () => void;
  danhMuc: MonTrongCuaHang[];
  daMua: DongDaMua[];
  tongTien: number;
  anhDaChon: AnhChonDuoc[];
  khoa: boolean;
  dangLuu: boolean;
  onMua: (productId: string, soLuong: number, photoId: string | null) => void;
}

export function CuaHang({
  mo,
  onDong,
  danhMuc,
  daMua,
  tongTien,
  anhDaChon,
  khoa,
  dangLuu,
  onMua,
}: CuaHangProps) {
  const [nhomDangXem, setNhomDangXem] = React.useState<NhomSanPham>("anh_in");
  const [monDangChon, setMonDangChon] = React.useState<MonTrongCuaHang | null>(null);

  if (!mo) return null;

  const theoNhom = danhMuc.filter((m) => m.nhom === nhomDangXem);

  /** Số lượng đã đặt của một sản phẩm (cộng mọi tấm ảnh). */
  const daDat = (productId: string) =>
    daMua.filter((d) => d.productId === productId).reduce((n, d) => n + d.quantity, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-8">
        <div>
          <h2 className="font-display text-2xl font-light leading-tight">Mua thêm sản phẩm</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            In ảnh, làm album hoặc đóng khung cho những tấm ba mẹ đã chọn.
          </p>
        </div>
        <button
          type="button"
          onClick={onDong}
          className="h-9 shrink-0 rounded-full border border-border px-4 text-xs font-medium transition hover:bg-surface-2"
        >
          Đóng
        </button>
      </header>

      {/* Ba nhóm, mỗi nhóm một thẻ — chủ studio gọi tên đúng ba nhóm này. */}
      <div className="px-5 sm:px-8 flex justify-center mb-6">
        <nav className="inline-flex w-full max-w-[400px] gap-1 rounded-full bg-[#E5DED6] p-1">
          {THU_TU_NHOM.map((nhom) => (
            <button
              key={nhom}
              type="button"
              onClick={() => {
                setNhomDangXem(nhom);
                setMonDangChon(null);
              }}
              className={[
                "flex-1 rounded-full py-2.5 text-[14px] font-medium transition-all",
                nhom === nhomDangXem
                  ? "bg-white text-[#2E2A27] shadow-sm"
                  : "text-[#2E2A27]/60 hover:text-[#2E2A27]",
              ].join(" ")}
            >
              {TEN_NHOM[nhom]}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-8">
        {/* Tranh minh hoạ của nhóm đang xem (BB-248) — cùng phong cách
            public/hanh-trinh/, cạnh tiêu đề nhóm. */}
        

        {theoNhom.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nhóm này chưa có sản phẩm nào đang bán. Ba mẹ nhắn CSKH giúp em nhé.
          </p>
        ) : (
          <ul className="grid sm:grid-cols-2 divide-y divide-[#E5DED6] sm:divide-y-0 sm:gap-4">
            {theoNhom.map((m) => {
              const so = daDat(m.productId);
              const tranhSanPham = tranhCuaSanPham(m.nhom, m.material, m.name);
                            return (
                <li key={m.productId} className="py-4 relative">
                  {/* Subtle divider except for the last item - wait, grid gap-3 might already handle spacing. We use border-b */}
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-2xl bg-[#E5DED6] flex items-center justify-center p-2">
                         <TranhNho ten={tranhSanPham} kichThuoc={64} />
                      </div>
                      <div className="min-w-0 flex-col justify-center">
                        <p className="font-display text-[18px] font-medium leading-tight text-[#2E2A27]">{m.name}</p>
                        <p className="mt-1 truncate text-[12px] text-[#2E2A27]/60">
                          {[m.size, m.material].filter(Boolean).join(" — ")}
                        </p>
                        <p className="mt-1 font-bold text-[#2E2A27]">{formatCurrencyVND(m.unitPrice)}</p>
                        {so > 0 && (
                          <p className="mt-0.5 text-[11px] font-medium text-[#C4645A]">Đang đặt {so}</p>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={khoa || dangLuu}
                      onClick={() =>
                        m.canGanAnh
                          ? setMonDangChon(monDangChon?.productId === m.productId ? null : m)
                          : onMua(m.productId, so + 1, null)
                      }
                      className={cn(
                        "flex h-9 shrink-0 items-center justify-center rounded-full px-4 text-[13px] font-medium transition-colors disabled:opacity-40",
                        so > 0
                          ? "bg-[#C4645A] text-white"
                          : "bg-[#E5DED6] text-[#2E2A27] hover:bg-[#E5DED6]/80"
                      )}
                    >
                      {m.canGanAnh ? "Chọn ảnh" : "Mua"}
                    </button>
                  </div>

                  {/*
                    Chọn tấm nào để in. Bày ảnh ĐÃ CHỌN, vì máy chủ chỉ nhận đặt
                    in cho ảnh nằm trong danh sách đã chọn — bày cả 460 tấm rồi
                    để ba mẹ nhận lỗi là cách chắc chắn làm họ bỏ cuộc.
                  */}
                  {monDangChon?.productId === m.productId && (
                    <div className="mt-3 border-t border-border pt-3">
                      {anhDaChon.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Ba mẹ thả tim chọn vài tấm trước, rồi mới đặt in được ạ.
                        </p>
                      ) : (
                        <>
                          <p className="mb-2 text-xs text-muted-foreground">
                            Chọn tấm cần in {m.name}:
                          </p>
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {anhDaChon.map((a) => {
                              const dangCo = daMua.find(
                                (d) => d.productId === m.productId && d.photoId === a.id,
                              );
                              return (
                                <button
                                  key={a.id}
                                  type="button"
                                  disabled={khoa || dangLuu}
                                  onClick={() =>
                                    onMua(m.productId, (dangCo?.quantity ?? 0) + 1, a.id)
                                  }
                                  className={[
                                    "relative overflow-hidden rounded-xl border-2 transition-colors",
                                    dangCo ? "border-moss" : "border-transparent",
                                  ].join(" ")}
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={`/api/img/${a.id}?w=200`}
                                    alt={a.fileName}
                                    className="aspect-square w-full object-cover"
                                  />
                                  {dangCo && (
                                    <span className="absolute right-1 top-1 rounded-full bg-moss px-1.5 text-[11px] font-bold text-white">
                                      {dangCo.quantity}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/*
        Tổng tiền luôn nhìn thấy. Ba mẹ đang tiêu tiền thật, và con số này là
        thứ họ cần để dừng đúng lúc — giấu nó đi là bán kiểu không đàng hoàng.
      */}
      <footer className="border-t border-border bg-surface px-5 py-4 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Tiền mua thêm tạm tính</p>
            <p className="font-display text-xl font-medium">{formatCurrencyVND(tongTien)}</p>
          </div>
          <button
            type="button"
            onClick={onDong}
            className="h-[56px] shrink-0 rounded-full bg-[#2E2A27] px-8 text-[15px] font-medium text-[#FBF7F2] transition hover:opacity-90"
          >
            Xong
          </button>
        </div>
        {daMua.length > 0 && (
          <ul className="mt-3 max-h-24 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
            {daMua.map((d) => (
              <li key={d.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {d.name} ×{d.quantity}
                </span>
                <span>{formatCurrencyVND(d.totalPrice)}</span>
              </li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}

/**
 * Tranh minh hoạ nhỏ (BB-248) — `srcSet` 320w/640w, không chiếm layout khi
 * chưa tải xong nhờ `width`/`height` cố định. `alt=""` vì tranh chỉ trang
 * trí, tên nhóm/sản phẩm đã có chữ cạnh bên.
 */
function TranhNho({ ten, kichThuoc }: { ten: string; kichThuoc: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/san-pham/${ten}-320.webp`}
      srcSet={`/san-pham/${ten}-320.webp 320w, /san-pham/${ten}-640.webp 640w`}
      sizes={`${kichThuoc}px`}
      alt=""
      loading="lazy"
      width={kichThuoc}
      height={kichThuoc}
      className="shrink-0 rounded-xl object-cover"
      style={{ width: kichThuoc, height: kichThuoc }}
    />
  );
}
