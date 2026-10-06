#!/usr/bin/env tsx
/**
 * Xoá trống các ô "Link quản lý bộ ảnh" trên bảng Hậu Kỳ đang chứa link
 * `http://localhost…/admin/galleries/<id>` — 492 ô lượt điền bù 06/10 lỡ ghi bằng
 * địa chỉ máy thử (anh chốt 06/10: xoá trống, ghi lại đúng khi sang bb-prod).
 *
 *   npm run lark:xoa-link-quan-ly-localhost              CHẠY THỬ: đọc, đếm, KHÔNG ghi
 *   npm run lark:xoa-link-quan-ly-localhost -- --write   XOÁ THẬT
 *
 * Chỉ chạm ĐÚNG cột "Link quản lý bộ ảnh", và chỉ ô có link máy cục bộ trỏ màn
 * quản lý bộ ảnh. Ô trống, ô có link thật, ô có ghi chú khác: không đụng.
 */

import pg from "pg";
import { docCauHinhLark, bienMoiTruongConThieu } from "../src/lib/lark/ghi-link-app";
import { larkAuth } from "../src/lib/lark/sync-retouch";
import { timCotLinkQuanLy, diaChiTrongO } from "../src/lib/lark/ghi-link-quan-ly";

const HOST = "https://open.larksuite.com/open-apis";
const ghiThat = process.argv.includes("--write");
const nghi = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Link màn quản lý bộ ảnh trỏ máy cục bộ? */
export function laLinkQuanLyCucBo(diaChi: string): boolean {
  try {
    const u = new URL(diaChi);
    const cucBo = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.hostname) || u.hostname.endsWith(".localhost");
    return cucBo && /^\/admin\/galleries\/[^/]+\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const thieu = bienMoiTruongConThieu();
  if (thieu.length) {
    console.error(`Thiếu biến môi trường: ${thieu.join(", ")}.`);
    process.exit(1);
  }
  const cauHinh = docCauHinhLark()!;
  const auth = await larkAuth(cauHinh.appId, cauHinh.appSecret);
  const tim = await timCotLinkQuanLy(auth, cauHinh.baseToken);
  if (!tim.thay) {
    console.log(`Không thấy cột: ${tim.lyDo}`);
    return;
  }
  const viTri = tim.viTri;
  console.log(`Bảng: ${viTri.tenBang} · Cột: "${viTri.fieldName}" — cột DUY NHẤT script chạm tới.`);

  const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  let dong: string[] = [];
  try {
    const { rows } = await client.query(
      `select distinct lark_hauky_record_id as r from galleries where lark_hauky_record_id is not null`,
    );
    dong = rows.map((x) => String(x.r));
  } finally {
    await client.end();
  }

  const dem = { tong: dong.length, xoa: 0, khongDung: 0, khongThay: 0, loi: 0 };
  for (const recordId of dong) {
    try {
      const res = await fetch(`${HOST}/bitable/v1/apps/${cauHinh.baseToken}/tables/${viTri.tableId}/records/${recordId}`, {
        headers: { authorization: auth.authorization },
      });
      const json = (await res.json()) as { code: number; data?: { record?: { fields?: Record<string, unknown> } } };
      if (json.code !== 0 || !json.data?.record) {
        dem.khongThay++;
        continue;
      }
      const diaChi = diaChiTrongO(json.data.record.fields?.[viTri.fieldName]);
      if (!laLinkQuanLyCucBo(diaChi)) {
        dem.khongDung++;
        continue;
      }
      if (ghiThat) {
        const put = await fetch(`${HOST}/bitable/v1/apps/${cauHinh.baseToken}/tables/${viTri.tableId}/records/${recordId}`, {
          method: "PUT",
          headers: { authorization: auth.authorization, "content-type": "application/json" },
          // ĐÚNG MỘT KHOÁ, giá trị null = xoá trống ô.
          body: JSON.stringify({ fields: { [viTri.fieldName]: null } }),
        });
        const pj = (await put.json()) as { code: number; msg?: string };
        if (pj.code !== 0) {
          dem.loi++;
          continue;
        }
      }
      dem.xoa++;
    } catch {
      dem.loi++;
    }
    await nghi(150);
  }

  console.log(ghiThat ? "ĐÃ XOÁ THẬT:" : "CHẠY THỬ — chưa ghi gì:");
  console.log(`  dòng Hậu Kỳ có bộ ảnh : ${dem.tong}`);
  console.log(`  ${ghiThat ? "đã xoá" : "SẼ xoá"} (link localhost) : ${dem.xoa}`);
  console.log(`  không đụng (trống/link thật/khác) : ${dem.khongDung}`);
  console.log(`  không thấy dòng      : ${dem.khongThay}`);
  console.log(`  lỗi                  : ${dem.loi}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
