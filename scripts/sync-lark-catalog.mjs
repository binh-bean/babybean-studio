#!/usr/bin/env node
/**
 * Đồng bộ danh mục sản phẩm từ Lark xuống bảng products.
 * OWNER: DEV-INT. Task BB-100.
 *
 * MỘT CHIỀU. Lark là nguồn sự thật của danh mục; script này không bao giờ ghi
 * ngược lên Lark.
 *
 * Chạy:  npm run sync:catalog          xem trước, không ghi gì
 *        npm run sync:catalog -- --write   ghi thật
 *
 * ---------------------------------------------------------------------------
 * Vì sao phải suy ra giá
 * ---------------------------------------------------------------------------
 * Bảng danh mục bên Lark có 6 cột và KHÔNG cột nào là giá. Giá chỉ tồn tại
 * trên từng dòng hóa đơn đã bán. Nên đơn giá niêm yết ở đây là giá QUAN SÁT
 * ĐƯỢC: mức xuất hiện nhiều nhất trong lịch sử.
 *
 * Đã kiểm trên 11.163 dòng có đủ hai cột: "Thành Tiền niêm yết" luôn bằng
 * "Giá niêm yết" nhân "Số Lượng". Nên "Giá niêm yết" là ĐƠN GIÁ, không phải
 * tiền cả dòng. Đừng chia nó cho số lượng — PM đã mắc đúng lỗi này một lần và
 * suýt kết luận nhầm là studio bán phá giá.
 *
 * Kèm theo mỗi giá là price_confidence và price_samples, vì "1.393 lần cùng
 * một giá" và "15 lần rải ra 12 mức" là hai chuyện khác hẳn nhau. Giao diện
 * chỉ được báo giá cho khách khi đủ chắc.
 *
 * ---------------------------------------------------------------------------
 * Không có định danh Lark nào trong file này
 * ---------------------------------------------------------------------------
 * Repo công khai. Bảng được tìm theo TÊN lúc chạy, không hardcode table_id.
 * app_token nằm trong biến môi trường, không nằm trong mã nguồn.
 */

import pg from "pg";

const HOST = "https://open.larksuite.com/open-apis";

const need = (n) => {
  const v = process.env[n];
  if (!v) {
    console.error(`Thiếu biến môi trường ${n}. Kiểm tra .env.local.`);
    process.exit(1);
  }
  return v;
};

// --- đọc Lark ---------------------------------------------------------------

async function larkToken() {
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
  return json.tenant_access_token;
}

/**
 * Đọc hết một bảng, tìm theo tên.
 *
 * Lark trả tối đa 500 bản ghi một lần và KHÔNG báo lỗi khi hết trang — nó chỉ
 * trả has_more = false. Quên vòng lặp là mất dữ liệu trong im lặng.
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

  return { name: table.name, rows };
}

/**
 * Ô của Lark có bảy hình dạng khác nhau tùy kiểu cột: chuỗi, số, mảng chuỗi,
 * mảng {text}, mảng {name}, object {name}, object {text}. Một hàm cho tất cả,
 * vì đoán sai kiểu thì ra chuỗi "[object Object]" và không ai nhận ra.
 */
function cellText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v == null
          ? ""
          : typeof v === "object"
            ? (v.text ?? v.name ?? "")
            : String(v),
      )
      .join("");
  }
  if (typeof value === "object") return value.text ?? value.name ?? "";
  return String(value);
}

function cellNumber(value) {
  return Number(String(cellText(value)).replace(/[^\d]/g, "")) || 0;
}

// --- phân loại --------------------------------------------------------------

/**
 * Phân Loại Sản Xuất của Lark sang product_kind.
 *
 * "Edit file" nằm trong nhóm In Ấn cùng ảnh phóng, nhưng về nghiệp vụ nó là
 * hạn mức chọn ảnh chứ không phải hàng in. Tách riêng, và tách theo tên chính
 * xác chứ không theo chuỗi con: "Edit file Ảnh Phóng" là sản phẩm KHÁC.
 */
function classify(name, category) {
  if (/^edit file$/i.test(name.trim())) return "edited_photo";

  switch (category.trim()) {
    case "Chụp / Quay":
      return "shoot_package";
    case "In Ấn":
      return "print";
    case "Phát Sinh":
      return "addon";
    case "Makeup":
    case "Dịch vụ Hậu Kỳ":
      return "service";
    default:
      return null; // không đoán bừa — trả về null để người chạy tự quyết
  }
}

/** "Gỗ 40x60" -> { material: "Gỗ", size: "40x60" }. "Baby 02" -> không có gì. */
function splitName(name) {
  const m = name.trim().match(/^(.*?)\s*(\d{2,3}\s*[xX]\s*\d{2,3})$/);
  if (!m) return { material: null, size: null };
  const material = m[1].trim();
  const size = m[2].replace(/\s+/g, "").toLowerCase();
  return { material: material || null, size };
}

// --- giá quan sát được ------------------------------------------------------

/**
 * Mức giá hay gặp nhất cho từng tên sản phẩm, kèm độ tin cậy.
 *
 * Chỉ đếm dòng có giá > 0. Dòng giá 0 là hàng nằm trong gói, không phản ánh
 * giá niêm yết.
 */
function observedPrices(invoiceRows) {
  const tally = new Map();

  for (const row of invoiceRows) {
    const f = row.fields ?? {};
    const name = cellText(f["Chi Tiết SP / DV"]).trim();
    const price = cellNumber(f["Giá niêm yết"]);
    if (!name || !price) continue;

    if (!tally.has(name)) tally.set(name, new Map());
    const levels = tally.get(name);
    levels.set(price, (levels.get(price) ?? 0) + 1);
  }

  const out = new Map();
  for (const [name, levels] of tally) {
    const sorted = [...levels.entries()].sort((a, b) => b[1] - a[1]);
    const samples = sorted.reduce((sum, [, count]) => sum + count, 0);
    out.set(name, {
      price: sorted[0][0],
      confidence: Number((sorted[0][1] / samples).toFixed(3)),
      samples,
    });
  }
  return out;
}

// --- chạy -------------------------------------------------------------------

async function main() {
  const write = process.argv.includes("--write");
  const baseToken = need("LARK_BASE_APP_TOKEN");
  const dbUrl = need("SUPABASE_DB_URL");

  if (/prod/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
    console.error("Đang trỏ vào production. Script này chỉ chạy trên bb-dev.");
    process.exit(1);
  }

  const auth = { authorization: `Bearer ${await larkToken()}` };

  const catalog = await readTable(auth, baseToken, /s[aả]n ph[aẩ]m/i);
  const invoices = await readTable(auth, baseToken, /h[oó]a đơn chi ti[eế]t/i);
  console.log(`Đọc ${catalog.rows.length} sản phẩm, ${invoices.rows.length} dòng hóa đơn.`);

  const prices = observedPrices(invoices.rows);

  const items = [];
  const skipped = [];

  for (const row of catalog.rows) {
    const f = row.fields ?? {};
    const name = cellText(f["Tên SP/DV"]).trim();
    const category = cellText(f["Phân Loại Sản Xuất"]).trim();
    const recordId = cellText(f["Record ID"]).trim() || row.record_id;

    if (!name) {
      skipped.push({ name: "(tên trống)", why: "không có tên" });
      continue;
    }

    const kind = classify(name, category);
    if (!kind) {
      skipped.push({ name, why: `phân loại lạ: "${category || "trống"}"` });
      continue;
    }

    const { material, size } = splitName(name);
    const p = prices.get(name);

    items.push({
      name,
      kind,
      material,
      size,
      list_price: p?.price ?? null,
      price_confidence: p?.confidence ?? null,
      price_samples: p?.samples ?? 0,
      lark_category: category || null,
      lark_record_id: recordId,
      is_active: cellText(f["Trạng Thái Sử Dụng"]).trim() !== "Ngừng Kinh Doanh",
    });
  }

  const byKind = items.reduce((acc, i) => ({ ...acc, [i.kind]: (acc[i.kind] ?? 0) + 1 }), {});
  console.log("\nPhân loại:", byKind);
  console.log(`Đang kinh doanh: ${items.filter((i) => i.is_active).length}/${items.length}`);
  console.log(`Có giá quan sát được: ${items.filter((i) => i.list_price).length}/${items.length}`);

  if (skipped.length) {
    console.log("\nBỏ qua:");
    for (const s of skipped) console.log(`  ${s.name} — ${s.why}`);
  }

  if (!write) {
    console.log("\nXem trước, chưa ghi gì. Thêm -- --write để ghi thật.");
    return;
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("begin");
    for (const i of items) {
      // Khớp theo lark_record_id chứ không theo tên: nhân viên đổi tên hiển
      // thị bất cứ lúc nào, và đổi tên không phải là tạo sản phẩm mới.
      await client.query(
        `insert into products
           (name, kind, material, size, list_price, price_confidence,
            price_samples, lark_category, lark_record_id, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (lark_record_id) do update set
           name = excluded.name,
           kind = excluded.kind,
           material = excluded.material,
           size = excluded.size,
           list_price = excluded.list_price,
           price_confidence = excluded.price_confidence,
           price_samples = excluded.price_samples,
           lark_category = excluded.lark_category,
           is_active = excluded.is_active,
           updated_at = now()`,
        [
          i.name, i.kind, i.material, i.size, i.list_price,
          i.price_confidence, i.price_samples, i.lark_category,
          i.lark_record_id, i.is_active,
        ],
      );
    }
    await client.query("commit");
    const { rows } = await client.query("select count(*)::int as n from products");
    console.log(`\nĐã ghi. Bảng products hiện có ${rows[0].n} dòng.`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
