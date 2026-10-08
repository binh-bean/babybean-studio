/**
 * BB-407 — phần THUẦN của đồng bộ link chat Lark → `customers.facebook` (không I/O).
 *
 * Tệp này CỐ Ý không import gì ngoài `node:crypto` (và không dùng alias `@/`) để cả app
 * (qua `dong-bo-link-chat.ts`) lẫn script `.mjs` chạy bằng node (`bb404-bu-link-chat.mjs`)
 * nạp thẳng được — hai bên dùng CHUNG một luật, không chép lại. Bộ lọc http(s)
 * (`linkChatKhach`) được TIÊM vào qua tham số `locLink` vì nạp nó cần đường dẫn có đuôi `.ts`.
 *
 * Luật: Lark có link http(s) hợp lệ và KHÁC giá trị đang có → ghi đè; giống → không ghi;
 * Lark trống/hỏng → giữ nguyên (không xoá); một khách khớp nhiều link KHÁC nhau → bỏ qua.
 * Phần `text` của ô URL Lark là TÊN KHÁCH — không bao giờ đọc ra.
 */
import { createHash } from "node:crypto";

/** Bộ lọc link: chuỗi thô → URL http(s) hợp lệ đã chuẩn hoá, hoặc null (`linkChatKhach`). */
export type LocLink = (raw: unknown) => string | null;

/**
 * Câu SQL ghi dùng chung (pg): $1 = link (đã qua `linkChatKhach`), $2 = id khách. Ghi khi link
 * KHÁC giá trị đang có (NULL/trắng coi như trống nên cũng khác). Điều kiện nằm trong cùng câu
 * UPDATE nên hai lượt chạy cùng lúc không đè nhau; rowCount = 0 nghĩa là đã giống (hoặc không
 * có khách).
 */
export const SQL_GHI_LINK_CHAT_THEO_LARK = `update customers set facebook = $1::text
  where id = $2 and btrim(coalesce(facebook, '')) is distinct from $1::text`;

/** Toàn bộ khách + các mã dòng Hậu Kỳ của bộ ảnh họ (để khớp theo dòng). */
export const SQL_KHACH_VA_BO = `select c.id, c.lark_customer_key, c.facebook,
        coalesce(array_agg(g.lark_hauky_record_id) filter (where g.lark_hauky_record_id is not null), '{}') as dong
   from customers c
   left join galleries g on g.customer_id = c.id
  group by c.id, c.lark_customer_key, c.facebook`;

export const MAU_BANG_KHACH_HANG = /Khách\s*Hàng/i;
export const MAU_BANG_HAU_KY = /h[aậ]u\s*k[yỳ]/i;
const MAU_COT_LINK_CHAT_KH = /^link\s*chat$/i;
const MAU_COT_CHAT_HAU_KY = /chat\s*v[ớo]i\s*kh[áa]ch/i;
const MAU_COT_MA_KH_HAU_KY = /mã\s*kh|mã\s*khách\s*hàng/i;

export interface DongLarkTho {
  record_id?: string;
  fields?: Record<string, unknown> | null;
}

/** Cùng công thức `customerKey` của sync-retouch.ts (sha256 của Mã Khách Hàng, 12 ký tự). */
export function khoaKhachTuMa(ma: string): string {
  return createHash("sha256").update(String(ma)).digest("hex").slice(0, 12);
}

/** Chữ của ô MÃ (không dùng cho ô URL — `text` của ô URL là tên khách). */
function chuCuaOMa(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v == null
          ? ""
          : typeof v === "object"
            ? ((v as { text?: string }).text ??
              (v as { name?: string }).name ??
              (v as { fullPhoneNum?: string }).fullPhoneNum ??
              "")
            : String(v),
      )
      .join("");
  }
  if (typeof value === "object") {
    const o = value as { text?: string; name?: string; fullPhoneNum?: string };
    return o.text ?? o.name ?? o.fullPhoneNum ?? "";
  }
  return String(value);
}

/** Link http(s) đầu tiên của ô URL/lookup — chỉ đọc `link`, bỏ hẳn `text`. */
export function linkCuaO(value: unknown, locLink: LocLink): string | null {
  const ung = Array.isArray(value) ? value : value == null ? [] : [value];
  for (const v of ung) {
    const tho = typeof v === "string" ? v : v && typeof v === "object" ? (v as { link?: unknown }).link : null;
    const link = locLink(tho);
    if (link) return link;
  }
  return null;
}

function oTheoMau(fields: Record<string, unknown> | null | undefined, mau: RegExp): unknown {
  for (const k of Object.keys(fields ?? {})) if (mau.test(k)) return (fields as Record<string, unknown>)[k];
  return undefined;
}

/** Gom link theo khoá; khoá có ≥ 2 link KHÁC nhau → null (mơ hồ). */
function themLink(map: Map<string, string | null>, khoa: string | null, link: string | null): void {
  if (!khoa || !link) return;
  if (!map.has(khoa)) map.set(khoa, link);
  else if (map.get(khoa) !== link) map.set(khoa, null);
}

export interface LinkChatTuLark {
  /** khoá khách → link (bảng Khách Hàng); null = mơ hồ */
  theoKhachHang: Map<string, string | null>;
  /** khoá khách → link (Hậu Kỳ, theo Mã KH); null = mơ hồ */
  theoHauKyMaKH: Map<string, string | null>;
  /** record_id Hậu Kỳ → link; null = mơ hồ */
  theoDongHauKy: Map<string, string | null>;
}

/** Dòng Lark thô → ba bảng tra link. Link hỏng (javascript:, chữ thường…) đã bị loại. */
export function gomLinkChatTuLark(khachHang: DongLarkTho[], hauKy: DongLarkTho[], locLink: LocLink): LinkChatTuLark {
  const theoKhachHang = new Map<string, string | null>();
  for (const r of khachHang) {
    const ma = chuCuaOMa(r.fields?.["Mã Khách Hàng"]).trim();
    themLink(theoKhachHang, ma ? khoaKhachTuMa(ma) : null, linkCuaO(oTheoMau(r.fields, MAU_COT_LINK_CHAT_KH), locLink));
  }
  const theoHauKyMaKH = new Map<string, string | null>();
  const theoDongHauKy = new Map<string, string | null>();
  for (const r of hauKy) {
    const link = linkCuaO(oTheoMau(r.fields, MAU_COT_CHAT_HAU_KY), locLink);
    const ma = chuCuaOMa(oTheoMau(r.fields, MAU_COT_MA_KH_HAU_KY)).trim();
    themLink(theoHauKyMaKH, ma ? khoaKhachTuMa(ma) : null, link);
    themLink(theoDongHauKy, r.record_id ?? null, link);
  }
  return { theoKhachHang, theoHauKyMaKH, theoDongHauKy };
}

export interface KhachTrongApp {
  id: string;
  lark_customer_key: string | null;
  /** `customers.facebook` hiện tại */
  facebook: string | null;
  /** `galleries.lark_hauky_record_id` của các bộ ảnh của khách */
  dong: string[];
}

export type NguonLinkChat = "theoKhachHang" | "theoHauKyMaKH" | "theoDongHauKy";

export interface MucGhiLinkChat {
  id: string;
  link: string;
  nguon: NguonLinkChat;
}

export interface DemLinkChat {
  khachTrongApp: number;
  /** khách sẽ được ghi (link Lark khác giá trị đang có) */
  seGhi: number;
  /** `seGhi` tách theo nguồn */
  theoKhachHang: number;
  theoHauKyMaKH: number;
  theoDongHauKy: number;
  /** link Lark giống giá trị đang có — không ghi */
  giongRoi: number;
  /** khớp nhiều link khác nhau, không chọn được — bỏ qua */
  moHo: number;
  /** không tìm thấy link hợp lệ trên Lark — giữ nguyên */
  khongCoTrenLark: number;
}

/** Link Lark cho MỘT khách, hoặc lý do không có. Ưu tiên: Khách Hàng → Hậu Kỳ (Mã KH) → dòng Hậu Kỳ. */
function linkChoKhach(
  nguon: LinkChatTuLark,
  k: KhachTrongApp,
): { link: string; nguon: NguonLinkChat } | { link: null; moHo: boolean } {
  let moHo = false;
  if (k.lark_customer_key) {
    const a = nguon.theoKhachHang.get(k.lark_customer_key);
    if (a) return { link: a, nguon: "theoKhachHang" };
    if (a === null) moHo = true;
    const b = nguon.theoHauKyMaKH.get(k.lark_customer_key);
    if (b) return { link: b, nguon: "theoHauKyMaKH" };
    if (b === null) moHo = true;
  }
  const tuDong = new Set<string>();
  for (const rid of k.dong ?? []) {
    const l = nguon.theoDongHauKy.get(rid);
    if (l) tuDong.add(l);
    else if (l === null) moHo = true;
  }
  if (tuDong.size === 1) return { link: [...tuDong][0] as string, nguon: "theoDongHauKy" };
  if (tuDong.size > 1) moHo = true;
  return { link: null, moHo };
}

/**
 * KẾ HOẠCH ghi, không I/O: với mỗi khách trong app, link Lark (nếu có, không mơ hồ) khác giá
 * trị đang có → vào `seGhi`; giống → `giongRoi`; Lark trống/hỏng → giữ nguyên (không bao giờ
 * có mục xoá). So khớp cùng cách `SQL_GHI_LINK_CHAT_THEO_LARK` (cắt khoảng trắng hai đầu).
 */
export function tinhKeHoachLinkChat(
  nguon: LinkChatTuLark,
  khach: KhachTrongApp[],
): { seGhi: MucGhiLinkChat[]; dem: DemLinkChat } {
  const dem: DemLinkChat = {
    khachTrongApp: khach.length,
    seGhi: 0,
    theoKhachHang: 0,
    theoHauKyMaKH: 0,
    theoDongHauKy: 0,
    giongRoi: 0,
    moHo: 0,
    khongCoTrenLark: 0,
  };
  const seGhi: MucGhiLinkChat[] = [];
  for (const k of khach) {
    const kq = linkChoKhach(nguon, k);
    if (kq.link === null) {
      if (kq.moHo) dem.moHo += 1;
      else dem.khongCoTrenLark += 1;
      continue;
    }
    if (typeof k.facebook === "string" && k.facebook.trim() === kq.link) {
      dem.giongRoi += 1;
      continue;
    }
    dem[kq.nguon] += 1;
    dem.seGhi += 1;
    seGhi.push({ id: k.id, link: kq.link, nguon: kq.nguon });
  }
  return { seGhi, dem };
}

/** Dòng truy vấn `SQL_KHACH_VA_BO` → `KhachTrongApp`. */
export function khachTuDongSql(r: Record<string, unknown>): KhachTrongApp {
  return {
    id: String(r.id),
    lark_customer_key: typeof r.lark_customer_key === "string" ? r.lark_customer_key : null,
    facebook: typeof r.facebook === "string" ? r.facebook : null,
    dong: Array.isArray(r.dong) ? (r.dong as unknown[]).filter((x): x is string => typeof x === "string") : [],
  };
}
