/**
 * BB-332 — "Bản ghi mới từ Lark": dòng Hậu Kỳ vừa tạo bên Lark, chưa thành bộ
 * ảnh trong app. Hiện ở đầu Bàn làm việc để nhân viên bấm vào, bổ sung link
 * Drive, tạo bộ ảnh + Link app (thuật sĩ BB-325).
 *
 * Luật chủ studio (30/09/2026, yêu cầu k6kft9qr):
 *   dòng Hậu Kỳ có TÊN KHÁCH + SỐ ĐIỆN THOẠI + GÓI CHỤP, cột "Trạng Thái"
 *   bên Lark còn TRỐNG, và cột "Link app" (cột app ghi link khách ngược sang
 *   Lark — ghi-link-app.ts) còn TRỐNG → là bản ghi mới.
 *   Chủ studio chốt lại 30/09: mọi dòng cũ đã xử lý đều có Trạng Thái; dòng mới
 *   là dòng CHƯA có trạng thái VÀ CHƯA có link gửi khách. Link Drive ("Link ảnh
 *   gửi khách") KHÔNG phải điều kiện: nhân viên có thể dán sẵn trước khi tạo bộ.
 *
 * Lark xoá dòng → app xoá theo, NHƯNG CẨN THẬN:
 *   - chỉ xoá bản ghi mới (chưa thành bộ ảnh) hoặc bộ ảnh CHƯA gửi khách
 *     (nháp, chưa có Link app nào, chưa có ảnh chọn) — bộ ảnh thì LƯU TRỮ
 *     (status 'archived'), không xoá cứng, đảo lại được;
 *   - bộ ảnh đã có Link app hoặc đã có ảnh chọn: KHÔNG xoá, chỉ đánh dấu
 *     `lark_dong_da_xoa_luc` → hiện ở Việc cần xử lý "Dòng Lark đã bị xoá".
 *
 * CHỈ ĐỌC Lark (search + batch_get là lượt đọc). Không ghi gì sang Lark.
 *
 * Hạn mức Lark: một lượt đồng bộ = 1 token + 1 danh sách bảng + 1 search (lọc
 * "Trạng Thái trống" ngay trên Lark) + 1 lượt đọc cho mỗi dòng Trạng Thái
 * trống (trần 50) + 1 batch_get cho mỗi 100 dòng đang theo dõi. Không quét cả
 * ~3.400 dòng như cron sáng.
 */
import type pg from "pg";
import { HOST, larkAuth, extractChatLink, cellText, getField, type LarkAuthHeader, type LarkRecord } from "@/lib/lark/sync-retouch";
import { bocDongHauKy } from "@/lib/lark/tra-hau-ky";
import { choPhepTenThat } from "@/lib/lark/muc-tieu-du-lieu";
import { dangChayPhepThu } from "@/lib/kiem-thu";

const BANG_HAU_KY = /h[aậ]u\s*k[yỳ]/i;
const COT_TRANG_THAI = "Trạng Thái";
const COT_CHI_NHANH = "Chi Nhánh";
/** Trần số dòng đọc chi tiết mỗi lượt (mỗi dòng = 1 lượt gọi Lark). */
export const TRAN_DOC_MOI_LUOT = 50;

// ---------------------------------------------------------------------------
// Phần thuần
// ---------------------------------------------------------------------------

export interface BanGhiMoi {
  recordId: string;
  tenKhach: string;
  soDienThoai: string;
  goiChup: string;
  maHoaDon: string;
  ngayChup: string | null;
  chiNhanh: string;
  /** Link thư mục Drive (chỉ phần URL), null khi chưa có. */
  driveUrl: string | null;
  /** created_time của dòng trên Lark. */
  taoLuc: Date | null;
  /** Ô "Link app" — link app đã gửi khách (app ghi ngược sang Lark); "" khi trống. */
  linkApp: string;
}

/**
 * Cột "Link app" — CÙNG mẫu với `MAU_TEN_COT_LINK_APP` (ghi-link-app.ts, cột app
 * ghi ngược sang Lark). Chép lại ở đây vì ghi-link-app.ts import "server-only".
 */
const MAU_TEN_COT_LINK_APP = /^\s*link\s*app\s*$/i;

/**
 * Luật chủ studio (chốt 30/09): đủ tên + SĐT + gói, Trạng Thái trống, VÀ chưa
 * có Link app gửi khách.
 */
export function laBanGhiMoi(
  b: Pick<BanGhiMoi, "tenKhach" | "soDienThoai" | "goiChup" | "linkApp">,
  trangThai: string,
): boolean {
  return (
    !!b.tenKhach.trim() &&
    !!b.soDienThoai.trim() &&
    !!b.goiChup.trim() &&
    trangThai.trim() === "" &&
    b.linkApp.trim() === ""
  );
}

/** Ô "Link app" có thể là ô URL ({link,text}) hoặc ô chữ — lấy link, không thì chữ. */
function oLinkApp(v: unknown): string {
  return (extractChatLink(v) ?? cellText(v)).trim();
}

function linkDrive(v: unknown): string | null {
  const link = extractChatLink(v);
  return link && /^https:\/\/drive\.google\.com\//i.test(link) ? link : null;
}

export function bocBanGhiMoi(record: LarkRecord & { created_time?: number }): { banGhi: BanGhiMoi; trangThai: string } {
  const d = bocDongHauKy(record);
  const f = record.fields ?? {};
  const chiNhanh = Array.isArray(f["Chi Nhánh"])
    ? (f["Chi Nhánh"] as unknown[]).map((x) => (x && typeof x === "object" ? ((x as { text?: string }).text ?? "") : String(x ?? ""))).join("")
    : typeof f["Chi Nhánh"] === "string" ? (f["Chi Nhánh"] as string) : "";
  return {
    trangThai: d.trangThai,
    banGhi: {
      recordId: record.record_id,
      tenKhach: d.tenMe,
      soDienThoai: d.soDienThoai,
      goiChup: d.goiChup,
      maHoaDon: d.maHoaDon,
      ngayChup: d.ngayChup,
      chiNhanh: chiNhanh.trim(),
      driveUrl: linkDrive(f["Link ảnh gửi khách"]),
      linkApp: oLinkApp(getField(f, MAU_TEN_COT_LINK_APP)),
      taoLuc: typeof record.created_time === "number" && record.created_time > 0 ? new Date(record.created_time) : null,
    },
  };
}

/** Bộ ảnh đang neo vào một dòng Lark vừa bị xoá. */
export interface BoAnhNeo {
  id: string;
  status: string;
  /** Số share link từng tạo (kể cả đã thu hồi/hết hạn). */
  soLinkApp: number;
  /** Số ảnh khách đã chọn. */
  soAnhChon: number;
}

/** Trạng thái app mà bộ ảnh CHẮC CHẮN chưa tới tay khách. */
const CHUA_GUI_KHACH = new Set(["draft", "syncing", "sync_error", "ready"]);

/**
 * Lark xoá dòng thì bộ ảnh neo vào nó ra sao. Thận trọng: có Link app là coi
 * như đã gửi khách (app không biết CSKH đã dán link cho khách chưa).
 */
export function khiLarkXoaDong(g: BoAnhNeo): "luu_tru" | "danh_dau" {
  if (CHUA_GUI_KHACH.has(g.status) && g.soLinkApp === 0 && g.soAnhChon === 0) return "luu_tru";
  return "danh_dau";
}

/**
 * Chặn tay: một lượt mà thấy quá nhiều dòng "bị xoá" thì nhiều khả năng lượt
 * đọc Lark hỏng (phân trang, quyền) chứ không phải nhân viên xoá thật — không
 * làm gì, chỉ ghi log.
 */
export const TRAN_XOA_MOI_LUOT = 20;

/** Kết quả lượt đọc còn tin được để xoá theo không. */
export function duTinDeXoa(soBiXoa: number): boolean {
  return soBiXoa <= TRAN_XOA_MOI_LUOT;
}

/** Tên/SĐT chỉ lưu khi cơ sở dữ liệu đích được phép giữ tên thật (muc-tieu-du-lieu). */
export function cheNeuCan(b: BanGhiMoi, dbUrl: string | undefined): BanGhiMoi {
  if (choPhepTenThat(dbUrl)) return b;
  return { ...b, tenKhach: `KH · ${b.recordId}`, soDienThoai: "" };
}

// ---------------------------------------------------------------------------
// Phần gọi Lark (chỉ đọc)
// ---------------------------------------------------------------------------

async function larkJson<T>(auth: LarkAuthHeader, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${HOST}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: auth.authorization, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json()) as { code: number; msg?: string; data?: T };
  if (json.code !== 0 || !json.data) throw new Error(`Lark ${path.split("?")[0]}: ${json.msg ?? json.code}`);
  return json.data;
}

export interface NguonLark {
  /** Dòng Hậu Kỳ có Trạng Thái trống (đã lọc trên Lark). */
  docTrangThaiTrong(): Promise<(LarkRecord & { created_time?: number })[]>;
  /** Trong các mã dòng này, dòng nào KHÔNG còn trên Lark. */
  timDongDaXoa(recordIds: string[]): Promise<Set<string>>;
}

export async function taoNguonLark(opts: { appId: string; appSecret: string; baseToken: string }): Promise<NguonLark> {
  if (dangChayPhepThu()) throw new Error("Đang chạy phép thử — không gọi Lark thật");
  const auth = await larkAuth(opts.appId, opts.appSecret);
  const bang = await larkJson<{ items: { table_id: string; name: string }[] }>(
    auth,
    `/bitable/v1/apps/${opts.baseToken}/tables?page_size=100`,
  );
  const t = bang.items.find((x) => BANG_HAU_KY.test(x.name));
  if (!t) throw new Error("Không tìm thấy bảng Hậu Kỳ trên Lark");
  const goc = `/bitable/v1/apps/${opts.baseToken}/tables/${t.table_id}/records`;

  return {
    async docTrangThaiTrong() {
      // API search trả ô theo hình dạng KHÁC API đọc một bản ghi ("HĐ Tổng" chỉ
      // còn link_record_ids, ô tra cứu thành {type, value}) — đo 29/09 (BB-325)
      // và 30/09. Nên search CHỈ lấy mã dòng + created_time (lọc "Trạng Thái
      // trống" ngay trên Lark), rồi đọc lại từng dòng bằng API bản ghi thường —
      // hình dạng mà `bocDongHauKy` đã được thử. Dòng mới mỗi lượt thường 0–vài
      // dòng; trần TRAN_DOC_MOI_LUOT để một lượt không tốn quá nhiều lượt gọi.
      const ungVien: { record_id: string; created_time?: number; fields?: Record<string, unknown> }[] = [];
      let pageToken = "";
      do {
        const q = new URLSearchParams({ page_size: "500" });
        if (pageToken) q.set("page_token", pageToken);
        const d = await larkJson<{
          items?: { record_id: string; created_time?: number; fields?: Record<string, unknown> }[];
          has_more?: boolean;
          page_token?: string;
        }>(auth, `${goc}/search?${q}`, {
          // "Chi Nhánh" là ô tra cứu: API bản ghi thường trả MÃ lựa chọn
          // (optXXX), API search trả TÊN ("NTB", "Pasteur") — lấy tên từ đây.
          field_names: [COT_TRANG_THAI, COT_CHI_NHANH],
          automatic_fields: true,
          filter: { conjunction: "and", conditions: [{ field_name: COT_TRANG_THAI, operator: "isEmpty", value: [] }] },
        });
        ungVien.push(...(d.items ?? []));
        pageToken = d.has_more ? (d.page_token ?? "") : "";
      } while (pageToken);

      const ra: (LarkRecord & { created_time?: number })[] = [];
      for (const u of ungVien.slice(0, TRAN_DOC_MOI_LUOT)) {
        const d = await larkJson<{ record?: LarkRecord }>(auth, `${goc}/${encodeURIComponent(u.record_id)}`);
        if (d.record) {
          const cn = u.fields?.[COT_CHI_NHANH] as { value?: unknown[] } | undefined;
          const tenCn = Array.isArray(cn?.value) ? cn.value.filter((x) => typeof x === "string").join(", ") : "";
          ra.push({
            ...d.record,
            record_id: u.record_id,
            created_time: u.created_time,
            fields: { ...d.record.fields, [COT_CHI_NHANH]: tenCn },
          });
        }
      }
      return ra;
    },
    async timDongDaXoa(recordIds) {
      const mat = new Set<string>();
      for (let i = 0; i < recordIds.length; i += 100) {
        const d = await larkJson<{ absent_record_ids?: string[] }>(auth, `${goc}/batch_get`, {
          record_ids: recordIds.slice(i, i + 100),
          automatic_fields: false,
        });
        for (const id of d.absent_record_ids ?? []) mat.add(id);
      }
      return mat;
    },
  };
}

// ---------------------------------------------------------------------------
// Phần ghi cơ sở dữ liệu (bảng lark_ban_ghi_moi — migration 0079)
// ---------------------------------------------------------------------------

export interface KetQuaBanGhiMoi {
  moi: number;
  capNhat: number;
  daThanhBoAnh: number;
  xoaBanGhi: number;
  luuTruBoAnh: number;
  danhDauLarkXoa: number;
  boQuaXoa?: string;
}

type Client = pg.Client | pg.PoolClient;

function boDau(x: string): string {
  return x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
}

/**
 * Khớp chi nhánh theo chữ ô "Chi Nhánh" của Lark ("NTB", "Pasteur"… — đo
 * 30/09/2026) với `branches` (mã BB-NTB, tên "Baby Bean Pasteur"). Không khớp
 * thì null — KHÔNG rơi về chi nhánh đầu tiên như `matchBranch` cũ.
 */
export function khopChiNhanh(chu: string, branches: { id: string; code: string; name: string }[]): string | null {
  const n = boDau(chu);
  if (!n) return null;
  const theoMa = branches.find((b) => boDau(b.code) === n || boDau(b.code).replace(/^bb-/, "") === n);
  if (theoMa) return theoMa.id;
  const theoTen = branches.filter((b) => boDau(b.name).includes(n));
  return theoTen.length === 1 ? theoTen[0]!.id : null;
}

/**
 * Bộ ảnh neo vào các dòng Lark đã bị xoá: lưu trữ bộ chưa gửi khách, đánh dấu
 * bộ còn lại. Dùng chung cho lượt 5 phút và cron sáng (quét đủ ~3.400 dòng).
 */
export async function xuLyBoAnhMatDongLark(
  client: Client,
  recordIdsDaXoa: string[],
  bayGio = new Date(),
): Promise<{ luuTru: number; danhDau: number; boQua?: string }> {
  if (recordIdsDaXoa.length === 0) return { luuTru: 0, danhDau: 0 };
  const { rows } = await client.query<BoAnhNeo & { lark_dong_da_xoa_luc: Date | null }>(
    `select g.id, g.status::text as status, g.lark_dong_da_xoa_luc,
            (select count(*)::int from share_links s where s.gallery_id = g.id) as "soLinkApp",
            (select count(*)::int from selection_items i where i.gallery_id = g.id) as "soAnhChon"
       from galleries g
      where g.lark_hauky_record_id = any($1::text[]) and g.status <> 'archived'`,
    [recordIdsDaXoa],
  );
  const canLam = rows.filter((g) => !g.lark_dong_da_xoa_luc);
  if (!duTinDeXoa(canLam.length)) {
    const lyDo = `Lượt này thấy ${canLam.length} bộ ảnh mất dòng Lark (> ${TRAN_XOA_MOI_LUOT}) — nghi đọc Lark hỏng, không làm gì`;
    console.error(JSON.stringify({ evt: "lark.ban_ghi_moi.bo_qua_xoa", lyDo }));
    return { luuTru: 0, danhDau: 0, boQua: lyDo };
  }
  let luuTru = 0;
  let danhDau = 0;
  for (const g of canLam) {
    if (khiLarkXoaDong(g) === "luu_tru") {
      await client.query(
        `update galleries set status = 'archived', lark_dong_da_xoa_luc = $2 where id = $1 and status = $3::gallery_status`,
        [g.id, bayGio, g.status],
      );
      luuTru++;
    } else {
      await client.query(`update galleries set lark_dong_da_xoa_luc = $2 where id = $1`, [g.id, bayGio]);
      danhDau++;
    }
  }
  return { luuTru, danhDau };
}

/**
 * Ghi MỘT dòng Lark vào bảng bản ghi mới nếu nó đúng luật. Dùng cho lượt đồng
 * bộ và cho hook Lark (/api/lark/hook) khi Lark đẩy một dòng sang.
 */
export async function ghiBanGhiMoi(
  client: Client,
  record: LarkRecord & { created_time?: number },
  branches: { id: string; code: string; name: string }[],
  dbUrl: string | undefined,
  bayGio = new Date(),
): Promise<"moi" | "cap_nhat" | "bo_qua"> {
  const { banGhi, trangThai } = bocBanGhiMoi(record);
  if (!laBanGhiMoi(banGhi, trangThai)) return "bo_qua";
  const b = cheNeuCan(banGhi, dbUrl);
  const { rows } = await client.query<{ moi: boolean }>(
    `insert into lark_ban_ghi_moi
       (lark_record_id, branch_id, ten_khach, so_dien_thoai, goi_chup, ma_hoa_don, ngay_chup, chi_nhanh_lark, drive_url, lark_tao_luc, thay_luc, cap_nhat_luc)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)
     on conflict (lark_record_id) do update set
       branch_id = excluded.branch_id, ten_khach = excluded.ten_khach, so_dien_thoai = excluded.so_dien_thoai,
       goi_chup = excluded.goi_chup, ma_hoa_don = excluded.ma_hoa_don, ngay_chup = excluded.ngay_chup,
       chi_nhanh_lark = excluded.chi_nhanh_lark, drive_url = excluded.drive_url, cap_nhat_luc = excluded.cap_nhat_luc
     returning (xmax = 0) as moi`,
    [
      b.recordId,
      khopChiNhanh(b.chiNhanh, branches),
      b.tenKhach,
      b.soDienThoai || null,
      b.goiChup,
      b.maHoaDon || null,
      b.ngayChup,
      b.chiNhanh || null,
      b.driveUrl,
      b.taoLuc,
      bayGio,
    ],
  );
  return rows[0]?.moi ? "moi" : "cap_nhat";
}

/**
 * Một lượt đồng bộ bản ghi mới. Nguồn Lark truyền từ ngoài vào để phép thử
 * chạy không cần Lark thật.
 */
export async function dongBoBanGhiMoi(opts: {
  client: Client;
  nguon: NguonLark;
  dbUrl: string | undefined;
  bayGio?: Date;
}): Promise<KetQuaBanGhiMoi> {
  const { client, nguon } = opts;
  const bayGio = opts.bayGio ?? new Date();
  const kq: KetQuaBanGhiMoi = { moi: 0, capNhat: 0, daThanhBoAnh: 0, xoaBanGhi: 0, luuTruBoAnh: 0, danhDauLarkXoa: 0 };

  const { rows: branches } = await client.query<{ id: string; code: string; name: string }>(
    `select id, code, name from branches where is_active = true`,
  );

  // 1. Dòng mới / cập nhật.
  const tho = await nguon.docTrangThaiTrong();
  for (const r of tho) {
    const kqGhi = await ghiBanGhiMoi(client, r, branches, opts.dbUrl, bayGio);
    if (kqGhi === "moi") kq.moi++;
    else if (kqGhi === "cap_nhat") kq.capNhat++;
  }

  // 2. Bản ghi đã có bộ ảnh neo vào (tạo qua thuật sĩ BB-325) → rời khối.
  const daThanh = await client.query(
    `update lark_ban_ghi_moi b set gallery_id = g.id, cap_nhat_luc = $1
       from galleries g
      where g.lark_hauky_record_id = b.lark_record_id and g.status <> 'archived' and b.gallery_id is null`,
    [bayGio],
  );
  kq.daThanhBoAnh = daThanh.rowCount ?? 0;

  // 3. Lark xoá dòng → xoá theo (thận trọng).
  const { rows: theoDoi } = await client.query<{ lark_record_id: string; gallery_id: string | null }>(
    `select lark_record_id, gallery_id from lark_ban_ghi_moi
      where gallery_id is null or cap_nhat_luc > $1::timestamptz - interval '30 days'`,
    [bayGio],
  );
  if (theoDoi.length > 0) {
    const mat = await nguon.timDongDaXoa(theoDoi.map((x) => x.lark_record_id));
    if (mat.size > 0) {
      if (!duTinDeXoa(mat.size)) {
        kq.boQuaXoa = `Lark báo ${mat.size} dòng đã xoá (> ${TRAN_XOA_MOI_LUOT}) — không xoá gì, cần người xem`;
        console.error(JSON.stringify({ evt: "lark.ban_ghi_moi.bo_qua_xoa", lyDo: kq.boQuaXoa }));
      } else {
        const ids = [...mat];
        const boAnh = await xuLyBoAnhMatDongLark(client, ids, bayGio);
        kq.luuTruBoAnh = boAnh.luuTru;
        kq.danhDauLarkXoa = boAnh.danhDau;
        const xoa = await client.query(`delete from lark_ban_ghi_moi where lark_record_id = any($1::text[])`, [ids]);
        kq.xoaBanGhi = xoa.rowCount ?? 0;
      }
    }
  }
  return kq;
}
