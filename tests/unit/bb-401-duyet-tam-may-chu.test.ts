/**
 * BB-401 vòng 2 — "Duyệt tấm này" lưu trên máy chủ (bảng 0108 `anh_chinh_duyet_tam`).
 *
 * Phép thử THUẦN: không DB, không mạng. Biên ra ngoài là đồ giả — phiên (`requirePhienBoAnh`),
 * client Supabase (ghi lại lời gọi), bối cảnh ảnh chỉnh (`docBoiCanhAnhChinh`) — và `fetch`.
 * Không giả lập hook React, không đọc mã nguồn.
 *
 *   1. Route POST /api/g/anh-chinh-sua/duyet-tam: chủ link duyệt tấm đang thấy → ghi đúng dòng;
 *      bỏ duyệt → xoá; người thân 403; tấm lạ 404; vòng không còn chờ duyệt 400; chưa áp 0108
 *      → 200 `{ luuMayChu: false }` (không lỗi).
 *   2. Dấu duyệt còn hiệu lực chỉ khi bấm SAU mốc gửi khách gần nhất của vòng.
 *   3. Mở máy khác: ghép dấu duyệt máy chủ vào bản nháp (giữ tấm xin sửa của máy này); máy chỉ
 *      còn lưu ghi chú chưa gửi.
 *   4. Màn khách gọi đúng route, hiểu `luuMayChu`, báo lỗi để hoàn tác.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const phien = { galleryId: "g1", selectionId: "s1", role: "owner" as string };
vi.mock("@/lib/auth/phien-bo-anh", () => ({ requirePhienBoAnh: async () => phien }));

// BB-408 — nhật ký: bắt các dòng route gửi đi (ghiNhatKy thật cần DB).
const nhatKy: Record<string, unknown>[] = [];
vi.mock("@/lib/nhat-ky", () => ({
  ghiNhatKy: async (dong: Record<string, unknown>) => {
    nhatKy.push(dong);
  },
}));

const goi: { bang: string; thaoTac: string; giaTri?: unknown; loc: Record<string, unknown> }[] = [];
const db = { status: "awaiting_approval", loiBang: null as null | { code: string } };
function dbGia() {
  return {
    from(bang: string) {
      const loc: Record<string, unknown> = {};
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => ((loc[c] = v), q),
        maybeSingle: async () => ({ data: bang === "galleries" ? { id: "g1", status: db.status } : null }),
        upsert: async (giaTri: unknown) => {
          goi.push({ bang, thaoTac: "upsert", giaTri, loc });
          return { error: db.loiBang };
        },
        delete: () => {
          goi.push({ bang, thaoTac: "delete", loc });
          return q;
        },
        then: (xong: (v: unknown) => unknown) => Promise.resolve({ error: db.loiBang }).then(xong),
      };
      return q;
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => dbGia() }));

const MOC = "2026-10-08T01:00:00Z";
vi.mock("@/lib/anh-chinh-sua/du-lieu", async (goc) => {
  const that = await goc<typeof import("@/lib/anh-chinh-sua/du-lieu")>();
  return {
    ...that,
    docBoiCanhAnhChinh: async () => ({
      anhChinh: [
        { id: "p1", file_name: "IMG_0001-Edit.jpg", created_at: "2026-10-08T00:00:00Z" },
        { id: "p2", file_name: "IMG_0003.jpg", created_at: "2026-10-08T00:00:00Z" },
        // Ảnh về SAU mốc gửi: ba mẹ chưa được thấy.
        { id: "p9", file_name: "IMG_0009.jpg", created_at: "2026-10-08T05:00:00Z" },
      ],
      goc: [],
      gocCua: new Map(),
      nhom: [],
      khoaCua: new Map([
        ["p1", "goc"],
        ["p2", "goc"],
        ["p9", "goc"],
      ]),
      mocChung: MOC,
      mocDot: null,
    }),
    docVongSua: async () => [],
  };
});

import { POST } from "@/app/api/g/anh-chinh-sua/duyet-tam/route";
import {
  datDuyet,
  datSua,
  ghepNhapMayChu,
  luuDuyetTam,
  nhapGhiXuongMay,
  suaGhiChu,
  tamDuyetConHieuLuc,
} from "@/lib/anh-chinh-sua/duyet-tung-tam";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";

const gui = async (than: unknown) => {
  const res = await POST(
    new Request("http://localhost/api/g/anh-chinh-sua/duyet-tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(than),
    }),
  );
  return { status: res.status, json: (await res.json()) as { data?: Record<string, unknown>; error?: unknown } };
};

beforeEach(() => {
  goi.length = 0;
  nhatKy.length = 0;
  phien.role = "owner";
  db.status = "awaiting_approval";
  db.loiBang = null;
});
afterEach(() => vi.unstubAllGlobals());

describe("BB-401 vòng 2 · 1 · route lưu dấu duyệt từng tấm", () => {
  it("chủ link duyệt tấm đang thấy → ghi đúng một dòng (bộ từ PHIÊN, vòng trong gói)", async () => {
    const r = await gui({ photoId: "p1", duyet: true });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ luuMayChu: true, photoId: "p1", duyet: true });
    expect(goi).toHaveLength(1);
    expect(goi[0]).toMatchObject({ bang: "anh_chinh_duyet_tam", thaoTac: "upsert" });
    expect(goi[0]!.giaTri).toMatchObject({ gallery_id: "g1", photo_id: "p1", khoa: "goc" });
  });

  it("BB-408 · duyệt / bỏ duyệt đều để lại nhật ký chỉ có mã (không tên, không link)", async () => {
    await gui({ photoId: "p1", duyet: true });
    await gui({ photoId: "p2", duyet: false });
    expect(nhatKy).toHaveLength(2);
    expect(nhatKy[0]).toMatchObject({
      actorType: "customer",
      action: "anh_chinh.duyet_tam",
      entityId: "g1",
      galleryId: "g1",
      metadata: { photoId: "p1", khoa: "goc", vai: "owner" },
    });
    expect(nhatKy[1]).toMatchObject({ action: "anh_chinh.bo_duyet_tam", metadata: { photoId: "p2" } });
    expect(JSON.stringify(nhatKy)).not.toContain("IMG_");
  });

  it("BB-408 · bị từ chối hoặc chưa lưu được ở máy chủ → không có dòng nhật ký nào", async () => {
    phien.role = "viewer";
    await gui({ photoId: "p1", duyet: true });
    phien.role = "owner";
    await gui({ photoId: "khac", duyet: true });
    db.loiBang = { code: "42P01" };
    await gui({ photoId: "p1", duyet: true });
    expect(nhatKy).toEqual([]);
  });

  it("bỏ duyệt (đổi sang Cần sửa) → xoá đúng dòng của bộ + tấm", async () => {
    const r = await gui({ photoId: "p2", duyet: false });
    expect(r.status).toBe(200);
    expect(goi).toEqual([{ bang: "anh_chinh_duyet_tam", thaoTac: "delete", loc: { gallery_id: "g1", photo_id: "p2" } }]);
  });

  it("người thân (không phải link chính) → 403, không ghi gì", async () => {
    phien.role = "viewer";
    expect((await gui({ photoId: "p1", duyet: true })).status).toBe(403);
    expect(goi).toHaveLength(0);
  });

  it("tấm lạ / tấm ba mẹ chưa được thấy → 404; thân sai → 400", async () => {
    expect((await gui({ photoId: "khac", duyet: true })).status).toBe(404);
    expect((await gui({ photoId: "p9", duyet: true })).status).toBe(404);
    expect((await gui({ photoId: "p1", duyet: "co" })).status).toBe(400);
    expect(goi).toHaveLength(0);
  });

  it("vòng không còn chờ duyệt (đã duyệt cả bộ) → 400, không ghi", async () => {
    db.status = "approved";
    expect((await gui({ photoId: "p1", duyet: true })).status).toBe(400);
    expect(goi).toHaveLength(0);
  });

  it("chưa áp 0108 → 200 luuMayChu:false (app không lỗi, màn khách giữ dấu trên máy)", async () => {
    db.loiBang = { code: "42P01" };
    const r = await gui({ photoId: "p1", duyet: true });
    expect(r.status).toBe(200);
    expect(r.json.data).toMatchObject({ luuMayChu: false });
  });
});

describe("BB-401 vòng 2 · 2 · dấu duyệt còn hiệu lực theo mốc gửi", () => {
  it("bấm sau mốc gửi thì tính; trước mốc (vòng cũ, CSKH đã gửi lại) hoặc vòng chưa gửi thì không", () => {
    const dong = [
      { photo_id: "p1", khoa: "goc", duyet_luc: "2026-10-08T02:00:00Z" },
      { photo_id: "p2", khoa: "goc", duyet_luc: "2026-10-07T23:00:00Z" },
      { photo_id: "p3", khoa: "dot:2", duyet_luc: "2026-10-08T02:00:00Z" },
    ];
    const moc = (id: string) => (id === "p3" ? null : MOC);
    expect([...tamDuyetConHieuLuc(dong, moc)]).toEqual(["p1"]);
  });
});

describe("BB-401 vòng 2 · 3 · mở máy khác", () => {
  it("dấu duyệt máy chủ hiện ở máy mới; tấm đang xin sửa trên máy này giữ nguyên ghi chú", () => {
    const mayNay = suaGhiChu(datSua(datDuyet({}, "p4"), "p2"), "p2", "Da sáng hơn");
    const ghep = ghepNhapMayChu(mayNay, ["p1", "p2"]);
    expect(ghep.p1?.trangThai).toBe("duyet");
    expect(ghep.p2).toMatchObject({ trangThai: "sua", ghiChu: "Da sáng hơn" });
    // Dấu duyệt chỉ có trên máy (máy chủ không có) → không còn tính là đã duyệt.
    expect(ghep.p4).toBeUndefined();
  });

  it("có máy chủ: máy chỉ lưu ghi chú xin sửa chưa gửi; chưa áp 0108: lưu cả dấu duyệt", () => {
    const nhap = datSua(datDuyet({}, "p1"), "p2");
    expect(Object.keys(nhapGhiXuongMay(nhap, true))).toEqual(["p2"]);
    expect(Object.keys(nhapGhiXuongMay(nhap, false)).sort()).toEqual(["p1", "p2"]);
  });
});

describe("BB-401 vòng 2 · 4 · màn khách gọi đúng route", () => {
  it("POST /api/g/anh-chinh-sua/duyet-tam {photoId, duyet}; hiểu luuMayChu", async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify({ data: { luuMayChu: true } })));
    vi.stubGlobal("fetch", f);
    expect(await luuDuyetTam("p1", true, goiApiKhach, "lỗi")).toEqual({ ok: true, luuMayChu: true });
    expect(f.mock.calls[0]![0]).toBe("/api/g/anh-chinh-sua/duyet-tam");
    expect(f.mock.calls[0]![1]?.method).toBe("POST");
    expect(JSON.parse(String(f.mock.calls[0]![1]?.body))).toEqual({ photoId: "p1", duyet: true });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: { luuMayChu: false } }))));
    expect(await luuDuyetTam("p1", true, goiApiKhach, "lỗi")).toEqual({ ok: true, luuMayChu: false });
  });

  it("máy chủ lỗi / mất mạng → ok:false để màn khách hoàn tác + báo nhẹ", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "Ảnh này không còn ở bước duyệt ạ." } }), { status: 400 })));
    expect(await luuDuyetTam("p1", true, goiApiKhach, "lỗi")).toEqual({ ok: false, loi: "Ảnh này không còn ở bước duyệt ạ." });
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    expect(await luuDuyetTam("p1", true, goiApiKhach, "lỗi mạng")).toEqual({ ok: false, loi: "lỗi mạng" });
  });
});
