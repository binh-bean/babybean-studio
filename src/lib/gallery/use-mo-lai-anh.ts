"use client";

/**
 * BB-359 (2b) — phía màn khách của "mở lại bộ đã thu gọn".
 *
 * Khi `/api/g/gallery` báo `thuGon: true` (ba mẹ hoặc ông bà qua link mời — BB-360):
 *   · gửi POST /api/g/mo-lai-anh một lần (máy chủ tự chặn trùng, 10 phút/bộ);
 *   · hỏi GET /api/g/mo-lai-anh mỗi 4 giây (tối đa 5 phút) — lưới đỡ khi Realtime
 *     (BB-342, sự kiện `studio.mo_lai_anh`) không tới; máy chủ báo "đang bận" thì cứ
 *     mỗi phút gửi lại POST một lần;
 *   · thấy bộ hết thu gọn thì gọi `khiXong` (màn nạp lại danh sách ảnh) — không F5.
 * Bộ không thu gọn: hook không làm gì, không gọi mạng.
 */

import { useEffect, useRef } from "react";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";

export const CHU_KY_HOI_MO_LAI_MS = 4_000;
export const TRAN_CHO_MO_LAI_MS = 5 * 60_000;
const GUI_LAI_SAU_MS = 60_000;

export function useMoLaiAnhThuGon(p: { thuGon: boolean; coPhien: boolean; khiXong: () => void }): { dangMo: boolean } {
  const khiXongRef = useRef(p.khiXong);
  khiXongRef.current = p.khiXong;
  const bat = p.thuGon && p.coPhien;

  useEffect(() => {
    if (!bat) return;
    let huy = false;
    const batDau = Date.now();
    let lanGuiCuoi = 0;

    const gui = () => {
      lanGuiCuoi = Date.now();
      void goiApiKhach("/api/g/mo-lai-anh", { method: "POST" }).catch(() => {});
    };
    gui();

    const hen = window.setInterval(async () => {
      if (huy) return;
      if (Date.now() - batDau > TRAN_CHO_MO_LAI_MS) {
        window.clearInterval(hen);
        return;
      }
      try {
        const res = await goiApiKhach("/api/g/mo-lai-anh", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!huy && res.ok && json?.data?.thuGon === false) {
          window.clearInterval(hen);
          khiXongRef.current();
          return;
        }
      } catch {
        // mất mạng — lượt sau hỏi lại
      }
      if (Date.now() - lanGuiCuoi > GUI_LAI_SAU_MS) gui();
    }, CHU_KY_HOI_MO_LAI_MS);

    return () => {
      huy = true;
      window.clearInterval(hen);
    };
  }, [bat]);

  return { dangMo: bat };
}
