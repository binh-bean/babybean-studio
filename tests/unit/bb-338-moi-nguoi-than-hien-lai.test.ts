/**
 * BB-338 mục 2a — "Mời gia đình xem": ba mẹ tạo link xong, thoát ra vào lại
 * thì không thấy link để gửi/kiểm tra, chỉ còn nút thu hồi.
 *
 * Bản vá: POST lưu bản MÃ HOÁ vào `share_link_ma` (khuôn mẫu BB-201), GET của
 * ba mẹ giải lại cho link CÒN SỐNG, đối chiếu băm. Ca canh:
 *   1. Tạo → GET trả lại ĐÚNG địa chỉ vừa tạo (trước bản vá: không có trường này).
 *   2. Thu hồi → GET không trả địa chỉ nữa.
 *   3. Link cũ không có bản mã → `diaChiDayDu: null` (màn ba mẹ cho tạo lại).
 *   4. Bản mã lệch băm → không trả (thà không trả còn hơn trả nhầm link).
 *   5. Viewer gọi GET → 403 (không đổi).
 * Fixture "Fixture BB-338 …", dọn theo id.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as taoMoi, GET as danhSachMoi, DELETE as thuHoi } from "@/app/api/g/moi-nguoi-than/route";
import { maHoaMaLink } from "@/lib/auth/ma-link-loi";

type Muc = { id: string; trangThai: string; diaChiDayDu: string | null; duongDan: string | null };

describe("BB-338: link mời người thân hiện lại được", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let ownerLinkId = "";
  let selectionId = "";

  function phien(role = "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role,
      shareLinkId: ownerLinkId,
      selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const danhSach = async (): Promise<Muc[]> => {
    const res = await danhSachMoi();
    expect(res.status).toBe(200);
    return (await res.json()).data.items as Muc[];
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query(
      "select id from branches where name not like 'Fixture%' order by name limit 1",
    );
    branchId = br[0].id;
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-338 Mời') returning id`,
      [branchId],
    );
    customerId = kh[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-338 Mời','in_review',$3,'https://example.com/bb338m',1,5) returning id`,
      [branchId, customerId, `fixture-bb338m-${Date.now()}`],
    );
    galleryId = g[0].id;
    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb338o', 'owner', 'active') returning id`,
      [galleryId],
    );
    ownerLinkId = lk[0].id;
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, ownerLinkId],
    );
    selectionId = sel[0].id;
  });

  afterAll(async () => {
    if (galleryId) {
      await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await client.query("delete from selections where gallery_id = $1", [galleryId]);
      // share_link_ma đi theo share_links (cascade).
      await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1 and branch_id = $2", [galleryId, branchId]);
    }
    if (customerId) await client.query("delete from customers where id = $1 and branch_id = $2", [customerId, branchId]);
    await client.end();
  });

  it("1+2. tạo → vào lại vẫn thấy đúng link; thu hồi → không còn địa chỉ", async () => {
    phien("owner");
    const res = await taoMoi(
      new Request("http://localhost/api/g/moi-nguoi-than", {
        method: "POST",
        body: JSON.stringify({ nhan: "Fixture BB-338 Bà nội" }),
      }),
    );
    expect(res.status).toBe(200);
    const tao = (await res.json()).data;
    expect(tao.luuDiaChiDuoc).toBe(true);

    const muc = (await danhSach()).find((d) => d.id === tao.shareLinkId)!;
    expect(muc.trangThai).toBe("active");
    expect(muc.duongDan).toBe(tao.duongDan);
    expect(muc.diaChiDayDu).toBe(tao.diaChiDayDu);

    const xoa = await thuHoi(new Request(`http://localhost/api/g/moi-nguoi-than?id=${tao.shareLinkId}`, { method: "DELETE" }));
    expect(xoa.status).toBe(200);
    const sau = (await danhSach()).find((d) => d.id === tao.shareLinkId)!;
    expect(sau.trangThai).toBe("revoked");
    expect(sau.diaChiDayDu).toBeNull();
  });

  it("3+4. link cũ không có bản mã → null; bản mã lệch băm → null", async () => {
    const { rows: cu } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status, label)
       values ($1, md5(random()::text), 'bb338c', 'viewer', 'active', 'Fixture BB-338 cũ') returning id`,
      [galleryId],
    );
    const { rows: lech } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status, label)
       values ($1, md5(random()::text), 'bb338l', 'viewer', 'active', 'Fixture BB-338 lệch') returning id`,
      [galleryId],
    );
    await client.query("insert into share_link_ma (share_link_id, ma_hoa) values ($1,$2)", [
      lech[0].id,
      maHoaMaLink("ma-cua-nha-khac"),
    ]);
    phien("owner");
    const ds = await danhSach();
    expect(ds.find((d) => d.id === cu[0].id)!.diaChiDayDu).toBeNull();
    expect(ds.find((d) => d.id === lech[0].id)!.diaChiDayDu).toBeNull();
  });

  it("5. viewer gọi GET → 403", async () => {
    phien("viewer");
    const res = await danhSachMoi();
    expect(res.status).toBe(403);
  });
});
