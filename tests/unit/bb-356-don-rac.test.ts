/**
 * BB-356 — người dọn dữ liệu vận hành chạy ĐÚNG trên Postgres thật (bb-dev).
 *
 * Toàn bộ phép thử nằm trong MỘT giao dịch ngoài, rollback ở afterAll: dòng fixture
 * không bao giờ được commit, và câu `delete` thật của người dọn (chạy bằng savepoint)
 * cũng bị rollback theo — bb-dev không mất một dòng nào.
 *
 * Fixture toàn dữ liệu bịa (AGENTS.md §6): chi nhánh "FX356", khách "Fixture BB-356 …",
 * thư mục Drive SEED_FOLDER_ID_356*.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";

vi.mock("server-only", () => ({}));
import { BANG_DUOC_DON, CHINH_SACH, dangTrongPhepThu, donRac, type TuyChonDonRac } from "@/lib/van-hanh/don-rac";
import { tinhDocTuMoc, tinhThangConLai, HAN_MUC_DB_BYTE } from "@/lib/van-hanh/dung-luong";

const dbUrl = process.env.SUPABASE_DB_URL;
const NGAY = 24 * 60 * 60 * 1000;
const truoc = (ngay: number) => new Date(Date.now() - ngay * NGAY).toISOString();

const SAVEPOINT: NonNullable<TuyChonDonRac["giaoDich"]> = {
  mo: async (c) => {
    await c.query("savepoint sp_bb356");
  },
  xong: async (c) => {
    await c.query("release savepoint sp_bb356");
  },
  huy: async (c) => {
    await c.query("rollback to savepoint sp_bb356");
    await c.query("release savepoint sp_bb356");
  },
};

const BANG_NGHIEP_VU = [
  "galleries",
  "photos",
  "selections",
  "selection_items",
  "gallery_payments",
  "selection_rounds",
  "yeu_cau_mua_them",
  "customers",
  "products",
  "staff_profiles",
  "settings",
  "schema_migrations",
  "share_links",
  "share_link_ma",
  "tim_gia_dinh",
];

describe("BB-356 hàm thuần", () => {
  it("còn mấy tháng: 133 MB, tăng 63 MB/tháng → ~5,8 tháng", () => {
    const MB = 1024 * 1024;
    expect(tinhThangConLai(133 * MB, 63 * MB)).toBeCloseTo(5.8, 1);
    expect(tinhThangConLai(133 * MB, 0)).toBeNull();
    expect(tinhThangConLai(133 * MB, null)).toBeNull();
    expect(tinhThangConLai(HAN_MUC_DB_BYTE + 1, 10)).toBe(0);
  });
  it("độ dốc từ mốc đo: cần ≥ 7 ngày", () => {
    expect(tinhDocTuMoc([{ ngay: "2026-10-01", byte: 100 }, { ngay: "2026-10-03", byte: 200 }])).toBeNull();
    expect(tinhDocTuMoc([{ ngay: "2026-10-11", byte: 400 }, { ngay: "2026-10-01", byte: 100 }])).toBeCloseTo(900, 5);
  });
  it("người dọn chỉ được xoá trên bảng vận hành, không bảng nghiệp vụ nào", () => {
    for (const b of BANG_NGHIEP_VU) expect(BANG_DUOC_DON).not.toContain(b);
    expect([...BANG_DUOC_DON].sort()).toEqual(
      ["activity_logs", "lark_ban_ghi_moi", "lark_nhac_da_gui", "notifications", "push_dang_ky", "selection_ops", "thong_bao_khach"].sort(),
    );
  });
});

describe.skipIf(!dbUrl)("BB-356 người dọn trên Postgres thật (giao dịch rollback)", () => {
  let client: pg.Client;
  const id: Record<string, string> = {};
  const logId: Record<string, string> = {};
  let demNghiepVuTruoc: Record<string, number> = {};

  async function demNghiepVu() {
    const kq: Record<string, number> = {};
    for (const b of BANG_NGHIEP_VU) {
      const { rows } = await client.query(`select count(*)::int as n from ${b}`);
      kq[b] = rows[0].n;
    }
    return kq;
  }
  async function con(bang: string, cot: string, giaTri: string | undefined): Promise<boolean> {
    if (!giaTri) throw new Error(`fixture chưa dựng: ${bang}.${cot}`);
    const { rows } = await client.query(`select 1 from ${bang} where ${cot}::text = $1`, [giaTri]);
    return rows.length > 0;
  }
  async function log(ten: string, action: string, ngay: number, mo: { entityType?: string; galleryId?: string } = {}) {
    const { rows } = await client.query(
      `insert into activity_logs (actor_type, actor_label, action, entity_type, entity_id, created_at)
       values ('system', 'fixture_bb356', $1, $2, $3, $4) returning id::text`,
      [action, mo.entityType ?? "gallery", mo.galleryId ?? null, truoc(ngay)],
    );
    logId[ten] = rows[0].id;
  }

  beforeAll(async () => {
    client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    // repeatable read: đếm bảng nghiệp vụ trên MỘT ảnh chụp — app và phép thử khác đang ghi bb-dev song song.
    await client.query("begin isolation level repeatable read");

    const br = await client.query(
      `insert into branches (code, name) values ('FX356', 'Fixture BB-356 chi nhánh') returning id`,
    );
    id.branch = br.rows[0].id;
    const kh = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1, 'Fixture BB-356 Nguyễn Thị Mai', '0901000356') returning id`,
      [id.branch],
    );
    id.customer = kh.rows[0].id;
    // updated_at / lark_trang_thai_tu ghi NGAY lúc insert: trigger updated_at chỉ chạy khi update.
    const taoBo = async (status: string, thuMuc: string, updatedAt: string, larkTu: string | null) =>
      (
        await client.query(
          `insert into galleries (branch_id, customer_id, title, drive_folder_id, drive_folder_url, status, updated_at, lark_trang_thai_tu)
           values ($1, $2, $3, $4, $5, $6::gallery_status, $7, $8) returning id`,
          [id.branch, id.customer, `Fixture BB-356 ${status}`, thuMuc, `https://drive.google.com/drive/folders/${thuMuc}`, status, updatedAt, larkTu],
        )
      ).rows[0].id as string;
    // Bộ đã giao từ 200 ngày; bộ đang chọn đang ở giai đoạn hậu kỳ bắt đầu 200 ngày trước.
    id.boXong = await taoBo("delivered", "SEED_FOLDER_ID_356A", truoc(200), null);
    id.boDangChon = await taoBo("in_review", "SEED_FOLDER_ID_356B", truoc(1), truoc(200));
    // Kiểm thẳng giá trị để phép thử không xanh nhầm nếu có trigger ghi đè.
    const { rows: ud } = await client.query(`select updated_at from galleries where id = $1`, [id.boXong]);
    expect(new Date(ud[0].updated_at).getTime()).toBeLessThan(Date.now() - 180 * NGAY);

    // selection_ops: bộ đã giao (cũ → xoá; mới → giữ), bộ đang chọn (cũ → GIỮ).
    for (const [ten, gallery] of [["slXong", id.boXong], ["slDang", id.boDangChon]] as const) {
      const sl = await client.query(
        `insert into share_links (gallery_id, token_hash, token_prefix) values ($1, $2, 'fx356') returning id`,
        [gallery, `fixture_bb356_${randomUUID()}`],
      );
      const se = await client.query(`insert into selections (gallery_id, share_link_id) values ($1, $2) returning id`, [
        gallery,
        sl.rows[0].id,
      ]);
      id[ten] = se.rows[0].id;
    }
    const op = async (ten: string, sel: string | undefined, ngay: number) => {
      const ma = randomUUID();
      id[ten] = ma;
      await client.query(`insert into selection_ops (client_op_id, selection_id, applied_at) values ($1, $2, $3)`, [
        ma,
        sel,
        truoc(ngay),
      ]);
    };
    await op("opXongCu", id.slXong, 60);
    await op("opXongMoi", id.slXong, 5);
    await op("opDangCu", id.slDang, 60);

    // activity_logs
    await log("moCoiCu", "gallery.retouch_sent", 60); // bộ đã xoá, 60 ngày → XOÁ
    await log("moCoiTien", "gallery.payment_recorded", 60); // tiền → GIỮ
    await log("moCoiMoi", "gallery.retouch_sent", 10); // mới → GIỮ
    await log("nhieuCu", "selection.patch", 100, { galleryId: id.boDangChon }); // nhiễu 100 ngày → XOÁ
    await log("nhieuMoi", "selection.patch", 30, { galleryId: id.boDangChon }); // → GIỮ
    await log("cu400", "gallery.cover.change", 400, { galleryId: id.boDangChon }); // > 365 → XOÁ
    await log("hopDong400", "gallery.item_changed", 400, { galleryId: id.boDangChon }); // hợp đồng → GIỮ
    await log("xoaVai400", "role.delete", 400, { entityType: "role" }); // ai xoá gì → GIỮ
    await log("moLai400", "gallery.reopen_requested", 400, { galleryId: id.boDangChon }); // → GIỮ

    // notifications
    const tb = async (ten: string, status: string, ngay: number) => {
      const { rows } = await client.query(
        `insert into notifications (channel, template, status, created_at, payload)
         values ('lark', 'fixture_bb356', $1, $2, '{}') returning id`,
        [status, truoc(ngay)],
      );
      id[ten] = rows[0].id;
    };
    await tb("tbGuiCu", "sent", 100); // XOÁ
    await tb("tbBoQuaCu", "skipped", 100); // XOÁ
    await tb("tbHongCu", "failed", 100); // XOÁ
    await tb("tbChoCu", "pending", 100); // đang chờ → GIỮ
    await tb("tbGuiMoi", "sent", 10); // GIỮ

    // hộp thư khách
    const hop = async (ten: string, ngay: number, daDoc: boolean) => {
      const { rows } = await client.query(
        `insert into thong_bao_khach (gallery_id, loai, tieu_de, noi_dung, created_at, da_doc_luc)
         values ($1, 'fixture_bb356', 'Fixture', 'Fixture BB-356', $2, $3) returning id`,
        [id.boDangChon, truoc(ngay), daDoc ? truoc(ngay - 1) : null],
      );
      id[ten] = rows[0].id;
    };
    await hop("hopDocCu", 100, true); // XOÁ
    await hop("hopChuaDoc100", 100, false); // GIỮ
    await hop("hopChuaDoc200", 200, false); // XOÁ

    // bản ghi mới từ Lark
    const bg = async (ten: string, gallery: string | null, ngay: number) => {
      id[ten] = `fixture_bb356_${ten}_${randomUUID().slice(0, 8)}`;
      await client.query(
        `insert into lark_ban_ghi_moi (lark_record_id, ten_khach, goi_chup, gallery_id, cap_nhat_luc, thay_luc)
         values ($1, 'Fixture BB-356', 'Gói fixture', $2, $3, $3)`,
        [id[ten], gallery, truoc(ngay)],
      );
    };
    await bg("bgThanhCu", id.boXong, 100); // XOÁ
    await bg("bgChoCu", null, 100); // còn chờ tạo bộ → GIỮ
    await bg("bgThanhMoi", id.boXong, 10); // GIỮ

    // dấu "đã nhắc" hậu kỳ — bộ đang chọn có lark_trang_thai_tu = 200 ngày trước
    const { rows: gt } = await client.query(`select lark_trang_thai_tu from galleries where id = $1`, [id.boDangChon]);
    id.dotHienTai = new Date(gt[0].lark_trang_thai_tu).toISOString();
    id.dotCu = truoc(300);
    await client.query(
      `insert into lark_nhac_da_gui (gallery_id, ma_nhac, moc, trang_thai, dot_tu) values
       ($1, 'fixture_bb356', 5, 'fx', $2), ($1, 'fixture_bb356', 5, 'fx', $3)`,
      [id.boDangChon, id.dotCu, id.dotHienTai],
    );

    // đăng ký đẩy
    const day = async (ten: string, gallery: string) => {
      id[ten] = `https://push.example.invalid/fixture_bb356/${randomUUID()}`;
      await client.query(`insert into push_dang_ky (gallery_id, endpoint, p256dh, auth) values ($1, $2, 'fx', 'fx')`, [
        gallery,
        id[ten],
      ]);
    };
    await day("dayXong", id.boXong); // XOÁ
    await day("dayDang", id.boDangChon); // GIỮ

    demNghiepVuTruoc = await demNghiepVu();
  }, 60_000);

  afterAll(async () => {
    if (!client) return;
    await client.query("rollback");
    const { rows } = await client.query(`select count(*)::int as n from branches where code = 'FX356'`);
    console.info("BB356_SAU_ROLLBACK", JSON.stringify({ chiNhanhFixtureConLai: rows[0].n }));
    await client.end();
  });

  it("xem trước: đếm nhưng không xoá dòng nào", async () => {
    const kq = await donRac(client, { thuTruoc: true, giaoDich: SAVEPOINT });
    expect(kq.thuTruoc).toBe(true);
    expect(kq.ketQua.filter((k) => k.loi)).toEqual([]);
    const theo = Object.fromEntries(kq.ketQua.map((k) => [k.loai, k.xoa]));
    // ít nhất các fixture phải được đếm
    expect(theo.nhat_ky_bo_anh_da_xoa).toBeGreaterThanOrEqual(1);
    expect(theo.thong_bao_lark_xong).toBeGreaterThanOrEqual(2);
    expect(theo.selection_ops).toBeGreaterThanOrEqual(1);
    expect(await con("activity_logs", "id", logId.moCoiCu)).toBe(true);
    expect(await con("notifications", "id", id.tbGuiCu)).toBe(true);
    expect(await con("selection_ops", "client_op_id", id.opXongCu)).toBe(true);
  });

  it("dọn thật (trong savepoint): xoá đúng dòng cũ, giữ dòng mới, tiền và bộ đang chọn", async () => {
    // BB-357: bước anh_bo_cu CỐ Ý xoá dòng photos (phép thử riêng bb-357-thu-gon-anh) —
    // ở đây chỉ canh các bước VẬN HÀNH không đụng bảng nghiệp vụ.
    const kq = await donRac(client, {
      thuTruoc: false,
      giaoDich: SAVEPOINT,
      chiLoai: CHINH_SACH.map((c) => c.loai).filter((l) => l !== "anh_bo_cu"),
    });
    expect(kq.thuTruoc).toBe(false);
    expect(kq.ketQua.filter((k) => k.loi)).toEqual([]);

    // activity_logs
    expect(await con("activity_logs", "id", logId.moCoiCu)).toBe(false);
    expect(await con("activity_logs", "id", logId.nhieuCu)).toBe(false);
    expect(await con("activity_logs", "id", logId.cu400)).toBe(false);
    expect(await con("activity_logs", "id", logId.moCoiTien)).toBe(true);
    expect(await con("activity_logs", "id", logId.moCoiMoi)).toBe(true);
    expect(await con("activity_logs", "id", logId.nhieuMoi)).toBe(true);
    expect(await con("activity_logs", "id", logId.hopDong400)).toBe(true);
    expect(await con("activity_logs", "id", logId.xoaVai400)).toBe(true);
    expect(await con("activity_logs", "id", logId.moLai400)).toBe(true);

    // notifications
    expect(await con("notifications", "id", id.tbGuiCu)).toBe(false);
    expect(await con("notifications", "id", id.tbBoQuaCu)).toBe(false);
    expect(await con("notifications", "id", id.tbHongCu)).toBe(false);
    expect(await con("notifications", "id", id.tbChoCu)).toBe(true);
    expect(await con("notifications", "id", id.tbGuiMoi)).toBe(true);

    // hộp thư khách
    expect(await con("thong_bao_khach", "id", id.hopDocCu)).toBe(false);
    expect(await con("thong_bao_khach", "id", id.hopChuaDoc200)).toBe(false);
    expect(await con("thong_bao_khach", "id", id.hopChuaDoc100)).toBe(true);

    // selection_ops
    expect(await con("selection_ops", "client_op_id", id.opXongCu)).toBe(false);
    expect(await con("selection_ops", "client_op_id", id.opXongMoi)).toBe(true);
    expect(await con("selection_ops", "client_op_id", id.opDangCu)).toBe(true);

    // bản ghi mới Lark
    expect(await con("lark_ban_ghi_moi", "lark_record_id", id.bgThanhCu)).toBe(false);
    expect(await con("lark_ban_ghi_moi", "lark_record_id", id.bgChoCu)).toBe(true);
    expect(await con("lark_ban_ghi_moi", "lark_record_id", id.bgThanhMoi)).toBe(true);

    // nhắc hậu kỳ: dấu của giai đoạn cũ đi, giai đoạn hiện tại ở lại
    const { rows: nhac } = await client.query(
      `select dot_tu from lark_nhac_da_gui where gallery_id = $1 and ma_nhac = 'fixture_bb356'`,
      [id.boDangChon],
    );
    expect(nhac.map((r) => new Date(r.dot_tu).toISOString())).toEqual([id.dotHienTai]);

    // đăng ký đẩy
    expect(await con("push_dang_ky", "endpoint", id.dayXong)).toBe(false);
    expect(await con("push_dang_ky", "endpoint", id.dayDang)).toBe(true);

    // không bảng nghiệp vụ nào đổi số dòng
    expect(await demNghiepVu()).toEqual(demNghiepVuTruoc);
  });

  it("trong phép thử, gọi dọn thật KHÔNG truyền giao dịch riêng thì bị ép về xem trước", async () => {
    expect(dangTrongPhepThu()).toBe(true);
    const c2 = new pg.Client({ connectionString: dbUrl });
    await c2.connect();
    try {
      const kq = await donRac(c2, { thuTruoc: false, chiLoai: ["thong_bao_lark_xong"] });
      expect(kq.thuTruoc).toBe(true);
    } finally {
      await c2.end();
    }
  });
});
