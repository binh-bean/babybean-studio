/**
 * BB-401 — ba mẹ duyệt ảnh đã chỉnh TỪNG TẤM ngay trong màn xem lớn.
 *
 * Anh 08/10: "Màn khách duyệt ảnh chỉnh sửa đang CHỈ có so sánh và xem tiến/lùi ảnh."
 * Nguyên nhân (BB-384): bảng ghi chú của tấm chỉ hiện khi ba mẹ đã bấm "Yêu cầu sửa"
 * Ở DƯỚI LƯỚI trước rồi mới mở ảnh — mở ảnh thẳng (đường tự nhiên) thì chỉ có so sánh
 * + tiến/lùi; và không có "Duyệt tấm này" nào cả.
 *
 * Tệp này là phần THUẦN (không React, không mạng trừ hai hàm gửi nhận `goi` từ ngoài):
 *   · bản nháp quyết định từng tấm (`NhapDuyet`) và các phép đổi bản nháp;
 *   · trạng thái hiện trên tấm (Đã duyệt / Xin sửa / Chưa xem / Đã xem);
 *   · kế hoạch gửi: mỗi vòng duyệt (trong gói / đợt mua thêm) một lượt `/api/g/review`;
 *   · ảnh minh hoạ: kiểm loại/dung lượng, nén phía máy, gửi lên route `anh-mau`.
 */

import { KHOA_TRONG_GOI, type TrangThaiDuyetDot } from "./theo-dot";
import { TOI_DA_ANH_MAU, TOI_DA_BYTE_ANH_MAU, TOI_DA_GHI_CHU, type VungKhoanh } from "./nhan-dien";

/** Tối đa vùng khoanh một tấm (cùng trần `chuanHoaVung` phía máy chủ). */
export const TOI_DA_VUNG_MOT_TAM = 10;

export interface AnhMinhHoa {
  /** Đường dẫn trong bucket riêng tư (`<galleryId>/<uuid>.<đuôi>`) — thứ máy chủ nhận. */
  duongDan: string;
  /** URL xem trước trên máy (blob:) — mất khi tải lại trang, khi đó hiện ô chữ thay ảnh. */
  xem?: string;
}

export interface NhapTam {
  /** "duyet" = ba mẹ ưng tấm này; "sua" = xin sửa. Chuyển qua lại không mất ghi chú. */
  trangThai: "duyet" | "sua";
  ghiChu: string;
  vung: VungKhoanh[];
  anhMau: AnhMinhHoa[];
}

/** photoId → quyết định của ba mẹ (chưa gửi). Thiếu khoá = chưa quyết. */
export type NhapDuyet = Readonly<Record<string, NhapTam>>;

const TRONG: Omit<NhapTam, "trangThai"> = { ghiChu: "", vung: [], anhMau: [] };

export function datDuyet(nhap: NhapDuyet, id: string): NhapDuyet {
  return { ...nhap, [id]: { ...TRONG, ...nhap[id], trangThai: "duyet" } };
}

/** Xin sửa tấm `id` — giữ nguyên ghi chú/vùng/ảnh đã nhập trước đó (lỡ bấm Duyệt rồi đổi ý). */
export function datSua(nhap: NhapDuyet, id: string): NhapDuyet {
  return { ...nhap, [id]: { ...TRONG, ...nhap[id], trangThai: "sua" } };
}

/** Bỏ hẳn quyết định của tấm (xoá cả ghi chú) — "Bỏ yêu cầu sửa tấm này". */
export function boQuyet(nhap: NhapDuyet, id: string): NhapDuyet {
  if (!nhap[id]) return nhap;
  const moi = { ...nhap };
  delete moi[id];
  return moi;
}

function suaTam(nhap: NhapDuyet, id: string, f: (m: NhapTam) => NhapTam): NhapDuyet {
  const m = nhap[id];
  return m ? { ...nhap, [id]: f(m) } : nhap;
}

export function suaGhiChu(nhap: NhapDuyet, id: string, ghiChu: string): NhapDuyet {
  return suaTam(nhap, id, (m) => ({ ...m, ghiChu: ghiChu.slice(0, TOI_DA_GHI_CHU) }));
}
export function themVung(nhap: NhapDuyet, id: string, v: VungKhoanh): NhapDuyet {
  return suaTam(nhap, id, (m) => (m.vung.length >= TOI_DA_VUNG_MOT_TAM ? m : { ...m, vung: [...m.vung, v] }));
}
export function boVung(nhap: NhapDuyet, id: string, chiSo: number): NhapDuyet {
  return suaTam(nhap, id, (m) => ({ ...m, vung: m.vung.filter((_, k) => k !== chiSo) }));
}
export function themAnhMinhHoa(nhap: NhapDuyet, id: string, a: AnhMinhHoa): NhapDuyet {
  return suaTam(nhap, id, (m) =>
    m.anhMau.length >= TOI_DA_ANH_MAU || m.anhMau.some((x) => x.duongDan === a.duongDan)
      ? m
      : { ...m, anhMau: [...m.anhMau, a] },
  );
}
export function boAnhMinhHoa(nhap: NhapDuyet, id: string, duongDan: string): NhapDuyet {
  return suaTam(nhap, id, (m) => ({ ...m, anhMau: m.anhMau.filter((x) => x.duongDan !== duongDan) }));
}

export type TrangThaiTam = "da_duyet" | "xin_sua" | "chua_xem" | "da_xem";

export function trangThaiTam(nhap: NhapDuyet, id: string, daXem: ReadonlySet<string>): TrangThaiTam {
  const m = nhap[id];
  if (m?.trangThai === "duyet") return "da_duyet";
  if (m?.trangThai === "sua") return "xin_sua";
  return daXem.has(id) ? "da_xem" : "chua_xem";
}

export interface DemNhap {
  tong: number;
  duyet: number;
  sua: number;
  /** Chưa bấm Duyệt / Cần sửa (gồm cả tấm đã xem lẫn chưa xem). */
  chuaQuyet: number;
  chuaXem: number;
}

export function demNhap(ids: readonly string[], nhap: NhapDuyet, daXem: ReadonlySet<string>): DemNhap {
  const d: DemNhap = { tong: ids.length, duyet: 0, sua: 0, chuaQuyet: 0, chuaXem: 0 };
  for (const id of ids) {
    const tt = trangThaiTam(nhap, id, daXem);
    if (tt === "da_duyet") d.duyet++;
    else if (tt === "xin_sua") d.sua++;
    else {
      d.chuaQuyet++;
      if (tt === "chua_xem") d.chuaXem++;
    }
  }
  return d;
}

/** Tấm kế tiếp (sau `tu`, vòng lại từ đầu) chưa quyết — null khi mọi tấm đã quyết. */
export function tamChuaQuyetKeTiep(ids: readonly string[], nhap: NhapDuyet, tu: number): number | null {
  for (let k = 1; k <= ids.length; k++) {
    const i = (tu + k) % ids.length;
    const id = ids[i];
    if (id !== undefined && !nhap[id]) return i;
  }
  return null;
}

/**
 * Sau khi ba mẹ bấm "Duyệt tấm này": phản hồi tức thì — sang tấm KẾ chưa quyết; không
 * còn tấm nào chưa quyết và mọi tấm đều duyệt → hỏi "Duyệt cả bộ" (một chạm là xong).
 * Còn tấm xin sửa thì đứng yên: nút "Gửi yêu cầu sửa" đã hiện ở thanh dưới.
 */
export function buocSauDuyet(
  idsMo: readonly string[],
  nhapMoi: NhapDuyet,
  idVuaDuyet: string,
): { toi: string | null; hoiDuyetCaBo: boolean } {
  const i = idsMo.indexOf(idVuaDuyet);
  const ke = i >= 0 ? tamChuaQuyetKeTiep(idsMo, nhapMoi, i) : null;
  if (ke !== null) return { toi: idsMo[ke] ?? null, hoiDuyetCaBo: false };
  const hetDuyet = idsMo.length > 0 && idsMo.every((x) => nhapMoi[x]?.trangThai === "duyet");
  return { toi: null, hoiDuyetCaBo: hetDuyet };
}

// ---------------------------------------------------------------------------
// Vòng duyệt và kế hoạch gửi
// ---------------------------------------------------------------------------

export interface AnhTrongVong {
  id: string;
  fileName: string;
  /** Khoá vòng duyệt của tấm: "goc" (trong gói) hoặc đợt mua thêm. */
  khoaVong: string;
}

/** Thân `POST /api/g/review` — trong gói KHÔNG kèm `khoa` (giữ đúng thân cũ). */
export interface ThanReview {
  decision: "approve" | "revise";
  khoa?: string;
  note?: string;
  items?: { photoId: string; note: string; marks: VungKhoanh[]; anhMau: string[] }[];
}

const theoKhoa = (khoa: string) => (khoa === KHOA_TRONG_GOI ? {} : { khoa });

/**
 * "Gửi" sau khi ba mẹ đi qua từng tấm. Mỗi vòng ĐANG MỞ (`vongMo`):
 *   · có ≥1 tấm xin sửa → một lượt "revise" kèm từng tấm (ghi chú, vùng, ảnh minh hoạ);
 *   · không tấm nào xin sửa và MỌI tấm đã duyệt → một lượt "approve";
 *   · còn lại (còn tấm chưa quyết) → không gửi gì cho vòng đó.
 * Ghi chú chung đi kèm lượt "revise" đầu tiên.
 */
export function keHoachGui(p: {
  anh: readonly AnhTrongVong[];
  nhap: NhapDuyet;
  vongMo: ReadonlySet<string>;
  ghiChuChung?: string;
}): ThanReview[] {
  const theoVong = new Map<string, AnhTrongVong[]>();
  for (const a of p.anh) {
    if (!p.vongMo.has(a.khoaVong)) continue;
    theoVong.set(a.khoaVong, [...(theoVong.get(a.khoaVong) ?? []), a]);
  }
  const ra: ThanReview[] = [];
  let chungConLai = (p.ghiChuChung ?? "").trim();
  for (const [khoa, ds] of theoVong) {
    const sua = ds.filter((a) => p.nhap[a.id]?.trangThai === "sua");
    if (sua.length > 0) {
      ra.push({
        decision: "revise",
        ...theoKhoa(khoa),
        note: chungConLai,
        items: sua.map((a) => {
          const m = p.nhap[a.id]!;
          return { photoId: a.id, note: m.ghiChu.trim(), marks: m.vung, anhMau: m.anhMau.map((x) => x.duongDan) };
        }),
      });
      chungConLai = "";
    } else if (ds.every((a) => p.nhap[a.id]?.trangThai === "duyet")) {
      ra.push({ decision: "approve", ...theoKhoa(khoa) });
    }
  }
  // Lượt "approve" gửi trước: vòng trong gói xin sửa đổi trạng thái bộ ảnh, không làm
  // hỏng lượt duyệt đợt mua thêm — nhưng thứ tự cố định giúp người đọc nhật ký dễ hiểu.
  return [...ra.filter((r) => r.decision === "approve"), ...ra.filter((r) => r.decision === "revise")];
}

/** "Duyệt cả bộ": một lượt "approve" cho MỖI vòng đang mở có ảnh. */
export function keHoachDuyetCaBo(p: { anh: readonly AnhTrongVong[]; vongMo: ReadonlySet<string> }): ThanReview[] {
  const khoa = [...new Set(p.anh.map((a) => a.khoaVong))].filter((k) => p.vongMo.has(k));
  return khoa.map((k) => ({ decision: "approve" as const, ...theoKhoa(k) }));
}

export interface KetQuaGui {
  ok: boolean;
  /** Lần sửa máy chủ ghi (lượt revise cuối cùng thành công). */
  lan: number | null;
  daSua: boolean;
  daDuyet: boolean;
  loi: string | null;
}

/**
 * Gửi lần lượt từng thân. Một lượt hỏng thì dừng, báo lỗi (các lượt trước đã ghi
 * — màn tải lại sẽ thấy đúng). `goi` = `goiApiKhach` (phép thử truyền fetch giả).
 */
export async function guiKeHoach(
  cacThan: readonly ThanReview[],
  goi: (url: string, init: RequestInit) => Promise<Response>,
  loiMacDinh: string,
): Promise<KetQuaGui> {
  const kq: KetQuaGui = { ok: true, lan: null, daSua: false, daDuyet: false, loi: null };
  for (const than of cacThan) {
    let res: Response;
    try {
      res = await goi("/api/g/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(than),
      });
    } catch {
      return { ...kq, ok: false, loi: loiMacDinh };
    }
    const json = (await res.json().catch(() => null)) as { data?: { round?: unknown }; error?: { message?: string } } | null;
    if (!res.ok) return { ...kq, ok: false, loi: json?.error?.message ?? loiMacDinh };
    if (than.decision === "revise") {
      kq.daSua = true;
      const r = Number(json?.data?.round);
      if (Number.isFinite(r) && r > 0) kq.lan = r;
    } else kq.daDuyet = true;
  }
  return kq;
}

// ---------------------------------------------------------------------------
// Ảnh minh hoạ ba mẹ gửi kèm
// ---------------------------------------------------------------------------

const DUOI_ANH = /\.(jpe?g|png|webp|heic|heif)$/i;

/** Kiểm trước khi gửi: phải là ảnh; dung lượng kiểm SAU khi nén (`nenAnhNeuCan`). */
export function kiemTepAnhMinhHoa(tep: { name: string; type: string; size: number }): "loai" | "dung_luong" | null {
  const laAnh = /^image\//i.test(tep.type) || DUOI_ANH.test(tep.name);
  if (!laAnh) return "loai";
  if (tep.size <= 0 || tep.size > TOI_DA_BYTE_ANH_MAU) return "dung_luong";
  return null;
}

/** Nén khi ảnh lớn hơn ngưỡng này hoặc cạnh dài hơn `CANH_DAI_TOI_DA`. */
export const NGUONG_NEN_BYTE = 1_500_000;
export const CANH_DAI_TOI_DA = 2048;

/**
 * Nén ảnh phía máy (canvas → JPEG) để ảnh chụp điện thoại 6–12 MB vẫn qua cửa 5 MB
 * và tải nhanh trên 4G. Không có canvas (máy chủ, phép thử) hoặc giải mã hỏng (HEIC
 * trên trình duyệt không đọc được) → trả nguyên tệp; cửa kiểm dung lượng quyết.
 */
export async function nenAnhNeuCan(tep: File): Promise<File> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return tep;
  if (tep.size <= NGUONG_NEN_BYTE) return tep;
  try {
    const bmp = await createImageBitmap(tep);
    const tiLe = Math.min(1, CANH_DAI_TOI_DA / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * tiLe));
    const h = Math.max(1, Math.round(bmp.height * tiLe));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return tep;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size >= tep.size) return tep;
    return new File([blob], tep.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return tep;
  }
}

/** Gửi MỘT ảnh minh hoạ lên route có sẵn (`anh-mau`, bucket riêng tư). */
export async function guiAnhMinhHoa(
  tep: Blob,
  goi: (url: string, init: RequestInit) => Promise<Response>,
  loiMacDinh: string,
): Promise<{ duongDan: string } | { loi: string }> {
  try {
    const form = new FormData();
    form.set("tep", tep);
    const res = await goi("/api/g/anh-chinh-sua/anh-mau", { method: "POST", body: form });
    const json = (await res.json().catch(() => null)) as { data?: { duongDan?: unknown }; error?: { message?: string } } | null;
    if (!res.ok || typeof json?.data?.duongDan !== "string") return { loi: json?.error?.message ?? loiMacDinh };
    return { duongDan: json.data.duongDan };
  } catch {
    return { loi: loiMacDinh };
  }
}

/**
 * Route `anh-mau` nhận ảnh khi: bộ đang chờ duyệt (vòng trong gói), HOẶC có một đợt
 * mua thêm đang chờ duyệt (bộ có thể đã duyệt/đã giao — BB-377). Trước BB-401 chỉ xét
 * vế đầu nên ba mẹ xin sửa ảnh mua thêm không gửi kèm ảnh minh hoạ được.
 */
export function nhanAnhMinhHoaDuoc(p: { trangThaiBo: string; cacDotMuaThem: readonly TrangThaiDuyetDot[] }): boolean {
  return p.trangThaiBo === "awaiting_approval" || p.cacDotMuaThem.some((t) => t === "cho_duyet");
}

// ---------------------------------------------------------------------------
// BB-401 vòng 2 — "Duyệt tấm này" lưu trên máy chủ (bảng 0108 `anh_chinh_duyet_tam`)
// ---------------------------------------------------------------------------

export interface DongDuyetTam {
  photo_id: string;
  khoa: string;
  duyet_luc: string;
}

/**
 * Tấm nào CÒN được tính là đã duyệt: dấu duyệt bấm SAU mốc "Gửi khách duyệt" gần nhất
 * của vòng tấm đó. CSKH gửi lại (sau khi sửa) → ba mẹ xem lại từ đầu; vòng chưa gửi → không tính.
 */
export function tamDuyetConHieuLuc(
  dong: readonly DongDuyetTam[],
  mocGuiCua: (photoId: string) => string | null,
): Set<string> {
  const ra = new Set<string>();
  for (const d of dong) {
    const moc = mocGuiCua(d.photo_id);
    if (!moc) continue;
    if (Date.parse(d.duyet_luc) >= Date.parse(moc)) ra.add(d.photo_id);
  }
  return ra;
}

/**
 * Ba mẹ bấm duyệt/bỏ duyệt MỘT tấm được không: vòng của tấm đang chờ duyệt — đợt mua
 * thêm (đã áp 0095) theo trạng thái đợt; còn lại theo trạng thái bộ ảnh.
 */
export function duyetLeDuoc(p: {
  trangThaiBo: string;
  laDotMuaThemRieng: boolean;
  trangThaiDot: TrangThaiDuyetDot | null;
}): boolean {
  return p.laDotMuaThemRieng ? p.trangThaiDot === "cho_duyet" : p.trangThaiBo === "awaiting_approval";
}

/**
 * Ghép bản nháp trên máy với dấu duyệt trên máy chủ (mở ở máy khác vẫn thấy "Đã duyệt"):
 * máy chủ là nguồn đúng cho "duyệt"; "xin sửa" (ghi chú chưa gửi) chỉ có trên máy này
 * và được giữ — tấm đang xin sửa trên máy này không bị dấu duyệt cũ đè lên.
 */
export function ghepNhapMayChu(nhapMay: NhapDuyet, daDuyetMayChu: readonly string[]): NhapDuyet {
  const ra: Record<string, NhapTam> = {};
  for (const [id, m] of Object.entries(nhapMay)) if (m.trangThai === "sua") ra[id] = m;
  for (const id of daDuyetMayChu) if (!ra[id]) ra[id] = { ...TRONG, ...nhapMay[id], trangThai: "duyet" };
  return ra;
}

/** Phần bản nháp ghi xuống máy: có máy chủ thì chỉ giữ tấm xin sửa (ghi chú chưa gửi). */
export function nhapGhiXuongMay(nhap: NhapDuyet, coMayChu: boolean): NhapDuyet {
  if (!coMayChu) return nhap;
  return Object.fromEntries(Object.entries(nhap).filter(([, m]) => m.trangThai === "sua"));
}

/**
 * Lưu một dấu duyệt / bỏ duyệt. `luuMayChu: false` = chưa áp 0108 (máy giữ dấu, không lỗi).
 */
export async function luuDuyetTam(
  photoId: string,
  duyet: boolean,
  goi: (url: string, init: RequestInit) => Promise<Response>,
  loiMacDinh: string,
): Promise<{ ok: true; luuMayChu: boolean } | { ok: false; loi: string }> {
  try {
    const res = await goi("/api/g/anh-chinh-sua/duyet-tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId, duyet }),
    });
    const json = (await res.json().catch(() => null)) as { data?: { luuMayChu?: unknown }; error?: { message?: string } } | null;
    if (!res.ok) return { ok: false, loi: json?.error?.message ?? loiMacDinh };
    return { ok: true, luuMayChu: json?.data?.luuMayChu === true };
  } catch {
    return { ok: false, loi: loiMacDinh };
  }
}

// ---------------------------------------------------------------------------
// Giữ bản nháp khi ba mẹ lỡ đóng trang (localStorage, chỉ trên máy này)
// ---------------------------------------------------------------------------

export interface NhapLuu {
  nhap: NhapDuyet;
  daXem: string[];
}

/** Khoá lưu theo TẬP ảnh đang duyệt — CSKH gửi thêm/đổi ảnh thì là bản nháp mới. */
export function khoaLuuNhap(ids: readonly string[]): string {
  let h = 0;
  for (const c of [...ids].sort().join("|")) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return `bb401:nhap-duyet:${ids.length}:${(h >>> 0).toString(36)}`;
}

/** Đọc lại bản nháp đã lưu: bỏ tấm lạ, bỏ URL xem trước (blob đã chết), chuẩn hoá kiểu. */
export function docNhapLuu(raw: unknown, idsHopLe: readonly string[]): NhapLuu {
  const hopLe = new Set(idsHopLe);
  const ra: Record<string, NhapTam> = {};
  const o = (raw ?? {}) as { nhap?: unknown; daXem?: unknown };
  if (o.nhap && typeof o.nhap === "object") {
    for (const [id, v] of Object.entries(o.nhap as Record<string, unknown>)) {
      if (!hopLe.has(id) || !v || typeof v !== "object") continue;
      const m = v as Partial<NhapTam>;
      if (m.trangThai !== "duyet" && m.trangThai !== "sua") continue;
      ra[id] = {
        trangThai: m.trangThai,
        ghiChu: typeof m.ghiChu === "string" ? m.ghiChu.slice(0, TOI_DA_GHI_CHU) : "",
        vung: Array.isArray(m.vung)
          ? m.vung
              .filter((x): x is VungKhoanh => !!x && typeof x.x === "number" && typeof x.y === "number" && typeof x.r === "number")
              .slice(0, TOI_DA_VUNG_MOT_TAM)
          : [],
        anhMau: Array.isArray(m.anhMau)
          ? m.anhMau
              .filter((x): x is AnhMinhHoa => !!x && typeof (x as AnhMinhHoa).duongDan === "string")
              .slice(0, TOI_DA_ANH_MAU)
              .map((x) => ({ duongDan: x.duongDan }))
          : [],
      };
    }
  }
  const daXem = Array.isArray(o.daXem) ? o.daXem.filter((x): x is string => typeof x === "string" && hopLe.has(x)) : [];
  return { nhap: ra, daXem };
}
