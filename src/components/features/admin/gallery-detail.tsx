/**
 * Màn chi tiết bộ ảnh cho CSKH: thành phần hợp đồng, hạn mức, chốt đơn, PIN.
 *
 * OWNER: DEV-FE. Task BB-103.
 * Spec: docs/16 mục 3.3 và mục 4
 *
 * ---------------------------------------------------------------------------
 * Mọi thao tác đổi hạn mức đều hỏi lại bằng CON SỐ
 * ---------------------------------------------------------------------------
 * Hạn mức là tổng số lượng các dòng `Edit file`. Sửa một dòng như thế là đổi số
 * ảnh khách được chọn miễn phí, mà khách đang nhìn con số đó trên màn hình của
 * họ ngay lúc này.
 *
 * API trả về hạn mức trước và sau, nên hộp thoại hỏi được "15 sẽ thành 25" chứ
 * không phải "bạn có chắc không". Câu hỏi chung chung thì ai cũng bấm qua.
 *
 * ---------------------------------------------------------------------------
 * Màn hình không phải ranh giới an ninh
 * ---------------------------------------------------------------------------
 * Nút sửa bị ẩn khi bộ ảnh đã chốt, nhưng route API mới là chỗ chặn thật — nó
 * trả GALLERY_LOCKED bất kể giao diện hiện gì.
 */

"use client";
import { BiaBoAnhEditor } from "./bia-bo-anh-editor";
import { DongThoiGianHoatDong } from "./dong-thoi-gian";
import { YeuCauMuaThemBlock } from "./yeu-cau-mua-them";
import { DanhDauDaGiao } from "./danh-dau-da-giao";
import { getStatusBadgeConfig } from "./gallery-list";
// BB-312 — khối nổi bật "khách xin mở lại". Component RIÊNG (không viết
// thẳng vào tệp này): một đội khác đang sửa `gallery-detail.tsx` cùng đợt
// này — xem chú thích ở chỗ gắn bên dưới và ở đầu file component.
import { YeuCauMoLaiBanner, type ReopenRequestChiTiet } from "./yeu-cau-mo-lai-banner";
import { PAGE_TITLE_CLASS, PAGE_TITLE_FALLBACK_CLASS } from "./page-header";

import React from "react";
import { MoreHorizontal, Copy, Check, Trash2 } from "lucide-react";
import { cn } from "@/components/ui/utils";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { isGalleryLocked } from "@/lib/gallery-status";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { vi } from "@/i18n/vi";
import { canhBaoUi } from "@/lib/lark/mau-canh-bao-ui";
import type { MauCanhBao } from "@/lib/lark/trang-thai-hau-ky";
import { nhomSanPham } from "@/lib/products/nhom-san-pham";
import {
  formatGioVN,
  formatKichThuoc,
  formatNgayGioVN,
  formatNgayVN,
  formatSdt,
  tinhTieuDeBoAnhQuanTri,
} from "@/lib/utils/dinh-dang";
/**
 * BB-296 mục #6 — tên thân thiện cho một dòng "Mua thêm", cùng luật với
 * `tenThanThienSanPham` (`components/features/gallery/cua-hang.tsx`, màn
 * khách): NHÓM + chất liệu, bỏ tiền tố lặp khi chất liệu đã tự nói tên nhóm
 * ("Khung HQ" không thành "Khung Khung HQ"). Viết lại một bản NHỎ ở đây thay
 * vì import thẳng từ `cua-hang.tsx` — component đó thuộc màn khách, đang cố
 * tình giữ nguyên không đụng trong đợt sửa này.
 */
const TEN_NHOM_QT: Record<string, string> = { anh_in: "Ảnh in", album: "Album", khung: "Khung" };
export function tenThanThienMuaThem(kind: string | null, material: string | null, size: string | null): string {
  const nhom = nhomSanPham(kind, material) ?? "anh_in";
  const tienTo = TEN_NHOM_QT[nhom] ?? "Sản phẩm";
  const cl = (material ?? "").trim();
  const ten = !cl ? tienTo : cl.toLowerCase().startsWith(tienTo.toLowerCase()) ? cl : `${tienTo} ${cl}`;
  return size ? `${ten} · ${formatKichThuoc(size)}` : ten;
}

/**
 * BB-313 mục 1 — nút chép mã hợp đồng, cạnh tiêu đề (khi không còn tên nào
 * để làm tiêu đề) hoặc cạnh dòng phụ mã hợp đồng. Cùng luật với `DongLinkApp`
 * ở cuối tệp: Clipboard API bị chặn (http, quyền) thì im lặng — mã đã
 * `select-all` sẵn ở chỗ gọi, CSKH tự bấm Ctrl+C.
 */
function NutChepMa({ ma }: { ma: string }) {
  const [daChep, setDaChep] = React.useState(false);
  async function chep() {
    try {
      await navigator.clipboard.writeText(ma);
      setDaChep(true);
      window.setTimeout(() => setDaChep(false), 2000);
    } catch {
      // Trình duyệt chặn Clipboard API — không có gì thêm để làm ở một nút nhỏ.
    }
  }
  return (
    <button
      type="button"
      onClick={() => void chep()}
      aria-label={daChep ? "Đã chép mã hợp đồng" : "Chép mã hợp đồng"}
      title={daChep ? "Đã chép" : "Chép mã hợp đồng"}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--bb-fg-muted)] hover:bg-[var(--bb-surface-2)] hover:text-[var(--bb-fg)]"
    >
      {daChep ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

/**
 * BB-313 (chấm lại 28/09/2026, mục 2) — nút xoá một dòng hàng. Trước là chữ
 * "bỏ" gạch chân, đỏ sẵn kể cả lúc không tương tác — trông thiếu chuyên
 * nghiệp và đỏ ngay từ đầu làm thao tác xoá VỐN CẦN CẨN TRỌNG lại nổi bật hơn
 * bình thường. Đổi sang nút biểu tượng thùng rác: màu trung tính lúc nghỉ,
 * chỉ chuyển đỏ khi di chuột/focus vào — đúng thang màu Be Vietnam Pro/token
 * sẵn có (`--bb-fg-muted` → `--bb-danger`), không tự đặt màu mới. `aria-label`
 * để trình đọc màn hình biết nút này làm gì (không chỉ dựa vào icon).
 */
function NutXoaDongHang({
  disabled,
  onClick,
}: {
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label="Bỏ dòng hàng này"
      title="Bỏ dòng hàng này"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--bb-radius-sm)] text-[var(--bb-fg-muted)] transition hover:bg-[var(--bb-danger)]/10 hover:text-[var(--bb-danger)] disabled:opacity-40"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

interface Component {
  id: string;
  name: string;
  kind: string;
  quantity: number;
}

interface Item {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  totalPrice: number | null;
  components: Component[];
}

interface Revision {
  round: number;
  note: string;
  reviewed_url: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface CatalogProduct {
  id: string;
  name: string;
  kind: string;
}

interface Detail {
  galleryId: string;
  title: string;
  status: string;
  contractCodes: string[];
  extraPhotoPrice: number;
  quotaKnown: boolean;
  includedQuota: number | null;
  totalValue: number;
  selectedCount: number;
  shareLink: {
    id: string;
    status: string;
    expiresAt: string | null;
    tokenPrefix: string | null;
    createdAt: string | null;
    viewCount: number;
    revokedAt: string | null;
    /** BB-201 — link đầy đủ; null = link tạo trước 25/09/2026 chưa khôi phục, hoặc không có quyền gửi link. */
    diaChi: string | null;
  } | null;
  items: Item[];
  revisions: Revision[];
  catalog: CatalogProduct[];
  finalDriveUrl: string | null;
  /** Thư mục ảnh GỐC — khác finalDriveUrl ở trên (ảnh đã chỉnh gửi khách). */
  driveFolderUrl: string | null;
  driveFolderId: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  photoCount: number;
  /** BB-290 lượt 2 — "Chốt lúc" trong hàng 4 số liệu; null = khách chưa chốt. */
  submittedAt: string | null;
  dueAmount: number;
  /** BB-294 (#2) — tổng sản phẩm mua thêm (`selection_addons`) của lần chốt chính; khác `dueAmount` (tiền vượt hạn mức ảnh). */
  addonsAmount: number;
  paidAmount: number;
  outstanding: number;
  /** BB-215 — khối "Bìa bộ ảnh". */
  coverPhotoId: string | null;
  coverHeadline: string | null;
  welcomeMessage: string | null;
  /**
   * BB-313 (ảnh chụp app thật, Đợt 9, mục 1) — nickname/họ tên đầy đủ gửi
   * RIÊNG (trước là một chuỗi `babyName` đã COALESCE sẵn), để màn hình tự áp
   * `tinhTenBiaTuDuLieu`/`tinhTieuDeBoAnhQuanTri` đúng luật (mất nickname thì
   * KHÔNG thêm "Bé " trước họ tên đầy đủ) — xem `dinh-dang.ts`.
   */
  babyNickname: string | null;
  babyFullName: string | null;
  branchName: string | null;
  /** BB-303 (quan-tri-chi-tiet.png) — tiêu đề "Loại buổi · Bé …" + dòng phụ. */
  packageName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  shootDate: string | null;
  /**
   * BB-308 (vòng 4, mục #5) — "loại buổi chụp" thật ("Thôi nôi", "Newborn"…,
   * `shoots.concept`) — KHÁC `packageName` (tên gói/sản phẩm) ở trên. Dùng
   * cho khung xem trước bìa quản trị (`BiaBoAnhEditor`) khớp đúng bìa khách
   * thấy (`BiaBoAnh`, prop `sessionType`).
   */
  sessionType: string | null;
  /** BB-200 (3/3) — nhãn quản trị đã tính từ trạng thái app + mã Lark. */
  statusLabel?: string;
  /** Mức cảnh báo từ Lark; null = chưa đọc được hoặc không áp dụng. */
  warningColor?: MauCanhBao | null;
  /** Tên trạng thái bên Lark (TRANG_THAI_LARK), để dòng "Lark: …". */
  larkTenTrangThai?: string | null;
  /** Lần cuối app đọc được từ Lark; null = chưa đọc bao giờ. */
  larkDocLuc?: string | null;
  /** Nhân viên đang đăng nhập có quyền `galleries:reopen` không. */
  canReopen?: boolean;
  /** BB-311 — nhân viên đang đăng nhập có quyền `deliveries:write` không. */
  canMarkDelivered?: boolean;
  /** BB-312 — trạng thái "khách xin mở lại" (khác `revisions`: đó là vòng duyệt ảnh đã chỉnh). */
  reopenRequest?: ReopenRequestChiTiet;
  /** BB-313 mục 2 — vai hiện tại có quyền `galleries:write` không (ẩn nút sửa/xoá/thêm dòng hàng khi không có). */
  canEditItems?: boolean;
  /** BB-202 — bìa của mỗi album TRONG GÓI, `fileName: null` = chưa chọn. */
  albumCovers?: Array<{ galleryItemId: string; name: string; fileName: string | null }>;
  /**
   * BB-296 mục #6 — báo cáo chấm độc lập lần 3: cột trái trống hoác dưới thẻ
   * số liệu — không thấy ảnh khách đã chọn, không thấy TỪNG món mua thêm.
   * Hai mảng này đọc thẳng `selection_items`/`selection_addons` đã có sẵn
   * (route `items/route.ts`), không đổi schema.
   */
  selectedPhotos?: Array<{ photoId: string; fileName: string; note: string | null }>;
  addonPurchases?: Array<{
    id: string;
    productId: string;
    photoId: string | null;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    productName: string;
    material: string | null;
    size: string | null;
    kind: string | null;
  }>;
}

export function GalleryDetail({ galleryId }: { galleryId: string }) {
  const [detail, setDetail] = React.useState<Detail | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [linkMoi, setLinkMoi] = React.useState<string | null>(null);
  const [dangSuaThuMuc, setDangSuaThuMuc] = React.useState(false);
  const [thuMucMoi, setThuMucMoi] = React.useState("");
  /**
   * BB-308 (bản vẽ BB-301: "…" gom thao tác phụ) — form "Mở lại cho khách
   * chọn" giờ chỉ hiện khi bấm từ menu "…", không còn nằm cố định trên
   * trang. Trạng thái đặt ở đây (không phải trong `KhoiChinh`) vì nút mở nằm
   * trên header, còn form nằm ở cột trái — hai chỗ khác component.
   */
  const [dangMoLai, setDangMoLai] = React.useState(false);
  /**
   * BB-132: link vừa tạo đã được ghi thẳng sang cột "Link app" bên Lark chưa.
   *
   * null = chưa tạo link nào lần này. Phân biệt với false ("đã thử, hỏng") là
   * cần thiết: hai trạng thái đó dẫn tới hai việc khác nhau của CSKH.
   */
  const [daGhiLark, setDaGhiLark] = React.useState<boolean | null>(null);
  const [lyDoKhongGhiLark, setLyDoKhongGhiLark] = React.useState<string | null>(null);
  /** BB-286, đơn giản hoá BB-311 mục A — nút "Làm nóng ảnh" (chỉ còn làm nóng ảnh BÌA). */
  const [dangLamNong, setDangLamNong] = React.useState(false);
  const [thongBaoLamNong, setThongBaoLamNong] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/admin/galleries/${galleryId}/items`);
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      // Máy chủ có thể trả mã trần ("FORBIDDEN") làm message — nhân viên mở bộ
      // của chi nhánh khác từng thấy đúng chữ đó (BB-230 E-10). Chặn/không có
      // thì nói bằng câu người đọc được.
      if (res.status === 403) setError("Bạn không có quyền xem bộ ảnh này (bộ thuộc chi nhánh khác).");
      else if (res.status === 404) setError("Không tìm thấy bộ ảnh này.");
      else setError(json?.error?.message ?? "Không tải được bộ ảnh");
      return;
    }
    setDetail(json.data);
  }, [galleryId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  /**
   * Lớp chặn thứ hai cho cùng một lỗi.
   *
   * Chỗ gọi đã có `key={id}` nên React tháo và dựng lại component mỗi lần đổi
   * bộ ảnh. Nhưng chốt ấy nằm ở **trên một tệp khác** — ai đó dựng
   * `<GalleryDetail>` ở chỗ mới mà quên `key` là lỗi quay lại nguyên vẹn, và lần
   * này không ai biết để đi tìm.
   *
   * Ba trạng thái dưới đây đều nói về **lần tạo link vừa rồi**. Chuyển sang bộ
   * khác thì chúng không còn đúng về bất cứ thứ gì nữa.
   */
  React.useEffect(() => {
    setLinkMoi(null);
    setDaGhiLark(null);
    setLyDoKhongGhiLark(null);
    setDangMoLai(false);
    setDangSuaThuMuc(false);
  }, [galleryId]);

  if (error) return <p className="text-sm text-[var(--bb-danger)]">{error}</p>;
  if (!detail) return <p className="text-sm text-[var(--bb-fg-muted)]">Đang tải…</p>;

  const locked = isGalleryLocked(detail.status);

  /** Gửi một thay đổi dòng hàng, hỏi lại nếu hạn mức đổi. */
  async function changeItem(method: "PATCH" | "DELETE", body: Record<string, unknown>) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/items`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không lưu được");
        return;
      }
      const { quotaBefore, quotaAfter, tuLark } = json.data;
      const phanHanMuc =
        quotaBefore !== quotaAfter
          ? `Hạn mức đã đổi: ${quotaBefore ?? "chưa biết"} → ${quotaAfter ?? "chưa biết"} ảnh. Nhớ báo lại cho khách.`
          : null;
      // BB-313 mục 2 — xoá một dòng còn đến từ hợp đồng Lark (`tuLark`) chỉ
      // TẠM THỜI: lần đồng bộ Lark sau có thể tạo lại đúng dòng đó (đọc chú
      // thích ở route PATCH/DELETE, items/route.ts) — nói ngay lúc này, đừng
      // để CSKH tưởng đã xoá vĩnh viễn rồi ngạc nhiên vài ngày sau.
      const phanLark =
        method === "DELETE" && tuLark
          ? "Dòng này đến từ hợp đồng Lark — lần đồng bộ Lark sau có thể tạo lại đúng dòng này. Muốn bỏ vĩnh viễn thì sửa trên Lark."
          : null;
      const thongBao = [phanHanMuc, phanLark].filter(Boolean).join(" ");
      if (thongBao) setNotice(thongBao);
      await load();
    } finally {
      setBusy(false);
    }
  }



  async function confirmSubmission() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/confirm`, { method: "POST" });
      const json = await res.json().catch(() => null);
      setNotice(
        res.ok
          ? "Đã xác nhận, bộ ảnh chuyển sang giai đoạn chỉnh ảnh."
          : (json?.error?.message ?? "Không xác nhận được"),
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * BB-150 — đổi thư mục ẢNH GỐC.
   *
   * Đổi link mà không kéo ảnh về thì màn hình vẫn hiện ảnh của thư mục cũ và
   * không ai hiểu vì sao, nên đổi xong là hỏi luôn có đồng bộ ngay không.
   */
  async function doiThuMuc(url: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/drive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveUrl: url }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không đổi được thư mục.");
        return;
      }
      setDangSuaThuMuc(false);
      await load();
      if (window.confirm("Đã đổi thư mục. Kéo ảnh từ thư mục mới về luôn?")) {
        await dongBoLai();
      } else {
        setNotice("Đã đổi thư mục. Ảnh trên màn hình vẫn là của thư mục cũ cho tới khi đồng bộ.");
      }
    } finally {
      setBusy(false);
    }
  }

  /** Kéo lại ảnh từ thư mục hiện tại. Route trả 202 rồi chạy nền. */
  async function dongBoLai() {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/sync`, { method: "POST" });
      const json = await res.json().catch(() => null);
      setNotice(
        res.ok
          ? "Đang kéo ảnh về. Vài trăm ảnh mất một lúc — bấm tải lại trang sau vài phút để xem kết quả."
          : (json?.error?.message ?? "Không chạy được lệnh đồng bộ."),
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** CSKH chuyển thư mục ảnh đã chỉnh cho khách: in_retouch → chờ khách duyệt. */
  async function sendRetouched(url: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/retouch-done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ finalDriveUrl: url }),
      });
      const json = await res.json().catch(() => null);
      setNotice(
        res.ok
          ? "Đã gửi. Bộ ảnh chuyển sang chờ khách duyệt — nhắn cho khách vào link xem."
          : (json?.error?.message ?? "Không gửi được"),
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Mở lại cho khách chọn tiếp. Bắt buộc có lý do — route API cũng bắt. */
  async function reopen(reason: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/reopen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => null);
      setNotice(
        res.ok
          ? "Đã mở lại. Khách chọn ảnh tiếp được — nhớ báo cho khách."
          : (json?.error?.message ?? "Không mở lại được"),
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * BB-215 — lưu ảnh bìa, tiêu đề bìa và lời trên bìa, một lượt cho cả ba.
   *
   * Chỉ gửi những trường đổi — `undefined` thì route PATCH giữ nguyên giá trị
   * cũ (xem bia/route.ts). Route kiểm lại quyền, chi nhánh và ảnh có thuộc
   * đúng bộ này không; màn hình chỉ hỏi để hiện lỗi cho CSKH đọc.
   */
  async function saveCover(
    thayDoi: { coverPhotoId?: string | null; coverHeadline?: string | null; welcomeMessage?: string | null },
  ) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/bia`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(thayDoi),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không lưu được bìa");
        return;
      }
      setNotice("Đã lưu bìa.");
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * Tạo link gửi khách. Link hiện ĐÚNG MỘT LẦN — cơ sở dữ liệu chỉ giữ bản băm.
   *
   * Giữ trong state riêng chứ không nhét vào `notice`: nhắn thông báo nào khác
   * cũng ghi đè `notice`, mà mất link thì phải tạo lại từ đầu.
   */
  async function taoLink() {
    setBusy(true);
    setNotice(null);
    // Xoá kết quả ghi Lark của lần trước: để nguyên là CSKH nhìn thấy dấu
    // "đã ghi sang Lark" của link cũ trong lúc link mới còn đang tạo.
    setDaGhiLark(null);
    setLyDoKhongGhiLark(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/share-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không tạo được link");
        return;
      }
      // Ưu tiên ĐÚNG chuỗi đã ghi sang Lark: đó chính là link khách sẽ nhận.
      // Ghi hỏng thì rơi về ghép tên miền ở phía trình duyệt — máy chủ không
      // biết chắc khách vào bằng tên miền nào, đoán sai thì CSKH gửi đi một
      // link chết.
      setLinkMoi(
        json.data.diaChiDaGhiLark ?? `${window.location.origin}${json.data.duongDan}`,
      );
      setDaGhiLark(json.data.daGhiLark === true);
      setLyDoKhongGhiLark(json.data.lyDoKhongGhiLark ?? null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  /**
   * BB-286, đơn giản hoá BB-311 mục A (28/09/2026) — "Chuẩn bị ảnh bìa": kéo
   * trước và ghi vào bộ đệm ẢNH BÌA (cỡ 1600 + 2048), để khách mở link không
   * phải đợi ảnh bìa kéo từ Google.
   *
   * TRƯỚC: nong CẢ BỘ (tới 1.235 ảnh) cỡ 800, trình duyệt tự lặp route theo
   * lô vì gói Hobby giới hạn thời lượng một lần gọi hàm. TỪ NAY: `/api/img`
   * không còn đệm ảnh lưới (chỉ đệm ảnh bìa) — chỉ còn ĐÚNG một ảnh × hai cỡ,
   * xong trong MỘT lượt gọi, không cần vòng lặp/con trỏ nữa.
   *
   * BB-311 (28/09/2026, admin — P0 chữ nghĩa): "Làm nóng ảnh" không chuyên
   * nghiệp — đổi chữ hiển thị thành "Chuẩn bị ảnh bìa" / "Đã chuẩn bị xong
   * ảnh bìa". Tên HÀM và API (`lamNongAnh`, `/lam-nong-anh`, `lamNongAnhBia`)
   * GIỮ NGUYÊN — chỉ đổi chữ người dùng nhìn thấy, không đổi hợp đồng API.
   */
  async function lamNongAnh() {
    setDangLamNong(true);
    setThongBaoLamNong(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/lam-nong-anh`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setThongBaoLamNong(json?.error?.message ?? "Không chuẩn bị được ảnh bìa");
        return;
      }
      if (!json.data.coAnhBia) {
        setThongBaoLamNong("Bộ này chưa có ảnh bìa — chọn ảnh bìa trước.");
        return;
      }
      if (json.data.dungVìQuota) {
        setThongBaoLamNong("Dừng lại vì Google Drive báo lỗi liên tục (có thể đã hết hạn mức). Thử lại sau vài phút.");
        return;
      }
      setThongBaoLamNong(
        json.data.soMoiNong > 0
          ? `Đã chuẩn bị xong ${json.data.soMoiNong} ảnh.`
          : "Ảnh bìa đã nằm sẵn trong bộ đệm rồi.",
      );
    } finally {
      setDangLamNong(false);
    }
  }

  /**
   * Mở khoá lại link CŨ — giữ nguyên địa chỉ (BB-188).
   *
   * Khác hẳn `taoLink()`: không sinh mã mới, nên biểu tượng ba mẹ đã ghim ngoài
   * màn hình điện thoại vẫn mở đúng bộ ảnh cũ.
   */
  async function moLaiLink() {
    if (
      detail?.shareLink?.revokedAt &&
      !window.confirm(
        "Link này đã BỊ THU HỒI, thường là vì nghi mã lọt ra ngoài. Mở khoá lại là mở cho cả " +
          "người đang cầm mã đó. Vẫn mở?",
      )
    ) {
      return;
    }

    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/share-link/mo-lai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không mở khoá được link");
        return;
      }
      setNotice(
        `Đã mở khoá link cũ — địa chỉ GIỮ NGUYÊN, ba mẹ dùng lại đúng link đã lưu. ` +
          `Hạn mới: ${json.data.ttlDays} ngày.`,
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Thêm một dòng hàng tay. Hỏi lại bằng con số nếu hạn mức đổi. */
  async function addItem(productId: string, quantity: number) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không thêm được");
        return;
      }
      const { quotaBefore, quotaAfter } = json.data;
      if (quotaBefore !== quotaAfter) {
        setNotice(
          `Hạn mức đã đổi: ${quotaBefore ?? "chưa biết"} → ${quotaAfter ?? "chưa biết"} ảnh. ` +
            "Nhớ báo lại cho khách.",
        );
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Ghi nhận đã thu tiền. Ghi thêm dòng, không sửa đè — bảng là sổ. */
  async function recordPayment(amount: number, method: string, note: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/galleries/${galleryId}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, method, note }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setNotice(json?.error?.message ?? "Không ghi nhận được");
        return;
      }
      const left = json.data.outstanding as number;
      setNotice(
        left > 0
          ? `Đã ghi. Còn thiếu ${formatCurrencyVND(left)}.`
          : left < 0
            ? `Đã ghi. Khách trả DƯ ${formatCurrencyVND(-left)} — kiểm tra lại giúp.`
            : "Đã ghi. Khách đã trả đủ.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }

  const overCount = detail.quotaKnown && detail.includedQuota !== null
    ? Math.max(0, detail.selectedCount - detail.includedQuota)
    : null;

  const statusBadge = getStatusBadgeConfig(detail.status);
  // BB-303 (quan-tri-chi-tiet.png) — "Loại buổi · Bé …" thay tên bộ ảnh thô
  // (thường là mã hợp đồng) khi có đủ dữ liệu; thiếu thì lùi về tên khách,
  // rồi cuối cùng mới về `detail.title` (thường là mã hợp đồng) — KHÔNG bịa
  // "Loại buổi" hay tên bé.
  // BB-313 (ảnh chụp app thật, Đợt 9, mục 1) — gộp về MỘT hàm dùng chung
  // (`tinhTieuDeBoAnhQuanTri`, dinh-dang.ts): trước đây `tenGoiBe` bị gọi VÔ
  // ĐIỀU KIỆN lên `detail.babyName` (một chuỗi coalesce sẵn nickname||họ tên
  // đầy đủ) — bé KHÔNG có nickname thì bị thêm nhầm "Bé " trước cả họ tên đầy
  // đủ. `laMaHopDong` cho biết `tieuDe` đang là mã hợp đồng (không còn tên
  // nào để thay) — phải hiện bằng Be Vietnam Pro tabular
  // (`PAGE_TITLE_FALLBACK_CLASS`), không phải Playfair (`PAGE_TITLE_CLASS`):
  // mã dạng "HD_20260911#5087" viết serif có số 0 dễ đọc lầm chữ O.
  const { tieuDe, laMaHopDong } = tinhTieuDeBoAnhQuanTri({
    packageName: detail.packageName,
    babyNickname: detail.babyNickname,
    babyFullName: detail.babyFullName,
    customerName: detail.customerName,
    duPhong: detail.title,
  });
  const dongPhu = [
    detail.customerName,
    detail.customerPhone ? formatSdt(detail.customerPhone) : null,
    detail.branchName,
    detail.shootDate ? formatNgayVN(detail.shootDate) : null,
  ].filter((v): v is string => !!v);

  return (
    <div className="flex flex-col gap-5">
      {/* BB-312 — khối nổi bật đầu trang khi có yêu cầu "xin mở lại" đang
          chờ; tự ẩn khi không có gì để xử lý (xem component). */}
      <YeuCauMoLaiBanner
        galleryId={galleryId}
        status={detail.status}
        canReopen={detail.canReopen === true}
        reopenRequest={detail.reopenRequest}
        onDone={load}
      />

      {/* Bản vẽ quan-tri-chi-tiet.webp: tiêu đề serif lớn kèm nhãn trạng thái
          viên tròn ngay cạnh — trước đây trạng thái chỉ nằm lẫn trong lưới chỉ
          số bên dưới, phải đọc thêm mới biết bộ ảnh đang ở đâu. */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            {/*
              BB-280: bỏ `sm:text-3xl` — thang chữ chung yêu cầu tiêu đề trang
              một cỡ cố định ở mọi kích thước màn hình (docs/07-ui-ux.md).
            */}
            <h1 className={cn(laMaHopDong ? PAGE_TITLE_FALLBACK_CLASS : PAGE_TITLE_CLASS, "flex items-center gap-2")}>
              {tieuDe}
              {/* BB-313 mục 1 — không có tên bé lẫn tên khách, tiêu đề đang
                  hiện mã hợp đồng: gắn nút chép NGAY CẠNH tiêu đề thay vì lặp
                  lại mã một lần nữa ở dòng phụ bên dưới (mục "dongMaHopDong"). */}
              {laMaHopDong && <NutChepMa ma={tieuDe} />}
            </h1>
            <span className="inline-flex items-center gap-1.5">
              {/* Chữ "Trạng thái" giữ lại làm nhãn — tests/e2e/bb-200-nhan-lark.spec.ts
                  đợi đúng chữ này làm mốc "đã tải xong dữ liệu" trước khi kiểm
                  phần hiện/ẩn theo quyền. Bỏ chữ là phép thử chờ mãi không thấy,
                  không phải vì mã sai mà vì mốc chờ biến mất — AGENTS.md §5a. */}
              <span className="text-xs text-[var(--bb-fg-muted)]">Trạng thái</span>
              {detail.warningColor && canhBaoUi(detail.warningColor) && (
                <span
                  role="img"
                  aria-label={`Mức cảnh báo: ${canhBaoUi(detail.warningColor)!.nhan}`}
                  title={canhBaoUi(detail.warningColor)!.nhan}
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-black/10"
                  style={{ backgroundColor: canhBaoUi(detail.warningColor)!.mauToken }}
                />
              )}
              <Badge
                variant={statusBadge.variant}
                title={detail.larkTenTrangThai ? `Trên Lark: ${detail.larkTenTrangThai}` : undefined}
              >
                {detail.statusLabel ?? statusBadge.label}
              </Badge>
            </span>
          </div>
          {/* BB-303 (quan-tri-chi-tiet.png) — dòng phụ "khách · SĐT · chi
              nhánh · ngày chụp", chỉ nối các phần THẬT SỰ có dữ liệu. */}
          {dongPhu.length > 0 && (
            <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">{dongPhu.join(" · ")}</p>
          )}
          {/* BB-303 (luật phông 28/09/2026): tabular-nums thay font-mono.
              BB-313 mục 1 — ẨN dòng này khi tiêu đề lớn Ở TRÊN đã đang chính
              là mã hợp đồng (`laMaHopDong`): trước bản vá, mã bị in HAI LẦN
              (tiêu đề Playfair + dòng nhỏ này lặp lại nguyên văn) — nút chép
              đã chuyển lên cạnh tiêu đề ở trên cho đúng trường hợp đó. */}
          {detail.contractCodes.length > 0 && !laMaHopDong && (
            <p
              data-testid="dong-ma-hop-dong"
              className="mt-1 flex items-center gap-1.5 tabular-nums text-xs text-[var(--bb-fg-muted)]"
            >
              <span className="select-all">{detail.contractCodes.join(" + ")}</span>
              <NutChepMa ma={detail.contractCodes.join(" + ")} />
            </p>
          )}
          {/* BB-200 (3/3) → BB-290 lượt 2 (#36): dòng "Lark: …" KHÔNG còn đứng
              ngay dưới H1 (đọc như một cảnh báo lớn cho một chi tiết kỹ thuật
              nội bộ) — chuyển thành biểu tượng "i" nhỏ bên trong khối Nhật ký ở
              cột phải (`DongThoiGianHoatDong`, prop `canhBaoLark`). Vẫn HIỆN
              chữ, không chỉ ẩn trong tooltip — tests/e2e/bb-200-nhan-lark.spec.ts
              đợi đúng chuỗi "Lark: …" nhìn thấy được trên trang.
          */}
        </div>

        {/* `ml-auto`: header dùng `flex-wrap` — tiêu đề dài (đủ khách/SĐT/chi
            nhánh/ngày chụp) đẩy khối nút này xuống DÒNG RIÊNG trên điện
            thoại hẹp. `justify-between` của header chỉ chia đều KHI hai khối
            còn chung một dòng; khối nút đứng một mình trên dòng mới thì tự
            rơi về mép trái (mặc định flex-start) — `ml-auto` giữ nó ở mép
            phải trong MỌI trường hợp, để nút "⋯" không nằm giữa trang và menu
            xổ xuống (`right-0`, neo theo mép phải CHÍNH nút) không tràn ra
            ngoài mép trái màn hình 390px. */}
        <div className="ml-auto flex shrink-0 items-start gap-2">
          {/* BB-308 (bản vẽ BB-301 admin duyệt: "MỘT nút chính theo trạng
              thái + nút ⋯ gom các thao tác phụ") — Đồng bộ lại, Đổi thư mục,
              Làm nóng ảnh, Mở lại cho khách chọn, Tạo link mới, Gia hạn
              trước đây rải rác thành nút riêng ở cột phải; nay gom vào một
              menu để cột phải chỉ còn thẻ thông tin. Hành vi/API của từng
              thao tác giữ nguyên — chỉ đổi CHỖ ĐẶT nút bấm. */}
          <MenuThaoTacPhu
            detail={detail}
            busy={busy}
            dangLamNong={dangLamNong}
            onDongBoLai={() => void dongBoLai()}
            onMoDoiThuMuc={() => {
              setThuMucMoi(detail.driveFolderUrl ?? "");
              setDangSuaThuMuc(true);
            }}
            onLamNongAnh={() => void lamNongAnh()}
            onMoMoLai={() => setDangMoLai(true)}
            onTaoLink={() => void taoLink()}
            onGiaHan={() => void moLaiLink()}
          />
          {/* BB-290 lượt 2 (#36): MỘT nút chính màu mực ở đầu trang, theo
              quan-tri-chi-tiet.png — trước đây nút "Xác nhận và chuyển sang
              chỉnh ảnh" nằm tận cuối cột trái, sau rất nhiều khối khác. Chỉ
              trạng thái "submitted" mới có hành động một-bấm-là-xong ở đây;
              trạng thái "in_retouch" cần dán link trước khi gửi nên nút chính
              của nó vẫn đứng cạnh ô nhập (RetouchSender, cột trái) — không
              trạng thái nào hiện hai nút mực cùng lúc. */}
          {detail.status === "submitted" && (
            // BB-303 (bản vẽ BB-301: "bản điện thoại, nút chính ghim đáy") —
            // trên máy tính nút chính nằm ở đầu trang như cũ (BB-290 lượt 2);
            // trên điện thoại nó CHUYỂN xuống thanh ghim đáy phía dưới (xem
            // cuối component) để luôn trong tầm ngón tay cái, không cần cuộn
            // lên đầu trang — chỉ hiện MỘT bản, không lặp hai nút cùng ý.
            <div className="hidden shrink-0 flex-col items-end gap-2 lg:flex">
              {detail.outstanding > 0 && (
                <p className="max-w-xs text-right text-xs text-[var(--bb-danger)]">
                  Khách còn thiếu <strong>{formatCurrencyVND(detail.outstanding)}</strong>
                </p>
              )}
              <button
                type="button"
                disabled={busy}
                onClick={() => void confirmSubmission()}
                className="rounded-full bg-[var(--bb-fg)] px-4 py-2.5 text-sm font-medium text-[var(--bb-bg)] disabled:opacity-40"
              >
                Xác nhận và chuyển sang chỉnh ảnh
              </button>
            </div>
          )}
        </div>
        {/* BB-294 (mục cũ #36) — lối tắt tới khối "Xuất danh sách": trên
            điện thoại khối đó nằm ở cột phải, sau nhiều khối khác, nên rơi
            khỏi màn hình đầu. Một liên kết neo nhỏ ở đây (luôn trong màn
            hình đầu, cùng hàng tiêu đề) đưa CSKH tới thẳng đó bằng cuộn mượt,
            không phải dựng lại bố cục toàn trang. */}
        {detail.selectedCount > 0 && (
          <a
            href="#xuat-danh-sach"
            className="shrink-0 self-start rounded-full border border-[var(--bb-border)] px-3 py-1.5 text-xs text-[var(--bb-fg-muted)] hover:bg-[var(--bb-surface-2)] hover:text-[var(--bb-fg)]"
          >
            {vi.admin.export.title} ↓
          </a>
        )}
      </header>

      {/* BB-308 — phản hồi tiến độ "Làm nóng ảnh" (kích hoạt từ menu ⋯
          phía trên): trước đây có hẳn một thẻ "Bộ đệm ảnh" cố định ở cột
          phải; bản vẽ BB-301 chỉ liệt kê 4 thẻ thông tin (Bìa, Thư mục ảnh
          gốc, Link khách, Xuất danh sách) nên khối này giờ chỉ hiện TẠM
          THỜI, giống banner `notice`, trong lúc/ sau khi chạy. */}
      {(dangLamNong || thongBaoLamNong) && (
        <p className="rounded-md border border-[var(--bb-border)] p-3 text-sm">
          {dangLamNong ? "Đang chuẩn bị ảnh bìa… " : ""}
          {thongBaoLamNong}
        </p>
      )}

      {notice && (
        <p className="rounded-md border border-[var(--bb-border)] p-3 text-sm">{notice}</p>
      )}

      {/* BB-290 lượt 2: hàng 4 số liệu theo quan-tri-chi-tiet.png — bốn THẺ
          RIÊNG (trước là một thẻ lớn chia bốn cột trong). "Vượt hạn mức" và
          "Còn phải thu" (thông tin tài chính chi tiết) vẫn còn đủ ở khối
          "Tiền phát sinh" bên dưới — không mất chức năng, chỉ đổi tầng hiện
          của hàng tóm tắt đầu trang cho khớp bản vẽ. */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TheSoLieu label="Ảnh trong bộ" value={String(detail.photoCount)} />
        <TheSoLieu
          label="Khách đã chọn"
          value={String(detail.selectedCount)}
          phu={detail.quotaKnown ? `/ ${detail.includedQuota} tấm` : undefined}
          canhBao={overCount !== null && overCount > 0}
        />
        <TheSoLieu
          // BB-294 (#2, mục cũ #36): "₫" giờ nằm NGAY TRONG `value`, cùng cỡ
          // cùng dòng với số — theo đúng quan-tri-chi-tiet.html (`.so`
          // "450.000 ₫" không tách <small>). Giá trị lấy từ `addonsAmount`
          // (tổng sản phẩm mua thêm của lần chốt), không phải `dueAmount`
          // (tiền vượt hạn mức ảnh — hai số khác nhau, xem items/route.ts).
          label="Mua thêm"
          value={`${new Intl.NumberFormat("vi-VN").format(Math.max(0, detail.addonsAmount))} ₫`}
        />
        <TheSoLieu
          // BB-318 (Q-c): ngày đủ dd/mm/yyyy như mọi màn (không còn bản "27/09"
          // rút gọn); `chuNho` co cỡ số để không tràn thẻ hẹp (BB-294 #18).
          // Giờ:phút vẫn ở `phu`.
          label="Chốt lúc"
          value={detail.submittedAt ? formatNgayVN(detail.submittedAt) || "—" : "—"}
          phu={detail.submittedAt ? formatGioVN(detail.submittedAt) || undefined : undefined}
          chuNho
        />
      </section>

      {/*
        Bản vẽ quan-tri-chi-tiet.webp: cột phải mảnh gồm bìa bộ ảnh, link gửi
        khách và thư mục ảnh gốc; cột trái rộng hơn giữ phần nghiệp vụ chính.
        Chỉ đổi BỐ CỤC bằng lưới — mọi khối bên trong giữ nguyên props/hành vi.
      */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:items-start">
        <div className="flex flex-col gap-5 lg:col-span-2 lg:order-1">
          <KhoiChinh
            detail={detail}
            busy={busy}
            locked={locked}
            changeItem={changeItem}
            addItem={addItem}
            recordPayment={recordPayment}
            sendRetouched={sendRetouched}
            reopen={reopen}
            dangMoLai={dangMoLai}
            dongMoLai={() => setDangMoLai(false)}
            onDelivered={load}
            galleryId={galleryId}
          />
        </div>
        <div className="flex flex-col gap-5 lg:order-2">
          <BiaBoAnhEditor
            galleryId={galleryId}
            detail={detail}
            busy={busy}
            onSave={(thayDoi) => void saveCover(thayDoi)}
          />

          {/* BB-150 — Thư mục ảnh GỐC. */}
          <section className="rounded-lg border border-[var(--bb-border)] p-4">
            <h2 className="text-base font-medium">Thư mục ảnh gốc</h2>

            {detail.syncError && (
              <p className="mt-2 rounded-md border border-[var(--bb-danger)] p-3 text-sm">
                <strong>Lần kéo ảnh gần nhất hỏng.</strong> {detail.syncError}
              </p>
            )}

            <div className="mt-2 text-sm">
              {detail.driveFolderUrl ? (
                <a
                  href={detail.driveFolderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-all text-xs underline"
                >
                  {detail.driveFolderUrl}
                </a>
              ) : (
                <span className="text-[var(--bb-fg-muted)]">Chưa gắn thư mục nào.</span>
              )}
            </div>

            <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
              {detail.photoCount} ảnh đã kéo về ·{" "}
              {detail.lastSyncedAt
                ? `đồng bộ lần cuối ${formatNgayGioVN(detail.lastSyncedAt)}`
                : "chưa đồng bộ lần nào"}
            </p>

            {/* BB-308 (bản vẽ BB-301 admin duyệt) — "Đồng bộ lại" và "Đổi
                thư mục" chuyển vào menu ⋯ ở đầu trang; thẻ này giờ CHỈ còn
                thông tin (mã thư mục, số ảnh, lần đồng bộ). Form đổi thư mục
                dưới đây vẫn dùng chung hàm `doiThuMuc`, chỉ đổi cách mở. */}
            {dangSuaThuMuc && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="url"
                  name="driveFolderUrl"
                  value={thuMucMoi}
                  disabled={busy}
                  onChange={(e) => setThuMucMoi(e.target.value)}
                  placeholder="Dán địa chỉ thư mục ảnh trên Google Drive"
                  aria-label="Địa chỉ thư mục ảnh gốc"
                  className="min-w-64 flex-1 rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
                />
                {/* BB-290 lượt 2 (#36): chỉ MỘT nút chính màu mực trên cả
                    trang (xem nút xác nhận/gửi ảnh ở đầu trang) — nút phụ ở
                    đây đổi về viền, không còn sage đặc. */}
                <button
                  type="button"
                  disabled={busy || thuMucMoi.trim().length < 12}
                  onClick={() => void doiThuMuc(thuMucMoi.trim())}
                  className="rounded-md border border-[var(--bb-fg)] px-3 py-2 text-sm text-[var(--bb-fg)] disabled:opacity-40"
                >
                  Lưu thư mục
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setDangSuaThuMuc(false)}
                  className="text-xs text-[var(--bb-fg-muted)] underline"
                >
                  Huỷ
                </button>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-[var(--bb-border)] p-4">
            {/* BB-290 lượt 2: "Link khách" theo quan-tri-chi-tiet.png (nhãn
                cũ "Link gửi khách" vẫn đúng nghĩa, đổi cho khớp bản vẽ). */}
            <h2 className="text-base font-medium">Link khách</h2>

            {linkMoi ? (
              <div className="mt-3">
                {/* BB-132: nói rõ CSKH còn phải làm gì. Trước đây câu chữ luôn là
                    "sao link này dán vào cột link app bên Lark" — nay máy đã dán
                    hộ, nên để nguyên câu đó là bắt người làm lại một việc đã xong,
                    và tệ hơn: dán tay đè lên thì lại mở ra đúng nguy cơ dán nhầm
                    dòng mà BB-132 sinh ra để bỏ. */}
                {daGhiLark ? (
                  <p className="rounded-md border border-[var(--bb-success)] p-3 text-sm">
                    <strong>Đã ghi sang Lark.</strong> Link nằm sẵn ở cột <em>Link app</em> đúng
                    dòng Hậu Kỳ của khách này — <strong>không cần dán tay</strong>. Dưới đây là
                    đúng chuỗi đã ghi, để đối chiếu hoặc gửi thẳng cho khách.
                  </p>
                ) : (
                  <p className="rounded-md border border-[var(--bb-danger)] p-3 text-sm">
                    <strong>Chưa ghi được sang Lark — dán tay giúp.</strong> Sao link dưới đây
                    dán vào cột <em>Link app</em> đúng dòng Hậu Kỳ của khách này.
                    {lyDoKhongGhiLark ? (
                      <>
                        <br />
                        <span className="text-[var(--bb-fg-muted)]">Lý do: {lyDoKhongGhiLark}</span>
                      </>
                    ) : null}
                  </p>
                )}
                <p className="mt-2 text-sm">
                  Link này cũng luôn hiện lại ở đây khi mở bộ ảnh (BB-201).
                </p>
                <textarea
                  readOnly
                  rows={2}
                  value={linkMoi}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Link gửi khách"
                  className="mt-2 w-full select-all rounded border border-[var(--bb-border)] p-2 text-xs"
                />
              </div>
            ) : (
              <TinhTrangLink detail={detail} />
            )}

            {/* BB-308 (bản vẽ BB-301 admin duyệt) — "Mở khoá link cũ / Gia
                hạn" và "Tạo link mới" chuyển vào menu ⋯ ở đầu trang (xem
                `MenuThaoTacPhu`); thẻ này giờ CHỈ còn thông tin. Cùng hàm
                `moLaiLink`/`taoLink`, cùng bước xác nhận (window.confirm khi
                link đã thu hồi) — chỉ đổi chỗ đặt nút bấm. */}
          </section>

          {/* BB-290 lượt 2 (#36): "Xuất danh sách" chuyển từ cột trái sang
              đây — lưới 3 cột, nhãn MỘT DÒNG ("Lightroom"/"Excel"/"Văn bản"),
              ghi chú đầy đủ chuyển vào `title`/dòng nhỏ bên dưới thay vì
              chiếm chỗ ngang hàng như trước (từng dài tới 5 dòng ở 390px). */}
          {detail.selectedCount > 0 && (
            <section id="xuat-danh-sach" className="scroll-mt-6 rounded-lg border border-[var(--bb-border)] p-4">
              <h2 className="text-base font-medium">{vi.admin.export.title}</h2>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <a
                  href={`/api/admin/galleries/${galleryId}/export`}
                  download
                  title={vi.admin.export.formatLightroom}
                  className="flex h-10 items-center justify-center rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] px-2 text-center text-xs hover:bg-[var(--bb-surface-2)]"
                >
                  Lightroom
                </a>
                <a
                  href={`/api/admin/galleries/${galleryId}/export?format=csv`}
                  download
                  title={vi.admin.export.formatCsv}
                  className="flex h-10 items-center justify-center rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] px-2 text-center text-xs hover:bg-[var(--bb-surface-2)]"
                >
                  Excel
                </a>
                <a
                  href={`/api/admin/galleries/${galleryId}/export?format=chi-tiet`}
                  download
                  title={vi.admin.export.formatChiTiet}
                  className="flex h-10 items-center justify-center rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] px-2 text-center text-xs hover:bg-[var(--bb-surface-2)]"
                >
                  Văn bản
                </a>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-[var(--bb-fg-muted)]">
                Lightroom: danh sách tên file · Excel: kèm ghi chú · Văn bản: chi tiết cho CSKH
              </p>
            </section>
          )}

          {/* BB-259 — bản vẽ quan-tri-chi-tiet.webp: khối cuối cột phải. */}
          <DongThoiGianHoatDong
            galleryId={galleryId}
            canhBaoLark={
              detail.larkTenTrangThai
                ? `Lark: ${detail.larkTenTrangThai} · đọc lúc ${formatNgayGioVN(detail.larkDocLuc) || "—"}`
                : "Chưa đọc được trạng thái từ Lark"
            }
          />
        </div>
      </div>

      {/* BB-303 (bản vẽ BB-301) — nút chính ghim đáy TRÊN ĐIỆN THOẠI. Chừa
          chỗ bằng đệm dưới (`pb-24`) trên chính component này thì phải đụng
          vào layout cha (`admin-layout-shell.tsx`, đã có `p-4 sm:p-6`) — thay
          vào đó thanh này tự mang nền + viền trên để không đè lên chữ cuối
          trang, và `scroll-mb` không cần vì trang chỉ dài thêm một chút. */}
      {detail.status === "submitted" && (
        <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-1.5 border-t border-[var(--bb-border)] bg-[var(--bb-bg)]/95 p-3 backdrop-blur-sm lg:hidden">
          {detail.outstanding > 0 && (
            <p className="text-center text-xs text-[var(--bb-danger)]">
              Khách còn thiếu <strong>{formatCurrencyVND(detail.outstanding)}</strong>
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirmSubmission()}
            className="w-full rounded-full bg-[var(--bb-fg)] px-4 py-3 text-sm font-medium text-[var(--bb-bg)] disabled:opacity-40"
          >
            Xác nhận và chuyển sang chỉnh ảnh
          </button>
        </div>
      )}
      {/* Đệm dưới cùng bằng chiều cao thanh ghim, để nội dung cuối trang
          (Dòng thời gian hoạt động) không bị thanh che mất trên điện thoại. */}
      {detail.status === "submitted" && <div className="h-24 lg:hidden" aria-hidden="true" />}
    </div>
  );
}

/**
 * Khối nghiệp vụ chính (cột trái, BB-255) — xuất/thành phần hợp đồng/tiền/vòng
 * duyệt/mua thêm/mở lại/xác nhận. Tách khỏi `GalleryDetail` CHỈ để lưới 2 cột ở
 * trên gọn hơn; không đổi props, hành vi hay chữ của bất cứ khối con nào.
 */
function KhoiChinh({
  detail,
  busy,
  locked,
  changeItem,
  addItem,
  recordPayment,
  sendRetouched,
  reopen,
  onDelivered,
  galleryId,
  dangMoLai,
  dongMoLai,
}: {
  detail: Detail;
  busy: boolean;
  locked: boolean;
  changeItem: (method: "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<void>;
  addItem: (productId: string, quantity: number) => Promise<void>;
  recordPayment: (amount: number, method: string, note: string) => Promise<void>;
  sendRetouched: (url: string) => Promise<void>;
  reopen: (reason: string) => Promise<void>;
  /** BB-311 — tải lại dữ liệu sau khi đánh dấu đã giao ảnh thành công. */
  onDelivered: () => Promise<void>;
  galleryId: string;
  /** BB-308 — form này giờ chỉ hiện khi bấm "Mở lại cho khách chọn" trong
   * menu ⋯ ở đầu trang (`MenuThaoTacPhu`), không còn nằm cố định trên trang. */
  dangMoLai: boolean;
  dongMoLai: () => void;
}) {
  // BB-313 mục 2 — "Quyền: vai có quyền sửa bộ ảnh". `canEditItems` do route
  // GET tính từ `staff.permissions.includes("galleries:write")` (cùng quyền
  // route PATCH/POST/DELETE đòi) — màn hình chỉ ẩn nút cho gọn, route API mới
  // là ranh giới an ninh thật (đã có sẵn, xem loadEditableGallery()).
  // `undefined` (API cũ chưa trả field này) coi như CÓ quyền — giữ hành vi cũ
  // để không đột ngột ẩn nút với ai đó chưa kịp tải lại.
  const canSuaDong = detail.canEditItems !== false;

  /**
   * BB-313 mục 2 — "Có xác nhận khi xoá". Trước bản vá, nút "bỏ" gọi thẳng
   * `changeItem("DELETE", …)` không hỏi lại gì — một cú bấm nhầm là mất một
   * dòng hàng (tiền của khách) không cách nào lấy lại ngoài đồng bộ lại từ
   * Lark (mà dòng thêm tay thì Lark không biết tới). Hỏi lại bằng CON SỐ
   * (tên + số lượng dòng đang xoá).
   */
  async function xoaDongHang(itemId: string, ten: string, soLuong: number) {
    if (!window.confirm(`Bỏ dòng "${ten}" ×${soLuong} khỏi hợp đồng? Không hoàn tác được trong app.`)) {
      return;
    }
    await changeItem("DELETE", { itemId });
  }

  return (
    <>
      {/*
        Xuất danh sách ảnh đã chọn (BB-067).

        Chỉ hiện khi khách ĐÃ chọn ít nhất một tấm: danh sách rỗng gửi cho thợ
        chỉnh ảnh còn tệ hơn không gửi gì, vì họ tưởng khách chưa chọn tấm nào
        trong khi thật ra là bấm nhầm nút.

        Hai định dạng, hai việc khác nhau: `.txt` là danh sách tên file để dán
        thẳng vào bộ lọc của Lightroom; `.csv` mở bằng Excel, mang theo ghi chú
        từng ảnh và ghi chú chung của khách.

        Dùng thẻ <a download> chứ không fetch rồi tự dựng Blob: trình duyệt lo
        hộp thoại lưu tệp, và máy chủ đã gửi sẵn `Content-Disposition`.
      */}
      {/* BB-290 lượt 2: khối "Xuất danh sách" chuyển sang CỘT PHẢI (xem
          `GalleryDetail`), cạnh "Link khách" — theo quan-tri-chi-tiet.png.
          Giữ nguyên logic/route, chỉ đổi VỊ TRÍ và NHÃN hiện (ngắn hơn). */}

      {!detail.quotaKnown && (
        <p className="rounded-md border border-[var(--bb-danger)] p-3 text-sm">
          Bộ ảnh này <strong>chưa rõ hạn mức</strong>, nên khách <strong>không chọn ảnh
          được</strong>. Thêm dòng <em>Edit file</em> bên dưới với số ảnh trong gói, hoặc
          bổ sung bên Lark rồi đồng bộ lại.
        </p>
      )}

      {/*
        BB-296 mục #6 — báo cáo chấm độc lập lần 3: "Ảnh khách đã chọn" +
        "Mua thêm" theo `quan-tri-chi-tiet.png` (khối `.luoi` lưới 6 cột +
        chip ghi chú). Chỉ hiện khi khách đã chọn ít nhất một tấm — bộ ảnh
        chưa ai chọn gì thì không có gì để vẽ.
      */}
      {(detail.selectedPhotos?.length ?? 0) > 0 && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-medium">Ảnh khách đã chọn</h2>
            <span className="text-xs text-[var(--bb-fg-muted)]">
              {detail.selectedPhotos!.length} tấm
              {detail.selectedPhotos!.some((p) => p.note) &&
                ` · ${detail.selectedPhotos!.filter((p) => p.note).length} ghi chú`}
            </span>
          </div>
          <ul className="mt-3 grid grid-cols-4 gap-2.5 sm:grid-cols-6">
            {detail.selectedPhotos!.map((p, i) => (
              <li
                key={p.photoId}
                className="overflow-hidden rounded-md border border-[var(--bb-border)]"
                title={p.note ?? p.fileName}
              >
                {/* BB-303 (quan-tri-chi-tiet.png) — "lưới đánh số, huy hiệu
                    ghi chú": số thứ tự (thứ tự khách chọn, `order_index` từ
                    route API) góc trên-trái, huy hiệu "✎" góc trên-phải CHỈ
                    khi có ghi chú — trước đây phải đọc dòng chữ bên dưới mới
                    biết tấm nào có ghi chú. */}
                <div className="relative aspect-[4/5] bg-[var(--bb-surface-2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/img/${p.photoId}?w=200`}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute left-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                    {i + 1}
                  </span>
                  {p.note && (
                    <span
                      role="img"
                      aria-label="Có ghi chú"
                      title="Có ghi chú"
                      className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--bb-danger)] text-[9px] text-white"
                    >
                      ✎
                    </span>
                  )}
                </div>
                {p.note && (
                  <p className="truncate px-1.5 py-1 text-[10px] text-[var(--bb-fg-muted)]">
                    ✎ {p.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(detail.addonPurchases?.length ?? 0) > 0 && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-base font-medium">Mua thêm</h2>
            <span className="text-xs text-[var(--bb-fg-muted)]">
              {formatCurrencyVND(detail.addonsAmount)}
            </span>
          </div>
          <ul className="mt-2 flex flex-col gap-1.5">
            {detail.addonPurchases!.map((a) => (
              <li
                key={a.id}
                className="flex items-center gap-3 rounded-md border border-[var(--bb-border)] p-2.5"
              >
                {a.photoId ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/img/${a.photoId}?w=200`}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded bg-[var(--bb-surface-2)] text-[10px] text-[var(--bb-fg-muted)]">
                    —
                  </span>
                )}
                <span className="min-w-0 flex-1 text-sm">
                  {tenThanThienMuaThem(a.kind, a.material, a.size)}
                  {a.quantity > 1 && (
                    <span className="text-[var(--bb-fg-muted)]"> ×{a.quantity}</span>
                  )}
                </span>
                <span className="shrink-0 text-sm font-medium">
                  {formatCurrencyVND(a.totalPrice)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(detail.dueAmount !== 0 || detail.paidAmount !== 0) && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <h2 className="text-base font-medium">Tiền phát sinh</h2>
          <p className="mt-1 text-sm">
            Phải thu <strong>{formatCurrencyVND(detail.dueAmount)}</strong> · đã thu{" "}
            <strong>{formatCurrencyVND(detail.paidAmount)}</strong> ·{" "}
            {detail.outstanding > 0 ? (
              <span className="text-[var(--bb-danger)]">
                còn thiếu <strong>{formatCurrencyVND(detail.outstanding)}</strong>
              </span>
            ) : detail.outstanding < 0 ? (
              <span className="text-[var(--bb-danger)]">
                khách trả DƯ <strong>{formatCurrencyVND(-detail.outstanding)}</strong>
              </span>
            ) : (
              <span>đã trả đủ</span>
            )}
          </p>
          <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
            Tiền thu ngoài app. Đây chỉ là chỗ đánh dấu đã thu. Ghi sai thì ghi thêm
            một dòng trừ kèm lý do — dòng cũ không sửa được.
          </p>
          <PaymentForm
            disabled={busy}
            suggested={detail.outstanding > 0 ? detail.outstanding : 0}
            onSubmit={(a, m, n) => void recordPayment(a, m, n)}
          />
        </section>
      )}

      <section>
        <h2 className="text-base font-medium">Thành phần hợp đồng</h2>
        {/*
          BB-313 mục 2 (ảnh chụp app thật Đợt 9) — "Thành phần hợp đồng sửa
          được": trước bản vá chỉ dòng CON có `kind === "edited_photo"` có ô
          sửa số lượng; dòng CHA (ví dụ "Edit file x5 250.000đ" mua thêm đứng
          một mình, không nằm trong gói nào) chỉ xem được, đúng ảnh chụp thật
          admin gửi kèm. Nay MỌI dòng (cha lẫn con) đều sửa được số lượng và
          xoá được — chỉ khi có quyền `galleries:write` (`canSuaDong`) và bộ
          ảnh CHƯA khoá.
        */}
        {!canSuaDong && !locked && (
          <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">
            Vai của bạn không có quyền sửa dòng hàng — chỉ xem được.
          </p>
        )}
        {detail.items.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">
            Chưa có dòng hàng nào. Nhập mã hợp đồng rồi chạy đồng bộ, hoặc thêm tay.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {detail.items.map((item) => (
              <li key={item.id} className="rounded-md border border-[var(--bb-border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-medium">
                    <span className="min-w-0 truncate">{item.name}</span>
                    {canSuaDong && !locked ? (
                      <QuantityEditor
                        value={item.quantity}
                        disabled={busy}
                        onSubmit={(q) => void changeItem("PATCH", { itemId: item.id, quantity: q })}
                      />
                    ) : (
                      <span className="text-[var(--bb-fg-muted)]">×{item.quantity}</span>
                    )}
                    {/* BB-202 — "Bìa album: <tên tệp>" ngay cạnh dòng hàng, để
                        CSKH không phải mở riêng một chỗ khác mới biết. */}
                    {(() => {
                      const bia = (detail.albumCovers ?? []).find((a) => a.galleryItemId === item.id);
                      if (!bia) return null;
                      return (
                        <span className="text-xs text-[var(--bb-fg-muted)]">
                          — Bìa album: {bia.fileName ?? "(chưa chọn)"}
                        </span>
                      );
                    })()}
                  </span>
                  <span className="flex items-center gap-3">
                    {item.totalPrice !== null && (
                      <span className="text-sm">{formatCurrencyVND(item.totalPrice)}</span>
                    )}
                    {!locked && canSuaDong && (
                      <NutXoaDongHang
                        disabled={busy}
                        onClick={() => void xoaDongHang(item.id, item.name, item.quantity)}
                      />
                    )}
                  </span>
                </div>

                {item.components.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1 pl-4">
                    {item.components.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 text-sm">
                        <span>
                          {c.name} <span className="text-[var(--bb-fg-muted)]">×{c.quantity}</span>
                          {c.kind === "edited_photo" && (
                            <span className="ml-2 text-xs text-[var(--bb-fg-muted)]">
                              (đây là hạn mức ảnh)
                            </span>
                          )}
                          {/* BB-202 — album có thể nằm ở tầng thành phần (một
                              album trong gói chụp), không chỉ ở tầng dòng
                              hàng — cùng lookup như ở trên. */}
                          {(() => {
                            const bia = (detail.albumCovers ?? []).find((a) => a.galleryItemId === c.id);
                            if (!bia) return null;
                            return (
                              <span className="ml-2 text-xs text-[var(--bb-fg-muted)]">
                                — Bìa album: {bia.fileName ?? "(chưa chọn)"}
                              </span>
                            );
                          })()}
                        </span>
                        {!locked && canSuaDong && (
                          <span className="flex shrink-0 items-center gap-2">
                            <QuantityEditor
                              value={c.quantity}
                              disabled={busy}
                              onSubmit={(q) =>
                                void changeItem("PATCH", { itemId: c.id, quantity: q })
                              }
                            />
                            <NutXoaDongHang
                              disabled={busy}
                              onClick={() => void xoaDongHang(c.id, c.name, c.quantity)}
                            />
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {!locked && canSuaDong && detail.catalog.length > 0 && (
          <AddItemForm
            catalog={detail.catalog}
            disabled={busy}
            // Bộ ảnh chưa rõ hạn mức thì thứ CSKH cần thêm gần như luôn là
            // dòng ảnh chỉnh sửa — chọn sẵn giúp.
            preferKind={detail.quotaKnown ? undefined : "edited_photo"}
            onSubmit={(id, q) => void addItem(id, q)}
          />
        )}
      </section>

      {(detail.status === "in_retouch" ||
        detail.status === "awaiting_approval" ||
        detail.revisions.length > 0) && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <h2 className="text-base font-medium">Vòng duyệt ảnh đã chỉnh</h2>

          {/* Vòng đang mở nằm TRÊN CÙNG, không nằm dưới lịch sử. Người chỉnh ảnh
              mở màn này để biết phải làm gì, không phải để đọc lại lịch sử. */}
          {detail.revisions
            .filter((r) => r.resolved_at === null)
            .map((r) => (
              <p
                key={r.round}
                className="mt-3 rounded-md border border-[var(--bb-danger)] p-3 text-sm"
              >
                <strong>Khách yêu cầu sửa (vòng {r.round}):</strong> {r.note}
              </p>
            ))}

          {detail.status === "in_retouch" && (
            <RetouchSender
              defaultUrl={detail.finalDriveUrl ?? ""}
              disabled={busy}
              onSubmit={(u) => void sendRetouched(u)}
            />
          )}

          {detail.status === "awaiting_approval" && (
            <p className="mt-3 text-sm text-[var(--bb-fg-muted)]">
              Đã gửi khách, đang chờ khách duyệt. Khách bấm duyệt thì bộ ảnh chuyển sang
              in; khách yêu cầu sửa thì quay lại đây kèm lời nhắn.
            </p>
          )}

          {detail.revisions.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--bb-fg-muted)]">
                Lịch sử yêu cầu sửa ({detail.revisions.length} vòng)
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {detail.revisions.map((r) => (
                  <li key={r.round} className="text-sm">
                    <span className="text-[var(--bb-fg-muted)]">
                      Vòng {r.round} · {formatNgayVN(r.created_at)}
                      {r.resolved_at ? " · đã xử lý" : " · đang chờ"}
                    </span>
                    <br />
                    {r.note}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* BB-311 — nút "Đã giao ảnh": trước bản vá này không có đường thao tác
          thật nào đặt status = 'delivered' sau khi khách đã duyệt. Component
          tự ẩn khi status khác 'approved' hoặc thiếu quyền deliveries:write. */}
      {detail.status === "approved" && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <h2 className="text-base font-medium">Giao ảnh</h2>
          <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
            Khách đã duyệt, ảnh đang đi in. Giao tận tay xong thì bấm nút dưới để ghi nhận.
          </p>
          <div className="mt-3">
            <DanhDauDaGiao
              galleryId={galleryId}
              status={detail.status}
              canMarkDelivered={detail.canMarkDelivered}
              disabled={busy}
              onDelivered={onDelivered}
            />
          </div>
        </section>
      )}

      <YeuCauMuaThemBlock galleryId={galleryId} />

      {/*
        BB-200 (3/3) — form chỉ hiện khi nhân viên CÓ quyền `galleries:reopen`.
        Trước bản vá này, thợ ảnh (không có quyền) vẫn thấy form đầy đủ, bấm
        vào mới bị route API chặn — bắt người ta làm một việc rồi mới báo
        không được làm. Route vẫn là ranh giới an ninh thật (xem đầu tệp);
        đây chỉ là không bày ra thứ chắc chắn sẽ bị từ chối.
      */}
      {(detail.status === "expired" || detail.status === "submitted") &&
        detail.canReopen &&
        dangMoLai && (
          <section className="rounded-lg border border-[var(--bb-border)] p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-medium">Mở lại cho khách chọn tiếp</h2>
              <button
                type="button"
                onClick={dongMoLai}
                className="text-xs text-[var(--bb-fg-muted)] underline"
              >
                Đóng
              </button>
            </div>
            <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
              {detail.status === "expired"
                ? "Bộ ảnh đã quá hạn nên khách không thao tác được nữa."
                : "Khách đã chốt nhưng chưa xác nhận. Mở lại nếu khách muốn đổi ý."}
            </p>
            <ReopenForm disabled={busy} onSubmit={(r) => void reopen(r)} />
          </section>
        )}

      {/* BB-255: "Thư mục ảnh gốc" và "Link gửi khách" chuyển sang cột phải
          của `GalleryDetail` (thẻ trắng cạnh bìa bộ ảnh) theo bản vẽ
          quan-tri-chi-tiet.webp — xem hàm `GalleryDetail` phía trên.
          BB-290 lượt 2 (#36): nút "Xác nhận và chuyển sang chỉnh ảnh" +
          cảnh báo còn thiếu tiền chuyển lên ĐẦU TRANG (header của
          `GalleryDetail`) — đây là nút chính DUY NHẤT của cả màn hình. */}
    </>
  );
}

/**
 * BB-308 — nút "…" gom thao tác phụ (bản vẽ BB-301, admin duyệt 28/09/2026):
 * Đồng bộ lại, Đổi thư mục, Làm nóng ảnh, Mở lại cho khách chọn, Tạo link
 * mới, Gia hạn. Mỗi mục chỉ GỌI LẠI hàm đã có sẵn trong `GalleryDetail` —
 * không có logic nghiệp vụ mới, hành vi/API giữ nguyên, chỉ đổi CHỖ ĐẶT nút.
 * "Mở lại cho khách chọn" và "Gia hạn" là thao tác quan trọng/phá huỷ nên
 * vẫn qua đúng đường cũ: mở form yêu cầu lý do (ReopenForm) và
 * `window.confirm` khi link đã bị thu hồi (trong `moLaiLink`) — không mất
 * bước xác nhận nào khi chuyển vào đây.
 */
function MenuThaoTacPhu({
  detail,
  busy,
  dangLamNong,
  onDongBoLai,
  onMoDoiThuMuc,
  onLamNongAnh,
  onMoMoLai,
  onTaoLink,
  onGiaHan,
}: {
  detail: Detail;
  busy: boolean;
  dangLamNong: boolean;
  onDongBoLai: () => void;
  onMoDoiThuMuc: () => void;
  onLamNongAnh: () => void;
  onMoMoLai: () => void;
  onTaoLink: () => void;
  onGiaHan: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const hopRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function ngoaiHop(e: MouseEvent) {
      if (hopRef.current && !hopRef.current.contains(e.target as Node)) setOpen(false);
    }
    function phimEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", ngoaiHop);
    document.addEventListener("keydown", phimEsc);
    return () => {
      document.removeEventListener("mousedown", ngoaiHop);
      document.removeEventListener("keydown", phimEsc);
    };
  }, [open]);

  const coTheMoLai =
    (detail.status === "expired" || detail.status === "submitted") && detail.canReopen === true;
  const coTheGiaHan = !!detail.shareLink && detail.shareLink.status !== "active";

  return (
    <div ref={hopRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Thao tác khác"
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--bb-border)] text-[var(--bb-fg-muted)] hover:bg-[var(--bb-surface-2)] hover:text-[var(--bb-fg)]"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Thao tác khác"
          className="absolute right-0 z-20 mt-2 w-64 rounded-lg border border-[var(--bb-border)] bg-[var(--bb-surface)] p-1.5 shadow-lg"
        >
          <MenuMuc
            disabled={busy || !detail.driveFolderUrl}
            onClick={() => {
              setOpen(false);
              onDongBoLai();
            }}
          >
            Đồng bộ lại
          </MenuMuc>
          <MenuMuc
            disabled={busy}
            onClick={() => {
              setOpen(false);
              onMoDoiThuMuc();
            }}
          >
            Đổi thư mục
          </MenuMuc>
          <MenuMuc
            disabled={dangLamNong}
            onClick={() => {
              setOpen(false);
              onLamNongAnh();
            }}
          >
            {dangLamNong ? "Đang chuẩn bị…" : "Chuẩn bị ảnh bìa"}
          </MenuMuc>
          {coTheMoLai && (
            <MenuMuc
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onMoMoLai();
              }}
            >
              Mở lại cho khách chọn
            </MenuMuc>
          )}
          <MenuMuc
            disabled={busy || detail.photoCount === 0}
            onClick={() => {
              setOpen(false);
              onTaoLink();
            }}
          >
            {detail.shareLink ? "Tạo link mới (ĐỔI địa chỉ)" : "Tạo link gửi khách"}
          </MenuMuc>
          {coTheGiaHan && (
            <MenuMuc
              disabled={busy}
              onClick={() => {
                setOpen(false);
                onGiaHan();
              }}
            >
              Gia hạn (giữ nguyên địa chỉ)
            </MenuMuc>
          )}
        </div>
      )}
    </div>
  );
}

function MenuMuc({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className="block w-full rounded-md px-3 py-2 text-left text-sm text-[var(--bb-fg)] hover:bg-[var(--bb-surface-2)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Ô sửa số lượng: nhập rồi bấm lưu, không tự gửi theo từng ký tự. */
function QuantityEditor({
  value,
  disabled,
  onSubmit,
}: {
  value: number;
  disabled?: boolean;
  onSubmit: (quantity: number) => void;
}) {
  const [draft, setDraft] = React.useState(String(value));
  React.useEffect(() => setDraft(String(value)), [value]);

  const parsed = Number(draft);
  const valid = Number.isInteger(parsed) && parsed >= 1;
  // BB-313 (chấm lại 28/09/2026, mục 2) — nút "lưu" gạch chân chữ thường
  // trông như một liên kết bỏ quên, không như một hành động. Đổi sang nút
  // viền mảnh THẬT (cùng hệ với các nút phụ khác của trang, ví dụ nút "Đã
  // chép" ở `DongLinkApp`), và CHỈ HIỆN khi số đã thực sự đổi — trước đây nút
  // luôn hiện nhưng bị `disabled` khi chưa đổi, khiến người dùng phải tự đoán
  // vì sao bấm không ăn.
  const daDoi = valid && parsed !== value;

  return (
    <span className="flex items-center gap-2">
      {/* BB-294 (#19) — ô số hệ thiết kế, không phải mặc định trình duyệt. */}
      <Input
        type="number"
        min={1}
        name="quantity"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        className="h-9 w-16 min-h-0 px-2 py-1 text-sm"
        aria-label="Số ảnh trong gói"
      />
      {daDoi && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSubmit(parsed)}
          className="h-7 shrink-0 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] px-2.5 text-xs font-medium text-[var(--bb-fg)] transition hover:bg-[var(--bb-surface-2)] disabled:opacity-40"
        >
          lưu
        </button>
      )}
    </span>
  );
}

/**
 * Ô nhập link thư mục ảnh đã chỉnh.
 *
 * Nút gửi TẮT khi ô trống. Route API cũng chặn, nhưng để bấm được rồi mới báo
 * lỗi thì nhân viên đã kịp nghĩ là mình gửi xong.
 */
function RetouchSender({
  defaultUrl,
  disabled,
  onSubmit,
}: {
  defaultUrl: string;
  disabled?: boolean;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = React.useState(defaultUrl);
  // Chỉ là để bật/tắt nút. Route API mới kiểm thật — màn hình không phải
  // ranh giới an ninh.
  const trimmed = url.trim();
  const valid = trimmed.startsWith("http") && trimmed.length > 12 && !trimmed.includes(" ");

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="url"
        name="finalDriveUrl"
        value={url}
        disabled={disabled}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Link thư mục ảnh đã chỉnh"
        aria-label="Link thư mục ảnh đã chỉnh"
        className="min-w-64 flex-1 rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
      />
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => onSubmit(trimmed)}
        className="rounded-md bg-[var(--bb-fg)] px-3 py-2 text-sm text-[var(--bb-bg)] disabled:opacity-40"
      >
        Gửi file đã chỉnh cho khách
      </button>
    </div>
  );
}

/**
 * Ô ghi lý do mở lại.
 *
 * Không có nút "mở lại" trần. Mở lại là đảo ngược một quyết định của khách, và
 * sáu tháng sau câu hỏi "sao bộ này mở lại" chỉ trả lời được nếu lúc đó có
 * người viết vào.
 */
function ReopenForm({
  disabled,
  onSubmit,
}: {
  disabled?: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const trimmed = reason.trim();

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <input
        type="text"
        name="reason"
        maxLength={500}
        value={reason}
        disabled={disabled}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Lý do mở lại (khách xin thêm thời gian…)"
        aria-label="Lý do mở lại"
        className="min-w-64 flex-1 rounded border border-[var(--bb-border)] px-2 py-2 text-sm"
      />
      <button
        type="button"
        disabled={disabled || trimmed.length === 0}
        onClick={() => onSubmit(trimmed)}
        className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Mở lại cho khách chọn
      </button>
    </div>
  );
}

/**
 * Ô ghi nhận đã thu tiền.
 *
 * Số tiền điền sẵn bằng số còn thiếu — trường hợp thường gặp nhất là khách trả
 * đúng số còn thiếu, và bắt CSKH gõ lại con số đang hiện ngay phía trên là cách
 * chắc chắn để thỉnh thoảng gõ nhầm.
 */
function PaymentForm({
  disabled,
  suggested,
  onSubmit,
}: {
  disabled?: boolean;
  suggested: number;
  onSubmit: (amount: number, method: string, note: string) => void;
}) {
  const [amount, setAmount] = React.useState(suggested > 0 ? String(suggested) : "");
  const [method, setMethod] = React.useState("tien_mat");
  const [note, setNote] = React.useState("");

  React.useEffect(() => {
    setAmount(suggested > 0 ? String(suggested) : "");
  }, [suggested]);

  const parsed = Number(amount);
  const amountOk = Number.isInteger(parsed) && parsed !== 0;
  // Dòng trừ tiền bắt buộc có lý do — route cũng chặn.
  const valid = amountOk && (parsed > 0 || note.trim().length > 0);

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2">
      {/* BB-294 (#19) — ô số, select, ô nhập hệ thiết kế, không phải mặc định trình duyệt. */}
      <label className="flex flex-col gap-1 text-xs">
        Số tiền
        <Input
          type="number"
          name="amount"
          value={amount}
          disabled={disabled}
          onChange={(e) => setAmount(e.target.value)}
          className="h-9 w-36 min-h-0 px-2 py-2 text-sm"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Hình thức
        <Select
          name="method"
          value={method}
          disabled={disabled}
          onChange={(e) => setMethod(e.target.value)}
          className="h-9 min-h-0 px-2 py-2 text-sm"
        >
          {PAYMENT_METHODS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs">
        Ghi chú
        <Input
          type="text"
          name="note"
          maxLength={500}
          value={note}
          disabled={disabled}
          onChange={(e) => setNote(e.target.value)}
          placeholder={parsed < 0 ? "Bắt buộc: lý do trừ tiền" : "Mã giao dịch, ghi chú…"}
          className="h-9 min-h-0 px-2 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => onSubmit(parsed, method, note.trim())}
        className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Ghi nhận đã thu
      </button>
    </div>
  );
}

/** Tên tiếng Việt của loại sản phẩm. */
const KIND_LABEL: Record<string, string> = {
  shoot_package: "Gói chụp",
  edited_photo: "Ảnh chỉnh sửa",
  print: "Hàng in",
  addon: "Mua thêm",
  service: "Dịch vụ",
};

/**
 * Thêm một dòng hàng tay.
 *
 * Màn hình từ trước vẫn bảo CSKH "thêm dòng Edit file bên dưới" và "thêm tay"
 * mà KHÔNG có nút nào để làm — đường POST có sẵn, giao diện thiếu. Chín bộ ảnh
 * đang bị chặn vì chưa rõ hạn mức và CSKH không có cách gỡ. Bảo người ta làm
 * một việc rồi không đưa chỗ để làm là cách chắc chắn để họ đi sửa thẳng cơ sở
 * dữ liệu.
 */
function AddItemForm({
  catalog,
  disabled,
  preferKind,
  onSubmit,
}: {
  catalog: CatalogProduct[];
  disabled?: boolean;
  preferKind?: string;
  onSubmit: (productId: string, quantity: number) => void;
}) {
  const macDinh = React.useMemo(
    () => catalog.find((p) => p.kind === preferKind)?.id ?? catalog[0]?.id ?? "",
    [catalog, preferKind],
  );
  const [productId, setProductId] = React.useState(macDinh);
  const [qty, setQty] = React.useState("1");

  React.useEffect(() => setProductId(macDinh), [macDinh]);

  const parsed = Number(qty);
  const valid = productId !== "" && Number.isInteger(parsed) && parsed >= 1;

  const theoLoai = React.useMemo(() => {
    const nhom = new Map<string, CatalogProduct[]>();
    for (const p of catalog) {
      const list = nhom.get(p.kind) ?? [];
      list.push(p);
      nhom.set(p.kind, list);
    }
    return [...nhom.entries()];
  }, [catalog]);

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--bb-border)] pt-3">
      {/* BB-294 (#19) — select, ô số hệ thiết kế, không phải mặc định trình duyệt. */}
      <label className="flex min-w-56 flex-1 flex-col gap-1 text-xs">
        Thêm dòng hàng
        <Select
          name="productId"
          value={productId}
          disabled={disabled}
          onChange={(e) => setProductId(e.target.value)}
          className="h-9 min-h-0 px-2 py-2 text-sm"
        >
          {theoLoai.map(([kind, items]) => (
            <optgroup key={kind} label={KIND_LABEL[kind] ?? kind}>
              {items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-xs">
        Số lượng
        <Input
          type="number"
          min={1}
          name="quantity"
          value={qty}
          disabled={disabled}
          onChange={(e) => setQty(e.target.value)}
          className="h-9 w-20 min-h-0 px-2 py-2 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => onSubmit(productId, parsed)}
        className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
      >
        Thêm
      </button>
    </div>
  );
}

/**
 * Một thẻ số liệu — BB-290 lượt 2, theo `.the`/`.so` của quan-tri-chi-tiet.html:
 * thẻ viền riêng, số serif 28px thường (không đậm), nhãn nhỏ phía trên, và
 * một dòng "phụ" NHỎ, SANS, CÙNG DÒNG CƠ SỞ ngay cạnh số (không phải chỉ số
 * trên) — dùng cho đơn vị "đ", "/ n tấm", hoặc giờ chốt.
 */
function TheSoLieu({
  label,
  value,
  phu,
  canhBao,
  chuNho,
}: {
  label: string;
  value: string;
  phu?: string;
  /** BB-318: cỡ số nhỏ hơn cho giá trị là NGÀY (dd/mm/yyyy dài hơn số đếm) — để không tràn thẻ hẹp trên điện thoại. */
  chuNho?: boolean;
  /** Chấm cảnh báo nhẹ khi số liệu cần chú ý (vd. đã vượt hạn mức). */
  canhBao?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] px-4 py-3.5">
      <div className="text-xs text-[var(--bb-fg-muted)]">{label}</div>
      {/* BB-290 lượt 2 (#36): "₫" cùng dòng cơ sở + số kiểu lining-nums —
          Playfair Display mặc định vẽ số kiểu oldstyle (lệch chân), khiến số
          tiền trông "trồi lên trụt xuống" cạnh nhau. `font-variant-numeric`
          ép về lining + tabular, đều chân, đều bề ngang từng chữ số.
          BB-294 (#18): `flex-wrap` — thẻ ở `grid-cols-2` trên điện thoại rất
          hẹp; giá trị dài ("27/09/2026 23:00" trước đây) từng bị cắt khỏi mép
          thẻ. Cho phép `phu` (giờ, đơn vị) rớt xuống dòng dưới thay vì tràn
          ra ngoài — `items-baseline` vẫn giữ hai dòng thẳng theo baseline khi
          đủ chỗ nằm chung một dòng. */}
      {/* BB-303 (admin duyệt 28/09/2026): Be Vietnam Pro tabular-nums
          (`.bb-so`) thay Playfair Display — MỘT kiểu số duy nhất cho mọi thẻ
          thống kê quản trị (BB-301 XONG.md mục 2), không còn số oldstyle lệch
          chân của Playfair. */}
      <div className={`bb-so mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0 leading-tight ${chuNho ? "text-[20px] sm:text-[22px]" : "text-[26px] sm:text-[28px]"}`}>
        {canhBao && (
          <span
            role="img"
            aria-label="Cần chú ý"
            title="Cần chú ý"
            className="mb-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--bb-danger)]"
          />
        )}
        <span>{value}</span>
        {phu && (
          <span className="font-sans text-[13px] font-normal text-[var(--bb-fg-muted)]">{phu}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Tình trạng link gửi khách (BB-188).
 *
 * Trước đây khối này chỉ có một dòng chữ *"Bộ ảnh đã có link đang dùng"* —
 * CSKH không biết link còn sống hay đã chết, còn bao lâu, hay ba mẹ đã mở chưa.
 * Khách gọi lên hỏi "link không vào được" thì không ai trả lời được tại sao.
 *
 * KHÔNG hiện mã link ở đây. Sau khi bỏ PIN, chuỗi đó là thứ duy nhất che ảnh
 * của một nhà; sáu ký tự đầu đủ để đối chiếu và không mở được gì.
 */
/**
 * BB-201 — một dòng link gửi khách + nút sao chép, cùng dáng dòng link Drive.
 * Sao chép qua Clipboard API; trình duyệt chặn (http, quyền) thì chọn sẵn chữ
 * để CSKH tự bấm Ctrl+C — không bao giờ để nút bấm mà không có gì xảy ra.
 */
function DongLinkApp({ diaChi }: { diaChi: string }) {
  const [daChep, setDaChep] = React.useState(false);
  const oRef = React.useRef<HTMLInputElement>(null);
  async function chep() {
    try {
      await navigator.clipboard.writeText(diaChi);
      setDaChep(true);
      window.setTimeout(() => setDaChep(false), 2000);
    } catch {
      oRef.current?.select();
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        ref={oRef}
        readOnly
        value={diaChi}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Link gửi khách"
        className="min-w-0 flex-1 rounded border border-[var(--bb-border)] px-2 py-1.5 text-xs"
      />
      <button
        type="button"
        onClick={() => void chep()}
        className="rounded-md border border-[var(--bb-border)] px-3 py-1.5 text-xs"
      >
        {daChep ? "Đã chép" : "Chép link"}
      </button>
      <a
        href={diaChi}
        target="_blank"
        rel="noreferrer"
        className="text-xs text-[var(--bb-primary)] underline"
      >
        Mở thử
      </a>
    </div>
  );
}

function TinhTrangLink({ detail }: { detail: Detail }) {
  const link = detail.shareLink;

  if (!link) {
    return (
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
        {detail.photoCount === 0
          ? "Chưa có ảnh nào. Đồng bộ ảnh từ Drive xong rồi hãy tạo link."
          : "Chưa có link nào cho bộ ảnh này."}
      </p>
    );
  }

  const ngay = (v: string | null) => (v ? formatNgayVN(v) || "—" : "—");

  // Hết hạn là một tình trạng THẬT, nhưng cột `status` không tự đổi khi đồng hồ
  // đi qua `expires_at` — không có ai chạy qua bảng để đổi nó. Tính ở đây, nếu
  // không thì màn hình báo "đang dùng" trong khi khách đang nhìn trang báo hết hạn.
  const daHetHan =
    link.status === "active" && link.expiresAt !== null && new Date(link.expiresAt) < new Date();

  const nhan = link.revokedAt
    ? { chu: "Đã thu hồi", variant: "danger" as const }
    : daHetHan || link.status === "expired"
      ? { chu: "Đã hết hạn", variant: "danger" as const }
      : link.status === "active"
        ? { chu: "Đang dùng", variant: "success" as const }
        : { chu: link.status, variant: "outline" as const };

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p>
        <Badge variant={nhan.variant} className="mr-2">
          {nhan.chu}
        </Badge>
        <span className="text-[var(--bb-fg-muted)]">
          mã <span className="tabular-nums">{link.tokenPrefix ?? "—"}…</span>
        </span>
      </p>
      {/* BB-201 — link hiện lại được như link Drive (chủ studio 25/09/2026). */}
      {link.diaChi ? <DongLinkApp diaChi={link.diaChi} /> : null}
      <p className="text-[var(--bb-fg-muted)]">
        Cấp ngày {ngay(link.createdAt)} · hạn {ngay(link.expiresAt)} · khách đã mở {link.viewCount} lần
      </p>
      {(daHetHan || link.status !== "active") && (
        <p className="rounded-md border border-[var(--bb-danger)] p-3">
          Ba mẹ mở link này sẽ thấy báo hết hạn.{" "}
          <strong>Mở khoá link cũ</strong> giữ nguyên địa chỉ — biểu tượng ba mẹ đã lưu ngoài
          màn hình điện thoại vẫn dùng được. <strong>Tạo link mới</strong> đổi địa chỉ, và
          biểu tượng đó sẽ chết.
        </p>
      )}
    </div>
  );
}

// BB-245/BB-249 — khối "Yêu cầu mua thêm" tách sang ./yeu-cau-mua-them.tsx
// (đổi trạng thái thêm ở BB-249). Xem import ở đầu tệp.

