/**
 * BB-325 — tra một dòng Hậu Kỳ bên Lark theo MÃ HÓA ĐƠN + SỐ ĐIỆN THOẠI KHÁCH.
 *
 * Vì sao có tệp này: trước BB-325 thuật sĩ "Tạo bộ ảnh mới" cho nhân viên gõ
 * tay tên mẹ, số điện thoại, gói chụp (chọn từ bảng `packages` — dữ liệu mẫu,
 * không phải danh sách gói thật bên Lark), còn ô "Mã hợp đồng Lark" thì bị Zod
 * lột mất trước khi tới cơ sở dữ liệu. Kết quả: bộ ảnh tạo trong app KHÔNG có
 * `lark_hauky_record_id`, nên Link app của nó "không biết đi về đâu" bên Lark
 * (yêu cầu "đi về đâu", 29/09/2026).
 *
 * Giờ mọi bộ ảnh tạo tay phải neo vào MỘT dòng Hậu Kỳ có thật:
 *   - nhân viên gõ mã hóa đơn (HD_YYYYMMDD#NN) + số điện thoại khách;
 *   - app tìm dòng Hậu Kỳ khớp CẢ HAI (lọc thô bằng API search của Lark, rồi
 *     so khớp CHÍNH XÁC ở đây — "contains" của Lark coi "#57" khớp "#572");
 *   - không thấy thì chặn tạo và nói lý do.
 *
 * CHỈ ĐỌC Lark. Không ghi gì sang Lark ở tệp này.
 */
import { larkAuth, HOST, cellText, getField, type LarkRecord } from "@/lib/lark/sync-retouch";
import { parseFolderName } from "@/lib/drive/parse-folder-name";
import { dangChayPhepThu } from "@/lib/kiem-thu";

const BANG_HAU_KY = /h[aậ]u\s*k[yỳ]/i;

/** Thông tin một dòng Hậu Kỳ đã bóc sẵn để điền vào thuật sĩ. */
export interface DongHauKy {
  recordId: string;
  maHoaDon: string;
  tenMe: string;
  soDienThoai: string;
  tenBe: string;
  goiChup: string;
  /** YYYY-MM-DD, null khi Lark để trống — KHÔNG rơi về hôm nay. */
  ngayChup: string | null;
  /** Ô "Tổng file edit" — số ảnh trong gói; null khi trống. */
  tongFileEdit: number | null;
  trangThai: string;
  /** Link mở đúng dòng này bên Lark (null khi thiếu cấu hình). */
  linkLark: string | null;
}

/** Chuẩn hoá mã hóa đơn để so: bỏ khoảng trắng, viết hoa. */
export function chuanHoaMaHoaDon(ma: string): string {
  return (ma ?? "").replace(/\s+/g, "").toUpperCase();
}

/** 9 chữ số cuối của số điện thoại — bỏ qua 0/+84 ở đầu. Rỗng khi < 9 chữ số. */
export function duoiSoDienThoai(sdt: string): string {
  const so = (sdt ?? "").replace(/\D/g, "");
  return so.length >= 9 ? so.slice(-9) : "";
}

/** Ngày từ ô ngày của Lark (mảng một phần tử epoch ms). */
function oNgay(v: unknown): string | null {
  const ms = Array.isArray(v) ? v[0] : v;
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Lark lưu mốc giờ theo UTC; buổi chụp ở VN (UTC+7).
  return new Date(n + 7 * 3_600_000).toISOString().slice(0, 10);
}

/**
 * Ô "Gói chụp" là ô tra cứu, có thể nhiều giá trị ("Fam 04" + "Thêm set chụp").
 * `cellText` nối liền không dấu cách ("Fam 04Thêm set chụp") — tách từng mục.
 */
export function danhSachGoi(v: unknown): string[] {
  const mang = Array.isArray(v) ? v : v == null ? [] : [v];
  return mang
    .flatMap((x) => cellText(x).split(","))
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Bóc một bản ghi Hậu Kỳ thành `DongHauKy`. HÀM THUẦN — phép thử đơn vị canh
 * trực tiếp, không gọi mạng.
 */
export function bocDongHauKy(record: LarkRecord, linkLark: string | null = null): DongHauKy {
  const f = record.fields ?? {};
  const maHoaDon = cellText(f["HĐ Tổng"]).trim();
  // Tên bé nằm TRONG NGOẶC của nhãn ô "Link ảnh gửi khách" ("FB Mẹ Thảo ( Anh Duong )")
  // — cùng luật với scripts/sync-lark-hauky.mjs. Không có ngoặc thì để trống, KHÔNG đoán.
  const nhanLinkAnh = cellText(f["Link ảnh gửi khách"]).trim();
  const tenBe = nhanLinkAnh && !/^https?:\/\//i.test(nhanLinkAnh) ? parseFolderName(nhanLinkAnh).babyName : "";
  const tong = Number(String(cellText(f["Tổng file edit"])).replace(/[^\d]/g, ""));
  return {
    recordId: record.record_id,
    maHoaDon,
    tenMe: cellText(f["Tên KH"]).trim(),
    soDienThoai: cellText(f["SDT KH"]).trim(),
    tenBe,
    goiChup: danhSachGoi(getField(f, /^g[oó]i\s*ch[uụ]p$/i)).join(", "),
    ngayChup: oNgay(f["Ngày Chụp"]),
    tongFileEdit: Number.isFinite(tong) && tong > 0 ? tong : null,
    trangThai: cellText(f["Trạng Thái"]).trim(),
    linkLark,
  };
}

/**
 * Lọc CHÍNH XÁC các bản ghi khớp mã hóa đơn + số điện thoại. Hàm thuần.
 * Mã hóa đơn so bằng nhau tuyệt đối (sau chuẩn hoá); số điện thoại so 9 số cuối.
 */
export function locDongKhop(records: LarkRecord[], maHoaDon: string, soDienThoai: string): LarkRecord[] {
  const ma = chuanHoaMaHoaDon(maHoaDon);
  const duoi = duoiSoDienThoai(soDienThoai);
  if (!ma || !duoi) return [];
  return records.filter((r) => {
    const f = r.fields ?? {};
    const maDong = chuanHoaMaHoaDon(cellText(f["HĐ Tổng"]));
    return maDong === ma && duoiSoDienThoai(cellText(f["SDT KH"])) === duoi;
  });
}

/**
 * BB-336 — mã lỗi tra Lark → câu tiếng Việt CỐ ĐỊNH cho nhân viên đọc
 * (luật BB-223: hàm trả lỗi không nhận thông điệp thô của lỗi chưa kiểm soát).
 *
 * Trước đây route trả thẳng `err.message`, mà một nhánh ghép cả `json.msg`
 * của Lark (tiếng Anh, thô) vào đó. Giờ `message` chỉ dùng cho log máy chủ
 * (có thể kèm chi tiết Lark); màn hình chỉ thấy `thongDiep`.
 */
export type MaLoiTraLark = "CHUA_CAU_HINH" | "KHONG_THAY_BANG" | "LARK_TU_CHOI" | "PHEP_THU";

export const THONG_DIEP_LOI_TRA_LARK: Record<MaLoiTraLark, string> = {
  CHUA_CAU_HINH: "Chưa cấu hình kết nối Lark trên máy chủ.",
  KHONG_THAY_BANG: "Không tìm thấy bảng Hậu Kỳ bên Lark.",
  LARK_TU_CHOI: "Lark từ chối tra cứu lúc này — thử lại sau ít phút.",
  PHEP_THU: "Đang chạy phép thử — không gọi Lark thật.",
};

export class LoiTraLark extends Error {
  readonly ma: MaLoiTraLark;
  /** Câu hiển thị cho nhân viên — luôn lấy từ bảng cố định, không chứa chữ của Lark. */
  readonly thongDiep: string;
  constructor(ma: MaLoiTraLark, chiTiet?: string) {
    const thongDiep = THONG_DIEP_LOI_TRA_LARK[ma];
    super(chiTiet ? `${thongDiep} (${chiTiet})` : thongDiep);
    this.name = "LoiTraLark";
    this.ma = ma;
    this.thongDiep = thongDiep;
  }
}

function cauHinh(): { appId: string; appSecret: string; baseToken: string } {
  const appId = process.env.LARK_APP_ID?.trim();
  const appSecret = process.env.LARK_APP_SECRET?.trim();
  const baseToken = process.env.LARK_BASE_APP_TOKEN?.trim();
  if (!appId || !appSecret || !baseToken) throw new LoiTraLark("CHUA_CAU_HINH");
  return { appId, appSecret, baseToken };
}

async function timBangHauKy(auth: { authorization: string }, baseToken: string): Promise<string> {
  const res = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables?page_size=100`, {
    headers: { authorization: auth.authorization },
  });
  const json = (await res.json()) as { code: number; data?: { items?: { table_id: string; name: string }[] } };
  const bang = json.data?.items?.find((t) => BANG_HAU_KY.test(t.name));
  if (json.code !== 0 || !bang) throw new LoiTraLark("KHONG_THAY_BANG");
  return bang.table_id;
}

function linkDong(baseToken: string, tableId: string, recordId: string): string {
  const goc = process.env.LARK_BASE_URL?.trim().replace(/\/$/, "") || `https://www.larksuite.com/base/${baseToken}`;
  return `${goc}?table=${encodeURIComponent(tableId)}&record=${encodeURIComponent(recordId)}`;
}

/** Tra dòng Hậu Kỳ theo mã hóa đơn + số điện thoại. Trả MỌI dòng khớp (thường 1). */
export async function traHauKy(maHoaDon: string, soDienThoai: string): Promise<DongHauKy[]> {
  if (dangChayPhepThu()) throw new LoiTraLark("PHEP_THU");
  const ma = chuanHoaMaHoaDon(maHoaDon);
  const duoi = duoiSoDienThoai(soDienThoai);
  if (!ma || !duoi) return [];
  const { appId, appSecret, baseToken } = cauHinh();
  const auth = await larkAuth(appId, appSecret);
  const tableId = await timBangHauKy(auth, baseToken);

  // "HĐ Tổng" là ô liên kết hai chiều — API search của Lark không lọc được nó
  // (đã thử 29/09: 0 kết quả). "Hợp đồng chi tiết" là ô tra cứu chứa
  // "HD_...#NN_<stt>", lọc được bằng contains; thêm "_" để "#57" không khớp "#572".
  const res = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables/${tableId}/records/search?page_size=50`, {
    method: "POST",
    headers: { authorization: auth.authorization, "content-type": "application/json" },
    body: JSON.stringify({
      filter: {
        conjunction: "and",
        conditions: [
          { field_name: "Hợp đồng chi tiết", operator: "contains", value: [`${ma}_`] },
          { field_name: "SDT KH", operator: "contains", value: [duoi] },
        ],
      },
      automatic_fields: false,
    }),
  });
  const json = (await res.json()) as { code: number; msg?: string; data?: { items?: { record_id: string }[] } };
  if (json.code !== 0) {
    // Chi tiết của Lark chỉ vào log máy chủ; màn hình nhận câu cố định (BB-336).
    console.error(JSON.stringify({ evt: "lark.tra_hau_ky.tu_choi", code: json.code, msg: json.msg ?? null }));
    throw new LoiTraLark("LARK_TU_CHOI", `Lark code ${json.code}: ${json.msg ?? ""}`);
  }

  // API search trả ô theo hình dạng KHÁC API đọc bản ghi ("HĐ Tổng" chỉ còn
  // link_record_ids, ô tra cứu thành {type, value}) — đo thật 29/09. Nên search
  // chỉ dùng để lấy record_id ứng viên (thường 1–3), rồi đọc lại từng dòng bằng
  // API bản ghi thường và so khớp CHÍNH XÁC trên hình dạng quen thuộc.
  const ids = (json.data?.items ?? []).map((r) => r.record_id).slice(0, 10);
  const dayDu = await Promise.all(ids.map((id) => docBanGhi(auth, baseToken, tableId, id)));
  return locDongKhop(dayDu.filter((r): r is LarkRecord => r !== null), ma, duoi).map((r) =>
    bocDongHauKy(r, linkDong(baseToken, tableId, r.record_id)),
  );
}

async function docBanGhi(
  auth: { authorization: string },
  baseToken: string,
  tableId: string,
  recordId: string,
): Promise<LarkRecord | null> {
  const res = await fetch(
    `${HOST}/bitable/v1/apps/${baseToken}/tables/${tableId}/records/${encodeURIComponent(recordId)}`,
    { headers: { authorization: auth.authorization } },
  );
  const json = (await res.json()) as { code: number; data?: { record?: LarkRecord } };
  if (json.code !== 0 || !json.data?.record) return null;
  return { ...json.data.record, record_id: recordId };
}

/** Đọc lại MỘT dòng Hậu Kỳ theo record_id — máy chủ tự đọc, không tin dữ liệu trình duyệt gửi lên. */
export async function docDongHauKy(recordId: string): Promise<DongHauKy | null> {
  if (dangChayPhepThu()) throw new LoiTraLark("PHEP_THU");
  const { appId, appSecret, baseToken } = cauHinh();
  const auth = await larkAuth(appId, appSecret);
  const tableId = await timBangHauKy(auth, baseToken);
  const record = await docBanGhi(auth, baseToken, tableId, recordId);
  return record ? bocDongHauKy(record, linkDong(baseToken, tableId, recordId)) : null;
}
