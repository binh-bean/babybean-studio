/**
 * BB-314 — đo byte đi qua `/api/img` và số lượt 302 trên lưới khách, và canh
 * chống lùi (nếu sau này ai đó gỡ điều hướng, phép thử này phải ĐỎ).
 *
 * OWNER: QA-BOT (chỉ file này; sản phẩm ở `src/app/api/img/[photoId]/route.ts`
 * thuộc DEV-INT).
 *
 * Vì sao đo ở ĐÚNG chỗ này: báo cáo vận hành vòng 4 đo 17MB ảnh/lượt khách mở
 * bộ, toàn bộ đi qua hàm Vercel — đúng chỗ gói Hobby cạn hạn mức truyền tải
 * hàm. Bản vá BB-314 chuyển ảnh NHỎ (w<=800, lưới) sang điều hướng 302 thẳng
 * tới lh3.googleusercontent.com; hàm Vercel chỉ còn xét quyền + trả một điều
 * hướng rỗng, không còn ôm byte ảnh.
 *
 * `page.route` chặn ĐÚNG các yêu cầu trình duyệt gửi tới lh3 (sau khi theo
 * điều hướng) và trả một ảnh 1×1 giả — mô phỏng đúng thứ `mock-drive-
 * network.cjs` làm ở phía SERVER cho `driveFetch`, nhưng ở đây là phía
 * TRÌNH DUYỆT, vì sau bản vá này trình duyệt tự đi thẳng ra ngoài, không qua
 * server nữa. KHÔNG chặn ở đây thì trình duyệt sẽ gọi lh3 THẬT trên ID giả
 * của fixture, lh3 trả 400 (đã đo tay 28/09/2026: ~0.7s), rồi `onError` của
 * `<img>` (xem `luoi-anh.tsx`) tự thử lại qua `?qua=1` — vẫn đúng cơ chế cần
 * canh, nhưng làm nhiễu số đo "byte qua /api/img" (một phần ảnh sẽ lại đi qua
 * proxy do lh3 giả bị từ chối, không phải do bản vá sai). Chặn ở đây cho số
 * đo sạch, khớp đúng trường hợp lh3 THẬT thành công (đã xác nhận bằng tay,
 * xem bàn giao).
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao): đổi
 * `if (nenDieuHuongLh3(width, taiVe, quaProxy))` trong route.ts thành
 * `if (nenDieuHuongLh3(width, taiVe, quaProxy) && false)` (tắt hẳn điều
 * hướng, mô phỏng TRƯỚC bản vá) → ca "302 và byte gần 0" bên dưới phải ĐỎ,
 * và số byte đo được phải NHẢY VỌT lên gần bằng số byte ảnh giả nhân số ảnh.
 * Khôi phục lại rồi chạy lại thấy XANH.
 */
import { test, expect } from "./helpers/ip-rieng-moi-ca";
import type { Response as PwResponse } from "@playwright/test";
import { Client } from "pg";
import { createHash, randomBytes } from "node:crypto";

const runId = Math.random().toString(36).slice(2, 10);
const NHAN = `Fixture BB-314 Byte ${runId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const SO_ANH = 40;

// Ảnh 1×1 giả — cùng nội dung với `mock-drive-network.cjs`, dùng lại ở đây để
// chặn đúng các yêu cầu trình duyệt gửi trực tiếp ra lh3 sau khi theo điều
// hướng 302 (đường đó KHÔNG đi qua server, `mock-drive-network.cjs` không với
// tới được).
const IMG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC",
  "base64",
);

test.describe("BB-314: byte qua /api/img và số lượt 302 trên lưới khách", () => {
  let client: Client;
  let branchId = "";
  let customerId = "";
  let galleryId = "";
  let maLink = "";

  test.beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();

    await client.query(
      `delete from galleries where title like 'Fixture BB-314 Byte%' and created_at < now() - interval '6 hours'`,
    );
    await client.query(
      `delete from customers where full_name like 'Fixture BB-314 Byte%' and created_at < now() - interval '6 hours'`,
    );

    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;

    const { rows: kh } = await client.query(
      `insert into customers (branch_id, full_name) values ($1,$2) returning id`,
      [branchId, `${NHAN} Khách`],
    );
    customerId = kh[0].id;

    const { rows: g } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, included_quota, extra_photo_price,
                              download_enabled)
       values ($1,$2,$3,'ready',$4,'https://example.com/x',$5,10,50000,false) returning id`,
      [branchId, customerId, NHAN, `fixture-bb314-byte-${runId}`, SO_ANH],
    );
    galleryId = g[0].id;

    await client.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status)
       select $1, 'bb314byte-' || $2 || '-' || x, 'BB314_' || lpad(x::text, 4, '0') || '.jpg', 'image/jpeg', x, 'active'
       from generate_series(1, $3) as x`,
      [galleryId, runId, SO_ANH],
    );

    maLink = randomBytes(32).toString("base64url");
    await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
       values ($1,$2,$3,'owner','active')`,
      [galleryId, sha256(maLink), maLink.slice(0, 6)],
    );
  });

  test.afterAll(async () => {
    if (client) {
      if (galleryId) await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from selections where gallery_id = $1", [galleryId]);
      if (galleryId) await client.query("delete from galleries where id = $1", [galleryId]);
      if (customerId) await client.query("delete from customers where id = $1", [customerId]);
      await client.end();
    }
  });

  test("lưới khách (1440×900): đa số /api/img trả 302, byte thật qua Vercel gần 0", async ({ page }) => {
    // Mô phỏng lh3 THẬT thành công (đã xác nhận bằng tay: 200, image/jpeg —
    // xem bàn giao) — trình duyệt theo điều hướng ra ngoài, KHÔNG quay lại
    // proxy qua onError.
    await page.route("https://lh3.googleusercontent.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: IMG_1x1 }),
    );

    await page.setViewportSize({ width: 1440, height: 900 });

    let soLuot302 = 0;
    let soLuot200 = 0;
    let byteThatQuaApiImg = 0;
    let soLuotAnhLonQuaProxy = 0;
    page.on("response", async (res: PwResponse) => {
      if (!res.url().includes("/api/img/")) return;
      // BB-323 — chỉ tính ảnh CỠ LƯỚI (w ≤ 800), đúng phạm vi bản vá BB-314
      // (`nenDieuHuongLh3`: w ≤ 800 mới điều hướng). Ảnh lớn (bìa máy tính
      // `?w=1600`, xem lớn) ĐI QUA PROXY THEO THIẾT KẾ. Trước BB-316, máy giả Drive
      // trả JPEG 1×1 nên một tấm bìa qua proxy chỉ vài trăm byte và lọt ngưỡng
      // 5 000 B; từ BB-316 máy giả trả JPEG trung tính 60–135 KB (giống thật), một
      // tấm bìa 1600 là ~82 KB — phép thử đỏ dù lưới vẫn 302 đủ. Tách riêng ra.
      const w = Number(new URL(res.url()).searchParams.get("w") ?? "0");
      const status = res.status();
      if (w > 800) {
        if (status === 200) soLuotAnhLonQuaProxy += 1;
        return;
      }
      if (status === 302) {
        soLuot302 += 1;
        return;
      }
      if (status === 200) {
        soLuot200 += 1;
        try {
          const b = await res.body();
          byteThatQuaApiImg += b.length;
        } catch {
          // điều hướng/huỷ giữa chừng — bỏ qua, không phải số đo chính.
        }
      }
    });

    await page.goto(`/g/${maLink}`);

    const theAnh = page.getByTestId("the-anh");
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(30);
      if (await theAnh.first().isVisible().catch(() => false)) break;
    }
    await expect(theAnh.first()).toBeVisible({ timeout: 15000 });

    // Cuộn hết cả lưới fixture (40 ảnh, khung nhìn nhỏ) để mọi thẻ đều được
    // dựng và xin ảnh ít nhất một lần.
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 2000);
      await page.waitForTimeout(50);
    }
    await page.waitForTimeout(1000);

    // eslint-disable-next-line no-console
    console.log(
      `[BB-314][byte] lưới (w≤800): /api/img 302=${soLuot302} | /api/img 200=${soLuot200} | ` +
        `byte thật qua Vercel=${byteThatQuaApiImg}B | ảnh lớn qua proxy (w>800, theo thiết kế)=${soLuotAnhLonQuaProxy}`,
    );

    // ĐÂY là toàn bộ ý nghĩa của phép thử: phần lớn (thực tế mọi) lượt xin
    // ảnh lưới phải là 302 — hàm Vercel không còn ôm byte ảnh cho lưới nữa.
    expect(soLuot302).toBeGreaterThan(0);
    expect(byteThatQuaApiImg).toBeLessThan(5_000); // gần 0 — không có ảnh thật nào lọt qua proxy
  });
});
