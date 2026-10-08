"use client";

/**
 * BB-368 — khối "Link app" trên màn chi tiết bộ ảnh, cho bộ CÓ khách.
 *
 * Anh chốt 06/10:
 *   - Khách CHƯA có link gia đình → nút chính "Tạo link gia đình" (gọi API
 *     BB-334A `POST /api/admin/customers/<id>/link-gia-dinh`, cùng quyền). Tạo
 *     xong hiện ngay link màn con của bộ này `…/k/<mã>/<n>`.
 *   - Khách ĐÃ có → bộ này là "màn con" `/k/<mã>/<n>` của trang gia đình: hiện
 *     link màn con + Chép link, Chép tin nhắn, Nhắn khách, và một dòng dẫn sang
 *     trang khách hàng để đổi/thu hồi.
 *   - KHÔNG còn nút tạo link theo bộ (máy chủ cũng chặn: share-link trả 409).
 *     Link cũ theo bộ còn mở được thì chỉ hiện một dòng nhỏ + phần xem link cũ
 *     (`slotLinkCu`, giữ nguyên chức năng quản lý link cũ của màn này).
 *
 * Hai lớp như `khoi-link-gia-dinh.tsx`: `KhoiLinkBoAnhGiaDinhView` thuần theo
 * props (phép thử dựng bằng `renderToStaticMarkup`, không giả lập hook), và
 * `KhoiLinkBoAnhGiaDinh` giữ trạng thái + gọi API.
 */

import React from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronRight, Copy, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NutNhanKhach } from "./nut-nhan-khach";
import { vi } from "@/i18n/vi";
import {
  diaChiManConHienThi,
  dien,
  docLinkGiaDinhCuaBo,
  taoLinkGiaDinh,
  tinNhanMauManCon,
  type LinkGiaDinhCuaBo,
} from "@/lib/utils/link-gia-dinh-nhan-vien";

const T = vi.admin.linkBoAnhGiaDinh;

export interface KhoiLinkBoAnhGiaDinhViewProps {
  du: LinkGiaDinhCuaBo & { customerId: string };
  /** Địa chỉ đầy đủ của màn con (null: chưa có link, hoặc không đọc lại được). */
  diaChi: string | null;
  /** Link gia đình vừa tạo trong phiên này → tin nhắn mẫu có câu giới thiệu. */
  vuaTao: boolean;
  dangTao: boolean;
  thongBao: { loai: "ok" | "loi" | "canh-bao"; chu: string } | null;
  daChep: "link" | "tin" | null;
  chatUrl?: string | null;
  /** Phần xem / quản lý link cũ theo bộ (giữ nguyên chức năng cũ). */
  slotLinkCu?: React.ReactNode;
  onTao: () => void;
  onChepLink: () => void;
  onChepTinNhan: () => void;
}

export function KhoiLinkBoAnhGiaDinhView(p: KhoiLinkBoAnhGiaDinhViewProps) {
  const link = p.du.linkGiaDinh;
  const tinNhan = p.diaChi ? tinNhanMauManCon(p.diaChi, { linkMoi: p.vuaTao }) : null;

  return (
    <div className="mt-2 flex flex-col gap-3" data-testid="khoi-link-bo-anh-gia-dinh" data-co-link={link ? "1" : "0"}>
      {!link && (
        <div className="flex flex-col gap-2" data-testid="link-bo-anh-chua-co">
          <p className="text-sm font-medium">{T.chuaCo}</p>
          <p className="text-sm text-[var(--bb-fg-muted)]">{T.chuaCoMoTa}</p>
          <div>
            <Button
              type="button"
              variant="muc"
              size="sm"
              onClick={p.onTao}
              disabled={p.dangTao}
              data-testid="nut-tao-link-gia-dinh-bo"
            >
              <Link2 aria-hidden="true" />
              {p.dangTao ? T.dangTao : T.taoLink}
            </Button>
          </div>
        </div>
      )}

      {link && (
        <div className="flex flex-col gap-3" data-testid="link-bo-anh-co-link">
          <p className="text-sm text-[var(--bb-fg-muted)]">
            {T.moTa}
            {p.du.soThuTu ? (
              <>
                {" "}
                <span className="font-medium text-[var(--bb-fg)]" data-testid="so-thu-tu-man-con">
                  {dien(T.buoiThu, { n: p.du.soThuTu })}
                </span>
              </>
            ) : null}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              aria-label={T.nhanOLink}
              data-testid="o-link-man-con"
              value={p.diaChi ?? ""}
              placeholder={p.diaChi ? undefined : T.khongDocLaiDuoc}
              onFocus={(e) => e.currentTarget.select()}
              className="h-10 min-w-0 flex-1 basis-56 rounded-[var(--bb-radius-sm)] border border-[var(--bb-border)] bg-[var(--bb-bg)] px-3 font-mono text-xs"
            />
            <Button
              type="button"
              variant="muc"
              size="sm"
              onClick={p.onChepLink}
              disabled={!p.diaChi}
              data-testid="nut-chep-link-man-con"
            >
              {p.daChep === "link" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {p.daChep === "link" ? T.daChepLink : T.chepLink}
            </Button>
          </div>
          {!p.diaChi && (
            <p className="text-sm text-[var(--bb-warning)]" data-testid="link-man-con-khong-doc-lai">
              {T.khongDocLaiDuoc}
            </p>
          )}

          {!p.du.coAnh ? (
            <p
              role="status"
              data-testid="canh-bao-bo-chua-co-anh"
              className="flex items-start gap-2 rounded-[var(--bb-radius-sm)] bg-[var(--bb-warning)]/15 px-3 py-2 text-sm"
            >
              <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
              {T.boChuaCoAnh}
            </p>
          ) : !p.du.hienVoiGiaDinh ? (
            <p role="status" data-testid="canh-bao-bo-dang-an" className="rounded-[var(--bb-radius-sm)] bg-[var(--bb-warning)]/15 px-3 py-2 text-sm">
              {T.boDangAn}
            </p>
          ) : null}

          {tinNhan && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--bb-fg-muted)]">{T.tinNhanMau}</p>
              <p
                className="mt-1 whitespace-pre-line [overflow-wrap:anywhere] rounded-[var(--bb-radius-sm)] border border-dashed border-[var(--bb-border)] bg-[var(--bb-bg)] p-3 text-sm"
                data-testid="tin-nhan-mau-man-con"
              >
                {tinNhan}
              </p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={p.onChepTinNhan}
              disabled={!tinNhan}
              data-testid="nut-chep-tin-nhan-man-con"
            >
              {p.daChep === "tin" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {p.daChep === "tin" ? T.daChepTinNhan : T.chepTinNhan}
            </Button>
            <NutNhanKhach url={p.chatUrl} anKhiTrong />
          </div>

          <Link
            href={`/admin/customers/${p.du.customerId}`}
            data-testid="link-sang-trang-khach"
            className="text-xs text-[var(--bb-fg-muted)] underline underline-offset-2 hover:text-[var(--bb-fg)]"
          >
            {T.sangTrangKhach} →
          </Link>
        </div>
      )}

      {p.thongBao && (
        <p
          role={p.thongBao.loai === "loi" ? "alert" : "status"}
          data-testid="link-bo-anh-thong-bao"
          data-loai={p.thongBao.loai}
          className={`rounded-[var(--bb-radius-sm)] px-3 py-2 text-sm ${
            p.thongBao.loai === "ok"
              ? "bg-[var(--bb-success)]/12"
              : p.thongBao.loai === "loi"
                ? "bg-[var(--bb-danger)]/10 text-[var(--bb-danger)]"
                : "bg-[var(--bb-warning)]/15"
          }`}
        >
          {p.thongBao.chu}
        </p>
      )}

      {/* BB-372 — khách ĐÃ có link gia đình thì link cũ theo bộ (`/g/…`) chỉ còn là MỘT dòng thu gọn,
          đóng sẵn. Địa chỉ link cũ nằm trong phần mở rộng (`slotLinkCu`) — không nổi bật ở đây để nhân
          viên khỏi tưởng đó là link cần gửi. Chưa có link gia đình thì link cũ vẫn là link đang dùng
          nên hiện như trước. */}
      {p.du.soLinkCuConSong > 0 && link && (
        <details
          className="group text-xs text-[var(--bb-fg-muted)]"
          data-testid="link-cu-bo-anh"
          data-thu-gon="1"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 rounded-[var(--bb-radius-sm)] px-1 py-1 hover:text-[var(--bb-fg)] [&::-webkit-details-marker]:hidden">
            <ChevronRight aria-hidden="true" className="h-3.5 w-3.5 shrink-0 transition-transform group-open:rotate-90" />
            <span data-testid="link-cu-bo-con-song">{dien(T.linkCu, { n: p.du.soLinkCuConSong })}</span>
          </summary>
          <div className="mt-1 rounded-[var(--bb-radius-sm)] bg-[var(--bb-bg)] p-3 text-sm text-[var(--bb-fg)]">
            <p className="text-xs text-[var(--bb-fg-muted)]">{T.linkCuMoTa}</p>
            {p.slotLinkCu}
          </div>
        </details>
      )}
      {p.du.soLinkCuConSong > 0 && !link && (
        <details className="rounded-[var(--bb-radius-sm)] bg-[var(--bb-bg)] p-3 text-sm" data-testid="link-cu-bo-anh">
          <summary className="cursor-pointer">
            <span className="font-medium" data-testid="link-cu-bo-con-song">
              {dien(T.linkCu, { n: p.du.soLinkCuConSong })}
            </span>
            <span className="ml-1 text-xs text-[var(--bb-fg-muted)]">· {T.xemLinkCu}</span>
          </summary>
          <p className="mt-1 text-xs text-[var(--bb-fg-muted)]">{T.linkCuMoTa}</p>
          {p.slotLinkCu}
        </details>
      )}
    </div>
  );
}

/**
 * Bộ có khách → khối link gia đình; bộ KHÔNG có khách (hiếm) hoặc vai không có
 * quyền gửi link → `luongCu()` (luồng link theo bộ y như trước).
 */
export function KhoiLinkBoAnhGiaDinh({
  galleryId,
  photoCount,
  chatUrl,
  slotLinkCu,
  luongCu,
}: {
  galleryId: string;
  /** Đổi số ảnh (vừa đồng bộ xong) thì đọc lại để cảnh báo "chưa có ảnh" tự tắt. */
  photoCount: number;
  chatUrl?: string | null;
  slotLinkCu?: React.ReactNode;
  luongCu: () => React.ReactNode;
}) {
  const [du, setDu] = React.useState<LinkGiaDinhCuaBo | null>(null);
  const [trangThai, setTrangThai] = React.useState<"dang-tai" | "xong" | "loi" | "khong-quyen">("dang-tai");
  const [dangTao, setDangTao] = React.useState(false);
  const [vuaTao, setVuaTao] = React.useState(false);
  const [thongBao, setThongBao] = React.useState<KhoiLinkBoAnhGiaDinhViewProps["thongBao"]>(null);
  const [daChep, setDaChep] = React.useState<"link" | "tin" | null>(null);
  const [goc, setGoc] = React.useState<string | null>(null);
  const loiChuoi = React.useMemo(() => ({ matKetNoi: T.matKetNoi, chung: T.loiChung }), []);

  const tai = React.useCallback(async () => {
    const r = await docLinkGiaDinhCuaBo(galleryId, loiChuoi);
    if (r.ok) {
      setDu(r.data);
      setTrangThai("xong");
    } else {
      setTrangThai(r.ma === "FORBIDDEN" ? "khong-quyen" : "loi");
    }
  }, [galleryId, loiChuoi]);

  React.useEffect(() => {
    setGoc(window.location.origin);
  }, []);

  React.useEffect(() => {
    void tai();
  }, [tai, photoCount]);

  React.useEffect(() => {
    setVuaTao(false);
    setThongBao(null);
  }, [galleryId]);

  if (trangThai === "dang-tai") {
    return (
      <p className="mt-2 text-sm text-[var(--bb-fg-muted)]" data-testid="link-bo-anh-dang-tai">
        {T.dangTai}
      </p>
    );
  }
  if (trangThai === "khong-quyen") return <>{luongCu()}</>;
  if (trangThai === "loi" || !du) {
    return (
      <p className="mt-2 text-sm text-[var(--bb-danger)]" role="alert" data-testid="link-bo-anh-loi-tai">
        {T.loiTai}
      </p>
    );
  }
  if (!du.customerId) return <>{luongCu()}</>;

  const diaChi = diaChiManConHienThi(du.linkGiaDinh, goc);

  async function chep(chu: string | null, loai: "link" | "tin") {
    if (!chu) return;
    try {
      await navigator.clipboard.writeText(chu);
      setDaChep(loai);
      window.setTimeout(() => setDaChep(null), 2000);
    } catch {
      setThongBao({ loai: "canh-bao", chu: T.khongChepDuoc });
      document.querySelector<HTMLInputElement>('[data-testid="o-link-man-con"]')?.select();
    }
  }

  async function tao() {
    if (!du?.customerId) return;
    setThongBao(null);
    setDangTao(true);
    const r = await taoLinkGiaDinh(du.customerId, loiChuoi);
    if (r.ok) {
      setVuaTao(true);
      setThongBao({ loai: "ok", chu: T.daTao });
    } else {
      setThongBao({ loai: "loi", chu: r.loi });
    }
    await tai();
    setDangTao(false);
  }

  return (
    <KhoiLinkBoAnhGiaDinhView
      du={{ ...du, customerId: du.customerId }}
      diaChi={diaChi}
      vuaTao={vuaTao}
      dangTao={dangTao}
      thongBao={thongBao}
      daChep={daChep}
      chatUrl={chatUrl}
      slotLinkCu={slotLinkCu}
      onTao={() => void tao()}
      onChepLink={() => void chep(diaChi, "link")}
      onChepTinNhan={() => void chep(diaChi ? tinNhanMauManCon(diaChi, { linkMoi: vuaTao }) : null, "tin")}
    />
  );
}
