"use client";

/**
 * BB-232 — hàng chờ thả tim ngoại tuyến (E-6, docs/10-testing-qa.md §5).
 *
 * OWNER: DEV-FE. Tách khỏi gallery-app.tsx CÓ CHỦ ĐÍCH: tệp đó đang có người
 * khác sửa song song (phần nhãn trạng thái) — gộp thêm một khối state/effect
 * lớn vào giữa nó là tăng khả năng đụng độ merge cho một thứ không liên quan.
 * Toán gộp/chia lô THUẦN nằm ở `src/lib/selection/hang-cho.ts` (Vitest kiểm ở
 * đó); hook này chỉ là lớp NGOÀI chạm mạng, bộ đếm thời gian và localStorage.
 *
 * Vì sao mất mạng KHÔNG được hoàn tác tim (xem AGENTS.md §2.3, docs/10 E-6):
 * ba mẹ bấm tim giữa lúc wifi chập chờn, tim tắt lại ngay sau khi bấm, và họ
 * không biết tấm nào đã lưu, tấm nào chưa — kịch bản thật ở studio/nhà. Nên:
 * giữ optimistic update, xếp thao tác vào hàng, hiện "Chưa lưu", tự gửi lại
 * khi có mạng.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PhotoPublic } from "@/types/domain";
import {
  themVaoHangCho,
  boDaGui,
  layLoGui,
  type HangChoMuc,
  type HangChoOp,
  type LoGui,
} from "@/lib/selection/hang-cho";

/** Định kỳ thử gửi lại trong lúc còn hàng chờ (BB-232 việc 3). */
const KHOANG_GUI_LAI_MS = 15_000;

function khoaLuuTru(token: string): string {
  // Khoá gắn theo TOKEN của link — mỗi bộ ảnh một hàng chờ riêng, không lẫn
  // giữa hai tab mở hai link khác nhau trên cùng một máy.
  return `bb232.hangchotim.${token}`;
}

/**
 * Đọc hàng chờ đã lưu từ lần tải trước (còn mất mạng thì reload không mất
 * thao tác — BB-232 việc 4).
 *
 * Bọc try/catch: trình duyệt ẩn danh/riêng tư có thể chặn localStorage hoàn
 * toàn (kể cả `getItem` ném lỗi, không chỉ trả null). Đọc hỏng thì coi như
 * hàng chờ rỗng — KHÔNG được để app crash vì một tính năng phụ.
 */
function docHangChoLuu(token: string): HangChoMuc[] {
  try {
    const raw = window.localStorage.getItem(khoaLuuTru(token));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (m): m is HangChoMuc =>
        !!m &&
        typeof m === "object" &&
        typeof (m as HangChoMuc).photoId === "string" &&
        ((m as HangChoMuc).mark === "selected" || (m as HangChoMuc).mark === null),
    );
  } catch {
    return [];
  }
}

function ghiHangChoLuu(token: string, hangCho: HangChoMuc[]): void {
  try {
    if (hangCho.length === 0) {
      window.localStorage.removeItem(khoaLuuTru(token));
    } else {
      window.localStorage.setItem(khoaLuuTru(token), JSON.stringify(hangCho));
    }
  } catch {
    // Ẩn danh chặn ghi — hàng chờ vẫn sống trong bộ nhớ (state) tới hết phiên
    // này, chỉ mất khi reload. Chấp nhận được; không có gì để làm thêm.
  }
}

export interface UseHangChoTimResult {
  /** Số tấm đang chờ gửi — hiện lên dấu "Chưa lưu" ở ThanhChon. */
  soChuaGui: number;
  /**
   * Xếp một thao tác thả/bỏ tim vào hàng chờ (gọi khi `handleToggleHeart`
   * gặp lỗi MẠNG). `markTruoc` là `photo.mark` đọc lúc bấm, TRƯỚC optimistic
   * update — cần để hàng chờ biết lúc nào hai thao tác triệt tiêu nhau.
   */
  xepHangTim: (photoId: string, markMoi: "selected" | null, markTruoc: "selected" | null) => void;
  /**
   * Áp hàng chờ đang có lên một danh sách ảnh vừa tải — gọi ngay sau khi
   * nhận dữ liệu ảnh từ máy chủ, để reload lúc còn mất mạng không hiện lại
   * tim đã tắt (BB-232 việc 4).
   */
  apDungLenAnh: (photos: PhotoPublic[]) => PhotoPublic[];
  /**
   * Thử gửi hết hàng chờ ngay bây giờ, trả về `true` nếu hàng chờ RỖNG sau
   * khi thử (an toàn để chốt danh sách). Dùng trước khi cho phép "Chốt danh
   * sách" (BB-232 việc 5) — chốt thiếu tấm là lỗi nặng hơn chậm vài giây.
   */
  guiNgay: () => Promise<boolean>;
}

export function useHangChoTim(token: string): UseHangChoTimResult {
  const [soChuaGui, setSoChuaGui] = useState(0);

  // Nguồn thật của hàng chờ là REF, không phải state: vòng lặp gửi trong
  // guiHangCho() chạy xuyên nhiều `await`, và xepHangTim() có thể được gọi
  // giữa lúc đó (ba mẹ bấm tim tấm khác trong lúc lô cũ đang trên đường đi).
  // Cả hai đọc/ghi `hangChoRef.current` một cách ĐỒNG BỘ (không await giữa
  // đọc và ghi) nên không mất cập nhật của nhau — state chỉ để kích render.
  const hangChoRef = useRef<HangChoMuc[]>([]);
  const loDangGuiRef = useRef<LoGui | null>(null);
  const dangGuiRef = useRef(false);
  const daNapRef = useRef(false);

  // Nạp hàng chờ đã lưu đúng MỘT lần khi có token (đổi link giữa chừng thì
  // nạp lại theo token mới — hiếm nhưng an toàn hơn là dính hàng chờ của
  // link cũ).
  useEffect(() => {
    daNapRef.current = false;
    const daLuu = docHangChoLuu(token);
    hangChoRef.current = daLuu;
    daNapRef.current = true;
    setSoChuaGui(daLuu.length);
  }, [token]);

  const luuVaBaoRender = useCallback(
    (hangChoMoi: HangChoMuc[]) => {
      hangChoRef.current = hangChoMoi;
      if (daNapRef.current) ghiHangChoLuu(token, hangChoMoi);
      setSoChuaGui(hangChoMoi.length);
    },
    [token],
  );

  const xepHangTim = useCallback(
    (photoId: string, markMoi: "selected" | null, markTruoc: "selected" | null) => {
      luuVaBaoRender(themVaoHangCho(hangChoRef.current, { photoId, mark: markMoi }, markTruoc));
    },
    [luuVaBaoRender],
  );

  const apDungLenAnh = useCallback((photos: PhotoPublic[]): PhotoPublic[] => {
    if (hangChoRef.current.length === 0) return photos;
    const theoAnh = new Map(hangChoRef.current.map((m) => [m.photoId, m.mark]));
    return photos.map((p) => (theoAnh.has(p.id) ? { ...p, mark: theoAnh.get(p.id) as PhotoPublic["mark"] } : p));
  }, []);

  /**
   * Gửi hết những gì đang chờ, từng lô một (tối đa 50 op — giới hạn của
   * SelectionPatchSchema). Dừng ngay khi một lô lỗi MẠNG hoặc máy chủ: hàng
   * chờ giữ nguyên, `loDangGuiRef` giữ lô đó lại để lần gọi sau gửi lại ĐÚNG
   * `clientOpId` cũ (xem `layLoGui`).
   *
   * Lỗi MÁY CHỦ (4xx/5xx) cho một lô hàng chờ không có chỗ báo cho ba mẹ —
   * đây là gửi lại NGẦM, không phải một cú bấm vừa rồi. Im lặng thử lại ở
   * vòng kế là lựa chọn an toàn hơn hiện lỗi cho một thao tác họ không nhớ
   * đã làm từ bao giờ.
   */
  const guiHangCho = useCallback(async (): Promise<void> => {
    if (dangGuiRef.current) return;
    dangGuiRef.current = true;
    try {
      while (hangChoRef.current.length > 0) {
        const lo = layLoGui(hangChoRef.current, loDangGuiRef.current);
        if (!lo) break;
        loDangGuiRef.current = lo;

        let res: Response;
        try {
          res = await fetch("/api/g/selection", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ clientOpId: lo.clientOpId, ops: lo.ops }),
          });
        } catch {
          // Vẫn mất mạng — dừng, thử lại ở sự kiện 'online' hoặc vòng định kỳ.
          return;
        }

        if (!res.ok) {
          // Lỗi nghiệp vụ của MÁY CHỦ (không phải mất mạng) cho một lô ngầm.
          // Không rõ nguyên nhân cụ thể (GALLERY_LOCKED, QUOTA_EXCEEDED, ...)
          // có đáng thử lại hay không nếu không đọc thân lỗi — nhưng dừng vòng
          // lặp và thử lại sau vẫn an toàn hơn xoá khỏi hàng chờ một thao tác
          // chưa chắc đã được ghi nhận.
          return;
        }

        const ops: HangChoOp[] = lo.ops;
        luuVaBaoRender(boDaGui(hangChoRef.current, ops));
        loDangGuiRef.current = null;
      }
    } finally {
      dangGuiRef.current = false;
    }
  }, [luuVaBaoRender]);

  // Việc 3 — tự gửi lại khi có mạng và định kỳ khi còn hàng chờ.
  useEffect(() => {
    const khiOnline = () => void guiHangCho();
    window.addEventListener("online", khiOnline);
    const dinhKy = window.setInterval(() => {
      if (hangChoRef.current.length > 0) void guiHangCho();
    }, KHOANG_GUI_LAI_MS);
    return () => {
      window.removeEventListener("online", khiOnline);
      window.clearInterval(dinhKy);
    };
  }, [guiHangCho]);

  const guiNgay = useCallback(async (): Promise<boolean> => {
    await guiHangCho();
    return hangChoRef.current.length === 0;
  }, [guiHangCho]);

  // Đối tượng trả về PHẢI ổn định giữa các lần render khi soChuaGui không
  // đổi: gallery-app.tsx đưa `hangChoTim` thẳng vào mảng phụ thuộc của
  // `loadGallery` (useCallback) — một object literal mới mỗi render sẽ làm
  // `loadGallery` bị tạo lại mỗi render, kéo theo `useEffect(loadGallery)`
  // chạy lại vô tận (gọi API tải ảnh liên tục). useMemo chặn đúng ca này.
  return useMemo(
    () => ({ soChuaGui, xepHangTim, apDungLenAnh, guiNgay }),
    [soChuaGui, xepHangTim, apDungLenAnh, guiNgay],
  );
}
