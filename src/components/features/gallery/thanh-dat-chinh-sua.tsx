"use client";

/**
 * BB-345 — thanh nhẹ trên màn của người được mời (link "Mời gia đình"):
 * "Gia đình đã thả tim N tấm · Đặt chỉnh sửa".
 *
 * Bấm "Đặt chỉnh sửa" mở một hộp nhỏ: số tấm × giá ảnh thêm của bộ ảnh =
 * tạm tính, ô tên + số điện thoại (CSKH gọi lại đúng người — cùng luật BB-254),
 * rồi gửi POST /api/g/tim-gia-dinh/dat-chinh-sua. Máy chủ lấy danh sách tấm từ
 * tim đã lưu, không tin danh sách gửi lên.
 *
 * Chưa áp migration 0083: nút xám, ghi "đang chuẩn bị" — tim vẫn chạy ở trình
 * duyệt như BB-338.
 */

import { useEffect, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { vi } from "@/i18n";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { useManHinhRong } from "@/components/features/gallery/thanh-chon";
import { tinhTamTinh } from "@/lib/gallery/tim-gia-dinh";

const KHOA_NGUOI_DAT = "bb-nguoi-dat-chinh-sua";

export function ThanhDatChinhSua({
  an = false,
  soTim,
  giaMoiAnh,
  chuaApMigration,
  onMoMua,
}: {
  /**
   * BB-358 (người chấm vòng 8, mục 4 #8) — link gia đình 390: thanh đáy đè nửa nút
   * "Xem ảnh và thả tim" trên bìa. Cùng luật ẩn với thanh của ba mẹ (`ThanhChon`):
   * bìa còn chiếm phần lớn màn hoặc đang cuộn xuống thì ẩn, rút khỏi Tab (`inert`).
   */
  an?: boolean;
  soTim: number;
  giaMoiAnh: number | null | undefined;
  chuaApMigration: boolean | null;
  /**
   * BB-355 — bản vẽ "Màn khách v8" (c): nút túi viền mở màn mua ảnh in/album
   * (`MoiMuaLanHai`) — thay thẻ "Đặt in ảnh này / Mua thêm" từng chen giữa chip và lưới.
   */
  onMoMua?: () => void;
}) {
  const [mo, setMo] = useState(false);
  // Chỉ điện thoại/máy tính bảng: bìa máy tính không cao hết màn nên thanh không đè nút chính.
  const manRong = useManHinhRong(1024);
  const anThanh = an && !manRong;
  const [ten, setTen] = useState("");
  const [sdt, setSdt] = useState("");
  const [ghiChu, setGhiChu] = useState("");
  const [dangGui, setDangGui] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [daNhan, setDaNhan] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KHOA_NGUOI_DAT);
      const v = raw ? (JSON.parse(raw) as { ten?: unknown; sdt?: unknown }) : null;
      if (typeof v?.ten === "string") setTen(v.ten);
      if (typeof v?.sdt === "string") setSdt(v.sdt);
    } catch {
      // không nhớ được thì gia đình gõ lại
    }
  }, []);

  // BB-355 — thanh LUÔN hiện với người được mời: chưa thả tim thì "0 tấm · Chạm tim
  // tấm gia đình thích ạ" và nút đen mờ 45% (bản vẽ C-luoi-dien-thoai).
  const dangChuanBi = chuaApMigration !== false;
  const { donGia, tamTinh } = tinhTamTinh(soTim, giaMoiAnh);

  async function gui() {
    setLoi(null);
    if (!ten.trim()) return setLoi("Gia đình cho Bean xin tên ạ.");
    if (!/^0[0-9]{9}$/.test(sdt.trim())) return setLoi("Số điện thoại gồm 10 số, bắt đầu bằng 0 ạ.");
    setDangGui(true);
    try {
      const res = await fetch("/api/g/tim-gia-dinh/dat-chinh-sua", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenNguoiMua: ten.trim(), sdtNguoiMua: sdt.trim(), ghiChu: ghiChu.trim() || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Bean chưa nhận được yêu cầu, gia đình thử lại giúp Bean ạ.");
        return;
      }
      try {
        window.localStorage.setItem(KHOA_NGUOI_DAT, JSON.stringify({ ten: ten.trim(), sdt: sdt.trim() }));
      } catch {
        // bỏ qua
      }
      setDaNhan(json?.data?.cau ?? `Bean đã nhận yêu cầu chỉnh sửa ${soTim} tấm của gia đình ạ!`);
      setMo(false);
    } catch {
      setLoi("Mất kết nối, gia đình thử lại giúp Bean ạ.");
    } finally {
      setDangGui(false);
    }
  }

  return (
    <>
      {/* Chừa chỗ cuối trang để thanh cố định không che hàng ảnh cuối. */}
      <div aria-hidden="true" className="h-20" />
      <div
        data-testid="thanh-dat-chinh-sua"
        aria-hidden={anThanh || undefined}
        inert={anThanh}
        className={`pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[max(16px,env(safe-area-inset-bottom))] transition-all duration-300 ease-out ${
          anThanh ? "translate-y-[calc(100%+env(safe-area-inset-bottom)+16px)] opacity-0" : "translate-y-0 opacity-100"
        }`}
      >
        <div className="pointer-events-auto mx-auto flex h-16 w-full max-w-xl items-center gap-2 rounded-full border border-[#e5dcd2] bg-[#fdfbf9]/92 pl-[22px] pr-2 text-[#2e2a27] shadow-[0_6px_24px_-8px_rgba(46,42,39,0.25)] backdrop-blur-md">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]" role="status" data-testid="dem-tim-gia-dinh">
            <span className="whitespace-nowrap text-[22px] font-medium leading-none tabular-nums">
              {soTim} <span className="text-[15px] font-normal">tấm</span>
            </span>
            <span className="line-clamp-2 text-[12px] leading-[1.2] text-[#6b6057] sm:text-[13px]">
              {daNhan && soTim === 0
                ? daNhan
                : soTim > 0
                  ? "gia đình thích"
                  : vi.gallery.loiBean.nguoiThanChuaThaTim}
            </span>
          </div>
          {onMoMua && (
            <button
              type="button"
              data-testid="nut-mua-in-nguoi-xem"
              onClick={onMoMua}
              aria-label="Mua ảnh in, album in ảnh"
              title="Mua ảnh in, album in ảnh"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[#e5dcd2] bg-white text-[#2e2a27] transition hover:bg-[#2e2a27]/5"
            >
              <ShoppingBag className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            data-testid="nut-dat-chinh-sua"
            disabled={dangChuanBi || soTim <= 0}
            aria-label={dangChuanBi ? "Đặt chỉnh sửa — đang chuẩn bị" : "Đặt chỉnh sửa"}
            onClick={() => {
              setDaNhan(null);
              setLoi(null);
              setMo(true);
            }}
            className="flex h-12 shrink-0 flex-col items-center justify-center whitespace-nowrap rounded-full bg-[#2e2a27] px-4 text-[14px] sm:px-5 font-medium leading-tight text-[#fdfbf9] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Đặt chỉnh sửa
            {dangChuanBi && soTim > 0 && <span className="text-[10.5px] font-normal">đang chuẩn bị</span>}
          </button>
        </div>
      </div>

      {daNhan && soTim > 0 && !mo && (
        <p
          role="status"
          data-testid="cau-da-nhan-chinh-sua"
          className="fixed inset-x-0 bottom-[84px] z-30 mx-auto w-fit max-w-[92vw] rounded-full bg-[#2e2a27] px-4 py-2 text-center text-[13px] text-[#fdfbf9] shadow"
        >
          {daNhan}
        </p>
      )}

      {mo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="tieu-de-dat-chinh-sua"
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 sm:items-center"
        >
          <div className="w-full max-w-[440px] rounded-t-2xl bg-[#fdfbf9] p-5 text-[#2e2a27] sm:rounded-2xl">
            <h2 id="tieu-de-dat-chinh-sua" className="text-[16px] font-medium">
              Đặt chỉnh sửa {soTim} tấm gia đình thích
            </h2>
            <p className="mt-1 text-[13px] text-[#6b625b]" data-testid="tam-tinh-chinh-sua">
              {donGia > 0
                ? `Tạm tính ${soTim} × ${formatCurrencyVND(donGia)} = ${formatCurrencyVND(tamTinh)}. Bean gọi lại để chốt và hướng dẫn thanh toán ạ.`
                : "Bean sẽ gọi lại báo giá và hướng dẫn thanh toán ạ."}
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-[13px]">
                Tên người đặt
                <input
                  name="tenNguoiDat"
                  value={ten}
                  onChange={(e) => setTen(e.target.value)}
                  maxLength={100}
                  autoComplete="name"
                  className="mt-1 w-full rounded-lg border border-[#e5dcd2] bg-white px-3 py-2 text-[14px]"
                  placeholder="Ví dụ: Bà nội bé Na"
                />
              </label>
              <label className="block text-[13px]">
                Số điện thoại
                <input
                  name="sdtNguoiDat"
                  value={sdt}
                  onChange={(e) => setSdt(e.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="tel"
                  maxLength={10}
                  autoComplete="tel"
                  className="mt-1 w-full rounded-lg border border-[#e5dcd2] bg-white px-3 py-2 text-[14px]"
                  placeholder="0901000001"
                />
              </label>
              <label className="block text-[13px]">
                Ghi chú cho Bean (không bắt buộc)
                <textarea
                  name="ghiChuChinhSua"
                  value={ghiChu}
                  onChange={(e) => setGhiChu(e.target.value)}
                  maxLength={300}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-[#e5dcd2] bg-white px-3 py-2 text-[14px]"
                />
              </label>
            </div>
            {loi && (
              <p role="alert" className="mt-3 text-[13px] text-[#b4412f]">
                {loi}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setMo(false)}
                disabled={dangGui}
                className="flex-1 rounded-full border border-[#2e2a27] px-4 py-2.5 text-[14px]"
              >
                Để sau
              </button>
              <button
                type="button"
                data-testid="nut-gui-dat-chinh-sua"
                onClick={() => void gui()}
                disabled={dangGui}
                className="flex-1 rounded-full bg-[#2e2a27] px-4 py-2.5 text-[14px] font-medium text-[#fdfbf9] disabled:opacity-50"
              >
                {dangGui ? "Đang gửi…" : "Gửi yêu cầu"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
