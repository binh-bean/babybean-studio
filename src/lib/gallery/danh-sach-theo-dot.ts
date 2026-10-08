/**
 * Danh sách ảnh khách chọn THEO ĐỢT, hiện ngay trên trang — BB-403.
 *
 * Anh 08/10/2026: "Các đợt chọn ảnh và chi tiết chọn ảnh các đợt anh không muốn tải về, mà
 * hiển thị ngay trên thanh như đợt một — chỗ đó có hiển thị các đợt để chọn, copy…"
 *
 * Toàn bộ phần KHÔNG phải giao diện nằm ở đây (thuần, không React) để phép thử bấm đợt / bấm
 * chép chạy được không cần trình duyệt: chọn chip nào, gọi địa chỉ nào, chép gì, báo gì.
 *
 * MỘT nguồn dữ liệu: route `/api/admin/galleries/:id/export` (`hien=1` không ghi nhật ký,
 * `dot=N` chỉ lấy ảnh đợt N, `format=chi-tiet` là bản chi tiết). Không có truy vấn thứ hai.
 */

export type DinhDangDanhSach = "ten-file" | "chi-tiet";

/** Đợt đang xem: số đợt, hoặc "tat-ca" (mọi đợt, như danh sách cũ). */
export type LuaChonDot = number | "tat-ca";

/** Phần của một đợt (từ `detail.dotChon`) mà khối danh sách cần. */
export interface DotChoDanhSach {
  soDot: number;
  laDot1: boolean;
  trangThai: string | null;
  soAnh: number;
  /** Ảnh còn trong đợt (đợt bị từ chối / mở lại thì rỗng — không có gì để xem). */
  anh: ReadonlyArray<unknown>;
}

export interface ChipDot {
  soDot: number;
  laDot1: boolean;
  trangThai: string | null;
  soAnh: number;
}

/**
 * Các chip đợt thật sự có để chọn. Đợt 1 luôn có; đợt ≥ 2 chỉ khi còn ảnh (đợt bị từ chối /
 * mở lại đã trả ảnh về cho khách). Chỉ MỘT đợt thì không cần hàng chọn → mảng rỗng, danh sách
 * hiện như trước (không kèm `dot`).
 */
export function cacChipDot(dotChon: ReadonlyArray<DotChoDanhSach> | null | undefined): ChipDot[] {
  const chip = (dotChon ?? [])
    .filter((d) => d.laDot1 || d.anh.length > 0)
    .map((d) => ({ soDot: d.soDot, laDot1: d.laDot1, trangThai: d.trangThai, soAnh: d.anh.length > 0 ? d.anh.length : d.soAnh }))
    .sort((a, b) => a.soDot - b.soDot);
  return chip.length >= 2 ? chip : [];
}

/**
 * Đợt mở sẵn: đợt MỚI NHẤT đang chờ xác nhận (việc CSKH cần làm ngay); không có đợt nào chờ
 * thì "Tất cả" (giữ đúng danh sách cũ). Không có hàng chip → null (đợt 1 duy nhất).
 */
export function dotMacDinh(chip: ReadonlyArray<ChipDot>): LuaChonDot | null {
  if (chip.length === 0) return null;
  const cho = chip.filter((c) => c.trangThai === "cho_xac_nhan");
  if (cho.length > 0) return cho[cho.length - 1]!.soDot;
  return "tat-ca";
}

/** Lựa chọn của người dùng còn hợp lệ không (đợt có thể biến mất sau khi tải lại trang). */
export function dotHopLe(chon: LuaChonDot | null, chip: ReadonlyArray<ChipDot>): LuaChonDot | null {
  if (chip.length === 0) return null;
  if (chon === "tat-ca") return "tat-ca";
  if (chon !== null && chip.some((c) => c.soDot === chon)) return chon;
  return dotMacDinh(chip);
}

/** Địa chỉ route xuất cho một (định dạng, đợt). `null` = không lọc đợt. */
export function duongDanDanhSach(galleryId: string, dinhDang: DinhDangDanhSach, dot: number | null): string {
  const tham = [dinhDang === "chi-tiet" ? "format=chi-tiet" : "", "hien=1", dot !== null ? `dot=${dot}` : ""].filter(Boolean);
  return `/api/admin/galleries/${encodeURIComponent(galleryId)}/export?${tham.join("&")}`;
}

export function dotCuaLuaChon(chon: LuaChonDot | null): number | null {
  return typeof chon === "number" ? chon : null;
}

// ---------------------------------------------------------------------------
// Mở đúng đợt từ chỗ khác (thẻ "Đợt chọn", hàng đợi "Việc cần xử lý")
// ---------------------------------------------------------------------------

export const MA_KHOI_DANH_SACH = "xuat-danh-sach";
export const SU_KIEN_MO_DOT = "bb403-mo-danh-sach-dot";

/** `#xuat-danh-sach-dot-2` → mở đợt 2; `#xuat-danh-sach` → không chỉ định đợt. */
export function docDotTuHash(hash: string): LuaChonDot | null {
  const m = /^#xuat-danh-sach-dot-(\d{1,3})$/.exec(hash);
  if (m) return Number(m[1]);
  if (hash === "#xuat-danh-sach-tat-ca") return "tat-ca";
  return null;
}

/** Địa chỉ trang chi tiết bộ ảnh mở thẳng khối danh sách ở đúng đợt (dùng từ trang khác). */
export function duongDanMoDanhSach(galleryId: string, dot: LuaChonDot | null): string {
  const hash =
    dot === null ? `#${MA_KHOI_DANH_SACH}` : dot === "tat-ca" ? `#${MA_KHOI_DANH_SACH}-tat-ca` : `#${MA_KHOI_DANH_SACH}-dot-${dot}`;
  return `/admin/galleries/${encodeURIComponent(galleryId)}${hash}`;
}

/** Cùng trang: báo khối danh sách chuyển sang đợt N rồi cuộn tới đó. */
export function moDanhSachDot(dot: LuaChonDot): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<LuaChonDot>(SU_KIEN_MO_DOT, { detail: dot }));
}

// ---------------------------------------------------------------------------
// Lấy chữ + chép
// ---------------------------------------------------------------------------

export type KetQuaLay = { ok: true; chu: string } | { ok: false; loi: string };

export interface BoLayDanhSach {
  lay(dinhDang: DinhDangDanhSach, dot: number | null): Promise<KetQuaLay>;
  /** Bỏ bộ nhớ đệm (khi bộ ảnh đổi: số ảnh khác, đợt vừa xác nhận…). */
  xoaDem(): void;
}

/**
 * Lấy chữ từ route xuất, nhớ lại theo (định dạng, đợt) để bấm chép lần hai không gọi lại.
 * Lỗi KHÔNG được nhớ — bấm lại là thử lại.
 */
export function taoBoLayDanhSach(galleryId: string, fetchFn: typeof fetch = (...a) => fetch(...a)): BoLayDanhSach {
  const dem = new Map<string, string>();
  return {
    xoaDem: () => dem.clear(),
    async lay(dinhDang, dot) {
      const khoa = `${dinhDang}|${dot ?? ""}`;
      const cu = dem.get(khoa);
      if (cu !== undefined) return { ok: true, chu: cu };
      try {
        const res = await fetchFn(duongDanDanhSach(galleryId, dinhDang, dot), { cache: "no-store" });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          return { ok: false, loi: json?.error?.message ?? "Không tải được danh sách" };
        }
        const chu = await res.text();
        dem.set(khoa, chu);
        return { ok: true, chu };
      } catch {
        return { ok: false, loi: "Mất kết nối, thử lại giúp." };
      }
    },
  };
}

/** Số tên tệp trong bản "danh sách" (mỗi dòng một tên). */
export function demTenTep(chu: string): number {
  return chu.split(/\r?\n/).filter((d) => d.trim() !== "").length;
}

export type KetQuaChep = { ok: true; thongBao: string } | { ok: false; loi: string };

export const LOI_TRINH_DUYET_CHAN_CHEP = "Trình duyệt chặn chép — bôi đen khung chữ rồi Ctrl+C giúp.";

/**
 * Chép MỘT định dạng của đợt đang xem vào bộ nhớ tạm. Tên tệp: báo đúng số tên tệp vừa chép.
 * Bản chi tiết: báo số ảnh của đợt (`soAnhDot`) — chính bản chi tiết còn nhiều dòng tóm tắt.
 */
export async function chepDanhSach(
  bo: BoLayDanhSach,
  clipboard: { writeText(chu: string): Promise<void> } | undefined,
  dinhDang: DinhDangDanhSach,
  dot: number | null,
  soAnhDot: number,
): Promise<KetQuaChep> {
  const kq = await bo.lay(dinhDang, dot);
  if (!kq.ok) return { ok: false, loi: kq.loi };
  try {
    if (!clipboard) throw new Error("no clipboard");
    await clipboard.writeText(kq.chu);
  } catch {
    return { ok: false, loi: LOI_TRINH_DUYET_CHAN_CHEP };
  }
  const n = dinhDang === "ten-file" ? demTenTep(kq.chu) : soAnhDot;
  return { ok: true, thongBao: `Đã chép ${n} tệp` };
}
