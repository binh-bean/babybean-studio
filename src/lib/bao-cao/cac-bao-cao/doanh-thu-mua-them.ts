/**
 * BB-380 — "Doanh thu mua thêm": tiền phát sinh trong app của các bộ CHỐT trong kỳ,
 * theo loại tiền, theo đợt, theo nhóm sản phẩm, theo chi nhánh.
 *
 * Tiền mỗi bộ lấy NGUYÊN từ `layTienCanThuNhieuBo` (tien-can-thu-server.ts):
 *   phát sinh = tongPhaiThu + tienSanPhamQuaLark. Phần sản phẩm thu qua Lark (cờ
 *   `thanh_toan.thu_san_pham_qua_app` tắt, hoặc giỏ chốt trước mốc bật cờ) hiện tách
 *   riêng — không nằm trong "Phải thu" của app.
 * Bảng theo đợt / nhóm sản phẩm là CHI TIẾT dòng hàng (selection_addons đợt 1 +
 * selection_rounds đợt ≥ 2 đã xác nhận) — cùng nguồn mà công thức tiền đọc.
 *
 * Khác báo cáo "Doanh thu phát sinh" (BB-263): báo cáo đó là dòng tiền thu/còn phải
 * thu; báo cáo này trả lời "khách mua thêm gì, bao nhiêu".
 */
import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { docNguyenLieu } from "../dieu-hanh/nguyen-lieu";
import { tongHopMuaThem, gopTheo } from "../dieu-hanh/cong-thuc";
import { theSo } from "../dieu-hanh/chung";

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  const [nl, nlTruoc] = await Promise.all([
    docNguyenLieu(ctx, ctx.tu, ctx.den, { tien: true, sanPham: true }),
    ctx.kyTruoc ? docNguyenLieu(ctx, ctx.kyTruoc.tu, ctx.kyTruoc.den, { tien: true }) : Promise.resolve(null),
  ]);
  const m = tongHopMuaThem(nl.boChot);
  const mTruoc = nlTruoc ? tongHopMuaThem(nlTruoc.boChot) : null;
  const co = mTruoc !== null;

  const theoDot = gopTheo(nl.sanPham, (d) => (d.dot >= 3 ? 3 : d.dot));
  const theoNhom = gopTheo(nl.sanPham, (d) => d.nhom);
  const tenDot = (d: number) => (d === 1 ? "Đợt 1 (lúc chốt)" : d === 2 ? "Đợt 2" : "Đợt 3 trở đi");

  const dongChiNhanh = [...nl.tenChiNhanh.entries()].map(([id, ten]) => {
    const cua = nl.boChot.filter((b) => b.branchId === id);
    const t = tongHopMuaThem(cua);
    return [ten, t.soBo, t.tach.anhVuot, t.tach.anhMuaThem, t.tach.sanPhamTrongApp, t.tach.sanPhamQuaLark, t.tongPhatSinh];
  });

  return {
    theSo: [
      theSo("Tổng phát sinh", m.tongPhatSinh, "đ", { kyTruoc: mTruoc?.tongPhatSinh, coKyTruoc: co }),
      theSo("Ảnh vượt hạn mức", m.tach.anhVuot, "đ", { kyTruoc: mTruoc?.tach.anhVuot, coKyTruoc: co }),
      theSo("Ảnh mua thêm", m.tach.anhMuaThem, "đ", {
        kyTruoc: mTruoc?.tach.anhMuaThem, coKyTruoc: co,
        giaiThich: "Ảnh của các đợt mua thêm + Edit file.",
      }),
      theSo("Sản phẩm thu trong app", m.tach.sanPhamTrongApp, "đ", { kyTruoc: mTruoc?.tach.sanPhamTrongApp, coKyTruoc: co }),
      theSo("Sản phẩm thu qua Lark", m.tach.sanPhamQuaLark, "đ", {
        kyTruoc: mTruoc?.tach.sanPhamQuaLark, coKyTruoc: co,
        giaiThich: "Ảnh in / khung / album thu ngoài app theo cài đặt hiện có.",
      }),
      theSo("Mua thêm mỗi bộ", m.soBo === 0 ? null : Math.round(m.tongPhatSinh / m.soBo), "đ", {
        kyTruoc: mTruoc && mTruoc.soBo > 0 ? Math.round(mTruoc.tongPhatSinh / mTruoc.soBo) : null,
        coKyTruoc: co,
        giaiThich: `Trên ${m.soBo} bộ chốt trong kỳ.`,
      }),
    ],
    bang: {
      cot: ["Chi nhánh", "Bộ chốt", "Ảnh vượt hạn mức", "Ảnh mua thêm", "Sản phẩm (app)", "Sản phẩm (qua Lark)", "Tổng phát sinh"],
      dong: [
        ...dongChiNhanh,
        ["TỔNG", m.soBo, m.tach.anhVuot, m.tach.anhMuaThem, m.tach.sanPhamTrongApp, m.tach.sanPhamQuaLark, m.tongPhatSinh],
      ],
    },
    bangPhu: [
      {
        tieuDe: "Sản phẩm theo đợt mua",
        bang: {
          cot: ["Đợt", "Số lượng", "Tiền (đ)"],
          dong: [...theoDot.entries()].sort((a, b) => a[0] - b[0]).map(([d, v]) => [tenDot(d), v.soLuong, v.tien]),
        },
      },
      {
        tieuDe: "Sản phẩm theo nhóm",
        bang: {
          cot: ["Nhóm", "Số lượng", "Tiền (đ)"],
          dong: [...theoNhom.entries()].sort((a, b) => b[1].tien - a[1].tien).map(([n, v]) => [n, v.soLuong, v.tien]),
        },
      },
    ],
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Tính trên các bộ CHỐT trong kỳ, gồm mọi đợt mua thêm đã xác nhận của chính những bộ đó (số dồn).",
      "Tiền mỗi bộ dùng đúng công thức \"Phải thu\" của app; phần sản phẩm thu qua Lark tách riêng, không nằm trong Phải thu.",
      "Bảng theo đợt / nhóm là chi tiết dòng sản phẩm (giá lúc khách bấm mua). Tiền ảnh vượt hạn mức không nằm trong hai bảng này.",
    ],
    lienKet: [
      { ma: "doanh-thu-phat-sinh", nhan: "Doanh thu phát sinh (đã thu / còn phải thu)" },
      { ma: "sales-mua-them", nhan: "Sales — mua thêm" },
    ],
  };
}

export const doanhThuMuaThem: DinhNghiaBaoCao = {
  ma: "doanh-thu-mua-them",
  ten: "Doanh thu mua thêm",
  moTa: "Tiền khách mua thêm trong app theo loại, theo đợt, theo nhóm sản phẩm và chi nhánh; tách phần thu qua Lark.",
  nhom: "doanh-thu",
  quyen: "reports:financial",
  boLoc: { kySoSanh: true },
  chay,
};
