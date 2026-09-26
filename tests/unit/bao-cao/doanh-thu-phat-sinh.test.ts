/**
 * BB-263 — báo cáo "Doanh thu phát sinh" (reports:financial), dựa khung BB-260.
 *
 * Ba nhóm phép thử:
 * 1. Hàm tính thuần (không đụng DB) — vượt hạn mức, addon, tỉ lệ chốt (kể cả
 *    chia 0), giá trị tham khảo, còn phải thu.
 * 2. Fixture bị loại: thêm bộ Fixture trong ô thời gian CÔ LẬP (2099) không
 *    làm đổi con số "Tiền vượt hạn mức" — nếu ai bỏ lọc Fixture, test đỏ ngay
 *    vì số nhảy từ 0 lên khác 0.
 * 3. Không có quyền `reports:financial` -> 403 (vd role "cs").
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { phienGiaLap } from "../../fixtures/phien-nhan-su";
import { Client } from "pg";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/bao-cao/[ma]/route";
import {
  tinhTongVuotHanMuc,
  tinhTongAddon,
  tinhConPhaiThu,
  tinhTiLeChot,
  tinhThamKhaoMuaLanHai,
} from "@/lib/bao-cao/cac-bao-cao/doanh-thu-phat-sinh";

const KY_COLAP = { tu: "2099-02-01", den: "2099-02-07" };

function call(ma: string, qs = "") {
  return GET(new Request(`http://localhost/api/admin/bao-cao/${ma}?${qs}`), {
    params: Promise.resolve({ ma }),
  });
}

function asStaff(vai: Parameters<typeof phienGiaLap>[0], branchIds: string[]) {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap(vai, branchIds));
}

describe("BB-263: hàm tính thuần", () => {
  it("tinhTongVuotHanMuc: cộng dồn, bỏ qua null", () => {
    expect(
      tinhTongVuotHanMuc([
        { snapshotExtraAmount: 300000 },
        { snapshotExtraAmount: null },
        { snapshotExtraAmount: 50000 },
      ]),
    ).toBe(350000);
  });

  it("tinhTongVuotHanMuc: mảng rỗng -> 0", () => {
    expect(tinhTongVuotHanMuc([])).toBe(0);
  });

  it("tinhTongAddon: nhân số lượng với đơn giá rồi cộng dồn", () => {
    expect(
      tinhTongAddon([
        { soLuong: 2, donGia: 100000 },
        { soLuong: 1, donGia: 250000 },
      ]),
    ).toBe(450000);
  });

  it("tinhConPhaiThu: phải thu trừ đã thu, có thể âm khi thu dư", () => {
    expect(tinhConPhaiThu(300000, 100000)).toBe(200000);
    expect(tinhConPhaiThu(100000, 150000)).toBe(-50000);
    expect(tinhConPhaiThu(0, 0)).toBe(0);
  });

  it("tinhTiLeChot: tỉ lệ phần trăm bình thường", () => {
    expect(tinhTiLeChot(3, 4)).toBe(75);
  });

  it("tinhTiLeChot: tổng mới = 0 -> null, không chia 0", () => {
    expect(tinhTiLeChot(0, 0)).toBeNull();
  });

  it("tinhThamKhaoMuaLanHai: bỏ qua dòng chưa có list_price", () => {
    expect(
      tinhThamKhaoMuaLanHai([
        { soLuong: 2, listPrice: 100000 },
        { soLuong: 5, listPrice: null },
        { soLuong: 1, listPrice: 300000 },
      ]),
    ).toBe(500000);
  });

  it("tinhThamKhaoMuaLanHai: mọi dòng đều null -> 0", () => {
    expect(tinhThamKhaoMuaLanHai([{ soLuong: 3, listPrice: null }])).toBe(0);
  });
});

describe("BB-263: quyền reports:financial", () => {
  it("role 'cs' (không có reports:financial) -> 403", async () => {
    asStaff("cs", ["00000000-0000-0000-0000-000000000000"]);
    const res = await call("doanh-thu-phat-sinh");
    expect(res.status).toBe(403);
  });

  it("role 'owner' (có reports:financial) -> 200", async () => {
    asStaff("owner", []);
    const res = await call("doanh-thu-phat-sinh", `tu=${KY_COLAP.tu}&den=${KY_COLAP.den}`);
    expect(res.status).toBe(200);
  });
});

describe("BB-263: Fixture bị loại khỏi số liệu", () => {
  let client: Client;
  let branchId: string;
  const donDep: { table: string; id: string }[] = [];

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query("select id from branches order by name limit 1");
    branchId = rows[0].id;
  });

  afterAll(async () => {
    for (const d of donDep.reverse()) {
      await client.query(`delete from ${d.table} where id = $1`, [d.id]);
    }
    await client.end();
  });

  it("thêm bộ Fixture CHỐT trong ô thời gian cô lập KHÔNG làm đổi 'Tiền vượt hạn mức'", async () => {
    asStaff("owner", [branchId]);
    const qs = `tu=${KY_COLAP.tu}&den=${KY_COLAP.den}&chiNhanh=${branchId}`;

    const truoc = await (await call("doanh-thu-phat-sinh", qs)).json();
    const vhmTruoc = truoc.data.ketQua.theSo.find(
      (t: { nhan: string }) => t.nhan === "Tiền vượt hạn mức (phát sinh)",
    ).giaTri as number;
    expect(vhmTruoc).toBe(0); // ô thời gian 2099 cô lập, chắc chắn rỗng lúc bắt đầu.

    const { rows: cust } = await client.query(
      `insert into customers (branch_id, full_name) values ($1, 'Fixture BB-263 Khách') returning id`,
      [branchId],
    );
    donDep.push({ table: "customers", id: cust[0].id });
    const { rows: gal } = await client.query(
      `insert into galleries
         (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
          included_quota, extra_photo_price, submitted_at)
       values ($1,$2,'Fixture BB-263','submitted',$3,'https://example.com/x',10,50000,$4)
       returning id`,
      [branchId, cust[0].id, `fixture-bb263-${Date.now()}-${Math.random()}`, "2099-02-03T03:00:00Z"],
    );
    donDep.push({ table: "galleries", id: gal[0].id });
    const { rows: sl } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role)
       values ($1,$2,$3,'owner') returning id`,
      [gal[0].id, `fixture-bb263-hash-${Date.now()}`, "bb263xx"],
    );
    donDep.push({ table: "share_links", id: sl[0].id });
    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at,
                               snapshot_selected_count, snapshot_extra_count, snapshot_extra_amount)
       values ($1,$2,true,$3,16,6,300000) returning id`,
      [gal[0].id, sl[0].id, "2099-02-03T03:00:00Z"],
    );
    donDep.push({ table: "selections", id: sel[0].id });

    const sau = await (await call("doanh-thu-phat-sinh", qs)).json();
    const vhmSau = sau.data.ketQua.theSo.find(
      (t: { nhan: string }) => t.nhan === "Tiền vượt hạn mức (phát sinh)",
    ).giaTri as number;

    // Bộ Fixture chốt 300.000 tiền phát sinh, nhưng phải bị loại -> số không đổi.
    expect(vhmSau).toBe(vhmTruoc);
  });
});
