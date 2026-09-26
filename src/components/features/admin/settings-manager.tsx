"use client";

/**
 * Màn Cài đặt — BB-197.
 *
 * OWNER: DEV-FE.
 *
 * Những con số dưới đây điều khiển app thật: hạn chốt, ngày nhắc khách, hạn
 * link, watermark, cho tải, giá ảnh chọn thêm, link Messenger, webhook Lark.
 * Trước màn này, đổi một con số nghĩa là có người gõ SQL thẳng vào cơ sở
 * dữ liệu.
 *
 * Xếp theo VIỆC, không theo tên khoá: chủ studio nghĩ "album" và "ảnh", không
 * nghĩ `gallery.default_due_days`.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Card, Spinner } from "@/components/ui";
import { cn } from "@/components/ui/utils";
import { Field } from "./field";
import { vi } from "@/i18n/vi";

const t = vi.admin.caiDat;

interface CaiDat {
  key: string;
  nhom: "album" | "anh" | "quang-cao" | "lien-lac";
  biMat: boolean;
  value: unknown;
  daCauHinh: boolean;
}

const NHOM: { id: CaiDat["nhom"]; ten: string }[] = [
  { id: "album", ten: t.nhomAlbum },
  { id: "anh", ten: t.nhomAnh },
  { id: "quang-cao", ten: t.nhomQuangCao },
  { id: "lien-lac", ten: t.nhomLienLac },
];

/** Mỗi khoá một câu nói rõ nó ảnh hưởng tới ai — xem `t.moTa`. */
function moTa(key: string): string {
  return (t.moTa as Record<string, string>)[key] ?? key;
}
function nhan(key: string): string {
  return (t.nhan as Record<string, string>)[key] ?? key;
}

/** Mảng số hiện thành "3, 6" cho người, và đọc ngược lại được. */
function doiSangChu(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v === null || v === undefined) return "";
  return String(v);
}

export function SettingsManager() {
  const [items, setItems] = useState<CaiDat[]>([]);
  const [nhap, setNhap] = useState<Record<string, string | boolean>>({});
  const [dangTai, setDangTai] = useState(true);
  const [dangLuu, setDangLuu] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [xong, setXong] = useState<string | null>(null);
  // Bản vẽ quan-tri-cai-dat.webp: danh mục bên trái, một thẻ bên phải — thay
  // vì xếp cả bốn nhóm chồng lên nhau. `nhomChon` mặc định để `null` rồi gán
  // khi tải xong, vì tới lúc đó mới biết nhóm nào thật sự có mục để hiện.
  const [nhomChon, setNhomChon] = useState<CaiDat["nhom"] | null>(null);

  const tai = useCallback(async () => {
    setDangTai(true);
    setLoi(null);
    try {
      const res = await fetch("/api/admin/settings", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiTai);
      const ds: CaiDat[] = json.data.items;
      setItems(ds);
      setNhap(
        Object.fromEntries(
          ds.map((c) => [c.key, typeof c.value === "boolean" ? c.value : doiSangChu(c.value)]),
        ),
      );
      setNhomChon((hienTai) => {
        if (hienTai && ds.some((c) => c.nhom === hienTai)) return hienTai;
        return NHOM.find((n) => ds.some((c) => c.nhom === n.id))?.id ?? null;
      });
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiTai);
    } finally {
      setDangTai(false);
    }
  }, []);

  useEffect(() => {
    void tai();
  }, [tai]);

  /** Đổi chuỗi người gõ về đúng kiểu mà đường API chờ. */
  function doiVeKieu(c: CaiDat, v: string | boolean): unknown {
    if (typeof v === "boolean") return v;
    if (c.key === "gallery.reminder_days") {
      return v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .map(Number);
    }
    if (
      c.key.endsWith("_days") ||
      c.key.endsWith("_px") ||
      c.key === "gallery.extra_photo_price_default"
    )
      return Number(v);
    return v.trim();
  }

  async function luu() {
    setDangLuu(true);
    setLoi(null);
    setXong(null);
    try {
      const thayDoi = items
        // Ô bí mật để trống nghĩa là "giữ nguyên", không phải "xoá đi": giá trị
        // đọc ra đã bị che, nên gửi lại chuỗi che là ghi đè bằng rác.
        .filter((c) => !(c.biMat && !String(nhap[c.key] ?? "").trim()))
        .filter((c) => !(c.biMat && String(nhap[c.key] ?? "").includes("••")))
        .map((c) => ({ key: c.key, value: doiVeKieu(c, nhap[c.key] ?? "") }));

      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thayDoi }),
      });
      const json = await res.json();
      // Lưu hụt phải báo ĐỎ. Im lặng ở đây là người dùng tưởng đã đổi xong.
      if (!res.ok) throw new Error(json?.error?.message ?? t.loiLuu);

      const soDoi: string[] = json.data.daDoi ?? [];
      setXong(soDoi.length ? t.daLuu.replace("{n}", String(soDoi.length)) : t.khongCoGiDoi);
      await tai();
    } catch (e) {
      setLoi(e instanceof Error ? e.message : t.loiLuu);
    } finally {
      setDangLuu(false);
    }
  }

  if (dangTai) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }

  // Bản vẽ chỉ vẽ MỘT nhóm mỗi lần (danh mục trái + thẻ phải) — nhóm nào
  // không có mục nào (chưa cấu hình đủ ở máy chủ) thì không cho chọn.
  const nhomCoMuc = NHOM.filter((n) => items.some((c) => c.nhom === n.id));
  const nhomDangHien = nhomCoMuc.find((n) => n.id === nhomChon) ?? nhomCoMuc[0] ?? null;
  const cuaNhomHien = nhomDangHien ? items.filter((c) => c.nhom === nhomDangHien.id) : [];

  return (
    // Đệm dưới cùng để thanh lưu dính đáy không đè lên ô nhập cuối cùng.
    <div className="space-y-6 pb-20">
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

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <nav aria-label={t.title} className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
          {nhomCoMuc.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNhomChon(n.id)}
              aria-current={nhomDangHien?.id === n.id ? "true" : undefined}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-left text-sm font-medium transition-colors md:rounded-[var(--bb-radius-sm)]",
                nhomDangHien?.id === n.id
                  ? "bg-[var(--bb-surface)] text-[var(--bb-fg)] shadow-[var(--bb-shadow)] border border-[var(--bb-border)]"
                  : "text-[var(--bb-fg-muted)] hover:bg-[var(--bb-surface-2)]",
              )}
            >
              {n.ten}
            </button>
          ))}
        </nav>

        {nhomDangHien && (
          <Card className="p-4 md:p-6">
            <h2 className="mb-4 font-display text-lg font-semibold">{nhomDangHien.ten}</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {cuaNhomHien.map((c) => (
                <Field key={c.key} label={nhan(c.key)} hint={moTa(c.key)}>
                  {typeof c.value === "boolean" ? (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(nhap[c.key])}
                        onChange={(e) => setNhap((s) => ({ ...s, [c.key]: e.target.checked }))}
                      />
                      {nhap[c.key] ? t.dangBat : t.dangTat}
                    </label>
                  ) : (
                    <Input
                      value={String(nhap[c.key] ?? "")}
                      placeholder={c.biMat && !c.daCauHinh ? t.chuaCauHinh : undefined}
                      onChange={(e) => setNhap((s) => ({ ...s, [c.key]: e.target.value }))}
                    />
                  )}
                </Field>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/*
        Thanh lưu dính đáy theo bản vẽ quan-tri-cai-dat.webp. "Huỷ" gọi lại
        đúng hàm tải `tai()` — nạp lại giá trị đang lưu ở máy chủ, bỏ mọi ô
        đang gõ dở, không phải nút trang trí.
      */}
      <div className="sticky -bottom-4 z-10 -mx-4 border-t border-[var(--bb-border)] bg-[var(--bb-surface)] sm:-bottom-6 sm:-mx-6 lg:-bottom-8 lg:-mx-8">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <span className="hidden text-xs text-[var(--bb-fg-muted)] sm:inline">
            {t.ghiChuBiMat}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" type="button" onClick={() => void tai()} disabled={dangLuu}>
              {t.huy}
            </Button>
            <Button onClick={() => void luu()} disabled={dangLuu}>
              {dangLuu ? t.dangLuu : t.luu}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
