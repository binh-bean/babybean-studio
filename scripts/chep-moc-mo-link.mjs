/**
 * chep-moc-mo-link — BB-363: giữ "mốc mở link" của bộ ảnh qua lúc cắt sang bb-prod.
 *
 * OWNER: DEV-OPS.
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần
 * ---------------------------------------------------------------------------
 * BB-357/363 thu gọn ảnh của bộ CHƯA XONG khi không ai mở link quá 6 tháng. Mốc là
 * `galleries.mo_link_cuoi_luc` (0088), chưa ai mở thì `sent_at`, rồi `created_at`.
 * Bước cắt `db:nap-lai --xoa` rồi `--nap` (docs/26 §7) XOÁ `galleries`, `share_links`,
 * `activity_logs` của bb-prod và dựng lại bộ ảnh từ Lark: mọi bộ nhận `created_at` =
 * ngày cắt, không còn lần mở nào → đồng hồ 6 tháng của MỌI bộ bị đặt lại về ngày cắt.
 * Cả hai nguồn (share_links, activity_logs) đều bị `--xoa` xoá, nên không dựng lại được
 * từ dữ liệu còn giữ trên bb-prod. Nguồn duy nhất còn lại là bb-dev (nơi các gia đình
 * đang mở link trước ngày cắt). Công cụ này CHÉP mốc từ bb-dev sang bb-prod.
 *
 * ---------------------------------------------------------------------------
 * Chép gì
 * ---------------------------------------------------------------------------
 * Khớp bộ bằng `drive_folder_id` (khoá `on conflict` mà bước nạp dùng — không đổi qua lần
 * nạp lại; `lark_hauky_record_id` thì KHÔNG duy nhất). Chỉ so bằng mã băm SHA-256 của
 * khoá; không in, không lưu mã thư mục Drive (AGENTS.md §6).
 *   · mo_link_cuoi_luc = muộn hơn trong (đích, nguồn) — nguồn = lần mở link cuối của mọi
 *     link (`share_links.last_viewed_at`), cộng cột 0088 nếu bb-dev đã có;
 *   · sent_at          = đích nếu có, không thì nguồn (lúc gửi link đầu);
 *   · created_at       = sớm hơn trong (đích, nguồn) — lúc app biết tới bộ đó lần đầu.
 * Thêm (R3 của soát C vòng 11): bộ ĐÃ GIAO/LƯU TRỮ/HẾT HẠN trên đích lấy lại
 * `trang_thai_tu` = sớm hơn trong (hiện tại, `lark_trang_thai_tu`) — mốc Lark không bị
 * nạp lại đặt về ngày cắt.
 * Không bao giờ làm mốc MUỘN hơn (chỉ có thể làm bộ được thu gọn sớm hơn đúng mức, không
 * bao giờ giữ một bộ lâu hơn bản chưa chép). Tắt trigger `updated_at` trong lúc ghi (như 0088).
 *
 * ---------------------------------------------------------------------------
 * Cách chạy (Claude chạy, anh duyệt số đếm)
 * ---------------------------------------------------------------------------
 *   # xem — CHỈ ĐỌC cả hai bên, in số đếm
 *   npm run db:chep-moc-mo-link -- --dich .env.prod.local
 *   # ghi — một giao dịch trên đích
 *   npm run db:chep-moc-mo-link -- --dich .env.prod.local --ghi --that-su-la-bb-prod
 *   # lưu mốc của bb-dev ra tệp (khoá đã băm) — phòng khi bb-dev bị dọn trước khi chép
 *   npm run db:chep-moc-mo-link -- --luu "D:/bb-prod-sao-luu/moc-mo-link.json"
 *   # chép từ tệp thay vì từ bb-dev
 *   npm run db:chep-moc-mo-link -- --dich .env.prod.local --tu-tep "<tệp>" [--ghi …]
 * Nguồn mặc định = SUPABASE_DB_URL của `.env.local` (bb-dev). Đích phải đã áp 0088.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";
import { docTepEnv } from "./lib/doc-tep-env.mjs";
import { inMoiTruong, kiemTraMoiTruongChoPhep, kiemTraCoBbProd, maDuAn } from "./lib/moi-truong.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOC_REPO = path.resolve(__dirname, "..");

/** Trạng thái "đã xong vòng đời" — cùng danh sách THU_GON_ANH.TRANG_THAI (don-rac.ts). */
export const TRANG_THAI_XONG = ["delivered", "archived", "expired"];

export const bamKhoa = (driveFolderId) => crypto.createHash("sha256").update(String(driveFolderId)).digest("hex");

const ms = (v) => (v == null ? null : new Date(v).getTime());
const muonHon = (a, b) => (a == null ? b : b == null ? a : ms(a) >= ms(b) ? a : b);
const somHon = (a, b) => (a == null ? b : b == null ? a : ms(a) <= ms(b) ? a : b);
const iso = (v) => (v == null ? null : new Date(v).toISOString());

/**
 * Ghép mốc nguồn vào đích. THUẦN (không chạm cơ sở dữ liệu) — phép thử gọi thẳng.
 * @param {{khoa:string, mo:string|null, gui:string|null, tao:string|null}[]} nguon  khoa = mã băm
 * @param {{id:string, khoa:string, mo:string|null, gui:string|null, tao:string}[]} dich
 * @returns {{ capNhat: {id:string, mo:string|null, gui:string|null, tao:string}[], dem: Record<string, number> }}
 */
export function ghepMocMoLink(nguon, dich) {
  const theoKhoa = new Map();
  const trung = new Set();
  for (const n of nguon) {
    if (theoKhoa.has(n.khoa)) trung.add(n.khoa);
    theoKhoa.set(n.khoa, n);
  }
  const dem = { nguon: nguon.length, dich: dich.length, khop: 0, khoaTrung: trung.size, doiMo: 0, doiGui: 0, doiTao: 0, capNhat: 0 };
  const capNhat = [];
  for (const d of dich) {
    if (trung.has(d.khoa)) continue; // không đoán khi một khoá ứng với nhiều bộ ở nguồn
    const n = theoKhoa.get(d.khoa);
    if (!n) continue;
    dem.khop++;
    const mo = muonHon(d.mo, n.mo);
    const gui = d.gui ?? n.gui ?? null;
    const tao = somHon(d.tao, n.tao);
    const doiMo = ms(mo) !== ms(d.mo);
    const doiGui = ms(gui) !== ms(d.gui);
    const doiTao = ms(tao) !== ms(d.tao);
    if (doiMo) dem.doiMo++;
    if (doiGui) dem.doiGui++;
    if (doiTao) dem.doiTao++;
    if (doiMo || doiGui || doiTao) capNhat.push({ id: d.id, mo: iso(mo), gui: iso(gui), tao: iso(tao) });
  }
  dem.capNhat = capNhat.length;
  return { capNhat, dem };
}

async function coCot(client, cot) {
  const { rows } = await client.query(
    `select 1 from information_schema.columns where table_schema = 'public' and table_name = 'galleries' and column_name = $1`,
    [cot],
  );
  return rows.length > 0;
}

/** Mốc của bb-dev (chỉ đọc). Chạy được cả khi bb-dev CHƯA áp 0088. */
export async function docMocNguon(client) {
  const coCot0088 = await coCot(client, "mo_link_cuoi_luc");
  const { rows } = await client.query(
    `select g.drive_folder_id as khoa,
            greatest(max(s.last_viewed_at)${coCot0088 ? ", g.mo_link_cuoi_luc" : ""}) as mo,
            g.sent_at as gui, g.created_at as tao
       from galleries g left join share_links s on s.gallery_id = g.id
      where g.drive_folder_id is not null
      group by g.id`,
  );
  return rows.map((r) => ({ khoa: bamKhoa(r.khoa), mo: iso(r.mo), gui: iso(r.gui), tao: iso(r.tao) }));
}

async function docDich(client) {
  const { rows } = await client.query(
    `select id::text, drive_folder_id as khoa, mo_link_cuoi_luc as mo, sent_at as gui, created_at as tao
       from galleries where drive_folder_id is not null`,
  );
  return rows.map((r) => ({ id: r.id, khoa: bamKhoa(r.khoa), mo: iso(r.mo), gui: iso(r.gui), tao: iso(r.tao) }));
}

const SQL_TRANG_THAI_TU_XONG = `
  update galleries g
     set trang_thai_tu = least(g.trang_thai_tu, g.lark_trang_thai_tu)
   where g.status::text = any($1::text[])
     and g.lark_trang_thai_tu is not null
     and g.lark_trang_thai_tu < g.trang_thai_tu`;

/** Ghi lên đích trong MỘT giao dịch. Trả số dòng đã đổi. */
export async function ghiMoc(client, capNhat) {
  await client.query("begin");
  try {
    await client.query("alter table galleries disable trigger trg_galleries_updated_at");
    let n = 0;
    if (capNhat.length > 0) {
      const r = await client.query(
        `update galleries g
            set mo_link_cuoi_luc = c.mo, sent_at = c.gui, created_at = c.tao
           from unnest($1::uuid[], $2::timestamptz[], $3::timestamptz[], $4::timestamptz[]) as c(id, mo, gui, tao)
          where g.id = c.id`,
        [capNhat.map((c) => c.id), capNhat.map((c) => c.mo), capNhat.map((c) => c.gui), capNhat.map((c) => c.tao)],
      );
      n = r.rowCount ?? 0;
    }
    const r2 = await client.query(SQL_TRANG_THAI_TU_XONG, [TRANG_THAI_XONG]);
    await client.query("alter table galleries enable trigger trg_galleries_updated_at");
    await client.query(
      `insert into activity_logs (actor_type, actor_label, action, entity_type, metadata)
       values ('system', 'chep_moc_mo_link', 'van_hanh.chep_moc_mo_link', 'van_hanh', $1::jsonb)`,
      [JSON.stringify({ boDoiMoc: n, boXongDoiTrangThaiTu: r2.rowCount ?? 0 })],
    );
    await client.query("commit");
    return { boDoiMoc: n, boXongDoiTrangThaiTu: r2.rowCount ?? 0 };
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  }
}

function layCo(args, ten) {
  const i = args.indexOf(ten);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const args = process.argv.slice(2);
  const ghi = args.includes("--ghi");
  const tepLuu = layCo(args, "--luu");
  const tuTep = layCo(args, "--tu-tep");
  const dichTep = layCo(args, "--dich");

  // --- nguồn ---
  let nguon;
  if (tuTep) {
    nguon = JSON.parse(fs.readFileSync(tuTep, "utf8")).moc;
    console.log(`Nguồn: tệp ${path.basename(tuTep)} (${nguon.length} bộ)`);
  } else {
    const urlNguon = process.env.SUPABASE_DB_URL;
    if (!urlNguon) throw new Error("Thiếu SUPABASE_DB_URL của nguồn (.env.local).");
    const kt = kiemTraMoiTruongChoPhep(urlNguon);
    if (!kt.choPhep) throw new Error(kt.ly_do);
    process.stdout.write("Nguồn — ");
    inMoiTruong(urlNguon);
    const c = new pg.Client({ connectionString: urlNguon });
    await c.connect();
    try {
      await c.query("begin read only");
      nguon = await docMocNguon(c);
      await c.query("rollback");
    } finally {
      await c.end();
    }
    if (tepLuu) {
      fs.writeFileSync(tepLuu, JSON.stringify({ luc: new Date().toISOString(), maDuAn: maDuAn(urlNguon), moc: nguon }));
      console.log(`Đã lưu ${nguon.length} mốc (khoá đã băm) vào ${tepLuu}`);
    }
  }
  if (!dichTep) {
    if (!tepLuu) console.log("Thiếu --dich <tệp env của đích>. Không làm gì thêm.");
    return;
  }

  // --- đích ---
  const bien = docTepEnv(path.resolve(GOC_REPO, dichTep));
  const urlDich = bien.SUPABASE_DB_URL;
  if (!urlDich) throw new Error(`Thiếu SUPABASE_DB_URL trong ${dichTep}.`);
  const kt = kiemTraMoiTruongChoPhep(urlDich);
  if (!kt.choPhep) throw new Error(kt.ly_do);
  if (!tuTep && maDuAn(urlDich) === maDuAn(process.env.SUPABASE_DB_URL)) {
    throw new Error("Nguồn và đích là CÙNG một cơ sở dữ liệu — không có gì để chép.");
  }
  process.stdout.write("Đích — ");
  inMoiTruong(urlDich);
  if (ghi) {
    const ktProd = kiemTraCoBbProd(urlDich, args.includes("--that-su-la-bb-prod"));
    if (!ktProd.choPhep) throw new Error(ktProd.ly_do);
  }

  const c = new pg.Client({ connectionString: urlDich });
  await c.connect();
  try {
    if (!(await coCot(c, "mo_link_cuoi_luc"))) {
      throw new Error("Đích chưa có cột mo_link_cuoi_luc — áp migration 0088 trước (docs/26 §3).");
    }
    const dich = await docDich(c);
    const { capNhat, dem } = ghepMocMoLink(nguon, dich);
    const { rows } = await c.query(
      `select count(*)::int n from galleries g where g.status::text = any($1::text[])
          and g.lark_trang_thai_tu is not null and g.lark_trang_thai_tu < g.trang_thai_tu`,
      [TRANG_THAI_XONG],
    );
    console.log("\nSố đếm (không có tên, không có mã thư mục):");
    console.table({ ...dem, boXongSeLayMocLark: rows[0].n });
    if (!ghi) {
      console.log("\nChỉ xem. Thêm --ghi (và --that-su-la-bb-prod nếu đích là bb-prod) để ghi.");
      return;
    }
    const kq = await ghiMoc(c, capNhat);
    console.log("\nĐã ghi:", JSON.stringify(kq));
  } finally {
    await c.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("chep-moc-mo-link lỗi:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
