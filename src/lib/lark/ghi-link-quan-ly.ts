/**
 * Ghi link MÀN QUẢN LÝ BỘ ẢNH (`/admin/galleries/<id>`) lên cột "Link quản lý
 * bộ ảnh" của bảng Hậu Kỳ bên Lark — BB-373 (anh chốt 06/10/2026).
 *
 * OWNER: DEV-INT. Tệp MỚI, không sửa hàm nào của `ghi-link-app.ts` (đội BB-369
 * đang làm việc quanh đồng bộ Lark) — chỉ DÙNG LẠI `HOST`, `larkAuth`,
 * `docCauHinhLark`, `MAU_TEN_BANG_HAU_KY`.
 *
 * Để làm gì: nhân viên đang đứng trong Lark (dòng Hậu Kỳ) bấm một cái là sang
 * thẳng màn quản lý bộ ảnh trong app để kiểm sản phẩm.
 *
 * ---------------------------------------------------------------------------
 * Cùng rào với `ghiLinkAppVeLark`, thêm hai điều
 * ---------------------------------------------------------------------------
 *   - Chỉ ghi ĐÚNG MỘT CỘT, tìm bảng và cột THEO TÊN lúc chạy (repo công khai).
 *   - Qua chốt `khongGuiRaLarkThat`: phép thử không bao giờ ghi Lark thật.
 *   - KHÔNG BAO GIỜ NÉM LỖI: Lark chết không được làm hỏng việc tạo bộ/gắn dòng.
 *   - CHƯA CÓ CỘT thì TỰ TẮT (trả `boQua: "chua_co_cot"`), không đoán cột khác.
 *   - Ô đang có thứ gì KHÔNG PHẢI link quản lý của chính app thì không đụng
 *     (nhân viên có thể dán ghi chú). Ô trống, hoặc đang giữ link quản lý của
 *     app trỏ SAI bộ (gắn nhầm rồi gắn lại), thì được ghi.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HOST, larkAuth, type LarkAuthHeader } from "@/lib/lark/sync-retouch";
import { MAU_TEN_BANG_HAU_KY, docCauHinhLark, bienMoiTruongConThieu, diaChiDayDu } from "@/lib/lark/ghi-link-app";
import { khongGuiRaLarkThat } from "@/lib/kiem-thu";

/**
 * Tên cột, NEO HAI ĐẦU. Chấp nhận: "Quản lý bộ ảnh", "Link quản lý bộ ảnh",
 * "Link quản lý", "Link quản trị bộ ảnh" — và đúng chữ đang có trên bảng thật
 * ngày 06/10/2026, "Link lý trị bộ ảnh" (gõ thiếu chữ "quản", cột kiểu URL, trống
 * 3.480 dòng — gần chắc là cột anh định). Không khớp "Link app" hay "Lấy link app".
 * So sau khi chuẩn hoá NFC (Lark có thể trả dấu tách rời).
 */
const GOC_TEN = String.raw`(?:qu[aả]n\s*(?:l[yý]|tr[iị])|l[yý]\s*tr[iị])`;
const DUOI_BO_ANH = String.raw`\s*b[oộ](?:\s*[aả]nh)?`;
/** Phải có chữ "link" HOẶC chữ "bộ": "Quản lý" trơn có thể là cột người phụ trách. */
export const MAU_TEN_COT_LINK_QUAN_LY = new RegExp(
  String.raw`^\s*(?:link\s*${GOC_TEN}(?:${DUOI_BO_ANH})?|${GOC_TEN}${DUOI_BO_ANH})\s*$`,
  "i",
);
export const laCotLinkQuanLy = (ten: string): boolean => MAU_TEN_COT_LINK_QUAN_LY.test(ten.normalize("NFC"));

const KIEU_O_CHU = 1;
const KIEU_O_URL = 15;

export interface ViTriCotQuanLy {
  tableId: string;
  tenBang: string;
  fieldName: string;
  fieldType: number;
}

export type KetQuaTimCot =
  | { thay: true; viTri: ViTriCotQuanLy }
  | { thay: false; lyDo: string; cotGanGiong: string[] };

/** Đường dẫn màn quản lý bộ ảnh trong app. */
export const duongDanQuanLyBoAnh = (galleryId: string) => `/admin/galleries/${galleryId}`;

/**
 * Tìm bảng Hậu Kỳ + cột "Link quản lý bộ ảnh". KHÔNG ném khi chưa có cột —
 * trả `{ thay: false }` kèm danh sách cột có chữ "quản lý"/"link" để người vận
 * hành biết cột nào đang có. Ném chỉ khi Lark không trả lời được (bên gọi bắt).
 */
export async function timCotLinkQuanLy(auth: LarkAuthHeader, baseToken: string): Promise<KetQuaTimCot> {
  const listRes = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables?page_size=100`, {
    headers: { authorization: auth.authorization },
  });
  const list = (await listRes.json()) as {
    code: number;
    msg?: string;
    data?: { items?: Array<{ table_id: string; name: string }> };
  };
  if (list.code !== 0 || !list.data?.items) {
    throw new Error(`Không liệt kê được bảng từ Lark: ${list.msg || "lỗi kết nối"}`);
  }
  const table = list.data.items.find((t) => MAU_TEN_BANG_HAU_KY.test(t.name));
  if (!table) throw new Error("Không tìm thấy bảng Hậu Kỳ bên Lark.");

  const fieldsRes = await fetch(
    `${HOST}/bitable/v1/apps/${baseToken}/tables/${table.table_id}/fields?page_size=200`,
    { headers: { authorization: auth.authorization } },
  );
  const fields = (await fieldsRes.json()) as {
    code: number;
    msg?: string;
    data?: { items?: Array<{ field_name: string; type: number }> };
  };
  if (fields.code !== 0 || !fields.data?.items) {
    throw new Error(`Không đọc được danh sách cột của ${table.name}: ${fields.msg || "lỗi API"}`);
  }

  const khop = fields.data.items.filter((f) => laCotLinkQuanLy(f.field_name));
  const cotGanGiong = fields.data.items
    .filter((f) => /qu[aả]n|l[yý]\s*tr[iị]|link/i.test(f.field_name.normalize("NFC")))
    .map((f) => f.field_name);
  if (khop.length === 0) {
    return {
      thay: false,
      lyDo: `Bảng ${table.name} chưa có cột "Link quản lý bộ ảnh".`,
      cotGanGiong,
    };
  }
  if (khop.length > 1) {
    return {
      thay: false,
      lyDo: `Bảng ${table.name} có ${khop.length} cột trùng tên kiểu "Link quản lý bộ ảnh" — không chọn bừa.`,
      cotGanGiong,
    };
  }
  const f = khop[0]!;
  if (f.type !== KIEU_O_CHU && f.type !== KIEU_O_URL) {
    return {
      thay: false,
      lyDo: `Cột "${f.field_name}" đang là kiểu ${f.type}, không phải ô chữ hay ô URL — không ghi để khỏi làm hỏng cột.`,
      cotGanGiong,
    };
  }
  return { thay: true, viTri: { tableId: table.table_id, tenBang: table.name, fieldName: f.field_name, fieldType: f.type } };
}

/** Lấy địa chỉ trong ô Lark (chữ thuần, hoặc { link, text } của ô URL). */
export function diaChiTrongO(o: unknown): string {
  if (typeof o === "string") return o.trim();
  if (o && typeof o === "object") {
    const first = Array.isArray(o) ? o[0] : o;
    if (first && typeof first === "object") {
      const f = first as { link?: string; text?: string };
      return String(f.link ?? f.text ?? "").trim();
    }
  }
  return "";
}

export interface QuyetDinhGhi {
  ghi: boolean;
  /** `da_dung` = ô đã đúng link này rồi. */
  boQua?: "da_dung" | "o_co_noi_dung_khac";
  lyDo?: string;
}

/**
 * Có nên ghi `diaChiMoi` vào ô đang chứa `oDangCo` không?
 *
 * Thuần: không gọi mạng, để phép thử bắt đúng từng ca. Ghi khi:
 *   - ô trống;
 *   - ô đang giữ link quản lý CỦA CHÍNH APP (cùng nguồn gốc, `/admin/galleries/<id>`)
 *     trỏ bộ khác — gắn nhầm bộ rồi sửa lại.
 * Không ghi khi ô đã đúng link này, hoặc đang giữ thứ khác (ghi chú, link của
 * môi trường khác, link Drive…).
 */
export function quyetDinhGhiLinkQuanLy(oDangCo: string, diaChiMoi: string): QuyetDinhGhi {
  const cu = oDangCo.trim();
  if (!cu) return { ghi: true };
  if (cu === diaChiMoi) return { ghi: false, boQua: "da_dung" };
  try {
    const u1 = new URL(cu);
    const u2 = new URL(diaChiMoi);
    const laLinkQuanLyCuaMinh = u1.origin === u2.origin && /^\/admin\/galleries\/[^/]+\/?$/.test(u1.pathname);
    if (laLinkQuanLyCuaMinh) {
      return u1.pathname.replace(/\/$/, "") === u2.pathname ? { ghi: false, boQua: "da_dung" } : { ghi: true };
    }
  } catch {
    /* không phải địa chỉ web → coi như ghi chú */
  }
  return {
    ghi: false,
    boQua: "o_co_noi_dung_khac",
    lyDo: "Ô đang giữ nội dung khác (không phải link quản lý của app) — không ghi đè.",
  };
}

function giaTriO(viTri: ViTriCotQuanLy, diaChi: string): unknown {
  // Nhãn của ô URL đặt bằng chính địa chỉ — không bao giờ bằng tên khách (docs/16 §7.3).
  return viTri.fieldType === KIEU_O_URL ? { link: diaChi, text: diaChi } : diaChi;
}

export type LyDoBoQuaQuanLy =
  | "dang_chay_phep_thu"
  | "khong_co_dong_lark"
  | "thieu_cau_hinh_lark"
  | "thieu_dia_chi_goc"
  | "chua_co_cot"
  | "khong_thay_dong"
  | "da_dung"
  | "o_co_noi_dung_khac"
  | "loi";

export interface KetQuaGhiQuanLy {
  ghiDuoc: boolean;
  /** Chạy thử (không ghi): chỉ cho biết SẼ ghi hay không. */
  chayThu: boolean;
  /** Chạy thử: lượt ghi sẽ xảy ra (chưa gọi PUT). */
  seGhi?: boolean;
  boQua?: LyDoBoQuaQuanLy;
  lyDo?: string;
  viTri?: ViTriCotQuanLy;
}

export interface TuyChonGhiQuanLy {
  recordId: string;
  /** Địa chỉ ĐẦY ĐỦ, ví dụ https://.../admin/galleries/<id>. */
  diaChi: string;
  /** false = chạy thử: đọc ô, quyết định, KHÔNG gọi PUT. */
  ghiThat: boolean;
  /** Đã có sẵn (nạp một lần cho cả lô) thì khỏi xin token/tìm cột lại. */
  auth?: LarkAuthHeader;
  baseToken?: string;
  viTri?: ViTriCotQuanLy;
}

async function docO(
  auth: LarkAuthHeader,
  baseToken: string,
  viTri: ViTriCotQuanLy,
  recordId: string,
): Promise<{ coDong: boolean; oDangCo: string }> {
  const res = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables/${viTri.tableId}/records/${recordId}`, {
    headers: { authorization: auth.authorization },
  });
  const json = (await res.json()) as {
    code: number;
    data?: { record?: { fields?: Record<string, unknown> } };
  };
  if (json.code !== 0 || !json.data?.record) return { coDong: false, oDangCo: "" };
  return { coDong: true, oDangCo: diaChiTrongO(json.data.record.fields?.[viTri.fieldName]) };
}

/** Ghi link quản lý lên Lark. KHÔNG BAO GIỜ NÉM LỖI. */
export async function ghiLinkQuanLyVeLark(opts: TuyChonGhiQuanLy): Promise<KetQuaGhiQuanLy> {
  const chayThu = !opts.ghiThat;

  if (khongGuiRaLarkThat()) {
    return { ghiDuoc: false, chayThu: true, boQua: "dang_chay_phep_thu", lyDo: "Đang chạy phép thử — không ghi thật lên Lark." };
  }
  if (!opts.recordId) {
    return { ghiDuoc: false, chayThu, boQua: "khong_co_dong_lark", lyDo: "Bộ ảnh này chưa gắn dòng Hậu Kỳ nào bên Lark." };
  }
  const cauHinh = docCauHinhLark();
  if (!cauHinh) {
    return {
      ghiDuoc: false,
      chayThu,
      boQua: "thieu_cau_hinh_lark",
      lyDo: `Chưa cấu hình Lark (thiếu ${bienMoiTruongConThieu().join(", ")}).`,
    };
  }

  try {
    const auth = opts.auth ?? (await larkAuth(cauHinh.appId, cauHinh.appSecret));
    const baseToken = opts.baseToken ?? cauHinh.baseToken;
    let viTri = opts.viTri;
    if (!viTri) {
      const tim = await timCotLinkQuanLy(auth, baseToken);
      if (!tim.thay) return { ghiDuoc: false, chayThu, boQua: "chua_co_cot", lyDo: tim.lyDo };
      viTri = tim.viTri;
    }

    const { coDong, oDangCo } = await docO(auth, baseToken, viTri, opts.recordId);
    if (!coDong) {
      return { ghiDuoc: false, chayThu, viTri, boQua: "khong_thay_dong", lyDo: `Không tìm thấy dòng Hậu Kỳ ${opts.recordId} bên Lark.` };
    }
    const qd = quyetDinhGhiLinkQuanLy(oDangCo, opts.diaChi);
    if (!qd.ghi) {
      return { ghiDuoc: false, chayThu, viTri, boQua: qd.boQua, lyDo: qd.lyDo };
    }
    if (chayThu) return { ghiDuoc: false, chayThu: true, seGhi: true, viTri };

    const res = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables/${viTri.tableId}/records/${opts.recordId}`, {
      method: "PUT",
      headers: { authorization: auth.authorization, "content-type": "application/json" },
      // ĐÚNG MỘT KHOÁ: Lark giữ nguyên mọi cột không có mặt ở đây.
      body: JSON.stringify({ fields: { [viTri.fieldName]: giaTriO(viTri, opts.diaChi) } }),
    });
    const json = (await res.json()) as { code: number; msg?: string };
    if (json.code !== 0) {
      return { ghiDuoc: false, chayThu: false, viTri, boQua: "loi", lyDo: `Lark từ chối ghi: ${json.msg || `mã lỗi ${json.code}`}` };
    }
    return { ghiDuoc: true, chayThu: false, viTri };
  } catch (err) {
    return {
      ghiDuoc: false,
      chayThu,
      boQua: "loi",
      lyDo: `Không ghi được sang Lark: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Điểm vào cho các đường "bộ ảnh vừa được gắn dòng Hậu Kỳ" (tạo bộ từ Lark,
 * gắn dòng, đồng bộ lại ảnh): đọc `lark_hauky_record_id` của bộ, dựng địa chỉ
 * `NEXT_PUBLIC_APP_URL + /admin/galleries/<id>`, ghi. KHÔNG BAO GIỜ NÉM.
 */
export async function ghiLinkQuanLyChoBoAnh(
  admin: SupabaseClient,
  galleryId: string,
  ngucanh: { requestId?: string } = {},
): Promise<KetQuaGhiQuanLy> {
  try {
    const { data: g, error } = await admin
      .from("galleries")
      .select("id, lark_hauky_record_id")
      .eq("id", galleryId)
      .maybeSingle();
    if (error) throw error;
    const recordId = (g?.lark_hauky_record_id as string | null | undefined) ?? "";
    if (!recordId) {
      return { ghiDuoc: false, chayThu: false, boQua: "khong_co_dong_lark", lyDo: "Bộ ảnh chưa gắn dòng Hậu Kỳ." };
    }
    const diaChi = diaChiDayDu(duongDanQuanLyBoAnh(galleryId));
    if (!diaChi) {
      return { ghiDuoc: false, chayThu: false, boQua: "thieu_dia_chi_goc", lyDo: "Thiếu NEXT_PUBLIC_APP_URL." };
    }
    const kq = await ghiLinkQuanLyVeLark({ recordId, diaChi, ghiThat: true });
    // Chưa có cột / đang chạy phép thử là chuyện bình thường — không ồn ào.
    if (kq.boQua && kq.boQua !== "chua_co_cot" && kq.boQua !== "dang_chay_phep_thu" && kq.boQua !== "da_dung") {
      console.info(
        JSON.stringify({ evt: "lark.link_quan_ly", requestId: ngucanh.requestId ?? null, galleryId, boQua: kq.boQua, lyDo: kq.lyDo ?? null }),
      );
    }
    return kq;
  } catch (err) {
    return { ghiDuoc: false, chayThu: false, boQua: "loi", lyDo: err instanceof Error ? err.message : String(err) };
  }
}
