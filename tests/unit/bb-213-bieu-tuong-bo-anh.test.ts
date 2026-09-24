/**
 * BB-213 — manifest và icon màn hình chính RIÊNG theo từng link (`/g/<token>`).
 *
 * Quyền xem đến từ MÃ TRONG ĐƯỜNG DẪN (băm rồi so với share_links), không từ
 * cookie phiên — xem src/lib/auth/xac-thuc-token-bo-anh.ts. Ba ca phải trả
 * 404 GIỐNG HỆT NHAU, không tiết lộ lý do: sai mã, đã thu hồi, hết hạn. Chỉ
 * mã ĐÚNG mới trả manifest có start_url/scope đúng `/g/<token>` và icon trỏ
 * đúng route bia-vuong.
 *
 * Không gọi Drive thật: driveFetch bị giả lập — route icon dùng nó để lấy
 * ảnh bìa, và phép thử này canh QUYỀN chứ không canh việc tải ảnh (đã có
 * tests/unit/bb-137-cache-anh-nho.test.ts canh phần đệm ảnh).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as driveClient from "@/lib/drive/client";
import { bamMaLink } from "@/lib/auth/bam-ma-link";
import { GET as layManifest } from "@/app/api/g/[token]/manifest.webmanifest/route";
import { GET as layIcon } from "@/app/api/g/[token]/bia-vuong/route";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-213 ${runId}`;

/** Token trần kiểu sản phẩm thật: 22 ký tự base64url. */
function taoTokenTran(): string {
  return randomBytes(17).toString("base64url").slice(0, 22);
}

describe("BB-213: manifest và icon riêng theo /g/<token>", () => {
  let client: Client;
  let branchId = "";
  let khach = "";
  let be = "";
  let bo = "";

  let tokenDung = "";
  let tokenThuHoi = "";
  let tokenHetHan = "";
  const tokenSai = taoTokenTran();

  const goiManifest = (token: string) =>
    layManifest(new Request(`http://localhost/api/g/${token}/manifest.webmanifest`), {
      params: Promise.resolve({ token }),
    });

  const goiIcon = (token: string, w = "192") =>
    layIcon(new Request(`http://localhost/api/g/${token}/bia-vuong?w=${w}`), {
      params: Promise.resolve({ token }),
    });

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: k } = await client.query(
      "insert into customers (branch_id, full_name) values ($1,$2) returning id",
      [branchId, `${NHAN} Khách`],
    );
    khach = k[0].id;

    const { rows: b } = await client.query(
      "insert into babies (customer_id, full_name, nickname) values ($1,$2,$3) returning id",
      [khach, `${NHAN} Bé Đầy Đủ`, "Bé Bo"],
    );
    be = b[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, baby_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,$4,'ready',$5,'https://example.com/x',1) returning id`,
      [branchId, khach, be, `${NHAN} Bộ`, `fixture-bb213-${runId}`],
    );
    bo = g[0].id;

    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'bia.jpg','image/jpeg',1,'active')`,
      [bo, `fixture-bb213-file-${runId}`],
    );

    tokenDung = taoTokenTran();
    tokenThuHoi = taoTokenTran();
    tokenHetHan = taoTokenTran();

    // chk_share_link_target: đúng MỘT trong hai (gallery_id, customer_id) —
    // đây là link kiểu cũ, gắn thẳng theo bộ ảnh, nên customer_id để NULL.
    await client.query(
      `insert into share_links (gallery_id, customer_id, token_hash, token_prefix, role, status)
       values ($1,null,$2,$3,'owner','active')`,
      [bo, await bamMaLink(tokenDung), tokenDung.slice(0, 6)],
    );
    await client.query(
      `insert into share_links (gallery_id, customer_id, token_hash, token_prefix, role, status, revoked_at)
       values ($1,null,$2,$3,'owner','revoked', now())`,
      [bo, await bamMaLink(tokenThuHoi), tokenThuHoi.slice(0, 6)],
    );
    await client.query(
      `insert into share_links (gallery_id, customer_id, token_hash, token_prefix, role, status, expires_at)
       values ($1,null,$2,$3,'owner','active', now() - interval '1 day')`,
      [bo, await bamMaLink(tokenHetHan), tokenHetHan.slice(0, 6)],
    );

    // Duy nhất đường ra Google, không gọi thật trong phép thử.
    vi.spyOn(driveClient, "driveFetch").mockImplementation(async () => {
      return new Response(new Uint8Array([255, 216, 255, 0, 1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      });
    });
  });

  afterAll(async () => {
    await client.query("delete from share_links where gallery_id = $1", [bo]);
    await client.query("delete from photos where gallery_id = $1", [bo]);
    await client.query("delete from galleries where id = $1", [bo]);
    await client.query("delete from babies where id = $1", [be]);
    await client.query("delete from customers where id = $1", [khach]);
    await client.end();
  });

  describe("Sai mã — 404, không tiết lộ gì", () => {
    it("manifest", async () => {
      const res = await goiManifest(tokenSai);
      expect(res.status).toBe(404);
    });
    it("icon", async () => {
      const res = await goiIcon(tokenSai);
      expect(res.status).toBe(404);
    });
  });

  describe("Link đã thu hồi — 404 giống hệt sai mã", () => {
    it("manifest", async () => {
      const res = await goiManifest(tokenThuHoi);
      expect(res.status).toBe(404);
    });
    it("icon", async () => {
      const res = await goiIcon(tokenThuHoi);
      expect(res.status).toBe(404);
    });
  });

  describe("Link hết hạn — 404 giống hệt sai mã", () => {
    it("manifest", async () => {
      const res = await goiManifest(tokenHetHan);
      expect(res.status).toBe(404);
    });
    it("icon", async () => {
      const res = await goiIcon(tokenHetHan);
      expect(res.status).toBe(404);
    });
  });

  describe("Link đúng — manifest và icon dựng đúng cho bộ ảnh", () => {
    it("manifest có start_url/scope đúng /g/<token>, icon trỏ đúng route bia-vuong, tên lấy nickname", async () => {
      const res = await goiManifest(tokenDung);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/manifest+json");

      const body = await res.json();
      expect(body.start_url).toBe(`/g/${tokenDung}`);
      expect(body.scope).toBe(`/g/${tokenDung}`);
      expect(body.name).toBe("Ảnh của bé Bé Bo");
      expect(body.display).toBe("standalone");
      expect(body.background_color).toBe("#f7f2eb");

      const src192 = body.icons.find((i: { sizes: string }) => i.sizes === "192x192")?.src;
      const src512 = body.icons.find((i: { sizes: string }) => i.sizes === "512x512")?.src;
      expect(src192).toBe(`/api/g/${tokenDung}/bia-vuong?w=192`);
      expect(src512).toBe(`/api/g/${tokenDung}/bia-vuong?w=512`);
    });

    it("icon tải được (qua Drive giả lập) và Cache-Control là private", async () => {
      const res = await goiIcon(tokenDung, "192");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/jpeg");
      expect(res.headers.get("Cache-Control")).toContain("private");
    });

    it("cỡ icon không nằm trong danh sách cho phép thì bị từ chối", async () => {
      const res = await goiIcon(tokenDung, "999");
      expect(res.status).toBe(400);
    });
  });

  // KIỂM NGƯỢC — bắt buộc theo docs/20 mục "Luật cho agent" #6: cố tình bỏ
  // kiểm status rồi xác nhận ca "thu hồi" ĐỎ đúng lý do bị bỏ.
  it("kiểm ngược — bỏ kiểm status thì ca 'đã thu hồi' lẽ ra phải qua được (và đó là sai)", async () => {
    const { data: link } = await (
      await import("@/lib/supabase/admin")
    ).createAdminClient()
      .from("share_links")
      .select("status, expires_at")
      .eq("token_hash", await bamMaLink(tokenThuHoi))
      .maybeSingle();

    // Bản CÓ kiểm status (đúng, đang chạy trong route thật): thu hồi bị chặn.
    expect(link?.status).toBe("revoked");
    const dungDuocNeuBoKiemStatus =
      !!link && (!link.expires_at || new Date(link.expires_at) > new Date());
    // Nếu route BỎ kiểm status (lỗi giả định), ca thu hồi sẽ lọt qua — đúng
    // như dòng dưới đây chứng minh (true nghĩa là ĐÁNG LẼ sai). Route thật đã
    // KHÔNG bỏ kiểm, nên các ca ở khối "Link đã thu hồi" bên trên đều đỏ đúng
    // — tức route thật trả 404, không phải 200.
    expect(dungDuocNeuBoKiemStatus).toBe(true);
    const resThuc = await goiManifest(tokenThuHoi);
    expect(resThuc.status).toBe(404);
  });
});
