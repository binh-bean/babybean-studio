#!/usr/bin/env node
/**
 * nap-lai-tu-lark — xoá sạch dữ liệu nghiệp vụ rồi nạp lại từ đầu theo Lark.
 *
 * OWNER: DEV-OPS. Task BB-300.
 * Spec: chủ studio chốt — trước khi mở app cho khách phải xoá sạch dữ liệu cũ
 * rồi nạp lại từ đầu theo Lark, để không ai còn hoài nghi dữ liệu app có khớp
 * với Lark hay không.
 *
 * Chạy:
 *   npm run db:nap-lai                                -- --dem (mặc định, chỉ đọc)
 *   npm run db:nap-lai -- --sao-luu "D:/duong/dan"     -- xuất JSON, không xoá
 *   npm run db:nap-lai -- --xoa --xac-nhan ABC123      -- xoá thật
 *   npm run db:nap-lai -- --xoa --xac-nhan ABC123 \
 *       --tu "D:/duong/dan/<thư-mục-lượt-sao-lưu>"     -- chỉ đích danh bản sao lưu, bỏ qua tệp mốc
 *   npm run db:nap-lai -- --that-su-la-bb-dev ...       -- bắt buộc khi SUPABASE_DB_URL trỏ vào bb-dev
 *   npm run db:nap-lai -- --nap                        -- nạp lại từ Lark
 *   npm run db:nap-lai -- --khoi-phuc "D:/duong/dan/<thư-mục-lượt-sao-lưu>"
 *                                                        -- nạp lại TỪ MỘT BẢN SAO LƯU (không phải từ Lark)
 *                                                           thêm --buoc-khoi-phuc để ghi đè bảng đang có dữ liệu
 *
 * --sao-luu ghi kèm một tệp mốc `sao-luu-gan-nhat.json` vào thư mục MẶC ĐỊNH
 * (BACKUP_DIR hoặc <cha của repo>/babybean-sao-luu), trỏ tới đúng thư mục vừa
 * ghi — dù thư mục đó nằm ở đâu. --xoa (không có --tu) đọc tệp mốc này trước
 * tiên. Đây là cách hai bước NỐI với nhau; xem ghiMocSaoLuuGanNhat().
 *
 * ---------------------------------------------------------------------------
 * Bốn bước, bốn cờ riêng — cố ý không gộp
 * ---------------------------------------------------------------------------
 * Một lệnh vừa đếm vừa xoá là một lệnh mà gõ Enter nhầm một lần là mất dữ
 * liệu. Bốn cờ tách rời buộc người chạy đi qua từng bước, và bước xoá đòi một
 * mã chỉ bước đếm mới in ra — không thể xoá mà chưa từng nhìn thấy số.
 *
 * ---------------------------------------------------------------------------
 * Bảng GIỮ NGUYÊN, và vì sao
 * ---------------------------------------------------------------------------
 * "Xoá sạch rồi nạp lại từ Lark" chỉ đúng với dữ liệu mà Lark THỰC SỰ là nguồn
 * sự thật: khách, bé, buổi chụp, bộ ảnh, hợp đồng, lượt chọn. Sáu bảng dưới
 * đây Lark không hề biết tới — chúng là cấu hình của app, xoá xong không có gì
 * nạp lại được:
 *
 *   branches        chi nhánh       — Lark không có bảng "chi nhánh app".
 *   staff_profiles  nhân sự         — tài khoản đăng nhập nằm ở auth.users,
 *                                     xoá staff_profiles là khoá luôn tài
 *                                     khoản, không đồng bộ lại từ Lark được.
 *   staff_branches  nhân sự↔chi nhánh — đi cùng staff_profiles.
 *   roles           cấu hình vai trò — phân quyền tự tạo trong app (BB-172).
 *   packages        sản phẩm (gói chụp) — danh mục giá, không phải dữ liệu
 *                                     của một khách cụ thể.
 *   products        sản phẩm (danh mục) — CÓ đồng bộ từ Lark, nhưng bằng
 *                                     UPSERT (on conflict lark_record_id),
 *                                     không cần xoá trước; xoá rồi nạp lại sẽ
 *                                     phát sinh lark_record_id trùng lặp giả.
 *   settings        cài đặt         — cấu hình vận hành, không phải dữ liệu
 *                                     khách.
 *
 * BB-352 (01/10/2026): luật cũ "bảng lạ tự rơi vào diện xoá" đã bỏ — nó xoá nhầm
 * `schema_migrations` và cho chín bảng mới đứng sai chỗ trong thứ tự xoá. Nay MỌI
 * bảng phải có tên trong PHAN_LOAI_BANG (giữ / nạp lại từ Lark / xoá dữ liệu
 * thử), và gặp bảng chưa có tên thì công cụ DỪNG ở mọi chế độ. Xem PHAN_LOAI_BANG.
 *
 * ---------------------------------------------------------------------------
 * Thứ tự xoá
 * ---------------------------------------------------------------------------
 * Xoá cả bảng (không lọc theo id) nên không cần join phức tạp, nhưng vẫn phải
 * đi từ lá vào gốc để không vỡ khoá ngoại NOT NULL. Thứ tự dưới đây do người
 * viết truy theo db/schema.sql và db/migrations/0033, và được KIỂM LẠI BẰNG
 * MÁY mỗi lần chạy: `kiemTraThuTuAnToan()` đọc pg_constraint thật và từ chối
 * chạy nếu thứ tự hardcode dưới đây không còn khớp sơ đồ khoá ngoại hiện tại.
 *
 * Vòng riêng: `galleries.cover_photo_id -> photos` là khoá ngoại cho-rỗng, xử
 * lý bằng cách gỡ nó về null trước khi xoá `photos` (giống cách backup.mjs xử
 * lý cùng vòng này).
 * ---------------------------------------------------------------------------
 * Vì sao thứ tự script sync-lark-* KHÁC với mô tả bằng lời
 * ---------------------------------------------------------------------------
 * Chủ studio mô tả thứ tự "danh mục → hợp đồng → hậu kỳ → chỉnh sửa". Nhưng
 * đọc mã: `sync-lark-contracts.mjs` chỉ ghi gallery_items cho những album ĐÃ
 * TỒN TẠI (nó tự thoát sớm, in "Chưa album nào có lark_contract_code" nếu
 * không thấy) — còn chính album, khách, bé, buổi chụp là do
 * `sync-lark-hauky.mjs` TẠO RA. Chạy "hợp đồng" trước "hậu kỳ" trên một cơ sở
 * dữ liệu vừa xoá sạch sẽ không lỗi (thoát mã 0) nhưng không ghi được gì —
 * một bước --nap "xanh" mà không nạp nổi một dòng hàng nào.
 *
 * Nên thứ tự THỰC THI ở đây là: danh mục (products) → hậu kỳ (tạo khách/bộ
 * ảnh) → hợp đồng (điền dòng hàng) → chỉnh sửa. Giữ nguyên ý "bốn script,
 * dừng ở lỗi đầu tiên", chỉ đổi lại thứ tự cho đúng phụ thuộc thật.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { maDuAn } from "../src/lib/lark/muc-tieu-du-lieu.ts";
import { inMoiTruong, kiemTraMoiTruongChoPhep, kiemTraCoBbProd } from "./lib/moi-truong.mjs";
import { docTepEnv } from "./lib/doc-tep-env.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const GOC_REPO = path.resolve(__dirname, "..");

/** Mã dự án Supabase của bb-dev. Xem src/lib/lark/muc-tieu-du-lieu.ts. */
export const MA_BB_DEV = "ohkfoqqsrpvsponiwcij";

/**
 * Bảng KHÔNG bị xoá. Lý do từng bảng ghi ở đầu tệp.
 *
 * ---------------------------------------------------------------------------
 * 28/09/2026 — admin chốt thu hẹp danh sách này (BB-311 mục B)
 * ---------------------------------------------------------------------------
 * Trước đây `packages` và `products` cũng nằm trong danh sách giữ. Từ hôm nay:
 *
 *   products  CHUYỂN SANG XOÁ — xem THU_TU_XOA. Lý do đổi: báo cáo vận hành
 *             vòng 4 (28/09/2026 §6) phát hiện hai dòng "Fixture BB-279 Album"
 *             / "Fixture BB-279 In ảnh 30x40" đang BÀY BÁN cho khách thật vì
 *             sản phẩm phép thử chưa dọn hết. `products` CÓ đồng bộ đầy đủ từ
 *             Lark qua bước "danh mục sản phẩm" (`sync:catalog`, upsert theo
 *             `lark_record_id`) — xoá sạch rồi nạp lại là cách chắc chắn nhất
 *             dọn hết rác Fixture/TEST còn sót, không phải chỉ tắt is_active
 *             từng dòng.
 *
 *   packages  VẪN GIỮ — KHÔNG chuyển sang xoá, dù admin có nhắc tới trong yêu
 *             cầu ngày 28/09. Đã KIỂM TRA: không có script `sync-lark-*` nào
 *             ghi vào bảng `packages` (chỉ `sync-lark-catalog.mjs` ghi
 *             `products`; grep `scripts/*.mjs` cho "packages" chỉ ra hai tệp
 *             — `verify-db.mjs` (chỉ đọc, kiểm schema) và chính tệp này,
 *             không tệp nào NẠP dữ liệu packages). Bảng `packages` là danh
 *             mục giá "gói chụp" do APP tự quản (không có nguồn Lark tương
 *             ứng) — xoá bảng này mà không có bước --nap nào nạp lại sẽ để
 *             app THIẾU VĨNH VIỄN toàn bộ gói chụp sau khi chạy --nap, không
 *             có cách phục hồi tự động nào ngoài bản sao lưu (bước 2). ĐÂY LÀ
 *             QUYẾT ĐỊNH CẦN ADMIN XÁC NHẬN LẠI — xem bàn giao BB-311: nếu
 *             admin thật sự muốn xoá packages, cần trả lời trước "packages"
 *             sẽ nạp lại từ đâu (viết script đồng bộ mới, hay chấp nhận gõ
 *             tay lại toàn bộ gói chụp sau khi xoá?).
 */
/**
 * ---------------------------------------------------------------------------
 * 01/10/2026 — BB-352: MỌI bảng phải có tên trong bảng phân loại này
 * ---------------------------------------------------------------------------
 * Lỗi cũ (vòng 7, soát C): bảng lạ "rơi vào diện xoá, kèm cảnh báo". Hai bảng
 * mới thêm sau BB-300 đã làm lộ chỗ hổng của luật đó:
 *
 *   - `schema_migrations` (0076) bị xếp vào "sẽ xoá" — `--xoa` xoá sổ ghi nhận
 *     39 migration đã áp, và `migrate-prod` sau đó áp lại cả dãy 0045+ lên một
 *     cơ sở dữ liệu đã có dữ liệu thật.
 *   - Chín bảng 0062–0083 (`yeu_cau_mua_them`…) đứng cuối danh sách xoá, SAU
 *     `products` — mà `yeu_cau_mua_them.product_id` là khoá ngoại BẮT BUỘC không
 *     cascade tới `products`, nên `delete from products` sẽ gãy giữa giao dịch.
 *
 * Nay luật là: **bảng chưa có trong PHAN_LOAI_BANG thì công cụ DỪNG, không làm
 * gì cả** (xem `phanLoaiBang().chuaPhanLoai`). Thêm bảng mới = thêm một dòng ở
 * đây, kèm lý do, rồi mới chạy được. Không còn "im lặng xoá" nữa.
 *
 * Ba nhóm:
 *   "giu"             GIỮ NGUYÊN — cấu hình / sổ ghi nhận của chính app.
 *   "nap-lai-tu-lark" XOÁ rồi `--nap` dựng lại từ Lark (và ảnh từ Drive).
 *   "xoa-du-lieu-thu" XOÁ, KHÔNG nạp lại — Lark không biết tới chúng; đây là dữ
 *                     liệu app sinh ra khi dùng thử (lựa chọn của khách, link,
 *                     thông báo, sổ thu). CHỈ đúng khi chưa có khách thật dùng:
 *                     từ lúc khách đầu tiên bấm chọn ảnh trên bb-prod, KHÔNG
 *                     chạy `--xoa` trên bb-prod nữa (docs/26 mục 0.3).
 */
export const NHOM_GIU = "giu";
export const NHOM_NAP_LAI_TU_LARK = "nap-lai-tu-lark";
export const NHOM_XOA_DU_LIEU_THU = "xoa-du-lieu-thu";

export const PHAN_LOAI_BANG = {
  // ---- giữ nguyên ----------------------------------------------------------
  branches: { nhom: NHOM_GIU, lyDo: "chi nhánh — Lark không có bảng chi nhánh của app" },
  staff_profiles: { nhom: NHOM_GIU, lyDo: "nhân sự — tài khoản đăng nhập nằm ở auth.users" },
  staff_branches: { nhom: NHOM_GIU, lyDo: "nhân sự ↔ chi nhánh, đi cùng staff_profiles" },
  roles: { nhom: NHOM_GIU, lyDo: "vai trò tự tạo trong app (BB-172)" },
  settings: { nhom: NHOM_GIU, lyDo: "cài đặt vận hành (webhook, hàng đợi hook, mốc đồng bộ)" },
  packages: { nhom: NHOM_GIU, lyDo: "gói chụp — danh mục app tự quản, không script nào nạp lại" },
  goi_chup_gia_anh_them: {
    nhom: NHOM_GIU,
    lyDo: "giá ảnh thêm theo mã gói (0100) — cấu hình Admin nhập ở màn Gói chụp, khoá theo ma_goi, không trỏ dữ liệu bị xoá",
  },
  schema_migrations: {
    nhom: NHOM_GIU,
    lyDo: "sổ ghi nhận migration đã áp (0076) — xoá là migrate-prod áp lại cả dãy lên dữ liệu thật",
  },

  // ---- xoá rồi nạp lại từ Lark / Drive -------------------------------------
  customers: { nhom: NHOM_NAP_LAI_TU_LARK, lyDo: "khách — sync:hauky" },
  babies: { nhom: NHOM_NAP_LAI_TU_LARK, lyDo: "bé — sync:hauky" },
  shoots: { nhom: NHOM_NAP_LAI_TU_LARK, lyDo: "buổi chụp — sync:hauky" },
  galleries: { nhom: NHOM_NAP_LAI_TU_LARK, lyDo: "bộ ảnh — sync:hauky" },
  photos: { nhom: NHOM_NAP_LAI_TU_LARK, lyDo: "ảnh — bước đồng bộ Drive của --nap" },
  gallery_items: { nhom: NHOM_NAP_LAI_TU_LARK, lyDo: "dòng hàng hợp đồng — sync:contracts" },
  products: { nhom: NHOM_NAP_LAI_TU_LARK, lyDo: "danh mục sản phẩm — sync:catalog (BB-311)" },
  lark_ban_ghi_moi: {
    nhom: NHOM_NAP_LAI_TU_LARK,
    lyDo: "bản sao chỉ-đọc của dòng Hậu Kỳ chưa có bộ ảnh (0079) — hook/cron dựng lại",
  },

  // ---- xoá, KHÔNG nạp lại: dữ liệu dùng thử của app ------------------------
  selection_placements: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "ảnh đặt vào sản phẩm in" },
  selection_addon_photos: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "ảnh trong album mua thêm (0062)" },
  selection_addons: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "sản phẩm khách mua thêm" },
  selection_ops: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "nhật ký thao tác chọn ảnh" },
  selection_items: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "ảnh khách thả tim / chọn" },
  selection_rounds: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "đợt chọn thêm ảnh (0077)" },
  selections: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "lượt chọn của khách" },
  album_covers: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "bìa album khách chọn (0075)" },
  anh_album_khong_chinh: {
    nhom: NHOM_XOA_DU_LIEU_THU,
    lyDo: "tấm khách chọn cho album, không chỉnh (0093, BB-374)",
  },
  gallery_payments: {
    nhom: NHOM_XOA_DU_LIEU_THU,
    lyDo: "sổ ghi thu — CHỈ là dữ liệu thử trước ngày mở; sau đó là sổ tiền thật, không được xoá",
  },
  share_links: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "link chia sẻ — mã mới sau khi nạp" },
  share_link_ma: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "bản mã hoá của link (0070), đi cùng share_links" },
  tim_gia_dinh: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "tim của link mời gia đình (0083)" },
  push_dang_ky: {
    nhom: NHOM_XOA_DU_LIEU_THU,
    lyDo: "đăng ký thông báo đẩy (0071) — gắn gallery_id cũ nên mồ côi; khách phải bật lại",
  },
  thong_bao_khach: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "hộp thư chuông của khách (0074)" },
  lark_nhac_da_gui: {
    nhom: NHOM_XOA_DU_LIEU_THU,
    lyDo: "sổ tin nhắc đã gửi (0067) — bộ ảnh mới id mới; cron kế tiếp có thể nhắc lại mốc chưa quá trễ một lần",
  },
  yeu_cau_mua_them: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "yêu cầu mua lần hai của khách (0072)" },
  revision_request_items: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "chi tiết từng tấm của vòng sửa ảnh chỉnh (0091)" },
  anh_chinh_duyet_tam: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "tấm ảnh chỉnh ba mẹ bấm Duyệt tấm này (0108, BB-401)" },
  revision_requests: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "vòng duyệt ảnh chỉnh" },
  anh_chinh_dot: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "mốc gửi/duyệt ảnh chỉnh theo đợt mua thêm (0095)" },
  hoa_don_bo_anh: {
    nhom: NHOM_XOA_DU_LIEU_THU,
    lyDo: "mã hoá đơn Lark gán cho bộ ảnh (0102, BB-395) — gán lại sau khi nạp, bộ ảnh mới id mới",
  },
  deliveries: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "giao hàng" },
  activity_logs: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "nhật ký thao tác" },
  notifications: { nhom: NHOM_XOA_DU_LIEU_THU, lyDo: "hàng đợi tin Lark" },
};

/** Bảng KHÔNG bao giờ bị xoá — suy từ PHAN_LOAI_BANG, không khai hai lần. */
export const BANG_GIU_NGUYEN = Object.entries(PHAN_LOAI_BANG)
  .filter(([, v]) => v.nhom === NHOM_GIU)
  .map(([k]) => k);

/**
 * Thứ tự xoá bảng nghiệp vụ, lá trước gốc sau. Danh sách này được kiểm lại
 * bằng `kiemTraThuTuAnToan()` trước khi --xoa thật sự chạy — xem đầu tệp.
 *
 * Phải khớp PHAN_LOAI_BANG: mọi bảng nhóm "nap-lai-tu-lark" / "xoa-du-lieu-thu"
 * có mặt ở đây đúng một lần, và không bảng nhóm "giu" nào có mặt
 * (`kiemTraPhanLoaiNhatQuan()` canh, phép thử chạy mỗi lượt `npm test`).
 */
export const THU_TU_XOA = [
  "selection_placements",
  // 0062: tham chiếu selection_addons và selection_items — đứng TRƯỚC cả hai.
  "selection_addon_photos",
  // 0075: tham chiếu selections, gallery_items, selection_items — đứng TRƯỚC cả ba.
  "album_covers",
  // 0093 (BB-374): tham chiếu selections/galleries/photos — đứng TRƯỚC selections.
  "anh_album_khong_chinh",
  "selection_addons",
  "selection_ops",
  "selection_items",
  // BB-321: đợt chọn thêm ảnh (0077). Tham chiếu selections/galleries nên phải
  // đứng TRƯỚC selections. Chưa áp 0077 thì bảng không có, bị bỏ qua tự nhiên.
  "selection_rounds",
  "gallery_payments",
  "selections",
  // 0083 / 0070: tham chiếu share_links — đứng TRƯỚC share_links.
  "tim_gia_dinh",
  "share_link_ma",
  "share_links",
  // 0071 / 0074 / 0067: chỉ trỏ galleries (cascade); đặt sớm cho gọn.
  "push_dang_ky",
  "thong_bao_khach",
  "lark_nhac_da_gui",
  // 0072: product_id BẮT BUỘC, KHÔNG cascade -> phải đứng TRƯỚC products.
  "yeu_cau_mua_them",
  // 0108 (BB-401): tham chiếu galleries/photos — đứng TRƯỚC photos.
  "anh_chinh_duyet_tam",
  // 0091: tham chiếu revision_requests và photos — đứng TRƯỚC cả hai.
  "revision_request_items",
  "revision_requests",
  // 0095 / 0102: chỉ trỏ galleries (cascade); đặt trước galleries cho nhất quán.
  "anh_chinh_dot",
  "hoa_don_bo_anh",
  "deliveries",
  "gallery_items",
  // 0079: bản sao dòng Hậu Kỳ; branch_id/gallery_id đều "set null" nên thứ tự
  // không bắt buộc, đặt trước galleries cho nhất quán.
  "lark_ban_ghi_moi",
  // 28/09/2026 (BB-311 mục B): products chuyển từ GIỮ sang XOÁ — xem lý do ở
  // BANG_GIU_NGUYEN. Phải đứng SAU gallery_items và selection_addons (khoá
  // ngoại NOT NULL products.id <- gallery_items.product_id,
  // selection_addons.product_id — cả hai đã xoá xong ở đây).
  "products",
  // (bước riêng: gỡ galleries.cover_photo_id về null ở đây, xem xoaSachGiaoDich)
  "photos",
  "galleries",
  "shoots",
  "babies",
  "customers",
  "activity_logs",
  "notifications",
];

// ============================================================================
// Logic thuần — không đụng cơ sở dữ liệu, kiểm bằng phép thử đơn vị thẳng.
// ============================================================================

/**
 * Chia danh sách bảng thực tế của schema public thành giữ / xoá / CHƯA PHÂN LOẠI.
 *
 * BB-352: bảng không có tên trong `phanLoai` KHÔNG còn được tự xếp vào "xoá".
 * Nó nằm riêng ở `chuaPhanLoai` và người gọi (main) phải DỪNG khi danh sách này
 * không rỗng. `xoa` chỉ gồm bảng đã phân loại là nhóm xoá, theo `thuTuXoa`.
 *
 * Bảng có trong `phanLoai` nhưng chưa tồn tại ở cơ sở dữ liệu (migration chưa
 * áp) được bỏ qua tự nhiên — không phải lỗi.
 */
export function phanLoaiBang(danhSachBangThat, phanLoai = PHAN_LOAI_BANG, thuTuXoa = THU_TU_XOA) {
  const that = new Set(danhSachBangThat);
  const giu = danhSachBangThat.filter((t) => phanLoai[t]?.nhom === NHOM_GIU).sort();
  const chuaPhanLoai = danhSachBangThat.filter((t) => !phanLoai[t]).sort();
  const xoa = thuTuXoa.filter((t) => that.has(t) && phanLoai[t] && phanLoai[t].nhom !== NHOM_GIU);
  // Bảng đã phân loại là "xoá" nhưng quên đưa vào THU_TU_XOA: không có chỗ trong
  // thứ tự xoá nên không thể xoá an toàn — cũng là một lý do để DỪNG.
  const thieuThuTu = danhSachBangThat
    .filter((t) => phanLoai[t] && phanLoai[t].nhom !== NHOM_GIU && !thuTuXoa.includes(t))
    .sort();
  return {
    giu,
    xoa,
    napLaiTuLark: xoa.filter((t) => phanLoai[t].nhom === NHOM_NAP_LAI_TU_LARK),
    xoaDuLieuThu: xoa.filter((t) => phanLoai[t].nhom === NHOM_XOA_DU_LIEU_THU),
    chuaPhanLoai,
    thieuThuTu,
  };
}

/**
 * Quy tắc DỪNG: trả về danh sách lý do không được tiếp tục (rỗng = được).
 * Gom một chỗ để phép thử gọi thẳng, và để mọi chế độ (--dem, --sao-luu,
 * --xoa, --khoi-phuc) dùng chung MỘT luật — không chế độ nào được đi tiếp khi
 * còn bảng chưa biết xử lý ra sao.
 */
export function lyDoDungVoiBangLa({ chuaPhanLoai = [], thieuThuTu = [] }) {
  const loi = [];
  if (chuaPhanLoai.length) {
    loi.push(
      `Có ${chuaPhanLoai.length} bảng CHƯA PHÂN LOẠI: ${chuaPhanLoai.join(", ")}. ` +
        "Công cụ không đoán giữ hay xoá. Thêm từng bảng vào PHAN_LOAI_BANG trong " +
        "scripts/nap-lai-tu-lark.mjs (giữ / nạp lại từ Lark / xoá dữ liệu thử, kèm lý do) " +
        "và vào THU_TU_XOA nếu là bảng xoá, rồi chạy lại.",
    );
  }
  if (thieuThuTu.length) {
    loi.push(
      `Bảng đã phân loại là xoá nhưng THIẾU trong THU_TU_XOA: ${thieuThuTu.join(", ")}. ` +
        "Không có chỗ trong thứ tự xoá nên không xoá an toàn được.",
    );
  }
  return loi;
}

/**
 * Kiểm bảng phân loại khớp với THU_TU_XOA (không cần cơ sở dữ liệu). Phép thử
 * đơn vị gọi hàm này mỗi lượt `npm test`: thêm một dòng vào PHAN_LOAI_BANG mà
 * quên THU_TU_XOA (hoặc ngược lại) là đỏ ngay ở máy dev, không đợi tới lúc chạy
 * thật trên bb-prod.
 */
export function kiemTraPhanLoaiNhatQuan(phanLoai = PHAN_LOAI_BANG, thuTuXoa = THU_TU_XOA) {
  const loi = [];
  const dem = new Map();
  for (const t of thuTuXoa) dem.set(t, (dem.get(t) ?? 0) + 1);
  for (const [t, n] of dem) if (n > 1) loi.push(`${t} xuất hiện ${n} lần trong THU_TU_XOA`);
  for (const t of thuTuXoa) {
    if (!phanLoai[t]) loi.push(`${t} có trong THU_TU_XOA nhưng chưa có trong PHAN_LOAI_BANG`);
    else if (phanLoai[t].nhom === NHOM_GIU) loi.push(`${t} thuộc nhóm GIỮ mà lại nằm trong THU_TU_XOA`);
  }
  for (const [t, v] of Object.entries(phanLoai)) {
    if (![NHOM_GIU, NHOM_NAP_LAI_TU_LARK, NHOM_XOA_DU_LIEU_THU].includes(v.nhom)) {
      loi.push(`${t}: nhóm "${v.nhom}" không hợp lệ`);
    }
    if (!v.lyDo || !String(v.lyDo).trim()) loi.push(`${t}: thiếu lý do phân loại`);
    if (v.nhom !== NHOM_GIU && !dem.has(t)) loi.push(`${t} là bảng xoá nhưng thiếu trong THU_TU_XOA`);
  }
  return { nhatQuan: loi.length === 0, loi };
}

/** Bảng KHÔNG bao giờ được nằm trong một lệnh xoá — lớp chốt cuối của xoaSachGiaoDich. */
export function bangCamXoa(thuTuXoa, phanLoai = PHAN_LOAI_BANG) {
  return thuTuXoa.filter((t) => t === "schema_migrations" || phanLoai[t]?.nhom === NHOM_GIU);
}

/**
 * Kiểm thứ tự xoá hardcode có an toàn với sơ đồ khoá ngoại THẬT không.
 * `canhFk` là mảng {tu, den, batBuoc} lấy từ pg_constraint (tu tham chiếu đến
 * den). An toàn nghĩa là: với mọi cạnh BẮT BUỘC (not null) mà cả hai đầu đều
 * là bảng nghiệp vụ, `tu` phải đứng TRƯỚC `den` trong thứ tự xoá (con xoá
 * trước cha).
 *
 * Bỏ qua hai loại cạnh:
 *   - Tự trỏ vào chính bảng mình (vd gallery_items.parent_item_id) — xoá cả
 *     bảng trong một câu lệnh không quan tâm thứ tự nội bộ đó.
 *   - Cạnh CHO RỖNG (batBuoc = false, vd galleries.cover_photo_id -> photos)
 *     — `xoaSachGiaoDich` gỡ nó về null trước khi xoá bảng đích, nên thứ tự
 *     giữa hai bảng đó không bắt buộc phải theo chiều khoá ngoại.
 */
export function kiemTraThuTuAnToan(thuTuXoa, canhFk) {
  const viTri = new Map(thuTuXoa.map((t, i) => [t, i]));
  const loi = [];
  for (const canh of canhFk) {
    if (canh.tu === canh.den) continue;
    if (canh.batBuoc === false) continue; // cho rỗng — gỡ trước khi xoá, xem xoaSachGiaoDich
    if (!viTri.has(canh.tu) || !viTri.has(canh.den)) continue; // ngoài phạm vi xoá
    if (viTri.get(canh.tu) > viTri.get(canh.den)) {
      loi.push(`${canh.tu} -> ${canh.den} (đang xoá ${canh.den} trước ${canh.tu})`);
    }
  }
  return { anToan: loi.length === 0, loi };
}

/**
 * Mã xác nhận: băm từ số đếm + ngày, 6 ký tự. Đổi một dòng đếm hay đổi ngày là
 * ra mã khác — nên mã trùng chỉ có thể sinh ra từ đúng bộ số đã in.
 */
export function taoMaXacNhan(demTheoBang, ngayYYYYMMDD) {
  const noiDung = JSON.stringify(
    Object.keys(demTheoBang)
      .sort()
      .map((k) => [k, demTheoBang[k]]),
  );
  const bam = crypto.createHash("sha256").update(`${noiDung}|${ngayYYYYMMDD}`).digest("hex");
  return bam.slice(0, 6).toUpperCase();
}

export function ngayHomNay(bayGio = new Date()) {
  const d = bayGio;
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Từ chối thư mục sao lưu nằm trong kho — kho là public, xem AGENTS.md §6. */
export function duongDanSaoLuuHopLe(duongDanChon, gocRepo = GOC_REPO) {
  const dich = path.resolve(duongDanChon);
  const goc = path.resolve(gocRepo);
  if (dich === goc || dich.startsWith(goc + path.sep)) {
    return { hopLe: false, ly_do: `Thư mục ${dich} nằm TRONG kho — kho này public.` };
  }
  return { hopLe: true, duong: dich };
}

/**
 * Toàn bộ điều kiện chặn --xoa, gom một chỗ để phép thử không phải dựng cả
 * cơ sở dữ liệu giả mới kiểm được một nhánh từ chối.
 */
export function kiemTraDieuKienXoa({
  maNhapVao,
  demHienTai,
  ngayHienTai,
  sanLuuGanNhat, // { thoiDiem: Date } hoặc null
  urlKetNoi,
  coCoThatSuLaBbDev,
  gioAnToanBanSaoLuu = 24,
}) {
  const loi = [];

  const maDung = taoMaXacNhan(demHienTai, ngayHienTai);
  if (!maNhapVao || maNhapVao.toUpperCase() !== maDung) {
    loi.push(
      "Mã xác nhận không khớp. Có thể số đếm đã đổi từ lúc in mã (Lark vừa " +
        "đồng bộ thêm, hoặc ai đó vừa thao tác), hoặc mã gõ sai. Chạy lại " +
        "`--dem` để lấy mã mới rồi thử lại.",
    );
  }

  const ma = maDuAn(urlKetNoi);

  if (!sanLuuGanNhat) {
    loi.push("Chưa có bản sao lưu nào. Chạy `--sao-luu <thư-mục>` trước.");
  } else {
    const gio = (Date.now() - new Date(sanLuuGanNhat.thoiDiem).getTime()) / 3_600_000;
    if (gio > gioAnToanBanSaoLuu) {
      loi.push(
        `Bản sao lưu gần nhất đã ${gio.toFixed(1)} giờ trước, quá mốc ` +
          `${gioAnToanBanSaoLuu} giờ. Chạy lại \`--sao-luu <thư-mục>\` trước khi xoá.`,
      );
    }
    // BB-315 (cố vấn CV-01, lỗi S4): tệp mốc sao lưu KHÔNG ghi mã dự án, nên
    // một bản sao lưu của MÔI TRƯỜNG KHÁC (bb-dev khi đang xoá bb-prod, hoặc
    // ngược lại — đúng kịch bản docs/26 §13: dọn bb-dev 3 ngày sau khi cắt
    // sang bb-prod) vẫn "trẻ hơn 24 giờ" nên qua được điều kiện ở trên. Chỉ so
    // khi CẢ HAI bên đều có mã (bản sao lưu cũ, ghi trước BB-315, không có
    // trường `maDuAn` — không chặn ngược những bản sao lưu đó, chỉ chặn khi
    // đã đo được rõ ràng là LỆCH).
    if (sanLuuGanNhat.maDuAn && ma && sanLuuGanNhat.maDuAn !== ma) {
      loi.push(
        `Bản sao lưu gần nhất là của môi trường khác (mã dự án "${sanLuuGanNhat.maDuAn}"), ` +
          `không phải môi trường đang xoá (mã dự án "${ma}"). Chạy lại ` +
          "`--sao-luu <thư-mục>` TRÊN ĐÚNG môi trường đang xoá trước khi tiếp tục.",
      );
    }
  }

  if (ma === MA_BB_DEV && !coCoThatSuLaBbDev) {
    loi.push(
      "SUPABASE_URL đang trỏ vào bb-dev — dữ liệu THẬT của studio (xem " +
        "AGENTS.md §6). Cần thêm cờ `--that-su-la-bb-dev` để xác nhận đây là " +
        "chủ ý, không phải gõ nhầm môi trường.",
    );
  }

  return { choPhep: loi.length === 0, loi };
}

// ============================================================================
// Lớp truy cập DB — biên giới mỏng, phép thử đơn vị giả lập đúng lớp này.
// ============================================================================

export function taoClient(dbUrl) {
  const u = new URL(dbUrl);
  return new pg.Client({
    host: u.hostname,
    port: Number(u.port) || 5432,
    database: u.pathname.slice(1),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 25_000,
  });
}

export async function danhSachBangThat(client) {
  const { rows } = await client.query(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`,
  );
  return rows.map((r) => r.tablename);
}

export async function canhKhoaNgoai(client) {
  const { rows } = await client.query(
    `select r.relname as tu, f.relname as den, a.attnotnull as "batBuoc"
       from pg_constraint c
       join pg_class r on r.oid = c.conrelid
       join pg_class f on f.oid = c.confrelid
       join pg_namespace n on n.oid = r.relnamespace
       join unnest(c.conkey) k(attnum) on true
       join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
      where c.contype = 'f' and n.nspname = 'public'`,
  );
  return rows;
}

/** Đếm số dòng của mỗi bảng trong danh sách. Chỉ đọc. */
export async function demBang(client, danhSachBang) {
  const ket = {};
  for (const bang of danhSachBang) {
    const { rows } = await client.query(`select count(*)::int as n from "${bang}"`);
    ket[bang] = rows[0].n;
  }
  return ket;
}

/**
 * Xuất toàn bộ dữ liệu của các bảng ra JSON, một tệp một bảng, kèm tổng số.
 *
 * `maDuAnHienTai` (BB-315, cố vấn CV-01, lỗi S4) — mã dự án của cơ sở dữ liệu
 * ĐANG được sao lưu, ghi vào `tong-so-dong.json`. Không có trường này thì
 * `--xoa` không phân biệt được một bản sao lưu vừa tạo của MÔI TRƯỜNG NÀY với
 * một bản sao lưu (dù mới) của một môi trường KHÁC — đúng kịch bản `docs/26`
 * §13: dọn bb-dev vài ngày sau khi cắt sang bb-prod, hai môi trường đều có
 * bản sao lưu "trẻ" trong cùng khung giờ. Tham số tuỳ chọn để không phá vỡ
 * lời gọi cũ (bản sao lưu không truyền mã dự án vẫn ghi được, chỉ là không
 * có trường này — `kiemTraDieuKienXoa` bỏ qua kiểm tra khi thiếu, xem ở đó).
 */
export async function xuatSaoLuu(client, danhSachBang, thuMucDich, maDuAnHienTai) {
  fs.mkdirSync(thuMucDich, { recursive: true });
  const demTheoBang = {};
  for (const bang of danhSachBang) {
    const { rows } = await client.query(`select * from "${bang}"`);
    fs.writeFileSync(path.join(thuMucDich, `${bang}.json`), JSON.stringify(rows, null, 2), "utf8");
    demTheoBang[bang] = rows.length;
  }
  const tongKet = {
    thoiDiem: new Date().toISOString(),
    maDuAn: maDuAnHienTai,
    tongSoDong: Object.values(demTheoBang).reduce((a, b) => a + b, 0),
    demTheoBang,
  };
  fs.writeFileSync(
    path.join(thuMucDich, "tong-so-dong.json"),
    JSON.stringify(tongKet, null, 2),
    "utf8",
  );
  return tongKet;
}

/** Tìm bản sao lưu gần nhất trong thư mục gốc sao lưu (mỗi lượt là một thư mục con). */
export function sanLuuGanNhatTrongThuMuc(gocSaoLuu) {
  // Ưu tiên tệp mốc — xem ghiMocSaoLuuGanNhat(). Đây là cách --xoa NHẬN RA
  // một bản sao lưu vừa tạo ở BẤT KỲ thư mục nào admin chọn cho --sao-luu,
  // kể cả khi thư mục đó không nằm trong gocSaoLuu (BACKUP_DIR mặc định).
  // Không có tệp mốc, hoặc tệp mốc hỏng/trỏ tới chỗ đã mất, thì rơi về cách cũ:
  // quét các thư mục CON của gocSaoLuu (chỉ đúng khi admin luôn chọn CÙNG một
  // gocSaoLuu cho --sao-luu).
  const moc = docMocSaoLuuGanNhat(gocSaoLuu);
  if (moc) return moc;

  if (!fs.existsSync(gocSaoLuu)) return null;
  const conCac = fs
    .readdirSync(gocSaoLuu, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => path.join(gocSaoLuu, d.name, "tong-so-dong.json"))
    .filter((p) => fs.existsSync(p));
  if (!conCac.length) return null;
  const banGhi = conCac
    .map((p) => {
      try {
        return JSON.parse(fs.readFileSync(p, "utf8"));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.thoiDiem) - new Date(a.thoiDiem));
  return banGhi[0] ?? null;
}

/**
 * Đọc tệp thư mục con tại nơi --xoa mặc định tìm (gocSaoLuu = BACKUP_DIR hoặc
 * gocSaoLuuMacDinh()). Trả về đúng nội dung tong-so-dong.json của bản sao lưu
 * mà tệp mốc trỏ tới, kèm `duongDan` — hoặc null nếu không có/tệp mốc hỏng/
 * bản sao lưu bị xoá mất sau khi ghi mốc.
 */
export function docMocSaoLuuGanNhat(gocSaoLuu) {
  const tepMoc = path.join(gocSaoLuu, TEN_TEP_MOC);
  if (!fs.existsSync(tepMoc)) return null;
  try {
    const moc = JSON.parse(fs.readFileSync(tepMoc, "utf8"));
    const tepTong = path.join(moc.duongDan, "tong-so-dong.json");
    if (!fs.existsSync(tepTong)) return null;
    const tong = JSON.parse(fs.readFileSync(tepTong, "utf8"));
    return { ...tong, duongDan: moc.duongDan };
  } catch {
    return null;
  }
}

/**
 * Đọc trực tiếp tong-so-dong.json của MỘT thư mục bản sao lưu cụ thể — dùng
 * cho `--xoa --tu <thư mục>` khi admin muốn chỉ đích danh, bỏ qua tệp mốc và
 * bỏ qua BACKUP_DIR mặc định. Cũng là cách khôi phục hoạt động khi có nhiều
 * bản sao lưu cũ và admin muốn chọn đúng bản.
 */
export function docBanSaoLuuTaiThuMuc(thuMuc) {
  if (!thuMuc) return null;
  const tepTong = path.join(path.resolve(thuMuc), "tong-so-dong.json");
  if (!fs.existsSync(tepTong)) return null;
  try {
    const tong = JSON.parse(fs.readFileSync(tepTong, "utf8"));
    return { ...tong, duongDan: path.resolve(thuMuc) };
  } catch {
    return null;
  }
}

export const TEN_TEP_MOC = "sao-luu-gan-nhat.json";

/**
 * Ghi/ghi đè tệp mốc "bản sao lưu mới nhất" vào gocSaoLuu — nơi --xoa mặc
 * định tra cứu. Gọi ngay sau xuatSaoLuu(), TRƯỚC KHI in kết quả cho admin.
 *
 * Đây là phần NỐI hai bước sao lưu → xoá: không có nó, --sao-luu ghi vào một
 * thư mục admin tự chọn còn --xoa lại tìm ở một thư mục mặc định khác hẳn
 * (BACKUP_DIR hoặc <cha của repo>/babybean-sao-luu) — hai đường không bao giờ
 * gặp nhau trừ khi admin tình cờ chọn đúng thư mục mặc định. Ghi tệp mốc vào
 * gocSaoLuu bất kể thuMucBanSaoLuu nằm ở đâu là cách duy nhất nối chắc chắn.
 */
export function ghiMocSaoLuuGanNhat(gocSaoLuu, thuMucBanSaoLuu) {
  fs.mkdirSync(gocSaoLuu, { recursive: true });
  fs.writeFileSync(
    path.join(gocSaoLuu, TEN_TEP_MOC),
    JSON.stringify({ duongDan: path.resolve(thuMucBanSaoLuu), ghiLuc: new Date().toISOString() }, null, 2),
    "utf8",
  );
}

/**
 * Xoá toàn bộ bảng nghiệp vụ trong MỘT giao dịch, đúng thứ tự khoá ngoại.
 * Gỡ galleries.cover_photo_id trước khi xoá photos để phá vòng.
 */
export async function xoaSachGiaoDich(client, thuTuXoa) {
  // Lớp chốt cuối, độc lập với phanLoaiBang: dù ai đó gọi hàm này với danh sách
  // nào, bảng GIỮ NGUYÊN (nhất là schema_migrations) không bao giờ bị xoá — và
  // việc từ chối xảy ra TRƯỚC `begin`, chưa chạm một dòng nào.
  const cam = bangCamXoa(thuTuXoa);
  if (cam.length) {
    throw new Error(`Từ chối xoá bảng thuộc nhóm GIỮ NGUYÊN: ${cam.join(", ")}`);
  }
  await client.query("begin");
  try {
    const dem = {};
    if (thuTuXoa.includes("photos")) {
      await client.query(`update galleries set cover_photo_id = null`);
    }
    for (const bang of thuTuXoa) {
      const r = await client.query(`delete from "${bang}"`);
      dem[bang] = r.rowCount ?? 0;
    }
    await client.query("commit");
    return dem;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
}

/**
 * Nạp lại dữ liệu từ các tệp JSON của một bản sao lưu (xuatSaoLuu ghi ra),
 * theo thứ tự NGƯỢC với THU_TU_XOA — gốc trước, lá sau — để không vỡ khoá
 * ngoại. Chạy trong MỘT giao dịch: gãy giữa chừng thì hoàn tác sạch, không để
 * lại một nửa dữ liệu.
 *
 * Bảng không có tệp (không nằm trong bản sao lưu, hoặc tệp rỗng `[]`) được bỏ
 * qua, không coi là lỗi — một bản sao lưu cũ có thể thiếu bảng mới thêm sau.
 */
export async function khoiPhucGiaoDich(client, thuTuKhoiPhuc, thuMucNguon) {
  await client.query("begin");
  try {
    const dem = {};
    for (const bang of thuTuKhoiPhuc) {
      const tepBang = path.join(thuMucNguon, `${bang}.json`);
      if (!fs.existsSync(tepBang)) {
        dem[bang] = 0;
        continue;
      }
      const dong = JSON.parse(fs.readFileSync(tepBang, "utf8"));
      dem[bang] = dong.length;
      for (const row of dong) {
        const cot = Object.keys(row);
        if (!cot.length) continue;
        const giuCho = cot.map((_, i) => `$${i + 1}`).join(", ");
        const danhSachCot = cot.map((c) => `"${c}"`).join(", ");
        await client.query(
          `insert into "${bang}" (${danhSachCot}) values (${giuCho})`,
          cot.map((c) => row[c]),
        );
      }
    }
    await client.query("commit");
    return dem;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  }
}

/**
 * Bảng nghiệp vụ nào ĐANG có dòng — chặn khôi phục đè lên dữ liệu sống, tránh
 * trùng khoá chính hoặc trộn lẫn hai bộ dữ liệu khác thời điểm. Khôi phục chỉ
 * nên chạy sau --xoa (bảng đã rỗng) hoặc trên một cơ sở dữ liệu trống.
 */
export function banGiuLieuKhongRong(demHienTai) {
  return Object.entries(demHienTai)
    .filter(([, n]) => n > 0)
    .map(([bang]) => bang);
}

// ============================================================================
// Bước --nap: chạy lần lượt script sync-lark-*, dừng ở lỗi đầu tiên.
// ============================================================================

/**
 * Danh sách lệnh nạp, theo thứ tự PHỤ THUỘC THẬT (xem ghi chú đầu tệp), không
 * phải thứ tự mô tả bằng lời "danh mục → hợp đồng → hậu kỳ → chỉnh sửa".
 */
export function danhSachLenhNap() {
  return [
    { ten: "danh mục sản phẩm", lenh: "npm", tso: ["run", "sync:catalog", "--", "--write"] },
    {
      ten: "hậu kỳ (khách / bộ ảnh)",
      lenh: "node",
      tso: [
        "--env-file-if-exists=.env.local",
        "--import",
        "tsx",
        "scripts/sync-lark-hauky.mjs",
        "--",
        "--write",
      ],
    },
    { ten: "hợp đồng (dòng hàng)", lenh: "npm", tso: ["run", "sync:contracts", "--", "--write"] },
    {
      ten: "chỉnh sửa (retouch)",
      lenh: "node",
      tso: [
        "--env-file-if-exists=.env.local",
        "--import",
        "tsx",
        "scripts/sync-lark-retouch.mjs",
        "--",
        "--write",
      ],
    },
    // BB-311 mục 2 (P0): bốn bước trên chỉ nạp DÒNG DỮ LIỆU (khách, bộ ảnh,
    // hợp đồng, trạng thái chỉnh sửa) — KHÔNG bộ nào kéo ẢNH từ Drive. Thiếu
    // bước này, --nap xong mọi bộ có `photo_count = 0` (đo thật 28/09/2026,
    // xem báo cáo vận hành vòng 4 §6 mục 3). `--luong 1 --nghi-ms 300`: tuần
    // tự, có nghỉ 300ms giữa hai bộ — hàng trăm bộ liên tiếp ngay sau khi vừa
    // xoá sạch dễ dồn cục vào quota Drive (10.000 req/100s) hơn nhịp dùng
    // hàng ngày bình thường.
    {
      ten: "ảnh (đồng bộ Drive)",
      lenh: "node",
      tso: [
        "--env-file-if-exists=.env.local",
        "--import",
        "tsx",
        "scripts/sync-drive.ts",
        "--",
        "--tat-ca",
        "--luong",
        "1",
        "--nghi-ms",
        "300",
      ],
    },
  ];
}

/**
 * Chạy các lệnh nạp tuần tự, dừng ở lệnh đầu tiên thoát khác 0.
 * `runner` được tiêm vào để phép thử không phải gọi npm/node thật.
 */
export function chayNap(lenhs, runner = spawnSync, cwd = GOC_REPO) {
  const ketQua = [];
  for (const b of lenhs) {
    const r = runner(b.lenh, b.tso, { cwd, encoding: "utf8", shell: process.platform === "win32" });
    const thanhCong = (r.status ?? 1) === 0;
    ketQua.push({ ten: b.ten, thanhCong, maThoat: r.status, stdout: r.stdout, stderr: r.stderr });
    if (!thanhCong) break;
  }
  return ketQua;
}

// ============================================================================
// CLI
// ============================================================================

function env(key) {
  const v = process.env[key];
  if (!v) {
    console.error(`Thiếu biến ${key}. Kiểm tra .env.local.`);
    process.exit(2);
  }
  return v;
}

function gocSaoLuuMacDinh() {
  return path.resolve(path.dirname(GOC_REPO), "babybean-sao-luu");
}

/**
 * Cờ `--env <đường dẫn>` — chọn tệp môi trường để nối, cho phép chạy công cụ
 * này lên bb-prod (BB-315). `node --env-file` của Node chỉ nạp được một tệp cố
 * định TRƯỚC khi script chạy; cờ này đọc THÊM một tệp lúc script đang chạy và
 * GHI ĐÈ lên biến đã có — admin gõ `--env` là admin muốn tệp đó thắng, không
 * phải tệp `.env.local` mà `db:nap-lai` đã nạp sẵn qua `--env-file-if-exists`.
 *
 * Không bao giờ in nội dung tệp ra console — có thể là khoá bb-prod.
 */
function napTepMoiTruongTuyChon(argv) {
  const i = argv.indexOf("--env");
  if (i === -1) return;
  const duong = argv[i + 1];
  if (!duong) {
    console.error("Thiếu đường dẫn sau --env. Dùng: --env .env.prod.local");
    process.exit(2);
  }
  const bien = docTepEnv(path.resolve(GOC_REPO, duong));
  if (!bien) {
    console.error(`Không thấy tệp môi trường: ${path.resolve(GOC_REPO, duong)}`);
    process.exit(2);
  }
  for (const [k, v] of Object.entries(bien)) process.env[k] = v;
}

async function main() {
  const argv = process.argv.slice(2);
  napTepMoiTruongTuyChon(argv);

  const laXoa = argv.includes("--xoa");
  const laNap = argv.includes("--nap");
  const iSaoLuu = argv.indexOf("--sao-luu");
  const laSaoLuu = iSaoLuu !== -1;
  const iKhoiPhuc = argv.indexOf("--khoi-phuc");
  const laKhoiPhuc = iKhoiPhuc !== -1;
  const laDem = !laXoa && !laNap && !laSaoLuu && !laKhoiPhuc; // mặc định
  const coBbProd = argv.includes("--that-su-la-bb-prod");

  // BB-315: đo TRƯỚC MỌI bước — in mã dự án + tên môi trường, từ chối mã lạ.
  // Áp dụng cho cả --nap: nó không mở kết nối pg ở đây, nhưng SPAWN các script
  // sync-lark-*/sync-drive thừa hưởng nguyên process.env, tức cũng ghi vào
  // đúng cơ sở dữ liệu mà --env vừa chọn.
  const dbUrlSoat = env("SUPABASE_DB_URL");
  inMoiTruong(dbUrlSoat);
  const ktMoiTruong = kiemTraMoiTruongChoPhep(dbUrlSoat);
  if (!ktMoiTruong.choPhep) {
    console.error(ktMoiTruong.ly_do);
    process.exit(2);
  }

  if (laNap) {
    // --nap luôn GHI (nó tạo/sửa khách, bộ ảnh...). Đòi cờ bb-prod y hệt --xoa.
    const ktGhi = kiemTraCoBbProd(dbUrlSoat, coBbProd);
    if (!ktGhi.choPhep) {
      console.error(ktGhi.ly_do);
      process.exit(2);
    }
    console.log("Nạp lại từ Lark — bốn bước, dừng ở lỗi đầu tiên.\n");
    const ketQua = chayNap(danhSachLenhNap());
    for (const b of ketQua) {
      console.log(`[${b.thanhCong ? "OK" : "LỖI"}] ${b.ten} (mã thoát ${b.maThoat})`);
      if (b.stdout) console.log(b.stdout.trim());
      if (!b.thanhCong) {
        if (b.stderr) console.error(b.stderr.trim());
        console.error(`\nDừng ở bước "${b.ten}". Các bước sau chưa chạy.`);
        process.exit(1);
      }
    }
    console.log("\nNạp xong toàn bộ bốn bước.");
    return;
  }

  const dbUrl = dbUrlSoat;
  const client = taoClient(dbUrl);
  await client.connect();
  try {
    const bangThat = await danhSachBangThat(client);
    const { giu, xoa, napLaiTuLark, xoaDuLieuThu, chuaPhanLoai, thieuThuTu } = phanLoaiBang(bangThat);

    // BB-352: bảng lạ -> DỪNG ở MỌI chế độ (kể cả --dem), trước khi làm gì.
    // --dem dừng luôn để không in ra một mã xác nhận cho một danh sách chưa đủ.
    const lyDoDung = lyDoDungVoiBangLa({ chuaPhanLoai, thieuThuTu });
    if (lyDoDung.length) {
      console.error("DỪNG — không làm gì cả:");
      for (const l of lyDoDung) console.error(`   - ${l}`);
      process.exit(2);
    }

    if (laSaoLuu) {
      const dichChon = argv[iSaoLuu + 1];
      if (!dichChon) {
        console.error("Thiếu thư mục đích. Dùng: --sao-luu \"D:/duong/dan\"");
        process.exit(2);
      }
      const kt = duongDanSaoLuuHopLe(dichChon);
      if (!kt.hopLe) {
        console.error(kt.ly_do);
        process.exit(2);
      }
      const canh = await canhKhoaNgoai(client);
      const antoan = kiemTraThuTuAnToan(xoa, canh);
      if (!antoan.anToan) {
        console.error("Thứ tự xoá hardcode không còn khớp sơ đồ khoá ngoại hiện tại:");
        for (const l of antoan.loi) console.error(`   ${l}`);
        console.error("Dừng lại — sửa THU_TU_XOA trong scripts/nap-lai-tu-lark.mjs trước.");
        process.exit(2);
      }
      const tong = await xuatSaoLuu(client, xoa, kt.duong, maDuAn(dbUrl));
      // Nối bước sao lưu với bước xoá: ghi tệp mốc vào thư mục MẶC ĐỊNH mà
      // --xoa tra cứu, bất kể admin vừa chọn --sao-luu vào đâu. Không có
      // bước này, --xoa sẽ không "nhìn thấy" bản sao lưu vừa tạo trừ khi
      // admin tình cờ chọn đúng thư mục mặc định (BACKUP_DIR).
      ghiMocSaoLuuGanNhat(process.env.BACKUP_DIR || gocSaoLuuMacDinh(), kt.duong);
      console.log(`Đã sao lưu ${tong.tongSoDong} dòng vào ${kt.duong}`);
      for (const [b, n] of Object.entries(tong.demTheoBang)) console.log(`   ${String(n).padStart(6)}  ${b}`);
      return;
    }

    if (laKhoiPhuc) {
      const ktGhiKp = kiemTraCoBbProd(dbUrl, coBbProd);
      if (!ktGhiKp.choPhep) {
        console.error(ktGhiKp.ly_do);
        process.exit(2);
      }
      const nguon = argv[iKhoiPhuc + 1];
      if (!nguon) {
        console.error("Thiếu thư mục nguồn. Dùng: --khoi-phuc \"D:/duong/dan/2026-09-28T...\"");
        process.exit(2);
      }
      const thuMucNguon = path.resolve(nguon);
      const tepTong = path.join(thuMucNguon, "tong-so-dong.json");
      if (!fs.existsSync(tepTong)) {
        console.error(`Không thấy tong-so-dong.json trong ${thuMucNguon} — đây có phải thư mục một bản sao lưu không?`);
        process.exit(2);
      }
      const demHienTai = await demBang(client, xoa);
      const conDong = banGiuLieuKhongRong(demHienTai);
      if (conDong.length && !argv.includes("--buoc-khoi-phuc")) {
        console.error("Từ chối khôi phục: các bảng sau ĐANG có dữ liệu, khôi phục đè lên sẽ trùng khoá chính:");
        for (const b of conDong) console.error(`   ${b} (${demHienTai[b]} dòng)`);
        console.error("Chạy --xoa trước, hoặc thêm --buoc-khoi-phuc nếu chắc chắn muốn ghi đè.");
        process.exit(2);
      }
      const canh = await canhKhoaNgoai(client);
      const antoan = kiemTraThuTuAnToan(xoa, canh);
      if (!antoan.anToan) {
        console.error("Thứ tự xoá hardcode không còn khớp sơ đồ khoá ngoại hiện tại:");
        for (const l of antoan.loi) console.error(`   ${l}`);
        process.exit(2);
      }
      const thuTuKhoiPhuc = [...xoa].reverse();
      const dem = await khoiPhucGiaoDich(client, thuTuKhoiPhuc, thuMucNguon);
      console.log(`Đã khôi phục từ ${thuMucNguon}:`);
      for (const [b, n] of Object.entries(dem)) console.log(`   ${String(n).padStart(6)}  ${b}`);
      return;
    }

    if (laXoa) {
      const iMa = argv.indexOf("--xac-nhan");
      const maNhapVao = iMa !== -1 ? argv[iMa + 1] : null;
      const demHienTai = await demBang(client, xoa);
      const iTu = argv.indexOf("--tu");
      const sanLuu =
        iTu !== -1
          ? docBanSaoLuuTaiThuMuc(argv[iTu + 1])
          : sanLuuGanNhatTrongThuMuc(process.env.BACKUP_DIR || gocSaoLuuMacDinh());

      const kt = kiemTraDieuKienXoa({
        maNhapVao,
        demHienTai,
        ngayHienTai: ngayHomNay(),
        sanLuuGanNhat: sanLuu,
        urlKetNoi: dbUrl,
        coCoThatSuLaBbDev: argv.includes("--that-su-la-bb-dev"),
      });
      // BB-315: cờ bb-prod là một điều kiện RIÊNG, cộng thêm vào — không thay
      // cho kiemTraDieuKienXoa() (giữ nguyên hành vi bb-dev, không đổi test cũ).
      const ktGhiXoa = kiemTraCoBbProd(dbUrl, coBbProd);
      const loiTong = [...kt.loi, ...(ktGhiXoa.choPhep ? [] : [ktGhiXoa.ly_do])];
      if (loiTong.length) {
        console.error("Từ chối xoá:");
        for (const l of loiTong) console.error(`   - ${l}`);
        process.exit(2);
      }

      const canh = await canhKhoaNgoai(client);
      const antoan = kiemTraThuTuAnToan(xoa, canh);
      if (!antoan.anToan) {
        console.error("Thứ tự xoá hardcode không còn khớp sơ đồ khoá ngoại hiện tại:");
        for (const l of antoan.loi) console.error(`   ${l}`);
        process.exit(2);
      }

      const dem = await xoaSachGiaoDich(client, xoa);
      console.log("Đã xoá:");
      for (const [b, n] of Object.entries(dem)) console.log(`   ${String(n).padStart(6)}  ${b}`);

      // 28/09/2026 (BB-311 mục B): "Tắt đệm ảnh sau khi xoá" — DB nghiệp vụ đã
      // rỗng nên MỌI đối tượng trong bucket `thumbnails` giờ mồ côi (photoId
      // không còn tồn tại). Chỉ chạy khi có cờ RIÊNG `--cung-don-dem-anh` —
      // xác nhận thêm, tách khỏi mã --xac-nhan 6 ký tự, giống cách
      // `--that-su-la-bb-dev` là một xác nhận độc lập cho một hành động khác
      // (xem kiemTraDieuKienXoa). Gọi ĐÚNG công cụ dọn đệm đã có
      // (`npm run anh:don-dem-hong`) ở chế độ `--tat-ca --write` — không tự
      // viết lại logic xoá Storage ở đây.
      if (argv.includes("--cung-don-dem-anh")) {
        console.log("\nDọn bộ đệm ảnh (bucket thumbnails) — --tat-ca --write:");
        const r = spawnSync(
          "node",
          [
            "--env-file-if-exists=.env.local",
            "--import",
            "tsx",
            "scripts/don-dem-hong.ts",
            "--tat-ca",
            "--write",
          ],
          { cwd: GOC_REPO, encoding: "utf8", shell: process.platform === "win32" },
        );
        if (r.stdout) console.log(r.stdout.trim());
        if ((r.status ?? 1) !== 0) {
          if (r.stderr) console.error(r.stderr.trim());
          console.error("Dọn đệm ảnh THẤT BẠI — dữ liệu nghiệp vụ đã xoá xong, nhưng bucket thumbnails có thể còn rác mồ côi. Chạy tay: npm run anh:don-dem-hong -- --tat-ca --write");
        }
      } else {
        console.log(
          "\n(Chưa dọn bộ đệm ảnh — thêm cờ --cung-don-dem-anh vào lệnh --xoa để tự dọn, " +
            "hoặc chạy riêng: npm run anh:don-dem-hong -- --tat-ca --write)",
        );
      }
      return;
    }

    if (laDem) {
      console.log(`Bảng GIỮ NGUYÊN (${giu.length}) — không bao giờ bị --xoa đụng tới:`);
      for (const b of giu) console.log(`   ${b}  — ${PHAN_LOAI_BANG[b].lyDo}`);
      const dem = await demBang(client, xoa);
      console.log(`\nXOÁ rồi --nap dựng lại từ Lark / Drive (${napLaiTuLark.length}):`);
      for (const b of napLaiTuLark) console.log(`   ${String(dem[b]).padStart(6)}  ${b}`);
      console.log(`\nXOÁ vì là dữ liệu dùng thử của app, KHÔNG nạp lại (${xoaDuLieuThu.length}):`);
      for (const b of xoaDuLieuThu) console.log(`   ${String(dem[b]).padStart(6)}  ${b}`);
      if ((dem.gallery_payments ?? 0) > 0) {
        console.log(
          `\n!! gallery_payments có ${dem.gallery_payments} dòng sổ thu sẽ bị xoá. Chỉ đúng khi đó là dữ liệu ` +
            "THỬ trước ngày mở. Nếu có tiền thật của khách: DỪNG.",
        );
      }
      const tongXoa = Object.values(dem).reduce((a, b) => a + b, 0);
      console.log(`\nTổng: ${tongXoa} dòng sẽ bị xoá, ${giu.length} bảng giữ nguyên.`);

      const ma = taoMaXacNhan(dem, ngayHomNay());
      console.log(`\nMã xác nhận cho --xoa hôm nay: ${ma}`);
      console.log("(Mã đổi nếu số đếm đổi hoặc sang ngày khác — chạy lại --dem để lấy mã mới.)");
    }
  } finally {
    await client.end();
  }
}

const chayTrucTiep = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (chayTrucTiep) {
  main().catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
}
