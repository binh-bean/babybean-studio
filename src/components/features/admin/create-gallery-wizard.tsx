"use client";

/**
 * Wizard tạo bộ ảnh — BB-022.
 *
 * OWNER: DEV-FE.
 * Spec: docs/07-ui-ux.md §4.3, docs/04-api-spec.md §3.9 và §4.1
 *
 * Bản đầu tiên của màn hình này là hàng giả: handleCheckDrive và handleSubmit
 * đều là setTimeout trả về dữ liệu cứng, nên dán link Drive nào cũng ra "862
 * ảnh, Bé Bơ 3 tháng", và bấm tạo bộ ảnh thì không có gì được ghi vào database —
 * chỉ hiện một link mock123 không mở được. Giờ nó gọi API thật:
 *
 *   POST /api/admin/galleries/preview   đọc thư mục Drive
 *   POST /api/admin/galleries           tạo bộ ảnh, sinh token chia sẻ
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input, Select, Card, Spinner, Checkbox } from "@/components/ui";
import { Field, RequiredLegend } from "./field";
import { vi } from "@/i18n/vi";
import { formatNgayVN, formatSdt } from "@/lib/utils/dinh-dang";
import { dinhDangNghin, docSoNghin } from "@/lib/utils/so-tien-nhap";

const w = vi.admin.wizard;

interface PreviewData {
  folderId: string;
  folderName: string;
  fileCount: number;
  subfolders: string[];
  sample: { fileName: string; thumbnailUrl: string | null }[];
}

interface Options {
  branches: { id: string; name: string }[];
  packages: {
    id: string;
    name: string;
    branchId: string | null;
    includedQuota: number;
    extraPhotoPrice: number;
  }[];
  photographers: { id: string; name: string; branchIds: string[] }[];
  /** Hạn chốt mặc định, do chủ studio đặt trong màn Cài đặt. */
  macDinhHanChotNgay?: number;
  /** Giá một ảnh chọn thêm mặc định, do chủ studio đặt trong màn Cài đặt. */
  macDinhGiaAnhChonThem?: number;
}

interface ResultData {
  galleryId: string;
  shareUrl: string;
  lark?: { recordId: string; maHoaDon: string; linkLark: string | null };
}

/** BB-325 — bộ ảnh đã có trong app (trả từ API khi trùng thư mục / dòng Lark). */
interface BoAnhDaCo {
  id: string;
  tieuDe: string;
  thongTin: string;
  tuLark: boolean;
}

/** BB-325 — một dòng Hậu Kỳ bên Lark (xem src/lib/lark/tra-hau-ky.ts). */
interface DongHauKy {
  recordId: string;
  maHoaDon: string;
  tenMe: string;
  soDienThoai: string;
  tenBe: string;
  goiChup: string;
  ngayChup: string | null;
  tongFileEdit: number | null;
  linkLark: string | null;
  boAnhDaCo: BoAnhDaCo | null;
}

/** Lỗi Drive kèm hướng dẫn từng bước, không phải lỗi kỹ thuật. */
interface FieldError {
  message: string;
  howToFix?: string[];
  /** BB-325 — bộ ảnh đang giữ thư mục / dòng Lark này, để mở thẳng. */
  boAnhDaCo?: BoAnhDaCo;
}

/** BB-325 — thẻ "đã có bộ ảnh X" kèm link mở bộ đó. */
function TheBoAnhDaCo({ bo, nhan }: { bo: BoAnhDaCo; nhan: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface)] px-3 py-2 text-[var(--bb-fg)]">
      <div className="min-w-0">
        <p className="text-xs text-[var(--bb-fg-muted)]">{nhan}</p>
        <p className="truncate font-medium">{bo.tieuDe}</p>
        {bo.thongTin && <p className="truncate text-xs tabular-nums text-[var(--bb-fg-muted)]">{bo.thongTin}</p>}
      </div>
      <Link
        href={`/admin/galleries/${encodeURIComponent(bo.id)}`}
        className="shrink-0 text-sm font-medium text-[var(--bb-primary)] underline underline-offset-2"
      >
        {w.openGallery} →
      </Link>
    </div>
  );
}

/** Một ô thông tin chỉ đọc lấy từ Lark. */
function OLark({ nhan, giaTri }: { nhan: string; giaTri: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-[var(--bb-fg-muted)]">{nhan}</dt>
      <dd className={giaTri ? "text-sm text-[var(--bb-fg)]" : "text-sm italic text-[var(--bb-fg-muted)]"}>
        {giaTri || w.emptyValue}
      </dd>
    </div>
  );
}

/**
 * BB-332 — mở từ khối "Bản ghi mới từ Lark" (Bàn làm việc) với mã dòng Lark:
 * đọc dòng đó, điền sẵn mã hóa đơn + SĐT (+ link Drive nếu Lark đã có) rồi tự
 * tra Lark một lần.
 */
export function CreateGalleryWizard({ banGhiLark }: { banGhiLark?: string | null } = {}) {
  const [step, setStep] = useState(1);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<FieldError | null>(null);

  const [driveUrl, setDriveUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const [branchId, setBranchId] = useState("");
  const [photographerId, setPhotographerId] = useState("");
  // BB-325 — thông tin khách/bé/gói KHÔNG gõ tay nữa: tra dòng Hậu Kỳ bên Lark.
  const [maHoaDon, setMaHoaDon] = useState("");
  const [sdtTra, setSdtTra] = useState("");
  const [dangTra, setDangTra] = useState(false);
  const [cacDong, setCacDong] = useState<DongHauKy[]>([]);
  const [dongChon, setDongChon] = useState<DongHauKy | null>(null);

  const [quota, setQuota] = useState(20);
  const [extraPrice, setExtraPrice] = useState(50000);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [download, setDownload] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [copied, setCopied] = useState(false);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/galleries/options", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không tải được danh sách");
      setOptions(body.data);
      if (body.data.branches.length === 1) setBranchId(body.data.branches[0].id);
      // Số ngày này do chủ studio đặt trong màn Cài đặt. Chôn cứng ở đây thì ô
      // cài đặt kia không điều khiển gì cả.
      if (typeof body.data.macDinhHanChotNgay === "number") {
        setDeadlineDays(body.data.macDinhHanChotNgay);
      }
      // Giá ảnh chọn thêm: cùng lý do với hạn chốt ở trên (BB-214c). Chọn gói
      // sau đó vẫn ghi đè giá này bằng giá riêng của gói, xem effect bên dưới.
      if (typeof body.data.macDinhGiaAnhChonThem === "number") {
        setExtraPrice(body.data.macDinhGiaAnhChonThem);
      }
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Không tải được danh sách" });
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  // BB-325 — chọn dòng Lark thì lấy "Tổng file edit" làm số ảnh trong gói.
  // Giá ảnh thêm KHÔNG lấy theo gói nữa: bảng `packages` cũ là dữ liệu mẫu
  // ("Gói Cao cấp" 40.000đ) — giá mặc định là số trong Cài đặt (50.000đ).
  useEffect(() => {
    if (dongChon?.tongFileEdit) setQuota(dongChon.tongFileEdit);
  }, [dongChon]);

  async function traLark(ma = maHoaDon, sdt = sdtTra) {
    setDangTra(true);
    setError(null);
    setCacDong([]);
    setDongChon(null);
    try {
      const res = await fetch("/api/admin/galleries/tra-lark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maHoaDon: ma, soDienThoai: sdt }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError({ message: body?.error?.message ?? "Không tra được Lark" });
        return;
      }
      const ds = (body.data?.dong ?? []) as DongHauKy[];
      setCacDong(ds);
      if (ds.length === 1) setDongChon(ds[0] ?? null);
    } catch {
      setError({ message: "Không kết nối được máy chủ." });
    } finally {
      setDangTra(false);
    }
  }

  // BB-332 — đến từ "Bản ghi mới từ Lark": đọc dòng, điền sẵn, tra Lark một lần.
  useEffect(() => {
    if (!banGhiLark) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/admin/lark-moi?ma=${encodeURIComponent(banGhiLark)}`, { cache: "no-store" });
        const body = await res.json().catch(() => null);
        const d = body?.data?.banGhi as { maHoaDon: string | null; soDienThoai: string | null; driveUrl: string | null } | null;
        if (!alive || !res.ok || !d) return;
        if (d.driveUrl) setDriveUrl(d.driveUrl);
        setMaHoaDon(d.maHoaDon ?? "");
        setSdtTra(d.soDienThoai ?? "");
        if (d.maHoaDon && d.soDienThoai) void traLark(d.maHoaDon, d.soDienThoai);
      } catch {
        // Không đọc được thì thuật sĩ trống như cũ — nhân viên gõ tay.
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ chạy lúc mở trang
  }, [banGhiLark]);

  async function checkDrive() {
    setChecking(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/galleries/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveUrl }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError({
          message: body?.error?.message ?? "Không đọc được thư mục",
          howToFix: body?.error?.details?.howToFix,
          boAnhDaCo: body?.error?.details?.boAnhDaCo,
        });
        return;
      }
      setPreview(body.data);
    } catch {
      setError({ message: "Không kết nối được máy chủ." });
    } finally {
      setChecking(false);
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + deadlineDays);

      const res = await fetch("/api/admin/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branchId,
          larkHaukyRecordId: dongChon?.recordId,
          photographerId: photographerId || null,
          driveUrl,
          includedQuota: quota,
          extraPhotoPrice: extraPrice,
          dueAt: dueAt.toISOString(),
          options: { download, notes: true, invite: true },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError({
          message: body?.error?.message ?? "Không tạo được bộ ảnh",
          boAnhDaCo: body?.error?.details?.boAnhDaCo,
        });
        return;
      }
      setResult(body.data);
      setStep(4);
    } catch {
      setError({ message: "Không kết nối được máy chủ." });
    } finally {
      setSubmitting(false);
    }
  }

  const photographersForBranch = (options?.photographers ?? []).filter(
    (p) => p.branchIds.length === 0 || p.branchIds.includes(branchId),
  );

  const canLeaveStep1 = preview !== null;
  const canLeaveStep2 = branchId !== "" && dongChon !== null && !dongChon.boAnhDaCo;

  // --- Bước 4: kết quả ------------------------------------------------------

  if (step === 4 && result) {
    return (
      <Card className="mx-auto max-w-xl space-y-4 p-6 text-center">
        <h2 className="text-xl font-semibold text-[var(--bb-fg)]">{w.successTitle}</h2>

        <div className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface-2)] p-3">
          <code className="break-all text-sm text-[var(--bb-fg)]">{result.shareUrl}</code>
        </div>

        {/* BB-325 ("đi về đâu") — nói rõ link này gắn với dòng Lark nào. */}
        {result.lark && (
          <p className="text-sm text-[var(--bb-fg-muted)]">
            {w.linkedLarkRow.replace("{code}", result.lark.maHoaDon)}{" "}
            {result.lark.linkLark && (
              <a
                href={result.lark.linkLark}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--bb-primary)] underline underline-offset-2"
              >
                {w.openLarkRow}
              </a>
            )}
          </p>
        )}

        <div className="flex flex-wrap justify-center gap-2">
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(result.shareUrl);
              setCopied(true);
            }}
          >
            {copied ? w.copied : w.copyLinkCta}
          </Button>
          <Button
            variant="outline"
            onClick={() => window.location.assign(`/admin/galleries/${encodeURIComponent(result.galleryId)}`)}
          >
            {w.openGallery}
          </Button>
          <Button variant="outline" onClick={() => window.location.assign("/admin/galleries")}>
            {w.backToList}
          </Button>
        </div>
      </Card>
    );
  }

  // --- Bước 1-3 -------------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {[1, 2, 3].map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                step >= s
                  ? "bg-[var(--bb-primary)] text-[var(--bb-primary-fg)]"
                  : "bg-[var(--bb-surface-2)] text-[var(--bb-fg-muted)]"
              }`}
            >
              {s}
            </span>
            <span className={step === s ? "text-[var(--bb-fg)]" : "text-[var(--bb-fg-muted)]"}>
              {s === 1 ? w.stepSource : s === 2 ? w.stepInfo : w.stepRules}
            </span>
            {s < 3 && <span className="mx-1 text-[var(--bb-fg-muted)]">›</span>}
          </li>
        ))}
      </ol>

      {error && (
        <div
          role="alert"
          className="space-y-2 rounded-[var(--bb-radius-sm)] border border-[var(--bb-danger)] bg-[var(--bb-surface-2)] px-4 py-3 text-sm text-[var(--bb-danger)]"
        >
          <p>{error.message}</p>
          {error.boAnhDaCo && (
            <TheBoAnhDaCo
              bo={error.boAnhDaCo}
              nhan={error.boAnhDaCo.tuLark ? w.folderFromLark : w.folderHasGallery}
            />
          )}
          {error.howToFix && (
            <ol className="list-decimal space-y-1 pl-5 text-[var(--bb-fg)]">
              {error.howToFix.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      <Card className="space-y-5 p-5">
        {step === 1 && (
          <>
            <Field label={w.driveLinkTitle} hint={w.driveLinkDesc} required>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={driveUrl}
                  onChange={(e) => setDriveUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                  spellCheck={false}
                />
                {/* BB-290 (#44): khi khoá, màu mặc định (hồng đất ở
                    opacity-50) nhạt thành #F2C9C0 — đọc như trạng thái LỖI,
                    không phải "chưa đủ điều kiện bấm". Ép màu trung tính khi
                    khoá, không đổi `button.tsx` dùng chung toàn hệ. */}
                <Button
                  onClick={checkDrive}
                  disabled={checking || driveUrl.trim() === ""}
                  className={
                    driveUrl.trim() === "" && !checking
                      ? "disabled:!bg-[var(--bb-border)] disabled:!text-[var(--bb-fg-muted)] disabled:!opacity-100"
                      : undefined
                  }
                >
                  {checking ? w.checkingDrive : w.checkDriveLink}
                </Button>
              </div>
            </Field>

            {checking && (
              <div className="flex items-center gap-3 text-sm text-[var(--bb-fg-muted)]">
                <Spinner /> {w.checkingDrive}
              </div>
            )}

            {preview && (
              <div className="space-y-3 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] p-4">
                <p className="font-medium text-[var(--bb-fg)]">{preview.folderName}</p>
                <p className="text-sm text-[var(--bb-fg-muted)]">
                  {w.fileCount.replace("{n}", String(preview.fileCount))}
                  {preview.subfolders.length > 0 &&
                    ` · ${w.subfolders.replace("{n}", String(preview.subfolders.length))}`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {preview.sample.map((s) =>
                    s.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={s.fileName}
                        src={s.thumbnailUrl}
                        alt={s.fileName}
                        className="h-16 w-16 rounded object-cover"
                      />
                    ) : (
                      <div
                        key={s.fileName}
                        className="h-16 w-16 rounded bg-[var(--bb-surface-2)]"
                        title={s.fileName}
                      />
                    ),
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={w.branch} required>
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">{w.choose}</option>
                  {(options?.branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label={w.photographer}>
                <Select
                  value={photographerId}
                  onChange={(e) => setPhotographerId(e.target.value)}
                  disabled={branchId === ""}
                >
                  <option value="">{w.choose}</option>
                  {photographersForBranch.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            {/* BB-325 — thông tin khách lấy từ dòng Hậu Kỳ bên Lark, không gõ tay. */}
            <div className="space-y-3 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] p-4">
              <div>
                <p className="font-medium text-[var(--bb-fg)]">{w.larkTitle}</p>
                <p className="text-xs text-[var(--bb-fg-muted)]">{w.larkDesc}</p>
              </div>
              <form
                className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start"
                onSubmit={(e) => {
                  e.preventDefault();
                  void traLark();
                }}
              >
                <Field label={w.invoiceCode} hint={w.invoiceHint} required>
                  <Input
                    name="maHoaDon"
                    value={maHoaDon}
                    onChange={(e) => setMaHoaDon(e.target.value)}
                    placeholder="HD_20260901#01"
                    spellCheck={false}
                  />
                </Field>
                <Field label={w.customerPhone} required>
                  <Input
                    name="soDienThoai"
                    value={sdtTra}
                    onChange={(e) => setSdtTra(e.target.value)}
                    inputMode="tel"
                    placeholder="0901234567"
                  />
                </Field>
                <Button
                  type="submit"
                  disabled={dangTra || maHoaDon.trim() === "" || sdtTra.trim() === ""}
                  className="sm:mt-6"
                >
                  {dangTra ? w.lookingUpLark : w.lookupLark}
                </Button>
              </form>

              {cacDong.length > 1 && (
                <fieldset className="space-y-2">
                  <legend className="text-sm text-[var(--bb-fg)]">{w.larkPickOne}</legend>
                  {cacDong.map((d) => (
                    <label key={d.recordId} className="flex items-center gap-2 text-sm text-[var(--bb-fg)]">
                      <input
                        type="radio"
                        name="dongLark"
                        checked={dongChon?.recordId === d.recordId}
                        onChange={() => setDongChon(d)}
                      />
                      <span className="tabular-nums">
                        {d.maHoaDon} · {d.goiChup || "—"} · {d.ngayChup ? formatNgayVN(d.ngayChup) : "—"}
                        {d.tenBe ? ` · ${d.tenBe}` : ""}
                      </span>
                    </label>
                  ))}
                </fieldset>
              )}

              {dongChon && (
                <div className="space-y-3">
                  <p className="text-sm font-medium text-[var(--bb-fg)]">{w.larkFound}</p>
                  <dl className="grid gap-3 sm:grid-cols-3">
                    <OLark nhan={w.motherName} giaTri={dongChon.tenMe} />
                    <OLark nhan={w.babyName} giaTri={dongChon.tenBe} />
                    <OLark nhan={w.customerPhone} giaTri={formatSdt(dongChon.soDienThoai)} />
                    <OLark nhan={w.invoiceCode} giaTri={dongChon.maHoaDon} />
                    <OLark nhan={w.packageSelect} giaTri={dongChon.goiChup} />
                    <OLark nhan={w.shootDate} giaTri={dongChon.ngayChup ? formatNgayVN(dongChon.ngayChup) : null} />
                  </dl>
                  {dongChon.linkLark && (
                    <a
                      href={dongChon.linkLark}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-sm font-medium text-[var(--bb-primary)] underline underline-offset-2"
                    >
                      {w.openLarkRow} ↗
                    </a>
                  )}
                  {dongChon.boAnhDaCo && <TheBoAnhDaCo bo={dongChon.boAnhDaCo} nhan={w.alreadyHasGallery} />}
                </div>
              )}

              {!dongChon && cacDong.length === 0 && (
                <p className="text-xs text-[var(--bb-fg-muted)]">{w.needLark}</p>
              )}
            </div>

            <RequiredLegend />
          </div>
        )}

        {step === 3 && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={w.quota} hint={w.quotaHint} required>
              <Input
                type="number"
                min={1}
                value={quota}
                onChange={(e) => setQuota(Number(e.target.value))}
              />
            </Field>

            <Field label={w.extraPrice} required>
              {/* BB-325 — dấu chấm ngăn nghìn ("50.000"): type=number không hiện được. */}
              <Input
                name="giaAnhThem"
                inputMode="numeric"
                value={dinhDangNghin(extraPrice)}
                onChange={(e) => setExtraPrice(docSoNghin(e.target.value))}
              />
            </Field>

            <Field label={w.deadline} hint={w.deadlineHint} required>
              <Input
                type="number"
                min={1}
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(Number(e.target.value))}
              />
            </Field>

            <div className="space-y-3 pt-6">
              <label className="flex items-center gap-2 text-sm text-[var(--bb-fg)]">
                {/* BB-294 (#19) — ô tick hệ thiết kế, không phải mặc định trình duyệt. */}
                <Checkbox checked={download} onCheckedChange={setDownload} />
                {w.allowDownload}
              </label>
            </div>

            <div className="sm:col-span-2">
              <RequiredLegend />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--bb-border)] pt-4">
          <Button variant="outline" disabled={step === 1} onClick={() => setStep(step - 1)}>
            {w.back}
          </Button>

          {step < 3 ? (
            // BB-290 (#44): cùng lý do với nút "Kiểm tra thư mục" — màu
            // trung tính khi khoá, không phải hồng nhạt trông như lỗi.
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canLeaveStep1 : !canLeaveStep2}
              className="disabled:!bg-[var(--bb-border)] disabled:!text-[var(--bb-fg-muted)] disabled:!opacity-100"
            >
              {w.next}
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting}>
              {submitting ? w.creating : w.create}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
