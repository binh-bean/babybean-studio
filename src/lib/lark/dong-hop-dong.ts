/**
 * BB-331 — kéo DÒNG HỢP ĐỒNG (gallery_items) của MỘT bộ ảnh từ hóa đơn Lark,
 * ngay sau khi bộ được tạo/gắn vào dòng Hậu Kỳ (BB-325).
 *
 * Anh 30/09: gắn Lark xong, màn chi tiết vẫn "Chưa có dòng hàng nào" và hạn
 * mức trống — phải nhập tay. Nguyên nhân: dòng hợp đồng chỉ được kéo bởi
 * script chạy tay `scripts/sync-lark-contracts.mjs` (BB-100), không route nào
 * gọi nó. Tệp này là bản chạy trong app của ĐÚNG luật đó, cho một bộ:
 *
 *   Hóa Đơn Chi Tiết   dòng cha (mang tiền), khớp "Hóa Đơn" == mã hợp đồng
 *     Chi Tiết Gói Chụp dòng con, khớp "Hợp đồng chi tiet liên quan" == mã dòng cha
 *
 * Hạn mức không ghi riêng: `app.gallery_quota(g.id)` tự tính từ các dòng này
 * (gói → số file chỉnh sửa), nên kéo dòng về là hạn mức có ngay.
 *
 * Khác script: không đọc HẾT hai bảng (9.600+ dòng, ~20 lượt gọi) mà lọc thô
 * bằng API search trên ô công thức ("Mã Hóa Đơn Chi Tiết" chứa "<mã>_", "Ma
 * Hoa Don" là "<mã>" — đo thật 30/09: 7 và 5 dòng, ~1 giây), rồi đọc lại từng
 * dòng bằng API bản ghi và so khớp CHÍNH XÁC ở đây — "contains" của Lark coi
 * "#57" khớp "#572".
 *
 * CHỈ ĐỌC Lark. Ghi vào app: xoá-rồi-ghi-lại các dòng CỦA HỢP ĐỒNG NÀY, giữ
 * nguyên dòng CSKH đã sửa tay (BB-313 mục 2) — cùng luật `writeGallery` của
 * script.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { larkAuth, HOST, cellText, type LarkRecord } from "@/lib/lark/sync-retouch";
import { dangChayPhepThu } from "@/lib/kiem-thu";

const BANG_DONG_CHA = /h[oó]a đơn chi ti[eế]t/i;
const BANG_DONG_CON = /chi ti[eế]t g[oó]i ch[uụ]p/i;

export interface DongConHopDong {
  larkRecordId: string;
  productId: string;
  quantity: number;
}
export interface DongChaHopDong {
  larkRecordId: string;
  productId: string;
  quantity: number;
  unitPrice: number | null;
  lineTotal: number | null;
  children: DongConHopDong[];
}

function cellNumber(value: unknown): number {
  return Number(String(cellText(value)).replace(/[^\d]/g, "")) || 0;
}

/** Mã bản ghi mà một ô liên kết trỏ tới (ô liên kết đọc bằng API bản ghi thường). */
export function linkedRecordIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => {
    if (!v || typeof v !== "object") return [];
    const o = v as { record_ids?: unknown; record_id?: unknown };
    if (Array.isArray(o.record_ids)) return o.record_ids.map(String);
    if (typeof o.record_id === "string") return [o.record_id];
    return [];
  });
}

/**
 * Cây dòng hợp đồng của MỘT mã — bản TS của `buildContractTree` trong
 * `scripts/sync-lark-contracts.mjs`. Thuần: không gọi mạng, không gọi DB.
 */
export function dungCayHopDong(
  maHopDong: string,
  dongCha: Pick<LarkRecord, "record_id" | "fields">[],
  dongCon: Pick<LarkRecord, "record_id" | "fields">[],
  sanPhamTheoLarkId: Map<string, string>,
): { parents: DongChaHopDong[]; unknownProducts: string[] } {
  const parents: DongChaHopDong[] = [];
  const unknown = new Set<string>();
  const mine = dongCha.filter((r) => cellText(r.fields["Hóa Đơn"]).trim() === maHopDong);
  for (const row of mine) {
    const f = row.fields;
    const lineCode = cellText(f["Mã Hóa Đơn Chi Tiết"]).trim();
    const spLark = linkedRecordIds(f["Chi Tiết SP / DV"])[0];
    const productId = spLark ? sanPhamTheoLarkId.get(spLark) : undefined;
    if (!productId) {
      unknown.add(cellText(f["Chi Tiết SP / DV"]).trim() || "(không tên)");
      continue;
    }
    const quantity = cellNumber(f["Số Lượng"]) || 1;
    const parent: DongChaHopDong = {
      larkRecordId: lineCode || row.record_id,
      productId,
      quantity,
      unitPrice: cellNumber(f["Giá niêm yết"]) || null,
      lineTotal: cellNumber(f["Giá chốt cuối"]) || cellNumber(f["Giá sau giảm"]) || null,
      children: [],
    };
    for (const comp of dongCon) {
      const cf = comp.fields;
      if (!lineCode || cellText(cf["Hợp đồng chi tiet liên quan"]).trim() !== lineCode) continue;
      const cLark = linkedRecordIds(cf["Sản Phẩm"])[0];
      const cId = cLark ? sanPhamTheoLarkId.get(cLark) : undefined;
      if (!cId) {
        unknown.add(cellText(cf["Sản Phẩm"]).trim() || "(không tên)");
        continue;
      }
      parent.children.push({
        larkRecordId: cellText(cf["Mã Chi Tiet goi chup"]).trim() || comp.record_id,
        productId: cId,
        quantity: cellNumber(cf["Số Lượng"]) || 1,
      });
    }
    parents.push(parent);
  }
  return { parents, unknownProducts: [...unknown] };
}

type Auth = { authorization: string };

async function timBang(auth: Auth, baseToken: string, mau: RegExp): Promise<string> {
  const res = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables?page_size=100`, {
    headers: { authorization: auth.authorization },
  });
  const json = (await res.json()) as { code: number; data?: { items?: { table_id: string; name: string }[] } };
  const bang = json.data?.items?.find((t) => mau.test(t.name));
  if (json.code !== 0 || !bang) throw new Error(`Không tìm thấy bảng ${mau} bên Lark`);
  return bang.table_id;
}

async function timRoiDoc(
  auth: Auth,
  baseToken: string,
  tableId: string,
  dieuKien: { field_name: string; operator: string; value: string[] },
): Promise<LarkRecord[]> {
  const res = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables/${tableId}/records/search?page_size=200`, {
    method: "POST",
    headers: { authorization: auth.authorization, "content-type": "application/json" },
    body: JSON.stringify({ filter: { conjunction: "and", conditions: [dieuKien] }, automatic_fields: false }),
  });
  const json = (await res.json()) as { code: number; msg?: string; data?: { items?: { record_id: string }[] } };
  if (json.code !== 0) throw new Error(`Lark từ chối tra cứu: ${json.msg ?? json.code}`);
  // API search trả ô liên kết/công thức theo hình dạng khác — đọc lại từng dòng (xem tra-hau-ky.ts).
  const ids = (json.data?.items ?? []).map((r) => r.record_id).slice(0, 60);
  const dong = await Promise.all(
    ids.map(async (id) => {
      const r = await fetch(
        `${HOST}/bitable/v1/apps/${baseToken}/tables/${tableId}/records/${encodeURIComponent(id)}`,
        { headers: { authorization: auth.authorization } },
      );
      const j = (await r.json()) as { code: number; data?: { record?: LarkRecord } };
      return j.code === 0 && j.data?.record ? { ...j.data.record, record_id: id } : null;
    }),
  );
  return dong.filter((r): r is LarkRecord => r !== null);
}

/** Mở phiên đọc (xác thực + tìm bảng một lần), trả hàm đọc cây theo mã. CHỈ ĐỌC. */
export async function moDocHopDong(appId: string, appSecret: string, baseToken: string) {
  const auth = await larkAuth(appId, appSecret);
  const [bangCha, bangCon] = await Promise.all([
    timBang(auth, baseToken, BANG_DONG_CHA),
    timBang(auth, baseToken, BANG_DONG_CON),
  ]);
  return async (ma: string, sanPhamTheoLarkId: Map<string, string>) => {
    const [dongCha, dongCon] = await Promise.all([
      timRoiDoc(auth, baseToken, bangCha, { field_name: "Mã Hóa Đơn Chi Tiết", operator: "contains", value: [`${ma}_`] }),
      timRoiDoc(auth, baseToken, bangCon, { field_name: "Ma Hoa Don", operator: "is", value: [ma] }),
    ]);
    return dungCayHopDong(ma, dongCha, dongCon, sanPhamTheoLarkId);
  };
}

export interface KetQuaDongHopDong {
  soDongGhi: number;
  soDongGiuNguyen: number;
  maKhongThay: string[];
  sanPhamChuaCo: string[];
}

/**
 * Kéo dòng hợp đồng cho `galleryId` từ Lark. Ném lỗi khi Lark/DB hỏng — nơi
 * gọi tự quyết (tạo/gắn bộ ảnh vẫn thành công, chỉ báo "chưa kéo được").
 */
export async function keoDongHopDongTuLark(admin: SupabaseClient, galleryId: string): Promise<KetQuaDongHopDong> {
  if (dangChayPhepThu()) throw new Error("Đang chạy phép thử — không gọi Lark thật.");
  const appId = process.env.LARK_APP_ID?.trim();
  const appSecret = process.env.LARK_APP_SECRET?.trim();
  const baseToken = process.env.LARK_BASE_APP_TOKEN?.trim();
  if (!appId || !appSecret || !baseToken) throw new Error("Chưa cấu hình kết nối Lark trên máy chủ.");

  const { data: g, error: eg } = await admin
    .from("galleries")
    .select("id, lark_contract_code, lark_contract_codes")
    .eq("id", galleryId)
    .maybeSingle();
  if (eg) throw eg;
  if (!g) throw new Error("Không tìm thấy bộ ảnh");
  const codes = ((g.lark_contract_codes as string[] | null)?.length
    ? (g.lark_contract_codes as string[])
    : [g.lark_contract_code as string | null]
  ).filter((m): m is string => !!m && m.trim() !== "");
  const kq: KetQuaDongHopDong = { soDongGhi: 0, soDongGiuNguyen: 0, maKhongThay: [], sanPhamChuaCo: [] };
  if (codes.length === 0) return kq;

  const { data: sp, error: esp } = await admin.from("products").select("id, lark_record_id").not("lark_record_id", "is", null);
  if (esp) throw esp;
  const sanPhamTheoLarkId = new Map((sp ?? []).map((p) => [String(p.lark_record_id), String(p.id)]));

  const doc = await moDocHopDong(appId, appSecret, baseToken);
  for (const ma of codes) {
    const { parents, unknownProducts } = await doc(ma, sanPhamTheoLarkId);
    kq.sanPhamChuaCo.push(...unknownProducts);
    if (parents.length === 0) {
      // Không thấy dòng nào bên Lark → KHÔNG xoá dòng đang có trong app.
      kq.maKhongThay.push(ma);
      continue;
    }
    await ghiDongHopDong(admin, galleryId, ma, parents, kq);
  }
  kq.sanPhamChuaCo = [...new Set(kq.sanPhamChuaCo)];
  return kq;
}

/** Cùng luật `writeGallery` của script: xoá dòng của hợp đồng này, giữ dòng đã sửa tay. */
async function ghiDongHopDong(
  admin: SupabaseClient,
  galleryId: string,
  ma: string,
  parents: DongChaHopDong[],
  kq: KetQuaDongHopDong,
): Promise<void> {
  const { error: ed } = await admin.from("gallery_items").delete().eq("gallery_id", galleryId).eq("lark_contract_code", ma);
  if (ed) throw ed;

  const larkIds = [...parents.map((p) => p.larkRecordId), ...parents.flatMap((p) => p.children.map((c) => c.larkRecordId))];
  const { data: daCo, error: ec } = larkIds.length
    ? await admin.from("gallery_items").select("id, lark_record_id").eq("gallery_id", galleryId).in("lark_record_id", larkIds)
    : { data: [], error: null };
  if (ec) throw ec;
  const idTheoLark = new Map((daCo ?? []).map((r) => [String(r.lark_record_id), String(r.id)]));

  for (const p of parents) {
    let parentId = idTheoLark.get(p.larkRecordId);
    if (parentId) {
      kq.soDongGiuNguyen += 1;
    } else {
      const { data, error } = await admin
        .from("gallery_items")
        .insert({
          gallery_id: galleryId,
          product_id: p.productId,
          parent_item_id: null,
          quantity: p.quantity,
          unit_price: p.unitPrice,
          line_total: p.lineTotal,
          lark_contract_code: ma,
          lark_record_id: p.larkRecordId,
        })
        .select("id")
        .single();
      if (error) throw error;
      parentId = String(data.id);
      kq.soDongGhi += 1;
    }
    for (const c of p.children) {
      if (idTheoLark.has(c.larkRecordId)) {
        kq.soDongGiuNguyen += 1;
        continue;
      }
      const { error } = await admin.from("gallery_items").insert({
        gallery_id: galleryId,
        product_id: c.productId,
        parent_item_id: parentId,
        quantity: c.quantity,
        unit_price: null,
        line_total: null,
        lark_contract_code: ma,
        lark_record_id: c.larkRecordId,
      });
      if (error) throw error;
      kq.soDongGhi += 1;
    }
  }
}
