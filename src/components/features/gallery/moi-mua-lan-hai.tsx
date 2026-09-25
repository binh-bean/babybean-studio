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
 * Font-display Fraunces, nền kem, nút viên tròn màu mực — đồng bộ với
 * `review-panel.tsx` và `cua-hang.tsx`.
 */

import React from "react";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { THU_TU_NHOM, TEN_NHOM, type NhomSanPham } from "@/lib/products/nhom-san-pham";
import { duocMoiMuaLanHai } from "@/lib/gallery/moi-mua-lan-hai-rules";

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
}: {
  status: string;
  /** `review.rounds.length` — khác 0 thì KHÔNG mời mua lần hai. */
  soVongSua: number;
  danhMuc: MonTrongDanhMuc[];
  anhDaChon: AnhChonDuoc[];
}) {
  const [mo, setMo] = React.useState(false);
  const [gio, setGio] = React.useState<DongGioHang[]>([]);
  const [nhomDangXem, setNhomDangXem] = React.useState<NhomSanPham>("anh_in");
  const [monDangChon, setMonDangChon] = React.useState<MonTrongDanhMuc | null>(null);
  const [dangGui, setDangGui] = React.useState(false);
  const [loi, setLoi] = React.useState<string | null>(null);
  // BB-249 — mỗi dòng "đã gửi" mang trạng thái riêng (moi/da_lien_he/da_chot/
  // huy) để hiện thông điệp thân thiện đúng tiến độ, không phải một câu
  // chung chung cho mọi yêu cầu.
  const [dsDaGui, setDsDaGui] = React.useState<{ id: string; trangThai: string }[]>([]);
  const [anhLoi, setAnhLoi] = React.useState(false);
  const daGui = dsDaGui.length > 0;

  const duocMoiMua = duocMoiMuaLanHai(status, soVongSua);

  // Bộ ảnh đã có ai gửi yêu cầu chưa (kể cả trước khi mở lại trang) — chỉ hỏi
  // MỘT LẦN lúc thẻ có cơ hội hiện, không hỏi khi chắc chắn không cần.
  React.useEffect(() => {
    if (!duocMoiMua) return;
    let huy = false;
    void (async () => {
      try {
        const res = await fetch("/api/g/mua-them", { cache: "no-store" });
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

  if (!duocMoiMua) return null;

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
    setDangGui(true);
    setLoi(null);
    try {
      const res = await fetch("/api/g/mua-them", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: gio.map((d) => ({ productId: d.productId, photoId: d.photoId, soLuong: d.soLuong })),
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string };
        data?: { items?: { id: string; trangThai: string }[] };
      } | null;
      if (!res.ok) {
        setLoi(json?.error?.message ?? "Gửi không thành công, ba mẹ thử lại giúp em nhé");
        return;
      }
      const moi = json?.data?.items ?? [];
      setDsDaGui((cu) => [...cu, ...moi.map((d) => ({ id: d.id, trangThai: d.trangThai }))]);
      setMo(false);
      setGio([]);
    } catch {
      setLoi("Không kết nối được, ba mẹ thử lại giúp em nhé");
    } finally {
      setDangGui(false);
    }
  }

  // BB-249 — trạng thái thân thiện theo tiến độ CSKH xử lý. KHÔNG có nhánh
  // nào đọc ghi chú CSKH (metadata nhật ký nội bộ) — route /api/g/mua-them
  // không trả trường đó nên không có gì để lộ ra đây.
  const NHAN_THAN_THIEN: Record<string, string> = {
    moi: "Đã gửi, studio sẽ gọi sớm",
    da_lien_he: "Studio đã liên hệ",
    da_chot: "Đã chốt đơn",
    huy: "Đã huỷ",
  };

  if (daGui) {
    return (
      <div className="space-y-2 rounded-2xl border border-border bg-surface p-5">
        <p className="font-display text-lg font-light leading-tight">Yêu cầu mua thêm</p>
        <ul className="space-y-1.5">
          {dsDaGui.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                {NHAN_THAN_THIEN[d.trangThai] ?? "Đã gửi, studio sẽ gọi sớm"}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          CSKH sẽ liên hệ để báo giá và thanh toán, ba mẹ chưa cần làm gì thêm ạ.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-5">
        <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-border bg-surface-2">
          {!anhLoi && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/san-pham/moi-mua-qua-tang-320.webp"
              alt=""
              className="h-full w-full object-cover"
              onError={() => setAnhLoi(true)}
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-light leading-tight">
            Ba mẹ đã ưng bộ ảnh — in tấm yêu thích lên khung nhé?
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Khung, ảnh in, album — studio gọi lại báo giá, chưa tính tiền.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMo(true)}
          className="h-10 shrink-0 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          Xem thêm
        </button>
      </div>

      {mo && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-8">
            <div>
              <h2 className="font-display text-2xl font-light leading-tight">Mua thêm sau khi duyệt</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Chọn sản phẩm, studio sẽ gọi xác nhận. Chưa tính tiền lúc này.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMo(false)}
              className="h-9 shrink-0 rounded-full border border-border px-4 text-xs font-medium transition hover:bg-surface-2"
            >
              Đóng
            </button>
          </header>

          <nav className="flex gap-2 overflow-x-auto border-b border-border px-5 py-3 sm:px-8">
            {THU_TU_NHOM.map((nhom) => (
              <button
                key={nhom}
                type="button"
                onClick={() => {
                  setNhomDangXem(nhom);
                  setMonDangChon(null);
                }}
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

          <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-8">
            {theoNhom.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nhóm này chưa có sản phẩm nào đang bán. Ba mẹ nhắn CSKH giúp em nhé.
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {theoNhom.map((m) => {
                  const so = soLuongDat(m.productId, null);
                  return (
                    <li key={m.productId} className="rounded-2xl border border-border bg-surface p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{m.name}</p>
                          <p className="mt-1 text-sm font-semibold">{formatCurrencyVND(m.unitPrice)}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[m.size, m.material].filter(Boolean).join(" · ")} · giá tham khảo
                          </p>
                          {gio.some((d) => d.productId === m.productId) && (
                            <p className="mt-1.5 text-xs font-medium text-moss">
                              Đang chọn{" "}
                              {gio
                                .filter((d) => d.productId === m.productId)
                                .reduce((n, d) => n + d.soLuong, 0)}
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={dangGui}
                          onClick={() =>
                            m.canGanAnh
                              ? setMonDangChon(monDangChon?.productId === m.productId ? null : m)
                              : datSoLuong(m.productId, so + 1, null)
                          }
                          className="h-9 shrink-0 rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
                        >
                          {m.canGanAnh ? "Chọn ảnh" : "Chọn"}
                        </button>
                      </div>

                      {monDangChon?.productId === m.productId && (
                        <div className="mt-3 border-t border-border pt-3">
                          {anhDaChon.length === 0 ? (
                            <p className="text-xs text-muted-foreground">
                              Bộ ảnh chưa có tấm nào để chọn.
                            </p>
                          ) : (
                            <>
                              <p className="mb-2 text-xs text-muted-foreground">
                                Chọn tấm cần in {m.name}:
                              </p>
                              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                                {anhDaChon.map((a) => {
                                  const dangCo = soLuongDat(m.productId, a.id);
                                  return (
                                    <button
                                      key={a.id}
                                      type="button"
                                      disabled={dangGui}
                                      onClick={() => datSoLuong(m.productId, dangCo + 1, a.id)}
                                      className={[
                                        "relative overflow-hidden rounded-xl border-2 transition-colors",
                                        dangCo > 0 ? "border-moss" : "border-transparent",
                                      ].join(" ")}
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={`/api/img/${a.id}?w=200`}
                                        alt={a.fileName}
                                        className="aspect-square w-full object-cover"
                                      />
                                      {dangCo > 0 && (
                                        <span className="absolute right-1 top-1 rounded-full bg-moss px-1.5 text-[11px] font-bold text-white">
                                          {dangCo}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <footer className="border-t border-border bg-surface px-5 py-4 sm:px-8">
            {loi && <p className="mb-2 text-xs text-heart">{loi}</p>}
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Giá tham khảo</p>
                <p className="font-display text-xl font-medium">{formatCurrencyVND(tongTienThamKhao)}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  CSKH sẽ gọi xác nhận, chưa tính tiền
                </p>
              </div>
              <button
                type="button"
                disabled={gio.length === 0 || dangGui}
                onClick={() => void guiYeuCau()}
                className="h-11 shrink-0 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
              >
                {dangGui ? "Đang gửi…" : "Gửi yêu cầu cho studio"}
              </button>
            </div>
          </footer>
        </div>
      )}
    </>
  );
}
