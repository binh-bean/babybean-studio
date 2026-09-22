"use client";

/**
 * "Tấm này in ra cái gì" — bảng bên cạnh ảnh đang xem lớn.
 *
 * OWNER: DEV-FE. Chủ studio 22/09/2026, chỉ thẳng vào ảnh chụp màn hình:
 *
 *     "Phần đánh dấu màu xanh là phần chọn ảnh làm ảnh gì. Ví dụ ảnh phóng
 *      trong gói là 40x60 gỗ thì ở đó hiển thị 'trong gói có 01 ảnh 40x60
 *      gỗ…', hoặc mua thêm chọn…"
 *
 * ---------------------------------------------------------------------------
 * Vì sao đặt ở màn xem lớn chứ không ở lưới ảnh
 * ---------------------------------------------------------------------------
 * Câu hỏi "tấm này in cỡ nào, chất liệu gì" chỉ trả lời được khi đang nhìn KỸ
 * một tấm. Ở lưới 460 ảnh thì ba mẹ đang so sánh, chưa quyết. Cùng lý do với ô
 * ghi chú cho thợ chỉnh ảnh (BB-180) đã đặt ở đây từ trước.
 *
 * Màn xem lớn cũng đang bỏ trống hai bên ảnh trên máy tính — chỗ ấy vốn chỉ để
 * bấm-ra-ngoài-thì-đóng.
 *
 * ---------------------------------------------------------------------------
 * Hai phần, theo đúng thứ tự ba mẹ nghĩ
 * ---------------------------------------------------------------------------
 *  1. **Trong gói** — những suất đã trả tiền rồi, còn trống mấy suất. Đây là
 *     thứ phải hiện TRƯỚC: dùng hết suất trong gói rồi mới nên bán thêm.
 *  2. **Mua thêm** — bày theo ba nhóm chủ studio gọi tên (ảnh in/ảnh phóng,
 *     album, khung), trong nhóm phân theo chất liệu và kích thước.
 *
 * Cả hai đều gắn vào ĐÚNG tấm đang xem. Không có chỗ nào chọn "sản phẩm chung
 * chung" nữa — thợ in phải biết in tấm nào.
 */

import React from "react";
import { THU_TU_NHOM, TEN_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";

export interface SuatTrongGoi {
  galleryItemId: string;
  name: string;
  /** Tổng số suất của dòng hàng này trong hợp đồng. */
  quantity: number;
  /** Đã đặt ảnh vào bao nhiêu suất (của MỌI tấm, không riêng tấm đang xem). */
  daDat: number;
  /** Tấm đang xem có nằm trong dòng hàng này không. */
  coAnhNay: boolean;
}

export interface MonMuaThem {
  productId: string;
  name: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
  nhom: NhomSanPham;
  canGanAnh: boolean;
  /** Số lượng đang đặt CHO TẤM ĐANG XEM. */
  soLuong: number;
}

export interface BangSanPhamCuaAnhProps {
  suatTrongGoi: SuatTrongGoi[];
  monMuaThem: MonMuaThem[];
  /** Tấm đang xem đã được ba mẹ chọn chưa — chưa chọn thì chưa đặt in được. */
  anhDaChon: boolean;
  khoa: boolean;
  dangLuu: boolean;
  onDatVaoGoi: (galleryItemId: string, dat: boolean) => void;
  onDatMuaThem: (productId: string, soLuong: number) => void;
}

export function BangSanPhamCuaAnh({
  suatTrongGoi,
  monMuaThem,
  anhDaChon,
  khoa,
  dangLuu,
  onDatVaoGoi,
  onDatMuaThem,
}: BangSanPhamCuaAnhProps) {
  const [nhomDangMo, setNhomDangMo] = React.useState<NhomSanPham | null>(null);

  if (!anhDaChon) {
    return (
      <p className="text-xs leading-relaxed text-white/60">
        Ba mẹ thả tim chọn tấm này trước, rồi mới đặt in được.
      </p>
    );
  }

  const theoNhom = (nhom: NhomSanPham) => monMuaThem.filter((m) => m.nhom === nhom);
  const daDatTrongNhom = (nhom: NhomSanPham) =>
    theoNhom(nhom).reduce((n, m) => n + m.soLuong, 0);

  return (
    <div className="space-y-4 text-white">
      {/* ---------- 1. TRONG GÓI ---------- */}
      {suatTrongGoi.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
            Trong gói
          </h3>
          <ul className="space-y-1.5">
            {suatTrongGoi.map((sp) => {
              const conTrong = sp.quantity - sp.daDat;
              return (
                <li key={sp.galleryItemId}>
                  <button
                    type="button"
                    disabled={khoa || dangLuu || (!sp.coAnhNay && conTrong <= 0)}
                    onClick={() => onDatVaoGoi(sp.galleryItemId, !sp.coAnhNay)}
                    className={[
                      "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-xs transition-colors",
                      sp.coAnhNay
                        ? "bg-emerald-500/20 ring-1 ring-emerald-300/50"
                        : "bg-white/10 hover:bg-white/15",
                      khoa || dangLuu ? "opacity-60" : "",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block font-medium">{sp.name}</span>
                      {/*
                        Nói bằng SỐ SUẤT còn trống, không nói "đã dùng x/y".
                        Ba mẹ đang hỏi "tôi còn được in mấy tấm nữa", chứ không
                        hỏi một tỉ lệ.
                      */}
                      <span className="block text-white/55">
                        {sp.coAnhNay
                          ? "Đang chọn tấm này"
                          : conTrong > 0
                            ? `Còn ${conTrong} suất`
                            : "Đã dùng hết suất"}
                      </span>
                    </span>
                    <span className="shrink-0 text-base leading-none">
                      {sp.coAnhNay ? "✓" : conTrong > 0 ? "+" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ---------- 2. MUA THÊM ---------- */}
      <section>
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/50">
          Mua thêm cho tấm này
        </h3>
        <div className="space-y-1.5">
          {THU_TU_NHOM.map((nhom) => {
            const ds = theoNhom(nhom);
            if (ds.length === 0) return null;
            const dangMo = nhomDangMo === nhom;
            const daDat = daDatTrongNhom(nhom);

            return (
              <div key={nhom} className="rounded-xl bg-white/10">
                <button
                  type="button"
                  onClick={() => setNhomDangMo(dangMo ? null : nhom)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium"
                >
                  <span>{TEN_NHOM[nhom]}</span>
                  <span className="flex items-center gap-2 text-white/55">
                    {daDat > 0 && (
                      <span className="rounded-full bg-emerald-500/25 px-2 py-0.5 text-[11px] text-emerald-200">
                        {daDat}
                      </span>
                    )}
                    <span>{dangMo ? "−" : "+"}</span>
                  </span>
                </button>

                {dangMo && (
                  <ul className="space-y-1 px-2 pb-2">
                    {ds.map((m) => (
                      <li
                        key={m.productId}
                        className="flex items-center justify-between gap-2 rounded-lg bg-black/25 px-2.5 py-1.5"
                      >
                        <span className="min-w-0">
                          {/*
                            Chất liệu và kích thước là hai thứ ba mẹ so sánh.
                            Tên sản phẩm bên Lark đã gộp sẵn cả hai ("Gỗ 40x60"),
                            nên hiện tên là đủ; dòng dưới nhắc lại kích thước
                            cho dễ dò khi danh sách dài.
                          */}
                          <span className="block truncate text-xs">{m.name}</span>
                          <span className="block text-[11px] text-white/55">
                            {formatCurrencyVND(m.unitPrice)}
                            {m.size ? ` · ${m.size}` : ""}
                          </span>
                        </span>

                        <span className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Bớt ${m.name}`}
                            disabled={khoa || dangLuu || m.soLuong === 0}
                            onClick={() => onDatMuaThem(m.productId, Math.max(0, m.soLuong - 1))}
                            className="h-7 w-7 rounded-full bg-white/10 text-sm disabled:opacity-30"
                          >
                            −
                          </button>
                          <span className="w-5 text-center text-xs tabular-nums">{m.soLuong}</span>
                          <button
                            type="button"
                            aria-label={`Thêm ${m.name}`}
                            disabled={khoa || dangLuu}
                            onClick={() => onDatMuaThem(m.productId, m.soLuong + 1)}
                            className="h-7 w-7 rounded-full bg-white/10 text-sm disabled:opacity-30"
                          >
                            +
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
