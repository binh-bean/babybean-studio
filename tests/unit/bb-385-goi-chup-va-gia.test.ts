/**
 * BB-385 — giá ảnh chọn thêm cấu hình được (mặc định 50.000 ₫) + màn Gói chụp.
 *
 * THUẦN: không chạm cơ sở dữ liệu. `@/lib/supabase/admin` được giả lập bằng một
 * kho trong bộ nhớ (biên giới ra ngoài), `@/lib/auth/staff` trả phiên giả.
 *
 * Thước đo AGENTS.md §5a — kiểm ngược đã làm (dán trong bàn giao):
 *   (1) Bỏ bậc "giá riêng của gói" trong `giaAnhThemChoBoMoi` → nhóm "luật giá"
 *       và kịch bản "đơn mới" ĐỎ.
 *   (2) Cho route PUT ghi thêm `galleries.extra_photo_price` (hồi tố) → kịch
 *       bản "đơn cũ giữ giá" ĐỎ.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));
const phien = vi.hoisted(() => ({ vai: "owner", quyen: null as null | ((v: string) => string[]) }));
vi.mock("@/lib/auth/staff", () => {
  class AuthError extends Error {
    code: string;
    constructor(c: string) {
      super(c);
      this.code = c;
    }
  }
  return {
    AuthError,
    requireStaff: async () => ({
      staffId: "00000000-0000-0000-0000-0000000000aa",
      role: phien.vai,
      branchIds: [],
      permissions: phien.quyen!(phien.vai),
    }),
    // Cùng luật với bản thật (src/lib/auth/staff.ts): thiếu quyền → AuthError FORBIDDEN.
    requirePermission: (staff: { permissions: string[] }, q: string) => {
      if (!staff.permissions.includes(q)) throw new AuthError("FORBIDDEN");
    },
  };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
phien.quyen = quyenCuaVai;

import { PUT, GET } from "@/app/api/admin/goi-chup/route";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GIA_ANH_CHON_THEM_MAC_DINH,
  giaAnhThemChoBoMoi,
  giaRiengTheoTenGoi,
  tongHopGoiChup,
  docGia,
} from "@/lib/gallery/gia-goi-chup";
import { docBangGiaRieng } from "@/lib/gallery/gia-goi-chup-server";

// ---------------------------------------------------------------------------
// Kho giả trong bộ nhớ: đủ các lời gọi route dùng (select/eq/is/maybeSingle,
// upsert, delete, insert, update) — ghi lại MỌI lần ghi theo tên bảng.
// ---------------------------------------------------------------------------
type Dong = Record<string, unknown>;
function khoGia(bang: Record<string, Dong[]>, opts: { thieuBang?: string[] } = {}) {
  const ghi: { bang: string; kieu: string; du: unknown }[] = [];
  const loiThieu = { code: "PGRST205", message: "Could not find the table" };
  function from(ten: string) {
    const loc: [string, unknown][] = [];
    const thieu = opts.thieuBang?.includes(ten);
    const dong = () => (bang[ten] ?? []).filter((r) => loc.every(([k, v]) => r[k] === v));
    const kq = () => (thieu ? { data: null, error: loiThieu } : { data: dong(), error: null });
    const chuoi: Record<string, unknown> = {
      select: () => chuoi,
      eq: (k: string, v: unknown) => (loc.push([k, v]), chuoi),
      is: (k: string, v: unknown) => (loc.push([k, v]), chuoi),
      order: () => chuoi,
      not: () => chuoi,
      range: () => chuoi,
      maybeSingle: async () => (thieu ? { data: null, error: loiThieu } : { data: dong()[0] ?? null, error: null }),
      then: (giai: (v: unknown) => unknown) => Promise.resolve(kq()).then(giai),
      upsert: async (du: Dong) => {
        if (thieu) return { error: loiThieu };
        ghi.push({ bang: ten, kieu: "upsert", du });
        const ds = (bang[ten] ??= []);
        const i = ds.findIndex((r) => r.ma_goi === du.ma_goi);
        if (i >= 0) ds[i] = { ...ds[i], ...du };
        else ds.push({ ...du });
        return { error: null };
      },
      insert: async (du: Dong) => {
        ghi.push({ bang: ten, kieu: "insert", du });
        (bang[ten] ??= []).push({ ...du });
        return { error: null };
      },
      delete: () => {
        const xoa: Record<string, unknown> = {
          eq: async (k: string, v: unknown) => {
            ghi.push({ bang: ten, kieu: "delete", du: { [k]: v } });
            bang[ten] = (bang[ten] ?? []).filter((r) => r[k] !== v);
            return { error: null };
          },
        };
        return xoa;
      },
      update: (du: Dong) => ({
        eq: async (k: string, v: unknown) => {
          ghi.push({ bang: ten, kieu: "update", du });
          for (const r of bang[ten] ?? []) if (r[k] === v) Object.assign(r, du);
          return { error: null };
        },
      }),
    };
    return chuoi;
  }
  return { client: { from } as unknown as never, ghi };
}

function datGia(tenGoi: string, gia: number | null) {
  return PUT(
    new Request("http://localhost/api/admin/goi-chup", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenGoi, gia }),
    }),
  );
}

// ---------------------------------------------------------------------------
describe("BB-385 · luật giá cho bộ ảnh MỚI", () => {
  it("không có gì → 50.000 ₫ (giữ hành vi hiện tại)", () => {
    expect(GIA_ANH_CHON_THEM_MAC_DINH).toBe(50_000);
    expect(giaAnhThemChoBoMoi({})).toBe(50_000);
    expect(giaAnhThemChoBoMoi({ giaRiengCuaGoi: undefined, giaChung: null })).toBe(50_000);
  });

  it("giá chung trong Cài đặt thắng mặc định", () => {
    expect(giaAnhThemChoBoMoi({ giaChung: 60_000 })).toBe(60_000);
  });

  it("giá riêng của gói thắng giá chung; CSKH gõ tay thắng tất cả", () => {
    expect(giaAnhThemChoBoMoi({ giaRiengCuaGoi: 40_000, giaChung: 60_000 })).toBe(40_000);
    expect(giaAnhThemChoBoMoi({ giaNhapTay: 45_000, giaRiengCuaGoi: 40_000, giaChung: 60_000 })).toBe(45_000);
    // Giá 0 (tặng) là giá hợp lệ, không bị coi là "không có".
    expect(giaAnhThemChoBoMoi({ giaRiengCuaGoi: 0, giaChung: 60_000 })).toBe(0);
  });

  it("giá lạ không bao giờ thành tiền khách trả: âm, lẻ, chữ, quá trần → bậc sau", () => {
    for (const la of [-1, 1.5, Number.NaN, "abc", "", 10_000_001, null, {}, true]) {
      expect(giaAnhThemChoBoMoi({ giaRiengCuaGoi: la, giaChung: 55_000 })).toBe(55_000);
    }
    // numeric của Postgres có thể về dạng chuỗi.
    expect(docGia("55000")).toBe(55_000);
  });

  it("tra giá riêng theo GÓI CHÍNH của ô Lark ('Baby 02, Thêm set chụp' → LARK-BABY-02)", () => {
    const bang = { "LARK-BABY-02": 70_000 };
    expect(giaRiengTheoTenGoi(bang, "Baby 02, Thêm set chụp")).toBe(70_000);
    expect(giaRiengTheoTenGoi(bang, "  baby 02 ")).toBe(70_000);
    expect(giaRiengTheoTenGoi(bang, "Fam 02")).toBeUndefined();
    expect(giaRiengTheoTenGoi(undefined, "Baby 02")).toBeUndefined();
  });
});

describe("BB-385 · migration 0100 CHƯA áp → rơi về 50.000 ₫, không 500", () => {
  it("docBangGiaRieng trả bảng rỗng + cờ, giá bộ mới = giá chung/50.000", async () => {
    const { client } = khoGia({}, { thieuBang: ["goi_chup_gia_anh_them"] });
    const r = await docBangGiaRieng(client);
    expect(r).toEqual({ bang: {}, chuaApMigration: true });
    expect(giaAnhThemChoBoMoi({ giaRiengCuaGoi: giaRiengTheoTenGoi(r.bang, "Baby 02"), giaChung: null })).toBe(50_000);
  });

  it("PUT giá riêng khi chưa áp → 409 nói rõ, không ghi gì", async () => {
    phien.vai = "owner";
    const kho = khoGia({}, { thieuBang: ["goi_chup_gia_anh_them"] });
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const res = await datGia("Baby 02", 70_000);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { message: string } }).error.message).toMatch(/0100/);
    expect(kho.ghi).toEqual([]);
  });
});

describe("BB-385 · đổi giá chỉ áp cho bộ MỚI, bộ cũ giữ giá", () => {
  let bang: Record<string, Dong[]>;
  beforeEach(() => {
    phien.vai = "owner";
    bang = {
      settings: [{ key: "gallery.extra_photo_price_default", branch_id: null, value: 50_000 }],
      goi_chup_gia_anh_them: [],
      // Bộ A tạo TRƯỚC khi đổi giá, khách đã chốt: giá đã chép vào bộ + số lúc chốt.
      galleries: [{ id: "bo-a", extra_photo_price: 50_000 }],
      gallery_selections: [{ id: "chot-a", gallery_id: "bo-a", snapshot_extra_amount: 150_000 }],
    };
  });

  it("Admin đặt 70.000 cho Baby 02: bộ Baby 02 mới 70.000, gói khác 50.000, bộ A vẫn 50.000/150.000", async () => {
    const kho = khoGia(bang);
    vi.mocked(createAdminClient).mockReturnValue(kho.client);

    const res = await datGia("Baby 02", 70_000);
    expect(res.status).toBe(200);

    // Route chỉ ghi bảng giá riêng (+ nhật ký) — không bao giờ ghi bộ ảnh / lượt chốt.
    const bangDaGhi = [...new Set(kho.ghi.map((g) => g.bang))].sort();
    expect(bangDaGhi).toEqual(["activity_logs", "goi_chup_gia_anh_them"]);
    expect(bang.galleries![0]!.extra_photo_price).toBe(50_000);
    expect(bang.gallery_selections![0]!.snapshot_extra_amount).toBe(150_000);

    // Bộ MỚI tính từ chính kho vừa ghi.
    const giaRieng = (await docBangGiaRieng(kho.client)).bang;
    const giaChung = bang.settings![0]!.value;
    expect(giaAnhThemChoBoMoi({ giaRiengCuaGoi: giaRiengTheoTenGoi(giaRieng, "Baby 02"), giaChung })).toBe(70_000);
    expect(giaAnhThemChoBoMoi({ giaRiengCuaGoi: giaRiengTheoTenGoi(giaRieng, "Fam 02"), giaChung })).toBe(50_000);

    // Nhật ký ghi trước/sau.
    const log = kho.ghi.find((g) => g.bang === "activity_logs")!.du as { metadata: Record<string, unknown> };
    expect(log.metadata).toMatchObject({ ma_goi: "LARK-BABY-02", truoc: null, sau: 70_000 });
  });

  it("'Về giá chung' xoá giá riêng — gói quay về giá chung, bộ cũ vẫn không đổi", async () => {
    bang.goi_chup_gia_anh_them = [{ ma_goi: "LARK-BABY-02", ten_goi: "Baby 02", gia_anh_them: 70_000 }];
    const kho = khoGia(bang);
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const res = await datGia("Baby 02", null);
    expect(res.status).toBe(200);
    expect(bang.goi_chup_gia_anh_them).toEqual([]);
    expect(kho.ghi.some((g) => g.bang === "galleries" || g.bang === "gallery_selections")).toBe(false);
    expect(bang.galleries![0]!.extra_photo_price).toBe(50_000);
  });

  it("CSKH chỉ xem: PUT → 403, không ghi gì", async () => {
    phien.vai = "cs";
    const kho = khoGia(bang);
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const res = await datGia("Baby 02", 70_000);
    expect(res.status).toBe(403);
    expect(kho.ghi).toEqual([]);
  });

  it("giá quá trần / âm → 400, không ghi", async () => {
    const kho = khoGia(bang);
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    expect((await datGia("Baby 02", 10_000_001)).status).toBe(400);
    expect((await datGia("Baby 02", -5)).status).toBe(400);
    expect(kho.ghi).toEqual([]);
  });
});

describe("BB-385 · bảng màn Gói chụp (dữ liệu Lark)", () => {
  const sanPham = [
    { id: "p-baby02", name: "Baby 02", kind: "shoot_package", list_price: "2000000", is_active: true },
    { id: "p-fam", name: "Fam 02", kind: "shoot_package", list_price: null, is_active: false },
    { id: "p-edit", name: "Edit file", kind: "edited_photo", list_price: 50000, is_active: true },
    { id: "p-go", name: "Gỗ 15x21", kind: "print", list_price: 300000, is_active: true },
    { id: "p-mk", name: "Makeup", kind: "service", list_price: 200000, is_active: true },
  ];
  // Hai hợp đồng Baby 02 giống nhau (20 ảnh + Gỗ + Makeup), một hợp đồng khác (25 ảnh).
  const hop = (cha: string, bo: string, soAnh: number, them: boolean) => [
    { id: cha, gallery_id: bo, product_id: "p-baby02", parent_item_id: null, quantity: 1 },
    { id: `${cha}-e`, gallery_id: bo, product_id: "p-edit", parent_item_id: cha, quantity: soAnh },
    ...(them
      ? [
          { id: `${cha}-g`, gallery_id: bo, product_id: "p-go", parent_item_id: cha, quantity: 1 },
          { id: `${cha}-m`, gallery_id: bo, product_id: "p-mk", parent_item_id: cha, quantity: 1 },
        ]
      : []),
  ];

  it("số ảnh chỉnh + sản phẩm đi kèm = thành phần thường gặp; đếm bộ ảnh; giá áp dụng", () => {
    const ds = tongHopGoiChup({
      sanPham,
      dongHopDong: [...hop("c1", "bo-1", 20, true), ...hop("c2", "bo-2", 20, true), ...hop("c3", "bo-3", 25, false)],
      goiApp: [
        { id: "pk-baby", code: "LARK-BABY-02", name: "Baby 02", is_active: true },
        { id: "pk-ngoai", code: "LARK-GOI-LA", name: "Gói lạ", is_active: true },
        { id: "pk-seed", code: "PKG-CAO-CAP", name: "Gói Cao cấp", is_active: true },
      ],
      // bo-1 đã đếm qua hợp đồng (không đếm hai lần); bo-9 chỉ có package_id.
      boAnhTheoGoiApp: [
        { id: "bo-1", package_id: "pk-baby" },
        { id: "bo-9", package_id: "pk-baby" },
        { id: "bo-7", package_id: "pk-ngoai" },
      ],
      bangGiaRieng: { "LARK-BABY-02": 70_000 },
      giaChung: null,
    });

    const baby = ds.find((g) => g.maGoi === "LARK-BABY-02")!;
    expect(baby).toMatchObject({
      ten: "Baby 02",
      giaGoi: 2_000_000,
      soAnhChinh: 20,
      sanPhamDiKem: ["Gỗ 15x21 ×1", "Makeup ×1"],
      soHopDongKhac: 1,
      soBoAnh: 4,
      giaAnhThemRieng: 70_000,
      giaAnhThemApDung: 70_000,
      coTrongDanhMuc: true,
    });
    const fam = ds.find((g) => g.maGoi === "LARK-FAM-02")!;
    expect(fam).toMatchObject({ soAnhChinh: null, soBoAnh: 0, dangBan: false, giaAnhThemRieng: null, giaAnhThemApDung: 50_000 });
    // Gói LARK- ngoài danh mục vẫn hiện; gói mẫu seed (không LARK-) thì không.
    expect(ds.find((g) => g.maGoi === "LARK-GOI-LA")).toMatchObject({ coTrongDanhMuc: false, soBoAnh: 1 });
    expect(ds.some((g) => g.ten === "Gói Cao cấp")).toBe(false);
    // Không liệt kê sản phẩm không phải gói.
    expect(ds.some((g) => g.ten === "Edit file" || g.ten === "Makeup")).toBe(false);
  });
});

describe("BB-385 · GET màn Gói chụp", () => {
  it("CSKH xem được, không có quyền sửa; migration chưa áp vẫn trả 200 + cờ", async () => {
    phien.vai = "cs";
    const kho = khoGia(
      {
        products: [{ id: "p1", name: "Baby 02", kind: "shoot_package", list_price: 2_000_000, is_active: true }],
        gallery_items: [],
        packages: [],
        galleries: [],
        settings: [{ key: "gallery.extra_photo_price_default", branch_id: null, value: 50_000 }],
      },
      { thieuBang: ["goi_chup_gia_anh_them"] },
    );
    vi.mocked(createAdminClient).mockReturnValue(kho.client);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { goi: { ten: string; giaAnhThemApDung: number }[]; giaChung: number; chuaApMigration: boolean; coTheSuaGia: boolean };
    };
    expect(body.data.coTheSuaGia).toBe(false);
    expect(body.data.chuaApMigration).toBe(true);
    expect(body.data.giaChung).toBe(50_000);
    expect(body.data.goi).toEqual([expect.objectContaining({ ten: "Baby 02", giaAnhThemApDung: 50_000 })]);
  });
});
