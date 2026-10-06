"use client";

/**
 * BB-372 — khối "Link mời ông bà và người thân" cho NHÂN VIÊN, ở trang khách hàng và
 * màn chi tiết bộ ảnh. CHỈ ĐỌC: ba mẹ tạo link mời trong app của họ; nhân viên chỉ
 * thấy nhãn ba mẹ đặt, ngày tạo, số lần mở, lần cuối, số tim, đã thu hồi chưa, và
 * người được mời có gửi yêu cầu mua thêm không. Không có nút sửa / thu hồi / chép.
 * Không hiện mã đầy đủ (máy chủ chỉ trả 6 ký tự đầu).
 *
 * Hai lớp như `khoi-link-gia-dinh.tsx`: `KhoiLinkMoiNguoiThanView` thuần theo props
 * (phép thử dựng bằng `renderToStaticMarkup`, không giả lập hook) và
 * `KhoiLinkMoiNguoiThan` giữ trạng thái + gọi API.
 */

import React from "react";
import { Badge } from "@/components/ui/badge";
import { CARD_TITLE_CLASS } from "./page-header";
import { vi } from "@/i18n/vi";
import { formatNgayGioVN, formatNgayVN } from "@/lib/utils/dinh-dang";
import {
  dien,
  docLinkMoiCuaBo,
  docLinkMoiCuaKhach,
  type DuLieuLinkMoi,
  type LinkMoiNguoiThan,
} from "@/lib/utils/link-gia-dinh-nhan-vien";

const T = vi.admin.linkMoiNguoiThan;

const KHUNG = "rounded-[var(--bb-radius)] border border-[var(--bb-border)] bg-[var(--bb-surface)] p-4 md:p-5";

export interface KhoiLinkMoiNguoiThanViewProps {
  dangTai: boolean;
  loiTai: boolean;
  du: DuLieuLinkMoi | null;
  /** "bo": số tim / yêu cầu chỉ tính trong bộ ảnh đang xem. */
  phamVi: "khach" | "bo";
}

function TrangThaiLink({ l }: { l: LinkMoiNguoiThan }) {
  if (l.daThuHoi) return <Badge variant="danger">{T.daThuHoi}</Badge>;
  if (l.daHetHan) return <Badge variant="outline">{T.daHetHan}</Badge>;
  return <Badge variant="success">{T.dangMo}</Badge>;
}

export function KhoiLinkMoiNguoiThanView({ dangTai, loiTai, du, phamVi }: KhoiLinkMoiNguoiThanViewProps) {
  const links = du?.links ?? [];
  const soMo = links.filter((l) => l.soLanMo > 0).length;

  return (
    <section className={KHUNG} data-testid="khoi-link-moi-nguoi-than" aria-labelledby="tieu-de-link-moi">
      <h2 id="tieu-de-link-moi" className={CARD_TITLE_CLASS}>
        {T.tieuDe}
      </h2>
      <p className="mt-1 text-sm text-[var(--bb-fg-muted)]">
        {T.moTa}
        {phamVi === "bo" ? ` ${T.moTaBo}` : ""}
      </p>

      {dangTai && (
        <p className="mt-4 text-sm text-[var(--bb-fg-muted)]" data-testid="link-moi-dang-tai">
          {T.dangTai}
        </p>
      )}
      {loiTai && (
        <p className="mt-4 text-sm text-[var(--bb-danger)]" role="alert" data-testid="link-moi-loi-tai">
          {T.loiTai}
        </p>
      )}

      {du && links.length === 0 && (
        <p className="mt-4 text-sm font-medium" data-testid="link-moi-chua-co">
          {T.chuaCo}
        </p>
      )}

      {du && links.length > 0 && (
        <>
          <p className="mt-3 text-sm font-medium" data-testid="link-moi-tom">
            {dien(T.tom, { n: links.length, mo: soMo })}
          </p>
          <ul className="mt-2 divide-y divide-[var(--bb-border)]" data-testid="danh-sach-link-moi">
            {links.map((l) => (
              <li
                key={l.shareLinkId}
                className="flex flex-col gap-1 py-3 text-sm"
                data-testid="dong-link-moi"
                data-thu-hoi={l.daThuHoi ? "1" : "0"}
                data-pham-vi={l.phamVi}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium" data-testid="link-moi-nhan">
                    {l.nhan?.trim() || T.nhanTrong}
                  </span>
                  <TrangThaiLink l={l} />
                  <span className="text-xs text-[var(--bb-fg-muted)]">
                    {l.phamVi === "bo" ? dien(T.phamViBo, { ten: l.tieuDeBo || "—" }) : T.phamViCaNha}
                  </span>
                </div>
                <p className="text-xs text-[var(--bb-fg-muted)]" data-testid="link-moi-so-lan-mo">
                  {[
                    dien(T.taoLuc, { ngay: formatNgayVN(l.taoLuc) }),
                    l.soLanMo > 0
                      ? `${dien(T.soLanMo, { n: l.soLanMo })}${l.moLanCuoi ? `, ${dien(T.moCuoi, { luc: formatNgayGioVN(l.moLanCuoi) })}` : ""}`
                      : T.chuaMo,
                    dien(T.maDau, { ma: l.maDau }),
                  ].join(" · ")}
                </p>
                <p className="text-xs" data-testid="link-moi-tim-yeu-cau">
                  <span data-testid="link-moi-tim">{l.soTim > 0 ? dien(T.soTim, { n: l.soTim }) : T.chuaTim}</span>
                  <span className="text-[var(--bb-fg-muted)]"> · </span>
                  <span data-testid="link-moi-yeu-cau" className={l.soYeuCau > 0 ? "font-medium text-[var(--bb-fg)]" : "text-[var(--bb-fg-muted)]"}>
                    {l.soYeuCau > 0 ? dien(T.yeuCau, { n: l.soYeuCau }) : T.chuaYeuCau}
                  </span>
                </p>
              </li>
            ))}
          </ul>
          {du.chuaApMigration && (
            <p className="mt-2 text-xs text-[var(--bb-warning)]" data-testid="link-moi-chua-ap">
              {T.chuaApMigration}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Trang khách (`khach`) hoặc màn bộ ảnh (`bo`). 403 / lỗi → khối tự ẩn (vai không có quyền xem). */
export function KhoiLinkMoiNguoiThan({ phamVi, id }: { phamVi: "khach" | "bo"; id: string }) {
  const [du, setDu] = React.useState<DuLieuLinkMoi | null>(null);
  const [dangTai, setDangTai] = React.useState(true);
  const [loiTai, setLoiTai] = React.useState(false);
  const [an, setAn] = React.useState(false);
  const loiChuoi = React.useMemo(() => ({ matKetNoi: T.loiTai, chung: T.loiTai }), []);

  React.useEffect(() => {
    let song = true;
    setDangTai(true);
    void (async () => {
      const r = phamVi === "khach" ? await docLinkMoiCuaKhach(id, loiChuoi) : await docLinkMoiCuaBo(id, loiChuoi);
      if (!song) return;
      if (r.ok) {
        setDu(r.data);
        setLoiTai(false);
      } else if (r.ma === "FORBIDDEN") {
        setAn(true);
      } else {
        setLoiTai(true);
      }
      setDangTai(false);
    })();
    return () => {
      song = false;
    };
  }, [phamVi, id, loiChuoi]);

  if (an) return null;
  return <KhoiLinkMoiNguoiThanView dangTai={dangTai} loiTai={loiTai} du={du} phamVi={phamVi} />;
}
