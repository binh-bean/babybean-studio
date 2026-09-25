/**
 * Bộ nhắc hậu kỳ (BB-200) — phần APP gửi theo docs/21 "Chủ studio chốt 25/09/2026".
 *
 * OWNER: PM. Lark tự gửi giai đoạn 1 (nhắc chọn ảnh) và tin 17:00; app KHÔNG
 * gửi lại hai loại đó. Luật mốc nằm ở `trang-thai-hau-ky.ts` (LUAT_NHAC).
 *
 * Chạy mỗi ngày một lượt, SAU khi đã đọc trạng thái mới nhất từ Lark.
 *
 * ---------------------------------------------------------------------------
 * Ghi "đã gửi" TRƯỚC rồi mới gửi
 * ---------------------------------------------------------------------------
 * `insert … on conflict do nothing returning` vào `lark_nhac_da_gui`: chỉ mốc
 * nào lượt NÀY ghi được mới được gửi. Hai lượt cron chạy chồng nhau (Vercel +
 * GitHub, hay ai đó bấm chạy tay) thì lượt sau không ghi được dòng nào và
 * không gửi gì — không nhắc đôi. Cái giá: gửi hỏng thì mốc đó coi như đã gửi;
 * nhưng `enqueueLarkNotification` ghi hàng đợi bền và lượt quét hằng ngày
 * gửi lại tin hỏng, nên tin không mất.
 *
 * Một thẻ cho mỗi (chi nhánh × loại nhắc), liệt kê mọi bộ ảnh tới mốc: sơ đồ
 * của chủ studio viết "Hôm nay có …(số lượng)… bộ …", không phải mỗi bộ một tin.
 */

import type pg from "pg";
import { mocNhacHomNay, soNgayLich, type NguoiNhan } from "@/lib/lark/trang-thai-hau-ky";

export interface BoAnhNhac {
  galleryId: string;
  galleryTitle: string;
  customerName: string | null;
  /** Đã che giữa (cheSoDienThoai) — chỗ gọi che trước khi đưa vào đây. */
  customerPhone: string | null;
  soNgay: number;
  moc: number;
}

export interface TinNhacHauKy {
  branchId: string | null;
  maNhac: string;
  nguoiNhan: NguoiNhan;
  boAnh: BoAnhNhac[];
}

interface DongGallery {
  id: string;
  title: string;
  branch_id: string | null;
  lark_trang_thai: string;
  lark_trang_thai_tu: Date;
  customer_name: string | null;
  customer_phone: string | null;
  nhanh_a: boolean;
}

/**
 * Tính và ghi các mốc nhắc của hôm nay. Trả về các tin cần gửi — KHÔNG tự gửi;
 * chỗ gọi truyền hàm gửi vào (`gui`), để phép thử chạy được mà không đụng Lark.
 */
export async function chayNhacHauKy(opts: {
  client: pg.Client | pg.PoolClient;
  homNay?: Date;
  cheSo: (so: string | null) => string | null;
  gui: (tin: TinNhacHauKy) => Promise<void>;
  /** Chỉ xét các bộ này (phép thử dùng để không đụng bộ ảnh thật). */
  chiBoAnh?: string[];
}): Promise<{ xet: number; tin: number; boAnh: number }> {
  const homNay = opts.homNay ?? new Date();
  const { client } = opts;

  const { rows } = await client.query<DongGallery>(
    `select g.id, g.title, g.branch_id, g.lark_trang_thai, g.lark_trang_thai_tu,
            c.full_name as customer_name, c.phone as customer_phone,
            -- Nhánh A: hoá đơn có dịch vụ "Làm ảnh nhanh" (docs/21 phụ lục).
            exists (
              select 1 from gallery_items gi join products p on p.id = gi.product_id
               where gi.gallery_id = g.id and lower(p.name) = lower('Làm ảnh nhanh')
            ) as nhanh_a
       from galleries g
       left join customers c on c.id = g.customer_id
      where g.status <> 'archived'
        and g.lark_trang_thai is not null
        and g.lark_trang_thai_tu is not null
        and ($1::uuid[] is null or g.id = any($1::uuid[]))`,
    [opts.chiBoAnh ?? null],
  );
  if (rows.length === 0) return { xet: 0, tin: 0, boAnh: 0 };

  const { rows: daGuiRows } = await client.query<{ gallery_id: string; ma_nhac: string; moc: number; dot_tu: Date }>(
    `select gallery_id, ma_nhac, moc, dot_tu from lark_nhac_da_gui where gallery_id = any($1::uuid[])`,
    [rows.map((r) => r.id)],
  );

  // (chi nhánh × loại nhắc) → tin
  const gom = new Map<string, TinNhacHauKy>();

  for (const g of rows) {
    const daGui = new Set(
      daGuiRows
        .filter((d) => d.gallery_id === g.id && d.dot_tu.getTime() === g.lark_trang_thai_tu.getTime())
        .map((d) => `${d.ma_nhac}:${d.moc}`),
    );
    const moc = mocNhacHomNay({
      maLark: g.lark_trang_thai,
      tu: g.lark_trang_thai_tu,
      homNay,
      nhanhA: g.nhanh_a,
      daGui,
    });
    for (const m of moc) {
      // Ghi cả các mốc nhỏ bị bỏ qua (không dội tin), rồi mốc chính. Chỉ gửi
      // nếu CHÍNH lượt này ghi được mốc chính.
      for (const nho of m.mocBoQua) {
        await client.query(
          `insert into lark_nhac_da_gui (gallery_id, ma_nhac, moc, trang_thai, dot_tu)
           values ($1,$2,$3,$4,$5) on conflict do nothing`,
          [g.id, m.maNhac, nho, g.lark_trang_thai, g.lark_trang_thai_tu],
        );
      }
      // Chỉ có mốc tồn đọng cũ: đã ghi ở trên, không gửi (xem TRE_TOI_DA_NGAY).
      if (m.moc === null) continue;
      const { rowCount } = await client.query(
        `insert into lark_nhac_da_gui (gallery_id, ma_nhac, moc, trang_thai, dot_tu)
         values ($1,$2,$3,$4,$5) on conflict do nothing returning 1`,
        [g.id, m.maNhac, m.moc, g.lark_trang_thai, g.lark_trang_thai_tu],
      );
      if (!rowCount) continue;

      const khoa = `${g.branch_id ?? "-"}|${m.maNhac}`;
      const tin =
        gom.get(khoa) ?? { branchId: g.branch_id, maNhac: m.maNhac, nguoiNhan: m.nguoiNhan, boAnh: [] };
      tin.boAnh.push({
        galleryId: g.id,
        galleryTitle: g.title,
        customerName: g.customer_name,
        customerPhone: opts.cheSo(g.customer_phone),
        soNgay: soNgayLich(g.lark_trang_thai_tu, homNay),
        moc: m.moc,
      });
      gom.set(khoa, tin);
    }
  }

  let soBo = 0;
  for (const tin of gom.values()) {
    soBo += tin.boAnh.length;
    await opts.gui(tin);
  }
  return { xet: rows.length, tin: gom.size, boAnh: soBo };
}
