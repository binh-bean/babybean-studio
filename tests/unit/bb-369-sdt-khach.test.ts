/**
 * BB-369 mục 3 — khách "Chưa có số" dù dòng Hậu Kỳ có "SDT KH".
 * Mục 4 — tên bộ "Album · HD_…_12576,HD_…_12772" (dòng chi tiết hợp đồng).
 * Mục 5 — người chỉnh sửa từ "Người Photoshop" / "Photoshop CTV".
 *
 * Cơ sở dữ liệu: CHỈ nền Fixture (chi nhánh + khách "Fixture BB-369 …"), dọn
 * theo id. Lark giả: bản ghi dựng tay, `docSdtLark` giả — không gọi Lark thật.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { dungNenFixture, donNenFixture } from "../fixtures/nen-fixture";
import { syncSingleRetouchRecord, customerKey } from "@/lib/lark/sync-retouch";
import { dienSdtKhach, dienBuSdtKhach, quyetDinhSdt, sdtTuDongLark } from "@/lib/lark/sdt-khach-lark";
import { tachMaHoaDon, tachTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";
import { dungBangMa, dichBanGhi, type CotLark } from "@/lib/lark/doc-trang-thai-lark";
import { MA_NEO_COT_TRANG_THAI } from "@/lib/lark/trang-thai-hau-ky";
import { nhanNguoiChinhSua, ghiNguoiChinhSuaVaoGalleries } from "@/lib/lark/nguoi-chinh-sua-lark";

describe("BB-369 mục 3: luật điền số (thuần)", () => {
  it("trống → điền; giống (9 số cuối) → giữ; khác → lệch; Lark trống → không làm gì", () => {
    expect(quyetDinhSdt(null, "0901 000 001")).toBe("dien");
    expect(quyetDinhSdt("", "0901000001")).toBe("dien");
    expect(quyetDinhSdt("+84901000001", "0901000001")).toBe("giu");
    expect(quyetDinhSdt("0901000002", "0901000001")).toBe("lech");
    expect(quyetDinhSdt(null, "")).toBe("khong_co_so_lark");
  });

  it("ô 'SDT KH' đọc được cả dạng bản ghi [{text}] lẫn dạng batch_get/search {type, value}", () => {
    expect(sdtTuDongLark({ "SDT KH": [{ text: "0901000001", type: "text" }] })).toBe("0901000001");
    expect(sdtTuDongLark({ "SDT KH": { type: 1, value: [{ text: "0901000001", type: "text" }] } })).toBe("0901000001");
    expect(sdtTuDongLark({ "SDT KH": [{ text: "123", type: "text" }] })).toBe("");
  });
});

describe("BB-369 mục 4: mã hoá đơn trong tên bộ", () => {
  it("dòng chi tiết cùng hoá đơn → MỘT mã; nhiều hoá đơn → mỗi mã một phần tử", () => {
    expect(tachMaHoaDon("HD_20260907#5034_12576,HD_20260907#5034_12772")).toEqual(["HD_20260907#5034"]);
    expect(tachMaHoaDon("HD_20260907#5034_1,HD_20260910#5100_2")).toEqual(["HD_20260907#5034", "HD_20260910#5100"]);
    expect(tachTieuDeBoAnh("Album · HD_20260907#5034_12576,HD_20260907#5034_12772")).toEqual({
      nhan: "Album",
      ma: ["HD_20260907#5034"],
    });
    expect(tachTieuDeBoAnh("Bé Na thôi nôi")).toEqual({ nhan: "Bé Na thôi nôi", ma: [] });
  });
});

describe("BB-369 mục 5: người chỉnh sửa từ Lark (thuần)", () => {
  const cot: CotLark[] = [
    { field_id: "f1", field_name: "Trạng Thái", property: { options: [{ id: MA_NEO_COT_TRANG_THAI, name: "Mới" }] } },
    { field_id: "f2", field_name: "Người Photoshop" },
    { field_id: "f3", field_name: "Photoshop CTV" },
  ];
  it("đọc 'Người Photoshop' (User) và 'Photoshop CTV' (chọn một)", () => {
    const d = dichBanGhi(
      { "Người Photoshop": [{ id: "ou_x", name: "Fixture Lê Chỉnh", en_name: "" }], "Photoshop CTV": "Fixture CTV Hoa" },
      undefined,
      dungBangMa(cot),
    );
    expect(d.nguoiPhotoshop).toBe("Fixture Lê Chỉnh");
    expect(d.photoshopCtv).toBe("Fixture CTV Hoa");
    expect(nhanNguoiChinhSua({ nguoiPhotoshop: d.nguoiPhotoshop!, photoshopCtv: d.photoshopCtv! })).toBe(
      "Chỉnh sửa: Fixture Lê Chỉnh · CTV Fixture CTV Hoa",
    );
  });
  it("bảng chưa có cột → undefined (không đụng cơ sở dữ liệu)", () => {
    const d = dichBanGhi({}, undefined, dungBangMa(cot.slice(0, 1)));
    expect(d.nguoiPhotoshop).toBeUndefined();
    expect(d.photoshopCtv).toBeUndefined();
  });
});

describe("BB-369 trên cơ sở dữ liệu (nền Fixture)", () => {
  let pg: Client;
  let branchId = "";
  let customerId = "";
  let runId = "";
  const SDT = "0901000369";

  beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    const nen = await dungNenFixture(pg, "BB-369");
    branchId = nen.branchId;
    customerId = nen.customerId;
    runId = nen.runId;
  });

  afterAll(async () => {
    try {
      await donNenFixture(pg, { customerIds: [customerId], branchIds: [branchId] });
    } finally {
      await pg.end();
    }
  });

  function dongHauKy(rec: string, o: { sdt?: string; folder: string; maKh?: string }) {
    return {
      record_id: rec,
      fields: {
        "Tên KH": [{ text: `Fixture BB-369 Mẹ ${runId}`, type: "text" }],
        "SDT KH": [{ text: o.sdt ?? SDT, type: "text" }],
        "Mã KH": [{ text: o.maKh ?? `FXKH369${runId}${rec}`, type: "text" }],
        "Hợp đồng chi tiết": [{ text: `HD_20261006#${runId.slice(0, 4).replace(/\D/g, "1")}9_12576,HD_20261006#${runId.slice(0, 4).replace(/\D/g, "1")}9_12772`, type: "text" }],
        "Link ảnh gửi khách": `https://drive.google.com/drive/folders/SEED_FOLDER_ID_BB369_${runId}_${o.folder}`,
      } as Record<string, unknown>,
    };
  }

  it("đồng bộ dòng Hậu Kỳ có SĐT → khách mới CÓ số; tên bộ là MỘT mã hoá đơn, không phải chuỗi dòng chi tiết", async () => {
    const branches = [{ id: branchId, code: `FX-${runId}`, name: `Fixture BB-369 ${runId}` }];
    const kq = await syncSingleRetouchRecord({
      client: pg,
      record: dongHauKy("recFX369a", { folder: "a" }),
      branches,
      staffList: [],
      write: true,
      index: 0,
      dbUrl: process.env.SUPABASE_DB_URL,
    });
    expect(kq.action).toBe("created");
    const { rows } = await pg.query(
      `select c.phone, g.title, g.lark_contract_code, g.lark_contract_codes
         from galleries g join customers c on c.id = g.customer_id where g.id = $1`,
      [kq.galleryId],
    );
    expect(rows[0].phone).toBe(SDT);
    expect(rows[0].title).not.toContain(",");
    expect(rows[0].lark_contract_code).toMatch(/^HD_20261006#\d+$/);
    expect(rows[0].lark_contract_codes).toEqual([rows[0].lark_contract_code]);
  });

  it("khách cũ trống số → lượt đồng bộ sau điền số; khách đã có số KHÁC → không đè, ghi nhật ký", async () => {
    const branches = [{ id: branchId, code: `FX-${runId}`, name: `Fixture BB-369 ${runId}` }];
    const maKh = `FXKH369${runId}cu`;
    // Khách cũ do đường cũ tạo (phone null).
    await syncSingleRetouchRecord({
      client: pg,
      record: dongHauKy("recFX369b", { folder: "b", maKh, sdt: "12" }),
      branches,
      staffList: [],
      write: true,
      index: 0,
      dbUrl: process.env.SUPABASE_DB_URL,
    });
    const { rows: kh } = await pg.query(
      `select id, phone from customers where branch_id = $1 and lark_customer_key = $2 and phone is null`,
      [branchId, customerKey(maKh)],
    );
    expect(kh).toHaveLength(1);
    const idCu = kh[0].id as string;
    // Dòng thứ hai của cùng khách (cùng Mã KH), Lark đã có số.
    await syncSingleRetouchRecord({
      client: pg,
      record: dongHauKy("recFX369c", { folder: "c", maKh, sdt: "0901000368" }),
      branches,
      staffList: [],
      write: true,
      index: 0,
      dbUrl: process.env.SUPABASE_DB_URL,
    });
    expect((await pg.query(`select phone from customers where id = $1`, [idCu])).rows[0].phone).toBe("0901000368");

    // Lark đổi số khác → KHÔNG đè, có nhật ký chờ xác nhận.
    const r = await dienSdtKhach(pg, { customerId: idCu, sdtLark: "0901000367", larkRecordId: "recFX369c", ghi: true });
    expect(r).toBe("lech");
    expect((await pg.query(`select phone from customers where id = $1`, [idCu])).rows[0].phone).toBe("0901000368");
    const { rows: nk } = await pg.query(
      `select metadata from activity_logs where entity_id = $1 and action = 'customer.sdt_lech_lark'`,
      [idCu],
    );
    expect(nk).toHaveLength(1);
    expect(nk[0].metadata.sdtLarkDuoi3).toBe("367");
    expect(JSON.stringify(nk[0].metadata)).not.toContain("0901000367");
  });

  it("script điền bù: chạy thử KHÔNG ghi, đếm đúng; số đã thuộc khách khác cùng chi nhánh → không điền", async () => {
    // Khách nền (trống số) + bộ ảnh neo dòng Lark.
    await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, lark_hauky_record_id)
       values ($1,$2,'Fixture BB-369 Bộ bù','draft',$3,'https://example.com/x',0,'recFX369d')`,
      [branchId, customerId, `SEED_FOLDER_ID_BB369_${runId}_d`],
    );
    const docSdtLark = async (ids: string[]) => new Map(ids.map((id) => [id, id === "recFX369d" ? "0901000366" : ""]));
    const thu = await dienBuSdtKhach(pg, { docSdtLark, ghi: false, chiKhach: [customerId] });
    expect(thu).toMatchObject({ khachTrong: 1, seDien: 1, daGhi: false });
    expect((await pg.query(`select phone from customers where id = $1`, [customerId])).rows[0].phone).toBeNull();

    const that = await dienBuSdtKhach(pg, { docSdtLark, ghi: true, chiKhach: [customerId] });
    expect(that.seDien).toBe(1);
    expect((await pg.query(`select phone from customers where id = $1`, [customerId])).rows[0].phone).toBe("0901000366");

    // Số đã của khách khác cùng chi nhánh → trung_khach_khac, không điền.
    const { rows: k2 } = await pg.query(
      `insert into customers (branch_id, full_name) values ($1, $2) returning id`,
      [branchId, `Fixture BB-369 Khách hai ${runId}`],
    );
    const r = await dienSdtKhach(pg, { customerId: k2[0].id, sdtLark: "0901000366", larkRecordId: "recFX369e", ghi: true });
    expect(r).toBe("trung_khach_khac");
    expect((await pg.query(`select phone from customers where id = $1`, [k2[0].id])).rows[0].phone).toBeNull();
  });

  it("mục 5: 0094 chưa áp → ghi người chỉnh sửa bỏ qua êm (không ném)", async () => {
    const kq = await ghiNguoiChinhSuaVaoGalleries(
      pg,
      new Map([["recFX369_khong_ton_tai", { nguoiPhotoshop: "Fixture A", photoshopCtv: null }]]),
    );
    expect(kq.doi).toBe(0);
  });
});
