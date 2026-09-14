import { z } from "zod";

/**
 * Thân yêu cầu khi ba mẹ chọn một buổi chụp để xem.
 *
 * CHỈ nhận đúng một thứ: buổi chụp nào. KHÔNG nhận `customerId` — khách nào
 * là chuyện của cookie phiên đã ký, không phải chuyện trình duyệt khai báo.
 */
export const ChonBuoiChupSchema = z.object({
  buoiChupId: z.string().uuid("Thiếu buổi chụp cần mở"),
});

export type ChonBuoiChupInput = z.infer<typeof ChonBuoiChupSchema>;
