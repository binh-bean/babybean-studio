/**
 * Đọc cột "Trạng Thái" + "Cảnh Báo" của bảng Hậu Kỳ trên Lark vào galleries (BB-200).
 *
 * OWNER: PM. Spec: docs/21 (mục "Luồng hiển thị"), migration 0067.
 *
 * MỘT CHIỀU, CHỈ ĐỌC. Không ghi bất cứ cột nào lên Lark.
 *
 * ---------------------------------------------------------------------------
 * Ba điều Lark làm khác trực giác (đo 25/09/2026)
 * ---------------------------------------------------------------------------
 * 1. Ô chọn-một trả về TÊN lựa chọn ("Đã gửi file gốc"), không trả mã. Nên mỗi
 *    lượt đọc lấy danh sách lựa chọn của cột để đổi tên → mã.
 * 2. Ô trống thì khoá đó VẮNG hẳn trong `fields` — không phải chuỗi rỗng.
 * 3. Lark không cho biết lúc một ô đổi giá trị. `last_modified_time` là lúc
 *    BẢN GHI được sửa (bất kỳ cột nào). App tự ghi mốc khi thấy giá trị mới.
 *
 * Tìm cột theo MÃ lựa chọn nó chứa (optDAI9nFV, optSj1R6PM), không theo tên
 * cột: nhân viên đổi tên cột "Trạng Thái" thì app vẫn tìm ra đúng cột.
 */

import type pg from "pg";
import { HOST, larkAuth, type LarkAuthHeader } from "@/lib/lark/sync-retouch";
import { dangChayPhepThu } from "@/lib/kiem-thu";
import { MA_NEO_COT_CANH_BAO, MA_NEO_COT_TRANG_THAI, giaiDoanCua } from "@/lib/lark/trang-thai-hau-ky";

/** Cột ngày của Lark ứng với lúc VÀO giai đoạn — dùng khi mới thấy bộ ảnh lần đầu. */
const COT_NGAY_THEO_GIAI_DOAN: Record<number, RegExp> = {
  1: /^ngày gửi file gốc$/i,
  2: /^ngày chọn ảnh$/i,
  8: /^ngày gửi in$/i,
  9: /^ngày ảnh về$/i,
  10: /^ngày giao ảnh$/i,
};

// ---------------------------------------------------------------------------
// Phần thuần
// ---------------------------------------------------------------------------

export interface CotLark {
  field_id: string;
  field_name: string;
  property?: { options?: { id: string; name: string }[] } | null;
}

export interface BangMa {
  cotTrangThai: string;
  cotCanhBao: string | null;
  /** tên lựa chọn → mã, của từng cột */
  maTrangThai: Map<string, string>;
  maCanhBao: Map<string, string>;
  /** giai đoạn → tên cột ngày */
  cotNgay: Map<number, string>;
}

/** Từ danh sách cột của bảng, dựng bảng đổi tên → mã. Không thấy cột trạng thái thì ném. */
export function dungBangMa(cot: CotLark[]): BangMa {
  const tt = cot.find((c) => c.property?.options?.some((o) => o.id === MA_NEO_COT_TRANG_THAI));
  if (!tt) throw new Error(`Không tìm thấy cột có lựa chọn ${MA_NEO_COT_TRANG_THAI} (Trạng Thái) trên bảng Hậu Kỳ`);
  const cb = cot.find((c) => c.property?.options?.some((o) => o.id === MA_NEO_COT_CANH_BAO)) ?? null;
  const cotNgay = new Map<number, string>();
  for (const [gd, re] of Object.entries(COT_NGAY_THEO_GIAI_DOAN)) {
    const c = cot.find((x) => re.test(x.field_name.trim()));
    if (c) cotNgay.set(Number(gd), c.field_name);
  }
  const map = (c: CotLark | null) =>
    new Map((c?.property?.options ?? []).map((o) => [o.name.trim(), o.id] as const));
  return {
    cotTrangThai: tt.field_name,
    cotCanhBao: cb?.field_name ?? null,
    maTrangThai: map(tt),
    maCanhBao: map(cb),
    cotNgay,
  };
}

export interface TrangThaiDoc {
  maTrangThai: string | null;
  maCanhBao: string | null;
  /** Ngày vào giai đoạn theo cột ngày của Lark, nếu có. */
  ngayVaoGiaiDoan: Date | null;
  /** last_modified_time của bản ghi. */
  suaLuc: Date | null;
}

function oChonMot(v: unknown): string | null {
  if (typeof v === "string") return v.trim() || null;
  // Phòng khi Lark trả dạng { text } hay mảng một phần tử.
  if (Array.isArray(v)) return oChonMot(v[0]);
  if (v && typeof v === "object" && "text" in v) return oChonMot((v as { text: unknown }).text);
  return null;
}

/** Một bản ghi Lark → mã lựa chọn + mốc ngày. Tên lạ (không có trong danh sách lựa chọn) → null. */
export function dichBanGhi(
  fields: Record<string, unknown>,
  lastModified: number | undefined,
  bang: BangMa,
): TrangThaiDoc {
  const tenTT = oChonMot(fields[bang.cotTrangThai]);
  const tenCB = bang.cotCanhBao ? oChonMot(fields[bang.cotCanhBao]) : null;
  const maTrangThai = tenTT ? (bang.maTrangThai.get(tenTT) ?? null) : null;
  const maCanhBao = tenCB ? (bang.maCanhBao.get(tenCB) ?? null) : null;
  const gd = giaiDoanCua(maTrangThai);
  const cotNgay = gd !== null ? bang.cotNgay.get(gd) : undefined;
  const giaTriNgay = cotNgay ? fields[cotNgay] : undefined;
  const ngayVaoGiaiDoan =
    typeof giaTriNgay === "number" && giaTriNgay > 0 ? new Date(giaTriNgay) : null;
  return {
    maTrangThai,
    maCanhBao,
    ngayVaoGiaiDoan,
    suaLuc: typeof lastModified === "number" && lastModified > 0 ? new Date(lastModified) : null,
  };
}

export interface DongGallery {
  lark_trang_thai: string | null;
  lark_trang_thai_tu: Date | null;
}

/**
 * Mốc "ở trạng thái này từ lúc nào" sau lượt đọc.
 *
 * - Trạng thái không đổi → giữ mốc cũ (mốc cũ trống thì thử cột ngày Lark).
 * - Đổi từ một giá trị ĐÃ BIẾT → bây giờ (app vừa thấy nó đổi).
 * - Lần đầu thấy (trước đó trống) → cột ngày của Lark nếu giai đoạn đó CÓ cột
 *   ngày (Ngày chọn ảnh, Ngày Gửi In, Ngày ảnh về, Ngày giao ảnh…); không có
 *   thì NULL — chưa nhắc gì cho lượt này.
 *
 * KHÔNG đoán bằng `last_modified_time`: bản đầu làm vậy, và chạy thử trên dữ
 * liệu thật 25/09/2026 cho ra 92 bộ "tới mốc" ngay ngày đầu — bản ghi Lark bị
 * sửa vì đủ lý do (ghi link app, đổi Cảnh Báo…), nên một bộ nằm "Đã gửi duyệt"
 * 40 ngày trông như mới 3 ngày và bị nhắc sai. Không biết thì không nhắc.
 */
export function tinhMocTu(cu: DongGallery, moi: TrangThaiDoc, bayGio: Date): Date | null {
  if (!moi.maTrangThai) return null;
  if (cu.lark_trang_thai === moi.maTrangThai) {
    return cu.lark_trang_thai_tu ?? moi.ngayVaoGiaiDoan;
  }
  if (cu.lark_trang_thai) return bayGio;
  return moi.ngayVaoGiaiDoan;
}

// ---------------------------------------------------------------------------
// Phần gọi mạng
// ---------------------------------------------------------------------------

async function larkGet<T>(auth: LarkAuthHeader, path: string): Promise<T> {
  const res = await fetch(`${HOST}${path}`, {
    headers: { authorization: auth.authorization },
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { code: number; msg?: string; data?: T };
  if (json.code !== 0 || !json.data) throw new Error(`Lark ${path.split("?")[0]}: ${json.msg ?? json.code}`);
  return json.data;
}

async function timBangHauKy(auth: LarkAuthHeader, baseToken: string): Promise<string> {
  const d = await larkGet<{ items: { table_id: string; name: string }[] }>(
    auth,
    `/bitable/v1/apps/${baseToken}/tables?page_size=100`,
  );
  const t = d.items.find((x) => /h[aậ]u\s*k[yỳ]/i.test(x.name));
  if (!t) throw new Error("Không tìm thấy bảng Hậu Kỳ trên Lark");
  return t.table_id;
}

/**
 * Đọc trạng thái của MỌI bản ghi Hậu Kỳ. Chỉ xin đúng các cột trạng thái + ngày
 * (field_names) — không kéo tên, số điện thoại khách về máy chủ.
 */
export async function docTrangThaiTuLark(opts: {
  appId: string;
  appSecret: string;
  baseToken: string;
}): Promise<Map<string, TrangThaiDoc>> {
  if (dangChayPhepThu()) throw new Error("Đang chạy phép thử — không gọi Lark thật");
  const auth = await larkAuth(opts.appId, opts.appSecret);
  const tableId = await timBangHauKy(auth, opts.baseToken);
  const cot = await larkGet<{ items: CotLark[] }>(
    auth,
    `/bitable/v1/apps/${opts.baseToken}/tables/${tableId}/fields?page_size=100`,
  );
  const bang = dungBangMa(cot.items);
  const tenCot = [bang.cotTrangThai, bang.cotCanhBao, ...bang.cotNgay.values()].filter(
    (x): x is string => !!x,
  );

  const ra = new Map<string, TrangThaiDoc>();
  let pageToken = "";
  do {
    const q = new URLSearchParams({
      page_size: "500",
      field_names: JSON.stringify(tenCot),
      automatic_fields: "true",
    });
    if (pageToken) q.set("page_token", pageToken);
    const d = await larkGet<{
      items?: { record_id: string; fields: Record<string, unknown>; last_modified_time?: number }[];
      has_more?: boolean;
      page_token?: string;
    }>(auth, `/bitable/v1/apps/${opts.baseToken}/tables/${tableId}/records?${q}`);
    for (const it of d.items ?? []) ra.set(it.record_id, dichBanGhi(it.fields, it.last_modified_time, bang));
    pageToken = d.has_more ? (d.page_token ?? "") : "";
  } while (pageToken);
  return ra;
}

/**
 * Ghi kết quả đọc vào galleries. Chỉ đụng bộ ảnh có lark_hauky_record_id nằm
 * trong kết quả; bộ không còn trên Lark thì để nguyên (không xoá trạng thái vì
 * một lượt đọc lỗi phân trang).
 */
export async function ghiTrangThaiVaoGalleries(
  client: pg.Client | pg.PoolClient,
  doc: Map<string, TrangThaiDoc>,
  bayGio = new Date(),
): Promise<{ doc: number; doi: number }> {
  const { rows } = await client.query<{
    id: string;
    lark_hauky_record_id: string;
    lark_trang_thai: string | null;
    lark_canh_bao: string | null;
    lark_trang_thai_tu: Date | null;
  }>(
    `select id, lark_hauky_record_id, lark_trang_thai, lark_canh_bao, lark_trang_thai_tu
       from galleries where lark_hauky_record_id is not null and status <> 'archived'`,
  );
  let soDoc = 0;
  let soDoi = 0;
  for (const g of rows) {
    const moi = doc.get(g.lark_hauky_record_id);
    if (!moi) continue;
    soDoc++;
    const tu = tinhMocTu(g, moi, bayGio);
    const doi =
      g.lark_trang_thai !== moi.maTrangThai ||
      g.lark_canh_bao !== moi.maCanhBao ||
      (g.lark_trang_thai_tu?.getTime() ?? null) !== (tu?.getTime() ?? null);
    if (doi) soDoi++;
    if (doi) {
      await client.query(
        `update galleries set lark_trang_thai = $2, lark_canh_bao = $3, lark_trang_thai_tu = $4, lark_doc_luc = $5
          where id = $1`,
        [g.id, moi.maTrangThai, moi.maCanhBao, tu, bayGio],
      );
    } else {
      await client.query(`update galleries set lark_doc_luc = $2 where id = $1`, [g.id, bayGio]);
    }
  }
  return { doc: soDoc, doi: soDoi };
}
