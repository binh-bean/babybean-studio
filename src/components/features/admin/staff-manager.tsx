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

import { useCallback, useEffect, useState } from "react";
import { Button, Input, Select, Badge, Card, Spinner, EmptyState, Avatar, AvatarFallback, Switch } from "@/components/ui";
import { Field, RequiredLegend } from "./field";
import { vi } from "@/i18n/vi";

/** Chữ cái đầu để làm avatar — bản vẽ quan-tri-nhan-su.webp dùng chữ cái đầu
 * tên, không dùng ảnh chân dung. */
function chuCaiDau(hoTen: string): string {
  const tu = hoTen.trim().split(/\s+/).filter(Boolean);
  if (tu.length === 0) return "?";
  const dau = tu[0]!.charAt(0);
  const cuoi = tu.length > 1 ? tu[tu.length - 1]!.charAt(0) : "";
  return (dau + cuoi).toUpperCase();
}

const t = vi.admin.staff;

interface StaffRow {
  id: string;
  fullName: string;
  identifier: string;
  usesInternalName: boolean;
  phone: string | null;
  role: string;
  roleId: string | null;
  roleName: string;
  vaiTuTao: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  neverLoggedIn: boolean;
  stale: boolean;
  branchIds: string[];
  deleteReason: string | null;
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
  /** Vai tự tạo ở màn Vai trò (BB-172 chặng 2d). Giá trị trong ô chọn là `tu-tao:<id>`. */
  const [customRoles, setCustomRoles] = useState<{ id: string; name: string }[]>([]);
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
      setCustomRoles(body.data.customRoles ?? []);
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
      value={row.vaiTuTao && row.roleId ? `tu-tao:${row.roleId}` : row.role}
      disabled={busyId === row.id || (!row.vaiTuTao && !assignableRoles.includes(row.role))}
      onChange={(e) => {
        const v = e.target.value;
        // Vai tự tạo gửi `roleId`; vai hệ thống gửi `role` như cũ. Gửi kèm
        // `roleId: null` để trigger kéo `role_id` về đúng vai nền — nếu không,
        // người vừa chuyển về vai hệ thống vẫn giữ quyền của vai tự tạo.
        void patch(
          row.id,
          v.startsWith("tu-tao:")
            ? { roleId: v.slice("tu-tao:".length) }
            : { role: v, roleId: null },
          t.updated,
        );
      }}
    >
      {!row.vaiTuTao && !assignableRoles.includes(row.role) && (
        <option value={row.role}>{roleLabel(row.role)}</option>
      )}
      {assignableRoles.map((r) => (
        <option key={r} value={r}>
          {roleLabel(r)}
        </option>
      ))}
      {customRoles.map((r) => (
        <option key={r.id} value={`tu-tao:${r.id}`}>
          {r.name}
        </option>
      ))}
    </Select>
  );

  async function destroy(row: StaffRow) {
    if (!confirm(`Bạn có chắc chắn muốn xoá vĩnh viễn tài khoản ${row.fullName}? Hành động này không thể hoàn tác.`)) return;
    setBusyId(row.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/staff/${row.id}`, {
        method: "DELETE",
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? "Không xoá được");
      setNotice(`Đã xoá tài khoản ${row.fullName}`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không xoá được");
    } finally {
      setBusyId(null);
    }
  }

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
      {!row.deleteReason ? (
        <Button
          variant="danger"
          size="sm"
          disabled={busyId === row.id}
          onClick={() => destroy(row)}
        >
          Xoá
        </Button>
      ) : (
        <div className="flex flex-col text-xs text-amber-600/80 max-w-[200px] mt-1 text-right">
          {row.deleteReason}
        </div>
      )}
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
          <h1 className="font-display text-2xl font-semibold text-[var(--bb-fg)]">{t.title}</h1>
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
        <div className="grid gap-6 xl:grid-cols-[1fr_240px]">
          {/*
            Bản vẽ quan-tri-nhan-su.webp: lưới thẻ, không phải bảng — mỗi
            nhân viên một thẻ trắng viền mảnh, avatar chữ cái đầu, vai trò và
            chi nhánh ở dưới, công tắc Active Status thay cho nút bấm
            "Vô hiệu hoá/Kích hoạt" cũ (cùng một hàm `toggleActive`, chỉ đổi
            kiểu điều khiển). Một lưới duy nhất cho mọi cỡ màn hình — bỏ bản
            bảng riêng + bản thẻ riêng cũ vì giờ cả hai đều là thẻ.
          */}
          <div className="grid gap-4 sm:grid-cols-2 xl:col-start-1 2xl:grid-cols-3">
            {rows.map((row) => (
              <Card
                key={row.id}
                className={`flex flex-col gap-4 p-5 ${row.isActive ? "" : "opacity-60"}`}
              >
                <div className="flex items-start gap-3">
                  <Avatar className="h-11 w-11 shrink-0">
                    <AvatarFallback>{chuCaiDau(row.fullName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-[var(--bb-fg)]">{row.fullName}</p>
                    <code className="block break-all text-xs text-[var(--bb-fg-muted)]">
                      {row.identifier}
                    </code>
                  </div>
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--bb-fg-muted)]">{t.colRole}</p>
                  {roleSelect(row, "w-full")}
                </div>

                <div>
                  <p className="mb-1 text-xs font-medium text-[var(--bb-fg-muted)]">
                    {t.colBranches}
                  </p>
                  <p className="text-sm text-[var(--bb-fg)]">{branchSummary(row, branches)}</p>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-[var(--bb-border)] pt-3 text-sm text-[var(--bb-fg-muted)]">
                  <span>{t.colLastLogin}</span>
                  {lastLogin(row)}
                </div>

                {/* Không lồng trong <label>: Switch đã tự có <label> bên
                    trong nó (switch.tsx) — lồng thêm một lớp ngoài là hai
                    <label> chồng nhau, trình duyệt xử lý sai lệch. */}
                <div className="flex items-center justify-between gap-2 border-t border-[var(--bb-border)] pt-3 text-sm text-[var(--bb-fg)]">
                  <span>{t.colStatus}</span>
                  <Switch
                    checked={row.isActive}
                    disabled={busyId === row.id}
                    onCheckedChange={() => toggleActive(row)}
                    aria-label={row.isActive ? t.deactivate : t.reactivate}
                  />
                </div>

                <div className="flex flex-wrap gap-2">{rowActions(row)}</div>

                {editingId === row.id && (
                  <div className="border-t border-[var(--bb-border)] pt-4">
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

          {/*
            Thẻ số lượng theo vai trò ở bên phải bản vẽ — số thật, đếm từ
            chính `rows` đang có trên màn, không phải số bịa.
          */}
          <Card className="h-fit p-5 xl:col-start-2">
            <h2 className="mb-3 text-sm font-semibold text-[var(--bb-fg)]">{t.colRole}</h2>
            <ul className="space-y-2.5 text-sm">
              {Object.entries(
                rows.reduce<Record<string, number>>((acc, row) => {
                  const nhan = row.vaiTuTao ? row.roleName : roleLabel(row.role);
                  acc[nhan] = (acc[nhan] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([nhan, soLuong]) => (
                <li key={nhan} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[var(--bb-fg)]">{nhan}</span>
                  <Badge variant="secondary">{soLuong}</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
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
