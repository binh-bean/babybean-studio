#!/usr/bin/env node
/**
 * soat-link-app-cu — CHỈ XEM TRƯỚC. Tìm những ô "Link app" trên bảng Hậu Kỳ
 * bên Lark KHÔNG còn khớp bất kỳ `share_links` nào ở một môi trường đích.
 *
 * OWNER: DEV-OPS. Task BB-315 (cố vấn CV-01, lỗi S6).
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần cái này
 * ---------------------------------------------------------------------------
 * Chủ studio đã tự tạo ~25 link thử trên bb-dev (docs/23 mục 2) — mỗi lần
 * bấm "Tạo link chia sẻ" cho một bộ ảnh THẬT, `POST .../share-link` tự ghi
 * cột "Link app" của đúng dòng Hậu Kỳ đó lên Lark (BB-132,
 * `src/lib/lark/ghi-link-app.ts`). Sau khi cắt sang bb-prod (`docs/26`), mã
 * link đó CHỈ tồn tại trong `share_links` của bb-dev — cột "Link app" trên
 * Lark vẫn còn nguyên chuỗi cũ. CSKH copy đúng cột đó gửi khách là khách mở
 * ra một trang lỗi.
 *
 * ---------------------------------------------------------------------------
 * CHỈ ĐỌC — không ghi gì lên Lark, không ghi gì lên cơ sở dữ liệu
 * ---------------------------------------------------------------------------
 * Cơ sở dữ liệu KHÔNG giữ mã link trần, chỉ giữ `share_links.token_hash`
 * (SHA-256, BB-127/BB-169) — không có đường nào "đọc lại" một link cũ để so
 * trực tiếp. Ngược lại thì làm được: trích mã từ ô Lark (`layMaTuO`, đã có ở
 * `src/lib/lark/khoi-phuc-link-app.ts`, đọc-thôi từ BB-201), băm bằng đúng
 * hàm ứng dụng dùng (`bamMaLink`, `src/lib/auth/bam-ma-link.ts`), rồi hỏi
 * `share_links` của ĐÍCH có dòng nào mang đúng bản băm đó không. Không khớp
 * -> ô đó CHẾT, in ra mã dòng Hậu Kỳ để CSKH XOÁ TAY trên Lark. Không đề nghị
 * `scripts/ghi-link-app-len-lark.ts` cho việc này — cố ý: tệp đó TỪ CHỐI ghi
 * khi `--dia-chi` rỗng (bắt buộc dạng `https://.../g/<mã>`), nên không có
 * đường tự động XOÁ một ô qua nó (chỉ ghi được link mới, không xoá được link
 * cũ). Việc GHI/XOÁ luôn là một bước riêng, có người (CSKH) duyệt, không phải
 * việc script chỉ-đọc này tự làm.
 *
 * Không có phép thử gọi Lark cho tệp này — mọi lệnh gọi mạng qua
 * `larkAuth`/`readLarkTable` đã tự chặn khi `dangChayPhepThu()` (Vitest), nên
 * phép thử không có gì "ruột" để giả lập một cách trung thực (xem AGENTS.md
 * §5a — không giả lập ruột của thứ đang cần thử). `layMaTuO`/`bamMaLink`
 * dùng lại nguyên vẹn, không viết lại ở đây.
 *
 * ---------------------------------------------------------------------------
 * Cách chạy
 * ---------------------------------------------------------------------------
 * `--conditions=react-server` BẮT BUỘC — `src/lib/lark/ghi-link-app.ts` import
 * gói `server-only`, gói đó ném lỗi ngay khi nạp nếu thiếu điều kiện này
 * (giống `scripts/ghi-link-app-len-lark.ts`, xem npm script `lark:ghi-link`).
 *
 *   npm run lark:soat-link-cu -- --dich .env.prod.local
 *   node --conditions=react-server --import tsx scripts/soat-link-app-cu.mjs --dich .env.prod.local
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { docTepEnv } from "./lib/doc-tep-env.mjs";
import { inMoiTruong, kiemTraMoiTruongChoPhep } from "./lib/moi-truong.mjs";
import { larkAuth, readLarkTable } from "../src/lib/lark/sync-retouch.ts";
import { timCotLinkApp, docCauHinhLark, bienMoiTruongConThieu, MAU_TEN_BANG_HAU_KY } from "../src/lib/lark/ghi-link-app.ts";
import { layMaTuO } from "../src/lib/lark/khoi-phuc-link-app.ts";
import { bamMaLink } from "../src/lib/auth/bam-ma-link.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GOC_REPO = path.resolve(__dirname, "..");

async function main() {
  const argv = process.argv.slice(2);
  const arg = (ten, macDinh) => {
    const i = argv.indexOf(ten);
    return i !== -1 ? argv[i + 1] : macDinh;
  };
  const duongLark = arg("--nguon-lark", ".env.local");
  const duongDich = arg("--dich", null);
  if (!duongDich) {
    console.error("Thiếu --dich <tệp môi trường>. Ví dụ: --dich .env.prod.local");
    process.exit(2);
  }

  const bienLark = docTepEnv(path.resolve(GOC_REPO, duongLark));
  if (!bienLark) {
    console.error(`Không thấy tệp môi trường Lark: ${path.resolve(GOC_REPO, duongLark)}`);
    process.exit(2);
  }
  for (const [k, v] of Object.entries(bienLark)) process.env[k] = v;

  const bienDich = docTepEnv(path.resolve(GOC_REPO, duongDich));
  if (!bienDich) {
    console.error(`Không thấy tệp môi trường đích: ${path.resolve(GOC_REPO, duongDich)}`);
    process.exit(2);
  }
  const dbUrlDich = bienDich.SUPABASE_DB_URL;
  if (!dbUrlDich) {
    console.error("Thiếu SUPABASE_DB_URL trong tệp môi trường đích.");
    process.exit(2);
  }

  inMoiTruong(dbUrlDich);
  const kt = kiemTraMoiTruongChoPhep(dbUrlDich);
  if (!kt.choPhep) {
    console.error(kt.ly_do);
    process.exit(2);
  }

  const thieu = bienMoiTruongConThieu();
  if (thieu.length) {
    console.error(`Thiếu biến Lark: ${thieu.join(", ")} (trong ${duongLark}).`);
    process.exit(2);
  }
  const cauHinh = docCauHinhLark();

  console.log("Đăng nhập Lark…");
  const auth = await larkAuth(cauHinh.appId, cauHinh.appSecret);
  const viTri = await timCotLinkApp(auth, cauHinh.baseToken);
  console.log(`Bảng: ${viTri.tenBang}   Cột: "${viTri.fieldName}"`);

  console.log("Đọc toàn bộ bảng Hậu Kỳ (CHỈ ĐỌC)…");
  const { records } = await readLarkTable(auth, cauHinh.baseToken, MAU_TEN_BANG_HAU_KY);
  const coO = records
    .map((r) => ({ recordId: r.record_id, ma: layMaTuO(r.fields[viTri.fieldName]) }))
    .filter((r) => r.ma);
  console.log(`${coO.length}/${records.length} dòng có ô "Link app" không rỗng.`);

  const client = new pg.Client({ connectionString: dbUrlDich });
  await client.connect();
  try {
    let conKhop = 0;
    const dsChet = [];
    for (const r of coO) {
      const bam = await bamMaLink(r.ma);
      const { rows } = await client.query(`select 1 from share_links where token_hash = $1`, [bam]);
      if (rows.length > 0) conKhop += 1;
      else dsChet.push(r.recordId);
    }

    console.log(`\nKhớp với share_links ở đích  : ${conKhop}`);
    console.log(`CHẾT (không khớp gì ở đích)  : ${dsChet.length}`);
    if (dsChet.length) {
      console.log("\nMã dòng Hậu Kỳ có ô \"Link app\" CHẾT — CSKH mở Lark, tìm đúng record_id");
      console.log("  bên dưới, XOÁ TAY nội dung ô \"Link app\" của dòng đó (bôi đen, xoá, lưu).");
      console.log("  Không dùng scripts/ghi-link-app-len-lark.ts để xoá — script đó TỪ CHỐI ghi");
      console.log("  khi --dia-chi rỗng (dòng 119-125 của tệp đó: bắt buộc dạng https://.../g/<mã>),");
      console.log("  nên KHÔNG có đường tự động xoá ô này; xoá tay là cách duy nhất hôm nay.");
      for (const id of dsChet) console.log(`  ${id}`);
    }
    console.log("\nCHỈ XEM TRƯỚC — không ghi gì lên Lark. Không gọi thật trong phép thử (xem AGENTS.md §5a).");
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
