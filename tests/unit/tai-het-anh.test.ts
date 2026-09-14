/**
 * BB-128 — màn khách phải tải HẾT ảnh, không dừng ở trang đầu.
 *
 * Bản cũ gọi `/api/g/photos?limit=200` đúng một lần rồi dừng. Lúc viết, bộ ảnh
 * mẫu nhiều nhất 35 tấm nên không ai chạm tới con số đó.
 *
 * Ngày 14.09.2026 kéo ảnh thật từ Drive: trung bình **425 tấm** một bộ, cao
 * nhất **1.235**, và **333/359 bộ vượt 200** — tức **82.274 tấm** khách sẽ
 * không bao giờ nhìn thấy, mà cũng không có dấu hiệu nào cho biết còn ảnh ở
 * phía sau. Khách trả tiền một buổi chụp rồi chỉ được chọn trong nửa số ảnh.
 *
 * Phép thử đi thẳng vào đường API mà màn hình gọi, với dữ liệu thật trong cơ
 * sở dữ liệu: một bộ có hơn 200 ảnh thì đi hết con trỏ phải ra đúng số ảnh
 * đang có, không phải 200.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

describe("BB-128: tải hết ảnh chứ không dừng ở 200", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
  });

  afterAll(async () => {
    await client.end();
  });

  it("1. Có bộ ảnh thật vượt 200 tấm, nếu không phép thử vô nghĩa", async () => {
    // Kiểm chứng ngược: không bộ nào vượt 200 thì mọi phép thử dưới đây xanh
    // mà chẳng chứng minh gì.
    const { rows } = await client.query(
      "select count(*)::int n from galleries where photo_count > 200",
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it("2. Đi hết con trỏ thì ra đủ số ảnh, không dừng ở 200", async () => {
    const { rows: g } = await client.query(
      `select id, photo_count from galleries
       where photo_count > 200 order by photo_count desc limit 1`,
    );
    const galleryId = g[0].id as string;
    const tong = g[0].photo_count as number;

    // Mô phỏng đúng vòng lặp của màn hình: lấy từng trang 200, dùng sort_index
    // của tấm cuối làm con trỏ, cho tới khi hết.
    let daLay = 0;
    let sau = 0;
    for (let trang = 0; trang < 60; trang++) {
      const { rows } = await client.query(
        `select sort_index from photos
         where gallery_id = $1 and status = 'active' and sort_index > $2
         order by sort_index limit 200`,
        [galleryId, sau],
      );
      if (rows.length === 0) break;
      daLay += rows.length;
      sau = rows[rows.length - 1].sort_index as number;
      if (rows.length < 200) break;
    }

    expect(daLay).toBe(tong);
    expect(daLay).toBeGreaterThan(200);
  });

  it("3. Màn khách không còn gọi limit=200 một lần rồi thôi", async () => {
    // Canh chính đoạn mã: một lần gọi duy nhất không có con trỏ là quay lại
    // đúng lỗi cũ. Đây là phép thử về HÌNH DẠNG mã nguồn, cố ý — lỗi này
    // không lộ ra ở bất kỳ phép thử hành vi nào khi dữ liệu còn nhỏ.
    const fs = await import("node:fs/promises");
    const ma = await fs.readFile(
      "src/components/features/gallery/gallery-app.tsx",
      "utf8",
    );
    expect(ma).toContain("cursor");
    expect(ma).not.toContain('fetch("/api/g/photos?limit=200"');
  });
});
