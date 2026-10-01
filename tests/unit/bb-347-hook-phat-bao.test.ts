/**
 * BB-347 — hook Lark: (a) mỗi lần đổi trạng thái THẬT phát tín hiệu `lark.trang_thai`,
 * không đổi thì không phát; (b) hai mốc mới ("Đã xác nhận danh sách", "Đang chỉnh
 * sửa") báo ba mẹ đúng MỘT lần; (c) "Đã giao" không báo.
 *
 * Chỉ dùng bộ `Fixture BB-347-…` (xoá theo id ở afterAll). Đọc Lark, phát Realtime
 * và gửi chuông/đẩy đều là biên giới được truyền vào (giả): phép thử không chạm
 * Lark, Realtime hay máy chủ push thật. Biên "báo" giả GHI MỘT DÒNG THẬT vào
 * `thong_bao_khach` như `guiThongBaoBoAnh` thật — để lớp chống báo lặp đọc bảng
 * thật, không đọc ruột của chính mình.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import { capNhatTrangThaiTuHook } from "@/lib/lark/cap-nhat-tu-hook";
import type { TrangThaiDoc } from "@/lib/lark/doc-trang-thai-lark";
import { mocCanBaoKhach, NOI_DUNG_MOC, type MocBaoKhach } from "@/lib/thong-bao/moc-khach";
import { LOAI_TUC_THI, laLoaiHopLe } from "@/lib/utils/tuc-thi-su-kien";

const GD1 = "optDAI9nFV"; // Đã gửi file gốc
const GD2 = "optl5DyKLx"; // Đã chọn hình
const GD3 = "optmhzW4sL"; // Đang làm
const GD4 = "optWz9BTWy"; // Leader check hình
const GD8 = "optxMAdtNX"; // Đã gửi in
const GD9 = "opttKmVbce"; // Hình đã về
const GD10 = "opttHXFpgy"; // Đã giao
const CANH_BAO_XANH = "optSj1R6PM";
const CANH_BAO_CAM = "opt1E9Y1AQ";

describe("BB-347: mocCanBaoKhach (hàm thuần)", () => {
  const d = (maCu: string | null, maMoi: string | null, trangThaiApp = "in_retouch") => ({ maCu, maMoi, trangThaiApp });
  it("1 → 2 là mốc xác nhận danh sách", () => expect(mocCanBaoKhach(d(GD1, GD2))).toBe("da_xac_nhan_danh_sach"));
  it("2 → 3 là mốc đang chỉnh sửa", () => expect(mocCanBaoKhach(d(GD2, GD3))).toBe("dang_chinh_sua"));
  it("nhảy cóc 1 → 3 chỉ báo mốc đích", () => expect(mocCanBaoKhach(d(GD1, GD3))).toBe("dang_chinh_sua"));
  it("lần đầu đọc (null → 2) không báo", () => expect(mocCanBaoKhach(d(null, GD2))).toBeNull());
  it("đi lùi 3 → 2 không báo", () => expect(mocCanBaoKhach(d(GD3, GD2))).toBeNull());
  it("3 → 4 (Leader check) không phải mốc", () => expect(mocCanBaoKhach(d(GD3, GD4))).toBeNull());
  it("vào 'Đã giao' (10) không phải mốc", () => expect(mocCanBaoKhach(d(GD9, GD10))).toBeNull());
  it("'Hình đã về' không đi qua đường này (đã có baoHinhDaVe)", () =>
    expect(mocCanBaoKhach(d(GD8, GD9))).toBeNull());
  it("bộ app đã delivered thì không báo kể cả 1 → 2", () =>
    expect(mocCanBaoKhach(d(GD1, GD2, "delivered"))).toBeNull());
  it("ô trống / tên lạ (maMoi null) không báo", () => expect(mocCanBaoKhach(d(GD1, null))).toBeNull());
});

describe("BB-347: giọng Bean", () => {
  it.each(Object.entries(NOI_DUNG_MOC))("%s — xưng Bean, câu nào cũng kết bằng 'ạ'", (_moc, nd) => {
    for (const cau of [nd.tieuDe, ...nd.noiDung.split(/(?<=[.!?])\s+/)]) {
      expect(cau.trim()).toMatch(/ạ[.!]?$/);
    }
    expect(nd.tieuDe + nd.noiDung).toContain("Bean");
    expect(nd.tieuDe.length).toBeLessThanOrEqual(120); // check của thong_bao_khach
    expect(nd.noiDung.length).toBeLessThanOrEqual(500);
  });
  it("loại sự kiện mới hợp lệ", () => expect(laLoaiHopLe(LOAI_TUC_THI.larkTrangThai)).toBe(true));
});

describe("BB-347: capNhatTrangThaiTuHook phát tín hiệu + báo mốc", () => {
  let client: Client;
  let galleryId: string;
  let branchId: string;
  let customerId: string;
  const maBanGhi = `rec_fixture_bb347_${Date.now()}`;
  const sdt = "0900" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");

  const tt = (ma: string | null, canhBao: string | null = CANH_BAO_XANH): TrangThaiDoc => ({
    maTrangThai: ma,
    maCanhBao: canhBao,
    ngayVaoGiaiDoan: null,
    suaLuc: null,
  });

  /** Biên giả: đếm lời gọi; `baoMoc` ghi dòng thật vào hộp thư như guiThongBaoBoAnh. */
  function bienGia() {
    return {
      bao: vi.fn().mockResolvedValue(undefined),
      phat: vi.fn().mockResolvedValue(true),
      baoMoc: vi.fn(async (gid: string, moc: MocBaoKhach) => {
        await client.query(
          `insert into thong_bao_khach (gallery_id, loai, tieu_de, noi_dung) values ($1,$2,$3,$4)`,
          [gid, moc, NOI_DUNG_MOC[moc].tieuDe, NOI_DUNG_MOC[moc].noiDung],
        );
      }),
    };
  }

  const chay = (ma: string | null, bien: ReturnType<typeof bienGia>, canhBao?: string | null) =>
    capNhatTrangThaiTuHook({
      client,
      recordIds: [maBanGhi],
      docMotBanGhi: async () => tt(ma, canhBao),
      ...bien,
    });

  const datLai = async (ma: string | null, statusApp = "in_retouch") => {
    await client.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]);
    await client.query(
      `update galleries set lark_trang_thai = $2, lark_canh_bao = $3, lark_trang_thai_tu = null, status = $4 where id = $1`,
      [galleryId, ma, CANH_BAO_XANH, statusApp],
    );
  };

  const soTinDaBao = async (loai: string) =>
    Number(
      (await client.query("select count(*)::int as n from thong_bao_khach where gallery_id=$1 and loai=$2", [
        galleryId,
        loai,
      ])).rows[0].n,
    );

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,'Fixture BB-347-khach',$2) returning id`,
      [branchId, sdt],
    );
    customerId = c[0].id;
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                              photo_count, lark_hauky_record_id, lark_trang_thai)
       values ($1,$2,'Fixture BB-347-bo-anh','in_retouch','SEED_FOLDER_ID_BB347','https://example.com/x',0,$3,$4)
       returning id`,
      [branchId, customerId, maBanGhi, GD1],
    );
    galleryId = g[0].id;
  });

  beforeEach(async () => {
    await datLai(GD1);
  });

  afterAll(async () => {
    if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]); // cascade hộp thư
    if (customerId) await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
  });

  // ---------------------------------------------------------------- (a)
  it("(a) đổi trạng thái → phát đúng một tín hiệu lark.trang_thai cho đúng bộ + chi nhánh", async () => {
    const bien = bienGia();
    const kq = await chay(GD3, bien);
    expect(bien.phat).toHaveBeenCalledTimes(1);
    expect(bien.phat).toHaveBeenCalledWith({ galleryId, branchId, loai: "lark.trang_thai" });
    expect(kq.phatTrangThai).toBe(1);
  });

  it("(a) Lark đẩy lại cùng giá trị → KHÔNG phát", async () => {
    await chay(GD3, bienGia());
    const bien = bienGia();
    const kq = await chay(GD3, bien);
    expect(bien.phat).not.toHaveBeenCalled();
    expect(kq.phatTrangThai).toBe(0);
  });

  it("(a) chỉ Cảnh Báo đổi (Trạng Thái giữ nguyên) → KHÔNG phát", async () => {
    const bien = bienGia();
    await chay(GD1, bien, CANH_BAO_CAM);
    expect(bien.phat).not.toHaveBeenCalled();
  });

  it("(a) mọi lần đổi đều phát, kể cả giai đoạn không có chuông (3 → 4) và 'Đã giao'", async () => {
    await datLai(GD3);
    const b1 = bienGia();
    await chay(GD4, b1);
    expect(b1.phat).toHaveBeenCalledTimes(1);
    expect(b1.baoMoc).not.toHaveBeenCalled();

    await datLai(GD9);
    const b2 = bienGia();
    await chay(GD10, b2);
    expect(b2.phat).toHaveBeenCalledTimes(1);
  });

  it("(a) tín hiệu hỏng không chặn việc báo ba mẹ", async () => {
    const bien = bienGia();
    bien.phat.mockRejectedValue(new Error("Realtime sập"));
    const loi = vi.spyOn(console, "error").mockImplementation(() => {});
    const kq = await chay(GD2, bien);
    loi.mockRestore();
    expect(kq.phatTrangThai).toBe(0);
    expect(bien.baoMoc).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------- (b)
  it("(b) Lark → 'Đã chọn hình': báo 'Đã xác nhận danh sách' đúng một lần, đẩy lại không báo thêm", async () => {
    const bien = bienGia();
    const kq = await chay(GD2, bien);
    expect(bien.baoMoc).toHaveBeenCalledTimes(1);
    expect(bien.baoMoc).toHaveBeenCalledWith(galleryId, "da_xac_nhan_danh_sach");
    expect(kq.baoDaXacNhan).toBe(1);
    expect(await soTinDaBao("da_xac_nhan_danh_sach")).toBe(1);

    const lai = bienGia();
    await chay(GD2, lai); // Lark bắn lại cùng bản ghi
    expect(lai.baoMoc).not.toHaveBeenCalled();
    expect(await soTinDaBao("da_xac_nhan_danh_sach")).toBe(1);
  });

  it("(b) Lark → 'Đang làm': báo 'Đang chỉnh sửa' đúng một lần, đẩy lại không báo thêm", async () => {
    await datLai(GD2);
    const bien = bienGia();
    const kq = await chay(GD3, bien);
    expect(bien.baoMoc).toHaveBeenCalledTimes(1);
    expect(bien.baoMoc).toHaveBeenCalledWith(galleryId, "dang_chinh_sua");
    expect(kq.baoDangChinhSua).toBe(1);

    const lai = bienGia();
    await chay(GD3, lai);
    expect(lai.baoMoc).not.toHaveBeenCalled();
    expect(await soTinDaBao("dang_chinh_sua")).toBe(1);
  });

  it("(b) Lark lùi rồi tiến lại (2 → 1 → 2) → không báo lần hai, nhờ hộp thư đã có tin", async () => {
    await chay(GD2, bienGia());
    await chay(GD1, bienGia()); // nhân viên lỡ tay kéo lùi
    const bien = bienGia();
    await chay(GD2, bien);
    expect(bien.baoMoc).not.toHaveBeenCalled();
    expect(await soTinDaBao("da_xac_nhan_danh_sach")).toBe(1);
  });

  it("(b) app đã gửi tin xác nhận đợt (dot_chon_xac_nhan) → Lark sang 'Đã chọn hình' không báo thêm", async () => {
    await client.query(
      `insert into thong_bao_khach (gallery_id, loai, tieu_de, noi_dung) values ($1,'dot_chon_xac_nhan','x','y')`,
      [galleryId],
    );
    const bien = bienGia();
    await chay(GD2, bien);
    expect(bien.baoMoc).not.toHaveBeenCalled();
    expect(bien.phat).toHaveBeenCalledTimes(1); // nhưng màn vẫn tự tải lại
  });

  it("(b) lần đầu app đọc Lark (trống → 'Đã chọn hình') không báo — tránh dội tin cũ", async () => {
    await datLai(null);
    const bien = bienGia();
    await chay(GD2, bien);
    expect(bien.baoMoc).not.toHaveBeenCalled();
    expect(bien.phat).toHaveBeenCalledTimes(1);
  });

  it("(b) 'Hình đã về' vẫn như cũ: báo qua `bao`, không qua hai mốc mới", async () => {
    await datLai(GD8, "approved");
    const bien = bienGia();
    const kq = await chay(GD9, bien);
    expect(bien.bao).toHaveBeenCalledTimes(1);
    expect(bien.bao).toHaveBeenCalledWith(galleryId);
    expect(bien.baoMoc).not.toHaveBeenCalled();
    expect(kq.baoHinhDaVe).toBe(1);
  });

  // ---------------------------------------------------------------- (c)
  it("(c) Lark → 'Đã giao': KHÔNG báo gì cho ba mẹ (chỉ phát tín hiệu)", async () => {
    await datLai(GD9, "approved");
    const bien = bienGia();
    const kq = await chay(GD10, bien);
    expect(bien.bao).not.toHaveBeenCalled();
    expect(bien.baoMoc).not.toHaveBeenCalled();
    expect(bien.phat).toHaveBeenCalledTimes(1);
    expect(kq.baoHinhDaVe + kq.baoDaXacNhan + kq.baoDangChinhSua).toBe(0);
    const { rows } = await client.query("select count(*)::int as n from thong_bao_khach where gallery_id=$1", [galleryId]);
    expect(rows[0].n).toBe(0);
  });

  it("(c) bộ app đã 'delivered' mà Lark đi 1 → 2 → 3: không báo hai mốc", async () => {
    await datLai(GD1, "delivered");
    const bien = bienGia();
    await chay(GD2, bien);
    await chay(GD3, bien);
    expect(bien.baoMoc).not.toHaveBeenCalled();
  });
});
