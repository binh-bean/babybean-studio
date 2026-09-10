"use client";

/**
 * Quản lý nhân sự — BB-063.
 *
 * OWNER: DEV-FE.
 * Spec: docs/13-quyet-dinh-van-hanh.md §8
 *
 * Chủ studio tự đặt tên tài khoản và mật khẩu. Không có màn hình đăng ký công
 * khai: hệ thống này chứa ảnh trẻ em, tài khoản phải do người biết mặt nhân
 * viên cấp ra.
 */

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Badge, Card, Spinner, EmptyState } from "@/components/ui";
import { vi } from "@/i18n/vi";

const t = vi.admin.staff;

interface StaffRow {
  id: string;
  fullName: string;
  identifier: string;
  usesInternalName: boolean;
  phone: string | null;
  role: string;
  isActive: boolean;
  lastLoginAt: string | null;
  neverLoggedIn: boolean;
  stale: boolean;
  branchIds: string[];
}

interface Branch {
  id: string;
  name: string;
}

const roleLabel = (role: string) =>
  (t.roles as Record<string, string>)[role] ?? role;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function StaffManager() {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [assignableRoles, setAssignableRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/staff", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không tải được danh sách");
      setRows(body.data.staff);
      setBranches(body.data.branches);
      setAssignableRoles(body.data.assignableRoles);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tải được danh sách");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(id: string, payload: Record<string, unknown>, done: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/staff/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không lưu được");
      setNotice(done);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không lưu được");
    } finally {
      setBusyId(null);
    }
  }

  function toggleActive(row: StaffRow) {
    if (row.isActive && !confirm(t.confirmDeactivate.replace("{name}", row.fullName))) return;
    void patch(row.id, { isActive: !row.isActive }, t.updated);
  }

  function resetPassword(row: StaffRow) {
    // prompt() keeps the new password out of the page's own state and out of
    // any re-render; it goes straight to the request and is never stored.
    const next = window.prompt(`${t.newPassword} — ${row.fullName}`);
    if (!next) return;
    void patch(row.id, { password: next }, t.passwordChanged);
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
        <Button onClick={() => setShowForm((v) => !v)}>{t.addButton}</Button>
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
        <CreateStaffForm
          branches={branches}
          assignableRoles={assignableRoles}
          onDone={async (name) => {
            setShowForm(false);
            setNotice(t.created.replace("{name}", name));
            await load();
          }}
          onError={setError}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyBody} />
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--bb-border)] text-left text-[var(--bb-fg-muted)]">
                <th className="px-4 py-3 font-medium">{t.colName}</th>
                <th className="px-4 py-3 font-medium">{t.colAccount}</th>
                <th className="px-4 py-3 font-medium">{t.colRole}</th>
                <th className="px-4 py-3 font-medium">{t.colBranches}</th>
                <th className="px-4 py-3 font-medium">{t.colLastLogin}</th>
                <th className="px-4 py-3 font-medium">{t.colStatus}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-b border-[var(--bb-border)] last:border-0 ${
                    row.isActive ? "" : "opacity-60"
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-[var(--bb-fg)]">{row.fullName}</td>
                  <td className="px-4 py-3">
                    <code className="text-[var(--bb-fg)]">{row.identifier}</code>
                  </td>
                  <td className="px-4 py-3">
                    <Select
                      aria-label={t.colRole}
                      value={row.role}
                      disabled={busyId === row.id || !assignableRoles.includes(row.role)}
                      onChange={(e) => void patch(row.id, { role: e.target.value }, t.updated)}
                    >
                      {!assignableRoles.includes(row.role) && (
                        <option value={row.role}>{roleLabel(row.role)}</option>
                      )}
                      {assignableRoles.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </Select>
                  </td>
                  <td className="px-4 py-3 text-[var(--bb-fg-muted)]">
                    {row.role === "owner" || row.role === "admin"
                      ? t.allBranches
                      : row.branchIds.length === 0
                        ? t.noBranch
                        : row.branchIds
                            .map((id) => branches.find((b) => b.id === id)?.name ?? "?")
                            .join(", ")}
                  </td>
                  <td className="px-4 py-3 text-[var(--bb-fg-muted)]">
                    {row.neverLoggedIn ? (
                      <Badge variant="outline">{t.neverLoggedIn}</Badge>
                    ) : (
                      <span title={row.stale ? t.staleWarning : undefined}>
                        {formatDate(row.lastLoginAt)}
                        {row.stale && " ⚠"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={row.isActive ? "default" : "secondary"}>
                      {row.isActive ? t.active : t.inactive}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => resetPassword(row)}
                      >
                        {t.resetPassword}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busyId === row.id}
                        onClick={() => toggleActive(row)}
                      >
                        {row.isActive ? t.deactivate : t.reactivate}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function CreateStaffForm({
  branches,
  assignableRoles,
  onDone,
  onError,
}: {
  branches: Branch[];
  assignableRoles: string[];
  onDone: (name: string) => void | Promise<void>;
  onError: (message: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [branchIds, setBranchIds] = useState<string[]>([]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setSaving(true);
    onError("");

    try {
      const res = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: String(form.get("fullName") ?? ""),
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
          phone: String(form.get("phone") ?? "") || null,
          role: String(form.get("role") ?? "cs"),
          branchIds,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không tạo được tài khoản");
      await onDone(String(form.get("fullName") ?? ""));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Không tạo được tài khoản");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label={t.fullName}>
          <Input name="fullName" required minLength={2} autoComplete="off" />
        </Field>

        <Field label={t.username} hint={t.usernameHint}>
          <Input
            name="username"
            required
            pattern="[a-z][a-z0-9._\-]{2,29}"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label={t.password} hint={t.passwordHint}>
          <Input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </Field>

        <Field label={t.phone}>
          <Input name="phone" inputMode="tel" autoComplete="off" />
        </Field>

        <Field label={t.role}>
          <Select name="role" defaultValue="cs">
            {assignableRoles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={t.branches}>
          <div className="flex flex-wrap gap-3 pt-2">
            {branches.map((b) => (
              <label key={b.id} className="flex items-center gap-2 text-sm text-[var(--bb-fg)]">
                <input
                  type="checkbox"
                  checked={branchIds.includes(b.id)}
                  onChange={(e) =>
                    setBranchIds((prev) =>
                      e.target.checked ? [...prev, b.id] : prev.filter((x) => x !== b.id),
                    )
                  }
                />
                {b.name}
              </label>
            ))}
          </div>
        </Field>

        <div className="sm:col-span-2 flex items-center justify-between gap-4 pt-2">
          <p className="text-xs text-[var(--bb-fg-muted)]">{t.loginNote}</p>
          <Button type="submit" disabled={saving}>
            {saving ? t.saving : t.save}
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
