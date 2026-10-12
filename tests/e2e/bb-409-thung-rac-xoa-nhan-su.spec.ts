/**
 * BB-409 — Thùng rác bộ ảnh + xoá nhân sự, chạy thật trên trình duyệt + DB.
 *
 * CHƯA CHẠY. Giám đốc chạy SAU KHI ÁP 0109:
 *   PW_PORT=3220 npx playwright test tests/e2e/bb-409-thung-rac-xoa-nhan-su.spec.ts --workers=1
 *
 *   1. Quản lý "Xoá bộ ảnh" → link khách hiện màn "Bộ ảnh này không còn nữa"; Thùng rác liệt kê
 *      bộ, còn 10 ngày; Khôi phục → khách mở lại được; xoá lần nữa → "Xoá hẳn ngay" (gõ mã) →
 *      dữ liệu bộ biến mất, DẤU còn (chặn Lark); "Cho Lark tạo lại" → dấu được bỏ.
 *   2. Quản lý không xoá được Admin (403); xoá CSKH → bộ CSKH đang phụ trách chuyển về
 *      "Tổ chức BabyBean", hồ sơ đánh dấu đã nghỉ, CSKH không đăng nhập được nữa.
 *
 * Dữ liệu: chi nhánh/nhân viên/khách/bộ ảnh "Fixture BB-409-…" riêng, dọn theo id ở afterAll.
 * Không gọi Lark/Drive (bộ dựng tay bằng SQL, không đồng bộ). Dòng "Tổ chức BabyBean" nếu
 * do phép thử tạo ra thì GIỮ LẠI (là dòng hệ thống, dùng chung) — chỉ gỡ việc đã gán cho nó.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 8);
const NHAN = `Fixture BB-409-${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const emailQl = `fixture.bb409.ql.${runId}@demo.babybean.vn`;
const emailCs = `fixture.bb409.cs.${runId}@demo.babybean.vn`;
const matKhau = `Bb409!${randomBytes(6).toString("hex")}`;
const LARK_DONG = `fixture-bb409-${runId}`;

test.describe.serial("BB-409: thùng rác bộ ảnh + xoá nhân sự", () => {
  let pg: Client;
  let branchId = "";
  let qlId = "";
  let csId = "";
  let customerId = "";
  let galleryId = "";
  const cacBo: string[] = [];
  let maLink = "";

  const supa = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  async function taoNhanVien(email: string, vai: string, ten: string): Promise<string> {
    const u = await supa().auth.admin.createUser({ email, password: matKhau, email_confirm: true });
    if (u.error) throw u.error;
    const id = u.data.user!.id;
    await pg.query(
      `insert into staff_profiles (id, full_name, email, role, role_id)
       values ($1,$2,$3,$4,(select id from roles where name = $5 limit 1))`,
      [id, ten, email, vai, vai],
    );
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [id, branchId]);
    return id;
  }

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    branchId = (await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [`FXBB409-${runId}`, `${NHAN} Chi nhánh`])).rows[0].id;
    qlId = await taoNhanVien(emailQl, "branch_manager", `${NHAN} Quản lý`);
    csId = await taoNhanVien(emailCs, "cs", `${NHAN} CSKH`);
    customerId = (await pg.query(`insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000409') returning id`, [branchId, `${NHAN} Khách`])).rows[0].id;
    galleryId = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                                photo_count, included_quota, cskh_id, created_by, lark_hauky_record_id)
         values ($1,$2,$3,'ready',$4,'https://example.com/x',3,2,$5,$5,$6) returning id`,
        [branchId, customerId, `${NHAN} Bộ ảnh`, `SEED_FOLDER_ID_409_${runId}`, csId, LARK_DONG],
      )
    ).rows[0].id;
    cacBo.push(galleryId);
    maLink = randomBytes(32).toString("base64url");
    await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status) values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
    for (let i = 1; i <= 3; i++) {
      await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, width, height, status)
         values ($1,$2,$3,'image/jpeg',$4,3000,2000,'active')`,
        [galleryId, `bb409-${runId}-${i}`, `R01_000${i}.JPG`, i],
      );
    }
  });

  test.afterAll(async () => {
    if (pg) {
      for (const id of cacBo) {
        await pg.query("delete from bo_anh_da_xoa where gallery_id = $1", [id]).catch(() => {});
        for (const sql of [
          "delete from activity_logs where entity_id = $1 or gallery_id = $1",
          "delete from selection_items where gallery_id = $1",
          "delete from selections where gallery_id = $1",
          "delete from share_links where gallery_id = $1",
          "delete from photos where gallery_id = $1",
          "delete from galleries where id = $1",
        ]) await pg.query(sql, [id]).catch(() => {});
      }
      if (customerId) await pg.query("delete from customers where id = $1", [customerId]);
      for (const id of [qlId, csId].filter(Boolean)) {
        await pg.query("delete from activity_logs where actor_id = $1 or entity_id = $1", [id]).catch(() => {});
        await pg.query("delete from staff_branches where staff_id = $1", [id]);
        await pg.query("update staff_profiles set nghi_boi = null where nghi_boi = $1", [id]).catch(() => {});
        await pg.query("delete from staff_profiles where id = $1", [id]);
      }
      if (branchId) {
        await pg.query("delete from activity_logs where branch_id = $1", [branchId]).catch(() => {});
        await pg.query("delete from branches where id = $1", [branchId]);
      }
      const con = (await pg.query(`select count(*)::int n from branches where name like $1`, [`${NHAN}%`])).rows[0].n;
      expect(con).toBe(0);
      await pg.end();
    }
    for (const id of [qlId, csId].filter(Boolean)) await supa().auth.admin.deleteUser(id);
  });

  test("1. thùng rác: khách thấy 'không còn', khôi phục, xoá hẳn giữ dấu Lark", async ({ page, browser }) => {
    test.setTimeout(180_000);
    await dangNhapNhanVien(page, emailQl, matKhau);

    const xoa = await page.request.post(`/api/admin/galleries/${galleryId}/thung-rac`);
    expect(xoa.status()).toBe(200);

    const ctxKhach = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const khach = await ctxKhach.newPage();
    try {
      await chanLh3TrenTrinhDuyet(khach);
      await khach.goto(`/g/${maLink}`);
      const man = khach.getByTestId("man-loi-link");
      await expect(man).toHaveAttribute("data-loai", "khong-con", { timeout: 40_000 });
      await expect(man).toContainText("Bộ ảnh này không còn nữa");

      const ds = await (await page.request.get("/api/admin/thung-rac")).json();
      const dong = ds.data.trongThungRac.find((b: { id: string }) => b.id === galleryId);
      expect(dong?.conNgay).toBe(10);
      await page.goto("/admin/thung-rac", { waitUntil: "domcontentloaded" });
      await expect(page.getByText(galleryId.slice(0, 8)).first()).toBeVisible({ timeout: 40_000 });

      // Không còn ở danh sách quản lý.
      const list = await (await page.request.get(`/api/admin/galleries?search=${encodeURIComponent(NHAN)}`)).json();
      expect(JSON.stringify(list)).not.toContain(galleryId);

      const kp = await page.request.post(`/api/admin/thung-rac/${galleryId}`, { data: { hanhDong: "khoi_phuc" } });
      expect(kp.status()).toBe(200);
      await khach.reload();
      await expect(khach.getByTestId("man-loi-link")).toHaveCount(0, { timeout: 40_000 });
    } finally {
      await ctxKhach.close();
    }

    expect((await page.request.post(`/api/admin/galleries/${galleryId}/thung-rac`)).status()).toBe(200);
    const saiMa = await page.request.post(`/api/admin/thung-rac/${galleryId}`, { data: { hanhDong: "xoa_han", xacNhan: "sai" } });
    expect(saiMa.status()).toBe(400);
    const han = await page.request.post(`/api/admin/thung-rac/${galleryId}`, {
      data: { hanhDong: "xoa_han", xacNhan: galleryId.slice(0, 8) },
    });
    expect(han.status()).toBe(200);
    expect((await pg.query("select count(*)::int n from galleries where id = $1", [galleryId])).rows[0].n).toBe(0);
    expect((await pg.query("select count(*)::int n from photos where gallery_id = $1", [galleryId])).rows[0].n).toBe(0);
    const dau = (await pg.query("select lark_hauky_record_id, don_luc, bo_dau_luc from bo_anh_da_xoa where gallery_id = $1", [galleryId])).rows[0];
    expect(dau.lark_hauky_record_id).toBe(LARK_DONG);
    expect(dau.don_luc).not.toBeNull();
    expect(dau.bo_dau_luc).toBeNull();

    const boDau = await page.request.post(`/api/admin/thung-rac/${galleryId}`, { data: { hanhDong: "bo_dau" } });
    expect(boDau.status()).toBe(200);
    expect((await pg.query("select bo_dau_luc from bo_anh_da_xoa where gallery_id = $1", [galleryId])).rows[0].bo_dau_luc).not.toBeNull();
  });

  test("2. xoá nhân sự: Quản lý không xoá được Admin; xoá CSKH chuyển việc về Tổ chức + khoá đăng nhập", async ({ page }) => {
    test.setTimeout(120_000);
    // Bộ mới cho CSKH phụ trách (bộ ở ca 1 đã dọn hẳn).
    galleryId = (
      await pg.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, photo_count, cskh_id)
         values ($1,$2,$3,'ready',$4,'https://example.com/y',0,$5) returning id`,
        [branchId, customerId, `${NHAN} Bộ ảnh 2`, `SEED_FOLDER_ID_409B_${runId}`, csId],
      )
    ).rows[0].id;
    cacBo.push(galleryId);
    await dangNhapNhanVien(page, emailQl, matKhau);

    const adminId = (await pg.query("select id from staff_profiles where role = 'owner' and coalesce(la_to_chuc,false) = false limit 1")).rows[0]?.id;
    if (adminId) {
      expect((await page.request.delete(`/api/admin/staff/${adminId}`)).status()).toBe(403);
    }

    const truoc = await (await page.request.get(`/api/admin/staff/${csId}/xoa`)).json();
    expect(truoc.data.duocXoa).toBe(true);
    expect(truoc.data.keHoach.soBoAnh).toBeGreaterThanOrEqual(1);
    expect(truoc.data.keHoach.cau).toContain("Tổ chức BabyBean");

    const res = await page.request.delete(`/api/admin/staff/${csId}`);
    expect(res.status()).toBe(200);

    const toChuc = (await pg.query("select id, is_active from staff_profiles where la_to_chuc")).rows[0];
    expect(toChuc.is_active).toBe(false);
    expect((await pg.query("select cskh_id from galleries where id = $1", [galleryId])).rows[0].cskh_id).toBe(toChuc.id);
    const hoSo = (await pg.query("select is_active, da_nghi_luc from staff_profiles where id = $1", [csId])).rows[0];
    expect(hoSo.is_active).toBe(false);
    expect(hoSo.da_nghi_luc).not.toBeNull();

    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const dn = await anon.auth.signInWithPassword({ email: emailCs, password: matKhau });
    expect(dn.error).not.toBeNull();
  });
});
