"use client";

import { isGalleryLocked } from "@/lib/gallery-status";
import { getCustomerProgressStep } from "@/lib/gallery/progress";
import type { GalleryStatus } from "@/types/domain";
import { ReviewPanel, type ReviewData } from "@/components/features/gallery/review-panel";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import { buildHeartPayload } from "@/lib/selection/heart-payload";
import { useRouter } from "next/navigation";
import { Heart, AlertTriangle, AlertCircle, Info, ChevronRight, Lock } from "lucide-react";
import { vi } from "@/i18n";
import { cn } from "@/components/ui/utils";
import { QuotaDisplay } from "@/components/ui/quota-display";
import { CustomerProgress } from "@/components/ui/customer-progress";
import { ContractBreakdown, type ContractItem, formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { PhotoPlacementPicker } from "@/components/ui/photo-placement-picker";
import { AddonSelector, type AddonProduct } from "@/components/ui/addon-selector";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import type { PhotoPublic } from "@/types/domain";

interface GalleryAppProps {
  token: string;
}

interface GalleryApiResponse {
  id: string;
  title: string;
  welcomeMessage: string | null;
  status: string;
  babyName: string | null;
  shootDate: string | null;
  branch: {
    name: string;
    hotline: string;
    zaloOa?: string;
  };
  photoCount: number;
  quotaKnown: boolean;
  includedQuota: number | null;
  extraPhotoPrice: number;
  maxSelection: number | null;
  allowExtra: boolean;
  dueAt: string | null;
  subfolders: string[];
  selection: {
    id: string;
    selectedCount: number;
    favoriteCount: number;
    extraCount: number;
    extraAmount: number;
    addonsAmount: number;
    generalNote: string | null;
    submittedAt: string | null;
  };
  contract?: {
    totalValue: number;
    items: Array<{
      id: string;
      productId: string;
      name: string;
      // kind phân biệt gói chụp, hàng in, ảnh chỉnh sửa. API vẫn luôn trả
      // trường này; bản khai đầu của giao diện bỏ sót nên không lọc được sản
      // phẩm in ra khỏi gói chụp.
      kind: string;
      quantity: number;
      unitPrice: number | null;
      totalPrice: number | null;
      components: Array<{
        id: string;
        name: string;
        kind: string;
        quantity: number;
      }>;
    }>;
  };
  placements?: Array<{ photoId: string; galleryItemId: string }>;
  // Vòng duyệt ảnh đã chỉnh. null khi bộ ảnh chưa tới bước đó.
  review?: ReviewData | null;
  addons?: {
    totalAmount: number;
    items: Array<{
      id: string;
      productId: string;
      name: string;
      unitPrice: number;
      quantity: number;
      totalPrice: number;
      size: string | null;
    }>;
  };
}

export function GalleryApp({ token }: GalleryAppProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [gallery, setGallery] = useState<GalleryApiResponse | null>(null);
  const [photos, setPhotos] = useState<PhotoPublic[]>([]);
  const [filter, setFilter] = useState<"all" | "selected" | "unselected">("all");
  const [selectedSubfolder, setSelectedSubfolder] = useState<string>("");

  const [selectionCounts, setSelectionCounts] = useState({
    selectedCount: 0,
    extraCount: 0,
    extraAmount: 0,
  });

  const [mutatingIds, setMutatingIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [customerNote, setCustomerNote] = useState("");
  const [placements, setPlacements] = useState<{ photoId: string; galleryItemId: string }[]>([]);
  const [placing, setPlacing] = useState(false);

  const isLocked = useMemo(() => {
    if (!gallery) return false;
    return isGalleryLocked(gallery.status);
  }, [gallery]);

  const loadGallery = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      let res = await fetch("/api/g/gallery", { cache: "no-store" });

      if (res.status === 401) {
        // Thử đăng nhập phiên khách với token nếu link không yêu cầu PIN
        const authRes = await fetch("/api/auth/gallery", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const authData = await authRes.json().catch(() => null);

        if (authRes.status === 401 && authData?.error?.code === "PIN_REQUIRED") {
          router.push(`/g/${token}/pin`);
          return;
        }

        if (authRes.ok) {
          // Thử gọi lại gallery sau khi đã có cookie phiên
          res = await fetch("/api/g/gallery", { cache: "no-store" });
        } else {
          const errCode = authData?.error?.code || "NOT_FOUND";
          setError({
            code: errCode,
            message: authData?.error?.message || vi.gallery.notFoundTitle,
          });
          setLoading(false);
          return;
        }
      }

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const code = json?.error?.code || "INTERNAL";
        if (code === "PIN_REQUIRED") {
          router.push(`/g/${token}/pin`);
          return;
        }
        setError({
          code,
          message: json?.error?.message || vi.gallery.notFoundTitle,
        });
        setLoading(false);
        return;
      }

      const gData = json.data as GalleryApiResponse;
      setGallery(gData);
      setPlacements(gData.placements ?? []);
      setSelectionCounts({
        selectedCount: gData.selection?.selectedCount ?? 0,
        extraCount: gData.selection?.extraCount ?? 0,
        extraAmount: gData.selection?.extraAmount ?? 0,
      });

      // Tải danh sách ảnh
      setPhotosLoading(true);
      const photosRes = await fetch("/api/g/photos?limit=200", { cache: "no-store" });
      const photosJson = await photosRes.json().catch(() => null);

      if (photosRes.ok && Array.isArray(photosJson?.data)) {
        setPhotos(photosJson.data);
      }
    } catch {
      setError({
        code: "NETWORK_ERROR",
        message: "Không thể kết nối đến máy chủ. Vui lòng thử lại sau.",
      });
    } finally {
      setLoading(false);
      setPhotosLoading(false);
    }
  }, [token, router]);

  /**
   * Khách duyệt hoặc yêu cầu sửa. Tải lại cả bộ ảnh sau đó — quyết định này
   * đổi trạng thái, mà trạng thái chi phối gần như mọi thứ trên màn hình.
   */
  const decideReview = useCallback(
    async (decision: "approve" | "revise", note?: string) => {
      const res = await fetch("/api/g/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, note }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setStatusMessage(json?.error?.message ?? "Không gửi được, ba mẹ thử lại giúp");
        return;
      }
      setStatusMessage(
        decision === "approve"
          ? "Cảm ơn ba mẹ. Studio chuyển bộ ảnh sang in."
          : "Đã gửi yêu cầu sửa cho studio.",
      );
      await loadGallery();
    },
    [loadGallery],
  );

  useEffect(() => {
    void loadGallery();
  }, [loadGallery]);

  /**
   * Thao tác THẢ TIM = CHỌN ẢNH.
   * CẢNH BÁO BẢO VỆ:
   * - Trái tim trên màn hình GỬI: { mark: "selected" } khi chọn, { mark: null } khi bỏ chọn.
   * - TUYỆT ĐỐI KHÔNG gửi isFavorite!
   * - quotaKnown = false -> Chặn chọn ảnh, báo studio sẽ báo lại.
   * - Không tự tính tiền ở client; lấy extraCount và extraAmount trả về từ API.
   */
  const handleToggleHeart = async (photo: PhotoPublic) => {
    if (isLocked) {
      setStatusMessage("Bộ ảnh đã được chốt, không thể thay đổi danh sách chọn.");
      return;
    }

    if (!gallery?.quotaKnown) {
      setStatusMessage("Studio sẽ báo lại số ảnh trong gói, vui lòng liên hệ CSKH.");
      return;
    }

    const isCurrentlySelected = photo.mark === "selected";
    const nextMark = isCurrentlySelected ? null : "selected";

    // 1. Cập nhật giao diện tức thì (Optimistic)
    setPhotos((prev) =>
      prev.map((p) => (p.id === photo.id ? { ...p, mark: nextMark } : p))
    );

    setMutatingIds((prev) => new Set(prev).add(photo.id));

    try {
      const res = await fetch("/api/g/selection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildHeartPayload(photo.id, isCurrentlySelected, crypto.randomUUID()),
        ),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        // Rollback giao diện khi API lỗi
        setPhotos((prev) =>
          prev.map((p) => (p.id === photo.id ? { ...p, mark: photo.mark } : p))
        );

        const code = json?.error?.code;
        const msg = json?.error?.message;

        if (code === "QUOTA_UNKNOWN") {
          setStatusMessage("Studio sẽ báo lại số ảnh trong gói, vui lòng liên hệ CSKH.");
        } else if (code === "QUOTA_EXCEEDED") {
          setStatusMessage(
            gallery?.maxSelection
              ? vi.gallery.quotaHardLimit.replace("{max}", String(gallery.maxSelection))
              : "Đã vượt quá số lượng ảnh cho phép của gói chụp."
          );
        } else if (code === "GALLERY_LOCKED") {
          setStatusMessage("Bộ ảnh đã được chốt, không thể chọn thêm.");
        } else {
          setStatusMessage(msg || "Không thể lưu lựa chọn, vui lòng thử lại.");
        }
        return;
      }

      // 2. Lấy con số tính toán chuẩn xác trực tiếp từ backend API
      if (json?.data) {
        setSelectionCounts({
          selectedCount: json.data.selectedCount,
          extraCount: json.data.extraCount,
          extraAmount: json.data.extraAmount,
        });
      }
    } catch {
      // Rollback khi mất mạng
      setPhotos((prev) =>
        prev.map((p) => (p.id === photo.id ? { ...p, mark: photo.mark } : p))
      );
      setStatusMessage("Mất kết nối mạng. Lựa chọn chưa được lưu.");
    } finally {
      setMutatingIds((prev) => {
        const next = new Set(prev);
        next.delete(photo.id);
        return next;
      });
    }
  };

  const handleSubmitSelection = async () => {
    if (isLocked) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/g/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmNotes: true,
          customerNote: customerNote.trim() || undefined,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setStatusMessage(json?.error?.message || "Không thể chốt danh sách lúc này.");
        return;
      }

      setShowSubmitModal(false);
      setStatusMessage("Đã chốt danh sách chọn ảnh thành công! Studio đã nhận được thông tin.");
      // Tải lại để cập nhật trạng thái đã chốt
      await loadGallery();
    } catch {
      setStatusMessage("Không thể gửi yêu cầu chốt bộ ảnh. Vui lòng kiểm tra lại mạng.");
    } finally {
      setSubmitting(false);
    }
  };

  // Lọc danh sách ảnh
  const filteredPhotos = useMemo(() => {
    return photos.filter((p) => {
      if (selectedSubfolder && p.subfolder !== selectedSubfolder) {
        return false;
      }
      if (filter === "selected") return p.mark === "selected";
      if (filter === "unselected") return p.mark !== "selected";
      return true;
    });
  }, [photos, filter, selectedSubfolder]);

  // Chuyển đổi thành phần hợp đồng cho component ContractBreakdown
  /**
   * Sản phẩm in mà hợp đồng THẬT SỰ có.
   *
   * Lấy từ cả hai tầng: dòng hợp đồng (khách mua lẻ một tấm ảnh phóng) và
   * thành phần của gói (ảnh phóng nằm sẵn trong gói chụp). Cả hai đều là dòng
   * trong gallery_items nên đều có id để đặt ảnh vào.
   *
   * Hợp đồng không mua hàng in thì mảng này rỗng, và component tự ẩn. Đây là
   * luật "chỉ hiện ô chọn cho sản phẩm hợp đồng thật sự có" ở docs/16 mục 3.3 —
   * và nó được thực thi ở ĐÂY chứ không phải bằng cách giấu nút, vì API cũng
   * từ chối dòng hàng không thuộc bộ ảnh.
   */
  const printProducts = useMemo(() => {
    const items = gallery?.contract?.items ?? [];
    const out: { galleryItemId: string; name: string; quantity: number }[] = [];
    for (const item of items) {
      if (item.kind === "print") {
        out.push({ galleryItemId: item.id, name: item.name, quantity: item.quantity });
      }
      for (const comp of item.components ?? []) {
        if (comp.kind === "print") {
          out.push({ galleryItemId: comp.id, name: comp.name, quantity: comp.quantity });
        }
      }
    }
    return out;
  }, [gallery]);

  /** Chỉ ảnh ĐÃ CHỌN mới đặt được vào sản phẩm in — ảnh in lấy từ tập đã chỉnh. */
  const placeablePhotos = useMemo(
    () =>
      photos
        .filter((p) => p.mark === "selected")
        .map((p) => ({ id: p.id, thumbnailUrl: `/api/img/${p.id}?w=200` })),
    [photos],
  );

  const changePlacement = useCallback(
    async (photoId: string, galleryItemId: string, add: boolean) => {
      // Cập nhật giao diện trước, trả lại nếu máy chủ từ chối — cùng cách với
      // nút thả tim, để khách không phải chờ một vòng mạng mới thấy phản hồi.
      const before = placements;
      setPlacements((prev) =>
        add
          ? [...prev, { photoId, galleryItemId }]
          : prev.filter((x) => !(x.photoId === photoId && x.galleryItemId === galleryItemId)),
      );
      setPlacing(true);
      try {
        const res = await fetch("/api/g/placements", {
          method: add ? "POST" : "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ photoId, galleryItemId }),
        });
        if (!res.ok) {
          setPlacements(before);
          const json = await res.json().catch(() => null);
          setStatusMessage(json?.error?.message ?? "Không lưu được, ba mẹ thử lại giúp.");
        }
      } catch {
        setPlacements(before);
        setStatusMessage("Mất kết nối, ba mẹ thử lại giúp.");
      } finally {
        setPlacing(false);
      }
    },
    [placements],
  );

  const contractBreakdownItems = useMemo<ContractItem[]>(() => {
    if (!gallery?.contract?.items) return [];
    return gallery.contract.items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      price: item.totalPrice,
      children: item.components?.map((comp) => ({
        id: comp.id,
        name: comp.name,
        quantity: comp.quantity,
      })),
    }));
  }, [gallery]);

  // Danh sách addon sản phẩm mua thêm
  const addonProducts = useMemo<AddonProduct[]>(() => {
    if (!gallery?.addons?.items) return [];
    return gallery.addons.items.map((item) => ({
      id: item.productId,
      name: item.name,
      unitPrice: item.unitPrice,
      unit: item.size || undefined,
      priceReliable: true,
    }));
  }, [gallery]);

  const addonQuantities = useMemo(() => {
    const map: Record<string, number> = {};
    if (gallery?.addons?.items) {
      for (const item of gallery.addons.items) {
        map[item.productId] = item.quantity;
      }
    }
    return map;
  }, [gallery]);

  if (loading) {
    return (
      <div className="min-h-[80dvh] flex flex-col items-center justify-center p-6 gap-3">
        <Spinner className="h-8 w-8 text-primary" />
        <p className="text-sm text-muted-foreground">{vi.common.loading}</p>
      </div>
    );
  }

  if (error || !gallery) {
    return (
      <div className="min-h-[80dvh] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <div className="w-12 h-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold mb-2">
          {error?.code === "LINK_EXPIRED" ? vi.gallery.expiredTitle : vi.gallery.notFoundTitle}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {error?.message || vi.gallery.notFoundBody}
        </p>
        <Button onClick={() => window.location.reload()} variant="outline">
          {vi.common.retry}
        </Button>
      </div>
    );
  }

  const stepNumber = getCustomerProgressStep(gallery.status as GalleryStatus);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground pb-32">
      {/* Thông báo banner trạng thái nếu có */}
      {statusMessage && (
        <div className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto p-4 bg-primary text-primary-foreground rounded-xl shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Info className="w-5 h-5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="text-primary-foreground/80 hover:text-primary-foreground text-sm font-bold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header trang khách */}
      <header className="border-b bg-surface sticky top-0 z-20 backdrop-blur-md bg-background/90">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-bold truncate">
              {gallery.babyName ? `Ảnh của bé ${gallery.babyName}` : gallery.title}
            </h1>
            <p className="text-xs text-muted-foreground truncate">
              {gallery.branch.name} • {gallery.branch.hotline}
            </p>
          </div>

          {!isLocked && (
            <Button
              size="sm"
              onClick={() => setShowSubmitModal(true)}
              className="shrink-0 font-medium"
            >
              {vi.gallery.submitCta}
            </Button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-4 space-y-6">
        {/* Dải tiến trình 6 bước của khách */}
        <div className="bg-surface rounded-xl border p-4 shadow-2xs">
          <CustomerProgress currentStep={stepNumber} />
        </div>

        {gallery.review && (
          <ReviewPanel
            status={gallery.status}
            review={gallery.review}
            hotline={gallery.branch.hotline}
            onDecide={decideReview}
          />
        )}

        {/* Cảnh báo bộ ảnh đã chốt */}
        {isLocked && (
          <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <Lock className="w-5 h-5 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Bộ ảnh đang ở chế độ xem lại</p>
              <p className="text-xs mt-0.5 opacity-90">
                {vi.gallery.lockedBanner.replace(
                  "{date}",
                  gallery.selection.submittedAt
                    ? new Date(gallery.selection.submittedAt).toLocaleDateString("vi-VN")
                    : ""
                )}
              </p>
            </div>
          </div>
        )}

        {/* Cảnh báo khi HẠN MỨC CHƯA BIẾT (quotaKnown = false) */}
        {!gallery.quotaKnown && !isLocked && (
          <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
            <div className="text-sm">
              <p className="font-bold">Studio sẽ báo lại số ảnh trong gói</p>
              <p className="text-xs mt-1 leading-relaxed">
                Hạn mức ảnh chỉnh sửa của gói chụp đang được CSKH cập nhật. Quý khách vui lòng liên hệ hotline{" "}
                <span className="font-semibold">{gallery.branch.hotline}</span> để mở chọn ảnh.
              </p>
            </div>
          </div>
        )}

        {/* KHỐI 4 CON SỐ HẠN MỨC */}
        <section aria-labelledby="quota-stats-heading" className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 id="quota-stats-heading" className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Hạn mức chọn ảnh
            </h2>
            <QuotaDisplay
              includedQuota={gallery.quotaKnown ? gallery.includedQuota : null}
              extraPrice={gallery.extraPhotoPrice}
              selectedCount={selectionCounts.selectedCount}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* 1. Số ảnh đã chọn */}
            <div className="p-3.5 rounded-xl border bg-surface flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">1. Đã chọn</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-black tracking-tight text-rose-500">
                  {selectionCounts.selectedCount}
                </span>
                <span className="text-xs text-muted-foreground">ảnh</span>
              </div>
            </div>

            {/* 2. Số ảnh đã thanh toán */}
            <div className="p-3.5 rounded-xl border bg-surface flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">2. Trong gói</span>
              <div className="mt-2">
                {gallery.quotaKnown ? (
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black tracking-tight text-foreground">
                      {gallery.includedQuota ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground">ảnh</span>
                  </div>
                ) : (
                  <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block pt-1">
                    Chưa có (báo lại)
                  </span>
                )}
              </div>
            </div>

            {/* 3. Số ảnh chọn thừa */}
            <div className="p-3.5 rounded-xl border bg-surface flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">3. Chọn thêm</span>
              <div className="mt-2 flex items-baseline gap-1">
                <span
                  className={cn(
                    "text-2xl font-black tracking-tight",
                    selectionCounts.extraCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"
                  )}
                >
                  {gallery.quotaKnown ? selectionCounts.extraCount : "—"}
                </span>
                {gallery.quotaKnown && <span className="text-xs text-muted-foreground">ảnh</span>}
              </div>
            </div>

            {/* 4. Tiền của số ảnh thừa */}
            <div className="p-3.5 rounded-xl border bg-surface flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">4. Phụ phí thêm</span>
              <div className="mt-2">
                {gallery.quotaKnown ? (
                  <span
                    className={cn(
                      "text-base sm:text-lg font-black tracking-tight block",
                      selectionCounts.extraAmount > 0 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                    )}
                  >
                    {formatCurrencyVND(selectionCounts.extraAmount)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground block pt-1">—</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* BỘ LỌC VÀ DANH SÁCH ẢNH */}
        <section aria-labelledby="photos-grid-heading" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
            <div className="flex items-center gap-2">
              <h2 id="photos-grid-heading" className="text-base font-bold">
                Danh sách ảnh ({filteredPhotos.length})
              </h2>
              {photosLoading && <Spinner className="h-4 w-4 text-muted-foreground" />}
            </div>

            {/* Các nút bấm lọc */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  filter === "all"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border text-muted-foreground hover:text-foreground"
                )}
              >
                {vi.gallery.filterAll} ({photos.length})
              </button>

              <button
                type="button"
                onClick={() => setFilter("selected")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5",
                  filter === "selected"
                    ? "bg-rose-500 text-white"
                    : "bg-surface border text-muted-foreground hover:text-foreground"
                )}
              >
                <Heart className="w-3.5 h-3.5 fill-current" />
                {vi.gallery.filterSelected} ({selectionCounts.selectedCount})
              </button>

              <button
                type="button"
                onClick={() => setFilter("unselected")}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors",
                  filter === "unselected"
                    ? "bg-primary text-primary-foreground"
                    : "bg-surface border text-muted-foreground hover:text-foreground"
                )}
              >
                {vi.gallery.filterUnselected}
              </button>

              {/* Lọc theo thư mục con nếu có */}
              {gallery.subfolders.length > 0 && (
                <select
                  value={selectedSubfolder}
                  onChange={(e) => setSelectedSubfolder(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-surface border text-foreground"
                  aria-label={vi.gallery.filterSubfolder}
                >
                  <option value="">{vi.gallery.filterSubfolder}: Tất cả</option>
                  {gallery.subfolders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Lưới ảnh responsive (tối ưu từ mobile 375px) */}
          {filteredPhotos.length === 0 ? (
            <div className="py-12 text-center rounded-xl border border-dashed bg-surface/50 p-6">
              <p className="text-sm text-muted-foreground">{vi.gallery.emptyFilter}</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 sm:gap-4">
              {filteredPhotos.map((photo, idx) => {
                const isSelected = photo.mark === "selected";
                const isMutating = mutatingIds.has(photo.id);

                return (
                  <div
                    key={photo.id}
                    className={cn(
                      "group relative aspect-square rounded-xl overflow-hidden border bg-surface/80 transition-all",
                      isSelected
                        ? "ring-2 ring-rose-500 border-rose-500/50 shadow-xs"
                        : "hover:border-foreground/20"
                    )}
                  >
                    {/* Ảnh tải qua proxy an toàn */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/img/${photo.id}?w=800`}
                      alt={photo.fileName || `Ảnh ${idx + 1}`}
                      loading="lazy"
                      className="w-full h-full object-cover select-none pointer-events-none"
                    />

                    {/* Lớp gradient nhẹ bảo đảm nút tim luôn nổi bật */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/30 pointer-events-none" />

                    {/* NÚT THẢ TIM = CHỌN ẢNH (Kích thước chạm lớn ≥44px cho mobile 375px) */}
                    <button
                      type="button"
                      disabled={isLocked || isMutating}
                      onClick={() => handleToggleHeart(photo)}
                      aria-label={isSelected ? vi.gallery.deselect : vi.gallery.select}
                      className={cn(
                        "absolute top-1.5 right-1.5 z-10 flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90 touch-manipulation focus:outline-hidden",
                        isSelected
                          ? "bg-rose-500 text-white shadow-md"
                          : "bg-black/40 text-white/90 backdrop-blur-xs hover:bg-black/60 hover:text-white"
                      )}
                    >
                      <Heart
                        className={cn(
                          "h-6 w-6 transition-all",
                          isSelected ? "fill-current text-white scale-110" : "stroke-[2.2]"
                        )}
                      />
                    </button>

                    {/* Thông tin tên file và thư mục con */}
                    <div className="absolute bottom-1.5 left-2 right-2 text-white text-[11px] truncate drop-shadow-xs pointer-events-none">
                      <span className="font-mono">{photo.fileName}</span>
                      {photo.subfolder && (
                        <span className="ml-1 opacity-75">({photo.subfolder})</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* THÀNH PHẦN HỢP ĐỒNG HAI TẦNG */}
        {contractBreakdownItems.length > 0 && (
          <section aria-labelledby="contract-breakdown-heading" className="pt-4">
            <ContractBreakdown items={contractBreakdownItems} />
          </section>
        )}

        {/* ĐẶT ẢNH VÀO SẢN PHẨM IN
            Component tự ẩn khi hợp đồng không có hàng in. Khoá lại sau khi
            khách đã chốt — cùng luật với nút thả tim. */}
        {!isLocked && (
          <PhotoPlacementPicker
            className="mt-4"
            products={printProducts}
            selectedPhotos={placeablePhotos}
            placements={placements}
            busy={placing}
            onPlace={(photoId, itemId) => changePlacement(photoId, itemId, true)}
            onRemove={(photoId, itemId) => changePlacement(photoId, itemId, false)}
          />
        )}

        {/* SẢN PHẨM MUA THÊM (ADDON) */}
        {addonProducts.length > 0 && (
          <section aria-labelledby="addons-heading" className="pt-4">
            <AddonSelector
              products={addonProducts}
              value={addonQuantities}
              disabled={isLocked}
            />
          </section>
        )}
      </div>

      {/* THANH ĐIỀU HƯỚNG DÍNH DƯỚI ĐÁY CHO MOBILE (Sticky Bottom Bar) */}
      <div className="fixed bottom-0 left-0 right-0 z-30 border-t bg-background/95 backdrop-blur-md px-4 py-3 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-1.5">
              <span className="text-xs text-muted-foreground">Đã chọn:</span>
              <span className="text-base font-black text-rose-500">
                {selectionCounts.selectedCount}
              </span>
              {gallery.quotaKnown && (
                <span className="text-xs text-muted-foreground">
                  / {gallery.includedQuota ?? 0} ảnh
                </span>
              )}
            </div>

            {gallery.quotaKnown && selectionCounts.extraCount > 0 ? (
              <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                Vượt {selectionCounts.extraCount} ảnh (+{formatCurrencyVND(selectionCounts.extraAmount)})
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">
                {gallery.quotaKnown ? "Trong hạn mức gói" : "Hạn mức chưa xác định"}
              </span>
            )}
          </div>

          {!isLocked && (
            <Button
              onClick={() => setShowSubmitModal(true)}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-5 h-11 rounded-xl shadow-md flex items-center gap-2"
            >
              <span>{vi.gallery.submitCta}</span>
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* HỘP THOẠI XÁC NHẬN CHỐT BỘ ẢNH */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-surface border rounded-2xl p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-bold">{vi.gallery.submitConfirmTitle}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {vi.gallery.submitConfirm}
            </p>

            <div className="p-3 bg-surface-2 rounded-xl text-xs space-y-1">
              <div className="flex justify-between font-medium">
                <span>Số ảnh đã chọn:</span>
                <span className="font-bold">{selectionCounts.selectedCount} ảnh</span>
              </div>
              {gallery.quotaKnown && (
                <>
                  <div className="flex justify-between">
                    <span>Số ảnh trong gói:</span>
                    <span>{gallery.includedQuota ?? 0} ảnh</span>
                  </div>
                  {selectionCounts.extraCount > 0 && (
                    <div className="flex justify-between text-amber-600 font-medium">
                      <span>Số ảnh mua thêm:</span>
                      <span>{selectionCounts.extraCount} ảnh ({formatCurrencyVND(selectionCounts.extraAmount)})</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div>
              <label htmlFor="customer-note-input" className="block text-xs font-semibold mb-1 text-muted-foreground">
                Ghi chú chung cho studio (nếu có):
              </label>
              <textarea
                id="customer-note-input"
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                placeholder="Lời nhắn thêm cho thợ chỉnh sửa..."
                className="w-full p-2.5 rounded-xl border bg-background text-sm resize-none h-20 focus:outline-hidden focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setShowSubmitModal(false)}
                disabled={submitting}
              >
                {vi.common.cancel}
              </Button>
              <Button
                onClick={handleSubmitSelection}
                disabled={submitting}
                className="bg-primary text-primary-foreground font-bold"
              >
                {submitting ? <Spinner className="w-4 h-4 mr-2" /> : null}
                {vi.common.confirm}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
