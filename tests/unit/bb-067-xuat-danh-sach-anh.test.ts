/**
 * BB-067 — xuất danh sách ảnh khách đã chọn.
 *
 * Quyền `galleries:export` có từ lâu và không mở được gì: không route, không
 * nút, chỉ có một cụm chữ nằm sẵn trong tệp dịch. Đây là phép thử cho đường
 * vừa dựng.
 *
 * Bốn điều phải đúng, mỗi điều hỏng một kiểu khác nhau:
 *
 *   1. **Chỉ ảnh khách CHÍNH chọn.** Lấy nhầm ảnh người thân gợi ý là thợ
 *      chỉnh ảnh làm thừa hàng chục tấm không ai đặt, và studio tính tiền
 *      những tấm khách không chọn.
 *   2. **Ghi chú đi kèm và không làm lệch cột.** Khách viết tự do; một dấu
 *      phẩy trong ghi chú mà không bọc là cả dòng lệch sang ô bên cạnh.
 *   3. **Không cho vai thiếu quyền, không cho chi nhánh khác.**
 *   4. **Có dòng nhật ký.** Danh sách này là thứ đem đi tính tiền và đem đi
 *      chỉnh ảnh; ai xuất, lúc nào, phải tra được.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET as xuat } from "@/app/api/admin/galleries/[id]/export/route";

describe("BB-067: xuất danh sách ảnh đã chọn", () => {
  let client: Client;
  let branchA = "";
  let branchB = "";
  let customerId = "";
  let galleryId = "";
  const anh: Record<string, string> = {};

  function asRole(role: string, branchIds: string[]) {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-000000000067",
      role,
      roleName: role,
      branchIds,
      permissions: quyenCuaVai(role),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  }

  const goi = (format?: string) =>
    xuat(
      new Request(
        `http://localhost/api/admin/galleries/${galleryId}/export${format ? `?format=${format}` : ""}`,
      ),
      { params: Promise.resolve({ id: galleryId }) },
    );

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 2");
    branchA = br[0].id;
    branchB = br[1].id;

    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-067') returning id`,
      [branchA],
    );
    customerId = c[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-067','submitted',$3,'https://example.com/x',4,10) returning id`,
      [branchA, customerId, `fixture-bb067-${Date.now()}`],
    );
    galleryId = g[0].id;

    // Bốn tấm, sort_index CỐ Ý ngược với thứ tự sẽ bấm chọn, để đo việc sắp xếp.
    for (const [ten, idx, thuMuc] of [
      ["IMG_0003.jpg", 3, "Concept 2"],
      ["IMG_0001.jpg", 1, "Concept 1"],
      ["IMG_0002.jpg", 2, "Concept 1"],
      ["IMG_0004.jpg", 4, null],
    ] as [string, number, string | null][]) {
      const { rows } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, subfolder, status)
         values ($1,$2,$3,'image/jpeg',$4,$5,'active') returning id`,
        [galleryId, `bb067-${ten}-${Date.now()}`, ten, idx, thuMuc],
      );
      anh[ten] = rows[0].id;
    }

    // Lượt chọn CHÍNH của khách: chọn 3 và 1, ghi chú cho tấm 3.
    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb067a', 'owner', 'active') returning id`,
      [galleryId],
    );
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, general_note)
       values ($1,$2,true,'Cả bộ làm tông sáng giúp em') returning id`,
      [galleryId, lk[0].id],
    );
    await client.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark, retouch_note, is_favorite, order_index)
       values ($1,$2,$3,'selected','Xoá mụn sữa, chỉnh sáng',true,1)`,
      [sel[0].id, anh["IMG_0003.jpg"], galleryId],
    );
    await client.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark, order_index)
       values ($1,$2,$3,'selected',2)`,
      [sel[0].id, anh["IMG_0001.jpg"], galleryId],
    );
    // Một tấm chỉ thả tim, KHÔNG chọn — không được xuất.
    await client.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark, is_favorite)
       values ($1,$2,$3,null,true)`,
      [sel[0].id, anh["IMG_0004.jpg"], galleryId],
    );

    // Lượt chọn của NGƯỜI THÂN (vai gợi ý): đánh dấu tấm 2.
    const { rows: lk2 } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb067b', 'suggester', 'active') returning id`,
      [galleryId],
    );
    const { rows: sel2 } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,false) returning id`,
      [galleryId, lk2[0].id],
    );
    await client.query(
      `insert into selection_items (selection_id, photo_id, gallery_id, mark)
       values ($1,$2,$3,'suggested')`,
      [sel2[0].id, anh["IMG_0002.jpg"], galleryId],
    );
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Bản .txt chỉ gồm tên ảnh khách CHÍNH đã chọn, sắp theo thứ tự trong thư mục", async () => {
    asRole("cs", [branchA]);
    const res = await goi();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toContain("attachment");

    const than = await res.text();
    // IMG_0001 (sort 1) đứng trước IMG_0003 (sort 3), dù khách bấm 0003 trước.
    expect(than).toBe("IMG_0001.jpg\r\nIMG_0003.jpg");

    // Ảnh người thân gợi ý và ảnh chỉ thả tim đều KHÔNG có mặt.
    expect(than).not.toContain("IMG_0002.jpg");
    expect(than).not.toContain("IMG_0004.jpg");
  });

  it("2. Bản CSV mang ghi chú từng ảnh và ghi chú chung", async () => {
    asRole("cs", [branchA]);
    const than = await (await goi("csv")).text();

    expect(than.split("\r\n")[0]).toBe("ten_file,thu_muc_con,ghi_chu_chinh_sua,yeu_thich");
    expect(than).toContain('"IMG_0003.jpg","Concept 2","Xoá mụn sữa, chỉnh sáng","x"');
    expect(than).toContain("Cả bộ làm tông sáng giúp em");

    // Dấu phẩy trong ghi chú phải nằm TRONG ô, không đẩy lệch cột: dòng của
    // IMG_0003 vẫn đúng bốn ô.
    const dong = than.split("\r\n").find((d) => d.startsWith('"IMG_0003'))!;
    expect(dong.match(/","/g)?.length).toBe(3);
  });

  it("3. Vai không có quyền xuất thì bị chặn", async () => {
    // photoshop_ctv không có `galleries:export` trong bộ quyền.
    asRole("photoshop_ctv", [branchA]);
    expect((await goi()).status).toBe(403);
  });

  it("4. Nhân viên chi nhánh khác không xuất được", async () => {
    asRole("cs", [branchB]);
    expect((await goi()).status).toBe(403);
  });

  it("5. Mỗi lượt xuất để lại một dòng nhật ký", async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    asRole("cs", [branchA]);
    await goi("csv");

    const { rows } = await client.query(
      "select action, metadata from activity_logs where entity_id = $1 and action = 'gallery.export'",
      [galleryId],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].metadata.dinhDang).toBe("csv");
    expect(rows[0].metadata.soAnh).toBe(2);
  });

  it("6. Ô bắt đầu bằng dấu = bị vô hiệu hoá (chống chèn công thức Excel)", async () => {
    await client.query(
      `update selection_items set retouch_note = '=HYPERLINK("http://x","bam")'
        where gallery_id = $1 and photo_id = $2`,
      [galleryId, anh["IMG_0001.jpg"]],
    );
    asRole("cs", [branchA]);
    const than = await (await goi("csv")).text();

    // Có dấu nháy đơn chắn đầu, nên Excel đọc là chữ chứ không chạy công thức.
    expect(than).toContain(`"'=HYPERLINK(""http://x"",""bam"")"`);
  });
});
