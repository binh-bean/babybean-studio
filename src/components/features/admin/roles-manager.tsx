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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

  /**
   * Hỏi lại bằng BẢNG NỔI, không dùng `window.confirm`.
   *
   * Hai lý do, cùng một gốc: hộp thoại của trình duyệt không phải giao diện
   * của mình. Nó hiện ra ở nơi khác, mang phông chữ khác, và bị chặn im lặng
   * trong một số trình duyệt hay chế độ tự động — bấm Xoá xong không có gì xảy
   * ra và không ai biết vì sao. Chủ studio 22/09/2026 cũng chốt hướng này cho
   * khung tạo vai trò: "hiện bảng nổi để điền".
   */
  const [hoiXoaVai, setHoiXoaVai] = useState<Vai | null>(null);

  async function xoa(v: Vai) {
    setHoiXoaVai(null);
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

  /**
   * Vai đã có ĐỦ mọi quyền trong danh mục.
   *
   * Chủ studio 22/09/2026: "vai trò admin của tôi là full tính năng và là mặc
   * định, không cần cài đặt và sửa ở trong giao diện với vai trò này". Đúng
   * vậy — đo trên cơ sở dữ liệu cùng ngày: `owner` và `admin` đều giữ đủ
   * 39/39 quyền của danh mục, không thiếu ô nào.
   *
   * Nên với những vai đó, bày ra bức tường 39 ô tích ĐÃ TÍCH SẴN và KHOÁ CỨNG
   * chỉ làm người đọc phải dò xem có ô nào hở không. Thay bằng một câu.
   */
  const laToanQuyen = (v: Vai) =>
    quyenDS.length > 0 && quyenDS.every((q) => v.permissions.includes(q.ma));

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
            /*
              Hai cột, không phải một hàng tự xuống dòng.

              Trước đó tên vai, hai cái nhãn, dòng đếm và hai cái nút nằm chung
              một hàng `flex-wrap` với `ml-auto`: thêm nhãn "Toàn quyền" vào là
              hàng dài quá chỗ, hai cái nút rơi xuống dòng dưới — và rơi ở dòng
              nào thì tuỳ độ dài tên vai, nên mỗi hàng lệch một kiểu.
            */
            <li key={v.id} className="flex items-start justify-between gap-3 py-3">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="font-medium">{v.name}</span>
                {v.isSystem && <Badge>{t.vaiHeThong}</Badge>}
                {laToanQuyen(v) && <Badge variant="success">{t.toanQuyen}</Badge>}
                <span className="text-xs text-[var(--bb-fg-muted)]">
                  {t.soQuyen.replace("{n}", String(v.permissions.length))} ·{" "}
                  {t.soNguoi.replace("{n}", String(v.soNguoiDangGiu))}
                </span>
              </div>
              {/*
                Vai hệ thống thì hai nút Sửa và Xoá vẫn HIỆN, chỉ mờ đi và có
                tooltip nói lý do.

                Chủ studio 22/09/2026: "phần vai trò có thêm nhưng chưa có sửa
                xoá". Trước đó hai nút ấy bị ẩn hẳn với vai hệ thống — mà cả
                chín vai đang có đều là vai hệ thống, nên màn hình trông như
                chưa làm xong chức năng. Mờ mà thấy được thì người dùng biết
                chức năng CÓ, và biết vì sao ở đây nó tắt.
              */}
              <span className="flex shrink-0 gap-2">
                <Button variant="ghost" size="sm" onClick={() => moSua(v)}>
                  {v.isSystem ? t.xem : t.sua}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={v.isSystem}
                  title={v.isSystem ? t.khongSuaDuoc : undefined}
                  onClick={() => setHoiXoaVai(v)}
                  className={v.isSystem ? "opacity-40" : undefined}
                >
                  {t.xoa}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/*
        Bảng NỔI, không phải một khối chạy xuống dưới trang.

        Chủ studio 22/09/2026: "khi tạo sẽ hiện bảng nổi để điền chứ không chạy
        xuống dưới như vậy". Trước đó khung điền nằm ngay dưới danh sách chín
        vai, nên bấm "Tạo vai trò" xong màn hình không nhúc nhích — khung điền
        nằm ngoài tầm nhìn, đúng lớp lỗi đã gặp ở màn Khách hàng sáng nay.
      */}
      <Dialog open={dangChon !== null} onOpenChange={(m) => !m && setDangChon(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {dangChon === "moi"
                ? t.taoVai
                : /* Vai hệ thống chỉ xem được, nên tiêu đề đừng hứa là sửa. */
                  (vaiDS.find((v) => v.id === dangChon)?.isSystem ? t.xemVai : t.suaVai).replace(
                    "{ten}",
                    tenNhap,
                  )}
            </DialogTitle>
          </DialogHeader>

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

                {vai && laToanQuyen(vai) ? (
                  /*
                    Vai toàn quyền: một câu thay cho 39 ô tích khoá cứng. Xem
                    ghi chú ở `laToanQuyen`.
                  */
                  <p className="rounded-lg border border-[var(--bb-success)] bg-[var(--bb-success-soft)] px-3 py-3 text-sm">
                    {t.moTaToanQuyen.replace("{n}", String(quyenDS.length))}
                  </p>
                ) : (
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
                )}

                <DialogFooter>
                  <Button variant="ghost" onClick={() => setDangChon(null)}>
                    {t.dong}
                  </Button>
                  {!chiDoc && (
                    <Button onClick={() => void luu()} disabled={dangLuu}>
                      {dangLuu ? t.dangLuu : t.luu}
                    </Button>
                  )}
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      <Dialog open={hoiXoaVai !== null} onOpenChange={(m) => !m && setHoiXoaVai(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.xoa}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-[var(--bb-fg-muted)]">
            {t.hoiXoa.replace("{ten}", hoiXoaVai?.name ?? "")}
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setHoiXoaVai(null)}>
              {t.dong}
            </Button>
            <Button
              variant="danger"
              onClick={() => hoiXoaVai && void xoa(hoiXoaVai)}
            >
              {t.xoa}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <p className="text-xs text-[var(--bb-fg-muted)]">{t.ghiChuHieuLuc}</p>
    </div>
  );
}
