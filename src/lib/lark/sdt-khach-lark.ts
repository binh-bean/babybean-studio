/**
 * BB-369 mục 3 (chủ studio 06/10/2026, ảnh 4f52321b/de6ab031): khách "Chưa có
 * số" dù bộ ảnh của khách đồng bộ từ dòng Hậu Kỳ CÓ ô "SDT KH".
 *
 * Nguyên nhân gốc: `syncSingleRetouchRecord` (đường hook Lark + cron + nút
 * "Đồng bộ ngay") tạo khách với `phone = null` cố định và không bao giờ cập
 * nhật số — theo ghi chú cũ của 0043 "bảng Hậu Kỳ không có ô số điện thoại",
 * điều đã sai từ khi bảng có "SDT KH". Đo bb-dev 06/10: 2/2 khách nguồn
 * `lark_retouch` đều trống số; 447 khách nạp bằng sync-lark-hauky.mjs đều có.
 *
 * Luật điền:
 *   - khách CHƯA có số → điền số Lark (trừ khi số đó đã là của khách KHÁC cùng
 *     chi nhánh — vướng khoá duy nhất (branch_id, phone_normalized) → ghi nhật ký);
 *   - khách đã có số GIỐNG (so 9 số cuối) → giữ;
 *   - khách đã có số KHÁC → KHÔNG đè, ghi nhật ký `customer.sdt_lech_lark` để
 *     nhân viên xác nhận. Nhật ký chỉ ghi 3 số cuối (luật nhat-ky.ts: không
 *     ghi số điện thoại) + mã dòng Lark để mở đúng dòng mà đối chiếu.
 */
import type pg from "pg";
import { cellText, getField } from "@/lib/lark/sync-retouch";
import { tachMaHoaDon } from "@/lib/utils/ma-hoa-don";

export type QuyetDinhSdt = "khong_co_so_lark" | "dien" | "giu" | "lech";

export function duoi9(sdt: string | null | undefined): string {
  const so = (sdt ?? "").replace(/\D/g, "");
  return so.length >= 9 ? so.slice(-9) : "";
}

/** Ô "SDT KH" của dòng Hậu Kỳ → số (giữ nguyên chữ), "" khi trống / không đủ 9 số. */
export function sdtTuDongLark(fields: Record<string, unknown>): string {
  let v = fields["SDT KH"] ?? getField(fields, /^\s*s[dđ]t\s*kh\s*$|^\s*s[oố]\s*đi[eệ]n\s*tho[aạ]i/i);
  // "SDT KH" là ô tra cứu: API đọc một bản ghi trả [{text}], còn batch_get và
  // search trả { type, value: [{text}] } (đo 06/10/2026) — bóc lớp ngoài.
  if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) v = (v as { value: unknown }).value;
  const t = cellText(v).trim();
  return duoi9(t) ? t : "";
}

/** HÀM THUẦN — số hiện có của khách vs số trên Lark. */
export function quyetDinhSdt(sdtHienCo: string | null | undefined, sdtLark: string | null | undefined): QuyetDinhSdt {
  const lark = duoi9(sdtLark);
  if (!lark) return "khong_co_so_lark";
  const co = duoi9(sdtHienCo);
  if (!co) return "dien";
  return co === lark ? "giu" : "lech";
}

export type KetQuaDienSdt = QuyetDinhSdt | "trung_khach_khac";

type Client = pg.Client | pg.PoolClient;

/**
 * Áp luật lên MỘT khách (gọi trong giao dịch của lượt đồng bộ). `ghi = false`
 * (chạy thử) thì chỉ trả quyết định, không ghi gì.
 */
export async function dienSdtKhach(
  client: Client,
  opts: { customerId: string; sdtLark: string; larkRecordId: string; ghi: boolean },
): Promise<KetQuaDienSdt> {
  const { rows } = await client.query<{ phone: string | null; branch_id: string | null }>(
    `select phone, branch_id from customers where id = $1`,
    [opts.customerId],
  );
  const kh = rows[0];
  if (!kh) return "khong_co_so_lark";
  const qd = quyetDinhSdt(kh.phone, opts.sdtLark);
  if (qd === "giu" || qd === "khong_co_so_lark") return qd;

  if (qd === "dien") {
    const { rows: trung } = await client.query<{ id: string }>(
      `select id from customers
        where id <> $1 and branch_id is not distinct from $2
          and phone_normalized = regexp_replace($3, '\\D', '', 'g')
        limit 1`,
      [opts.customerId, kh.branch_id, opts.sdtLark],
    );
    if (trung.length > 0) {
      if (opts.ghi) await ghiLech(client, "customer.sdt_trung_khach_khac", opts, kh.branch_id, trung[0]!.id);
      return "trung_khach_khac";
    }
    if (opts.ghi) {
      await client.query(`update customers set phone = $2 where id = $1 and (phone is null or btrim(phone) = '')`, [
        opts.customerId,
        opts.sdtLark,
      ]);
    }
    return "dien";
  }

  if (opts.ghi) await ghiLech(client, "customer.sdt_lech_lark", opts, kh.branch_id, null);
  return "lech";
}

async function ghiLech(
  client: Client,
  action: string,
  opts: { customerId: string; sdtLark: string; larkRecordId: string },
  branchId: string | null,
  khachTrung: string | null,
) {
  await client.query(
    `insert into activity_logs (actor_type, actor_label, branch_id, action, entity_type, entity_id, metadata)
     values ('system', 'Đồng bộ Lark', $1, $2, 'customer', $3, $4::jsonb)`,
    [
      branchId,
      action,
      opts.customerId,
      JSON.stringify({
        larkRecordId: opts.larkRecordId,
        sdtLarkDuoi3: duoi9(opts.sdtLark).slice(-3),
        khachTrung,
        canNhanVienXacNhan: true,
      }),
    ],
  );
}

// ---------------------------------------------------------------------------
// Điền bù cho khách đang trống số (scripts/dien-bu-sdt-khach.mjs)
// ---------------------------------------------------------------------------

export interface KetQuaDienBu {
  /** Khách trống số có ít nhất một bộ ảnh neo dòng Hậu Kỳ. */
  khachTrong: number;
  /** Sẽ điền (chạy thử) / đã điền (khi ghi). */
  seDien: number;
  /** Số Lark đã thuộc khách KHÁC cùng chi nhánh — không điền, cần người xem. */
  trungKhachKhac: number;
  /** Các dòng Lark của khách ghi NHIỀU số khác nhau — không đoán, cần người xem. */
  nhieuSo: number;
  /** Dòng Lark không có số (hoặc đã bị xoá). */
  khongCoSoLark: number;
  daGhi: boolean;
}

/**
 * Tìm khách trống số → đọc "SDT KH" của các dòng Hậu Kỳ mà bộ ảnh của khách
 * neo vào → điền theo `dienSdtKhach`. Mặc định CHẠY THỬ (ghi = false).
 * `docSdtLark` truyền từ ngoài vào (script đọc Lark thật; phép thử giả lập).
 * `chiKhach` giới hạn phạm vi (phép thử chỉ chạm khách Fixture của mình).
 */
export async function dienBuSdtKhach(
  client: Client,
  opts: {
    docSdtLark: (recordIds: string[]) => Promise<Map<string, string>>;
    /**
     * Bộ ảnh tạo qua đường hook/cron cũ KHÔNG neo `lark_hauky_record_id`, chỉ có
     * `lark_contract_code` (có khi là chuỗi dòng chi tiết "HD_…_12576,HD_…_12772").
     * Tra số theo MÃ HOÁ ĐƠN (đọc Lark) cho các bộ đó. Không truyền → bỏ qua.
     */
    docSdtTheoMa?: (maHoaDon: string[]) => Promise<Map<string, string>>;
    ghi: boolean;
    chiKhach?: string[];
  },
): Promise<KetQuaDienBu> {
  const { rows } = await client.query<{ id: string; recs: string[] | null; codes: string[] | null }>(
    `select c.id,
            array_remove(array_agg(distinct g.lark_hauky_record_id), null) as recs,
            array_remove(array_agg(distinct case when g.lark_hauky_record_id is null then coalesce(g.lark_contract_code, g.title) end), null) as codes
       from customers c
       join galleries g on g.customer_id = c.id and g.status <> 'archived'
      where (c.phone is null or btrim(c.phone) = '')
        and ($1::uuid[] is null or c.id = any($1::uuid[]))
      group by c.id`,
    [opts.chiKhach ?? null],
  );
  const khach = rows
    .map((r) => ({ id: r.id, recs: r.recs ?? [], mas: opts.docSdtTheoMa ? tachMaHoaDon(...(r.codes ?? [])) : [] }))
    .filter((r) => r.recs.length > 0 || r.mas.length > 0);
  const kq: KetQuaDienBu = { khachTrong: khach.length, seDien: 0, trungKhachKhac: 0, nhieuSo: 0, khongCoSoLark: 0, daGhi: opts.ghi };
  if (khach.length === 0) return kq;
  const sdtTheoDong = await opts.docSdtLark([...new Set(khach.flatMap((r) => r.recs))]);
  const cacMa = [...new Set(khach.flatMap((r) => r.mas))];
  const sdtTheoMa = opts.docSdtTheoMa && cacMa.length > 0 ? await opts.docSdtTheoMa(cacMa) : new Map<string, string>();
  for (const kh of khach) {
    const cacSo = new Map<string, { sdt: string; rec: string }>();
    for (const rec of kh.recs) {
      const sdt = sdtTheoDong.get(rec) ?? "";
      if (duoi9(sdt)) cacSo.set(duoi9(sdt), { sdt, rec });
    }
    for (const ma of kh.mas) {
      const sdt = sdtTheoMa.get(ma) ?? "";
      if (duoi9(sdt)) cacSo.set(duoi9(sdt), { sdt, rec: ma });
    }
    if (cacSo.size === 0) {
      kq.khongCoSoLark++;
      continue;
    }
    if (cacSo.size > 1) {
      kq.nhieuSo++;
      continue;
    }
    const [{ sdt, rec }] = [...cacSo.values()] as [{ sdt: string; rec: string }];
    const r = await dienSdtKhach(client, { customerId: kh.id, sdtLark: sdt, larkRecordId: rec, ghi: opts.ghi });
    if (r === "dien") kq.seDien++;
    else if (r === "trung_khach_khac") kq.trungKhachKhac++;
  }
  return kq;
}
