/**
 * BB-261 — hộp thư thông báo cho khách + chuông chưa đọc, nhắc lại.
 *
 * `web-push` là RANH GIỚI RA NGOÀI — giả nó, không giả ruột của các hàm đang
 * thử (AGENTS.md §5a). Phần ghi hộp thư (không có push nào) dùng `client` giả
 * tự tay dựng, đọc lại đúng những gì hàm ghi — không đọc mã nguồn làm dữ liệu
 * thử. Phần lọc "chưa đọc >24h, <2 lần nhắc" chạy THẬT trên bb-dev (chỉ đọc
 * fixture `Fixture BB-261`, dọn sạch ở afterAll) vì đó là một câu SQL với các
 * điều kiện `is`/`lt`/`or` — giả client sẽ chỉ canh được là hàm CÓ gọi
 * push_dang_ky và update, không canh được BỘ LỌC có đúng hay không.
 *
 * Migration 0074 CHƯA ÁP (chờ Opus soát) — mọi ca chạm bảng thong_bao_khach
 * tự kiểm `to_regclass` trước, và SKIP kèm console.warn nếu bảng chưa có.
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao):
 *  · Xoá dòng `await ghiHopThu(...)` trong `guiThongBaoBoAnh` (gui-day.ts) →
 *    ca "ghi hộp thư dù không có đăng ký push" phải ĐỎ.
 *  · Đổi điều kiện `so_lan_nhac < 2` thành `<= 2` trong nhac-chua-doc.ts → ca
 *    "đã nhắc đủ 2 lần thì không nhắc nữa" phải ĐỎ.
 *  · Xoá `.eq("gallery_id", session.galleryId)` khỏi câu UPDATE theo `id`
 *    trong route.ts → ca "bộ khác → 404" phải ĐỎ (trả 200 thay vì 404).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import { Client } from "pg";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const webpushGia = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock("web-push", () => ({ default: webpushGia }));

import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { nhacThongBaoChuaDoc } from "@/lib/thong-bao/nhac-chua-doc";
import { createAdminClient } from "@/lib/supabase/admin";

const dongKhoaVapidThat = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "cong-khai-gia",
  VAPID_PRIVATE_KEY: "rieng-tu-gia",
  VAPID_SUBJECT: "mailto:cskh@babybeanstudio.vn",
};

beforeEach(() => {
  webpushGia.setVapidDetails.mockReset();
  webpushGia.sendNotification.mockReset();
  webpushGia.sendNotification.mockResolvedValue(undefined);
  for (const [k, v] of Object.entries(dongKhoaVapidThat)) vi.stubEnv(k, v);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

/** `client` giả — push_dang_ky rỗng (không ai đăng ký), thong_bao_khach ghi nhận. */
function taoAdminGiaKhongPush() {
  const hopThu: Record<string, unknown>[] = [];
  const client = {
    from(bang: string) {
      if (bang === "thong_bao_khach") {
        const builder = {
          insert: (dong: Record<string, unknown>) => {
            hopThu.push(dong);
            return builder;
          },
          select: () => builder,
          single: () => Promise.resolve({ data: { id: "hop-thu-1" }, error: null }),
        };
        return builder;
      }
      if (bang === "push_dang_ky") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      throw new Error(`bảng không mong đợi: ${bang}`);
    },
  };
  return { client: client as unknown as SupabaseClient, hopThu };
}

describe("BB-261: guiThongBaoBoAnh ghi hộp thư dù KHÔNG có đăng ký push nào", () => {
  it("bộ ảnh chưa ai bật thông báo -> vẫn có một dòng thong_bao_khach, không gửi push", async () => {
    const { client, hopThu } = taoAdminGiaKhongPush();

    await guiThongBaoBoAnh(client, "gallery-abc", {
      tieuDe: "Ảnh của bé đã chỉnh xong",
      noiDung: "Mời ba mẹ xem và duyệt bộ ảnh.",
      loai: "anh_chinh_xong",
    });

    expect(hopThu).toHaveLength(1);
    expect(hopThu[0]).toMatchObject({
      gallery_id: "gallery-abc",
      loai: "anh_chinh_xong",
      tieu_de: "Ảnh của bé đã chỉnh xong",
    });
    expect(webpushGia.sendNotification).not.toHaveBeenCalled();
  });
});

/** `client` giả cho nhacThongBaoChuaDoc — một dòng chưa đọc trả về, ghi lại lượt update. */
function taoAdminGiaNhac(dong: {
  id: string;
  gallery_id: string;
  tieu_de: string;
  noi_dung: string;
  so_lan_nhac: number;
}) {
  const capNhat: { id: string; patch: Record<string, unknown> }[] = [];
  const client = {
    from(bang: string) {
      if (bang === "thong_bao_khach") {
        let mode: "select" | "update" = "select";
        let patch: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          is: () => builder,
          lt: () => builder,
          or: () => builder,
          limit: () => Promise.resolve({ data: [dong], error: null }),
          update: (p: Record<string, unknown>) => {
            mode = "update";
            patch = p;
            return builder;
          },
          eq: (_c: string, id: string) => {
            if (mode === "update") {
              capNhat.push({ id, patch });
              return Promise.resolve({ error: null });
            }
            return builder;
          },
        };
        return builder;
      }
      if (bang === "push_dang_ky") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: "d1", endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "p", auth: "a" }],
                error: null,
              }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      throw new Error(`bảng không mong đợi: ${bang}`);
    },
  };
  return { client: client as unknown as SupabaseClient, capNhat };
}

interface DongGia {
  id: string;
  gallery_id: string;
  tieu_de: string;
  noi_dung: string;
  da_doc_luc: string | null;
  created_at: string;
  so_lan_nhac: number;
  nhac_lan_cuoi: string | null;
}

/**
 * `client` giả mô phỏng THẬT các bộ lọc PostgREST (`is`, `lt`, `or`, `limit`)
 * trên một mảng dòng cố định trong bộ nhớ — không phải canned data trả nguyên
 * xi bất kể tham số. Cần bản này để KIỂM NGƯỢC được đúng điều kiện lọc trong
 * `nhacThongBaoChuaDoc` (BB-052/§5a cấm đọc mã nguồn làm dữ liệu thử — mô
 * phỏng ngữ nghĩa PostgREST không phải đọc mã nguồn, mà là một biên giới
 * chuẩn có tài liệu công khai).
 */
function taoAdminGiaBoLoc(rows: DongGia[]) {
  const capNhat: { id: string; patch: Record<string, unknown> }[] = [];

  function coCot(row: DongGia, cot: string): unknown {
    return (row as unknown as Record<string, unknown>)[cot];
  }

  function dieuKienDon(cot: string, toanTu: string, giaTri: string) {
    return (row: DongGia): boolean => {
      const v = coCot(row, cot);
      if (toanTu === "is") return giaTri === "null" ? v === null : v === giaTri;
      if (toanTu === "lt") return v !== null && v !== undefined && (v as string) < giaTri;
      throw new Error(`toán tử giả không hỗ trợ: ${toanTu}`);
    };
  }

  const client = {
    from(bang: string) {
      if (bang === "thong_bao_khach") {
        let dsLoc = [...rows];
        let mode: "select" | "update" = "select";
        let patch: Record<string, unknown> = {};
        const builder = {
          select: () => builder,
          is: (cot: string, giaTri: null) => {
            dsLoc = dsLoc.filter(dieuKienDon(cot, "is", giaTri === null ? "null" : String(giaTri)));
            return builder;
          },
          lt: (cot: string, giaTri: string | number) => {
            dsLoc = dsLoc.filter(dieuKienDon(cot, "lt", String(giaTri)));
            return builder;
          },
          or: (bieuThuc: string) => {
            const dieuKien = bieuThuc.split(",").map((phan) => {
              const [cot, toanTu, ...phanConLai] = phan.split(".");
              return dieuKienDon(cot as string, toanTu as string, phanConLai.join("."));
            });
            dsLoc = dsLoc.filter((row) => dieuKien.some((f) => f(row)));
            return builder;
          },
          limit: (n: number) => Promise.resolve({ data: dsLoc.slice(0, n), error: null }),
          update: (p: Record<string, unknown>) => {
            mode = "update";
            patch = p;
            return builder;
          },
          eq: (_c: string, id: string) => {
            if (mode === "update") {
              capNhat.push({ id, patch });
              return Promise.resolve({ error: null });
            }
            return builder;
          },
        };
        return builder;
      }
      if (bang === "push_dang_ky") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: "d1", endpoint: "https://fcm.googleapis.com/fcm/send/d1", p256dh: "p", auth: "a" }],
                error: null,
              }),
          }),
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
        };
      }
      throw new Error(`bảng không mong đợi: ${bang}`);
    },
  };
  return { client: client as unknown as SupabaseClient, capNhat };
}

describe("BB-261: nhacThongBaoChuaDoc — bộ lọc thật (is/lt/or mô phỏng PostgREST)", () => {
  const gio = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();

  it("chỉ nhắc dòng: chưa đọc + tạo >24h + chưa đủ 2 lần nhắc + lần nhắc trước (nếu có) >24h", () => {
    const rows: DongGia[] = [
      // Đúng cả bốn điều kiện — PHẢI được nhắc.
      {
        id: "dung-dieu-kien",
        gallery_id: "g1",
        tieu_de: "t",
        noi_dung: "n",
        da_doc_luc: null,
        created_at: gio(25),
        so_lan_nhac: 0,
        nhac_lan_cuoi: null,
      },
      // Đã đọc — KHÔNG được nhắc.
      {
        id: "da-doc",
        gallery_id: "g1",
        tieu_de: "t",
        noi_dung: "n",
        da_doc_luc: gio(1),
        created_at: gio(25),
        so_lan_nhac: 0,
        nhac_lan_cuoi: null,
      },
      // Đã nhắc đủ 2 lần — KHÔNG được nhắc.
      {
        id: "du-2-lan",
        gallery_id: "g1",
        tieu_de: "t",
        noi_dung: "n",
        da_doc_luc: null,
        created_at: gio(25),
        so_lan_nhac: 2,
        nhac_lan_cuoi: gio(25),
      },
      // Mới tạo <24h — KHÔNG được nhắc.
      {
        id: "moi-tao",
        gallery_id: "g1",
        tieu_de: "t",
        noi_dung: "n",
        da_doc_luc: null,
        created_at: gio(1),
        so_lan_nhac: 0,
        nhac_lan_cuoi: null,
      },
      // Vừa nhắc <24h trước — KHÔNG được nhắc lại ngay.
      {
        id: "vua-nhac",
        gallery_id: "g1",
        tieu_de: "t",
        noi_dung: "n",
        da_doc_luc: null,
        created_at: gio(48),
        so_lan_nhac: 1,
        nhac_lan_cuoi: gio(1),
      },
    ];

    const { client, capNhat } = taoAdminGiaBoLoc(rows);
    return nhacThongBaoChuaDoc(client).then((soDaNhac) => {
      expect(soDaNhac).toBe(1);
      expect(capNhat.map((c) => c.id)).toEqual(["dung-dieu-kien"]);
    });
  });
});

describe("BB-261: nhacThongBaoChuaDoc", () => {
  it("gửi lại push với nội dung thêm '(nhắc lại)', giữ nguyên tiêu đề, tăng so_lan_nhac", async () => {
    const { client, capNhat } = taoAdminGiaNhac({
      id: "tb-1",
      gallery_id: "gallery-xyz",
      tieu_de: "Ảnh của bé đã chỉnh xong",
      noi_dung: "Mời ba mẹ xem và duyệt bộ ảnh.",
      so_lan_nhac: 0,
    });

    const soDaNhac = await nhacThongBaoChuaDoc(client);

    expect(soDaNhac).toBe(1);
    expect(webpushGia.sendNotification).toHaveBeenCalledTimes(1);
    const [, payloadThoi] = webpushGia.sendNotification.mock.calls[0] as [unknown, string];
    const payload = JSON.parse(payloadThoi) as Record<string, unknown>;
    expect(payload.tieuDe).toBe("Ảnh của bé đã chỉnh xong");
    expect(payload.noiDung).toBe("Mời ba mẹ xem và duyệt bộ ảnh. (nhắc lại)");
    expect(payload.thongBaoId).toBe("tb-1");

    expect(capNhat).toEqual([{ id: "tb-1", patch: expect.objectContaining({ so_lan_nhac: 1 }) }]);
  });

  it("không có dòng nào cần nhắc -> trả 0, không gọi push", async () => {
    const client = {
      from(bang: string) {
        if (bang !== "thong_bao_khach") throw new Error(`bảng không mong đợi: ${bang}`);
        const builder = {
          select: () => builder,
          is: () => builder,
          lt: () => builder,
          or: () => builder,
          limit: () => Promise.resolve({ data: [], error: null }),
        };
        return builder;
      },
    } as unknown as SupabaseClient;

    const soDaNhac = await nhacThongBaoChuaDoc(client);
    expect(soDaNhac).toBe(0);
    expect(webpushGia.sendNotification).not.toHaveBeenCalled();
  });

  it("lỗi khi đọc bảng -> không ném, trả 0", async () => {
    const client = {
      from() {
        throw new Error("kết nối cơ sở dữ liệu hỏng");
      },
    } as unknown as SupabaseClient;
    const banGhiLoi = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(nhacThongBaoChuaDoc(client)).resolves.toBe(0);
    expect(banGhiLoi).toHaveBeenCalled();
    banGhiLoi.mockRestore();
  });
});

describe("BB-261: chạy thật trên cơ sở dữ liệu (bb-dev)", () => {
  let pgClient: Client;
  let admin: SupabaseClient;
  let coBang = false;
  let branchId: string;
  let customerId: string;
  let galleryId: string;
  let galleryIdKhac: string;

  beforeAll(async () => {
    pgClient = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pgClient.connect();

    const { rows: bangKiem } = await pgClient.query(
      `select to_regclass('public.thong_bao_khach') as bang`,
    );
    coBang = bangKiem[0]?.bang !== null;

    admin = createAdminClient();

    const { rows: br } = await pgClient.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await pgClient.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-261') returning id`,
      [branchId],
    );
    customerId = kh[0].id;

    const { rows: g1 } = await pgClient.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-261 A','submitted',$3,'https://example.com/a',3) returning id`,
      [branchId, customerId, `fixture-bb261-a-${Date.now()}`],
    );
    galleryId = g1[0].id;

    const { rows: g2 } = await pgClient.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-261 B','submitted',$3,'https://example.com/b',3) returning id`,
      [branchId, customerId, `fixture-bb261-b-${Date.now()}`],
    );
    galleryIdKhac = g2[0].id;
  });

  afterAll(async () => {
    if (coBang) await pgClient.query("delete from thong_bao_khach where gallery_id = any($1)", [[galleryId, galleryIdKhac]]);
    await pgClient.query("delete from galleries where id = any($1)", [[galleryId, galleryIdKhac]]);
    await pgClient.query("delete from customers where id = $1", [customerId]);
    await pgClient.end();
  });

  it("nhacThongBaoChuaDoc: chỉ nhắc dòng CHƯA ĐỌC, tạo >24h, chưa nhắc đủ 2 lần", async () => {
    if (!coBang) {
      console.warn("[BB-261] Bỏ qua: bảng thong_bao_khach chưa có — chờ Opus áp 0074.");
      return;
    }

    const cu = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const moi = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

    const { data: chuaDoc } = await admin
      .from("thong_bao_khach")
      .insert({ gallery_id: galleryId, loai: "test", tieu_de: "Chưa đọc, đã cũ", noi_dung: "n1", created_at: cu })
      .select("id")
      .single();

    const { data: daDoc } = await admin
      .from("thong_bao_khach")
      .insert({
        gallery_id: galleryId,
        loai: "test",
        tieu_de: "Đã đọc",
        noi_dung: "n2",
        created_at: cu,
        da_doc_luc: new Date().toISOString(),
      })
      .select("id")
      .single();

    const { data: qua2Lan } = await admin
      .from("thong_bao_khach")
      .insert({
        gallery_id: galleryId,
        loai: "test",
        tieu_de: "Đã nhắc đủ 2 lần",
        noi_dung: "n3",
        created_at: cu,
        so_lan_nhac: 2,
      })
      .select("id")
      .single();

    const { data: quaMoi } = await admin
      .from("thong_bao_khach")
      .insert({ gallery_id: galleryId, loai: "test", tieu_de: "Mới, chưa tới 24h", noi_dung: "n4", created_at: moi })
      .select("id")
      .single();

    try {
      const soDaNhac = await nhacThongBaoChuaDoc(admin);
      expect(soDaNhac).toBeGreaterThanOrEqual(1);

      const { data: sauKhiNhac } = await admin
        .from("thong_bao_khach")
        .select("id, so_lan_nhac, nhac_lan_cuoi")
        .in("id", [chuaDoc!.id, daDoc!.id, qua2Lan!.id, quaMoi!.id]);

      interface DongSauNhac {
        id: string;
        so_lan_nhac: number;
        nhac_lan_cuoi: string | null;
      }
      const theoId = new Map<string, DongSauNhac>(
        ((sauKhiNhac ?? []) as DongSauNhac[]).map((d) => [d.id, d]),
      );
      expect(theoId.get(chuaDoc!.id as string)?.so_lan_nhac).toBe(1);
      expect(theoId.get(chuaDoc!.id as string)?.nhac_lan_cuoi).not.toBeNull();
      expect(theoId.get(daDoc!.id as string)?.so_lan_nhac).toBe(0);
      expect(theoId.get(qua2Lan!.id as string)?.so_lan_nhac).toBe(2);
      expect(theoId.get(quaMoi!.id as string)?.so_lan_nhac).toBe(0);
    } finally {
      await pgClient.query("delete from thong_bao_khach where id = any($1)", [
        [chuaDoc?.id, daDoc?.id, qua2Lan?.id, quaMoi?.id].filter(Boolean),
      ]);
    }
  });

  it("PATCH /api/g/thong-bao-khach: chỉ đánh dấu được thông báo của ĐÚNG bộ ảnh (bộ khác -> 404)", async () => {
    if (!coBang) {
      console.warn("[BB-261] Bỏ qua: bảng thong_bao_khach chưa có — chờ Opus áp 0074.");
      return;
    }

    const { data: dong } = await admin
      .from("thong_bao_khach")
      .insert({ gallery_id: galleryIdKhac, loai: "test", tieu_de: "t", noi_dung: "n" })
      .select("id")
      .single();

    try {
      const gallerySession = await import("@/lib/auth/gallery-session");
      const spy = vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
        galleryId, // phiên là bộ A, thông báo thuộc bộ B
        customerId: null,
        shareLinkId: "22222222-2222-2222-2222-222222222222",
        selectionId: "33333333-3333-3333-3333-333333333333",
        role: "owner",
        exp: 0,
      } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);

      const { PATCH } = await import("@/app/api/g/thong-bao-khach/route");
      const res = await PATCH(
        new Request("http://localhost/api/g/thong-bao-khach", {
          method: "PATCH",
          body: JSON.stringify({ id: dong!.id }),
        }),
      );
      expect(res.status).toBe(404);

      const { data: sau } = await admin
        .from("thong_bao_khach")
        .select("da_doc_luc")
        .eq("id", dong!.id)
        .single();
      expect(sau?.da_doc_luc).toBeNull();

      spy.mockRestore();
    } finally {
      await pgClient.query("delete from thong_bao_khach where id = $1", [dong?.id]);
    }
  });

  it("GET /api/g/thong-bao-khach: viewer (ông bà) đọc được", async () => {
    if (!coBang) {
      console.warn("[BB-261] Bỏ qua: bảng thong_bao_khach chưa có — chờ Opus áp 0074.");
      return;
    }

    const { data: dong } = await admin
      .from("thong_bao_khach")
      .insert({ gallery_id: galleryId, loai: "test", tieu_de: "Chào ông bà", noi_dung: "n" })
      .select("id")
      .single();

    try {
      const gallerySession = await import("@/lib/auth/gallery-session");
      const spy = vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
        galleryId,
        customerId: null,
        shareLinkId: "22222222-2222-2222-2222-222222222222",
        selectionId: "33333333-3333-3333-3333-333333333333",
        role: "viewer",
        exp: 0,
      } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);

      const { GET } = await import("@/app/api/g/thong-bao-khach/route");
      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.thongBao.some((t: { id: string }) => t.id === dong!.id)).toBe(true);
      expect(json.data.soChuaDoc).toBeGreaterThanOrEqual(1);

      spy.mockRestore();
    } finally {
      await pgClient.query("delete from thong_bao_khach where id = $1", [dong?.id]);
    }
  });
});

describe("BB-261: PATCH /api/g/thong-bao-khach — Zod chặn thân hỏng (không cần bảng)", () => {
  let gallerySession: typeof import("@/lib/auth/gallery-session");
  let PATCH: typeof import("@/app/api/g/thong-bao-khach/route").PATCH;

  beforeEach(async () => {
    gallerySession = await import("@/lib/auth/gallery-session");
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: "11111111-1111-1111-1111-111111111111",
      customerId: null,
      shareLinkId: "22222222-2222-2222-2222-222222222222",
      selectionId: "33333333-3333-3333-3333-333333333333",
      role: "owner",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
    ({ PATCH } = await import("@/app/api/g/thong-bao-khach/route"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("thân JSON hỏng -> 400, không 500", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/g/thong-bao-khach", {
        method: "PATCH",
        body: '{"id": "abc"',
      }),
    );
    expect(res.status).toBe(400);
  });

  it("thân rỗng {} (thiếu cả id lẫn tatCa) -> 400", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/g/thong-bao-khach", {
        method: "PATCH",
        body: JSON.stringify({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("cả id lẫn tatCa cùng lúc -> 400 (mơ hồ, từ chối)", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/g/thong-bao-khach", {
        method: "PATCH",
        body: JSON.stringify({ id: "11111111-1111-1111-1111-111111111111", tatCa: true }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("id không phải UUID -> 400", async () => {
    const res = await PATCH(
      new Request("http://localhost/api/g/thong-bao-khach", {
        method: "PATCH",
        body: JSON.stringify({ id: "khong-phai-uuid" }),
      }),
    );
    expect(res.status).toBe(400);
  });
});

describe("BB-261: PATCH đánh dấu theo id chỉ chạm dòng ĐÚNG bộ ảnh — fake DB (không cần bảng thật)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("thông báo id hợp lệ nhưng thuộc bộ ảnh KHÁC phiên -> 404, không đánh dấu", async () => {
    const dong = { id: "10000000-0000-4000-8000-000000000001", gallery_id: "gallery-khac", da_doc_luc: null as string | null };

    // `client` giả — hai `.eq()` liên tiếp đúng như route.ts gọi:
    // `.update(...).eq("id", input.id).eq("gallery_id", session.galleryId).select("id")`.
    // Chỉ khớp khi CẢ HAI điều kiện đúng — thiếu điều kiện thứ hai (gallery_id)
    // thì dòng của bộ ảnh khác cũng bị đánh dấu, đúng lỗ hổng cần canh.
    const adminGia = {
      from(bang: string) {
        if (bang !== "thong_bao_khach") throw new Error(`bảng không mong đợi: ${bang}`);
        let idCanKhop: string | null = null;
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: (c1: string, v1: string) => {
              if (c1 === "id") idCanKhop = v1;
              return {
                eq: (c2: string, v2: string) => ({
                  select: () => {
                    const khop = idCanKhop === dong.id && c2 === "gallery_id" && v2 === dong.gallery_id;
                    if (khop) dong.da_doc_luc = patch.da_doc_luc as string;
                    return Promise.resolve({ data: khop ? [{ id: dong.id }] : [], error: null });
                  },
                }),
              };
            },
          }),
        };
      },
    };

    const adminModule = await import("@/lib/supabase/admin");
    vi.spyOn(adminModule, "createAdminClient").mockReturnValue(
      adminGia as unknown as ReturnType<typeof adminModule.createAdminClient>,
    );

    const gallerySession = await import("@/lib/auth/gallery-session");
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: "gallery-phien", // phiên là một bộ ảnh KHÁC với dong.gallery_id
      customerId: null,
      shareLinkId: "22222222-2222-2222-2222-222222222222",
      selectionId: "33333333-3333-3333-3333-333333333333",
      role: "owner",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);

    const { PATCH } = await import("@/app/api/g/thong-bao-khach/route");
    const res = await PATCH(
      new Request("http://localhost/api/g/thong-bao-khach", {
        method: "PATCH",
        body: JSON.stringify({ id: dong.id }),
      }),
    );

    expect(res.status).toBe(404);
    expect(dong.da_doc_luc).toBeNull();
  });
});
