/**
 * BB-352 — phép kiểm cấu trúc cho dãy migration 0052–0085, dùng chung bởi
 * `scripts/verify-db.mjs` và phép thử đơn vị.
 *
 * Vì sao tách ra khỏi verify-db.mjs: một cổng chưa từng được thấy ĐỎ thì không ai
 * biết nó có đỏ được hay không. Vòng 7 (01/10/2026) đo thấy `verify:db` xanh 17/17
 * trên một cơ sở dữ liệu thiếu cả dãy 0077–0085 — vì cổng chỉ hỏi những bảng có
 * từ trước tháng 9. Tách phần này thành hàm nhận `client` + `fetchFn` thì phép
 * thử đơn vị đưa vào một cơ sở dữ liệu GIẢ đã rút bớt một bảng/cột/hàm và đòi
 * cổng phải đỏ (xem tests/unit/bb-352-verify-db-day-moi.test.ts).
 *
 * Danh sách dưới đây là NGUỒN SỰ THẬT của cổng: thêm bảng/cột mới ở migration
 * sau này thì thêm vào đây, không thì cổng không canh nó.
 */

/**
 * Bảng của dãy 0052–0083 mà danh sách cũ trong verify-db.mjs chưa từng nhắc.
 * Mọi bảng này tạo bởi migration, bật RLS và thu hết quyền của anon (chỉ
 * service_role truy cập qua route API đã kiểm quyền).
 */
export const BANG_DAY_MOI = [
  "roles", // 0052
  "revision_requests", // 0033
  "selection_addon_photos", // 0062
  "lark_nhac_da_gui", // 0067
  "share_link_ma", // 0070
  "push_dang_ky", // 0071
  "yeu_cau_mua_them", // 0072
  "thong_bao_khach", // 0074
  "album_covers", // 0075
  "schema_migrations", // 0076
  "selection_rounds", // 0077
  "lark_ban_ghi_moi", // 0079
  "tim_gia_dinh", // 0083
];

/** Cột thêm bởi 0077–0083 (0078 và 0084 không tồn tại — xem db/migrations/README.md). */
export const COT_DAY_MOI = {
  galleries: ["lark_dong_da_xoa_luc", "lark_photo"], // 0079, 0081
  selection_items: ["dot"], // 0077
  selection_addons: ["dot"], // 0077
  selections: [
    "nho_studio_chon_them",
    "dong_y_anh_studio_chon",
    "so_san_pham_in_chua_anh",
    "biet_anh_in_cham_hon",
    "studio_xu_ly_dot1_at",
    "studio_xu_ly_dot1_boi",
  ], // 0077, 0082
  gallery_payments: ["ma_hoa_don", "ma_phieu_thu"], // 0080
  selection_rounds: ["da_thanh_toan_luc", "da_thanh_toan_boi", "ma_hoa_don", "ma_phieu_thu"], // 0080
  yeu_cau_mua_them: ["ma_hoa_don", "ma_phieu_thu", "da_thanh_toan_luc", "loai", "anh_ids", "don_gia", "tam_tinh"], // 0080, 0083
};

/**
 * Hàm viết lại bởi 0081 và 0085: kiểm đúng SỐ THAM SỐ của bản mới. Bản cũ cùng
 * tên mà ít tham số hơn nghĩa là migration chưa áp (drop + create đổi chữ ký).
 */
export const HAM_DAY_MOI = { get_admin_galleries: 14, get_gallery_photos: 6 };

/**
 * Chạy sáu phép kiểm. Trả về mảng `{ name, pass, detail }` — verify-db.mjs đẩy
 * từng phần tử vào bảng kết quả của nó.
 *
 * @param {object} opts
 * @param {{ query(sql: string, params?: unknown[]): Promise<{ rows: any[], rowCount?: number|null }> }} opts.client
 * @param {Array<{ tablename: string, rowsecurity: boolean }>} opts.tables  kết quả của
 *        `select tablename, rowsecurity from pg_tables where schemaname = 'public'`
 * @param {string} opts.apiUrl           gốc REST của Supabase (không dấu / cuối)
 * @param {string} opts.publishableKey   khoá anon
 * @param {typeof fetch} [opts.fetchFn]  mặc định `fetch` toàn cục; phép thử đưa bản giả
 * @param {string[]} [opts.bang] @param {Record<string,string[]>} [opts.cot] @param {Record<string,number>} [opts.ham]
 *        ghi đè danh sách (mặc định là ba hằng ở trên) — phép thử dùng để "rút một phần tử"
 */
export async function kiemDayMigrationMoi({
  client,
  tables,
  apiUrl,
  publishableKey,
  fetchFn = fetch,
  bang = BANG_DAY_MOI,
  cot = COT_DAY_MOI,
  ham = HAM_DAY_MOI,
}) {
  const ketQua = [];
  const check = (name, pass, detail = "") => ketQua.push({ name, pass, detail });

  const tatCaTen = new Set(tables.map((t) => t.tablename));
  const thieu = bang.filter((t) => !tatCaTen.has(t));
  check(
    `${bang.length} bảng của 0052–0083 tồn tại`,
    thieu.length === 0,
    thieu.length ? `thiếu: ${thieu.join(", ")} — chưa áp migration tương ứng` : "đủ",
  );

  const coMat = bang.filter((t) => tatCaTen.has(t));
  const rlsTat = tables.filter((r) => coMat.includes(r.tablename) && !r.rowsecurity).map((r) => r.tablename);
  check(
    "Bảng mới: RLS bật",
    rlsTat.length === 0 && coMat.length === bang.length,
    rlsTat.length ? `chưa bật: ${rlsTat.join(", ")}` : `${coMat.length}/${bang.length} bảng`,
  );

  // anon không được có BẤT KỲ quyền nào trên bảng mới: chỉ máy chủ (service_role)
  // đọc/ghi các bảng này.
  const anon = await client.query(
    `select t.tablename,
            array_remove(array[
              case when has_table_privilege('anon', format('public.%I', t.tablename), 'SELECT') then 'SELECT' end,
              case when has_table_privilege('anon', format('public.%I', t.tablename), 'INSERT') then 'INSERT' end,
              case when has_table_privilege('anon', format('public.%I', t.tablename), 'UPDATE') then 'UPDATE' end,
              case when has_table_privilege('anon', format('public.%I', t.tablename), 'DELETE') then 'DELETE' end
            ], null) as quyen
       from pg_tables t
      where t.schemaname = 'public' and t.tablename = any($1::text[])`,
    [bang],
  );
  const anonCoQuyen = anon.rows.filter((r) => r.quyen.length > 0);
  check(
    "Bảng mới: anon không có quyền nào",
    anonCoQuyen.length === 0 && anon.rows.length === coMat.length,
    anonCoQuyen.length
      ? "ANON CÓ QUYỀN: " + anonCoQuyen.map((r) => `${r.tablename}(${r.quyen.join(",")})`).join(" · ")
      : `${anon.rows.length}/${bang.length} bảng, anon trắng tay`,
  );

  // Cùng phép đo bằng đường mà kẻ tấn công thật dùng: khoá anon qua REST.
  const lot = [];
  for (const t of coMat) {
    const r = await fetchFn(`${apiUrl}/rest/v1/${t}?select=*&limit=1`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${publishableKey}` },
    });
    if (r.status === 200) lot.push(t);
  }
  check(
    "Bảng mới: khoá publishable không đọc được",
    lot.length === 0 && coMat.length > 0,
    lot.length ? `LỘ: ${lot.join(", ")}` : `${coMat.length} bảng, bị từ chối hết`,
  );

  const cotThat = await client.query(
    `select table_name, column_name from information_schema.columns
      where table_schema = 'public' and table_name = any($1::text[])`,
    [Object.keys(cot)],
  );
  const coCot = new Set(cotThat.rows.map((r) => `${r.table_name}.${r.column_name}`));
  const thieuCot = Object.entries(cot).flatMap(([b, cs]) => cs.map((c) => `${b}.${c}`).filter((k) => !coCot.has(k)));
  const tongCot = Object.values(cot).reduce((n, cs) => n + cs.length, 0);
  check(
    `${tongCot} cột mới của 0077–0083 tồn tại`,
    thieuCot.length === 0,
    thieuCot.length ? `thiếu: ${thieuCot.join(", ")}` : "đủ",
  );

  const hamThat = await client.query(
    `select p.proname, max(p.pronargs)::int as so_tham_so
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = any($1::text[])
      group by p.proname`,
    [Object.keys(ham)],
  );
  const soThamSo = Object.fromEntries(hamThat.rows.map((r) => [r.proname, r.so_tham_so]));
  const hamSai = Object.entries(ham)
    .filter(([f, n]) => soThamSo[f] !== n)
    .map(([f, n]) => `${f} (cần ${n} tham số, thấy ${soThamSo[f] ?? "không có"})`);
  check(
    "Hàm viết lại bởi 0081/0085 đúng chữ ký",
    hamSai.length === 0,
    hamSai.length ? `sai: ${hamSai.join(", ")}` : Object.keys(ham).join(", "),
  );

  return ketQua;
}

// ---------------------------------------------------------------------------
// BB-363 — dãy 0086–0089 (soát C vòng 11, R4)
// ---------------------------------------------------------------------------

/** Chỉ mục mà 0086/0087 tạo. Thiếu là ĐỎ — cả hai đã áp trên bb-dev, bb-prod nhận ở bước 3. */
export const CHI_MUC_0086_0087 = {
  "0086": [{ ten: "uq_gallery_payments_ma_yeu_cau", bang: "gallery_payments", duyNhat: true }],
  "0087": [
    { ten: "idx_activity_logs_created_at", bang: "activity_logs", duyNhat: false },
    { ten: "idx_notifications_xong_created_at", bang: "notifications", duyNhat: false },
  ],
};

/** Cột mà 0088 thêm vào `galleries` (gồm BB-363 `mo_link_cuoi_luc`). */
export const COT_0088 = ["trang_thai_tu", "danh_sach_thu_gon_luc", "so_anh_truoc_thu_gon", "mo_lai_anh_luc", "mo_link_cuoi_luc"];

/**
 * Bốn phép kiểm cho 0086–0089. 0086/0087 thiếu = ĐỎ. 0088/0089 là "CHỜ CẮT" (anh chốt: áp
 * lên bb-prod ở bước 3 của docs/26, KHÔNG áp sớm lên bb-dev): CHƯA áp thì ĐẠT kèm chữ
 * "chờ cắt"; ĐÃ áp thì phải ĐỦ (áp nửa vời — thiếu một cột, hàm mở cho anon — là ĐỎ).
 *
 * @param {{ client: { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> } }} opts
 */
export async function kiemDay0086Den0089({ client }) {
  const ketQua = [];
  const check = (name, pass, detail = "") => ketQua.push({ name, pass, detail });

  const tatCaChiMuc = Object.values(CHI_MUC_0086_0087).flat();
  const { rows: cm } = await client.query(
    `select c.relname as ten, t.relname as bang, i.indisunique as duy_nhat
       from pg_index i
       join pg_class c on c.oid = i.indexrelid
       join pg_class t on t.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])`,
    [tatCaChiMuc.map((x) => x.ten)],
  );
  const coChiMuc = new Map(cm.map((r) => [r.ten, r]));
  const { rows: cotMa } = await client.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'gallery_payments' and column_name = 'ma_yeu_cau'`,
  );
  const sai0086 = [];
  if (cotMa.length === 0) sai0086.push("thiếu cột gallery_payments.ma_yeu_cau");
  for (const x of CHI_MUC_0086_0087["0086"]) {
    const r = coChiMuc.get(x.ten);
    if (!r || r.bang !== x.bang) sai0086.push(`thiếu chỉ mục ${x.ten}`);
    else if (x.duyNhat && !r.duy_nhat) sai0086.push(`${x.ten} không phải UNIQUE`);
  }
  check(
    "0086: ma_yeu_cau + chỉ mục duy nhất",
    sai0086.length === 0,
    sai0086.length ? `${sai0086.join("; ")} — sổ thu tiền không chống được ghi trùng` : "đủ",
  );

  const thieu0087 = CHI_MUC_0086_0087["0087"].filter((x) => coChiMuc.get(x.ten)?.bang !== x.bang).map((x) => x.ten);
  check("0087: hai chỉ mục của bộ dọn", thieu0087.length === 0, thieu0087.length ? `thiếu: ${thieu0087.join(", ")}` : "đủ");

  const { rows: cot88 } = await client.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'galleries' and column_name = any($1::text[])`,
    [COT_0088],
  );
  const { rows: ham88 } = await client.query(
    `select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'nhan_mo_lai_anh'`,
  );
  if (cot88.length === 0 && ham88.length === 0) {
    check("0088: thu gọn ảnh bộ cũ", true, "CHỜ CẮT — chưa áp (đúng kế hoạch: áp lên bb-prod ở bước 3)");
  } else {
    const coCot = new Set(cot88.map((r) => r.column_name));
    const sai = COT_0088.filter((c) => !coCot.has(c)).map((c) => `thiếu cột galleries.${c}`);
    if (ham88.length === 0) sai.push("thiếu hàm nhan_mo_lai_anh");
    else if (ham88.some((r) => r.anon || r.auth)) sai.push("nhan_mo_lai_anh MỞ cho anon/authenticated (thiếu revoke, AGENTS §5b)");
    check("0088: thu gọn ảnh bộ cũ", sai.length === 0, sai.length ? `ÁP NỬA VỜI: ${sai.join("; ")}` : `đã áp: ${COT_0088.length} cột + hàm đã revoke`);
  }

  // 0089 chỉ REINDEX (không đổi định nghĩa) — không đo được bằng cấu trúc; đọc sổ đã áp.
  let da0089 = false;
  try {
    const { rows } = await client.query(`select 1 from public.schema_migrations where ten like '0089-%'`);
    da0089 = rows.length > 0;
  } catch {
    da0089 = false;
  }
  check("0089: dựng lại chỉ mục photos", true, da0089 ? "đã áp (schema_migrations)" : "CHỜ CẮT — chưa áp (đúng kế hoạch)");

  return ketQua;
}

// ---------------------------------------------------------------------------
// BB-334A — 0090 link gia đình (viết, CHƯA áp). Chưa áp = ĐẠT "chờ áp"; áp nửa
// vời (thiếu cột/chỉ mục/trigger, hàm trigger mở cho anon) = ĐỎ.
// ---------------------------------------------------------------------------

/** Chỉ mục 0090 tạo, đều UNIQUE. */
export const CHI_MUC_0090 = [
  { ten: "uq_share_links_gia_dinh_song", bang: "share_links" },
  { ten: "uq_galleries_so_thu_tu_khach", bang: "galleries" },
];

/**
 * @param {{ client: { query(sql: string, params?: unknown[]): Promise<{ rows: any[] }> } }} opts
 */
export async function kiem0090({ client }) {
  const { rows: cot } = await client.query(
    `select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'galleries' and column_name = 'so_thu_tu_khach'`,
  );
  const { rows: cm } = await client.query(
    `select c.relname as ten, t.relname as bang, i.indisunique as duy_nhat
       from pg_index i
       join pg_class c on c.oid = i.indexrelid
       join pg_class t on t.oid = i.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any($1::text[])`,
    [CHI_MUC_0090.map((x) => x.ten)],
  );
  const { rows: ham } = await client.query(
    `select has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
            has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'gan_so_thu_tu_khach'`,
  );
  const { rows: trg } = await client.query(
    `select 1 from pg_trigger where tgname = 'trg_galleries_so_thu_tu_khach' and not tgisinternal`,
  );

  if (cot.length === 0 && cm.length === 0 && ham.length === 0 && trg.length === 0) {
    return [{ name: "0090: link gia đình", pass: true, detail: "CHỜ ÁP — chưa áp (viết ở BB-334A, app chạy được khi chưa áp)" }];
  }
  const sai = [];
  if (cot.length === 0) sai.push("thiếu cột galleries.so_thu_tu_khach");
  const coCm = new Map(cm.map((r) => [r.ten, r]));
  for (const x of CHI_MUC_0090) {
    const r = coCm.get(x.ten);
    if (!r || r.bang !== x.bang) sai.push(`thiếu chỉ mục ${x.ten}`);
    else if (!r.duy_nhat) sai.push(`${x.ten} không phải UNIQUE`);
  }
  if (ham.length === 0) sai.push("thiếu hàm gan_so_thu_tu_khach");
  else if (ham.some((r) => r.anon || r.auth)) sai.push("gan_so_thu_tu_khach MỞ cho anon/authenticated (thiếu revoke, AGENTS §5b)");
  if (trg.length === 0) sai.push("thiếu trigger trg_galleries_so_thu_tu_khach");
  return [
    {
      name: "0090: link gia đình",
      pass: sai.length === 0,
      detail: sai.length ? `ÁP NỬA VỜI: ${sai.join("; ")}` : "đã áp: cột + 2 chỉ mục UNIQUE + trigger, hàm đã revoke",
    },
  ];
}

/**
 * BB-374 — 0092 (giá trị enum `album_unedited`) + 0093 (bảng `anh_album_khong_chinh`, sản phẩm
 * "Ảnh album không chỉnh sửa", `app.gallery_quota` bỏ qua dòng loại này khi hỏi "có dòng hợp
 * đồng nào không"). Chưa áp cả hai là ĐẠT "chờ áp"; áp nửa vời / thiếu revoke là HỎNG.
 */
export async function kiem0092_0093({ client }) {
  const { rows: en } = await client.query(
    `select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
      where t.typname = 'product_kind' and e.enumlabel = 'album_unedited'`,
  );
  const { rows: bang } = await client.query(
    `select c.relrowsecurity as rls,
            has_table_privilege('anon', c.oid, 'SELECT') as anon,
            has_table_privilege('authenticated', c.oid, 'SELECT') as auth
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'anh_album_khong_chinh'`,
  );
  if (en.length === 0 && bang.length === 0) {
    return [{ name: "0092/0093: ảnh album không chỉnh sửa", pass: true, detail: "CHỜ ÁP — chưa áp (viết ở BB-374, app chạy được khi chưa áp)" }];
  }
  const sai = [];
  if (en.length === 0) sai.push("thiếu giá trị enum product_kind 'album_unedited' (0092)");
  if (bang.length === 0) sai.push("thiếu bảng anh_album_khong_chinh (0093)");
  else {
    if (!bang[0].rls) sai.push("anh_album_khong_chinh chưa bật RLS");
    if (bang[0].anon || bang[0].auth) sai.push("anh_album_khong_chinh MỞ cho anon/authenticated (thiếu revoke)");
  }
  if (en.length > 0) {
    const { rows: sp } = await client.query(`select count(*)::int n from products where kind::text = 'album_unedited' and is_active`);
    if (sp[0].n === 0) sai.push("chưa có sản phẩm 'Ảnh album không chỉnh sửa' đang dùng");
  }
  const { rows: ham } = await client.query(
    `select pg_get_functiondef(p.oid) as def, has_function_privilege('anon', p.oid, 'EXECUTE') as anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'app' and p.proname = 'gallery_quota'`,
  );
  if (ham.length === 0) sai.push("thiếu hàm app.gallery_quota");
  else {
    if (!String(ham[0].def).includes("album_unedited")) sai.push("app.gallery_quota chưa bỏ qua dòng album_unedited (0093 mục 3)");
    if (ham[0].anon) sai.push("app.gallery_quota MỞ cho anon (thiếu revoke, AGENTS §5b)");
  }
  return [
    {
      name: "0092/0093: ảnh album không chỉnh sửa",
      pass: sai.length === 0,
      detail: sai.length ? `ÁP NỬA VỜI: ${sai.join("; ")}` : "đã áp: enum + bảng (RLS, revoke) + sản phẩm + hạn mức bỏ qua dòng album",
    },
  ];
}
