"use client";

/**
 * Quản lý chi nhánh — BB-063.
 *
 * OWNER: DEV-FE.
 *
 * Địa chỉ và hotline thật nằm ở đây, trong database, chứ không nằm trong
 * db/seed.sql — repo công khai, AGENTS.md §6.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { Button, Input, Badge, Card, Spinner, EmptyState } from "@/components/ui";
import { vi } from "@/i18n/vi";

const t = vi.admin.branches;

interface BranchRow {
  id: string;
  code: string;
  name: string;
  address: string | null;
  hotline: string | null;
  isActive: boolean;
  staffCount: number;
  galleryCount: number;
}

export function BranchManager() {
  const [rows, setRows] = useState<BranchRow[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/branches", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không tải được danh sách");
      setRows(body.data.branches);
      setCanCreate(body.data.canCreate);
      setCanEdit(body.data.canEdit);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, payload: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/branches/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không lưu được");
      setNotice(t.updated);
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusyId(null);
    }
  }

  function toggleActive(row: BranchRow) {
    if (row.isActive && !confirm(t.confirmClose.replace("{name}", row.name))) return;
    void patch(row.id, { isActive: !row.isActive });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 p-8 text-[var(--bb-fg-muted)]">
        <Spinner /> Đang tải…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--bb-fg)]">{t.title}</h1>
          <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">{t.subtitle}</p>
        </div>
        {canCreate && <Button onClick={() => setShowForm((v) => !v)}>{t.addButton}</Button>}
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-danger)] bg-[var(--bb-surface-2)] px-4 py-3 text-sm text-[var(--bb-danger)]"
        >
          {error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface-2)] px-4 py-3 text-sm text-[var(--bb-fg)]"
        >
          {notice}
        </div>
      )}

      {showForm && (
        <BranchForm
          submitLabel={t.save}
          onSubmit={async (payload) => {
            const res = await fetch("/api/admin/branches", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body?.error?.message ?? "Không tạo được chi nhánh");
            setShowForm(false);
            setNotice(t.created.replace("{name}", String(payload.name)));
            await load();
          }}
          onError={setError}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bb-border)] text-left text-[var(--bb-fg-muted)]">
                <th className="px-4 py-3 font-medium">{t.colCode}</th>
                <th className="px-4 py-3 font-medium">{t.colName}</th>
                <th className="px-4 py-3 font-medium">{t.colAddress}</th>
                <th className="px-4 py-3 font-medium">{t.colHotline}</th>
                <th className="px-4 py-3 font-medium">{t.colUsage}</th>
                <th className="px-4 py-3 font-medium">{t.colStatus}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <tr
                    className={`border-b border-[var(--bb-border)] last:border-0 ${
                      row.isActive ? "" : "opacity-60"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      <code className="text-[var(--bb-fg)]">{row.code}</code>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-[var(--bb-fg)]">
                      {row.name}
                    </td>
                    <td className="px-4 py-3 text-[var(--bb-fg-muted)]">
                      {row.address ?? <span className="italic">{t.noAddress}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--bb-fg-muted)]">
                      {row.hotline ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--bb-fg-muted)]">
                      {t.usage
                        .replace("{staff}", String(row.staffCount))
                        .replace("{galleries}", String(row.galleryCount))}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={row.isActive ? "default" : "secondary"}>
                        {row.isActive ? t.open : t.closed}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-nowrap justify-end gap-2">
                        {canEdit && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => setEditingId(editingId === row.id ? null : row.id)}
                          >
                            {editingId === row.id ? t.cancel : t.edit}
                          </Button>
                        )}
                        {canCreate && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => toggleActive(row)}
                          >
                            {row.isActive ? t.close : t.reopen}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {editingId === row.id && (
                    <tr className="border-b border-[var(--bb-border)] bg-[var(--bb-surface-2)]">
                      <td colSpan={7} className="px-4 py-4">
                        <BranchForm
                          initial={row}
                          submitLabel={t.save}
                          onSubmit={(payload) => patch(row.id, payload)}
                          onError={setError}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function BranchForm({
  initial,
  submitLabel,
  onSubmit,
  onError,
}: {
  initial?: BranchRow;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [hotline, setHotline] = useState(initial?.hotline ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError("");
    try {
      await onSubmit({
        code: code.trim().toUpperCase(),
        name: name.trim(),
        address: address.trim() === "" ? null : address.trim(),
        hotline: hotline.trim() === "" ? null : hotline.trim(),
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không lưu được");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className={initial ? "border-0 bg-transparent p-0 shadow-none" : "p-5"}>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t.colCode} hint={t.codeHint}>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            spellCheck={false}
            placeholder="BB-Q1"
          />
        </Field>

        <Field label={t.colName}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            placeholder="BabyBean Quận 1"
          />
        </Field>

        <Field label={t.colAddress}>
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="95 Pasteur, Quận 1, TP.HCM"
          />
        </Field>

        <Field label={t.colHotline}>
          <Input
            value={hotline}
            onChange={(e) => setHotline(e.target.value)}
            inputMode="tel"
            placeholder="0901 234 567"
          />
        </Field>

        <div className="sm:col-span-2 flex items-center justify-between gap-4 pt-1">
          <p className="text-xs text-[var(--bb-fg-muted)]">{t.privacyNote}</p>
          <Button type="submit" disabled={saving}>
            {saving ? t.saving : submitLabel}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-[var(--bb-fg)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-[var(--bb-fg-muted)]">{hint}</span>}
    </label>
  );
}
