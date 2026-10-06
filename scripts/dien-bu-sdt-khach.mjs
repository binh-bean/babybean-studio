// BB-369 mục 3 — điền bù số điện thoại cho khách đang "Chưa có số" từ ô "SDT KH"
// của các dòng Hậu Kỳ mà bộ ảnh của khách neo vào.
//
//   npm run db:dien-bu-sdt            → CHẠY THỬ (mặc định): chỉ đếm, không ghi gì
//   npm run db:dien-bu-sdt -- --write → ghi thật (người có quyền chạy, sau khi xem số)
//
// Luật (src/lib/lark/sdt-khach-lark.ts): chỉ điền khách TRỐNG số; số Lark đã là của
// khách khác cùng chi nhánh hoặc các dòng ghi nhiều số khác nhau → không điền, đếm
// riêng để nhân viên xem. Không đè số đã có. CHỈ ĐỌC Lark.
//
// Không in tên hay số điện thoại — chỉ in con số.
import pg from "pg";
import { dienBuSdtKhach, sdtTuDongLark } from "../src/lib/lark/sdt-khach-lark.ts";
import { choPhepTenThat } from "../src/lib/lark/muc-tieu-du-lieu.ts";

const HOST = "https://open.larksuite.com/open-apis";
const ghi = process.argv.includes("--write");
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("Thiếu SUPABASE_DB_URL");
if (!choPhepTenThat(dbUrl)) {
  console.error("Cơ sở dữ liệu đích không được giữ số điện thoại thật — dừng.");
  process.exit(1);
}
const { LARK_APP_ID, LARK_APP_SECRET, LARK_BASE_APP_TOKEN } = process.env;
if (!LARK_APP_ID || !LARK_APP_SECRET || !LARK_BASE_APP_TOKEN) throw new Error("Thiếu cấu hình Lark");

async function larkJson(auth, path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json();
  if (j.code !== 0) throw new Error(`Lark ${path.split("?")[0]}: ${j.msg ?? j.code}`);
  return j.data;
}

let bangHk = null;
async function moLark() {
  if (bangHk) return bangHk;
  const t = await (
    await fetch(`${HOST}/auth/v3/tenant_access_token/internal`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: LARK_APP_ID, app_secret: LARK_APP_SECRET }),
    })
  ).json();
  const auth = `Bearer ${t.tenant_access_token}`;
  const bang = await larkJson(auth, `/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables?page_size=100`);
  const hk = bang.items.find((x) => /h[aậ]u\s*k[yỳ]/i.test(x.name));
  if (!hk) throw new Error("Không thấy bảng Hậu Kỳ");
  bangHk = { auth, goc: `/bitable/v1/apps/${LARK_BASE_APP_TOKEN}/tables/${hk.table_id}/records` };
  return bangHk;
}

async function docSdtLark(recordIds) {
  const { auth, goc } = await moLark();
  const ra = new Map();
  for (let i = 0; i < recordIds.length; i += 100) {
    const d = await larkJson(auth, `${goc}/batch_get`, {
      record_ids: recordIds.slice(i, i + 100),
      automatic_fields: false,
    });
    for (const r of d.records ?? []) ra.set(r.record_id, sdtTuDongLark(r.fields ?? {}));
  }
  return ra;
}

/** Mã hoá đơn → "SDT KH" của dòng Hậu Kỳ (lọc "Hợp đồng chi tiết" chứa "<mã>_", như tra-hau-ky.ts). */
async function docSdtTheoMa(cacMa) {
  const { auth, goc } = await moLark();
  const ra = new Map();
  for (const ma of cacMa) {
    const d = await larkJson(auth, `${goc}/search?page_size=20`, {
      field_names: ["SDT KH"],
      filter: { conjunction: "and", conditions: [{ field_name: "Hợp đồng chi tiết", operator: "contains", value: [`${ma}_`] }] },
    });
    const so = new Set((d.items ?? []).map((it) => sdtTuDongLark(it.fields ?? {})).filter(Boolean));
    // Nhiều dòng ghi nhiều số khác nhau → không chọn hộ.
    if (so.size === 1) ra.set(ma, [...so][0]);
  }
  return ra;
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  if (ghi) await client.query("begin");
  const kq = await dienBuSdtKhach(client, { docSdtLark, docSdtTheoMa, ghi });
  if (ghi) await client.query("commit");
  console.log(ghi ? "ĐÃ GHI" : "CHẠY THỬ — không ghi gì (thêm --write để ghi)");
  console.log(`Khách trống số có bộ ảnh neo dòng Lark : ${kq.khachTrong}`);
  console.log(`${ghi ? "Đã điền" : "Sẽ điền"}                                : ${kq.seDien}`);
  console.log(`Số Lark trùng khách khác cùng chi nhánh: ${kq.trungKhachKhac}`);
  console.log(`Dòng Lark ghi nhiều số khác nhau       : ${kq.nhieuSo}`);
  console.log(`Dòng Lark không có số / đã xoá         : ${kq.khongCoSoLark}`);
  const { rows } = await client.query(
    `select count(*)::int n from customers c where (c.phone is null or btrim(c.phone) = '')`,
  );
  console.log(`Tổng khách đang trống số                : ${rows[0].n}`);
} catch (e) {
  if (ghi) await client.query("rollback").catch(() => {});
  throw e;
} finally {
  await client.end();
}
