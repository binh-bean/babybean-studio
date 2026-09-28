"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Send,
  ArrowRight,
  Paintbrush,
  Copy,
  Clock,
  CalendarClock,
  Plus,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BranchSelector } from "./branch-selector";
import {
  bienDongLaTot,
  chaoTheoBuoi,
  ngayDayDuVN,
  xepViecHomNay,
  loiNhacKhach,
  type ViecHomNayThoLuoc,
} from "@/lib/utils/bang-dieu-khien";
import { THU_TU_HIEN_THI_MUA_THEM } from "@/lib/utils/mua-them-7-ngay";
import { dongCanXuLy, type CanXuLyTongHop } from "@/lib/utils/can-xu-ly";
import { layerMoNgang } from "@/lib/utils/tranh-tan-nen";
import { tinhTenBiaTuDuLieu, tinhTieuDeBoAnhQuanTri } from "@/lib/utils/dinh-dang";
import { CARD_TITLE_CLASS, PAGE_TITLE_CLASS } from "./page-header";

/** Màu dải cơ cấu Mua thêm theo ĐÚNG bản vẽ: Ảnh in (mực) · Khung (rêu) · Album (hồng). */
const MAU_CO_CAU_MUA_THEM: Record<string, string> = {
  anh_in: "var(--bb-fg)",
  khung: "var(--bb-moss, var(--bb-accent))",
  album: "var(--bb-primary)",
};

type DashboardStats = {
  waitingForSelection: number;
  dueSoon: number;
  overdue: number;
  waitingForRetouch: number;
  deliveredThisMonth: number;
  totalGalleries: number;
};

/** So kỳ trước cho một thẻ số — chỉ thẻ "trong kỳ" mới có mục ở đây (BB-270). */
type SoSanhKy = {
  kyTruoc: number;
  chenhLechPhanTram: number | null;
};

type TienDoChiNhanh = {
  branchId: string;
  branchName: string;
  dangHoatDong: number;
  daChot: number;
  tyLeChot: number | null;
};

type ActionRequiredItem = {
  id: string;
  title: string;
  customer_name: string;
  branch_name: string;
  status: string;
  due_at: string | null;
  selected_count: number;
  included_quota: number | null;
  urgency: string;
};

type ChartData = {
  date: string;
  count: number;
};

/**
 * BB-303 (bản vẽ BB-301) — một dòng của khối "Việc hôm nay". Route API
 * (`src/app/api/admin/dashboard/route.ts`) trả CAMELCASE cho mảng này —
 * KHÁC `ActionRequiredItem` ở trên (snake_case, giữ nguyên hình dạng thô của
 * `v_gallery_progress` cho `actionRequired`) — nên khai một kiểu riêng thay
 * vì kế thừa `ActionRequiredItem`.
 */
type ViecHomNayItem = ViecHomNayThoLuoc & {
  id: string;
  title: string;
  customerName: string;
  branchName: string;
  status: string;
  selectedCount: number;
  includedQuota: number | null;
  urgency: string;
  /**
   * BB-313 (ảnh chụp app thật, Đợt 9, mục 1) — nickname/họ tên đầy đủ RIÊNG
   * (route API đã đổi, `src/app/api/admin/dashboard/route.ts`), để tự áp
   * `tinhTieuDeBoAnhQuanTri` đúng luật — không lùi về `tenGoiBe()` vô điều
   * kiện như bản cũ (thêm nhầm "Bé " trước họ tên đầy đủ khi bé không có
   * nickname).
   */
  babyNickname: string | null;
  babyFullName: string | null;
  packageName: string | null;
  customerPhone: string | null;
  coverPhotoId: string | null;
  sentAt: string | null;
  /**
   * BB-312 — có giá trị khi dòng này là một bộ ảnh đang có yêu cầu "xin mở
   * lại" CHƯA XỬ LÝ (không phải việc theo hạn giao thật — `dueAt` của dòng
   * này luôn null, xếp vào "Hôm nay" qua `forceHomNay`, xem bang-dieu-khien.ts).
   */
  waitingReopen?: { requestedAt: string; lyDo: string | null; lanThu: number };
};

type CoCauMuaThemApi = { nhom: string; ten: string; soMon: number; tongTien: number };

type MuaThem7NgayData = {
  tongTien: number;
  chenhLechPhanTram: number | null;
  soDon: number;
  soGiaDinh: number;
  theoNgay: { ngay: string; tong: number }[];
  coCau: CoCauMuaThemApi[];
  tu: string | null;
  den: string | null;
};

/** Giá trị rỗng an toàn — dùng khi `data.muaThem7Ngay` thiếu (API cũ/giả lập chưa có trường BB-303 này), để một khối phụ thiếu dữ liệu không kéo vỡ cả trang. */
const RONG_MUA_THEM_7_NGAY: MuaThem7NgayData = {
  tongTien: 0,
  chenhLechPhanTram: null,
  soDon: 0,
  soGiaDinh: 0,
  theoNgay: [],
  coCau: [],
  tu: null,
  den: null,
};

type ChiNhanhMuaThemItem = { branchId: string; branchName: string; tongTien: number };

type DashboardData = {
  stats: DashboardStats;
  soSanhKy: Partial<Record<keyof DashboardStats, SoSanhKy>>;
  tienDoChiNhanh: TienDoChiNhanh[];
  actionRequired: ActionRequiredItem[];
  viecHomNay: ViecHomNayItem[];
  muaThem7Ngay: MuaThem7NgayData;
  theoChiNhanhMuaThem: ChiNhanhMuaThemItem[];
  chartData: ChartData[];
};

export function Dashboard({ hoTen }: { hoTen?: string | null } = {}) {
  const searchParams = useSearchParams();
  /**
   * BB-308 (bản vẽ BB-301: "bộ chọn chi nhánh cạnh nút + Tạo bộ ảnh") —
   * `BranchSelector` đã có sẵn trong dự án (branch-selector.tsx) nhưng chưa
   * gắn vào trang nào (xem chú thích cũ ở `khoiChao` bên dưới). Nó ĐỔI chi
   * nhánh bằng `window.history.pushState` + sự kiện `branchChange` — không
   * qua router Next.js — nên `useSearchParams()` chỉ bắt được giá trị BAN
   * ĐẦU (khi vào thẳng URL có `?branchId=`); mọi lần đổi sau đó phải nghe sự
   * kiện, ĐÚNG cách `gallery-list.tsx` đã làm (`window.addEventListener("branchChange", …)`),
   * để không lặp lại một router state thứ hai không đồng bộ.
   */
  const [branchId, setBranchId] = useState(() => searchParams?.get("branchId") || "");

  useEffect(() => {
    setBranchId(searchParams?.get("branchId") || "");
  }, [searchParams]);

  useEffect(() => {
    function xuLyDoiChiNhanh(e: Event) {
      const detail = (e as CustomEvent<string>).detail;
      setBranchId(detail ?? "");
    }
    window.addEventListener("branchChange", xuLyDoiChiNhanh);
    return () => window.removeEventListener("branchChange", xuLyDoiChiNhanh);
  }, []);

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // BB-283 (soát 27/09/2026): "Cần xử lý ngay" giờ đọc CÙNG nguồn với huy
  // hiệu sidebar (`admin-layout-shell.tsx`) — `driveChuaChiaSe`/`chuaCoAnh`
  // từ `GET /api/admin/can-xu-ly`, gộp với `dueSoon`/`overdue` đã có sẵn
  // trong `data.stats`. Tải riêng, không chặn khối chính: hỏng thì khối chỉ
  // thiếu hai loại kia, không sập cả trang.
  const [canXuLy, setCanXuLy] = useState<{
    driveChuaChiaSe?: unknown[];
    chuaCoAnh?: unknown[];
    chuaCoHanMuc?: unknown[];
    canhBaoLark?: number;
  } | null>(null);

  // BB-303 — nâng lên phạm vi component (`useCallback`, không còn khai TRONG
  // `useEffect`) để nút "Chuyển chỉnh" của khối "Việc hôm nay" gọi lại được
  // sau khi xác nhận một bộ ảnh, không đợi `branchId` đổi mới tải lại.
  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // BB-303 — `full=1`: trang này THẬT SỰ vẽ "Việc hôm nay"/"Mua thêm 7
      // ngày", khác lượt gọi nhẹ của sidebar (`admin-layout-shell.tsx`, chỉ
      // cần `stats.dueSoon`/`overdue` cho huy hiệu) — xem chú thích đầy đủ ở
      // route.ts (`canDayDu`).
      const query = branchId ? `?branchId=${branchId}&full=1` : "?full=1";
      const res = await fetch(`/api/admin/dashboard${query}`, { cache: "no-store" });
      const result = await res.json();

      if (!res.ok) {
        setError(result.error?.message || "Lỗi tải dữ liệu");
      } else {
        setData(result.data);
      }
    } catch (err: unknown) {
      console.error("Lỗi khi tải bảng điều khiển:", err);
      setError("Lỗi kết nối tới máy chủ");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/can-xu-ly", { cache: "no-store" })
      .then((res) => res.json().catch(() => null).then((json) => ({ ok: res.ok, json })))
      .then(({ ok, json }) => {
        if (!active || !ok || !json?.data) return;
        setCanXuLy(json.data);
      })
      .catch(() => {
        // Phụ — hỏng thì khối "Cần xử lý ngay" chỉ thiếu hai loại này.
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-muted-foreground">Đang tải dữ liệu...</div>;
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="rounded-lg bg-destructive/10 p-4 text-destructive border border-destructive/20">
          <p className="font-semibold">Không thể tải bảng điều khiển</p>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // `key`: tên trong `data.stats`/`data.soSanhKy` để tra chip so kỳ trước.
  // `huongTangLaTot`: chỉ đọc khi có chip — thẻ "trong kỳ" mới có mục trong
  // `soSanhKy` (API không trả cho thẻ số dồn hiện tại, xem route.ts).
  //
  // BB-283 (soát 27/09/2026): bỏ icon tròn nhiều màu ở góc thẻ — bản vẽ
  // quan-tri-menu-nhom.png không có, chỉ nhãn hoa + số serif + chip %.
  //
  // BB-294 (mục cũ #32): khai báo TRƯỚC nhánh trống — hàng thẻ số vẫn phải
  // hiện khi `totalGalleries === 0` (mọi giá trị đúng là 0, không phải ẩn
  // hẳn khối số liệu như trước, xem báo cáo độc lập #32).
  const stats: {
    key: keyof DashboardStats;
    label: string;
    value: number;
    huongTangLaTot: boolean;
  }[] = [
    { key: "waitingForSelection", label: "Chờ khách chọn", value: data.stats.waitingForSelection, huongTangLaTot: false },
    { key: "dueSoon", label: "Sắp hết hạn", value: data.stats.dueSoon, huongTangLaTot: false },
    { key: "overdue", label: "Quá hạn", value: data.stats.overdue, huongTangLaTot: false },
    { key: "waitingForRetouch", label: "Chờ chỉnh ảnh", value: data.stats.waitingForRetouch, huongTangLaTot: false },
    { key: "deliveredThisMonth", label: "Đã giao tháng này", value: data.stats.deliveredThisMonth, huongTangLaTot: true },
  ];

  // BB-303 (bản vẽ bang-dieu-khien-dien-thoai.html, chú thích): "thẻ số: hàng
  // CUỘN NGANG… thứ tự đổi so với máy tính — Quá hạn đứng đầu vì trên điện
  // thoại chỉ thấy 2,5 thẻ." Máy tính giữ thứ tự cũ (Chờ khách chọn trước).
  // Thứ tự điện thoại ĐÚNG bản vẽ: Quá hạn, Sắp hết hạn, Chờ khách chọn, Chờ
  // chỉnh ảnh, Đã giao.
  const THU_TU_KEY_DIEN_THOAI: (typeof stats)[number]["key"][] = [
    "overdue",
    "dueSoon",
    "waitingForSelection",
    "waitingForRetouch",
    "deliveredThisMonth",
  ];
  const thuTuDienThoai = THU_TU_KEY_DIEN_THOAI.map((k) => stats.find((s) => s.key === k)).filter(
    (s): s is (typeof stats)[number] => !!s,
  );

  // BB-294 (mục cũ #32): render một lần, dùng lại ở CẢ nhánh trống lẫn nhánh
  // thường — tránh chép tay hai bản dễ lệch nhau.
  const MotTheSo = ({ stat }: { stat: (typeof stats)[number] }) => {
    const soSanh = data.soSanhKy[stat.key];
    const laTot = soSanh ? bienDongLaTot(soSanh.chenhLechPhanTram, stat.huongTangLaTot) : null;
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--bb-fg-muted)]">
            {/* BB-301: chấm san hô CHỈ ở "Sắp hết hạn" và "Quá hạn" — cảnh báo, không trang trí thẻ khác. */}
            {(stat.key === "dueSoon" || stat.key === "overdue") && (
              <i aria-hidden="true" className="block h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--bb-danger)]" />
            )}
            {stat.label}
          </span>
          <div className="flex items-end justify-between gap-2">
            {/* BB-303 (admin duyệt 28/09/2026): Be Vietnam Pro tabular-nums
                (`.bb-so`), thay Playfair Display — số oldstyle lệch chân, dễ
                nhầm "0" với "O" (BB-301 XONG.md mục 2). */}
            <div
              className={
                stat.key === "overdue"
                  ? "bb-so text-[32px] text-[var(--bb-danger)]"
                  : "bb-so text-[32px]"
              }
            >
              {stat.value}
            </div>
            {soSanh && soSanh.chenhLechPhanTram !== null && (
              <Badge
                // Bản vẽ: chip "so kỳ trước" nền sage NHẠT — chỉ đúng khi biến động
                // là TỐT (laTot === true). Biến động xấu vẫn phải nổi bật khác màu
                // (variant="default", hồng đất) để CSKH nhận ra ngay — đó là dữ liệu
                // thật từ BB-270, không phải trang trí, nên KHÔNG gộp về một màu.
                variant={laTot === true ? "soft-accent" : laTot === false ? "default" : "secondary"}
                className="gap-0.5 px-1.5 py-0.5"
                title={`Kỳ trước: ${soSanh.kyTruoc}`}
              >
                {soSanh.chenhLechPhanTram >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" aria-hidden="true" />
                )}
                {Math.abs(Math.round(soSanh.chenhLechPhanTram))}%
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const hangTheSo = (
    <>
      {/* Điện thoại (< sm): cuộn ngang, Quá hạn đứng đầu. */}
      <div className="flex gap-3 overflow-x-auto pb-1 sm:hidden" role="list" aria-label="Số liệu tổng quan">
        {thuTuDienThoai.map((stat) => (
          <div key={stat.key} role="listitem" className="w-[128px] shrink-0">
            <MotTheSo stat={stat} />
          </div>
        ))}
      </div>
      {/* Máy tính/máy tính bảng (>= sm): lưới 5 cột, thứ tự gốc. */}
      <div className="hidden sm:grid sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {stats.map((stat) => (
          <MotTheSo key={stat.key} stat={stat} />
        ))}
      </div>
    </>
  );

  // BB-303 (bản vẽ BB-301) — lời chào đầu trang: buổi + thứ/ngày + số việc
  // hôm nay/đã trễ hạn TÍNH TỪ DỮ LIỆU THẬT (`data.viecHomNay`, xếp bằng
  // ĐÚNG hàm dùng cho khối "Việc hôm nay" bên dưới) — không phải con số cố
  // định như trong bản vẽ.
  const xepHomNay = xepViecHomNay(data.viecHomNay ?? []);
  const tongViecHomNay = xepHomNay.quaHan.length + xepHomNay.homNay.length;
  const khoiChao = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {/* BB-280: MỘT cỡ tiêu đề trang cố định ở mọi kích thước màn hình
            (tests/e2e/bb-280-quan-tri.spec.ts đo bằng getComputedStyle ở cả
            1440×900 lẫn 390×844) — dùng ĐÚNG `PAGE_TITLE_CLASS`, không tự viết
            cỡ responsive riêng cho lời chào. */}
        <h1 className={PAGE_TITLE_CLASS}>
          {chaoTheoBuoi(new Date().getHours())}
          {hoTen ? `, ${hoTen}` : ""}
        </h1>
        <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
          {ngayDayDuVN(new Date())}
          {tongViecHomNay > 0 && ` · ${tongViecHomNay} việc cần làm hôm nay`}
          {xepHomNay.quaHan.length > 0 && (
            <>
              {", "}
              <strong className="font-medium text-[var(--bb-danger)]">
                {xepHomNay.quaHan.length} việc đã trễ hạn
              </strong>
            </>
          )}
        </p>
      </div>
      {/* BB-303 (bang-dieu-khien.html): nút "+ Tạo bộ ảnh" cạnh lời chào —
          CÙNG đích/CÙNG kiểu nút với trang Bộ ảnh (`bo-anh-page-header.tsx`),
          không viết lại luồng tạo bộ ảnh ở đây.
          BB-308: bộ chọn chi nhánh (`BranchSelector`) giờ đứng CẠNH nút này,
          đúng bản vẽ — trước đây có sẵn trong dự án nhưng chưa gắn vào trang
          nào (BB-303 chỉ ghi nhận vào bàn giao). Tự ẩn khi nhân viên chỉ phụ
          trách một chi nhánh (xem `branch-selector.tsx`). */}
      <div className="flex shrink-0 items-center gap-2">
        <BranchSelector />
        <Link href="/admin/galleries/create">
          <Button className="bg-[var(--bb-fg)] text-[var(--bb-bg)] hover:opacity-90" size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Tạo bộ ảnh
          </Button>
        </Link>
      </div>
    </div>
  );

  if (data.stats.totalGalleries === 0) {
    // BB-292: tranh trạng thái trống dùng chung cho các màn quản trị
    // (`ngang-quan-tri-trong`) thay vòng tròn icon `Inbox` trơn — cùng ngôn
    // ngữ hình ảnh với `bao-cao-trong` ở màn Báo cáo.
    //
    // BB-292 vòng 2 — giám đốc chấm hai lỗi:
    //  1. `object-cover` tràn hết bề ngang kéo giãn tranh bàn, cắt mất đỉnh
    //     lọ hoa — đổi `object-contain` + `max-w-[360px]`, không cắt vật nào.
    //  2. Bỏ khối nền riêng quanh tranh (`overflow-hidden` full-bleed cũ) —
    //     tranh nay nằm thẳng trên nền thẻ, kèm `layerMoNgang` (multiply +
    //     mặt nạ mờ mép) để tan vào nền thay vì nổi thành khối kem.
    return (
      <div className="space-y-8">
        {khoiChao}
        {/* BB-294 (mục cũ #32): hàng thẻ số vẫn hiện khi trống — 0 có NGHĨA
            (chưa có gì cần chọn/sắp hết hạn/quá hạn…), không phải một khối
            biến mất khiến trang trông như hỏng. Không bịa số: đây vẫn là
            `data.stats` thật từ API, chỉ là toàn 0 vì `totalGalleries === 0`. */}
        {hangTheSo}
        <div className="flex flex-col items-center rounded-xl border border-dashed bg-muted/20 p-8 text-center">
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
          <h3 className="text-xl font-bold mb-2">Chưa có bộ ảnh nào</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Chi nhánh này hiện chưa có bộ ảnh nào. Hãy bắt đầu bằng việc đồng bộ ảnh chụp cho khách hàng.
          </p>
          {/* BB-294 (#19, mục cũ #32) — nút chính màu mực: `variant="default"`
              được ghi đè mực trong toàn quản trị, xem `.giao-dien-quan-tri`
              trong src/styles/tokens.css. */}
          <Button asChild>
            <Link href="/admin/galleries">Đi tới Quản lý bộ ảnh</Link>
          </Button>
        </div>
      </div>
    );
  }

  const maxChartValue = Math.max(1, ...data.chartData.map(d => d.count));

  return (
    <div className="space-y-8">
      {khoiChao}
      {/*
        BB-280: chủ studio 27/09/2026 chốt lại tư duy màn Tổng quan — khối
        "Cần xử lý" phải lên ĐẦU trang, trước cả hàng thẻ số. Trước đây nó
        đứng thứ hai, sau hàng thẻ số — đúng thứ tự CSKH quan tâm là "việc gì
        cần làm ngay" trước rồi mới tới "số liệu tổng quan".
      */}
      {(() => {
        // BB-283 (soát 27/09/2026): MỘT khối, MỘT nguồn — không còn bảng
        // riêng của BB-270 (due_soon/overdue) đứng cạnh huy hiệu sidebar nói
        // điều khác. `merged`/`dong`/`tong` dùng ĐÚNG hàm sidebar dùng
        // (`src/lib/utils/can-xu-ly.ts`), nên tổng các dòng ở đây LUÔN khớp
        // số trên huy hiệu — không tính lại theo cách khác ở đây.
        const merged: CanXuLyTongHop = {
          driveChuaChiaSe: canXuLy?.driveChuaChiaSe,
          chuaCoAnh: canXuLy?.chuaCoAnh,
          chuaCoHanMuc: canXuLy?.chuaCoHanMuc,
          dueSoon: data.stats.dueSoon,
          overdue: data.stats.overdue,
          canhBaoLark: canXuLy?.canhBaoLark,
        };
        const dong = dongCanXuLy(merged);
        return (
          <Card className="flex flex-col overflow-hidden min-w-0">
            <CardHeader>
              <CardTitle className={CARD_TITLE_CLASS}>Cần xử lý ngay</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0">
              {dong.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-muted-foreground space-y-4 py-12">
                  <CheckCircle2 className="w-12 h-12 text-emerald-500/50" />
                  <p>Tuyệt vời! Không có bộ ảnh nào cần xử lý gấp.</p>
                </div>
              ) : (
                <ul data-testid="can-xu-ly-ngay-rows">
                  {dong.map((d) => (
                    <li key={d.key} className="border-t border-[var(--bb-border)] first:border-t-0">
                      <Link
                        href={d.href}
                        className="flex items-center gap-3 px-6 py-3 text-sm transition-colors hover:bg-[var(--bb-surface-2)]"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: d.mauCham }}
                        />
                        <span className="flex-1 font-medium text-[var(--bb-fg)]">{d.nhan}</span>
                        {/* BB-303 (luật phông 28/09/2026): Be Vietnam Pro
                            tabular-nums thay `font-mono` — nội dung quản trị
                            chỉ dùng hai phông đã chốt (Playfair Display cho
                            tiêu đề, Be Vietnam Pro cho phần còn lại kể cả số). */}
                        <span className="tabular-nums text-[var(--bb-fg-muted)]">{d.soLuong}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[var(--bb-fg-muted)]" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Hàng thẻ số — bản vẽ quan-tri-bang-dieu-khien.webp: nhãn nhỏ trên
          cùng, số lớn bên dưới, chip % so kỳ trước ở góc phải (BB-270). Thẻ
          không có mục trong `soSanhKy` (số dồn hiện tại, không phải "trong
          kỳ") thì không hiện chip — xem định nghĩa ở route.ts.
          BB-294 (mục cũ #32): `hangTheSo` dùng chung với nhánh trống ở trên. */}
      {hangTheSo}

      {/* BB-303 (bản vẽ BB-301) — "Việc hôm nay" (trái) + "Mua thêm · 7 ngày
          qua" và "Theo chi nhánh" (phải).
          Điện thoại (bang-dieu-khien-dien-thoai.html): thứ tự xếp DỌC khác
          máy tính — "Mua thêm 7 ngày" lên TRƯỚC "Việc hôm nay" (order-*), và
          "Theo chi nhánh" KHÔNG có trong bản vẽ điện thoại (`hidden lg:block`). */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="order-2 lg:order-1">
          <ViecHomNayCard items={data.viecHomNay ?? []} onLamMoi={loadData} />
        </div>
        <div className="order-1 flex flex-col gap-6 lg:order-2">
          {/* Chống vỡ trang khi phản hồi API còn thiếu các trường MỚI của
              BB-303 (ví dụ bản đã lưu đệm/giả lập cũ chưa có
              muaThem7Ngay/theoChiNhanhMuaThem) — một khối trống hoá ra một
              khối rỗng, không phải cả trang trắng. */}
          <MuaThem7NgayCard data={data.muaThem7Ngay ?? RONG_MUA_THEM_7_NGAY} />
          <div className="hidden lg:block">
            <TheoChiNhanhMuaThemCard items={data.theoChiNhanhMuaThem ?? []} />
          </div>
        </div>
      </div>

      {/*
        `min-w-0` trên hai thẻ con: ô lưới mặc định rộng tối thiểu bằng nội
        dung (`min-width: auto`). Biểu đồ 14 ngày có nhãn `whitespace-nowrap`,
        nên nó đẩy cả cột rộng 653px trên màn 375px — đo thật ngày 21/09/2026:
        bảng điều khiển phải kéo ngang mới đọc được trên điện thoại.
      */}
      <div className="grid lg:grid-cols-2 gap-8">
        {/* Biểu đồ cột */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className={CARD_TITLE_CLASS}>Bộ ảnh mới (14 ngày)</CardTitle>
          </CardHeader>
          <CardContent>
            {/*
              Biểu đồ cuộn ngang TRONG thẻ của nó, chứ không kéo giãn cả thẻ:
              14 cột với nhãn ngày không nhét vừa 375px, và thu nhỏ nữa thì
              nhãn chồng lên nhau, đọc được mới là thứ đáng giữ.
            */}
            <div
              className="overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Biểu đồ số bộ ảnh mới 14 ngày qua, cuộn ngang"
            >
              <div className="h-64 flex items-end gap-2 pt-4 min-w-[26rem]">
              {data.chartData.map((d, i) => {
                const heightPercent = (d.count / maxChartValue) * 100;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                    <div
                      className="w-full bg-[var(--bb-fg)]/15 rounded-t-sm group-hover:bg-[var(--bb-fg)] transition-colors relative"
                      style={{ height: `${Math.max(heightPercent, 2)}%` }}
                    >
                      <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold bg-background shadow-sm border px-1.5 py-0.5 rounded">
                        {d.count}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground whitespace-nowrap -rotate-45 origin-top-left mt-2 pl-1">
                      {d.date.split('-').slice(1).join('/')}
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/*
          4. Tiến độ theo chi nhánh — bản vẽ quan-tri-bang-dieu-khien.webp:
          tên chi nhánh + thanh ngang mảnh. Thanh thể hiện TỈ LỆ ĐÃ CHỐT trong
          số bộ ảnh đang hoạt động của chi nhánh đó (định nghĩa đầy đủ ở
          `src/lib/utils/bang-dieu-khien.ts`) — không phải % trên tổng số bộ
          ảnh mọi thời, để một chi nhánh cũ nhiều bộ ảnh đã xong không luôn
          hiện thanh gần đầy so với chi nhánh mới còn ít việc.
        */}
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className={CARD_TITLE_CLASS}>Tiến độ theo chi nhánh</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.tienDoChiNhanh.length === 0 ? (
              <p className="text-sm text-muted-foreground">Không có chi nhánh nào để hiện.</p>
            ) : (
              data.tienDoChiNhanh.map((cn) => (
                <div key={cn.branchId} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium text-[var(--bb-fg)] truncate">{cn.branchName}</span>
                    <span className="text-xs text-[var(--bb-fg-muted)] shrink-0">
                      {cn.tyLeChot === null ? "—" : `${Math.round(cn.tyLeChot * 100)}%`}
                    </span>
                  </div>
                  <div
                    className="h-1.5 w-full rounded-full bg-[var(--bb-fg)]/10 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={cn.tyLeChot === null ? 0 : Math.round(cn.tyLeChot * 100)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Tiến độ ${cn.branchName}: ${cn.daChot}/${cn.dangHoatDong} bộ ảnh đã chốt`}
                  >
                    <div
                      className="h-full rounded-full bg-[var(--bb-accent)] transition-[width]"
                      style={{ width: `${cn.tyLeChot === null ? 0 : Math.round(cn.tyLeChot * 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-[var(--bb-fg-muted)]">
                    {cn.dangHoatDong === 0
                      ? "Không có bộ ảnh nào đang hoạt động"
                      : `${cn.daChot}/${cn.dangHoatDong} bộ đã chốt`}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BB-303 (bản vẽ BB-301) — "Việc hôm nay"
// ---------------------------------------------------------------------------

/** Ảnh bìa nhỏ 40×50 (máy tính) / 36×45 (điện thoại, chỉnh bằng className) — dùng chung với gallery-list.tsx (cùng nguồn `coverPhotoId`). */
function AnhBiaViec({ coverPhotoId, title }: { coverPhotoId: string | null; title: string }) {
  if (!coverPhotoId) {
    return <div aria-hidden="true" className="h-[50px] w-10 shrink-0 rounded-[5px] bg-[var(--bb-surface-2)]" />;
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

/**
 * Dòng phụ "Loại buổi · Bé … · Ba mẹ · Chi nhánh", chỉ nối các phần THẬT SỰ
 * có dữ liệu. BB-308 (vòng 4, mục #8): `tenGoiBe` thay `` `Bé ${...}` `` —
 * tránh "Bé Bé Na" cho bé đã có "Bé" trong nickname.
 *
 * BB-313 (ảnh chụp app thật, Đợt 9, mục 1) — dùng `tinhTenBiaTuDuLieu` (đúng
 * hàm dùng chung, dinh-dang.ts) thay vì gọi `tenGoiBe()` vô điều kiện: mất
 * nickname thì hiện HỌ TÊN ĐẦY ĐỦ NGUYÊN VẸN, không thêm "Bé ".
 */
function dongPhuViec(item: ViecHomNayItem): string {
  const tenBe = tinhTenBiaTuDuLieu(item.babyNickname, item.babyFullName);
  const phan = [item.packageName, tenBe || null, item.customerName, item.branchName].filter(
    (v): v is string => !!v,
  );
  return phan.join(" · ");
}

/** Nhãn hạn + có trễ hay không — "Trễ N ngày/giờ" / "hôm nay HH:mm" / "HH:mm" / "dd/mm". */
function nhanHanViec(item: ViecHomNayItem, now: Date): { text: string; tre: boolean } {
  // BB-312 — không có "hạn giao" thật; "lần N" nói rõ hơn cho CSKH đây là
  // việc đã dồn lại bao nhiêu lượt, thay vì im lặng như "Cần xử lý" chung
  // chung của các dòng thiếu `dueAt` khác.
  if (item.waitingReopen) return { text: `Xin lần ${item.waitingReopen.lanThu}`, tre: true };
  if (!item.dueAt) return { text: item.status === "submitted" ? "Cần xử lý" : "—", tre: false };
  const due = new Date(item.dueAt);
  if (Number.isNaN(due.getTime())) return { text: "—", tre: false };
  const chenhLechMs = due.getTime() - now.getTime();
  if (chenhLechMs < 0) {
    const gioTre = Math.abs(chenhLechMs) / 3_600_000;
    if (gioTre < 24) return { text: `Trễ ${Math.max(1, Math.round(gioTre))} giờ`, tre: true };
    return { text: `Trễ ${Math.round(gioTre / 24)} ngày`, tre: true };
  }
  const cungNgay = due.toDateString() === now.toDateString();
  if (cungNgay) {
    return { text: due.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }), tre: false };
  }
  return { text: due.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" }), tre: false };
}

/**
 * BB-308 (bản vẽ BB-301: chip lọc "Tất cả / Nhắc khách / Duyệt & giao") —
 * phân nhóm MỖI DÒNG "Việc hôm nay" theo đúng nhánh nút "Làm nhanh" mà
 * `NutLamNhanhViec` bên dưới đã vẽ: ba trạng thái "submitted"/"in_retouch"/
 * "ready chưa gửi" cần STUDIO xử lý tiếp (duyệt, chuyển, giao) → nhóm
 * "duyet_giao"; mọi trường hợp còn lại là đang chờ KHÁCH phản hồi → nhóm
 * "nhac_khach". Tách thành hàm riêng (không viết lại logic bên trong
 * `NutLamNhanhViec`) để chip đếm/lọc và nút hiển thị luôn khớp nhau — đổi
 * một nơi, không lệch hai chỗ.
 */
export type NhomThaoTacViec = "duyet_giao" | "nhac_khach";
/** Xuất ra để `tests/unit/bb-308-nhom-thao-tac-viec.test.ts` thử trực tiếp — cùng cách `tenThanThienMuaThem` (gallery-detail.tsx) đã làm cho BB-296. */
export function nhomThaoTacViec(
  item: Pick<ViecHomNayItem, "status" | "sentAt" | "waitingReopen">,
): NhomThaoTacViec {
  // BB-312 — yêu cầu "xin mở lại" luôn cần STUDIO trả lời trước, không phải
  // chờ khách — cùng nhóm với "Duyệt & giao".
  if (item.waitingReopen) return "duyet_giao";
  if (item.status === "submitted") return "duyet_giao";
  if (item.status === "in_retouch") return "duyet_giao";
  if (item.status === "ready" && !item.sentAt) return "duyet_giao";
  return "nhac_khach";
}

/** Nút "Làm nhanh" đổi theo trạng thái — bo-anh-danh-sach.png/bang-dieu-khien.html. */
function NutLamNhanhViec({
  item,
  dangXuLy,
  onChuyenChinh,
}: {
  item: ViecHomNayItem;
  dangXuLy: boolean;
  onChuyenChinh: () => void;
}) {
  const [daChep, setDaChep] = useState(false);

  async function chepLoiNhac() {
    try {
      await navigator.clipboard.writeText(
        loiNhacKhach({
          customerName: item.customerName,
          babyName: tinhTenBiaTuDuLieu(item.babyNickname, item.babyFullName) || null,
          title: item.title,
        }),
      );
      setDaChep(true);
      window.setTimeout(() => setDaChep(false), 2000);
    } catch {
      // Clipboard API bị chặn — không có gì thêm để làm ở một nút nhỏ.
    }
  }

  // BB-312 — yêu cầu "xin mở lại" không đi qua "Chuyển chỉnh"/"Duyệt-giao" cũ
  // (đó là hai việc khác hẳn); nút riêng mở đúng bộ ảnh, nơi có khối nổi bật
  // để xử lý (`YeuCauMoLaiBanner`).
  if (item.waitingReopen) {
    return (
      <Link href={`/admin/galleries/${encodeURIComponent(item.id)}`}>
        <Button variant="outline" size="sm" className="h-8 shrink-0 whitespace-nowrap text-xs">
          <Send className="mr-1 h-3.5 w-3.5" /> Xem yêu cầu
        </Button>
      </Link>
    );
  }
  if (item.status === "submitted") {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 whitespace-nowrap text-xs"
        disabled={dangXuLy}
        onClick={onChuyenChinh}
      >
        <ArrowRight className="mr-1 h-3.5 w-3.5" /> {dangXuLy ? "Đang chuyển…" : "Chuyển chỉnh"}
      </Button>
    );
  }
  if (item.status === "in_retouch") {
    return (
      <Link href={`/admin/galleries/${encodeURIComponent(item.id)}`}>
        <Button variant="outline" size="sm" className="h-8 shrink-0 whitespace-nowrap text-xs">
          <Paintbrush className="mr-1 h-3.5 w-3.5" /> Duyệt/Giao ảnh
        </Button>
      </Link>
    );
  }
  if (item.status === "ready" && !item.sentAt) {
    return (
      <Link href={`/admin/galleries/${encodeURIComponent(item.id)}`}>
        <Button variant="outline" size="sm" className="h-8 shrink-0 whitespace-nowrap text-xs">
          <Copy className="mr-1 h-3.5 w-3.5" /> Chép link
        </Button>
      </Link>
    );
  }
  return (
    <Button variant="outline" size="sm" className="h-8 shrink-0 whitespace-nowrap text-xs" onClick={() => void chepLoiNhac()}>
      <Send className="mr-1 h-3.5 w-3.5" /> {daChep ? "Đã chép" : "Nhắc khách"}
    </Button>
  );
}

function DongViec({ item, onLamMoi }: { item: ViecHomNayItem; onLamMoi: () => Promise<void> }) {
  const [now] = useState(() => new Date());
  const [dangXuLy, setDangXuLy] = useState(false);
  const han = nhanHanViec(item, now);

  async function chuyenChinh() {
    setDangXuLy(true);
    try {
      const res = await fetch(`/api/admin/galleries/${item.id}/confirm`, { method: "POST" });
      if (res.ok) await onLamMoi();
    } finally {
      setDangXuLy(false);
    }
  }

  const IconHan = item.dueAt && new Date(item.dueAt).toDateString() !== now.toDateString() ? CalendarClock : Clock;

  // BB-313 (ảnh chụp app thật, Đợt 9, mục 1) — dòng ĐẬM chính của "Việc hôm
  // nay" trước đây LUÔN in `item.title` (thường là mã hợp đồng), kể cả khi
  // đã biết tên bé/tên khách — mã lại đứng vai trò nổi bật nhất, tên bé chỉ
  // nằm ở dòng phụ nhỏ bên dưới (`dongPhuViec`). Đảo lại đúng luật: tên đứng
  // trước, mã hợp đồng chỉ dùng khi không còn tên nào — và khi đó thêm
  // `tabular-nums` cho đúng luật phông (mã số không dùng chữ kiểu tự do).
  const { tieuDe, laMaHopDong } = tinhTieuDeBoAnhQuanTri({
    packageName: item.packageName,
    babyNickname: item.babyNickname,
    babyFullName: item.babyFullName,
    customerName: item.customerName,
    duPhong: item.title,
  });

  return (
    <li className="flex items-center gap-3 border-t border-[var(--bb-border)] px-4 py-3 first:border-t-0 sm:px-6">
      <AnhBiaViec coverPhotoId={item.coverPhotoId} title={tieuDe} />
      <Link href={`/admin/galleries/${encodeURIComponent(item.id)}`} className="min-w-0 flex-1 hover:opacity-80">
        <p className={`truncate text-sm font-medium text-[var(--bb-fg)]${laMaHopDong ? " tabular-nums" : ""}`}>
          {tieuDe}
        </p>
        <p className="truncate text-xs text-[var(--bb-fg-muted)]">{dongPhuViec(item)}</p>
      </Link>
      <span
        className={
          han.tre
            ? "flex shrink-0 items-center gap-1 text-xs font-medium tabular-nums text-[var(--bb-danger)]"
            : "flex shrink-0 items-center gap-1 text-xs tabular-nums text-[var(--bb-fg)]"
        }
      >
        <IconHan className="h-3.5 w-3.5" aria-hidden="true" />
        {han.text}
      </span>
      <NutLamNhanhViec item={item} dangXuLy={dangXuLy} onChuyenChinh={() => void chuyenChinh()} />
    </li>
  );
}

/**
 * Khối "Việc hôm nay" (BB-303, bang-dieu-khien.html) — nhóm Đã trễ hạn / Hôm
 * nay / Ngày mai, MỖI DÒNG có ảnh bìa + nút làm nhanh theo trạng thái.
 *
 * KHÁC "Cần xử lý ngay" ở trên: khối đó gộp SỐ LƯỢNG theo loại vấn đề (dùng
 * chung công thức với huy hiệu sidebar, BB-283 — không đụng). Khối này liệt
 * kê TỪNG BỘ ẢNH theo hạn, phục vụ câu hỏi khác: "hôm nay phải làm gì, theo
 * thứ tự nào".
 */
function ViecHomNayCard({ items, onLamMoi }: { items: ViecHomNayItem[]; onLamMoi: () => Promise<void> }) {
  // BB-308 — chip lọc "Tất cả / Nhắc khách / Duyệt & giao", có số đếm. Đếm
  // trên TOÀN BỘ `items` (trước khi lọc theo hạn) để số trên chip không đổi
  // khi người dùng chuyển chip qua lại.
  const [locChip, setLocChip] = useState<"tat_ca" | NhomThaoTacViec>("tat_ca");
  const soNhacKhach = items.filter((i) => nhomThaoTacViec(i) === "nhac_khach").length;
  const soDuyetGiao = items.length - soNhacKhach;
  const itemsLoc =
    locChip === "tat_ca" ? items : items.filter((i) => nhomThaoTacViec(i) === locChip);

  const xep = xepViecHomNay(itemsLoc);
  const tongSo = xep.quaHan.length + xep.homNay.length + xep.ngayMai.length;

  return (
    <Card className="flex flex-col overflow-hidden">
      <CardHeader>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <CardTitle className={CARD_TITLE_CLASS}>Việc hôm nay</CardTitle>
          <span className="text-xs text-[var(--bb-fg-muted)]">xếp theo hạn, việc trễ lên đầu</span>
        </div>
        <Tabs value={locChip} onValueChange={(v) => setLocChip(v as "tat_ca" | NhomThaoTacViec)} className="mt-2">
          {/* `TabsTrigger` gốc không gắn `data-state` (chỉ đổi className theo
              `aria-selected` nội bộ) nên so trực tiếp `locChip` ở đây, không
              dùng biến thể `data-[state=active]:` (sẽ không bao giờ khớp). */}
          <TabsList className="h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
            <TabsTrigger
              value="tat_ca"
              className={
                "h-8 min-h-0 rounded-full border border-[var(--bb-border)] px-3 py-1 text-xs shadow-none " +
                (locChip === "tat_ca" ? "bg-[var(--bb-fg)] text-[var(--bb-bg)]" : "bg-transparent")
              }
            >
              Tất cả <span className="ml-1 tabular-nums">{items.length}</span>
            </TabsTrigger>
            <TabsTrigger
              value="nhac_khach"
              className={
                "h-8 min-h-0 rounded-full border border-[var(--bb-border)] px-3 py-1 text-xs shadow-none " +
                (locChip === "nhac_khach" ? "bg-[var(--bb-fg)] text-[var(--bb-bg)]" : "bg-transparent")
              }
            >
              Nhắc khách <span className="ml-1 tabular-nums">{soNhacKhach}</span>
            </TabsTrigger>
            <TabsTrigger
              value="duyet_giao"
              className={
                "h-8 min-h-0 rounded-full border border-[var(--bb-border)] px-3 py-1 text-xs shadow-none " +
                (locChip === "duyet_giao" ? "bg-[var(--bb-fg)] text-[var(--bb-bg)]" : "bg-transparent")
              }
            >
              Duyệt &amp; giao <span className="ml-1 tabular-nums">{soDuyetGiao}</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent className="p-0">
        {tongSo === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-center text-[var(--bb-fg-muted)]">
            <CheckCircle2 className="h-10 w-10 text-emerald-500/50" />
            <p className="text-sm">
              {/* BB-308 — items.length > 0 nhưng itemsLoc rỗng nghĩa là chỉ đang
                  lọc hết theo chip, không phải "hết việc" — hai câu khác nghĩa
                  nhau, không dùng chung một câu. */}
              {items.length > 0
                ? "Không có việc nào thuộc nhóm đang lọc."
                : "Không có việc nào cần làm hôm nay hoặc ngày mai."}
            </p>
          </div>
        ) : (
          <>
            {xep.quaHan.length > 0 && (
              <>
                <div className="flex h-8 items-center gap-2 bg-[var(--bb-surface-2)] px-4 text-[10.5px] uppercase tracking-wide sm:px-6">
                  <span className="font-medium text-[var(--bb-danger)]">Đã trễ hạn</span>
                  <span className="tabular-nums text-[var(--bb-fg-muted)]">{xep.quaHan.length}</span>
                </div>
                <ul>
                  {xep.quaHan.map((item) => (
                    <DongViec key={item.id} item={item} onLamMoi={onLamMoi} />
                  ))}
                </ul>
              </>
            )}
            {xep.homNay.length > 0 && (
              <>
                <div className="flex h-8 items-center gap-2 bg-[var(--bb-surface-2)] px-4 text-[10.5px] uppercase tracking-wide sm:px-6">
                  <span className="font-medium text-[var(--bb-fg)]">Hôm nay</span>
                  <span className="tabular-nums text-[var(--bb-fg-muted)]">{xep.homNay.length}</span>
                </div>
                <ul>
                  {xep.homNay.map((item) => (
                    <DongViec key={item.id} item={item} onLamMoi={onLamMoi} />
                  ))}
                </ul>
              </>
            )}
            {xep.ngayMai.length > 0 && (
              <>
                <div className="flex h-8 items-center gap-2 bg-[var(--bb-surface-2)] px-4 text-[10.5px] uppercase tracking-wide sm:px-6">
                  <span className="font-medium text-[var(--bb-fg)]">Ngày mai</span>
                  <span className="tabular-nums text-[var(--bb-fg-muted)]">{xep.ngayMai.length}</span>
                </div>
                <ul>
                  {xep.ngayMai.map((item) => (
                    <DongViec key={item.id} item={item} onLamMoi={onLamMoi} />
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// BB-303 (bản vẽ BB-301) — "Mua thêm · 7 ngày qua" + "Theo chi nhánh"
// ---------------------------------------------------------------------------

const TEN_THU_NGAN = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] as const;

function MuaThem7NgayCard({ data }: { data: MuaThem7NgayData }) {
  const coDon = data.soDon > 0;
  const maxNgay = Math.max(1, ...data.theoNgay.map((d) => d.tong));
  const homNayStr = data.theoNgay.length > 0 ? data.theoNgay[data.theoNgay.length - 1]!.ngay : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className={CARD_TITLE_CLASS}>Mua thêm · 7 ngày qua</CardTitle>
          {data.tu && data.den && (
            <span className="whitespace-nowrap text-xs text-[var(--bb-fg-muted)]">
              {data.tu.split("-").reverse().slice(0, 2).join("/")} – {data.den.split("-").reverse().slice(0, 2).join("/")}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!coDon ? (
          <p className="text-sm text-[var(--bb-fg-muted)]">Chưa có đơn mua thêm nào trong 7 ngày qua.</p>
        ) : (
          <>
            <div className="flex items-end gap-1.5">
              <span className="bb-so text-[32px]">
                {new Intl.NumberFormat("vi-VN").format(data.tongTien)}
                <small className="ml-1 text-[13px] font-normal text-[var(--bb-fg-muted)]">₫</small>
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--bb-fg-muted)]">
              {data.chenhLechPhanTram !== null && (
                <span
                  className={
                    data.chenhLechPhanTram >= 0
                      ? "inline-flex items-center gap-0.5 font-medium text-[var(--bb-accent)]"
                      : "inline-flex items-center gap-0.5 font-medium text-[var(--bb-fg-muted)]"
                  }
                >
                  {data.chenhLechPhanTram >= 0 ? (
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {Math.abs(Math.round(data.chenhLechPhanTram))}%
                </span>
              )}
              <span>so với 7 ngày trước · {data.soDon} đơn từ {data.soGiaDinh} gia đình</span>
            </div>

            {/* Biểu đồ mini 7 cột */}
            <div className="mt-4 flex h-16 items-end gap-1.5">
              {data.theoNgay.map((d) => {
                const caoPhanTram = Math.max(4, (d.tong / maxNgay) * 100);
                const laHomNay = d.ngay === homNayStr;
                const laDinh = d.tong === maxNgay && d.tong > 0;
                return (
                  <div
                    key={d.ngay}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${caoPhanTram}%`,
                      background: laHomNay ? "var(--bb-fg)" : laDinh ? "var(--bb-moss, var(--bb-accent))" : "#E4D9CC",
                    }}
                    title={`${d.ngay}: ${new Intl.NumberFormat("vi-VN").format(d.tong)} ₫`}
                  />
                );
              })}
            </div>
            <div className="mt-1.5 flex gap-1.5 text-[11px] text-[var(--bb-fg-muted)]">
              {data.theoNgay.map((d) => (
                <span
                  key={d.ngay}
                  className={d.ngay === homNayStr ? "flex-1 text-center font-medium text-[var(--bb-fg)]" : "flex-1 text-center"}
                >
                  {d.ngay === homNayStr ? "Nay" : TEN_THU_NGAN[new Date(d.ngay).getDay()]}
                </span>
              ))}
            </div>

            {/* Cơ cấu theo nhóm sản phẩm */}
            {data.coCau.length > 0 && (
              <>
                <div className="mt-4 flex h-2 overflow-hidden rounded-full">
                  {THU_TU_HIEN_THI_MUA_THEM.filter((n) => data.coCau.some((c) => c.nhom === n)).map((n) => {
                    const c = data.coCau.find((x) => x.nhom === n)!;
                    const rong = Math.max(2, (c.tongTien / data.tongTien) * 100);
                    return (
                      <div
                        key={n}
                        style={{ width: `${rong}%`, background: MAU_CO_CAU_MUA_THEM[n] }}
                        title={`${c.ten}: ${new Intl.NumberFormat("vi-VN").format(c.tongTien)} ₫`}
                      />
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-col gap-2">
                  {data.coCau.map((c) => (
                    <div key={c.nhom} className="flex items-center gap-2 text-sm">
                      <i
                        aria-hidden="true"
                        className="block h-2.5 w-2.5 shrink-0 rounded-[3px]"
                        style={{ background: MAU_CO_CAU_MUA_THEM[c.nhom] }}
                      />
                      <span>{c.ten}</span>
                      <span className="text-xs text-[var(--bb-fg-muted)]">{c.soMon} món</span>
                      <span className="ml-auto bb-so text-sm">
                        {new Intl.NumberFormat("vi-VN").format(c.tongTien)} ₫
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TheoChiNhanhMuaThemCard({ items }: { items: ChiNhanhMuaThemItem[] }) {
  const maxTien = Math.max(1, ...items.map((i) => i.tongTien));
  return (
    <Card>
      <CardHeader>
        <div className="flex items-baseline justify-between gap-2">
          <CardTitle className={CARD_TITLE_CLASS}>Theo chi nhánh</CardTitle>
          <Link href="/admin/bao-cao" className="text-xs text-[var(--bb-fg)] underline underline-offset-2">
            Mở báo cáo
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--bb-fg-muted)]">Chưa có tiền mua thêm nào trong 7 ngày qua.</p>
        ) : (
          items.map((b) => (
            <div key={b.branchId} className="flex items-center gap-3 text-sm">
              <span className="w-28 shrink-0 truncate text-[var(--bb-fg-muted)]" title={b.branchName}>
                {b.branchName}
              </span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--bb-surface-2)]">
                <div
                  className="h-full rounded-full bg-[var(--bb-fg)]"
                  style={{ width: `${Math.max(2, (b.tongTien / maxTien) * 100)}%` }}
                />
              </div>
              <span className="bb-so w-24 shrink-0 text-right text-sm">
                {new Intl.NumberFormat("vi-VN").format(b.tongTien)} ₫
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
