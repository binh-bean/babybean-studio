/**
 * BB-351 — hàng đợi `settings.lark_hook_queue` của hook Lark: CHỈ rút một bản ghi
 * ra khỏi hàng đợi SAU KHI đã xử lý xong nó.
 *
 * Lỗi cũ (vòng 7, người soát C, ca c3): hook đọc hàng đợi rồi ghi đè `[]` NGAY, trước
 * khi gọi Lark. Lark hỏng giữa chừng (503, hết giờ hàm…) là mọi bản ghi đang chờ mất
 * hẳn, mà route vẫn trả 200 nên Lark không gửi lại. Tin báo mốc cho khách (chỉ hook
 * gửi) của các bản ghi đó mất theo.
 *
 * Luật mới:
 *   1. Bản ghi Lark vừa đẩy sang được GHI VÀO hàng đợi trước tiên — hàm chết giữa
 *      chừng (hết 60 giây) thì nó vẫn còn đó.
 *   2. Xử lý từng bản ghi (dựng bộ ảnh + trạng thái hậu kỳ + báo mốc).
 *   3. Chỉ những bản ghi xong trọn mới được XOÁ KHỎI hàng đợi, bằng một câu `update`
 *      nguyên tử trên đúng dòng `settings` (không ghi đè cả mảng) — bản ghi khác vừa
 *      được thêm vào giữa chừng không bị cuốn theo.
 *   4. Bản ghi hỏng ở lại, tăng `so_lan_loi`. Hỏng tới `SO_LAN_LOI_TOI_DA` lần thì bỏ
 *      ra (ghi log `lark.hook.bo_ban_ghi_hong`) để một dòng Lark đã xoá không kẹt
 *      hàng đợi mãi.
 *   5. Lượt hook kế tiếp và cron 08:00 (`/api/cron/hau-ky`) cùng rút phần còn lại.
 *
 * `khoa` là tên dòng trong `settings`; mặc định là hàng đợi thật. Phép thử trên bb-dev
 * truyền một khoá "fixture_bb351_…" riêng để không bao giờ đụng hàng đợi thật.
 */
import type pg from "pg";
import {
  larkAuth,
  readLarkRecord,
  syncSingleRetouchRecord,
  type BranchLookup,
} from "@/lib/lark/sync-retouch";
import { taoDocMotBanGhi } from "@/lib/lark/doc-trang-thai-lark";
import { capNhatTrangThaiTuHook } from "@/lib/lark/cap-nhat-tu-hook";
import { ghiBanGhiMoi } from "@/lib/lark/ban-ghi-moi";
import { baoHinhDaVe } from "@/lib/thong-bao/bao-hinh-da-ve";
import { baoMocKhach } from "@/lib/thong-bao/bao-moc-khach";
import { phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";

/** Khoá tư vấn chung của hook, cron sync-lark và phần rút hàng đợi của cron 08:00. */
export const KHOA_HOOK_LARK = 152111;
export const KHOA_HANG_DOI = "lark_hook_queue";
/** Hỏng chừng này lượt liên tiếp thì bỏ bản ghi ra khỏi hàng đợi. */
export const SO_LAN_LOI_TOI_DA = 5;

type Pg = pg.Client | pg.PoolClient;

export interface HangDoi {
  recordIds: string[];
  soLanLoi: Record<string, number>;
}

/** Thêm bản ghi vào hàng đợi (nguyên tử; tạo dòng nếu chưa có). Không thêm trùng. */
export async function themVaoHangDoi(client: Pg, ids: string[], khoa = KHOA_HANG_DOI): Promise<void> {
  if (ids.length === 0) return;
  await client.query(
    `/* hang_doi:them */
     insert into settings (key, value)
     values ($1, jsonb_build_object('record_ids', to_jsonb($2::text[])))
     on conflict (key, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid))
     do update set value = jsonb_set(
       settings.value,
       '{record_ids}',
       coalesce(settings.value->'record_ids', '[]'::jsonb)
         || coalesce((select jsonb_agg(m) from unnest($2::text[]) m
                       where not coalesce(settings.value->'record_ids', '[]'::jsonb) ? m), '[]'::jsonb)
     )`,
    [khoa, ids],
  );
}

export async function docHangDoi(client: Pg, khoa = KHOA_HANG_DOI): Promise<HangDoi> {
  const { rows } = await client.query(
    `/* hang_doi:doc */ select value from settings where key = $1 and branch_id is null`,
    [khoa],
  );
  const v = (rows[0]?.value ?? {}) as { record_ids?: unknown; so_lan_loi?: unknown };
  const recordIds = Array.isArray(v.record_ids) ? v.record_ids.filter((x): x is string => typeof x === "string") : [];
  const soLanLoi: Record<string, number> = {};
  if (v.so_lan_loi && typeof v.so_lan_loi === "object") {
    for (const [k, n] of Object.entries(v.so_lan_loi as Record<string, unknown>)) {
      if (typeof n === "number" && Number.isFinite(n)) soLanLoi[k] = n;
    }
  }
  return { recordIds: [...new Set(recordIds)], soLanLoi };
}

/** Rút các bản ghi đã xử lý xong (hoặc bị bỏ) ra khỏi hàng đợi — nguyên tử, không ghi đè cả mảng. */
export async function xoaKhoiHangDoi(client: Pg, ids: string[], khoa = KHOA_HANG_DOI): Promise<void> {
  if (ids.length === 0) return;
  await client.query(
    `/* hang_doi:xoa */
     update settings set value = value || jsonb_build_object(
       'record_ids', coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(value->'record_ids', '[]'::jsonb)) x
                                where (x #>> '{}') <> all($2::text[])), '[]'::jsonb),
       'so_lan_loi', coalesce(value->'so_lan_loi', '{}'::jsonb) - $2::text[]
     )
     where key = $1 and branch_id is null`,
    [khoa, ids],
  );
}

/** Ghi số lần hỏng mới cho các bản ghi (gộp vào `so_lan_loi`, không đụng `record_ids`). */
export async function ghiSoLanLoi(client: Pg, soLan: Record<string, number>, khoa = KHOA_HANG_DOI): Promise<void> {
  if (Object.keys(soLan).length === 0) return;
  await client.query(
    `/* hang_doi:loi */
     update settings set value = jsonb_set(value, '{so_lan_loi}', coalesce(value->'so_lan_loi', '{}'::jsonb) || $2::jsonb)
     where key = $1 and branch_id is null`,
    [khoa, JSON.stringify(soLan)],
  );
}

export interface KetQuaXuLyHangDoi {
  /** Kết quả dựng bộ ảnh từng bản ghi (giữ dạng cũ của hook). */
  results: Array<{ record_id: string; result?: unknown; error?: string }>;
  trangThai: Awaited<ReturnType<typeof capNhatTrangThaiTuHook>> | null;
  daXong: string[];
  /** Bản ghi hỏng, CÒN trong hàng đợi chờ lượt sau. */
  conLai: string[];
  /** Bản ghi hỏng quá `SO_LAN_LOI_TOI_DA` lần, đã bỏ ra. */
  boQua: string[];
  loiChung: string | null;
}

/**
 * Xử lý `recordIds` (đã nằm trong hàng đợi) rồi rút đúng những bản ghi xong trọn.
 * Gọi khi ĐANG GIỮ khoá `KHOA_HOOK_LARK`. Không ném: lỗi Lark/DB trả về trong `loiChung`.
 */
export async function xuLyHangDoiHook(opts: {
  client: pg.Client;
  recordIds: string[];
  appId: string;
  appSecret: string;
  baseToken: string;
  dbUrl: string;
  khoa?: string;
}): Promise<KetQuaXuLyHangDoi> {
  const { client, appId, appSecret, baseToken, dbUrl } = opts;
  const khoa = opts.khoa ?? KHOA_HANG_DOI;
  const ids = [...new Set(opts.recordIds)];
  const results: KetQuaXuLyHangDoi["results"] = [];
  const hong = new Set<string>();
  let trangThai: KetQuaXuLyHangDoi["trangThai"] = null;
  let loiChung: string | null = null;

  try {
    const { rows: branchRows } = await client.query<BranchLookup & { id: string; code: string; name: string }>(
      `select id, code, name from branches where is_active = true`,
    );
    const { rows: staffRows } = await client.query<{ id: string; fullName: string; role: string }>(
      `select id, full_name as "fullName", role from staff_profiles where is_active = true`,
    );
    const auth = await larkAuth(appId, appSecret);

    for (const rId of ids) {
      try {
        const { record } = await readLarkRecord(auth, baseToken, /h[aậ]u\s*k[yỳ]/i, rId);
        const res = await syncSingleRetouchRecord({
          client,
          record,
          branches: branchRows,
          staffList: staffRows,
          write: true,
          index: 0,
          dbUrl,
        });
        results.push({ record_id: rId, result: res });
        // BB-332 — dòng mới vào khối "Bản ghi mới từ Lark". Hỏng chỉ ghi log (việc phụ).
        try {
          await ghiBanGhiMoi(client, record, branchRows, dbUrl);
        } catch (err) {
          console.error(`[Lark Hook] Không ghi được bản ghi mới ${rId}:`, err);
        }
      } catch (err) {
        console.error(`[Lark Hook] Lỗi xử lý bản ghi ${rId}:`, err);
        results.push({ record_id: rId, error: String(err) });
        hong.add(rId);
      }
    }

    // BB-252/347 — trạng thái hậu kỳ + báo mốc cho khách. Một bản ghi đọc trạng thái
    // hỏng thì giữ nó lại trong hàng đợi (mốc của khách chỉ hook gửi).
    const docThat = await taoDocMotBanGhi({ auth, baseToken });
    const xong = ids.filter((id) => !hong.has(id));
    trangThai = await capNhatTrangThaiTuHook({
      client,
      recordIds: xong,
      docMotBanGhi: async (id) => {
        try {
          return await docThat(id);
        } catch (err) {
          hong.add(id);
          throw err;
        }
      },
      bao: baoHinhDaVe,
      baoMoc: baoMocKhach,
      phat: (suKien) => phatSuKienBoAnh(suKien),
    });
  } catch (err) {
    // Lark hoặc DB hỏng ở giữa: KHÔNG bản ghi nào được coi là xong — tất cả ở lại.
    loiChung = err instanceof Error ? err.message : String(err);
    console.error("[Lark Hook] Lỗi xử lý hàng đợi:", err);
    for (const id of ids) hong.add(id);
  }

  const daXong = ids.filter((id) => !hong.has(id));
  const conLai: string[] = [];
  const boQua: string[] = [];
  try {
    await xoaKhoiHangDoi(client, daXong, khoa);
    if (hong.size > 0) {
      const { soLanLoi } = await docHangDoi(client, khoa);
      const moi: Record<string, number> = {};
      for (const id of hong) {
        const n = (soLanLoi[id] ?? 0) + 1;
        if (n >= SO_LAN_LOI_TOI_DA) boQua.push(id);
        else {
          moi[id] = n;
          conLai.push(id);
        }
      }
      await ghiSoLanLoi(client, moi, khoa);
      if (boQua.length > 0) {
        await xoaKhoiHangDoi(client, boQua, khoa);
        console.error(JSON.stringify({ evt: "lark.hook.bo_ban_ghi_hong", recordIds: boQua, soLan: SO_LAN_LOI_TOI_DA }));
      }
    }
  } catch (err) {
    // Không cập nhật được hàng đợi: bản ghi xong vẫn nằm lại → lượt sau xử lại (vô hại,
    // dựng bộ ảnh và báo mốc đều chống lặp). Không bao giờ làm MẤT bản ghi.
    console.error("[Lark Hook] Không cập nhật được hàng đợi:", err);
    if (!loiChung) loiChung = err instanceof Error ? err.message : String(err);
  }

  return { results, trangThai, daXong, conLai, boQua, loiChung };
}

/**
 * Cron 08:00 — rút phần còn lại của hàng đợi (Lark hỏng lúc hook chạy, hàm hết giờ…).
 * Chạy TRƯỚC lượt đọc trạng thái toàn bảng của cron: nếu chạy sau, trạng thái đã ghi
 * rồi thì không còn "đổi thật" nữa và mốc báo khách của các bản ghi này mất hẳn.
 * Hook đang chạy (khoá bận) thì bỏ qua — chính hook sẽ rút.
 */
export async function rutHangDoiHook(opts: {
  client: pg.Client;
  appId: string;
  appSecret: string;
  baseToken: string;
  dbUrl: string;
  khoa?: string;
}): Promise<{ khongChay: string } | { soBanGhi: 0 } | (Omit<KetQuaXuLyHangDoi, "results" | "trangThai"> & { soBanGhi: number })> {
  const { rows } = await opts.client.query("select pg_try_advisory_lock($1) as ok", [KHOA_HOOK_LARK]);
  if (!rows[0]?.ok) return { khongChay: "Hook Lark đang chạy" };
  try {
    const { recordIds } = await docHangDoi(opts.client, opts.khoa);
    if (recordIds.length === 0) return { soBanGhi: 0 };
    const kq = await xuLyHangDoiHook({ ...opts, recordIds });
    return { soBanGhi: recordIds.length, daXong: kq.daXong, conLai: kq.conLai, boQua: kq.boQua, loiChung: kq.loiChung };
  } finally {
    await opts.client.query("select pg_advisory_unlock($1)", [KHOA_HOOK_LARK]).catch(() => {});
  }
}
