#!/usr/bin/env node
/**
 * Đồng bộ bảng Hậu Kỳ từ Lark xuống galleries + customers.
 * OWNER: DEV-INT. Task BB-111.
 *
 * MỘT CHIỀU. Không bao giờ ghi ngược lên Lark. Nhân viên dán tay link app vào
 * cột "Link app" bên Lark — xem docs/16 mục 2, dán tay là cố ý.
 *
 * Chạy:  npm run sync:hauky            xem trước, không ghi gì
 *        npm run sync:hauky -- --write ghi thật
 *        npm run sync:hauky -- --limit 20   chỉ lấy 20 bộ đầu, để thử
 *
 * ---------------------------------------------------------------------------
 * Album neo vào BẢN GHI HẬU KỲ, không neo vào mã hợp đồng
 * ---------------------------------------------------------------------------
 * Đếm trên nhóm sắp đẩy: 11 mã hợp đồng xuất hiện ở HAI bản ghi Hậu Kỳ khác
 * nhau. Một hợp đồng có thể có nhiều buổi chụp, nhiều bé, nhiều lần hậu kỳ.
 *
 * Neo theo mã hợp đồng thì 11 mã đó thành 22 album, và vì sync-lark-contracts
 * kéo dòng hàng theo lark_contract_code, MỖI album nhận ĐỦ dòng hàng của hợp
 * đồng — hạn mức đếm hai lần, studio cho không gấp đôi số ảnh, không gì báo lỗi.
 *
 * Nên khoá định danh là galleries.lark_hauky_record_id (0027).
 *
 * ---------------------------------------------------------------------------
 * Che dữ liệu cá nhân — docs/16 mục 7.3
 * ---------------------------------------------------------------------------
 * bb-dev dùng chung với mọi agent, test xoá dòng trong đó, và repo CÔNG KHAI.
 * Đợt này che tên và số điện thoại; mở lại khi có bb-prod.
 *
 * BA Ô MANG TÊN KHÁCH, cả ba đều dễ vô tình kéo vào:
 *   "Tên KH"              tên thẳng
 *   "Mã KH"               gộp cả tên lẫn số điện thoại vào một chuỗi
 *   "Link ảnh gửi khách"  ô URL, nhãn text là tên thư mục kiểu "LIA - ZAC"
 *   "Chat với khách"      ô URL, nhãn text là tên khách
 *
 * Hai ô cuối phải đọc bằng cellLink() chứ KHÔNG phải cellText(): cellText đọc
 * `text` trước `link` nên sẽ trả về đúng cái tên vừa mất công che.
 */

import pg from "pg";

const HOST = "https://open.larksuite.com/open-apis";

/**
 * Trạng thái đã qua khâu in — không đẩy lên.
 * Chủ studio chốt ngày 12.09.2026, xem docs/16 mục 7.1.
 */
const SKIP_STATUSES = [
  "Đã chốt chưa in",
  "Đã gửi In",
  "Hình đã về",
  "Đã Giao",
  "Đã CSKH",
];

/**
 * Tên chi nhánh bên Lark sang tên trong app.
 *
 * KHÔNG đoán. Xếp khách nhầm chi nhánh là quản lý chi nhánh kia nhìn thấy dữ
 * liệu không phải của mình, và RLS theo chi nhánh trở thành vô nghĩa. Gặp giá
 * trị lạ thì script dừng và in ra để người chạy bổ sung.
 */
const BRANCH_MAP = {
  Pasteur: "Baby Bean Pasteur",
  "Thảo Điền": "Baby Bean Thảo Điền",

  // Lark viết tắt NTB; chủ studio xác nhận ngày 12.09.2026 đó là Tân Bình.
  //
  // Giữ tên đầy đủ ở phía app, không đổi thành "NTB": khách nhìn thấy tên chi
  // nhánh trên trang chọn ảnh, và "NTB" là chữ viết tắt nội bộ.
  NTB: "Baby Bean Tân Bình",
};

const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Thiếu biến môi trường ${name}. Kiểm tra .env.local.`);
    process.exit(1);
  }
  return v;
};

// --- đọc Lark ---------------------------------------------------------------

async function larkAuth() {
  const res = await fetch(`${HOST}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      app_id: need("LARK_APP_ID"),
      app_secret: need("LARK_APP_SECRET"),
    }),
  });
  const json = await res.json();
  if (!json.tenant_access_token) throw new Error(`Lark từ chối cấp token: ${json.msg}`);
  return { authorization: `Bearer ${json.tenant_access_token}` };
}

/** Đọc hết một bảng, tìm theo tên. Lark trả 500 dòng một lần, phải lặp. */
async function readTable(auth, baseToken, namePattern) {
  const list = await (
    await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables?page_size=100`, { headers: auth })
  ).json();
  if (list.code !== 0) throw new Error(`Không liệt kê được bảng: ${list.msg}`);

  const table = list.data.items.find((t) => namePattern.test(t.name));
  if (!table) {
    throw new Error(
      `Không tìm thấy bảng khớp ${namePattern}. Các bảng hiện có: ` +
        list.data.items.map((t) => t.name).join(" | "),
    );
  }

  const rows = [];
  let pageToken = "";
  do {
    const url =
      `${HOST}/bitable/v1/apps/${baseToken}/tables/${table.table_id}/records?page_size=500` +
      (pageToken ? `&page_token=${pageToken}` : "");
    const page = await (await fetch(url, { headers: auth })).json();
    if (page.code !== 0) throw new Error(`Lỗi đọc ${table.name}: ${page.msg}`);
    rows.push(...(page.data.items ?? []));
    pageToken = page.data.has_more ? page.data.page_token : "";
  } while (pageToken);

  return rows;
}

/** Ô của Lark có tám hình dạng tuỳ kiểu cột, kể cả ô điện thoại {fullPhoneNum}. */
function cellText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v == null ? "" : typeof v === "object" ? (v.text ?? v.name ?? v.fullPhoneNum ?? "") : String(v),
      )
      .join("");
  }
  if (typeof value === "object") return value.text ?? value.name ?? value.fullPhoneNum ?? "";
  return String(value);
}

/**
 * Địa chỉ của ô kiểu URL. DÙNG HÀM NÀY, ĐỪNG DÙNG cellText cho ô URL.
 *
 * Ô URL của Lark là { link, text } và `text` là nhãn do nhân viên gõ — với hai
 * ô ta dùng thì nhãn đó chính là TÊN KHÁCH. cellText đọc `text` trước `link`.
 */
function cellLink(value) {
  if (value == null) return "";
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || typeof first !== "object") return "";
  return first.link ?? "";
}

/**
 * Mã thư mục Drive, từ BA dạng link mà nhân viên đã dán vào Lark.
 *
 * Bản đầu chỉ nhận dạng /folders/<id> và bỏ sót 25/447 bộ. Ba dạng thật:
 *
 *   drive.google.com/drive/folders/<id>?usp=sharing   dạng hiện nay
 *   drive.google.com/open?id=<id>                     dạng chia sẻ cũ
 *   l.facebook.com/l.php?u=<link Drive đã mã hoá>     Facebook bọc lại khi
 *                                                     nhân viên copy từ chat
 *
 * Dạng thứ ba phải giải mã URL rồi bóc tiếp, nếu không sẽ mất hẳn.
 *
 * Trả chuỗi rỗng khi không phải link Drive — có bộ dán nhầm link hộp thư
 * Facebook vào ô ảnh. Trả rỗng để chỗ gọi BÁO RA, đừng đoán bừa một mã.
 */
function driveFolderId(url) {
  let u = String(url ?? "");

  // Facebook bọc link thật trong tham số u= và mã hoá nó.
  const wrapped = u.match(/[?&]u=([^&]+)/);
  if (wrapped) {
    try {
      u = decodeURIComponent(wrapped[1]);
    } catch {
      // Chuỗi mã hoá hỏng thì dùng nguyên bản, vẫn hơn là ném lỗi.
    }
  }

  const folders = u.match(/\/folders\/([A-Za-z0-9_-]+)/);
  if (folders) return folders[1];

  const openId = u.match(/[?&]id=([A-Za-z0-9_-]+)/);
  if (openId) return openId[1];

  return "";
}

// --- chạy -------------------------------------------------------------------

async function main() {
  const write = process.argv.includes("--write");
  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(process.argv[limitIdx + 1]) : 0;

  const baseToken = need("LARK_BASE_APP_TOKEN");
  const dbUrl = need("SUPABASE_DB_URL");

  if (/prod/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
    console.error("Đang trỏ vào production. Đợt này chỉ chạy trên bb-dev.");
    process.exit(1);
  }

  const auth = await larkAuth();
  const hauky = await readTable(auth, baseToken, /h[aậ]u k[yỳ]/i);
  const invoiceLines = await readTable(auth, baseToken, /h[oó]a đơn chi ti[eế]t/i);
  console.log(`Lark: ${hauky.length} bản ghi hậu kỳ, ${invoiceLines.length} dòng hợp đồng.`);

  // Chi nhánh lấy từ dòng hợp đồng: cột Chi Nhánh bên Hậu Kỳ là ô tra cứu, trả
  // về mã lựa chọn chứ không trả tên đọc được.
  const branchByContract = new Map();
  for (const line of invoiceLines) {
    const code = cellText(line.fields["Hóa Đơn"]).trim();
    const branch = cellText(line.fields["Chi Nhánh"]).trim();
    if (code && branch && !branchByContract.has(code)) branchByContract.set(code, branch);
  }

  let candidates = hauky.filter(
    (r) =>
      !SKIP_STATUSES.includes(cellText(r.fields["Trạng Thái"]).trim()) &&
      cellLink(r.fields["Link ảnh gửi khách"]),
  );
  console.log(`Sau khi loại ${SKIP_STATUSES.length} trạng thái đã qua in: ${candidates.length} bộ.`);
  if (limit > 0) {
    candidates = candidates.slice(0, limit);
    console.log(`--limit ${limit}: chỉ xử lý ${candidates.length} bộ đầu.`);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const { rows: branchRows } = await client.query("select id, name from branches");
    const branchIdByName = new Map(branchRows.map((b) => [b.name, b.id]));

    // Gom theo THƯ MỤC DRIVE, không gom theo bản ghi hậu kỳ.
    //
    // Khách nhìn thấy một thư mục ảnh, nên một thư mục là một album và một lần
    // chọn ảnh. Chủ studio xác nhận ngày 12.09.2026: HD_...#3556 và #3557 là
    // MỘT nhà, MỘT buổi chụp, hai gói chụp khác nhau nên lập hai hóa đơn.
    //
    // Tách chúng thành hai album là chia đôi hạn mức của chính khách đó: họ
    // mua 15 + 15 ảnh nhưng mỗi màn hình chỉ cho chọn 15, và ảnh thì trùng
    // nhau vì cùng một thư mục.
    //
    // Bộ nào không bóc được mã thư mục thì lấy mã bản ghi hậu kỳ làm khoá —
    // mỗi bộ một album, không gom nhầm với ai.
    const byFolder = new Map();
    const unmappedBranches = new Map();
    const noContract = [];

    for (const rec of candidates) {
      const f = rec.fields;
      const contractCode = cellText(f["HĐ Tổng"]).trim();
      const larkBranch = branchByContract.get(contractCode) ?? "";
      const appBranch = BRANCH_MAP[larkBranch];
      const branchId = appBranch ? branchIdByName.get(appBranch) : undefined;
      const haukyId = cellText(f["record ID"]).trim() || rec.record_id;

      if (!contractCode) {
        noContract.push(haukyId);
        continue;
      }
      if (!branchId) {
        const key = larkBranch || "(trống)";
        unmappedBranches.set(key, (unmappedBranches.get(key) ?? 0) + 1);
        continue;
      }

      const photoUrl = cellLink(f["Link ảnh gửi khách"]);
      const folderId = driveFolderId(photoUrl);
      const key = folderId || `hauky:${haukyId}`;

      const existing = byFolder.get(key);
      if (existing) {
        // Cùng thư mục: thêm hợp đồng vào album đã có, đừng tạo album thứ hai.
        if (!existing.contractCodes.includes(contractCode)) {
          existing.contractCodes.push(contractCode);
        }
        existing.haukyIds.push(haukyId);
        continue;
      }

      byFolder.set(key, {
        haukyId,
        haukyIds: [haukyId],
        contractCodes: [contractCode],
        branchId,
        // Che: KHÔNG lấy "Tên KH", KHÔNG lấy nhãn text của ô link (là tên thư
        // mục kiểu "LIA - ZAC"). Mã hợp đồng vừa duy nhất vừa tra được bên Lark.
        chatUrl: cellLink(f["Chat với khách"]) || null,
        driveUrl: photoUrl,
        driveFolderId: folderId,
        folderKey: key,
        larkStatus: cellText(f["Trạng Thái"]).trim(),
      });
    }

    const plan = [...byFolder.values()].map((g) => ({
      ...g,
      contractCode: g.contractCodes[0],
      customerName: `KH · ${g.contractCodes[0]}`,
    }));

    console.log(`\nDựng được ${plan.length} album từ ${candidates.length} bản ghi hậu kỳ.`);
    if (noContract.length) console.log(`  ${noContract.length} bộ không có mã hợp đồng — bỏ qua.`);
    if (unmappedBranches.size) {
      console.log(`  BỎ QUA vì chi nhánh chưa có trong BRANCH_MAP:`);
      for (const [name, n] of unmappedBranches) console.log(`     "${name}" — ${n} bộ`);
      console.log(`  Bổ sung vào BRANCH_MAP trong scripts/sync-lark-hauky.mjs rồi chạy lại.`);
    }

    // Album gom nhiều hợp đồng: in ra hết để nhân viên soát.
    //
    // Hai kiểu lẫn vào nhau và MÁY KHÔNG PHÂN BIỆT ĐƯỢC. Mã liên tiếp
    // (#3556 + #3557) thường là một nhà mua hai gói — gom là đúng. Mã cách xa
    // nhau thường là nhân viên dán nhầm link, và chủ studio đã xác nhận
    // #4487 với #4515 đúng là dán nhầm. Gom nhầm hai nhà là khách này nhìn
    // thấy ảnh con nhà kia, nên phải có người nhìn danh sách này.
    const merged = plan.filter((p) => p.contractCodes.length > 1);
    if (merged.length) {
      console.log(`\n  ${merged.length} album gom nhiều hợp đồng — NHỜ NHÂN VIÊN SOÁT:`);
      for (const m of merged) {
        const nums = m.contractCodes.map((c) => Number(c.split("#")[1]) || 0);
        const consecutive =
          nums.length === 2 && Math.abs(nums[0] - nums[1]) === 1 ? "liên tiếp, có vẻ cùng nhà" : "CÁCH XA NHAU, kiểm kỹ";
        console.log(`     ${m.contractCodes.join(" + ")}   (${consecutive})`);
      }
    }

    const noFolder = plan.filter((p) => !p.driveFolderId).length;
    if (noFolder) console.log(`\n  ${noFolder} bộ không bóc được mã thư mục Drive — mỗi bộ một album riêng.`);

    const byStatus = plan.reduce((acc, p) => ({ ...acc, [p.larkStatus]: (acc[p.larkStatus] ?? 0) + 1 }), {});
    console.log("  Theo trạng thái:", byStatus);

    if (!write) {
      console.log("\nXem trước, chưa ghi gì. Thêm -- --write để ghi thật.");
      console.log("Ví dụ ba album đầu:");
      for (const p of plan.slice(0, 3)) {
        console.log(`   ${p.customerName}  |  thư mục ${p.driveFolderId || "(không bóc được)"}`);
      }
      return;
    }

    let created = 0;
    let updated = 0;
    for (const p of plan) {
      await client.query("begin");
      try {
        // Khách: một khách cho mỗi hợp đồng, tên đã che.
        const { rows: cust } = await client.query(
          `insert into customers (branch_id, full_name, facebook)
           values ($1, $2, $3)
           on conflict do nothing
           returning id`,
          [p.branchId, p.customerName, p.chatUrl],
        );
        let customerId = cust[0]?.id;
        if (!customerId) {
          const { rows } = await client.query(
            `select id from customers where full_name = $1 limit 1`,
            [p.customerName],
          );
          customerId = rows[0]?.id;
        }

        // Album neo vào THƯ MỤC DRIVE — đó là thứ khách nhìn thấy, và là khoá
        // định danh sau 0028. Bộ nào không bóc được mã thư mục thì lấy mã bản
        // ghi hậu kỳ làm khoá, mỗi bộ một album riêng.
        const { rows: gal } = await client.query(
          `insert into galleries
             (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
              lark_contract_code, lark_contract_codes, lark_hauky_record_id)
           values ($1,$2,$3,'draft',$4,$5,$6,$7,$8)
           -- uq_galleries_drive_folder là chỉ số duy nhất CÓ ĐIỀU KIỆN
           -- (where status <> archived). ON CONFLICT phải khai lại đúng điều
           -- kiện đó, nếu không Postgres báo "no unique or exclusion constraint
           -- matching" và không ai đoán ra vì tên chỉ số vẫn tồn tại.
           on conflict (drive_folder_id) where status <> 'archived'
           do update set
             drive_folder_url     = excluded.drive_folder_url,
             lark_contract_code   = excluded.lark_contract_code,
             lark_contract_codes  = excluded.lark_contract_codes,
             lark_hauky_record_id = excluded.lark_hauky_record_id,
             updated_at = now()
           returning (xmax = 0) as inserted`,
          [
            p.branchId, customerId, p.customerName, p.driveFolderId || p.haukyId,
            p.driveUrl, p.contractCode, p.contractCodes, p.haukyId,
          ],
        );
        if (gal[0]?.inserted) created += 1;
        else updated += 1;
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        console.log(`   LỖI ở ${p.customerName}, đã hoàn tác bộ này: ${err.message}`);
      }
    }
    console.log(`\nĐã ghi: ${created} album mới, ${updated} album cập nhật.`);
    console.log("Bước tiếp theo: npm run sync:contracts -- --write để kéo dòng hàng.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
