// BB-376 — điền bù lark_hauky_record_id cho bộ ảnh tạo qua đường hook/cron cũ
// (không neo dòng Hậu Kỳ). Khớp theo MÃ HOÁ ĐƠN với bảng Hậu Kỳ (CHỈ ĐỌC Lark).
//
//   npm run db:neo-dong-hau-ky            → CHẠY THỬ (mặc định): chỉ đếm, không ghi gì
//   npm run db:neo-dong-hau-ky -- --write → ghi thật (người có quyền chạy, sau khi xem số)
//
// Luật (src/lib/lark/neo-dong-hau-ky.ts): chỉ neo khi khớp DUY NHẤT một dòng (nhiều dòng
// thì thu hẹp theo thư mục Drive; vẫn nhiều, hoặc một dòng bị nhiều bộ cùng nhận → liệt
// kê id rút gọn để người xem). Chỉ ghi vào cột đang trống; không đè bộ đã neo.
//
// Không in tên hay số điện thoại — chỉ in con số và id rút gọn.
import pg from "pg";
import { dienBuNeoDongHauKy } from "../src/lib/lark/neo-dong-hau-ky.ts";

const HOST = "https://open.larksuite.com/open-apis";
const ghi = process.argv.includes("--write");
const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) throw new Error("Thiếu SUPABASE_DB_URL");
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

function chuO(v) {
  if (v && typeof v === "object" && !Array.isArray(v) && "value" in v) v = v.value;
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => (x && typeof x === "object" ? (x.text ?? x.link ?? "") : String(x))).join("");
  if (typeof v === "object") return v.text ?? v.link ?? "";
  return String(v);
}

/** Mã hoá đơn → các dòng Hậu Kỳ (lọc "Hợp đồng chi tiết" chứa "<mã>_", như tra-hau-ky.ts). CHỈ ĐỌC. */
async function docDongTheoMa(cacMa) {
  const { auth, goc } = await moLark();
  const ra = new Map();
  for (const ma of cacMa) {
    const d = await larkJson(auth, `${goc}/search?page_size=50`, {
      field_names: ["Link ảnh gửi khách"],
      filter: { conjunction: "and", conditions: [{ field_name: "Hợp đồng chi tiết", operator: "contains", value: [`${ma}_`] }] },
    });
    ra.set(
      ma,
      (d.items ?? []).map((it) => ({ recordId: it.record_id, linkAnh: chuO(it.fields?.["Link ảnh gửi khách"]) })),
    );
  }
  return ra;
}

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();
try {
  if (ghi) await client.query("begin");
  const kq = await dienBuNeoDongHauKy(client, { docDongTheoMa, ghi });
  if (ghi) await client.query("commit");
  console.log(ghi ? "ĐÃ GHI" : "CHẠY THỬ — không ghi gì (thêm --write để ghi)");
  console.log(`Bộ chưa neo dòng Lark, có mã hoá đơn : ${kq.boTrong}`);
  console.log(`${ghi ? "Đã neo" : "Sẽ neo"} (khớp duy nhất một dòng)      : ${kq.seNeo}`);
  console.log(`Mơ hồ (cần người xem)                : ${kq.moHo.length}`);
  for (const m of kq.moHo) console.log(`   bộ ${m.galleryId}… — ${m.lyDo} (${m.soDong} dòng)`);
  console.log(`Không thấy dòng nào trên Lark        : ${kq.khongThay}`);
  const { rows } = await client.query(
    `select count(*)::int n from galleries where (lark_hauky_record_id is null or btrim(lark_hauky_record_id) = '') and status <> 'archived'`,
  );
  console.log(`Tổng bộ đang trống lark_hauky_record_id : ${rows[0].n}`);
} catch (e) {
  if (ghi) await client.query("rollback").catch(() => {});
  throw e;
} finally {
  await client.end();
}
