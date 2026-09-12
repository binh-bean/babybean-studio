import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { randomUUID } from "node:crypto";

describe("BB-106: Báo cáo thất thoát (v_over_quota_unbilled & v_over_quota_summary)", () => {
  let client: Client;

  let branchAId: string;
  let branchBId: string;
  let customerId: string;
  let prodEditFileId: string;
  let prodMakeupId: string;

  let staffOwnerId: string;
  let staffManagerAId: string;
  let staffCtvId: string;

  const createdGalleryIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdStaffIds: string[] = [];

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
    });
    await client.connect();

    // 1. Chi nhánh
    const { rows: branches } = await client.query("SELECT id FROM branches ORDER BY name LIMIT 2");
    if (branches.length < 2) throw new Error("Cần ít nhất 2 chi nhánh trong DB");
    branchAId = branches[0].id;
    branchBId = branches[1].id;

    // 2. Khách hàng
    const { rows: custs } = await client.query("SELECT id FROM customers LIMIT 1");
    if (custs.length === 0) throw new Error("Cần ít nhất 1 khách hàng trong DB");
    customerId = custs[0].id;

    // 3. Sản phẩm
    prodEditFileId = randomUUID();
    prodMakeupId = randomUUID();
    createdProductIds.push(prodEditFileId, prodMakeupId);

    await client.query(`
      INSERT INTO products (id, name, kind, list_price)
      VALUES 
        ($1, 'Fixture Edit file', 'edited_photo', 50000),
        ($2, 'Fixture Makeup Test', 'service', 300000)
    `, [prodEditFileId, prodMakeupId]);

    // 4. Tạo nhân viên mẫu cho các vai trò
    async function createStaffUser(role: string, branchId?: string): Promise<string> {
      const uid = randomUUID();
      createdStaffIds.push(uid);

      await client.query(`
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
        VALUES ($1::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
                'fixture.' || $1::text || '@babybeanstudio.vn', '', now(), now(), now())
      `, [uid]);

      await client.query(`
        INSERT INTO staff_profiles (id, full_name, email, role, is_active)
        VALUES ($1::uuid, 'Fixture ' || $2::text, 'fixture.' || $1::text || '@babybeanstudio.vn', $2::staff_role, true)
      `, [uid, role]);

      if (branchId) {
        await client.query(`
          INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1, $2)
        `, [uid, branchId]);
      }
      return uid;
    }

    staffOwnerId = await createStaffUser("owner");
    staffManagerAId = await createStaffUser("branch_manager", branchAId);
    staffCtvId = await createStaffUser("photoshop_ctv", branchAId);
  });

  afterAll(async () => {
    // Dọn dẹp galleries và các bảng liên quan
    if (createdGalleryIds.length > 0) {
      await client.query("DELETE FROM galleries WHERE id = ANY($1)", [createdGalleryIds]);
    }
    if (createdProductIds.length > 0) {
      await client.query("DELETE FROM products WHERE id = ANY($1)", [createdProductIds]);
    }
    if (createdStaffIds.length > 0) {
      await client.query("DELETE FROM staff_branches WHERE staff_id = ANY($1)", [createdStaffIds]);
      await client.query("DELETE FROM staff_profiles WHERE id = ANY($1)", [createdStaffIds]);
      await client.query("DELETE FROM auth.users WHERE id = ANY($1)", [createdStaffIds]);
    }
    await client.end();
  });

  async function createGalleryWithSelection(options: {
    branchId: string;
    title: string;
    includedQuota: number;
    extraPhotoPrice: number;
    selectedPhotos: number;
    favoritePhotosOnly?: number;
    addonsCount?: number;
    hasItemsWithNoQuota?: boolean;
    editorId?: string;
  }): Promise<string> {
    const gid = randomUUID();
    createdGalleryIds.push(gid);

    await client.query(`
      INSERT INTO galleries (id, branch_id, customer_id, title, status, drive_folder_id, drive_folder_url, included_quota, extra_photo_price, editor_id)
      VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'in_review', 'fixture-' || $1::text, 'https://drive.google.com/test', $5, $6, $7)
    `, [gid, options.branchId, customerId, options.title, options.includedQuota, options.extraPhotoPrice, options.editorId || null]);

    if (options.hasItemsWithNoQuota) {
      // Có gallery_items nhưng không có dòng nào là edited_photo -> app.gallery_quota trả về NULL
      await client.query(`
        INSERT INTO gallery_items (gallery_id, product_id, quantity)
        VALUES ($1, $2, 1)
      `, [gid, prodMakeupId]);
    }

    // Tạo share_link và primary selection
    const linkId = randomUUID();
    await client.query(`
      INSERT INTO share_links (id, gallery_id, token_hash, token_prefix, role, status)
      VALUES ($1::uuid, $2::uuid, 'hash-' || $1::text, 'prefix', 'owner', 'active')
    `, [linkId, gid]);

    const selId = randomUUID();
    await client.query(`
      INSERT INTO selections (id, gallery_id, share_link_id, is_primary)
      VALUES ($1, $2, $3, true)
    `, [selId, gid, linkId]);

    // Tạo photos & selection_items
    const totalPhotos = options.selectedPhotos + (options.favoritePhotosOnly || 0);
    for (let i = 0; i < totalPhotos; i++) {
      const pid = randomUUID();
      await client.query(`
        INSERT INTO photos (id, gallery_id, drive_file_id, file_name, mime_type)
        VALUES ($1::uuid, $2::uuid, 'drive-' || $1::text, 'photo_' || $3::text || '.jpg', 'image/jpeg')
      `, [pid, gid, i]);

      const isSelected = i < options.selectedPhotos;
      await client.query(`
        INSERT INTO selection_items (selection_id, photo_id, gallery_id, mark, is_favorite)
        VALUES ($1, $2, $3, $4, $5)
      `, [
        selId,
        pid,
        gid,
        isSelected ? "selected" : "favorite",
        isSelected ? false : true, // nếu không selected thì là favorite-only
      ]);
    }

    // Addons nếu có
    if (options.addonsCount && options.addonsCount > 0) {
      await client.query(`
        INSERT INTO selection_addons (selection_id, product_id, quantity, unit_price)
        VALUES ($1, $2, $3, 50000)
      `, [selId, prodEditFileId, options.addonsCount]);
    }

    return gid;
  }

  it("1. Tính đúng số ảnh vượt chưa thanh toán và tiền tương ứng theo galleries.extra_photo_price", async () => {
    // Quota = 10, Chọn = 15 -> Vượt 5. Addon = 0 -> Chưa thu = 5. Đơn giá = 60.000 -> Tiền = 300.000
    const g1 = await createGalleryWithSelection({
      branchId: branchAId,
      title: "Album Vượt 5 Chưa Mua Thêm",
      includedQuota: 10,
      extraPhotoPrice: 60000,
      selectedPhotos: 15,
    });

    const { rows } = await client.query("SELECT * FROM v_over_quota_unbilled WHERE gallery_id = $1", [g1]);
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.quota).toBe(10);
    expect(row.selected_count).toBe(15);
    expect(row.over_count).toBe(5);
    expect(row.addon_count).toBe(0);
    expect(row.unbilled_count).toBe(5);
    expect(Number(row.extra_photo_price)).toBe(60000);
    expect(Number(row.unbilled_amount)).toBe(300000);
  });

  it("2. Trừ bớt số ảnh đã mua thêm qua selection_addons (kind edited_photo)", async () => {
    // Quota = 10, Chọn = 16 -> Vượt 6. Addon = 2 -> Chưa thu = 4. Đơn giá = 50.000 -> Tiền = 200.000
    const g2 = await createGalleryWithSelection({
      branchId: branchAId,
      title: "Album Vượt 6 Đã Mua Thêm 2",
      includedQuota: 10,
      extraPhotoPrice: 50000,
      selectedPhotos: 16,
      addonsCount: 2,
    });

    const { rows } = await client.query("SELECT * FROM v_over_quota_unbilled WHERE gallery_id = $1", [g2]);
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.quota).toBe(10);
    expect(row.selected_count).toBe(16);
    expect(row.over_count).toBe(6);
    expect(row.addon_count).toBe(2);
    expect(row.unbilled_count).toBe(4);
    expect(Number(row.unbilled_amount)).toBe(200000);
  });

  it("3. Đã mua thêm đủ số ảnh vượt thì KHÔNG xuất hiện trong v_over_quota_unbilled", async () => {
    // Quota = 10, Chọn = 14 -> Vượt 4. Addon = 4 -> Chưa thu = 0.
    const g3 = await createGalleryWithSelection({
      branchId: branchAId,
      title: "Album Vượt 4 Đã Mua Đủ 4",
      includedQuota: 10,
      extraPhotoPrice: 50000,
      selectedPhotos: 14,
      addonsCount: 4,
    });

    const { rows } = await client.query("SELECT * FROM v_over_quota_unbilled WHERE gallery_id = $1", [g3]);
    expect(rows.length).toBe(0);
  });

  it("4. BỐN LUẬT - Luật 1: Album hạn mức NULL thì KHÔNG vào v_over_quota_unbilled, nhưng đếm vào missing_quota_album_count", async () => {
    const gNullQuota = await createGalleryWithSelection({
      branchId: branchAId,
      title: "Album Chưa Biết Hạn Mức",
      includedQuota: 10,
      extraPhotoPrice: 50000,
      selectedPhotos: 20,
      hasItemsWithNoQuota: true, // Có gallery_items nhưng không có edited_photo => quota = NULL
    });

    // 1. Không xuất hiện trong v_over_quota_unbilled
    const { rows: unbilled } = await client.query("SELECT * FROM v_over_quota_unbilled WHERE gallery_id = $1", [gNullQuota]);
    expect(unbilled.length).toBe(0);

    // 2. Xuất hiện trong missing_quota_album_count của v_over_quota_summary
    const { rows: summary } = await client.query("SELECT * FROM v_over_quota_summary");
    expect(summary.length).toBe(1);
    expect(summary[0].missing_quota_album_count).toBeGreaterThanOrEqual(1);
  });

  it("5. BỐN LUẬT - Luật 2: Chỉ tính ảnh mark = 'selected', ảnh thả tim (is_favorite) KHÔNG tính", async () => {
    // Quota = 10, Chọn = 10 (không vượt), nhưng có thêm 8 ảnh thả tim
    const gHeart = await createGalleryWithSelection({
      branchId: branchAId,
      title: "Album 10 Chọn và 8 Thả Tim",
      includedQuota: 10,
      extraPhotoPrice: 50000,
      selectedPhotos: 10,
      favoritePhotosOnly: 8,
    });

    const { rows } = await client.query("SELECT * FROM v_over_quota_unbilled WHERE gallery_id = $1", [gHeart]);
    expect(rows.length).toBe(0);
  });

  /**
   * Chạy một truy vấn dưới danh nghĩa một nhân viên, rồi LUÔN LUÔN rollback.
   *
   * try/finally ở đây không phải cho gọn. Bản đầu đặt ROLLBACK ngay sau
   * expect(), nên khi một assertion ném lỗi thì giao dịch ở lại MỞ với
   * `SET LOCAL ROLE authenticated`. afterAll sau đó chạy DELETE dưới vai đó,
   * bị RLS chặn, xoá 0 dòng và KHÔNG báo lỗi. Fixture nằm lại trong bb-dev,
   * và verify:db của mọi người đỏ từ đó trở đi.
   *
   * Chuyện này đã xảy ra thật ngày 12.09.2026: một phép thử hỏng để lại sáu
   * album mồ côi trong cơ sở dữ liệu dùng chung.
   */
  async function asStaff<T>(staffId: string, run: () => Promise<T>): Promise<T> {
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE authenticated");
      await client.query(
        `SET LOCAL request.jwt.claims = '{"sub": "${staffId}", "role": "authenticated"}'`,
      );
      return await run();
    } finally {
      await client.query("ROLLBACK");
    }
  }

  it("6. BỐN LUẬT - Luật 3: RLS theo chi nhánh - Quản lý chi nhánh chỉ thấy chi nhánh mình, CTV không thấy gì", async () => {
    // Tạo 1 album ở Branch B
    const gBranchB = await createGalleryWithSelection({
      branchId: branchBId,
      title: "Album Vượt ở Branch B",
      includedQuota: 10,
      extraPhotoPrice: 50000,
      selectedPhotos: 15,
      editorId: staffCtvId, // Gán CTV làm editor của album này
    });

    // A. Quản lý chi nhánh A không thấy album của Branch B
    await asStaff(staffManagerAId, async () => {
      const { rows } = await client.query(
        "SELECT * FROM v_over_quota_unbilled WHERE gallery_id = $1",
        [gBranchB],
      );
      expect(rows.length).toBe(0);
    });

    // B. CTV thời vụ không thấy gì, kể cả khi được gán làm editor của album
    await asStaff(staffCtvId, async () => {
      const { rows: unbilled } = await client.query("SELECT * FROM v_over_quota_unbilled");
      expect(unbilled.length).toBe(0);

      // Bảng tổng phải trả KHÔNG dòng nào, không phải một dòng toàn số 0:
      // một dòng số 0 vừa là thông tin CTV không được thấy, vừa sai sự thật.
      const { rows: summary } = await client.query("SELECT * FROM v_over_quota_summary");
      expect(summary.length).toBe(0);
    });

    // C. Chủ studio thấy cả Branch B
    await asStaff(staffOwnerId, async () => {
      const { rows } = await client.query(
        "SELECT * FROM v_over_quota_unbilled WHERE gallery_id = $1",
        [gBranchB],
      );
      expect(rows.length).toBe(1);
    });
  });
});
