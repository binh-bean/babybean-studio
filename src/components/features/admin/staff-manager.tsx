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
 *
 * Bảy cột không nhét vừa màn hình hẹp. Bản đầu tiên ép bảng rộng 1100px rồi để
 * nó tự co, kết quả là tên chi nhánh xuống dòng mỗi chữ một hàng và ô trạng
 * thái méo thành hình tròn. Từ `lg` trở lên là bảng; hẹp hơn thì mỗi người một
 * thẻ, vì trên điện thoại người ta đọc theo chiều dọc chứ không kéo ngang.
 */

import { Fragment, useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Badge, Card, Spinner, EmptyState } from "@/components/ui";
import { Field, RequiredLegend } from "./field";
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

const roleLabel = (role: string) => (t.roles as Record<string, string>)[role] ?? role;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Owner và admin thấy mọi chi nhánh nên không cần liệt kê tên. */
function branchSummary(row: StaffRow, branches: Branch[]): string {
  if (row.role === "owner" || row.role === "admin") return t.allBranches;
  if (row.branchIds.length === 0) return t.noBranch;
  if (row.branchIds.length === branches.length) return t.allBranches;
  return row.branchIds.map((id) => branches.find((b) => b.id === id)?.name ?? "?").join(", ");
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
  const [editingId, setEditingId] = useState<string | null>(null);

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
    // prompt() giữ mật khẩu mới nằm ngoài state của trang: nó đi thẳng vào
    // request và không bao giờ được lưu lại hay render lần nào.
    const next = window.prompt(`${t.newPassword} — ${row.fullName}`);
    if (!next) return;
    void patch(row.id, { password: next }, t.passwordChanged);
  }

  const roleSelect = (row: StaffRow, className: string) => (
    <Select
      className={className}
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
  );

  const rowActions = (row: StaffRow) => (
    <>
      <Button
        variant="outline"
        size="sm"
        disabled={busyId === row.id}
        onClick={() => setEditingId(editingId === row.id ? null : row.id)}
      >
        {editingId === row.id ? t.cancel : t.edit}
      </Button>
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
    </>
  );

  const lastLogin = (row: StaffRow) =>
    row.neverLoggedIn ? (
      <Badge variant="outline" className="whitespace-nowrap">
        {t.neverLoggedIn}
      </Badge>
    ) : (
      <span className="whitespace-nowrap" title={row.stale ? t.staleWarning : undefined}>
        {formatDate(row.lastLoginAt)}
        {row.stale && " ⚠"}
      </span>
    );

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
        <>
          {/* Màn rộng: bảng */}
          <Card className="hidden overflow-x-auto p-0 lg:block">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--bb-border)] text-left text-[var(--bb-fg-muted)]">
                  <th className="px-4 py-3 font-medium">{t.colName}</th>
                  <th className="px-4 py-3 font-medium">{t.colAccount}</th>
                  <th className="w-[190px] px-4 py-3 font-medium">{t.colRole}</th>
                  <th className="px-4 py-3 font-medium">{t.colBranches}</th>
                  <th className="px-4 py-3 font-medium">{t.colLastLogin}</th>
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
                      <td className="px-4 py-3 font-medium text-[var(--bb-fg)]">{row.fullName}</td>
                      <td className="px-4 py-3">
                        <code className="break-all text-[var(--bb-fg)]">{row.identifier}</code>
                      </td>
                      <td className="px-4 py-3">{roleSelect(row, "w-full")}</td>
                      <td className="max-w-[220px] px-4 py-3 text-[var(--bb-fg-muted)]">
                        {branchSummary(row, branches)}
                      </td>
                      <td className="px-4 py-3 text-[var(--bb-fg-muted)]">{lastLogin(row)}</td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={row.isActive ? "default" : "secondary"}
                          className="whitespace-nowrap"
                        >
                          {row.isActive ? t.active : t.inactive}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-2">{rowActions(row)}</div>
                      </td>
                    </tr>

                    {editingId === row.id && (
                      <tr className="border-b border-[var(--bb-border)] bg-[var(--bb-surface-2)]">
                        <td colSpan={7} className="px-4 py-4">
                          <EditStaffRow
                            row={row}
                            branches={branches}
                            saving={busyId === row.id}
                            onSave={async (payload) => {
                              await patch(row.id, payload, t.updated);
                              setEditingId(null);
                            }}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>

          {/* Màn hẹp: mỗi người một thẻ */}
          <div className="space-y-3 lg:hidden">
            {rows.map((row) => (
              <Card key={row.id} className={`p-4 ${row.isActive ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-[var(--bb-fg)]">{row.fullName}</p>
                    <code className="block break-all text-xs text-[var(--bb-fg-muted)]">
                      {row.identifier}
                    </code>
                  </div>
                  <Badge
                    variant={row.isActive ? "default" : "secondary"}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {row.isActive ? t.active : t.inactive}
                  </Badge>
                </div>

                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="mb-1 text-xs text-[var(--bb-fg-muted)]">{t.colRole}</dt>
                    <dd>{roleSelect(row, "w-full")}</dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-xs text-[var(--bb-fg-muted)]">{t.colBranches}</dt>
                    <dd className="text-right text-[var(--bb-fg)]">
                      {branchSummary(row, branches)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <dt className="text-xs text-[var(--bb-fg-muted)]">{t.colLastLogin}</dt>
                    <dd className="text-[var(--bb-fg-muted)]">{lastLogin(row)}</dd>
                  </div>
                </dl>

                <div className="mt-4 flex flex-wrap gap-2">{rowActions(row)}</div>

                {editingId === row.id && (
                  <div className="mt-4 border-t border-[var(--bb-border)] pt-4">
                    <EditStaffRow
                      row={row}
                      branches={branches}
                      saving={busyId === row.id}
                      onSave={async (payload) => {
                        await patch(row.id, payload, t.updated);
                        setEditingId(null);
                      }}
                    />
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Sửa thông tin một nhân viên tại chỗ.
 *
 * Tên và số điện thoại đổi được, tên tài khoản thì không: đổi tên đăng nhập
 * nghĩa là đổi cả định danh trong Supabase Auth, và người đang có phiên mở sẽ
 * rơi vào trạng thái nửa vời. Cần đổi thật thì tắt tài khoản cũ, cấp cái mới —
 * lịch sử vẫn còn nguyên vì tắt không phải xoá.
 */
function EditStaffRow({
  row,
  branches,
  saving,
  onSave,
}: {
  row: StaffRow;
  branches: Branch[];
  saving: boolean;
  onSave: (payload: Record<string, unknown>) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState(row.fullName);
  const [phone, setPhone] = useState(row.phone ?? "");
  const [branchIds, setBranchIds] = useState<string[]>(row.branchIds);
  const seesAllBranches = row.role === "owner" || row.role === "admin";

  return (
    <form
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave({
          fullName,
          phone: phone.trim() === "" ? null : phone.trim(),
          ...(seesAllBranches ? {} : { branchIds }),
        });
      }}
    >
      <Field label={t.fullName} required>
        <Input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          minLength={2}
        />
      </Field>

      <Field label={t.phone}>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
      </Field>

      <Field label={t.branches}>
        {seesAllBranches ? (
          <p className="pt-2 text-sm text-[var(--bb-fg-muted)]">{t.allBranches}</p>
        ) : (
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
        )}
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2 lg:col-span-3">
        <div className="space-y-1">
          <RequiredLegend />
          <p className="text-xs text-[var(--bb-fg-muted)]">{t.usernameLocked}</p>
        </div>
        <Button type="submit" disabled={saving}>
          {saving ? t.saving : t.save}
        </Button>
      </div>
    </form>
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
        <Field label={t.fullName} required>
          <Input name="fullName" required minLength={2} autoComplete="off" />
        </Field>

        <Field label={t.username} hint={t.usernameHint} required>
          <Input
            name="username"
            required
            pattern="[a-z][a-z0-9._\-]{2,29}"
            autoComplete="off"
            spellCheck={false}
          />
        </Field>

        <Field label={t.password} hint={t.passwordHint} required>
          <Input
            name="password"
            type="password"
            required
            minLength={10}
            autoComplete="new-password"
          />
        </Field>

        <Field label={t.phone}>
          <Input name="phone" inputMode="tel" autoComplete="off" />
        </Field>

        <Field label={t.role} required>
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

        <div className="flex flex-wrap items-center justify-between gap-4 sm:col-span-2">
          <div className="space-y-1">
            <RequiredLegend />
            <p className="text-xs text-[var(--bb-fg-muted)]">{t.loginNote}</p>
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? t.saving : t.save}
          </Button>
        </div>
      </form>
    </Card>
  );
}
