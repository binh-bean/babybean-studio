/**
 * BB-356 — "người dọn rác" cho dữ liệu VẬN HÀNH, để bb-prod ở yên trong gói
 * Supabase Free (500 MB) lâu dài.
 *
 * OWNER: DEV-BE. Quyết định của anh ngày 01/10: ở lại gói miễn phí.
 *
 * ---------------------------------------------------------------------------
 * Chỉ dọn dữ liệu VẬN HÀNH — không bao giờ dữ liệu NGHIỆP VỤ
 * (một ngoại lệ có chủ đích: bước BB-357 "anh_bo_cu" ở cuối tệp)
 * ---------------------------------------------------------------------------
 * Ngoại lệ duy nhất là bước BB-357 `anh_bo_cu` (thuGonAnhBoCu, cuối tệp): xoá
 * DÒNG `photos` của bộ đã giao/lưu trữ/hết hạn quá 6 tháng (BB-359 thêm đã giao) — ảnh gốc vẫn trên Drive,
 * "Đồng bộ lại" kéo về đủ. Bước đó giữ bìa, ảnh khách chọn, ảnh mua thêm/thả
 * tim và mọi ảnh có khoá ngoại trỏ tới; nó không nằm trong BUOC/BANG_DUOC_DON.
 *
 * Ngoài bước đó, không có bước nào ở đây chạm `galleries`, `photos`, `selections`,
 * `selection_items`, `gallery_payments`, `selection_rounds`, `yeu_cau_mua_them`,
 * `customers`, `products`, `staff_*`, `settings`, `schema_migrations`,
 * `share_links`, `share_link_ma`, `tim_gia_dinh`. Mỗi bước là MỘT câu `delete`
 * trên MỘT bảng vận hành, và điều kiện của nó nằm ngay trong bảng BUOC bên dưới.
 *
 * Nhật ký về TIỀN và hợp đồng không bao giờ bị xoá (xem NHAT_KY_LUON_GIU), kể cả
 * khi bộ ảnh của nó đã bị xoá hẳn: đó là dấu vết duy nhất còn lại.
 *
 * ---------------------------------------------------------------------------
 * Xem trước và dọn thật dùng CHUNG một điều kiện
 * ---------------------------------------------------------------------------
 * Mỗi bước khai một câu `select ctid … where … order by … limit` (ứng viên).
 * Xem trước đếm trên câu đó; dọn thật xoá `where ctid in (câu đó)`. Không có
 * hai bản điều kiện để lệch nhau — thứ màn hình báo "sẽ xoá" là đúng thứ bị xoá.
 *
 * Mỗi bước một giao dịch riêng, có `statement_timeout`, có trần dòng mỗi lượt
 * (TRAN_MOI_LOAI). Bước hỏng thì chỉ bước đó rollback, các bước khác vẫn chạy.
 * Có hạn giờ chung (`hanMs`): hết giờ thì các bước còn lại báo "hết giờ, lượt
 * sau làm tiếp" — cron Hobby chỉ có 60 giây cho cả route.
 *
 * Xoá dòng KHÔNG làm `pg_database_size` giảm ngay: Postgres đánh dấu chỗ trống
 * để autovacuum tái dùng. Số "MB tiết kiệm" là chỗ được tái dùng, tức DB
 * ngừng phình chứ không co lại (muốn co thật phải VACUUM FULL — khoá bảng, không
 * làm tự động).
 */
import type pg from "pg";

type Pg = pg.Client | pg.PoolClient;

const NGAY_MS = 24 * 60 * 60 * 1000;

/** Khoá tư vấn chung của nút ở Cài đặt và cron — hai lượt dọn không chạy chồng nhau. */
export const KHOA_DON_RAC = 356_356;
/** Trần dòng xoá cho MỖI loại trong MỘT lượt — một lượt không được nặng. */
export const TRAN_MOI_LOAI = 5_000;
/** Mỗi câu lệnh tối đa chừng này (ms) — một bước kẹt không ăn hết 60 giây của cron. */
export const STATEMENT_TIMEOUT_MS = 15_000;
/** Trần khi ĐẾM ứng viên (để báo "còn lại") — đếm không cần chính xác quá mức này. */
const TRAN_DEM = 1_000_000;

/**
 * Nhật ký LUÔN GIỮ (mẫu `like`). Tiền, hợp đồng, quyết định của khách, các lệnh
 * xoá (ai xoá gì), và yêu cầu mở lại (yeu-cau-mo-lai.ts đọc chúng KHÔNG giới hạn
 * thời gian để biết yêu cầu nào còn treo).
 */
export const NHAT_KY_LUON_GIU: readonly string[] = [
  "gallery.payment_recorded",
  "gallery.quota_by_payment",
  "gallery.item_%", // dòng hàng hợp đồng (tiền)
  "gallery.keo_dong_hop_dong",
  "gallery.delivered",
  "gallery.reopen%", // reopen, reopen_requested, reopen_rejected
  "mua_them.%",
  "addon.%",
  "selection.submit",
  "selection.round_%",
  "%payment%",
  "%thanh_toan%",
  "%.delete", // role.delete, branch.delete, baby.delete — ai xoá gì
];

/** Nhật ký "nhiễu": mỗi cú chạm của khách. Kết quả cuối đã nằm ở bảng nghiệp vụ. */
export const NHAT_KY_NHIEU: readonly string[] = ["selection.patch", "gallery.auth"];

/** Trạng thái bộ ảnh đã xong vòng đời (không còn ai thao tác tiếp). */
export const BO_ANH_XONG: readonly string[] = ["delivered", "archived", "expired"];

export type LoaiDon =
  | "nhat_ky_bo_anh_da_xoa"
  | "nhat_ky_nhieu"
  | "nhat_ky_cu"
  | "thong_bao_lark_xong"
  | "thong_bao_lark_hong"
  | "hop_thu_khach"
  | "selection_ops"
  | "ban_ghi_moi_lark"
  | "nhac_hau_ky"
  | "dang_ky_day"
  | "anh_bo_cu";

export interface ChinhSachDon {
  loai: LoaiDon;
  bang: string;
  /** Giữ bao nhiêu ngày (mốc chính). */
  giuNgay: number;
  moTa: string;
  lyDo: string;
}

interface BuocDon extends ChinhSachDon {
  /** Câu chọn ỨNG VIÊN — phải trả cột `ctid` của `bang`; $1 = trần dòng. */
  ungVien: (bayGio: Date) => { sql: string; params: unknown[] };
}

const truoc = (bayGio: Date, ngay: number) => new Date(bayGio.getTime() - ngay * NGAY_MS).toISOString();

// Giữ — hằng số có lý do. Đổi số nào thì đổi lý do theo.
export const GIU_NGAY = {
  /** Bộ ảnh đã xoá hẳn: 30 ngày để còn kịp hỏi "ai xoá" nếu cần. */
  NHAT_KY_BO_ANH_DA_XOA: 30,
  /** Chống dò mã chỉ đọc 1 giờ gần nhất; patch từng ảnh chỉ để gỡ lỗi. */
  NHAT_KY_NHIEU: 90,
  /** Báo cáo hiệu suất đọc theo tháng/quý; 12 tháng đủ so cùng kỳ năm. */
  NHAT_KY_CU: 365,
  /** nhac-khach.ts chống nhắc trùng bằng cách đọc `notifications` trong cửa sổ vài ngày. */
  THONG_BAO_LARK_XONG: 90,
  /** guiLaiThongBaoDangCho thử lại hằng đêm tới SO_LAN_THU_TOI_DA; quá 90 ngày là bỏ. */
  THONG_BAO_LARK_HONG: 90,
  /** Hộp thư khách: tin đã đọc giữ 90 ngày; chưa đọc giữ 180 ngày. */
  HOP_THU_DA_DOC: 90,
  HOP_THU_CHUA_DOC: 180,
  /** Khoá chống ghi trùng chỉ cần trong vài phút/ngày; bộ đã xong thì 30 ngày là dư. */
  SELECTION_OPS: 30,
  /** Dòng Lark đã thành bộ ảnh; đồng bộ chỉ còn theo dõi chúng 30 ngày (ban-ghi-moi.ts). */
  BAN_GHI_MOI_LARK: 90,
  /** Mốc nhắc của một GIAI ĐOẠN đã qua không bao giờ khớp lại (nhac-hau-ky.ts so dot_tu). */
  NHAC_HAU_KY: 180,
  /** Bộ ảnh xong vòng đời nửa năm thì không còn tin gì để đẩy. */
  DANG_KY_DAY: 180,
} as const;

const BUOC: BuocDon[] = [
  {
    loai: "nhat_ky_bo_anh_da_xoa",
    bang: "activity_logs",
    giuNgay: GIU_NGAY.NHAT_KY_BO_ANH_DA_XOA,
    moTa: "Nhật ký của bộ ảnh đã bị xoá hẳn (trừ nhật ký tiền/hợp đồng/lệnh xoá)",
    lyDo: "Bộ ảnh không còn; màn dòng thời gian không bao giờ hiện lại. Trên bb-dev phần lớn là dấu vết phép thử.",
    ungVien: (b) => ({
      // Trigger 0051: xoá bộ ảnh → gallery_id NULL và entity_id NULL.
      sql: `select a.ctid from activity_logs a
             where a.entity_type = 'gallery' and a.entity_id is null and a.gallery_id is null
               and a.created_at < $2::timestamptz
               and not (a.action like any($3::text[]))
             order by a.created_at limit $1`,
      params: [truoc(b, GIU_NGAY.NHAT_KY_BO_ANH_DA_XOA), NHAT_KY_LUON_GIU],
    }),
  },
  {
    loai: "nhat_ky_nhieu",
    bang: "activity_logs",
    giuNgay: GIU_NGAY.NHAT_KY_NHIEU,
    moTa: "Nhật ký từng cú chạm (selection.patch, gallery.auth)",
    lyDo: "Ảnh khách chọn cuối cùng nằm ở selection_items; chống dò mã chỉ đọc 1 giờ gần nhất.",
    ungVien: (b) => ({
      sql: `select a.ctid from activity_logs a
             where a.action = any($3::text[]) and a.created_at < $2::timestamptz
             order by a.created_at limit $1`,
      params: [truoc(b, GIU_NGAY.NHAT_KY_NHIEU), NHAT_KY_NHIEU],
    }),
  },
  {
    loai: "nhat_ky_cu",
    bang: "activity_logs",
    giuNgay: GIU_NGAY.NHAT_KY_CU,
    moTa: "Nhật ký khác quá 12 tháng (trừ nhật ký tiền/hợp đồng/lệnh xoá/mở lại)",
    lyDo: "Báo cáo hiệu suất đọc theo tháng/quý; 12 tháng đủ so cùng kỳ.",
    ungVien: (b) => ({
      sql: `select a.ctid from activity_logs a
             where a.created_at < $2::timestamptz
               and not (a.action like any($3::text[]))
             order by a.created_at limit $1`,
      params: [truoc(b, GIU_NGAY.NHAT_KY_CU), NHAT_KY_LUON_GIU],
    }),
  },
  {
    loai: "thong_bao_lark_xong",
    bang: "notifications",
    giuNgay: GIU_NGAY.THONG_BAO_LARK_XONG,
    moTa: "Tin Lark đã gửi hoặc đã bỏ qua",
    lyDo: "Không ai gửi lại tin đã xong; chống nhắc trùng chỉ đọc vài ngày gần nhất.",
    ungVien: (b) => ({
      sql: `select n.ctid from notifications n
             where n.status in ('sent','skipped') and n.created_at < $2::timestamptz
             order by n.created_at limit $1`,
      params: [truoc(b, GIU_NGAY.THONG_BAO_LARK_XONG)],
    }),
  },
  {
    loai: "thong_bao_lark_hong",
    bang: "notifications",
    giuNgay: GIU_NGAY.THONG_BAO_LARK_HONG,
    moTa: "Tin Lark hỏng quá 90 ngày",
    lyDo: "Cron đêm chỉ thử lại tới số lần tối đa; tin 3 tháng tuổi không còn ý nghĩa.",
    ungVien: (b) => ({
      sql: `select n.ctid from notifications n
             where n.status = 'failed' and n.created_at < $2::timestamptz
             order by n.created_at limit $1`,
      params: [truoc(b, GIU_NGAY.THONG_BAO_LARK_HONG)],
    }),
  },
  {
    loai: "hop_thu_khach",
    bang: "thong_bao_khach",
    giuNgay: GIU_NGAY.HOP_THU_DA_DOC,
    moTa: "Hộp thư khách: đã đọc quá 90 ngày, chưa đọc quá 180 ngày",
    lyDo: "Chuông màn khách chỉ cần tin gần; nhắc tin chưa đọc chạy trong vài ngày đầu.",
    ungVien: (b) => ({
      sql: `select t.ctid from thong_bao_khach t
             where (t.da_doc_luc is not null and t.created_at < $2::timestamptz)
                or t.created_at < $3::timestamptz
             order by t.created_at limit $1`,
      params: [truoc(b, GIU_NGAY.HOP_THU_DA_DOC), truoc(b, GIU_NGAY.HOP_THU_CHUA_DOC)],
    }),
  },
  {
    loai: "selection_ops",
    bang: "selection_ops",
    giuNgay: GIU_NGAY.SELECTION_OPS,
    moTa: "Khoá chống ghi trùng của bộ ảnh đã xong vòng đời",
    lyDo: "Chỉ dùng để bỏ lệnh gửi lặp trong lúc khách đang chọn; bộ đã giao/lưu trữ/hết hạn thì không còn lệnh nào tới.",
    ungVien: (b) => ({
      sql: `select o.ctid from selection_ops o
              join selections s on s.id = o.selection_id
              join galleries g on g.id = s.gallery_id
             where o.applied_at < $2::timestamptz and g.status::text = any($3::text[])
             order by o.applied_at limit $1`,
      params: [truoc(b, GIU_NGAY.SELECTION_OPS), BO_ANH_XONG],
    }),
  },
  {
    loai: "ban_ghi_moi_lark",
    bang: "lark_ban_ghi_moi",
    giuNgay: GIU_NGAY.BAN_GHI_MOI_LARK,
    moTa: "Bản ghi mới từ Lark đã thành bộ ảnh",
    lyDo: "Đã rời khối 'chờ tạo bộ'; đồng bộ chỉ còn theo dõi 30 ngày. Dòng Lark xoá thì đồng bộ đã tự xoá.",
    ungVien: (b) => ({
      sql: `select r.ctid from lark_ban_ghi_moi r
             where r.gallery_id is not null and r.cap_nhat_luc < $2::timestamptz
             order by r.cap_nhat_luc limit $1`,
      params: [truoc(b, GIU_NGAY.BAN_GHI_MOI_LARK)],
    }),
  },
  {
    loai: "nhac_hau_ky",
    bang: "lark_nhac_da_gui",
    giuNgay: GIU_NGAY.NHAC_HAU_KY,
    moTa: "Dấu 'đã nhắc' của giai đoạn hậu kỳ đã qua",
    lyDo: "nhac-hau-ky.ts chỉ so với giai đoạn HIỆN TẠI (dot_tu); dấu của giai đoạn cũ không bao giờ được đọc lại.",
    ungVien: (b) => ({
      sql: `select n.ctid from lark_nhac_da_gui n
              join galleries g on g.id = n.gallery_id
             where n.dot_tu < $2::timestamptz
               and (g.status = 'archived' or g.lark_trang_thai_tu is distinct from n.dot_tu)
             order by n.dot_tu limit $1`,
      params: [truoc(b, GIU_NGAY.NHAC_HAU_KY)],
    }),
  },
  {
    loai: "dang_ky_day",
    bang: "push_dang_ky",
    giuNgay: GIU_NGAY.DANG_KY_DAY,
    moTa: "Đăng ký thông báo đẩy của bộ ảnh đã xong vòng đời quá 180 ngày",
    lyDo: "Không còn tin nào để đẩy. Đăng ký chết (404/410) đã bị xoá ngay lúc gửi (gui-day.ts).",
    ungVien: (b) => ({
      sql: `select p.ctid from push_dang_ky p
              join galleries g on g.id = p.gallery_id
             where g.status::text = any($3::text[]) and g.updated_at < $2::timestamptz
             order by g.updated_at limit $1`,
      params: [truoc(b, GIU_NGAY.DANG_KY_DAY), BO_ANH_XONG],
    }),
  },
];

// ---------------------------------------------------------------------------
// BB-357 — thu gọn danh sách ảnh của bộ ảnh cũ (anh chốt 02/10/2026)
// ---------------------------------------------------------------------------

export const THU_GON_ANH = {
  /**
   * 6 tháng kể từ lúc bộ VÀO trạng thái đã giao/lưu trữ/hết hạn (galleries.trang_thai_tu,
   * 0088) — và kể từ lần "Đồng bộ lại" gần nhất. Nửa năm không ai đụng một bộ đã
   * đóng thì khả năng mở lại rất thấp; mở lại vẫn được, bấm Đồng bộ lại là đủ ảnh.
   */
  SAU_NGAY: 180,
  /**
   * BB-359 (anh chốt 02/10/2026): thêm `delivered` — bộ ĐÃ GIAO quá 6 tháng cũng thu
   * gọn. Mốc vẫn là `trang_thai_tu` (lúc VÀO trạng thái đã giao; trigger 0088 ghi khi
   * status đổi, 0088 điền sẵn từ `deliveries.delivered_at`). Link app của gia đình vẫn
   * mở được lâu dài: khách mở một bộ đã thu gọn thì app tự Đồng bộ lại từ Drive ở nền
   * (POST /api/g/mo-lai-anh), khách thấy bìa + ảnh đã chọn ngay, đủ ảnh khi đồng bộ xong.
   */
  TRANG_THAI: ["delivered", "archived", "expired"] as readonly string[],
  /**
   * Mỗi lượt tối đa chừng này dòng ảnh — cùng trần với các bước khác, để một
   * lượt cron không nặng. Luôn làm NGUYÊN BỘ (bộ đầu tiên được nhận dù vượt
   * trần), không bao giờ thu gọn nửa bộ.
   */
  TRAN_ANH: TRAN_MOI_LOAI,
  /** Và tối đa chừng này bộ mỗi lượt (một dòng nhật ký mỗi bộ). */
  TRAN_BO: 50,
} as const;

/**
 * Khoá ngoại trỏ vào `photos` mà luật giữ bên dưới ĐÃ biết (đọc từ pg_constraint
 * ngày 02/10/2026). Lúc chạy, bước này đọc lại pg_constraint: gặp khoá ngoại MỚI
 * thì dừng hẳn, không đoán — xoá ảnh có thể kéo theo (CASCADE) dữ liệu chưa ai
 * xét tới.
 */
export const KHOA_NGOAI_PHOTOS_DA_BIET: readonly string[] = [
  "galleries.cover_photo_id", // SET NULL — bìa
  "selection_items.photo_id", // CASCADE — ảnh khách chọn (album_covers, selection_placements, selection_addon_photos đi qua selection_items)
  "selection_addons.photo_id", // CASCADE — sản phẩm kèm ảnh
  "yeu_cau_mua_them.photo_id", // SET NULL — yêu cầu mua thêm (BB-345)
  "tim_gia_dinh.photo_id", // CASCADE — gia đình thả tim (BB-345)
];

/**
 * Câu chọn ảnh SẼ XOÁ. Xem trước đếm trên đúng câu này, dọn thật xoá đúng câu
 * này. $1 = mốc (timestamptz), $2 = trần ảnh, $3 = trần bộ, $4 = trạng thái.
 *
 * Giữ lại (không bao giờ xoá):
 *   - status 'hidden': đồng bộ lại sẽ chèn lại thành 'active' → mất dấu "CSKH đã ẩn";
 *   - bìa của BẤT KỲ bộ nào;
 *   - ảnh có dòng ở selection_items / selection_addons / tim_gia_dinh / yeu_cau_mua_them;
 *   - ảnh nằm trong mảng anh_ids của yeu_cau_mua_them và selection_rounds (không có
 *     khoá ngoại — mảng uuid[] — nên phải tự giữ).
 */
/**
 * Điều kiện "bộ đủ tuổi thu gọn" — MỘT chỗ, dùng cho cả câu chọn lẫn câu kiểm
 * lại dưới khoá. Mốc = muộn hơn trong (lúc vào trạng thái, lần Đồng bộ lại cuối):
 * bộ vừa được bấm Đồng bộ lại để xem thì được để yên thêm 6 tháng.
 */
const dieuKienBo = (pMoc: string, pTrangThai: string) => `
       g.status::text = any(${pTrangThai}::text[])
       and g.danh_sach_thu_gon_luc is null
       and greatest(g.trang_thai_tu, coalesce(g.last_synced_at, g.trang_thai_tu)) < ${pMoc}::timestamptz`;

const SQL_BO_CHON = `
  bo as (
    select g.id, g.trang_thai_tu,
           coalesce(sum(coalesce(g.photo_count, 0)) over (order by g.trang_thai_tu, g.id
             rows between unbounded preceding and 1 preceding), 0) as truoc
      from galleries g
     where ${dieuKienBo("$1", "$4")}
  ),
  bo_chon as (
    select id from bo where truoc < $2 order by trang_thai_tu, id limit $3
  )`;

const SQL_ANH_XOA = `
  giu_mang as (
    select unnest(y.anh_ids) as id from yeu_cau_mua_them y
    union
    select unnest(r.anh_ids) from selection_rounds r
  ),
  anh as (
    select p.id, p.gallery_id
      from photos p
      join bo_chon b on b.id = p.gallery_id
     where p.status <> 'hidden'
       and not exists (select 1 from galleries g2 where g2.cover_photo_id = p.id)
       and not exists (select 1 from selection_items x where x.photo_id = p.id)
       and not exists (select 1 from selection_addons x where x.photo_id = p.id)
       and not exists (select 1 from tim_gia_dinh x where x.photo_id = p.id)
       and not exists (select 1 from yeu_cau_mua_them x where x.photo_id = p.id)
       and not exists (select 1 from giu_mang m where m.id = p.id)
  )`;

async function coCotThuGon(client: Pg): Promise<boolean> {
  const { rows } = await client.query<{ n: number }>(
    `select count(*)::int as n from information_schema.columns
      where table_schema = 'public' and table_name = 'galleries'
        and column_name in ('trang_thai_tu', 'danh_sach_thu_gon_luc', 'so_anh_truoc_thu_gon')`,
  );
  return rows[0]?.n === 3;
}

/** Khoá ngoại trỏ vào photos mà luật giữ CHƯA biết. Rỗng = an toàn. */
export async function khoaNgoaiPhotosLa(client: Pg): Promise<string[]> {
  const { rows } = await client.query<{ cot: string }>(
    `select c.conrelid::regclass::text || '.' || a.attname as cot
       from pg_constraint c
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
      where c.contype = 'f' and c.confrelid = 'public.photos'::regclass`,
  );
  return rows.map((r) => r.cot.replace(/^public\./, "")).filter((c) => !KHOA_NGOAI_PHOTOS_DA_BIET.includes(c));
}

export interface KetQuaThuGon extends KetQuaLoai {
  /** Số bộ ảnh được thu gọn (hoặc SẼ thu gọn) trong lượt này. */
  boAnh: number;
  /** Số ảnh được GIỮ trong các bộ đó (bìa, ảnh khách chọn…). */
  anhGiu: number;
}

/**
 * Một lượt thu gọn. Gọi từ `donRac` (cùng giao dịch/khoá/hạn giờ với các bước
 * khác). Xem trước: chỉ đếm. Dọn thật: xoá dòng ảnh, đánh dấu bộ, cập nhật
 * photo_count về số ảnh còn lại, ghi một dòng nhật ký cho mỗi bộ.
 */
export async function thuGonAnhBoCu(
  client: Pg,
  tuyChon: { thuTruoc: boolean; bayGio: Date; tran: number; gd: NonNullable<TuyChonDonRac["giaoDich"]>; chiDoc: boolean },
): Promise<KetQuaThuGon> {
  const goc = { loai: "anh_bo_cu" as const, bang: "photos", xoa: 0, giu: 0, conLai: 0, uocTinhByte: 0, boAnh: 0, anhGiu: 0 };
  const { thuTruoc, bayGio, gd } = tuyChon;
  const tranAnh = Math.max(1, Math.min(tuyChon.tran, THU_GON_ANH.TRAN_ANH));
  const moc = truoc(bayGio, THU_GON_ANH.SAU_NGAY);
  const trangThai = [...THU_GON_ANH.TRANG_THAI];

  await gd.mo(client);
  try {
    if (tuyChon.chiDoc) await client.query("set transaction read only");
    await client.query(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

    if (!(await coCotThuGon(client))) {
      await gd.huy(client);
      return { ...goc, boQua: "chờ áp migration 0088" };
    }
    const la = await khoaNgoaiPhotosLa(client);
    if (la.length > 0) {
      await gd.huy(client);
      return { ...goc, loi: `có khoá ngoại mới trỏ vào photos (${la.join(", ")}) — cần xét luật giữ trước khi thu gọn` };
    }

    const { rows: coRows } = await client.query<{ n: number; byte: string }>(
      `select count(*)::int as n, pg_total_relation_size('photos')::bigint as byte from photos`,
    );
    const tongDong = coRows[0]?.n ?? 0;
    const byteMoiDong = tongDong > 0 ? Number(coRows[0]?.byte ?? 0) / tongDong : 0;

    // Tổng ứng viên KHÔNG trần — để báo "còn lại, lượt sau làm tiếp".
    const { rows: tong } = await client.query<{ n: number }>(
      `with ${SQL_BO_CHON}, ${SQL_ANH_XOA} select count(*)::int as n from anh`,
      [moc, TRAN_DEM * 1000, TRAN_DEM, trangThai],
    );
    const tongUngVien = tong[0]?.n ?? 0;

    const { rows: boRows } = await client.query<{ id: string }>(
      `with ${SQL_BO_CHON} select id from bo_chon`,
      [moc, tranAnh, THU_GON_ANH.TRAN_BO, trangThai],
    );
    let boIds = boRows.map((r) => r.id);

    if (thuTruoc) {
      const { rows: dem } = await client.query<{ xoa: number; tong: number }>(
        `with ${SQL_BO_CHON}, ${SQL_ANH_XOA}
         select (select count(*)::int from anh) as xoa,
                (select count(*)::int from photos p join bo_chon b on b.id = p.gallery_id) as tong`,
        [moc, tranAnh, THU_GON_ANH.TRAN_BO, trangThai],
      );
      await gd.huy(client);
      const xoa = dem[0]?.xoa ?? 0;
      return {
        ...goc,
        xoa,
        boAnh: boIds.length,
        anhGiu: Math.max(0, (dem[0]?.tong ?? 0) - xoa),
        giu: Math.max(0, tongDong - xoa),
        conLai: Math.max(0, tongUngVien - xoa),
        uocTinhByte: Math.round(xoa * byteMoiDong),
      };
    }

    // Khoá các bộ đã chọn và KIỂM LẠI điều kiện dưới khoá: một lượt "Đồng bộ
    // lại" hay đổi trạng thái chen vào giữa thì bộ đó rớt khỏi lượt này.
    if (boIds.length > 0) {
      const { rows: khoa } = await client.query<{ id: string }>(
        `select g.id from galleries g
          where g.id = any($1::uuid[]) and ${dieuKienBo("$3", "$2")}
          for update`,
        [boIds, trangThai, moc],
      );
      boIds = khoa.map((r) => r.id);
    }
    if (boIds.length === 0) {
      await gd.xong(client);
      return { ...goc, giu: tongDong, conLai: tongUngVien };
    }

    // Xoá: cùng SQL_ANH_XOA, nhưng bo_chon là đúng các bộ đã khoá.
    const { rows: daXoa } = await client.query<{ gallery_id: string; n: number }>(
      `with bo_chon as (select unnest($1::uuid[]) as id), ${SQL_ANH_XOA},
            xoa as (delete from photos p using anh where p.id = anh.id returning p.gallery_id)
       select gallery_id::text, count(*)::int as n from xoa group by gallery_id`,
      [boIds],
    );
    const xoaTheoBo = new Map(daXoa.map((r) => [r.gallery_id, r.n]));
    const xoa = daXoa.reduce((s, r) => s + r.n, 0);

    // photo_count = số ảnh 'active' còn lại (đúng nghĩa verify:db kiểm);
    // số cũ cất ở so_anh_truoc_thu_gon. Không đụng last_synced_at → trigger 0088
    // không xoá dấu vừa ghi.
    const { rows: capNhat } = await client.query<{ id: string; branch_id: string | null; truoc: number; con: number }>(
      `update galleries g
          set danh_sach_thu_gon_luc = $2::timestamptz,
              so_anh_truoc_thu_gon = g.photo_count,
              photo_count = (select count(*)::int from photos p where p.gallery_id = g.id and p.status = 'active')
        where g.id = any($1::uuid[])
        returning g.id::text, g.branch_id::text, g.so_anh_truoc_thu_gon as truoc, g.photo_count as con`,
      [boIds, bayGio.toISOString()],
    );
    for (const g of capNhat) {
      await client.query(
        `insert into activity_logs (actor_type, actor_label, action, entity_type, entity_id, gallery_id, branch_id, metadata)
         values ('system', 'don_rac', 'gallery.thu_gon_anh', 'gallery', $1, $1, $2, $3::jsonb)`,
        [g.id, g.branch_id, JSON.stringify({ xoa: xoaTheoBo.get(g.id) ?? 0, soAnhTruoc: g.truoc, conLai: g.con })],
      );
    }
    await gd.xong(client);

    return {
      ...goc,
      xoa,
      boAnh: capNhat.length,
      anhGiu: capNhat.reduce((s, g) => s + g.con, 0),
      giu: Math.max(0, tongDong - xoa),
      conLai: Math.max(0, tongUngVien - xoa),
      uocTinhByte: Math.round(xoa * byteMoiDong),
    };
  } catch (err) {
    try {
      await gd.huy(client);
    } catch {
      /* giao dịch đã đóng */
    }
    return { ...goc, loi: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) };
  }
}

const CHINH_SACH_THU_GON: ChinhSachDon = {
  loai: "anh_bo_cu",
  bang: "photos",
  giuNgay: THU_GON_ANH.SAU_NGAY,
  moTa: "Danh sách ảnh của bộ đã giao/lưu trữ/hết hạn quá 6 tháng (giữ bìa, ảnh khách chọn, ảnh mua thêm/thả tim)",
  lyDo: "Ảnh gốc vẫn trên Drive; khách mở lại thì app tự Đồng bộ lại (hoặc CSKH bấm Đồng bộ lại). Bảng photos chiếm ~60% cơ sở dữ liệu.",
};

/** Chính sách để màn hình và bàn giao in ra (không lộ SQL). */
export const CHINH_SACH: readonly ChinhSachDon[] = [
  ...BUOC.map(({ loai, bang, giuNgay, moTa, lyDo }) => ({ loai, bang, giuNgay, moTa, lyDo })),
  CHINH_SACH_THU_GON,
];

/**
 * Các bảng VẬN HÀNH mà các bước BUOC được phép xoá. Phép thử kiểm danh sách này.
 * Bảng `photos` của bước BB-357 cố ý KHÔNG nằm ở đây — xem BANG_THU_GON.
 */
export const BANG_DUOC_DON: readonly string[] = [...new Set(BUOC.map((b) => b.bang))];
/** Bảng nghiệp vụ DUY NHẤT người dọn được xoá dòng (bước anh_bo_cu, BB-357). */
export const BANG_THU_GON: readonly string[] = ["photos"];

export interface KetQuaLoai {
  loai: LoaiDon;
  bang: string;
  /** Số dòng đã xoá (dọn thật) hoặc SẼ xoá trong lượt này (xem trước) — tối đa `tran`. */
  xoa: number;
  /** Số dòng còn lại trong bảng sau lượt này. */
  giu: number;
  /** Ứng viên còn lại vượt trần — lượt sau dọn tiếp. */
  conLai: number;
  /** Ước tính byte được giải phóng (gồm phần chỉ mục), theo cỡ trung bình một dòng. */
  uocTinhByte: number;
  loi?: string;
  /** Bước không chạy vì lý do bình thường (vd migration chưa áp) — không phải lỗi. */
  boQua?: string;
}

export interface KetQuaDonRac {
  thuTruoc: boolean;
  luc: string;
  ketQua: KetQuaLoai[];
  tongXoa: number;
  tongUocTinhByte: number;
  hetGio: boolean;
}

export interface TuyChonDonRac {
  /** true = chỉ ĐẾM, không xoá gì (mặc định). */
  thuTruoc?: boolean;
  bayGio?: Date;
  tran?: number;
  /** Hạn giờ cho CẢ lượt (ms). Hết giờ thì các bước còn lại bỏ qua. */
  hanMs?: number;
  chiLoai?: LoaiDon[];
  /**
   * Cách mở/đóng giao dịch mỗi bước. Mặc định `begin`/`commit`. Phép thử truyền
   * savepoint để cả lượt nằm trong MỘT giao dịch ngoài rồi rollback — bb-dev
   * không mất dòng nào.
   */
  giaoDich?: { mo: (c: Pg) => Promise<void>; xong: (c: Pg) => Promise<void>; huy: (c: Pg) => Promise<void> };
}

const GIAO_DICH_MAC_DINH = {
  mo: async (c: Pg) => {
    await c.query("begin");
  },
  xong: async (c: Pg) => {
    await c.query("commit");
  },
  huy: async (c: Pg) => {
    await c.query("rollback");
  },
};

/**
 * Đang chạy phép thử (Vitest, hoặc máy chủ `next dev` của Playwright). Không có
 * cửa thoát: bb-dev là DB thật của studio, phép thử KHÔNG BAO GIỜ được xoá thật
 * bằng giao dịch mặc định. Phép thử muốn kiểm câu `delete` thì truyền
 * `giaoDich` (savepoint trong một giao dịch ngoài rồi rollback).
 */
export function dangTrongPhepThu(): boolean {
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test" || process.env.PHEP_THU_TRINH_DUYET === "1";
}

/** Một lượt dọn. Mặc định là XEM TRƯỚC — muốn xoá thật phải nói `thuTruoc: false`. */
export async function donRac(client: Pg, tuyChon: TuyChonDonRac = {}): Promise<KetQuaDonRac> {
  // Trong phép thử mà không truyền giao dịch riêng thì ép về xem trước.
  const thuTruoc = tuyChon.thuTruoc !== false || (!tuyChon.giaoDich && dangTrongPhepThu());
  const bayGio = tuyChon.bayGio ?? new Date();
  const tran = Math.max(1, Math.min(tuyChon.tran ?? TRAN_MOI_LOAI, TRAN_MOI_LOAI));
  const hanLuc = Date.now() + (tuyChon.hanMs ?? 40_000);
  const gd = tuyChon.giaoDich ?? GIAO_DICH_MAC_DINH;
  const buoc = tuyChon.chiLoai ? BUOC.filter((b) => tuyChon.chiLoai!.includes(b.loai)) : BUOC;

  const ketQua: KetQuaLoai[] = [];
  let hetGio = false;

  for (const b of buoc) {
    if (Date.now() >= hanLuc) {
      hetGio = true;
      ketQua.push({ loai: b.loai, bang: b.bang, xoa: 0, giu: 0, conLai: 0, uocTinhByte: 0, loi: "hết giờ, lượt sau làm tiếp" });
      continue;
    }
    const { sql, params } = b.ungVien(bayGio);
    try {
      await gd.mo(client);
      // Xem trước bằng giao dịch mặc định: khoá CHỈ ĐỌC — có lỡ tay thì Postgres từ chối ghi.
      if (thuTruoc && !tuyChon.giaoDich) await client.query("set transaction read only");
      await client.query(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

      const { rows: coRows } = await client.query<{ n: number; byte: string }>(
        `select count(*)::int as n, pg_total_relation_size($1::regclass)::bigint as byte from ${b.bang}`,
        [b.bang],
      );
      const tongDong = coRows[0]?.n ?? 0;
      const byteMoiDong = tongDong > 0 ? Number(coRows[0]?.byte ?? 0) / tongDong : 0;

      // Tổng ứng viên (không trần) — để báo "còn lại, lượt sau dọn tiếp".
      const { rows: dem } = await client.query<{ n: number }>(
        `select count(*)::int as n from (${sql}) u`,
        [TRAN_DEM, ...params],
      );
      const tongUngVien = dem[0]?.n ?? 0;

      let xoa: number;
      if (thuTruoc) {
        xoa = Math.min(tongUngVien, tran);
        await gd.huy(client);
      } else {
        const del = await client.query(`delete from ${b.bang} where ctid in (${sql})`, [tran, ...params]);
        xoa = del.rowCount ?? 0;
        await gd.xong(client);
      }

      ketQua.push({
        loai: b.loai,
        bang: b.bang,
        xoa,
        giu: Math.max(0, tongDong - xoa),
        conLai: Math.max(0, tongUngVien - xoa),
        uocTinhByte: Math.round(xoa * byteMoiDong),
      });
    } catch (err) {
      try {
        await gd.huy(client);
      } catch {
        /* giao dịch đã đóng */
      }
      ketQua.push({
        loai: b.loai,
        bang: b.bang,
        xoa: 0,
        giu: 0,
        conLai: 0,
        uocTinhByte: 0,
        loi: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200),
      });
    }
  }

  // BB-357 — bước thu gọn ảnh chạy SAU các bước vận hành, với phần giờ còn lại.
  if (!tuyChon.chiLoai || tuyChon.chiLoai.includes("anh_bo_cu")) {
    if (Date.now() >= hanLuc) {
      hetGio = true;
      ketQua.push({ loai: "anh_bo_cu", bang: "photos", xoa: 0, giu: 0, conLai: 0, uocTinhByte: 0, loi: "hết giờ, lượt sau làm tiếp" });
    } else {
      ketQua.push(
        await thuGonAnhBoCu(client, { thuTruoc, bayGio, tran, gd, chiDoc: thuTruoc && !tuyChon.giaoDich }),
      );
    }
  }

  return {
    thuTruoc,
    luc: bayGio.toISOString(),
    ketQua,
    tongXoa: ketQua.reduce((s, k) => s + k.xoa, 0),
    tongUocTinhByte: ketQua.reduce((s, k) => s + k.uocTinhByte, 0),
    hetGio,
  };
}

/**
 * Ghi MỘT dòng nhật ký cho lượt dọn — chỉ con số, không có nội dung dòng nào.
 * Không ném: lượt dọn đã xong, ghi nhật ký hụt chỉ kêu ra log.
 */
export async function ghiNhatKyDonRac(
  client: Pg,
  kq: KetQuaDonRac,
  ai: { actorType: "staff" | "system"; actorId?: string | null; actorLabel: string },
): Promise<void> {
  try {
    await client.query(
      `insert into activity_logs (actor_type, actor_id, actor_label, action, entity_type, metadata)
       values ($1, $2, $3, 'van_hanh.don_rac', 'van_hanh', $4::jsonb)`,
      [
        ai.actorType,
        ai.actorId ?? null,
        ai.actorLabel,
        JSON.stringify({
          thuTruoc: kq.thuTruoc,
          tongXoa: kq.tongXoa,
          tongUocTinhByte: kq.tongUocTinhByte,
          hetGio: kq.hetGio,
          theoLoai: Object.fromEntries(kq.ketQua.map((k) => [k.loai, { xoa: k.xoa, conLai: k.conLai, loi: k.loi ? 1 : 0 }])),
        }),
      ],
    );
  } catch (err) {
    console.error(
      JSON.stringify({ evt: "van_hanh.don_rac.ghi_nhat_ky_hut", loi: err instanceof Error ? err.message : String(err) }),
    );
  }
}

/**
 * BB-357 — dấu "danh sách ảnh đã thu gọn" của MỘT bộ cho màn chi tiết quản trị.
 * 0088 chưa áp (cột chưa có) hoặc đọc lỗi → null: màn hình chỉ không hiện dòng
 * nhắc, không hỏng gì.
 */
export async function docDauThuGon(
  admin: {
    from: (bang: string) => {
      select: (cot: string) => {
        eq: (cot: string, v: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
      };
    };
  },
  galleryId: string,
): Promise<{ luc: string; soAnhTruoc: number | null } | null> {
  const { data, error } = await admin
    .from("galleries")
    .select("danh_sach_thu_gon_luc, so_anh_truoc_thu_gon")
    .eq("id", galleryId)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as { danh_sach_thu_gon_luc: string | null; so_anh_truoc_thu_gon: number | null };
  return d.danh_sach_thu_gon_luc ? { luc: d.danh_sach_thu_gon_luc, soAnhTruoc: d.so_anh_truoc_thu_gon ?? null } : null;
}
