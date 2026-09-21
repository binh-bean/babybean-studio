"use client";

/**
 * Màn Vai trò và quyền — BB-172 chặng 2b.
 *
 * OWNER: DEV-FE.
 *
 * Chín vai hệ thống hiện ở đây dạng CHỈ ĐỌC: chúng là thứ cả lớp RLS đang dựa
 * vào, và ADR-0007 chốt `owner` bất biến để chủ studio không tự nhốt mình ngoài
 * hệ thống. Vai tự tạo thì sửa và xoá được.
 *
 * Ô tích nào chưa có hiệu lực thì NÓI RA. Giấu đi thì người ta tích một ô rồi
 * tưởng vừa đổi được cái gì — đúng lớp lỗi "im lặng" cả dự án đang dọn.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Card, Spinner, Badge } from "@/components/ui";
import { vi } from "@/i18n/vi";

const t = vi.admin.vaiTro;

interface Quyen {
  ma: string;
  ten: string;
  nhom: string;
  dangCoHieuLuc?: boolean;
}

interface Vai {
  id: string;
  name: string;
  permissions: string[];
  isSystem: boolean;
  soNguoiDangGiu: number;
}

export function RolesManager() {
  const [vaiDS, setVaiDS] = useState<Vai[]>([]);
  const [quyenDS, setQuyenDS] = useState<Quyen[]>([]);
  const [dangTai, setDangTai] = useState(true);
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState<string | null>(null);

  const [dangChon, setDangChon] = useState<string | null>(null);
  const [tenNhap, setTenNhap] = useState("");
  const [quyenNhap, setQuyenNhap] = useState<Set<string>>(new Set());
  const [dangLuu, setDangLuu] = useState(false);

  const tai = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await fetch("/api/admin/roles", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiTai);
      setVaiDS(json.data.items);
      setQuyenDS(json.data.danhMucQuyen);
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiTai);
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  function moVaiMoi() {
    setDangChon("moi");
    setTenNhap("");
    setQuyenNhap(new Set());
    setXong(null);
  }

  function moSua(v: Vai) {
    setDangChon(v.id);
    setTenNhap(v.name);
    setQuyenNhap(new Set(v.permissions));
    setXong(null);
  }

  async function luu() {
    setDangLuu(true);
    setLoi(null);
    try {
      const than = { name: tenNhap, permissions: [...quyenNhap] };
      const res =
        dangChon === "moi"
          ? await fetch("/api/admin/roles", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(than),
            })
          : await fetch(`/api/admin/roles/${dangChon}`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(than),
            });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiLuu);
      setXong(t.daLuu);
      setDangChon(null);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiLuu);
    } finally {
      setDangLuu(false);
    }
  }

  async function xoa(v: Vai) {
    if (!window.confirm(t.hoiXoa.replace("{ten}", v.name))) return;
    setLoi(null);
    try {
      const res = await fetch(`/api/admin/roles/${v.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiXoa);
      setXong(t.daXoa);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiXoa);
    }
  }

  if (dangTai) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  const nhomDS = [...new Set(quyenDS.map((q) => q.nhom))];

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--bb-fg-muted)]">{t.subtitle}</p>

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

      <Card className="p-4 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t.dsVai}</h2>
          <Button onClick={moVaiMoi}>{t.taoVai}</Button>
        </div>

        <ul className="divide-y divide-[var(--bb-border)]">
          {vaiDS.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="font-medium">{v.name}</span>
              {v.isSystem && <Badge>{t.vaiHeThong}</Badge>}
              <span className="text-xs text-[var(--bb-fg-muted)]">
                {t.soQuyen.replace("{n}", String(v.permissions.length))} ·{" "}
                {t.soNguoi.replace("{n}", String(v.soNguoiDangGiu))}
              </span>
              <span className="ml-auto flex gap-2">
                <Button variant="ghost" onClick={() => moSua(v)}>
                  {v.isSystem ? t.xem : t.sua}
                </Button>
                {!v.isSystem && (
                  <Button variant="ghost" onClick={() => void xoa(v)}>
                    {t.xoa}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {dangChon && (
        <Card className="p-4 md:p-6">
          <h2 className="mb-4 text-lg font-semibold">
            {dangChon === "moi" ? t.taoVai : t.suaVai.replace("{ten}", tenNhap)}
          </h2>

          {(() => {
            const vai = vaiDS.find((v) => v.id === dangChon);
            const chiDoc = Boolean(vai?.isSystem);
            return (
              <>
                {chiDoc && (
                  <p className="mb-4 rounded-lg border border-[var(--bb-border)] px-3 py-2 text-sm text-[var(--bb-fg-muted)]">
                    {t.canhBaoHeThong}
                  </p>
                )}

                <div className="mb-4 max-w-sm">
                  <label className="mb-1 block text-sm font-medium">{t.tenVai}</label>
                  <Input
                    value={tenNhap}
                    disabled={chiDoc}
                    onChange={(e) => setTenNhap(e.target.value)}
                  />
                </div>

                <div className="space-y-5">
                  {nhomDS.map((nhom) => (
                    <div key={nhom}>
                      <h3 className="mb-2 text-sm font-semibold">{nhom}</h3>
                      <div className="grid gap-2 md:grid-cols-2">
                        {quyenDS
                          .filter((q) => q.nhom === nhom)
                          .map((q) => (
                            <label key={q.ma} className="flex items-start gap-2 text-sm">
                              <input
                                type="checkbox"
                                className="mt-1"
                                disabled={chiDoc}
                                checked={quyenNhap.has(q.ma)}
                                onChange={(e) =>
                                  setQuyenNhap((s) => {
                                    const moi = new Set(s);
                                    if (e.target.checked) moi.add(q.ma);
                                    else moi.delete(q.ma);
                                    return moi;
                                  })
                                }
                              />
                              <span>
                                {q.ten}
                                {!q.dangCoHieuLuc && (
                                  <span className="ml-1 text-xs text-[var(--bb-fg-muted)]">
                                    {t.chuaCoHieuLuc}
                                  </span>
                                )}
                              </span>
                            </label>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 flex items-center gap-3">
                  {!chiDoc && (
                    <Button onClick={() => void luu()} disabled={dangLuu}>
                      {dangLuu ? t.dangLuu : t.luu}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => setDangChon(null)}>
                    {t.dong}
                  </Button>
                </div>
              </>
            );
          })()}
        </Card>
      )}

      <p className="text-xs text-[var(--bb-fg-muted)]">{t.ghiChuHieuLuc}</p>
    </div>
  );
}
