import { Client } from "pg";
import * as gallerySession from "@/lib/auth/gallery-session";
import * as staffAuth from "@/lib/auth/staff";
import { GET as layAnh } from "@/app/api/img/[photoId]/route";

// Bộ ảnh thật 99 ảnh
const GALLERY_ID = "3179adbc-70b5-4e50-9104-4b9552c680be";

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await client.connect();

  // 1. Kiểm tra bộ ảnh và lấy danh sách ảnh active
  const { rows: galleries } = await client.query(
    "select id, title, customer_id, photo_count from galleries where id = $1",
    [GALLERY_ID]
  );
  if (galleries.length === 0) {
    console.error("Không tìm thấy gallery:", GALLERY_ID);
    process.exit(1);
  }
  const gallery = galleries[0];
  console.log(`Bộ ảnh: "${gallery.title}" (${gallery.id})`);

  const { rows: photos } = await client.query(
    "select id, file_name, drive_file_id from photos where gallery_id = $1 and status = 'active' order by sort_index asc",
    [GALLERY_ID]
  );
  console.log(`Số ảnh active: ${photos.length} tấm`);

  // 2. Tìm hoặc tạo share_link cho bộ ảnh
  let { rows: links } = await client.query(
    "select id from share_links where gallery_id = $1 and status = 'active' limit 1",
    [GALLERY_ID]
  );
  let shareLinkId = links[0]?.id;
  let createdLink = false;
  if (!shareLinkId) {
    const res = await client.query(
      `insert into share_links (gallery_id, token_hash, token_prefix, role, requires_pin, status)
       values ($1, 'dummy_hash_for_measure', 'measur', 'owner', false, 'active')
       returning id`,
      [GALLERY_ID]
    );
    shareLinkId = res.rows[0].id;
    createdLink = true;
    console.log("Đã tạo share_link tạm thời:", shareLinkId);
  }

  // 3. Chuẩn bị session khách
  const sessionData = {
    galleryId: gallery.id,
    customerId: gallery.customer_id,
    role: "owner" as const,
    shareLinkId,
    selectionId: "00000000-0000-0000-0000-000000000000",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  // Giả lập phiên khách
  // @ts-expect-error mock
  staffAuth.requireStaff = async () => {
    throw new staffAuth.AuthError("UNAUTHENTICATED");
  };
  // @ts-expect-error mock
  gallerySession.requireGallerySession = async () => sessionData;

  // 4. Intercept console.info để đếm chính xác số lần logDriveCall ("evt": "drive_call")
  let driveCallCount = 0;
  const originalInfo = console.info;
  console.info = (...args: any[]) => {
    const str = typeof args[0] === "string" ? args[0] : JSON.stringify(args[0]);
    if (str.includes('"evt":"drive_call"')) {
      driveCallCount++;
    }
  };

  // Hàm giả lập khách cuộn hết bộ ảnh (mỗi ảnh tải thumbnail w=400)
  async function cuonHetBoAnh(lan: number) {
    driveCallCount = 0;
    const startTime = Date.now();
    let successCount = 0;
    let failCount = 0;

    console.log(`\n--- Bắt đầu cuộn lần ${lan} (${photos.length} ảnh) ---`);
    
    // Khách cuộn với độ đồng thời 5 ảnh
    const concurrency = 5;
    for (let i = 0; i < photos.length; i += concurrency) {
      const batch = photos.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (p) => {
          const req = new Request(`http://localhost/api/img/${p.id}?w=400`);
          const res = await layAnh(req, { params: Promise.resolve({ photoId: p.id }) });
          if (res.status === 200) {
            successCount++;
          } else {
            failCount++;
            console.error(`Lỗi tải ảnh ${p.id} (${p.file_name}): status ${res.status}`);
          }
        })
      );
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Kết quả lần ${lan}:`);
    console.log(`  - Thời gian: ${elapsed}s`);
    console.log(`  - Thành công: ${successCount}/${photos.length}`);
    console.log(`  - Lỗi: ${failCount}`);
    console.log(`  - Số lượt gọi sang Google Drive: ${driveCallCount}`);
    return { successCount, failCount, driveCallCount, elapsed };
  }

  // Đo lần 1: Lần đầu khách mở và cuộn hết
  const run1 = await cuonHetBoAnh(1);

  // Đo lần 2: Khách cuộn lại hoặc người nhà mở lại cùng bộ ảnh
  const run2 = await cuonHetBoAnh(2);

  // Dọn dẹp link tạm nếu có tạo
  if (createdLink) {
    await client.query("delete from share_links where id = $1", [shareLinkId]);
    console.log("\nĐã dọn dẹp share_link tạm thời.");
  }
  await client.end();
  console.info = originalInfo;

  console.log("\n=== TỔNG KẾT ĐO ĐẠC TRƯỚC KHI SỬA (BASELINE) ===");
  console.log(`Bộ ảnh: ${gallery.title} (${photos.length} ảnh)`);
  console.log(`Lần 1 (lần đầu cuộn hết): ${run1.driveCallCount} lượt gọi Google Drive (${run1.elapsed}s)`);
  console.log(`Lần 2 (cuộn lại lần hai): ${run2.driveCallCount} lượt gọi Google Drive (${run2.elapsed}s)`);
}

main().catch((err) => {
  console.error("Lỗi:", err);
  process.exit(1);
});
