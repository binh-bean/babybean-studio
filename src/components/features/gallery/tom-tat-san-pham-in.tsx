"use client";

/**
 * "Trong gói ba mẹ đã mua gì, và tấm nào làm cái đó" — bảng tóm tắt, CHỈ ĐỌC.
 *
 * OWNER: DEV-FE. Chủ studio 22/09/2026:
 *
 *     "Tư duy lại các luồng của việc bán hàng đi. Album không phải là một ảnh,
 *      và ảnh ở trong gói đã mua rồi — đâu, khách chọn thế nào?"
 *
 * ---------------------------------------------------------------------------
 * Vì sao chỗ này KHÔNG cho gán ảnh nữa
 * ---------------------------------------------------------------------------
 * Bản cũ (`PhotoPlacementPicker`) là chỗ thứ hai để gán ảnh vào sản phẩm in:
 * chọn sản phẩm ở giữa trang, rồi bấm vào một lưới ảnh vuông nhỏ xíu. Nó đứng
 * cách ảnh đang xem cả màn hình, nên ba mẹ phải nhớ "tấm số 12 là tấm nào".
 *
 * Nơi trả lời được câu "in tấm NÀY hả?" là lúc đang nhìn tấm đó thật lớn — tức
 * bảng bên phải màn xem ảnh (`BangSanPhamCuaAnh`). Hai chỗ gán cùng một thứ thì
 * chắc chắn có ngày lệch nhau, nên chỗ này rút về đúng một việc: **nói cho ba
 * mẹ biết đang thiếu gì**, rồi đưa họ tới đúng tấm ảnh để sửa.
 *
 * ---------------------------------------------------------------------------
 * Album đếm khác ảnh in
 * ---------------------------------------------------------------------------
 * "Gỗ 40x60 ×2" là HAI SUẤT, mỗi suất một tấm — đủ hai tấm là xong.
 * "Album (Ultra HD) ×1" là MỘT CUỐN, nhận bao nhiêu tấm tuỳ ba mẹ — nên ở đây
 * chỉ nói cuốn đó đang có mấy tấm, không có chữ "còn thiếu" nào sau tấm đầu.
 */

import React from "react";
import { cn } from "@/components/ui/utils";
import { conThieuAnh, type HangInTrongGoi } from "@/lib/products/hang-in-trong-goi";

export interface DongSanPhamIn extends HangInTrongGoi {
  /** Ảnh đã xếp vào dòng hàng này. */
  anh: { id: string; fileName: string }[];
}

export interface TomTatSanPhamInProps {
  dong: DongSanPhamIn[];
  /** Mở tấm ảnh ra màn xem lớn, nơi ba mẹ đổi được sản phẩm cho tấm đó. */
  onMoAnh: (photoId: string) => void;
  className?: string;
}

/**
 * Câu trạng thái của một dòng — album nói khác ảnh in.
 *
 * Cái "thiếu hay không" hỏi `conThieuAnh`, dùng chung với lời nhắc trước lúc
 * chốt. Hai chỗ tự tính riêng thì có ngày bảng này nói "đủ" còn lời nhắc nói
 * "còn thiếu", và ba mẹ không biết tin bên nào.
 */
function loiTrangThai(dong: DongSanPhamIn): { chu: string; thieu: boolean } {
  const daCo = dong.anh.length;
  const thieu = conThieuAnh(dong, daCo);

  if (dong.nhom === "album") {
    return {
      chu: thieu ? "Chưa có tấm nào trong cuốn này" : `Đang có ${daCo} tấm trong cuốn`,
      thieu,
    };
  }

  return {
    chu: thieu
      ? `Còn ${dong.quantity - daCo}/${dong.quantity} suất chưa chọn ảnh`
      : `Đủ ${dong.quantity} tấm`,
    thieu,
  };
}

export function TomTatSanPhamIn({ dong, onMoAnh, className }: TomTatSanPhamInProps) {
  // Hợp đồng không có hàng in thì không hiện gì. Đây là luật cũ của docs/16
  // mục 3.3 và nó vẫn đúng: không bịa ra ô chọn cho thứ khách chưa mua.
  if (dong.length === 0) return null;

  return (
    <section className={cn("rounded-xl border bg-surface p-4", className)}>
      <h3 className="text-base font-semibold">Sản phẩm in trong gói</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Những thứ này ba mẹ đã trả tiền trong hợp đồng rồi. Bấm vào một tấm ảnh để
        xem lớn, rồi chọn ở bảng bên phải là tấm đó in ra sản phẩm nào.
      </p>

      <ul className="mt-3 space-y-2">
        {dong.map((d) => {
          const tt = loiTrangThai(d);
          return (
            <li key={d.galleryItemId} className="rounded-lg border p-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">
                  {d.name}
                  {d.quantity > 1 && (
                    <span className="ml-1.5 text-xs text-muted-foreground">×{d.quantity}</span>
                  )}
                </p>
                <p
                  className={cn(
                    "shrink-0 text-xs",
                    tt.thieu ? "font-medium text-amber-600" : "text-muted-foreground",
                  )}
                >
                  {tt.chu}
                </p>
              </div>

              {d.anh.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {d.anh.map((a) => (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onMoAnh(a.id)}
                        title={a.fileName}
                        className="block h-14 w-14 overflow-hidden rounded-md border-2 border-emerald-500 transition-opacity hover:opacity-80"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/img/${a.id}?w=200`}
                          alt={a.fileName}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
