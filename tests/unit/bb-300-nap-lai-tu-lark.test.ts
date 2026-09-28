// BB-300 — công cụ "xoá sạch và nạp lại từ Lark".
//
// Mọi phép thử ở đây chỉ giả lập BIÊN GIỚI: đối tượng client giống `pg.Client`
// (query trả về mảng rows tự tạo) và một `runner` giống `spawnSync`. KHÔNG
// phép thử nào giả lập logic phân loại bảng, tính mã xác nhận, hay điều kiện
// từ chối — những cái đó chạy thật, để lỗi thật trong đó bị bắt.
//
// KHÔNG kết nối cơ sở dữ liệu thật ở đây. bb-dev là dữ liệu thật của studio
// (AGENTS.md §6) — script chỉ được đo bằng phép thử đơn vị này, không được
// chạy --dem/--sao-luu/--xoa/--nap lên bb-dev.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  phanLoaiBang,
  kiemTraThuTuAnToan,
  taoMaXacNhan,
  ngayHomNay,
  duongDanSaoLuuHopLe,
  kiemTraDieuKienXoa,
  demBang,
  xoaSachGiaoDich,
  xuatSaoLuu,
  sanLuuGanNhatTrongThuMuc,
  ghiMocSaoLuuGanNhat,
  docMocSaoLuuGanNhat,
  docBanSaoLuuTaiThuMuc,
  khoiPhucGiaoDich,
  banGiuLieuKhongRong,
  chayNap,
  danhSachLenhNap,
  THU_TU_XOA,
  BANG_GIU_NGUYEN,
  GOC_REPO,
} from "../../scripts/nap-lai-tu-lark.mjs";

// ---------------------------------------------------------------------------
// Client pg giả — chỉ giả lập biên giới, ghi lại mọi câu lệnh gọi tới.
// ---------------------------------------------------------------------------
type BangGia = Record<string, Array<Record<string, unknown>>>;

/** Bóc tên bảng từ `... from "ten_bang"`. Ném lỗi nếu câu lệnh không khớp mẫu. */
function bangTu(sql: string): string {
  const m = sql.match(/from "([^"]+)"/);
  if (!m) throw new Error(`Không bóc được tên bảng từ: ${sql}`);
  return m[1] as string;
}

function taoClientGia(duLieuTheoBang: BangGia = {}) {
  const lenhDaGoi: string[] = [];
  const client = {
    lenhDaGoi,
    async query(sql: string, _tso?: unknown[]) {
      lenhDaGoi.push((sql.trim().split("\n")[0] ?? "").trim());
      if (/^select tablename from pg_tables/i.test(sql)) {
        return { rows: Object.keys(duLieuTheoBang).map((t) => ({ tablename: t })) };
      }
      if (/^select count\(\*\)/i.test(sql)) {
        const bang = bangTu(sql);
        return { rows: [{ n: (duLieuTheoBang[bang] ?? []).length }] };
      }
      if (/^select \* from/i.test(sql)) {
        const bang = bangTu(sql);
        return { rows: duLieuTheoBang[bang] ?? [] };
      }
      if (/^delete from/i.test(sql)) {
        const bang = bangTu(sql);
        const n = (duLieuTheoBang[bang] ?? []).length;
        duLieuTheoBang[bang] = [];
        return { rowCount: n };
      }
      if (/^update galleries set cover_photo_id/i.test(sql)) {
        return { rowCount: 0 };
      }
      if (/^begin$|^commit$|^rollback$/i.test(sql)) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  return client;
}

describe("phanLoaiBang — phân loại giữ / xoá", () => {
  it("giữ đúng 6 bảng cấu hình, xoá phần còn lại (BB-311: products chuyển sang xoá, packages vẫn giữ)", () => {
    const bangThat = [...BANG_GIU_NGUYEN, ...THU_TU_XOA];
    const { giu, xoa, moi } = phanLoaiBang(bangThat);
    expect(giu.sort()).toEqual([...BANG_GIU_NGUYEN].sort());
    expect(xoa).toEqual(THU_TU_XOA);
    expect(moi).toEqual([]);
  });

  it("bảng lạ chưa từng phân loại rơi vào diện xoá và được đánh dấu mới", () => {
    const bangThat = [...BANG_GIU_NGUYEN, ...THU_TU_XOA, "mot_bang_moi_2027"];
    const { xoa, moi } = phanLoaiBang(bangThat);
    expect(xoa).toContain("mot_bang_moi_2027");
    expect(moi).toEqual(["mot_bang_moi_2027"]);
  });

  it("không bảng giữ nguyên nào lọt vào danh sách xoá", () => {
    const bangThat = [...BANG_GIU_NGUYEN, ...THU_TU_XOA];
    const { xoa } = phanLoaiBang(bangThat);
    for (const b of BANG_GIU_NGUYEN) expect(xoa).not.toContain(b);
  });
});

describe("kiemTraThuTuAnToan — thứ tự xoá phải khớp khoá ngoại thật", () => {
  it("thứ tự đã khai báo (THU_TU_XOA) an toàn với sơ đồ khoá ngoại thật của schema.sql", () => {
    const canhFk = [
      { tu: "selection_placements", den: "selection_items", batBuoc: true },
      { tu: "selection_placements", den: "gallery_items", batBuoc: true },
      { tu: "selection_addons", den: "selections", batBuoc: true },
      { tu: "selection_ops", den: "selections", batBuoc: true },
      { tu: "selection_items", den: "selections", batBuoc: true },
      { tu: "selection_items", den: "photos", batBuoc: true },
      { tu: "selection_items", den: "galleries", batBuoc: true },
      { tu: "selection_addons", den: "products", batBuoc: true },
      { tu: "gallery_items", den: "products", batBuoc: true },
      { tu: "gallery_payments", den: "galleries", batBuoc: true },
      { tu: "selections", den: "galleries", batBuoc: true },
      { tu: "selections", den: "share_links", batBuoc: true },
      { tu: "share_links", den: "galleries", batBuoc: false },
      { tu: "revision_requests", den: "galleries", batBuoc: true },
      { tu: "deliveries", den: "galleries", batBuoc: true },
      { tu: "gallery_items", den: "galleries", batBuoc: true },
      { tu: "gallery_items", den: "gallery_items", batBuoc: false }, // parent_item_id, tự trỏ
      { tu: "photos", den: "galleries", batBuoc: true },
      { tu: "galleries", den: "photos", batBuoc: false }, // cover_photo_id, cho rỗng
      { tu: "galleries", den: "shoots", batBuoc: false },
      { tu: "galleries", den: "customers", batBuoc: true },
      { tu: "shoots", den: "customers", batBuoc: true },
      { tu: "babies", den: "customers", batBuoc: true },
    ];
    const { anToan, loi } = kiemTraThuTuAnToan(THU_TU_XOA, canhFk);
    expect(loi).toEqual([]);
    expect(anToan).toBe(true);
  });

  it("bắt được thứ tự sai: xoá customers trước babies làm vỡ khoá ngoại", () => {
    const thuTuSai = ["customers", "babies"]; // đảo ngược, sai
    const canhFk = [{ tu: "babies", den: "customers", batBuoc: true }];
    const { anToan, loi } = kiemTraThuTuAnToan(thuTuSai, canhFk);
    expect(anToan).toBe(false);
    expect(loi[0]).toMatch(/babies -> customers/);
  });

  it("BB-311: bắt được thứ tự sai nếu products bị xoá TRƯỚC gallery_items (khoá ngoại NOT NULL)", () => {
    const thuTuSai = ["products", "gallery_items"]; // đảo ngược, sai
    const canhFk = [{ tu: "gallery_items", den: "products", batBuoc: true }];
    const { anToan, loi } = kiemTraThuTuAnToan(thuTuSai, canhFk);
    expect(anToan).toBe(false);
    expect(loi[0]).toMatch(/gallery_items -> products/);
  });
});

describe("taoMaXacNhan — mã xác nhận đổi theo số đếm và ngày", () => {
  it("cùng số đếm, cùng ngày -> cùng mã", () => {
    const dem = { customers: 5, galleries: 3 };
    expect(taoMaXacNhan(dem, "2026-09-28")).toBe(taoMaXacNhan(dem, "2026-09-28"));
  });

  it("số đếm đổi -> mã đổi", () => {
    const ma1 = taoMaXacNhan({ customers: 5 }, "2026-09-28");
    const ma2 = taoMaXacNhan({ customers: 6 }, "2026-09-28");
    expect(ma1).not.toBe(ma2);
  });

  it("ngày đổi -> mã đổi", () => {
    const ma1 = taoMaXacNhan({ customers: 5 }, "2026-09-28");
    const ma2 = taoMaXacNhan({ customers: 5 }, "2026-09-29");
    expect(ma1).not.toBe(ma2);
  });

  it("ngayHomNay trả về đúng định dạng YYYY-MM-DD", () => {
    expect(ngayHomNay(new Date(2026, 8, 28))).toBe("2026-09-28");
  });
});

describe("duongDanSaoLuuHopLe — từ chối thư mục sao lưu nằm trong kho", () => {
  it("từ chối thư mục con của kho", () => {
    const kt = duongDanSaoLuuHopLe(path.join(GOC_REPO, "tmp-sao-luu"));
    expect(kt.hopLe).toBe(false);
  });

  it("từ chối chính thư mục gốc kho", () => {
    const kt = duongDanSaoLuuHopLe(GOC_REPO);
    expect(kt.hopLe).toBe(false);
  });

  it("chấp nhận thư mục ngoài kho", () => {
    const ngoai = path.resolve(path.dirname(GOC_REPO), "babybean-sao-luu-test");
    const kt = duongDanSaoLuuHopLe(ngoai);
    expect(kt.hopLe).toBe(true);
  });
});

describe("kiemTraDieuKienXoa — bốn điều kiện chặn --xoa", () => {
  const demHienTai = { customers: 5, galleries: 3 };
  const ngay = "2026-09-28";
  const maDung = taoMaXacNhan(demHienTai, ngay);
  const sanLuuMoi = { thoiDiem: new Date().toISOString() };

  it("cho phép khi đủ cả bốn điều kiện", () => {
    const kt = kiemTraDieuKienXoa({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: sanLuuMoi,
      urlKetNoi: "postgresql://postgres.abcdefghijklmnop:x@aws.pooler.supabase.com/postgres",
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(true);
    expect(kt.loi).toEqual([]);
  });

  it("từ chối khi mã sai", () => {
    const kt = kiemTraDieuKienXoa({
      maNhapVao: "SAIMA1",
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: sanLuuMoi,
      urlKetNoi: "postgresql://postgres.abcdefghijklmnop:x@aws.pooler.supabase.com/postgres",
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(false);
    expect(kt.loi.some((l) => /Mã xác nhận không khớp/.test(l))).toBe(true);
  });

  it("từ chối khi số đếm đã đổi so với lúc in mã (mã cũ không còn khớp)", () => {
    const kt = kiemTraDieuKienXoa({
      maNhapVao: maDung, // mã được tính từ demHienTai cũ
      demHienTai: { customers: 6, galleries: 3 }, // số đã đổi
      ngayHienTai: ngay,
      sanLuuGanNhat: sanLuuMoi,
      urlKetNoi: "postgresql://postgres.abcdefghijklmnop:x@aws.pooler.supabase.com/postgres",
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(false);
  });

  it("từ chối khi chưa có bản sao lưu nào", () => {
    const kt = kiemTraDieuKienXoa({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: null,
      urlKetNoi: "postgresql://postgres.abcdefghijklmnop:x@aws.pooler.supabase.com/postgres",
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(false);
    expect(kt.loi.some((l) => /Chưa có bản sao lưu/.test(l))).toBe(true);
  });

  it("từ chối khi bản sao lưu quá 24 giờ", () => {
    const cu = { thoiDiem: new Date(Date.now() - 25 * 3_600_000).toISOString() };
    const kt = kiemTraDieuKienXoa({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: cu,
      urlKetNoi: "postgresql://postgres.abcdefghijklmnop:x@aws.pooler.supabase.com/postgres",
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(false);
    expect(kt.loi.some((l) => /quá mốc/.test(l))).toBe(true);
  });

  it("từ chối bb-dev khi thiếu cờ --that-su-la-bb-dev", () => {
    const kt = kiemTraDieuKienXoa({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: sanLuuMoi,
      urlKetNoi: "postgresql://postgres.ohkfoqqsrpvsponiwcij:x@aws.pooler.supabase.com/postgres",
      coCoThatSuLaBbDev: false,
    });
    expect(kt.choPhep).toBe(false);
    expect(kt.loi.some((l) => /bb-dev/.test(l))).toBe(true);
  });

  it("cho phép bb-dev khi có cờ --that-su-la-bb-dev", () => {
    const kt = kiemTraDieuKienXoa({
      maNhapVao: maDung,
      demHienTai,
      ngayHienTai: ngay,
      sanLuuGanNhat: sanLuuMoi,
      urlKetNoi: "postgresql://postgres.ohkfoqqsrpvsponiwcij:x@aws.pooler.supabase.com/postgres",
      coCoThatSuLaBbDev: true,
    });
    expect(kt.choPhep).toBe(true);
  });
});

describe("demBang / xuatSaoLuu / xoaSachGiaoDich — qua client pg giả lập", () => {
  it("demBang đọc đúng số dòng từng bảng", async () => {
    const client = taoClientGia({ customers: [{ id: 1 }, { id: 2 }], galleries: [{ id: 1 }] });
    const dem = await demBang(client, ["customers", "galleries"]);
    expect(dem).toEqual({ customers: 2, galleries: 1 });
  });

  it("xuatSaoLuu ghi một tệp JSON mỗi bảng cộng tệp tổng số", async () => {
    const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "bb300-sao-luu-"));
    try {
      const client = taoClientGia({ customers: [{ id: 1, full_name: "A" }] });
      const tong = await xuatSaoLuu(client, ["customers"], thuMuc);
      expect(tong.tongSoDong).toBe(1);
      expect(fs.existsSync(path.join(thuMuc, "customers.json"))).toBe(true);
      expect(fs.existsSync(path.join(thuMuc, "tong-so-dong.json"))).toBe(true);
      const doc = JSON.parse(fs.readFileSync(path.join(thuMuc, "customers.json"), "utf8"));
      expect(doc).toEqual([{ id: 1, full_name: "A" }]);
    } finally {
      fs.rmSync(thuMuc, { recursive: true, force: true });
    }
  });

  it("xoaSachGiaoDich xoá theo đúng thứ tự đã khai báo, trong một giao dịch", async () => {
    const duLieu = Object.fromEntries(THU_TU_XOA.map((b) => [b, [{ id: 1 }]]));
    const client = taoClientGia(duLieu);
    const dem = await xoaSachGiaoDich(client, THU_TU_XOA);
    expect(dem.customers).toBe(1);
    expect(dem.photos).toBe(1);

    const lenh = client.lenhDaGoi;
    expect(lenh[0]).toBe("begin");
    expect(lenh[lenh.length - 1]).toBe("commit");
    // update cover_photo_id phải chạy TRƯỚC lượt xoá "photos".
    const iUpdate = lenh.findIndex((l) => /^update galleries set cover_photo_id/i.test(l));
    const iXoaPhotos = lenh.findIndex((l) => /^delete from "photos"/i.test(l));
    expect(iUpdate).toBeGreaterThan(-1);
    expect(iUpdate).toBeLessThan(iXoaPhotos);
    // customers phải xoá sau galleries (galleries tham chiếu bắt buộc tới customers).
    const iXoaGalleries = lenh.findIndex((l) => /^delete from "galleries"/i.test(l));
    const iXoaCustomers = lenh.findIndex((l) => /^delete from "customers"/i.test(l));
    expect(iXoaGalleries).toBeLessThan(iXoaCustomers);
  });

  it("xoaSachGiaoDich rollback khi một lượt xoá lỗi giữa chừng", async () => {
    const client = taoClientGia({ customers: [{ id: 1 }] });
    const goiGoc = client.query.bind(client);
    let daGoiRollback = false;
    client.query = async (sql: string, tso?: unknown[]) => {
      if (/^delete from "customers"/i.test(sql)) throw new Error("giả lập lỗi Postgres");
      if (/^rollback$/i.test(sql)) daGoiRollback = true;
      return goiGoc(sql, tso);
    };
    await expect(xoaSachGiaoDich(client, ["customers"])).rejects.toThrow("giả lập lỗi Postgres");
    expect(daGoiRollback).toBe(true);
  });
});

describe("sanLuuGanNhatTrongThuMuc — tìm bản sao lưu mới nhất", () => {
  let thuMuc: string;
  beforeEach(() => {
    thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "bb300-goc-sao-luu-"));
  });
  afterEach(() => {
    fs.rmSync(thuMuc, { recursive: true, force: true });
  });

  it("trả về null khi thư mục gốc chưa từng có bản sao lưu", () => {
    expect(sanLuuGanNhatTrongThuMuc(thuMuc)).toBeNull();
  });

  it("chọn đúng bản MỚI NHẤT khi có nhiều lượt sao lưu", () => {
    const cu = path.join(thuMuc, "2026-09-27-0900");
    const moi = path.join(thuMuc, "2026-09-28-0900");
    fs.mkdirSync(cu);
    fs.mkdirSync(moi);
    fs.writeFileSync(
      path.join(cu, "tong-so-dong.json"),
      JSON.stringify({ thoiDiem: "2026-09-27T09:00:00.000Z", tongSoDong: 10 }),
    );
    fs.writeFileSync(
      path.join(moi, "tong-so-dong.json"),
      JSON.stringify({ thoiDiem: "2026-09-28T09:00:00.000Z", tongSoDong: 20 }),
    );
    const ket = sanLuuGanNhatTrongThuMuc(thuMuc);
    expect(ket?.tongSoDong).toBe(20);
  });
});

describe("A2 — NỐI HAI BƯỚC: --sao-luu vào một thư mục bất kỳ rồi --xoa phải nhận ra nó", () => {
  let gocMacDinh: string; // giả lập BACKUP_DIR / gocSaoLuuMacDinh()
  let thuMucX: string; // nơi admin CHỌN cho --sao-luu, KHÁC gocMacDinh
  beforeEach(() => {
    gocMacDinh = fs.mkdtempSync(path.join(os.tmpdir(), "bb300-goc-mac-dinh-"));
    thuMucX = fs.mkdtempSync(path.join(os.tmpdir(), "bb300-thu-muc-x-"));
  });
  afterEach(() => {
    fs.rmSync(gocMacDinh, { recursive: true, force: true });
    fs.rmSync(thuMucX, { recursive: true, force: true });
  });

  it("sao lưu vào thư mục X (không phải thư mục mặc định) rồi --xoa (tra cứu thư mục mặc định) vẫn thấy bản đó", async () => {
    const client = taoClientGia({ customers: [{ id: 1 }, { id: 2 }] });
    const tong = await xuatSaoLuu(client, ["customers"], thuMucX);

    // Đây là dòng NỐI hai bước — xoá nó đi thì ca dưới phải đỏ (kiểm ngược).
    ghiMocSaoLuuGanNhat(gocMacDinh, thuMucX);

    const tim = sanLuuGanNhatTrongThuMuc(gocMacDinh);
    expect(tim).not.toBeNull();
    expect(tim?.tongSoDong).toBe(tong.tongSoDong);
    expect(tim?.duongDan).toBe(path.resolve(thuMucX));
  });

  it("KHÔNG ghi tệp mốc thì --xoa (tra cứu thư mục mặc định) KHÔNG thấy bản sao lưu ở thư mục X", async () => {
    // Đây chính là hành vi lỗi A2 trước khi vá: hai thư mục không có gì nối
    // với nhau. Ca này chứng minh ghiMocSaoLuuGanNhat() ở ca trên thật sự là
    // phần bắt buộc, không phải phép thử giả — bỏ nó đi thì --xoa mù.
    const client = taoClientGia({ customers: [{ id: 1 }] });
    await xuatSaoLuu(client, ["customers"], thuMucX);

    const tim = sanLuuGanNhatTrongThuMuc(gocMacDinh);
    expect(tim).toBeNull();
  });

  it("docMocSaoLuuGanNhat trả null khi bản sao lưu bị xoá sau khi ghi mốc", async () => {
    const client = taoClientGia({ customers: [{ id: 1 }] });
    await xuatSaoLuu(client, ["customers"], thuMucX);
    ghiMocSaoLuuGanNhat(gocMacDinh, thuMucX);

    fs.rmSync(thuMucX, { recursive: true, force: true });

    expect(docMocSaoLuuGanNhat(gocMacDinh)).toBeNull();
  });

  it("--tu <thư mục> đọc thẳng bản sao lưu tại đó, không cần tệp mốc", async () => {
    const client = taoClientGia({ customers: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    const tong = await xuatSaoLuu(client, ["customers"], thuMucX);

    const tim = docBanSaoLuuTaiThuMuc(thuMucX);
    expect(tim).not.toBeNull();
    expect(tim?.tongSoDong).toBe(tong.tongSoDong);
  });

  it("--tu trỏ vào thư mục không có bản sao lưu -> null", () => {
    const rong = fs.mkdtempSync(path.join(os.tmpdir(), "bb300-rong-"));
    try {
      expect(docBanSaoLuuTaiThuMuc(rong)).toBeNull();
    } finally {
      fs.rmSync(rong, { recursive: true, force: true });
    }
  });
});

describe("khoiPhucGiaoDich / banGiuLieuKhongRong — khôi phục từ bản sao lưu", () => {
  it("banGiuLieuKhongRong chỉ liệt kê bảng có dòng", () => {
    expect(banGiuLieuKhongRong({ customers: 0, galleries: 3, photos: 0 })).toEqual(["galleries"]);
    expect(banGiuLieuKhongRong({ customers: 0, galleries: 0 })).toEqual([]);
  });

  it("khoiPhucGiaoDich chèn lại đúng số dòng, theo thứ tự gốc trước lá sau, trong một giao dịch", async () => {
    const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "bb300-khoi-phuc-"));
    try {
      fs.writeFileSync(
        path.join(thuMuc, "customers.json"),
        JSON.stringify([{ id: "c1", full_name: "Fixture Khách A" }]),
      );
      fs.writeFileSync(
        path.join(thuMuc, "galleries.json"),
        JSON.stringify([{ id: "g1", customer_id: "c1", title: "Fixture Bộ 1" }]),
      );
      const client = taoClientGia({ customers: [], galleries: [] });
      const thuTu = ["galleries", "customers"]; // lá trước — đảo lại để kiểm thứ tự chèn
      const dem = await khoiPhucGiaoDich(client, [...thuTu].reverse(), thuMuc);
      expect(dem).toEqual({ customers: 1, galleries: 1 });

      const lenh = (client as unknown as { lenhDaGoi: string[] }).lenhDaGoi;
      expect(lenh[0]).toBe("begin");
      expect(lenh[lenh.length - 1]).toBe("commit");
      const iCustomers = lenh.findIndex((l) => /^insert into "customers"/i.test(l));
      const iGalleries = lenh.findIndex((l) => /^insert into "galleries"/i.test(l));
      expect(iCustomers).toBeGreaterThan(-1);
      expect(iCustomers).toBeLessThan(iGalleries); // customers (gốc) chèn TRƯỚC galleries (lá)
    } finally {
      fs.rmSync(thuMuc, { recursive: true, force: true });
    }
  });

  it("khoiPhucGiaoDich bỏ qua bảng không có tệp, không coi là lỗi", async () => {
    const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "bb300-khoi-phuc-thieu-"));
    try {
      const client = taoClientGia({ customers: [] });
      const dem = await khoiPhucGiaoDich(client, ["customers", "galleries"], thuMuc);
      expect(dem).toEqual({ customers: 0, galleries: 0 });
    } finally {
      fs.rmSync(thuMuc, { recursive: true, force: true });
    }
  });

  it("khoiPhucGiaoDich rollback khi một lượt chèn lỗi giữa chừng", async () => {
    const thuMuc = fs.mkdtempSync(path.join(os.tmpdir(), "bb300-khoi-phuc-loi-"));
    try {
      fs.writeFileSync(path.join(thuMuc, "customers.json"), JSON.stringify([{ id: "c1" }]));
      const client = taoClientGia({ customers: [] });
      const goiGoc = client.query.bind(client);
      let daGoiRollback = false;
      client.query = async (sql: string, tso?: unknown[]) => {
        if (/^insert into "customers"/i.test(sql)) throw new Error("giả lập lỗi Postgres");
        if (/^rollback$/i.test(sql)) daGoiRollback = true;
        return goiGoc(sql, tso);
      };
      await expect(khoiPhucGiaoDich(client, ["customers"], thuMuc)).rejects.toThrow("giả lập lỗi Postgres");
      expect(daGoiRollback).toBe(true);
    } finally {
      fs.rmSync(thuMuc, { recursive: true, force: true });
    }
  });
});

describe("chayNap — dừng ở bước lỗi đầu tiên", () => {
  it("chạy đủ 5 bước theo đúng thứ tự phụ thuộc thật khi mọi bước thành công (BB-311: thêm bước đồng bộ Drive)", () => {
    const goiThuTu: string[] = [];
    const runner = (lenh: string, tso: string[]) => {
      goiThuTu.push(tso.join(" "));
      return { status: 0, stdout: "ok", stderr: "" };
    };
    const ketQua = chayNap(danhSachLenhNap(), runner);
    expect(ketQua.every((k) => k.thanhCong)).toBe(true);
    expect(ketQua.map((k) => k.ten)).toEqual([
      "danh mục sản phẩm",
      "hậu kỳ (khách / bộ ảnh)",
      "hợp đồng (dòng hàng)",
      "chỉnh sửa (retouch)",
      "ảnh (đồng bộ Drive)",
    ]);
    // Bước cuối phải gọi đúng script đồng bộ Drive, tuần tự (--luong 1) và có
    // nghỉ giữa hai bộ (--nghi-ms) — không phải lệnh mặc định 3 luồng.
    const buocAnh = goiThuTu[goiThuTu.length - 1] ?? "";
    expect(buocAnh).toContain("sync-drive.ts");
    expect(buocAnh).toContain("--tat-ca");
    expect(buocAnh).toContain("--luong 1");
    expect(buocAnh).toContain("--nghi-ms 300");
  });

  it("dừng ngay khi bước thứ hai lỗi, không chạy bước ba và bốn", () => {
    let soLanGoi = 0;
    const runner = () => {
      soLanGoi += 1;
      return soLanGoi === 2
        ? { status: 1, stdout: "", stderr: "Lark timeout" }
        : { status: 0, stdout: "ok", stderr: "" };
    };
    const ketQua = chayNap(danhSachLenhNap(), runner);
    expect(ketQua).toHaveLength(2);
    expect(ketQua[0]?.thanhCong).toBe(true);
    expect(ketQua[1]?.thanhCong).toBe(false);
    expect(soLanGoi).toBe(2);
  });
});
