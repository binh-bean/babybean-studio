/**
 * BB-342 — phép thử PHỦ ĐỊNH cho kênh "cập nhật tức thì".
 *
 * Câu hỏi an ninh: một khách cầm mã link của bộ B có nghe được sự kiện của bộ
 * A không? Đo ở HAI TẦNG, vì mỗi tầng hỏng một kiểu:
 *
 *  1. Cửa cấp tên kênh (`GET /api/g/tuc-thi`, `GET /api/admin/tuc-thi`): phiên
 *     của B chỉ được tên kênh của B; không phiên / link đã thu hồi thì không
 *     được gì. Phiên ký THẬT bằng `signGallerySession`, cookie giả qua
 *     `next/headers` — không giả lập chính cái cửa đang đo.
 *  2. Supabase Realtime THẬT (bb-dev, chỉ broadcast — không ghi bảng nào ngoài
 *     fixture): một trình nghe cầm kênh của B, cộng mọi tên kênh "đoán được"
 *     từ id (kh:<id>, nv:<chi nhánh>, id trần), KHÔNG nhận được sự kiện phát
 *     cho A — trong khi trình nghe đối chứng cầm đúng kênh A thì nhận được.
 *     Thiếu đối chứng thì "không nhận gì" có thể chỉ vì Realtime đang sập.
 *
 * Fixture: "Fixture BB-342 …", dọn theo id ở afterAll (AGENTS §6).
 *
 * Kiểm ngược (đã chạy, dán trong bàn giao): đổi `kenhKhach` thành
 * `kh:${galleryId}` → ca 2 ĐỎ (trình nghe đoán `kh:<id A>` nhận được tin).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import { randomBytes, createHash } from "node:crypto";

vi.mock("server-only", () => ({}));

let cookieHienTai = "";
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (ten: string) => (ten === "bb_gs" && cookieHienTai ? { value: cookieHienTai } : undefined),
    getAll: () => [],
    set: () => {},
    delete: () => {},
  }),
}));

import { signGallerySession } from "@/lib/auth/gallery-session";
import { kenhKhach, kenhNhanVien, phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { GET as layKenhKhach } from "@/app/api/g/tuc-thi/route";
import { GET as layKenhNhanVien } from "@/app/api/admin/tuc-thi/route";
import { TEN_SU_KIEN_TUC_THI } from "@/lib/utils/tuc-thi-su-kien";

const runId = randomBytes(4).toString("hex");
const NHAN = `Fixture BB-342 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("BB-342: khách bộ B không nghe được sự kiện của bộ A", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  const bo: Record<"A" | "B", { galleryId: string; linkId: string; selectionId: string }> = {
    A: { galleryId: "", linkId: "", selectionId: "" },
    B: { galleryId: "", linkId: "", selectionId: "" },
  };

  async function dangNhap(ten: "A" | "B") {
    const { token } = await signGallerySession({
      galleryId: bo[ten].galleryId,
      shareLinkId: bo[ten].linkId,
      selectionId: bo[ten].selectionId,
      role: "owner",
      customerId: "",
    } as unknown as Parameters<typeof signGallerySession>[0]);
    cookieHienTai = token;
  }

  async function kenhTraVe(): Promise<{ status: number; kenh: string[] }> {
    const res = await layKenhKhach(new Request("http://localhost/api/g/tuc-thi"));
    const json = (await res.json().catch(() => null)) as { data?: { kenh?: string[] } } | null;
    return { status: res.status, kenh: json?.data?.kenh ?? [] };
  }

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000342') returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;
    for (const ten of ["A", "B"] as const) {
      const { rows: g } = await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                photo_count, included_quota)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',0,10) returning id`,
        [branchId, customerId, `${NHAN} Bộ ${ten}`, `fixture-bb342-${runId}-${ten}`],
      );
      bo[ten].galleryId = g[0].id;
      const ma = randomBytes(32).toString("base64url");
      const { rows: l } = await pg.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
         values ($1,$2,$3,'owner','active') returning id`,
        [g[0].id, sha256(ma), ma.slice(0, 6)],
      );
      bo[ten].linkId = l[0].id;
      const { rows: s } = await pg.query(
        `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
        [g[0].id, l[0].id],
      );
      bo[ten].selectionId = s[0].id;
    }
  });

  afterAll(async () => {
    if (pg) {
      for (const ten of ["A", "B"] as const) {
        const id = bo[ten].galleryId;
        if (!id) continue;
        await pg.query("delete from selections where gallery_id = $1", [id]);
        await pg.query("delete from share_links where gallery_id = $1", [id]);
        await pg.query("delete from galleries where id = $1", [id]);
      }
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      await pg.end();
    }
  });

  it("1. Cửa cấp tên kênh: phiên B chỉ nhận kênh B; không phiên → 401; link B bị thu hồi → không kênh", async () => {
    await dangNhap("A");
    const a = await kenhTraVe();
    expect(a.status).toBe(200);
    expect(a.kenh).toEqual([kenhKhach(bo.A.galleryId)]);

    await dangNhap("B");
    const b = await kenhTraVe();
    expect(b.status).toBe(200);
    expect(b.kenh).toEqual([kenhKhach(bo.B.galleryId)]);
    expect(b.kenh).not.toContain(kenhKhach(bo.A.galleryId));

    cookieHienTai = "";
    expect((await kenhTraVe()).status).toBe(401);

    cookieHienTai = "gia.mao";
    expect((await kenhTraVe()).status).toBe(401);

    await pg.query("update share_links set status = 'revoked' where id = $1", [bo.B.linkId]);
    try {
      await dangNhap("B");
      const thuHoi = await kenhTraVe();
      expect(thuHoi.status).not.toBe(200);
      expect(thuHoi.kenh).toEqual([]);
    } finally {
      await pg.query("update share_links set status = 'active' where id = $1", [bo.B.linkId]);
    }

    // Kênh nhân viên: không đăng nhập Supabase Auth → 401, không tên kênh nào.
    const nv = await layKenhNhanVien();
    expect(nv.status).toBe(401);
  });

  it("2. Realtime thật: trình nghe cầm kênh B và các tên đoán được KHÔNG nhận tin của A; đối chứng cầm kênh A thì nhận", async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    await dangNhap("B");
    const kenhCuaB = (await kenhTraVe()).kenh;
    expect(kenhCuaB).toHaveLength(1);

    const doan = [
      ...kenhCuaB,
      `kh:${bo.A.galleryId}`,
      bo.A.galleryId,
      `kh:${bo.A.galleryId.replace(/-/g, "")}`,
      `nv:${branchId}`,
      "kh:*",
    ];
    const nhanDuoc = new Map<string, unknown[]>();
    const kenhMo: RealtimeChannel[] = [];

    async function nghe(ten: string) {
      // Hai kênh trùng tên trên một kết nối thì kênh sau không vào được — nghe
      // một lần, cả hai phép đo đọc chung một hộp (trùng là lỗi, sẽ hiện ở dưới).
      if (nhanDuoc.has(ten)) return;
      nhanDuoc.set(ten, []);
      const ch = sb.channel(ten).on("broadcast", { event: TEN_SU_KIEN_TUC_THI }, (m) => {
        nhanDuoc.get(ten)!.push(m.payload);
      });
      kenhMo.push(ch);
      await new Promise<void>((res, rej) => {
        const t = setTimeout(() => rej(new Error(`không SUBSCRIBED được ${ten}`)), 10_000);
        ch.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            clearTimeout(t);
            res();
          }
        });
      });
    }

    const kenhA = kenhKhach(bo.A.galleryId);
    try {
      for (const ten of [kenhA, kenhNhanVien(branchId), ...doan]) await nghe(ten);

      const ok = await phatSuKienBoAnh({ galleryId: bo.A.galleryId, branchId, loai: "studio.xac_nhan" });
      expect(ok).toBe(true);

      // Đối chứng: kênh A nhận trong vòng 5 giây.
      const batDau = Date.now();
      while (nhanDuoc.get(kenhA)!.length === 0 && Date.now() - batDau < 5_000) {
        await new Promise((r) => setTimeout(r, 100));
      }
      expect(nhanDuoc.get(kenhA)).toEqual([{ loai: "studio.xac_nhan" }]);
      // Chờ thêm một nhịp cho chắc tin không tới muộn ở kênh khác.
      await new Promise((r) => setTimeout(r, 1_000));

      for (const ten of doan) expect({ ten, tin: nhanDuoc.get(ten) }).toEqual({ ten, tin: [] });

      // Kênh nhân viên đúng của chi nhánh (HMAC) thì có tin — chỉ loại + id, không dữ liệu cá nhân.
      expect(nhanDuoc.get(kenhNhanVien(branchId))).toEqual([{ loai: "studio.xac_nhan", galleryId: bo.A.galleryId }]);
    } finally {
      for (const ch of kenhMo) await sb.removeChannel(ch);
    }
  }, 60_000);
});
