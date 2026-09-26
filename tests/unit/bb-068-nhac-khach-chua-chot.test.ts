/**
 * BB-068 — nhắc bộ ảnh khách chưa chốt.
 *
 * `gallery.reminder_days` nằm trong màn Cài đặt từ BB-197 mà **không mã nào
 * đọc tới**: chủ studio gõ "3, 6" vào đó và không có gì xảy ra. Đây là phép
 * thử canh cho nửa sau của BB-068.
 *
 * Ba điều phải đúng, vì nếu sai thì hỏng theo ba kiểu khác nhau:
 *
 *   1. **Đúng mốc mới nhắc.** Nhắc sai ngày thì nhân viên mất lòng tin vào tin
 *      nhắn, và từ đó không ai đọc nữa.
 *   2. **Mỗi bộ mỗi mốc đúng một tin.** Lượt chạy hằng ngày không chống trùng
 *      thì một bộ nằm ở ngày thứ 3 bị nhắc lại mỗi ngày.
 *   3. **Không nhắc bộ khách đã chốt.** Gọi hỏi "chị chọn ảnh giúp em" sau khi
 *      khách đã chọn xong là kiểu điện thoại làm khách khó chịu nhất.
 *
 * Trong phép thử, `enqueueLarkNotification` dừng ở `dangChayPhepThu()` nên
 * KHÔNG có tin nào bay sang nhóm Lark thật — nhưng dòng trong `notifications`
 * vẫn được ghi, và đó chính là thứ đối chiếu ở đây.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { khoaCaiDat, moKhoaCaiDat, type KhoaCaiDat } from "../helpers/khoa-cai-dat";

vi.mock("server-only", () => ({}));

// Số giả MỚI mỗi lượt: số cố định '0900000068' va `uq_customers_phone_branch`
// khi một lượt trước bị ngắt giữa chừng để sót dòng, hoặc hai worktree chạy
// cùng lúc (25/09/2026, gặp hai lần trong một ngày).
const SDT_GIA = "0900" + String(Math.floor(Math.random() * 1e6)).padStart(6, "0");

import { quetNhacKhachChuaChot } from "@/lib/gallery/nhac-khach";
import { dungThe } from "@/lib/lark/notify";

describe("BB-068: nhắc khách chưa chốt", () => {
  let client: Client;
  let branchId: string;
  let customerId: string;
  const galleries: string[] = [];
  let mocGoc: unknown = null;
  /**
   * Khoá riêng cho khoá cài đặt `gallery.reminder_days` — chặn hai agent chạy
   * song song ghi đè lẫn nhau lên cùng một dòng `settings` toàn cục. Xem
   * tests/helpers/khoa-cai-dat.ts.
   */
  let khoa: KhoaCaiDat;

  /*
    Lùi thêm HAI GIỜ, đừng dựng đúng mốc chẵn.

    `soNgayDaQua` làm tròn xuống, và `now()` ở đây là đồng hồ của máy chủ cơ sở
    dữ liệu còn `Date.now()` trong lượt quét là đồng hồ máy chạy phép thử. Đo
    ngày 22/09/2026: máy chủ chạy TRƯỚC 349ms. Chỉ chừng ấy thôi là bộ ảnh
    "gửi 6 ngày trước" thành 5,99999 ngày, làm tròn xuống còn 5, và cả phép thử
    đỏ lên vì một thứ không liên quan gì tới điều nó canh.

    Hai giờ đệm giữ nguyên ý nghĩa của ca thử (vẫn là ngày thứ N) mà không còn
    phụ thuộc vào việc hai đồng hồ lệch nhau bên nào.
  */
  async function taoBoAnh(opts: {
    daGuiCachDay: number | null;
    status?: string;
    daChot?: boolean;
  }) {
    const { rows } = await client.query(
      `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                              drive_folder_url, photo_count, sent_at, due_at, submitted_at)
       values ($1,$2,'Fixture BB-068 nhắc',$3,$4,'https://example.com/x',12,
               case when $5::int is null then null
                    else now() - ($5::int || ' days')::interval - interval '2 hours' end,
               now() + interval '4 days',
               case when $6::boolean then now() else null end)
       returning id`,
      [
        branchId,
        customerId,
        opts.status ?? "ready",
        `fixture-bb068n-${Date.now()}-${Math.random()}`,
        opts.daGuiCachDay,
        opts.daChot ?? false,
      ],
    );
    galleries.push(rows[0].id);
    return rows[0].id as string;
  }

  const demTin = async (galleryId: string) => {
    const { rows } = await client.query(
      `select count(*)::int n from notifications
        where template = 'gallery.due_soon' and payload->>'galleryId' = $1`,
      [galleryId],
    );
    return rows[0].n as number;
  };

  async function datMocNhac(moc: number[] | null) {
    await client.query(
      `update settings set value = $1::jsonb where key='gallery.reminder_days' and branch_id is null`,
      [JSON.stringify(moc ?? [])],
    );
  }

  beforeAll(async () => {
    khoa = await khoaCaiDat("gallery.reminder_days");
    client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    const { rows: br } = await client.query("select id from branches order by name limit 1");
    branchId = br[0].id;
    const { rows: c } = await client.query(
      `insert into customers (branch_id, full_name, phone)
       values ($1,'Fixture BB-068 Nhắc',$2) returning id`,
      [branchId, SDT_GIA],
    );
    customerId = c[0].id;

    const { rows: cd } = await client.query(
      `select value from settings where key='gallery.reminder_days' and branch_id is null`,
    );
    mocGoc = cd[0]?.value ?? null;
  });

  afterAll(async () => {
    if (mocGoc !== null) {
      await client.query(
        `update settings set value = $1::jsonb where key='gallery.reminder_days' and branch_id is null`,
        [JSON.stringify(mocGoc)],
      );
    }
    if (galleries.length) {
      await client.query(
        `delete from notifications where payload->>'galleryId' = any($1)`,
        [galleries],
      );
      await client.query("delete from galleries where id = any($1)", [galleries]);
    }
    await client.query("delete from customers where id = $1", [customerId]);
    await client.end();
    await moKhoaCaiDat(khoa);
  });

  it("1. Chỉ nhắc bộ ảnh rơi đúng mốc, không nhắc bộ ngày khác", async () => {
    await datMocNhac([3, 6]);
    const dungMoc = await taoBoAnh({ daGuiCachDay: 3 });
    const saiMoc = await taoBoAnh({ daGuiCachDay: 4 });
    const chuaGui = await taoBoAnh({ daGuiCachDay: null });

    const kq = await quetNhacKhachChuaChot();
    expect(kq.daNhac).toBeGreaterThanOrEqual(1);

    expect(await demTin(dungMoc)).toBe(1);
    expect(await demTin(saiMoc)).toBe(0);
    expect(await demTin(chuaGui)).toBe(0);
  });

  it("2. Chạy lại ngay sau đó KHÔNG nhắc lại bộ đã nhắc", async () => {
    await datMocNhac([6]);
    const id = await taoBoAnh({ daGuiCachDay: 6 });

    await quetNhacKhachChuaChot();
    expect(await demTin(id)).toBe(1);

    const lan2 = await quetNhacKhachChuaChot();
    expect(await demTin(id)).toBe(1);
    expect(lan2.boQuaVeTrung).toBeGreaterThanOrEqual(1);
  });

  it("3. Khách đã chốt thì không nhắc", async () => {
    await datMocNhac([3]);
    const id = await taoBoAnh({ daGuiCachDay: 3, daChot: true, status: "submitted" });

    await quetNhacKhachChuaChot();
    expect(await demTin(id)).toBe(0);
  });

  /**
   * Hai chốt che cho nhau, nên mỗi chốt cần một ca riêng.
   *
   * Kiểm ngược 22/09/2026: gỡ RIÊNG bộ lọc `submitted_at is null` thì ca 3 vẫn
   * XANH (bộ ảnh ở trạng thái 'submitted' đã bị bộ lọc trạng thái loại), và gỡ
   * riêng bộ lọc trạng thái cũng vậy. Ca này dựng đúng thế kẹt giữa hai chốt:
   * bộ ảnh còn 'ready' nhưng khách vừa bấm chốt xong — thứ xảy ra khi lượt quét
   * chạy đúng lúc khách đang chốt. Chỉ `submitted_at` bắt được ca này.
   */
  it("3b. Khách vừa chốt mà trạng thái chưa kịp đổi thì cũng không nhắc", async () => {
    await datMocNhac([3]);
    const id = await taoBoAnh({ daGuiCachDay: 3, daChot: true, status: "ready" });

    await quetNhacKhachChuaChot();
    expect(await demTin(id)).toBe(0);
  });

  it("4. Để trống mốc nhắc là TẮT HẲN, không phải lấy mặc định", async () => {
    await datMocNhac([]);
    const id = await taoBoAnh({ daGuiCachDay: 3 });

    const kq = await quetNhacKhachChuaChot();
    expect(kq.ungVien).toBe(0);
    expect(await demTin(id)).toBe(0);
  });

  it("5. Có mẫu thẻ cho gallery.due_soon — thiếu mẫu là tin bị bỏ im lặng", () => {
    // `enqueueLarkNotification` đánh dấu `skipped` khi `dungThe` trả null. Nên
    // quên mẫu thẻ nghĩa là hàng đợi đầy dòng skipped mà không ai nhận tin,
    // và không có gì báo đỏ.
    const the = dungThe(
      "gallery.due_soon",
      { galleryTitle: "Bé Bean", ngayThu: 3, conLaiNgay: 4, customerPhone: "090***0068" },
      "https://app.example.com/admin/galleries/x",
    );
    expect(the).not.toBeNull();
    expect(JSON.stringify(the)).toContain("Khách chưa chốt ảnh");
  });

  it("6. Số điện thoại trong tin phải che giữa", async () => {
    await datMocNhac([3]);
    const id = await taoBoAnh({ daGuiCachDay: 3 });
    await quetNhacKhachChuaChot();

    const { rows } = await client.query(
      `select payload->>'customerPhone' sdt from notifications
        where template='gallery.due_soon' and payload->>'galleryId' = $1`,
      [id],
    );
    expect(rows[0].sdt).toBe(`090***${SDT_GIA.slice(-4)}`);
    expect(rows[0].sdt).not.toContain(SDT_GIA);
  });
});
