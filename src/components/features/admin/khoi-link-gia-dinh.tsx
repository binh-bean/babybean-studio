"use client";

/**
 * BB-334C — khối "Link app của gia đình" ở trang khách hàng (nhân viên).
 * Bản vẽ: babybean-assets/BB-334/ban-ve/05-nv-gui-link-mt.png, 06-nv-gui-link-dt.png.
 * Hợp đồng máy chủ: docs/29-link-gia-dinh.md §3.
 *
 * Hai lớp:
 *   - `KhoiLinkGiaDinhView`  : thuần hiển thị theo props (phép thử dựng bằng
 *     `renderToStaticMarkup`, không giả lập hook).
 *   - `KhoiLinkGiaDinh`      : giữ trạng thái + gọi API.
 *
 * LUẬT XÁC NHẬN: nút "Đổi link", "Thu hồi", "Ghi link vào Lark" CHỈ mở hộp xác
 * nhận (`onMoHop`). Việc gọi API nằm sau nút xác nhận của hộp (`onXacNhan`) —
 * không có đường nào từ nút ngoài hộp tới API.
 *
 * Màn hình không phải ranh giới an ninh: vai không được đổi/thu hồi thì ẨN nút
 * (`duocDoi`), nhưng cửa thật là máy chủ (cs/admin/owner + `xacNhan: true`).
 */

import React from "react";
import { Check, Copy, Share2, Link2, RefreshCw, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CARD_TITLE_CLASS } from "./page-header";
import { NutNhanKhach } from "./nut-nhan-khach";
import { vi } from "@/i18n/vi";
import { formatNgayGioVN, formatNgayVN } from "@/lib/utils/dinh-dang";
import {
  diaChiHienThi,
  dien,
  docLinkGiaDinh,
  doiLinkGiaDinh,
  ghiLarkGiaDinh,
  taoLinkGiaDinh,
  thuHoiLinkGiaDinh,
  tinNhanMauGiaDinh,
  type KetQuaGhiLark,
  type TrangThaiLinkGiaDinh,
} from "@/lib/utils/link-gia-dinh-nhan-vien";

const T = vi.admin.linkGiaDinh;

export type HopXacNhan = "doi" | "thu-hoi" | "ghi-lark" | null;
export type DangLam = "tao" | "doi" | "thu-hoi" | "ghi-lark" | null;
export interface ThongBao {
  loai: "ok" | "loi" | "canh-bao";
  chu: string;
}

const KHUNG = "rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] p-4 md:p-5";

export interface KhoiLinkGiaDinhViewProps {
  dangTai: boolean;
  loiTai: boolean;
  du: TrangThaiLinkGiaDinh | null;
  /** Địa chỉ đầy đủ để hiện / chép (null: chưa có hoặc không đọc lại được). */
  diaChi: string | null;
  /** Vừa thu hồi trong phiên làm việc này. */
  vuaThuHoi?: boolean;
  hop: HopXacNhan;
  dangLam: DangLam;
  thongBao: ThongBao | null;
  daChep: "link" | "tin" | null;
  coTheChiaSe: boolean;
  chatUrl?: string | null;
  onTao: () => void;
  onMoHop: (h: Exclude<HopXacNhan, null>) => void;
  onDongHop: () => void;
  onXacNhan: () => void;
  onChepLink: () => void;
  onChepTinNhan: () => void;
  onChiaSe: () => void;
}

const NOI_DUNG_HOP = {
  doi: { ...T.doi },
  "thu-hoi": { ...T.thuHoiHop },
  "ghi-lark": { ...T.ghiLarkHop },
} as const;

function Thong({ tb }: { tb: ThongBao }) {
  const mau =
    tb.loai === "ok"
      ? "bg-[var(--bb-success)]/12 text-[var(--bb-fg)]"
      : tb.loai === "loi"
        ? "bg-[var(--bb-danger)]/10 text-[var(--bb-danger)]"
        : "bg-[var(--bb-warning)]/15 text-[var(--bb-fg)]";
  return (
    <p
      role={tb.loai === "loi" ? "alert" : "status"}
      data-testid="link-gia-dinh-thong-bao"
      data-loai={tb.loai}
      className={`rounded-[var(--bb-radius-sm)] px-3 py-2 text-sm ${mau}`}
    >
      {tb.chu}
    </p>
  );
}

export function KhoiLinkGiaDinhView(props: KhoiLinkGiaDinhViewProps) {
  const p = props;
  const du = props.du; // danh sách link cũ đi vào qua props
  const link = du?.linkGiaDinh ?? null;
  const dangBan = p.dangLam !== null;
  const tinNhan = p.diaChi ? tinNhanMauGiaDinh(p.diaChi) : null;
  const hop = p.hop ? NOI_DUNG_HOP[p.hop] : null;
  const soLinkCu = du?.linkCuConSong.length ?? 0;
  const soLoiMoi = du?.loiMoiGiaDinh.length ?? 0;

  return (
    <section className={KHUNG} data-testid="khoi-link-gia-dinh" aria-labelledby="tieu-de-link-gia-dinh">
      <h2 id="tieu-de-link-gia-dinh" className={CARD_TITLE_CLASS}>
        {T.tieuDe}
      </h2>
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">{T.moTa}</p>

      {p.dangTai && (
        <p className="mt-4 text-sm text-[var(--bb-fg-muted)]" data-testid="link-gia-dinh-dang-tai">
          {T.dangTai}
        </p>
      )}
      {p.loiTai && (
        <p className="mt-4 text-sm text-[var(--bb-danger)]" role="alert" data-testid="link-gia-dinh-loi-tai">
          {T.loiTai}
        </p>
      )}

      {du && !link && (
        <div className="mt-4 flex flex-col gap-3" data-testid="link-gia-dinh-chua-co">
          {p.vuaThuHoi ? (
            <p className="text-sm font-medium" data-testid="link-gia-dinh-da-thu-hoi">
              {T.vuaThuHoi}
            </p>
          ) : (
            <>
              <p className="text-sm font-medium">{T.chuaCo}</p>
              <p className="text-sm text-[var(--bb-fg-muted)]">{T.chuaCoMoTa}</p>
            </>
          )}
          <div>
            <Button
              type="button"
              variant="muc"
              size="sm"
              onClick={p.onTao}
              disabled={dangBan || du.soBoAnh === 0}
              data-testid="nut-tao-link-gia-dinh"
            >
              <Link2 aria-hidden="true" />
              {p.dangLam === "tao" ? T.dangTao : T.taoLink}
            </Button>
          </div>
        </div>
      )}

      {link && (
        <div className="mt-4 flex flex-col gap-3" data-testid="link-gia-dinh-co-link">
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              aria-label={T.nhanOLink}
              data-testid="o-link-gia-dinh"
              value={p.diaChi ?? ""}
              placeholder={p.diaChi ? undefined : T.khongDocLaiDuoc}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 basis-56 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-bg)] px-3 font-mono text-xs"
            />
            <Button
              type="button"
              variant="muc"
              size="sm"
              onClick={p.onChepLink}
              disabled={!p.diaChi}
              data-testid="nut-chep-link-gia-dinh"
            >
              {p.daChep === "link" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {p.daChep === "link" ? T.daChepLink : T.chepLink}
            </Button>
          </div>
          {!p.diaChi && (
            <p className="text-sm text-[var(--bb-warning)]" data-testid="link-gia-dinh-khong-doc-lai">
              {T.khongDocLaiDuoc}
            </p>
          )}

          <p className="text-xs text-[var(--bb-fg-muted)]" data-testid="link-gia-dinh-thong-ke">
            {link.soLanMo > 0
              ? dien(T.thongKe, {
                  ngay: formatNgayVN(link.taoLuc),
                  lan: link.soLanMo,
                  cuoi: link.moLanCuoi ? dien(T.thongKeCuoi, { luc: formatNgayGioVN(link.moLanCuoi) }) : "",
                })
              : `${dien("Tạo {ngay}", { ngay: formatNgayVN(link.taoLuc) })} · ${T.chuaMoLan}`}
          </p>

          {tinNhan && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--bb-fg-muted)]">{T.tinNhanMau}</p>
              <p
                className="mt-1 whitespace-pre-line [overflow-wrap:anywhere] rounded-[var(--bb-radius-sm)] border border-dashed border-[var(--bb-border)] bg-[var(--bb-bg)] p-3 text-sm"
                data-testid="tin-nhan-mau-gia-dinh"
              >
                {tinNhan}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={p.onChepTinNhan} disabled={!tinNhan} data-testid="nut-chep-tin-nhan">
              {p.daChep === "tin" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {p.daChep === "tin" ? T.daChepTinNhan : T.chepTinNhan}
            </Button>
            {p.coTheChiaSe && (
              <Button type="button" variant="outline" size="sm" onClick={p.onChiaSe} disabled={!tinNhan} data-testid="nut-chia-se-link-gia-dinh">
                <Share2 aria-hidden="true" />
                {T.chiaSe}
              </Button>
            )}
            <NutNhanKhach url={p.chatUrl} />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--bb-border)] pt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => p.onMoHop("ghi-lark")}
              disabled={dangBan}
              data-testid="nut-ghi-link-lark"
            >
              <Upload aria-hidden="true" />
              {p.dangLam === "ghi-lark" ? T.dangGhiLark : T.ghiLark}
            </Button>
            {du?.duocDoi && (
              <>
                <Button type="button" variant="outline" size="sm" onClick={() => p.onMoHop("doi")} disabled={dangBan} data-testid="nut-doi-link-gia-dinh">
                  <RefreshCw aria-hidden="true" />
                  {T.doiLink}
                </Button>
                <Button type="button" variant="danger" size="sm" onClick={() => p.onMoHop("thu-hoi")} disabled={dangBan} data-testid="nut-thu-hoi-link-gia-dinh">
                  <Trash2 aria-hidden="true" />
                  {T.thuHoi}
                </Button>
              </>
            )}
          </div>
          {du && !du.duocDoi && (
            <p className="text-xs text-[var(--bb-fg-muted)]" data-testid="link-gia-dinh-chi-admin-doi">
              {T.chiAdminDoi}
            </p>
          )}
        </div>
      )}

      {p.thongBao && (
        <div className="mt-3">
          <Thong tb={p.thongBao} />
        </div>
      )}

      {du && (soLinkCu > 0 || soLoiMoi > 0) && (
        <div className="mt-4 flex flex-col gap-2 rounded-[var(--bb-radius-sm)] bg-[var(--bb-bg)] p-3 text-sm" data-testid="link-gia-dinh-link-cu">
          {soLinkCu > 0 && (
            <div>
              <p className="font-medium" data-testid="link-cu-con-song">
                {dien(T.linkCu, { n: soLinkCu })}
              </p>
              <p className="text-xs text-[var(--bb-fg-muted)]">{T.linkCuMoTa}</p>
              <ul className="mt-1 list-disc pl-5 text-xs text-[var(--bb-fg-muted)]">
                {du.linkCuConSong.map((l) => (
                  <li key={l.shareLinkId}>{dien(T.linkCuMotBo, { ten: l.tieuDeBo || "Bộ ảnh", lan: l.soLanMo })}</li>
                ))}
              </ul>
            </div>
          )}
          {soLoiMoi > 0 && (
            <p className="text-xs text-[var(--bb-fg-muted)]" data-testid="loi-moi-gia-dinh">
              {dien(T.loiMoi, { n: soLoiMoi })}
            </p>
          )}
        </div>
      )}

      <Dialog open={p.hop !== null} onOpenChange={(m) => !m && p.onDongHop()}>
        <DialogContent data-testid="hop-xac-nhan-link-gia-dinh" data-hop={p.hop ?? undefined}>
          {hop && (
            <>
              <DialogHeader>
                <DialogTitle>{hop.tieuDe}</DialogTitle>
                <DialogDescription>{hop.noiDung}</DialogDescription>
              </DialogHeader>
              <p className="text-sm text-[var(--bb-fg-muted)]">{hop.phu}</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={p.onDongHop} disabled={dangBan} data-testid="hop-link-gia-dinh-huy">
                  {T.huy}
                </Button>
                <Button
                  type="button"
                  variant={p.hop === "ghi-lark" ? "muc" : "danger"}
                  onClick={p.onXacNhan}
                  disabled={dangBan}
                  data-testid="hop-link-gia-dinh-xac-nhan"
                >
                  {dangBan ? T.dangXuLy : hop.nutXacNhan}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function moTaLark(lark: KetQuaGhiLark | null): ThongBao | null {
  if (!lark) return null;
  if (lark.tong === 0) return { loai: "canh-bao", chu: T.larkKhongCoDong };
  if (lark.ghiDuoc === lark.tong) return { loai: "ok", chu: dien(T.larkDuHet, { n: lark.tong }) };
  return { loai: "canh-bao", chu: dien(T.larkMotPhan, { ghi: lark.ghiDuoc, tong: lark.tong }) };
}

export function KhoiLinkGiaDinh({ customerId, chatUrl }: { customerId: string; chatUrl?: string | null }) {
  const [du, setDu] = React.useState<TrangThaiLinkGiaDinh | null>(null);
  const [dangTai, setDangTai] = React.useState(true);
  const [loiTai, setLoiTai] = React.useState(false);
  const [an, setAn] = React.useState(false);
  const [hop, setHop] = React.useState<HopXacNhan>(null);
  const [dangLam, setDangLam] = React.useState<DangLam>(null);
  const [thongBao, setThongBao] = React.useState<ThongBao | null>(null);
  const [vuaThuHoi, setVuaThuHoi] = React.useState(false);
  const [duongDanTam, setDuongDanTam] = React.useState<string | null>(null);
  const [daChep, setDaChep] = React.useState<"link" | "tin" | null>(null);
  const [coTheChiaSe, setCoTheChiaSe] = React.useState(false);
  const [goc, setGoc] = React.useState<string | null>(null);
  const loiChuoi = React.useMemo(() => ({ matKetNoi: T.matKetNoi, chung: T.loiChung }), []);

  const tai = React.useCallback(async () => {
    const r = await docLinkGiaDinh(customerId, loiChuoi);
    if (r.ok) {
      setDu(r.data);
      setLoiTai(false);
    } else if (r.ma === "FORBIDDEN") {
      setAn(true); // vai không có galleries:share — không bày khối chết
    } else {
      setLoiTai(true);
    }
    setDangTai(false);
    return r.ok ? r.data : null;
  }, [customerId, loiChuoi]);

  React.useEffect(() => {
    setGoc(window.location.origin);
    setCoTheChiaSe(typeof navigator !== "undefined" && typeof navigator.share === "function");
    void tai();
  }, [tai]);

  const diaChiTuMayChu = diaChiHienThi(du?.linkGiaDinh ?? null, goc);
  const diaChi = diaChiTuMayChu ?? (duongDanTam && goc ? `${goc}${duongDanTam}` : null);

  async function chep(chu: string | null, loai: "link" | "tin") {
    if (!chu) return;
    try {
      await navigator.clipboard.writeText(chu);
      setDaChep(loai);
      window.setTimeout(() => setDaChep(null), 2000);
    } catch {
      setThongBao({ loai: "canh-bao", chu: T.khongChepDuoc });
      document.querySelector<HTMLInputElement>('[data-testid="o-link-gia-dinh"]')?.select();
    }
  }

  async function chiaSe() {
    if (!diaChi) return;
    try {
      await navigator.share({ text: tinNhanMauGiaDinh(diaChi) });
    } catch {
      // Người dùng đóng bảng chia sẻ — không phải lỗi.
    }
  }

  function ketQuaTao(d: { duongDan: string; luuDiaChiDuoc: boolean; lark: KetQuaGhiLark | null }, chuXong: string) {
    setDuongDanTam(d.luuDiaChiDuoc ? null : d.duongDan);
    setVuaThuHoi(false);
    const lark = moTaLark(d.lark);
    if (!d.luuDiaChiDuoc) setThongBao({ loai: "canh-bao", chu: T.luuDiaChiHong });
    else setThongBao({ loai: lark?.loai ?? "ok", chu: lark ? `${chuXong} ${lark.chu}` : chuXong });
  }

  async function tao() {
    setThongBao(null);
    setDangLam("tao");
    const r = await taoLinkGiaDinh(customerId, loiChuoi);
    if (r.ok) ketQuaTao(r.data, T.daTao);
    else setThongBao({ loai: "loi", chu: r.loi });
    await tai();
    setDangLam(null);
  }

  /** Nút XÁC NHẬN của hộp thoại — chỗ DUY NHẤT gọi đổi / thu hồi / ghi Lark. */
  async function xacNhan() {
    const h = hop;
    if (!h) return;
    setThongBao(null);
    setDangLam(h);
    if (h === "doi") {
      const r = await doiLinkGiaDinh(customerId, loiChuoi);
      if (r.ok) ketQuaTao(r.data, T.doi.xong);
      else setThongBao({ loai: "loi", chu: r.loi });
    } else if (h === "thu-hoi") {
      const r = await thuHoiLinkGiaDinh(customerId, loiChuoi);
      if (r.ok) {
        setVuaThuHoi(true);
        setDuongDanTam(null);
        setThongBao({ loai: "ok", chu: T.thuHoiHop.xong });
      } else setThongBao({ loai: "loi", chu: r.loi });
    } else {
      const r = await ghiLarkGiaDinh(customerId, loiChuoi);
      if (r.ok) setThongBao(moTaLark(r.data.lark) ?? { loai: "ok", chu: "" });
      else setThongBao({ loai: "loi", chu: r.loi });
    }
    setHop(null);
    await tai();
    setDangLam(null);
  }

  if (an) return null;

  return (
    <KhoiLinkGiaDinhView
      dangTai={dangTai}
      loiTai={loiTai}
      du={du}
      diaChi={diaChi}
      vuaThuHoi={vuaThuHoi}
      hop={hop}
      dangLam={dangLam}
      thongBao={thongBao}
      daChep={daChep}
      coTheChiaSe={coTheChiaSe}
      chatUrl={chatUrl}
      onTao={() => void tao()}
      onMoHop={(h) => {
        setThongBao(null);
        setHop(h);
      }}
      onDongHop={() => dangLam === null && setHop(null)}
      onXacNhan={() => void xacNhan()}
      onChepLink={() => void chep(diaChi, "link")}
      onChepTinNhan={() => void chep(diaChi ? tinNhanMauGiaDinh(diaChi) : null, "tin")}
      onChiaSe={() => void chiaSe()}
    />
  );
}
