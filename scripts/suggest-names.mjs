#!/usr/bin/env node
/**
 * Đọc tên thư mục từ ô "Link ảnh gửi khách" bảng Hậu Kỳ trên Lark Base,
 * chạy qua parseFolderName() và in kết quả xem trước cho nhân viên soát.
 *
 * OWNER: DEV-INT. Task BB-097.
 *
 * CHỈ IN RA MÀN HÌNH, TUYỆT ĐỐI KHÔNG GHI VÀO bb-dev.
 * Lý do: docs/16 mục 7.3 quy định che thông tin cá nhân trong môi trường dev/public.
 *
 * Chạy: npm run suggest:names
 */

import { parseFolderName } from "../src/lib/drive/parse-folder-name.ts";

const HOST = "https://open.larksuite.com/open-apis";

const need = (name) => {
  const v = process.env[name];
  if (!v) {
    console.error(`Thiếu biến môi trường ${name}. Kiểm tra .env.local.`);
    process.exit(1);
  }
  return v;
};

// --- Đọc Lark ---------------------------------------------------------------

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

/**
 * Đọc toàn bộ bản ghi của bảng tìm theo regex tên bảng.
 * Có xử lý phân trang has_more / page_token.
 */
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

  return { table, rows };
}

/**
 * Ô của Lark có tám hình dạng tuỳ kiểu cột, kể cả ô điện thoại trả
 * {fullPhoneNum}. Bẫy đọc Lark: cellText đọc v.text trước v.link.
 */
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

function getField(fields, pattern) {
  if (!fields || typeof fields !== "object") return undefined;
  for (const key of Object.keys(fields)) {
    if (pattern.test(key)) return fields[key];
  }
  return undefined;
}

// --- Main -------------------------------------------------------------------

async function main() {
  const baseToken = need("LARK_BASE_APP_TOKEN");
  console.log("Đang xác thực với Lark...");
  const auth = await larkAuth();

  console.log("Đang đọc bảng Hậu Kỳ từ Lark Base...");
  const { table, rows } = await readTable(auth, baseToken, /hậu\s*kỳ|hau\s*ky/i);
  console.log(`Đã đọc ${rows.length} bản ghi từ bảng "${table.name}".\n`);

  console.log("=== KẾT QUẢ GỢI Ý TÊN MẸ VÀ TÊN BÉ TỪ TÊN THƯ MỤC DRIVE (BB-097) ===\n");
  console.log("STT | Mã HĐ | Tên thư mục (gốc) | Tên Mẹ | Tên Bé | Ghi chú");
  console.log("-".repeat(80));

  let countWithLink = 0;
  let countBoth = 0;
  let countGuessed = 0;
  let countBabyOnly = 0;

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i].fields;
    const linkField =
      getField(f, /link\s*(ảnh|anh)\s*(gửi\s*khách|gui\s*khach)?/i) ??
      getField(f, /link\s*(ảnh|anh)/i) ??
      getField(f, /link.*drive/i);

    // Bẫy 1: cellText(linkField) sẽ lấy text hiển thị của ô URL, chính là tên thư mục.
    const folderName = cellText(linkField).trim();
    if (!folderName) continue;

    countWithLink++;
    const contractCode = cellText(getField(f, /hợp\s*đồng|mã\s*hợp\s*đồng|hóa\s*đơn|contract/i)).trim() || "—";
    const parsed = parseFolderName(folderName);

    let note = "";
    if (parsed.isGuessed) {
      note = "[Đoán: không có ngoặc]";
      countGuessed++;
    } else if (!parsed.motherName && parsed.babyName) {
      note = "[Chỉ có tên bé]";
      countBabyOnly++;
    } else if (parsed.motherName && parsed.babyName) {
      note = "[Đủ mẹ và bé]";
      countBoth++;
    }

    console.log(
      `${String(countWithLink).padStart(4)} | ${contractCode.padEnd(16)} | ${folderName.padEnd(28)} | ` +
      `Mẹ: "${parsed.motherName}" | Bé: "${parsed.babyName}" ${note}`
    );
  }

  console.log("-".repeat(80));
  console.log(`\nTổng kết:`);
  console.log(`- Tổng bản ghi Hậu Kỳ: ${rows.length}`);
  console.log(`- Bản ghi có tên thư mục: ${countWithLink}`);
  console.log(`  + Đủ cả mẹ và bé: ${countBoth}`);
  console.log(`  + Đoán (toàn bộ là tên mẹ, không có ngoặc): ${countGuessed}`);
  console.log(`  + Chỉ có tên bé trong ngoặc: ${countBabyOnly}`);
  console.log("\n[LƯU Ý]: Đây là bản xem trước, KHÔNG ghi vào cơ sở dữ liệu bb-dev.\n");
}

main().catch((err) => {
  console.error("Lỗi khi chạy suggest:names:", err.message);
  process.exit(1);
});
