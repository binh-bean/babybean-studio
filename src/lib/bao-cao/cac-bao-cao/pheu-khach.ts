/**
 * BB-380 — "Phễu khách": gửi link → mở → chọn → chốt → chỉnh → gửi duyệt → in/giao.
 *
 * - Số bộ mỗi bước: trên các bộ GỬI link trong kỳ, bước xa nhất đã tới (`buocCua`).
 * - Thời gian trung vị: chỉ những bước app CÓ mốc thời gian (gửi, mở lần đầu, chốt,
 *   gửi duyệt). Sau lúc chốt, Lark là nguồn trạng thái và chỉ cho biết bộ đang ở
 *   đâu, không lưu lịch sử — bước không có mốc hiện "—", không đoán.
 * - "Bộ đang kẹt": ảnh chụp NGAY LÚC XEM (không theo kỳ) mọi bộ đã gửi link mà chưa
 *   in/giao, theo bước hiện tại, quá ngưỡng ngày `NGUONG_KET_NGAY`.
 * Chỉ đếm, không hiện tên khách.
 */
import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { docNguyenLieu } from "../dieu-hanh/nguyen-lieu";
import {
  CAC_BUOC_PHEU,
  demPheu,
  trungViNgayGiua,
  tinhBoKet,
  tinhTiLeTaiTruocChot,
  type BoAnhDieuHanh,
} from "../dieu-hanh/cong-thuc";
import { theSo, soNgay } from "../dieu-hanh/chung";

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  const now = new Date();
  const nl = await docNguyenLieu(ctx, ctx.tu, ctx.den, { ket: true });
  const pheu = demPheu(nl.boGui);
  const gui = pheu[0] ?? 0;

  const moDau = (b: BoAnhDieuHanh) => b.moLanDauLuc;
  const tGuiMo = trungViNgayGiua(nl.boGui, (b) => b.sentAt, moDau);
  const tMoChot = trungViNgayGiua(nl.boChot, moDau, (b) => b.submittedAt);
  const tGuiChot = trungViNgayGiua(nl.boChot, (b) => b.sentAt, (b) => b.submittedAt);
  const tChotDuyet = trungViNgayGiua(nl.boChot, (b) => b.submittedAt, (b) => b.guiDuyetLuc);
  const thoiGianBuoc: ({ trungVi: number | null; mau: number } | null)[] = [
    null,
    tGuiMo,
    null,
    tMoChot,
    null,
    tChotDuyet,
    null,
  ];
  const tai = tinhTiLeTaiTruocChot(nl.boChot, nl.mocDoTai);

  const ket = tinhBoKet(nl.boDangChay, now);
  const tongKet = ket.reduce((t, d) => t + d.quaNguong, 0);

  const dongPheu = CAC_BUOC_PHEU.map((ten, i) => {
    const so = pheu[i] ?? 0;
    const tg = thoiGianBuoc[i];
    return [
      ten,
      so,
      gui === 0 ? "—" : Math.round((so / gui) * 1000) / 10,
      i === 0 ? "—" : (pheu[i - 1] ?? 0) === 0 ? "—" : Math.round((so / (pheu[i - 1] as number)) * 1000) / 10,
      tg ? soNgay(tg.trungVi) : "—",
    ];
  });

  return {
    theSo: [
      theSo("Bộ gửi link", gui, "bộ"),
      theSo("Đã chốt", pheu[3] ?? 0, "bộ", { giaiThich: "Trong các bộ gửi link trong kỳ." }),
      theSo("Gửi đến mở", tGuiMo.trungVi, "ngày", { tangLaTot: false, giaiThich: `Trung vị, ${tGuiMo.mau} bộ.` }),
      theSo("Gửi đến chốt", tGuiChot.trungVi, "ngày", { tangLaTot: false, giaiThich: `Trung vị, ${tGuiChot.mau} bộ chốt trong kỳ.` }),
      theSo("Chốt đến gửi duyệt", tChotDuyet.trungVi, "ngày", { tangLaTot: false, giaiThich: `Trung vị, ${tChotDuyet.mau} bộ.` }),
      theSo("Tải ảnh trước khi chốt", tai?.phanTram ?? null, "%"),
      theSo("Bộ đang kẹt (hiện tại)", tongKet, "bộ", { tangLaTot: false, giaiThich: "Quá ngưỡng ngày ở bước hiện tại." }),
    ],
    bang: {
      cot: ["Bước", "Số bộ", "% so với gửi link", "% so với bước trước", "Trung vị tới bước này (ngày)"],
      dong: dongPheu,
    },
    bangPhu: [
      {
        tieuDe: "Bộ đang kẹt — ảnh chụp lúc xem",
        bang: {
          cot: ["Đang ở bước", "Số bộ đang ở", "Quá ngưỡng", "Ngưỡng (ngày)", "Đã nằm ở bước (trung vị, ngày)"],
          dong: ket.map((d) => [
            CAC_BUOC_PHEU[d.buoc] ?? String(d.buoc),
            d.dangO,
            d.quaNguong,
            d.nguongNgay,
            soNgay(d.trungViNgayDangO),
          ]),
        },
      },
    ],
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Số bộ mỗi bước tính trên các bộ GỬI link trong kỳ, theo bước xa nhất đã tới. Sau lúc chốt, bước lấy theo trạng thái Hậu Kỳ trên Lark (hoặc thao tác trong app).",
      "Mở link lần đầu = lúc app tạo lượt chọn khi ba mẹ vào bộ ảnh. Gửi duyệt = lần đầu CSKH gửi ảnh chỉnh trong app, hoặc lúc Lark sang \"Đã gửi duyệt\".",
      "Bước không có mốc thời gian trong app (chọn ảnh, chỉnh sửa, in/giao) hiện \"—\": Lark chỉ cho biết bộ đang ở đâu, không lưu lịch sử.",
      "Bộ đang kẹt là ảnh chụp NGAY LÚC XEM, không theo kỳ lọc. Chi tiết từng bộ xem ở báo cáo Hậu kỳ cảnh báo và Việc cần xử lý.",
    ],
    lienKet: [
      { ma: "hau-ky-canh-bao", nhan: "Hậu kỳ cảnh báo" },
      { ma: "tien-do-chon-anh", nhan: "Tiến độ chọn ảnh" },
    ],
  };
}

export const pheuKhach: DinhNghiaBaoCao = {
  ma: "pheu-khach",
  ten: "Phễu khách",
  moTa: "Từ gửi link tới in/giao: bao nhiêu bộ qua mỗi bước, mất bao lâu, bộ nào đang kẹt quá lâu.",
  nhom: "van-hanh",
  quyen: "reports:operations",
  boLoc: { kySoSanh: false },
  chay,
};
