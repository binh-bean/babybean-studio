#!/usr/bin/env tsx
/**
 * Điền bù link màn quản lý bộ ảnh lên cột "Link quản lý bộ ảnh" của bảng Hậu Kỳ.
 *
 * OWNER: DEV-INT. Task BB-373 (anh chốt 06/10/2026).
 *
 *   npm run lark:ghi-link-quan-ly                 CHẠY THỬ (mặc định): đọc, đếm, KHÔNG ghi
 *   npm run lark:ghi-link-quan-ly -- --soat       chỉ soát bảng và cột (cột đã có chưa?)
 *   npm run lark:ghi-link-quan-ly -- --write      GHI THẬT (chỉ khi anh cho phép)
 *
 * Mặc định KHÔNG ghi — cùng tinh thần `lark:ghi-link`: bảng Hậu Kỳ là sổ vận
 * hành thật của studio. Chạy thử in số dòng SẼ ghi / đã đúng / ô có nội dung
 * khác (không đụng) / không thấy dòng, KHÔNG in tên khách hay mã link nào.
 *
 * Chưa có cột "Link quản lý bộ ảnh" thì dừng sạch và nói rõ cần tạo cột gì.
 */

import pg from "pg";
import { docCauHinhLark, bienMoiTruongConThieu, diaChiDayDu } from "../src/lib/lark/ghi-link-app";
import { larkAuth } from "../src/lib/lark/sync-retouch";
import { duongDanQuanLyBoAnh, ghiLinkQuanLyVeLark, timCotLinkQuanLy } from "../src/lib/lark/ghi-link-quan-ly";

const args = process.argv.slice(2);
const co = (ten: string) => args.includes(ten);
const nghi = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const ghiThat = co("--write");
  const chiSoat = co("--soat");

  const thieu = bienMoiTruongConThieu();
  if (thieu.length) {
    console.error(`Thiếu biến môi trường: ${thieu.join(", ")}. Kiểm tra .env.local.`);
    process.exit(1);
  }
  const cauHinh = docCauHinhLark()!;
  const auth = await larkAuth(cauHinh.appId, cauHinh.appSecret);
  const tim = await timCotLinkQuanLy(auth, cauHinh.baseToken);

  if (!tim.thay) {
    console.log(`CHƯA CÓ CỘT: ${tim.lyDo}`);
    console.log(
      tim.cotGanGiong.length
        ? `Các cột có chữ "quản lý"/"link" hiện có: ${tim.cotGanGiong.join(" | ")}`
        : 'Không có cột nào có chữ "quản lý" hay "link".',
    );
    console.log('Cần anh tạo cột tên "Link quản lý bộ ảnh", kiểu URL (hoặc Text) trên bảng Hậu Kỳ. Chưa ghi gì.');
    return;
  }
  const viTri = tim.viTri;
  console.log(`Bảng: ${viTri.tenBang} · Cột: "${viTri.fieldName}" (kiểu ${viTri.fieldType}) — cột DUY NHẤT script chạm tới.`);
  if (chiSoat) return;

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error("Thiếu biến môi trường SUPABASE_DB_URL. Kiểm tra .env.local.");
    process.exit(1);
  }
  if (!diaChiDayDu("/")) {
    console.error("Thiếu NEXT_PUBLIC_APP_URL — không dựng được địa chỉ đầy đủ.");
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  let dsBo: { id: string; record: string }[] = [];
  try {
    const { rows } = await client.query(
      `select id, lark_hauky_record_id as record from galleries
        where lark_hauky_record_id is not null and status <> 'archived' and lark_dong_da_xoa_luc is null`,
    );
    dsBo = rows as { id: string; record: string }[];
  } finally {
    await client.end();
  }

  const dem = { tong: dsBo.length, seGhi: 0, daGhi: 0, daDung: 0, oKhac: 0, khongThayDong: 0, loi: 0 };
  for (const b of dsBo) {
    const kq = await ghiLinkQuanLyVeLark({
      recordId: b.record,
      diaChi: diaChiDayDu(duongDanQuanLyBoAnh(b.id))!,
      ghiThat,
      auth,
      baseToken: cauHinh.baseToken,
      viTri,
    });
    if (kq.ghiDuoc) dem.daGhi++;
    else if (kq.seGhi) dem.seGhi++;
    else if (kq.boQua === "da_dung") dem.daDung++;
    else if (kq.boQua === "o_co_noi_dung_khac") dem.oKhac++;
    else if (kq.boQua === "khong_thay_dong") dem.khongThayDong++;
    else dem.loi++;
    await nghi(150); // Lark giới hạn tần suất theo app.
  }

  console.log(ghiThat ? "ĐÃ GHI THẬT:" : "CHẠY THỬ — chưa ghi gì:");
  console.log(`  bộ ảnh có dòng Hậu Kỳ : ${dem.tong}`);
  console.log(ghiThat ? `  đã ghi                : ${dem.daGhi}` : `  SẼ ghi                : ${dem.seGhi}`);
  console.log(`  ô đã đúng link        : ${dem.daDung}`);
  console.log(`  ô có nội dung khác    : ${dem.oKhac} (không đụng)`);
  console.log(`  không thấy dòng Lark  : ${dem.khongThayDong}`);
  console.log(`  lỗi khác              : ${dem.loi}`);
  if (!ghiThat) console.log("Thêm --write để ghi thật (chỉ khi anh cho phép).");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
