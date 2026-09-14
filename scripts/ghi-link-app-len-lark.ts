#!/usr/bin/env tsx
/**
 * Ghi link app lên cột "Link app" của bảng Hậu Kỳ bên Lark — CHẠY THỬ trước.
 *
 * OWNER: DEV-INT. Task BB-132.
 * Spec: docs/briefs/BB-132-dan-link-ve-lark.md
 *
 *   npm run lark:ghi-link -- <mã bộ ảnh>                       chạy thử
 *   npm run lark:ghi-link -- <mã bộ ảnh> --dia-chi <địa chỉ>    chạy thử, địa chỉ thật
 *   npm run lark:ghi-link -- <mã bộ ảnh> --dia-chi <địa chỉ> --that   GHI THẬT
 *   npm run lark:ghi-link -- --soat                            chỉ soát bảng và cột
 *
 * ---------------------------------------------------------------------------
 * Vì sao có công tắc `--that`
 * ---------------------------------------------------------------------------
 * Đây là đường GHI ĐẦU TIÊN đi lên Lark; mọi thứ trước nay chỉ đọc xuống. Bảng
 * Hậu Kỳ là sổ vận hành thật của studio, không phải bản nháp. Nên mặc định của
 * script này là KHÔNG ghi: nó đi hết đường — xin token, tìm bảng, tìm cột, đọc
 * dòng — rồi in ra ĐÚNG dòng và ĐÚNG cột sắp bị chạm, và dừng ở đó. Phải gõ
 * thêm `--that` thì mới gọi PUT.
 *
 * Mặc định an toàn, không phải mặc định tiện. Người quên gõ cờ thì mất một lần
 * chạy lại; người quên cờ theo chiều ngược lại thì ghi đè sổ vận hành.
 *
 * ---------------------------------------------------------------------------
 * Vì sao phải truyền `--dia-chi`
 * ---------------------------------------------------------------------------
 * Cơ sở dữ liệu KHÔNG giữ mã link, chỉ giữ bản băm SHA-256 (BB-127). Nên script
 * không thể dựng lại link của một bộ ảnh đã tạo — không ai dựng lại được, kể cả
 * người viết ra nó. Địa chỉ phải do người chạy đưa vào, chép từ màn CSKH.
 *
 * Đường đi thường ngày là route POST .../share-link tự ghi. Script này là
 * đường cứu hộ: lúc Lark chết đúng lúc CSKH bấm tạo link, hoặc lúc cần soát
 * trước khi mở tính năng cho cả studio.
 */

import pg from "pg";
import {
  ghiLinkAppVeLark,
  timCotLinkApp,
  docCauHinhLark,
  bienMoiTruongConThieu,
  cheMa,
} from "../src/lib/lark/ghi-link-app";
import { larkAuth } from "../src/lib/lark/sync-retouch";

const args = process.argv.slice(2);
const co = (ten: string) => args.includes(ten);
const chuoiSau = (ten: string): string => {
  const i = args.indexOf(ten);
  return i >= 0 ? (args[i + 1] ?? "") : "";
};

async function main(): Promise<void> {
  const ghiThat = co("--that");
  const ghiDe = co("--ghi-de");
  const chiSoat = co("--soat");
  const diaChi = chuoiSau("--dia-chi");
  const galleryId = args.find((a) => !a.startsWith("--") && a !== diaChi) ?? "";

  const thieu = bienMoiTruongConThieu();
  if (thieu.length) {
    console.error(`Thiếu biến môi trường: ${thieu.join(", ")}. Kiểm tra .env.local.`);
    process.exit(1);
  }
  const cauHinh = docCauHinhLark()!;

  // --- chế độ soát: chỉ tìm bảng và cột, không cần bộ ảnh nào -------------
  if (chiSoat) {
    const auth = await larkAuth(cauHinh.appId, cauHinh.appSecret);
    const viTri = await timCotLinkApp(auth, cauHinh.baseToken);
    console.log("Soát bảng và cột bên Lark:");
    console.log(`  bảng : ${viTri.tenBang}`);
    console.log(`  cột  : "${viTri.fieldName}" (kiểu ${viTri.fieldType})`);
    console.log("Không ghi gì. Cột này là cột DUY NHẤT script sẽ chạm tới.");
    return;
  }

  if (!galleryId) {
    console.error("Thiếu mã bộ ảnh. Ví dụ: npm run lark:ghi-link -- <mã bộ ảnh>");
    process.exit(1);
  }

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Thiếu biến môi trường SUPABASE_DB_URL. Kiểm tra .env.local.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  let recordId = "";
  let tieuDe = "";
  try {
    const { rows } = await client.query(
      `select title, lark_hauky_record_id from galleries where id = $1`,
      [galleryId],
    );
    if (rows.length === 0) {
      console.error(`Không có bộ ảnh nào mang mã ${galleryId}.`);
      process.exit(1);
    }
    tieuDe = rows[0].title ?? "";
    recordId = rows[0].lark_hauky_record_id ?? "";
  } finally {
    await client.end();
  }

  if (!recordId) {
    console.error(
      `Bộ ảnh "${tieuDe}" chưa gắn dòng Hậu Kỳ nào (lark_hauky_record_id trống).\n` +
        `Chạy npm run sync:hauky -- --write trước để nối bộ ảnh với Lark.`,
    );
    process.exit(1);
  }

  // Chạy thử không cần địa chỉ thật: mục đích là xem ĐÚNG DÒNG ĐÚNG CỘT chưa.
  // Ghi thật thì bắt buộc, và phải là địa chỉ đầy đủ chứ không phải đường dẫn.
  if (ghiThat && !/^https?:\/\/.+\/g\/.+/.test(diaChi)) {
    console.error(
      "Ghi thật thì phải có --dia-chi <địa chỉ đầy đủ>, dạng https://.../g/<mã>.\n" +
        "Chép từ màn CSKH — cơ sở dữ liệu không giữ mã link, không dựng lại được.",
    );
    process.exit(1);
  }

  const ketQua = await ghiLinkAppVeLark({
    recordId,
    // Chạy thử không cần địa chỉ thật — mục đích là soát ĐÚNG DÒNG ĐÚNG CỘT.
    // Địa chỉ giả này không bao giờ đi tới PUT vì ghiThat đang là false.
    diaChi: diaChi || "https://vi-du.khong-ghi/g/CHAYTHU",
    ghiThat,
    ghiDe,
  });

  console.log(`Bộ ảnh : ${tieuDe} (${galleryId})`);
  if (ketQua.viTri) {
    console.log(`Bảng   : ${ketQua.viTri.tenBang}`);
    console.log(`Cột    : "${ketQua.viTri.fieldName}" (kiểu ${ketQua.viTri.fieldType})`);
  }
  console.log(`Dòng   : ${recordId}`);
  console.log(`Sẽ ghi : ${cheMa(diaChi || "(chạy thử, chưa có địa chỉ thật)")}`);

  if (ketQua.ghiDuoc) {
    console.log("\nĐÃ GHI THẬT. Mở Lark kiểm mắt thường đúng dòng đó.");
    return;
  }
  if (ketQua.chayThu && !ketQua.lyDo) {
    console.log("\nChạy thử, CHƯA ghi gì. Soát đúng dòng đúng cột rồi thêm --that để ghi thật.");
    return;
  }
  console.error(`\nKHÔNG ghi được: ${ketQua.lyDo}`);
  process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
