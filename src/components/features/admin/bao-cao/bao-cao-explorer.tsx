/**
 * Trung tâm báo cáo điều hành — cột trái danh sách, cột phải báo cáo đã chọn.
 *
 * OWNER: DEV-FE (khung do DEV-BE dựng theo brief BB-260). Task BB-260.
 *
 * Mọi lựa chọn lọc (báo cáo, kỳ, so kỳ trước, chi nhánh, gom nhóm) được lưu
 * vào query string qua `router.replace` — mở lại link là ra đúng màn đã xem,
 * không cần bấm lại từng bộ lọc.
 */

"use client";

import React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Link2, History, CloudOff, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { BieuDoSvg } from "./bieu-do-svg";
import type { KetQuaBaoCao } from "@/lib/bao-cao/loai";
import { CAC_KY_DUNG_SAN, dinhDangNgayVN, kyTuMaDungSan, type MaKyDungSan } from "@/lib/bao-cao/ky";

interface MucBaoCao {
  ma: string;
  ten: string;
  moTa: string;
  nhom: string;
  quyen: string;
  boLoc: { kySoSanh?: boolean; theoNhanVien?: boolean };
}

interface ChiNhanh {
  id: string;
  name: string;
}

/** Bốn báo cáo lẻ đã có trước BB-260 — giữ nguyên trang, chỉ gắn vào đây như mục danh sách. */
const BAO_CAO_CU: { ten: string; href: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { ten: "Ảnh vượt hạn mức", href: "/admin/reports/over-quota", icon: AlertTriangle },
  { ten: "Bộ ảnh lỗi tải", href: "/admin/reports/loi-dong-bo", icon: CloudOff },
  { ten: "Link sắp hết hạn", href: "/admin/reports/link-sap-het-han", icon: Link2 },
  { ten: "Nhật ký thao tác", href: "/admin/reports/nhat-ky", icon: History },
];

const TEN_NHOM: Record<string, string> = {
  "van-hanh": "Vận hành",
  "doanh-thu": "Doanh thu",
  "nhan-vien": "Nhân viên",
  "tai-chinh": "Tài chính",
  khac: "Khác",
};

function suyRaKyPreset(sp: URLSearchParams): MaKyDungSan | "tuy-chon" {
  const v = sp.get("kyPreset");
  if (v && CAC_KY_DUNG_SAN.some((k) => k.ma === v)) return v as MaKyDungSan;
  return "7-ngay";
}

export function BaoCaoExplorer() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [danhSach, setDanhSach] = React.useState<MucBaoCao[] | null>(null);
  const [loiDanhSach, setLoiDanhSach] = React.useState<string | null>(null);
  const [chiNhanhs, setChiNhanhs] = React.useState<ChiNhanh[]>([]);

  const maDangChon = searchParams.get("ma");
  const kyPreset = suyRaKyPreset(searchParams);
  const tuTuyChon = searchParams.get("tu") ?? "";
  const denTuyChon = searchParams.get("den") ?? "";
  const nhom = (searchParams.get("nhom") as "ngay" | "tuan" | "thang") || "ngay";
  const soSanh = searchParams.get("soSanh") === "1";
  const chiNhanhChon = searchParams.get("chiNhanh") ?? "";

  const capNhatUrl = React.useCallback(
    (thayDoi: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(thayDoi)) {
        if (v === null || v === "") sp.delete(k);
        else sp.set(k, v);
      }
      router.replace(`${pathname}?${sp.toString()}`);
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/bao-cao");
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setLoiDanhSach(json?.error?.message ?? "Không tải được danh sách báo cáo");
          return;
        }
        const ds: MucBaoCao[] = json.data.danhSach;
        setDanhSach(ds);
        if (!maDangChon && ds[0]) {
          capNhatUrl({ ma: ds[0].ma });
        }
      } catch {
        if (alive) setLoiDanhSach("Mất kết nối, thử lại giúp.");
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/branches");
        const json = await res.json().catch(() => null);
        if (!alive || !res.ok) return;
        setChiNhanhs(
          (json.data.branches as { id: string; name: string; isActive: boolean }[])
            .filter((b) => b.isActive)
            .map((b) => ({ id: b.id, name: b.name })),
        );
      } catch {
        /* Bộ lọc chi nhánh không có thì vẫn xem được báo cáo — bỏ qua lặng lẽ. */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const nhomHoa = React.useMemo(() => {
    const g = new Map<string, MucBaoCao[]>();
    for (const b of danhSach ?? []) {
      if (!g.has(b.nhom)) g.set(b.nhom, []);
      g.get(b.nhom)!.push(b);
    }
    return g;
  }, [danhSach]);

  const baoCaoHienTai = danhSach?.find((b) => b.ma === maDangChon) ?? null;

  // Khoảng ngày THẬT SỰ gửi lên API — preset thì tính ra ngày cụ thể để URL
  // luôn trỏ đúng một khoảng, không đổi ý nghĩa qua từng ngày mở lại link.
  const { tuGui, denGui } = React.useMemo(() => {
    if (kyPreset === "tuy-chon" && tuTuyChon && denTuyChon) {
      return { tuGui: tuTuyChon, denGui: denTuyChon };
    }
    const k = kyTuMaDungSan(kyPreset === "tuy-chon" ? "7-ngay" : kyPreset, new Date());
    const denInclusive = new Date(k.den.getTime() - 1);
    return { tuGui: dinhDangNgayVN(k.tu), denGui: dinhDangNgayVN(denInclusive) };
  }, [kyPreset, tuTuyChon, denTuyChon]);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
      <aside className="shrink-0 lg:w-72">
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--bb-font-display)" }}
        >
          Báo cáo
        </h1>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          Bộ báo cáo điều hành — chọn một báo cáo để xem chi tiết.
        </p>

        {loiDanhSach && <p className="mt-4 text-sm text-[var(--bb-danger)]">{loiDanhSach}</p>}
        {!danhSach && !loiDanhSach && (
          <div className="mt-4 flex items-center gap-2 text-sm text-[var(--bb-fg-muted)]">
            <Spinner className="h-4 w-4" /> Đang tải…
          </div>
        )}

        <nav className="mt-4 flex flex-col gap-4">
          {[...nhomHoa.entries()].map(([nhom, items]) => (
            <div key={nhom}>
              <div className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--bb-fg-muted)]">
                {TEN_NHOM[nhom] ?? nhom}
              </div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {items.map((b) => (
                  <li key={b.ma}>
                    <button
                      type="button"
                      onClick={() => capNhatUrl({ ma: b.ma })}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                        b.ma === maDangChon
                          ? "bg-[var(--bb-primary)]/20 font-medium text-[var(--bb-fg)]"
                          : "text-[var(--bb-fg-muted)] hover:bg-[var(--bb-surface-2)]"
                      }`}
                      title={b.moTa}
                    >
                      {b.ten}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-[var(--bb-fg-muted)]">
              Báo cáo khác
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {BAO_CAO_CU.map((b) => (
                <li key={b.href}>
                  <a
                    href={b.href}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[var(--bb-fg-muted)] hover:bg-[var(--bb-surface-2)]"
                  >
                    <b.icon className="h-4 w-4 shrink-0" />
                    {b.ten}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </aside>

      <section className="min-w-0 flex-1">
        {!maDangChon || !baoCaoHienTai ? (
          <p className="text-sm text-[var(--bb-fg-muted)]">Chọn một báo cáo ở danh sách bên trái.</p>
        ) : (
          <NoiDungBaoCao
            key={baoCaoHienTai.ma}
            baoCao={baoCaoHienTai}
            kyPreset={kyPreset}
            tuTuyChon={tuTuyChon}
            denTuyChon={denTuyChon}
            tuGui={tuGui}
            denGui={denGui}
            nhom={nhom}
            soSanh={soSanh}
            chiNhanhChon={chiNhanhChon}
            chiNhanhs={chiNhanhs}
            onDoiFilter={capNhatUrl}
          />
        )}
      </section>
    </div>
  );
}

function NoiDungBaoCao({
  baoCao,
  kyPreset,
  tuTuyChon,
  denTuyChon,
  tuGui,
  denGui,
  nhom,
  soSanh,
  chiNhanhChon,
  chiNhanhs,
  onDoiFilter,
}: {
  baoCao: MucBaoCao;
  kyPreset: MaKyDungSan | "tuy-chon";
  tuTuyChon: string;
  denTuyChon: string;
  tuGui: string;
  denGui: string;
  nhom: "ngay" | "tuan" | "thang";
  soSanh: boolean;
  chiNhanhChon: string;
  chiNhanhs: ChiNhanh[];
  onDoiFilter: (thayDoi: Record<string, string | null>) => void;
}) {
  const [dangTai, setDangTai] = React.useState(true);
  const [loi, setLoi] = React.useState<string | null>(null);
  const [ketQua, setKetQua] = React.useState<KetQuaBaoCao | null>(null);

  const queryChung = React.useMemo(() => {
    const sp = new URLSearchParams();
    sp.set("tu", tuGui);
    sp.set("den", denGui);
    sp.set("nhom", nhom);
    if (soSanh) sp.set("soSanh", "1");
    if (chiNhanhChon) sp.set("chiNhanh", chiNhanhChon);
    return sp;
  }, [tuGui, denGui, nhom, soSanh, chiNhanhChon]);

  React.useEffect(() => {
    let alive = true;
    setDangTai(true);
    setLoi(null);
    (async () => {
      try {
        const res = await fetch(`/api/admin/bao-cao/${baoCao.ma}?${queryChung.toString()}`);
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setLoi(json?.error?.message ?? "Không tải được báo cáo");
          return;
        }
        setKetQua(json.data.ketQua);
      } catch {
        if (alive) setLoi("Mất kết nối, thử lại giúp.");
      } finally {
        if (alive) setDangTai(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [baoCao.ma, queryChung]);

  const urlCsv = `/api/admin/bao-cao/${baoCao.ma}?${queryChung.toString()}&dinhDang=csv`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold" style={{ fontFamily: "var(--bb-font-display)" }}>
            {baoCao.ten}
          </h2>
          <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">{baoCao.moTa}</p>
        </div>
        {ketQua?.bang && (
          <a href={urlCsv} download>
            <Button variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Xuất CSV
            </Button>
          </a>
        )}
      </header>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <Field label="Kỳ" htmlFor="bao-cao-ky">
            <Select
              id="bao-cao-ky"
              value={kyPreset}
              onChange={(e) => {
                const v = e.target.value as MaKyDungSan | "tuy-chon";
                if (v === "tuy-chon") {
                  onDoiFilter({
                    kyPreset: v,
                    tu: tuTuyChon || tuGui,
                    den: denTuyChon || denGui,
                  });
                } else {
                  onDoiFilter({ kyPreset: v, tu: null, den: null });
                }
              }}
              className="w-40"
            >
              {CAC_KY_DUNG_SAN.map((k) => (
                <option key={k.ma} value={k.ma}>
                  {k.ten}
                </option>
              ))}
              <option value="tuy-chon">Tuỳ chọn…</option>
            </Select>
          </Field>

          {kyPreset === "tuy-chon" && (
            <>
              <Field label="Từ ngày" htmlFor="bao-cao-tu">
                <input
                  id="bao-cao-tu"
                  type="date"
                  value={tuTuyChon || tuGui}
                  max={denTuyChon || denGui}
                  onChange={(e) => onDoiFilter({ tu: e.target.value })}
                  className="h-11 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)] px-3 text-sm"
                />
              </Field>
              <Field label="Đến ngày" htmlFor="bao-cao-den">
                <input
                  id="bao-cao-den"
                  type="date"
                  value={denTuyChon || denGui}
                  min={tuTuyChon || tuGui}
                  onChange={(e) => onDoiFilter({ den: e.target.value })}
                  className="h-11 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)] px-3 text-sm"
                />
              </Field>
            </>
          )}

          <Field label="Gom theo" htmlFor="bao-cao-nhom">
            <Select
              id="bao-cao-nhom"
              value={nhom}
              onChange={(e) => onDoiFilter({ nhom: e.target.value })}
              className="w-32"
            >
              <option value="ngay">Ngày</option>
              <option value="tuan">Tuần</option>
              <option value="thang">Tháng</option>
            </Select>
          </Field>

          {chiNhanhs.length > 0 && (
            <Field label="Chi nhánh" htmlFor="bao-cao-chi-nhanh">
              <Select
                id="bao-cao-chi-nhanh"
                value={chiNhanhChon}
                onChange={(e) => onDoiFilter({ chiNhanh: e.target.value || null })}
                className="w-44"
              >
                <option value="">Mọi chi nhánh được xem</option>
                {chiNhanhs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          {baoCao.boLoc.kySoSanh && (
            <label className="flex items-center gap-2 pb-2 text-sm text-[var(--bb-fg)]">
              <Checkbox
                checked={soSanh}
                onCheckedChange={(checked) => onDoiFilter({ soSanh: checked ? "1" : null })}
              />
              So với kỳ trước
            </label>
          )}
        </CardContent>
      </Card>

      {dangTai && (
        <div className="flex items-center gap-2 text-sm text-[var(--bb-fg-muted)]">
          <Spinner className="h-4 w-4" /> Đang tải báo cáo…
        </div>
      )}
      {loi && <p className="text-sm text-[var(--bb-danger)]">{loi}</p>}

      {!dangTai && !loi && ketQua && khongCoSoLieu(ketQua) && (
        // Kỳ chưa có gì: một hàng ô "0" trông như báo cáo hỏng. Tranh banana
        // BB-262 tràn khung + một câu, nhưng VẪN giữ các ô số bên dưới để người
        // xem thấy đúng là 0 chứ không phải tải lỗi.
        <div className="overflow-hidden rounded-lg border border-[var(--bb-border)] bg-[#fbf7f2]">
          <img
            src="/minh-hoa/bao-cao-trong-1280.webp"
            srcSet="/minh-hoa/bao-cao-trong-640.webp 640w, /minh-hoa/bao-cao-trong-1280.webp 1280w"
            sizes="(max-width: 768px) 100vw, 800px"
            alt=""
            width={1280}
            height={714}
            className="h-44 w-full object-cover object-center sm:h-56"
          />
          <p className="px-4 py-3 text-center text-sm text-[var(--bb-fg-muted)]">
            Kỳ này chưa có số liệu — thử chọn kỳ dài hơn hoặc chi nhánh khác.
          </p>
        </div>
      )}

      {!dangTai && !loi && ketQua && (
        <>
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {ketQua.theSo.map((t) => (
              <TheSoCard key={t.nhan} theSo={t} />
            ))}
          </section>

          {ketQua.bieuDo && (
            <Card>
              <CardContent className="p-4">
                <BieuDoSvg bieuDo={ketQua.bieuDo} />
              </CardContent>
            </Card>
          )}

          {ketQua.bang && <BangSapXep bang={ketQua.bang} />}

          {ketQua.ghiChu && ketQua.ghiChu.length > 0 && (
            <div className="flex flex-col gap-1 rounded-md border border-[var(--bb-border)] p-3 text-xs text-[var(--bb-fg-muted)]">
              {ketQua.ghiChu.map((g, i) => (
                <p key={i}>{g}</p>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-xs text-[var(--bb-fg-muted)]">
        {label}
      </label>
      {children}
    </div>
  );
}

function TheSoCard({ theSo }: { theSo: KetQuaBaoCao["theSo"][number] }) {
  const co = typeof theSo.chenhLechPhanTram === "number";
  const tang = co && (theSo.chenhLechPhanTram as number) > 0;
  const giam = co && (theSo.chenhLechPhanTram as number) < 0;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-[var(--bb-fg-muted)]">{theSo.nhan}</div>
        <div
          className="mt-1 text-2xl font-semibold"
          style={{ fontFamily: "var(--bb-font-display)" }}
        >
          {theSo.giaTri}
          {theSo.donVi && <span className="ml-1 text-sm font-normal text-[var(--bb-fg-muted)]">{theSo.donVi}</span>}
        </div>
        {co && (
          <div
            className={`mt-1 flex items-center gap-1 text-xs font-medium ${
              tang ? "text-[var(--bb-success)]" : giam ? "text-[var(--bb-danger)]" : "text-[var(--bb-fg-muted)]"
            }`}
          >
            {tang ? <ArrowUp className="h-3 w-3" /> : giam ? <ArrowDown className="h-3 w-3" /> : null}
            {Math.abs(theSo.chenhLechPhanTram as number).toFixed(1)}% so kỳ trước
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BangSapXep({ bang }: { bang: NonNullable<KetQuaBaoCao["bang"]> }) {
  const [cotSapXep, setCotSapXep] = React.useState<number | null>(null);
  const [tang, setTang] = React.useState(true);

  const dongDaSap = React.useMemo(() => {
    if (cotSapXep === null) return bang.dong;
    const sao = [...bang.dong];
    sao.sort((a, b) => {
      const va = a[cotSapXep];
      const vb = b[cotSapXep];
      if (typeof va === "number" && typeof vb === "number") return tang ? va - vb : vb - va;
      const sa = String(va ?? "");
      const sb = String(vb ?? "");
      return tang ? sa.localeCompare(sb, "vi") : sb.localeCompare(sa, "vi");
    });
    return sao;
  }, [bang.dong, cotSapXep, tang]);

  function bamCot(i: number) {
    if (cotSapXep === i) setTang(!tang);
    else {
      setCotSapXep(i);
      setTang(true);
    }
  }

  return (
    <Card>
      <CardContent className="overflow-x-auto p-4">
        <table className="w-full min-w-[36rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--bb-border)] text-left">
              {bang.cot.map((c, i) => (
                <th key={c} className="py-2 pr-3 font-medium">
                  <button
                    type="button"
                    onClick={() => bamCot(i)}
                    className="flex items-center gap-1 hover:text-[var(--bb-fg)]"
                  >
                    {c}
                    {cotSapXep === i ? (
                      tang ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )
                    ) : (
                      <ArrowUpDown className="h-3 w-3 opacity-40" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dongDaSap.map((dong, i) => (
              <tr key={i} className="border-b border-[var(--bb-border)]">
                {dong.map((o, j) => (
                  <td key={j} className={`py-2 pr-3 ${typeof o === "number" ? "text-right" : ""}`}>
                    {o ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
            {dongDaSap.length === 0 && (
              <tr>
                <td colSpan={bang.cot.length} className="py-4 text-center text-[var(--bb-fg-muted)]">
                  Không có dữ liệu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

/** Kỳ không có số liệu: mọi thẻ số bằng 0 (hoặc rỗng) và bảng không có dòng. */
function khongCoSoLieu(kq: KetQuaBaoCao): boolean {
  const theSoRong = kq.theSo.every((t) => (typeof t.giaTri === "number" ? t.giaTri === 0 : !t.giaTri || t.giaTri === "0"));
  return theSoRong && (!kq.bang || kq.bang.dong.length === 0);
}
