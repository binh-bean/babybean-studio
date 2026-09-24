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
 */

import React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { THU_TU_NHOM, TEN_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";

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
      <nav className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3 sm:px-8">
        {THU_TU_NHOM.map((nhom) => (
          <button
            key={nhom}
            type="button"
            onClick={() => {
              setNhomDangXem(nhom);
              setMonDangChon(null);
            }}
            className={[
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
              nhom === nhomDangXem
                ? "bg-primary text-primary-foreground"
                : "border border-border text-muted-foreground hover:bg-surface-2",
            ].join(" ")}
          >
            {TEN_NHOM[nhom]}
          </button>
        ))}
      </nav>

      <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-8">
        {theoNhom.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nhóm này chưa có sản phẩm nào đang bán. Ba mẹ nhắn CSKH giúp em nhé.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {theoNhom.map((m) => {
              const so = daDat(m.productId);
              return (
                <li key={m.productId} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{m.name}</p>
                      <p className="mt-1 text-sm font-semibold">{formatCurrencyVND(m.unitPrice)}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {[m.size, m.material].filter(Boolean).join(" · ")}
                      </p>
                      {so > 0 && (
                        <p className="mt-1.5 text-xs font-medium text-moss">Đang đặt {so}</p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={khoa || dangLuu}
                      onClick={() =>
                        m.canGanAnh
                          ? setMonDangChon(monDangChon?.productId === m.productId ? null : m)
                          : // Album: mua luôn, ảnh đưa vào sau ở màn xem ảnh lớn.
                            onMua(m.productId, so + 1, null)
                      }
                      className="h-9 shrink-0 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
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
            className="h-11 shrink-0 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90"
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
