import { Client } from "pg";

/**
 * Khoá tư vấn Postgres cho các phép thử đọc–ghi–trả lại một dòng `settings`
 * TOÀN CỤC (branch_id is null).
 *
 * OWNER: QA-BOT. Việc BB-266.
 *
 * `settings` là một bảng cấu hình DÙNG CHUNG của cả studio trên bb-dev — không
 * phải bản giả lập riêng cho từng phép thử. Nhiều agent chạy `npx vitest`
 * song song (mỗi agent một worktree, xem AGENTS.md §4 "Chạy nhiều agent song
 * song") thì hai lượt cùng đọc-đổi-trả một khoá cài đặt sẽ giẫm lên nhau:
 * lượt A đọc giá trị gốc, lượt B đổi giá trị, lượt A ghi đè giá trị của B rồi
 * trả lại giá trị gốc SAI thời điểm — hoặc tệ hơn, hai bên cùng kiểm tra giữa
 * chừng lúc giá trị đang là của người kia (đúng bệnh "expected 11 to be 7" đo
 * được 26/09/2026 khi bb-068-han-chot-that.test.ts chạy song song).
 *
 * `fileParallelism: false` trong vitest.config.ts chỉ ngăn các tệp giẫm lên
 * nhau TRONG MỘT tiến trình vitest — không giúp gì giữa hai tiến trình vitest
 * riêng biệt của hai agent. Khoá tư vấn Postgres thì có: nó chờ ở tầng cơ sở
 * dữ liệu, xuyên qua mọi tiến trình.
 *
 * Cách dùng — mở khoá ngay đầu `beforeAll`, đóng khoá ở cuối `afterAll` (sau
 * khi đã trả cài đặt về giá trị gốc):
 *
 * ```ts
 * let khoa: KhoaCaiDat;
 * beforeAll(async () => {
 *   khoa = await khoaCaiDat("gallery.default_due_days");
 *   // ...đọc giá trị gốc, dựng fixture...
 * });
 * afterAll(async () => {
 *   // ...trả cài đặt về giá trị gốc, dọn fixture...
 *   await moKhoaCaiDat(khoa);
 * });
 * ```
 *
 * Khoá theo TÊN khoá cài đặt (băm ra một số nguyên), không theo tên tệp: hai
 * tệp khác nhau cùng đụng `gallery.default_due_days` (BB-068, BB-197) phải
 * chờ nhau; hai tệp đụng hai khoá cài đặt KHÁC nhau thì chạy song song bình
 * thường, không cần chờ.
 *
 * Dải số băm ra cố tình lệch khỏi `LOCK_ID = 152111` mà
 * `tests/unit/api-lark-hook.test.ts` dùng để kiểm khoá xử lý webhook Lark của
 * chính ứng dụng (đó là khoá THẬT của app, không phải khoá riêng cho phép
 * thử) — hai việc khác nhau không nên vô tình dùng chung một số.
 */
export interface KhoaCaiDat {
  readonly client: Client;
  readonly id: number;
  readonly ten: string;
}

function bamThanhSoKhoa(ten: string): number {
  let h = 5381;
  for (let i = 0; i < ten.length; i++) {
    h = (h * 33 + ten.charCodeAt(i)) | 0;
  }
  // Dồn về một dải số dương riêng cho phép thử (900,000,000 - 900,999,999),
  // tách khỏi mọi khoá tư vấn khác mà mã ứng dụng có thể đang dùng.
  return 900_000_000 + (Math.abs(h) % 1_000_000);
}

/** Mở khoá cho một khoá cài đặt — chặn tiến trình khác cùng đụng khoá này. */
export async function khoaCaiDat(tenKhoaCaiDat: string): Promise<KhoaCaiDat> {
  const id = bamThanhSoKhoa(tenKhoaCaiDat);
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();
  await client.query("select pg_advisory_lock($1)", [id]);
  return { client, id, ten: tenKhoaCaiDat };
}

/** Đóng khoá đã mở bằng `khoaCaiDat` — luôn gọi trong `afterAll`, kể cả khi test đã đỏ. */
export async function moKhoaCaiDat(khoa: KhoaCaiDat): Promise<void> {
  await khoa.client.query("select pg_advisory_unlock($1)", [khoa.id]).catch(() => {});
  await khoa.client.end();
}
