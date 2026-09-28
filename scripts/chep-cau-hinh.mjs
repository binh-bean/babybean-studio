#!/usr/bin/env node
/**
 * chep-cau-hinh — chép CẤU HÌNH (không phải dữ liệu khách) từ một môi trường
 * sang một môi trường khác: chi nhánh, vai trò, nhân sự, cài đặt, gói chụp.
 *
 * OWNER: DEV-OPS. Task BB-315.
 *
 * ---------------------------------------------------------------------------
 * Vì sao đúng SÁU bảng này, không hơn
 * ---------------------------------------------------------------------------
 * `BANG_GIU_NGUYEN` (import từ `nap-lai-tu-lark.mjs`) là danh sách sáu bảng mà
 * "xoá sạch rồi nạp lại từ Lark" KHÔNG đụng tới, vì Lark không biết gì về
 * chúng. Đây đúng là sáu bảng cần một đường CHÉP riêng, vì chúng không tự có
 * ở đích: `branches`, `staff_profiles`, `staff_branches`, `roles`, `settings`,
 * `packages`. Dùng lại cùng một danh sách — không định nghĩa hai lần, không
 * để hai chỗ lệch nhau khi có bảng cấu hình mới trong tương lai.
 *
 * `roles` chỉ chép phần VAI TỰ TẠO (`is_system = false`) — chín vai hệ thống
 * dùng UUID CỐ ĐỊNH `00000000-0000-0000-0000-00000000000N` giống hệt nhau ở
 * mọi môi trường (xem `db/migrations/0052-vai-tro-dong.sql`), migration tự lo,
 * không cần chép.
 *
 * ---------------------------------------------------------------------------
 * Giữ UUID — vì sao, và giữ được tới đâu
 * ---------------------------------------------------------------------------
 * `branches` và `packages` đã có sẵn ở đích (bb-prod đã dựng 3 chi nhánh, 4
 * gói chụp từ trước) với UUID CỦA RIÊNG bb-prod — không giống bb-dev. Không
 * thể "ép" một UUID mới lên một dòng ĐANG CÓ mà không phá khoá ngoại của mọi
 * thứ đã trỏ vào nó. Nên quy tắc ở đây là:
 *
 *   - Dòng đã có ở đích (khớp theo khoá tự nhiên — `code` cho branches/
 *     packages, `name` cho roles, `key`+`branch_id` cho settings): GIỮ
 *     NGUYÊN id của đích, chỉ cập nhật các cột khác cho khớp nguồn.
 *   - Dòng CHƯA có ở đích: chèn mới, dùng ĐÚNG id của nguồn — để về sau có
 *     thêm dữ liệu tham chiếu tới nó (ví dụ nạp lại từ Lark) thì id đó khớp
 *     với id đã biết ở bb-dev, không phải một UUID ngẫu nhiên mới sinh ra.
 *
 * `packages.branch_id` và `settings.branch_id` tham chiếu `branches.id` — bản
 * đồ id chi nhánh (nguồn -> đích, xây một lần từ bước chép branches) được dùng
 * lại để nắn hai cột này, không chép thẳng branch_id của nguồn.
 *
 * ---------------------------------------------------------------------------
 * Nhân sự — auth.users tách riêng theo từng project Supabase
 * ---------------------------------------------------------------------------
 * Đã tra `@supabase/auth-js` (kiểu `AdminUserAttributes`, trường `id?: string`
 * — "Allows you to overwrite the default `id` set for the user"): Admin API
 * `auth.admin.createUser({ id, ... })` CHO PHÉP đặt sẵn UUID, không phải để
 * Supabase tự sinh. Nên nhân sự chép sang giữ ĐÚNG UUID cũ, `staff_profiles.id`
 * ở đích khớp thẳng `auth.users.id` mới tạo, không cần bảng ánh xạ.
 *
 * KHÔNG chép mật khẩu — không có gì để chép, vì tệp sao lưu và bảng
 * `staff_profiles` đọc ở nguồn còn không CHỨA mật khẩu (nằm trong
 * `auth.users`, ngoài tầm mọi script ở đây, xem `backup.mjs`). Tài khoản tạo
 * ra ở đích được gán một mật khẩu NGẪU NHIÊN, dài, không lưu lại — tức không
 * ai, kể cả người chạy script, biết mật khẩu đó. Chủ studio (hoặc chính nhân
 * sự sau khi được cấp lại) phải ĐẶT MẬT KHẨU MỚI qua "Đặt lại mật khẩu" trong
 * màn Nhân sự (PATCH /api/admin/staff/:id, đã có sẵn — BB-063) trước khi tài
 * khoản đó dùng được. Ghi rõ việc này trong runbook `docs/26`.
 *
 * Trùng email nhưng KHÁC id (ví dụ chủ studio đã tự tay tạo tài khoản owner
 * đầu tiên ở bb-prod theo docs/18 §2.1, trùng email với một dòng ở bb-dev) là
 * một xung đột không tự giải quyết được — script BÁO và BỎ QUA đúng nhân sự
 * đó, không đoán.
 *
 * ---------------------------------------------------------------------------
 * An toàn khi in ra màn hình
 * ---------------------------------------------------------------------------
 * Mặc định (không có `--ghi`) là CHỈ ĐỌC — không được PHÉP in tên/SĐT/email
 * nhân sự, không in giá trị cài đặt đánh dấu bí mật (`lark.webhook_url`). Chỉ
 * in id và khoá tự nhiên (code/key/tên vai). Xem `dongInAnToan()`.
 *
 * ---------------------------------------------------------------------------
 * Cách chạy
 * ---------------------------------------------------------------------------
 *   # chỉ xem — không ghi gì, chỉ đọc bb-dev qua .env.local
 *   node --import tsx scripts/chep-cau-hinh.mjs --dich .env.prod.local
 *
 *   # ghi thật (chủ studio duyệt rồi mới chạy) — Claude chạy phần bb-prod
 *   node --import tsx scripts/chep-cau-hinh.mjs --dich .env.prod.local \
 *     --ghi --xac-nhan <mã in ra ở lượt chỉ-xem> --that-su-la-bb-prod
 */

import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { docTepEnv } from "./lib/doc-tep-env.mjs";
import { inMoiTruong, kiemTraMoiTruongChoPhep, kiemTraCoBbProd, MA_BB_DEV, maDuAn } from "./lib/moi-truong.mjs";
import { BANG_GIU_NGUYEN } from "./nap-lai-tu-lark.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GOC_REPO = path.resolve(__dirname, "..");

/** Sáu bảng cấu hình biết chép — dùng lại nguyên danh sách của nap-lai-tu-lark.mjs. */
export const BANG_CAU_HINH = BANG_GIU_NGUYEN;

// ============================================================================
// Logic thuần — không đụng cơ sở dữ liệu, kiểm bằng phép thử đơn vị thẳng.
// ============================================================================

/**
 * So sánh một tập dòng NGUỒN với một tập dòng ĐÍCH theo một khoá tự nhiên.
 *
 * Trả về bốn nhóm:
 *   themMoi   — có ở nguồn, CHƯA có ở đích -> chèn mới, giữ NGUYÊN id nguồn.
 *   capNhat   — có ở cả hai, một vài cột khác nhau -> sửa ở đích, GIỮ id đích.
 *   khongDoi  — có ở cả hai, mọi cột đã khớp -> không làm gì.
 *   xoaODich  — có ở đích, KHÔNG còn ở nguồn -> chỉ BÁO, không tự xoá (xem
 *               đầu tệp — xoá một dòng cấu hình đang được tham chiếu là việc
 *               không nên tự động hoá).
 *
 * `soSanhCot` nhận (dòngNguồn, dòngĐích) -> mảng tên cột khác nhau (rỗng nếu
 * giống hệt). Tách khỏi hàm này để mỗi bảng tự định nghĩa cột nào đáng so.
 */
export function soSanhTheoKhoa(hangNguon, hangDich, khoaCua, soSanhCot) {
  const dichTheoKhoa = new Map(hangDich.map((r) => [khoaCua(r), r]));
  const khoaNguon = new Set();
  const themMoi = [];
  const capNhat = [];
  const khongDoi = [];

  for (const n of hangNguon) {
    const k = khoaCua(n);
    khoaNguon.add(k);
    const d = dichTheoKhoa.get(k);
    if (!d) {
      themMoi.push(n);
      continue;
    }
    const cotKhac = soSanhCot(n, d);
    if (cotKhac.length > 0) {
      capNhat.push({ nguon: n, dich: d, cotKhac });
    } else {
      khongDoi.push({ nguon: n, dich: d });
    }
  }

  const xoaODich = hangDich.filter((d) => !khoaNguon.has(khoaCua(d)));
  return { themMoi, capNhat, khongDoi, xoaODich };
}

/** So cột đơn giản: liệt kê tên cột có giá trị khác nhau (so sánh JSON, đủ cho scalar/jsonb). */
export function soSanhCotDonGian(cotCanSo) {
  return (nguon, dich) => cotCanSo.filter((c) => JSON.stringify(nguon[c]) !== JSON.stringify(dich[c]));
}

/**
 * Bản đồ id chi nhánh nguồn -> đích, khớp theo `code`.
 * Dòng CHƯA có ở đích: bản đồ trỏ id đó về CHÍNH id của nguồn — vì
 * `themMoi` sẽ chèn nó ở đích với đúng id đó (xem đầu tệp).
 */
export function xayBanDoBranch(hangNguon, hangDich) {
  const dichTheoCode = new Map(hangDich.map((r) => [r.code, r.id]));
  const banDo = new Map();
  for (const n of hangNguon) {
    banDo.set(n.id, dichTheoCode.get(n.code) ?? n.id);
  }
  return banDo;
}

/** Nắn một branch_id theo bản đồ ở trên. `null`/`undefined` (áp dụng mọi chi nhánh) giữ nguyên. */
export function nanBranchId(banDoBranch, branchId) {
  if (branchId === null || branchId === undefined) return null;
  return banDoBranch.get(branchId) ?? branchId;
}

/** Mã xác nhận cho lượt ghi — đổi theo tổng số dòng sẽ thêm/sửa mỗi bảng + ngày. */
export function taoMaXacNhanChep(tongKetTheoBang, ngayYYYYMMDD) {
  const noiDung = JSON.stringify(
    Object.keys(tongKetTheoBang)
      .sort()
      .map((k) => [k, tongKetTheoBang[k].themMoi, tongKetTheoBang[k].capNhat]),
  );
  const bam = crypto.createHash("sha256").update(`${noiDung}|${ngayYYYYMMDD}`).digest("hex");
  return bam.slice(0, 6).toUpperCase();
}

export function ngayHomNay(bayGio = new Date()) {
  const d = bayGio;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Từ chối nếu đích là bb-dev — không được vô tình chép đè lên cơ sở dữ liệu thử thật. */
export function kiemTraDichKhongPhaiBbDev(dbUrlDich) {
  const ma = maDuAn(dbUrlDich);
  if (ma === MA_BB_DEV) {
    return {
      choPhep: false,
      ly_do:
        "Đích đang là bb-dev — đó là cơ sở dữ liệu thử THẬT của studio, không " +
        "phải nơi để chép cấu hình đè lên. Kiểm lại --dich.",
    };
  }
  return { choPhep: true };
}

/** Sinh một mật khẩu dài, ngẫu nhiên, không lưu lại — dùng cho tài khoản vừa tạo ở đích. */
export function matKhauNgauNhienKhongLuu() {
  return crypto.randomBytes(24).toString("base64url");
}

// ============================================================================
// Lớp truy cập DB / Auth — biên giới mỏng, không unit test trực tiếp phần này.
// ============================================================================

function layTepMoiTruong(duong, nhan) {
  const bien = docTepEnv(path.resolve(GOC_REPO, duong));
  if (!bien) {
    console.error(`Không thấy tệp môi trường (${nhan}): ${path.resolve(GOC_REPO, duong)}`);
    process.exit(2);
  }
  return bien;
}

async function ketNoiPg(bien, nhan) {
  const dbUrl = bien.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error(`Thiếu SUPABASE_DB_URL trong tệp môi trường ${nhan}.`);
    process.exit(2);
  }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  return { client, dbUrl };
}

function taoAdminAuth(bien, nhan) {
  const url = bien.NEXT_PUBLIC_SUPABASE_URL;
  const key = bien.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(`Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY trong tệp môi trường ${nhan}.`);
    process.exit(2);
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function docBang(client, bang, cot) {
  const { rows } = await client.query(`select ${cot.map((c) => `"${c}"`).join(", ")} from "${bang}"`);
  return rows;
}

/** Che giá trị bí mật khi IN — không bao giờ in nguyên văn. */
function cheBot(giaTri) {
  const s = typeof giaTri === "string" ? giaTri : JSON.stringify(giaTri ?? "");
  if (!s || s.length <= 12) return s ? "••••" : "(rỗng)";
  return `${s.slice(0, 6)}••••${s.slice(-4)}`;
}

const KHOA_SETTINGS_BI_MAT = new Set(["lark.webhook_url"]);

async function main() {
  const argv = process.argv.slice(2);
  const arg = (ten, macDinh) => {
    const i = argv.indexOf(ten);
    return i !== -1 ? argv[i + 1] : macDinh;
  };
  const ghiThat = argv.includes("--ghi");
  const coBbProd = argv.includes("--that-su-la-bb-prod");
  const maNhapVao = arg("--xac-nhan", null);

  const duongNguon = arg("--nguon", ".env.local");
  const duongDich = arg("--dich", null);
  if (!duongDich) {
    console.error("Thiếu --dich <đường dẫn tệp môi trường>. Ví dụ: --dich .env.prod.local");
    process.exit(2);
  }

  const bienNguon = layTepMoiTruong(duongNguon, "nguồn");
  const bienDich = layTepMoiTruong(duongDich, "đích");

  const { client: pgNguon, dbUrl: dbUrlNguon } = await ketNoiPg(bienNguon, "nguồn");
  const { client: pgDich, dbUrl: dbUrlDich } = await ketNoiPg(bienDich, "đích");

  try {
    console.log("Nguồn:");
    inMoiTruong(dbUrlNguon);
    console.log("Đích:");
    inMoiTruong(dbUrlDich);

    for (const [nhan, url] of [
      ["nguồn", dbUrlNguon],
      ["đích", dbUrlDich],
    ]) {
      const kt = kiemTraMoiTruongChoPhep(url);
      if (!kt.choPhep) {
        console.error(`(${nhan}) ${kt.ly_do}`);
        process.exit(2);
      }
    }

    const ktDich = kiemTraDichKhongPhaiBbDev(dbUrlDich);
    if (!ktDich.choPhep) {
      console.error(ktDich.ly_do);
      process.exit(2);
    }

    // --- đọc dữ liệu cấu hình cả hai bên ------------------------------------
    const branchesNguon = await docBang(pgNguon, "branches", [
      "id", "code", "name", "address", "hotline", "zalo_oa", "logo_url", "timezone", "is_active", "settings",
    ]);
    const branchesDich = await docBang(pgDich, "branches", [
      "id", "code", "name", "address", "hotline", "zalo_oa", "logo_url", "timezone", "is_active", "settings",
    ]);
    const banDoBranch = xayBanDoBranch(branchesNguon, branchesDich);
    const dtBranches = soSanhTheoKhoa(
      branchesNguon,
      branchesDich,
      (r) => r.code,
      soSanhCotDonGian(["name", "address", "hotline", "zalo_oa", "logo_url", "timezone", "is_active", "settings"]),
    );

    const packagesNguonTho = await docBang(pgNguon, "packages", [
      "id", "branch_id", "code", "name", "description", "price", "included_quota", "extra_photo_price", "printed_photo_count", "is_active",
    ]);
    const packagesDich = await docBang(pgDich, "packages", [
      "id", "branch_id", "code", "name", "description", "price", "included_quota", "extra_photo_price", "printed_photo_count", "is_active",
    ]);
    // Khoá tự nhiên của packages là (branch_id đã nắn, code) — hai chi nhánh
    // khác nhau được phép có cùng code (xem uq_packages_code trong schema.sql).
    const packagesNguon = packagesNguonTho.map((p) => ({ ...p, branch_id: nanBranchId(banDoBranch, p.branch_id) }));
    const dtPackages = soSanhTheoKhoa(
      packagesNguon,
      packagesDich,
      (r) => `${r.branch_id ?? "ALL"}::${r.code}`,
      soSanhCotDonGian(["name", "description", "price", "included_quota", "extra_photo_price", "printed_photo_count", "is_active"]),
    );

    const rolesNguon = (await docBang(pgNguon, "roles", ["id", "name", "permissions", "is_system"])).filter(
      (r) => !r.is_system,
    );
    const rolesDich = (await docBang(pgDich, "roles", ["id", "name", "permissions", "is_system"])).filter(
      (r) => !r.is_system,
    );
    const dtRoles = soSanhTheoKhoa(rolesNguon, rolesDich, (r) => r.name, soSanhCotDonGian(["permissions"]));

    const settingsNguonTho = await docBang(pgNguon, "settings", ["id", "key", "branch_id", "value"]);
    const settingsDich = await docBang(pgDich, "settings", ["id", "key", "branch_id", "value"]);
    const settingsNguon = settingsNguonTho.map((s) => ({ ...s, branch_id: nanBranchId(banDoBranch, s.branch_id) }));
    const dtSettings = soSanhTheoKhoa(
      settingsNguon,
      settingsDich,
      (r) => `${r.key}::${r.branch_id ?? "ALL"}`,
      soSanhCotDonGian(["value"]),
    );

    const staffNguon = await docBang(pgNguon, "staff_profiles", [
      "id", "full_name", "email", "phone", "role", "role_id", "is_active",
    ]);
    const staffDich = await docBang(pgDich, "staff_profiles", ["id"]);
    const idDichCoSan = new Set(staffDich.map((r) => r.id));
    const staffChuaCo = staffNguon.filter((s) => !idDichCoSan.has(s.id));
    const staffDaCo = staffNguon.filter((s) => idDichCoSan.has(s.id));

    const branchesNguonOfStaff = await docBang(pgNguon, "staff_branches", ["staff_id", "branch_id", "is_primary"]);

    // --- in tổng kết AN TOÀN: chỉ id + khoá tự nhiên, không tên/SĐT/bí mật --
    const inNhom = (tenBang, dt, hienThi) => {
      console.log(`\n${tenBang}:`);
      console.log(`  giữ nguyên : ${dt.khongDoi.length}`);
      console.log(`  sẽ thêm    : ${dt.themMoi.length}`);
      for (const r of dt.themMoi) console.log(`    + ${hienThi(r)}`);
      console.log(`  sẽ sửa     : ${dt.capNhat.length}`);
      for (const c of dt.capNhat) console.log(`    ~ ${hienThi(c.nguon)} (đổi: ${c.cotKhac.join(", ")})`);
      if (dt.xoaODich.length) {
        console.log(`  CHỈ CÓ Ở ĐÍCH, không còn ở nguồn (KHÔNG tự xoá) : ${dt.xoaODich.length}`);
        for (const r of dt.xoaODich) console.log(`    ? ${hienThi(r)}`);
      }
    };

    inNhom("branches", dtBranches, (r) => `${r.id} ${r.code}`);
    inNhom("packages", dtPackages, (r) => `${r.id} ${r.code}`);
    inNhom("roles (tự tạo)", dtRoles, (r) => `${r.id} ${r.name}`);
    inNhom(
      "settings",
      dtSettings,
      (r) => `${r.id ?? "(mới)"} ${r.key}${KHOA_SETTINGS_BI_MAT.has(r.key) ? " = " + cheBot(r.value) : ""}`,
    );

    console.log(`\nstaff_profiles:`);
    console.log(`  đã có ở đích (id khớp) : ${staffDaCo.length}`);
    console.log(`  sẽ tạo mới             : ${staffChuaCo.length}`);
    for (const s of staffChuaCo) console.log(`    + ${s.id}`); // KHÔNG in tên/email/SĐT

    const tongKetTheoBang = {
      branches: { themMoi: dtBranches.themMoi.length, capNhat: dtBranches.capNhat.length },
      packages: { themMoi: dtPackages.themMoi.length, capNhat: dtPackages.capNhat.length },
      roles: { themMoi: dtRoles.themMoi.length, capNhat: dtRoles.capNhat.length },
      settings: { themMoi: dtSettings.themMoi.length, capNhat: dtSettings.capNhat.length },
      staff_profiles: { themMoi: staffChuaCo.length, capNhat: 0 },
    };
    const maDung = taoMaXacNhanChep(tongKetTheoBang, ngayHomNay());
    console.log(`\nMã xác nhận cho --ghi hôm nay: ${maDung}`);

    if (!ghiThat) {
      console.log("\nChế độ CHỈ XEM — chưa ghi gì. Muốn ghi thật: thêm --ghi --xac-nhan <mã trên> --that-su-la-bb-prod (nếu đích là bb-prod).");
      return;
    }

    // --- từ đây là ghi thật --------------------------------------------------
    const ktBbProd = kiemTraCoBbProd(dbUrlDich, coBbProd);
    if (!ktBbProd.choPhep) {
      console.error(ktBbProd.ly_do);
      process.exit(2);
    }
    if (!maNhapVao || maNhapVao.toUpperCase() !== maDung) {
      console.error(
        "Mã xác nhận không khớp. Số dòng sẽ thêm/sửa có thể đã đổi từ lúc in " +
          "mã (ai đó vừa sửa cấu hình), hoặc mã gõ sai. Chạy lại KHÔNG có --ghi " +
          "để lấy mã mới.",
      );
      process.exit(2);
    }

    console.log("\nSao lưu ĐÍCH trước khi ghi…");
    const r = spawnSync(process.execPath, [path.join(GOC_REPO, "scripts", "backup.mjs")], {
      stdio: "inherit",
      env: { ...process.env, SUPABASE_DB_URL: dbUrlDich },
    });
    if (r.status !== 0) {
      console.error("Sao lưu ĐÍCH không xong. Dừng — không ghi cấu hình khi chưa có đường lùi.");
      process.exit(1);
    }

    const upsertTheoKhoa = async (client, bang, cotKhoa, giaTriKhoa, cotGhi, dong) => {
      const coDieuKien = cotKhoa.map((c, i) => `"${c}" = $${i + 1}`).join(" and ");
      const { rows } = await client.query(`select id from "${bang}" where ${coDieuKien}`, giaTriKhoa);
      if (rows.length > 0) {
        const set = cotGhi.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
        await client.query(`update "${bang}" set ${set} where id = $${cotGhi.length + 1}`, [
          ...cotGhi.map((c) => dong[c]),
          rows[0].id,
        ]);
        return { hanhDong: "sua", id: rows[0].id };
      }
      const cotChen = ["id", ...cotGhi];
      const giuCho = cotChen.map((_, i) => `$${i + 1}`).join(", ");
      await client.query(
        `insert into "${bang}" (${cotChen.map((c) => `"${c}"`).join(", ")}) values (${giuCho})`,
        cotChen.map((c) => dong[c]),
      );
      return { hanhDong: "them", id: dong.id };
    };

    console.log("\nGhi branches…");
    for (const b of [...dtBranches.themMoi, ...dtBranches.capNhat.map((c) => c.nguon)]) {
      await upsertTheoKhoa(pgDich, "branches", ["code"], [b.code], [
        "code", "name", "address", "hotline", "zalo_oa", "logo_url", "timezone", "is_active", "settings",
      ], b);
    }
    // branches vừa ghi xong -> đọc lại để bản đồ id có cả dòng vừa chèn mới.
    const branchesDichSau = await docBang(pgDich, "branches", ["id", "code"]);
    const banDoBranchSau = xayBanDoBranch(branchesNguon, branchesDichSau);

    console.log("Ghi packages…");
    for (const pTho of [...dtPackages.themMoi, ...dtPackages.capNhat.map((c) => c.nguon)]) {
      const p = { ...pTho, branch_id: nanBranchId(banDoBranchSau, pTho.branch_id) };
      const dkKhoa = p.branch_id
        ? { sql: '"branch_id" = $1 and "code" = $2', gia: [p.branch_id, p.code] }
        : { sql: '"branch_id" is null and "code" = $1', gia: [p.code] };
      const { rows } = await pgDich.query(`select id from "packages" where ${dkKhoa.sql}`, dkKhoa.gia);
      const cotGhi = ["branch_id", "code", "name", "description", "price", "included_quota", "extra_photo_price", "printed_photo_count", "is_active"];
      if (rows.length > 0) {
        const set = cotGhi.map((c, i) => `"${c}" = $${i + 1}`).join(", ");
        await pgDich.query(`update "packages" set ${set} where id = $${cotGhi.length + 1}`, [...cotGhi.map((c) => p[c]), rows[0].id]);
      } else {
        const cotChen = ["id", ...cotGhi];
        await pgDich.query(
          `insert into "packages" (${cotChen.map((c) => `"${c}"`).join(", ")}) values (${cotChen.map((_, i) => `$${i + 1}`).join(", ")})`,
          cotChen.map((c) => p[c]),
        );
      }
    }

    console.log("Ghi roles (tự tạo)…");
    for (const rr of [...dtRoles.themMoi, ...dtRoles.capNhat.map((c) => c.nguon)]) {
      await upsertTheoKhoa(pgDich, "roles", ["name"], [rr.name], ["name", "permissions", "is_system"], rr);
    }

    console.log("Ghi settings…");
    for (const sTho of [...dtSettings.themMoi, ...dtSettings.capNhat.map((c) => c.nguon)]) {
      const s = { ...sTho, branch_id: nanBranchId(banDoBranchSau, sTho.branch_id) };
      const dkKhoa = s.branch_id
        ? { sql: '"branch_id" = $1 and "key" = $2', gia: [s.branch_id, s.key] }
        : { sql: '"branch_id" is null and "key" = $1', gia: [s.key] };
      const { rows } = await pgDich.query(`select id from "settings" where ${dkKhoa.sql}`, dkKhoa.gia);
      if (rows.length > 0) {
        await pgDich.query(`update "settings" set "value" = $1 where id = $2`, [s.value, rows[0].id]);
      } else {
        await pgDich.query(`insert into "settings" ("id", "key", "branch_id", "value") values ($1, $2, $3, $4)`, [
          s.id, s.key, s.branch_id, s.value,
        ]);
      }
    }

    console.log("Tạo tài khoản nhân sự mới ở đích (Admin API — không chép mật khẩu)…");
    const adminDich = taoAdminAuth(bienDich, "đích");
    let daTao = 0;
    let boQua = 0;
    for (const s of staffChuaCo) {
      const { data, error } = await adminDich.auth.admin.createUser({
        id: s.id,
        email: s.email,
        password: matKhauNgauNhienKhongLuu(),
        email_confirm: true,
        user_metadata: { full_name: s.full_name },
      });
      if (error || !data?.user) {
        console.error(`  BỎ QUA ${s.id}: không tạo được tài khoản đăng nhập (${error?.message ?? "?"}). Có thể email đã tồn tại dưới một id khác — kiểm tay.`);
        boQua += 1;
        continue;
      }
      const { error: loiProfile } = await pgDich.query(
        `insert into staff_profiles (id, full_name, email, phone, role, role_id, is_active)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (id) do update set full_name = excluded.full_name, phone = excluded.phone,
           role = excluded.role, role_id = excluded.role_id, is_active = excluded.is_active`,
        [s.id, s.full_name, s.email, s.phone, s.role, s.role_id, s.is_active],
      ).then(
        () => ({ error: null }),
        (e) => ({ error: e }),
      );
      if (loiProfile) {
        console.error(`  Tạo auth OK nhưng ghi staff_profiles hỏng cho ${s.id}: ${loiProfile.message}`);
        continue;
      }
      const chiNhanh = branchesNguonOfStaff.filter((b) => b.staff_id === s.id);
      for (const cn of chiNhanh) {
        const branchIdDich = nanBranchId(banDoBranchSau, cn.branch_id);
        await pgDich.query(
          `insert into staff_branches (staff_id, branch_id, is_primary) values ($1, $2, $3)
           on conflict (staff_id, branch_id) do update set is_primary = excluded.is_primary`,
          [s.id, branchIdDich, cn.is_primary],
        );
      }
      daTao += 1;
    }

    console.log("Cập nhật hồ sơ (không đổi mật khẩu) cho nhân sự ĐÃ có ở đích…");
    for (const s of staffDaCo) {
      await pgDich.query(
        `update staff_profiles set full_name = $2, phone = $3, role = $4, role_id = $5, is_active = $6 where id = $1`,
        [s.id, s.full_name, s.phone, s.role, s.role_id, s.is_active],
      );
    }

    console.log(`\nXong. Tạo mới: ${daTao} nhân sự (bỏ qua ${boQua}). Cập nhật ${staffDaCo.length} hồ sơ đã có.`);
    console.log(
      "\nMỗi nhân sự vừa TẠO MỚI có mật khẩu ngẫu nhiên KHÔNG AI BIẾT — phải " +
        "đặt lại qua màn Nhân sự (Đặt lại mật khẩu) trước khi họ đăng nhập được.",
    );
  } finally {
    await pgNguon.end();
    await pgDich.end();
  }
}

const chayTrucTiep = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (chayTrucTiep) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
