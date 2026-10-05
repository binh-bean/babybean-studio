#!/usr/bin/env node
/**
 * kiem-fixture-sot — CHỈ ĐỌC. Đếm dữ liệu thử "Fixture ..." còn sót trong cơ sở dữ liệu.
 *
 * BB-367. Chạy sau mỗi tệp phép thử đã sửa: nếu phép thử dọn đúng thì mọi con số = 0.
 *
 *   npm run db:kiem-fixture
 *
 * Thoát mã 1 nếu còn bất kỳ dòng "Fixture" nào, hoặc (nghiêm trọng nhất) còn bộ ảnh
 * "Fixture" gắn vào khách KHÔNG phải "Fixture" — tức là ba mẹ thật có thể thấy bộ thử
 * trong trang gia đình. Số đó phải LUÔN = 0, kể cả khi đang chạy phép thử khác.
 *
 * Chú ý khi chạy lúc có phép thử khác đang chạy (agent khác, CI): dòng của họ cũng được
 * đếm. Chạy lại khi nhà đã yên.
 *
 * Không ghi gì, không in tên/SĐT khách. Chỉ in số và id rút gọn.
 */
import pg from "pg";

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Thiếu SUPABASE_DB_URL. Chạy: npm run db:kiem-fixture");
  process.exit(2);
}

const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 25_000 });
await client.connect();

const ngan = (id) => String(id).slice(0, 8);
let tong = 0;
let nghiemTrong = 0;

try {
  // Chỉ đọc, và ép bằng giao dịch READ ONLY để dù có lỗi mã cũng không ghi được.
  await client.query("begin read only");

  const dem = async (nhan, sql, chiTiet, tinhVaoTong = true) => {
    const { rows } = await client.query(sql);
    const n = rows[0].n;
    console.info(`${nhan.padEnd(46)} ${n}`);
    if (tinhVaoTong) tong += n;
    if (n > 0 && chiTiet) {
      const { rows: ct } = await client.query(chiTiet);
      for (const r of ct.slice(0, 8)) console.info(`     ${ngan(r.id)}…  ${r.ten}${r.them ? `  (${r.them})` : ""}`);
      if (ct.length > 8) console.info(`     … và ${ct.length - 8} dòng nữa`);
    }
    return n;
  };

  await dem(
    "Khách 'Fixture ...'",
    `select count(*)::int n from customers where full_name like 'Fixture %'`,
    `select id, full_name ten from customers where full_name like 'Fixture %' order by created_at`,
  );
  await dem(
    "Bộ ảnh 'Fixture ...'",
    `select count(*)::int n from galleries where title like 'Fixture %'`,
    `select id, title ten from galleries where title like 'Fixture %' order by created_at`,
  );
  await dem(
    "Sản phẩm 'Fixture...'",
    `select count(*)::int n from products where name like 'Fixture%'`,
    `select id, name ten, case when is_active then 'ĐANG BÁN' else 'đã tắt' end them
       from products where name like 'Fixture%' order by created_at`,
  );
  const dangBan = await dem(
    "  trong đó sản phẩm Fixture ĐANG BÁN",
    `select count(*)::int n from products where name like 'Fixture%' and is_active`,
    undefined,
    false,
  );
  nghiemTrong += dangBan; // đã nằm trong dòng "Sản phẩm" ở trên; chỉ nâng mức báo
  await dem(
    "Sản phẩm 'Mẫu kiểm thử ...' (hàng thử mua được)",
    `select count(*)::int n from products where name like 'Mẫu kiểm thử%'`,
    `select id, name ten, case when is_active then 'ĐANG BÁN' else 'đã tắt' end them
       from products where name like 'Mẫu kiểm thử%' order by created_at`,
  );
  await dem(
    "Nhân sự 'Fixture ...'",
    `select count(*)::int n from staff_profiles where full_name like 'Fixture %'`,
    `select id, full_name ten from staff_profiles where full_name like 'Fixture %' order by created_at`,
  );
  await dem(
    "Chi nhánh 'Fixture ...'",
    `select count(*)::int n from branches where name like 'Fixture %'`,
    `select id, name ten from branches where name like 'Fixture %' order by created_at`,
  );

  // Dòng con mồ côi do phép thử dựng: thông báo mang tên bộ Fixture.
  await dem(
    "Thông báo mang tên bộ 'Fixture ...'",
    `select count(*)::int n from notifications where payload->>'galleryTitle' like 'Fixture %'`,
  );

  // CHỐT NGHIÊM TRỌNG NHẤT: bộ Fixture gắn vào khách không phải Fixture.
  // Tên bộ thử: "Fixture ..." hiện hành, hoặc "Test BB<số>..." (quy ước cũ trước BB-350).
  const BO_THU = `(g.title like 'Fixture %' or g.title ~ '^Test BB[0-9]')`;
  const gan = await dem(
    "Bộ thử gắn vào khách KHÔNG phải Fixture",
    `select count(*)::int n
       from galleries g
       join customers cu on cu.id = g.customer_id
      where ${BO_THU} and cu.full_name not like 'Fixture %'`,
    `select g.id, g.title ten, 'khách ' || substr(cu.id::text, 1, 8) them
       from galleries g join customers cu on cu.id = g.customer_id
      where ${BO_THU} and cu.full_name not like 'Fixture %' order by g.created_at`,
    false,
  );
  nghiemTrong += gan;
  await dem(
    "Bộ 'Test BB<số>' (quy ước cũ)",
    `select count(*)::int n from galleries g where g.title ~ '^Test BB[0-9]'`,
    `select g.id, g.title ten from galleries g where g.title ~ '^Test BB[0-9]' order by g.created_at`,
  );

  await client.query("rollback");
} finally {
  await client.end();
}

console.info("");
if (nghiemTrong > 0) {
  console.error(`NGHIÊM TRỌNG: ${nghiemTrong} mục lọt tới khách thật / cửa hàng (bộ gắn khách thật hoặc sản phẩm đang bán).`);
}
if (tong > 0 || nghiemTrong > 0) {
  console.error(`Còn sót dữ liệu thử. Tổng ${tong} dòng thử, ${nghiemTrong} mục nghiêm trọng. Sửa phép thử nguồn; dọn bằng npm run db:cleanup.`);
  process.exit(1);
}
console.info("Sạch: không còn dữ liệu 'Fixture' nào.");
