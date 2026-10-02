// BB-363 (soát C vòng 11, R4) — cổng `verify:db` canh 0086–0089 phải ĐỎ được.
// Cơ sở dữ liệu GIẢ chỉ ở biên giới `client.query` (trả hàng như pg_index / information_schema /
// pg_proc / schema_migrations sẽ trả); logic so sánh của cổng chạy thật. Không kết nối DB nào.
//
// Kiểm ngược (dán trong bàn giao): cho nhánh "0088 đã áp" luôn ĐẠT → ca "áp nửa vời" ĐỎ; bỏ
// kiểm `indisunique` → ca "chỉ mục không UNIQUE" ĐỎ.
import { describe, it, expect } from "vitest";
import { kiemDay0086Den0089, COT_0088 } from "../../scripts/lib/kiem-cau-truc-day-moi.mjs";

interface Db {
  chiMuc: { ten: string; bang: string; duy_nhat: boolean }[];
  coCotMa: boolean;
  cot88: string[];
  ham88: { anon: boolean; auth: boolean }[];
  da0089: boolean;
}
const day = (): Db => ({
  chiMuc: [
    { ten: "uq_gallery_payments_ma_yeu_cau", bang: "gallery_payments", duy_nhat: true },
    { ten: "idx_activity_logs_created_at", bang: "activity_logs", duy_nhat: false },
    { ten: "idx_notifications_xong_created_at", bang: "notifications", duy_nhat: false },
  ],
  coCotMa: true,
  cot88: [],
  ham88: [],
  da0089: false,
});
async function chay(db: Db) {
  const client = {
    async query(sql: string) {
      if (/pg_index/.test(sql)) return { rows: db.chiMuc };
      if (/gallery_payments/.test(sql)) return { rows: db.coCotMa ? [{ x: 1 }] : [] };
      if (/table_name = 'galleries'/.test(sql)) return { rows: db.cot88.map((c) => ({ column_name: c })) };
      if (/nhan_mo_lai_anh/.test(sql)) return { rows: db.ham88 };
      if (/schema_migrations/.test(sql)) return { rows: db.da0089 ? [{ x: 1 }] : [] };
      throw new Error("câu lạ: " + sql);
    },
  };
  const kq = (await kiemDay0086Den0089({ client })) as { name: string; pass: boolean; detail: string }[];
  return Object.fromEntries(kq.map((r) => [r.name.slice(0, 4), r]));
}

describe("BB-363 verify:db — 0086–0089", () => {
  it("bb-dev hôm nay (0086/0087 đã áp, 0088/0089 chưa): xanh, 0088/0089 ghi 'CHỜ CẮT'", async () => {
    const r = await chay(day());
    expect(Object.values(r).every((x) => x.pass)).toBe(true);
    expect(r["0088"]!.detail).toContain("CHỜ CẮT");
    expect(r["0089"]!.detail).toContain("CHỜ CẮT");
  });
  it("thiếu cột ma_yeu_cau / thiếu chỉ mục / chỉ mục không UNIQUE → 0086 ĐỎ", async () => {
    expect((await chay({ ...day(), coCotMa: false }))["0086"]!.pass).toBe(false);
    expect((await chay({ ...day(), chiMuc: day().chiMuc.slice(1) }))["0086"]!.pass).toBe(false);
    const khongDuyNhat = day();
    khongDuyNhat.chiMuc[0]!.duy_nhat = false;
    expect((await chay(khongDuyNhat))["0086"]!.pass).toBe(false);
  });
  it("thiếu một chỉ mục bộ dọn → 0087 ĐỎ", async () => {
    expect((await chay({ ...day(), chiMuc: day().chiMuc.slice(0, 2) }))["0087"]!.pass).toBe(false);
  });
  it("0088 áp đủ → xanh 'đã áp'; áp nửa vời (thiếu mo_link_cuoi_luc) hoặc hàm mở cho anon → ĐỎ", async () => {
    const du = { ...day(), cot88: [...COT_0088], ham88: [{ anon: false, auth: false }], da0089: true };
    const r = await chay(du);
    expect(r["0088"]!.pass).toBe(true);
    expect(r["0089"]!.detail).toContain("đã áp");
    expect((await chay({ ...du, cot88: COT_0088.filter((c: string) => c !== "mo_link_cuoi_luc") }))["0088"]!.pass).toBe(false);
    expect((await chay({ ...du, ham88: [{ anon: true, auth: false }] }))["0088"]!.pass).toBe(false);
  });
});
