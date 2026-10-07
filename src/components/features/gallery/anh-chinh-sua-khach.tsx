/**
 * BB-371 — khối "Ảnh đã chỉnh" trên màn khách: xem + duyệt ảnh chỉnh NGAY TRONG
 * APP (trước đây chỉ có link "Mở thư mục ảnh đã chỉnh" — mở Drive, rời app).
 *
 *   · lưới ảnh chỉnh → chạm mở lớn → "So với ảnh gốc" (thanh trượt trước/sau,
 *     ảnh gốc ghép theo tên tệp ở máy chủ);
 *   · "Duyệt, cho in" / "Yêu cầu sửa" giữ nguyên hai lựa chọn cũ;
 *   · Yêu cầu sửa CHI TIẾT: chọn từng tấm, ghi chú, khoanh vùng trên ảnh, gửi
 *     kèm ảnh mẫu (bucket riêng tư — chỉ hiện khi migration 0091 đã áp).
 *
 * Giọng Bean nhẹ nhàng: ba mẹ bấm "Yêu cầu sửa" thường là đang không vui — câu
 * đầu tiên là Bean nhận phần chưa đúng về mình, rồi mới hướng dẫn.
 */

"use client";

import React from "react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";
import { urlAnh, urlAnhDuPhong } from "@/lib/utils/anh-lh3";
import { giuA } from "@/lib/utils/giu-a";
import { formatNgayVN } from "@/lib/utils/dinh-dang";
import { TOI_DA_ANH_MAU, TOI_DA_BYTE_ANH_MAU, type VungKhoanh } from "@/lib/anh-chinh-sua/nhan-dien";
import { AnhKhoanhVung } from "./anh-khoanh-vung";
import { KHOA_TRONG_GOI } from "@/lib/anh-chinh-sua/theo-dot";
import { cauHanSua } from "@/lib/anh-chinh-sua/han-sua";
import {
  chonAnhMoiIn,
  chonSanPhamGoiY,
  hienLoiMoiInThem,
  type SanPhamGoiY,
  tomTatVongSua,
} from "@/lib/anh-chinh-sua/vong-duyet";
import { formatTien } from "@/lib/utils/dinh-dang";

const t = vi.gallery.anhChinh;
const dien = (s: string, n: number) => s.replace("{n}", String(n));

interface AnhNho {
  id: string;
  fileName: string;
  width: number | null;
  height: number | null;
  maTepDrive: string | null;
}
interface AnhChinh extends AnhNho {
  goc: AnhNho | null;
  /** BB-377 — đợt: "goc" (trong gói) | "dot:N" | "mt:<id>" (mua thêm). */
  khoa: string;
}
interface NhomDot {
  khoa: string;
  nhan: string;
  soAnh: number;
  trangThai: "chua_gui" | "cho_duyet" | "dang_sua" | "da_duyet";
  duocQuyet: boolean;
}
interface DuLieu {
  trangThai: string;
  duocQuyet: boolean;
  /** BB-377 — đã áp 0095: mỗi đợt mua thêm duyệt riêng. */
  theoDot?: boolean;
  anh: AnhChinh[];
  nhom?: NhomDot[];
  vongSua: {
    round: number;
    note: string;
    createdAt: string;
    resolved: boolean;
    khoa?: string;
    nhan?: string;
    /** Từng tấm ba mẹ đã xin sửa trong vòng (0091; chưa áp → rỗng). */
    items?: { photoId: string; note: string; marks: VungKhoanh[]; soAnhMau: number }[];
  }[];
  tinhNang: { vungKhoanh: boolean; anhMau: boolean };
  /** BB-384 — có phải người nhận link chính (được duyệt / xin sửa / mời in thêm). */
  laChu?: boolean;
  /** BB-387 — số ngày Bean ước tính gửi lại ảnh sửa (Cài đặt `gallery.revision_days_estimate`). */
  soNgaySua?: number;
}
/** BB-384 — Bean xác nhận rõ đã nhận gì sau khi ba mẹ gửi yêu cầu sửa. */
interface DaGuiSua {
  lan: number;
  tam: { ten: string; ghiChu: string }[];
  ghiChuChung: string;
}
interface MucDangSua {
  ghiChu: string;
  vung: VungKhoanh[];
  anhMau: { duongDan: string; xem: string }[];
}

const tiLeCua = (a: AnhNho) => (a.width && a.height ? a.height / a.width : null);

export function AnhChinhSuaKhach({
  onDaQuyet,
  moiInThem,
}: {
  /** Sau khi ba mẹ duyệt / gửi yêu cầu sửa — màn cha tải lại bộ ảnh. */
  onDaQuyet: (ketQua: { quyetDinh: "approve" | "revise"; lan?: number }) => void | Promise<void>;
  /**
   * BB-384 / bh-04 — lời mời in thêm ĐÚNG LÚC ba mẹ duyệt cho in (không còn tấm xin
   * sửa): danh mục sản phẩm (giá từ dữ liệu) và lối vào màn chọn thêm (null = chưa mở).
   */
  moiInThem?: { danhMuc: readonly SanPhamGoiY[]; onChonInThem: (() => void) | null };
}) {
  const [duLieu, setDuLieu] = React.useState<DuLieu | null>(null);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [mo, setMo] = React.useState<number | null>(null);
  const [soSanh, setSoSanh] = React.useState(false);
  const [viTri, setViTri] = React.useState(50);
  const [cheDo, setCheDo] = React.useState<"xem" | "sua">("xem");
  /** BB-377 — vòng duyệt đang xin sửa (đợt). */
  const [khoaSua, setKhoaSua] = React.useState<string>(KHOA_TRONG_GOI);
  const [chon, setChon] = React.useState<Record<string, MucDangSua>>({});
  const [dangKhoanh, setDangKhoanh] = React.useState(false);
  const [ghiChuChung, setGhiChuChung] = React.useState("");
  const [ban, setBan] = React.useState(false);
  const [loiGui, setLoiGui] = React.useState<string | null>(null);
  const [dangTaiAnhMau, setDangTaiAnhMau] = React.useState(false);
  const [daGui, setDaGui] = React.useState<DaGuiSua | null>(null);

  const songRef = React.useRef(true);
  const tai = React.useCallback(async () => {
    try {
      const res = await goiApiKhach("/api/g/anh-chinh-sua", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!songRef.current) return;
      if (!res.ok || !json?.data) {
        setLoi(json?.error?.message ?? t.loiTai);
        return;
      }
      setDuLieu(json.data as DuLieu);
    } catch {
      if (songRef.current) setLoi(t.loiTai);
    }
  }, []);
  React.useEffect(() => {
    songRef.current = true;
    void tai();
    return () => {
      songRef.current = false;
    };
  }, [tai]);

  const anh = duLieu?.anh ?? [];
  const dangMo = mo !== null ? anh[mo] : undefined;
  const soChon = Object.keys(chon).length;

  function batTatSua(id: string) {
    setChon((c) => {
      const moi = { ...c };
      if (moi[id]) delete moi[id];
      else moi[id] = { ghiChu: "", vung: [], anhMau: [] };
      return moi;
    });
  }
  function suaMuc(id: string, f: (m: MucDangSua) => MucDangSua) {
    setChon((c) => (c[id] ? { ...c, [id]: f(c[id]) } : c));
  }

  async function taiAnhMau(id: string, tep: File) {
    setLoiGui(null);
    if (tep.size > TOI_DA_BYTE_ANH_MAU) {
      setLoiGui(t.loiAnhMau);
      return;
    }
    setDangTaiAnhMau(true);
    try {
      const form = new FormData();
      form.set("tep", tep);
      const res = await goiApiKhach("/api/g/anh-chinh-sua/anh-mau", { method: "POST", body: form });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.data?.duongDan) {
        setLoiGui(json?.error?.message ?? t.loiAnhMau);
        return;
      }
      const xem = URL.createObjectURL(tep);
      suaMuc(id, (m) => ({ ...m, anhMau: [...m.anhMau, { duongDan: json.data.duongDan as string, xem }] }));
    } catch {
      setLoiGui(t.loiAnhMau);
    } finally {
      setDangTaiAnhMau(false);
    }
  }

  async function quyet(quyetDinh: "approve" | "revise", khoa: string = KHOA_TRONG_GOI) {
    if (quyetDinh === "revise" && soChon === 0 && !ghiChuChung.trim()) {
      setLoiGui(t.canChonTam);
      return;
    }
    setBan(true);
    setLoiGui(null);
    try {
      // Trong gói giữ đúng thân cũ (không kèm `khoa`); đợt mua thêm kèm `khoa`.
      const theoKhoa = khoa === KHOA_TRONG_GOI ? {} : { khoa };
      const body =
        quyetDinh === "approve"
          ? { decision: "approve", ...theoKhoa }
          : {
              decision: "revise",
              ...theoKhoa,
              note: ghiChuChung.trim(),
              items: Object.entries(chon).map(([photoId, m]) => ({
                photoId,
                note: m.ghiChu.trim(),
                marks: m.vung,
                anhMau: m.anhMau.map((a) => a.duongDan),
              })),
            };
      const res = await goiApiKhach("/api/g/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoiGui(json?.error?.message ?? vi.gallery.loiBean.guiChuaDuoc);
        return;
      }
      if (quyetDinh === "revise") {
        const tenCua = new Map(anh.map((a) => [a.id, a.fileName]));
        setDaGui({
          lan: Number(json?.data?.round) || 1,
          tam: Object.entries(chon).map(([id, m]) => ({
            ten: tenCua.get(id) ?? id,
            ghiChu:
              [
                m.ghiChu.trim(),
                m.vung.length ? dien(t.daKhoanh, m.vung.length) : "",
                m.anhMau.length ? dien(t.kemAnhMau, m.anhMau.length) : "",
              ]
                .filter(Boolean)
                .join(" · ") || t.canSuaTamNay,
          })),
          ghiChuChung: ghiChuChung.trim(),
        });
      } else {
        setDaGui(null);
      }
      setMo(null);
      // BB-377 — đợt mua thêm không đổi trạng thái bộ ảnh nên khối này vẫn hiện: về
      // chế độ xem và tải lại (đợt vừa duyệt/xin sửa không còn nút quyết).
      setCheDo("xem");
      setChon({});
      setGhiChuChung("");
      await onDaQuyet({ quyetDinh, lan: json?.data?.round });
      await tai();
    } catch {
      setLoiGui(vi.gallery.loiBean.guiChuaDuoc);
    } finally {
      setBan(false);
    }
  }

  // BB-388 — thanh đáy "Xem & duyệt N ảnh chỉnh" hiện NGAY khi bộ ảnh tải xong (số ảnh chỉnh có
  // sẵn trong dữ liệu bộ), còn khối này tự tải ảnh chỉnh thêm ~1–2 giây. Nút cuộn tới
  // `#anh-da-chinh`: nếu chỉ khối đã tải mới mang id thì bấm sớm là KHÔNG có gì xảy ra (e2e
  // bb-384 ca 3). Ô "đang tải"/lỗi giữ cùng id để nút luôn đưa ba mẹ tới đúng chỗ.
  if (loi)
    return (
      <p id="anh-da-chinh" className="rounded-2xl border border-border bg-surface p-5 text-sm text-heart">
        {loi}
      </p>
    );
  if (!duLieu)
    return (
      <p id="anh-da-chinh" className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted-foreground">
        {t.dangTai}
      </p>
    );
  if (anh.length === 0) return null;

  const mucMo = dangMo ? chon[dangMo.id] : undefined;
  // BB-377 — có ảnh mua thêm thì chia khối theo đợt ("Trong gói" / "Mua thêm đợt 2"…).
  const nhom = duLieu.nhom ?? [];
  const coMuaThem = nhom.some((n) => n.khoa !== KHOA_TRONG_GOI);
  const nhanDot = (khoa: string) => nhom.find((n) => n.khoa === khoa)?.nhan ?? t.trongGoi;
  // Đã áp 0095: mỗi đợt một vòng duyệt riêng. Chưa áp: một quyết định cho cả bộ.
  const quyetTheoDot = duLieu.theoDot && coMuaThem;
  const dangSuaTam = (a: AnhChinh) => cheDo === "sua" && (!quyetTheoDot || a.khoa === khoaSua);

  const luoi = (ds: AnhChinh[]) => (
    <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
      {ds.map((a) => {
        const daChon = !!chon[a.id];
        const i = anh.indexOf(a);
        return (
          <li key={a.id} className="relative">
            <button
              type="button"
              onClick={() => {
                setMo(i);
                setSoSanh(false);
                setDangKhoanh(false);
              }}
              data-testid="o-anh-chinh"
              data-khoa={a.khoa}
              aria-label={a.fileName}
              className={cn(
                "block aspect-square w-full overflow-hidden rounded-lg bg-surface-2",
                daChon && "ring-2 ring-heart ring-offset-2",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive, không qua next/image */}
              <img
                src={urlAnh(a, 400)}
                alt={a.fileName}
                loading="lazy"
                className="h-full w-full object-cover"
                onError={(e) => {
                  const du = urlAnhDuPhong(a.id, 400);
                  if (!e.currentTarget.src.endsWith(du)) e.currentTarget.src = du;
                }}
              />
            </button>
            {daChon && (
              <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full bg-heart px-2 py-0.5 text-[11px] font-medium text-white">
                {t.canSuaTamNay}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );

  /** Thanh Duyệt / Yêu cầu sửa của một vòng duyệt (`khoa` = đợt; trong gói khi chưa áp 0095). */
  const thanhQuyet = (khoa: string, duocQuyet: boolean, choDuyet: boolean) => {
    if (!duocQuyet) {
      return choDuyet ? <p className="text-xs text-muted-foreground">{giuA(t.chiNguoiChinh)}</p> : null;
    }
    if (cheDo === "xem" || khoaSua !== khoa) {
      return (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ban}
            onClick={() => void quyet("approve", khoa)}
            className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {khoa === KHOA_TRONG_GOI ? t.duyet : t.duyetMuaThem}
          </button>
          <button
            type="button"
            disabled={ban}
            onClick={() => {
              setChon({});
              setKhoaSua(khoa);
              setCheDo("sua");
            }}
            className="h-10 rounded-full border border-border px-5 text-sm font-medium transition hover:bg-surface-2 disabled:opacity-40"
          >
            {t.yeuCauSua}
          </button>
        </div>
      );
    }
    return (
      <div className="space-y-3 border-t border-border pt-3">
        <p className="text-sm font-medium" data-testid="so-tam-can-sua">
          {dien(t.soTamCanSua, soChon)}
        </p>
        <label htmlFor={`ghi-chu-chung-sua-${khoa}`} className="block text-xs text-muted-foreground">
          {t.ghiChuChung}
        </label>
        <textarea
          id={`ghi-chu-chung-sua-${khoa}`}
          name="ghiChuChung"
          rows={3}
          maxLength={1000}
          value={ghiChuChung}
          onChange={(e) => setGhiChuChung(e.target.value)}
          className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-hidden focus:ring-1 focus:ring-primary"
        />
        {loiGui && <p className="text-xs text-heart">{loiGui}</p>}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={ban || dangTaiAnhMau}
            onClick={() => void quyet("revise", khoa)}
            className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-40"
          >
            {t.guiYeuCau}
          </button>
          <button
            type="button"
            disabled={ban}
            onClick={() => {
              setCheDo("xem");
              setLoiGui(null);
            }}
            className="h-10 rounded-full px-5 text-sm font-medium text-muted-foreground transition hover:bg-surface-2 disabled:opacity-40"
          >
            {t.quayLai}
          </button>
        </div>
      </div>
    );
  };

  return (
    <section
      id="anh-da-chinh"
      data-testid="khoi-anh-chinh"
      className="space-y-4 rounded-2xl border border-border bg-surface p-5"
    >
      <div>
        <h2 className="kh-h3">{t.tieuDe}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {giuA(cheDo === "sua" ? t.suaMoDau : `${dien(t.moDau, anh.length)} ${t.goiY}`)}
        </p>
        {/* BB-387 — hạ hoả: khoảng thời gian Bean gửi lại (ước tính, không hứa cứng); KHÔNG nêu tên thợ chỉnh. */}
        {cheDo === "sua" && (
          <p className="mt-1 text-sm text-muted-foreground" data-testid="ai-se-sua">
            {giuA(cauHanSua(duLieu.soNgaySua))}
          </p>
        )}
      </div>

      {daGui && cheDo === "xem" && (
        <div className="space-y-1.5 rounded-xl bg-surface-2 p-4 text-sm" data-testid="xac-nhan-da-gui-sua" role="status">
          <p className="font-medium">{giuA(dien(t.daNhanTieuDe, daGui.lan))}</p>
          {daGui.tam.length > 0 && (
            <>
              <p className="text-muted-foreground">{dien(t.daNhanSoTam, daGui.tam.length)}</p>
              <ul className="list-disc pl-5">
                {daGui.tam.map((x) => (
                  <li key={x.ten}>
                    <span className="font-medium">{x.ten}</span> — {x.ghiChu}
                  </li>
                ))}
              </ul>
            </>
          )}
          {daGui.ghiChuChung && (
            <p>
              <span className="text-muted-foreground">{t.daNhanGhiChuChung}</span>{" "}
              <span className="whitespace-pre-line">{daGui.ghiChuChung}</span>
            </p>
          )}
          <p className="text-muted-foreground">{giuA(t.suaLoiBean)}</p>
          <p className="text-muted-foreground">{giuA(cauHanSua(duLieu.soNgaySua))}</p>
        </div>
      )}

      {coMuaThem
        ? nhom.map((n) => {
            const ds = anh.filter((a) => a.khoa === n.khoa);
            if (ds.length === 0) return null;
            return (
              <div key={n.khoa} className="space-y-2" data-testid="nhom-anh-chinh" data-khoa={n.khoa}>
                <h3 className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs",
                      n.khoa === KHOA_TRONG_GOI ? "bg-surface-2 text-foreground" : "bg-primary/10 text-primary",
                    )}
                    data-testid="nhan-dot"
                  >
                    {n.khoa === KHOA_TRONG_GOI ? t.trongGoi : n.nhan}
                  </span>
                  <span className="text-xs font-normal text-muted-foreground">{dien(t.soTam, ds.length)}</span>
                  {quyetTheoDot && n.trangThai === "da_duyet" && (
                    <span className="text-xs font-normal text-muted-foreground">· {t.daDuyetDot}</span>
                  )}
                </h3>
                {luoi(ds)}
                {quyetTheoDot && thanhQuyet(n.khoa, n.duocQuyet, n.trangThai === "cho_duyet")}
              </div>
            );
          })
        : luoi(anh)}

      {/* BB-384 — lịch sử các lần sửa THEO TỪNG TẤM: lần, ghi chú, vùng khoanh, ảnh mẫu,
          trạng thái Bean đã sửa / đang sửa. Vòng không có chi tiết (chưa áp 0091 / bản cũ)
          hiện nguyên chữ ba mẹ đã viết. */}
      {duLieu.vongSua.length > 0 && (
        <div className="space-y-3 border-t border-border pt-3" data-testid="lich-su-sua-theo-tam">
          <p className="text-xs font-medium">{t.lichSuTieuDe}</p>
          <ul className="space-y-3">
            {duLieu.vongSua.map((v) => {
              const items = v.items ?? [];
              const chung = tomTatVongSua(v.note).ghiChuChung;
              return (
                <li key={v.round} className="text-xs" data-testid="vong-sua-khach" data-lan={v.round}>
                  <span className="text-muted-foreground">
                    {dien(t.lanSua, v.round)} · {formatNgayVN(v.createdAt)} ·{" "}
                    <span className={v.resolved ? "" : "font-medium text-foreground"}>
                      {v.resolved ? t.beanDaSua : t.beanDangSua}
                    </span>
                    {coMuaThem && v.khoa && v.khoa !== KHOA_TRONG_GOI ? ` · ${v.nhan}` : ""}
                  </span>
                  {items.length > 0 ? (
                    <ul className="mt-1.5 space-y-1.5">
                      {items.map((it) => {
                        const a = anh.find((x) => x.id === it.photoId);
                        return (
                          <li key={it.photoId} className="flex items-start gap-2" data-testid="muc-sua-khach">
                            {a && (
                              <button
                                type="button"
                                onClick={() => setMo(anh.indexOf(a))}
                                className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-surface-2"
                                aria-label={a.fileName}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
                                <img src={urlAnh(a, 200)} alt="" className="h-full w-full object-cover" />
                              </button>
                            )}
                            <span className="min-w-0">
                              <span className="font-medium">{a?.fileName ?? ""}</span>
                              {it.note ? <span className="block whitespace-pre-line">{it.note}</span> : null}
                              <span className="block text-muted-foreground">
                                {[
                                  it.marks.length ? dien(t.daKhoanh, it.marks.length) : "",
                                  it.soAnhMau ? dien(t.kemAnhMau, it.soAnhMau) : "",
                                ]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                            </span>
                          </li>
                        );
                      })}
                      {chung && (
                        <li className="whitespace-pre-line text-muted-foreground">
                          {t.canSuaChung}: {chung}
                        </li>
                      )}
                    </ul>
                  ) : (
                    <span className="mt-0.5 block whitespace-pre-line">{v.note}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* bh-04 — mời in thêm ĐÚNG LÚC ba mẹ vừa duyệt cho in và không còn tấm xin sửa. */}
      {moiInThem &&
        hienLoiMoiInThem({
          status: duLieu.trangThai,
          coVongSuaMo: duLieu.vongSua.some((v) => !v.resolved),
          laChu: duLieu.laChu ?? false,
        }) && (
          <LoiMoiInThem
            anh={chonAnhMoiIn(
              anh.filter((a) => a.khoa === KHOA_TRONG_GOI),
              new Set(duLieu.vongSua.flatMap((v) => (v.items ?? []).map((it) => it.photoId))),
            )}
            sanPham={chonSanPhamGoiY(moiInThem.danhMuc)}
            onChon={moiInThem.onChonInThem}
          />
        )}

      {!quyetTheoDot && thanhQuyet(KHOA_TRONG_GOI, duLieu.duocQuyet, duLieu.trangThai === "awaiting_approval")}
      {cheDo === "xem" && loiGui && <p className="text-xs text-heart">{loiGui}</p>}

      {dangMo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={dangMo.fileName}
          data-testid="xem-lon-anh-chinh"
          className="fixed inset-0 z-50 flex flex-col text-white"
          style={{ background: "rgba(18, 16, 14, 0.97)" }}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="truncate opacity-80">
              {mo! + 1}/{anh.length} · {dangMo.fileName}
              {coMuaThem && (
                <span className="ml-2 rounded-full bg-white/15 px-2 py-0.5 text-[11px]" data-testid="nhan-dot-xem-lon">
                  {dangMo.khoa === KHOA_TRONG_GOI ? t.trongGoi : nhanDot(dangMo.khoa)}
                </span>
              )}
            </span>
            <button type="button" onClick={() => setMo(null)} className="rounded-full px-3 py-1.5 hover:bg-white/10">
              {t.dong}
            </button>
          </div>

          <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto px-2">
            <div className="w-full max-w-3xl">
              {soSanh && dangMo.goc ? (
                <TruocSau anh={dangMo} goc={dangMo.goc} viTri={viTri} onViTri={setViTri} />
              ) : (
                <AnhKhoanhVung
                  key={dangMo.id}
                  src={urlAnh(dangMo, 1600)}
                  srcDuPhong={urlAnhDuPhong(dangMo.id, 1600)}
                  alt={dangMo.fileName}
                  tiLe={tiLeCua(dangMo)}
                  vung={mucMo?.vung ?? []}
                  dangKhoanh={dangKhoanh && !!mucMo}
                  onThem={(v) => suaMuc(dangMo.id, (m) => ({ ...m, vung: m.vung.length >= 10 ? m.vung : [...m.vung, v] }))}
                  onBo={(i) => suaMuc(dangMo.id, (m) => ({ ...m, vung: m.vung.filter((_, k) => k !== i) }))}
                  className="mx-auto max-h-[62vh]"
                />
              )}
            </div>
          </div>

          <div className="space-y-2 px-4 pb-4 pt-2">
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <button
                type="button"
                disabled={mo === 0}
                onClick={() => setMo((m) => (m! > 0 ? m! - 1 : m))}
                className="rounded-full border border-white/30 px-3 py-1.5 disabled:opacity-30"
              >
                {t.truocDo}
              </button>
              {dangMo.goc ? (
                <button
                  type="button"
                  onClick={() => {
                    setSoSanh((s) => !s);
                    setDangKhoanh(false);
                  }}
                  data-testid="nut-so-sanh-goc"
                  className="rounded-full bg-white px-4 py-1.5 font-medium text-black"
                >
                  {soSanh ? t.tatSoSanh : t.soSanh}
                </button>
              ) : (
                <span className="text-xs opacity-70">{giuA(t.khongCoGoc)}</span>
              )}
              <button
                type="button"
                disabled={mo === anh.length - 1}
                onClick={() => setMo((m) => (m! < anh.length - 1 ? m! + 1 : m))}
                className="rounded-full border border-white/30 px-3 py-1.5 disabled:opacity-30"
              >
                {t.tiepTheo}
              </button>
            </div>

            {(() => {
              const cuaTam = duLieu.vongSua.flatMap((v) =>
                (v.items ?? []).filter((it) => it.photoId === dangMo.id).map((it) => ({ v, it })),
              );
              if (cuaTam.length === 0) return null;
              return (
                <div className="mx-auto max-w-3xl rounded-2xl bg-white/10 p-3 text-xs" data-testid="lich-su-tam-xem-lon">
                  <p className="mb-1 font-medium">{t.lichSuTam}</p>
                  <ul className="space-y-1">
                    {cuaTam.map(({ v, it }) => (
                      <li key={v.round}>
                        <span className="opacity-70">
                          {dien(t.lanSua, v.round)} · {v.resolved ? t.beanDaSua : t.beanDangSua}
                        </span>
                        {it.note ? ` — ${it.note}` : ""}
                        {it.soAnhMau ? ` · ${dien(t.kemAnhMau, it.soAnhMau)}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            {dangSuaTam(dangMo) && (
              <div className="mx-auto max-w-3xl space-y-2 rounded-2xl bg-white p-3 text-sm text-black" data-testid="bang-sua-tam">
                <button
                  type="button"
                  aria-pressed={!!mucMo}
                  onClick={() => batTatSua(dangMo.id)}
                  data-testid="chon-can-sua"
                  className={cn(
                    "flex h-10 w-full items-center justify-center gap-2 rounded-full border text-sm font-medium transition",
                    mucMo ? "border-heart bg-heart text-white" : "border-black/20",
                  )}
                >
                  <span aria-hidden="true">{mucMo ? "✓" : "+"}</span>
                  {t.canSuaTamNay}
                </button>
                {mucMo && (
                  <>
                    <textarea
                      name="ghiChuTam"
                      rows={2}
                      maxLength={1000}
                      aria-label={t.ghiChuTam}
                      placeholder={t.ghiChuTamGoiY}
                      value={mucMo.ghiChu}
                      onChange={(e) => {
                        const gt = e.target.value;
                        suaMuc(dangMo.id, (m) => ({ ...m, ghiChu: gt }));
                      }}
                      className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      {duLieu.tinhNang.vungKhoanh && !soSanh && (
                        <button
                          type="button"
                          onClick={() => setDangKhoanh((k) => !k)}
                          data-testid="nut-khoanh-vung"
                          className={cn(
                            "rounded-full border px-3 py-1.5 text-xs font-medium",
                            dangKhoanh ? "border-heart bg-heart text-white" : "border-black/20",
                          )}
                        >
                          {dangKhoanh ? t.xongKhoanh : t.khoanhVung}
                        </button>
                      )}
                      {mucMo.vung.length > 0 && (
                        <span className="text-xs text-black/60">{dien(t.soVung, mucMo.vung.length)}</span>
                      )}
                      {duLieu.tinhNang.anhMau && mucMo.anhMau.length < TOI_DA_ANH_MAU && (
                        <label className="cursor-pointer rounded-full border border-black/20 px-3 py-1.5 text-xs font-medium">
                          {dangTaiAnhMau ? t.dangTaiAnh : t.themAnhMau}
                          <input
                            type="file"
                            name="anhMau"
                            accept="image/jpeg,image/png,image/webp,image/heic"
                            className="sr-only"
                            disabled={dangTaiAnhMau}
                            onChange={(e) => {
                              const tep = e.target.files?.[0];
                              e.target.value = "";
                              if (tep) void taiAnhMau(dangMo.id, tep);
                            }}
                          />
                        </label>
                      )}
                    </div>
                    {dangKhoanh && <p className="text-xs text-black/60">{giuA(t.khoanhHuongDan)}</p>}
                    {duLieu.tinhNang.anhMau && mucMo.anhMau.length === 0 && (
                      <p className="text-xs text-black/60">{giuA(t.anhMauGoiY)}</p>
                    )}
                    {mucMo.anhMau.length > 0 && (
                      <ul className="flex gap-2">
                        {mucMo.anhMau.map((am) => (
                          <li key={am.duongDan} className="relative">
                            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh ba mẹ vừa chọn trên máy */}
                            <img src={am.xem} alt="" className="h-14 w-14 rounded-lg object-cover" />
                            <button
                              type="button"
                              aria-label={t.boAnhMau}
                              onClick={() =>
                                suaMuc(dangMo.id, (m) => ({ ...m, anhMau: m.anhMau.filter((x) => x.duongDan !== am.duongDan) }))
                              }
                              className="absolute -right-1.5 -top-1.5 h-5 w-5 rounded-full bg-black text-[11px] leading-5 text-white"
                            >
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {loiGui && <p className="text-xs text-heart">{loiGui}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Thanh trượt trước/sau: ảnh đã chỉnh nằm dưới, ảnh gốc phủ lên phần bên trái. */
function TruocSau({
  anh,
  goc,
  viTri,
  onViTri,
}: {
  anh: AnhNho;
  goc: AnhNho;
  viTri: number;
  onViTri: (v: number) => void;
}) {
  const tiLe = tiLeCua(anh) ?? tiLeCua(goc) ?? 1.5;
  return (
    <div className="relative mx-auto max-h-[62vh] w-full select-none" style={{ aspectRatio: `1 / ${tiLe}` }} data-testid="so-sanh-truoc-sau">
      {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
      <img src={urlAnh(anh, 1600)} alt={vi.gallery.anhChinh.sau} className="absolute inset-0 h-full w-full object-contain" />
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - viTri}% 0 0)` }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
        <img src={urlAnh(goc, 1600)} alt={vi.gallery.anhChinh.truoc} className="absolute inset-0 h-full w-full object-contain" />
      </div>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `${viTri}%` }} />
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px]">
        {vi.gallery.anhChinh.truoc}
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px]">
        {vi.gallery.anhChinh.sau}
      </span>
      <input
        type="range"
        name="soSanh"
        min={0}
        max={100}
        value={viTri}
        onChange={(e) => onViTri(Number(e.target.value))}
        aria-label={vi.gallery.anhChinh.keoSoSanh}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        data-testid="thanh-truot-so-sanh"
      />
    </div>
  );
}

/** bh-04 — lời mời in thêm sau khi ba mẹ duyệt cho in: 3 tấm đã chỉnh + sản phẩm in có giá trong danh mục. */
function LoiMoiInThem({
  anh,
  sanPham,
  onChon,
}: {
  anh: AnhNho[];
  sanPham: SanPhamGoiY[];
  onChon: (() => void) | null;
}) {
  const t = vi.gallery.anhChinh;
  if (anh.length === 0) return null;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-background p-4" data-testid="loi-moi-in-them">
      <div>
        <p className="kh-h3">{giuA(t.moiInTieuDe)}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{giuA(t.moiInMoTa)}</p>
      </div>
      <ul className="grid grid-cols-3 gap-1.5">
        {anh.map((a) => (
          <li key={a.id} className="aspect-square overflow-hidden rounded-lg bg-surface-2" data-testid="anh-moi-in">
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh Drive */}
            <img src={urlAnh(a, 400)} alt={a.fileName} loading="lazy" className="h-full w-full object-cover" />
          </li>
        ))}
      </ul>
      {sanPham.length > 0 && (
        <ul className="space-y-1 text-sm" data-testid="san-pham-moi-in">
          {sanPham.map((sp) => (
            <li key={sp.productId} className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate">
                {sp.name}
                {sp.size ? ` · ${sp.size}` : ""}
              </span>
              <span className="shrink-0 text-muted-foreground">{t.moiInGia.replace("{gia}", formatTien(sp.unitPrice))}</span>
            </li>
          ))}
        </ul>
      )}
      {onChon && (
        <button
          type="button"
          onClick={onChon}
          data-testid="nut-moi-in-them"
          className="h-10 rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:opacity-90"
        >
          {t.moiInNut}
        </button>
      )}
    </div>
  );
}
