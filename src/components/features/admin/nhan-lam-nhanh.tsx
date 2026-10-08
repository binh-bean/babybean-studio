"use client";

/**
 * BB-399 — "Làm ảnh nhanh" trên màn nhân viên. Câu ngắn; hạn là "dự kiến", không hứa cứng.
 *
 *   · `NhanLamNhanh`        — nhãn ở mọi danh sách (kanban, bảng, Việc cần xử lý). Bộ CÒN chờ
 *                             trả ảnh chỉnh → "Ưu tiên · Làm nhanh" nền màu cảnh báo (token
 *                             `--bb-warning`); bộ đã qua giai đoạn chỉnh → "Làm nhanh" nhạt.
 *   · `KhoiHanTraAdmin`     — chi tiết bộ ảnh: DẢI ưu tiên ở đầu trang (hoặc dòng hạn trả).
 *   · `KhoiCongTacLamNhanh` — (vòng 3) công tắc "Nhận làm ảnh nhanh" cho Admin/Quản lý khi hậu kỳ
 *                             quá tải + số bộ làm nhanh đang chờ (+ danh sách ở bảng điều khiển).
 */
import React from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { formatNgayVN } from "@/lib/utils/dinh-dang";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";

export function NhanLamNhanh({
  lamNhanh,
  uuTien,
  hanTra,
  className,
}: {
  lamNhanh?: boolean | null;
  /** Còn chờ trả ảnh chỉnh → nổi bật "Ưu tiên". Thiếu = coi như ưu tiên khi có `lamNhanh`. */
  uuTien?: boolean | null;
  hanTra?: string | null;
  className?: string;
}) {
  if (!lamNhanh) return null;
  const noiBat = uuTien !== false;
  const ngay = hanTra ? formatNgayVN(hanTra) : "";
  return (
    <span
      data-testid="nhan-lam-nhanh"
      data-uu-tien={noiBat ? "1" : "0"}
      title="Khách mua Làm ảnh nhanh — xử lý bộ này trước"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
        noiBat
          ? "bg-[var(--bb-warning)] text-[var(--bb-warning-fg)]"
          : "border border-[var(--bb-border)] text-[var(--bb-fg-muted)]",
        className,
      )}
    >
      <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
      {noiBat ? "Ưu tiên · Làm nhanh" : "Làm nhanh"}
      {ngay && <span className="font-normal tabular-nums">· trả ~{ngay}</span>}
    </span>
  );
}

interface DuLieuHan {
  daChot: boolean;
  lamNhanh: boolean;
  uuTien?: boolean;
  soNgay: number | null;
  hanTra: string | null;
}

/** Chi tiết bộ ảnh: tự đọc `/api/admin/galleries/[id]/lam-anh-nhanh`. */
export function KhoiHanTraAdmin({ galleryId }: { galleryId: string }) {
  const [d, setD] = React.useState<DuLieuHan | null>(null);
  React.useEffect(() => {
    let huy = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/lam-anh-nhanh`, {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!huy && res.ok && json?.data) setD(json.data as DuLieuHan);
      } catch {
        // Khối phụ: lỗi mạng thì không hiện, không chặn màn chi tiết.
      }
    })();
    return () => {
      huy = true;
    };
  }, [galleryId]);

  if (!d?.daChot || !d.hanTra) return null;
  if (d.lamNhanh && d.uuTien) {
    return (
      <div
        data-testid="khoi-han-tra"
        data-lam-nhanh="1"
        role="status"
        className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--bb-radius-sm)] bg-[var(--bb-warning)] px-4 py-3 text-sm text-[var(--bb-warning-fg)]"
      >
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <Zap className="h-4 w-4" aria-hidden="true" />
          <span data-testid="nhan-lam-nhanh">Ưu tiên · Làm nhanh</span>
        </span>
        <span>
          Khách mua làm ảnh nhanh — xử lý bộ này trước. Hạn trả dự kiến{" "}
          <b className="tabular-nums">{formatNgayVN(d.hanTra)}</b>
          {d.soNgay ? ` (${d.soNgay} ngày)` : ""}.
        </span>
      </div>
    );
  }
  return (
    <div
      data-testid="khoi-han-tra"
      data-lam-nhanh={d.lamNhanh ? "1" : "0"}
      className="flex flex-wrap items-center gap-2 text-sm text-[var(--bb-fg-muted)]"
    >
      <NhanLamNhanh lamNhanh={d.lamNhanh} uuTien={false} />
      <span>
        Hạn trả ảnh chỉnh dự kiến:{" "}
        <b className="font-semibold tabular-nums text-[var(--bb-fg)]">{formatNgayVN(d.hanTra)}</b>
        {d.soNgay ? ` (${d.soNgay} ngày sau khi chốt)` : ""}
      </span>
    </div>
  );
}

interface BoCho {
  galleryId: string;
  title: string;
  hanTra: string | null;
}

interface DuLieuCongTac {
  bat: boolean;
  coTheDoi: boolean;
  dsCho: BoCho[];
}

/**
 * Công tắc "Nhận làm ảnh nhanh" + số bộ làm nhanh đang chờ. `hienDanhSach` (bảng điều khiển)
 * liệt kê từng bộ (hạn gần nhất trước) và ẩn hẳn khi không có bộ nào lẫn công tắc đang bật.
 */
export function KhoiCongTacLamNhanh({ hienDanhSach = false }: { hienDanhSach?: boolean }) {
  const [d, setD] = React.useState<DuLieuCongTac | null>(null);
  const [dangLuu, setDangLuu] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);

  const tai = React.useCallback(async () => {
    try {
      const res = await fetch("/api/admin/lam-anh-nhanh", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.data) setD(json.data as DuLieuCongTac);
    } catch {
      // Khối phụ: lỗi mạng thì không hiện.
    }
  }, []);
  React.useEffect(() => {
    void tai();
  }, [tai]);

  async function doi(bat: boolean) {
    setDangLuu(true);
    setLoi(null);
    // Ô tick đổi NGAY (lạc quan); lưu hỏng thì `tai()` bên dưới trả về giá trị thật trên máy chủ.
    const truoc = d;
    setD((cu) => (cu ? { ...cu, bat } : cu));
    try {
      const res = await fetch("/api/admin/lam-anh-nhanh", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bat }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setD(truoc);
        setLoi(json?.error?.message ?? "Chưa đổi được, thử lại giúp.");
        return;
      }
      await tai();
    } catch {
      setD(truoc);
      setLoi("Mất kết nối, thử lại giúp.");
    } finally {
      setDangLuu(false);
    }
  }

  if (!d) return null;
  const so = d.dsCho.length;
  if (hienDanhSach && so === 0 && d.bat) return null;
  return (
    <section
      data-testid="khoi-cong-tac-lam-nhanh"
      data-bat={d.bat ? "1" : "0"}
      className={cn(
        "rounded-[var(--bb-radius-sm)] border p-3 text-sm",
        so > 0 ? "border-[var(--bb-warning)]" : "border-[var(--bb-border)]",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 font-medium">
          <Zap className="h-4 w-4 text-[var(--bb-warning)]" aria-hidden="true" />
          <span data-testid="so-bo-lam-nhanh-cho">
            {so > 0 ? `${so} bộ làm nhanh đang chờ — xử lý trước` : "Không có bộ làm nhanh nào đang chờ"}
          </span>
        </p>
        <label className="inline-flex items-center gap-2 text-sm">
          {d.coTheDoi ? (
            <Checkbox
              data-testid="cong-tac-lam-nhanh"
              checked={d.bat}
              disabled={dangLuu}
              onCheckedChange={(v) => void doi(v)}
              aria-label="Nhận làm ảnh nhanh"
            />
          ) : null}
          <span className={d.bat ? "" : "font-semibold text-[var(--bb-danger)]"}>
            {d.bat ? "Đang nhận làm ảnh nhanh" : "Đang tạm ngưng nhận làm ảnh nhanh"}
          </span>
        </label>
      </div>
      {!d.bat && (
        <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
          Khách không thấy ô Làm ảnh nhanh. Bộ đã mua vẫn ưu tiên như cũ.
        </p>
      )}
      {d.coTheDoi && d.bat && (
        <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">Hậu kỳ quá tải thì bỏ tích để tạm ngưng.</p>
      )}
      {loi && (
        <p role="alert" className="mt-1 text-xs text-[var(--bb-danger)]">
          {loi}
        </p>
      )}
      {hienDanhSach && so > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {d.dsCho.slice(0, 10).map((b) => (
            <li key={b.galleryId} className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/admin/galleries/${encodeURIComponent(b.galleryId)}`} className="font-medium hover:underline">
                {hienTieuDeBoAnh(b.title)}
              </Link>
              <NhanLamNhanh lamNhanh uuTien hanTra={b.hanTra} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
