/**
 * BB-245 — "Mời mua lần hai khi khách duyệt không yêu cầu chỉnh lại."
 *
 * Ba bộ ảnh, ba kết quả:
 *   A. `approved`, 0 vòng xin sửa      → thẻ mời hiện, gửi yêu cầu được.
 *   B. `approved`, 1 vòng xin sửa      → KHÔNG có thẻ (khách từng chê).
 *   C. `in_retouch`                    → KHÔNG có thẻ (chưa hề duyệt).
 *
 * Dữ liệu: chỉ tạo dòng "Fixture BB-245 …", xoá sạch ở afterAll — theo đúng
 * luật AGENTS.md §6 (bb-dev là dữ liệu thật của studio).
 *
 * Bảng `yeu_cau_mua_them` (migration 0072) có thể CHƯA áp lên môi trường
 * chạy thử này — ca "gửi yêu cầu" tự kiểm tồn tại bảng trước khi khẳng định
 * dòng đã ghi, và bỏ qua phần đó (ghi rõ lý do) nếu bảng chưa có.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
// Số giả MỚI mỗi lượt — số cố định va nhau khi hai worktree chạy cùng tệp
// (uq_customers_phone_branch), như đã thấy ở bb-217-218.
const soGia = () => `0900${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}`;
const NHAN = `Fixture BB-245 ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

test.describe("BB-245: mời mua lần hai", () => {
  let pg: Client;
  let coBang = false;

  // Ba bộ ảnh riêng, mỗi bộ một khách/link/selection.
  const bo = {
    approved: { galleryId: "", customerId: "", maLink: "", selectionId: "", anh: "" },
    coVongSua: { galleryId: "", customerId: "", maLink: "", selectionId: "" },
    inRetouch: { galleryId: "", customerId: "" },
  };

  async function taoBoAnh(status: string, tenHau: string) {
    const { rows: br } = await pg.query("select id from branches order by name limit 1");
    const { rows: kh } = await pg.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [br[0].id, `${NHAN} ${tenHau}`, soGia()],
    );
    const { rows: g } = await pg.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count)
       values ($1,$2,$3,$4,$5,'https://example.com/x',1) returning id`,
      [br[0].id, kh[0].id, `${NHAN} ${tenHau}`, status, `fixture-bb245e2e-${runId}-${tenHau}`],
    );
    return { customerId: kh[0].id as string, galleryId: g[0].id as string };
  }

  async function taoLink(galleryId: string) {
    const maLink = randomBytes(32).toString("base64url");
    const { rows: lk } = await pg.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status)
       values ($1,$2,$3,'owner',$4,'active') returning id`,
      [galleryId, sha256(maLink), maLink.slice(0, 6), NHAN],
    );
    const { rows: sel } = await pg.query(
      `insert into selections (gallery_id, share_link_id, is_primary) values ($1,$2,true) returning id`,
      [galleryId, lk[0].id],
    );
    return { maLink, selectionId: sel[0].id as string };
  }

  test.beforeAll(async () => {
    pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await pg.connect();
    await pg.query(`delete from galleries where title like 'Fixture BB-245%' and created_at < now() - interval '6 hours'`);
    await pg.query(`delete from customers where full_name like 'Fixture BB-245%' and created_at < now() - interval '6 hours'`);

    const { rows: bangKiem } = await pg.query(`select to_regclass('public.yeu_cau_mua_them') as bang`);
    coBang = bangKiem[0]?.bang !== null;


    // A. approved, 0 vòng sửa.
    {
      const { customerId, galleryId } = await taoBoAnh("approved", "A-duyet");
      bo.approved.customerId = customerId;
      bo.approved.galleryId = galleryId;
      const { rows: ph } = await pg.query(
        `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
         values ($1,$2,'BB245_A_001.jpg','image/jpeg',1,'active') returning id`,
        [galleryId, `bb245e2e-a-${runId}`],
      );
      bo.approved.anh = ph[0].id;
      const { maLink, selectionId } = await taoLink(galleryId);
      bo.approved.maLink = maLink;
      bo.approved.selectionId = selectionId;
      await pg.query(
        `insert into selection_items (selection_id, photo_id, gallery_id, mark) values ($1,$2,$3,'selected')`,
        [selectionId, bo.approved.anh, galleryId],
      );
    }

    // B. approved NHƯNG có 1 vòng xin sửa — không được mời.
    {
      const { customerId, galleryId } = await taoBoAnh("approved", "B-covong");
      bo.coVongSua.customerId = customerId;
      bo.coVongSua.galleryId = galleryId;
      await pg.query(
        `insert into revision_requests (gallery_id, round, note) values ($1,1,'Fixture BB-245: sáng ảnh lên')`,
        [galleryId],
      );
      const { maLink, selectionId } = await taoLink(galleryId);
      bo.coVongSua.maLink = maLink;
      bo.coVongSua.selectionId = selectionId;
    }

    // C. in_retouch — chưa hề duyệt, không được mời.
    {
      const { customerId, galleryId } = await taoBoAnh("in_retouch", "C-dangchinh");
      bo.inRetouch.customerId = customerId;
      bo.inRetouch.galleryId = galleryId;
    }
  });

  test.afterAll(async () => {
    const tatCaGallery = [bo.approved.galleryId, bo.coVongSua.galleryId, bo.inRetouch.galleryId].filter(Boolean);
    for (const gid of tatCaGallery) {
      if (coBang) await pg.query("delete from yeu_cau_mua_them where gallery_id = $1", [gid]);
      await pg.query("delete from revision_requests where gallery_id = $1", [gid]);
      await pg.query("delete from selections where gallery_id = $1", [gid]);
      await pg.query("delete from share_links where gallery_id = $1", [gid]);
      await pg.query("delete from activity_logs where entity_id = $1", [gid]);
      await pg.query("delete from photos where gallery_id = $1", [gid]);
      await pg.query("delete from galleries where id = $1", [gid]);
    }
    const tatCaKhach = [bo.approved.customerId, bo.coVongSua.customerId, bo.inRetouch.customerId].filter(Boolean);
    for (const cid of tatCaKhach) await pg.query("delete from customers where id = $1", [cid]);
    await pg.end();
  });

  test("BB-321: bộ đã DUYỆT — thẻ 'Mời mua lần hai' đã NGHỈ, thay bằng 'Chọn thêm ảnh' (mua theo đợt)", async ({ page }) => {
    /*
      BB-321 gộp hai đường mua làm một: ba mẹ mua thêm qua "Chọn thêm ảnh" (đợt
      chọn, có xác nhận của CSKH) — không còn gửi "yêu cầu mua thêm" riêng. Ca cũ
      (thẻ mời → Gửi yêu cầu cho studio → dòng yeu_cau_mua_them) đã bỏ; luồng
      mới nằm ở tests/e2e/bb-321-dot-chon.spec.ts. Ca này chỉ canh: thẻ CŨ không
      còn, thẻ MỚI có.
    */
    const cho = page.waitForResponse((r) => r.url().includes("/api/g/gallery") && r.status() === 200);
    await page.goto(`/g/${bo.approved.maLink}`);
    await cho;

    await expect(page.getByTestId("chon-them-anh")).toBeVisible();
    await expect(page.getByText("Ba mẹ đã ưng bộ ảnh — in tấm yêu thích lên khung nhé?")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Gửi yêu cầu cho Bean" })).toHaveCount(0);
  });

  test("bộ đã DUYỆT nhưng CÓ vòng xin sửa: không có thẻ mời", async ({ page }) => {
    /*
      `toHaveCount(0)` thắng ngay ở lần đọc ĐẦU TIÊN nếu lúc đó số phần tử
      đúng bằng 0 — nó không chờ xem con số có ĐỨNG YÊN ở 0 không. Gọi thẳng
      assertion này ngay sau goto() thì dữ liệu bộ ảnh (`review.rounds`) còn
      chưa kịp tải và trang còn CHƯA CÓ GÌ CẢ — assertion xanh một cách vô
      nghĩa, không canh được gì (đo được bằng kiểm ngược: hỏng luật rồi chạy,
      bản goto()-rồi-hỏi-ngay vẫn xanh vì hỏi quá sớm). Chờ đúng lượt gọi
      mang dữ liệu bộ ảnh về (200), rồi cho một nhịp ngắn để React render
      xong — qua mốc đó DOM đã ổn định với dữ liệu thật.
    */
    const cho = page.waitForResponse((r) => r.url().includes("/api/g/gallery") && r.status() === 200);
    await page.goto(`/g/${bo.coVongSua.maLink}`);
    await cho;
    await page.waitForTimeout(500);
    await expect(page.getByText("Ba mẹ ưng bộ ảnh? In tấm yêu thích lên khung nhé.")).toHaveCount(0);
  });

  test("bộ đang 'in_retouch': không có thẻ mời (chưa hề duyệt)", async ({ page }) => {
    const { maLink } = await taoLink(bo.inRetouch.galleryId);
    const cho = page.waitForResponse((r) => r.url().includes("/api/g/gallery") && r.status() === 200);
    await page.goto(`/g/${maLink}`);
    await cho;
    await page.waitForTimeout(500);
    await expect(page.getByText("Ba mẹ ưng bộ ảnh? In tấm yêu thích lên khung nhé.")).toHaveCount(0);
  });
});
