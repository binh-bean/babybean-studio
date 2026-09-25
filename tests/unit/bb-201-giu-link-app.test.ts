/**
 * BB-201 — link gửi khách hiện lại được ở màn quản trị, mà vẫn không lưu mã gốc.
 *
 * Canh bốn điều:
 *  1. Mã hoá đi-về đúng; bản mã bị sửa / sai khoá / sai định dạng → null.
 *  2. Tạo link ghi bản mã vào share_link_ma, và giải ra đúng mã có băm khớp.
 *  3. Màn chi tiết trả link đầy đủ CHỈ cho người có galleries:share; link đã
 *     thu hồi, hay bản mã không khớp băm, thì không trả.
 *  4. anon và nhân viên đăng nhập (authenticated) KHÔNG đọc được share_link_ma.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
vi.mock("server-only", () => ({}));
// Khôi phục từ Lark: giả lập đúng hàm đọc Lark — không gọi Lark thật.
const larkGia = vi.hoisted(() => ({ ma: null as string | null }));
vi.mock("@/lib/lark/khoi-phuc-link-app", async (goc) => ({
  ...(await goc<typeof import("@/lib/lark/khoi-phuc-link-app")>()),
  docMaLinkAppTuLark: vi.fn(async () => larkGia.ma),
}));
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import * as staffAuth from "@/lib/auth/staff";
import { maHoaMaLink, giaiMaMaLink } from "@/lib/auth/ma-link";
import { POST as taoLink } from "@/app/api/admin/galleries/[id]/share-link/route";
import { GET as xemChiTiet } from "@/app/api/admin/galleries/[id]/items/route";
import { layMaTuO } from "@/lib/lark/khoi-phuc-link-app";

const bam = (s: string) => createHash("sha256").update(s).digest("hex");
const runId = Math.random().toString(36).slice(2, 8);

describe("BB-201: mã hoá mã link", () => {
  it("đi-về đúng, mỗi lần một IV khác nhau", () => {
    const ma = randomBytes(32).toString("base64url");
    const a = maHoaMaLink(ma);
    const b = maHoaMaLink(ma);
    expect(a).not.toBe(b);
    expect(a.startsWith("v1:")).toBe(true);
    expect(a).not.toContain(ma);
    expect(giaiMaMaLink(a)).toBe(ma);
  });

  it("sửa một ký tự bản mã → null (thẻ xác thực GCM)", () => {
    const enc = maHoaMaLink("ma-thu-nghiem");
    const phan = enc.split(":");
    const ct = phan[3]!;
    phan[3] = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
    expect(giaiMaMaLink(phan.join(":"))).toBeNull();
  });

  it("sai định dạng / rỗng → null, không ném", () => {
    expect(giaiMaMaLink("")).toBeNull();
    expect(giaiMaMaLink(null)).toBeNull();
    expect(giaiMaMaLink("v2:a:b:c")).toBeNull();
    expect(giaiMaMaLink("khong-phai-ban-ma")).toBeNull();
  });

  it("khoá khác (APP_SECRET khác) → null", () => {
    const enc = maHoaMaLink("ma-thu-nghiem");
    vi.stubEnv("APP_SECRET", "x".repeat(40));
    try {
      expect(giaiMaMaLink(enc)).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("BB-201: link hiện lại ở màn chi tiết", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  // share_links.created_by có khoá ngoại tới staff_profiles — dùng một nhân viên
  // có thật chỉ để ghi người tạo link Fixture (xoá ở afterAll), như BB-148.
  let staffId = "";

  const params = () => ({ params: Promise.resolve({ id: galleryId }) });
  const asRole = (role: string) =>
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role,
      branchIds: [branchId],
      permissions: quyenCuaVai(role),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  const layDiaChi = async () => {
    const res = await xemChiTiet(new Request("http://localhost"), params());
    expect(res.status).toBe(200);
    return (await res.json()).data.shareLink?.diaChi as string | null;
  };

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    staffId = (await client.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1")).rows[0].id;
    const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `Fixture BB-201 ${runId}`, soGia],
    );
    customerId = kh[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',1) returning id`,
      [branchId, customerId, `Fixture BB-201 ${runId}`, `fixture-bb201-${runId}`],
    );
    galleryId = g[0].id;
    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, status) values ($1,$2,'BB201.jpg','image/jpeg','active')`,
      [galleryId, `bb201-${runId}`],
    );
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    if (galleryId) {
      await client.query("delete from selections where gallery_id = $1", [galleryId]);
      await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await client.query("delete from share_links where gallery_id = $1", [galleryId]); // share_link_ma đi theo (cascade)
      await client.query("delete from photos where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1", [galleryId]);
    }
    if (customerId) await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("tạo link → share_link_ma có bản mã giải ra đúng mã (băm khớp); màn chi tiết hiện đúng link", async () => {
    asRole("cs");
    const res = await taoLink(new Request("http://localhost", { method: "POST", body: "{}" }), params());
    expect(res.status).toBe(200);
    const ma = (await res.json()).data.duongDan.replace("/g/", "") as string;

    const { rows } = await client.query(
      `select sl.token_hash, m.ma_hoa from share_links sl join share_link_ma m on m.share_link_id = sl.id
        where sl.gallery_id = $1 and sl.status = 'active'`,
      [galleryId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].ma_hoa).not.toContain(ma);
    expect(giaiMaMaLink(rows[0].ma_hoa)).toBe(ma);
    expect(bam(ma)).toBe(rows[0].token_hash);

    expect(await layDiaChi()).toBe(`https://app.example.com/g/${ma}`);
  });

  it("không có quyền gửi link (photographer) → không trả link", async () => {
    asRole("photographer");
    expect(await layDiaChi()).toBeNull();
  });

  it("bản mã không khớp băm (khôi phục nhầm dòng) → không trả link", async () => {
    asRole("cs");
    const { rows } = await client.query(
      `select id from share_links where gallery_id = $1 and status = 'active'`,
      [galleryId],
    );
    const id = rows[0].id;
    const { rows: cu } = await client.query("select ma_hoa from share_link_ma where share_link_id = $1", [id]);
    await client.query("update share_link_ma set ma_hoa = $2 where share_link_id = $1", [id, maHoaMaLink("ma-cua-nha-khac")]);
    try {
      expect(await layDiaChi()).toBeNull();
    } finally {
      await client.query("update share_link_ma set ma_hoa = $2 where share_link_id = $1", [id, cu[0].ma_hoa]);
    }
  });

  it("link đã thu hồi → không trả link", async () => {
    asRole("cs");
    await client.query(
      `update share_links set status = 'revoked', revoked_at = now() where gallery_id = $1`,
      [galleryId],
    );
    expect(await layDiaChi()).toBeNull();
  });
});

describe("BB-201: share_link_ma khoá kín", () => {
  for (const vai of ["anon", "authenticated"]) {
    it(`${vai} SELECT share_link_ma → permission denied`, async () => {
      const c = new Client({ connectionString: process.env.SUPABASE_DB_URL });
      await c.connect();
      try {
        await c.query("begin");
        await c.query(`set local role ${vai}`);
        await expect(c.query("select * from share_link_ma limit 1")).rejects.toThrow(/permission denied/);
      } finally {
        await c.query("rollback").catch(() => {});
        await c.end();
      }
    });
  }
});

describe("BB-201: đọc mã từ ô 'Link app' của Lark", () => {
  const ma = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ab";
  it("chuỗi, {link,text}, mảng — đều lấy được mã sau /g/", () => {
    expect(layMaTuO(`https://hauky.babybeanstudio.vn/g/${ma}`)).toBe(ma);
    expect(layMaTuO({ link: `https://x.vn/g/${ma}`, text: "Link app" })).toBe(ma);
    expect(layMaTuO([{ text: "rác" }, { link: `https://x.vn/g/${ma}` }])).toBe(ma);
  });
  it("không có /g/ hoặc mã quá ngắn → null", () => {
    expect(layMaTuO("https://drive.google.com/drive/folders/abc")).toBeNull();
    expect(layMaTuO("https://x.vn/g/ngan")).toBeNull();
    expect(layMaTuO(null)).toBeNull();
  });
});

describe("BB-201: khôi phục link cũ từ Lark khi mở bộ ảnh", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let staffId = "";
  const ids: string[] = [];

  beforeAll(async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    branchId = (await client.query("select id from branches order by name limit 1")).rows[0].id;
    staffId = (await client.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1")).rows[0].id;
    const soGia = `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
    customerId = (
      await client.query(`insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`, [
        branchId, `Fixture BB-201 khôi phục ${runId}`, soGia,
      ])
    ).rows[0].id;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    for (const id of ids) {
      await client.query("delete from share_links where gallery_id = $1", [id]);
      await client.query("delete from galleries where id = $1", [id]);
    }
    if (customerId) await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  /** Bộ ảnh + link KIỂU CŨ (chỉ có băm, chưa có share_link_ma), gắn một bản ghi Lark giả. */
  async function taoBoCu() {
    const ma = randomBytes(32).toString("base64url");
    const g = (
      await client.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, lark_hauky_record_id)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',$5) returning id`,
        [branchId, customerId, `Fixture BB-201 cũ ${runId}`, `fixture-bb201c-${randomBytes(4).toString("hex")}`, `recFixture${randomBytes(4).toString("hex")}`],
      )
    ).rows[0].id as string;
    ids.push(g);
    const l = (
      await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix, role, status) values ($1,$2,$3,'owner','active') returning id`,
        [g, bam(ma), ma.slice(0, 6)],
      )
    ).rows[0].id as string;
    return { g, l, ma };
  }

  const xem = async (g: string) => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId, role: "cs", branchIds: [branchId], permissions: quyenCuaVai("cs"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
    const res = await xemChiTiet(new Request("http://localhost"), { params: Promise.resolve({ id: g }) });
    return (await res.json()).data.shareLink?.diaChi as string | null;
  };

  it("Lark có ĐÚNG link → hiện link và lưu bản mã (lần sau không cần Lark)", async () => {
    const { g, l, ma } = await taoBoCu();
    larkGia.ma = ma;
    expect(await xem(g)).toBe(`https://app.example.com/g/${ma}`);
    const { rows } = await client.query("select ma_hoa from share_link_ma where share_link_id = $1", [l]);
    expect(rows).toHaveLength(1);
    expect(giaiMaMaLink(rows[0].ma_hoa)).toBe(ma);
  });

  it("Lark có link của NHÀ KHÁC (băm không khớp) → không hiện, không lưu", async () => {
    const { g, l } = await taoBoCu();
    larkGia.ma = randomBytes(32).toString("base64url");
    expect(await xem(g)).toBeNull();
    const { rows } = await client.query("select 1 from share_link_ma where share_link_id = $1", [l]);
    expect(rows).toHaveLength(0);
  });
});
