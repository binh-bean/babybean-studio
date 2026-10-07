/**
 * BB-380 — "Vận hành chỉnh sửa": yêu cầu sửa, số lần sửa, thời gian chỉnh (chốt →
 * gửi duyệt), theo người chỉnh sửa.
 *
 * - Yêu cầu sửa: `revision_requests` (khách bấm "xin sửa" trong app) TẠO trong kỳ.
 *   Lark "Sửa" / "Sửa lần 2, 3, 4" không lưu số lần nên không cộng vào đây; số bộ
 *   ĐANG ở bước sửa trên Lark hiện riêng.
 * - Thời gian chỉnh: trung vị chốt → lần đầu gửi khách duyệt, trên các bộ CHỐT
 *   trong kỳ đã có mốc gửi duyệt.
 * - Người chỉnh sửa: cột `lark_nguoi_photoshop` (0094, đọc từ Lark "Người
 *   Photoshop"). Chưa áp 0094 hoặc Lark để trống → "Chưa rõ".
 */
import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { docNguyenLieu } from "../dieu-hanh/nguyen-lieu";
import {
  tongHopChinhSua,
  trungViNgayGiua,
  khoaNguoiChinhSua,
  type BoAnhDieuHanh,
} from "../dieu-hanh/cong-thuc";
import { giaiDoanCua } from "@/lib/lark/trang-thai-hau-ky";
import { theSo, soNgay } from "../dieu-hanh/chung";

const chotDenDuyet = (bo: BoAnhDieuHanh[]) =>
  trungViNgayGiua(bo, (b) => b.submittedAt, (b) => b.guiDuyetLuc);

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  const nl = await docNguyenLieu(ctx, ctx.tu, ctx.den, { ket: true, chinhSua: true });
  const cs = tongHopChinhSua(nl.yeuCauSua);
  const tg = chotDenDuyet(nl.boChot);
  const dangSuaLark = nl.boDangChay.filter((b) => giaiDoanCua(b.larkTrangThai) === 6).length;

  const nguoiCuaBo = new Map<string, string>();
  for (const b of [...nl.boGui, ...nl.boChot, ...nl.boDangChay]) nguoiCuaBo.set(b.id, khoaNguoiChinhSua(b.nguoiChinhSua));

  const theoNguoi = new Map<string, { bo: BoAnhDieuHanh[]; yeuCau: typeof nl.yeuCauSua; dangLam: number }>();
  const cua = (k: string) => {
    let v = theoNguoi.get(k);
    if (!v) {
      v = { bo: [], yeuCau: [], dangLam: 0 };
      theoNguoi.set(k, v);
    }
    return v;
  };
  for (const b of nl.boChot) cua(khoaNguoiChinhSua(b.nguoiChinhSua)).bo.push(b);
  for (const y of nl.yeuCauSua) cua(nguoiCuaBo.get(y.galleryId) ?? "Chưa rõ").yeuCau.push(y);
  for (const b of nl.boDangChay) {
    const gd = giaiDoanCua(b.larkTrangThai);
    if (gd !== null && gd >= 2 && gd <= 6) cua(khoaNguoiChinhSua(b.nguoiChinhSua)).dangLam += 1;
  }

  const dong = [...theoNguoi.entries()]
    .map(([ten, v]) => {
      const t = chotDenDuyet(v.bo);
      const c = tongHopChinhSua(v.yeuCau);
      return [ten, v.bo.length, soNgay(t.trungVi), c.soYeuCau, c.tbLanSua ?? "—", v.dangLam];
    })
    .sort((a, b) => (a[0] === "Chưa rõ" ? 1 : b[0] === "Chưa rõ" ? -1 : String(a[0]).localeCompare(String(b[0]), "vi")));

  return {
    theSo: [
      theSo("Yêu cầu sửa (qua app)", cs.soYeuCau, "yêu cầu"),
      theSo("Bộ có yêu cầu sửa", cs.soBoCoSua, "bộ"),
      theSo("Số lần sửa trung bình", cs.tbLanSua, "lần", { tangLaTot: false, giaiThich: "Trên các bộ có yêu cầu sửa." }),
      theSo("Thời gian chỉnh", tg.trungVi, "ngày", {
        tangLaTot: false,
        giaiThich: `Trung vị từ chốt tới lần đầu gửi khách duyệt, ${tg.mau} bộ chốt trong kỳ.`,
      }),
      theSo("Đang sửa theo yêu cầu (Lark, hiện tại)", dangSuaLark, "bộ", { tangLaTot: false }),
    ],
    bang: {
      cot: ["Người chỉnh sửa", "Bộ chốt trong kỳ", "Thời gian chỉnh (trung vị, ngày)", "Yêu cầu sửa", "Lần sửa TB", "Đang làm (hiện tại)"],
      dong,
    },
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Yêu cầu sửa đếm lượt khách bấm \"xin sửa\" trong app, tạo trong kỳ. Lark không lưu số lần sửa nên bộ đang ở bước \"Sửa\" trên Lark hiện riêng.",
      "Thời gian chỉnh = từ lúc khách chốt tới lần đầu gửi ảnh đã chỉnh cho khách duyệt (trong app, hoặc lúc Lark sang \"Đã gửi duyệt\").",
      ...(nl.coCotNguoiChinhSua
        ? ["Người chỉnh sửa lấy từ cột \"Người Photoshop\" của bảng Hậu Kỳ trên Lark."]
        : ["Cơ sở dữ liệu chưa có cột người chỉnh sửa (migration 0094 chưa áp) nên mọi bộ đang là \"Chưa rõ\"."]),
    ],
    lienKet: [{ ma: "hau-ky-canh-bao", nhan: "Hậu kỳ cảnh báo" }],
  };
}

export const vanHanhChinhSua: DinhNghiaBaoCao = {
  ma: "van-hanh-chinh-sua",
  ten: "Vận hành chỉnh sửa",
  moTa: "Yêu cầu sửa, số lần sửa, thời gian chỉnh từ chốt tới gửi duyệt, theo người chỉnh sửa.",
  nhom: "van-hanh",
  quyen: "reports:operations",
  boLoc: { kySoSanh: false },
  chay,
};
