"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState } from "@/components/ui/empty-state";
import { GalleryFilters, type GalleryFilterState } from "./gallery-filters";
import { getContractCodesForGalleries } from "@/app/(admin)/admin/galleries/actions";
import {
  Calendar,
  User,
  Phone,
  Building2,
  Camera,
  Paintbrush,
  Headphones,
  Clock,
  AlertTriangle,
  ChevronDown,
  Eye,
  Copy,
} from "lucide-react";

export interface GalleryItem {
  id: string;
  title: string;
  babyName: string | null;
  babyFullName: string | null;
  customerName: string;
  customerPhone: string;
  branchName: string;
  photographerName: string | null;
  editorName: string | null;
  cskhName: string | null;
  shootDate: string | null;
  totalPhotos: number;
  selectedCount: number;
  includedQuota: number;
  extraCount: number;
  progress: string;
  dueAt: string | null;
  status: string;
  lastSelectedAt: string | null;
  urgency: "done" | "no_due" | "overdue" | "due_soon" | "on_track";
  sentAt: string | null;
  submittedAt: string | null;
  createdAt: string;
}

export interface GalleryCounts {
  all: number;
  draft: number;
  syncing: number;
  sync_error: number;
  ready: number;
  in_review: number;
  submitted: number;
  in_retouch: number;
  delivered: number;
  expired: number;
  archived: number;
  [key: string]: number;
}

function getStatusBadgeConfig(status: string): {
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
} {
  switch (status) {
    case "draft":
      return { label: "Bản nháp", variant: "secondary" };
    case "syncing":
      return { label: "Đang đồng bộ", variant: "outline" };
    case "sync_error":
      return { label: "Lỗi tải ảnh", variant: "danger" };
    case "ready":
      return { label: "Sẵn sàng", variant: "accent" };
    case "in_review":
      return { label: "Chờ khách chọn", variant: "warning" };
    case "submitted":
      return { label: "Đã chốt", variant: "success" };
    case "in_retouch":
      return { label: "Đang retouch", variant: "default" };
    case "delivered":
      return { label: "Đã giao", variant: "secondary" };
    case "expired":
      return { label: "Quá hạn", variant: "danger" };
    case "archived":
      return { label: "Lưu trữ", variant: "outline" };
    default:
      return { label: status, variant: "outline" };
  }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

function KanbanColumn({
  colKey,
  label,
  variant,
  totalCount,
  filters,
}: {
  colKey: string;
  label: string;
  variant: NonNullable<BadgeProps["variant"]>;
  totalCount: number;
  filters: GalleryFilterState;
}) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [contractCodes, setContractCodes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const fetchItems = useCallback(
    async (isLoadMore = false, cursorToUse?: string | null) => {
      if (isLoadMore) setLoadingMore(true);
      else setLoading(true);

      try {
        const queryParams = new URLSearchParams();
        if (filters.branchId) queryParams.set("branchId", filters.branchId);
        queryParams.set("status", colKey);
        if (filters.photographerId) queryParams.set("photographerId", filters.photographerId);
        if (filters.dateFrom) queryParams.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) queryParams.set("dateTo", filters.dateTo);
        if (filters.search) queryParams.set("q", filters.search);

        if (isLoadMore && cursorToUse) {
          queryParams.set("cursor", cursorToUse);
        }

        queryParams.set("limit", "20");

        const res = await fetch(`/api/admin/galleries?${queryParams.toString()}`, {
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Không thể tải danh sách bộ ảnh");
        const body = await res.json();
        const fetchedItems: GalleryItem[] = body?.data?.items ?? [];

        if (isLoadMore) {
          setItems((prev) => [...prev, ...fetchedItems]);
        } else {
          setItems(fetchedItems);
        }

        setHasMore(Boolean(body?.data?.hasMore));
        setNextCursor(body?.data?.nextCursor ?? null);
      } catch (err) {
        console.error("Lỗi khi fetch kanban column:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters, colKey]
  );

  useEffect(() => {
    void fetchItems(false);
  }, [fetchItems]);

  
  useEffect(() => {
    if (items.length > 0) {
      const ids = items.map(i => i.id);
      getContractCodesForGalleries(ids).then(map => {
        setContractCodes(prev => ({ ...prev, ...map }));
      }).catch(console.error);
    }
  }, [items]);

  const handleLoadMore = () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    void fetchItems(true, nextCursor);
  };

  return (
    <div className="flex-1 min-w-[260px] max-w-[320px] rounded-[var(--bb-radius)] bg-[var(--bb-surface-2)]/50 border border-[var(--bb-border)] flex flex-col max-h-[calc(100vh-220px)]">
      {/* Tiêu đề cột */}
      <div className="p-3 border-b border-[var(--bb-border)] flex items-center justify-between bg-[var(--bb-surface)] rounded-t-[var(--bb-radius)]">
        <div className="flex items-center gap-2">
          <Badge variant={variant} className="h-2 w-2 p-0 rounded-full" />
          {colKey === "sync_error" ? (
            <Link
              href="/admin/reports/loi-dong-bo"
              className="font-semibold text-sm text-[var(--bb-danger)] hover:underline flex items-center gap-1"
              title="Đến màn xử lý lỗi tải"
            >
              {label}
            </Link>
          ) : (
            <span className="font-semibold text-sm text-[var(--bb-fg)]">{label}</span>
          )}
        </div>
        <Badge variant="secondary" className="text-xs px-2 py-0.5">
          {totalCount}
        </Badge>
      </div>

      {/* Danh sách thẻ trong cột */}
      <div className="p-2.5 space-y-2.5 overflow-y-auto flex-1">
        {loading && !loadingMore && items.length === 0 ? (
          <div className="py-8 flex justify-center">
            <Spinner size="sm" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--bb-fg-muted)]">
            Không có bộ ảnh
          </div>
        ) : (
          <>
            {items.map((item) => {
              const tenBeCot = item.babyName || item.babyFullName || null;
              return (
                <Link
                  href={`/admin/galleries/${encodeURIComponent(contractCodes[item.id] || item.id)}`}
                  key={item.id}
                  className="block group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bb-primary)] rounded-[var(--bb-radius-sm)]"
                >
                  <Card
                    className="p-3 bg-[var(--bb-surface)] border border-[var(--bb-border)] rounded-[var(--bb-radius-sm)] shadow-xs group-hover:border-[var(--bb-primary)] group-hover:bg-[var(--bb-surface-2)]/30 transition-all space-y-2 cursor-pointer h-full"
                  >
                    <div className="font-semibold text-sm text-[var(--bb-fg)] group-hover:text-[var(--bb-primary)] transition-colors">
                      {item.title}
                    </div>
                    {tenBeCot && <p className="text-xs text-[var(--bb-fg-muted)]">bé {tenBeCot}</p>}
                    <div className="text-xs text-[var(--bb-fg-muted)] space-y-1">
                      <div className="flex items-center justify-between">
                        <span>{item.customerName}</span>
                        <span className="font-mono text-[11px]">{item.customerPhone}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px]">
                        <span>{item.branchName}</span>
                        <span>{formatDate(item.shootDate)}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1 border-t border-[var(--bb-border)]/50 text-xs">
                      <span className="font-medium text-[var(--bb-primary)]">{item.progress}</span>
                      {item.dueAt && (
                        <span className="text-[11px] text-[var(--bb-fg-muted)] flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDate(item.dueAt)}
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
            {hasMore && (
              <div className="pt-2 pb-1 flex justify-center">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="w-full text-xs h-8"
                >
                  {loadingMore ? (
                    <>
                      <Spinner size="sm" className="mr-2" />
                      Đang tải...
                    </>
                  ) : (
                    "Tải thêm"
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function GalleryList() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [contractCodes, setContractCodes] = useState<Record<string, string>>({});
  const [counts, setCounts] = useState<GalleryCounts>({
    all: 0,
    draft: 0,
    syncing: 0,
    sync_error: 0,
    ready: 0,
    in_review: 0,
    submitted: 0,
    in_retouch: 0,
    delivered: 0,
    expired: 0,
    archived: 0,
  });

  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [photographers, setPhotographers] = useState<{ id: string; name: string }[]>([]);

  const [filters, setFilters] = useState<GalleryFilterState>({
    branchId: "",
    status: "",
    photographerId: "",
    dateFrom: "",
    dateTo: "",
    search: "",
    viewMode: "table",
  });

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Tải danh sách options (chi nhánh & thợ ảnh)
  useEffect(() => {
    async function loadOptions() {
      try {
        const res = await fetch("/api/admin/galleries/options", { cache: "no-store" });
        if (res.ok) {
          const body = await res.json();
          if (body?.data?.branches) setBranches(body.data.branches);
          if (body?.data?.photographers) {
            setPhotographers(
              body.data.photographers.map((p: { id: string; name: string }) => ({
                id: p.id,
                name: p.name,
              }))
            );
          }
        }
      } catch (err) {
        console.error("Lỗi tải options bộ lọc:", err);
      }
    }
    void loadOptions();
  }, []);

  // Lắng nghe sự kiện branchChange từ BranchSelector ở Header
  useEffect(() => {
    const handleBranchChange = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail;
      setFilters((prev) => ({ ...prev, branchId: detail ?? "" }));
    };
    window.addEventListener("branchChange", handleBranchChange);
    return () => window.removeEventListener("branchChange", handleBranchChange);
  }, []);

  // Tải danh sách bộ ảnh từ API
  const fetchGalleries = useCallback(
    async (isLoadMore = false, cursorToUse?: string | null) => {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }

      try {
        const queryParams = new URLSearchParams();
        if (filters.branchId) queryParams.set("branchId", filters.branchId);
        if (filters.status) queryParams.set("status", filters.status);
        if (filters.photographerId) queryParams.set("photographerId", filters.photographerId);
        if (filters.dateFrom) queryParams.set("dateFrom", filters.dateFrom);
        if (filters.dateTo) queryParams.set("dateTo", filters.dateTo);
        if (filters.search) queryParams.set("q", filters.search);

        if (isLoadMore && cursorToUse) {
          queryParams.set("cursor", cursorToUse);
        }

        queryParams.set("limit", "50");

        const res = await fetch(`/api/admin/galleries?${queryParams.toString()}`, {
          cache: "no-store",
        });

        if (!res.ok) {
          throw new Error("Không thể tải danh sách bộ ảnh");
        }

        const body = await res.json();
        const fetchedItems: GalleryItem[] = body?.data?.items ?? [];
        const fetchedCounts: GalleryCounts | null = body?.data?.counts ?? null;
        const more: boolean = Boolean(body?.data?.hasMore);
        const cursor: string | null = body?.data?.nextCursor ?? null;

        if (isLoadMore) {
          setItems((prev) => [...prev, ...fetchedItems]);
        } else {
          setItems(fetchedItems);
        }

        // setCounts(prev => …) chứ không đọc `counts` ở đây: đọc là phải khai nó
        // trong danh sách phụ thuộc, mà phản hồi luôn trả về một đối tượng MỚI —
        // thành ra tải xong lại dựng lại hàm này, useEffect thấy hàm mới lại gọi
        // tải, và mỗi vòng đặt lại loading = true. Con quay không bao giờ tắt dù
        // dữ liệu về đủ mỗi lần, và mỗi tab đang mở gọi API hai lần mỗi giây.
        setCounts((prev) => fetchedCounts ?? prev);
        setHasMore(more);
        setNextCursor(cursor);
      } catch (err) {
        console.error("Lỗi khi fetch galleries:", err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [filters]
  );

  // Gọi fetchGalleries khi bộ lọc thay đổi
  useEffect(() => {
    void fetchGalleries(false);
  }, [fetchGalleries]);

  
  useEffect(() => {
    if (items.length > 0) {
      const ids = items.map(i => i.id);
      getContractCodesForGalleries(ids).then(map => {
        setContractCodes(prev => ({ ...prev, ...map }));
      }).catch(console.error);
    }
  }, [items]);

  const handleFilterChange = (updates: Partial<GalleryFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  };

  const handleLoadMore = () => {
    if (!hasMore || loadingMore || !nextCursor) return;
    void fetchGalleries(true, nextCursor);
  };

  const copyShareLink = (galleryId: string) => {
    const link = `${window.location.origin}/admin/galleries/${encodeURIComponent(contractCodes[galleryId] || galleryId)}`;
    void navigator.clipboard.writeText(link);
  };

  // Các cột trạng thái trong Kanban
  const kanbanStatuses = [
    { key: "draft", label: "Mới nhập", variant: "secondary" as const },
    { key: "sync_error", label: "Lỗi tải ảnh", variant: "danger" as const },
    { key: "ready", label: "Sẵn sàng", variant: "accent" as const },
    { key: "in_review", label: "Chờ khách chọn", variant: "warning" as const },
    { key: "submitted", label: "Đã chốt", variant: "success" as const },
    { key: "in_retouch", label: "Đang retouch", variant: "default" as const },
    { key: "delivered", label: "Đã giao", variant: "secondary" as const },
    { key: "expired", label: "Quá hạn", variant: "danger" as const },
  ];

  return (
    <div className="space-y-4">
      {/* Bộ lọc dính phía trên */}
      <GalleryFilters
        values={filters}
        onChange={handleFilterChange}
        branches={branches}
        photographers={photographers}
      />

      {/* Trạng thái đang tải lần đầu */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Spinner size="lg" />
          <p className="mt-3 text-sm text-[var(--bb-fg-muted)]">Đang tải danh sách bộ ảnh…</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Không tìm thấy bộ ảnh nào"
          description="Hãy thử thay đổi điều kiện lọc hoặc tạo bộ ảnh mới."
        />
      ) : filters.viewMode === "table" ? (
        /* ================= CHẾ ĐỘ XEM BẢNG ================= */
        <div className="space-y-4">
          {/* Màn hình lớn (>= lg): BẢNG 10 CỘT */}
          <div className="hidden lg:block overflow-x-auto rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] shadow-sm">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-[var(--bb-surface-2)] border-b border-[var(--bb-border)] text-xs font-semibold text-[var(--bb-fg-muted)] uppercase tracking-wider">
                <tr>
                  {/* Thứ tự cột do chủ studio chốt 15.09.2026: số hoá đơn trước, rồi
                      tên khách, rồi tên bé. Trước đó cột đầu mang nhãn "Tên bé" nhưng
                      hiện mã hợp đồng — vì hầu hết bộ ảnh chưa có tên bé, và
                      displayName rơi về item.title. Nhãn nói một đằng, nội dung một nẻo. */}
                  <th className="px-4 py-3.5">Số hoá đơn</th>
                  <th className="px-4 py-3.5">Khách hàng</th>
                  <th className="px-4 py-3.5">Tên bé</th>
                  <th className="px-4 py-3.5">Chi nhánh</th>
                  <th className="px-4 py-3.5">Photographer</th>
                  <th className="px-4 py-3.5">Retouch</th>
                  <th className="px-4 py-3.5">CSKH</th>
                  <th className="px-4 py-3.5">Ngày chụp</th>
                  <th className="px-4 py-3.5">Đã chọn</th>
                  <th className="px-4 py-3.5">Hạn chốt</th>
                  <th className="px-4 py-3.5 text-center">Trạng thái</th>
                  <th className="px-4 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bb-border)]">
                {items.map((item) => {
                  const statusConfig = getStatusBadgeConfig(item.status);
                  const tenBe = item.babyName || item.babyFullName || null;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[var(--bb-surface-2)]/60 transition-colors"
                    >
                      {/* 1. Số hoá đơn — mã hợp đồng, dán được thẳng vào ô tìm bên Lark */}
                      <td className="px-4 py-3 font-medium text-[var(--bb-fg)]">
                        <Link
                          href={`/admin/galleries/${encodeURIComponent(contractCodes[item.id] || item.id)}`}
                          className="hover:text-[var(--bb-primary)] transition-colors"
                        >
                          {item.title}
                        </Link>
                      </td>

                      {/* 2. Khách hàng */}
                      <td className="px-4 py-3">
                        <div className="text-[var(--bb-fg)]">{item.customerName}</div>
                        <div className="text-xs text-[var(--bb-fg-muted)] font-mono">
                          {item.customerPhone}
                        </div>
                      </td>

                      {/* 3. Tên bé — trống ở hầu hết bộ ảnh kéo từ Lark: docs/16 §7.3 còn
                          che tên cho tới khi có bb-prod (BB-138, BB-139). Để gạch ngang
                          cho thật chứ đừng lấy mã hợp đồng lấp chỗ trống, vì lấp là
                          nhân viên tưởng đã có tên. */}
                      <td className="px-4 py-3 text-[var(--bb-fg)]">
                        {tenBe ?? <span className="text-[var(--bb-fg-muted)]">—</span>}
                      </td>

                      {/* 3. Chi nhánh */}
                      <td className="px-4 py-3 text-[var(--bb-fg-muted)]">
                        {item.branchName}
                      </td>

                      {/* 4. Photographer */}
                      <td className="px-4 py-3 text-[var(--bb-fg-muted)]">
                        {item.photographerName || "—"}
                      </td>

                      {/* 5. Người photoshop */}
                      <td className="px-4 py-3 text-[var(--bb-fg-muted)]">
                        {item.editorName || "—"}
                      </td>

                      {/* 6. CSKH */}
                      <td className="px-4 py-3 text-[var(--bb-fg-muted)]">
                        {item.cskhName || "—"}
                      </td>

                      {/* 7. Ngày chụp */}
                      <td className="px-4 py-3 text-[var(--bb-fg-muted)] font-mono text-xs">
                        {formatDate(item.shootDate)}
                      </td>

                      {/* 8. Đã chọn N/M */}
                      <td className="px-4 py-3 font-medium">
                        <span className="text-[var(--bb-fg)]">{item.progress}</span>
                        {item.extraCount > 0 && (
                          <span className="ml-1 text-xs text-[var(--bb-warning)]">
                            (+{item.extraCount})
                          </span>
                        )}
                      </td>

                      {/* 9. Hạn chốt */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-mono text-[var(--bb-fg-muted)]">
                          {formatDate(item.dueAt)}
                        </div>
                        {item.urgency === "overdue" && (
                          <span className="inline-flex items-center text-[10px] text-[var(--bb-danger)] font-medium">
                            <AlertTriangle className="h-3 w-3 mr-0.5" /> Quá hạn
                          </span>
                        )}
                        {item.urgency === "due_soon" && (
                          <span className="inline-flex items-center text-[10px] text-[var(--bb-warning)] font-medium">
                            <Clock className="h-3 w-3 mr-0.5" /> Sắp hết
                          </span>
                        )}
                      </td>

                      {/* 10. Trạng thái */}
                      <td className="px-4 py-3 text-center">
                        <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                      </td>

                      {/* Thao tác */}
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Link href={`/admin/galleries/${encodeURIComponent(contractCodes[item.id] || item.id)}`}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Xem chi tiết"
                              aria-label="Xem chi tiết"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => copyShareLink(item.id)}
                            title="Sao chép link"
                            aria-label="Sao chép link"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Màn hình nhỏ (< lg): MỖI BỘ ẢNH MỘT THẺ CHO CSKH */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 lg:hidden">
            {items.map((item) => {
              const statusConfig = getStatusBadgeConfig(item.status);
              // Cùng luật với bảng: số hoá đơn đứng đầu, tên bé chỉ hiện khi CÓ.
              const tenBeThe = item.babyName || item.babyFullName || null;

              return (
                <Card
                  key={item.id}
                  className="rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] shadow-sm hover:border-[var(--bb-primary)]/60 transition-all p-4 space-y-3"
                >
                  {/* Header thẻ: Tên bé & Trạng thái */}
                  {/*
                    `min-w-0` cho cột chữ và `shrink-0` cho nhãn trạng thái.
                    Thiếu hai thứ đó thì nhãn "Chờ khách chọn" không co được mà
                    cột chữ cũng không nhường — đo trên máy tính bảng 768px:
                    nhãn thò ra 8px khỏi mép phải màn hình.
                  */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/galleries/${encodeURIComponent(contractCodes[item.id] || item.id)}`}
                        className="font-bold text-base text-[var(--bb-fg)] hover:text-[var(--bb-primary)] transition-colors"
                      >
                        {item.title}
                      </Link>
                      <p className="truncate text-xs text-[var(--bb-fg-muted)]">
                        {item.customerName}
                        {tenBeThe ? ` · bé ${tenBeThe}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0">
                      <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
                    </span>
                  </div>

                  {/* Thông tin khách hàng & Chi nhánh */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-[var(--bb-fg-muted)] pt-1 border-t border-[var(--bb-border)]/50">
                    <div className="flex items-center gap-1.5 truncate">
                      <User className="h-3.5 w-3.5 shrink-0 text-[var(--bb-fg-muted)]" />
                      <span className="truncate">{item.customerName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono truncate">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-[var(--bb-fg-muted)]" />
                      <span>{item.customerPhone}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate col-span-2">
                      <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--bb-fg-muted)]" />
                      <span>{item.branchName}</span>
                    </div>
                  </div>

                  {/* Ngày chụp & Tiến độ chọn */}
                  <div className="flex items-center justify-between text-xs bg-[var(--bb-surface-2)] p-2.5 rounded-[var(--bb-radius-sm)]">
                    <div className="flex items-center gap-1 text-[var(--bb-fg-muted)]">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{formatDate(item.shootDate)}</span>
                    </div>
                    <div className="font-semibold text-[var(--bb-fg)]">
                      Đã chọn:{" "}
                      <span className="text-[var(--bb-primary)]">{item.progress}</span>
                      {item.extraCount > 0 && (
                        <span className="text-[var(--bb-warning)] ml-1">
                          (+{item.extraCount})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Nhân sự & Hạn chốt */}
                  <div className="flex items-center justify-between text-[11px] text-[var(--bb-fg-muted)] pt-1">
                    <div className="flex items-center gap-2">
                      {item.photographerName && (
                        <span className="flex items-center gap-1" title="Photographer">
                          <Camera className="h-3 w-3" /> {item.photographerName}
                        </span>
                      )}
                      {item.editorName && (
                        <span className="flex items-center gap-1" title="Photoshop">
                          <Paintbrush className="h-3 w-3" /> {item.editorName}
                        </span>
                      )}
                      {item.cskhName && (
                        <span className="flex items-center gap-1" title="CSKH">
                          <Headphones className="h-3 w-3" /> {item.cskhName}
                        </span>
                      )}
                    </div>
                    {item.dueAt && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>Hạn: {formatDate(item.dueAt)}</span>
                      </div>
                    )}
                  </div>

                  {/* Nút hành động */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[var(--bb-border)]/60">
                    <Link href={`/admin/galleries/${encodeURIComponent(contractCodes[item.id] || item.id)}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full text-xs h-8">
                        <Eye className="h-3.5 w-3.5 mr-1" /> Xem bộ ảnh
                      </Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyShareLink(item.id)}
                      className="text-xs h-8 px-2.5"
                      title="Sao chép link"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        /* ================= CHẾ ĐỘ XEM KANBAN ================= */
        <div className="space-y-3">
          {/* Lối hiển thị trạng thái ẩn */}
          <div className="flex items-center gap-4 text-xs text-[var(--bb-fg-muted)] px-1">
            <span>Trạng thái khác:</span>
            <button
              onClick={() => handleFilterChange({ status: "syncing", viewMode: "table" })}
              className="hover:text-[var(--bb-primary)] transition-colors flex items-center gap-1"
            >
              Đang đồng bộ <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{counts.syncing || 0}</Badge>
            </button>
            <button
              onClick={() => handleFilterChange({ status: "archived", viewMode: "table" })}
              className="hover:text-[var(--bb-primary)] transition-colors flex items-center gap-1"
            >
              Lưu trữ <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{counts.archived || 0}</Badge>
            </button>
          </div>

          <div className="overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max pr-4">
              {kanbanStatuses.map((col) => {
                const countNumber = counts[col.key] ?? 0;

                return (
                  <KanbanColumn
                    key={col.key}
                    colKey={col.key}
                    label={col.label}
                    variant={col.variant}
                    totalCount={countNumber}
                    filters={filters}
                  />
                );
              })}
          </div>
        </div>
        </div>
      )}

      {/* Phân trang Cursor / Tải thêm */}
      {hasMore && filters.viewMode === "table" && (
        <div className="flex justify-center pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="px-6"
          >
            {loadingMore ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Đang tải thêm…
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4 mr-1.5" />
                Tải thêm bộ ảnh
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
