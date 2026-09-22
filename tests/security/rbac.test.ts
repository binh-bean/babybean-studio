import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from "vitest";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
vi.mock("server-only", () => ({}));

import { requireRole, PERMISSIONS } from "../../src/lib/auth/staff";
import { Client } from "pg";

describe("Database RLS Policies & Security (BB-020)", () => {
  let client: Client;

  beforeAll(async () => {
    client = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
    });
    await client.connect();

    const { rows } = await client.query("SELECT COUNT(*) FROM staff_profiles");
    if (parseInt(rows[0].count, 10) === 0) {
      throw new Error("Dữ liệu trống, cần chạy npm run db:seed trước khi chạy test");
    }
  });

  // Luôn đóng giao dịch sau mỗi phép thử, KỂ CẢ khi phép thử ném lỗi.
  //
  // 10 phép thử trong file này đều mở BEGIN rồi SET LOCAL ROLE authenticated,
  // và đặt ROLLBACK ở cuối — sau các assertion. Một assertion hỏng là ROLLBACK
  // không chạy, kết nối ở lại trong giao dịch với vai authenticated, và phép
  // thử KẾ TIẾP chết với "permission denied for table users" ở chỗ chẳng liên
  // quan gì. Một lỗi thật hoá thành hai lỗi, và lỗi thứ hai chỉ vào nhầm chỗ.
  //
  // Xảy ra thật ngày 12.09.2026. Cùng khuôn với test BB-106 đã sửa cùng ngày.
  afterEach(async () => {
    await client.query("ROLLBACK").catch(() => {});
  });

  afterAll(async () => {
    await client.end();
  });

  /**
   * Dựng một thợ ảnh và một khách trong cùng chi nhánh, ngay trong transaction
   * của bài test.
   *
   * Trước đây bài test đi tìm `role = 'photographer'` trong dữ liệu mẫu. Ngày
   * 10/09/2026 chủ studio đổi vai trò của người thợ ảnh duy nhất sang retoucher
   * — một thao tác quản trị hoàn toàn bình thường — và bài kiểm tra bảo mật này
   * đỏ vì không còn ai để thử. Bài test bảo mật không được phụ thuộc vào thứ
   * người dùng sửa được qua giao diện.
   */
  async function makePhotographerAndCustomer(): Promise<{ photoId: string; custId: string }> {
    const { rows: branch } = await client.query("SELECT id FROM branches LIMIT 1");
    if (branch.length === 0) throw new Error("Cần ít nhất một chi nhánh, chạy npm run db:seed");
    const branchId = branch[0].id;

    const { rows: user } = await client.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'fixture.photographer.' || gen_random_uuid() || '@staff.babybeanstudio.vn', '', now(), now(), now())
       RETURNING id`,
    );
    const photoId = user[0].id;

    await client.query(
      `INSERT INTO staff_profiles (id, full_name, email, role, is_active)
       SELECT $1, 'Fixture Thợ Ảnh', email, 'photographer', true FROM auth.users WHERE id = $1`,
      [photoId],
    );
    await client.query(
      "INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1, $2)",
      [photoId, branchId],
    );

    const { rows: cust } = await client.query(
      `INSERT INTO customers (branch_id, full_name, phone)
       VALUES ($1, 'Fixture Khách Hàng', '0900000' || floor(random() * 900 + 100)::text)
       RETURNING id`,
      [branchId],
    );

    return { photoId, custId: cust[0].id };
  }

  /**
   * Dựng một CSKH được gán ĐÚNG MỘT chi nhánh, ngay trong transaction của bài test.
   *
   * Bản cũ của Ca 1 đi tìm `role = 'cs' LIMIT 1` trong dữ liệu thật, rồi lấy
   * `staff_branches ... LIMIT 1` làm "chi nhánh của người này" — và đòi không được
   * thấy bộ ảnh nào ngoài chi nhánh đó.
   *
   * Ngày 18/09/2026 bài này đỏ: 264 bộ "lọt". Đo lại thì **luật quyền không hề
   * sai** — cả hai tài khoản CSKH trên bb-dev đã được gán **cả ba** chi nhánh, một
   * thao tác quản trị hoàn toàn bình thường. Bài test chỉ nhìn chi nhánh đầu tiên
   * rồi gọi hai chi nhánh còn lại là "lọt".
   *
   * Tệ hơn cả việc đỏ oan: với tài khoản gán đủ ba chi nhánh thì **không còn chi
   * nhánh nào ở ngoài để kiểm**, nên ngay cả khi nó xanh thì nó cũng không canh
   * gì. Cùng bài học đã ghi ở `makePhotographerAndCustomer` bên trên: bài test bảo
   * mật không được phụ thuộc vào thứ người dùng sửa được qua giao diện.
   */
  async function makeCsMotChiNhanh(): Promise<{ csId: string; branchId: string }> {
    // Chi nhánh phải CÓ bộ ảnh, và phải có ít nhất một chi nhánh KHÁC cũng có bộ
    // ảnh — không thì phép thử này rỗng ruột mà vẫn xanh.
    const { rows: br } = await client.query(
      `select branch_id, count(*)::int n from galleries
        where branch_id is not null group by 1 having count(*) > 0 order by 2 desc`,
    );
    if (br.length < 2) throw new Error("Cần ít nhất hai chi nhánh có bộ ảnh, chạy npm run db:seed");
    const branchId = br[0].branch_id;

    const { rows: user } = await client.query(
      `INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
       VALUES (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
               'fixture.cs.' || gen_random_uuid() || '@staff.babybeanstudio.vn', '', now(), now(), now())
       RETURNING id`,
    );
    const csId = user[0].id;

    await client.query(
      `INSERT INTO staff_profiles (id, full_name, email, role, is_active)
       SELECT $1, 'Fixture CSKH', email, 'cs', true FROM auth.users WHERE id = $1`,
      [csId],
    );
    await client.query("INSERT INTO staff_branches (staff_id, branch_id) VALUES ($1, $2)", [csId, branchId]);

    return { csId, branchId };
  }

  it("Ca 1: cs chi nhánh thấy album chi nhánh mình và KHÔNG thấy album chi nhánh khác", async () => {
    await client.query("BEGIN");
    
    // Dựng CSKH của riêng bài test, gán ĐÚNG MỘT chi nhánh — xem ghi chú ở
    // `makeCsMotChiNhanh`. Không đi tìm tài khoản thật nữa.
    const { csId, branchId: csBranchId } = await makeCsMotChiNhanh();

    // Đăng nhập làm CS này
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);
    
    // Đọc galleries
    const res = await client.query("SELECT * FROM galleries");
    
    // Phải thấy ít nhất 1 album của chi nhánh mình (từ seed)
    const ownGalleries = res.rows.filter(g => g.branch_id === csBranchId);
    expect(ownGalleries.length).toBeGreaterThan(0);
    
    // Không được có album nào thuộc chi nhánh khác
    const otherGalleries = res.rows.filter(g => g.branch_id !== csBranchId);
    expect(otherGalleries.length).toBe(0);

    // Đối chứng: phải thực sự CÓ bộ ảnh ở chi nhánh khác để mà giấu. Không có
    // dòng này thì một cơ sở dữ liệu chỉ có bộ ảnh của một chi nhánh cũng làm ca
    // này xanh — xanh mà không canh gì.
    await client.query("SET LOCAL ROLE postgres");
    const { rows: ngoai } = await client.query(
      "select count(*)::int n from galleries where branch_id <> $1", [csBranchId]);
    expect(ngoai[0].n).toBeGreaterThan(0);
    
    await client.query("ROLLBACK");
  });

  it("Ca 2 (Lỗ hổng 0001): photographer KHÔNG được phép sửa hồ sơ khách hàng", async () => {
    await client.query("BEGIN");

    // Tự dựng thợ ảnh và khách, không đi tìm trong dữ liệu mẫu.
    const { photoId, custId } = await makePhotographerAndCustomer();

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${photoId}", "role": "authenticated"}'`);

    const updateRes = await client.query("UPDATE customers SET full_name = 'Hacked Name' WHERE id = $1", [custId]);
    // RLS sẽ chặn update, do USING clause của policy false nên không tìm thấy dòng để update
    expect(updateRes.rowCount).toBe(0);

    // Kiểm tra lại bằng cách vượt quyền, đảm bảo tên không đổi
    await client.query("SET LOCAL ROLE postgres");
    const checkRes = await client.query("SELECT full_name FROM customers WHERE id = $1", [custId]);
    expect(checkRes.rows[0].full_name).not.toBe('Hacked Name');

    await client.query("ROLLBACK");
  });

  it("Ca 3: cs gọi POST /admin/galleries/:id/reopen (mở lại album) -> 403 ở tầng ứng dụng", () => {
    // Tránh lập luận vòng tròn bằng cách sử dụng PERMISSIONS export từ src/lib/auth/staff
    const session = {
      staffId: "user-cs",
      role: "cs" as const,
      permissions: quyenCuaVai("cs"),
      branchIds: []
    };
    let error: unknown;
    try {
      requireRole(session, PERMISSIONS.REOPEN_GALLERY);
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect((error as { code?: string }).code).toBe("FORBIDDEN");
  });

  it("Đối chứng dương: cs SỬA được khách hàng của chính chi nhánh mình", async () => {
    await client.query("BEGIN");

    // Lấy 1 cs
    const csRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    const csId = csRes.rows[0].id;

    const sbRes = await client.query("SELECT branch_id FROM staff_branches WHERE staff_id = $1 LIMIT 1", [csId]);
    const csBranchId = sbRes.rows[0].branch_id;

    // Lấy 1 khách hàng của cùng chi nhánh
    const custRes = await client.query("SELECT id, full_name FROM customers WHERE branch_id = $1 LIMIT 1", [csBranchId]);
    const custId = custRes.rows[0].id;

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);

    // Sửa khách hàng thành công
    await client.query("UPDATE customers SET full_name = 'New Name' WHERE id = $1", [custId]);
    
    // Đọc lại xem có sửa được không
    const checkRes = await client.query("SELECT full_name FROM customers WHERE id = $1", [custId]);
    expect(checkRes.rows[0].full_name).toBe("New Name");

    await client.query("ROLLBACK");
  });

  it("Ca 4: Nhân viên bất kỳ UPDATE selection_items -> lỗi RLS/quyền", async () => {
    await client.query("BEGIN");
    
    // Lấy 1 cs
    const csRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    const csId = csRes.rows[0].id;
    
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);
    
    let error;
    try {
      await client.query("UPDATE selection_items SET mark = 'selected'");
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/permission denied for table selection_items|new row violates row-level security policy/i);
    
    await client.query("ROLLBACK");
  });

  it("Ca 5: Nhân viên tự UPDATE role của mình -> lỗi RLS", async () => {
    await client.query("BEGIN");

    // Lấy 1 cs
    const csRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    const csId = csRes.rows[0].id;

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);

    let error;
    try {
      await client.query("UPDATE staff_profiles SET role = 'owner' WHERE id = $1", [csId]);
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/new row violates row-level security policy|permission denied/i);
    
    await client.query("ROLLBACK");
  });

  it("Ca 6: anon SELECT bất kỳ bảng nào -> lỗi quyền", async () => {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE anon");
    
    let error;
    try {
      await client.query("SELECT * FROM galleries");
    } catch (e) {
      error = e;
    }
    
    expect(error).toBeDefined();
    expect((error as Error).message).toContain("permission denied");
    
    await client.query("ROLLBACK");
  });

  /**
   * Ca 7 đến ca 12: KHÔNG còn `it.todo` nữa — xem `bb-054-ma-tran-bao-mat.test.ts`.
   *
   * Sáu dòng `it.todo` từng nằm ở đây, mỗi dòng ghi "Chờ BB-0xx" cho những
   * task đã xong từ lâu. Vitest đếm `todo` là "đã lên kế hoạch" chứ không phải
   * "đang hỏng", nên bộ phép thử vẫn xanh trong khi ma trận nghiệm thu của
   * docs/05 mục 6 thiếu một nửa.
   *
   * Rà soát 22/09/2026 (BB-054) tìm ra: bốn ca ĐÃ có phép thử thật ở tệp khác,
   * hai ca chưa có gì, và một ca đã hết nghĩa vì mã PIN bị bỏ ở migration 0045.
   * Tệp `bb-054-ma-tran-bao-mat.test.ts` giữ bảng ánh xạ đó và KIỂM rằng mỗi
   * tệp được viện dẫn có thật và có đúng ca đó.
   */

  it("Ca 13: accountant không thấy ảnh (SELECT photos trả về 0 dòng)", async () => {
    await client.query("BEGIN");

    // Lấy 1 staff bất kỳ (ví dụ cs) và ép thành accountant trong transaction này
    const staffRes = await client.query("SELECT id FROM staff_profiles WHERE role = 'cs' LIMIT 1");
    expect(staffRes.rows.length).toBeGreaterThan(0);
    const accId = staffRes.rows[0].id;
    
    await client.query("UPDATE staff_profiles SET role = 'accountant' WHERE id = $1", [accId]);

    // Neo vào MỘT bộ ảnh cụ thể, thuộc ĐÚNG chi nhánh của nhân viên này, và
    // chắc chắn có ảnh. Lấy trước khi đổi vai nên còn thấy hết.
    //
    // Không hỏi "toàn bảng có dòng nào không": khi câu trả lời là 0 dòng thì
    // LIMIT 1 không có gì để dừng sớm, Postgres xét luật quyền trên đủ 152k
    // ảnh — 11 giây lúc máy rảnh, quá 20 giây khi chạy song song. Hỏi theo
    // gallery_id thì có chỉ mục: 336 ms.
    //
    // Phải ĐÚNG chi nhánh, nếu không phép thử đạt rỗng: bộ ảnh của chi nhánh
    // khác thì cs cũng không thấy, và ca này sẽ xanh kể cả khi luật quyền hỏng.
    // Đã đo: cùng câu này vai cs thấy 1 dòng, vai accountant thấy 0 dòng.
    const { rows: boCoAnh } = await client.query(
      `SELECT p.gallery_id FROM photos p
         JOIN galleries g ON g.id = p.gallery_id
         JOIN staff_branches sb ON sb.branch_id = g.branch_id
        WHERE sb.staff_id = $1 LIMIT 1`,
      [accId],
    );
    expect(boCoAnh.length).toBe(1); // thiếu dữ liệu thì phải ĐỎ, không được đạt rỗng

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${accId}", "role": "authenticated"}'`);

    // Không thấy một tấm nào của bộ đó, vì photos_select chặn accountant
    const photosRes = await client.query(
      "SELECT 1 FROM photos WHERE gallery_id = $1 LIMIT 1",
      [boCoAnh[0].gallery_id],
    );
    expect(photosRes.rows.length).toBe(0);

    await client.query("ROLLBACK");
  });

  it("Đối chứng dương cho Ca 13: accountant VẪN thấy được album, và cs VẪN thấy được ảnh", async () => {
    await client.query("BEGIN");

    // Lấy 2 staff: ép 1 người làm accountant, người kia làm cs.
    //
    // PHẢI lấy người CÓ CHI NHÁNH và chi nhánh đó CÓ BỘ ẢNH. Luật quyền chỉ cho
    // nhân viên nhìn bộ ảnh trong chi nhánh của mình, nên bốc nhầm một người
    // không chi nhánh là thấy 0 dòng — và phép thử đỏ trong khi không ai sửa gì sai.
    //
    // Đã xảy ra thật ngày 17/09: một dòng `Fixture branch_manager` còn sót từ lượt
    // chạy hỏng của chính phép thử này, không có chi nhánh nào, làm cả bộ phép thử
    // bảo mật đỏ trên `main`. `LIMIT 2` không sắp thứ tự nên lúc trúng lúc không —
    // kiểu đỏ chập chờn tốn nhiều giờ nhất để dò.
    const staffsRes = await client.query(`
      SELECT sp.id
        FROM staff_profiles sp
        JOIN staff_branches sb ON sb.staff_id = sp.id
       WHERE sp.role IN ('cs', 'photographer', 'branch_manager')
         AND EXISTS (SELECT 1 FROM galleries g WHERE g.branch_id = sb.branch_id)
       ORDER BY sp.created_at
       LIMIT 2`);
    expect(staffsRes.rows.length).toBeGreaterThanOrEqual(2);
    
    const accId = staffsRes.rows[0].id;
    const csId = staffsRes.rows[1].id;
    
    await client.query("UPDATE staff_profiles SET role = 'accountant' WHERE id = $1", [accId]);
    await client.query("UPDATE staff_profiles SET role = 'cs' WHERE id = $1", [csId]);

    // Kiểm tra accountant thấy album
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${accId}", "role": "authenticated"}'`);
    const galleriesRes = await client.query("SELECT * FROM galleries");
    expect(galleriesRes.rows.length).toBeGreaterThan(0);

    // Kiểm tra CS thấy ảnh
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${csId}", "role": "authenticated"}'`);
    const photosRes = await client.query("SELECT 1 FROM photos LIMIT 1");
    expect(photosRes.rows.length).toBeGreaterThan(0);

    await client.query("ROLLBACK");
  });

  // Ca 14 (token đã thu hồi): xem `gallery-auth.test.ts` — xem ghi chú ở trên.

  it("photoshop_ctv không xem được customers, packages, selections, và chỉ thấy gallery của mình", async () => {
    await client.query("BEGIN");

    const { photoId: ctvId } = await makePhotographerAndCustomer();
    await client.query("UPDATE staff_profiles SET role = 'photoshop_ctv' WHERE id = $1", [ctvId]);

    // Gán 1 album cho ctv
    // PHẢI lọc theo chi nhánh của chính nhân viên này.
    //
    // Bản cũ lấy "SELECT id FROM galleries LIMIT 2" — album bất kỳ, không thứ
    // tự, không lọc. Nó chỉ đúng khi cơ sở dữ liệu vừa vặn có album ở đúng chi
    // nhánh mà makePhotographerAndCustomer bốc trúng. Khi bb-dev có thêm 431
    // album thật từ Lark, LIMIT 2 rơi vào chi nhánh khác, CTV không thấy gì,
    // và phép thử báo hỏng ở chỗ chẳng sai gì cả.
    const { rows: staffBranch } = await client.query(
      "SELECT branch_id FROM staff_branches WHERE staff_id = $1 LIMIT 1",
      [ctvId],
    );
    const { rows: galleries } = await client.query(
      "SELECT id FROM galleries WHERE branch_id = $1 ORDER BY created_at LIMIT 2",
      [staffBranch[0].branch_id],
    );
    expect(galleries.length).toBeGreaterThanOrEqual(2);
    const assignedGalleryId = galleries[0].id;
    await client.query("UPDATE galleries SET editor_id = $1 WHERE id = $2", [ctvId, assignedGalleryId]);

    // Bộ ảnh KHÔNG thuộc ctv này nhưng CÙNG chi nhánh, và chắc chắn có ảnh.
    // Cùng chi nhánh mới là phép thử đúng: nếu luật quyền rò theo chi nhánh
    // thay vì theo album được gán, chính bộ này sẽ lộ ra.
    const { rows: boKhac } = await client.query(
      `SELECT p.gallery_id FROM photos p
         JOIN galleries g ON g.id = p.gallery_id
        WHERE g.branch_id = $1 AND p.gallery_id <> $2 LIMIT 1`,
      [staffBranch[0].branch_id, assignedGalleryId],
    );
    expect(boKhac.length).toBe(1); // thiếu dữ liệu thì phải ĐỎ, không được đạt rỗng
    const boAnhCuaNhaKhac: string = boKhac[0].gallery_id;

    // Set role
    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${ctvId}", "role": "authenticated"}'`);

    // Kiểm tra không thấy customers
    const custRes = await client.query("SELECT * FROM customers");
    expect(custRes.rows.length).toBe(0);

    // Kiểm tra không thấy packages
    const pkgRes = await client.query("SELECT * FROM packages");
    expect(pkgRes.rows.length).toBe(0);

    // Kiểm tra không thấy selections
    const selRes = await client.query("SELECT * FROM selections");
    expect(selRes.rows.length).toBe(0);

    // Kiểm tra chỉ thấy gallery được gán
    const galRes = await client.query("SELECT * FROM galleries");
    expect(galRes.rows.length).toBe(1);
    expect(galRes.rows[0].id).toBe(assignedGalleryId);

    // Kiểm tra thấy photos của gallery được gán
    // Neo vào một bộ ảnh CỤ THỂ không thuộc về ctv này và chắc chắn có ảnh.
    // Bản cũ kéo cả bảng về rồi soát từng dòng: đúng ý nhưng mất 8,6 giây trên
    // 152k ảnh. Bản "WHERE gallery_id <> $1" cũng không cứu được, vì câu trả
    // lời là 0 dòng nên không có gì để dừng sớm — vẫn phải xét đủ 152k dòng.
    const photoRes = await client.query(
      "SELECT 1 FROM photos WHERE gallery_id = $1 LIMIT 1",
      [boAnhCuaNhaKhac],
    );
    expect(photoRes.rows.length).toBe(0);

    await client.query("ROLLBACK");
  });

  it("Đối chứng dương: retoucher thấy mọi customers, packages, selections và galleries trong nhánh", async () => {
    await client.query("BEGIN");

    const { photoId: retoucherId } = await makePhotographerAndCustomer();
    await client.query("UPDATE staff_profiles SET role = 'retoucher' WHERE id = $1", [retoucherId]);

    await client.query("SET LOCAL ROLE authenticated");
    await client.query(`SET LOCAL request.jwt.claims = '{"sub": "${retoucherId}", "role": "authenticated"}'`);

    const custRes = await client.query("SELECT * FROM customers");
    expect(custRes.rows.length).toBeGreaterThan(0);

    const pkgRes = await client.query("SELECT * FROM packages");
    expect(pkgRes.rows.length).toBeGreaterThan(0);

    const galRes = await client.query("SELECT * FROM galleries");
    expect(galRes.rows.length).toBeGreaterThan(0);

    await client.query("ROLLBACK");
  });
});
