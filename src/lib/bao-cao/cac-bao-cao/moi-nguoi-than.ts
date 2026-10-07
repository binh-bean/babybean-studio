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
 *   - BB-393 (anh 06/10: "những người chia sẻ có mua thêm không") — DOANH THU (đ) của
 *     các yêu cầu đó, tách đã thanh toán / chưa. Tiền mỗi yêu cầu KHÔNG tự chế giá —
 *     dùng đúng cách app đang tính cho bảng `yeu_cau_mua_them`:
 *       · loại 'san_pham' (BB-245/254): `so_luong × list_price` niêm yết —
 *         `tinhThamKhaoMuaLanHai` của báo cáo "Doanh thu phát sinh" (BB-263);
 *       · loại 'chinh_sua' (BB-345): `tam_tinh` đã lưu lúc gửi
 *         (= so_luong × giá ảnh thêm của bộ ảnh — 0083).
 *     (Báo cáo "Doanh thu mua thêm" BB-380 tính theo BỘ CHỐT, không đọc bảng
 *     yêu cầu này, nên không có công thức theo từng yêu cầu ở đó để dùng lại.)
 *     Đã thanh toán = `trang_thai = 'da_thanh_toan'` (0080, BB-332). Yêu cầu 'huy'
 *     vẫn đếm là một yêu cầu nhưng không tính tiền.
 *
 * Link đã thu hồi vẫn tính (đã được mời thật). Yêu cầu của link bị XOÁ hẳn mất
 * `share_link_id` (0073: on delete set null) nên không đếm được — con số là sàn.
 * Chỉ đếm, không trả tên / số điện thoại ai. Tiền ẩn với người không có
 * `reports:financial` (cùng luật BB-380).
 */
import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao, TheSoBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { theSo, xemDuocTien, CHU_AN_TIEN } from "../dieu-hanh/chung";
import { tinhThamKhaoMuaLanHai } from "./doanh-thu-phat-sinh";
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
  /** BB-393 — tiền của yêu cầu (đ), tính bằng `tienCuaYeuCau`. Thiếu = 0. */
  tien?: number;
  /** BB-393 — `yeu_cau_mua_them.trang_thai` ('moi' | 'da_lien_he' | 'da_chot' | 'da_thanh_toan' | 'huy'). */
  trangThai?: string;
}

/** Một dòng `yeu_cau_mua_them` đủ để tính tiền. */
export interface DongYeuCauTien {
  /** null/undefined = dòng trước 0083 → 'san_pham'. */
  loai?: string | null;
  soLuong: number;
  /** `products.list_price` (loại sản phẩm). */
  listPrice: number | null;
  /** `tam_tinh` (loại chỉnh sửa, 0083). */
  tamTinh?: number | null;
}

/**
 * BB-393 — tiền một yêu cầu mua thêm, theo đúng cách app đang tính (xem đầu tệp):
 * chỉnh sửa → `tam_tinh` đã lưu; sản phẩm → `tinhThamKhaoMuaLanHai` (bỏ dòng chưa có giá).
 */
export function tienCuaYeuCau(y: DongYeuCauTien): number {
  if (y.loai === "chinh_sua") return y.tamTinh ?? 0;
  return tinhThamKhaoMuaLanHai([{ soLuong: y.soLuong, listPrice: y.listPrice }]);
}

export interface DoanhThuNguoiDuocMoi {
  daThanhToan: number;
  chuaThanhToan: number;
  tong: number;
}

export interface ThongKeMoiNguoiThan {
  soNhaCoMoi: number;
  soLinkMoi: number;
  soNguoiDaMo: number;
  soYeuCau: number;
  /** BB-393 — tiền các yêu cầu từ người được mời (bỏ yêu cầu đã huỷ). */
  doanhThu: DoanhThuNguoiDuocMoi;
  theoChiNhanh: Map<
    string,
    { nha: Set<string>; link: number; daMo: number; yeuCau: number; doanhThu: DoanhThuNguoiDuocMoi }
  >;
}

const doanhThuRong = (): DoanhThuNguoiDuocMoi => ({ daThanhToan: 0, chuaThanhToan: 0, tong: 0 });

function congTien(dt: DoanhThuNguoiDuocMoi, y: YeuCauDauVao): void {
  if (y.trangThai === "huy") return;
  const tien = y.tien ?? 0;
  if (y.trangThai === "da_thanh_toan") dt.daThanhToan += tien;
  else dt.chuaThanhToan += tien;
  dt.tong += tien;
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
      v = { nha: new Set(), link: 0, daMo: 0, yeuCau: 0, doanhThu: doanhThuRong() };
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
  const doanhThu = doanhThuRong();
  for (const y of yeuCauTrongKy) {
    if (!y.linkId || !idLinkMoi.has(y.linkId)) continue;
    yeuCau += 1;
    const b = cua(y.branchId);
    b.yeuCau += 1;
    congTien(doanhThu, y);
    congTien(b.doanhThu, y);
  }

  return {
    soNhaCoMoi: nha.size,
    soLinkMoi: linkTrongKy.length,
    soNguoiDaMo: daMo,
    soYeuCau: yeuCau,
    doanhThu,
    theoChiNhanh,
  };
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
  so_luong: number | null;
  trang_thai: string | null;
  /** 0083 — thiếu khi cơ sở dữ liệu chưa áp 0083. */
  loai?: string | null;
  tam_tinh?: number | string | null;
  products: Mot<{ list_price: number | string | null }>;
  gallery: Mot<{ branch_id: string; title: string | null; status: string }>;
}

const COT_YEU_CAU =
  "share_link_id, so_luong, trang_thai, products(list_price), gallery:galleries!inner(branch_id, title, status)";
const COT_YEU_CAU_0083 = COT_YEU_CAU + ", loai, tam_tinh";
const soHoacNull = (v: number | string | null | undefined): number | null => (v == null ? null : Number(v));

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
    const docYeuCau = (cot: string) =>
      ctx.client
        .from("yeu_cau_mua_them")
        .select(cot)
        .not("share_link_id", "is", null)
        .gte("created_at", ctx.tu.toISOString())
        .lt("created_at", ctx.den.toISOString())
        .limit(5000);
    let { data, error } = await docYeuCau(COT_YEU_CAU_0083);
    // Chưa áp 0083 (loai/tam_tinh): đọc lại không có hai cột đó — mọi dòng là 'san_pham'.
    if (error && laLoiThieuCot(error)) ({ data, error } = await docYeuCau(COT_YEU_CAU));
    if (error) {
      if (laLoiThieuBang(error) || laLoiThieuCot(error)) chuaAp = true;
      else throw error;
    } else {
      yeuCauTrongKy = ((data ?? []) as unknown as HangYeuCau[])
        .filter((y) => {
          const bo = motDong(y.gallery);
          return !!bo && !laThu(bo.title) && bo.status !== "archived" && cuaChiNhanh(bo.branch_id);
        })
        .map((y) => ({
          linkId: y.share_link_id,
          branchId: motDong(y.gallery)?.branch_id ?? null,
          trangThai: y.trang_thai ?? "moi",
          tien: tienCuaYeuCau({
            loai: y.loai ?? null,
            soLuong: y.so_luong ?? 0,
            listPrice: soHoacNull(motDong(y.products)?.list_price),
            tamTinh: soHoacNull(y.tam_tinh),
          }),
        }));
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
  return dungKetQua(tk, tenChiNhanh, { tien: xemDuocTien(ctx), chuaAp });
}

/** BB-393 — dựng thẻ số + bảng từ thống kê (thuần, phép thử gọi thẳng). */
export function dungKetQua(
  tk: ThongKeMoiNguoiThan,
  tenChiNhanh: ReadonlyMap<string, string>,
  opts: { tien: boolean; chuaAp?: boolean },
): KetQuaBaoCao {
  const { tien } = opts;
  const cotTien = (dt: DoanhThuNguoiDuocMoi): (string | number)[] =>
    tien ? [dt.daThanhToan, dt.chuaThanhToan, dt.tong] : ["—", "—", "—"];

  const dong = [...tk.theoChiNhanh.entries()]
    .map(([id, v]): (string | number)[] => [
      tenChiNhanh.get(id) ?? "Chưa rõ chi nhánh",
      v.nha.size,
      v.link,
      v.daMo,
      v.yeuCau,
      ...cotTien(v.doanhThu),
    ])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0]), "vi"));
  if (dong.length > 1) {
    dong.push(["TỔNG", tk.soNhaCoMoi, tk.soLinkMoi, tk.soNguoiDaMo, tk.soYeuCau, ...cotTien(tk.doanhThu)]);
  }

  const theTien = (nhan: string, giaTri: number, giaiThich: string): TheSoBaoCao =>
    tien ? theSo(nhan, giaTri, "đ", { giaiThich }) : { nhan, giaTri: "—", giaiThich: CHU_AN_TIEN, tangLaTot: true };

  return {
    theSo: [
      { nhan: "Nhà có mời người thân", giaTri: tk.soNhaCoMoi, donVi: "nhà" },
      { nhan: "Người được mời đã mở", giaTri: tk.soNguoiDaMo, donVi: `trên ${tk.soLinkMoi} link` },
      { nhan: "Yêu cầu mua thêm từ người được mời", giaTri: tk.soYeuCau, donVi: "yêu cầu" },
      theTien(
        "Doanh thu từ người được mời",
        tk.doanhThu.tong,
        "Tổng tiền các yêu cầu mua thêm người được mời gửi trong kỳ (bỏ yêu cầu đã huỷ).",
      ),
      theTien("Đã thanh toán", tk.doanhThu.daThanhToan, "Yêu cầu CSKH đã đánh dấu Đã thanh toán."),
      theTien(
        "Chưa thanh toán",
        tk.doanhThu.chuaThanhToan,
        "Yêu cầu mới gửi, đã liên hệ hoặc đã chốt nhưng chưa đánh dấu thanh toán.",
      ),
    ],
    bang: {
      cot: [
        "Chi nhánh",
        "Nhà có mời",
        "Link mời",
        "Link đã mở",
        "Yêu cầu mua thêm",
        "Đã thanh toán (đ)",
        "Chưa thanh toán (đ)",
        "Doanh thu (đ)",
      ],
      dong,
    },
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Nhà có mời và Link đã mở tính theo link mời TẠO trong kỳ. Yêu cầu mua thêm tính theo yêu cầu GỬI trong kỳ, từ người được mời (không phải ba mẹ).",
      "Doanh thu: sản phẩm tính số lượng × giá niêm yết (bỏ sản phẩm chưa có giá); đặt chỉnh sửa tính tạm tính lúc gửi. CSKH chốt giá thật khi gọi lại. Yêu cầu đã huỷ không tính tiền.",
      "Link mời đã thu hồi vẫn tính (đã được mời thật). Link bị xoá hẳn làm mất liên kết với yêu cầu, nên số yêu cầu là con số thấp nhất.",
      ...(opts.chuaAp ? ["Cơ sở dữ liệu chưa có cột gắn yêu cầu mua thêm với link mời nên số yêu cầu đang là 0."] : []),
      ...(tien ? [] : ["Bạn chưa có quyền xem doanh thu nên cột tiền để trống."]),
    ],
  };
}

export const moiNguoiThan: DinhNghiaBaoCao = {
  ma: "moi-nguoi-than",
  ten: "Mời người thân",
  moTa: "Bao nhiêu nhà đã mời ông bà xem ảnh, bao nhiêu người được mời đã mở, bao nhiêu yêu cầu mua thêm và doanh thu đến từ họ.",
  nhom: "van-hanh",
  quyen: "reports:operations",
  boLoc: { kySoSanh: false },
  chay,
};
