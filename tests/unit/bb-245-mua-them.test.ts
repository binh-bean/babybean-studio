/**
 * BB-245 — "Mời mua lần hai khi khách duyệt không yêu cầu chỉnh lại."
 *
 * Ba mảng canh:
 *
 *   1. Luật thuần `duocMoiMuaLanHai` — cùng hàm mà màn khách VÀ route dùng
 *      (xem @/lib/gallery/moi-mua-lan-hai-rules), không phải một bản chép
 *      lại. Dự án chưa có thư viện dựng DOM (xem review-rules.ts), nên đây là
 *      cách canh "điều kiện hiện thẻ" mà không cần kết xuất component.
 *   2. `POST /api/g/mua-them` — Zod từ chối body hỏng, và sản phẩm gắn ảnh mà
 *      thiếu `photoId` bị chặn TRƯỚC khi chạm bảng `yeu_cau_mua_them`
 *      (migration 0072) — nên hai ca này chạy được dù bảng đó CHƯA áp lên môi
 *      trường này. Test cần GHI (rate-limit, ghi thành công) tự SKIP khi
 *      bảng chưa có, log rõ "chờ Opus áp 0072".
 *   3. Thẻ Lark `mua_them.yeu_cau` sống sót qua `locBoAnh()` — bẫy đã canh ở
 *      BB-200: khoá `cacMon`/`tenTep` không được khớp `/(photo|image|anh|
 *      thumb|url|src|href|drive)/i`, nếu không thẻ ra rỗng lặng lẽ.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { duocMoiMuaLanHai } from "@/lib/gallery/moi-mua-lan-hai-rules";
import { dungThe, locBoAnh } from "@/lib/lark/notify";
import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as muaThem, GET as xemYeuCau } from "@/app/api/g/mua-them/route";

describe("BB-245 (1): luật duocMoiMuaLanHai — cùng hàm màn khách và route dùng", () => {
  it("approved + 0 vòng sửa → mời mua", () => {
    expect(duocMoiMuaLanHai("approved", 0)).toBe(true);
  });

  it("delivered + 0 vòng sửa → mời mua", () => {
    expect(duocMoiMuaLanHai("delivered", 0)).toBe(true);
  });

  it("approved + 1 vòng sửa → KHÔNG mời (khách từng chê, không phải 'ưng ngay')", () => {
    expect(duocMoiMuaLanHai("approved", 1)).toBe(false);
  });

  it("in_retouch → KHÔNG mời dù chưa có vòng sửa nào (chưa hề duyệt)", () => {
    expect(duocMoiMuaLanHai("in_retouch", 0)).toBe(false);
  });

  it("awaiting_approval → KHÔNG mời (đang chờ khách xem, chưa duyệt)", () => {
    expect(duocMoiMuaLanHai("awaiting_approval", 0)).toBe(false);
  });
});

describe("BB-245 (3): thẻ Lark mua_them.yeu_cau qua locBoAnh", () => {
  const payload = {
    tieuDeBo: "Bé Na 100 ngày",
    galleryId: "11111111-1111-4111-8111-111111111111",
    tongSoMon: 2,
    cacMon: [
      { ten: "Khung gỗ 40x60", soLuong: 1, tenTep: "IMG_001.jpg", ghiChu: null },
      { ten: "Album Ultra HD", soLuong: 1, tenTep: null, ghiChu: "Bìa da nâu" },
    ],
  };

  it("cacMon sống sót qua locBoAnh (khoá không khớp bẫy chữ 'anh')", () => {
    expect(locBoAnh(payload).cacMon).toEqual(payload.cacMon);
  });

  it("thẻ có tiêu đề, tên bộ ảnh, tên sản phẩm, tên tệp ảnh, và câu 'chưa tính tiền'", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
    const the = dungThe("mua_them.yeu_cau", locBoAnh(payload), "https://app.example.com/admin/galleries/x") as {
      card: { header: { title: { content: string } }; elements: unknown[] };
    };
    expect(the).not.toBeNull();
    expect(the.card.header.title.content).toBe("Khách gửi yêu cầu mua thêm");
    // So cả cấu trúc thẻ (fields lẫn text) chứ không chỉ mỗi khối text.
    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).toContain("Bé Na 100 ngày");
    expect(noiDung).toContain("Khung gỗ 40x60");
    expect(noiDung).toContain("IMG_001.jpg");
    expect(noiDung).toContain("Album Ultra HD");
    // App KHÔNG cộng tiền vào hợp đồng — thẻ phải nói rõ điều đó cho CSKH.
    expect(noiDung).toContain("chưa thanh toán");
    vi.unstubAllEnvs();
  });

  it("danh sách rỗng → null (không bịa tin)", () => {
    expect(dungThe("mua_them.yeu_cau", { ...payload, cacMon: [] }, null)).toBeNull();
  });
});

describe("BB-245 (2): POST /api/g/mua-them", () => {
  let client: Client;
  let coBang = false;
  let galleryId = "";
  let customerId = "";
  let selectionId = "";
  let shareLinkId = "";
  let spGanAnh = ""; // sản phẩm BẮT BUỘC gắn ảnh (in/khung)
  let anh1 = "";

  function phien(role = "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role,
      shareLinkId,
      selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const goi = (body: unknown) =>
    muaThem(
      new Request("http://localhost/api/g/mua-them", {
        method: "POST",
        body: typeof body === "string" ? body : JSON.stringify(body),
      }),
    );

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: bangKiem } = await client.query(
      `select to_regclass('public.yeu_cau_mua_them') as bang`,
    );
    coBang = bangKiem[0]?.bang !== null;

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-245') returning id`,
      [br[0].id],
    );
    customerId = kh[0].id;

    // Bộ ảnh đã DUYỆT, đúng cửa sổ chủ studio chốt.
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-245','approved',$3,'https://example.com/x',1) returning id`,
      [br[0].id, customerId, `fixture-bb245-${Date.now()}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb245a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;

    const { rows: ph } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'IMG_001.jpg','image/jpeg',1,'active') returning id`,
      [galleryId, `fixture-bb245-${Date.now()}`],
    );
    anh1 = ph[0].id;

    const { rows: sp } = await client.query(
      `select id from products
        where is_active and list_price is not null and price_confidence >= 0.8 and price_samples >= 5
          and (material ilike 'khung%' or kind = 'print')
        order by list_price limit 1`,
    );
    spGanAnh = sp[0]?.id ?? "";
  });

  afterAll(async () => {
    if (coBang) await client.query("delete from yeu_cau_mua_them where gallery_id = $1", [galleryId]);
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from galleries where id = $1", [galleryId]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("Zod từ chối body hỏng — 400, không phải 500", async () => {
    phien();
    // Thiếu productId, soLuong âm — cả hai đều sai hình dạng.
    const res = await goi({ items: [{ soLuong: -1 }] });
    expect(res.status).toBe(400);

    const res2 = await goi("khong-phai-json{");
    expect(res2.status).toBe(400);

    const res3 = await goi({ items: [] }); // mảng rỗng — dưới ngưỡng tối thiểu 1
    expect(res3.status).toBe(400);
  });

  it("sản phẩm nhóm gắn ảnh (in/khung) mà THIẾU photoId → 400", async () => {
    if (!spGanAnh) return; // bảng giá sạch thì bỏ qua ca này, giống bb-105
    phien();
    const res = await goi({ items: [{ productId: spGanAnh, soLuong: 1 }] });
    expect(res.status).toBe(400);
  });

  it("sản phẩm nhóm gắn ảnh với photoId hợp lệ → ghi được (bỏ qua nếu bảng 0072 chưa áp)", async () => {
    if (!coBang) {
      console.warn("[BB-245] Bỏ qua: bảng yeu_cau_mua_them chưa có — chờ Opus áp 0072.");
      return;
    }
    if (!spGanAnh) return;
    phien();
    const res = await goi({ items: [{ productId: spGanAnh, soLuong: 2, photoId: anh1 }] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.items).toHaveLength(1);
    expect(json.data.items[0].soLuong).toBe(2);
    expect(json.data.items[0].trangThai).toBe("moi");

    const getRes = await xemYeuCau();
    const getJson = await getRes.json();
    expect(getJson.data.items.length).toBeGreaterThanOrEqual(1);
  });

  it("bộ ảnh CÓ vòng xin sửa → 409, không ghi (bỏ qua nếu bảng 0072 chưa áp)", async () => {
    if (!coBang) return;
    if (!spGanAnh) return;

    await client.query(
      `insert into revision_requests (gallery_id, round, note) values ($1, 1, 'Fixture BB-245: sáng ảnh lên')`,
      [galleryId],
    );
    phien();
    const res = await goi({ items: [{ productId: spGanAnh, soLuong: 1, photoId: anh1 }] });
    expect(res.status).toBe(409);

    await client.query("delete from revision_requests where gallery_id = $1", [galleryId]);
  });

  it("bộ ảnh chưa duyệt (in_retouch) → 409, không ghi (bỏ qua nếu bảng 0072 chưa áp)", async () => {
    if (!coBang) return;
    if (!spGanAnh) return;

    await client.query("update galleries set status = 'in_retouch' where id = $1", [galleryId]);
    phien();
    const res = await goi({ items: [{ productId: spGanAnh, soLuong: 1, photoId: anh1 }] });
    expect(res.status).toBe(409);

    await client.query("update galleries set status = 'approved' where id = $1", [galleryId]);
  });
});
