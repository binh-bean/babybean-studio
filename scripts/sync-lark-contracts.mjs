#!/usr/bin/env node
/**
 * Đồng bộ nội dung hợp đồng từ Lark xuống gallery_items.
 * OWNER: DEV-INT. Task BB-100.
 *
 * MỘT CHIỀU. Không bao giờ ghi ngược lên Lark.
 *
 * Chạy:  npm run sync:contracts                       xem trước tất cả
 *        npm run sync:contracts -- --contract HD_...  xem trước một hợp đồng
 *        npm run sync:contracts -- --write            ghi thật
 *
 * ---------------------------------------------------------------------------
 * Ba tầng của Lark, hai tầng dưới đi xuống một bảng
 * ---------------------------------------------------------------------------
 *   Hóa Đơn                     mã hợp đồng, ví dụ HD_20250722#572
 *     Hóa Đơn Chi Tiết          dòng hợp đồng: sản phẩm, số lượng, TIỀN
 *       Chi Tiết Gói Chụp       dòng đó gồm những gì, KHÔNG có tiền
 *
 * Khoá nối tầng giữa với tầng dưới:
 *   Chi Tiết Gói Chụp."Hợp đồng chi tiet liên quan"
 *     = Hóa Đơn Chi Tiết."Mã Hóa Đơn Chi Tiết"
 * Đã kiểm trên toàn bộ dữ liệu: 9.641/9.642 dòng nối được, đúng 100,0%.
 *
 * ---------------------------------------------------------------------------
 * Bốn cột tiền, đừng nhầm
 * ---------------------------------------------------------------------------
 *   Giá niêm yết         ĐƠN GIÁ một đơn vị
 *   Thành Tiền niêm yết  = Giá niêm yết x Số Lượng
 *   Giá sau giảm         TIỀN CẢ DÒNG sau chiết khấu
 *   Giá chốt cuối        TIỀN CẢ DÒNG chốt với khách
 *
 * Chia "Giá chốt cuối" cho số lượng để lấy đơn giá là sai: phép chia không
 * phải lúc nào cũng hết, và tổng hợp đồng dựng lại sẽ lệch vài nghìn so với
 * hóa đơn khách cầm. Ghi cả hai, xem 0023.
 *
 * ---------------------------------------------------------------------------
 * Không có định danh Lark nào trong file này
 * ---------------------------------------------------------------------------
 * Repo công khai. Bảng tìm theo TÊN lúc chạy. Mã hợp đồng đi vào từ
 * galleries.lark_contract_code do CSKH nhập, không hardcode ở đây.
 */

import pg from "pg";

const HOST = "https://open.larksuite.com/open-apis";

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

/**
 * Đọc hết một bảng, tìm theo tên.
 *
 * Lark trả tối đa 500 bản ghi một lần và không báo gì khi còn trang sau ngoài
 * cờ has_more. Quên vòng lặp là mất dữ liệu trong im lặng.
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

  return rows;
}

/** Ô của Lark có bảy hình dạng tuỳ kiểu cột. Một hàm cho tất cả. */
function cellText(value) {
  if (value == null) return "";
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v == null ? "" : typeof v === "object" ? (v.text ?? v.name ?? "") : String(v),
      )
      .join("");
  }
  if (typeof value === "object") return value.text ?? value.name ?? "";
  return String(value);
}

function cellNumber(value) {
  return Number(String(cellText(value)).replace(/[^\d]/g, "")) || 0;
}

/** Mã bản ghi mà một ô liên kết trỏ tới. Ô liên kết mới có, ô chữ thì không. */
function linkedRecordIds(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => (v && typeof v === "object" ? (v.record_ids ?? []) : []));
}

// --- dựng cây hợp đồng ------------------------------------------------------

/**
 * Từ mã hợp đồng ra danh sách dòng hàng hai tầng.
 *
 * Dòng cha mang tiền, dòng con không. Sản phẩm khớp theo MÃ BẢN GHI chứ không
 * theo tên: nhân viên đổi tên hiển thị bất cứ lúc nào, và "Edit file" với
 * "Edit file Ảnh Phóng" là hai sản phẩm khác nhau.
 */
function buildContractTree(contractCode, invoiceLines, components, productByLarkId) {
  const parents = [];
  const unknownProducts = new Set();

  const mine = invoiceLines.filter(
    (r) => cellText(r.fields["Hóa Đơn"]).trim() === contractCode,
  );

  for (const row of mine) {
    const f = row.fields;
    const lineCode = cellText(f["Mã Hóa Đơn Chi Tiết"]).trim();
    const productLarkId = linkedRecordIds(f["Chi Tiết SP / DV"])[0];
    const productId = productLarkId ? productByLarkId.get(productLarkId) : undefined;

    if (!productId) {
      unknownProducts.add(cellText(f["Chi Tiết SP / DV"]).trim() || "(không tên)");
      continue;
    }

    const quantity = cellNumber(f["Số Lượng"]) || 1;
    const finalTotal = cellNumber(f["Giá chốt cuối"]);
    const discounted = cellNumber(f["Giá sau giảm"]);

    const parent = {
      larkRecordId: lineCode || row.record_id,
      productId,
      quantity,
      unitPrice: cellNumber(f["Giá niêm yết"]) || null,
      // Giá chốt cuối là con số thật; rơi về Giá sau giảm khi chưa chốt.
      // Cả hai đều là TIỀN CẢ DÒNG, không chia cho số lượng.
      lineTotal: finalTotal || discounted || null,
      children: [],
    };

    for (const comp of components) {
      const cf = comp.fields;
      if (cellText(cf["Hợp đồng chi tiet liên quan"]).trim() !== lineCode) continue;

      const compLarkId = linkedRecordIds(cf["Sản Phẩm"])[0];
      const compProductId = compLarkId ? productByLarkId.get(compLarkId) : undefined;
      if (!compProductId) {
        unknownProducts.add(cellText(cf["Sản Phẩm"]).trim() || "(không tên)");
        continue;
      }

      parent.children.push({
        larkRecordId: cellText(cf["Mã Chi Tiet goi chup"]).trim() || comp.record_id,
        productId: compProductId,
        quantity: cellNumber(cf["Số Lượng"]) || 1,
      });
    }

    parents.push(parent);
  }

  return { parents, unknownProducts: [...unknownProducts] };
}

// --- ghi --------------------------------------------------------------------

/**
 * Ghi cây dòng hàng của một album.
 *
 * XOÁ RỒI GHI LẠI, trong một giao dịch. Nghe thô nhưng đúng: hợp đồng bên Lark
 * là nguồn sự thật, và ghép từng dòng một sẽ để lại dòng mồ côi khi nhân viên
 * xoá một sản phẩm khỏi hợp đồng. Xoá cả cụm thì trạng thái sau lần chạy luôn
 * bằng đúng những gì Lark đang nói.
 *
 * Chỉ xoá dòng CỦA HỢP ĐỒNG NÀY (lark_contract_code), không đụng dòng của hợp
 * đồng khác trong cùng album — một album có thể gom nhiều hợp đồng.
 */
async function writeGallery(client, galleryId, contractCode, parents) {
  await client.query(
    `delete from gallery_items where gallery_id = $1 and lark_contract_code = $2`,
    [galleryId, contractCode],
  );

  let written = 0;
  for (const p of parents) {
    const { rows } = await client.query(
      `insert into gallery_items
         (gallery_id, product_id, parent_item_id, quantity, unit_price, line_total,
          lark_contract_code, lark_record_id)
       values ($1,$2,null,$3,$4,$5,$6,$7)
       returning id`,
      [galleryId, p.productId, p.quantity, p.unitPrice, p.lineTotal, contractCode, p.larkRecordId],
    );
    written += 1;

    for (const c of p.children) {
      await client.query(
        `insert into gallery_items
           (gallery_id, product_id, parent_item_id, quantity, unit_price, line_total,
            lark_contract_code, lark_record_id)
         values ($1,$2,$3,$4,null,null,$5,$6)`,
        [galleryId, c.productId, rows[0].id, c.quantity, contractCode, c.larkRecordId],
      );
      written += 1;
    }
  }
  return written;
}

// --- chạy -------------------------------------------------------------------

async function main() {
  const write = process.argv.includes("--write");
  const onlyIdx = process.argv.indexOf("--contract");
  const onlyContract = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

  const baseToken = need("LARK_BASE_APP_TOKEN");
  const dbUrl = need("SUPABASE_DB_URL");

  if (/prod/i.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")) {
    console.error("Đang trỏ vào production. Chạy tay trên bb-prod cần cờ riêng.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const { rows: products } = await client.query(
      `select id, lark_record_id from products where lark_record_id is not null`,
    );
    const productByLarkId = new Map(products.map((p) => [p.lark_record_id, p.id]));
    console.log(`Danh mục: ${productByLarkId.size} sản phẩm có mã Lark.`);

    const { rows: galleries } = await client.query(
      `select id, title, lark_contract_code from galleries
        where lark_contract_code is not null and lark_contract_code <> ''
          ${onlyContract ? "and lark_contract_code = $1" : ""}
        order by created_at`,
      onlyContract ? [onlyContract] : [],
    );

    if (galleries.length === 0) {
      console.log(
        onlyContract
          ? `Không có album nào mang mã hợp đồng ${onlyContract}.`
          : "Chưa album nào có lark_contract_code. CSKH phải nhập mã hợp đồng trước.",
      );
      return;
    }
    console.log(`Album cần đồng bộ: ${galleries.length}\n`);

    const auth = await larkAuth();
    const invoiceLines = await readTable(auth, baseToken, /h[oó]a đơn chi ti[eế]t/i);
    const components = await readTable(auth, baseToken, /chi ti[eế]t g[oó]i ch[uụ]p/i);
    console.log(`Lark: ${invoiceLines.length} dòng hợp đồng, ${components.length} dòng thành phần.\n`);

    let totalWritten = 0;
    for (const g of galleries) {
      const { parents, unknownProducts } = buildContractTree(
        g.lark_contract_code,
        invoiceLines,
        components,
        productByLarkId,
      );

      const childCount = parents.reduce((n, p) => n + p.children.length, 0);
      const money = parents.reduce((n, p) => n + Number(p.lineTotal ?? 0), 0);
      console.log(`${g.lark_contract_code}  ->  ${g.title}`);
      console.log(
        `   ${parents.length} dòng hợp đồng, ${childCount} thành phần, ` +
          `tổng ${money.toLocaleString("vi-VN")}đ`,
      );

      if (parents.length === 0) {
        console.log("   KHÔNG tìm thấy dòng nào bên Lark — kiểm tra lại mã hợp đồng.");
      }
      if (unknownProducts.length) {
        console.log(
          `   BỎ QUA ${unknownProducts.length} sản phẩm chưa có trong danh mục: ` +
            `${unknownProducts.join(", ")} — chạy npm run sync:catalog trước.`,
        );
      }

      if (write) {
        await client.query("begin");
        try {
          totalWritten += await writeGallery(client, g.id, g.lark_contract_code, parents);
          await client.query("commit");
        } catch (err) {
          await client.query("rollback");
          console.log(`   LỖI, đã hoàn tác album này: ${err.message}`);
        }
      }
    }

    console.log(
      write
        ? `\nĐã ghi ${totalWritten} dòng hàng.`
        : "\nXem trước, chưa ghi gì. Thêm -- --write để ghi thật.",
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
