/**
 * BB-188 — Mở khoá link CŨ, giữ nguyên địa chỉ.
 *
 * Chủ studio, 18.09.2026: *"Không phải tạo link mới mà mở khoá link cũ — vì
 * nếu khách tạo icon app trên màn điện thoại mà cấp link mới thì khách phải
 * làm lại icon khác."*
 *
 * Cả phép thử này xoay quanh đúng một con số: `token_hash`. Nó KHÔNG ĐỔI thì
 * địa chỉ không đổi, và biểu tượng ba mẹ đã ghim ngoài màn hình vẫn mở được.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { NextRequest } from "next/server";
import { POST as taoLink } from "@/app/api/admin/galleries/[id]/share-link/route";
import { POST as moLaiLink } from "@/app/api/admin/galleries/[id]/share-link/mo-lai/route";
import { POST as authGallery } from "@/app/api/auth/gallery/route";
import * as staffAuth from "@/lib/auth/staff";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
vi.mock("server-only", () => ({}));

describe("BB-188 — mở khoá link cũ không đổi địa chỉ", () => {
  let client: Client;
  let branchId = "";
  let staffId = "";
  let customerId = "";
  let galleryId = "";
  let boTrong = "";

  const params = (id: string) => ({ params: Promise.resolve({ id }) });
  const body = () => new Request("http://localhost", { method: "POST", body: "{}" });

  function asCs() {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId,
      role: "cs",
      branchIds: [branchId], permissions: quyenCuaVai("cs"), } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: st } = await client.query("select id from staff_profiles where full_name not like 'Fixture%' order by created_at limit 1");
    staffId = st[0].id;

    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-188') returning id`,
      [branchId],
    );
    customerId = c[0].id;

    const themBo = async (ten: string, soAnh: number) => {
      const { rows: g } = await client.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',$5) returning id`,
        [branchId, customerId, ten, `fixture-bb188-${ten}-${Date.now()}`, soAnh],
      );
      return g[0].id as string;
    };

    galleryId = await themBo("Fixture BB-188 Gallery", 2);
    boTrong = await themBo("Fixture BB-188 Chua Co Link", 2);

    for (let i = 1; i <= 2; i++) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, status)
         values ($1,$2,$3,'image/jpeg','active')`,
        [galleryId, `bb188_file_${i}`, `IMG_${i}.jpg`],
      );
    }
  });

  afterAll(async () => {
    for (const g of [galleryId, boTrong].filter(Boolean)) {
      await client.query("delete from share_links where gallery_id = $1", [g]);
      await client.query(
        `delete from selection_items where selection_id in (select id from selections where gallery_id = $1)`,
        [g],
      );
      await client.query("delete from selections where gallery_id = $1", [g]);
      await client.query("delete from photos where gallery_id = $1", [g]);
      await client.query("delete from galleries where id = $1", [g]);
    }
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("link hết hạn → mở khoá giữ NGUYÊN token_hash, và mã cũ đăng nhập lại được", async () => {
    asCs();

    const res = await taoLink(body(), params(galleryId));
    expect(res.status).toBe(200);
    const maCu = (await res.json()).data.duongDan.replace("/g/", "");

    const { rows: truoc } = await client.query(
      "select id, token_hash from share_links where gallery_id = $1",
      [galleryId],
    );
    expect(truoc.length).toBe(1);

    // Đẩy hạn về quá khứ: đúng cảnh ba mẹ gọi lên sau hai tháng.
    await client.query(
      "update share_links set expires_at = now() - interval '1 day' where id = $1",
      [truoc[0].id],
    );
    const hong = await authGallery(
      new NextRequest("http://localhost/api/auth/gallery", {
        method: "POST",
        body: JSON.stringify({ token: maCu }),
      }),
    );
    expect(hong.status).not.toBe(200);

    const resMo = await moLaiLink(body(), params(galleryId));
    expect(resMo.status).toBe(200);
    const jsonMo = await resMo.json();
    expect(jsonMo.data.giuNguyenDiaChi).toBe(true);
    expect(jsonMo.data.shareLinkId).toBe(truoc[0].id);

    const { rows: sau } = await client.query(
      "select id, token_hash, status, expires_at from share_links where gallery_id = $1",
      [galleryId],
    );

    // Đây là chốt của cả BB-188: vẫn ĐÚNG MỘT link, và vẫn ĐÚNG mã đó.
    expect(sau.length).toBe(1);
    expect(sau[0].id).toBe(truoc[0].id);
    expect(sau[0].token_hash).toBe(truoc[0].token_hash);
    expect(sau[0].status).toBe("active");
    expect(new Date(sau[0].expires_at).getTime()).toBeGreaterThan(Date.now());

    // Và chốt theo cách ba mẹ thật sự gặp: bấm lại biểu tượng đã ghim.
    const lai = await authGallery(
      new NextRequest("http://localhost/api/auth/gallery", {
        method: "POST",
        body: JSON.stringify({ token: maCu }),
      }),
    );
    expect(lai.status).toBe(200);
  });

  it("tạo link mới thì ĐỔI token_hash — đó là lý do phải có đường mở khoá riêng", async () => {
    asCs();

    const { rows: truoc } = await client.query(
      "select token_hash from share_links where gallery_id = $1 and status = 'active'",
      [galleryId],
    );
    expect(truoc.length).toBe(1);

    const res = await taoLink(body(), params(galleryId));
    expect(res.status).toBe(200);

    const { rows: sau } = await client.query(
      "select token_hash from share_links where gallery_id = $1 and status = 'active'",
      [galleryId],
    );
    expect(sau.length).toBe(1);
    expect(sau[0].token_hash).not.toBe(truoc[0].token_hash);
  });

  it("bộ chưa từng có link → từ chối, và nói rõ phải bấm nút nào", async () => {
    asCs();

    const res = await moLaiLink(body(), params(boTrong));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error.message).toContain("T\u1ea1o link g\u1eedi kh\u00e1ch");
  });
});
