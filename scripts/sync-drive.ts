#!/usr/bin/env tsx
/**
 * Đồng bộ ảnh từ Drive — một bộ, hoặc hàng loạt.
 *
 * OWNER: PM. Task BB-126.
 * Spec: docs/06-drive-integration.md, docs/16 mục 2
 *
 *   npm run drive:sync -- <galleryId>      một bộ
 *   npm run drive:sync -- --tat-ca         mọi bộ chưa có ảnh
 *   npm run drive:sync -- --tat-ca --so 5  thử năm bộ trước
 *   npm run drive:sync -- --tat-ca --lam-lai   kể cả bộ đã lỗi lần trước
 *
 * ---------------------------------------------------------------------------
 * Bộ nào lỗi thì BỎ QUA, không dừng cả mẻ
 * ---------------------------------------------------------------------------
 * Chủ studio chốt ngày 14.09.2026: *"những bộ bị trùng lỗi thì bỏ qua, đồng bộ
 * những bộ đúng trước"*. Một thư mục chưa chia sẻ công khai hay một link dán
 * nhầm không được làm hỏng cả mẻ — lỗi ghi lên chính bộ đó
 * (`galleries.sync_error`) để CSKH nhìn thấy trên màn hình, rồi chạy tiếp.
 *
 * Cuối mẻ in danh sách bộ lỗi kèm lý do, gom theo lý do, để biết là một vấn đề
 * lặp lại hay nhiều vấn đề khác nhau.
 *
 * ---------------------------------------------------------------------------
 * Chạy song song có giới hạn
 * ---------------------------------------------------------------------------
 * 433 bộ chạy tuần tự thì lâu; chạy hết một lúc thì Drive trả 429 và
 * `driveFetch` phải lùi lại chờ — chậm hơn là đằng khác. Mặc định ba luồng.
 *
 * ---------------------------------------------------------------------------
 * Chạy lại được
 * ---------------------------------------------------------------------------
 * Mặc định chỉ lấy bộ CHƯA có ảnh và CHƯA lỗi. Đứt giữa chừng thì chạy lại là
 * đi tiếp từ chỗ dở, không làm lại từ đầu.
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  batDauDongBo,
  dongBoBoAnh,
  ghiLoiDongBo,
  moTaLoi,
  GalleryNotFoundError,
} from "../src/lib/drive/sync-gallery";

const args = process.argv.slice(2);
const co = (ten: string) => args.includes(ten);
const soSau = (ten: string): number | null => {
  const i = args.indexOf(ten);
  if (i < 0 || i + 1 >= args.length) return null;
  const n = Number(args[i + 1]);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const tatCa = co("--tat-ca");
const lamLai = co("--lam-lai");
const gioiHan = soSau("--so");
const luong = soSau("--luong") ?? 3;

// Bỏ giá trị đi ngay sau các cờ có tham số, phần còn lại mới là mã bộ ảnh.
// So sánh theo giá trị (`a !== String(gioiHan)`) thì "--so 3 --luong 3" ăn
// nhầm nhau, và lỗi kiểu đó chỉ lộ ra đúng lúc hai con số trùng nhau.
const COF_CO_GIA_TRI = new Set(["--so", "--luong"]);
const viTriGiaTri = new Set<number>();
args.forEach((a, i) => {
  if (COF_CO_GIA_TRI.has(a)) viTriGiaTri.add(i + 1);
});
const motBo = args.find((a, i) => !a.startsWith("--") && !viTriGiaTri.has(i));

if (!tatCa && !motBo) {
  console.error("Dùng: npm run drive:sync -- <galleryId>   hoặc   -- --tat-ca [--so N]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!process.env.GOOGLE_DRIVE_API_KEY) {
  console.error("Thiếu GOOGLE_DRIVE_API_KEY.");
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

interface Loi {
  id: string;
  title: string;
  lyDo: string;
}

async function chonBoAnh(): Promise<Array<{ id: string; title: string }>> {
  if (motBo) return [{ id: motBo, title: motBo }];

  let q = db
    .from("galleries")
    .select("id, title")
    .not("drive_folder_id", "is", null)
    .eq("photo_count", 0)
    // MỚI NHẤT TRƯỚC. Đo ngày 14.09.2026: mười bộ cũ nhất (tháng 7.2025) đều
    // hỏng thư mục, trong khi lấy ngẫu nhiên cả kho thì 30/40 đọc được — thư
    // mục cũ hay bị gỡ chia sẻ hoặc dọn đi. Chạy từ cũ nhất là mấy phút đầu
    // chỉ toàn lỗi, và người ngồi xem tưởng cả mẻ hỏng.
    //
    // Mới nhất trước cũng đúng thứ tự cần: bộ vừa chụp là bộ sắp phải gửi
    // khách.
    .order("created_at", { ascending: false });

  // Bộ đã lỗi lần trước thì bỏ qua, trừ khi bảo làm lại. Chạy lại cả mẻ mà
  // vẫn đâm vào đúng những thư mục hỏng thì mỗi lần chạy đều tốn từng ấy thời
  // gian cho từng ấy lỗi.
  if (!lamLai) q = q.is("sync_error", null);
  if (gioiHan) q = q.limit(gioiHan);

  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

async function chayMot(bo: { id: string; title: string }): Promise<Loi | null> {
  const requestId = randomUUID();
  let thongTin;
  try {
    thongTin = await batDauDongBo(db, bo.id);
  } catch (err) {
    if (err instanceof GalleryNotFoundError) {
      return { id: bo.id, title: bo.title, lyDo: "không tìm thấy bộ ảnh" };
    }
    throw err;
  }

  try {
    const kq = await dongBoBoAnh(db, bo.id, thongTin, requestId);
    console.log(
      `  ok   ${String(kq.photoCount).padStart(4)} ảnh  ` +
        `(thêm ${kq.them}, cập nhật ${kq.capNhat}, mất ${kq.mat})  ${bo.title}`,
    );
    return null;
  } catch (err) {
    const lyDo = moTaLoi(err);
    await ghiLoiDongBo(db, bo.id, thongTin.giaiDoanDau, err);
    console.log(`  LỖI  ${lyDo}  —  ${bo.title}`);
    return { id: bo.id, title: bo.title, lyDo };
  }
}

/** Gói vào hàm vì script dịch ra CommonJS — không có await ở tầng ngoài. */
async function main(): Promise<void> {
  const danhSach = await chonBoAnh();
  if (danhSach.length === 0) {
    console.log("Không có bộ nào cần đồng bộ.");
    return;
  }

  console.log(`Đồng bộ ${danhSach.length} bộ ảnh, ${luong} luồng song song.\n`);
  const batDau = Date.now();

  const loi: Loi[] = [];
  let ke = 0;
  await Promise.all(
    Array.from({ length: Math.min(luong, danhSach.length) }, async () => {
      while (ke < danhSach.length) {
        const bo = danhSach[ke++];
        if (!bo) break;
        const l = await chayMot(bo);
        if (l) loi.push(l);
      }
    }),
  );

  const giay = Math.round((Date.now() - batDau) / 1000);
  console.log(`\nXong sau ${giay}s: ${danhSach.length - loi.length} bộ đồng bộ được, ${loi.length} bộ lỗi.`);

  if (loi.length > 0) {
    // Gom theo lý do: một vấn đề lặp lại 40 lần khác hẳn 40 vấn đề khác nhau, và
    // danh sách phẳng thì không phân biệt được hai chuyện đó.
    const theoLyDo = new Map<string, Loi[]>();
    for (const l of loi) {
      const list = theoLyDo.get(l.lyDo) ?? [];
      list.push(l);
      theoLyDo.set(l.lyDo, list);
    }
    console.log("\nCác bộ lỗi, gom theo lý do:");
    for (const [lyDo, list] of [...theoLyDo.entries()].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`\n  ${list.length} bộ — ${lyDo}`);
      for (const l of list.slice(0, 10)) console.log(`     ${l.title}`);
      if (list.length > 10) console.log(`     … và ${list.length - 10} bộ nữa`);
    }
    console.log("\nLỗi đã ghi lên từng bộ, CSKH nhìn thấy trên màn hình.");
    console.log("Sửa xong bên Lark thì chạy lại với --lam-lai.");
  }

}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
