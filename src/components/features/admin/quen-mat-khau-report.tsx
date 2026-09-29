"use client";

/**
 * Tab "Quên mật khẩu" ở /admin/viec-can-xu-ly — BB-327.
 *
 * Nhân viên bấm "Quên mật khẩu?" ở màn đăng nhập → dòng hiện ở đây. Admin đặt
 * lại mật khẩu ở Nhân sự (nút sẵn có ở từng dòng nhân sự); đặt lại xong dòng
 * tự rời danh sách — xem src/lib/nhan-su/quen-mat-khau.ts.
 */

import React from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { CARD_TITLE_CLASS } from "./page-header";
import { formatGioVN, formatNgayVN } from "@/lib/utils/dinh-dang";

interface DongQuenMatKhau {
  staffId: string;
  fullName: string;
  taiKhoan: string;
  requestedAt: string;
  lanThu: number;
}

export function QuenMatKhauReport() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<DongQuenMatKhau[]>([]);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/reports/quen-mat-khau", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setError(json?.error?.message ?? "Không tải được danh sách");
          return;
        }
        setItems(json.data.items ?? []);
      } catch {
        if (alive) setError("Mất kết nối, thử lại giúp.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (loading) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;
  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className={CARD_TITLE_CLASS}>Nhân viên quên mật khẩu</h2>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Đặt lại mật khẩu ở Nhân sự rồi báo mật khẩu mới cho nhân viên. Đặt lại xong, dòng tự rời danh sách.
        </p>
      </header>
      {items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">Không có yêu cầu nào đang chờ.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bb-border)] rounded-lg border border-[var(--bb-border)]">
          {items.map((it) => (
            <li
              key={it.staffId}
              data-testid="dong-quen-mat-khau"
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-[var(--bb-fg)]">{it.fullName}</p>
                <p className="text-xs text-[var(--bb-fg-muted)]">
                  {it.taiKhoan} · gửi lúc {formatGioVN(new Date(it.requestedAt))} {formatNgayVN(it.requestedAt)}
                  {it.lanThu > 1 ? ` · ${it.lanThu} lần` : ""}
                </p>
              </div>
              <Link
                href="/admin/staff"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--bb-border)] px-3 text-xs font-medium text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                Đặt lại ở Nhân sự
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
