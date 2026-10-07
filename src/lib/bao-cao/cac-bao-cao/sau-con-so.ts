/**
 * BB-380 — "Sáu con số điều hành" (Bản yêu cầu P1). Dải số ở Bàn làm việc gọi
 * chính báo cáo này qua `/api/admin/bao-cao/sau-con-so` — cùng khung, cùng lọc
 * chi nhánh theo vai ở route, không có API riêng.
 *
 * Định nghĩa từng số: `src/lib/bao-cao/dieu-hanh/cong-thuc.ts`.
 */
import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { docNguyenLieu, type NguyenLieuDieuHanh } from "../dieu-hanh/nguyen-lieu";
import {
  tinhTiLeMoLink,
  tinhTrungViNgayGuiDenChot,
  tinhTiLeChotTrong7Ngay,
  tinhAnhChonThemMoiBo,
  tinhDoanhThuMuaThemMoiBo,
  tinhTiLeTaiTruocChot,
} from "../dieu-hanh/cong-thuc";
import { theSo, xemDuocTien, CHU_AN_TIEN } from "../dieu-hanh/chung";

export interface SauSo {
  moLink: number | null;
  guiDenChot: number | null;
  chot7Ngay: number | null;
  anhThem: number | null;
  doanhThuMoiBo: number | null;
  taiTruocChot: number | null;
  /** Mẫu số để hiện "trên N bộ". */
  mau: { gui: number; chot: number; chot7: number; tai: number | null };
}

export function tinhSauSo(nl: NguyenLieuDieuHanh, now: Date): SauSo {
  const moLink = tinhTiLeMoLink(nl.boGui);
  const chot7 = tinhTiLeChotTrong7Ngay(nl.boGui, now);
  const tai = tinhTiLeTaiTruocChot(nl.boChot, nl.mocDoTai);
  return {
    moLink: moLink.phanTram,
    guiDenChot: tinhTrungViNgayGuiDenChot(nl.boChot),
    chot7Ngay: chot7.phanTram,
    anhThem: tinhAnhChonThemMoiBo(nl.boChot),
    doanhThuMoiBo: tinhDoanhThuMuaThemMoiBo(nl.boChot),
    taiTruocChot: tai?.phanTram ?? null,
    mau: { gui: moLink.mau, chot: nl.boChot.length, chot7: chot7.mau, tai: tai?.mau ?? null },
  };
}

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  const now = new Date();
  const tien = xemDuocTien(ctx);
  const [nl, nlTruoc] = await Promise.all([
    docNguyenLieu(ctx, ctx.tu, ctx.den, { tien }),
    ctx.kyTruoc ? docNguyenLieu(ctx, ctx.kyTruoc.tu, ctx.kyTruoc.den, { tien }) : Promise.resolve(null),
  ]);
  const s = tinhSauSo(nl, now);
  const t = nlTruoc ? tinhSauSo(nlTruoc, now) : null;
  const co = t !== null;

  const so = [
    theSo("Tỉ lệ mở link", s.moLink, "%", {
      kyTruoc: t?.moLink, coKyTruoc: co, maChiTiet: "pheu-khach",
      giaiThich: `Bộ gửi link trong kỳ đã được ba mẹ mở (${s.mau.gui} bộ gửi).`,
    }),
    theSo("Gửi link đến chốt", s.guiDenChot, "ngày", {
      kyTruoc: t?.guiDenChot, coKyTruoc: co, tangLaTot: false, maChiTiet: "pheu-khach",
      giaiThich: `Thời gian thường gặp (trung vị) từ gửi link tới chốt, trên ${s.mau.chot} bộ chốt trong kỳ.`,
    }),
    theSo("Chốt trong 7 ngày", s.chot7Ngay, "%", {
      kyTruoc: t?.chot7Ngay, coKyTruoc: co, maChiTiet: "pheu-khach",
      giaiThich: `Bộ gửi trong kỳ chốt trong 7 ngày đầu (${s.mau.chot7} bộ đã đủ 7 ngày hoặc đã chốt).`,
    }),
    theSo("Ảnh chọn thêm mỗi bộ", s.anhThem, "ảnh", {
      kyTruoc: t?.anhThem, coKyTruoc: co, maChiTiet: "sales-mua-them",
      giaiThich: "Ảnh vượt hạn mức lúc chốt + ảnh các đợt mua thêm đã xác nhận, trung bình trên bộ chốt trong kỳ.",
    }),
    tien
      ? theSo("Mua thêm mỗi bộ", s.doanhThuMoiBo, "đ", {
          kyTruoc: t?.doanhThuMoiBo, coKyTruoc: co, maChiTiet: "doanh-thu-mua-them",
          giaiThich: "Tổng phát sinh (ảnh + sản phẩm, gồm phần thu qua Lark) chia số bộ chốt trong kỳ.",
        })
      : { nhan: "Mua thêm mỗi bộ", giaTri: "—", giaiThich: CHU_AN_TIEN, maChiTiet: "sales-mua-them", tangLaTot: true },
    theSo("Tải ảnh trước khi chốt", s.taiTruocChot, "%", {
      kyTruoc: t?.taiTruocChot, coKyTruoc: co, maChiTiet: "pheu-khach",
      giaiThich:
        s.mau.tai === null
          ? "Chưa có lượt tải nào được ghi — app bắt đầu đo từ bản BB-380."
          : `Bộ chốt trong kỳ mà ba mẹ đã tải ảnh về máy trước lúc chốt (${s.mau.tai} bộ chốt từ khi bắt đầu đo).`,
    }),
  ];

  return {
    theSo: so,
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Mở link, chốt trong 7 ngày: tính trên bộ GỬI link trong kỳ. Gửi đến chốt, ảnh thêm, mua thêm, tải ảnh: tính trên bộ CHỐT trong kỳ.",
      "\"Đã mở\" = ba mẹ đã vào bộ ảnh (app tạo lượt chọn lúc mở) hoặc link có lượt xem, hoặc đã chốt.",
      "Tải ảnh trước khi chốt: app bắt đầu ghi lượt tải từ bản BB-380; bộ chốt trước đó không vào mẫu.",
    ],
    lienKet: [
      { ma: "pheu-khach", nhan: "Phễu khách" },
      { ma: "sales-mua-them", nhan: "Sales — mua thêm" },
      ...(tien ? [{ ma: "doanh-thu-mua-them", nhan: "Doanh thu mua thêm" }] : []),
      { ma: "van-hanh-chinh-sua", nhan: "Vận hành chỉnh sửa" },
    ],
  };
}

export const sauConSo: DinhNghiaBaoCao = {
  ma: "sau-con-so",
  ten: "Sáu con số điều hành",
  moTa: "Mở link, gửi đến chốt, chốt trong 7 ngày, ảnh chọn thêm, mua thêm mỗi bộ, tải ảnh trước khi chốt — có so kỳ trước.",
  nhom: "van-hanh",
  quyen: "reports:operations",
  boLoc: { kySoSanh: true },
  chay,
};
