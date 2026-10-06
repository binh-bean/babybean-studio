/**
 * BB-334A — danh sách bộ ảnh của MỘT nhà cho trang gia đình (`GET /api/k/[ma]`)
 * và manifest/icon theo nhà. Hợp đồng: docs/29-link-gia-dinh.md §2.1.
 *
 * Luật hiện: cùng `/api/g/buoi-chup` — có ít nhất một tấm, không `draft` /
 * `archived` (`TRANG_THAI_AN_VOI_GIA_DINH`). Trạng thái lấy từ `trangThaiKhach()`
 * (BB-353) — không tự viết nhãn.
 *
 * Không trả: tiền hợp đồng, số điện thoại, tên ba mẹ, mã Lark, drive_folder_id.
 * `coverDriveFileId` chỉ dùng TRONG máy chủ (icon), route không được trả ra.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { trangThaiKhach } from "@/lib/lark/trang-thai-app-lark";
import { khoaChonCuaKhach } from "@/lib/gallery/khoa-chon-khach";
import { nhanHienThi } from "@/lib/lark/trang-thai-hau-ky";
import { tinhTenBiaTuDuLieu } from "@/lib/utils/dinh-dang";
import { laLoiThieuCot } from "@/lib/gallery/dot-chon-server";
import { TRANG_THAI_AN_VOI_GIA_DINH } from "@/lib/auth/phien-bo-anh";
import { tenNha, type BeTrongNha } from "@/lib/gia-dinh/ten-nha";
import { tieuDeChoKhach } from "@/lib/utils/ten-bo-than-thien";

export type MaBuocTiepTheo = "chon_anh" | "duyet_anh" | "xem_anh" | "nhan_bean";

export interface BoAnhGiaDinh {
  id: string;
  soThuTu: number;
  tieuDe: string;
  tenBe: string | null;
  ngayChup: string | null;
  soAnh: number;
  anhBiaId: string | null;
  trangThai: {
    ma: string;
    khach: string;
    bia: string;
    buocKhach: number | null;
    giaiDoan: number | null;
  };
  buocTiepTheo: { ma: MaBuocTiepTheo; nhan: string };
  khoaChon: boolean;
}

/** Thêm vài trường chỉ dùng trong máy chủ — KHÔNG trả ra trình duyệt. */
export interface BoAnhGiaDinhNoiBo extends BoAnhGiaDinh {
  _taoLuc: string;
  _be: BeTrongNha | null;
}

const NHAN_BUOC: Record<MaBuocTiepTheo, string> = {
  chon_anh: "Chọn ảnh",
  duyet_anh: "Duyệt ảnh đã chỉnh",
  xem_anh: "Xem ảnh",
  nhan_bean: "Nhắn Bean",
};

/** Bước tiếp theo của ba mẹ — suy từ CÙNG `trangThaiKhach()`, không bảng riêng. */
export function buocTiepTheo(status: string, buocKhach: number | null, khoa: boolean): MaBuocTiepTheo {
  if (status === "awaiting_approval") return "duyet_anh";
  if (buocKhach === 0) return khoa ? "nhan_bean" : "chon_anh";
  return "xem_anh";
}

type Dong = {
  id: string;
  title: string | null;
  status: string;
  photo_count: number | null;
  cover_photo_id: string | null;
  created_at: string;
  so_thu_tu_khach?: number | null;
  lark_trang_thai: string | null;
  lark_trang_thai_tu: string | null;
  reopened_at: string | null;
  shoot: unknown;
  baby: unknown;
};

const COT_CHUNG =
  "id, title, status, photo_count, cover_photo_id, created_at, lark_trang_thai, lark_trang_thai_tu, reopened_at, shoot:shoots(shoot_date), baby:babies(nickname, full_name)";

function motDong<T>(raw: unknown): T | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (v as T | null | undefined) ?? null;
}

/**
 * Đọc MỌI bộ của khách (kể cả bộ đang ẩn) để đánh số ổn định, rồi lọc bộ hiện.
 * 0090 chưa áp → số thứ tự = vị trí theo (created_at, id) trong mọi bộ của khách —
 * đúng cách 0090 điền ngược.
 */
async function docMoiBo(admin: SupabaseClient, customerId: string): Promise<{ dong: Dong; so: number }[]> {
  const coCot = await admin
    .from("galleries")
    .select(`${COT_CHUNG}, so_thu_tu_khach`)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });

  let rows: Dong[];
  let daCoSo = true;
  if (coCot.error) {
    if (!laLoiThieuCot(coCot.error)) throw coCot.error;
    daCoSo = false;
    const khong = await admin
      .from("galleries")
      .select(COT_CHUNG)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (khong.error) throw khong.error;
    rows = (khong.data ?? []) as unknown as Dong[];
  } else {
    rows = (coCot.data ?? []) as unknown as Dong[];
  }

  return rows.map((dong, i) => ({
    dong,
    so: daCoSo && dong.so_thu_tu_khach != null ? dong.so_thu_tu_khach : i + 1,
  }));
}

/**
 * BB-368 — số thứ tự `n` (trong `/k/<mã>/<n>`) của MỌI bộ của khách, kể cả bộ
 * đang ẩn (chưa có ảnh). Cùng cách đánh số với trang gia đình (`docMoiBo`), nên
 * link màn con nhân viên chép / ghi Lark luôn mở đúng bộ mà `GET /api/k/<mã>`
 * trả về. Không phụ thuộc cột `so_thu_tu_khach` (0090 chưa áp).
 */
export async function soThuTuCacBo(admin: SupabaseClient, customerId: string): Promise<Map<string, number>> {
  const tatCa = await docMoiBo(admin, customerId);
  return new Map(tatCa.map(({ dong, so }) => [dong.id, so]));
}

export async function danhSachBoAnhGiaDinh(
  admin: SupabaseClient,
  customerId: string,
): Promise<BoAnhGiaDinhNoiBo[]> {
  const tatCa = await docMoiBo(admin, customerId);
  const an = TRANG_THAI_AN_VOI_GIA_DINH as readonly string[];

  const ds = tatCa
    .filter(({ dong }) => (dong.photo_count ?? 0) > 0 && !an.includes(dong.status))
    .map(({ dong, so }): BoAnhGiaDinhNoiBo => {
      const be = motDong<{ nickname: string | null; full_name: string | null }>(dong.baby);
      const shoot = motDong<{ shoot_date: string | null }>(dong.shoot);
      const { khoa, quaHan60Ngay, larkHieuLuc } = khoaChonCuaKhach(dong);
      const tienDo = nhanHienThi(dong.status, larkHieuLuc, (s) => s);
      const tt = trangThaiKhach(dong.status, tienDo.giaiDoan, { khoa: khoa || quaHan60Ngay });
      const tenBe = be ? tinhTenBiaTuDuLieu(be.nickname, be.full_name) || null : null;
      const ma = buocTiepTheo(dong.status, tt.buocKhach, khoa || quaHan60Ngay);
      return {
        id: dong.id,
        soThuTu: so,
        // BB-370 — `title` từ Lark là MÃ HOÁ ĐƠN ("HD_20260909#5067"): không
        // gửi ra trình duyệt khách. Rỗng thì màn khách dựng tên từ bé + ngày chụp.
        tieuDe: tieuDeChoKhach(dong.title) ?? "",
        tenBe,
        ngayChup: shoot?.shoot_date ?? null,
        soAnh: dong.photo_count ?? 0,
        anhBiaId: dong.cover_photo_id,
        trangThai: {
          ma: tt.ma,
          khach: tt.khach,
          bia: tt.bia.replace("{be}", tenBe?.trim() || "bé"),
          buocKhach: tt.buocKhach,
          giaiDoan: tienDo.giaiDoan,
        },
        buocTiepTheo: { ma, nhan: NHAN_BUOC[ma] },
        khoaChon: khoa || quaHan60Ngay,
        _taoLuc: dong.created_at,
        _be: be ? { nickname: be.nickname, fullName: be.full_name } : null,
      };
    });

  // Mới nhất trước: ngày chụp, rồi số thứ tự (bộ chưa gắn buổi chụp xuống cuối).
  ds.sort((a, b) => (b.ngayChup ?? "").localeCompare(a.ngayChup ?? "") || b.soThuTu - a.soThuTu);
  return ds;
}

/** Bỏ các trường nội bộ trước khi trả ra trình duyệt. */
export function choKhach(ds: BoAnhGiaDinhNoiBo[]): BoAnhGiaDinh[] {
  return ds.map(({ _taoLuc: _a, _be: _b, ...con }) => con);
}

/** Tên nhà theo các bé, bé của bộ mới nhất trước. */
export function tenNhaTuDanhSach(ds: BoAnhGiaDinhNoiBo[]): { tenNha: string; tenNgan: string } {
  return tenNha(ds.map((b) => b._be).filter((b): b is BeTrongNha => !!b));
}
