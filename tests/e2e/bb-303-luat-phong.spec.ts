/**
 * BB-303 — Luật phông (chủ studio chốt 28/09/2026, áp dụng ngay cho các màn
 * quản trị BB-303 đang dựng theo bản vẽ BB-301):
 *
 *   - Phông thương hiệu: CHỈ Playfair Display — logo BABY BEAN và tiêu đề
 *     trang (H1, tiêu đề khối lớn). KHÔNG dùng kiểu nghiêng.
 *   - Phông nội dung: CHỈ Be Vietnam Pro — mọi chữ khác, nút, nhãn, con số
 *     (tabular-nums). KHÔNG `font-mono`/phông đơn cách cho SĐT, số tiền, mã
 *     link.
 *   - Mỗi màn thường 2 phông, tối đa 3.
 *
 * Canh trên NĂM màn: Bảng điều khiển, Danh sách bộ ảnh, Chi tiết bộ ảnh,
 * Khách hàng, Báo cáo (BB-308 vòng 4, mục #7) — gom TẬP
 * `getComputedStyle(el).fontFamily` (họ đầu tiên) của mọi phần tử có văn
 * bản, phải là tập con của {Playfair Display, Be Vietnam Pro}, và không phần
 * tử Playfair nào `font-style: italic`.
 *
 * KIỂM NGƯỢC (chạy tay trước khi nộp, dán cả hai kết quả vào bàn giao): thêm
 * tạm một chỗ `font-mono` vào một trong bốn màn trên → ca dưới đây phải ĐỎ;
 * bỏ đi → XANH.
 *
 * Dữ liệu: chỉ "Fixture BB-303 …", dọn theo tuổi ≥6h ở `beforeAll`, dọn sạch
 * phần của lượt chạy này ở `afterAll`.
 *
 * Chạy: `PW_PORT=3168 npx playwright test tests/e2e/bb-303-luat-phong.spec.ts`.
 */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { dangNhapNhanVien } from "./helpers/dang-nhap-thu-lai";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-303 ${runId}`;
const emailOwner = `test_bb303_font_${runId}@demo.babybean.vn`;
const password = "Password123!";

const PHONG_CHO_PHEP = ["Playfair Display", "Be Vietnam Pro"];

const suKienAdmin = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

/**
 * Gom mọi họ phông (`font-family`, chỉ lấy tên ĐẦU TIÊN) của các phần tử
 * ĐANG HIỂN THỊ và mang VĂN BẢN TRỰC TIẾP trên trang — bỏ qua phần tử chỉ
 * chứa phần tử con (không tự nó có chữ) và phần tử ẩn (`offsetParent null`,
 * ví dụ bản dành-cho-điện-thoại đang `hidden` ở màn máy tính).
 */
async function gomHoPhong(page: Page): Promise<{ hoPhong: string[]; coPlayfairNghieng: string[] }> {
  return page.evaluate(() => {
    const hoPhong = new Set<string>();
    const coPlayfairNghieng: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node: Node | null = walker.currentNode;
    while (node) {
      if (node instanceof HTMLElement) {
        const coChuTrucTiep = Array.from(node.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
        );
        if (coChuTrucTiep && node.offsetParent !== null) {
          const style = window.getComputedStyle(node);
          const hoDau = style.fontFamily.split(",")[0]!.trim().replace(/^["']|["']$/g, "");
          if (hoDau) hoPhong.add(hoDau);
          if (hoDau === "Playfair Display" && style.fontStyle === "italic") {
            coPlayfairNghieng.push(node.tagName + ":" + (node.textContent ?? "").slice(0, 40));
          }
        }
      }
      node = walker.nextNode();
    }
    return { hoPhong: Array.from(hoPhong), coPlayfairNghieng };
  });
}

test.describe("BB-303: luật phông — chỉ Playfair Display + Be Vietnam Pro", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let ownerId = "";
  let shareLinkId = "";
  let selectionId = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(
      `delete from galleries where title like 'Fixture BB-303%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture BB-303%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const ownerRes = await suKienAdmin().auth.admin.createUser({
      email: emailOwner,
      password,
      email_confirm: true,
    });
    if (ownerRes.error) throw ownerRes.error;
    ownerId = ownerRes.data.user!.id;
    await client.query(
      `insert into staff_profiles (id, full_name, email, role) values ($1,$2,$3,'owner')`,
      [ownerId, `${NHAN} Owner`, emailOwner],
    );

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
      [branchId, `${NHAN} Khách`, "0901000303"],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, submitted_at)
       values ($1,$2,$3,'submitted',$4,'https://example.com/x',5,10, now()) returning id`,
      [branchId, customerId, NHAN, `fixture-bb303-font-${runId}`],
    );
    galleryId = g[0].id;

    const { rows: lk } = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1, md5(random()::text), 'bb303f', 'owner', 'active') returning id`,
      [galleryId],
    );
    shareLinkId = lk[0].id;

    const { rows: sel } = await client.query(
      `insert into selections (gallery_id, share_link_id, is_primary, submitted_at, snapshot_extra_amount)
       values ($1,$2,true, now(), 0) returning id`,
      [galleryId, shareLinkId],
    );
    selectionId = sel[0].id;
  });

  test.afterAll(async () => {
    if (client) {
      if (selectionId) await client.query("delete from selections where id = $1", [selectionId]);
      if (galleryId) await client.query("delete from share_links where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      if (ownerId) await client.query("delete from staff_profiles where id = $1", [ownerId]);
      await client.end();
    }
    if (ownerId) await suKienAdmin().auth.admin.deleteUser(ownerId);
  });

  test("Bảng điều khiển, Danh sách bộ ảnh, Chi tiết bộ ảnh, Khách hàng — chỉ dùng hai phông đã chốt", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await dangNhapNhanVien(page, emailOwner, password);

    const loiTheoTrang: string[] = [];

    async function kiemTrang(duongDan: string, cho: () => Promise<void>) {
      await page.goto(duongDan, { waitUntil: "domcontentloaded" });
      await cho();
      await page.waitForTimeout(300); // để font web nạp xong (@font-face), không đọc lúc còn font hệ thống tạm thời
      const { hoPhong, coPlayfairNghieng } = await gomHoPhong(page);
      const laHop = hoPhong.filter((f) => !PHONG_CHO_PHEP.includes(f));
      if (laHop.length > 0) {
        loiTheoTrang.push(`${duongDan}: phông lạ ${JSON.stringify(laHop)} (đủ bộ: ${JSON.stringify(hoPhong)})`);
      }
      if (coPlayfairNghieng.length > 0) {
        loiTheoTrang.push(`${duongDan}: Playfair Display bị in nghiêng ở ${coPlayfairNghieng.length} phần tử — ${coPlayfairNghieng.slice(0, 3).join(" | ")}`);
      }
    }

    await kiemTrang("/admin", () => page.locator("h1").first().waitFor({ state: "attached", timeout: 20_000 }));
    await kiemTrang("/admin/galleries", () =>
      page.locator("table, [role='table']").first().waitFor({ state: "attached", timeout: 20_000 }).catch(() => {}),
    );
    await kiemTrang(`/admin/galleries/${galleryId}`, () =>
      page.getByText("Trạng thái").first().waitFor({ state: "attached", timeout: 20_000 }),
    );
    await kiemTrang("/admin/customers", () =>
      page.locator("input#tim-khach").waitFor({ state: "attached", timeout: 20_000 }),
    );
    // BB-308 (vòng 4, mục #7 báo cáo chấm 28/09/2026) — trang Báo cáo chọn
    // sẵn báo cáo ĐẦU TIÊN khi vào không kèm `?ma=`; chờ thẻ số (`.bb-so`,
    // đúng token Be Vietnam Pro tabular-nums BB-301 quyết định số 2) render
    // xong trước khi gom phông, không chờ tiêu đề "Báo cáo" (hiện ngay từ
    // đầu, trước khi báo cáo tải xong).
    await kiemTrang("/admin/bao-cao", () =>
      page.locator(".bb-so").first().waitFor({ state: "attached", timeout: 20_000 }),
    );

    expect(loiTheoTrang, `Vi phạm luật phông:\n${loiTheoTrang.join("\n")}`).toEqual([]);
  });
});
