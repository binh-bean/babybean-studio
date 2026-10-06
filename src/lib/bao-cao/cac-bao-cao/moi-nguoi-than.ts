/**
 * BB-372 — báo cáo "Mời người thân" (reports:operations), dựa khung BB-260.
 *
 * Ba mẹ mời ông bà / người thân xem ảnh bằng link `viewer`. Chủ studio muốn biết
 * tính năng này có được dùng và có ra đơn không:
 *   - Nhà có mời người thân: số KHÁCH có ít nhất một link mời tạo TRONG KỲ.
 *   - Người được mời đã mở: trong các link mời tạo trong kỳ, số link đã được mở ít nhất một lần.
 *   - Yêu cầu mua thêm từ người được mời: yêu cầu tạo TRONG KỲ mà `share_link_id` là một
 *     link mời (ông bà bấm mua, không phải ba mẹ).
 *
 * Link đã thu hồi vẫn tính (đã được mời thật). Yêu cầu của link bị XOÁ hẳn mất
 * `share_link_id` (0073: on delete set null) nên không đếm được — con số là sàn.
 * Chỉ đếm, không trả tên / số điện thoại ai.
 */
import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { laLoiThieuBang, laLoiThieuCot } from "@/lib/gallery/dot-chon-server";

export interface LinkMoiDauVao {
  linkId: string;
  /** Khách của link (đã suy từ khách hoặc từ bộ ảnh). null: không rõ. */
  customerId: string | null;
  branchId: string | null;
  soLanMo: number;
}

export interface YeuCauDauVao {
  linkId: string | null;
  branchId: string | null;
}

export interface ThongKeMoiNguoiThan {
  soNhaCoMoi: number;
  soLinkMoi: number;
  soNguoiDaMo: number;
  soYeuCau: number;
  theoChiNhanh: Map<string, { nha: Set<string>; link: number; daMo: number; yeuCau: number }>;
}

/**
 * Hàm thuần. `idLinkMoi`: mọi link `viewer` (kể cả tạo ngoài kỳ) — để biết yêu cầu nào đến
 * từ người được mời.
 */
export function tinhMoiNguoiThan(
  linkTrongKy: LinkMoiDauVao[],
  yeuCauTrongKy: YeuCauDauVao[],
  idLinkMoi: ReadonlySet<string>,
): ThongKeMoiNguoiThan {
  const theoChiNhanh: ThongKeMoiNguoiThan["theoChiNhanh"] = new Map();
  const cua = (b: string | null) => {
    const k = b ?? "?";
    let v = theoChiNhanh.get(k);
    if (!v) {
      v = { nha: new Set(), link: 0, daMo: 0, yeuCau: 0 };
      theoChiNhanh.set(k, v);
    }
    return v;
  };

  const nha = new Set<string>();
  let daMo = 0;
  for (const l of linkTrongKy) {
    const b = cua(l.branchId);
    b.link += 1;
    if (l.customerId) {
      nha.add(l.customerId);
      b.nha.add(l.customerId);
    }
    if (l.soLanMo > 0) {
      daMo += 1;
      b.daMo += 1;
    }
  }

  let yeuCau = 0;
  for (const y of yeuCauTrongKy) {
    if (!y.linkId || !idLinkMoi.has(y.linkId)) continue;
    yeuCau += 1;
    cua(y.branchId).yeuCau += 1;
  }

  return { soNhaCoMoi: nha.size, soLinkMoi: linkTrongKy.length, soNguoiDaMo: daMo, soYeuCau: yeuCau, theoChiNhanh };
}

type Mot<T> = T | T[] | null;
function motDong<T>(v: Mot<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

interface HangLink {
  id: string;
  view_count: number | null;
  customer: Mot<{ id: string; branch_id: string; full_name: string | null }>;
  gallery: Mot<{ branch_id: string; title: string | null; status: string; customer_id: string | null }>;
}

interface HangYeuCau {
  share_link_id: string | null;
  gallery: Mot<{ branch_id: string; title: string | null; status: string }>;
}

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  const choPhep = ctx.chiNhanhIds ? new Set(ctx.chiNhanhIds) : null;
  const cuaChiNhanh = (b: string | null) => !choPhep || (b !== null && choPhep.has(b));
  const laThu = (ten: string | null) => (ten ?? "").toLowerCase().startsWith("fixture");

  const { data: tenCn, error: cnErr } = await ctx.client.from("branches").select("id, name");
  if (cnErr) throw cnErr;
  const tenChiNhanh = new Map((tenCn ?? []).map((b) => [b.id as string, b.name as string]));

  // Link mời tạo trong kỳ.
  const { data: ld, error: lErr } = await ctx.client
    .from("share_links")
    .select(
      "id, view_count, customer:customers(id, branch_id, full_name), gallery:galleries(branch_id, title, status, customer_id)",
    )
    .eq("role", "viewer")
    .gte("created_at", ctx.tu.toISOString())
    .lt("created_at", ctx.den.toISOString())
    .limit(5000);
  if (lErr) throw lErr;

  const linkTrongKy: LinkMoiDauVao[] = [];
  for (const h of (ld ?? []) as unknown as HangLink[]) {
    const kh = motDong(h.customer);
    const bo = motDong(h.gallery);
    const chiNhanh = kh?.branch_id ?? bo?.branch_id ?? null;
    if (laThu(kh?.full_name ?? null) || laThu(bo?.title ?? null) || bo?.status === "archived") continue;
    if (!cuaChiNhanh(chiNhanh)) continue;
    linkTrongKy.push({
      linkId: h.id,
      customerId: kh?.id ?? bo?.customer_id ?? null,
      branchId: chiNhanh,
      soLanMo: h.view_count ?? 0,
    });
  }

  // Yêu cầu mua thêm trong kỳ có gắn link.
  let chuaAp = false;
  let yeuCauTrongKy: YeuCauDauVao[] = [];
  const idLinkMoi = new Set<string>();
  {
    const { data, error } = await ctx.client
      .from("yeu_cau_mua_them")
      .select("share_link_id, gallery:galleries!inner(branch_id, title, status)")
      .not("share_link_id", "is", null)
      .gte("created_at", ctx.tu.toISOString())
      .lt("created_at", ctx.den.toISOString())
      .limit(5000);
    if (error) {
      if (laLoiThieuBang(error) || laLoiThieuCot(error)) chuaAp = true;
      else throw error;
    } else {
      yeuCauTrongKy = ((data ?? []) as unknown as HangYeuCau[])
        .filter((y) => {
          const bo = motDong(y.gallery);
          return !!bo && !laThu(bo.title) && bo.status !== "archived" && cuaChiNhanh(bo.branch_id);
        })
        .map((y) => ({ linkId: y.share_link_id, branchId: motDong(y.gallery)?.branch_id ?? null }));
      const ids = [...new Set(yeuCauTrongKy.map((y) => y.linkId).filter((x): x is string => !!x))];
      for (let i = 0; i < ids.length; i += 150) {
        const { data: lk, error: e2 } = await ctx.client
          .from("share_links")
          .select("id")
          .eq("role", "viewer")
          .in("id", ids.slice(i, i + 150));
        if (e2) throw e2;
        for (const r of lk ?? []) idLinkMoi.add(r.id as string);
      }
    }
  }

  const tk = tinhMoiNguoiThan(linkTrongKy, yeuCauTrongKy, idLinkMoi);

  const dong = [...tk.theoChiNhanh.entries()]
    .map(([id, v]): (string | number)[] => [tenChiNhanh.get(id) ?? "Chưa rõ chi nhánh", v.nha.size, v.link, v.daMo, v.yeuCau])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "vi"));

  return {
    theSo: [
      { nhan: "Nhà có mời người thân", giaTri: tk.soNhaCoMoi, donVi: "nhà" },
      { nhan: "Người được mời đã mở", giaTri: tk.soNguoiDaMo, donVi: `trên ${tk.soLinkMoi} link` },
      { nhan: "Yêu cầu mua thêm từ người được mời", giaTri: tk.soYeuCau, donVi: "yêu cầu" },
    ],
    bang: { cot: ["Chi nhánh", "Nhà có mời", "Link mời", "Link đã mở", "Yêu cầu mua thêm"], dong },
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Nhà có mời và Link đã mở tính theo link mời TẠO trong kỳ. Yêu cầu mua thêm tính theo yêu cầu GỬI trong kỳ, từ người được mời (không phải ba mẹ).",
      "Link mời đã thu hồi vẫn tính (đã được mời thật). Link bị xoá hẳn làm mất liên kết với yêu cầu, nên số yêu cầu là con số thấp nhất.",
      ...(chuaAp ? ["Cơ sở dữ liệu chưa có cột gắn yêu cầu mua thêm với link mời nên số yêu cầu đang là 0."] : []),
    ],
  };
}

export const moiNguoiThan: DinhNghiaBaoCao = {
  ma: "moi-nguoi-than",
  ten: "Mời người thân",
  moTa: "Bao nhiêu nhà đã mời ông bà xem ảnh, bao nhiêu người được mời đã mở, và bao nhiêu yêu cầu mua thêm đến từ họ.",
  nhom: "van-hanh",
  quyen: "reports:operations",
  boLoc: { kySoSanh: false },
  chay,
};
