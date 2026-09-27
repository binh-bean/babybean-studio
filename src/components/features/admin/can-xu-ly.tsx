"use client";

/**
 * Dải cảnh báo "N bộ cần xử lý trước khi gửi khách" — trang DANH SÁCH bộ ảnh.
 *
 * Task BB-257 → thu gọn lại ở BB-290 lượt 2.
 *
 * ---------------------------------------------------------------------------
 * Vì sao thu gọn còn MỘT DÒNG, không liệt kê chi tiết ở đây nữa
 * ---------------------------------------------------------------------------
 * Bản đầu (BB-257) mở sẵn toàn bộ danh sách — tới 134 dòng trong dữ liệu
 * thật, chiếm hết màn hình và đẩy bảng Bộ ảnh xuống dưới cuộn. Đây cũng CHÍNH
 * XÁC là dữ liệu trang /admin/viec-can-xu-ly (tab "Bộ ảnh lỗi tải", BB-280)
 * đã hiển thị đầy đủ với nút "Kiểm lại" cho từng dòng — giữ cả hai bản chi
 * tiết là trùng lặp và một chỗ dễ lệch dữ liệu với chỗ kia. Trang danh sách
 * giờ chỉ còn một dải cảnh báo NHẸ, bấm "Xem" là sang đúng trang chi tiết.
 *
 * ---------------------------------------------------------------------------
 * Vì sao đặt ở trang DANH SÁCH, không phải Bảng điều khiển
 * ---------------------------------------------------------------------------
 * `Dashboard` (src/components/features/admin/dashboard.tsx) đã có một khối
 * "cần chú ý" riêng — nhưng nó canh HẠN GIAO (quá hạn/sắp hết hạn), một việc
 * khác hẳn: khối đó hỏi "bộ ảnh nào sắp trễ hẹn với khách", dải này hỏi "bộ
 * ảnh nào gửi link ra thì khách thấy TRANG TRẮNG".
 */

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";

interface DuLieuCanXuLy {
  driveChuaChiaSe: unknown[];
  chuaCoAnh: unknown[];
}

export function CanXuLy() {
  const [tongSo, setTongSo] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/can-xu-ly", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive || !res.ok || !json?.data) return;
        const d = json.data as DuLieuCanXuLy;
        setTongSo(d.driveChuaChiaSe.length + d.chuaCoAnh.length);
      } catch {
        // Dải cảnh báo là phần thêm — hỏng thì ẩn hẳn, không chặn trang.
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!tongSo) return null; // null (chưa tải xong) hoặc 0 (không có gì) đều ẩn.

  return (
    // LƯU Ý CÒN LẠI: `/admin/viec-can-xu-ly` (tab mặc định "loi-dong-bo",
    // BB-280) chỉ liệt kê bộ ảnh có `sync_error` — chưa liệt kê nhóm
    // `chuaCoAnh` (draft + 0 ảnh) mà con số ở đây vẫn gộp cả hai, đúng như
    // API `/api/admin/can-xu-ly` gộp từ trước (BB-257). Cần một tab riêng
    // hoặc gộp thêm dữ liệu ở trang đích mới hết khoảng lệch này.
    <Link
      href="/admin/viec-can-xu-ly"
      data-testid="can-xu-ly"
      className="flex items-center gap-2 rounded-[var(--bb-radius-sm)] border border-[var(--bb-warning)]/40 bg-[var(--bb-warning)]/10 px-3.5 py-2.5 text-sm text-[var(--bb-fg)] transition-colors hover:bg-[var(--bb-warning)]/15"
    >
      <span
        role="img"
        aria-label="Cảnh báo"
        className="inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--bb-warning)]"
      />
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--bb-warning)]" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">
        <strong className="font-medium">{tongSo}</strong> bộ cần xử lý trước khi gửi khách
      </span>
      <span className="shrink-0 font-medium text-[var(--bb-fg)] underline underline-offset-2">
        Xem
      </span>
    </Link>
  );
}
