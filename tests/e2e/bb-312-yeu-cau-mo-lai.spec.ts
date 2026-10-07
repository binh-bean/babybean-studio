/**
 * BB-312 (P0, chủ studio 28/09/2026) — quy trình "khách xin mở lại" phải có
 * phản hồi ở CẢ HAI phía: khách xin → quản trị thấy khối nổi bật → từ chối
 * kèm lý do → khách thấy lý do → khách xin lần 2 → quản trị mở lại → khách
 * thấy đã mở.
 *
 * OWNER: QA-BOT (tệp này) / DEV-FE + DEV-BE (sản phẩm được kiểm).
 *
 * ---------------------------------------------------------------------------
 * Vì sao bộ ảnh Fixture ở trạng thái 'expired', không phải 'in_retouch'
 * ---------------------------------------------------------------------------
 * Route khách xin mở lại (`/api/g/xin-sua-lai`) chỉ nhận khi bộ ảnh ĐÃ KHOÁ
 * (`isGalleryLocked`) — đúng mọi trạng thái từ `in_retouch` trở đi. Nhưng route
 * CSKH mở lại trực tiếp (`/api/admin/.../reopen`, có sẵn từ BB-122) CHỈ đảo
 * được từ `expired`/`submitted` — `in_retouch` trở đi phải "đi đường yêu cầu
 * sửa" (giới hạn có sẵn, ngoài phạm vi BB-312, xem chú thích đầu
 * `yeu-cau-mo-lai-banner.tsx`). Giao của hai luật đó chỉ còn `expired`, nên
 * đó là trạng thái DUY NHẤT diễn được trọn vẹn "xin → từ chối → xin lại →
 * MỞ LẠI THẬT" bằng đúng hành động mở lại hiện có, như brief yêu cầu.
 *
 * Dữ liệu: chỉ "Fixture BB-312 …", xoá sạch ở afterAll — cùng khuôn
 * `e8-mo-lai.spec.ts` (gallery + share link) và `bb-306-logo.spec.ts` (tài
 * khoản nhân viên thử + ảnh chụp cả hai khổ vào babybean-assets).
 */

import { test as ownIpTest, expect as ownIpExpect } from "./helpers/ip-rieng-moi-ca";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-312 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

const emailNhanVien = `test_bb312_${runId}@demo.babybean.vn`;
const matKhauNhanVien = "Password123!";

const THU_MUC_ANH = "test-results/bb-312";
fs.mkdirSync(THU_MUC_ANH, { recursive: true });

// Ảnh chụp đối chiếu dài hạn (LUẬT-ĐỢT-8: lưu NGOÀI test-results).
const CHUP = "C:\\Users\\binh\\Downloads\\claude code\\babybean-assets\\BB-312\\chup";
fs.mkdirSync(CHUP, { recursive: true });

const DIEN_THOAI = { width: 390, height: 844 };
const MAY_TINH = { width: 1440, height: 900 };

/**
 * Cuộn qua ảnh bìa để lộ thanh chọn dính đáy (`thanh-chon.tsx`, prop `an`) —
 * thanh đó tự ẩn (`aria-hidden`, CSS trượt xuống) trong lúc bìa còn chiếm
 * >40% khung nhìn (gallery-app.tsx, `biaConHien`). `scrollIntoViewIfNeeded`
 * trên `#dau-luoi-anh` (thanh dính NGAY SAU bìa) không đủ — phần tử dính có
 * thể đã "trong khung nhìn" ở vị trí tự nhiên mà bìa phía trên vẫn còn hiện
 * quá 40%; cuộn CHỦ ĐỘNG bằng bánh xe chuột hai lượt (đo được cần >3000px cho
 * ảnh bìa cỡ điện thoại) mới chắc chắn đẩy bìa ra khỏi ngưỡng đó.
 */
async function cuonQuaBia(page: import("@playwright/test").Page): Promise<void> {
  const thanhNoi = page.getByTestId("thanh-noi");
  for (let lan = 0; lan < 6; lan++) {
    if ((await thanhNoi.getAttribute("aria-hidden")) === "false") return;
    await page.mouse.wheel(0, 3000);
    await page.waitForTimeout(300);
  }
  await ownIpExpect(thanhNoi).toHaveAttribute("aria-hidden", "false", { timeout: 5_000 });
}

/**
 * Chụp cả hai khổ, CĂN KHUNG NHÌN vào dải trạng thái (`yeu-cau-mo-lai-trang-thai`)
 * khi có mặt — nếu chỉ cuộn qua bìa (`cuonQuaBia`) rồi chụp ngay, ảnh chỉ bắt
 * được chân trang/thanh đáy, không thấy CÂU CHỮ của dải trạng thái (mục đích
 * chính của ảnh chụp này). Không có dải trạng thái (chưa từng xin) thì lùi về
 * cuộn qua bìa như cũ.
 */
async function chupCaHaiKho(
  page: import("@playwright/test").Page,
  ten: string,
): Promise<void> {
  const cuonToiDaiTrangThai = async () => {
    const dai = page.getByTestId("yeu-cau-mo-lai-trang-thai");
    if (await dai.count()) {
      await dai.scrollIntoViewIfNeeded();
    } else {
      await cuonQuaBia(page);
    }
  };

  await page.setViewportSize(DIEN_THOAI);
  await cuonToiDaiTrangThai();
  await page.screenshot({ path: `${THU_MUC_ANH}/${ten}-390x844.png` });
  await page.screenshot({ path: `${CHUP}/${ten}-390x844.png` });

  await page.setViewportSize(MAY_TINH);
  await cuonToiDaiTrangThai();
  await page.screenshot({ path: `${THU_MUC_ANH}/${ten}-1440x900.png` });
  await page.screenshot({ path: `${CHUP}/${ten}-1440x900.png` });
}

ownIpTest.describe("BB-312: khách xin mở lại — phản hồi cả hai phía", () => {
  let client: Client;
  let userId = "";
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  const suKienAdmin = () =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

  ownIpTest.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    // Dọn rác của lần chạy trước bị ngắt giữa chừng.
    await client.query(
      `delete from galleries where title like 'Fixture BB-312%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture BB-312%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { data, error } = await suKienAdmin().auth.admin.createUser({
      email: emailNhanVien,
      password: matKhauNhanVien,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user!.id;

    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'cs')`,
      [userId, `${NHAN} NV`, emailNhanVien],
    );
    await client.query(
      `insert into staff_branches (staff_id, branch_id, is_primary) values ($1,$2,true)`,
      [userId, branchId],
    );

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,'0901000001') returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    // 'expired' + due_at quá khứ — xem chú thích đầu tệp vì sao đúng trạng
    // thái này mới diễn được trọn vẹn cả bốn bước (xin → từ chối → xin lại →
    // mở lại thật) bằng đúng hành động mở lại có sẵn.
    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled, due_at)
       values ($1,$2,$3,'expired',$4,'https://example.com/x',3,5,50000,false, now() - interval '2 days')
       returning id`,
      [branchId, customerId, `${NHAN} Bộ ảnh`, `fixture-bb312-${runId}`],
    );
    galleryId = g[0].id;

    for (let i = 1; i <= 3; i++) {
      await client.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,$3,'image/jpeg',$4,'active')`,
        [galleryId, `bb312-${runId}-${i}`, `BB312_000${i}.jpg`, i],
      );
    }

    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  ownIpTest.afterAll(async () => {
    if (client) {
      if (galleryId) {
        await client.query("delete from thong_bao_khach where gallery_id = $1", [galleryId]);
        // BB-395 — chuông NHÂN VIÊN (khách xin mở lại) cũng mang tên bộ Fixture; trước đây
        // mỗi lượt chạy để sót 1–2 dòng `notifications` (db:kiem-fixture báo).
        await client.query("delete from notifications where payload->>'galleryTitle' like $1", [`${NHAN}%`]);
        await client.query("delete from push_dang_ky where gallery_id = $1", [galleryId]);
        await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
        await client.query("delete from selections where gallery_id = $1", [galleryId]);
        await client.query("delete from galleries where id = $1", [galleryId]);
      }
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (userId) {
        await client.query("delete from staff_branches where staff_id = $1", [userId]);
        await client.query("delete from staff_profiles where id = $1", [userId]);
      }
      await client.end();
    }
    if (userId) await suKienAdmin().auth.admin.deleteUser(userId);
  });

  ownIpTest("vòng đời đủ bốn bước, cả hai phía đều thấy đúng trạng thái", async ({ page, context }) => {
    // Ca này đi qua HAI trang (khách + quản trị), nhiều lượt tải lại và một
    // lượt đăng nhập nhân viên có thể phải CHỜ + THỬ LẠI khi bị Supabase Auth
    // chặn tốc độ (`dangNhapNhanVien`) — thời gian mặc định 60s của
    // playwright.config.ts không đủ dư cho cả chuỗi bảy bước.
    ownIpTest.setTimeout(150_000);

    // ---------------------------------------------------------------------
    // 1. KHÁCH xin mở lại LẦN 1
    // ---------------------------------------------------------------------
    await page.setViewportSize(DIEN_THOAI);
    await page.goto(`/g/${maLink}`);

    await cuonQuaBia(page);

    const nutYeuCau = page.getByRole("button", { name: "Yêu cầu sửa lại" });
    await ownIpExpect(nutYeuCau).toBeVisible({ timeout: 20_000 });
    await nutYeuCau.click();

    await page.getByPlaceholder(/đổi tấm số 12/).fill(`${NHAN} lần 1 — đổi tấm bìa`);
    await page.getByRole("button", { name: "Gửi cho Bean" }).click();

    const daiTrangThaiKhach = page.getByTestId("yeu-cau-mo-lai-trang-thai");
    await ownIpExpect(daiTrangThaiKhach).toContainText("Đã gửi yêu cầu mở lại", { timeout: 15_000 });
    await ownIpExpect(
      page.getByRole("button", { name: /Đã gửi yêu cầu · lần 1/ }),
    ).toBeVisible();

    await chupCaHaiKho(page, "1-khach-da-gui-lan-1");

    // ---------------------------------------------------------------------
    // 2. QUẢN TRỊ thấy khối nổi bật
    // ---------------------------------------------------------------------
    const nvPage = await context.newPage();
    await dangNhapNhanVien(nvPage, emailNhanVien, matKhauNhanVien);
    await nvPage.goto(`/admin/galleries/${galleryId}`);

    const khoiNoiBat = nvPage.getByTestId("yeu-cau-mo-lai-banner");
    await ownIpExpect(khoiNoiBat).toBeVisible({ timeout: 20_000 });
    await ownIpExpect(khoiNoiBat).toContainText("Ba mẹ xin mở lại để sửa");
    await ownIpExpect(khoiNoiBat).toContainText("lần thứ 1");
    await ownIpExpect(khoiNoiBat).toContainText("đổi tấm bìa");

    await nvPage.setViewportSize(MAY_TINH);
    await nvPage.screenshot({ path: `${THU_MUC_ANH}/2-quan-tri-khoi-noi-bat-1440x900.png` });
    await nvPage.screenshot({ path: `${CHUP}/2-quan-tri-khoi-noi-bat-1440x900.png` });
    await nvPage.setViewportSize(DIEN_THOAI);
    await nvPage.screenshot({ path: `${THU_MUC_ANH}/2-quan-tri-khoi-noi-bat-390x844.png` });
    await nvPage.screenshot({ path: `${CHUP}/2-quan-tri-khoi-noi-bat-390x844.png` });
    await nvPage.setViewportSize(MAY_TINH);

    // ---------------------------------------------------------------------
    // 3. QUẢN TRỊ từ chối kèm lý do
    // ---------------------------------------------------------------------
    await khoiNoiBat.getByRole("button", { name: "Từ chối" }).click();
    const lyDoTuChoi = `${NHAN}: ảnh đã in xong, ba mẹ ghé studio nhận nhé`;
    await khoiNoiBat.getByLabel(/Lý do từ chối/).fill(lyDoTuChoi);
    await khoiNoiBat.getByRole("button", { name: "Xác nhận từ chối" }).click();

    await ownIpExpect(khoiNoiBat).toBeHidden({ timeout: 15_000 });

    await ownIpExpect
      .poll(async () => {
        const { rows } = await client.query(
          "select count(*)::int n from activity_logs where action='gallery.reopen_rejected' and entity_id=$1",
          [galleryId],
        );
        return rows[0].n as number;
      }, { timeout: 10_000 })
      .toBe(1);

    // ---------------------------------------------------------------------
    // 4. KHÁCH thấy lý do từ chối
    // ---------------------------------------------------------------------
    await page.reload();
    await ownIpExpect(daiTrangThaiKhach).toContainText("Bean phản hồi", { timeout: 15_000 });
    await ownIpExpect(daiTrangThaiKhach).toContainText("ba mẹ ghé studio nhận nhé");

    await chupCaHaiKho(page, "3-khach-bi-tu-choi");

    // ---------------------------------------------------------------------
    // 5. KHÁCH xin LẦN 2
    // ---------------------------------------------------------------------
    await cuonQuaBia(page);
    await page.getByRole("button", { name: "Yêu cầu sửa lại" }).click();
    await ownIpExpect(page.getByText(/Lần trước Bean phản hồi/)).toBeVisible();
    await page.getByPlaceholder(/đổi tấm số 12/).fill(`${NHAN} lần 2 — vậy đổi bìa được không ạ`);
    await page.getByRole("button", { name: "Gửi cho Bean" }).click();
    await ownIpExpect(
      page.getByRole("button", { name: /Đã gửi yêu cầu · lần 2/ }),
    ).toBeVisible({ timeout: 15_000 });

    // ---------------------------------------------------------------------
    // 6. QUẢN TRỊ mở lại (đúng hành động mở lại hiện có)
    // ---------------------------------------------------------------------
    await nvPage.reload();
    await ownIpExpect(khoiNoiBat).toBeVisible({ timeout: 20_000 });
    await ownIpExpect(khoiNoiBat).toContainText("lần thứ 2");

    await nvPage.screenshot({ path: `${THU_MUC_ANH}/4-quan-tri-lan-2-1440x900.png` });
    await nvPage.screenshot({ path: `${CHUP}/4-quan-tri-lan-2-1440x900.png` });
    await nvPage.setViewportSize(DIEN_THOAI);
    await nvPage.screenshot({ path: `${THU_MUC_ANH}/4-quan-tri-lan-2-390x844.png` });
    await nvPage.screenshot({ path: `${CHUP}/4-quan-tri-lan-2-390x844.png` });
    await nvPage.setViewportSize(MAY_TINH);

    await khoiNoiBat.getByRole("button", { name: "Mở lại cho khách" }).click();
    await khoiNoiBat.getByRole("button", { name: "Xác nhận mở lại" }).click();
    await ownIpExpect(khoiNoiBat).toBeHidden({ timeout: 15_000 });

    await ownIpExpect
      .poll(async () => {
        const { rows } = await client.query("select status::text s from galleries where id=$1", [
          galleryId,
        ]);
        return rows[0]?.s;
      }, { timeout: 10_000 })
      .toBe("in_review");

    // ---------------------------------------------------------------------
    // 7. KHÁCH thấy đã mở
    // ---------------------------------------------------------------------
    await page.reload();
    await ownIpExpect(daiTrangThaiKhach).toContainText("Bean đã mở lại", { timeout: 15_000 });

    await chupCaHaiKho(page, "5-khach-da-mo");

    // Chuông thông báo phải ghi đủ hai lượt (từ chối + mở lại) — BB-312 mục 4.
    const { rows: hopThu } = await client.query(
      "select loai from thong_bao_khach where gallery_id=$1 order by created_at asc",
      [galleryId],
    );
    ownIpExpect(hopThu.map((r) => r.loai)).toEqual(["reopen_tu_choi", "reopen_da_mo"]);
  });
});
