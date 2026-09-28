#!/usr/bin/env tsx
/**
 * don-dem-het-han — dọn bộ đệm ẢNH BÌA của các bộ ảnh đã XONG VÒNG ĐỜI quá N
 * ngày, N tính theo lượng khách mới (nguồn Lark) để giữ tổng đệm dưới ~60%
 * của hạn mức Storage free (1 GB).
 *
 * OWNER: DEV-INT. Task BB-311 mục A (28/09/2026, admin).
 *
 * Chạy tay:
 *   npm run anh:don-dem-het-han            -- XEM TRƯỚC (mặc định)
 *   npm run anh:don-dem-het-han -- --write -- xoá thật
 *
 * Chạy tự động: gọi từ `/api/cron/expire-galleries` (đi nhờ lịch đã có —
 * gói Vercel Hobby chỉ cho 2 cron/ngày, cả hai đã dùng hết, xem `vercel.json`
 * và chú thích ở đầu route đó về việc "đi nhờ" các việc phụ khác).
 *
 * ---------------------------------------------------------------------------
 * Vì sao chỉ dọn ẢNH BÌA (không phải "mọi thứ" của bộ đã xong)
 * ---------------------------------------------------------------------------
 * Từ BB-311 mục A, `/api/img` CHỈ còn đệm ảnh bìa (w≥1600, xem route đó) —
 * ảnh lưới/xem nhỏ không bao giờ chạm Storage. Nên phần cần dọn định kỳ cũng
 * chỉ còn đúng ảnh bìa: `<coverPhotoId>/1600.{jpg,webp}` và
 * `<coverPhotoId>/2048.{jpg,webp}`. Bộ đã "xong vòng đời" không còn ai mở lại
 * thường xuyên — cache miss vào đúng những lượt xem HIẾM đó chấp nhận được
 * (kéo lại từ Google, chậm một lần), đổi lấy Storage không phình vô hạn.
 *
 * ---------------------------------------------------------------------------
 * "Xong vòng đời" nghĩa là gì
 * ---------------------------------------------------------------------------
 * `galleries.status` ∈ {'delivered', 'expired', 'archived'} — cả ba đều
 * không còn ai thao tác tiếp (delivered = đã giao xong, xem
 * `docs/16-quy-trinh-dau-cuoi.md`; expired/archived = không ai xem nữa).
 * Mốc thời gian: ưu tiên `deliveries.delivered_at` (đúng nghĩa "xong lúc
 * nào" cho status delivered); không có (hoặc status khác delivered) thì lùi
 * về `galleries.updated_at`.
 *
 * ---------------------------------------------------------------------------
 * N (số ngày giữ đệm) tính từ đâu — "nguồn từ Lark"
 * ---------------------------------------------------------------------------
 * `shoots.shoot_date` (cột "Ngày Chụp" đồng bộ từ Lark, xem
 * `scripts/sync-lark-hauky.mjs`) trong 4 tuần gần nhất, chia 4, ra số bộ MỚI
 * trung bình một tuần. KHÔNG dùng `galleries.created_at`: cột đó nhảy vọt
 * mỗi lần chạy `db:nap-lai` (mọi bộ được TẠO LẠI cùng một lúc), làm sai lệch
 * hẳn "nhịp khách mới thật".
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Logic thuần — không đụng DB/Storage, kiểm bằng phép thử đơn vị thẳng.
// ============================================================================

/** Trần đệm — giữ tổng dưới ~60% của 1GB (hạn mức Storage free). */
export const TRAN_MB_MAC_DINH = 0.6 * 1024; // 614.4 MB
export const N_NGAY_TOI_THIEU = 3;
export const N_NGAY_TOI_DA = 90;

export interface ThamSoTinhN {
  /** Số bộ ảnh MỚI trung bình mỗi tuần (đếm từ `shoots.shoot_date`, nguồn Lark). */
  boMoiMoiTuan: number;
  /** Dung lượng đệm ẢNH BÌA trung bình mỗi bộ, MB (đo thật: 1600w≈0,44MB + 2048w≈0,78MB ≈ 1,2MB nếu đệm cả hai). */
  dungLuongTrungBinhMoiBoMB: number;
  tranMB?: number;
  nMin?: number;
  nMax?: number;
}

/**
 * N = số ngày giữ đệm ảnh bìa của một bộ đã xong vòng đời, sao cho tổng đệm
 * (nhịp bộ mới × dung lượng mỗi bộ × N ngày) không vượt trần.
 *
 * `boMoiMoiTuan` hoặc `dungLuongTrungBinhMoiBoMB` <= 0 (chưa đo được, hoặc
 * studio chưa có bộ nào) → không có cơ sở tính, trả về TRẦN TRÊN (giữ lâu
 * nhất, AN TOÀN hơn xoá nhầm khi không có dữ liệu để tính đúng).
 */
export function tinhSoNgayGiuDem(ts: ThamSoTinhN): number {
  const tranMB = ts.tranMB ?? TRAN_MB_MAC_DINH;
  const nMin = ts.nMin ?? N_NGAY_TOI_THIEU;
  const nMax = ts.nMax ?? N_NGAY_TOI_DA;

  if (ts.boMoiMoiTuan <= 0 || ts.dungLuongTrungBinhMoiBoMB <= 0) return nMax;

  const mbMoiNgay = (ts.boMoiMoiTuan / 7) * ts.dungLuongTrungBinhMoiBoMB;
  if (mbMoiNgay <= 0) return nMax;

  const n = Math.floor(tranMB / mbMoiNgay);
  return Math.min(Math.max(n, nMin), nMax);
}

export interface BoCanDon {
  galleryId: string;
  coverPhotoId: string;
}

/** Đường dẫn ứng viên cần xoá cho MỘT ảnh bìa (cả hai cỡ, cả hai đuôi — không biết trước đuôi nào thật sự tồn tại). */
export function duongDanDemBia(coverPhotoId: string): string[] {
  return [
    `${coverPhotoId}/1600.jpg`,
    `${coverPhotoId}/1600.webp`,
    `${coverPhotoId}/2048.jpg`,
    `${coverPhotoId}/2048.webp`,
  ];
}

// ============================================================================
// Lớp truy cập DB/Storage — biên giới mỏng. Dùng thẳng kiểu `SupabaseClient`
// của SDK (cùng quy ước với `src/lib/drive/lam-nong-cache.ts`) — chỉ cast dữ
// liệu TRẢ VỀ, không tự vẽ lại kiểu cho bộ dựng câu truy vấn.
// ============================================================================

/** Số bộ mới trung bình mỗi tuần, 4 tuần gần nhất, theo `shoots.shoot_date` (nguồn Lark). */
export async function boMoiMoiTuanTuLark(client: SupabaseClient): Promise<number> {
  const bonTuanTruoc = new Date();
  bonTuanTruoc.setDate(bonTuanTruoc.getDate() - 28);
  const { count } = await client
    .from("shoots")
    .select("id", { count: "exact", head: true })
    .gte("shoot_date", bonTuanTruoc.toISOString().slice(0, 10));
  return (count ?? 0) / 4;
}

const CAC_TRANG_THAI_XONG = ["delivered", "expired", "archived"];

/** Bộ ảnh đã xong vòng đời quá N ngày, có ảnh bìa. */
export async function boCanDonDemHetHan(client: SupabaseClient, soNgay: number): Promise<BoCanDon[]> {
  const nNgayTruoc = new Date();
  nNgayTruoc.setDate(nNgayTruoc.getDate() - soNgay);
  const moc = nNgayTruoc.toISOString();

  // Ưu tiên deliveries.delivered_at nếu có; lùi về galleries.updated_at nếu
  // không (xem chú thích đầu tệp). Thực hiện bằng HAI truy vấn con rồi hợp —
  // PostgREST không cho COALESCE hai bảng trong một câu select đơn giản.
  const quaGiaoLauRoi = await client
    .from("deliveries")
    .select("gallery_id, delivered_at")
    .not("delivered_at", "is", null)
    .lt("delivered_at", moc);
  const idGiaoLauRoi = new Set<string>(
    ((quaGiaoLauRoi.data ?? []) as { gallery_id: string }[]).map((r) => r.gallery_id),
  );

  const boXong = await client
    .from("galleries")
    .select("id, cover_photo_id, status, updated_at")
    .in("status", CAC_TRANG_THAI_XONG);

  const rows = (boXong.data ?? []) as {
    id: string;
    cover_photo_id: string | null;
    status: string;
    updated_at: string;
  }[];

  const ket: BoCanDon[] = [];
  for (const r of rows) {
    if (!r.cover_photo_id) continue;
    const duXong = r.status === "delivered" && idGiaoLauRoi.has(r.id) ? true : new Date(r.updated_at) < nNgayTruoc;
    if (duXong) ket.push({ galleryId: r.id, coverPhotoId: r.cover_photo_id });
  }
  return ket;
}

export interface KetQuaDonDemHetHan {
  soBoDaDon: number;
  mbGiaiPhong: number;
  soNgayGiuDem: number;
}

export async function chayDonDemHetHan(
  client: SupabaseClient,
  opts: { ghiThat: boolean; dungLuongTrungBinhMoiBoMB?: number },
): Promise<KetQuaDonDemHetHan> {
  const boMoiMoiTuan = await boMoiMoiTuanTuLark(client);
  // Đo thật (báo cáo vận hành vòng 4 §5): 1600w≈463,8KB, 2048w≈793,7KB.
  // Đệm CẢ HAI cỡ cho một bìa ≈ 1,23MB.
  const dungLuongTrungBinhMoiBoMB = opts.dungLuongTrungBinhMoiBoMB ?? 1.23;
  const soNgayGiuDem = tinhSoNgayGiuDem({ boMoiMoiTuan, dungLuongTrungBinhMoiBoMB });

  const boCanDon = await boCanDonDemHetHan(client, soNgayGiuDem);

  let mbGiaiPhong = 0;
  let soBoDaDon = 0;
  const storage = client.storage.from("thumbnails");

  for (const bo of boCanDon) {
    const { data: list } = await storage.list(bo.coverPhotoId, { limit: 10 });
    const doiTuongLon = ((list ?? []) as { name: string; metadata: { size?: number } | null }[]).filter(
      (d) => d.name === "1600.jpg" || d.name === "1600.webp" || d.name === "2048.jpg" || d.name === "2048.webp",
    );
    if (doiTuongLon.length === 0) continue;

    const byteBo = doiTuongLon.reduce((t, d) => t + (d.metadata?.size ?? 0), 0);
    if (opts.ghiThat) {
      const paths = doiTuongLon.map((d) => `${bo.coverPhotoId}/${d.name}`);
      await storage.remove(paths);
    }
    mbGiaiPhong += byteBo / (1024 * 1024);
    soBoDaDon++;
  }

  return { soBoDaDon, mbGiaiPhong, soNgayGiuDem };
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== "--");
  const ghiThat = argv.includes("--write");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Kiểm tra .env.local.");
    process.exit(2);
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`Đang tính N (số ngày giữ đệm ảnh bìa)...${ghiThat ? " — SẼ XOÁ THẬT" : " — chỉ xem trước"}`);
  const ket = await chayDonDemHetHan(client, { ghiThat });

  console.log(`\nN = ${ket.soNgayGiuDem} ngày (bộ đã xong vòng đời + quá N ngày mới bị dọn).`);
  console.log(`Số bộ ${ghiThat ? "đã dọn" : "sẽ dọn"}: ${ket.soBoDaDon}`);
  console.log(`MB ${ghiThat ? "đã giải phóng" : "sẽ giải phóng"}: ${ket.mbGiaiPhong.toFixed(2)} MB`);
  if (!ghiThat) console.log("\nCHỈ XEM TRƯỚC — chưa xoá gì. Thêm --write để xoá thật.");
}

const chayTrucTiep =
  process.argv[1] &&
  (process.argv[1].endsWith("don-dem-het-han.ts") || process.argv[1].endsWith("don-dem-het-han.mjs"));
if (chayTrucTiep) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
