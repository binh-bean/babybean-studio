"use client";

/**
 * "Xuất danh sách" hiện CHỮ ngay trong app — BB-327, mở rộng theo đợt ở BB-403.
 *
 * Chủ studio 29/09/2026: không cần tải tệp; hiện danh sách ảnh ĐÃ CHỌN thành
 * chữ trong một khung, có nút "Chép" để dán sang Lark/Zalo/Lightroom. Dữ liệu
 * lấy từ đúng route xuất tệp cũ (`/export`, chỉ ảnh khách CHÍNH đã chọn,
 * `mark = 'selected'`) với `hien=1` để không ghi nhật ký mỗi lần mở trang.
 *
 * BB-403 (anh 08/10/2026): các đợt mua thêm cũng hiện NGAY ở đây, không bắt tải về. Hàng chip
 * "Đợt 1 · Đợt 2 · … · Tất cả" (chỉ khi bộ có từ hai đợt có ảnh); bấm đợt nào thì khung chữ
 * đổi sang ảnh đúng đợt đó (`export?hien=1&dot=N`). Hai nút chép: tên tệp / bản chi tiết.
 */

import React from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MA_KHOI_DANH_SACH,
  SU_KIEN_MO_DOT,
  cacChipDot,
  chepDanhSach,
  docDotTuHash,
  dotCuaLuaChon,
  dotHopLe,
  taoBoLayDanhSach,
  type DinhDangDanhSach,
  type DotChoDanhSach,
  type LuaChonDot,
} from "@/lib/gallery/danh-sach-theo-dot";

const NHAN_TRANG_THAI_NGAN: Record<string, string> = {
  cho_xac_nhan: "Chờ xác nhận",
  da_xac_nhan: "Đã xác nhận",
};

export function DanhSachAnhChon({
  galleryId,
  soAnh,
  dotChon,
}: {
  galleryId: string;
  /** Tổng số ảnh khách chọn (mọi đợt). */
  soAnh: number;
  /** Các đợt (từ `detail.dotChon`). Rỗng / chỉ đợt 1 → không có hàng chip, như trước. */
  dotChon?: ReadonlyArray<DotChoDanhSach> | null;
}) {
  const chip = React.useMemo(() => cacChipDot(dotChon), [dotChon]);
  const [chonTay, setChonTay] = React.useState<LuaChonDot | null>(null);
  const chon = dotHopLe(chonTay, chip);
  const dot = dotCuaLuaChon(chon);

  const [dinhDang, setDinhDang] = React.useState<DinhDangDanhSach>("ten-file");
  const [chu, setChu] = React.useState<string>("");
  const [dangTai, setDangTai] = React.useState(true);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [daChep, setDaChep] = React.useState<{ loai: DinhDangDanhSach; thongBao: string } | null>(null);
  const [loiChep, setLoiChep] = React.useState<string | null>(null);

  // Một bộ lấy chữ cho mỗi bộ ảnh; đổi số ảnh (vừa xác nhận / mở lại đợt) thì bỏ chữ đã nhớ.
  const bo = React.useMemo(() => taoBoLayDanhSach(galleryId), [galleryId, soAnh, dotChon]);

  React.useEffect(() => {
    let alive = true;
    setDangTai(true);
    setLoi(null);
    void bo.lay(dinhDang, dot).then((kq) => {
      if (!alive) return;
      if (kq.ok) setChu(kq.chu);
      else setLoi(kq.loi);
      setDangTai(false);
    });
    return () => {
      alive = false;
    };
  }, [bo, dinhDang, dot]);

  // Mở đúng đợt từ chỗ khác: liên kết `#xuat-danh-sach-dot-2` (từ trang khác) hoặc sự kiện cùng trang.
  React.useEffect(() => {
    const cuonToi = () => document.getElementById(MA_KHOI_DANH_SACH)?.scrollIntoView({ behavior: "smooth", block: "start" });
    const theoHash = () => {
      const dotHash = docDotTuHash(window.location.hash);
      if (dotHash === null) return;
      setChonTay(dotHash);
      cuonToi();
    };
    theoHash(); // mở trang bằng địa chỉ có #xuat-danh-sach-dot-N
    const khiMo = (e: Event) => {
      setChonTay((e as CustomEvent<LuaChonDot>).detail);
      cuonToi();
    };
    window.addEventListener(SU_KIEN_MO_DOT, khiMo);
    window.addEventListener("hashchange", theoHash); // đổi # ngay trên trang (liên kết trong trang)
    return () => {
      window.removeEventListener(SU_KIEN_MO_DOT, khiMo);
      window.removeEventListener("hashchange", theoHash);
    };
  }, []);

  React.useEffect(() => {
    if (!daChep) return;
    const t = window.setTimeout(() => setDaChep(null), 2500);
    return () => window.clearTimeout(t);
  }, [daChep]);

  const chipDangXem = typeof chon === "number" ? chip.find((c) => c.soDot === chon) : undefined;
  const soAnhDangXem = chipDangXem ? chipDangXem.soAnh : soAnh;

  async function chep(loai: DinhDangDanhSach) {
    setLoiChep(null);
    const kq = await chepDanhSach(bo, navigator.clipboard, loai, dot, soAnhDangXem);
    if (kq.ok) setDaChep({ loai, thongBao: kq.thongBao });
    else setLoiChep(kq.loi);
  }

  const nutDinhDang = (gt: DinhDangDanhSach, nhan: string) => (
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

  const nutChip = (gt: LuaChonDot, nhan: string, soLuong: number, cho: boolean) => (
    <button
      key={String(gt)}
      type="button"
      onClick={() => setChonTay(gt)}
      aria-pressed={chon === gt}
      data-testid={`chip-dot-${gt}`}
      className={
        "inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium " +
        (chon === gt
          ? "border-[var(--bb-fg)] bg-[var(--bb-fg)] text-[var(--bb-bg)]"
          : "border-[var(--bb-border)] text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)]")
      }
    >
      {nhan}
      <span className="tabular-nums opacity-70">{soLuong}</span>
      {cho && <span aria-label="đang chờ xác nhận" className="h-1.5 w-1.5 rounded-full bg-[var(--bb-warning)]" />}
    </button>
  );

  const dongDangXem =
    chipDangXem === undefined
      ? chon === "tat-ca"
        ? `Tất cả các đợt · ${soAnh} ảnh`
        : null
      : chipDangXem.laDot1
        ? `Đợt 1 · ảnh trong gói · ${chipDangXem.soAnh} ảnh`
        : `Đợt ${chipDangXem.soDot} · mua thêm${
            NHAN_TRANG_THAI_NGAN[chipDangXem.trangThai ?? ""] ? ` · ${NHAN_TRANG_THAI_NGAN[chipDangXem.trangThai ?? ""]}` : ""
          } · ${chipDangXem.soAnh} ảnh mới`;

  return (
    <div className="mt-3 space-y-2" data-testid="danh-sach-anh-chon">
      {chip.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Chọn đợt" data-testid="chon-dot">
          {chip.map((c) => nutChip(c.soDot, `Đợt ${c.soDot}`, c.soAnh, c.trangThai === "cho_xac_nhan"))}
          {nutChip("tat-ca", "Tất cả", soAnh, false)}
        </div>
      )}
      {dongDangXem && (
        <p className="text-xs font-medium text-[var(--bb-fg)]" data-testid="dong-dot-dang-xem">
          {dongDangXem}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* BB-393 (anh 06/10): "tên file đổi thành danh sách". Giá trị bên trong vẫn "ten-file". */}
        {nutDinhDang("ten-file", "Danh sách")}
        {nutDinhDang("chi-tiet", "Thông tin chi tiết")}
      </div>
      {loi ? (
        <p className="text-xs text-[var(--bb-danger)]">{loi}</p>
      ) : (
        <textarea
          readOnly
          aria-label="Danh sách ảnh khách đã chọn"
          data-testid="khung-danh-sach-anh"
          value={dangTai ? "Đang tải…" : chu}
          rows={Math.min(12, Math.max(4, soAnhDangXem + 1))}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full resize-y rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)] p-2 text-xs tabular-nums leading-relaxed text-[var(--bb-fg)]"
        />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {(
          [
            ["ten-file", "Chép tên tệp", "chep-ten-tep"],
            ["chi-tiet", "Chép bản chi tiết", "chep-ban-chi-tiet"],
          ] as const
        ).map(([loai, nhan, testId]) => (
          <Button
            key={loai}
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => void chep(loai)}
            disabled={!!loi || soAnhDangXem === 0}
            data-testid={testId}
          >
            {daChep?.loai === loai ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {nhan}
          </Button>
        ))}
        {daChep && (
          <span role="status" data-testid="da-chep" className="text-xs text-[var(--bb-fg-muted)]">
            {daChep.thongBao}
          </span>
        )}
      </div>
      {loiChep && <p className="text-xs text-[var(--bb-danger)]">{loiChep}</p>}
      <p className="text-[11px] text-[var(--bb-fg-muted)]">
        Chỉ gồm {soAnhDangXem} ảnh ba mẹ đã chọn
        {chipDangXem && !chipDangXem.laDot1 ? ` ở đợt ${chipDangXem.soDot}` : chipDangXem ? " ở đợt 1" : ""}, xếp theo thứ tự trong
        thư mục.
      </p>
    </div>
  );
}
