/**
 * BB-395 — NGUỒN HOÁ ĐƠN bản LARK. CHỈ ĐỌC. Toàn bộ tên bảng/trường Lark của việc xác nhận
 * bằng hoá đơn nằm trong tệp này — chỗ khác chỉ thấy `HoaDonChuan`.
 *
 * Đường đọc (đo thật 08/10/2026 trên hoá đơn phát sinh hậu kỳ):
 *   1. Bảng `Hóa Đơn` (khớp TÊN CHÍNH XÁC — regex sẽ trúng "📄 Hóa Đơn Chi Tiết").
 *      `records/search` với ô AutoNumber `Mã Hợp Đồng` báo InvalidFilter → dùng GET
 *      `records?filter=CurrentValue.[Mã Hợp Đồng]="HD_…"` rồi so mã CHÍNH XÁC lần nữa.
 *   2. Dòng: KHÔNG dùng search `contains "<mã>_"` (trả 0 dòng với hoá đơn mẫu). Đi theo link
 *      `Hóa Đơn Chi Tiết V2` của hoá đơn: `[0].record_ids` → GET từng bản ghi ở bảng
 *      "📄 Hóa Đơn Chi Tiết". Mỗi dòng vẫn so `Hóa Đơn` == mã (chống `#57` lẫn `#572`).
 *   3. Phiếu thu: link `💲Bảng Thu V2[0].record_ids` → GET từng bản ghi ở "💲Bảng Thu".
 *      Mảng ngoài KHÔNG rỗng kể cả khi không có phiếu — "có phiếu" ⇔ `record_ids` có phần tử.
 *   4. `Số Tiền Thanh Toán`, `Số Lượng`, `Giá chốt cuối` là CHUỖI SỐ (hoặc null) — parse ở đây.
 *   5. Khách: link `Mã Khách Hàng` → chữ "Mã KH" → băm bằng ĐÚNG `customerKey` của mã đồng
 *      bộ khách (sync-retouch.ts) để so với `customers.lark_customer_key`. Chữ gốc (có tên +
 *      SĐT) không ra khỏi tệp này.
 */
import { HOST, cellText, customerKey, larkAuth } from "@/lib/lark/sync-retouch";
import {
  LoiNguonHoaDon,
  type DongHoaDonChuan,
  type HoaDonChuan,
  type NguonHoaDon,
  type PhieuThuChuan,
  type PhuongThucPhieuThu,
} from "@/lib/hoa-don/nguon-hoa-don";

// --- Tên bảng / trường (CHỈ ở đây) -----------------------------------------
const BANG_HOA_DON = "Hóa Đơn";
const BANG_DONG = /h[oó]a đơn chi ti[eế]t/i;
const BANG_THU = /b[aả]ng thu/i;

const F_MA = "Mã Hợp Đồng";
const F_TONG = "Tổng phải thu";
const F_DA_THU = "Tổng Đã Thanh Toán";
const F_CON_LAI = "Còn Lại";
const F_TRANG_THAI = "Trạng thái thanh toán";
const F_LINK_THU = /b[aả]ng thu v2/i;
const F_LINK_DONG = /h[oó]a đơn chi ti[eế]t v2/i;
const F_KHACH = "Mã Khách Hàng";
const F_HAU_KY = /ti[eế]n đ[oộ] h[aậ]u k[yỳ]/i;

const FD_HOA_DON = "Hóa Đơn";
const FD_MA_DONG = "Mã Hóa Đơn Chi Tiết";
const FD_SAN_PHAM = "Chi Tiết SP / DV";
const FD_SO_LUONG = "Số Lượng";
const FD_GIA_CHOT = "Giá chốt cuối";

const FT_MA = "STT";
const FT_SO_TIEN = "Số Tiền Thanh Toán";
const FT_PHUONG_THUC = "Phương Thức TT";
const FT_NGAY = "Ngày Thu";

const MAU_TEN_FILE_CHINH = /edit\s*file/i;
const HAN_GIO_MS = 10_000;

// --- Hàm đọc ô (export cho phép thử) ---------------------------------------

/**
 * Số từ một ô Lark: số, chuỗi số ("1300000", "-300000"), mảng `[{text}]` / `[số]`,
 * hoặc ô tra cứu `{ value: [...] }`. Không đọc được → 0. Giữ dấu âm (Còn Lại < 0 = thu dư).
 */
export function soTuO(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const s = v.trim().replace(/[\s,₫]/g, "");
    if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
    const am = s.startsWith("-");
    const chuSo = s.replace(/[^\d]/g, "");
    return chuSo ? (am ? -1 : 1) * Number(chuSo) : 0;
  }
  if (Array.isArray(v)) {
    for (const x of v) {
      const n = typeof x === "object" && x !== null && "text" in x ? soTuO((x as { text: unknown }).text) : soTuO(x);
      if (n !== 0) return n;
    }
    return 0;
  }
  if (typeof v === "object" && "value" in (v as object)) return soTuO((v as { value: unknown }).value);
  return 0;
}

/** Id bản ghi của một ô liên kết: `[{ record_ids: [...] }]` (mảng ngoài có thể có phần tử rỗng). */
export function idLienKet(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ra: string[] = [];
  for (const x of v) {
    if (!x || typeof x !== "object") continue;
    const o = x as { record_ids?: unknown; record_id?: unknown };
    if (Array.isArray(o.record_ids)) for (const id of o.record_ids) if (typeof id === "string" && id) ra.push(id);
    if (typeof o.record_id === "string" && o.record_id) ra.push(o.record_id);
  }
  return [...new Set(ra)];
}

function truongTheoMau(fields: Record<string, unknown>, mau: RegExp): unknown {
  const k = Object.keys(fields).find((x) => mau.test(x));
  return k ? fields[k] : undefined;
}

function phuongThuc(chu: string): PhuongThucPhieuThu {
  const s = chu.toLowerCase();
  if (/ti[eề]n\s*m[aặ]t/.test(s)) return "tien_mat";
  if (/chuy[eể]n\s*kho[aả]n/.test(s)) return "chuyen_khoan";
  return "khac";
}

function ngayTuO(v: unknown): string | null {
  const n = typeof v === "number" ? v : soTuO(v);
  return n > 0 ? new Date(n).toISOString() : null;
}

/** Dòng hoá đơn chuẩn từ một bản ghi "Hóa Đơn Chi Tiết"; không thuộc mã `ma` → null. */
export function docDongHoaDon(ma: string, rec: { record_id: string; fields: Record<string, unknown> }): DongHoaDonChuan | null {
  const f = rec.fields;
  if (cellText(f[FD_HOA_DON]).trim() !== ma) return null;
  const maDong = cellText(f[FD_MA_DONG]).trim() || rec.record_id;
  // So khớp CHÍNH XÁC tiền tố mã dòng: `HD_…#57_` không được nhận dòng của `#572`.
  if (maDong.includes("_") && !maDong.startsWith(`${ma}_`)) return null;
  const tenSanPham = cellText(f[FD_SAN_PHAM]).trim();
  const soLuong = Math.max(0, Math.round(soTuO(f[FD_SO_LUONG]))) || (f[FD_SO_LUONG] == null ? 1 : 0);
  const thanhTien = Math.max(0, Math.round(soTuO(f[FD_GIA_CHOT])));
  const loai = thanhTien === 0 ? "dich_vu" : MAU_TEN_FILE_CHINH.test(tenSanPham) ? "file_chinh" : "san_pham";
  return { maDong, loai, idSanPhamNguon: idLienKet(f[FD_SAN_PHAM])[0] ?? null, tenSanPham, soLuong, thanhTien };
}

export function docPhieuThu(rec: { record_id: string; fields: Record<string, unknown> }): PhieuThuChuan {
  const f = rec.fields;
  const goc = cellText(f[FT_PHUONG_THUC]).trim();
  return {
    ma: cellText(f[FT_MA]).trim() || rec.record_id,
    soTien: Math.round(soTuO(f[FT_SO_TIEN])),
    phuongThuc: phuongThuc(goc),
    phuongThucGoc: goc,
    ngay: ngayTuO(f[FT_NGAY]),
  };
}

// --- Đọc mạng ---------------------------------------------------------------

type FetchFn = typeof fetch;

export interface CauHinhNguonLark {
  baseToken: string;
  /** Trả chuỗi `Bearer …`. Mặc định: `larkAuth` (ném trong phép thử). */
  layToken: () => Promise<string>;
  fetchFn?: FetchFn;
}

export function taoNguonHoaDonLark(ch: CauHinhNguonLark): NguonHoaDon {
  const f: FetchFn = ch.fetchFn ?? fetch;
  let bang: { hd: string; dong: string; thu: string } | null = null;

  async function goi<T>(url: string, token: string): Promise<T> {
    const ctl = new AbortController();
    const hen = setTimeout(() => ctl.abort(), HAN_GIO_MS);
    try {
      const res = await f(url, { headers: { authorization: token }, signal: ctl.signal });
      const json = (await res.json()) as { code?: number; msg?: string; data?: T };
      if (json.code !== 0 || !json.data) throw new LoiNguonHoaDon("LOI_NGUON", json.msg ?? `mã ${json.code}`);
      return json.data;
    } catch (e) {
      if (e instanceof LoiNguonHoaDon) throw e;
      if (e instanceof Error && e.name === "AbortError") throw new LoiNguonHoaDon("CHAM", "quá thời gian chờ");
      throw new LoiNguonHoaDon("LOI_NGUON", e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(hen);
    }
  }

  async function timBang(token: string) {
    if (bang) return bang;
    const d = await goi<{ items?: { table_id: string; name: string }[] }>(
      `${HOST}/bitable/v1/apps/${ch.baseToken}/tables?page_size=100`,
      token,
    );
    const ds = d.items ?? [];
    const hd = ds.find((t) => t.name.trim() === BANG_HOA_DON)?.table_id;
    const dong = ds.find((t) => BANG_DONG.test(t.name))?.table_id;
    const thu = ds.find((t) => BANG_THU.test(t.name))?.table_id;
    if (!hd || !dong || !thu) throw new LoiNguonHoaDon("LOI_NGUON", "không thấy bảng Hóa Đơn / Chi Tiết / Bảng Thu");
    bang = { hd, dong, thu };
    return bang;
  }

  async function docBanGhi(token: string, tableId: string, ids: string[]) {
    return Promise.all(
      ids.slice(0, 60).map(async (id) => {
        const d = await goi<{ record?: { fields: Record<string, unknown> } }>(
          `${HOST}/bitable/v1/apps/${ch.baseToken}/tables/${tableId}/records/${encodeURIComponent(id)}`,
          token,
        );
        return { record_id: id, fields: d.record?.fields ?? {} };
      }),
    );
  }

  return {
    ten: "lark",
    async layHoaDon(ma: string): Promise<HoaDonChuan | null> {
      const token = await ch.layToken().catch((e: unknown) => {
        throw new LoiNguonHoaDon("LOI_NGUON", e instanceof Error ? e.message : String(e));
      });
      const b = await timBang(token);
      const loc = encodeURIComponent(`CurrentValue.[${F_MA}]="${ma}"`);
      const d = await goi<{ items?: { record_id: string; fields: Record<string, unknown> }[] }>(
        `${HOST}/bitable/v1/apps/${ch.baseToken}/tables/${b.hd}/records?page_size=5&filter=${loc}`,
        token,
      );
      const rec = (d.items ?? []).find((r) => cellText(r.fields[F_MA]).trim() === ma);
      if (!rec) return null;
      const fl = rec.fields;

      const [dongTho, thuTho] = await Promise.all([
        docBanGhi(token, b.dong, idLienKet(truongTheoMau(fl, F_LINK_DONG))),
        docBanGhi(token, b.thu, idLienKet(truongTheoMau(fl, F_LINK_THU))),
      ]);
      const maKh = cellText(fl[F_KHACH]).trim();
      return {
        ma,
        nguon: "lark",
        tongPhaiThu: Math.round(soTuO(fl[F_TONG])),
        daThu: Math.round(soTuO(fl[F_DA_THU])),
        conLai: Math.round(soTuO(fl[F_CON_LAI])),
        trangThai: cellText(fl[F_TRANG_THAI]).trim(),
        phieuThu: thuTho.map(docPhieuThu),
        dong: dongTho.map((r) => docDongHoaDon(ma, r)).filter((x): x is DongHoaDonChuan => x !== null),
        khoaKhachNguon: maKh ? customerKey(maKh) : null,
        maHauKyNguon: idLienKet(truongTheoMau(fl, F_HAU_KY)),
      };
    },
  };
}

/** Nguồn Lark theo biến môi trường máy chủ. Thiếu cấu hình → nguồn luôn ném CHUA_CAU_HINH. */
export function nguonHoaDonLarkTuMoiTruong(): NguonHoaDon {
  const appId = process.env.LARK_APP_ID?.trim();
  const appSecret = process.env.LARK_APP_SECRET?.trim();
  const baseToken = process.env.LARK_BASE_APP_TOKEN?.trim();
  if (!appId || !appSecret || !baseToken) {
    return {
      ten: "lark",
      async layHoaDon() {
        throw new LoiNguonHoaDon("CHUA_CAU_HINH", "thiếu LARK_APP_ID / LARK_APP_SECRET / LARK_BASE_APP_TOKEN");
      },
    };
  }
  return taoNguonHoaDonLark({
    baseToken,
    layToken: async () => (await larkAuth(appId, appSecret)).authorization,
  });
}
