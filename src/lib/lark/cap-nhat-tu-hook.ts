/**
 * BB-252 — cập nhật trạng thái hậu kỳ NGAY khi Lark đẩy một bản ghi sang
 * (/api/lark/hook), và báo ba mẹ nếu bộ ảnh vừa sang "Hình đã về".
 *
 * BB-347 — thêm hai việc, đều chỉ khi cột "Trạng Thái" ĐỔI THẬT:
 *   1. Phát tín hiệu tức thì `lark.trang_thai` (kênh khách của bộ ảnh + kênh
 *      nhân viên của chi nhánh) để màn đang mở tự tải lại. Không đổi = không phát.
 *   2. Báo ba mẹ (chuông + đẩy) ở hai mốc mới: "Đã xác nhận danh sách" (Lark →
 *      "Đã chọn hình") và "Đang chỉnh sửa" (Lark → "Đang làm"). Mỗi mốc đúng một
 *      lần cho mỗi bộ ảnh (xem `daBaoMoc`). KHÔNG báo "Đã giao".
 *
 * Trước đây trạng thái Lark chỉ được đọc lúc 08:00 (cron hậu kỳ), nên nhân viên
 * đổi "Hình đã về" lúc 9h sáng thì sáng HÔM SAU ba mẹ mới nhận tin. Cron vẫn giữ
 * làm lưới đỡ khi Lark đẩy hụt: hook đã ghi mã mới rồi thì sáng hôm sau cron
 * thấy 9 → 9, không báo lần hai (vuaSangHinhDaVe).
 *
 * Hàm nhận cách đọc Lark, cách báo và cách phát từ ngoài vào để phép thử chạy
 * trên bộ Fixture mà không gọi Lark, máy chủ push hay Realtime thật.
 */
import type pg from "pg";
import { ghiTrangThaiVaoGalleries, type TrangThaiDoc } from "@/lib/lark/doc-trang-thai-lark";
import { LOAI_DA_BAO, mocCanBaoKhach, type MocBaoKhach } from "@/lib/thong-bao/moc-khach";
import { LOAI_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";

/**
 * Bộ ảnh này đã có tin của mốc `moc` trong hộp thư khách (`thong_bao_khach`)
 * chưa. Cùng nguồn sự thật với chuông của khách, nên dù tin đi từ hook, từ nút
 * trong app hay từ lượt chạy lại, mỗi mốc vẫn chỉ một lần.
 *
 * Không đọc được bảng → coi là ĐÃ báo (thà lỡ một tin còn hơn báo lặp), ghi log.
 */
async function daBaoMoc(
  client: pg.Client | pg.PoolClient,
  galleryId: string,
  moc: MocBaoKhach,
): Promise<boolean> {
  try {
    const { rows } = await client.query(
      `select 1 from thong_bao_khach where gallery_id = $1 and loai = any($2::text[]) limit 1`,
      [galleryId, LOAI_DA_BAO[moc]],
    );
    return rows.length > 0;
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "lark.hook.kiem_da_bao_loi",
        galleryId,
        moc,
        loi: err instanceof Error ? err.message : String(err),
      }),
    );
    return true;
  }
}

export async function capNhatTrangThaiTuHook(opts: {
  client: pg.Client | pg.PoolClient;
  recordIds: string[];
  docMotBanGhi: (recordId: string) => Promise<TrangThaiDoc | null>;
  /** Báo "Hình đã về" (BB-250/252). */
  bao: (galleryId: string) => Promise<void>;
  /** BB-347 — báo hai mốc mới (chuông + đẩy). */
  baoMoc: (galleryId: string, moc: MocBaoKhach) => Promise<void>;
  /** BB-347 — phát tín hiệu tức thì (phatSuKienBoAnh). Không được ném. */
  phat: (suKien: { galleryId: string; branchId: string | null; loai: string }) => Promise<unknown>;
}): Promise<{
  doc: number;
  doi: number;
  baoHinhDaVe: number;
  phatTrangThai: number;
  baoDaXacNhan: number;
  baoDangChinhSua: number;
}> {
  const doc = new Map<string, TrangThaiDoc>();
  for (const id of opts.recordIds) {
    try {
      const tt = await opts.docMotBanGhi(id);
      if (tt) doc.set(id, tt);
    } catch (err) {
      // Một bản ghi đọc hỏng không được chặn các bản ghi còn lại trong hàng đợi.
      console.error(`[Lark Hook] Không đọc được trạng thái bản ghi ${id}:`, err);
    }
  }
  const khong = { doc: 0, doi: 0, baoHinhDaVe: 0, phatTrangThai: 0, baoDaXacNhan: 0, baoDangChinhSua: 0 };
  if (doc.size === 0) return khong;
  const { sangHinhDaVe, doiTrangThai, ...ghi } = await ghiTrangThaiVaoGalleries(opts.client, doc);

  // 1. Mọi lần đổi thật → màn đang mở tự tải lại. Một bộ hỏng không chặn bộ khác.
  let phatTrangThai = 0;
  for (const d of doiTrangThai) {
    try {
      await opts.phat({ galleryId: d.galleryId, branchId: d.branchId, loai: LOAI_TUC_THI.larkTrangThai });
      phatTrangThai++;
    } catch (err) {
      console.error(`[Lark Hook] Không phát được tín hiệu cho bộ ${d.galleryId.slice(0, 8)}:`, err);
    }
  }

  // 2a. "Hình đã về" — như cũ.
  for (const galleryId of sangHinhDaVe) await opts.bao(galleryId);

  // 2b. Hai mốc mới, mỗi mốc một lần.
  let baoDaXacNhan = 0;
  let baoDangChinhSua = 0;
  for (const d of doiTrangThai) {
    const moc = mocCanBaoKhach(d);
    if (!moc) continue;
    if (await daBaoMoc(opts.client, d.galleryId, moc)) continue;
    await opts.baoMoc(d.galleryId, moc);
    if (moc === "da_xac_nhan_danh_sach") baoDaXacNhan++;
    else baoDangChinhSua++;
  }

  return {
    doc: ghi.doc,
    doi: ghi.doi,
    baoHinhDaVe: sangHinhDaVe.length,
    phatTrangThai,
    baoDaXacNhan,
    baoDangChinhSua,
  };
}
