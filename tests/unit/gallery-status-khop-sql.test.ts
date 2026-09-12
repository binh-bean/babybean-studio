/**
 * Danh sách trạng thái khoá bên TypeScript phải khớp bên SQL.
 *
 * BB-121 thêm hai trạng thái `awaiting_approval` và `approved`. SQL được sửa
 * (`app.gallery_is_locked`, migration 0033), còn BA chỗ TypeScript thì không:
 * màn khách, màn CSKH, route ảnh của khách. Hậu quả không phải lỗi đỏ mà là
 * màn hình hiện nút sửa, khách bấm vào, API trả GALLERY_LOCKED — và nhân viên
 * tưởng hệ thống hỏng.
 *
 * Phép thử này không đọc một danh sách chép tay. Nó lấy TOÀN BỘ giá trị của
 * kiểu enum trong cơ sở dữ liệu rồi hỏi cả hai bên về từng giá trị. Thêm trạng
 * thái mới mà quên một bên thì phép thử đỏ ngay, kể cả khi trạng thái đó chưa
 * có dòng dữ liệu nào.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import {
  isGalleryLocked,
  GALLERY_STATUSES,
  GALLERY_STATUS_LABEL,
} from "@/lib/gallery-status";

describe("Trạng thái bộ ảnh: TypeScript khớp SQL", () => {
  let client: Client;
  let statuses: string[];

  beforeAll(async () => {
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows } = await client.query(
      `select unnest(enum_range(null::gallery_status))::text as s`,
    );
    statuses = rows.map((r) => r.s as string);
  });

  afterAll(async () => {
    await client.end();
  });

  it("1. Kiểm chứng ngược: phép thử này đọc được enum thật", () => {
    // Nếu truy vấn trên trả rỗng thì mọi phép thử dưới đây đều xanh một cách
    // vô nghĩa — vòng lặp không chạy lần nào.
    expect(statuses.length).toBeGreaterThan(5);
    expect(statuses).toContain("awaiting_approval");
    expect(statuses).toContain("approved");
  });

  it("2. Mỗi trạng thái: hai bên trả lời giống nhau", async () => {
    const lech: string[] = [];

    for (const s of statuses) {
      const { rows } = await client.query("select app.gallery_is_locked($1) as locked", [s]);
      const sql = rows[0].locked as boolean;
      const ts = isGalleryLocked(s);
      if (sql !== ts) lech.push(`${s}: SQL=${sql} TypeScript=${ts}`);
    }

    expect(lech).toEqual([]);
  });

  it("3. Danh sách bên TypeScript đúng bằng enum trong cơ sở dữ liệu", () => {
    // Không chỉ "không thiếu" mà còn "không thừa". Một giá trị thừa nghĩa là
    // có chỗ trong mã nguồn đang chờ một trạng thái không tồn tại — đúng
    // chuyện đã xảy ra với 'reopened': dải tiến trình có nhánh xử lý nó, mà
    // enum thì chưa bao giờ có giá trị đó.
    expect([...GALLERY_STATUSES].sort()).toEqual([...statuses].sort());
  });

  it("4. Mỗi trạng thái có nhãn tiếng Việt", () => {
    // Thiếu nhãn thì màn hình in tên trong máy ra cho nhân viên đọc.
    const thieu = statuses.filter((s) => !GALLERY_STATUS_LABEL[s]);
    expect(thieu).toEqual([]);
  });
});
