/**
 * BB-380 — "Sales — mua thêm": bộ chốt trong kỳ có mua thêm không, mua bao nhiêu,
 * mua gì nhiều nhất. Mời người thân đã có báo cáo riêng ("Mời người thân", BB-372)
 * — chỉ liên kết sang, không đếm lại ở đây.
 *
 * Vai không có `reports:financial` vẫn xem được tỉ lệ / số lượng; cột tiền hiện "—".
 */
import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { docNguyenLieu } from "../dieu-hanh/nguyen-lieu";
import { tongHopMuaThem, gopSanPhamBanChay, tinhAnhChonThemMoiBo } from "../dieu-hanh/cong-thuc";
import { theSo, xemDuocTien, CHU_AN_TIEN } from "../dieu-hanh/chung";

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  const tien = xemDuocTien(ctx);
  const [nl, nlTruoc] = await Promise.all([
    docNguyenLieu(ctx, ctx.tu, ctx.den, { tien: true, sanPham: true }),
    ctx.kyTruoc ? docNguyenLieu(ctx, ctx.kyTruoc.tu, ctx.kyTruoc.den, { tien: true }) : Promise.resolve(null),
  ]);
  const m = tongHopMuaThem(nl.boChot);
  const mTruoc = nlTruoc ? tongHopMuaThem(nlTruoc.boChot) : null;
  const co = mTruoc !== null;
  const an = (v: number | null) => (tien ? v : null);

  const banChay = gopSanPhamBanChay(nl.sanPham).slice(0, 15);

  const dongChiNhanh = [...nl.tenChiNhanh.entries()].map(([id, ten]) => {
    const cua = nl.boChot.filter((b) => b.branchId === id);
    const t = tongHopMuaThem(cua);
    return [
      ten,
      t.soBo,
      t.soBoCoMua,
      t.tiLeCoMua.phanTram ?? "—",
      tinhAnhChonThemMoiBo(cua) ?? "—",
      tien ? (t.tbTrenBoCoMua ?? "—") : "—",
      tien ? t.tongPhatSinh : "—",
    ];
  });

  return {
    theSo: [
      theSo("Bộ có mua thêm", m.tiLeCoMua.phanTram, "%", {
        kyTruoc: mTruoc?.tiLeCoMua.phanTram, coKyTruoc: co,
        giaiThich: `${m.soBoCoMua} / ${m.soBo} bộ chốt trong kỳ có phát sinh tiền.`,
      }),
      theSo("Ảnh chọn thêm mỗi bộ", tinhAnhChonThemMoiBo(nl.boChot), "ảnh", {
        kyTruoc: nlTruoc ? tinhAnhChonThemMoiBo(nlTruoc.boChot) : null, coKyTruoc: co,
      }),
      tien
        ? theSo("Giá trị mua thêm trung bình", an(m.tbTrenBoCoMua), "đ", {
            kyTruoc: an(mTruoc?.tbTrenBoCoMua ?? null), coKyTruoc: co,
            giaiThich: "Trên các bộ CÓ mua thêm.",
          })
        : { nhan: "Giá trị mua thêm trung bình", giaTri: "—", giaiThich: CHU_AN_TIEN },
      theSo("Sản phẩm bán ra", nl.sanPham.reduce((t, d) => t + d.soLuong, 0), "sản phẩm"),
    ],
    bang: {
      cot: ["Chi nhánh", "Bộ chốt", "Bộ có mua thêm", "% có mua", "Ảnh thêm / bộ", "TB trên bộ có mua (đ)", "Tổng phát sinh (đ)"],
      dong: dongChiNhanh,
    },
    bangPhu: [
      {
        tieuDe: "Sản phẩm bán chạy",
        bang: {
          cot: ["Sản phẩm", "Nhóm", "Số lượng", "Số bộ mua", "Tiền (đ)"],
          dong: banChay.map((s) => [s.ten, s.nhom, s.soLuong, s.soBo, tien ? s.tien : "—"]),
        },
      },
    ],
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Tính trên các bộ CHỐT trong kỳ. \"Có mua thêm\" = bộ có phát sinh tiền (ảnh vượt hạn mức, ảnh mua thêm hoặc sản phẩm, gồm cả phần thu qua Lark).",
      "Sản phẩm bán chạy gồm đợt 1 (lúc chốt) và các đợt mua thêm đã xác nhận.",
      "Đóng góp của link mời người thân xem ở báo cáo \"Mời người thân\".",
      ...(tien ? [] : ["Bạn chưa có quyền xem doanh thu nên cột tiền để trống."]),
    ],
    lienKet: [
      { ma: "moi-nguoi-than", nhan: "Mời người thân" },
      ...(tien ? [{ ma: "doanh-thu-mua-them", nhan: "Doanh thu mua thêm" }] : []),
    ],
  };
}

export const salesMuaThem: DinhNghiaBaoCao = {
  ma: "sales-mua-them",
  ten: "Sales — mua thêm",
  moTa: "Tỉ lệ bộ có mua thêm, giá trị trung bình, sản phẩm bán chạy, theo chi nhánh.",
  nhom: "doanh-thu",
  quyen: "reports:operations",
  boLoc: { kySoSanh: true },
  chay,
};
