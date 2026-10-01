"use client";

/**
 * "Xuất danh sách" hiện CHỮ ngay trong app — BB-327.
 *
 * Chủ studio 29/09/2026: không cần tải tệp; hiện danh sách ảnh ĐÃ CHỌN thành
 * chữ trong một khung, có nút "Chép" để dán sang Lark/Zalo/Lightroom. Dữ liệu
 * lấy từ đúng route xuất tệp cũ (`/export`, chỉ ảnh khách CHÍNH đã chọn,
 * `mark = 'selected'`) với `hien=1` để không ghi nhật ký mỗi lần mở trang.
 */

import React from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type DinhDang = "ten-file" | "chi-tiet";

export function DanhSachAnhChon({ galleryId, soAnh }: { galleryId: string; soAnh: number }) {
  const [dinhDang, setDinhDang] = React.useState<DinhDang>("ten-file");
  const [chu, setChu] = React.useState<string>("");
  const [dangTai, setDangTai] = React.useState(true);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [daChep, setDaChep] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    setDangTai(true);
    setLoi(null);
    const q = dinhDang === "chi-tiet" ? "format=chi-tiet&hien=1" : "hien=1";
    fetch(`/api/admin/galleries/${encodeURIComponent(galleryId)}/export?${q}`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          setLoi(json?.error?.message ?? "Không tải được danh sách");
          return;
        }
        setChu(await res.text());
      })
      .catch(() => alive && setLoi("Mất kết nối, thử lại giúp."))
      .finally(() => alive && setDangTai(false));
    return () => {
      alive = false;
    };
  }, [galleryId, dinhDang, soAnh]);

  async function chep() {
    try {
      await navigator.clipboard.writeText(chu);
      setDaChep(true);
      window.setTimeout(() => setDaChep(false), 2000);
    } catch {
      setLoi("Trình duyệt chặn chép — bôi đen khung chữ rồi Ctrl+C giúp.");
    }
  }

  const nutDinhDang = (gt: DinhDang, nhan: string) => (
    <button
      type="button"
      onClick={() => setDinhDang(gt)}
      aria-pressed={dinhDang === gt}
      className={
        "h-7 rounded-full border px-3 text-xs " +
        (dinhDang === gt
          ? "border-[var(--bb-fg)] bg-[var(--bb-fg)] text-[var(--bb-bg)]"
          : "border-[var(--bb-border)] text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]")
      }
    >
      {nhan}
    </button>
  );

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {nutDinhDang("ten-file", "Tên file")}
        {nutDinhDang("chi-tiet", "Thông tin chi tiết")}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="ml-auto h-7 text-xs"
          onClick={() => void chep()}
          disabled={dangTai || !!loi || chu.length === 0}
          data-testid="chep-danh-sach-anh"
        >
          {daChep ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
          {daChep ? "Đã chép" : "Chép"}
        </Button>
      </div>
      {loi ? (
        <p className="text-xs text-[var(--bb-danger)]">{loi}</p>
      ) : (
        <textarea
          readOnly
          aria-label="Danh sách ảnh khách đã chọn"
          data-testid="khung-danh-sach-anh"
          value={dangTai ? "Đang tải…" : chu}
          rows={Math.min(12, Math.max(4, soAnh + 1))}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full resize-y rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)] p-2 text-xs tabular-nums leading-relaxed text-[var(--bb-fg)]"
        />
      )}
      <p className="text-[11px] text-[var(--bb-fg-muted)]">Chỉ gồm {soAnh} ảnh ba mẹ đã chọn, xếp theo thứ tự trong thư mục.</p>
    </div>
  );
}
