"use client";

/**
 * "Dòng thời gian hoạt động" — khối cột phải màn chi tiết bộ ảnh quản trị.
 *
 * OWNER: task BB-259.
 * Bản vẽ: docs/thiet-ke/quan-tri-chi-tiet.webp.
 *
 * ---------------------------------------------------------------------------
 * Lỗi tải thì TỰ ẨN, không kéo cả trang xuống theo
 * ---------------------------------------------------------------------------
 * Khối này là phần THÊM, không phải phần nghiệp vụ chính của màn chi tiết
 * (thành phần hợp đồng, chốt đơn…). API `.../dong-thoi-gian` hỏng — mạng lỗi,
 * 500, bất cứ gì — không được phép làm khối chính bên cạnh nó vỡ theo, nên khi
 * lượt tải ĐẦU TIÊN lỗi, cả khối trả về `null`.
 */

import React, { useCallback, useEffect, useState } from "react";

interface DongThoiGian {
  luc: string;
  nhom: string;
  cau: string;
  nguoi: string;
}

const MAU_CHAM: Record<string, string> = {
  khach: "var(--bb-accent)", // xanh sage
  nhan_vien: "var(--bb-fg)", // mực
  tien: "var(--bb-primary)", // hồng đất
  he_thong: "var(--bb-fg-muted)", // xám
};

function mauCham(nhom: string): string {
  return MAU_CHAM[nhom] ?? "var(--bb-fg-muted)";
}

/** "vừa xong" / "5 phút trước" / "2 giờ trước" / "hôm qua 14:05" / "12/09 14:05". */
function thoiGianTuongDoi(iso: string, bayGio: number = Date.now()): string {
  const luc = new Date(iso).getTime();
  if (Number.isNaN(luc)) return "";
  const chenhLechGiay = Math.max(0, Math.round((bayGio - luc) / 1000));

  if (chenhLechGiay < 60) return "vừa xong";
  const phut = Math.round(chenhLechGiay / 60);
  if (phut < 60) return `${phut} phút trước`;
  const gio = Math.round(chenhLechGiay / 3600);
  if (gio < 24) return `${gio} giờ trước`;

  const d = new Date(luc);
  const gioPhut = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

  const homNay = new Date(bayGio);
  const homQua = new Date(bayGio);
  homQua.setDate(homQua.getDate() - 1);
  const cungNgay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  if (cungNgay(d, homQua)) return `hôm qua ${gioPhut}`;
  if (cungNgay(d, homNay)) return gioPhut;

  const ngayThang = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
  return `${ngayThang} ${gioPhut}`;
}

export function DongThoiGianHoatDong({ galleryId }: { galleryId: string }) {
  const [items, setItems] = useState<DongThoiGian[] | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [dangTaiThem, setDangTaiThem] = useState(false);
  const [conThem, setConThem] = useState(false);
  const [loiDauTien, setLoiDauTien] = useState(false);
  const [now] = useState(() => Date.now());

  const taiTrang = useCallback(
    async (truoc?: string) => {
      const qs = truoc ? `?truoc=${encodeURIComponent(truoc)}` : "";
      const res = await fetch(`/api/admin/galleries/${galleryId}/dong-thoi-gian${qs}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data) throw new Error("Không tải được dòng thời gian");
      return {
        items: (json.data.items ?? []) as DongThoiGian[],
        hasMore: Boolean(json.meta?.hasMore),
      };
    },
    [galleryId],
  );

  useEffect(() => {
    let huy = false;
    setDangTai(true);
    taiTrang()
      .then((kq) => {
        if (huy) return;
        setItems(kq.items);
        setConThem(kq.hasMore);
      })
      .catch(() => {
        if (huy) return;
        setLoiDauTien(true);
      })
      .finally(() => {
        if (!huy) setDangTai(false);
      });
    return () => {
      huy = true;
    };
  }, [taiTrang]);

  async function xemThem() {
    if (!items || items.length === 0) return;
    setDangTaiThem(true);
    try {
      const cuoi = items[items.length - 1];
      const kq = await taiTrang(cuoi?.luc);
      setItems((cu) => [...(cu ?? []), ...kq.items]);
      setConThem(kq.hasMore);
    } catch {
      // Lượt "Xem thêm" lỗi thì giữ nguyên những gì đã có, không báo gì thêm —
      // khối chính vẫn phải đứng vững.
      setConThem(false);
    } finally {
      setDangTaiThem(false);
    }
  }

  // Lỗi ngay lượt tải đầu tiên: ẩn cả khối, không làm hỏng phần còn lại của
  // màn chi tiết.
  if (loiDauTien) return null;

  return (
    <section className="rounded-lg border border-[var(--bb-border)] p-4">
      <h2 className="text-base font-medium">Dòng thời gian hoạt động</h2>

      {dangTai && !items ? (
        <p className="mt-3 text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>
      ) : !items || items.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--bb-fg-muted)]">Chưa có hoạt động</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {items.map((dong, i) => (
            <li key={`${dong.luc}-${i}`} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: mauCham(dong.nhom) }}
              />
              <div className="min-w-0">
                <p className="text-sm leading-snug">{dong.cau}</p>
                <p className="text-xs text-[var(--bb-fg-muted)]">
                  {dong.nguoi} · {thoiGianTuongDoi(dong.luc, now)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {conThem && (
        <button
          type="button"
          disabled={dangTaiThem}
          onClick={() => void xemThem()}
          className="mt-3 rounded-md border border-[var(--bb-border)] px-3 py-1.5 text-xs disabled:opacity-40"
        >
          {dangTaiThem ? "Đang tải…" : "Xem thêm"}
        </button>
      )}
    </section>
  );
}
