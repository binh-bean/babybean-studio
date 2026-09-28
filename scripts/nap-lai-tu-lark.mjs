#!/usr/bin/env node
/**
 * nap-lai-tu-lark — xoá sạch dữ liệu nghiệp vụ rồi nạp lại từ đầu theo Lark.
 *
 * OWNER: DEV-OPS. Task BB-300.
 * Spec: chủ studio chốt — trước khi mở app cho khách phải xoá sạch dữ liệu cũ
 * rồi nạp lại từ đầu theo Lark, để không ai còn hoài nghi dữ liệu app có khớp
 * với Lark hay không.
 *
 * Chạy:
 *   npm run db:nap-lai                              -- --dem (mặc định, chỉ đọc)
 *   npm run db:nap-lai -- --sao-luu "D:/duong/dan"   -- xuất JSON, không xoá
 *   npm run db:nap-lai -- --xoa --xac-nhan ABC123    -- xoá thật
 *   npm run db:nap-lai -- --nap                      -- nạp lại từ Lark
 *
 * ---------------------------------------------------------------------------
 * Bốn bước, bốn cờ riêng — cố ý không gộp
 * ---------------------------------------------------------------------------
 * Một lệnh vừa đếm vừa xoá là một lệnh mà gõ Enter nhầm một lần là mất dữ
 * liệu. Bốn cờ tách rời buộc người chạy đi qua từng bước, và bước xoá đòi một
 * mã chỉ bước đếm mới in ra — không thể xoá mà chưa từng nhìn thấy số.
 *
 * ---------------------------------------------------------------------------
 * Bảng GIỮ NGUYÊN, và vì sao
 * ---------------------------------------------------------------------------
 * "Xoá sạch rồi nạp lại từ Lark" chỉ đúng với dữ liệu mà Lark THỰC SỰ là nguồn
 * sự thật: khách, bé, buổi chụp, bộ ảnh, hợp đồng, lượt chọn. Sáu bảng dưới
 * đây Lark không hề biết tới — chúng là cấu hình của app, xoá xong không có gì
 * nạp lại được:
 *
 *   branches        chi nhánh       — Lark không có bảng "chi nhánh app".
 *   staff_profiles  nhân sự         — tài khoản đăng nhập nằm ở auth.users,
 *                                     xoá staff_profiles là khoá luôn tài
 *                                     khoản, không đồng bộ lại từ Lark được.
 *   staff_branches  nhân sự↔chi nhánh — đi cùng staff_profiles.
 *   roles           cấu hình vai trò — phân quyền tự tạo trong app (BB-172).
 *   packages        sản phẩm (gói chụp) — danh mục giá, không phải dữ liệu
 *                                     của một khách cụ thể.
 *   products        sản phẩm (danh mục) — CÓ đồng bộ từ Lark, nhưng bằng
 *                                     UPSERT (on conflict lark_record_id),
 *                                     không cần xoá trước; xoá rồi nạp lại sẽ
 *                                     phát sinh lark_record_id trùng lặp giả.
 *   settings        cài đặt         — cấu hình vận hành, không phải dữ liệu
 *                                     khách.
 *
 * Mọi bảng KHÔNG có tên ở trên bị coi là dữ liệu nghiệp vụ và sẽ bị xoá. Đây
 * là lựa chọn AN TOÀN THEO HƯỚNG NGƯỢC: một bảng mới thêm sau này mà quên xếp
 * loại sẽ tự động rơi vào diện xoá-và-liệt-kê, chứ không lặng lẽ nằm lại — im
 * lặng giữ lại rác là đúng thứ BB-300 được giao để dọn.
 *
 * ---------------------------------------------------------------------------
 * Thứ tự xoá
 * ---------------------------------------------------------------------------
 * Xoá cả bảng (không lọc theo id) nên không cần join phức tạp, nhưng vẫn phải
 * đi từ lá vào gốc để không vỡ khoá ngoại NOT NULL. Thứ tự dưới đây do người
 * viết truy theo db/schema.sql và db/migrations/0033, và được KIỂM LẠI BẰNG
 * MÁY mỗi lần chạy: `kiemTraThuTuAnToan()` đọc pg_constraint thật và từ chối
 * chạy nếu thứ tự hardcode dưới đây không còn khớp sơ đồ khoá ngoại hiện tại.
 *
 * Vòng riêng: `galleries.cover_photo_id -> photos` là khoá ngoại cho-rỗng, xử
 * lý bằng cách gỡ nó về null trước khi xoá `photos` (giống cách backup.mjs xử
 * lý cùng vòng này).
 * ---------------------------------------------------------------------------
 * Vì sao thứ tự script sync-lark-* KHÁC với mô tả bằng lời
 * ---------------------------------------------------------------------------
 * Chủ studio mô tả thứ tự "danh mục → hợp đồng → hậu kỳ → chỉnh sửa". Nhưng
 * đọc mã: `sync-lark-contracts.mjs` chỉ ghi gallery_items cho những album ĐÃ
 * TỒN TẠI (nó tự thoát sớm, in "Chưa album nào có lark_contract_code" nếu
 * không thấy) — còn chính album, khách, bé, buổi chụp là do
 * `sync-lark-hauky.mjs` TẠO RA. Chạy "hợp đồng" trước "hậu kỳ" trên một cơ sở
 * dữ liệu vừa xoá sạch sẽ không lỗi (thoát mã 0) nhưng không ghi được gì —
 * một bước --nap "xanh" mà không nạp nổi một dòng hàng nào.
 *
 * Nên thứ tự THỰC THI ở đây là: danh mục (products) → hậu kỳ (tạo khách/bộ
 * ảnh) → hợp đồng (điền dòng hàng) → chỉnh sửa. Giữ nguyên ý "bốn script,
 * dừng ở lỗi đầu tiên", chỉ đổi lại thứ tự cho đúng phụ thuộc thật.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { maDuAn } from "../src/lib/lark/muc-tieu-du-lieu.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GOC_REPO = path.resolve(__dirname, "..");

/** Mã dự án Supabase của bb-dev. Xem src/lib/lark/muc-tieu-du-lieu.ts. */
export const MA_BB_DEV = "ohkfoqqsrpvsponiwcij";

/** Bảng KHÔNG bị xoá. Lý do từng bảng ghi ở đầu tệp. */
export const BANG_GIU_NGUYEN = [
  "branches",
  "staff_profiles",
  "staff_branches",
  "roles",
  "packages",
  "products",
  "settings",
];

/**
 * Thứ tự xoá bảng nghiệp vụ, lá trước gốc sau. Danh sách này được kiểm lại
 * bằng `kiemTraThuTuAnToan()` trước khi --xoa thật sự chạy — xem đầu tệp.
 */
export const THU_TU_XOA = [
  "selection_placements",
  "selection_addons",
  "selection_ops",
  "selection_items",
  "gallery_payments",
  "selections",
  "share_links",
  "revision_requests",
  "deliveries",
  "gallery_items",
  // (bước riêng: gỡ galleries.cover_photo_id về null ở đây, xem xoaSachGiaoDich)
  "photos",
  "galleries",
  "shoots",
  "babies",
  "customers",
  "activity_logs",
  "notifications",
];

// ============================================================================
// Logic thuần — không đụng cơ sở dữ liệu, kiểm bằng phép thử đơn vị thẳng.
// ============================================================================

/**
 * Chia danh sách bảng thực tế của schema public thành giữ / xoá.
 * Bảng lạ (không có trong BANG_GIU_NGUYEN, thấy lần đầu) mặc định rơi vào xoá,
 * và được đánh dấu `moi: true` để người chạy phải để ý.
 */
export function phanLoaiBang(danhSachBangThat, bangGiu = BANG_GIU_NGUYEN, thuTuXoaDaBiet = THU_TU_XOA) {
  const tapGiu = new Set(bangGiu);
  const tapDaBiet = new Set(thuTuXoaDaBiet);
  const giu = danhSachBangThat.filter((t) => tapGiu.has(t)).sort();
  const xoa = danhSachBangThat.filter((t) => !tapGiu.has(t));
  const xoaDaSap = thuTuXoaDaBiet.filter((t) => xoa.includes(t));
  const xoaMoi = xoa.filter((t) => !tapDaBiet.has(t)).sort();
  return {
    giu,
    xoa: [...xoaDaSap, ...xoaMoi],
    moi: xoaMoi,
  };
}

/**
 * Kiểm thứ tự xoá hardcode có an toàn với sơ đồ khoá ngoại THẬT không.
 * `canhFk` là mảng {tu, den, batBuoc} lấy từ pg_constraint (tu tham chiếu đến
 * den). An toàn nghĩa là: với mọi cạnh BẮT BUỘC (not null) mà cả hai đầu đều
 * là bảng nghiệp vụ, `tu` phải đứng TRƯỚC `den` trong thứ tự xoá (con xoá
 * trước cha).
 *
 * Bỏ qua hai loại cạnh:
 *   - Tự trỏ vào chính bảng mình (vd gallery_items.parent_item_id) — xoá cả
 *     bảng trong một câu lệnh không quan tâm thứ tự nội bộ đó.
 *   - Cạnh CHO RỖNG (batBuoc = false, vd galleries.cover_photo_id -> photos)
 *     — `xoaSachGiaoDich` gỡ nó về null trước khi xoá bảng đích, nên thứ tự
 *     giữa hai bảng đó không bắt buộc phải theo chiều khoá ngoại.
 */
export function kiemTraThuTuAnToan(thuTuXoa, canhFk) {
  const viTri = new Map(thuTuXoa.map((t, i) => [t, i]));
  const loi = [];
  for (const canh of canhFk) {
    if (canh.tu === canh.den) continue;
    if (canh.batBuoc === false) continue; // cho rỗng — gỡ trước khi xoá, xem xoaSachGiaoDich
    if (!viTri.has(canh.tu) || !viTri.has(canh.den)) continue; // ngoài phạm vi xoá
    if (viTri.get(canh.tu) > viTri.get(canh.den)) {
      loi.push(`${canh.tu} -> ${canh.den} (đang xoá ${canh.den} trước ${canh.tu})`);
    }
  }
  return { anToan: loi.length === 0, loi };
}

/**
 * Mã xác nhận: băm từ số đếm + ngày, 6 ký tự. Đổi một dòng đếm hay đổi ngày là
 * ra mã khác — nên mã trùng chỉ có thể sinh ra từ đúng bộ số đã in.
 */
export function taoMaXacNhan(demTheoBang, ngayYYYYMMDD) {
  const noiDung = JSON.stringify(
    Object.keys(demTheoBang)
      .sort()
      .map((k) => [k, demTheoBang[k]]),
  );
  const bam = crypto.createHash("sha256").update(`${noiDung}|${ngayYYYYMMDD}`).digest("hex");
  return bam.slice(0, 6).toUpperCase();
}

export function ngayHomNay(bayGio = new Date()) {
  const d = bayGio;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Từ chối thư mục sao lưu nằm trong kho — kho là public, xem AGENTS.md §6. */
export function duongDanSaoLuuHopLe(duongDanChon, gocRepo = GOC_REPO) {
  const dich = path.resolve(duongDanChon);
  const goc = path.resolve(gocRepo);
  if (dich === goc || dich.startsWith(goc + path.sep)) {
    return { hopLe: false, ly_do: `Thư mục ${dich} nằm TRONG kho — kho này public.` };
  }
  return { hopLe: true, duong: dich };
}

/**
 * Toàn bộ điều kiện chặn --xoa, gom một chỗ để phép thử không phải dựng cả
 * cơ sở dữ liệu giả mới kiểm được một nhánh từ chối.
 */
export function kiemTraDieuKienXoa({
  maNhapVao,
  demHienTai,
  ngayHienTai,
  sanLuuGanNhat, // { thoiDiem: Date } hoặc null
  urlKetNoi,
  coCoThatSuLaBbDev,
  gioAnToanBanSaoLuu = 24,
}) {
  const loi = [];

  const maDung = taoMaXacNhan(demHienTai, ngayHienTai);
  if (!maNhapVao || maNhapVao.toUpperCase() !== maDung) {
    loi.push(
      "Mã xác nhận không khớp. Có thể số đếm đã đổi từ lúc in mã (Lark vừa " +
        "đồng bộ thêm, hoặc ai đó vừa thao tác), hoặc mã gõ sai. Chạy lại " +
        "`--dem` để lấy mã mới rồi thử lại.",
    );
  }

  if (!sanLuuGanNhat) {
    loi.push("Chưa có bản sao lưu nào. Chạy `--sao-luu <thư-mục>` trước.");
  } else {
    const gio = (Date.now() - new Date(sanLuuGanNhat.thoiDiem).getTime()) / 3_600_000;
    if (gio > gioAnToanBanSaoLuu) {
      loi.push(
        `Bản sao lưu gần nhất đã ${gio.toFixed(1)} giờ trước, quá mốc ` +
          `${gioAnToanBanSaoLuu} giờ. Chạy lại \`--sao-luu <thư-mục>\` trước khi xoá.`,
      );
    }
  }

  const ma = maDuAn(urlKetNoi);
  if (ma === MA_BB_DEV && !coCoThatSuLaBbDev) {
    loi.push(
      "SUPABASE_URL đang trỏ vào bb-dev — dữ liệu THẬT của studio (xem " +
        "AGENTS.md §6). Cần thêm cờ `--that-su-la-bb-dev` để xác nhận đây là " +
        "chủ ý, không phải gõ nhầm môi trường.",
    );
  }

  return { choPhep: loi.length === 0, loi };
}

// ============================================================================
// Lớp truy cập DB — biên giới mỏng, phép thử đơn vị giả lập đúng lớp này.
// ============================================================================

export function taoClient(dbUrl) {
  const u = new URL(dbUrl);
  return new pg.Client({
    host: u.hostname,
    port: Number(u.port) || 5432,
    database: u.pathname.slice(1),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25_000,
  });
}

export async function danhSachBangThat(client) {
  const { rows } = await client.query(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return rows.map((r) => r.tablename);
}

export async function canhKhoaNgoai(client) {
  const { rows } = await client.query(
    `select r.relname as tu, f.relname as den, a.attnotnull as "batBuoc"
       from pg_constraint c
       join pg_class r on r.oid = c.conrelid
       join pg_class f on f.oid = c.confrelid
       join pg_namespace n on n.oid = r.relnamespace
       join unnest(c.conkey) k(attnum) on true
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.contype = 'f' and n.nspname = 'public'`,
  );
  return rows;
}

/** Đếm số dòng của mỗi bảng trong danh sách. Chỉ đọc. */
export async function demBang(client, danhSachBang) {
  const ket = {};
  for (const bang of danhSachBang) {
    const { rows } = await client.query(`select count(*)::int as n from "${bang}"`);
    ket[bang] = rows[0].n;
  }
  return ket;
}

/** Xuất toàn bộ dữ liệu của các bảng ra JSON, một tệp một bảng, kèm tổng số. */
export async function xuatSaoLuu(client, danhSachBang, thuMucDich) {
  fs.mkdirSync(thuMucDich, { recursive: true });
  const demTheoBang = {};
  for (const bang of danhSachBang) {
    const { rows } = await client.query(`select * from "${bang}"`);
    fs.writeFileSync(path.join(thuMucDich, `${bang}.json`), JSON.stringify(rows, null, 2), "utf8");
    demTheoBang[bang] = rows.length;
  }
  const tongKet = {
    thoiDiem: new Date().toISOString(),
    tongSoDong: Object.values(demTheoBang).reduce((a, b) => a + b, 0),
    demTheoBang,
  };
  fs.writeFileSync(
    path.join(thuMucDich, "tong-so-dong.json"),
    JSON.stringify(tongKet, null, 2),
    "utf8",
  );
  return tongKet;
}

/** Tìm bản sao lưu gần nhất trong thư mục gốc sao lưu (mỗi lượt là một thư mục con). */
export function sanLuuGanNhatTrongThuMuc(gocSaoLuu) {
  if (!fs.existsSync(gocSaoLuu)) return null;
  const conCac = fs
    .readdirSync(gocSaoLuu, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(gocSaoLuu, d.name, "tong-so-dong.json"))
    .filter((p) => fs.existsSync(p));
  if (!conCac.length) return null;
  const banGhi = conCac
    .map((p) => {
      try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.thoiDiem) - new Date(a.thoiDiem));
  return banGhi[0] ?? null;
}

/**
 * Xoá toàn bộ bảng nghiệp vụ trong MỘT giao dịch, đúng thứ tự khoá ngoại.
 * Gỡ galleries.cover_photo_id trước khi xoá photos để phá vòng.
 */
export async function xoaSachGiaoDich(client, thuTuXoa) {
  await client.query("begin");
  try {
    const dem = {};
    if (thuTuXoa.includes("photos")) {
      await client.query(`update galleries set cover_photo_id = null`);
    }
    for (const bang of thuTuXoa) {
      const r = await client.query(`delete from "${bang}"`);
      dem[bang] = r.rowCount ?? 0;
    }
    await client.query("commit");
    return dem;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
}

// ============================================================================
// Bước --nap: chạy lần lượt script sync-lark-*, dừng ở lỗi đầu tiên.
// ============================================================================

/**
 * Danh sách lệnh nạp, theo thứ tự PHỤ THUỘC THẬT (xem ghi chú đầu tệp), không
 * phải thứ tự mô tả bằng lời "danh mục → hợp đồng → hậu kỳ → chỉnh sửa".
 */
export function danhSachLenhNap() {
  return [
    { ten: "danh mục sản phẩm", lenh: "npm", tso: ["run", "sync:catalog", "--", "--write"] },
    {
      ten: "hậu kỳ (khách / bộ ảnh)",
      lenh: "node",
      tso: [
        "--env-file-if-exists=.env.local",
        "--import",
        "tsx",
        "scripts/sync-lark-hauky.mjs",
        "--",
        "--write",
      ],
    },
    { ten: "hợp đồng (dòng hàng)", lenh: "npm", tso: ["run", "sync:contracts", "--", "--write"] },
    {
      ten: "chỉnh sửa (retouch)",
      lenh: "node",
      tso: [
        "--env-file-if-exists=.env.local",
        "--import",
        "tsx",
        "scripts/sync-lark-retouch.mjs",
        "--",
        "--write",
      ],
    },
  ];
}

/**
 * Chạy các lệnh nạp tuần tự, dừng ở lệnh đầu tiên thoát khác 0.
 * `runner` được tiêm vào để phép thử không phải gọi npm/node thật.
 */
export function chayNap(lenhs, runner = spawnSync, cwd = GOC_REPO) {
  const ketQua = [];
  for (const b of lenhs) {
    const r = runner(b.lenh, b.tso, { cwd, encoding: "utf8", shell: process.platform === "win32" });
    const thanhCong = (r.status ?? 1) === 0;
    ketQua.push({ ten: b.ten, thanhCong, maThoat: r.status, stdout: r.stdout, stderr: r.stderr });
    if (!thanhCong) break;
  }
  return ketQua;
}

// ============================================================================
// CLI
// ============================================================================

function env(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`Thiếu biến ${key}. Kiểm tra .env.local.`);
    process.exit(2);
  }
  return v;
}

function gocSaoLuuMacDinh() {
  return path.resolve(path.dirname(GOC_REPO), "babybean-sao-luu");
}

async function main() {
  const argv = process.argv.slice(2);
  const laXoa = argv.includes("--xoa");
  const laNap = argv.includes("--nap");
  const iSaoLuu = argv.indexOf("--sao-luu");
  const laSaoLuu = iSaoLuu !== -1;
  const laDem = !laXoa && !laNap && !laSaoLuu; // mặc định

  if (laNap) {
    console.log("Nạp lại từ Lark — bốn bước, dừng ở lỗi đầu tiên.\n");
    const ketQua = chayNap(danhSachLenhNap());
    for (const b of ketQua) {
      console.log(`[${b.thanhCong ? "OK" : "LỖI"}] ${b.ten} (mã thoát ${b.maThoat})`);
      if (b.stdout) console.log(b.stdout.trim());
      if (!b.thanhCong) {
        if (b.stderr) console.error(b.stderr.trim());
        console.error(`\nDừng ở bước "${b.ten}". Các bước sau chưa chạy.`);
        process.exit(1);
      }
    }
    console.log("\nNạp xong toàn bộ bốn bước.");
    return;
  }

  const dbUrl = env("SUPABASE_DB_URL");
  const client = taoClient(dbUrl);
  await client.connect();
  try {
    const bangThat = await danhSachBangThat(client);
    const { giu, xoa, moi } = phanLoaiBang(bangThat);

    if (laSaoLuu) {
      const dichChon = argv[iSaoLuu + 1];
      if (!dichChon) {
        console.error("Thiếu thư mục đích. Dùng: --sao-luu \"D:/duong/dan\"");
        process.exit(2);
      }
      const kt = duongDanSaoLuuHopLe(dichChon);
      if (!kt.hopLe) {
        console.error(kt.ly_do);
        process.exit(2);
      }
      const canh = await canhKhoaNgoai(client);
      const antoan = kiemTraThuTuAnToan(THU_TU_XOA, canh);
      if (!antoan.anToan) {
        console.error("Thứ tự xoá hardcode không còn khớp sơ đồ khoá ngoại hiện tại:");
        for (const l of antoan.loi) console.error(`   ${l}`);
        console.error("Dừng lại — sửa THU_TU_XOA trong scripts/nap-lai-tu-lark.mjs trước.");
        process.exit(2);
      }
      const tong = await xuatSaoLuu(client, xoa, kt.duong);
      console.log(`Đã sao lưu ${tong.tongSoDong} dòng vào ${kt.duong}`);
      for (const [b, n] of Object.entries(tong.demTheoBang)) console.log(`   ${String(n).padStart(6)}  ${b}`);
      return;
    }

    if (laXoa) {
      const iMa = argv.indexOf("--xac-nhan");
      const maNhapVao = iMa !== -1 ? argv[iMa + 1] : null;
      const demHienTai = await demBang(client, xoa);
      const sanLuu = sanLuuGanNhatTrongThuMuc(process.env.BACKUP_DIR || gocSaoLuuMacDinh());

      const kt = kiemTraDieuKienXoa({
        maNhapVao,
        demHienTai,
        ngayHienTai: ngayHomNay(),
        sanLuuGanNhat: sanLuu,
        urlKetNoi: dbUrl,
        coCoThatSuLaBbDev: argv.includes("--that-su-la-bb-dev"),
      });
      if (!kt.choPhep) {
        console.error("Từ chối xoá:");
        for (const l of kt.loi) console.error(`   - ${l}`);
        process.exit(2);
      }

      const canh = await canhKhoaNgoai(client);
      const antoan = kiemTraThuTuAnToan(THU_TU_XOA, canh);
      if (!antoan.anToan) {
        console.error("Thứ tự xoá hardcode không còn khớp sơ đồ khoá ngoại hiện tại:");
        for (const l of antoan.loi) console.error(`   ${l}`);
        process.exit(2);
      }

      const dem = await xoaSachGiaoDich(client, xoa);
      console.log("Đã xoá:");
      for (const [b, n] of Object.entries(dem)) console.log(`   ${String(n).padStart(6)}  ${b}`);
      return;
    }

    if (laDem) {
      console.log(`Bảng giữ nguyên (${giu.length}) — cấu hình / sản phẩm / chi nhánh / nhân sự / cài đặt:`);
      for (const b of giu) console.log(`   ${b}`);
      if (moi.length) {
        console.log(`\nBảng MỚI chưa từng phân loại, mặc định coi là dữ liệu nghiệp vụ (sẽ bị xoá):`);
        for (const b of moi) console.log(`   ${b}`);
      }
      console.log(`\nBảng nghiệp vụ sẽ bị xoá (${xoa.length}):`);
      const dem = await demBang(client, xoa);
      for (const b of xoa) console.log(`   ${String(dem[b]).padStart(6)}  ${b}`);
      const tongXoa = Object.values(dem).reduce((a, b) => a + b, 0);
      console.log(`\nTổng: ${tongXoa} dòng sẽ bị xoá, ${giu.length} bảng giữ nguyên.`);

      const ma = taoMaXacNhan(dem, ngayHomNay());
      console.log(`\nMã xác nhận cho --xoa hôm nay: ${ma}`);
      console.log("(Mã đổi nếu số đếm đổi hoặc sang ngày khác — chạy lại --dem để lấy mã mới.)");
    }
  } finally {
    await client.end();
  }
}

const chayTrucTiep = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (chayTrucTiep) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
