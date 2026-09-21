"use client";

import React from "react";
import Link from "next/link";
import { getDictionary } from "@/i18n";

interface LogItem {
  id: string;
  createdAt: string;
  actorType: "staff" | "customer" | "system";
  actorId: string | null;
  actorLabel: string | null;
  actorName: string | null;
  isInactive: boolean;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
}

export function NhatKyReport() {
  const t = getDictionary("vi").admin.nhatKy;

  const [actorType, setActorType] = React.useState("staff");
  const [action, setAction] = React.useState("");
  const [tuNgay, setTuNgay] = React.useState("");
  const [denNgay, setDenNgay] = React.useState("");
  
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<LogItem[]>([]);
  const [total, setTotal] = React.useState(0);

  const fetchLogs = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (actorType) params.set("actorType", actorType);
      if (action) params.set("action", action);
      if (tuNgay) params.set("tuNgay", tuNgay);
      if (denNgay) params.set("denNgay", denNgay);

      const res = await fetch(`/api/admin/reports/nhat-ky?${params.toString()}`);
      const json = await res.json().catch(() => null);
      
      if (!res.ok) {
        setError(json?.error?.message ?? t.error);
        return;
      }
      setError(null);
      setItems(json.data.items);
      setTotal(json.data.total);
    } catch {
      setError(t.disconnected);
    } finally {
      setLoading(false);
    }
  }, [actorType, action, tuNgay, denNgay, t]);

  React.useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          {t.subtitle}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-4 rounded-md border border-[var(--bb-border)] bg-[var(--bb-bg-muted)] p-4 text-sm">
        <div className="flex flex-col gap-1">
          <label className="font-medium">{t.filterActor}</label>
          <select 
            value={actorType} 
            onChange={(e) => setActorType(e.target.value)}
            className="rounded border border-[var(--bb-border)] px-2 py-1"
          >
            <option value="staff">{t.actorStaff}</option>
            <option value="customer">{t.actorCustomer}</option>
            <option value="system">{t.actorSystem}</option>
            <option value="all">{t.actorAll}</option>
          </select>
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="font-medium">{t.filterAction}</label>
          <select 
            value={action} 
            onChange={(e) => setAction(e.target.value)}
            className="rounded border border-[var(--bb-border)] px-2 py-1"
          >
            <option value="">{t.actionAll}</option>
            <option value="gallery.create">{t.actionGalleryCreate}</option>
            <option value="gallery.payment_recorded">{t.actionPaymentRecorded}</option>
            <option value="share_link.created">{t.actionShareLinkCreated}</option>
            <option value="share_link.reopened">{t.actionShareLinkReopened}</option>
            <option value="selection.patch">{t.actionSelectionPatch}</option>
            <option value="selection.submit">{t.actionSelectionSubmit}</option>
            <option value="staff.role_updated">{t.actionStaffRoleUpdated}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium">{t.filterFromDate}</label>
          <input 
            type="date" 
            value={tuNgay} 
            onChange={(e) => setTuNgay(e.target.value)}
            className="rounded border border-[var(--bb-border)] px-2 py-1"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium">{t.filterToDate}</label>
          <input 
            type="date" 
            value={denNgay} 
            onChange={(e) => setDenNgay(e.target.value)}
            className="rounded border border-[var(--bb-border)] px-2 py-1"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">{t.loading}</p>
      ) : error ? (
        <p className="text-sm text-[var(--bb-danger)]">{error}</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-[var(--bb-fg-muted)]">
          {t.empty}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-[var(--bb-fg-muted)]">{t.summary.replace("{total}", String(total))}</p>
          <div className="overflow-x-auto rounded-md border border-[var(--bb-border)]">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead className="bg-[var(--bb-bg-muted)]">
                <tr className="border-b border-[var(--bb-border)] text-left">
                  <Th className="pl-3">{t.colTime}</Th>
                  <Th>{t.colActor}</Th>
                  <Th>{t.colAction}</Th>
                  <Th>{t.colEntity}</Th>
                  <Th>{t.colDetails}</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-[var(--bb-border)]">
                    <td className="py-2 pl-3 pr-3 whitespace-nowrap">
                      {new Date(it.createdAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">
                        {it.actorName} 
                        {it.isInactive && <span className="text-[var(--bb-fg-muted)] text-xs ml-1">{t.inactiveLabel}</span>}
                      </div>
                      <div className="text-xs text-[var(--bb-fg-muted)]">
                        {it.actorType === 'customer' ? t.actorCustomer : (it.actorLabel || t.actorStaff)}
                      </div>
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs">{it.action}</td>
                    <td className="py-2 pr-3">
                      {it.entityType === "gallery" ? (
                        <Link href={`/admin/galleries/${it.entityId}`} className="underline underline-offset-2">
                          {t.entityGallery}
                        </Link>
                      ) : (
                        <span className="text-[var(--bb-fg-muted)]">{it.entityType}</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--bb-fg-muted)] truncate max-w-xs" title={JSON.stringify(it.metadata)}>
                      {renderMetadata(it, t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

type NhatKyTranslations = ReturnType<typeof getDictionary>["admin"]["nhatKy"];

function renderMetadata(item: LogItem, t: NhatKyTranslations) {
  if (!item.metadata) return t.emptyValue;
  
  if (item.action === "share_link.created" || item.action === "share_link.reopened") {
    const prefix = typeof item.metadata.tokenPrefix === "string" ? item.metadata.tokenPrefix : t.emptyValue;
    return t.linkCodePrefix.replace("{prefix}", prefix);
  }
  
  const m = { ...item.metadata };
  delete m.token;
  delete m.fullToken;
  
  const str = JSON.stringify(m);
  if (str === "{}") return t.emptyValue;
  return str;
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`py-2 pr-3 font-medium ${className ?? ""}`}>{children}</th>;
}
