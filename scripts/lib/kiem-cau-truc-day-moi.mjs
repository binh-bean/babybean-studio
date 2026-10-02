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
