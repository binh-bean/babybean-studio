/**
 * Báo cáo "Tiến độ chọn ảnh" — reports:operations.
 *
 * OWNER: DEV-BE. Task BB-260.
 *
 * ---------------------------------------------------------------------------
 * Định nghĩa từng số (đọc trước khi đổi)
 * ---------------------------------------------------------------------------
 * - "Đã gửi link": số bộ có `sent_at` rơi trong kỳ đang xem.
 * - "Đang chọn": ảnh chụp NGAY LÚC XEM báo cáo — số bộ đang ở trạng thái
 *   `in_review`, không giới hạn theo kỳ (một bộ gửi tháng trước, khách còn
 *   đang chọn tháng này, vẫn phải hiện ở đây).
 * - "Đã chốt": số bộ có `submitted_at` rơi trong kỳ đang xem.
 * - Trung vị thời gian gửi → chốt: tính trên các bộ ĐÃ CHỐT TRONG KỲ mà có cả
 *   `sent_at` lẫn `submitted_at` — bộ chưa từng gửi qua app (nhập tay/di trú
 *   dữ liệu cũ) không có `sent_at` nên không vào mẫu tính.
 * - "Quá hạn chưa chốt": ảnh chụp ngay lúc xem — `due_at` đã qua mà bộ còn ở
 *   `ready` hoặc `in_review` (chưa `submitted`), không giới hạn theo kỳ.
 */

import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao, TheSoBaoCao } from "../loai";
import { locBoAnhThat, GHI_CHU_LOAI_TRU } from "../loc-chung";
import { chenhLechPhanTram, chiaMoc, nhanMoc, trungVi } from "../ky";

interface HangGon {
  id: string;
  branch_id: string;
  sent_at: string | null;
  submitted_at: string | null;
}

interface HangDon {
  id: string;
  branch_id: string;
}

async function demTheoBranch(
  ctx: NguCanhBaoCao,
  ap: (q: ReturnType<typeof baseQuery>) => ReturnType<typeof baseQuery>,
): Promise<{ tong: number; theoChiNhanh: Map<string, number> }> {
  const q = ap(baseQuery(ctx));
  const { data, error } = await q;
  if (error) throw error;
  const rows = (data ?? []) as HangDon[];
  const theoChiNhanh = new Map<string, number>();
  for (const r of rows) {
    theoChiNhanh.set(r.branch_id, (theoChiNhanh.get(r.branch_id) ?? 0) + 1);
  }
  return { tong: rows.length, theoChiNhanh };
}

function baseQuery(ctx: NguCanhBaoCao) {
  let q = ctx.client.from("galleries").select("id, branch_id");
  q = locBoAnhThat(q);
  if (ctx.chiNhanhIds) q = q.in("branch_id", ctx.chiNhanhIds);
  return q;
}

async function guiLinkTrongKy(ctx: NguCanhBaoCao, tu: Date, den: Date) {
  return demTheoBranch(ctx, (q) =>
    q.gte("sent_at", tu.toISOString()).lt("sent_at", den.toISOString()),
  );
}

async function chotTrongKyChiTiet(ctx: NguCanhBaoCao, tu: Date, den: Date) {
  let q = ctx.client
    .from("galleries")
    .select("id, branch_id, sent_at, submitted_at")
    .gte("submitted_at", tu.toISOString())
    .lt("submitted_at", den.toISOString());
  q = locBoAnhThat(q);
  if (ctx.chiNhanhIds) q = q.in("branch_id", ctx.chiNhanhIds);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as HangGon[];
}

async function dangChonHienTai(ctx: NguCanhBaoCao) {
  return demTheoBranch(ctx, (q) => q.eq("status", "in_review"));
}

async function quaHanHienTai(ctx: NguCanhBaoCao, now: Date) {
  return demTheoBranch(ctx, (q) =>
    q.lt("due_at", now.toISOString()).in("status", ["ready", "in_review"]),
  );
}

async function tenCacChiNhanh(ctx: NguCanhBaoCao): Promise<Map<string, string>> {
  let q = ctx.client.from("branches").select("id, name").order("name");
  if (ctx.chiNhanhIds) q = q.in("id", ctx.chiNhanhIds);
  const { data, error } = await q;
  if (error) throw error;
  const m = new Map<string, string>();
  for (const b of (data ?? []) as { id: string; name: string }[]) m.set(b.id, b.name);
  return m;
}

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  const now = new Date();

  const [tenChiNhanh, guiLink, dangChon, quaHan, chotChiTiet] = await Promise.all([
    tenCacChiNhanh(ctx),
    guiLinkTrongKy(ctx, ctx.tu, ctx.den),
    dangChonHienTai(ctx),
    quaHanHienTai(ctx, now),
    chotTrongKyChiTiet(ctx, ctx.tu, ctx.den),
  ]);

  let guiLinkKyTruoc: { tong: number; theoChiNhanh: Map<string, number> } | null = null;
  let chotKyTruoc: HangGon[] | null = null;
  if (ctx.kyTruoc) {
    [guiLinkKyTruoc, chotKyTruoc] = await Promise.all([
      guiLinkTrongKy(ctx, ctx.kyTruoc.tu, ctx.kyTruoc.den),
      chotTrongKyChiTiet(ctx, ctx.kyTruoc.tu, ctx.kyTruoc.den),
    ]);
  }

  // Trung vị gửi -> chốt, tính bằng NGÀY (làm tròn 1 số lẻ).
  const thoiGianNgay = chotChiTiet
    .filter((r) => r.sent_at)
    .map((r) => (new Date(r.submitted_at as string).getTime() - new Date(r.sent_at as string).getTime()) / 86_400_000);
  const trungViNgay = trungVi(thoiGianNgay);

  const theSo: TheSoBaoCao[] = [
    {
      nhan: "Đã gửi link",
      giaTri: guiLink.tong,
      donVi: "bộ",
      kyTruoc: guiLinkKyTruoc?.tong,
      chenhLechPhanTram: guiLinkKyTruoc ? chenhLechPhanTram(guiLink.tong, guiLinkKyTruoc.tong) : undefined,
    },
    { nhan: "Đang chọn (hiện tại)", giaTri: dangChon.tong, donVi: "bộ" },
    {
      nhan: "Đã chốt",
      giaTri: chotChiTiet.length,
      donVi: "bộ",
      kyTruoc: chotKyTruoc?.length,
      chenhLechPhanTram: chotKyTruoc ? chenhLechPhanTram(chotChiTiet.length, chotKyTruoc.length) : undefined,
    },
    {
      nhan: "Trung vị gửi → chốt",
      giaTri: trungViNgay === null ? "—" : Math.round(trungViNgay * 10) / 10,
      donVi: trungViNgay === null ? undefined : "ngày",
    },
    { nhan: "Quá hạn chưa chốt (hiện tại)", giaTri: quaHan.tong, donVi: "bộ" },
  ];

  const moc = chiaMoc({ tu: ctx.tu, den: ctx.den }, ctx.nhom).map((m) => ({
    nhan: nhanMoc(m.tu, ctx.nhom),
    dem: chotChiTiet.filter(
      (r) => new Date(r.submitted_at as string) >= m.tu && new Date(r.submitted_at as string) < m.den,
    ).length,
  }));

  const bangDong = [...tenChiNhanh.entries()].map(([id, ten]) => [
    ten,
    guiLink.theoChiNhanh.get(id) ?? 0,
    dangChon.theoChiNhanh.get(id) ?? 0,
    chotChiTiet.filter((r) => r.branch_id === id).length,
    quaHan.theoChiNhanh.get(id) ?? 0,
  ]);

  return {
    theSo,
    bang: {
      cot: ["Chi nhánh", "Đã gửi link", "Đang chọn", "Đã chốt", "Quá hạn chưa chốt"],
      dong: bangDong,
    },
    bieuDo: {
      loai: "cot",
      nhan: moc.map((m) => m.nhan),
      chuoi: [{ ten: "Bộ chốt", giaTri: moc.map((m) => m.dem) }],
    },
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "\"Đang chọn\" và \"Quá hạn chưa chốt\" là số tại THỜI ĐIỂM XEM báo cáo, không giới hạn theo kỳ lọc.",
    ],
  };
}

export const tienDoChonAnh: DinhNghiaBaoCao = {
  ma: "tien-do-chon-anh",
  ten: "Tiến độ chọn ảnh",
  moTa: "Số bộ đã gửi link / đang chọn / đã chốt, thời gian trung vị gửi → chốt, và số bộ quá hạn.",
  nhom: "van-hanh",
  quyen: "reports:operations",
  boLoc: { kySoSanh: true },
  chay,
};
