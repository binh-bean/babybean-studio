/**
 * BB-392 mục 2 (anh 06/10, mục 9): "khi trong link ảnh có thư mục ảnh chỉnh
 * sửa thì có nghĩa là có ảnh chỉnh sửa cần gửi và thông báo cho khách — bắn
 * công việc cho CSKH".
 *
 * Trước đây app chỉ biết có ảnh chỉnh khi ai đó bấm "Đồng bộ ảnh". Nay cron
 * hậu kỳ 08:00 (gói Hobby: một lượt/ngày — KHÔNG thêm cron) quét NHẸ:
 *   1. Chọn bộ đang ở giai đoạn chỉnh (`laBoCanQuetAnhChinh`) mà app CHƯA có
 *      tấm ảnh chỉnh nào.
 *   2. Mỗi bộ: hỏi Drive MỘT lệnh — thư mục gốc có thư mục con "ảnh chỉnh sửa"
 *      (`laThuMucChinhSua`) không.
 *   3. Có → kéo ảnh về bằng ĐÚNG đường đồng bộ của nút "Đồng bộ ảnh"
 *      (`batDauDongBo` + `dongBoBoAnh`). Ảnh chỉnh nằm CHỜ CSKH bấm "Gửi khách
 *      duyệt" — khách chỉ thấy sau lượt gửi (`khachThayAnhChinh`), nên quét
 *      KHÔNG bao giờ tự gửi khách.
 * Trần số bộ mỗi lượt + nghỉ giữa các bộ + mốc hết giờ, để không ăn hết 60
 * giây của cron và không dội Drive.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { laThuMucChinhSua, TRANG_THAI_GUI_DUOC } from "./nhan-dien";
import { giaiDoanCua } from "@/lib/lark/trang-thai-hau-ky";

/** Trần số bộ hỏi Drive mỗi sáng. */
export const GIOI_HAN_QUET_ANH_CHINH = 40;
/** Nghỉ giữa hai bộ — Drive API key dùng chung cả app. */
export const NGHI_GIUA_BO_MS = 250;

/** Lọc thô phía cơ sở dữ liệu (tập cha của `laThuMucChinhSua`), cùng chuỗi với du-lieu.ts. */
const LOC_THO =
  "subfolder.ilike.*ch*nh*,subfolder.ilike.*edit*,subfolder.ilike.*retouch*," +
  "subfolder.ilike.*s_a*,subfolder.ilike.*su*a*,subfolder.ilike.*h*u*k*";

export interface BoUngVienQuet {
  id: string;
  status: string;
  lark_trang_thai: string | null;
  drive_folder_id: string | null;
  branch_id: string | null;
}

/**
 * HÀM THUẦN — bộ này có cần hỏi Drive tìm thư mục ảnh chỉnh sửa không.
 *
 *  - App đã có ảnh chỉnh → không (việc "chờ gửi" đã hiện ở Việc cần xử lý; ảnh
 *    mới thêm sau đó vẫn do CSKH bấm Đồng bộ — quét chỉ lo lần ĐẦU).
 *  - Không có thư mục Drive → không.
 *  - Lark đã qua "Đã chốt chưa in" (giai đoạn ≥ 7) → không (bộ đã giao, có thư
 *    mục ảnh chỉnh là bình thường) — cùng luật với Việc cần xử lý.
 *  - App `submitted` (ba mẹ đã chốt) / `in_retouch` (đã xác nhận, đang chỉnh) → có.
 *  - Lark báo "Leader check hình" / "Đã gửi duyệt" (4, 5) mà bộ còn ở trạng thái
 *    gửi khách duyệt được → có.
 */
export function laBoCanQuetAnhChinh(b: BoUngVienQuet, coAnhChinhTrongApp: boolean): boolean {
  if (coAnhChinhTrongApp) return false;
  if (!b.drive_folder_id) return false;
  if (!(TRANG_THAI_GUI_DUOC as readonly string[]).includes(b.status)) return false;
  const gd = giaiDoanCua(b.lark_trang_thai);
  if (gd !== null && gd >= 7) return false;
  if (b.status === "submitted" || b.status === "in_retouch") return true;
  return gd === 4 || gd === 5;
}

/**
 * HÀM THUẦN — chọn tối đa `gioiHan` bộ cho lượt hôm nay. Bộ Lark đã báo chỉnh
 * xong (giai đoạn 4, 5) đứng trước; phần còn lại xoay vòng theo ngày để hơn
 * `gioiHan` bộ thì vài sáng cũng quét hết, không kẹt mãi ở 40 bộ đầu.
 */
export function chonBoQuetLuotNay<T extends BoUngVienQuet>(ds: readonly T[], gioiHan: number, homNay: Date): T[] {
  const uuTien = (b: T) => {
    const gd = giaiDoanCua(b.lark_trang_thai);
    return gd === 4 || gd === 5 ? 0 : 1;
  };
  const xep = [...ds].sort((a, b) => uuTien(a) - uuTien(b) || a.id.localeCompare(b.id));
  if (xep.length <= gioiHan) return xep;
  const dau = xep.filter((b) => uuTien(b) === 0).slice(0, gioiHan);
  const conLai = xep.filter((b) => uuTien(b) === 1);
  const cho = gioiHan - dau.length;
  if (cho <= 0 || conLai.length === 0) return dau;
  if (conLai.length <= cho) return [...dau, ...conLai];
  const ngay = Math.floor(homNay.getTime() / 86_400_000);
  const tu = (ngay * cho) % conLai.length;
  return [...dau, ...[...conLai.slice(tu), ...conLai.slice(0, tu)].slice(0, cho)];
}

export interface KetQuaQuetAnhChinh {
  ungVien: number;
  daHoi: number;
  coThuMuc: number;
  daKeo: number;
  loi: number;
  hetGio: boolean;
}

/**
 * Chạy một lượt quét. Drive và đường đồng bộ TRUYỀN VÀO (`coThuMucChinhSua`,
 * `keoAnh`) — cron truyền bản thật (`coThuMucChinhSuaTrenDrive`,
 * `keoAnhChinhVeApp`), phép thử truyền bản giả, không gọi mạng.
 */
export async function quetAnhChinhTuDrive(opts: {
  db: SupabaseClient;
  coThuMucChinhSua: (driveFolderId: string, requestId: string) => Promise<boolean>;
  keoAnh: (galleryId: string, requestId: string) => Promise<{ photoCount: number }>;
  ghiNhatKy?: (dong: { galleryId: string; branchId: string | null; soAnh: number; requestId: string }) => Promise<void>;
  requestId: string;
  gioiHan?: number;
  nghiMs?: number;
  hetGioLuc?: number;
  homNay?: Date;
  ngu?: (ms: number) => Promise<void>;
}): Promise<KetQuaQuetAnhChinh> {
  const { db } = opts;
  const gioiHan = opts.gioiHan ?? GIOI_HAN_QUET_ANH_CHINH;
  const nghiMs = opts.nghiMs ?? NGHI_GIUA_BO_MS;
  const ngu = opts.ngu ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  // 1. Bộ ứng viên (trạng thái gửi khách duyệt được, có thư mục Drive).
  const boThuan: BoUngVienQuet[] = [];
  for (let tu = 0; ; tu += 1000) {
    const { data, error } = await db
      .from("galleries")
      .select("id, status, lark_trang_thai, drive_folder_id, branch_id")
      .in("status", [...TRANG_THAI_GUI_DUOC])
      .not("drive_folder_id", "is", null)
      .order("id", { ascending: true })
      .range(tu, tu + 999);
    if (error) throw error;
    const trang = (data ?? []) as BoUngVienQuet[];
    boThuan.push(...trang.filter((b) => laBoCanQuetAnhChinh(b, false)));
    if (trang.length < 1000) break;
  }

  // 2. Bộ nào app đã có ảnh chỉnh (lọc thô ở DB, lọc đúng bằng laThuMucChinhSua).
  const daCo = new Set<string>();
  const NHOM = 40;
  for (let i = 0; i < boThuan.length; i += NHOM) {
    const ids = boThuan.slice(i, i + NHOM).map((b) => b.id);
    for (let tu = 0; ; tu += 1000) {
      const { data, error } = await db
        .from("photos")
        .select("gallery_id, subfolder")
        .in("gallery_id", ids)
        .not("subfolder", "is", null)
        .or(LOC_THO)
        .order("id", { ascending: true })
        .range(tu, tu + 999);
      if (error) throw error;
      const trang = (data ?? []) as { gallery_id: string; subfolder: string | null }[];
      for (const p of trang) if (laThuMucChinhSua(p.subfolder)) daCo.add(p.gallery_id);
      if (trang.length < 1000) break;
    }
  }
  const ungVien = boThuan.filter((b) => laBoCanQuetAnhChinh(b, daCo.has(b.id)));
  const chon = chonBoQuetLuotNay(ungVien, gioiHan, opts.homNay ?? new Date());

  const kq: KetQuaQuetAnhChinh = { ungVien: ungVien.length, daHoi: 0, coThuMuc: 0, daKeo: 0, loi: 0, hetGio: false };
  for (const [i, b] of chon.entries()) {
    if (opts.hetGioLuc !== undefined && Date.now() >= opts.hetGioLuc) {
      kq.hetGio = true;
      break;
    }
    if (i > 0 && nghiMs > 0) await ngu(nghiMs);
    try {
      kq.daHoi++;
      const co = await opts.coThuMucChinhSua(b.drive_folder_id!, opts.requestId);
      if (!co) continue;
      kq.coThuMuc++;
      const r = await opts.keoAnh(b.id, opts.requestId);
      kq.daKeo++;
      await opts.ghiNhatKy?.({ galleryId: b.id, branchId: b.branch_id, soAnh: r.photoCount, requestId: opts.requestId });
    } catch (err) {
      kq.loi++;
      console.error(
        JSON.stringify({
          evt: "anh_chinh.quet_loi",
          galleryId: b.id,
          lyDo: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }
  console.info(JSON.stringify({ evt: "anh_chinh.quet_xong", ...kq }));
  return kq;
}

// ---------------------------------------------------------------------------
// Dòng nhắc CSKH trong tin hậu kỳ 08:00
// ---------------------------------------------------------------------------

export interface BoChoGui {
  galleryId: string;
  title: string;
  branchId: string | null;
  soAnh: number;
  /** Lúc tấm ảnh chỉnh mới nhất về (ISO). */
  luc: string;
}

export interface TinAnhChinhChoGui {
  branchId: string | null;
  cacBo: { galleryId: string; galleryTitle: string; customerName: null; customerPhone: null; soNgay: number; moc: number }[];
}

/**
 * HÀM THUẦN — gom việc "ảnh chỉnh chờ gửi khách duyệt" theo chi nhánh thành
 * payload thẻ `hau_ky.nhac` loại `anh_chinh_cho_gui`. Không tên/số khách: thẻ
 * nói "N bộ" + tên bộ + nút mở; CSKH vào app xem chi tiết.
 */
export function gomTinAnhChinhChoGui(viec: readonly BoChoGui[], homNay: Date): TinAnhChinhChoGui[] {
  const theoChiNhanh = new Map<string, TinAnhChinhChoGui>();
  for (const v of viec) {
    const khoa = v.branchId ?? "-";
    const tin = theoChiNhanh.get(khoa) ?? { branchId: v.branchId, cacBo: [] };
    const soNgay = Math.max(0, Math.floor((homNay.getTime() - new Date(v.luc).getTime()) / 86_400_000));
    tin.cacBo.push({ galleryId: v.galleryId, galleryTitle: v.title, customerName: null, customerPhone: null, soNgay, moc: v.soAnh });
    theoChiNhanh.set(khoa, tin);
  }
  return [...theoChiNhanh.values()];
}

/**
 * HÀM THUẦN — việc "Ảnh chỉnh sửa" (layViecAnhChinh) → mỗi BỘ một dòng chờ gửi
 * (gộp các đợt mua thêm của cùng bộ: cộng số ảnh, lấy lúc mới nhất). Việc "ba mẹ
 * xin sửa" không thuộc dòng nhắc này.
 */
export function gopViecChoGuiTheoBo(
  viec: readonly { loai: string; galleryId: string; title: string; branchId: string | null; soAnh: number; luc: string }[],
): BoChoGui[] {
  const theoBo = new Map<string, BoChoGui>();
  for (const v of viec) {
    if (v.loai !== "cho_gui") continue;
    const cu = theoBo.get(v.galleryId);
    if (!cu) {
      theoBo.set(v.galleryId, { galleryId: v.galleryId, title: v.title, branchId: v.branchId, soAnh: v.soAnh, luc: v.luc });
      continue;
    }
    cu.soAnh += v.soAnh;
    if (v.luc > cu.luc) cu.luc = v.luc;
  }
  return [...theoBo.values()];
}
