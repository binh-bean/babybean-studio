/**
 * BB-376 — neo bộ ảnh vào dòng Hậu Kỳ (galleries.lark_hauky_record_id).
 *
 * Nguyên nhân gốc: `syncSingleRetouchRecord` (hook Lark + cron hậu kỳ + nút
 * "Đồng bộ ngay") tạo bộ ảnh mà KHÔNG ghi `lark_hauky_record_id`, nên khối "Bản ghi
 * mới từ Lark" không biết dòng đã thành bộ, việc ghi Link app / Link quản lý lên
 * Lark không biết ghi vào dòng nào, và script điền SĐT phải tra theo mã hoá đơn.
 * Đường tạo bằng tay (POST galleries, gắn dòng) thì có ghi.
 *
 * Luật neo:
 *   - bộ CHƯA neo → ghi mã dòng (chỉ khi cột còn trống — câu lệnh có `is null`);
 *   - bộ đã neo ĐÚNG dòng này → giữ;
 *   - bộ đã neo dòng KHÁC → KHÔNG đổi (một thư mục ảnh có thể gom nhiều dòng, dòng
 *     đầu tiên là dòng neo — migration 0028) → ghi nhật ký `gallery.lark_dong_lech`
 *     một lần cho mỗi cặp (bộ, dòng) để nhân viên xem;
 *   - (bộ MỚI tạo thì `syncSingleRetouchRecord` ghi thẳng trong câu insert.)
 *   - lỗi (kể cả vướng ràng buộc duy nhất nếu sau này cột này có) → trả "loi",
 *     KHÔNG ném, để lượt đồng bộ không hỏng vì việc phụ.
 */
import type pg from "pg";
import { tachMaHoaDon } from "@/lib/utils/ma-hoa-don";

type Client = pg.Client | pg.PoolClient;

export type KetQuaNeoDong = "neo" | "da_neo_dung" | "lech" | "loi";

export async function neoBoAnhVaoDongHauKy(
  client: Client,
  opts: { galleryId: string; recordId: string; ghi?: boolean },
): Promise<KetQuaNeoDong> {
  const ghi = opts.ghi ?? true;
  if (!opts.recordId) return "loi";
  // Gọi NGOÀI giao dịch (mỗi câu lệnh tự chốt) nên một lỗi ở đây không kéo theo ai.
  try {
    const { rows } = await client.query<{ lark_hauky_record_id: string | null; branch_id: string | null }>(
      `select lark_hauky_record_id, branch_id from galleries where id = $1`,
      [opts.galleryId],
    );
    const g = rows[0];
    if (!g) return "loi";
    const dangNeo = (g.lark_hauky_record_id ?? "").trim();
    let kq: KetQuaNeoDong;
    if (!dangNeo) {
      if (!ghi) kq = "neo";
      else {
        const r = await client.query(
          `update galleries set lark_hauky_record_id = $2
            where id = $1 and (lark_hauky_record_id is null or btrim(lark_hauky_record_id) = '')`,
          [opts.galleryId, opts.recordId],
        );
        kq = (r.rowCount ?? 0) > 0 ? "neo" : "da_neo_dung";
      }
    } else if (dangNeo === opts.recordId) {
      kq = "da_neo_dung";
    } else {
      if (ghi) {
        await client.query(
          `insert into activity_logs (actor_type, actor_label, branch_id, action, entity_type, entity_id, metadata)
           select 'system', 'Đồng bộ Lark', $1::uuid, 'gallery.lark_dong_lech', 'gallery', $2::uuid, $3::jsonb
            where not exists (
              select 1 from activity_logs
               where action = 'gallery.lark_dong_lech' and entity_id = $2::uuid
                 and metadata->>'dongLarkMoi' = $4::text)`,
          [
            g.branch_id,
            opts.galleryId,
            JSON.stringify({ dongDangNeo: dangNeo, dongLarkMoi: opts.recordId, canNhanVienXacNhan: true }),
            opts.recordId,
          ],
        );
      }
      kq = "lech";
    }
    return kq;
  } catch (err) {
    console.error(`[neo-dong-hau-ky] Không neo được bộ ${opts.galleryId}:`, err);
    return "loi";
  }
}

// ---------------------------------------------------------------------------
// Điền bù cho bộ đang trống lark_hauky_record_id (scripts/neo-dong-hau-ky.mjs)
// ---------------------------------------------------------------------------

/** Một dòng Hậu Kỳ khớp mã hoá đơn: mã dòng + ô "Link ảnh gửi khách" (để thu hẹp khi nhiều dòng). */
export interface DongHauKyKhop {
  recordId: string;
  linkAnh: string;
}

export interface KetQuaNeoBu {
  /** Bộ chưa neo (không lưu trữ) có mã hoá đơn để tra. */
  boTrong: number;
  /** Sẽ neo (chạy thử) / đã neo (khi ghi) — khớp DUY NHẤT một dòng. */
  seNeo: number;
  /** Bộ không khớp duy nhất (nhiều dòng, hoặc một dòng đã bị bộ khác giành) — id rút gọn để người xem. */
  moHo: { galleryId: string; soDong: number; lyDo: string }[];
  /** Bộ không có mã hoá đơn, hoặc không thấy dòng nào trên Lark. */
  khongThay: number;
  daGhi: boolean;
}

/**
 * Tra theo MÃ HOÁ ĐƠN (đọc Lark, CHỈ ĐỌC): `docDongTheoMa` truyền từ ngoài vào
 * (script đọc Lark thật; phép thử giả lập). Chỉ neo khi khớp DUY NHẤT một dòng:
 * nhiều dòng thì thu hẹp theo thư mục Drive của bộ; vẫn nhiều → mơ hồ, liệt kê.
 * Mặc định CHẠY THỬ (ghi = false).
 */
export async function dienBuNeoDongHauKy(
  client: Client,
  opts: {
    docDongTheoMa: (cacMa: string[]) => Promise<Map<string, DongHauKyKhop[]>>;
    ghi: boolean;
    /** Phạm vi (phép thử chỉ chạm bộ Fixture của mình). */
    chiBo?: string[];
  },
): Promise<KetQuaNeoBu> {
  const { rows } = await client.query<{
    id: string;
    drive_folder_id: string | null;
    lark_contract_code: string | null;
    lark_contract_codes: string[] | null;
    title: string | null;
  }>(
    `select id, drive_folder_id, lark_contract_code, lark_contract_codes, title
       from galleries
      where (lark_hauky_record_id is null or btrim(lark_hauky_record_id) = '')
        and status <> 'archived'
        and ($1::uuid[] is null or id = any($1::uuid[]))`,
    [opts.chiBo ?? null],
  );
  const kq: KetQuaNeoBu = { boTrong: 0, seNeo: 0, moHo: [], khongThay: 0, daGhi: opts.ghi };
  const bo = rows
    .map((r) => ({
      id: r.id,
      folder: r.drive_folder_id ?? "",
      mas: tachMaHoaDon(...(r.lark_contract_codes ?? []), r.lark_contract_code ?? "", r.title ?? ""),
    }))
    .filter((r) => r.mas.length > 0);
  kq.boTrong = bo.length;
  if (bo.length === 0) return kq;
  const theoMa = await opts.docDongTheoMa([...new Set(bo.flatMap((b) => b.mas))]);

  // Bước 1: mỗi bộ → tập dòng ứng viên (hợp theo mọi mã, bỏ trùng; thu hẹp theo thư mục khi nhiều).
  const chon = new Map<string, string>(); // galleryId → recordId
  for (const b of bo) {
    const dong = new Map<string, DongHauKyKhop>();
    for (const ma of b.mas) for (const d of theoMa.get(ma) ?? []) dong.set(d.recordId, d);
    if (dong.size === 0) {
      kq.khongThay++;
      continue;
    }
    let ungVien = [...dong.values()];
    if (ungVien.length > 1 && b.folder) {
      const hep = ungVien.filter((d) => d.linkAnh.includes(b.folder));
      if (hep.length >= 1) ungVien = hep;
    }
    if (ungVien.length !== 1) {
      kq.moHo.push({ galleryId: b.id.slice(0, 8), soDong: ungVien.length, lyDo: "nhieu_dong" });
      continue;
    }
    chon.set(b.id, ungVien[0]!.recordId);
  }
  // Bước 2: một dòng bị nhiều bộ cùng nhận → không đoán.
  const dem = new Map<string, number>();
  for (const rec of chon.values()) dem.set(rec, (dem.get(rec) ?? 0) + 1);
  for (const [galleryId, rec] of chon) {
    if ((dem.get(rec) ?? 0) > 1) {
      kq.moHo.push({ galleryId: galleryId.slice(0, 8), soDong: 1, lyDo: "dong_chung_nhieu_bo" });
      continue;
    }
    const r = await neoBoAnhVaoDongHauKy(client, { galleryId, recordId: rec, ghi: opts.ghi });
    if (r === "neo") kq.seNeo++;
  }
  return kq;
}
