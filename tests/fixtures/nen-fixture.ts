// BB-367 — nền dữ liệu thử RIÊNG (chi nhánh + khách "Fixture ...") và dọn THEO ID, không nuốt lỗi.
//
// Vì sao có tệp này: ngày 05/10/2026 `npm run db:cleanup` quét ra 7 khách "Fixture", 14 bộ ảnh,
// 9 nhân sự thử, 157 thông báo và 3 sản phẩm thử ĐANG BÁN trên bb-dev. Nghiêm trọng nhất là các
// phép thử gắn bộ ảnh "Fixture ..." vào một KHÁCH THẬT lấy bằng `select ... limit 1` rồi không
// xoá — ba mẹ thật mở trang gia đình là thấy.
//
// Luật (phép thử nào ghi vào bb-dev cũng theo):
//   1. TỰ TẠO khách + chi nhánh "Fixture ..." riêng. Không bao giờ lấy khách/bộ/chi nhánh có sẵn
//      để GẮN dữ liệu thử vào (đọc để mượn id nhân sự giả lập quyền thì được, nhưng chi nhánh
//      và khách của dòng thử phải là của Fixture).
//   2. Dọn theo ID trong `afterAll`, trong try/finally của chính phép thử. Bảng con trước
//      (thông báo, nhật ký, đợt chọn, link...), bộ ảnh → khách → nhân sự → chi nhánh sau cùng.
//   3. Mỗi bước xoá được gom lỗi; chạy hết rồi mới ném. Xoá xong ĐỌC LẠI — "không có lỗi" chưa
//      phải "đã xoá". Lỗi dọn làm phép thử ĐỎ.
//   4. Sản phẩm thử tạo `is_active = false` trừ khi phép thử BUỘC phải mua qua API (khi đó dùng
//      tên "Mẫu kiểm thử ..." theo quy ước BB-352 và vẫn xoá theo id).
import type { Client } from "pg";
import { randomBytes } from "node:crypto";

export interface NenFixture {
  runId: string;
  branchId: string;
  customerId: string;
  /** Tên khách đã đặt, để phép thử đối chiếu nếu cần. */
  tenKhach: string;
}

/**
 * Dựng một chi nhánh và một khách "Fixture ..." riêng cho phép thử.
 *
 * @param nhan mã gọn của phép thử, vd "BB-188". Tên khách = `Fixture <nhan> Khách <runId>`
 *             trừ khi truyền `tenKhach` (phải bắt đầu bằng "Fixture ").
 */
export async function dungNenFixture(
  client: Client,
  nhan: string,
  opts: { tenKhach?: string } = {},
): Promise<NenFixture> {
  const runId = randomBytes(4).toString("hex");
  const tenKhach = opts.tenKhach ?? `Fixture ${nhan} Khách ${runId}`;
  if (!tenKhach.startsWith("Fixture ")) throw new Error(`Tên khách thử phải bắt đầu "Fixture ": ${tenKhach}`);

  // Mã chi nhánh: chữ + số, khớp quy ước FX... mà laChiNhanhCongKhai() loại khỏi trang công khai.
  const ma = `FX${nhan.replace(/[^A-Za-z0-9]/g, "")}-${runId}`;
  const { rows: br } = await client.query(`insert into branches (code, name) values ($1,$2) returning id`, [
    ma,
    `Fixture ${nhan} ${runId} Chi nhánh`,
  ]);
  const branchId = br[0].id as string;
  try {
    const { rows: c } = await client.query(`insert into customers (branch_id, full_name) values ($1,$2) returning id`, [
      branchId,
      tenKhach,
    ]);
    return { runId, branchId, customerId: c[0].id as string, tenKhach };
  } catch (e) {
    await client.query(`delete from branches where id = $1`, [branchId]).catch(() => {});
    throw e;
  }
}

export interface DauVaoDonNen {
  galleryIds?: Array<string | null | undefined>;
  customerIds?: Array<string | null | undefined>;
  branchIds?: Array<string | null | undefined>;
  productIds?: Array<string | null | undefined>;
  /** Nhân sự thử: xoá hồ sơ + tài khoản đăng nhập (auth.users). */
  staffIds?: Array<string | null | undefined>;
}

const co = (v: Array<string | null | undefined> | undefined): string[] => (v ?? []).filter((x): x is string => !!x);

/**
 * Dọn đúng những id phép thử tự tạo. Khách/chi nhánh được dọn KÈM mọi bộ ảnh nằm dưới chúng
 * (bộ do route của phép thử tạo ra cũng thuộc về nền Fixture này), nhưng không bao giờ chạm
 * khách/chi nhánh không có trong danh sách.
 */
export async function donNenFixture(client: Client, v: DauVaoDonNen): Promise<void> {
  const loi: string[] = [];
  const chay = async (nhan: string, sql: string, tham: unknown[]) => {
    try {
      await client.query(sql, tham);
    } catch (e) {
      loi.push(`${nhan}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  let cIds = co(v.customerIds);
  const bIds = co(v.branchIds);
  const pIds = co(v.productIds);
  const sIds = co(v.staffIds);
  let gIds = co(v.galleryIds);

  // Khách nằm trong chi nhánh Fixture của chính phép thử (kể cả khách dựng dở khi phép thử hỏng).
  try {
    if (bIds.length) {
      const { rows } = await client.query(`select id from customers where branch_id = any($1::uuid[])`, [bIds]);
      cIds = [...new Set([...cIds, ...rows.map((r: { id: string }) => r.id)])];
    }
  } catch (e) {
    loi.push(`liệt kê khách: ${e instanceof Error ? e.message : String(e)}`);
  }

  // Bộ ảnh nằm dưới khách/chi nhánh của chính phép thử (route có thể tự tạo thêm).
  try {
    if (cIds.length || bIds.length) {
      const { rows } = await client.query(
        `select id from galleries where customer_id = any($1::uuid[]) or branch_id = any($2::uuid[])`,
        [cIds, bIds],
      );
      gIds = [...new Set([...gIds, ...rows.map((r: { id: string }) => r.id)])];
    }
  } catch (e) {
    loi.push(`liệt kê bộ ảnh: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 1. Bảng con KHÔNG có khoá ngoại cascade (hoặc chỉ setnull) tới bộ ảnh.
  if (gIds.length) {
    await chay("thông báo theo bộ", `delete from notifications where payload->>'galleryId' = any($1::text[])`, [gIds]);
    await chay("nhật ký theo bộ", `delete from activity_logs where gallery_id = any($1::uuid[]) or entity_id = any($1::uuid[])`, [gIds]);
  }
  if (cIds.length) {
    await chay("nhật ký theo khách", `delete from activity_logs where entity_id = any($1::uuid[])`, [cIds]);
  }
  if (bIds.length) {
    await chay("thông báo theo chi nhánh", `delete from notifications where branch_id = any($1::uuid[])`, [bIds]);
    await chay("nhật ký theo chi nhánh", `delete from activity_logs where branch_id = any($1::uuid[])`, [bIds]);
  }
  if (sIds.length) {
    await chay("nhật ký theo nhân sự", `delete from activity_logs where actor_id = any($1::uuid[])`, [sIds]);
  }
  if (cIds.length || bIds.length) {
    await chay("buổi chụp", `delete from shoots where customer_id = any($1::uuid[]) or branch_id = any($2::uuid[])`, [cIds, bIds]);
  }

  // 2. Bộ ảnh (kéo theo ảnh, link, lượt chọn, dòng hàng, đợt chọn ... qua cascade).
  if (gIds.length) await chay("bộ ảnh", `delete from galleries where id = any($1::uuid[])`, [gIds]);
  // 3. Sản phẩm (sau bộ ảnh vì gallery_items/selection_addons giữ khoá ngoại không cascade).
  if (pIds.length) await chay("sản phẩm", `delete from products where id = any($1::uuid[])`, [pIds]);
  // 4. Khách.
  if (cIds.length) await chay("khách", `delete from customers where id = any($1::uuid[])`, [cIds]);
  // 5. Nhân sự + tài khoản đăng nhập.
  if (sIds.length) {
    await chay("nhân sự", `delete from staff_profiles where id = any($1::uuid[])`, [sIds]);
    await chay("tài khoản đăng nhập", `delete from auth.users where id = any($1::uuid[])`, [sIds]);
  }
  // 6. Chi nhánh sau cùng (còn dòng nào trỏ vào là xoá hỏng — và phải đỏ).
  if (bIds.length) {
    await chay("cài đặt chi nhánh", `delete from settings where branch_id = any($1::uuid[])`, [bIds]);
    await chay("gói chụp chi nhánh", `delete from packages where branch_id = any($1::uuid[])`, [bIds]);
    await chay("chi nhánh", `delete from branches where id = any($1::uuid[])`, [bIds]);
  }

  // 7. Đọc lại: còn id nào là ném.
  const conLai = async (bang: string, ids: string[]) => {
    if (!ids.length) return;
    try {
      const { rows } = await client.query(`select count(*)::int n from ${bang} where id = any($1::uuid[])`, [ids]);
      if (rows[0].n > 0) loi.push(`${bang} còn ${rows[0].n}/${ids.length} dòng sau khi xoá`);
    } catch (e) {
      loi.push(`đọc lại ${bang}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  await conLai("galleries", gIds);
  await conLai("products", pIds);
  await conLai("customers", cIds);
  await conLai("staff_profiles", sIds);
  await conLai("auth.users", sIds);
  await conLai("branches", bIds);

  if (loi.length) {
    throw new Error(`Dọn fixture THẤT BẠI — dữ liệu thử còn nằm lại trong cơ sở dữ liệu: ${loi.join(" | ")}`);
  }
}
