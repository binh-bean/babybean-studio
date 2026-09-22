"use client";

/**
 * Màn Khách hàng — BB-061.
 *
 * OWNER: DEV-FE.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tra theo SỐ ĐIỆN THOẠI là việc chính
 * ---------------------------------------------------------------------------
 * CSKH nhận điện thoại, và thứ duy nhất họ cầm trong tay là số gọi đến. Trước
 * màn này, đường tra duy nhất là ô tìm ở danh sách bộ ảnh — nên khách gọi
 * TRƯỚC khi có bộ ảnh thì tra không ra, và nhân viên phải mở Lark.
 *
 * Người ta đọc số cho nhau kiểu "0938 125 568", dán vào có khi thành
 * "(+84) 938125568". Nên ô tìm bỏ hết ký tự không phải số rồi mới so — giống
 * đúng cách cột `phone_normalized` được sinh ra bên cơ sở dữ liệu.
 *
 * ---------------------------------------------------------------------------
 * Hai thứ màn hình phải NÓI RA thay vì để người dùng đoán
 * ---------------------------------------------------------------------------
 *  1. Hồ sơ đến từ Lark thì tên, số và ghi chú sẽ bị lần đồng bộ sau ghi đè.
 *     Không nói ra thì CSKH sửa số sai, hôm sau số cũ quay lại, và họ kết luận
 *     là app hỏng.
 *  2. Cùng một số có thể có hồ sơ ở chi nhánh khác — chống trùng chỉ chặn
 *     trong PHẠM VI một chi nhánh (uq_customers_phone_branch).
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Card, Spinner, Badge } from "@/components/ui";
import { GALLERY_STATUS_LABEL } from "@/lib/gallery-status";
import { vi } from "@/i18n/vi";

const t = vi.admin.khachHang;

interface DongKhach {
  id: string;
  fullName: string;
  phone: string | null;
  branchId: string;
  branchName: string;
  soBoAnh: number;
  boAnhMoiNhat: string | null;
  trungSdtChiNhanhKhac: boolean;
}

interface Be {
  id: string;
  fullName: string;
  nickname: string | null;
  birthDate: string | null;
  gender: string | null;
  note: string | null;
}

interface BoAnh {
  id: string;
  title: string;
  status: string;
  branchName: string;
  createdAt: string;
  submittedAt: string | null;
  photoCount: number;
  includedQuota: number | null;
  contractCodes: string[];
}

interface ChiTiet {
  khach: {
    id: string;
    fullName: string;
    phone: string | null;
    email: string | null;
    zalo: string | null;
    address: string | null;
    note: string | null;
    branchName: string;
    createdAt: string;
    tuLark: boolean;
    truongBiGhiDe: string[];
  };
  be: Be[];
  boAnh: BoAnh[];
  trungSdt: { id: string | null; branchName: string; fullName: string | null; phone: string | null }[];
}

export function CustomersManager({
  coQuyenSua,
  coQuyenXoa,
}: {
  coQuyenSua: boolean;
  coQuyenXoa: boolean;
}) {
  const [tuKhoa, setTuKhoa] = useState("");
  const [items, setItems] = useState<DongKhach[]>([]);
  const [tong, setTong] = useState(0);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [dangMo, setDangMo] = useState<string | null>(null);

  const tai = useCallback(async (q: string) => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(q)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiTai);
      setItems(json.data.items);
      setTong(json.data.total);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiTai);
    } finally {
      setDangTai(false);
    }
  }, []);

  // Gõ tới đâu tìm tới đó, nhưng chờ người ta gõ xong một nhịp rồi mới hỏi
  // máy chủ — gõ mười chữ số mà bắn mười câu truy vấn là tự làm chậm mình.
  useEffect(() => {
    const h = setTimeout(() => void tai(tuKhoa.trim()), 300);
    return () => clearTimeout(h);
  }, [tuKhoa, tai]);

  return (
    <div className="min-w-0 space-y-5">
      <p className="text-sm text-[var(--bb-fg-muted)]">{t.subtitle}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <label htmlFor="tim-khach" className="sr-only">
            {t.oTim}
          </label>
          <Input
            id="tim-khach"
            value={tuKhoa}
            placeholder={t.oTim}
            inputMode="search"
            onChange={(e) => setTuKhoa(e.target.value)}
          />
        </div>
        {tuKhoa && (
          <Button variant="ghost" size="sm" onClick={() => setTuKhoa("")}>
            {t.xoaTim}
          </Button>
        )}
      </div>
      <p className="text-xs text-[var(--bb-fg-muted)]">{t.goiY}</p>

      {loi && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--bb-danger)] bg-[var(--bb-danger-soft)] px-4 py-3 text-sm"
        >
          {loi}
        </div>
      )}

      {dangTai ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">{tuKhoa ? t.trong : t.trongBanDau}</p>
      ) : (
        <>
          {/* Dưới `lg` mỗi khách là một thẻ — bảng năm cột không vừa 375px. */}
          <ul className="flex flex-col gap-2 lg:hidden">
            {items.map((k) => (
              <li key={k.id}>
                <button
                  type="button"
                  onClick={() => setDangMo(k.id)}
                  className="w-full rounded-lg border border-[var(--bb-border)] p-3 text-left text-sm hover:bg-[var(--bb-surface-2)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 break-words font-medium">{k.fullName}</span>
                    <span className="shrink-0 text-xs text-[var(--bb-fg-muted)]">
                      {k.branchName}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--bb-fg-muted)]">
                    <span className="select-all font-mono">{k.phone ?? t.chuaCoSdt}</span>
                    <span>
                      {k.soBoAnh} {t.cot.soBo.toLowerCase()}
                    </span>
                    {k.boAnhMoiNhat && <span>{ngay(k.boAnhMoiNhat)}</span>}
                  </div>
                  {k.trungSdtChiNhanhKhac && (
                    <Badge variant="warning" className="mt-2">
                      {t.trungChiNhanhKhac}
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[42rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--bb-border)] text-left">
                  <th className="py-2 pr-3 font-medium">{t.cot.ten}</th>
                  <th className="py-2 pr-3 font-medium">{t.cot.sdt}</th>
                  <th className="py-2 pr-3 font-medium">{t.cot.chiNhanh}</th>
                  <th className="py-2 pr-3 text-right font-medium">{t.cot.soBo}</th>
                  <th className="py-2 pr-3 font-medium">{t.cot.ganNhat}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((k) => (
                  <tr
                    key={k.id}
                    className="cursor-pointer border-b border-[var(--bb-border)] hover:bg-[var(--bb-surface-2)]"
                    onClick={() => setDangMo(k.id)}
                  >
                    <td className="py-2 pr-3">
                      <button type="button" className="text-left font-medium hover:underline">
                        {k.fullName}
                      </button>
                      {k.trungSdtChiNhanhKhac && (
                        <Badge variant="warning" className="ml-2 align-middle">
                          {t.trungChiNhanhKhac}
                        </Badge>
                      )}
                    </td>
                    {/* select-all để bôi một phát rồi dán sang Zalo hoặc Lark */}
                    <td className="select-all py-2 pr-3 font-mono text-xs">
                      {k.phone ?? t.chuaCoSdt}
                    </td>
                    <td className="py-2 pr-3">{k.branchName}</td>
                    <td className="py-2 pr-3 text-right">{k.soBoAnh}</td>
                    <td className="py-2 pr-3">{k.boAnhMoiNhat ? ngay(k.boAnhMoiNhat) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Danh sách cắt ở 50 dòng. Nói ra, chứ im lặng thì người ta tưởng
              chi nhánh chỉ có đúng ngần này khách. */}
          {tong > items.length && (
            <p className="text-xs text-[var(--bb-fg-muted)]">
              {t.conNua.replace("{n}", String(items.length)).replace("{tong}", String(tong))}
            </p>
          )}
        </>
      )}

      {dangMo && (
        <HoSoKhach
          id={dangMo}
          coQuyenSua={coQuyenSua}
          coQuyenXoa={coQuyenXoa}
          onDong={() => setDangMo(null)}
          onDaDoi={() => void tai(tuKhoa.trim())}
        />
      )}
    </div>
  );
}

function HoSoKhach({
  id,
  coQuyenSua,
  coQuyenXoa,
  onDong,
  onDaDoi,
}: {
  id: string;
  coQuyenSua: boolean;
  coQuyenXoa: boolean;
  onDong: () => void;
  onDaDoi: () => void;
}) {
  const [ct, setCt] = useState<ChiTiet | null>(null);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState<string | null>(null);
  const [dangSua, setDangSua] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [dangLuu, setDangLuu] = useState(false);
  const [beMoi, setBeMoi] = useState<{ fullName: string; birthDate: string } | null>(null);

  const tai = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiTai);
      setCt(json.data);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiTai);
    } finally {
      setDangTai(false);
    }
  }, [id]);

  useEffect(() => {
    void tai();
  }, [tai]);

  function moSua() {
    if (!ct) return;
    setForm({
      fullName: ct.khach.fullName ?? "",
      phone: ct.khach.phone ?? "",
      email: ct.khach.email ?? "",
      zalo: ct.khach.zalo ?? "",
      address: ct.khach.address ?? "",
      note: ct.khach.note ?? "",
    });
    setXong(null);
    setDangSua(true);
  }

  async function luu() {
    setDangLuu(true);
    setLoi(null);
    try {
      // Ô để trống nghĩa là xoá giá trị, nên gửi null chứ không gửi chuỗi rỗng
      // — cột email là citext và chuỗi rỗng không phải email hợp lệ.
      const rong = (k: string) => (form[k] ?? "").trim() === "" ? null : form[k];
      const than = {
        fullName: form.fullName ?? "",
        phone: rong("phone"),
        email: rong("email"),
        zalo: rong("zalo"),
        address: rong("address"),
        note: rong("note"),
      };
      const res = await fetch(`/api/admin/customers/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(than),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiLuu);
      setXong(t.daLuu);
      setDangSua(false);
      await tai();
      onDaDoi();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiLuu);
    } finally {
      setDangLuu(false);
    }
  }

  async function themBe() {
    if (!beMoi?.fullName.trim()) return;
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}/babies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fullName: beMoi.fullName,
          birthDate: beMoi.birthDate.trim() === "" ? null : beMoi.birthDate,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiLuu);
      setBeMoi(null);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiLuu);
    }
  }

  async function xoaBe(b: Be) {
    if (!window.confirm(t.hoiXoaBe.replace("{ten}", b.fullName))) return;
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/customers/${id}/babies/${b.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiLuu);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiLuu);
    }
  }

  return (
    <Card className="min-w-0 space-y-5 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">{t.hoSo}</h2>
        <Button variant="ghost" size="sm" onClick={onDong}>
          {t.dong}
        </Button>
      </div>

      {loi && (
        <div
          role="alert"
          className="rounded-lg border border-[var(--bb-danger)] bg-[var(--bb-danger-soft)] px-4 py-3 text-sm"
        >
          {loi}
        </div>
      )}
      {xong && (
        <div
          role="status"
          className="rounded-lg border border-[var(--bb-success)] bg-[var(--bb-success-soft)] px-4 py-3 text-sm"
        >
          {xong}
        </div>
      )}

      {dangTai ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : !ct ? null : (
        <>
          {ct.khach.truongBiGhiDe.length > 0 && (
            <p className="rounded-lg border border-[var(--bb-warning)] bg-[var(--bb-warning)]/10 px-3 py-2 text-sm">
              {t.canhBaoLark}
            </p>
          )}

          {dangSua ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {(["fullName", "phone", "email", "zalo", "address", "note"] as const).map((k) => (
                <div key={k} className={k === "note" ? "sm:col-span-2" : undefined}>
                  <label htmlFor={`kh-${k}`} className="mb-1 block text-sm font-medium">
                    {t.nhan[k]}
                  </label>
                  <Input
                    id={`kh-${k}`}
                    value={form[k] ?? ""}
                    onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="flex gap-2 sm:col-span-2">
                <Button onClick={() => void luu()} disabled={dangLuu}>
                  {dangLuu ? t.dangLuu : t.luu}
                </Button>
                <Button variant="ghost" onClick={() => setDangSua(false)}>
                  {t.huy}
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[8rem_1fr]">
              <Dong nhan={t.nhan.fullName} giaTri={ct.khach.fullName} />
              <Dong nhan={t.nhan.phone} giaTri={ct.khach.phone ?? t.chuaCoSdt} chon />
              <Dong nhan={t.nhan.email} giaTri={ct.khach.email} />
              <Dong nhan={t.nhan.zalo} giaTri={ct.khach.zalo} />
              <Dong nhan={t.nhan.address} giaTri={ct.khach.address} />
              <Dong nhan={t.nhan.note} giaTri={ct.khach.note} />
              <Dong nhan={t.cot.chiNhanh} giaTri={ct.khach.branchName} />
            </dl>
          )}

          {coQuyenSua && !dangSua && (
            <Button variant="outline" size="sm" onClick={moSua}>
              {t.sua}
            </Button>
          )}

          <section>
            <h3 className="mb-2 text-sm font-semibold">{t.dsBe}</h3>
            {ct.be.length === 0 ? (
              <p className="text-sm text-[var(--bb-fg-muted)]">{t.chuaCoBe}</p>
            ) : (
              <ul className="divide-y divide-[var(--bb-border)]">
                {ct.be.map((b) => (
                  <li key={b.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <span className="min-w-0 break-words font-medium">{b.fullName}</span>
                    {b.nickname && (
                      <span className="text-xs text-[var(--bb-fg-muted)]">({b.nickname})</span>
                    )}
                    <span className="text-xs text-[var(--bb-fg-muted)]">
                      {b.birthDate ? ngay(b.birthDate) : t.chuaCoNgaySinh}
                    </span>
                    {coQuyenXoa && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-auto"
                        onClick={() => void xoaBe(b)}
                      >
                        {t.xoaBe}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {coQuyenSua &&
              (beMoi ? (
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="be-ten" className="mb-1 block text-xs font-medium">
                      {t.tenBe}
                    </label>
                    <Input
                      id="be-ten"
                      value={beMoi.fullName}
                      onChange={(e) => setBeMoi({ ...beMoi, fullName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label htmlFor="be-ngay" className="mb-1 block text-xs font-medium">
                      {t.ngaySinh}
                    </label>
                    <Input
                      id="be-ngay"
                      type="date"
                      value={beMoi.birthDate}
                      onChange={(e) => setBeMoi({ ...beMoi, birthDate: e.target.value })}
                    />
                  </div>
                  <Button size="sm" onClick={() => void themBe()}>
                    {t.luu}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setBeMoi(null)}>
                    {t.huy}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setBeMoi({ fullName: "", birthDate: "" })}
                >
                  {t.themBe}
                </Button>
              ))}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold">{t.lichSu}</h3>
            {ct.boAnh.length === 0 ? (
              <p className="text-sm text-[var(--bb-fg-muted)]">{t.chuaCoBo}</p>
            ) : (
              <ul className="divide-y divide-[var(--bb-border)]">
                {ct.boAnh.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm">
                    <Link
                      href={`/admin/galleries/${g.id}`}
                      className="min-w-0 break-words font-medium text-[var(--bb-primary)] hover:underline"
                    >
                      {g.title}
                    </Link>
                    <span className="text-xs text-[var(--bb-fg-muted)]">
                      {GALLERY_STATUS_LABEL[g.status as keyof typeof GALLERY_STATUS_LABEL] ??
                        g.status}
                    </span>
                    <span className="text-xs text-[var(--bb-fg-muted)]">{ngay(g.createdAt)}</span>
                    <span className="ml-auto shrink-0 text-xs text-[var(--bb-fg-muted)]">
                      {g.photoCount} ảnh
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {ct.trungSdt.length > 0 && (
            <section>
              <h3 className="mb-1 text-sm font-semibold">{t.trungSdt}</h3>
              <p className="mb-2 text-xs text-[var(--bb-fg-muted)]">{t.trungSdtGiaiThich}</p>
              <ul className="space-y-1 text-sm">
                {ct.trungSdt.map((x, i) => (
                  <li key={x.id ?? `${x.branchName}-${i}`} className="flex flex-wrap gap-2">
                    <span>{x.branchName}</span>
                    {/* Hồ sơ ở chi nhánh mình không có quyền thì chỉ nói là CÓ,
                        không hiện tên và số của khách bên đó. */}
                    <span className="text-[var(--bb-fg-muted)]">
                      {x.fullName ?? t.khongXemDuoc}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Card>
  );
}

function Dong({ nhan, giaTri, chon }: { nhan: string; giaTri: string | null; chon?: boolean }) {
  return (
    <>
      <dt className="text-[var(--bb-fg-muted)]">{nhan}</dt>
      <dd className={chon ? "select-all break-words font-mono text-xs" : "break-words"}>
        {giaTri ?? "—"}
      </dd>
    </>
  );
}

function ngay(value: string): string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("vi-VN");
}
