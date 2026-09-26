"use client";

/**
 * Khối "Cần xử lý trước khi gửi khách" — trang danh sách bộ ảnh quản trị.
 *
 * Task BB-257.
 *
 * ---------------------------------------------------------------------------
 * Vì sao đặt ở trang DANH SÁCH, không phải Bảng điều khiển
 * ---------------------------------------------------------------------------
 * `Dashboard` (src/components/features/admin/dashboard.tsx) đã có một khối
 * "cần chú ý" riêng — nhưng nó canh HẠN GIAO (quá hạn/sắp hết hạn), một việc
 * khác hẳn: khối đó hỏi "bộ ảnh nào sắp trễ hẹn với khách", khối này hỏi "bộ
 * ảnh nào gửi link ra thì khách thấy TRANG TRẮNG". Gộp chung sẽ làm một khối
 * gánh hai câu hỏi khác nhau. Trang danh sách bộ ảnh là nơi CSKH đã đứng sẵn
 * để sửa từng bộ (đổi link Drive, đồng bộ lại), nên khối cảnh báo đứng ngay
 * phía trên danh sách là gần nhất với hành động sửa.
 *
 * ---------------------------------------------------------------------------
 * Vì sao gọi lại đúng route POST .../sync, không viết luồng Drive mới
 * ---------------------------------------------------------------------------
 * `POST /api/admin/galleries/[id]/sync` (src/app/api/admin/galleries/[id]/sync/route.ts)
 * đã là "Kiểm lại" — nó xoá `sync_error` cũ, chạy `after()` gọi
 * `dongBoBoAnh()`, và bộ đồng bộ được sẽ tự đổi trạng thái khỏi `sync_error`.
 * Nút "Kiểm lại" ở đây gọi thẳng route đó rồi tự làm mới danh sách sau một
 * khoảng chờ ngắn — không có logic Drive nào viết lại ở tầng UI.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { FolderOpen, RefreshCw, AlertTriangle, ImageOff, ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/components/ui/utils";
import Link from "next/link";

interface MucCanXuLy {
  id: string;
  title: string;
  branchName: string;
  driveFolderUrl: string | null;
  syncError: string | null;
  lastSyncedAt: string | null;
}

interface DuLieuCanXuLy {
  driveChuaChiaSe: MucCanXuLy[];
  chuaCoAnh: MucCanXuLy[];
}

/** Trạng thái "Kiểm lại" của MỘT bộ ảnh, theo id — để khoá đúng nút đang chạy. */
type TrangThaiKiemLai = "idle" | "dang_chay" | "loi";

export function CanXuLy() {
  const [duLieu, setDuLieu] = useState<DuLieuCanXuLy | null>(null);
  const [loading, setLoading] = useState(true);
  const [moRong, setMoRong] = useState<Record<"drive" | "rong", boolean>>({
    drive: true,
    rong: true,
  });
  const [trangThaiKiemLai, setTrangThaiKiemLai] = useState<Record<string, TrangThaiKiemLai>>({});
  const [loiKiemLai, setLoiKiemLai] = useState<Record<string, string>>({});

  const taiDuLieu = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/can-xu-ly", { cache: "no-store" });
      const json = await res.json();
      if (res.ok && json.data) {
        setDuLieu(json.data as DuLieuCanXuLy);
      }
    } catch {
      // Lặng lẽ bỏ qua: khối này là cảnh báo thêm, không phải màn hình
      // chính — hỏng thì khối tự ẩn (duLieu vẫn null), không chặn trang danh
      // sách chạy tiếp.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    taiDuLieu();
  }, [taiDuLieu]);

  const kiemLai = useCallback(
    async (galleryId: string) => {
      // Chặn bấm liên tục: đang "dang_chay" thì bỏ qua lượt bấm mới.
      setTrangThaiKiemLai((truoc) => {
        if (truoc[galleryId] === "dang_chay") return truoc;
        return { ...truoc, [galleryId]: "dang_chay" };
      });
      setLoiKiemLai((truoc) => {
        const { [galleryId]: _bo, ...con } = truoc;
        return con;
      });

      try {
        const res = await fetch(`/api/admin/galleries/${galleryId}/sync`, { method: "POST" });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error(json?.error?.message || "Không kiểm lại được, vui lòng thử lại");
        }

        // Route chạy đồng bộ ở nền (`after()`), trả 202 ngay. Chờ một nhịp rồi
        // tải lại danh sách để thấy kết quả — bộ đồng bộ được sẽ tự biến mất
        // khỏi khối này, bộ vẫn lỗi thì `sync_error` mới sẽ hiện ra.
        await new Promise((r) => setTimeout(r, 3000));
        await taiDuLieu();
        setTrangThaiKiemLai((truoc) => ({ ...truoc, [galleryId]: "idle" }));
      } catch (err) {
        setTrangThaiKiemLai((truoc) => ({ ...truoc, [galleryId]: "loi" }));
        setLoiKiemLai((truoc) => ({
          ...truoc,
          [galleryId]: err instanceof Error ? err.message : "Không kiểm lại được, vui lòng thử lại",
        }));
      }
    },
    [taiDuLieu],
  );

  if (loading) return null;
  if (!duLieu) return null;

  const { driveChuaChiaSe, chuaCoAnh } = duLieu;
  const tongSo = driveChuaChiaSe.length + chuaCoAnh.length;
  if (tongSo === 0) return null; // Không có gì thì khối tự ẩn.

  return (
    <Card
      data-testid="can-xu-ly"
      className="border-[var(--bb-warning)]/40 bg-[var(--bb-warning)]/5 p-4 space-y-4"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-5 w-5 text-[var(--bb-warning)]" aria-hidden="true" />
        <h2 className="text-base font-semibold text-[var(--bb-fg)]">
          Cần xử lý trước khi gửi khách
        </h2>
        <Badge variant="warning">{tongSo}</Badge>
      </div>

      {driveChuaChiaSe.length > 0 && (
        <NhomCanXuLy
          nhanDe="drive"
          tieuDe="Thư mục Drive chưa chia sẻ công khai"
          moTa="App không đọc được ảnh trong các thư mục này — khách mở link sẽ thấy trang trắng."
          icon={<FolderOpen className="h-4 w-4" aria-hidden="true" />}
          items={driveChuaChiaSe}
          moRong={moRong.drive}
          onToggle={() => setMoRong((t) => ({ ...t, drive: !t.drive }))}
          renderHanhDong={(item) => (
            <div className="flex flex-wrap items-center gap-2">
              {item.driveFolderUrl && (
                <a
                  href={item.driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                >
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Mở thư mục Drive
                </a>
              )}
              <NutKiemLai
                galleryId={item.id}
                trangThai={trangThaiKiemLai[item.id] ?? "idle"}
                onClick={() => kiemLai(item.id)}
              />
            </div>
          )}
          ghiChuDuoi={
            <ol className="mt-2 list-decimal space-y-0.5 pl-5 text-xs text-[var(--bb-fg-muted)]">
              <li>Mở thư mục ảnh trên Google Drive</li>
              <li>Bấm &quot;Chia sẻ&quot;</li>
              <li>
                Chọn &quot;Bất kỳ ai có đường liên kết&quot; → quyền &quot;Người xem&quot;
              </li>
            </ol>
          }
          loiKiemLai={loiKiemLai}
        />
      )}

      {chuaCoAnh.length > 0 && (
        <NhomCanXuLy
          nhanDe="rong"
          tieuDe="Bộ ảnh chưa có tấm nào"
          moTa="Thư mục Drive đọc được nhưng chưa có ảnh — gửi link lúc này khách sẽ thấy bộ ảnh trống."
          icon={<ImageOff className="h-4 w-4" aria-hidden="true" />}
          items={chuaCoAnh}
          moRong={moRong.rong}
          onToggle={() => setMoRong((t) => ({ ...t, rong: !t.rong }))}
          renderHanhDong={(item) => (
            <NutKiemLai
              galleryId={item.id}
              trangThai={trangThaiKiemLai[item.id] ?? "idle"}
              onClick={() => kiemLai(item.id)}
            />
          )}
          loiKiemLai={loiKiemLai}
        />
      )}
    </Card>
  );
}

function NutKiemLai({
  galleryId,
  trangThai,
  onClick,
}: {
  galleryId: string;
  trangThai: TrangThaiKiemLai;
  onClick: () => void;
}) {
  const dangChay = trangThai === "dang_chay";
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={dangChay}
      onClick={onClick}
      aria-busy={dangChay}
      data-testid={`kiem-lai-${galleryId}`}
      className="inline-flex items-center gap-1.5"
    >
      {dangChay ? (
        <Spinner size="sm" label="Đang kiểm lại" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      Kiểm lại
    </Button>
  );
}

function NhomCanXuLy({
  nhanDe,
  tieuDe,
  moTa,
  icon,
  items,
  moRong,
  onToggle,
  renderHanhDong,
  ghiChuDuoi,
  loiKiemLai,
}: {
  nhanDe: string;
  tieuDe: string;
  moTa: string;
  icon: ReactNode;
  items: MucCanXuLy[];
  moRong: boolean;
  onToggle: () => void;
  renderHanhDong: (item: MucCanXuLy) => ReactNode;
  ghiChuDuoi?: ReactNode;
  loiKiemLai: Record<string, string>;
}) {
  return (
    <div className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={moRong}
        data-testid={`nhom-can-xu-ly-${nhanDe}`}
        className="flex w-full items-center justify-between gap-2 p-3 text-left min-h-[44px]"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-[var(--bb-fg)]">
          {icon}
          {tieuDe}
          <Badge variant="outline">{items.length}</Badge>
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--bb-fg-muted)] transition-transform ${moRong ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {moRong && (
        <div className="space-y-2 border-t border-[var(--bb-border)] p-3">
          <p className="text-xs text-[var(--bb-fg-muted)]">{moTa}</p>
          {ghiChuDuoi}
          <ul className="space-y-2 pt-1">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col gap-2 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/galleries/${item.id}`}
                    className="block truncate text-sm font-medium text-[var(--bb-fg)] hover:underline"
                  >
                    {item.title}
                  </Link>
                  <p className="text-xs text-[var(--bb-fg-muted)]">{item.branchName}</p>
                  {/*
                    Lý do lỗi HIỆN TẠI của bộ ảnh (từ `galleries.sync_error` qua
                    API), không phải lỗi của riêng lượt bấm — sau khi bấm "Kiểm
                    lại" và tải lại danh sách, dòng này tự cập nhật theo dữ liệu
                    mới nhất: đồng bộ được thì cả dòng biến mất, còn lỗi thì câu
                    này đổi sang lý do mới nếu có.
                  */}
                  {item.syncError && (
                    <p className="mt-1 text-xs text-[var(--bb-danger)]" role="alert">
                      {item.syncError}
                    </p>
                  )}
                  {/* Lỗi của riêng LƯỢT BẤM này (vd mất mạng) — khác lý do trên. */}
                  {loiKiemLai[item.id] && (
                    <p className="mt-1 text-xs text-[var(--bb-danger)]" role="alert">
                      {loiKiemLai[item.id]}
                    </p>
                  )}
                </div>
                <div className="shrink-0">{renderHanhDong(item)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
