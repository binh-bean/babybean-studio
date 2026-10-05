/**
 * BB-334A — tạo LINK GIA ĐÌNH cho khách có BỘ MỚI (anh chốt 30/09: "bộ mới dùng
 * link gia đình ngay; khách cũ nhận khi có bộ mới").
 *
 * MẶC ĐỊNH CHẠY THỬ: chỉ đếm và in, không ghi gì. `--write` mới tạo link.
 *
 *   node --env-file-if-exists=.env.local --import tsx scripts/tao-link-gia-dinh.mjs
 *   node --env-file-if-exists=.env.local --import tsx scripts/tao-link-gia-dinh.mjs --tu 2026-10-05
 *   node --env-file-if-exists=.env.local --import tsx scripts/tao-link-gia-dinh.mjs --tu 2026-10-05 --write
 *
 * Chọn khách nào: có ít nhất một bộ ảnh ĐANG HIỆN cho gia đình (có ảnh, không
 * `draft`/`archived`) TẠO TỪ ngày `--tu` (mặc định hôm nay — tức là chỉ bộ mới),
 * và CHƯA có link gia đình owner còn sống.
 *
 * KHÔNG làm:
 *   - KHÔNG gửi gì cho khách (không Zalo, không tin nhắn). CSKH gửi khi có dịp.
 *   - KHÔNG ghi Lark. Màn CSKH (POST …/link-gia-dinh/ghi-lark) ghi khi cần.
 *   - KHÔNG thu hồi link cũ theo bộ — link cũ chạy mãi (anh chốt Q2).
 *   - KHÔNG in mã link, tên khách hay số điện thoại (bb-dev là dữ liệu thật,
 *     AGENTS §6) — chỉ in id rút gọn và 6 ký tự đầu của mã.
 *
 * Mã: 32 byte ngẫu nhiên; CSDL giữ SHA-256 + bản mã hoá AES-GCM ở
 * `share_link_ma` (BB-201) để màn CSKH hiện lại link.
 */
import pg from "pg";
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const GHI = args.includes("--write");
const viTriTu = args.indexOf("--tu");
const TU = viTriTu >= 0 ? args[viTriTu + 1] : new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(TU ?? "")) {
  console.error("--tu phải có dạng YYYY-MM-DD");
  process.exit(2);
}
if (!process.env.SUPABASE_DB_URL) {
  console.error("Thiếu SUPABASE_DB_URL (đọc từ .env.local qua --env-file-if-exists).");
  process.exit(2);
}

const bam = (s) => createHash("sha256").update(s).digest("hex");
const ngan = (id) => String(id).slice(0, 8);

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();

try {
  const { rows } = await client.query(
    `select g.customer_id,
            count(*)::int as so_bo_moi,
            min(g.created_at) as bo_moi_dau
       from galleries g
      where g.customer_id is not null
        and g.photo_count > 0
        and g.status not in ('draft', 'archived')
        and g.created_at >= $1::date
        and not exists (
          select 1 from share_links l
           where l.customer_id = g.customer_id and l.role = 'owner' and l.status = 'active'
        )
      group by g.customer_id
      order by min(g.created_at)`,
    [TU],
  );

  console.info(`${GHI ? "GHI THẬT" : "CHẠY THỬ"} — khách có bộ mới từ ${TU} mà chưa có link gia đình: ${rows.length}`);
  for (const r of rows) {
    console.info(`  khách ${ngan(r.customer_id)}…  ${r.so_bo_moi} bộ mới (từ ${new Date(r.bo_moi_dau).toISOString().slice(0, 10)})`);
  }

  if (!GHI) {
    console.info("\nChưa ghi gì. Thêm --write để tạo link (không gửi khách, không ghi Lark).");
  } else {
    const { maHoaMaLink } = await import("../src/lib/auth/ma-link-loi.ts");
    let tao = 0;
    for (const r of rows) {
      await client.query("begin");
      try {
        // Kiểm lại trong giao dịch: hai người chạy cùng lúc không tạo hai link.
        const { rows: daCo } = await client.query(
          `select 1 from share_links where customer_id = $1 and role = 'owner' and status = 'active' for update`,
          [r.customer_id],
        );
        if (daCo.length > 0) {
          await client.query("rollback");
          continue;
        }
        const ma = randomBytes(32).toString("base64url");
        const { rows: l } = await client.query(
          `insert into share_links (customer_id, token_hash, token_prefix, role, label, status, expires_at)
           values ($1, $2, $3, 'owner', 'Link gia đình', 'active', null) returning id`,
          [r.customer_id, bam(ma), ma.slice(0, 6)],
        );
        await client.query(`insert into share_link_ma (share_link_id, ma_hoa) values ($1, $2)`, [l[0].id, maHoaMaLink(ma)]);
        await client.query(
          `insert into activity_logs (actor_type, action, entity_type, entity_id, metadata)
           values ('system', 'share_link.gia_dinh_tao', 'customer', $1, $2)`,
          [r.customer_id, JSON.stringify({ shareLinkId: l[0].id, tokenPrefix: ma.slice(0, 6), nguon: "tao-link-gia-dinh.mjs" })],
        );
        await client.query("commit");
        tao++;
        console.info(`  đã tạo cho khách ${ngan(r.customer_id)}…  mã ${ma.slice(0, 6)}…`);
      } catch (e) {
        await client.query("rollback").catch(() => {});
        console.error(`  HỎNG ở khách ${ngan(r.customer_id)}…: ${e instanceof Error ? e.message : e}`);
      }
    }
    console.info(`\nĐã tạo ${tao}/${rows.length} link gia đình. Không gửi khách, không ghi Lark.`);
  }
} finally {
  await client.end();
}
