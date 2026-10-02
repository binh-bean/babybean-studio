/**
 * BB-356 — đo dung lượng so với hạn mức gói Supabase Free, cho khối theo dõi ở
 * màn Cài đặt.
 *
 * OWNER: DEV-BE.
 *
 * Đọc thẳng `pg_database_size` qua kết nối máy chủ (`SUPABASE_DB_URL`, chỉ có ở
 * server) — không cần hàm SQL mới, nên không mở thêm cửa nào cho `anon`.
 *
 * Ước tính "còn mấy tháng thì đầy" có hai nguồn, ưu tiên nguồn 1:
 *   1. MỐC ĐO hằng đêm (cron ghi vào `settings` khoá KHOA_MOC_DUNG_LUONG): độ dốc
 *      thật giữa mốc cũ nhất và mới nhất, khi hai mốc cách nhau ≥ 7 ngày.
 *   2. Chưa đủ mốc thì ước theo DÒNG MỚI 7 ngày qua × cỡ trung bình một dòng của
 *      từng bảng lớn. Nguồn này nhạy với đợt nạp lại / phép thử ghi hàng loạt —
 *      màn hình ghi rõ đang dùng nguồn nào.
 */
import type pg from "pg";

type Pg = pg.Client | pg.PoolClient;

export const HAN_MUC_DB_BYTE = 500 * 1024 * 1024;
export const HAN_MUC_STORAGE_BYTE = 1024 * 1024 * 1024;
export const KHOA_MOC_DUNG_LUONG = "van_hanh.dung_luong_db";
/** Giữ tối đa chừng này mốc (một mốc / ngày). */
export const SO_MOC_TOI_DA = 90;
const NGAY_MS = 24 * 60 * 60 * 1000;
const NGAY_TOI_THIEU_DE_TINH_DOC = 7;

/** Bảng có `created_at` và có thể lớn lên theo vận hành. */
const BANG_TANG_TRUONG = [
  "photos",
  "activity_logs",
  "galleries",
  "gallery_items",
  "notifications",
  "customers",
  "shoots",
  "thong_bao_khach",
  "selection_items",
] as const;

export interface MocDungLuong {
  ngay: string; // YYYY-MM-DD
  byte: number;
}

export interface DungLuongDb {
  dbByte: number;
  hanMucDbByte: number;
  storageByte: number;
  hanMucStorageByte: number;
  /** Byte tăng mỗi tháng (ước tính); null khi không tính được. */
  tangMoiThangByte: number | null;
  nguonUocTinh: "moc_do" | "dong_moi_7_ngay" | "khong_du";
  /** Còn bao nhiêu tháng thì chạm hạn mức DB; null khi không tăng hoặc không tính được. */
  thangConLai: number | null;
  bangLonNhat: { bang: string; byte: number }[];
}

/** Thuần — tách riêng để phép thử đơn vị kiểm thẳng. */
export function tinhThangConLai(dbByte: number, tangMoiThangByte: number | null, hanMuc = HAN_MUC_DB_BYTE): number | null {
  if (tangMoiThangByte === null || !(tangMoiThangByte > 0)) return null;
  const con = hanMuc - dbByte;
  if (con <= 0) return 0;
  return Math.round((con / tangMoiThangByte) * 10) / 10;
}

/** Thuần — độ dốc byte/tháng giữa mốc cũ nhất và mới nhất (≥ 7 ngày). */
export function tinhDocTuMoc(moc: MocDungLuong[]): number | null {
  if (moc.length < 2) return null;
  const sx = [...moc].sort((a, b) => a.ngay.localeCompare(b.ngay));
  const dau = sx[0]!;
  const cuoi = sx[sx.length - 1]!;
  const ngay = (Date.parse(cuoi.ngay) - Date.parse(dau.ngay)) / NGAY_MS;
  if (!(ngay >= NGAY_TOI_THIEU_DE_TINH_DOC)) return null;
  return ((cuoi.byte - dau.byte) / ngay) * 30;
}

export async function docMocDungLuong(client: Pg, khoa = KHOA_MOC_DUNG_LUONG): Promise<MocDungLuong[]> {
  const { rows } = await client.query<{ value: { moc?: unknown } }>(
    `select value from settings where key = $1 and branch_id is null`,
    [khoa],
  );
  const moc = rows[0]?.value?.moc;
  if (!Array.isArray(moc)) return [];
  return moc.filter(
    (m): m is MocDungLuong =>
      !!m && typeof m === "object" && typeof (m as MocDungLuong).ngay === "string" && Number.isFinite((m as MocDungLuong).byte),
  );
}

/** Cron gọi mỗi đêm: thêm (hoặc thay) mốc của hôm nay, giữ SO_MOC_TOI_DA mốc gần nhất. */
export async function ghiMocDungLuong(client: Pg, bayGio = new Date(), khoa = KHOA_MOC_DUNG_LUONG): Promise<MocDungLuong[]> {
  const { rows } = await client.query<{ b: string }>(`select pg_database_size(current_database())::bigint as b`);
  const homNay = bayGio.toISOString().slice(0, 10);
  const cu = (await docMocDungLuong(client, khoa)).filter((m) => m.ngay !== homNay);
  const moi = [...cu, { ngay: homNay, byte: Number(rows[0]?.b ?? 0) }]
    .sort((a, b) => a.ngay.localeCompare(b.ngay))
    .slice(-SO_MOC_TOI_DA);
  await client.query(
    `insert into settings (key, value) values ($1, $2::jsonb)
     on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
     do update set value = excluded.value, updated_at = now()`,
    [khoa, JSON.stringify({ moc: moi })],
  );
  return moi;
}

export async function docDungLuong(client: Pg, khoa = KHOA_MOC_DUNG_LUONG): Promise<DungLuongDb> {
  const { rows: db } = await client.query<{ b: string }>(`select pg_database_size(current_database())::bigint as b`);
  const dbByte = Number(db[0]?.b ?? 0);

  let storageByte = 0;
  try {
    const { rows } = await client.query<{ b: string }>(
      `select coalesce(sum((metadata->>'size')::bigint), 0)::bigint as b from storage.objects`,
    );
    storageByte = Number(rows[0]?.b ?? 0);
  } catch {
    /* không đọc được schema storage thì để 0 — không chặn phần DB */
  }

  const { rows: lon } = await client.query<{ bang: string; byte: string }>(
    `select c.relname as bang, pg_total_relation_size(c.oid)::bigint as byte
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by 2 desc limit 5`,
  );

  let tangMoiThangByte = tinhDocTuMoc(await docMocDungLuong(client, khoa));
  let nguonUocTinh: DungLuongDb["nguonUocTinh"] = tangMoiThangByte !== null ? "moc_do" : "khong_du";

  if (tangMoiThangByte === null) {
    let tong = 0;
    for (const bang of BANG_TANG_TRUONG) {
      try {
        const { rows } = await client.query<{ n: number; moi: number; byte: string }>(
          `select count(*)::int as n,
                  count(*) filter (where created_at > now() - interval '7 days')::int as moi,
                  pg_total_relation_size($1::regclass)::bigint as byte
             from ${bang}`,
          [bang],
        );
        const r = rows[0];
        if (r && r.n > 0) tong += (Number(r.byte) / r.n) * r.moi;
      } catch {
        /* bảng chưa có trên DB này — bỏ qua */
      }
    }
    tangMoiThangByte = (tong / 7) * 30;
    nguonUocTinh = "dong_moi_7_ngay";
  }

  return {
    dbByte,
    hanMucDbByte: HAN_MUC_DB_BYTE,
    storageByte,
    hanMucStorageByte: HAN_MUC_STORAGE_BYTE,
    tangMoiThangByte: tangMoiThangByte === null ? null : Math.round(tangMoiThangByte),
    nguonUocTinh,
    thangConLai: tinhThangConLai(dbByte, tangMoiThangByte),
    bangLonNhat: lon.map((r) => ({ bang: r.bang, byte: Number(r.byte) })),
  };
}
