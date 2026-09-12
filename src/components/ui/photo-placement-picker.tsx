/**
 * Khách đặt ảnh đã chọn vào sản phẩm in: ảnh phóng, ảnh để bàn, bìa album.
 *
 * OWNER: DEV-UI. Task BB-118.
 * Spec: docs/16 mục 3.3
 *
 * Component thuần trình bày — nhận dữ liệu qua props, báo thao tác ra ngoài
 * bằng callback, KHÔNG tự gọi API.
 *
 * ---------------------------------------------------------------------------
 * Ba điều dễ làm sai
 * ---------------------------------------------------------------------------
 * 1. CHỈ hiện sản phẩm hợp đồng THẬT SỰ có. Hợp đồng không mua album thì không
 *    được hiện chỗ chọn bìa album. Danh sách sản phẩm đi vào qua props, lọc từ
 *    gallery_items — component không tự bịa thêm dòng nào.
 *
 * 2. Một ảnh đặt được vào NHIỀU sản phẩm: vừa vào album vừa phóng to. Vì thế
 *    đây KHÔNG phải bộ chọn loại trừ. 0015 dùng bảng nối cũng vì lý do này.
 *
 * 3. Đặt ảnh vào sản phẩm in KHÔNG tiêu hạn mức. Hạn mức đếm ảnh được CHỈNH;
 *    ảnh in lấy từ tập đã chỉnh đó. Component này không được hiện con số hạn
 *    mức giảm đi khi khách gán ảnh — sai, và làm khách sợ không dám gán.
 *
 * ---------------------------------------------------------------------------
 * Vì sao bấm hai bước chứ không kéo thả
 * ---------------------------------------------------------------------------
 * Khách hầu hết dùng điện thoại. Kéo thả bằng ngón tay trên lưới ảnh nhỏ là
 * thao tác hay trượt, và trượt ở đây nghĩa là ảnh vào nhầm sản phẩm mà khách
 * không nhận ra. Bấm chọn sản phẩm rồi bấm ảnh thì mỗi bước đều thấy rõ.
 */

"use client";

import React from "react";
import { cn } from "./utils";

export interface PlacementProduct {
  /** id của dòng hàng trong gallery_items, không phải id sản phẩm. */
  galleryItemId: string;
  name: string;
  /** Số lượng hợp đồng đã mua, ví dụ 2 tấm ảnh phóng. */
  quantity: number;
}

export interface PlacementPhoto {
  id: string;
  thumbnailUrl: string;
}

interface PhotoPlacementPickerProps {
  /** Sản phẩm in của hợp đồng. Rỗng thì component KHÔNG hiện gì. */
  products: PlacementProduct[];
  /** Ảnh khách ĐÃ CHỌN. Chỉ ảnh đã chọn mới đặt được vào sản phẩm in. */
  selectedPhotos: PlacementPhoto[];
  /** Cặp (ảnh, dòng hàng) đang có. Một ảnh xuất hiện nhiều lần là hợp lệ. */
  placements: { photoId: string; galleryItemId: string }[];
  onPlace: (photoId: string, galleryItemId: string) => void;
  onRemove: (photoId: string, galleryItemId: string) => void;
  /** Đang gửi lên máy chủ — khoá nút để khách không bấm hai lần. */
  busy?: boolean;
  className?: string;
}

export function PhotoPlacementPicker({
  products,
  selectedPhotos,
  placements,
  onPlace,
  onRemove,
  busy = false,
  className,
}: PhotoPlacementPickerProps) {
  const [activeItemId, setActiveItemId] = React.useState<string | null>(null);

  // Hợp đồng không có sản phẩm in thì không hiện gì cả. Đây là luật 1.
  if (products.length === 0) return null;

  const placedIn = (itemId: string) =>
    placements.filter((p) => p.galleryItemId === itemId);

  const isPlaced = (photoId: string, itemId: string) =>
    placements.some((p) => p.photoId === photoId && p.galleryItemId === itemId);

  const active = products.find((p) => p.galleryItemId === activeItemId) ?? null;

  return (
    <section className={cn("rounded-lg border border-[var(--bb-border)] p-4", className)}>
      <h3 className="text-base font-medium">Chọn ảnh cho sản phẩm in</h3>
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
        Chọn sản phẩm trước, rồi bấm vào ảnh muốn in. Một ảnh dùng được cho nhiều
        sản phẩm.
      </p>

      {/* Bước 1: chọn sản phẩm */}
      <ul className="mt-3 flex flex-col gap-2">
        {products.map((product) => {
          const placed = placedIn(product.galleryItemId).length;
          const enough = placed >= product.quantity;
          const isActive = product.galleryItemId === activeItemId;

          return (
            <li key={product.galleryItemId}>
              <button
                type="button"
                onClick={() =>
                  setActiveItemId(isActive ? null : product.galleryItemId)
                }
                aria-pressed={isActive}
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left",
                  "min-h-12",
                  isActive
                    ? "border-[var(--bb-accent)] bg-[var(--bb-accent-soft)]"
                    : "border-[var(--bb-border)]",
                )}
              >
                <span className="text-sm font-medium">{product.name}</span>
                <span
                  className={cn(
                    "shrink-0 text-xs",
                    enough ? "text-[var(--bb-fg-muted)]" : "text-[var(--bb-warning)]",
                  )}
                >
                  {placed}/{product.quantity} ảnh
                  {!enough && " · còn thiếu"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Bước 2: bấm ảnh để gán vào sản phẩm đang chọn */}
      {active && (
        <div className="mt-4">
          <p className="text-sm">
            Đang chọn ảnh cho <strong>{active.name}</strong>. Bấm lại vào ảnh để bỏ ra.
          </p>

          {selectedPhotos.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">
              Ba mẹ hãy chọn ảnh trước, rồi quay lại đây để xếp ảnh vào sản phẩm.
            </p>
          ) : (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {selectedPhotos.map((photo) => {
                const on = isPlaced(photo.id, active.galleryItemId);
                return (
                  <li key={photo.id}>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={on}
                      onClick={() =>
                        on
                          ? onRemove(photo.id, active.galleryItemId)
                          : onPlace(photo.id, active.galleryItemId)
                      }
                      className={cn(
                        "relative block w-full overflow-hidden rounded-md border-2",
                        on ? "border-[var(--bb-accent)]" : "border-transparent",
                        busy && "opacity-60",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={photo.thumbnailUrl}
                        alt=""
                        loading="lazy"
                        className="aspect-square w-full object-cover"
                      />
                      {on && (
                        <span className="absolute right-1 top-1 rounded-full bg-[var(--bb-accent)] px-1.5 text-xs text-white">
                          ✓
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
