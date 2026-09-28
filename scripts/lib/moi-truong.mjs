/**
 * moi-truong — biết đang nối vào bb-dev, bb-prod, hay một mã lạ, và chặn ghi
 * khi chưa xác nhận đúng chỗ.
 *
 * OWNER: DEV-OPS. Task BB-315.
 *
 * ---------------------------------------------------------------------------
 * Dùng chung cho mọi công cụ chạm bb-prod
 * ---------------------------------------------------------------------------
 * `nap-lai-tu-lark.mjs`, `migrate-prod.mjs`, `chep-cau-hinh.mjs`,
 * `so-sanh-migration.mjs` đều cần cùng ba việc trước khi đụng một cơ sở dữ
 * liệu thật: (1) đọc được mã dự án từ chuỗi kết nối, (2) từ chối nếu mã đó
 * không nằm trong danh sách cho phép, (3) đòi thêm một cờ xác nhận nếu mã đó
 * là bb-prod. Viết bốn lần bốn chỗ là bốn cơ hội để một chỗ quên.
 *
 * `MA_DU_AN_THAT` (danh sách CHO PHÉP) lấy từ
 * `src/lib/lark/muc-tieu-du-lieu.ts` — đúng một nguồn sự thật cho "cơ sở dữ
 * liệu nào được coi là thật", dùng chung với lớp ứng dụng (chốt tên khách thật
 * ở BB-139). Không chép lại danh sách ở đây.
 */

import { maDuAn, MA_DU_AN_THAT } from "../../src/lib/lark/muc-tieu-du-lieu.ts";

export { maDuAn, MA_DU_AN_THAT };

/** Mã dự án Supabase của bb-dev. Không phải bí mật — xem muc-tieu-du-lieu.ts. */
export const MA_BB_DEV = "ohkfoqqsrpvsponiwcij";

/** Mã dự án Supabase của bb-prod. Không phải bí mật — xem muc-tieu-du-lieu.ts. */
export const MA_BB_PROD = "hecpaiizklbuckqvdndk";

/** Tên người đọc được cho một mã dự án. */
export function tenMoiTruong(ma) {
  if (ma === MA_BB_DEV) return "bb-dev";
  if (ma === MA_BB_PROD) return "bb-prod";
  return "không rõ";
}

/**
 * In ra mã dự án (PHẦN CÔNG KHAI của URL, không phải bí mật) và tên môi
 * trường — gọi TRƯỚC MỌI bước, ở mọi công cụ chạm cơ sở dữ liệu.
 */
export function inMoiTruong(dbUrl) {
  const ma = maDuAn(dbUrl);
  const ten = tenMoiTruong(ma);
  console.log(`Cơ sở dữ liệu: ${ma ? `${ma} (${ten})` : "KHÔNG đọc được project ref từ chuỗi kết nối"}`);
  return { ma, ten };
}

/**
 * Chặn chạy trên một mã dự án KHÔNG nằm trong danh sách cho phép. Áp dụng cho
 * MỌI bước chạm cơ sở dữ liệu, kể cả bước chỉ đọc: các công cụ ở đây chỉ được
 * thiết kế và thử cho bb-dev hoặc bb-prod, không phải một cơ sở dữ liệu thử
 * bất kỳ ai đó lỡ trỏ nhầm vào.
 */
export function kiemTraMoiTruongChoPhep(dbUrl) {
  const ma = maDuAn(dbUrl);
  if (!ma || !MA_DU_AN_THAT.includes(ma)) {
    return {
      choPhep: false,
      ly_do: `Mã dự án "${ma || "?"}" không nằm trong danh sách cho phép (MA_DU_AN_THAT trong src/lib/lark/muc-tieu-du-lieu.ts). Công cụ này chỉ chạy trên bb-dev hoặc bb-prod.`,
    };
  }
  return { choPhep: true, ma, ten: tenMoiTruong(ma) };
}

/**
 * Cờ `--that-su-la-bb-prod` bắt buộc cho MỌI thao tác GHI khi mã dự án đang
 * nối vào là bb-prod. Cùng tinh thần với `--that-su-la-bb-dev` đã có trong
 * `nap-lai-tu-lark.mjs` — không đoán ý, đòi gõ tường minh.
 */
export function kiemTraCoBbProd(dbUrl, coCoThatSuLaBbProd) {
  const ma = maDuAn(dbUrl);
  if (ma === MA_BB_PROD && !coCoThatSuLaBbProd) {
    return {
      choPhep: false,
      ly_do:
        "SUPABASE_URL/SUPABASE_DB_URL đang trỏ vào bb-prod — dữ liệu THẬT " +
        "đang hoặc sắp phục vụ khách. Cần thêm cờ `--that-su-la-bb-prod` để " +
        "xác nhận đây là chủ ý, không phải gõ nhầm môi trường.",
    };
  }
  return { choPhep: true };
}
