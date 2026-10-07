"use client";

/**
 * BB-381 — khối ở chi tiết bộ ảnh (`GET /api/admin/galleries/[id]/hau-ky`):
 *   · bộ này là ĐƠN HẬU KỲ mua thêm (0 ảnh, hoá đơn không có dịch vụ chụp): nói rõ không gửi
 *     link cho khách và chỉ tới bộ gốc của khách;
 *   · bộ này là BỘ GỐC: liệt kê "Đơn mua thêm ngoài app: HD_… · In thêm …" để CSKH thấy và làm.
 * Không có gì thì tự ẩn.
 */
import React from "react";
import Link from "next/link";
import type { HauKyCuaBo } from "@/lib/gallery/bo-anh-rong";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";

export function KhoiHauKyBoAnh({ galleryId }: { galleryId: string }) {
  const [d, setD] = React.useState<HauKyCuaBo | null>(null);
  React.useEffect(() => {
    let song = true;
    fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/hau-ky`, { cache: "no-store" })
      .then((r) => r.json().catch(() => null).then((j) => (r.ok ? j?.data : null)))
      .then((data) => {
        if (song) setD((data as HauKyCuaBo | null) ?? null);
      })
      .catch(() => {});
    return () => {
      song = false;
    };
  }, [galleryId]);

  if (!d) return null;

  if (d.laDonHauKy) {
    return (
      <section
        data-testid="khoi-don-hau-ky"
        className="rounded-lg border border-[var(--bb-border)] bg-[var(--bb-surface-2)] px-4 py-3 text-sm"
      >
        <p className="font-medium text-[var(--bb-fg)]">Đơn hậu kỳ mua thêm — không gửi link cho khách</p>
        <p className="mt-1 text-[var(--bb-fg-muted)] [overflow-wrap:anywhere]">
          Hoá đơn không có dịch vụ chụp{d.thanhPhan ? `: ${d.thanhPhan}` : ""}. Làm từ ảnh của bộ gốc, theo dõi ở Việc cần xử lý → Đơn hậu kỳ mua thêm.
        </p>
        <p className="mt-1 text-[var(--bb-fg-muted)]">
          {d.boGoc ? (
            <>
              Bộ gốc:{" "}
              <Link href={`/admin/galleries/${encodeURIComponent(d.boGoc.id)}`} className="underline hover:text-[var(--bb-fg)]">
                {hienTieuDeBoAnh(d.boGoc.title)}
              </Link>
            </>
          ) : (
            "Khách chưa có bộ ảnh gốc trong app — lấy ảnh từ thư mục Drive cũ của khách."
          )}
        </p>
      </section>
    );
  }

  if (d.donMuaThem.length === 0) return null;
  return (
    <section data-testid="khoi-don-mua-them-ngoai-app" className="rounded-lg border border-[var(--bb-border)] px-4 py-3 text-sm">
      <ul className="flex flex-col gap-1">
        {d.donMuaThem.map((x) => (
          <li key={x.galleryId} className="[overflow-wrap:anywhere]">
            <span className="text-[var(--bb-fg-muted)]">Đơn mua thêm ngoài app: </span>
            <Link href={`/admin/galleries/${encodeURIComponent(x.galleryId)}`} className="font-medium underline">
              {x.maHoaDon ?? "Chưa có mã"}
            </Link>
            {x.thanhPhan ? ` · ${x.thanhPhan}` : ""}
            {x.trangThaiLark ? <span className="text-[var(--bb-fg-muted)]"> · {x.trangThaiLark}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
