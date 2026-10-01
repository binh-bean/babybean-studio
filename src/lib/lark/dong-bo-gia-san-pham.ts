/**
 * Đồng bộ GIÁ + trạng thái sản phẩm từ bảng "Sản phẩm" trên Lark xuống `products` (BB-343).
 *
 * OWNER: DEV-INT. Task BB-343. Thiết kế đã được anh duyệt — không thêm ngoài.
 *
 * MỘT CHIỀU. Chỉ ĐỌC bảng "Sản phẩm" (không đọc bảng hóa đơn 11 nghìn dòng),
 * chỉ GHI bảng `products`. Không bao giờ ghi ngược lên Lark. Không xoá sản phẩm.
 *
 * ---------------------------------------------------------------------------
 * Vì sao có tệp này khi đã có scripts/sync-lark-catalog.mjs
 * ---------------------------------------------------------------------------
 * Script đầy đủ đọc cả bảng hóa đơn (hàng chục nghìn dòng) và bảng thành phần
 * gói để suy giá quan sát + hạn mức — chạy ở máy dev, vài chục giây. Cron Vercel
 * chỉ có 60 giây và nhân viên bấm nút phải thấy kết quả ngay. Anh chỉ cần
 * "đổi giá bên Lark thì app đổi theo", mà cột "Giá Bán" nằm ngay bảng Sản phẩm.
 *
 * Luật đọc dòng Lark (tên, phân loại, tách vật liệu/kích thước, "Giá Bán",
 * "Trạng Thái Sử Dụng") là BẢN SAO của script — `classify`, `splitName`,
 * `cellText`, `cellNumber`. Phép thử bb-343 đối chiếu hai bên trên cùng một bộ
 * đầu vào, nên lệch là đỏ. Sửa luật thì sửa CẢ HAI.
 *
 * ---------------------------------------------------------------------------
 * Việc tệp này KHÔNG làm (để dành cho script đầy đủ `npm run sync:catalog`)
 * ---------------------------------------------------------------------------
 *   · Không tạo sản phẩm mới (chỉ đếm số dòng Lark chưa có trong app).
 *   · Không đụng `default_quota` / gói chụp.
 *   · Không đụng `price_samples` (là số lần bán quan sát được trên hóa đơn — cron
 *     không đọc hóa đơn nên không có số đúng để ghi).
 *   · "Giá Bán" trống / 0 → GIỮ NGUYÊN list_price hiện có (giá quan sát cũ), không
 *     ghi null, không ghi 0.
 *
 * ---------------------------------------------------------------------------
 * Hai chốt an toàn — vi phạm là KHÔNG GHI GÌ
 * ---------------------------------------------------------------------------
 *   1. Lark trả lỗi → dừng, trả lỗi.
 *   2. Lark trả ít hơn 80% số sản phẩm đang có mã Lark trong app → dừng. Lark
 *      trả trang cụt / bảng bị lọc thì nếu cứ ghi, hàng loạt sản phẩm bị coi là
 *      "đã biến mất" và bị TẮT. Đọc rỗng cũng coi là lỗi.
 */

import type pg from "pg";
import { larkAuth, readLarkTable, type LarkRecord } from "@/lib/lark/sync-retouch";

// --- hằng số ----------------------------------------------------------------

/** Cùng mẫu tìm bảng với scripts/sync-lark-catalog.mjs. */
export const MAU_TEN_BANG_SAN_PHAM = /s[aả]n ph[aẩ]m/i;

/** Dưới ngưỡng này (so với số sản phẩm có mã Lark trong app) là không tin lượt đọc. */
export const NGUONG_DOC_TOI_THIEU = 0.8;

/** Nút "Đồng bộ giá ngay": tối đa một lần mỗi phút. */
export const GIAN_CACH_NUT_MS = 60_000;

/** Khoá trong bảng `settings` (branch_id null): lần đồng bộ giá gần nhất. */
export const KHOA_LAN_DONG_BO_GAN_NHAT = "gia_dong_bo_gan_nhat";
/** Khoá trong `settings`: mốc lần bấm nút gần nhất (kể cả lần hỏng) — để giới hạn 1 lần/phút. */
export const KHOA_MOC_BAM_NUT = "gia_dong_bo_moc_bam_nut";

/** Khoá tư vấn Postgres — hai lượt (cron + nút) không chạy chồng nhau. */
export const KHOA_DONG_BO_GIA = 343_2610;

/** Trần số dòng "tên: giá cũ → giá mới" đưa vào nhật ký (nhật ký không phải kho dữ liệu). */
export const TRAN_DONG_DOI_GIA_TRONG_NHAT_KY = 300;

// --- đọc ô Lark (BẢN SAO của scripts/sync-lark-catalog.mjs) -----------------

/** Ô Lark có nhiều hình dạng; một hàm cho tất cả. Giống hệt script. */
export function cellText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v == null
          ? ""
          : typeof v === "object"
            ? (((v as Record<string, unknown>).text ?? (v as Record<string, unknown>).name ?? "") as string)
            : String(v),
      )
      .join("");
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    return String(o.text ?? o.name ?? o.fullPhoneNum ?? "");
  }
  return String(value);
}

/**
 * Giống script, trừ MỘT chỗ: số thật (kiểu number) làm tròn thẳng. Script bỏ mọi
 * ký tự không phải chữ số, nên 150000.5 thành 1500005 — nuốt dấu chấm thập phân.
 * Số nguyên cho kết quả y hệt.
 */
export function cellNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  return Number(String(cellText(value)).replace(/[^\d]/g, "")) || 0;
}

/** Phân Loại Sản Xuất → product_kind. Giống hệt script. null = lạ, không đoán bừa. */
export function classify(name: string, category: string): string | null {
  if (/^edit file$/i.test(name.trim())) return "edited_photo";
  switch (category.trim()) {
    case "Chụp / Quay":
      return "shoot_package";
    case "In Ấn":
      return "print";
    case "Phát Sinh":
      return "addon";
    case "Makeup":
    case "Dịch vụ Hậu Kỳ":
      return "service";
    default:
      return null;
  }
}

/** "Gỗ 40x60" → { material: "Gỗ", size: "40x60" }. Giống hệt script. */
export function splitName(name: string): { material: string | null; size: string | null } {
  const m = name.trim().match(/^(.*?)\s*(\d{2,3}\s*[xX]\s*\d{2,3})$/);
  if (!m) return { material: null, size: null };
  const material = (m[1] ?? "").trim();
  const size = (m[2] ?? "").replace(/\s+/g, "").toLowerCase();
  return { material: material || null, size };
}

// --- phần thuần: dòng Lark → sản phẩm ---------------------------------------

export interface SanPhamTuLark {
  recordId: string;
  name: string;
  kind: string;
  material: string | null;
  size: string | null;
  /** "Giá Bán" của Lark; 0 = chưa nhập. */
  giaBan: number;
  isActive: boolean;
}

export type DongLarkDaDoc =
  | { loai: "ok"; sp: SanPhamTuLark }
  | { loai: "boQua"; recordId: string; lyDo: string };

/**
 * Một dòng bảng "Sản phẩm" → sản phẩm. Dòng tên trống / phân loại lạ thì bỏ qua
 * (như script) nhưng VẪN tính là "Lark còn dòng này" — xem `layKeHoach`.
 */
export function chuyenDongLark(row: { record_id?: string; fields?: Record<string, unknown> }): DongLarkDaDoc {
  const f = row.fields ?? {};
  const name = cellText(f["Tên SP/DV"]).trim();
  const category = cellText(f["Phân Loại Sản Xuất"]).trim();
  const recordId = cellText(f["Record ID"]).trim() || row.record_id || "";

  if (!name) return { loai: "boQua", recordId, lyDo: "không có tên" };
  const kind = classify(name, category);
  if (!kind) return { loai: "boQua", recordId, lyDo: `phân loại lạ: "${category || "trống"}"` };

  const { material, size } = splitName(name);
  return {
    loai: "ok",
    sp: {
      recordId,
      name,
      kind,
      material,
      size,
      giaBan: cellNumber(f["Giá Bán"]),
      isActive: cellText(f["Trạng Thái Sử Dụng"]).trim() !== "Ngừng Kinh Doanh",
    },
  };
}

// --- phần thuần: kế hoạch ---------------------------------------------------

export interface SanPhamHienCo {
  id: string;
  name: string;
  material: string | null;
  size: string | null;
  list_price: number | null;
  price_confidence: number | null;
  is_active: boolean;
  lark_record_id: string | null;
}

/** Cột được phép sửa — danh sách trắng, để câu UPDATE không bao giờ dựng từ chuỗi lạ. */
export const COT_DUOC_SUA = ["name", "material", "size", "list_price", "price_confidence", "is_active"] as const;
export type CotDuocSua = (typeof COT_DUOC_SUA)[number];

export interface LenhCapNhat {
  id: string;
  ten: string;
  set: Partial<Record<CotDuocSua, string | number | boolean | null>>;
}

export interface DongDoiGia {
  ten: string;
  /** null = trước đó chưa có giá */
  cu: number | null;
  moi: number;
}

export interface KeHoach {
  /** Số dòng Lark đọc được (mọi dòng, kể cả dòng bị bỏ qua). */
  soDocTuLark: number;
  /** Số sản phẩm trong app đang có mã Lark — mẫu số của chốt 80%. */
  soCoMaTrongApp: number;
  capNhat: LenhCapNhat[];
  doiGia: DongDoiGia[];
  /** Lark nói "đang kinh doanh" mà app đang tắt → bật. */
  soBat: number;
  /** Lark nói "Ngừng Kinh Doanh" mà app đang bật → tắt. */
  soTatTheoLark: number;
  /** Có mã Lark nhưng KHÔNG còn trong lượt đọc → tắt (không xoá). */
  tatMatLark: { id: string; name: string }[];
  /** Dòng Lark chưa có trong app — tệp này không tạo mới. */
  chuaCoTrongApp: number;
  boQua: { recordId: string; lyDo: string }[];
}

export function dat80PhanTram(soDoc: number, soCoMaTrongApp: number): boolean {
  if (soDoc <= 0) return false;
  return soDoc >= NGUONG_DOC_TOI_THIEU * soCoMaTrongApp;
}

/**
 * Giống `sanPhamCanTat` của script, nhưng CHỈ xét sản phẩm có mã Lark: "đã biến
 * mất khỏi Lark" là tín hiệu rõ; sản phẩm không có mã Lark là chuyện của script
 * đầy đủ, không phải của một lượt cron hằng ngày.
 */
export function sanPhamBienMatKhoiLark(
  hienCo: Pick<SanPhamHienCo, "id" | "name" | "is_active" | "lark_record_id">[],
  boMaLarkDangDoc: ReadonlySet<string>,
) {
  return hienCo.filter((p) => p.is_active && p.lark_record_id && !boMaLarkDangDoc.has(p.lark_record_id));
}

const khacNull = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) !== (b ?? null);

export function layKeHoach(hienCo: SanPhamHienCo[], dongLark: LarkRecord[]): KeHoach {
  const theoMa = new Map<string, SanPhamHienCo>();
  for (const p of hienCo) if (p.lark_record_id) theoMa.set(p.lark_record_id, p);

  const boMaLarkDangDoc = new Set<string>();
  const boQua: KeHoach["boQua"] = [];
  const capNhat: LenhCapNhat[] = [];
  const doiGia: DongDoiGia[] = [];
  let soBat = 0;
  let soTatTheoLark = 0;
  let chuaCoTrongApp = 0;

  for (const row of dongLark) {
    const d = chuyenDongLark(row);
    const maDong = d.loai === "ok" ? d.sp.recordId : d.recordId;
    if (maDong) boMaLarkDangDoc.add(maDong);
    if (d.loai === "boQua") {
      boQua.push({ recordId: d.recordId, lyDo: d.lyDo });
      continue;
    }
    const sp = d.sp;
    const dang = theoMa.get(sp.recordId);
    if (!dang) {
      chuaCoTrongApp++;
      continue;
    }

    const set: LenhCapNhat["set"] = {};
    if (dang.name !== sp.name) set.name = sp.name;
    if (khacNull(dang.material, sp.material)) set.material = sp.material;
    if (khacNull(dang.size, sp.size)) set.size = sp.size;

    // "Giá Bán" > 0 là giá niêm yết, độ tin cậy 1 (luật BB-335 của script).
    // Trống / 0 → giữ nguyên, KHÔNG ghi null hay 0.
    if (sp.giaBan > 0) {
      const giaCu = dang.list_price === null ? null : Number(dang.list_price);
      if (giaCu !== sp.giaBan) {
        set.list_price = sp.giaBan;
        doiGia.push({ ten: dang.name, cu: giaCu, moi: sp.giaBan });
      }
      if (dang.price_confidence === null || Number(dang.price_confidence) !== 1) set.price_confidence = 1;
    }

    if (dang.is_active !== sp.isActive) {
      set.is_active = sp.isActive;
      if (sp.isActive) soBat++;
      else soTatTheoLark++;
    }

    if (Object.keys(set).length > 0) capNhat.push({ id: dang.id, ten: dang.name, set });
  }

  const tatMatLark = sanPhamBienMatKhoiLark(hienCo, boMaLarkDangDoc).map((p) => ({ id: p.id, name: p.name }));

  return {
    soDocTuLark: boMaLarkDangDoc.size,
    soCoMaTrongApp: theoMa.size,
    capNhat,
    doiGia,
    soBat,
    soTatTheoLark,
    tatMatLark,
    chuaCoTrongApp,
    boQua,
  };
}

// --- kho (DB) ---------------------------------------------------------------

export interface KhoDongBoGia {
  docSanPham(): Promise<SanPhamHienCo[]>;
  /** Ghi MỘT giao dịch: mọi lệnh cập nhật + tắt các sản phẩm biến mất. */
  apDung(capNhat: LenhCapNhat[], idsTat: string[]): Promise<void>;
  docCaiDat(khoa: string): Promise<Record<string, unknown> | null>;
  ghiCaiDat(khoa: string, giaTri: Record<string, unknown>): Promise<void>;
}

/** Kho thật trên kết nối `pg` (cùng kiểu cron hau-ky đang dùng). */
export function khoPg(client: Pick<pg.Client, "query">): KhoDongBoGia {
  return {
    async docSanPham() {
      const { rows } = await client.query(
        `select id, name, material, size, list_price, price_confidence, is_active, lark_record_id from products`,
      );
      return rows.map((r) => ({
        id: String(r.id),
        name: String(r.name),
        material: r.material ?? null,
        size: r.size ?? null,
        list_price: r.list_price === null ? null : Number(r.list_price),
        price_confidence: r.price_confidence === null ? null : Number(r.price_confidence),
        is_active: Boolean(r.is_active),
        lark_record_id: r.lark_record_id ?? null,
      }));
    },

    async apDung(capNhat, idsTat) {
      await client.query("begin");
      try {
        for (const lenh of capNhat) {
          const cot = Object.keys(lenh.set).filter((c): c is CotDuocSua =>
            (COT_DUOC_SUA as readonly string[]).includes(c),
          );
          if (cot.length === 0) continue;
          const gan = cot.map((c, i) => `${c} = $${i + 2}`).join(", ");
          await client.query(`update products set ${gan}, updated_at = now() where id = $1`, [
            lenh.id,
            ...cot.map((c) => lenh.set[c] ?? null),
          ]);
        }
        if (idsTat.length > 0) {
          await client.query(`update products set is_active = false, updated_at = now() where id = any($1::uuid[])`, [
            idsTat,
          ]);
        }
        await client.query("commit");
      } catch (err) {
        await client.query("rollback").catch(() => {});
        throw err;
      }
    },

    async docCaiDat(khoa) {
      const { rows } = await client.query(`select value from settings where key = $1 and branch_id is null limit 1`, [
        khoa,
      ]);
      const v = rows[0]?.value;
      return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
    },

    async ghiCaiDat(khoa, giaTri) {
      const r = await client.query(
        `update settings set value = $2::jsonb, updated_at = now() where key = $1 and branch_id is null`,
        [khoa, JSON.stringify(giaTri)],
      );
      if (!r.rowCount) {
        await client.query(`insert into settings (key, value) values ($1, $2::jsonb)`, [khoa, JSON.stringify(giaTri)]);
      }
    },
  };
}

// --- đọc Lark ---------------------------------------------------------------

/** Đọc bảng "Sản phẩm" — CHỈ bảng đó. Thiếu cấu hình hoặc Lark lỗi thì ném. */
export async function docBangSanPhamTuLark(env: {
  LARK_APP_ID?: string;
  LARK_APP_SECRET?: string;
  LARK_BASE_APP_TOKEN?: string;
}): Promise<LarkRecord[]> {
  const { LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN } = env;
  if (!LARK_APP_ID || !LARK_APP_SECRET || !LARK_BASE_APP_TOKEN) {
    throw new Error("Thiếu cấu hình Lark (LARK_APP_ID / LARK_APP_SECRET / LARK_BASE_APP_TOKEN)");
  }
  const auth = await larkAuth(LARK_APP_ID, LARK_APP_SECRET);
  const { records } = await readLarkTable(auth, LARK_BASE_APP_TOKEN, MAU_TEN_BANG_SAN_PHAM);
  return records;
}

// --- chạy -------------------------------------------------------------------

export type NguonDongBo = "cron" | "nut";

export interface KetQuaDongBoGia {
  ok: boolean;
  /** Có ghi vào DB thật không (false khi xem thử hoặc khi bị chặn). */
  daGhi: boolean;
  nguon: NguonDongBo;
  /** Chỉ có khi ok = false. */
  loi?: { ma: "LARK_LOI" | "DOC_QUA_IT" | "BANG_RONG"; thongBao: string };
  soDocTuLark: number;
  soCoMaTrongApp: number;
  soGiaDoi: number;
  doiGia: DongDoiGia[];
  soBat: number;
  /** Tắt theo Lark ("Ngừng Kinh Doanh") + tắt vì biến mất khỏi Lark. */
  soTat: number;
  tatMatLark: string[];
  chuaCoTrongApp: number;
  soDongBoQua: number;
}

const rong = (nguon: NguonDongBo): KetQuaDongBoGia => ({
  ok: false,
  daGhi: false,
  nguon,
  soDocTuLark: 0,
  soCoMaTrongApp: 0,
  soGiaDoi: 0,
  doiGia: [],
  soBat: 0,
  soTat: 0,
  tatMatLark: [],
  chuaCoTrongApp: 0,
  soDongBoQua: 0,
});

/**
 * Một lượt đồng bộ. KHÔNG ném khi Lark lỗi / đọc thiếu — trả `ok: false` kèm lý
 * do và `daGhi: false` để nơi gọi ghi nhật ký rồi báo lỗi. Lỗi DB thì ném.
 *
 * `ghi = false` là chế độ xem thử: tính kế hoạch, đọc Lark, KHÔNG ghi gì.
 */
export async function dongBoGiaSanPham(opts: {
  kho: KhoDongBoGia;
  docLark: () => Promise<LarkRecord[]>;
  ghi: boolean;
  nguon: NguonDongBo;
  bayGio?: () => Date;
}): Promise<KetQuaDongBoGia> {
  const { kho, docLark, ghi, nguon } = opts;

  let dong: LarkRecord[];
  try {
    dong = await docLark();
  } catch (err) {
    return {
      ...rong(nguon),
      loi: { ma: "LARK_LOI", thongBao: err instanceof Error ? err.message : String(err) },
    };
  }

  const hienCo = await kho.docSanPham();
  const kh = layKeHoach(hienCo, dong);

  const nen = {
    soDocTuLark: kh.soDocTuLark,
    soCoMaTrongApp: kh.soCoMaTrongApp,
  };

  if (kh.soDocTuLark === 0) {
    return {
      ...rong(nguon),
      ...nen,
      loi: { ma: "BANG_RONG", thongBao: "Lark trả bảng Sản phẩm rỗng — không ghi gì." },
    };
  }
  if (!dat80PhanTram(kh.soDocTuLark, kh.soCoMaTrongApp)) {
    return {
      ...rong(nguon),
      ...nen,
      loi: {
        ma: "DOC_QUA_IT",
        thongBao:
          `Lark chỉ trả ${kh.soDocTuLark} sản phẩm, trong khi app đang có ${kh.soCoMaTrongApp} sản phẩm có mã Lark ` +
          `(dưới ${Math.round(NGUONG_DOC_TOI_THIEU * 100)}%) — không ghi gì.`,
      },
    };
  }

  if (ghi) {
    await kho.apDung(
      kh.capNhat,
      kh.tatMatLark.map((p) => p.id),
    );
  }

  const ketQua: KetQuaDongBoGia = {
    ok: true,
    daGhi: ghi,
    nguon,
    ...nen,
    soGiaDoi: kh.doiGia.length,
    doiGia: kh.doiGia,
    soBat: kh.soBat,
    soTat: kh.soTatTheoLark + kh.tatMatLark.length,
    tatMatLark: kh.tatMatLark.map((p) => p.name),
    chuaCoTrongApp: kh.chuaCoTrongApp,
    soDongBoQua: kh.boQua.length,
  };

  if (ghi) {
    await kho.ghiCaiDat(KHOA_LAN_DONG_BO_GAN_NHAT, {
      luc: (opts.bayGio ?? (() => new Date()))().toISOString(),
      soGiaDoi: ketQua.soGiaDoi,
      nguon,
    });
  }
  return ketQua;
}

// --- nhật ký ----------------------------------------------------------------

/**
 * Nội dung metadata của dòng nhật ký `san_pham.dong_bo_gia`. Chỉ có tên sản
 * phẩm + giá + số đếm — KHÔNG có dữ liệu khách hàng (docs/12).
 */
export function metadataNhatKy(kq: KetQuaDongBoGia): Record<string, unknown> {
  return {
    nguon: kq.nguon,
    ketQua: kq.ok ? "thanh_cong" : "loi",
    daGhi: kq.daGhi,
    ...(kq.loi ? { loi: kq.loi.ma, thongBaoLoi: kq.loi.thongBao } : {}),
    soDocTuLark: kq.soDocTuLark,
    soCoMaTrongApp: kq.soCoMaTrongApp,
    soGiaDoi: kq.soGiaDoi,
    doiGia: kq.doiGia
      .slice(0, TRAN_DONG_DOI_GIA_TRONG_NHAT_KY)
      .map((d) => `${d.ten}: ${d.cu ?? "chưa có giá"} → ${d.moi}`),
    doiGiaBiCat: Math.max(0, kq.doiGia.length - TRAN_DONG_DOI_GIA_TRONG_NHAT_KY),
    soBat: kq.soBat,
    soTat: kq.soTat,
    tatMatLark: kq.tatMatLark.slice(0, 100),
    chuaCoTrongApp: kq.chuaCoTrongApp,
  };
}

export const HANH_DONG_NHAT_KY = "san_pham.dong_bo_gia";
