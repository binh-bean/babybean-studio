"use client";

/**
 * BB-345 — hook "tim gia đình" cho màn khách. Tách khỏi `gallery-app.tsx` để
 * diff ở đó nhỏ (BB-341/BB-342 cũng đang sửa tệp ấy).
 *
 * Người được mời (viewer):
 *   · Mở màn: hiện ngay tim trong trình duyệt (khoá BB-338), rồi hỏi máy chủ.
 *   · Máy chủ đã có bảng (0083 đã áp): LẦN ĐẦU đưa tim cũ trong trình duyệt
 *     lên máy chủ, từ đó máy chủ là nguồn thật, trình duyệt chỉ là bộ nhớ đệm.
 *   · Máy chủ chưa có bảng (`chuaApMigration`): giữ đúng hành vi BB-338 — tim
 *     chỉ ở trình duyệt.
 *   · Thả/bỏ tim: đổi ngay trên màn (lạc quan), gửi máy chủ; máy chủ từ chối
 *     (4xx) thì trả lại như cũ.
 * Ba mẹ: đọc tim của gia đình (mọi link mời), để hiện chip "Gia đình thích (N)"
 * và dấu nhỏ trên ảnh. Không đụng danh sách trong gói của ba mẹ.
 *
 * Cập nhật tức thời (realtime) là việc của BB-342 — hook này chỉ tải khi mở màn.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { gopTimLanDau, khoaDaDuaTim, khoaTimNguoiXem, TOI_DA_ANH_CHINH_SUA } from "@/lib/gallery/tim-gia-dinh";

function docLocal(khoa: string): string[] {
  try {
    const raw = window.localStorage.getItem(khoa);
    const ds = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(ds) ? ds.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function ghiLocal(khoa: string, gt: string): void {
  try {
    window.localStorage.setItem(khoa, gt);
  } catch {
    // Trình duyệt chặn bộ nhớ — tim vẫn đúng trong phiên này.
  }
}

async function guiTim(body: { them?: string[]; bo?: string[] }): Promise<
  { ok: true; cuaToi: string[] | null; chuaApMigration: boolean } | { ok: false; status: number }
> {
  const res = await fetch("/api/g/tim-gia-dinh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) return { ok: false, status: res.status };
  return {
    ok: true,
    cuaToi: Array.isArray(json?.data?.cuaToi) ? (json.data.cuaToi as string[]) : null,
    chuaApMigration: json?.data?.chuaApMigration === true,
  };
}

export interface TimGiaDinh {
  /** Viewer: tim của chính link này. */
  timCuaToi: Set<string>;
  doiTim: (photo: { id: string }) => void;
  /** Ba mẹ: các tấm gia đình đã thả tim. */
  giaDinhThich: Set<string>;
  /** null = chưa biết; true = máy chủ chưa áp 0083 (giữ tim ở trình duyệt). */
  chuaApMigration: boolean | null;
}

export function useTimGiaDinh(galleryId: string | undefined, laNguoiXem: boolean): TimGiaDinh {
  const [timCuaToi, setTimCuaToi] = useState<Set<string>>(() => new Set());
  const [giaDinhThich, setGiaDinhThich] = useState<Set<string>>(() => new Set());
  const [chuaApMigration, setChuaAp] = useState<boolean | null>(null);
  const timRef = useRef(timCuaToi);
  timRef.current = timCuaToi;
  const mayChuSanSang = useRef(false);

  const datTim = useCallback(
    (ds: Iterable<string>) => {
      const moi = new Set(ds);
      // Cập nhật ref NGAY (không chờ lượt dựng): cú chạm sát lúc trang vừa tải
      // xong không bị lượt gộp tim lần đầu ghi đè.
      timRef.current = moi;
      setTimCuaToi(moi);
      if (galleryId) ghiLocal(khoaTimNguoiXem(galleryId), JSON.stringify([...moi]));
    },
    [galleryId],
  );

  useEffect(() => {
    if (!galleryId) return;
    let huy = false;
    mayChuSanSang.current = false;

    if (laNguoiXem) {
      const local = new Set(docLocal(khoaTimNguoiXem(galleryId)));
      timRef.current = local;
      setTimCuaToi(local);
    }

    (async () => {
      try {
        const res = await fetch("/api/g/tim-gia-dinh", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (huy || !res.ok || !json?.data) return;
        if (json.data.chuaApMigration) {
          setChuaAp(true);
          return;
        }
        setChuaAp(false);

        if (!laNguoiXem) {
          const ds = (json.data.giaDinh ?? []) as { photoId: string }[];
          setGiaDinhThich(new Set(ds.map((d) => d.photoId)));
          return;
        }

        const server = (json.data.cuaToi ?? []) as string[];
        let daDua = false;
        try {
          daDua = window.localStorage.getItem(khoaDaDuaTim(galleryId)) === "1";
        } catch {
          // không đọc được cờ → coi như chưa đưa (gửi lại chỉ là upsert, không trùng)
        }
        const { hienThi, canDua } = gopTimLanDau({ local: [...timRef.current], server, daDua });
        datTim(hienThi);
        mayChuSanSang.current = true;

        if (canDua.length > 0) {
          const kq = await guiTim({ them: canDua.slice(0, TOI_DA_ANH_CHINH_SUA) });
          if (huy) return;
          if (kq.ok && kq.chuaApMigration) {
            mayChuSanSang.current = false;
            setChuaAp(true);
            return;
          }
          if (!kq.ok) return; // lần mở sau thử lại
        }
        ghiLocal(khoaDaDuaTim(galleryId), "1");
      } catch {
        // Mất mạng — giữ tim trong trình duyệt như BB-338.
      }
    })();

    return () => {
      huy = true;
    };
  }, [galleryId, laNguoiXem, datTim]);

  const doiTim = useCallback(
    (photo: { id: string }) => {
      const cu = timRef.current;
      const dangCo = cu.has(photo.id);
      const moi = new Set(cu);
      if (dangCo) moi.delete(photo.id);
      else moi.add(photo.id);
      datTim(moi);
      if (!mayChuSanSang.current) return; // chưa áp 0083 / chưa tải xong: chỉ ở trình duyệt

      void guiTim(dangCo ? { bo: [photo.id] } : { them: [photo.id] })
        .then((kq) => {
          if (kq.ok && kq.chuaApMigration) {
            mayChuSanSang.current = false;
            setChuaAp(true);
            return;
          }
          if (!kq.ok && kq.status >= 400 && kq.status < 500) {
            // Máy chủ từ chối — trả tấm này về như cũ.
            const lai = new Set(timRef.current);
            if (dangCo) lai.add(photo.id);
            else lai.delete(photo.id);
            datTim(lai);
          }
        })
        .catch(() => {
          // Mất mạng: giữ trên màn + bộ nhớ đệm; lần mở sau gộp lại không được
          // (máy chủ là nguồn thật sau lần đưa đầu) — chấp nhận, như mọi thao tác ngoại tuyến khác.
        });
    },
    [datTim],
  );

  return { timCuaToi, doiTim, giaDinhThich, chuaApMigration };
}
