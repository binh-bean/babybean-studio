/**
 * Báo cáo "Hiệu suất nhân viên" — reports:operations.
 *
 * OWNER: DEV-BE. Task BB-264.
 *
 * ---------------------------------------------------------------------------
 * Chủ studio chốt 26/09/2026
 * ---------------------------------------------------------------------------
 * "So kỳ này với kỳ trước, nhân viên với nhân viên, nhân viên với số tổng."
 * Lần này làm bằng dữ liệu VẬN HÀNH có thật (không phải doanh thu — báo cáo
 * sales dùng cùng cách trình bày này sau, xem `../so-sanh-nhan-vien.ts`).
 *
 * ---------------------------------------------------------------------------
 * Nguồn dữ liệu từng chỉ số (đọc trước khi đổi)
 * ---------------------------------------------------------------------------
 * CSKH (đọc theo NGƯỜI BẤM NÚT — `activity_logs.actor_id`):
 *  - "Link gửi khách": `activity_logs.action = 'share_link.created'`
 *    (`src/app/api/admin/galleries/[id]/share-link/route.ts`).
 *  - "Xác nhận chuyển chỉnh": `activity_logs.action = 'gallery.retouch_sent'`
 *    — đây là lúc CSKH bấm "đã gửi bản chỉnh cho khách"
 *    (`src/app/api/admin/galleries/[id]/retouch-done/route.ts`), KHÔNG phải
 *    việc của người chỉnh ảnh — người chỉnh ảnh chỉ đứng tên `editor_id` trên
 *    bộ ảnh, không phải người gọi API này.
 *  - "Khoản thu ghi nhận": `gallery_payments.confirmed_by`, lọc theo
 *    `confirmed_at` (BB-115).
 *  - "Mua thêm đã xử lý": `activity_logs.action = 'mua_them.doi_trang_thai'`
 *    (BB-249, mọi lượt đổi trạng thái — kể cả "huỷ" — đều là một lượt CSKH đã
 *    xử lý yêu cầu, không chỉ lượt chốt).
 *
 * Thợ chỉnh (đọc theo BỘ ẢNH họ đứng tên — `galleries.editor_id`, KHÔNG phải
 * người bấm nút, vì người bấm "chuyển chỉnh" luôn là CSKH):
 *  - "Bộ gửi bản chỉnh": số bộ (đếm phân biệt `gallery_id`) có sự kiện
 *    `gallery.retouch_sent` trong kỳ, mà `galleries.editor_id` là người đó.
 *  - "Vòng khách xin sửa": số dòng `revision_requests` có `created_at` trong
 *    kỳ, trên các bộ ảnh có `editor_id` là người đó.
 *  - "Trung vị nhận → gửi": với mỗi bộ có `gallery.retouch_sent` trong kỳ, lấy
 *    mốc "nhận" là `activity_logs.action = 'gallery.confirm_retouch'` SỚM
 *    NHẤT của bộ đó (`submitted` → `in_retouch`, BB-121) — mỗi bộ chỉ có một
 *    lần chuyển vào `in_retouch` lần đầu qua route này, các vòng sửa sau quay
 *    lại `in_retouch` qua quyết định của khách (`/api/g/review`), không đi
 *    qua route này, nên mốc "nhận" dùng chung cho mọi lượt gửi của cùng bộ.
 *    KHÔNG tính được cho bộ chưa từng qua `confirm_retouch` (vd nhập tay/di
 *    trú dữ liệu cũ) — bộ đó bị loại khỏi mẫu tính trung vị, không tính là 0.
 *
 * "Tổng thao tác" (cột dùng xếp hạng/tỉ trọng/so kỳ trước ở bảng chính) =
 * tổng 5 chỉ số ĐẾM ĐƯỢC ở trên (không cộng "vòng khách xin sửa" — đó là tín
 * hiệu chất lượng, không phải khối lượng việc đã làm — và không cộng trung vị
 * thời gian). Một nhân viên vừa CSKH vừa đứng tên chỉnh ảnh thì cộng cả hai
 * vai vào cùng một dòng — schema không tách "vai" của một `staff_profiles`.
 */

import type { NguCanhBaoCao, KetQuaBaoCao, DinhNghiaBaoCao, TheSoBaoCao } from "../loai";
import { GHI_CHU_LOAI_TRU } from "../loc-chung";
import { chenhLechPhanTram, trungVi } from "../ky";
import { soSanhNhanVien, tongGiaTri, type DiemNhanVien } from "../so-sanh-nhan-vien";

interface GalleryEmbed {
  branch_id: string;
  title: string;
  status: string;
  editor_id: string | null;
}

function motGallery(raw: GalleryEmbed | GalleryEmbed[] | null): GalleryEmbed | null {
  if (!raw) return null;
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

function boQua(g: GalleryEmbed | null, chiNhanhIds: string[] | null): g is GalleryEmbed {
  if (!g) return false;
  if (g.status === "archived") return false;
  if (g.title.toLowerCase().startsWith("fixture")) return false;
  if (chiNhanhIds && !chiNhanhIds.includes(g.branch_id)) return false;
  return true;
}

/** Đếm số dòng `activity_logs` của một `action`, theo `actor_id`. Dùng cho các thao tác không cần biết `editor_id`. */
async function demTheoTacNhan(
  ctx: NguCanhBaoCao,
  action: string,
  tu: Date,
  den: Date,
): Promise<Map<string, number>> {
  const { data, error } = await ctx.client
    .from("activity_logs")
    .select("actor_id, galleries!inner(branch_id, title, status, editor_id)")
    .eq("action", action)
    .eq("actor_type", "staff")
    .gte("created_at", tu.toISOString())
    .lt("created_at", den.toISOString());
  if (error) throw error;
  const dem = new Map<string, number>();
  for (const r of (data ?? []) as { actor_id: string | null; galleries: GalleryEmbed | GalleryEmbed[] | null }[]) {
    const g = motGallery(r.galleries);
    if (!boQua(g, ctx.chiNhanhIds)) continue;
    if (!r.actor_id) continue;
    dem.set(r.actor_id, (dem.get(r.actor_id) ?? 0) + 1);
  }
  return dem;
}

interface HangRetouchSent {
  galleryId: string;
  actorId: string | null;
  createdAtMs: number;
  editorId: string | null;
}

/** Mọi dòng `gallery.retouch_sent` trong kỳ, đã lọc Fixture/archived/chi nhánh. */
async function retouchSentTrongKy(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<HangRetouchSent[]> {
  const { data, error } = await ctx.client
    .from("activity_logs")
    .select("gallery_id, actor_id, created_at, galleries!inner(branch_id, title, status, editor_id)")
    .eq("action", "gallery.retouch_sent")
    .eq("actor_type", "staff")
    .gte("created_at", tu.toISOString())
    .lt("created_at", den.toISOString());
  if (error) throw error;
  const ketQua: HangRetouchSent[] = [];
  for (const r of (data ?? []) as {
    gallery_id: string | null;
    actor_id: string | null;
    created_at: string;
    galleries: GalleryEmbed | GalleryEmbed[] | null;
  }[]) {
    const g = motGallery(r.galleries);
    if (!boQua(g, ctx.chiNhanhIds)) continue;
    if (!r.gallery_id) continue;
    ketQua.push({
      galleryId: r.gallery_id,
      actorId: r.actor_id,
      createdAtMs: new Date(r.created_at).getTime(),
      editorId: g.editor_id,
    });
  }
  return ketQua;
}

/** Mốc "nhận" (`gallery.confirm_retouch` sớm nhất) của từng bộ ảnh trong `galleryIds`. */
async function nhanTheoGallery(ctx: NguCanhBaoCao, galleryIds: string[]): Promise<Map<string, number>> {
  if (galleryIds.length === 0) return new Map();
  const { data, error } = await ctx.client
    .from("activity_logs")
    .select("gallery_id, created_at")
    .eq("action", "gallery.confirm_retouch")
    .in("gallery_id", galleryIds)
    .order("created_at", { ascending: true });
  if (error) throw error;
  const m = new Map<string, number>();
  for (const r of (data ?? []) as { gallery_id: string | null; created_at: string }[]) {
    if (!r.gallery_id) continue;
    if (!m.has(r.gallery_id)) m.set(r.gallery_id, new Date(r.created_at).getTime());
  }
  return m;
}

interface HangPayment {
  confirmed_by: string;
  galleries: GalleryEmbed | GalleryEmbed[] | null;
}

async function thuTienTheoCskh(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<Map<string, number>> {
  const { data, error } = await ctx.client
    .from("gallery_payments")
    .select("confirmed_by, galleries!inner(branch_id, title, status, editor_id)")
    .gte("confirmed_at", tu.toISOString())
    .lt("confirmed_at", den.toISOString());
  if (error) throw error;
  const dem = new Map<string, number>();
  for (const r of (data ?? []) as HangPayment[]) {
    const g = motGallery(r.galleries);
    if (!boQua(g, ctx.chiNhanhIds)) continue;
    dem.set(r.confirmed_by, (dem.get(r.confirmed_by) ?? 0) + 1);
  }
  return dem;
}

interface HangRevision {
  galleries: GalleryEmbed | GalleryEmbed[] | null;
}

async function vongXinSuaTheoThoChinh(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<Map<string, number>> {
  const { data, error } = await ctx.client
    .from("revision_requests")
    .select("galleries!inner(branch_id, title, status, editor_id)")
    .gte("created_at", tu.toISOString())
    .lt("created_at", den.toISOString());
  if (error) throw error;
  const dem = new Map<string, number>();
  for (const r of (data ?? []) as HangRevision[]) {
    const g = motGallery(r.galleries);
    if (!boQua(g, ctx.chiNhanhIds)) continue;
    if (!g.editor_id) continue;
    dem.set(g.editor_id, (dem.get(g.editor_id) ?? 0) + 1);
  }
  return dem;
}

/** Nhân viên thử (Fixture) bị loại: tên bắt đầu "Fixture" hoặc email demo. */
export function laNhanVienThu(fullName: string, email: string): boolean {
  return fullName.toLowerCase().startsWith("fixture") || email.toLowerCase().endsWith("@demo.babybean.vn");
}

async function tenNhanVien(ctx: NguCanhBaoCao, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await ctx.client.from("staff_profiles").select("id, full_name, email").in("id", ids);
  if (error) throw error;
  const m = new Map<string, string>();
  for (const s of (data ?? []) as { id: string; full_name: string; email: string }[]) {
    if (laNhanVienThu(s.full_name, s.email)) continue;
    m.set(s.id, s.full_name);
  }
  return m;
}

interface ChiSoDayDu {
  guiLink: Map<string, number>;
  xacNhanChuyen: Map<string, number>;
  thuTien: Map<string, number>;
  muaThem: Map<string, number>;
  guiBanChinh: Map<string, number>;
}

/** Tính 5 chỉ số đếm được (cả CSKH lẫn thợ chỉnh) cho một khoảng thời gian. */
async function tinhChiSoDayDu(ctx: NguCanhBaoCao, tu: Date, den: Date): Promise<ChiSoDayDu> {
  const [guiLink, xacNhanRows, thuTien, muaThem] = await Promise.all([
    demTheoTacNhan(ctx, "share_link.created", tu, den),
    retouchSentTrongKy(ctx, tu, den),
    thuTienTheoCskh(ctx, tu, den),
    demTheoTacNhan(ctx, "mua_them.doi_trang_thai", tu, den),
  ]);

  const xacNhanChuyen = new Map<string, number>();
  const guiBanChinhSet = new Map<string, Set<string>>();
  for (const r of xacNhanRows) {
    if (r.actorId) xacNhanChuyen.set(r.actorId, (xacNhanChuyen.get(r.actorId) ?? 0) + 1);
    if (r.editorId) {
      if (!guiBanChinhSet.has(r.editorId)) guiBanChinhSet.set(r.editorId, new Set());
      (guiBanChinhSet.get(r.editorId) as Set<string>).add(r.galleryId);
    }
  }
  const guiBanChinh = new Map<string, number>();
  for (const [k, v] of guiBanChinhSet) guiBanChinh.set(k, v.size);

  return { guiLink, xacNhanChuyen, thuTien, muaThem, guiBanChinh };
}

function tongThaoTac(id: string, c: ChiSoDayDu): number {
  return (
    (c.guiLink.get(id) ?? 0) +
    (c.xacNhanChuyen.get(id) ?? 0) +
    (c.thuTien.get(id) ?? 0) +
    (c.muaThem.get(id) ?? 0) +
    (c.guiBanChinh.get(id) ?? 0)
  );
}

const BANG_RONG = { cot: ["Nhân viên"], dong: [] as (string | number | null)[][] };

async function chay(ctx: NguCanhBaoCao): Promise<KetQuaBaoCao> {
  // README: `[]` nghĩa là nhân viên không có chi nhánh nào — trả rỗng, không throw.
  if (ctx.chiNhanhIds && ctx.chiNhanhIds.length === 0) {
    return { theSo: [], bang: BANG_RONG, ghiChu: [GHI_CHU_LOAI_TRU] };
  }

  const [chiSo, xacNhanRows, vongXinSua] = await Promise.all([
    tinhChiSoDayDu(ctx, ctx.tu, ctx.den),
    retouchSentTrongKy(ctx, ctx.tu, ctx.den),
    vongXinSuaTheoThoChinh(ctx, ctx.tu, ctx.den),
  ]);

  const galleryIdsCanNhan = [...new Set(xacNhanRows.map((r) => r.galleryId))];
  const nhanMap = await nhanTheoGallery(ctx, galleryIdsCanNhan);
  const thoiGianTheoThoChinh = new Map<string, number[]>();
  for (const r of xacNhanRows) {
    if (!r.editorId) continue;
    const nhan = nhanMap.get(r.galleryId);
    if (nhan === undefined) continue;
    const ngay = (r.createdAtMs - nhan) / 86_400_000;
    if (ngay < 0) continue; // dữ liệu bất thường (mốc lệch) — bỏ qua thay vì làm méo trung vị
    if (!thoiGianTheoThoChinh.has(r.editorId)) thoiGianTheoThoChinh.set(r.editorId, []);
    (thoiGianTheoThoChinh.get(r.editorId) as number[]).push(ngay);
  }
  const trungViTheoThoChinh = new Map<string, number | null>();
  for (const [id, arr] of thoiGianTheoThoChinh) trungViTheoThoChinh.set(id, trungVi(arr));

  let chiSoKyTruoc: ChiSoDayDu | null = null;
  if (ctx.kyTruoc) {
    chiSoKyTruoc = await tinhChiSoDayDu(ctx, ctx.kyTruoc.tu, ctx.kyTruoc.den);
  }

  const tatCaId = new Set<string>([
    ...chiSo.guiLink.keys(),
    ...chiSo.xacNhanChuyen.keys(),
    ...chiSo.thuTien.keys(),
    ...chiSo.muaThem.keys(),
    ...chiSo.guiBanChinh.keys(),
    ...vongXinSua.keys(),
  ]);

  const ten = await tenNhanVien(ctx, [...tatCaId]);

  const diem: DiemNhanVien[] = [...tatCaId]
    .filter((id) => ten.has(id))
    .map((id) => ({ staffId: id, ten: ten.get(id) as string, giaTri: tongThaoTac(id, chiSo) }));

  const kyTruocMap = new Map<string, number>();
  if (chiSoKyTruoc) {
    for (const id of tatCaId) kyTruocMap.set(id, tongThaoTac(id, chiSoKyTruoc));
  }

  const soSanh = soSanhNhanVien(diem, kyTruocMap);

  const bangDong: (string | number | null)[][] = soSanh.map((s) => {
    const trungViNgay = trungViTheoThoChinh.get(s.staffId) ?? null;
    return [
      s.ten,
      chiSo.guiLink.get(s.staffId) ?? 0,
      chiSo.xacNhanChuyen.get(s.staffId) ?? 0,
      chiSo.thuTien.get(s.staffId) ?? 0,
      chiSo.muaThem.get(s.staffId) ?? 0,
      chiSo.guiBanChinh.get(s.staffId) ?? 0,
      vongXinSua.get(s.staffId) ?? 0,
      trungViNgay === null ? "—" : Math.round(trungViNgay * 10) / 10,
      s.giaTri,
      s.kyTruoc,
      s.chenhLechPhanTram === null ? null : Math.round(s.chenhLechPhanTram * 10) / 10,
      s.tiTrongPhanTram === null ? null : Math.round(s.tiTrongPhanTram * 10) / 10,
      s.xepHang,
    ];
  });

  // Dòng TỔNG — cộng từng cột đếm được; trung vị và xếp hạng không cộng dồn.
  const tongGuiLink = tongGiaTri([...chiSo.guiLink.values()].map((giaTri) => ({ giaTri })));
  const tongXacNhan = tongGiaTri([...chiSo.xacNhanChuyen.values()].map((giaTri) => ({ giaTri })));
  const tongThuTien = tongGiaTri([...chiSo.thuTien.values()].map((giaTri) => ({ giaTri })));
  const tongMuaThem = tongGiaTri([...chiSo.muaThem.values()].map((giaTri) => ({ giaTri })));
  const tongGuiBanChinh = tongGiaTri([...chiSo.guiBanChinh.values()].map((giaTri) => ({ giaTri })));
  const tongVongXinSua = tongGiaTri([...vongXinSua.values()].map((giaTri) => ({ giaTri })));
  const tongThaoTacTatCa = tongGiaTri(diem);
  const tongKyTruocTatCa = chiSoKyTruoc ? tongGiaTri([...kyTruocMap.values()].map((giaTri) => ({ giaTri }))) : 0;
  bangDong.push([
    "Tổng",
    tongGuiLink,
    tongXacNhan,
    tongThuTien,
    tongMuaThem,
    tongGuiBanChinh,
    tongVongXinSua,
    "—",
    tongThaoTacTatCa,
    tongKyTruocTatCa,
    chiSoKyTruoc ? chenhLechPhanTram(tongThaoTacTatCa, tongKyTruocTatCa) : null,
    tongThaoTacTatCa === 0 ? null : 100,
    "—",
  ]);

  function theSoCoSanh(nhan: string, giaTri: number, donVi: string, kyTruocMapNguon?: Map<string, number>): TheSoBaoCao {
    if (!chiSoKyTruoc || !kyTruocMapNguon) return { nhan, giaTri, donVi };
    const kyTruocGiaTri = tongGiaTri([...kyTruocMapNguon.values()].map((g) => ({ giaTri: g })));
    return { nhan, giaTri, donVi, kyTruoc: kyTruocGiaTri, chenhLechPhanTram: chenhLechPhanTram(giaTri, kyTruocGiaTri) };
  }

  const theSo: TheSoBaoCao[] = [
    theSoCoSanh("Tổng link gửi khách", tongGuiLink, "link", chiSoKyTruoc?.guiLink),
    theSoCoSanh("Tổng xác nhận chuyển chỉnh", tongXacNhan, "lượt", chiSoKyTruoc?.xacNhanChuyen),
    theSoCoSanh("Tổng khoản thu ghi nhận", tongThuTien, "khoản", chiSoKyTruoc?.thuTien),
    theSoCoSanh("Tổng mua thêm đã xử lý", tongMuaThem, "yêu cầu", chiSoKyTruoc?.muaThem),
    theSoCoSanh("Tổng bộ gửi bản chỉnh", tongGuiBanChinh, "bộ", chiSoKyTruoc?.guiBanChinh),
    { nhan: "Tổng vòng khách xin sửa", giaTri: tongVongXinSua, donVi: "vòng" },
  ];

  const top10 = soSanh.slice(0, 10);

  return {
    theSo,
    bang: {
      cot: [
        "Nhân viên",
        "Link gửi khách",
        "Xác nhận chuyển chỉnh",
        "Khoản thu ghi nhận",
        "Mua thêm đã xử lý",
        "Bộ gửi bản chỉnh",
        "Vòng khách xin sửa",
        "Trung vị nhận → gửi (ngày)",
        "Tổng thao tác",
        "Kỳ trước",
        "Chênh lệch %",
        "Tỉ trọng % trên tổng",
        "Xếp hạng",
      ],
      dong: bangDong,
    },
    bieuDo: {
      loai: "cot",
      nhan: top10.map((s) => s.ten),
      chuoi: [{ ten: "Tổng thao tác", giaTri: top10.map((s) => s.giaTri) }],
    },
    ghiChu: [
      GHI_CHU_LOAI_TRU,
      "Đã loại nhân viên thử (tên bắt đầu \"Fixture\" hoặc email @demo.babybean.vn) khỏi bảng.",
      "\"Tổng thao tác\" = Link gửi khách + Xác nhận chuyển chỉnh + Khoản thu ghi nhận + Mua thêm đã xử lý + Bộ gửi bản chỉnh. \"Vòng khách xin sửa\" và \"Trung vị nhận → gửi\" là chỉ số chất lượng, không cộng vào cột này.",
      "\"Trung vị nhận → gửi\" chỉ tính trên bộ có mốc `gallery.confirm_retouch` (chuyển vào chỉnh sửa qua route xác nhận) — bộ nhập tay/di trú dữ liệu cũ không có mốc này bị loại khỏi mẫu tính, không tính là 0.",
      "Một nhân viên vừa làm CSKH vừa đứng tên chỉnh ảnh (`editor_id`) thì các chỉ số của cả hai vai được cộng vào cùng một dòng.",
    ],
  };
}

export const hieuSuatNhanVien: DinhNghiaBaoCao = {
  ma: "hieu-suat-nhan-vien",
  ten: "Hiệu suất nhân viên",
  moTa: "So từng nhân viên với nhau, với tổng, và với kỳ trước — trên các thao tác CSKH và thợ chỉnh có ghi log thật.",
  nhom: "nhan-vien",
  quyen: "reports:operations",
  boLoc: { kySoSanh: true, theoNhanVien: true },
  chay,
};
