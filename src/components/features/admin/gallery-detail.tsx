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
import { getStatusBadgeConfig } from "./gallery-list";
import { PAGE_TITLE_CLASS } from "./page-header";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrencyVND } from "@/components/ui/contract-breakdown";
import { isGalleryLocked } from "@/lib/gallery-status";
import { PAYMENT_METHODS } from "@/lib/payment-methods";
import { vi } from "@/i18n/vi";
import { canhBaoUi } from "@/lib/lark/mau-canh-bao-ui";
import type { MauCanhBao } from "@/lib/lark/trang-thai-hau-ky";
/**
 * "27/09" — ngày/tháng KHÔNG kèm năm, dùng riêng cho thẻ "Chốt lúc" (hàng số
 * liệu đầu trang chi tiết bộ ảnh) để khớp bản vẽ quan-tri-chi-tiet.html và
 * không tràn thẻ hẹp trên điện thoại (BB-294 #18). `formatNgayVN` dùng chung
 * toàn app in đủ năm — không đổi hàm đó vì nơi khác vẫn cần đủ năm.
 */
function formatNgayNgan(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const ngay = String(d.getDate()).padStart(2, "0");
  const thang = String(d.getMonth() + 1).padStart(2, "0");
  return `${ngay}/${thang}`;
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
  babyName: string | null;
  branchName: string | null;
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
  /** BB-202 — bìa của mỗi album TRONG GÓI, `fileName: null` = chưa chọn. */
  albumCovers?: Array<{ galleryItemId: string; name: string; fileName: string | null }>;
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
   * BB-132: link vừa tạo đã được ghi thẳng sang cột "Link app" bên Lark chưa.
   *
   * null = chưa tạo link nào lần này. Phân biệt với false ("đã thử, hỏng") là
   * cần thiết: hai trạng thái đó dẫn tới hai việc khác nhau của CSKH.
   */
  const [daGhiLark, setDaGhiLark] = React.useState<boolean | null>(null);
  const [lyDoKhongGhiLark, setLyDoKhongGhiLark] = React.useState<string | null>(null);
  /** BB-286 — nút "Làm nóng ảnh": tiến độ đọc được trong lúc đang chạy. */
  const [dangLamNong, setDangLamNong] = React.useState(false);
  const [tienDoLamNong, setTienDoLamNong] = React.useState<{ daXuLy: number; tong: number } | null>(null);
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
   * BB-286 — "Làm nóng ảnh": kéo trước và ghi vào bộ đệm ảnh cỡ 800 cho cả bộ,
   * để lần khách mở link đầu tiên không phải đợi từng tấm kéo từ Google.
   *
   * Tạo link (`taoLink` ở trên) đã tự làm nóng MỘT LÔ đầu chạy nền (đủ lo
   * trước màn hình đầu tiên khách sẽ thấy), nhưng KHÔNG nong hết cả bộ — giả
   * định hạ tầng là gói Hobby, một lần gọi hàm không đủ thời gian kéo hết
   * 1.235 ảnh. Nút này là cách nong HẾT cả bộ: trình duyệt tự lặp lại route,
   * mỗi lượt một lô nhỏ, không bị giới hạn bởi thời lượng của MỘT lần gọi
   * hàm phía máy chủ.
   *
   * Gọi lặp lại route theo con trỏ `sort_index` (đọc lại API) tới khi xong
   * hoặc bị chặn vì quota — cùng kiểu con trỏ với `/api/admin/galleries/[id]
   * /photos`. `dangLamNong` khoá nút trong lúc chạy, không dùng `busy` chung
   * vì thao tác này có thể chạy lâu (vài chục lượt gọi với bộ ảnh lớn) và
   * không nên khoá luôn các nút khác của màn hình.
   */
  async function lamNongAnh() {
    setDangLamNong(true);
    setThongBaoLamNong(null);
    setTienDoLamNong({ daXuLy: 0, tong: detail?.photoCount ?? 0 });
    try {
      let conTro = 0;
      let daXuLy = 0;
      // Mỗi lượt gọi chỉ xử lý MỘT LÔ nhỏ (40 ảnh, xem KICH_THUOC_LO_LAM_NONG
      // ở lam-nong-cache.ts) vì gói Hobby giới hạn thời gian một lần gọi hàm.
      // Vòng lặp này ở TRÌNH DUYỆT, không phải máy chủ — mỗi vòng là một yêu
      // cầu HTTP riêng, nên không đụng giới hạn đó. Số 200 chỉ để chặn vòng
      // lặp vô hạn nếu logic con trỏ phía máy chủ có lỗi lạ.
      for (let luot = 0; luot < 200; luot++) {
        const res = await fetch(
          `/api/admin/galleries/${galleryId}/lam-nong-anh?sauSortIndex=${conTro}`,
          { method: "POST" },
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setThongBaoLamNong(json?.error?.message ?? "Không làm nóng được ảnh");
          return;
        }
        conTro = json.data.conTroTiep;
        daXuLy += json.data.soDaXuLyLoNay;
        const tong = json.data.tongSoAnh as number;
        setTienDoLamNong({ daXuLy, tong });

        if (json.data.dungVìQuota) {
          setThongBaoLamNong(
            `Dừng lại vì Google Drive báo lỗi liên tục (có thể đã hết hạn mức) — đã làm nóng ${daXuLy}/${tong} ảnh. Thử lại sau vài phút.`,
          );
          return;
        }
        if (!json.data.conAnhChuaXuLy) {
          setThongBaoLamNong(`Đã làm nóng xong ${tong} ảnh.`);
          return;
        }
      }
      setThongBaoLamNong("Đang làm nóng lâu hơn dự kiến — thử bấm lại.");
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

  return (
    <div className="flex flex-col gap-5">
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
            <h1 className={PAGE_TITLE_CLASS}>{detail.title}</h1>
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
              <Badge variant={statusBadge.variant}>{detail.statusLabel ?? statusBadge.label}</Badge>
            </span>
          </div>
          {detail.contractCodes.length > 0 && (
            <p className="mt-1 select-all font-mono text-xs text-[var(--bb-fg-muted)]">
              {detail.contractCodes.join(" + ")}
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

        {/* BB-290 lượt 2 (#36): MỘT nút chính màu mực ở đầu trang, theo
            quan-tri-chi-tiet.png — trước đây nút "Xác nhận và chuyển sang
            chỉnh ảnh" nằm tận cuối cột trái, sau rất nhiều khối khác. Chỉ
            trạng thái "submitted" mới có hành động một-bấm-là-xong ở đây;
            trạng thái "in_retouch" cần dán link trước khi gửi nên nút chính
            của nó vẫn đứng cạnh ô nhập (RetouchSender, cột trái) — không
            trạng thái nào hiện hai nút mực cùng lúc. */}
        {detail.status === "submitted" && (
          <div className="flex shrink-0 flex-col items-end gap-2">
            {detail.outstanding > 0 && (
              <p className="max-w-xs text-right text-xs text-[var(--bb-warning)]">
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
          // BB-294 (#18, mục cũ #36): ngày KHÔNG kèm năm ("27/09" như bản vẽ)
          // — bản cũ in cả năm ("27/09/2026") khiến thẻ hẹp trên điện thoại bị
          // tràn giờ ra ngoài mép. Giờ:phút vẫn ở `phu`, như bản vẽ.
          label="Chốt lúc"
          value={detail.submittedAt ? formatNgayNgan(detail.submittedAt) : "—"}
          phu={
            detail.submittedAt
              ? new Date(detail.submittedAt).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : undefined
          }
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
                  className="break-all font-mono text-xs underline"
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
                ? `đồng bộ lần cuối ${new Date(detail.lastSyncedAt).toLocaleString("vi-VN")}`
                : "chưa đồng bộ lần nào"}
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy || !detail.driveFolderUrl}
                onClick={() => void dongBoLai()}
                className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
              >
                Đồng bộ lại
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setThuMucMoi(detail.driveFolderUrl ?? "");
                  setDangSuaThuMuc((v) => !v);
                }}
                className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
              >
                {dangSuaThuMuc ? "Thôi" : "Đổi thư mục"}
              </button>
            </div>

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
              </div>
            )}
          </section>

          {/* BB-286 — làm nóng bộ đệm ảnh cỡ 800 trước khi khách mở link.
              Tạo link (mục dưới) đã tự làm nóng lô ĐẦU chạy nền (đủ cho màn
              hình đầu tiên); nút này nong HẾT cả bộ, gọi lặp từ trình duyệt
              vì gói Hobby không đủ thời gian làm hết trong một lượt gọi hàm. */}
          {/* BB-290 lượt 2 (#36): "gọn" — một dòng mô tả ngắn thay vì ba
              dòng, chi tiết đầy đủ chuyển vào `title` cho ai cần đọc. */}
          <section
            className="rounded-lg border border-[var(--bb-border)] p-4"
            title="Kéo trước ảnh cỡ xem lưới và ghi vào bộ đệm, để khách mở link không phải đợi từng tấm tải từ Google. Tạo link đã tự làm nóng một phần nhỏ — nút này làm nóng HẾT cả bộ."
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-medium">Bộ đệm ảnh</h2>
                <p className="mt-0.5 text-xs text-[var(--bb-fg-muted)]">
                  Kéo trước ảnh để khách mở link không phải chờ.
                </p>
              </div>
              <button
                type="button"
                disabled={dangLamNong}
                onClick={() => void lamNongAnh()}
                className="shrink-0 rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm disabled:opacity-40"
              >
                {dangLamNong ? "Đang làm nóng…" : "Làm nóng ảnh"}
              </button>
            </div>
            {tienDoLamNong && (
              <p className="mt-2 text-xs text-[var(--bb-fg-muted)]">
                Đã nóng {tienDoLamNong.daXuLy}/{tienDoLamNong.tong} ảnh
              </p>
            )}

            {thongBaoLamNong && <p className="mt-2 text-sm">{thongBaoLamNong}</p>}
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
                  <p className="rounded-md border border-[var(--bb-warning)] p-3 text-sm">
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
                  className="mt-2 w-full select-all rounded border border-[var(--bb-border)] p-2 font-mono text-xs"
                />
              </div>
            ) : (
              <TinhTrangLink detail={detail} />
            )}

            {/* BB-188: hai nút, hai việc KHÁC HẲN NHAU.
                — Mở khoá: giữ nguyên địa chỉ, biểu tượng ba mẹ đã ghim vẫn chạy.
                — Tạo mới: đổi địa chỉ, mọi biểu tượng đã ghim đều chết.
                Khi link cũ chỉ hết hạn thì việc ĐÚNG là mở khoá, nên nó ĐẬM hơn
                (viền dày + chữ đậm) — nhưng KHÔNG đặc màu: BB-290 lượt 2 (#36)
                chốt chỉ một nút đặc màu mực trên cả trang, đứng ở đầu trang. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {detail.shareLink && detail.shareLink.status !== "active" && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void moLaiLink()}
                  className="rounded-md border-2 border-[var(--bb-fg)] px-3 py-2 text-sm font-medium text-[var(--bb-fg)] disabled:opacity-40"
                >
                  Mở khoá link cũ (giữ nguyên địa chỉ)
                </button>
              )}

              <button
                type="button"
                disabled={busy || detail.photoCount === 0}
                onClick={() => void taoLink()}
                className="rounded-md border border-[var(--bb-border)] px-3 py-2 text-sm text-[var(--bb-fg)] disabled:opacity-40"
              >
                {detail.shareLink ? "Tạo link mới (ĐỔI địa chỉ)" : "Tạo link gửi khách"}
              </button>
            </div>
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
                ? `Lark: ${detail.larkTenTrangThai} · đọc lúc ${new Date(detail.larkDocLuc ?? "").toLocaleString("vi-VN")}`
                : "Chưa đọc được trạng thái từ Lark"
            }
          />
        </div>
      </div>
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
  galleryId,
}: {
  detail: Detail;
  busy: boolean;
  locked: boolean;
  changeItem: (method: "PATCH" | "DELETE", body: Record<string, unknown>) => Promise<void>;
  addItem: (productId: string, quantity: number) => Promise<void>;
  recordPayment: (amount: number, method: string, note: string) => Promise<void>;
  sendRetouched: (url: string) => Promise<void>;
  reopen: (reason: string) => Promise<void>;
  galleryId: string;
}) {
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
        <p className="rounded-md border border-[var(--bb-warning)] p-3 text-sm">
          Bộ ảnh này <strong>chưa rõ hạn mức</strong>, nên khách <strong>không chọn ảnh
          được</strong>. Thêm dòng <em>Edit file</em> bên dưới với số ảnh trong gói, hoặc
          bổ sung bên Lark rồi đồng bộ lại.
        </p>
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
        {detail.items.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--bb-fg-muted)]">
            Chưa có dòng hàng nào. Nhập mã hợp đồng rồi chạy đồng bộ, hoặc thêm tay.
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1">
            {detail.items.map((item) => (
              <li key={item.id} className="rounded-md border border-[var(--bb-border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {item.name} <span className="text-[var(--bb-fg-muted)]">×{item.quantity}</span>
                    {/* BB-202 — "Bìa album: <tên tệp>" ngay cạnh dòng hàng, để
                        CSKH không phải mở riêng một chỗ khác mới biết. */}
                    {(() => {
                      const bia = (detail.albumCovers ?? []).find((a) => a.galleryItemId === item.id);
                      if (!bia) return null;
                      return (
                        <span className="ml-2 text-xs text-[var(--bb-fg-muted)]">
                          — Bìa album: {bia.fileName ?? "(chưa chọn)"}
                        </span>
                      );
                    })()}
                  </span>
                  <span className="flex items-center gap-3">
                    {item.totalPrice !== null && (
                      <span className="text-sm">{formatCurrencyVND(item.totalPrice)}</span>
                    )}
                    {!locked && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void changeItem("DELETE", { itemId: item.id })}
                        className="text-xs text-[var(--bb-danger)] underline"
                      >
                        bỏ
                      </button>
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
                        {!locked && c.kind === "edited_photo" && (
                          <QuantityEditor
                            value={c.quantity}
                            disabled={busy}
                            onSubmit={(q) =>
                              void changeItem("PATCH", { itemId: c.id, quantity: q })
                            }
                          />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}

        {!locked && detail.catalog.length > 0 && (
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
                className="mt-3 rounded-md border border-[var(--bb-warning)] p-3 text-sm"
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
                      Vòng {r.round} · {new Date(r.created_at).toLocaleDateString("vi-VN")}
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

      <YeuCauMuaThemBlock galleryId={galleryId} />

      {/*
        BB-200 (3/3) — form chỉ hiện khi nhân viên CÓ quyền `galleries:reopen`.
        Trước bản vá này, thợ ảnh (không có quyền) vẫn thấy form đầy đủ, bấm
        vào mới bị route API chặn — bắt người ta làm một việc rồi mới báo
        không được làm. Route vẫn là ranh giới an ninh thật (xem đầu tệp);
        đây chỉ là không bày ra thứ chắc chắn sẽ bị từ chối.
      */}
      {(detail.status === "expired" || detail.status === "submitted") && detail.canReopen && (
        <section className="rounded-lg border border-[var(--bb-border)] p-4">
          <h2 className="text-base font-medium">Mở lại cho khách chọn tiếp</h2>
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
      <button
        type="button"
        disabled={disabled || !valid || parsed === value}
        onClick={() => onSubmit(parsed)}
        className="text-xs underline disabled:opacity-40"
      >
        lưu
      </button>
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
}: {
  label: string;
  value: string;
  phu?: string;
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
      <div className="mt-1 flex flex-wrap items-baseline gap-x-1.5 gap-y-0 font-display text-[26px] font-normal leading-tight text-[var(--bb-fg)] [font-variant-numeric:lining-nums_tabular-nums] sm:text-[28px]">
        {canhBao && (
          <span
            role="img"
            aria-label="Cần chú ý"
            title="Cần chú ý"
            className="mb-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-[var(--bb-warning)]"
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
        className="min-w-0 flex-1 rounded border border-[var(--bb-border)] px-2 py-1.5 font-mono text-xs"
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

  const ngay = (v: string | null) =>
    v ? new Date(v).toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

  // Hết hạn là một tình trạng THẬT, nhưng cột `status` không tự đổi khi đồng hồ
  // đi qua `expires_at` — không có ai chạy qua bảng để đổi nó. Tính ở đây, nếu
  // không thì màn hình báo "đang dùng" trong khi khách đang nhìn trang báo hết hạn.
  const daHetHan =
    link.status === "active" && link.expiresAt !== null && new Date(link.expiresAt) < new Date();

  const nhan = link.revokedAt
    ? { chu: "Đã thu hồi", vien: "var(--bb-danger)" }
    : daHetHan || link.status === "expired"
      ? { chu: "Đã hết hạn", vien: "var(--bb-warning)" }
      : link.status === "active"
        ? { chu: "Đang dùng", vien: "var(--bb-success)" }
        : { chu: link.status, vien: "var(--bb-border)" };

  return (
    <div className="mt-2 space-y-1 text-sm">
      <p>
        <span
          className="mr-2 inline-block rounded-full border px-2 py-0.5 text-xs text-[var(--bb-fg)]"
          style={{ borderColor: nhan.vien }}
        >
          {nhan.chu}
        </span>
        <span className="text-[var(--bb-fg-muted)]">
          mã <span className="font-mono">{link.tokenPrefix ?? "—"}…</span>
        </span>
      </p>
      {/* BB-201 — link hiện lại được như link Drive (chủ studio 25/09/2026). */}
      {link.diaChi ? <DongLinkApp diaChi={link.diaChi} /> : null}
      <p className="text-[var(--bb-fg-muted)]">
        Cấp ngày {ngay(link.createdAt)} · hạn {ngay(link.expiresAt)} · khách đã mở {link.viewCount} lần
      </p>
      {(daHetHan || link.status !== "active") && (
        <p className="rounded-md border border-[var(--bb-warning)] p-3">
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

