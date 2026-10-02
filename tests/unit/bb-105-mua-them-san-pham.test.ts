/**
 * BB-105 — ba mẹ mua thêm sản phẩm ngoài gói.
 *
 * ---------------------------------------------------------------------------
 * Tính năng có đủ mọi mảnh, và chưa bao giờ chạy
 * ---------------------------------------------------------------------------
 * Đo trên bb-dev ngày 22/09/2026: `selection_addons` có **0 dòng**. Không phải
 * vì khách không mua, mà vì **không ai bấm mua được**:
 *
 *   · Màn khách dựng `AddonSelector` mà KHÔNG truyền `onChange` — bấm cộng trừ
 *     không đi đâu cả.
 *   · Danh sách sản phẩm lại lấy từ chính những dòng ĐÃ MUA, nên chưa mua gì
 *     thì không có gì để mua. Vòng tròn khép kín.
 *   · Và `POST /api/g/addons` chèn thẳng một dòng mỗi lượt gọi: nối dây xong
 *     thì bấm ba lần là ba dòng, hoá đơn tính tiền ba lần.
 *
 * Phép thử này canh đường đã sửa: ĐẶT số lượng (0 là bỏ mua), một sản phẩm một
 * dòng, và ba luật tiền của BB-105 vẫn nguyên.
 *
 * ---------------------------------------------------------------------------
 * BB-346 — viết lại cho luật bán mới của anh (đều là quyết định đã chốt)
 * ---------------------------------------------------------------------------
 *  · 30/09: "kích thước kể cả chưa bán nhưng có giá cũng hiện" — bỏ ngưỡng
 *    price_confidence >= 0.8 / price_samples >= 5; chỉ cần CÓ GIÁ > 0
 *    (`giaDuocBaoChoKhach`, BB-335).
 *  · 01/10: "app chỉ bán đúng các mục trong bảng giá 01/10" — sản phẩm in phải
 *    có (chất liệu, kích thước) trong `bang-gia-01-10.ts` (`sanPhamBanChoKhach`).
 *
 * Nên dữ liệu thử KHÔNG còn vớ đại một dòng của bảng `products` thật: bộ test
 * tự dựng sản phẩm "Mẫu kiểm thử BB-346 …" (chất liệu + kích thước lấy từ bảng giá,
 * có giá, độ tin cậy để trống như hàng chưa bán lần nào) rồi xoá theo id.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { POST as muaThem } from "@/app/api/g/addons/route";
import { GET as xemBoAnh } from "@/app/api/g/gallery/route";

describe("BB-105: mua thêm sản phẩm ngoài gói", () => {
  let client: Client;
  let galleryId = "";
  let customerId = "";
  let selectionId = "";
  let shareLinkId = "";
  let spBanDuoc = "";
  const giaNiemYet = 123000;
  /** Mỗi ca "từ chối" một lý do riêng — chặn đúng một vế của luật bán. */
  const spTuChoi: Record<string, string> = {};
  const spFixtureIds: string[] = [];
  let anhDaChon = "";
  let anhDaChon2 = "";
  let anhChuaChon = "";
  let anhBoKhac = "";
  let boKhac = "";

  function phien(role = "owner", khoa = false) {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      customerId: null,
      role,
      shareLinkId,
      selectionId: khoa ? selectionId : selectionId,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }

  const goi = (productId: string, quantity: number, photoId?: string | null) =>
    muaThem(
      new Request("http://localhost/api/g/addons", {
        method: "POST",
        body: JSON.stringify({ productId, quantity, photoId }),
      }),
    );

  const demDong = async () => {
    const { rows } = await client.query(
      "select product_id, photo_id, quantity, unit_price from selection_addons where selection_id = $1 order by created_at",
      [selectionId],
    );
    return rows;
  };

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,'Fixture BB-105') returning id`,
      [br[0].id],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota)
       values ($1,$2,'Fixture BB-105','ready',$3,'https://example.com/x',2,5) returning id`,
      [br[0].id, customerId, `fixture-bb105-${Date.now()}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb105a', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;

    // Ba tấm: hai tấm ba mẹ đã chọn, một tấm chưa chọn.
    for (const [ten, idx] of [["A.jpg", 1], ["B.jpg", 2], ["C.jpg", 3]] as [string, number][]) {
      const { rows } = await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active') returning id`,
        [galleryId, `bb105-${ten}-${Date.now()}`, ten, idx],
      );
      if (ten === "A.jpg") anhDaChon = rows[0].id;
      if (ten === "B.jpg") anhDaChon2 = rows[0].id;
      if (ten === "C.jpg") anhChuaChon = rows[0].id;
    }
    for (const id of [anhDaChon, anhDaChon2]) {
      await client.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark)
         values ($1,$2,$3,'selected')`,
        [selectionId, id, galleryId],
      );
    }

    // Một tấm của BỘ ẢNH KHÁC, để đo việc đặt in ảnh nhà người ta.
    const { rows: gk } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,'Fixture BB-105 bộ khác','ready',$3,'https://example.com/y',1) returning id`,
      [br[0].id, customerId, `fixture-bb105b-${Date.now()}`],
    );
    boKhac = gk[0].id;
    const { rows: pk } = await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       values ($1,$2,'X.jpg','image/jpeg',1,'active') returning id`,
      [boKhac, `bb105-x-${Date.now()}`],
    );
    anhBoKhac = pk[0].id;

    /*
      BB-346 — sản phẩm thử tự dựng. Bán được = đang kinh doanh + (chất liệu,
      kích thước) nằm trong bảng giá 01/10 + có giá > 0. Cố ý để
      price_confidence null và price_samples 0: luật 30/09 không còn đòi
      ngưỡng độ tin cậy, nên hàng "chưa bán lần nào nhưng có giá" vẫn phải bán.
    */
    const taoSp = async (
      ten: string,
      o: {
        kind?: string;
        material: string | null;
        size: string | null;
        gia: number | null;
        active?: boolean;
        /** Tên đầy đủ, ghi đè tên "Mẫu kiểm thử BB-346 …" (chỉ ca hàng thử dùng). */
        tenDayDu?: string;
      },
    ) => {
      const { rows } = await client.query(
        `insert into products (name, kind, material, size, list_price, price_confidence, price_samples, is_active)
         values ($1,$2,$3,$4,$5,null,0,$6) returning id`,
        [o.tenDayDu ?? `Mẫu kiểm thử BB-346 ${ten}`, o.kind ?? "print", o.material, o.size, o.gia, o.active ?? true],
      );
      spFixtureIds.push(rows[0].id);
      return rows[0].id as string;
    };
    spBanDuoc = await taoSp("Gỗ 40x60 bán được", { material: "Gỗ", size: "40x60", gia: giaNiemYet });
    spTuChoi.khongGia = await taoSp("Gỗ 40x60 chưa có giá", { material: "Gỗ", size: "40x60", gia: null });
    spTuChoi.giaBangKhong = await taoSp("Gỗ 40x60 giá 0", { material: "Gỗ", size: "40x60", gia: 0 });
    spTuChoi.ngoaiBangChatLieu = await taoSp("Khung kim loại 40x60 có giá", {
      material: "Khung kim loại",
      size: "40x60",
      gia: 150000,
    });
    spTuChoi.ngoaiBangKichThuoc = await taoSp("Gỗ 12x34 có giá", { material: "Gỗ", size: "12x34", gia: 150000 });
    spTuChoi.khongKichThuoc = await taoSp("Gỗ không ghi kích thước", { material: "Gỗ", size: null, gia: 150000 });
    spTuChoi.khongChatLieu = await taoSp("Không chất liệu 40x60", { material: null, size: "40x60", gia: 150000 });
    // BB-352 (CV-01): đủ giá, đúng chất liệu + cỡ trong bảng giá, đang kinh doanh —
    // chỉ vì tên "Fixture …" mà KHÔNG được bán qua đường ghi (addons).
    spTuChoi.hangThu = await taoSp("Gỗ 40x60 hàng thử", {
      material: "Gỗ",
      size: "40x60",
      gia: giaNiemYet,
      tenDayDu: "Fixture BB-352 Gỗ 40x60 hàng thử",
    });
    spTuChoi.ngungBan = await taoSp("Gỗ 40x60 ngừng kinh doanh", {
      material: "Gỗ",
      size: "40x60",
      gia: giaNiemYet,
      active: false,
    });
  });

  afterAll(async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    await client.query("delete from galleries where id = any($1)", [[galleryId, boKhac]]);
    if (spFixtureIds.length) await client.query("delete from products where id = any($1)", [spFixtureIds]);
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  it("1. Đặt số lượng 2 thì có ĐÚNG một dòng, và giá chốt theo bảng giá", async () => {
    phien();
    const res = await goi(spBanDuoc, 2, anhDaChon);
    expect(res.status).toBe(200);

    const dong = await demDong();
    expect(dong.length).toBe(1);
    expect(dong[0].quantity).toBe(2);
    expect(Number(dong[0].unit_price)).toBe(giaNiemYet);

    const json = await res.json();
    expect(json.data.totalAddonsAmount).toBe(giaNiemYet * 2);
  });

  it("2. Đặt lại số lượng 5 thì SỬA dòng cũ, không sinh dòng thứ hai", async () => {
    // Đây là lỗi sẽ xảy ra ngay nếu giữ lối chèn thẳng: ba mẹ bấm dấu cộng vài
    // lần là vài dòng cùng một sản phẩm, và hoá đơn cộng hết.
    phien();
    expect((await goi(spBanDuoc, 5, anhDaChon)).status).toBe(200);

    const dong = await demDong();
    expect(dong.length).toBe(1);
    expect(dong[0].quantity).toBe(5);
  });

  it("3. Đặt về 0 là BỎ MUA — dòng biến mất, tiền về 0", async () => {
    phien();
    const res = await goi(spBanDuoc, 0, anhDaChon);
    expect(res.status).toBe(200);
    expect((await res.json()).data.totalAddonsAmount).toBe(0);
    expect(await demDong()).toEqual([]);
  });

  it("4. Sản phẩm CHƯA CÓ GIÁ, NGOÀI bảng giá 01/10 hoặc đã ngừng kinh doanh thì KHÔNG bán", async () => {
    /*
      Luật cũ (price_confidence/price_samples) đã bỏ 30/09 — xem đầu tệp. Mỗi
      ca dưới đây chặn đúng MỘT vế của luật mới, và không ca nào được là 500:
      lỗi của khách (sản phẩm không bán được) phải là 4xx có lời nhắn tiếng
      Việt, không phải lỗi máy chủ.
    */
    phien();
    const muonTuChoi: [string, number][] = [
      ["khongGia", 400],
      ["giaBangKhong", 400],
      ["ngoaiBangChatLieu", 404],
      ["ngoaiBangKichThuoc", 404],
      ["khongKichThuoc", 404],
      ["khongChatLieu", 404],
      ["ngungBan", 404],
      // BB-352: hàng thử (tên Fixture …) chặn ngay ở đường ghi, không chỉ ở danh mục hiển thị.
      ["hangThu", 404],
    ];
    for (const [khoa, ma] of muonTuChoi) {
      const res = await goi(spTuChoi[khoa]!, 1, anhDaChon);
      const json = await res.json();
      expect(res.status, `${khoa}: ${JSON.stringify(json)}`).toBe(ma);
      expect(typeof json.error?.message, `${khoa} phải có lời nhắn`).toBe("string");
      expect(await demDong(), `${khoa} không được ghi dòng nào`).toEqual([]);
    }
  });

  it("4b. Hàng trong bảng giá, CÓ giá, chưa từng bán lần nào (độ tin cậy trống) thì BÁN được", async () => {
    // Đối chiếu với ca 4: chính luật 30/09 — có giá là đủ, không đòi mẫu bán.
    phien();
    const res = await goi(spBanDuoc, 1, anhDaChon);
    expect(res.status).toBe(200);
    expect(Number((await demDong())[0].unit_price)).toBe(giaNiemYet);
    await goi(spBanDuoc, 0, anhDaChon);
    expect(await demDong()).toEqual([]);
  });

  it("5. Link chỉ-xem không mua được", async () => {
    phien("viewer");
    expect((await goi(spBanDuoc, 1, anhDaChon)).status).toBe(403);
    expect(await demDong()).toEqual([]);
  });

  it("6. Chốt xong VẪN mua thêm được; CSKH xác nhận rồi mới khoá", async () => {
    /*
      Quyết định của chủ studio 22/09/2026: "mở tự do cho tới khi nhân sự
      chốt" (migration 0060). Mua thêm sau khi chốt chính là tình huống hay
      gặp nhất — ba mẹ chốt xong mới nghĩ tới chuyện in tấm nào ra khung.
    */
    await client.query("update galleries set status='submitted' where id=$1", [galleryId]);
    phien();
    expect((await goi(spBanDuoc, 1, anhDaChon)).status).toBe(200);
    expect((await demDong()).length).toBe(1);

    await client.query("update galleries set status='in_retouch' where id=$1", [galleryId]);
    phien();
    expect((await goi(spBanDuoc, 3, anhDaChon)).status).toBe(409);
    // Số lượng giữ nguyên như trước khi khoá, không bị sửa trộm.
    expect((await demDong())[0].quantity).toBe(1);

    await client.query("update galleries set status='ready' where id=$1", [galleryId]);
    phien();
    await goi(spBanDuoc, 0, anhDaChon);
  });

  it("6b. Sản phẩm in mà KHÔNG gắn ảnh thì từ chối", async () => {
    /*
      Chủ studio 22/09/2026: "sản phẩm hậu kỳ muốn mua thêm cần gắn với ảnh
      chọn". Không gắn thì thợ in nhận được "1 khung gỗ 40x60" mà không biết
      in tấm nào — và CSKH lại phải gọi hỏi, đúng cuộc gọi app này sinh ra để
      bỏ đi.
    */
    phien();
    const res = await goi(spBanDuoc, 1, null);
    expect(res.status).toBe(400);
    expect(await demDong()).toEqual([]);
  });

  it("6c. Không đặt in được ảnh của bộ khác, cũng không đặt in ảnh CHƯA chọn", async () => {
    phien();
    // Ảnh nhà người ta.
    expect((await goi(spBanDuoc, 1, anhBoKhac)).status).toBe(404);

    // Ảnh trong bộ này nhưng ba mẹ chưa chọn: in ra thì tấm đó không nằm trong
    // đơn giao, và thợ chỉnh ảnh cũng không chỉnh nó.
    expect((await goi(spBanDuoc, 1, anhChuaChon)).status).toBe(400);
    expect(await demDong()).toEqual([]);
  });

  it("6d. Ba bản cùng một tấm = MỘT dòng; ba tấm khác nhau = NHIỀU dòng", async () => {
    /*
      Chủ studio trả lời thẳng câu hỏi mua ba khung thì gán ảnh thế nào:
      "cả hai, tuỳ từng khách — có khách in ba ảnh khác nhau, có khách in ba
      ảnh chung một tấm hình".
    */
    phien();
    expect((await goi(spBanDuoc, 3, anhDaChon)).status).toBe(200);
    let dong = await demDong();
    expect(dong.length).toBe(1);
    expect(dong[0].quantity).toBe(3);

    // Thêm tấm thứ hai, CÙNG sản phẩm -> dòng riêng, không đè lên dòng cũ.
    expect((await goi(spBanDuoc, 1, anhDaChon2)).status).toBe(200);
    dong = await demDong();
    expect(dong.length).toBe(2);
    expect(dong.map((d) => d.photo_id).sort()).toEqual([anhDaChon, anhDaChon2].sort());

    // Bỏ mua tấm thứ hai thì tấm thứ nhất còn nguyên.
    expect((await goi(spBanDuoc, 0, anhDaChon2)).status).toBe(200);
    dong = await demDong();
    expect(dong.length).toBe(1);
    expect(dong[0].photo_id).toBe(anhDaChon);

    await goi(spBanDuoc, 0, anhDaChon);
  });

  it("7. Màn khách nhận được DANH MỤC để bấm mua, không chỉ những thứ đã mua", async () => {
    // Đây là mắt xích đã đứt: danh sách bày ra lấy từ `items` (đã mua) nên khi
    // chưa mua gì thì không có gì để mua.
    phien();
    const body = await (await xemBoAnh(new Request("http://localhost/api/g/gallery"))).json();

    expect(Array.isArray(body.data.addons.catalogue)).toBe(true);
    expect(body.data.addons.catalogue.length).toBeGreaterThan(0);
    expect(body.data.addons.items).toEqual([]);

    // Mọi thứ bày ra đều phải có giá thật — không bày hàng "CSKH sẽ báo giá".
    for (const sp of body.data.addons.catalogue) {
      expect(typeof sp.unitPrice).toBe("number");
      expect(sp.unitPrice).toBeGreaterThan(0);
    }
    // Không bán buổi chụp qua nút mua thêm.
    expect(body.data.addons.catalogue.some((sp: { kind: string }) => sp.kind === "shoot_package"))
      .toBe(false);

    // Mỗi món phải thuộc đúng một trong ba nhóm chủ studio gọi tên, và nhóm
    // nào cần gắn ảnh thì nói rõ ra cho màn hình biết.
    const nhomCoThat = ["anh_in", "album", "khung"];
    for (const sp of body.data.addons.catalogue) {
      expect(nhomCoThat).toContain(sp.nhom);
      expect(sp.canGanAnh).toBe(sp.nhom === "anh_in" || sp.nhom === "khung");
    }
    // Đủ cả ba nhóm trong bảng giá thật của studio.
    expect(new Set(body.data.addons.catalogue.map((sp: { nhom: string }) => sp.nhom)).size).toBe(3);
  });

  it("8. Mỗi lượt đặt để lại một dòng nhật ký", async () => {
    await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
    phien();
    await goi(spBanDuoc, 1, anhDaChon);
    await goi(spBanDuoc, 0, anhDaChon);

    const { rows } = await client.query(
      "select action from activity_logs where entity_id = $1 order by created_at",
      [galleryId],
    );
    expect(rows.map((r) => r.action)).toEqual(["addon.set", "addon.remove"]);
  });
});
