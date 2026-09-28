#!/usr/bin/env tsx
/**
 * don-dem-hong — liệt kê / xoá đối tượng RÁC trong bucket Storage `thumbnails`.
 *
 * OWNER: DEV-INT. Task BB-311 (P0 mục 1b, mở rộng mục A).
 *
 * Chạy:
 *   npm run anh:don-dem-hong                    -- XEM TRƯỚC đối tượng "hỏng"
 *                                                   (< 1KB — không đọc thêm
 *                                                   nội dung, xem lý do dưới)
 *   npm run anh:don-dem-hong -- --write         -- xoá thật đối tượng hỏng
 *   npm run anh:don-dem-hong -- --tat-ca-nho    -- XEM TRƯỚC mọi đối tượng cỡ
 *                                                   NHỎ (200/400/800w) — từ
 *                                                   BB-311 các cỡ này không
 *                                                   còn được đệm, nên MỌI đối
 *                                                   tượng cỡ này là rác cũ
 *   npm run anh:don-dem-hong -- --tat-ca-nho --write
 *   npm run anh:don-dem-hong -- --tat-ca        -- XEM TRƯỚC toàn bộ bucket
 *                                                   (dùng SAU khi db:nap-lai
 *                                                   --xoa đã xoá sạch DB —
 *                                                   mọi đối tượng đều mồ côi)
 *   npm run anh:don-dem-hong -- --tat-ca --write
 *
 * Ba chế độ (mặc định/--tat-ca-nho/--tat-ca) LOẠI TRỪ NHAU. `--write` mới xoá
 * thật — không có cờ này thì CHỈ liệt kê + đếm, không đụng gì.
 *
 * ---------------------------------------------------------------------------
 * Vì sao chế độ MẶC ĐỊNH chỉ xét kích thước, không tải nội dung xuống kiểm
 * ---------------------------------------------------------------------------
 * `kiemAnhTruocKhiGhiDem()` (dùng ở `/api/img`, `lam-nong-cache.ts`) đọc được
 * cả kích thước PIXEL, không chỉ dung lượng byte — nhưng để làm vậy phải TẢI
 * nội dung đối tượng xuống. Bucket đang có khoảng 15.000 đối tượng; tải hết
 * để kiểm là khoảng 270 MB egress — tốn hạn mức free chỉ để ĐI TÌM rác, phản
 * tác dụng. Vụ 42 ảnh thật bị đầu độc (báo cáo vận hành vòng 4) đều là đối
 * tượng 78 BYTE — kiểm bằng `metadata.size` (có sẵn trong `list()`, không cần
 * tải nội dung) đã bắt đúng ca đó với chi phí gần như 0. Đây là điểm cân bằng
 * cố ý: bắt được lớp lỗi CHÍNH đã xảy ra, chấp nhận bỏ sót ca hiếm hơn (đối
 * tượng > 1KB nhưng vẫn hỏng nội dung) để không tự tạo ra một vấn đề egress
 * mới trong lúc đi dọn vấn đề egress cũ.
 *
 * ---------------------------------------------------------------------------
 * Cấu trúc bucket `thumbnails`
 * ---------------------------------------------------------------------------
 *   <photoId>/<width>.jpg | .webp     — đệm ảnh (`/api/img`), width thuộc
 *                                        THUMBNAIL_WIDTHS (200/400/800/1600/2048)
 *   icon/<galleryId>/<size>.jpg       — icon màn hình chính (`bia-vuong`),
 *                                        size thuộc {180,192,512} — KHÔNG
 *                                        trùng THUMBNAIL_WIDTHS, và KHÔNG bị
 *                                        ảnh hưởng bởi luật "không đệm ảnh
 *                                        nhỏ" (đây là icon PWA, không phải
 *                                        ảnh xem). `--tat-ca-nho` BỎ QUA thư
 *                                        mục này — icon nhỏ vẫn ĐÚNG Ý, không
 *                                        phải rác.
 *
 * Không có `--tat-ca`: thư mục `icon/` VẪN được xét ở chế độ mặc định (đối
 * tượng hỏng dưới 1KB trong `icon/` cũng là rác, không riêng gì `<photoId>/`).
 *
 * ---------------------------------------------------------------------------
 * Không in tên khách
 * ---------------------------------------------------------------------------
 * Đường dẫn đối tượng chỉ có UUID (photoId/galleryId) — không tự tra ngược
 * sang tên khách/bé ở đây. Script này CHỈ đọc/ghi bucket Storage, không đọc
 * bảng `customers`/`babies`.
 */

import { createClient } from "@supabase/supabase-js";

// ============================================================================
// Logic thuần — không đụng Storage, kiểm bằng phép thử đơn vị thẳng.
// ============================================================================

export const NGUONG_BYTE_HONG = 1024; // 1 KB — xem lý do đầu tệp.
export const CO_NHO_CU = new Set([200, 400, 800]);

export interface DoiTuong {
  /** Đường dẫn ĐẦY ĐỦ trong bucket, ví dụ "abc-123/800.jpg" hoặc "icon/xyz/192.jpg". */
  path: string;
  size: number;
}

/** true nếu tên tệp khớp `<số>.<jpg|webp>` VÀ số đó là một cỡ đệm "nhỏ cũ" đã bỏ dùng. */
export function laTenTepNhoCu(tenTep: string): boolean {
  const m = tenTep.match(/^(\d+)\.(jpg|webp)$/i);
  if (!m || !m[1]) return false;
  return CO_NHO_CU.has(Number(m[1]));
}

/** true nếu đường dẫn nằm trong thư mục icon/ (icon màn hình chính, không phải đệm ảnh xem). */
export function laDoiTuongIcon(path: string): boolean {
  return path === "icon" || path.startsWith("icon/");
}

export type CheDo = "hong" | "nho" | "tat_ca";

/**
 * Lọc danh sách đối tượng THẬT (đã liệt kê từ Storage) theo chế độ. Hàm
 * THUẦN — không gọi Storage, chỉ lọc trên dữ liệu đã có.
 */
export function locDoiTuongCanXoa(doiTuongs: DoiTuong[], cheDo: CheDo): DoiTuong[] {
  if (cheDo === "tat_ca") return doiTuongs;

  if (cheDo === "nho") {
    return doiTuongs.filter((d) => !laDoiTuongIcon(d.path) && laTenTepNhoCu(d.path.split("/").pop() ?? ""));
  }

  // "hong" (mặc định): dưới ngưỡng byte, BẤT KỂ ở thư mục nào (kể cả icon/).
  return doiTuongs.filter((d) => d.size < NGUONG_BYTE_HONG);
}

/** Tổng dung lượng (byte) của một danh sách đối tượng. */
export function tongByte(doiTuongs: DoiTuong[]): number {
  return doiTuongs.reduce((tong, d) => tong + d.size, 0);
}

export function formatMB(byte: number): string {
  return (byte / (1024 * 1024)).toFixed(2);
}

// ============================================================================
// Lớp truy cập Storage — biên giới mỏng, phép thử đơn vị giả lập đúng lớp này.
// ============================================================================

interface StorageListItem {
  name: string;
  id: string | null;
  metadata: { size?: number } | null;
}

export interface ClientDuyet {
  storage: {
    from(bucket: string): {
      list(
        path: string,
        opts: { limit: number; offset: number },
      ): Promise<{ data: StorageListItem[] | null; error: unknown }>;
      remove(paths: string[]): Promise<{ data: unknown; error: unknown }>;
    };
  };
}

const TEN_BUCKET = "thumbnails";
const TRANG_LIET_KE = 1000;
const SO_LAN_THU_LAI = 4;

const cho = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Liệt kê MỌI mục con trực tiếp của một "thư mục" (không đệ quy), có phân
 * trang và TỰ THỬ LẠI khi Storage trả lỗi thoáng qua (Gateway Timeout, 5xx) —
 * đo thật 28/09/2026: chạy song song `SO_SONG_SONG_DUYET` lượt trên ~15.000
 * đối tượng làm Supabase Storage timeout giữa chừng, không có thử lại thì cả
 * lượt duyệt (đã chạy hàng chục phút) mất trắng.
 */
async function danhSachThuMuc(client: ClientDuyet, path: string): Promise<StorageListItem[]> {
  const ket: StorageListItem[] = [];
  let offset = 0;
  for (;;) {
    let data: StorageListItem[] | null = null;
    let loiCuoi: unknown = null;
    for (let lan = 0; lan < SO_LAN_THU_LAI; lan++) {
      const res = await client.storage.from(TEN_BUCKET).list(path, { limit: TRANG_LIET_KE, offset });
      if (!res.error) {
        data = res.data;
        loiCuoi = null;
        break;
      }
      loiCuoi = res.error;
      await cho(500 * 2 ** lan); // 500ms, 1s, 2s, 4s
    }
    if (loiCuoi) throw loiCuoi;
    if (!data || data.length === 0) break;
    ket.push(...data);
    if (data.length < TRANG_LIET_KE) break;
    offset += TRANG_LIET_KE;
  }
  return ket;
}

/**
 * Duyệt TOÀN BỘ bucket (2 tầng: thư mục rồi tệp — mục con của gốc là
 * "thư mục" tên photoId hoặc "icon"; mục con của "icon" là thư mục con
 * galleryId; mục con của các thư mục lá là TỆP). Supabase Storage `list()`
 * không phân biệt "thư mục" hay "tệp" thật — một mục là thư mục nếu
 * `metadata` là null.
 */
/** Số lượt gọi `list()` chạy song song khi duyệt hàng nghìn thư mục photoId — xem chú thích ở `duyetToanBoBucket`. */
export const SO_SONG_SONG_DUYET = 10;

export async function duyetToanBoBucket(
  client: ClientDuyet,
  ghiTienDo?: (soThuMucDaXong: number) => void,
): Promise<DoiTuong[]> {
  const goc = await danhSachThuMuc(client, "");
  const doiTuongs: DoiTuong[] = [];
  let soThuMucDaXong = 0;

  const mucTep = goc.filter((m) => m.metadata);
  // Tệp nằm thẳng ở gốc — không đúng quy ước, nhưng vẫn tính là rác nếu rơi
  // vào bộ lọc (an toàn hơn bỏ sót).
  for (const m of mucTep) doiTuongs.push({ path: m.name, size: m.metadata?.size ?? 0 });

  const mucThuMuc = goc.filter((m) => !m.metadata);

  // Bucket có thể có hàng nghìn thư mục photoId — duyệt TUẦN TỰ từng cái một
  // sẽ rất chậm (mỗi thư mục = 1 lượt gọi mạng). Chạy SONG SONG có giới hạn
  // (cùng kiểu giới hạn như `SO_SONG_SONG_TOI_DA_LAM_NONG` ở
  // `lam-nong-cache.ts`), không bắn hết một lúc.
  let idx = 0;
  const thuMucLoi: string[] = [];
  async function xuLyMotThuMuc(muc: StorageListItem): Promise<void> {
    try {
      if (muc.name === "icon") {
        const galleryFolders = await danhSachThuMuc(client, "icon");
        for (const gFolder of galleryFolders) {
          if (gFolder.metadata) {
            doiTuongs.push({ path: `icon/${gFolder.name}`, size: gFolder.metadata.size ?? 0 });
            continue;
          }
          const tepIcon = await danhSachThuMuc(client, `icon/${gFolder.name}`);
          for (const t of tepIcon) {
            doiTuongs.push({ path: `icon/${gFolder.name}/${t.name}`, size: t.metadata?.size ?? 0 });
          }
        }
      } else {
        const tepAnh = await danhSachThuMuc(client, muc.name);
        for (const t of tepAnh) {
          doiTuongs.push({ path: `${muc.name}/${t.name}`, size: t.metadata?.size ?? 0 });
        }
      }
    } catch (err) {
      // Một thư mục lỗi (kể cả sau khi đã thử lại ở danhSachThuMuc) KHÔNG
      // được phép làm mất trắng kết quả của hàng nghìn thư mục còn lại —
      // ghi lại, BỎ QUA thư mục đó, chạy tiếp. Đo thật: duyệt ~15.000 đối
      // tượng dễ gặp vài lượt Gateway Timeout thoáng qua giữa chừng.
      thuMucLoi.push(muc.name);
      console.error(`  LỖI (bỏ qua) ${muc.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
    soThuMucDaXong++;
    if (ghiTienDo && soThuMucDaXong % 200 === 0) ghiTienDo(soThuMucDaXong);
  }

  await Promise.all(
    Array.from({ length: Math.min(SO_SONG_SONG_DUYET, mucThuMuc.length) }, async () => {
      while (idx < mucThuMuc.length) {
        const muc = mucThuMuc[idx++];
        if (muc) await xuLyMotThuMuc(muc);
      }
    }),
  );

  if (thuMucLoi.length > 0) {
    console.error(
      `\n${thuMucLoi.length} thư mục LỖI, đã BỎ QUA (không tính vào kết quả — chạy lại lệnh để thử lại riêng các thư mục này nếu cần).`,
    );
  }

  return doiTuongs;
}

/** Xoá theo lô (Storage `remove()` nhận mảng, chia nhỏ để tránh payload quá lớn). */
export async function xoaTheoLo(client: ClientDuyet, paths: string[], kichThuocLo = 200): Promise<number> {
  let soDaXoa = 0;
  for (let i = 0; i < paths.length; i += kichThuocLo) {
    const lo = paths.slice(i, i + kichThuocLo);
    const { error } = await client.storage.from(TEN_BUCKET).remove(lo);
    if (error) throw error;
    soDaXoa += lo.length;
  }
  return soDaXoa;
}

// ============================================================================
// CLI
// ============================================================================

async function main(): Promise<void> {
  const argv = process.argv.slice(2).filter((a) => a !== "--"); // xem chú thích đầu tệp về "--"
  const ghiThat = argv.includes("--write");
  const tatCaNho = argv.includes("--tat-ca-nho");
  const tatCa = argv.includes("--tat-ca");

  if (tatCaNho && tatCa) {
    console.error("Chỉ chọn MỘT trong --tat-ca-nho hoặc --tat-ca, không phải cả hai.");
    process.exit(2);
  }
  const cheDo: CheDo = tatCa ? "tat_ca" : tatCaNho ? "nho" : "hong";

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY. Kiểm tra .env.local.");
    process.exit(2);
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as ClientDuyet;

  const tenCheDo = { hong: "đối tượng HỎNG (< 1KB)", nho: "đối tượng CỠ NHỎ CŨ (200/400/800w)", tat_ca: "TOÀN BỘ bucket" }[
    cheDo
  ];
  console.log(`Đang duyệt bucket "${TEN_BUCKET}" — chế độ: ${tenCheDo}${ghiThat ? " — SẼ XOÁ THẬT" : " — chỉ xem trước"}...`);

  const tatCaDoiTuong = await duyetToanBoBucket(client, (n) => console.log(`  ... đã duyệt ${n} thư mục`));
  const canXoa = locDoiTuongCanXoa(tatCaDoiTuong, cheDo);
  const tongMB = formatMB(tongByte(canXoa));

  console.log(`\nTổng đối tượng trong bucket: ${tatCaDoiTuong.length}`);
  console.log(`Đối tượng khớp bộ lọc (${tenCheDo}): ${canXoa.length} — ${tongMB} MB`);

  if (canXoa.length > 0 && canXoa.length <= 50) {
    console.log("\nĐường dẫn:");
    for (const d of canXoa) console.log(`   ${d.path} (${d.size} byte)`);
  } else if (canXoa.length > 50) {
    console.log(`\n(${canXoa.length} đường dẫn — không in hết, quá dài. In 20 dòng đầu:)`);
    for (const d of canXoa.slice(0, 20)) console.log(`   ${d.path} (${d.size} byte)`);
  }

  if (!ghiThat) {
    console.log("\nCHỈ XEM TRƯỚC — chưa xoá gì. Thêm --write để xoá thật.");
    return;
  }

  if (canXoa.length === 0) {
    console.log("\nKhông có gì để xoá.");
    return;
  }

  const soDaXoa = await xoaTheoLo(
    client,
    canXoa.map((d) => d.path),
  );
  console.log(`\nĐã xoá ${soDaXoa} đối tượng, giải phóng ~${tongMB} MB.`);
}

const chayTrucTiep =
  process.argv[1] &&
  (process.argv[1].endsWith("don-dem-hong.ts") || process.argv[1].endsWith("don-dem-hong.mjs"));
if (chayTrucTiep) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
