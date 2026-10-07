#!/usr/bin/env tsx
/**
 * BB-384 — chuyển vòng khách duyệt sang ảnh chỉnh TRONG APP.
 *
 *   npm run db:vong-duyet-trong-app                 chạy thử: CHỈ ĐỌC, liệt kê
 *   npm run db:vong-duyet-trong-app -- --write      kéo ảnh từ Drive cho các bộ cần
 *   npm run db:vong-duyet-trong-app -- --write --so 3 --nghi-ms 1500
 *
 * Bối cảnh: trước BB-384, CSKH đưa bộ sang "chờ khách duyệt" bằng cách dán link Drive
 * ảnh chỉnh (`retouch-done`). Bộ như vậy nằm `awaiting_approval` mà app KHÔNG có ảnh
 * chỉnh nào để khách xem — màn khách hiện khung cũ. Nay khung cũ đã gỡ, khách thấy lời
 * Bean "đang chuẩn bị ảnh để ba mẹ duyệt…" cho tới khi CSKH bấm "Gửi khách duyệt".
 *
 * Script này liệt kê:
 *   - bộ đang `awaiting_approval` mà khách KHÔNG thấy tấm ảnh chỉnh trong gói nào;
 *   - bộ đang có vòng sửa MỞ (khách đã xin sửa) mà app CHƯA có ảnh chỉnh nào.
 * `--write`: với bộ CHƯA có ảnh chỉnh trong app, kéo ảnh từ Drive theo ĐÚNG đường đồng
 * bộ sẵn có (`batDauDongBo` + `dongBoBoAnh` — cả thư mục con "ảnh chỉnh sửa"). Ảnh mới
 * kéo về CHƯA hiện cho khách (về sau mốc gửi): CSKH kiểm rồi bấm "Gửi khách duyệt".
 *
 * KHÔNG gửi thông báo cho khách. KHÔNG ghi Lark (không gọi `ghiLinkManConSauDongBo`
 * như route đồng bộ). KHÔNG đổi trạng thái bộ ảnh, KHÔNG đụng mốc gửi.
 * Không in tên khách / tên bộ ảnh (tên bộ có tên bé) — chỉ in mã bộ.
 *
 * Chạy (Claude chạy, không phải agent): cần NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY; `--write` cần thêm GOOGLE_DRIVE_API_KEY.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { batDauDongBo, dongBoBoAnh, moTaLoi } from "../src/lib/drive/sync-gallery";
import { docBoiCanhAnhChinh, khachThayTrongBoiCanh } from "../src/lib/anh-chinh-sua/du-lieu";
import { laKhoaMuaThem } from "../src/lib/anh-chinh-sua/theo-dot";

const args = process.argv.slice(2);
const co = (ten: string) => args.includes(ten);
const soSau = (ten: string): number | null => {
  const i = args.indexOf(ten);
  if (i < 0 || i + 1 >= args.length) return null;
  const n = Number(args[i + 1]);
  return Number.isInteger(n) && n >= 0 ? n : null;
};

const ghi = co("--write");
const gioiHan = soSau("--so");
const nghiMs = soSau("--nghi-ms") ?? 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (ghi && !process.env.GOOGLE_DRIVE_API_KEY) {
  console.error("Thiếu GOOGLE_DRIVE_API_KEY (cần cho --write).");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ma = (id: string) => id.slice(0, 8);

interface BoCanXem {
  id: string;
  status: string;
  coThuMuc: boolean;
  soAnhChinh: number;
  soKhachThay: number;
  vongMo: boolean;
  lyDo: string;
}

async function main(): Promise<void> {
  // Địa chỉ gốc: biết chắc đang chạm cơ sở dữ liệu nào (bb-dev hay bb-prod).
  console.log(`Cơ sở dữ liệu: ${new URL(url!).host}`);
  console.log(`Địa chỉ app  : ${process.env.NEXT_PUBLIC_APP_URL ?? "(chưa đặt NEXT_PUBLIC_APP_URL)"}`);
  console.log(ghi ? "Chế độ: GHI (--write) — kéo ảnh từ Drive, không báo khách, không ghi Lark." : "Chế độ: CHẠY THỬ (chỉ đọc).");

  const { data: choDuyet, error: e1 } = await db.from("galleries").select("id, status, drive_folder_id").eq("status", "awaiting_approval");
  if (e1) throw e1;
  const { data: vongMo, error: e2 } = await db.from("revision_requests").select("gallery_id").is("resolved_at", null);
  if (e2) throw e2;
  const idVongMo = new Set((vongMo ?? []).map((v) => v.gallery_id as string));
  const thieu = [...idVongMo].filter((id) => !(choDuyet ?? []).some((g) => g.id === id));
  const { data: boVongMo, error: e3 } = thieu.length
    ? await db.from("galleries").select("id, status, drive_folder_id").in("id", thieu).neq("status", "archived")
    : { data: [], error: null };
  if (e3) throw e3;

  const tatCa = [...(choDuyet ?? []), ...(boVongMo ?? [])] as { id: string; status: string; drive_folder_id: string | null }[];
  console.log(`Đọc ${tatCa.length} bộ (${choDuyet?.length ?? 0} chờ duyệt, ${boVongMo?.length ?? 0} có vòng sửa mở khác).`);

  const canXem: BoCanXem[] = [];
  for (const g of tatCa) {
    const bc = await docBoiCanhAnhChinh(db, g.id);
    const trongGoi = bc.mocDot === null ? bc.anhChinh : bc.anhChinh.filter((a) => !laKhoaMuaThem(bc.khoaCua.get(a.id)));
    const soKhachThay = trongGoi.filter((a) => khachThayTrongBoiCanh(bc, g.status, a)).length;
    const mo = idVongMo.has(g.id);
    let lyDo = "";
    if (g.status === "awaiting_approval" && soKhachThay === 0) {
      lyDo = trongGoi.length === 0 ? "chờ duyệt, app chưa có ảnh chỉnh" : "chờ duyệt, ảnh chỉnh có nhưng chưa gửi khách";
    } else if (mo && trongGoi.length === 0) {
      lyDo = "vòng sửa mở, app chưa có ảnh chỉnh";
    }
    if (!lyDo) continue;
    canXem.push({
      id: g.id,
      status: g.status,
      coThuMuc: !!g.drive_folder_id,
      soAnhChinh: trongGoi.length,
      soKhachThay,
      vongMo: mo,
      lyDo,
    });
  }

  console.log(`\nBộ khách CHƯA xem được ảnh chỉnh trong app: ${canXem.length}`);
  for (const b of canXem) {
    console.log(
      `  ${ma(b.id)}  ${b.status.padEnd(18)} ảnh chỉnh ${String(b.soAnhChinh).padStart(3)} · khách thấy ${String(b.soKhachThay).padStart(3)}` +
        `${b.vongMo ? " · vòng sửa mở" : ""}${b.coThuMuc ? "" : " · KHÔNG có thư mục Drive"}  — ${b.lyDo}`,
    );
  }
  const canKeo = canXem.filter((b) => b.soAnhChinh === 0 && b.coThuMuc);
  const chiCanGui = canXem.filter((b) => b.soAnhChinh > 0);
  console.log(`\n  cần kéo ảnh từ Drive : ${canKeo.length} bộ`);
  console.log(`  đã có ảnh, chỉ cần CSKH bấm "Gửi khách duyệt": ${chiCanGui.length} bộ`);
  console.log(`  không có thư mục Drive (xử lý tay): ${canXem.filter((b) => !b.coThuMuc).length} bộ`);

  if (!ghi) {
    console.log("\nChạy thử xong — không ghi gì. Thêm --write để kéo ảnh.");
    return;
  }

  const lam = gioiHan ? canKeo.slice(0, gioiHan) : canKeo;
  console.log(`\nKéo ảnh cho ${lam.length} bộ (nghỉ ${nghiMs} ms giữa hai bộ)…`);
  let coAnhSau = 0;
  for (const [i, b] of lam.entries()) {
    if (i > 0 && nghiMs > 0) await cho(nghiMs);
    try {
      const thongTin = await batDauDongBo(db, b.id);
      const kq = await dongBoBoAnh(db, b.id, thongTin, randomUUID());
      const bc = await docBoiCanhAnhChinh(db, b.id);
      if (bc.anhChinh.length > 0) coAnhSau++;
      console.log(`  ok   ${ma(b.id)}  ${kq.photoCount} ảnh trong bộ · ${bc.anhChinh.length} ảnh chỉnh`);
    } catch (err) {
      // Không ghi lỗi lên bộ (khác script đồng bộ hàng loạt): bộ đang chờ duyệt, ghi
      // `sync_error` là thêm việc cho CSKH vì một lượt chạy tay. In ra để Claude xem.
      console.log(`  LỖI  ${ma(b.id)}  ${moTaLoi(err)}`);
    }
  }
  console.log(`\nXong: ${coAnhSau}/${lam.length} bộ đã có ảnh chỉnh trong app. CSKH kiểm rồi bấm "Gửi khách duyệt".`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
