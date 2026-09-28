"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Spinner } from "@/components/ui/spinner";
import { GalleryFilters, type GalleryFilterState } from "./gallery-filters";
import { getContractCodesForGalleries } from "@/app/(admin)/admin/galleries/actions";
import { canhBaoUi } from "@/lib/lark/mau-canh-bao-ui";
import { layerMoNgang } from "@/lib/utils/tranh-tan-nen";
import { formatSdt } from "@/lib/utils/dinh-dang";
import { loiNhacKhach } from "@/lib/utils/bang-dieu-khien";
import type { MauCanhBao } from "@/lib/lark/trang-thai-hau-ky";
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
  Send,
  ArrowRight,
} from "lucide-react";

/**
 * BB-303 (bản vẽ BB-301, bo-anh-danh-sach.png, chú thích): "Làm nhanh theo
 * trạng thái: Đang chọn/Sắp hết hạn/Quá hạn → Nhắc khách · Đã chốt → Chuyển
 * sang chỉnh ảnh · Đang chỉnh → Duyệt/Giao ảnh · còn lại → Chép link (mặc
 * định, xem nút Copy cạnh Eye)."
 *
 * "Nhắc khách" ở BẢNG DANH SÁCH chép một câu nhắc CHUNG (không kèm link gửi
 * khách thật — link đó chỉ khôi phục được qua route chi tiết, tốn một lượt
 * gọi Lark cho mỗi dòng, không hợp để làm hàng loạt trên cả trang danh sách).
 * Nhân viên mở bộ ảnh (nút Eye) để lấy link thật nếu cần gửi kèm.
 */
function LamNhanh({ item, onCopyLink }: { item: GalleryItem; onCopyLink: () => void }) {
  const [daChep, setDaChep] = React.useState(false);

  async function chepLoiNhac() {
    try {
      await navigator.clipboard.writeText(
        loiNhacKhach({ customerName: item.customerName, babyName: item.babyName || item.babyFullName, title: item.title }),
      );
      setDaChep(true);
      window.setTimeout(() => setDaChep(false), 2000);
    } catch {
      // Trình duyệt chặn Clipboard API (http, quyền) — không có gì để làm
      // thêm ở một nút icon nhỏ trong bảng; nhân viên mở chi tiết bộ ảnh.
    }
  }

  if (item.status === "in_review") {
    return (
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => void chepLoiNhac()}
        title={daChep ? "Đã chép" : "Chép lời nhắc khách chọn ảnh"}
        aria-label="Chép lời nhắc"
      >
        <Send className="h-4 w-4" />
      </Button>
    );
  }

  if (item.status === "submitted") {
    return (
      <Link href={`/admin/galleries/${encodeURIComponent(item.id)}`}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Mở để chuyển sang chỉnh ảnh"
          aria-label="Chuyển sang chỉnh ảnh"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
      </Link>
    );
  }

  if (item.status === "in_retouch") {
    return (
      <Link href={`/admin/galleries/${encodeURIComponent(item.id)}`}>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title="Mở để duyệt/giao ảnh đã chỉnh"
          aria-label="Duyệt hoặc giao ảnh"
        >
          <Paintbrush className="h-4 w-4" />
        </Button>
      </Link>
    );
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8"
      onClick={onCopyLink}
      title="Sao chép link"
      aria-label="Sao chép link"
    >
      <Copy className="h-4 w-4" />
    </Button>
  );
}

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
  /**
   * BB-200 (3/3) — nhãn đã tính từ trạng thái app + mã Lark (`nhanHienThi().quanTri`,
   * xem src/app/api/admin/galleries/route.ts). Thay cho nhãn tĩnh cũ
   * `GALLERY_STATUS_LABEL[status]` mỗi khi khác nhau — vd `in_retouch` mà Lark
   * còn "Đã chọn hình" thì nhãn phải nói "chờ chỉnh sửa", không phải "Đang chỉnh ảnh".
   */
  statusLabel?: string;
  /** Mức cảnh báo từ Lark (`mauCanhBao()`); null = chưa đọc được hoặc không áp dụng. */
  warningColor?: MauCanhBao | null;
  /**
   * BB-303 (bản vẽ BB-301, admin duyệt 28/09/2026) — ảnh bìa khách đã chọn,
   * chưa có thì tấm đầu của bộ (`anhBiaTheoBo()`, route API tính sẵn).
   * `null` = bộ chưa có ảnh nào (chưa đồng bộ) — ô bìa vẽ màu trơn.
   */
  coverPhotoId?: string | null;
  /** BB-303 — tên gói chụp ("Newborn", "Thôi nôi"…), dùng cho tiêu đề "Loại buổi · Bé …". `null` = chưa gắn gói. */
  packageName?: string | null;
}

/**
 * BB-303 (bo-anh-danh-sach.png): "Newborn · Bé Bin" thay cho mã hợp đồng thô
 * khi có đủ dữ liệu gói + tên bé; còn thiếu thì lùi về tên bộ ảnh cũ
 * (`item.title`, thường là mã hợp đồng) — KHÔNG bịa "Loại buổi" hay tên bé.
 */
function tieuDeBoAnh(item: GalleryItem): string {
  const tenBe = item.babyName || item.babyFullName;
  if (item.packageName && tenBe) return `${item.packageName} · Bé ${tenBe}`;
  if (tenBe) return `Bé ${tenBe}`;
  return item.title;
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

/** Xuất ra để `gallery-detail.tsx` dùng chung một luật màu nhãn trạng thái
 * (BB-255) — tránh hai màn hình vẽ hai màu khác nhau cho cùng một trạng thái. */
export function getStatusBadgeConfig(status: string): {
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

/**
 * Chấm màu mức cảnh báo từ Lark (BB-200). `title`/`aria-label` bắt buộc: một
 * chấm màu một mình không đọc được bằng trình đọc màn hình, và xanh/cam/đỏ/tím
 * khó phân biệt với người mù màu nếu không có chữ đi kèm.
 */
function ChamCanhBao({ mau }: { mau: MauCanhBao | null | undefined }) {
  const ui = canhBaoUi(mau ?? null);
  if (!ui) return null;
  return (
    <span
      role="img"
      aria-label={`Mức cảnh báo: ${ui.nhan}`}
      title={ui.nhan}
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
      style={{ backgroundColor: ui.mauToken }}
    />
  );
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

/** BB-290 (#33): hạn chốt trong bảng rút gọn chỉ cần dd/mm, theo
 * quan-tri-bo-anh-bang.png — năm không cần thiết ở một cột đã hẹp lại. */
function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    const day = d.getDate().toString().padStart(2, "0");
    const month = (d.getMonth() + 1).toString().padStart(2, "0");
    return `${day}/${month}`;
  } catch {
    return "—";
  }
}

/**
 * Ảnh bìa nhỏ 40×50 đầu hàng (BB-303, bo-anh-danh-sach.png) — bìa khách đã
 * chọn, chưa có thì tấm đầu; `coverPhotoId` null (bộ chưa có ảnh) vẽ ô màu
 * trơn thay vì gọi `/api/img` với id rỗng.
 */
function AnhBiaNho({ coverPhotoId, title }: { coverPhotoId?: string | null; title: string }) {
  if (!coverPhotoId) {
    return (
      <div
        aria-hidden="true"
        className="h-[50px] w-10 shrink-0 rounded-[5px] bg-[var(--bb-surface-2)]"
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/img/${coverPhotoId}?w=200`}
      alt=""
      title={title}
      loading="lazy"
      className="h-[50px] w-10 shrink-0 rounded-[5px] object-cover"
    />
  );
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
                        {/* BB-303 (luật phông 28/09/2026): Be Vietnam Pro
                            tabular-nums, không còn `font-mono`. */}
                        <span className="tabular-nums text-[11px]">{formatSdt(item.customerPhone)}</span>
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
        // BB-292: tranh trạng thái trống dùng chung (`ngang-quan-tri-trong`)
        // cho danh sách rỗng lẫn không khớp bộ lọc — cùng thông điệp cũ, chỉ
        // thêm tranh phía trên thay vì icon tròn mặc định của `EmptyState`.
        //
        // BB-292 vòng 2 — giám đốc chấm: bỏ khối nền full-bleed riêng quanh
        // tranh, đổi `object-contain` + `max-w-[360px]` căn giữa (không cắt
        // vật nào), kèm `layerMoNgang` để tan vào nền thẻ.
        <div className="flex flex-col items-center rounded-[var(--bb-radius)] border border-dashed border-[var(--bb-border)] bg-[var(--bb-surface)]/50 p-8 text-center">
          <img
            src="/minh-hoa/ngang-quan-tri-trong-1280.webp"
            srcSet="/minh-hoa/ngang-quan-tri-trong-640.webp 640w, /minh-hoa/ngang-quan-tri-trong-1280.webp 1280w"
            sizes="360px"
            alt=""
            width={1280}
            height={714}
            className="mb-4 w-full max-w-[360px] object-contain"
            style={layerMoNgang}
          />
          <h3 className="text-base font-semibold text-[var(--bb-fg)] mb-1">Không tìm thấy bộ ảnh nào</h3>
          <p className="max-w-md text-sm text-[var(--bb-fg-muted)]">
            Hãy thử thay đổi điều kiện lọc hoặc tạo bộ ảnh mới.
          </p>
        </div>
      ) : filters.viewMode === "table" ? (
        /* ================= CHẾ ĐỘ XEM BẢNG ================= */
        <div className="space-y-4">
          {/* Màn hình lớn (>= lg): BẢNG 6 CỘT — BB-290 #33, theo
              quan-tri-bo-anh-bang.png. Bảng cũ có 11 cột (Photographer/Retouch/
              CSKH/Ngày chụp/Đã chọn tách rời) khiến tên bộ ảnh vỡ thành 6 dòng ở
              1440px. Tên khách + tên bé gộp vào cột "Bộ ảnh"; các cột phần lớn
              trống (CSKH, người chỉnh ảnh) không còn chiếm chỗ riêng — xem chi
              tiết đầy đủ ở trang Chi tiết bộ ảnh. */}
          <div className="hidden lg:block overflow-x-auto rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] shadow-sm">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-[var(--bb-surface-2)] border-b border-[var(--bb-border)] text-xs font-semibold text-[var(--bb-fg-muted)] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Bộ ảnh</th>
                  <th className="px-4 py-3.5">Chi nhánh</th>
                  <th className="px-4 py-3.5">Tiến độ chọn</th>
                  <th className="px-4 py-3.5">Hạn chốt</th>
                  <th className="px-4 py-3.5 text-center">Trạng thái</th>
                  {/* BB-303 (bo-anh-danh-sach.png): "Làm nhanh" thay "Thao tác" — cột này giờ đổi theo trạng thái (xem LamNhanh). */}
                  <th className="px-4 py-3.5 text-right">Làm nhanh</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--bb-border)]">
                {items.map((item) => {
                  const statusConfig = getStatusBadgeConfig(item.status);
                  const tienDoTong = item.includedQuota > 0 ? item.includedQuota : item.selectedCount;

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-[var(--bb-surface-2)]/60 transition-colors"
                    >
                      {/* 1. Bộ ảnh — ảnh bìa nhỏ 40×50 (BB-303, LUÔN hiện) +
                          tiêu đề "Loại buổi · Bé …" trên, tên khách · SĐT
                          dưới. */}
                      <td className="max-w-[280px] px-4 py-3">
                        {/* BB-290 lượt 2: chặn bề rộng cột — tên bộ ảnh dài
                            (vd tên Fixture kiểm thử) từng đẩy cả bảng tràn
                            khỏi 1440px, đẩy cột Trạng thái/Thao tác ra ngoài
                            tầm nhìn mà không cuộn ngang. */}
                        <div className="flex items-center gap-3 min-w-0">
                          <AnhBiaNho coverPhotoId={item.coverPhotoId} title={tieuDeBoAnh(item)} />
                          <div className="min-w-0">
                            <Link
                              href={`/admin/galleries/${encodeURIComponent(contractCodes[item.id] || item.id)}`}
                              className="block truncate font-medium text-[var(--bb-fg)] hover:text-[var(--bb-primary)] transition-colors"
                            >
                              {tieuDeBoAnh(item)}
                            </Link>
                            <div className="truncate text-xs text-[var(--bb-fg-muted)]">
                              {item.customerName} · <span className="tabular-nums">{formatSdt(item.customerPhone)}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 2. Chi nhánh */}
                      <td className="px-4 py-3 text-[var(--bb-fg-muted)]">
                        {item.branchName}
                      </td>

                      {/* 3. Tiến độ chọn — thanh + n/m */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <div className="w-20">
                            {/* `ariaLabel` bắt buộc — thiếu tên đọc được thì
                                axe báo "ARIA progressbar nodes must have an
                                accessible name" (bb-277). Dùng `ariaLabel`,
                                không phải `label`, để không hiện thêm một
                                dòng chữ trực quan — số n/m đã hiện cạnh
                                thanh rồi. */}
                            <ProgressBar
                              value={item.selectedCount}
                              max={Math.max(tienDoTong, 1)}
                              size="sm"
                              variant={item.extraCount > 0 ? "warning" : "accent"}
                              ariaLabel={`Tiến độ chọn của ${item.title}: ${item.progress}`}
                            />
                          </div>
                          <span className="text-xs font-medium text-[var(--bb-fg)] whitespace-nowrap">
                            {item.progress}
                          </span>
                          {item.extraCount > 0 && (
                            <span className="text-[11px] text-[var(--bb-warning)] whitespace-nowrap">
                              (+{item.extraCount})
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 4. Hạn chốt */}
                      <td className="px-4 py-3">
                        {/* BB-303 (luật phông): tabular-nums thay font-mono. */}
                        <div className="text-xs tabular-nums text-[var(--bb-fg-muted)]">
                          {formatDateShort(item.dueAt)}
                        </div>
                        {item.urgency === "overdue" && (
                          <span className="inline-flex items-center text-[10px] text-[var(--bb-danger)] font-medium whitespace-nowrap">
                            <AlertTriangle className="h-3 w-3 mr-0.5" /> Quá hạn
                          </span>
                        )}
                        {item.urgency === "due_soon" && (
                          <span className="inline-flex items-center text-[10px] text-[var(--bb-warning)] font-medium whitespace-nowrap">
                            <Clock className="h-3 w-3 mr-0.5" /> Sắp hết
                          </span>
                        )}
                      </td>

                      {/* 5. Trạng thái — chip MỘT DÒNG (BB-290 #33: chip cũ vỡ
                          thành khối 5 dòng rộng 60px, xem báo cáo #33). */}
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                          <ChamCanhBao mau={item.warningColor} />
                          <Badge variant={statusConfig.variant} className="whitespace-nowrap">
                            {item.statusLabel ?? statusConfig.label}
                          </Badge>
                        </span>
                      </td>

                      {/* 6. Thao tác — Xem chi tiết luôn có, + MỘT nút "Làm
                          nhanh" đổi theo trạng thái (BB-303, bo-anh-danh-sach.png). */}
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
                          <LamNhanh item={item} onCopyLink={() => copyShareLink(item.id)} />
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

              return (
                <Card
                  key={item.id}
                  className="rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] shadow-sm hover:border-[var(--bb-primary)]/60 transition-all p-4 space-y-3"
                >
                  {/* Header thẻ: ảnh bìa nhỏ (BB-303) + Tên bộ ảnh trên, nhãn
                      trạng thái XUỐNG DÒNG DƯỚI (BB-290 #35) — trước đây nhãn
                      nằm góc phải đẩy tên bộ ảnh xuống tới 5 dòng khi nhãn dài
                      ("Chờ xác nhận"...). Tên bộ ảnh tối đa 2 dòng
                      (line-clamp), tên khách/chi nhánh không còn bị cắt "…" vì
                      nhãn không chiếm ngang nữa. */}
                  <div className="flex items-start gap-3">
                    <AnhBiaNho coverPhotoId={item.coverPhotoId} title={tieuDeBoAnh(item)} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <Link
                        href={`/admin/galleries/${encodeURIComponent(contractCodes[item.id] || item.id)}`}
                        className="line-clamp-2 font-bold text-base text-[var(--bb-fg)] hover:text-[var(--bb-primary)] transition-colors"
                      >
                        {tieuDeBoAnh(item)}
                      </Link>
                      <p className="text-xs text-[var(--bb-fg-muted)]">
                        {item.customerName} · <span className="tabular-nums">{formatSdt(item.customerPhone)}</span>
                      </p>
                      <span className="inline-flex items-center gap-1.5">
                        <ChamCanhBao mau={item.warningColor} />
                        <Badge variant={statusConfig.variant} className="whitespace-nowrap">
                          {item.statusLabel ?? statusConfig.label}
                        </Badge>
                      </span>
                    </div>
                  </div>

                  {/* Thông tin khách hàng & Chi nhánh */}
                  <div className="grid grid-cols-2 gap-2 text-xs text-[var(--bb-fg-muted)] pt-1 border-t border-[var(--bb-border)]/50">
                    <div className="flex items-center gap-1.5 truncate">
                      <User className="h-3.5 w-3.5 shrink-0 text-[var(--bb-fg-muted)]" />
                      <span className="truncate">{item.customerName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate tabular-nums">
                      <Phone className="h-3.5 w-3.5 shrink-0 text-[var(--bb-fg-muted)]" />
                      <span>{formatSdt(item.customerPhone)}</span>
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
                        <span className="flex items-center gap-1" title="Thợ chụp">
                          <Camera className="h-3 w-3" /> {item.photographerName}
                        </span>
                      )}
                      {item.editorName && (
                        <span className="flex items-center gap-1" title="Chỉnh ảnh">
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

                  {/* Nút hành động — Xem bộ ảnh luôn có, + MỘT nút "Làm nhanh"
                      đổi theo trạng thái (BB-303). */}
                  <div className="flex items-center gap-2 pt-2 border-t border-[var(--bb-border)]/60">
                    <Link href={`/admin/galleries/${encodeURIComponent(contractCodes[item.id] || item.id)}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full text-xs h-8">
                        <Eye className="h-3.5 w-3.5 mr-1" /> Xem bộ ảnh
                      </Button>
                    </Link>
                    <LamNhanh item={item} onCopyLink={() => copyShareLink(item.id)} />
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
