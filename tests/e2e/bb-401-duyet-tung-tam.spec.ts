/**
 * BB-401 — ba mẹ duyệt ảnh chỉnh TỪNG TẤM ngay trong màn xem lớn (anh 08/10: "màn duyệt ảnh
 * chỉnh sửa đang CHỈ có so sánh và xem tiến/lùi ảnh").
 *
 * VIẾT, CHƯA CHẠY (luật Đợt 19: không chạy e2e khi có khách) — Claude chạy khi vắng khách.
 *
 * Nền Fixture riêng (khuôn BB-371: 4 ảnh gốc + 2 ảnh chỉnh "IMG_0001-Edit.jpg", "IMG_0003.jpg"),
 * bộ đang chờ duyệt và CSKH ĐÃ gửi khách (`daGui`):
 *   1. Khách (390×844): "Xem & duyệt từng tấm" → màn xem lớn có NGAY 3 nút (Duyệt tấm này ·
 *      Cần sửa tấm này · Duyệt cả bộ) — không cần bấm gì dưới lưới trước. Duyệt tấm 1 → tự
 *      sang tấm 2, dải ảnh nhỏ đánh dấu tấm 1 "Đã duyệt". Tấm 2: Cần sửa → ghi chú + khoanh
 *      1 vùng + 1 ảnh minh hoạ (ảnh trung tính tạo trong phép thử, đi đúng route `anh-mau`)
 *      → Gửi yêu cầu sửa → tóm tắt đúng 1 tấm → lời xin lỗi anh chốt + "khoảng N ngày".
 *      Cơ sở dữ liệu: một vòng sửa lần 1, một dòng chi tiết đúng tấm 2 (ghi chú, 1 vùng, 1 ảnh).
 *      Vòng 2 (0108): bấm duyệt tấm 1 lưu NGAY lên máy chủ; nạp lại trang (xoá bộ nhớ máy) vẫn
 *      "Đã duyệt". Chưa áp 0108: dấu giữ trên máy, vẫn còn sau khi nạp lại.
 *   2. CSKH: chi tiết bộ ảnh thấy tấm 2 với ghi chú, vùng khoanh, ảnh minh hoạ (ảnh mở được), và
 *      "Khách đã duyệt 1/2 tấm" + IMG_0001-Edit.jpg (khi đã áp 0108).
 *
 * Khoanh vùng / ảnh minh hoạ cần migration 0091 (bảng `revision_request_items` + bucket
 * `yeu-cau-sua`): chưa có thì phép thử kiểm nút ẨN thay vì bấm.
 *
 * Lark: máy chủ thử chạy với PHEP_THU_TRINH_DUYET=1 — `ghiTrangThaiSuaLenLark` và thẻ tin nhóm
 * tự tắt (không gửi Lark thật). Dọn: bộ ảnh theo id (`donNenFixture`) + ảnh minh hoạ trong bucket.
 *
 * Chạy: PW_PORT=3401 npx playwright test tests/e2e/bb-401-duyet-tung-tam.spec.ts --workers=1
 */
import { type Page } from "@playwright/test";
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import path from "node:path";
import fs from "node:fs";
import zlib from "node:zlib";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { chanLh3TrenTrinhDuyet } from "./helpers/mock-lh3-trinh-duyet";
import { thuMucAnh } from "./helpers/thu-muc-anh";
import { donNenFixture, type NenFixture } from "../fixtures/nen-fixture";
import { dungBoBb371, dungNenBb371, type BoBb371 } from "../fixtures/bb-371";

const password = "Password123!";
const BUCKET = "yeu-cau-sua";
const CAU_XIN_LOI =
  "Bean thành thật xin lỗi vì chưa làm hài lòng ba mẹ trong lần chỉnh sửa ảnh này, yêu cầu của ba mẹ đã được ghi nhận và chuyển đến bộ phận hậu kỳ ạ.";

const THU_MUC_ANH = thuMucAnh("dot19", "bb401");
const chup = async (page: Page, ten: string) => {
  fs.mkdirSync(THU_MUC_ANH, { recursive: true });
  await page.screenshot({ path: path.join(THU_MUC_ANH, ten), fullPage: false });
};

/** Ảnh PNG trung tính (khối màu, không người) dựng ngay trong phép thử. */
function anhTrungTinh(rong = 96, cao = 64): Buffer {
  const crcBang = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcBang[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const khoi = (loai: string, du: Buffer) => {
    const dai = Buffer.alloc(4);
    dai.writeUInt32BE(du.length);
    const td = Buffer.concat([Buffer.from(loai, "ascii"), du]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([dai, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(rong, 0);
  ihdr.writeUInt32BE(cao, 4);
  ihdr[8] = 8; // 8 bit
  ihdr[9] = 2; // RGB
  const dong = Buffer.alloc(1 + rong * 3);
  for (let x = 0; x < rong; x++) dong.set([0xd9, 0xc8, 0xb4], 1 + x * 3); // màu be trơn
  const tho = Buffer.concat(Array.from({ length: cao }, () => dong));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    khoi("IHDR", ihdr),
    khoi("IDAT", zlib.deflateSync(tho)),
    khoi("IEND", Buffer.alloc(0)),
  ]);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

test.describe("BB-401: duyệt từng tấm trong màn xem lớn", () => {
  let pg: Client;
  let nen: NenFixture;
  let bo: BoBb371;
  let emailCs = "";
  let staffId = "";
  let coBang = false;
  let coBucket = false;
  /** Đã áp 0108 (`anh_chinh_duyet_tam`) — "Duyệt tấm này" lưu trên máy chủ. */
  let co0108 = false;

  const admin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  test.beforeAll(async () => {
    test.setTimeout(90_000);
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    nen = (await dungNenBb371(pg)).nen;
    // Chờ duyệt + CSKH đã gửi khách (mốc gửi sau lúc ảnh chỉnh về) → khách thấy 2 tấm.
    bo = await dungBoBb371(pg, nen, "D401", { status: "awaiting_approval", daGui: true });
    coBang = !!(await pg.query(`select to_regclass('public.revision_request_items')::text t`)).rows[0].t;
    co0108 = !!(await pg.query(`select to_regclass('public.anh_chinh_duyet_tam')::text t`)).rows[0].t;
    coBucket = (await pg.query(`select 1 from storage.buckets where id = $1 and public = false`, [BUCKET])).rowCount === 1;

    emailCs = `test_bb401_cs_${nen.runId}@demo.babybean.vn`;
    const { data, error } = await admin().auth.admin.createUser({ email: emailCs, password, email_confirm: true });
    if (error) throw error;
    staffId = data.user!.id;
    await pg.query(`insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`, [
      staffId,
      `Fixture BB-401 ${nen.runId} CSKH`,
      emailCs,
    ]);
    await pg.query(`insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`, [staffId, nen.branchId]);
  });

  test.afterAll(async () => {
    test.setTimeout(90_000);
    if (!pg) return;
    try {
      if (bo?.id && coBucket) {
        const kho = admin().storage.from(BUCKET);
        const { data } = await kho.list(bo.id, { limit: 100 });
        if (data?.length) await kho.remove(data.map((f) => `${bo.id}/${f.name}`));
      }
      await pg.query(`delete from staff_branches where staff_id = $1`, [staffId]).catch(() => {});
      await donNenFixture(pg, { galleryIds: [bo?.id], branchIds: [nen?.branchId], staffIds: [staffId] });
    } finally {
      await pg.end();
    }
  });

  test("1. khách: màn xem lớn có 3 nút; duyệt tấm 1, xin sửa tấm 2 kèm ghi chú + khoanh + ảnh minh hoạ → lời xin lỗi", async ({
    page,
  }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/g/${bo.maBaMe}`);
    const khoi = page.getByTestId("khoi-anh-chinh");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    await expect(khoi.getByTestId("o-anh-chinh")).toHaveCount(2);
    await expect(khoi.getByTestId("trang-thai-o-anh").first()).toHaveAttribute("data-trang-thai", "chua_xem");
    await khoi.getByTestId("nut-bat-dau-duyet").click();

    // Màn xem lớn mở thẳng: đủ 3 nút + so sánh + tiến/lùi, không cần bấm gì dưới lưới.
    const xem = page.getByTestId("xem-lon-anh-chinh");
    await expect(xem).toHaveAttribute("data-photo-id", bo.chinh[0]!.id);
    await expect(xem.getByTestId("nut-duyet-tam")).toHaveText(/Duyệt tấm này/);
    await expect(xem.getByTestId("nut-can-sua-tam")).toHaveText(/Cần sửa tấm này/);
    await expect(xem.getByTestId("nut-duyet-ca-bo")).toHaveText("Duyệt cả bộ");
    await expect(xem.getByTestId("nut-so-sanh-goc")).toBeVisible();
    await expect(xem.getByTestId("nut-tam-sau")).toBeEnabled();
    await chup(page, "1-xem-lon-3-nut-390.png");

    // Duyệt tấm 1 → tự sang tấm 2; dải ảnh nhỏ: tấm 1 "Đã duyệt". Vòng 2: lưu NGAY lên máy chủ.
    // Chưa áp 0108: GET trả `daDuyetTam: null` nên màn khách KHÔNG gọi route lưu (giữ dấu trên
    // máy) — chỉ chờ lượt lưu khi đã áp, còn chưa áp thì canh là không có lượt nào.
    const goiLuu: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/g/anh-chinh-sua/duyet-tam")) goiLuu.push(r.method());
    });
    const doiLuu = co0108 ? page.waitForResponse((r) => r.url().includes("/api/g/anh-chinh-sua/duyet-tam")) : null;
    await xem.getByTestId("nut-duyet-tam").click();
    await expect(xem).toHaveAttribute("data-photo-id", bo.chinh[1]!.id);
    await expect(xem.getByTestId("o-dai-anh").first()).toHaveAttribute("data-trang-thai", "da_duyet");
    if (doiLuu) {
      const resLuu = await doiLuu;
      expect(resLuu.status()).toBe(200);
      expect((await resLuu.json()).data.luuMayChu).toBe(true);
    } else {
      await page.waitForTimeout(1000);
      expect(goiLuu).toEqual([]);
    }
    if (co0108) {
      const { rows: dd } = await pg.query(`select photo_id, khoa from anh_chinh_duyet_tam where gallery_id = $1`, [bo.id]);
      expect(dd).toEqual([{ photo_id: bo.chinh[0]!.id, khoa: "goc" }]);
    }

    // Nạp lại trang: tấm 1 vẫn "Đã duyệt". Đã áp 0108 thì XOÁ bộ nhớ máy trước khi nạp — dấu
    // phải đến từ máy chủ (như mở trên máy khác); chưa áp thì dấu đến từ bộ nhớ máy.
    await xem.getByRole("button", { name: "Đóng" }).click();
    if (co0108) await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await expect(khoi.getByTestId("o-anh-chinh").first()).toHaveAttribute("data-trang-thai", "da_duyet", {
      timeout: 120_000,
    });
    await expect(khoi.getByTestId("dem-duyet-khoi")).toContainText("Đã duyệt 1");
    await khoi.getByTestId("o-anh-chinh").nth(1).click();
    await expect(xem).toHaveAttribute("data-photo-id", bo.chinh[1]!.id);

    // Tấm 2: Cần sửa → bảng ghi chú của ĐÚNG tấm 2.
    await xem.getByTestId("nut-can-sua-tam").click();
    const bang = xem.getByTestId("bang-sua-tam");
    await expect(bang).toHaveAttribute("data-photo-id", bo.chinh[1]!.id);
    await expect(bang).toContainText("Bean xin lỗi vì tấm này chưa đúng ý ba mẹ");
    await bang.getByRole("textbox", { name: "Ba mẹ muốn Bean sửa gì ở tấm này ạ?" }).fill("Fixture BB-401 nền sáng hơn");

    if (coBang) {
      await bang.getByTestId("nut-khoanh-vung").click();
      const anh = xem.getByTestId("anh-khoanh");
      const hop = (await anh.boundingBox())!;
      await page.mouse.click(hop.x + hop.width * 0.5, hop.y + hop.height * 0.4);
      await expect(anh).toHaveAttribute("data-so-vung", "1");
      await bang.getByTestId("nut-khoanh-vung").click(); // Xong khoanh
    } else {
      await expect(bang.getByTestId("nut-khoanh-vung")).toHaveCount(0);
    }

    if (coBang && coBucket) {
      const doiTai = page.waitForResponse((r) => r.url().includes("/api/g/anh-chinh-sua/anh-mau") && r.request().method() === "POST");
      await bang
        .getByTestId("o-chon-anh-minh-hoa")
        .setInputFiles({ name: "minh-hoa-bb401.png", mimeType: "image/png", buffer: anhTrungTinh() });
      const res = await doiTai;
      expect(res.status()).toBe(200);
      await expect(bang.getByTestId("anh-minh-hoa-tam").locator("li")).toHaveCount(1);
    } else {
      await expect(bang.getByTestId("o-chon-anh-minh-hoa")).toHaveCount(0);
    }
    await chup(page, "2-ghi-chu-tam-2-390.png");

    await bang.getByTestId("nut-xong-ghi-chu").click();
    await expect(xem.getByTestId("trang-thai-tam-xem-lon")).toHaveAttribute("data-trang-thai", "xin_sua");
    await xem.getByTestId("nut-gui-yeu-cau-sua").click();

    const tomTat = page.getByTestId("tom-tat-gui-sua");
    await expect(tomTat.getByTestId("tom-tat-tam")).toHaveCount(1);
    await expect(tomTat.getByTestId("tom-tat-tam")).toContainText("IMG_0003.jpg");
    await expect(tomTat.getByTestId("tom-tat-tam")).toContainText("Fixture BB-401 nền sáng hơn");
    await expect(tomTat).toContainText("1 tấm ba mẹ đã duyệt");
    await chup(page, "3-tom-tat-390.png");
    await tomTat.getByTestId("nut-xac-nhan-gui-sua").click();

    const ketQua = page.getByTestId("xac-nhan-da-gui-sua");
    await expect(ketQua.getByTestId("loi-xin-loi-sua")).toHaveText(CAU_XIN_LOI, { timeout: 30_000 });
    await expect(ketQua.getByTestId("han-sua")).toHaveText(/trong khoảng \d+ ngày/);
    await expect(ketQua).not.toContainText("Bạn ");
    await chup(page, "4-loi-xin-loi-390.png");

    const { rows } = await pg.query(`select id, round, note from revision_requests where gallery_id = $1`, [bo.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].round).toBe(1);
    expect(rows[0].note).toContain("IMG_0003.jpg: Fixture BB-401 nền sáng hơn");
    expect(rows[0].note).not.toContain("IMG_0001-Edit.jpg");
    expect((await pg.query(`select status from galleries where id = $1`, [bo.id])).rows[0].status).toBe("in_retouch");
    if (coBang) {
      const { rows: ct } = await pg.query(
        `select photo_id, note, marks, reference_paths from revision_request_items where revision_request_id = $1`,
        [rows[0].id],
      );
      expect(ct).toHaveLength(1);
      expect(ct[0].photo_id).toBe(bo.chinh[1]!.id);
      expect(ct[0].note).toBe("Fixture BB-401 nền sáng hơn");
      expect((ct[0].marks as unknown[]).length).toBe(1);
      if (coBucket) expect((ct[0].reference_paths as string[]).length).toBe(1);
    }

    // Đóng → về khung "đã nhận" của bộ đang sửa.
    await ketQua.getByTestId("nut-dong-ket-qua").click();
    await expect(page.getByTestId("da-nhan-yeu-cau-sua")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("da-nhan-yeu-cau-sua")).toContainText("IMG_0003.jpg");
  });

  test("2. CSKH thấy đủ tấm xin sửa: ghi chú, vùng khoanh, ảnh minh hoạ", async ({ page }) => {
    await chanLh3TrenTrinhDuyet(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, emailCs, password);
    await page.goto(`/admin/galleries/${bo.id}`);
    const khoi = page.getByTestId("khoi-anh-chinh-admin");
    await expect(khoi).toBeVisible({ timeout: 120_000 });
    const vong = khoi.getByTestId("vong-sua-admin").first();
    await expect(vong).toContainText("Khách yêu cầu sửa lần 1");
    // Vòng 2 — thợ/CSKH thấy khách đã ưng tấm nào.
    if (co0108) {
      const duyet = khoi.getByTestId("duyet-tam-admin");
      await expect(duyet.getByTestId("dem-duyet-tam-admin")).toHaveText("Khách đã duyệt 1/2 tấm");
      await expect(duyet.getByTestId("tam-da-duyet-admin")).toHaveCount(1);
      await expect(duyet.getByTestId("tam-da-duyet-admin")).toContainText("IMG_0001-Edit.jpg");
    } else {
      await expect(khoi.getByTestId("duyet-tam-admin")).toHaveCount(0);
    }
    if (coBang) {
      const muc = vong.getByTestId("muc-sua-admin");
      await expect(muc).toHaveCount(1);
      await expect(muc).toContainText("IMG_0003.jpg");
      await expect(muc.getByTestId("ghi-chu-muc-sua")).toHaveText("Fixture BB-401 nền sáng hơn");
      await expect(muc.getByTestId("vung-khoanh")).toHaveCount(1);
      if (coBucket) {
        const anhMinhHoa = muc.getByTestId("anh-minh-hoa-admin").locator("img");
        await expect(anhMinhHoa).toHaveCount(1);
        await expect
          .poll(() => anhMinhHoa.evaluate((e) => (e as HTMLImageElement).complete && (e as HTMLImageElement).naturalWidth), {
            timeout: 20_000,
          })
          .toBeGreaterThan(0);
      }
    } else {
      await expect(vong).toContainText("IMG_0003.jpg: Fixture BB-401 nền sáng hơn");
    }
    await vong.scrollIntoViewIfNeeded();
    await chup(page, "5-quan-tri-thay-du-1440.png");
  });
});
