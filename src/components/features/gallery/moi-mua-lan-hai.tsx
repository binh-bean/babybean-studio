"use client";

/**
 * Mời mua lần hai — thẻ mời khi ba mẹ đã DUYỆT ảnh chỉnh mà không yêu cầu sửa.
 *
 * OWNER: DEV-FE. Task BB-245. Chủ studio chốt:
 *
 *     "Mời mua lần hai khi khách duyệt không yêu cầu chỉnh lại."
 *
 * ---------------------------------------------------------------------------
 * Vì sao KHÔNG dùng `<CuaHang />` thẳng
 * ---------------------------------------------------------------------------
 * Bộ ảnh lúc này đã KHOÁ (status `approved`/`delivered`) — đúng luật, không
 * được nới. `<CuaHang />` gọi `/api/g/addons`, route đó ĐÚNG khi từ chối ghi
 * lúc khoá. Màn này gọi `/api/g/mua-them` — ghi vào bảng RIÊNG
 * (`yeu_cau_mua_them`), KHÔNG cộng vào hợp đồng. Ba mẹ chỉ gửi YÊU CẦU, CSKH
 * gọi lại chốt giá và thanh toán ngoài app.
 *
 * Giao diện chọn sản phẩm / chọn tấm ảnh TÁI DÙNG hết mức cấu trúc của
 * `cua-hang.tsx` (ba nhóm sản phẩm, lưới ảnh đã chọn) — chỉ khác nút cuối và
 * đường ghi.
 *
 * ---------------------------------------------------------------------------
 * Chỉ mở đúng cửa sổ — kiểm CẢ HAI đầu
 * ---------------------------------------------------------------------------
 * Thẻ chỉ hiện khi `status` là `approved`/`delivered` VÀ `review.rounds.length
 * === 0`. Route `/api/g/mua-them` tự kiểm lại y hệt điều kiện này (không tin
 * giao diện) — xem `src/app/api/g/mua-them/route.ts`.
 *
 * ---------------------------------------------------------------------------
 * BB-212 — cùng ngôn ngữ "cuốn album kỷ niệm"
 * ---------------------------------------------------------------------------
 * Font-display (Playfair Display từ BB-305, trước là Fraunces), nền kem, nút
 * viên tròn màu mực — đồng bộ với `review-panel.tsx` và `cua-hang.tsx`.
 *
 * ---------------------------------------------------------------------------
 * BB-248 — tranh minh hoạ thay cho khối trống
 * ---------------------------------------------------------------------------
 * Tranh `/san-pham/moi-mua-qua-tang-*.webp` giờ có thật (chủ studio vừa vẽ,
 * xem `src/lib/products/tranh-san-pham.ts`), nên bỏ cơ chế dự phòng `anhLoi`/
 * `onError` từng ẩn khối ảnh khi tệp chưa tồn tại — mã đó thành mã chết một
 * khi tệp đã có sẵn. Thẻ ảnh nay luôn hiện, dùng `srcSet` 320w/640w. Các dòng
 * sản phẩm trong màn chọn dùng `tranhCuaSanPham()` như `cua-hang.tsx`.
 *
 * ---------------------------------------------------------------------------
 * BB-254 — TÁI DÙNG cho ông bà/người thân (link vai 'viewer')
 * ---------------------------------------------------------------------------
 * Chủ studio chốt: ông bà XEM và MUA — gửi yêu cầu mua thêm y hệt cơ chế này,
 * nhưng KHÔNG theo luật "đã duyệt, không vòng sửa" của ba mẹ (họ có thể gửi
 * bất cứ lúc nào bộ ảnh còn mở cho khách xem). Hai prop tuỳ chọn bật chế độ
 * này mà KHÔNG tách file thứ hai (tránh trôi hai bản UI chọn sản phẩm):
 *
 *   - `moGate`: có mặt thì THAY cho `duocMoiMuaLanHai(status, soVongSua)` —
 *     `gallery-app.tsx` truyền `dangMoChoKhachXem(status)` cho viewer.
 *   - `batBuocNguoiMua`: bật ô nhập tên + SĐT bắt buộc trước khi gửi — route
 *     `/api/g/mua-them` đòi hai trường này khi phiên là viewer, xem đó mới là
 *     chỗ chặn thật; ở đây chỉ để form không cho bấm gửi lúc thiếu.
 *
 * ---------------------------------------------------------------------------
 * BB-338 — anh báo 01/10/2026 (ảnh "dàn trải", "không thoát được")
 * ---------------------------------------------------------------------------
 *   - Danh sách sản phẩm: MỘT cột gọn trong khung giữa màn (max 640px), mỗi
 *     sản phẩm một dòng — thay lưới hai cột kéo tràn hết bề ngang máy tính.
 *   - Chọn tấm cho một sản phẩm: mở TẤM CHỌN riêng (không bung giữa danh sách),
 *     bấm ảnh để chọn/bỏ chọn, có "Huỷ" (trả lại như lúc mở) và "Xong".
 *   - Nút back của điện thoại đóng tấm chọn rồi tới màn mua thêm
 *     (`useNutBackDong`), không văng khỏi bộ ảnh.
 *   - `anhThich`: những tấm người xem đã thả tim trên lưới — hiện trước.
 */

import { vi } from "@/i18n";
import React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { THU_TU_NHOM, TEN_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";
import { duocMoiMuaLanHai } from "@/lib/gallery/moi-mua-lan-hai-rules";
import { tranhCuaSanPham } from "@/lib/products/tranh-san-pham";
import { formatKichThuoc, tenSanPhamChoKhach } from "@/lib/utils/dinh-dang";
import { useNutBackDong } from "./use-nut-back-dong";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";

export interface MonTrongDanhMuc {
  productId: string;
  name: string;
  material: string | null;
  size: string | null;
  unitPrice: number;
  nhom: NhomSanPham;
  canGanAnh: boolean;
}

export interface AnhChonDuoc {
  id: string;
  fileName: string;
}

/** Một dòng trong giỏ CHỜ GỬI — chưa ghi gì cả cho tới lúc bấm gửi. */
interface DongGioHang {
  productId: string;
  photoId: string | null;
  soLuong: number;
}

const khoaDong = (productId: string, photoId: string | null) => `${productId}::${photoId ?? ""}`;

export function MoiMuaLanHai({
  status,
  soVongSua,
  danhMuc,
  anhDaChon,
  moGate,
  batBuocNguoiMua = false,
  tieuDe,
  moTa,
  anhThich,
  moNgoai,
  onDoiMo,
}: {
  status: string;
  /** `review.rounds.length` — khác 0 thì KHÔNG mời mua lần hai (bỏ qua khi có `moGate`). */
  soVongSua: number;
  danhMuc: MonTrongDanhMuc[];
  anhDaChon: AnhChonDuoc[];
  /** BB-254 — có mặt thì thay cho `duocMoiMuaLanHai`. Dùng cho viewer (ông bà). */
  moGate?: boolean;
  /** BB-254 — bắt tên + SĐT người gửi trước khi cho bấm "Gửi yêu cầu". */
  batBuocNguoiMua?: boolean;
  tieuDe?: string;
  moTa?: string;
  /** BB-338 — id các tấm người xem đã thả tim trên lưới (hiện trước trong tấm chọn). */
  anhThich?: string[];
  /**
   * BB-355 — bản vẽ "Màn khách v8" (c): người được mời mở màn mua từ nút túi ở
   * thanh đáy, KHÔNG còn thẻ mời mua chen giữa chip và lưới. Có `moNgoai` thì
   * component không vẽ thẻ mời (chỉ còn màn mua, và thẻ "đã gửi" nếu có), việc
   * mở/đóng do nơi gọi giữ.
   */
  moNgoai?: boolean;
  onDoiMo?: (mo: boolean) => void;
}) {
  const [moNoi, setMoNoi] = React.useState(false);
  const chiMan = moNgoai !== undefined;
  const mo = chiMan ? moNgoai : moNoi;
  const setMo = (v: boolean) => (chiMan ? onDoiMo?.(v) : setMoNoi(v));
  const [gio, setGio] = React.useState<DongGioHang[]>([]);
  const [nhomDangXem, setNhomDangXem] = React.useState<NhomSanPham>("anh_in");
  const [monDangChon, setMonDangChon] = React.useState<MonTrongDanhMuc | null>(null);
  // BB-338 — giỏ lúc MỞ tấm chọn, để "Huỷ" trả lại đúng như cũ.
  const [gioLucMoChon, setGioLucMoChon] = React.useState<DongGioHang[] | null>(null);
  const [chiAnhThich, setChiAnhThich] = React.useState(true);
  const [dangGui, setDangGui] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [tenNguoiMua, setTenNguoiMua] = React.useState("");
  const [sdtNguoiMua, setSdtNguoiMua] = React.useState("");
  // BB-249 — mỗi dòng "đã gửi" mang trạng thái riêng (moi/da_lien_he/da_chot/
  // huy) để hiện thông điệp thân thiện đúng tiến độ, không phải một câu
  // chung chung cho mọi yêu cầu.
  const [dsDaGui, setDsDaGui] = React.useState<{ id: string; trangThai: string }[]>([]);
  const daGui = dsDaGui.length > 0;

  const duocMoiMua = moGate ?? duocMoiMuaLanHai(status, soVongSua);
  const SDT_VN_RE = /^0[0-9]{9}$/;
  const thieuThongTinNguoiMua =
    batBuocNguoiMua && (tenNguoiMua.trim().length === 0 || !SDT_VN_RE.test(sdtNguoiMua.trim()));

  // Bộ ảnh đã có ai gửi yêu cầu chưa (kể cả trước khi mở lại trang) — chỉ hỏi
  // MỘT LẦN lúc thẻ có cơ hội hiện, không hỏi khi chắc chắn không cần.
  React.useEffect(() => {
    if (!duocMoiMua) return;
    let huy = false;
    void (async () => {
      try {
        const res = await goiApiKhach("/api/g/mua-them", { cache: "no-store" });
        if (!res.ok || huy) return;
        const json = (await res.json().catch(() => null)) as {
          data?: { items?: { id: string; trangThai: string }[] };
        } | null;
        const ds = json?.data?.items ?? [];
        if (!huy && ds.length > 0) setDsDaGui(ds.map((d) => ({ id: d.id, trangThai: d.trangThai })));
      } catch {
        // Không tải được thì cứ để thẻ mời hiện bình thường — không chặn gì cả.
      }
    })();
    return () => {
      huy = true;
    };
  }, [duocMoiMua]);

  // BB-338 mục 2e — back của điện thoại đóng từng lớp: tấm chọn → màn mua thêm.
  const dongMuaThem = useNutBackDong(mo, () => {
    setMo(false);
    setMonDangChon(null);
  });
  const dongTamChon = useNutBackDong(monDangChon !== null, () => {
    setMonDangChon(null);
    setGioLucMoChon(null);
  });

  if (!duocMoiMua) return null;

  const dsThich = new Set(anhThich ?? []);
  const anhCoTim = anhDaChon.filter((a) => dsThich.has(a.id));

  const theoNhom = danhMuc.filter((m) => m.nhom === nhomDangXem);
  const soLuongDat = (productId: string, photoId: string | null) =>
    gio.find((d) => d.productId === productId && d.photoId === photoId)?.soLuong ?? 0;

  function datSoLuong(productId: string, soLuong: number, photoId: string | null) {
    setGio((cu) => {
      const con = cu.filter((d) => khoaDong(d.productId, d.photoId) !== khoaDong(productId, photoId));
      return soLuong > 0 ? [...con, { productId, photoId, soLuong }] : con;
    });
  }

  const tongTienThamKhao = gio.reduce((t, d) => {
    const gia = danhMuc.find((m) => m.productId === d.productId)?.unitPrice ?? 0;
    return t + gia * d.soLuong;
  }, 0);

  async function guiYeuCau() {
    if (gio.length === 0) return;
    if (thieuThongTinNguoiMua) {
      setLoi(vi.gallery.loiBean.xinTenSdt);
      return;
    }
    setDangGui(true);
    setLoi(null);
    try {
      const res = await goiApiKhach("/api/g/mua-them", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: gio.map((d) => ({ productId: d.productId, photoId: d.photoId, soLuong: d.soLuong })),
          ...(batBuocNguoiMua
            ? { tenNguoiMua: tenNguoiMua.trim(), sdtNguoiMua: sdtNguoiMua.trim() }
            : {}),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { items?: { id: string; trangThai: string }[] };
      } | null;
      if (!res.ok) {
        setLoi(json?.error?.message ?? vi.gallery.loiBean.guiChuaDuoc);
        return;
      }
      const moi = json?.data?.items ?? [];
      setDsDaGui((cu) => [...cu, ...moi.map((d) => ({ id: d.id, trangThai: d.trangThai }))]);
      dongMuaThem();
      setGio([]);
    } catch {
      setLoi(vi.gallery.loiBean.khongKetNoi);
    } finally {
      setDangGui(false);
    }
  }

  // BB-249 — trạng thái thân thiện theo tiến độ CSKH xử lý. KHÔNG có nhánh
  // nào đọc ghi chú CSKH (metadata nhật ký nội bộ) — route /api/g/mua-them
  // không trả trường đó nên không có gì để lộ ra đây.
  const NHAN_THAN_THIEN: Record<string, string> = {
    moi: vi.gallery.loiBean.daGuiSeGoi,
    da_lien_he: vi.gallery.loiBean.daLienHe,
    da_chot: "Đã chốt đơn",
    huy: "Đã huỷ",
  };

  const theDaGui = daGui ? (
      <div data-testid="the-yeu-cau-mua-them" className="space-y-2 rounded-2xl border border-border bg-surface p-5">
        <p className="kh-h3">Yêu cầu mua thêm</p>
        <ul className="space-y-1.5">
          {dsDaGui.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                {NHAN_THAN_THIEN[d.trangThai] ?? vi.gallery.loiBean.daGuiSeGoi}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          {vi.gallery.loiBean.seGoiBaoGia}
        </p>
      </div>
  ) : null;
  if (daGui && !chiMan) return theDaGui;

  return (
    <>
      {chiMan ? theDaGui : (
      <>
      {/*
        BB-295 mục cũ #27 — báo cáo chấm độc lập: hàng ngang cố định
        (`flex-row`) ép cột chữ xuống còn ~220px trên điện thoại 390px — tiêu
        đề + mô tả gãy tới 4 dòng chồng lên ảnh. Xếp DỌC dưới `sm` (ảnh nhỏ
        trên, chữ full-width dưới) thì text-wrap tự nhiên còn 1–2 dòng; từ
        `sm` giữ nguyên hàng ngang như trước.
      */}
      <div className="flex flex-col items-start gap-4 rounded-[24px] bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:flex-row sm:items-start sm:gap-6">
        <div className="relative h-20 w-20 shrink-0 sm:h-[120px] sm:w-[120px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/san-pham/moi-mua-qua-tang-320.webp"
            srcSet="/san-pham/moi-mua-qua-tang-320.webp 320w, /san-pham/moi-mua-qua-tang-640.webp 640w"
            sizes="(max-width: 640px) 100px, 120px"
            alt=""
            loading="lazy"
            width={120}
            height={120}
            className="h-full w-full object-contain"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col items-start justify-center text-left">
          <p className="kh-h3 text-[#2E2A27]">
            {tieuDe ?? vi.gallery.loiBean.moiMuaTieuDe}
          </p>
          <p className="mt-1.5 text-[13px] text-[#2E2A27]/60">
            {moTa ?? vi.gallery.loiBean.muaHoMoTa}
          </p>
          {anhCoTim.length > 0 && (
            <p data-testid="so-anh-tha-tim" className="mt-1 text-[13px] font-medium text-heart">
              Gia đình đã thả tim {anhCoTim.length} tấm
            </p>
          )}
          <button
            type="button"
            onClick={() => setMo(true)}
            className="mt-4 flex h-[44px] items-center justify-center rounded-full bg-[#2E2A27] px-6 text-[14px] font-medium text-white transition hover:bg-[#2E2A27]/90 active:scale-95"
          >
            Xem thêm
          </button>
        </div>
      </div>
      </>
      )}

      {mo && (
        <div data-testid="man-mua-them-sau-duyet" className="fixed inset-0 z-50 flex flex-col bg-background">
          <header className="border-b border-border">
            <div className="mx-auto flex w-full max-w-2xl items-start justify-between gap-3 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="kh-h2">{tieuDe ?? "Mua thêm sau khi duyệt"}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {moTa ?? vi.gallery.loiBean.muaThemMoTa}
                </p>
              </div>
              <button
                type="button"
                onClick={dongMuaThem}
                className="h-9 shrink-0 rounded-full border border-border px-4 text-xs font-medium transition hover:bg-surface-2"
              >
                Đóng
              </button>
            </div>
            <nav className="mx-auto flex w-full max-w-2xl gap-2 overflow-x-auto px-4 pb-3 sm:px-6">
              {THU_TU_NHOM.map((nhom) => (
                <button
                  key={nhom}
                  type="button"
                  onClick={() => setNhomDangXem(nhom)}
                  className={[
                    "shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-colors",
                    nhom === nhomDangXem
                      ? "bg-primary text-primary-foreground"
                      : "border border-border text-muted-foreground hover:bg-surface-2",
                  ].join(" ")}
                >
                  {TEN_NHOM[nhom]}
                </button>
              ))}
            </nav>
          </header>

          <div className="flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6">
              {/* Tranh minh hoạ của nhóm đang xem (BB-248), cạnh tiêu đề nhóm. */}
              <div className="mb-3 flex items-center gap-3">
                <TranhNho ten={tranhCuaSanPham(nhomDangXem, null, "")} kichThuoc={48} />
                <h3 className="kh-h3">{TEN_NHOM[nhomDangXem]}</h3>
              </div>

              {theoNhom.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nhóm này Bean chưa có sản phẩm nào đang bán ạ. Gia đình nhắn Bean giúp nhé ạ.
                </p>
              ) : (
                <ul
                  data-testid="ds-san-pham-mua-them"
                  className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface"
                >
                  {theoNhom.map((m) => {
                    const so = soLuongDat(m.productId, null);
                    const soTam = gio
                      .filter((d) => d.productId === m.productId && d.photoId !== null)
                      .reduce((n, d) => n + d.soLuong, 0);
                    const moTaPhu = [m.size ? formatKichThuoc(m.size) : null, m.material].filter(Boolean).join(" · ");
                    return (
                      <li key={m.productId} data-testid="dong-san-pham-mua-them" className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{tenSanPhamChoKhach(m)}</p>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground tabular-nums">{formatCurrencyVND(m.unitPrice)}</span>
                            {moTaPhu ? ` · ${moTaPhu}` : ""}
                          </p>
                          {m.canGanAnh && soTam > 0 && (
                            <p className="mt-1 text-xs font-medium text-moss">Đã chọn {soTam} tấm</p>
                          )}
                        </div>

                        {m.canGanAnh ? (
                          <button
                            type="button"
                            disabled={dangGui}
                            onClick={() => {
                              setGioLucMoChon(gio);
                              setChiAnhThich(anhCoTim.length > 0);
                              setMonDangChon(m);
                            }}
                            className={[
                              "h-8 shrink-0 rounded-full px-3.5 text-xs font-medium transition disabled:opacity-40",
                              soTam > 0
                                ? "border border-border hover:bg-surface-2"
                                : "bg-primary text-primary-foreground hover:opacity-90",
                            ].join(" ")}
                          >
                            {soTam > 0 ? "Sửa ảnh" : "Chọn ảnh"}
                          </button>
                        ) : so === 0 ? (
                          <button
                            type="button"
                            disabled={dangGui}
                            onClick={() => datSoLuong(m.productId, 1, null)}
                            className="h-8 shrink-0 rounded-full bg-primary px-3.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                          >
                            Chọn
                          </button>
                        ) : (
                          <div className="flex shrink-0 items-center gap-1.5">
                            <button
                              type="button"
                              aria-label={`Bớt ${tenSanPhamChoKhach(m)}`}
                              disabled={dangGui}
                              onClick={() => datSoLuong(m.productId, so - 1, null)}
                              className="grid h-8 w-8 place-items-center rounded-full border border-border text-sm transition hover:bg-surface-2"
                            >
                              −
                            </button>
                            <span className="w-5 text-center text-sm font-medium tabular-nums">{so}</span>
                            <button
                              type="button"
                              aria-label={`Thêm ${tenSanPhamChoKhach(m)}`}
                              disabled={dangGui}
                              onClick={() => datSoLuong(m.productId, so + 1, null)}
                              className="grid h-8 w-8 place-items-center rounded-full border border-border text-sm transition hover:bg-surface-2"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <footer className="border-t border-border bg-surface">
            <div className="mx-auto w-full max-w-2xl px-4 py-3 sm:px-6">
              {loi && <p className="mb-2 text-xs text-heart">{loi}</p>}

              {/*
                BB-254 — bắt buộc với viewer (ông bà/người thân): CSKH cần gọi
                ĐÚNG người vừa gửi, không phải ba mẹ đứng hợp đồng.
              */}
              {batBuocNguoiMua && (
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    name="tenNguoiMua"
                    value={tenNguoiMua}
                    onChange={(e) => setTenNguoiMua(e.target.value)}
                    maxLength={100}
                    placeholder="Tên người mua"
                    disabled={dangGui}
                    className="h-10 min-w-0 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground"
                  />
                  <input
                    type="tel"
                    name="sdtNguoiMua"
                    value={sdtNguoiMua}
                    onChange={(e) => setSdtNguoiMua(e.target.value)}
                    maxLength={10}
                    placeholder="Số điện thoại (10 số)"
                    disabled={dangGui}
                    className="h-10 min-w-0 rounded-full border border-border bg-background px-4 text-sm outline-none focus:border-foreground"
                  />
                </div>
              )}

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">Giá tham khảo</p>
                  {/* BB-305 — giá tham khảo: bỏ font-display, thêm tabular-nums. */}
                  <p className="text-xl font-medium tabular-nums">{formatCurrencyVND(tongTienThamKhao)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Bean sẽ gọi xác nhận, chưa tính tiền ạ</p>
                </div>
                <button
                  type="button"
                  disabled={gio.length === 0 || dangGui || thieuThongTinNguoiMua}
                  onClick={() => void guiYeuCau()}
                  className="h-11 shrink-0 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                >
                  {dangGui ? "Đang gửi…" : vi.gallery.loiBean.guiYeuCau}
                </button>
              </div>
            </div>
          </footer>
        </div>
      )}

      {/*
        BB-338 — TẤM CHỌN ẢNH cho một sản phẩm: lớp riêng trên màn mua thêm,
        không bung giữa danh sách. Bấm ảnh = chọn/bỏ chọn. "Huỷ" trả giỏ về
        đúng lúc mở; "Xong" giữ lựa chọn. Back của điện thoại = Huỷ.
      */}
      {mo && monDangChon && (
        <div
          data-testid="tam-chon-anh-mua-them"
          role="dialog"
          aria-modal="true"
          aria-label={`Chọn tấm in ${tenSanPhamChoKhach(monDangChon)}`}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-[#2a2420]/55 sm:items-center sm:p-4"
        >
          <div className="flex max-h-[88svh] w-full flex-col overflow-hidden rounded-t-[28px] bg-surface shadow-2xl sm:max-w-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 pb-3 pt-4">
              <div className="min-w-0">
                <p className="kh-h3 truncate">{tenSanPhamChoKhach(monDangChon)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Gia đình bấm vào tấm muốn in, bấm lại để bỏ chọn ạ.
                </p>
              </div>
              <button
                type="button"
                aria-label="Huỷ chọn ảnh"
                onClick={() => {
                  if (gioLucMoChon) setGio(gioLucMoChon);
                  dongTamChon();
                }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-base transition hover:bg-surface-2"
              >
                ×
              </button>
            </div>

            {anhCoTim.length > 0 && (
              <div className="flex gap-2 px-5 pt-3">
                <button
                  type="button"
                  onClick={() => setChiAnhThich(true)}
                  className={[
                    "rounded-full px-3.5 py-1.5 text-xs font-medium",
                    chiAnhThich ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground",
                  ].join(" ")}
                >
                  Tấm đã thả tim ({anhCoTim.length})
                </button>
                <button
                  type="button"
                  onClick={() => setChiAnhThich(false)}
                  className={[
                    "rounded-full px-3.5 py-1.5 text-xs font-medium",
                    !chiAnhThich ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground",
                  ].join(" ")}
                >
                  Tất cả ảnh ({anhDaChon.length})
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-3">
              {anhDaChon.length === 0 ? (
                <p className="text-xs text-muted-foreground">Bộ ảnh chưa có tấm nào để chọn ạ.</p>
              ) : (
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                  {(chiAnhThich && anhCoTim.length > 0 ? anhCoTim : anhDaChon).map((a) => {
                    const dangCo = soLuongDat(monDangChon.productId, a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        data-testid="o-anh-mua-them"
                        aria-pressed={dangCo > 0}
                        aria-label={`${dangCo > 0 ? "Bỏ chọn" : "Chọn"} ${a.fileName}`}
                        onClick={() => datSoLuong(monDangChon.productId, dangCo > 0 ? 0 : 1, a.id)}
                        className={[
                          "relative overflow-hidden rounded-lg border-2 transition-colors",
                          dangCo > 0 ? "border-moss" : "border-transparent",
                        ].join(" ")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/api/img/${a.id}?w=200`}
                          srcSet={`/api/img/${a.id}?w=200 1x, /api/img/${a.id}?w=400 2x`}
                          alt={a.fileName}
                          loading="lazy"
                          className="aspect-square w-full object-cover"
                          // Cùng luật dự phòng với lưới (BB-314): lh3 lỗi thì thử lại MỘT lần qua `?qua=1`.
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (img.dataset.qua === "1") return;
                            img.dataset.qua = "1";
                            img.removeAttribute("srcset");
                            const url = new URL(img.src, window.location.origin);
                            url.searchParams.set("qua", "1");
                            img.src = url.toString();
                          }}
                        />
                        {dangCo > 0 && (
                          <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-moss text-[11px] font-bold text-white">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setGio((cu) => cu.filter((d) => d.productId !== monDangChon.productId))}
                className="h-10 rounded-full px-3 text-xs font-medium text-muted-foreground transition hover:bg-surface-2"
              >
                Bỏ chọn hết
              </button>
              <button
                type="button"
                onClick={dongTamChon}
                className="h-10 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90"
              >
                Xong
                {(() => {
                  const n = gio
                    .filter((d) => d.productId === monDangChon.productId && d.photoId !== null)
                    .reduce((t, d) => t + d.soLuong, 0);
                  return n > 0 ? ` · ${n} tấm` : "";
                })()}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Tranh minh hoạ nhỏ (BB-248) — `srcSet` 320w/640w, `width`/`height` cố định
 * để không xô layout khi chưa tải xong. `alt=""` vì chỉ trang trí. Giống hệt
 * `TranhNho` của `cua-hang.tsx` — không tách file dùng chung để tránh thêm
 * phụ thuộc chéo giữa hai component độc lập.
 */
function TranhNho({ ten, kichThuoc }: { ten: string; kichThuoc: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/san-pham/${ten}-320.webp`}
      srcSet={`/san-pham/${ten}-320.webp 320w, /san-pham/${ten}-640.webp 640w`}
      sizes={`${kichThuoc}px`}
      alt=""
      // BB-329 — tranh nằm TRONG hộp thoại cố định có vùng cuộn riêng: Safari iOS
      // có lúc không kích hoạt tải lười ở đó → ô tranh trắng. Tranh nhỏ, tải ngay.
      loading="eager"
      width={kichThuoc}
      height={kichThuoc}
      className="shrink-0 rounded-xl object-cover"
      style={{ width: kichThuoc, height: kichThuoc }}
    />
  );
}
