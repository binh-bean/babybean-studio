"use client";

import React from "react";
import Link from "next/link";
import { vi } from "@/i18n";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Table2, Kanban, Plus, X, SlidersHorizontal } from "lucide-react";

export interface GalleryFilterState {
  branchId: string;
  status: string;
  photographerId: string;
  dateFrom: string;
  dateTo: string;
  search: string;
  viewMode: "table" | "kanban";
}

export interface GalleryFiltersProps {
  values: GalleryFilterState;
  onChange: (updates: Partial<GalleryFilterState>) => void;
  branches: { id: string; name: string }[];
  photographers: { id: string; name: string }[];
}

export function GalleryFilters({
  values,
  onChange,
  branches,
  photographers,
}: GalleryFiltersProps) {
  /**
   * Ô tìm kiếm mặc định THU LẠI thành một nút kính lúp.
   *
   * Chủ studio chốt 21/09/2026: "cần dùng mới hiện ra, không dùng thì ẩn đi".
   * Ô này rộng 288px và nằm ngay đầu hàng lọc, nên trên điện thoại nó chiếm
   * trọn một dòng mà phần lớn thời gian không ai gõ vào.
   *
   * Một ngoại lệ: đang có chữ trong ô thì ô LUÔN mở. Thu một bộ lọc đang bật
   * vào sau cái nút là giấu mất lý do danh sách đang thiếu bộ ảnh — người dùng
   * sẽ tưởng dữ liệu hỏng.
   */
  const [moRong, setMoRong] = React.useState(false);
  const oRef = React.useRef<HTMLInputElement>(null);
  const dangHien = moRong || values.search.length > 0;

  /**
   * Từ `lg` trở lên thì ô tìm LUÔN mở, và nó GIÃN RA lấp chỗ trống.
   *
   * Chủ studio 22/09/2026: "phần đánh dấu vẫn hở, dồn vào cho gọn và thẩm mỹ".
   * Chỗ hở là khoảng giữa cụm trái (kính lúp + Bộ lọc) và cụm phải
   * (Bảng/Kanban + Tạo mới) — `justify-between` đẩy hai cụm ra hai mép, còn
   * giữa thì trống trơn khoảng 300px.
   *
   * Lấp bằng chính ô tìm kiếm thay vì kéo hai cụm lại gần nhau: kéo sát vào
   * thì chỗ trống chỉ chuyển sang mép phải, mà hàng thẻ bên dưới lại trải hết
   * bề ngang nên trông càng lệch. Trên máy tính có chỗ cho ô tìm, và mở sẵn
   * còn đỡ cho CSKH một cú bấm.
   *
   * Luật thu lại vẫn giữ nguyên dưới `lg` — đó là chỗ chủ studio yêu cầu thu
   * hôm 21/09, và cũng là chỗ ô tìm chiếm trọn một dòng.
   */

  React.useEffect(() => {
    if (moRong) oRef.current?.focus();
  }, [moRong]);

  /**
   * Bốn ô lọc cũng thu lại trên màn hẹp — chủ studio 21/09/2026: "thu tất đi,
   * che hết nửa màn điện thoại rồi".
   *
   * Đo trên máy 375px trước khi sửa: hàng lọc cao 268px trên màn cao 812px,
   * tức một phần ba màn hình chỉ để hiện bốn ô mà phần lớn thời gian để "Tất
   * cả". Người dùng mở màn này ra là để nhìn DANH SÁCH.
   *
   * Từ `lg` trở lên giữ nguyên hàng lọc nằm ngang: ở đó có chỗ, và thu vào chỉ
   * tốn thêm một cú bấm.
   *
   * Con số trên nút là số bộ lọc ĐANG BẬT. Không có nó thì thu vào là giấu mất
   * lý do danh sách đang ngắn — cùng lý do với ô tìm kiếm ở trên.
   */
  const [moBoLoc, setMoBoLoc] = React.useState(false);
  const soBoLocDangBat = [
    values.branchId,
    values.status,
    values.photographerId,
    values.dateFrom,
    values.dateTo,
  ].filter(Boolean).length;

  /*
   * `-top-4` chứ không phải `top-0`.
   *
   * Vùng cuộn (`main`) có `p-4`, mà phần tử `sticky` neo theo **hộp padding**
   * của vùng cuộn chứ không theo mép trên của nó. Với `top-0`, thanh này dừng
   * lại ở 16px dưới mép — và 16px đó là một khe hở: nội dung cuộn qua phía sau
   * vẫn nhìn thấy được, nên trên điện thoại tên bộ ảnh hiện lên NỬA DÒNG phía
   * trên thanh lọc, trông như chữ bị cắt ngang.
   */
  return (
      <div className="sticky -top-4 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-4 bg-[var(--bb-bg)] border-b border-[var(--bb-border)] space-y-3">
      {/* Hàng 1: Tìm kiếm, Bộ lọc nhanh, Toggle Chế độ xem & Nút tạo mới */}
      {/*
        Dưới `lg` KHÔNG dùng `justify-between`: bốn thứ dồn sát nhau về bên
        trái, chỗ trống dồn hết ra mép phải. Đó là cách đọc đúng câu "dồn vào
        cho gọn" — trước đây `justify-between` xé đôi hàng và để một cái hố
        300px ngay giữa. Từ `lg` mới bật lại `justify-between`, vì ở đó ô tìm
        đã giãn ra lấp chỗ và nút Tạo nằm mép phải là đúng chỗ tay hay bấm.

        `lg:flex-nowrap`: ô tìm giãn thì cụm trái chạm đúng mép cụm phải.
        Ô tìm giãn ra lấp chỗ hở, mà giãn thì cụm trái chạm đúng mép cụm
        phải — chỉ lệch nửa điểm ảnh là trình duyệt đẩy cụm Bảng/Kanban
        xuống nằm lẫn với hàng bộ lọc, nhìn như bố cục vỡ. Cấm xuống dòng
        thì ô tìm tự co lại vừa chỗ còn trống.
      */}
      <div className="flex flex-wrap items-center gap-3 lg:flex-nowrap lg:justify-between">
        {/*
          `flex-1 min-w-[280px]` chỉ áp dụng từ `lg`. Trên điện thoại, hai thứ
          đó ép cụm bên trái chiếm trọn một dòng, đẩy cụm Bảng/Kanban xuống dòng
          dưới và dồn sang phải — để lại một khoảng trống to bên trái, nhìn như
          bố cục vỡ.
        */}
        <div className="flex min-w-0 flex-wrap items-center gap-3 lg:flex-1">
          {/* Tìm kiếm Tên bé, Tên khách, SĐT — thu lại khi không dùng */}
          {dangHien ? (
            <div className="relative w-full min-w-0 sm:w-72 lg:w-auto lg:flex-1 lg:min-w-[220px]">
              <Input
                ref={oRef}
                name="search"
                value={values.search}
                onChange={(e) => onChange({ search: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    onChange({ search: "" });
                    setMoRong(false);
                  }
                }}
                onBlur={() => {
                  // Rời ô mà không gõ gì thì thu lại. Có chữ thì giữ nguyên —
                  // xem ghi chú ở đầu hàm.
                  if (values.search.length === 0) setMoRong(false);
                }}
                placeholder={vi.admin.galleries.searchPlaceholder}
                className="pl-9 pr-9"
                aria-label={vi.admin.galleries.searchPlaceholder}
              />
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bb-fg-muted)] pointer-events-none" />
              {values.search.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onChange({ search: "" });
                    setMoRong(false);
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--bb-fg-muted)] hover:text-[var(--bb-fg)]"
                  aria-label={vi.admin.galleries.searchClear}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : (
            <>
              {/*
                Máy tính: ô tìm mở sẵn và giãn ra lấp khoảng hở ở giữa.

                BB-292 vòng 2 — giám đốc báo ô tìm bị ép còn ~70px ở 1440px,
                chữ gõ vào không đọc được: `lg:flex-1` (flex-basis 0%) không
                có sàn, nên khi hàng chật, trình duyệt co ô này gần về 0
                trước khi tính tới việc xuống dòng — `khoi-bo-loc` (chứa các
                ô lọc + hai ô ngày) vẫn còn `flex-wrap` riêng, nên thêm sàn
                `lg:min-w-[220px]` ở đây là đủ: khi không đủ chỗ, phần không
                vừa (hai ô ngày, đứng cuối `khoi-bo-loc`) tự xuống dòng thay
                vì ô tìm bị bóp.
              */}
              <div className="relative hidden min-w-0 lg:block lg:w-auto lg:flex-1 lg:min-w-[220px]">
                <Input
                  name="search"
                  value={values.search}
                  onChange={(e) => onChange({ search: e.target.value })}
                  placeholder={vi.admin.galleries.searchPlaceholder}
                  className="pl-9"
                  aria-label={vi.admin.galleries.searchPlaceholder}
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--bb-fg-muted)] pointer-events-none" />
              </div>

              {/* Điện thoại và máy tính bảng: chỉ một nút kính lúp. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 px-3 lg:hidden"
                onClick={() => setMoRong(true)}
                aria-expanded={false}
                aria-label={vi.admin.galleries.searchOpen}
                title={vi.admin.galleries.searchOpen}
              >
                <Search className="h-4 w-4" />
              </Button>
            </>
          )}

          {/* Nút mở bộ lọc — chỉ có trên màn hẹp */}
          <Button
            type="button"
            variant={soBoLocDangBat > 0 ? "default" : "ghost"}
            size="sm"
            className="h-9 px-2.5 lg:hidden"
            onClick={() => setMoBoLoc((v) => !v)}
            aria-expanded={moBoLoc}
            aria-controls="khoi-bo-loc"
            title={vi.admin.galleries.filterToggle}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {/* Chữ "Bộ lọc" ẩn dưới `sm` để bốn nút nằm gọn trên MỘT hàng ở
                khổ 375px; con số bộ lọc đang bật thì luôn hiện. */}
            <span className="ml-1.5 hidden text-xs sm:inline">
              {vi.admin.galleries.filterToggle}
            </span>
            {soBoLocDangBat > 0 && (
              <span className="ml-1.5 rounded-full bg-[var(--bb-bg)]/30 px-1.5 text-[10px]">
                {soBoLocDangBat}
              </span>
            )}
          </Button>

          <div
            id="khoi-bo-loc"
            className={`${moBoLoc ? "flex" : "hidden"} w-full flex-wrap items-center gap-3 lg:flex lg:w-auto`}
          >
          {/* Lọc chi nhánh */}
          <div className="w-full sm:w-auto">
            <Select
              name="branchId"
              value={values.branchId}
              onChange={(e) => onChange({ branchId: e.target.value })}
              className="w-full sm:w-[170px]"
              aria-label={vi.admin.galleries.filterBranch}
            >
              <option value="">{vi.admin.galleries.filterBranch}: Tất cả</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Lọc trạng thái */}
          <div className="w-full sm:w-auto">
            <Select
              name="status"
              value={values.status}
              onChange={(e) => onChange({ status: e.target.value })}
              className="w-full sm:w-[190px]"
              aria-label={vi.admin.galleries.filterStatus}
            >
              <option value="">{vi.admin.galleries.filterStatus}: Tất cả</option>
              <option value="draft">Bản nháp</option>
              <option value="syncing">Đang đồng bộ</option>
              <option value="sync_error">Lỗi tải ảnh</option>
              <option value="ready">Sẵn sàng</option>
              <option value="in_review">Chờ khách chọn</option>
              <option value="submitted">Đã chốt</option>
              <option value="in_retouch">Đang retouch</option>
              <option value="delivered">Đã giao</option>
              <option value="expired">Quá hạn</option>
              <option value="archived">Lưu trữ</option>
            </Select>
          </div>

          {/* Lọc người phụ trách (Photographer) */}
          <div className="w-full sm:w-auto">
            <Select
              name="photographerId"
              value={values.photographerId}
              onChange={(e) => onChange({ photographerId: e.target.value })}
              className="w-full sm:w-[170px]"
              aria-label={vi.admin.galleries.filterPhotographer}
            >
              <option value="">{vi.admin.galleries.filterPhotographer}: Tất cả</option>
              {photographers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>

          {/* Lọc khoảng ngày chụp — BB-290 (#34): `<input type="date">` gõ
              tay số vẫn theo mm/dd/yyyy của Chromium bất kể `lang` (đã thử ở
              lượt 1, chụp màn hình thật vẫn ra mm/dd/yyyy — Chromium chỉ đổi
              CÁCH ĐỌC ngày tháng qua bàn phím, không đổi thứ tự ô nhập).
              `ONgayVN` là ô chữ tự viết, ÉP dd/mm/yyyy thật sự, tự chèn "/"
              khi gõ, và vẫn phát ra đúng chuỗi ISO (yyyy-mm-dd) mà bộ lọc
              cần. */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto">
            <ONgayVN
              value={values.dateFrom}
              onChange={(v) => onChange({ dateFrom: v })}
              ariaLabel="Từ ngày chụp (dd/mm/yyyy)"
              className="w-full sm:w-[120px]"
            />
            <span className="text-[var(--bb-fg-muted)] text-xs">–</span>
            <ONgayVN
              value={values.dateTo}
              onChange={(v) => onChange({ dateTo: v })}
              ariaLabel="Đến ngày chụp (dd/mm/yyyy)"
              className="w-full sm:w-[120px]"
            />
          </div>

          {/* Xoá lọc — BB-290 (#34): gộp bộ lọc còn một hàng thì cần một cách
              nhanh để về lại "Tất cả", thay vì bấm tắt từng ô. */}
          {soBoLocDangBat > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2 text-xs text-[var(--bb-fg-muted)]"
              onClick={() =>
                onChange({ branchId: "", status: "", photographerId: "", dateFrom: "", dateTo: "" })
              }
            >
              <X className="h-3.5 w-3.5 mr-1" /> Xoá lọc
            </Button>
          )}
          </div>
        </div>

        {/* Nút Toggle View & Nút Tạo mới */}
        <div className="flex shrink-0 items-center gap-2 lg:ml-auto lg:gap-3 lg:self-start">
          {/* Segmented control: Bảng vs Kanban */}
          <div className="flex items-center rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-surface-2)] p-0.5">
            <Button
              type="button"
              variant={values.viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChange({ viewMode: "table" })}
              className="h-8 px-3 text-xs"
              aria-label="Xem dạng bảng"
            >
              <Table2 className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Bảng</span>
            </Button>
            <Button
              type="button"
              variant={values.viewMode === "kanban" ? "default" : "ghost"}
              size="sm"
              onClick={() => onChange({ viewMode: "kanban" })}
              className="h-8 px-3 text-xs"
              aria-label="Xem dạng Kanban"
            >
              <Kanban className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Bảng việc</span>
            </Button>
          </div>

          {/*
            Trên điện thoại nút này chỉ còn dấu cộng: đo ở 375px, cả cụm
            Bảng/Kanban + nút chữ đầy đủ dài 383px, tức thò 8px khỏi mép phải.
            Chữ vẫn còn cho trình đọc màn hình qua `aria-label`.
          */}
          {/* BB-290 lượt 2: từ `lg`, nút "+ Tạo bộ ảnh" đã có ở PageHeader
              (BoAnhPageHeader, theo quan-tri-bo-anh-bang.png) — giữ nút này
              chỉ để dùng dưới `lg`, tránh hai nút Tạo trùng nhau xếp chồng
              trên màn rộng. */}
          <Link href="/admin/galleries/create" className="lg:hidden">
            <Button
              variant="default"
              className="h-9 px-3 sm:px-4"
              aria-label={vi.admin.galleries.createGalleryCta}
              title={vi.admin.galleries.createGalleryCta}
            >
              <Plus className="h-4 w-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{vi.admin.galleries.createGalleryCta}</span>
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/** "2026-09-27" -> "27/09/2026". Chuỗi rỗng/hỏng thì trả rỗng. */
function isoRaHienThi(iso: string): string {
  const khop = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!khop) return "";
  return `${khop[3]}/${khop[2]}/${khop[1]}`;
}

/**
 * Ô nhập ngày kiểu Việt Nam (dd/mm/yyyy) — BB-290 (#34).
 *
 * `<input type="date">` của trình duyệt luôn nhận số gõ tay theo THỨ TỰ
 * mm/dd/yyyy ở Chromium, bất kể `lang` đặt gì — chỉ đổi cách ĐỌC LẠI ngày đã
 * chọn qua lịch popup, không đổi thứ tự ô khi gõ bàn phím. Ảnh chụp thật ở
 * BB-290 lượt 1 vẫn ra "mm/dd/yyyy". Ô chữ tự viết này ép đúng thứ tự
 * dd/mm/yyyy khi gõ, và phát ra/nhận vào chuỗi ISO `yyyy-mm-dd` — giữ nguyên
 * hợp đồng dữ liệu với `GalleryFilterState`.
 */
function ONgayVN({
  value,
  onChange,
  ariaLabel,
  className,
}: {
  /** Chuỗi ISO `yyyy-mm-dd`, hoặc rỗng. */
  value: string;
  /** Nhận lại chuỗi ISO khi đã gõ đủ và hợp lệ; rỗng khi xoá hết. */
  onChange: (isoValue: string) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [chu, setChu] = React.useState(() => isoRaHienThi(value));

  // Đồng bộ khi bộ lọc đổi từ NGOÀI vào (vd bấm "Xoá lọc") — không ghi đè
  // trong lúc người dùng đang gõ dở (so sánh với giá trị ISO đã phát ra gần
  // nhất qua closure của `xuLyGo`, đơn giản hoá bằng cách chỉ đồng bộ khi
  // `value` đổi và không khớp với những gì ô đang hiện).
  React.useEffect(() => {
    setChu(isoRaHienThi(value));
  }, [value]);

  function xuLyGo(e: React.ChangeEvent<HTMLInputElement>) {
    const so = e.target.value.replace(/\D/g, "").slice(0, 8); // ddmmyyyy
    let hien = so;
    if (so.length > 4) hien = `${so.slice(0, 2)}/${so.slice(2, 4)}/${so.slice(4)}`;
    else if (so.length > 2) hien = `${so.slice(0, 2)}/${so.slice(2)}`;
    setChu(hien);

    if (so.length === 0) {
      onChange("");
      return;
    }
    if (so.length !== 8) return; // chưa gõ đủ — chưa báo lên bộ lọc

    const ngay = Number(so.slice(0, 2));
    const thang = Number(so.slice(2, 4));
    const nam = so.slice(4, 8);
    const iso = `${nam}-${String(thang).padStart(2, "0")}-${String(ngay).padStart(2, "0")}`;
    const d = new Date(iso);
    // Ngày không có thật (31/02…) thì không phát ISO — giữ nguyên bộ lọc cũ,
    // để người dùng sửa tiếp thay vì lặng lẽ nhận một ngày sai.
    if (!Number.isNaN(d.getTime()) && d.getUTCDate() === ngay && d.getUTCMonth() + 1 === thang) {
      onChange(iso);
    }
  }

  return (
    <Input
      type="text"
      inputMode="numeric"
      value={chu}
      onChange={xuLyGo}
      placeholder="dd/mm/yyyy"
      aria-label={ariaLabel}
      title={ariaLabel}
      maxLength={10}
      className={className}
    />
  );
}
