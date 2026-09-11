"use client";

/**
 * Wizard tạo album — BB-022.
 *
 * OWNER: DEV-FE.
 * Spec: docs/07-ui-ux.md §4.3, docs/04-api-spec.md §3.9 và §4.1
 *
 * Bản đầu tiên của màn hình này là hàng giả: handleCheckDrive và handleSubmit
 * đều là setTimeout trả về dữ liệu cứng, nên dán link Drive nào cũng ra "862
 * ảnh, Bé Bơ 3 tháng", và bấm tạo album thì không có gì được ghi vào database —
 * chỉ hiện một link mock123 không mở được. Giờ nó gọi API thật:
 *
 *   POST /api/admin/galleries/preview   đọc thư mục Drive
 *   POST /api/admin/galleries           tạo album, sinh token chia sẻ
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Card, Spinner } from "@/components/ui";
import { Field, RequiredLegend } from "./field";
import { vi } from "@/i18n/vi";

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
}

interface ResultData {
  galleryId: string;
  shareUrl: string;
  pinHint: string | null;
}

/** Lỗi Drive kèm hướng dẫn từng bước, không phải lỗi kỹ thuật. */
interface FieldError {
  message: string;
  howToFix?: string[];
}

export function CreateGalleryWizard() {
  const [step, setStep] = useState(1);
  const [options, setOptions] = useState<Options | null>(null);
  const [error, setError] = useState<FieldError | null>(null);

  const [driveUrl, setDriveUrl] = useState("");
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const [branchId, setBranchId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [babyName, setBabyName] = useState("");
  const [shootDate, setShootDate] = useState("");
  const [photographerId, setPhotographerId] = useState("");
  const [packageId, setPackageId] = useState("");

  const [quota, setQuota] = useState(20);
  const [extraPrice, setExtraPrice] = useState(50000);
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [requirePin, setRequirePin] = useState(true);
  const [watermark, setWatermark] = useState(true);

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
    } catch (e) {
      setError({ message: e instanceof Error ? e.message : "Không tải được danh sách" });
    }
  }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  // Chọn gói thì lấy luôn hạn mức và giá ảnh thêm của gói đó làm mặc định,
  // người tạo album vẫn sửa đè được cho từng trường hợp.
  useEffect(() => {
    const pkg = options?.packages.find((p) => p.id === packageId);
    if (pkg) {
      setQuota(pkg.includedQuota);
      setExtraPrice(pkg.extraPhotoPrice);
    }
  }, [packageId, options]);

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
          newCustomer: { fullName: customerName, phone: customerPhone },
          newBaby: babyName ? { fullName: babyName } : undefined,
          packageId,
          photographerId: photographerId || null,
          shootDate: shootDate || null,
          title: babyName ? `${babyName} — ${preview?.folderName ?? ""}`.trim() : preview?.folderName,
          driveUrl,
          includedQuota: quota,
          extraPhotoPrice: extraPrice,
          dueAt: dueAt.toISOString(),
          options: { requirePin, watermark, download: false, notes: true, invite: true },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError({ message: body?.error?.message ?? "Không tạo được album" });
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

  const packagesForBranch = (options?.packages ?? []).filter(
    (p) => p.branchId === null || p.branchId === branchId,
  );
  const photographersForBranch = (options?.photographers ?? []).filter(
    (p) => p.branchIds.length === 0 || p.branchIds.includes(branchId),
  );

  const canLeaveStep1 = preview !== null;
  const canLeaveStep2 =
    branchId !== "" && customerName.trim() !== "" && customerPhone.trim() !== "" && packageId !== "";

  // --- Bước 4: kết quả ------------------------------------------------------

  if (step === 4 && result) {
    return (
      <Card className="mx-auto max-w-xl space-y-4 p-6 text-center">
        <h2 className="text-xl font-semibold text-[var(--bb-fg)]">{w.successTitle}</h2>

        <div className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface-2)] p-3">
          <code className="break-all text-sm text-[var(--bb-fg)]">{result.shareUrl}</code>
        </div>

        {result.pinHint && (
          <p className="text-sm text-[var(--bb-fg-muted)]">
            {w.pinLabel}: <strong className="text-[var(--bb-fg)]">{result.pinHint}</strong>
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
                <Button onClick={checkDrive} disabled={checking || driveUrl.trim() === ""}>
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

            <Field label={w.packageSelect} required>
              <Select
                value={packageId}
                onChange={(e) => setPackageId(e.target.value)}
                disabled={branchId === ""}
              >
                <option value="">{w.choose}</option>
                {packagesForBranch.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label={w.customerTitle} required>
              <Input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Nguyễn Thị Mai"
              />
            </Field>

            <Field label={w.customerPhone} required>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                inputMode="tel"
                placeholder="0901234567"
              />
            </Field>

            <Field label={w.babyName}>
              <Input value={babyName} onChange={(e) => setBabyName(e.target.value)} />
            </Field>

            <Field label={w.shootDate}>
              <Input type="date" value={shootDate} onChange={(e) => setShootDate(e.target.value)} />
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

            <div className="sm:col-span-2">
              <RequiredLegend />
            </div>
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
              <Input
                type="number"
                min={0}
                step={1000}
                value={extraPrice}
                onChange={(e) => setExtraPrice(Number(e.target.value))}
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
                <input
                  type="checkbox"
                  checked={requirePin}
                  onChange={(e) => setRequirePin(e.target.checked)}
                />
                {w.pinRequired}
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--bb-fg)]">
                <input
                  type="checkbox"
                  checked={watermark}
                  onChange={(e) => setWatermark(e.target.checked)}
                />
                {w.watermark}
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
            <Button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 ? !canLeaveStep1 : !canLeaveStep2}
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
