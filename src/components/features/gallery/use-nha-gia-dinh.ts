"use client";

/**
 * BB-334B — đọc `GET /api/k/<mã>` (docs/29 §2.1) cho trang gia đình và trang
 * bộ thứ n. Lượt gọi này cũng ĐẶT cookie phiên của đúng link (máy chủ chỉ đổi
 * mã khi cookie chưa thuộc link này — tải lại không đốt lượt giới hạn).
 *
 * OWNER: DEV-FE.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { NhaGiaDinh } from "@/lib/utils/trang-gia-dinh";

export type TrangThaiNha =
  | { loai: "dang_tai" }
  | { loai: "loi"; ma: string; message: string | null }
  | { loai: "xong"; nha: NhaGiaDinh };

export function useNhaGiaDinh(ma: string): { trangThai: TrangThaiNha; taiLai: (ngam?: boolean) => Promise<void> } {
  const [trangThai, setTrangThai] = useState<TrangThaiNha>({ loai: "dang_tai" });
  const conMo = useRef(true);

  const taiLai = useCallback(
    async (ngam = false) => {
      if (!ngam) setTrangThai({ loai: "dang_tai" });
      try {
        const res = await fetch(`/api/k/${encodeURIComponent(ma)}`, { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as
          | { data?: NhaGiaDinh; error?: { code?: string; message?: string } }
          | null;
        if (!conMo.current) return;
        if (!res.ok || !json?.data) {
          // Tải ngầm (tức thì) mà hỏng thì giữ màn đang có, không xoá trắng.
          if (ngam) return;
          setTrangThai({ loai: "loi", ma: json?.error?.code ?? "INTERNAL", message: json?.error?.message ?? null });
          return;
        }
        setTrangThai({ loai: "xong", nha: json.data });
      } catch {
        if (conMo.current && !ngam) setTrangThai({ loai: "loi", ma: "NETWORK_ERROR", message: null });
      }
    },
    [ma],
  );

  useEffect(() => {
    conMo.current = true;
    void taiLai();
    return () => {
      conMo.current = false;
    };
  }, [taiLai]);

  return { trangThai, taiLai };
}
