/**
 * BB-252 — cập nhật trạng thái hậu kỳ NGAY khi Lark đẩy một bản ghi sang
 * (/api/lark/hook), và báo ba mẹ nếu bộ ảnh vừa sang "Hình đã về".
 *
 * Trước đây trạng thái Lark chỉ được đọc lúc 08:00 (cron hậu kỳ), nên nhân viên
 * đổi "Hình đã về" lúc 9h sáng thì sáng HÔM SAU ba mẹ mới nhận tin. Cron vẫn giữ
 * làm lưới đỡ khi Lark đẩy hụt: hook đã ghi mã mới rồi thì sáng hôm sau cron
 * thấy 9 → 9, không báo lần hai (vuaSangHinhDaVe).
 *
 * Hàm nhận cách đọc Lark và cách báo từ ngoài vào để phép thử chạy trên bộ
 * Fixture mà không gọi Lark hay máy chủ push thật.
 */
import type pg from "pg";
import { ghiTrangThaiVaoGalleries, type TrangThaiDoc } from "@/lib/lark/doc-trang-thai-lark";

export async function capNhatTrangThaiTuHook(opts: {
  client: pg.Client | pg.PoolClient;
  recordIds: string[];
  docMotBanGhi: (recordId: string) => Promise<TrangThaiDoc | null>;
  bao: (galleryId: string) => Promise<void>;
}): Promise<{ doc: number; doi: number; baoHinhDaVe: number }> {
  const doc = new Map<string, TrangThaiDoc>();
  for (const id of opts.recordIds) {
    try {
      const tt = await opts.docMotBanGhi(id);
      if (tt) doc.set(id, tt);
    } catch (err) {
      // Một bản ghi đọc hỏng không được chặn các bản ghi còn lại trong hàng đợi.
      console.error(`[Lark Hook] Không đọc được trạng thái bản ghi ${id}:`, err);
    }
  }
  if (doc.size === 0) return { doc: 0, doi: 0, baoHinhDaVe: 0 };
  const { sangHinhDaVe, ...ghi } = await ghiTrangThaiVaoGalleries(opts.client, doc);
  for (const galleryId of sangHinhDaVe) await opts.bao(galleryId);
  return { ...ghi, baoHinhDaVe: sangHinhDaVe.length };
}
