/**
 * BB-334B — `goiApiKhach(url, init)`: MỘT cửa cho mọi lượt gọi `/api/g/*` của
 * màn khách. Thay cho `fetch` rải rác.
 *
 * OWNER: DEV-FE. Hợp đồng: docs/29-link-gia-dinh.md §1.
 *
 * Trên trang `/k/<mã>/<n>` (link gia đình), cookie phiên chỉ chứng minh "đây là
 * link X của khách Y" — bộ ảnh của MỖI lượt gọi phải do lượt gọi nêu ra bằng
 * tiêu đề `x-bb-bo: <galleryId>`. Sót một chỗ là lỗi hai tab: tab bộ 1 bấm chốt
 * mà máy chủ không biết là bộ nào (403), hoặc tệ hơn đi vào bộ của tab kia.
 *
 * Bộ ảnh đang mở được đặt MỘT lần bởi trang `/k/<mã>/<n>` (`datBoAnhKhach`),
 * trước khi màn chọn ảnh dựng. Biến nằm trong bộ nhớ của TAB này (mỗi tab một
 * vùng JS riêng) — hai tab hai bộ không thể đọc nhầm của nhau. Trang `/g/<mã>`
 * (link cũ) không đặt gì → `goiApiKhach` y hệt `fetch`, hành vi cũ giữ nguyên.
 *
 * Lưới đỡ một cookie cho cả trình duyệt (§1.2): cùng máy còn mở một link KHÁC
 * thì cookie có thể bị tab kia ghi đè → `/api/g/*` trả 401/403/410. Khi đó gọi
 * lại `GET /api/k/<mã>` MỘT lần (đặt lại cookie đúng link), rồi thử lại lượt
 * gọi đó. Vẫn lỗi thì trả nguyên phản hồi lỗi cho chỗ gọi tự báo.
 */

/** Tiêu đề mang id bộ ảnh — cùng tên với `TIEU_DE_BO_ANH` ở máy chủ (src/lib/auth/phien-bo-anh.ts). */
export const TIEU_DE_BO_ANH = "x-bb-bo";

export interface BoAnhKhach {
  /** Mã link gia đình trên địa chỉ `/k/<mã>`. */
  ma: string;
  /** uuid bộ ảnh đang mở (lấy từ `GET /api/k/<mã>` theo `soThuTu`). */
  galleryId: string;
}

let boHienTai: BoAnhKhach | null = null;
let dangDatLaiPhien: Promise<void> | null = null;

/**
 * Đặt (hoặc bỏ — `null`) bộ ảnh của tab này. CHỈ gọi ở trình duyệt: trên máy
 * chủ biến cấp mô-đun dùng chung giữa mọi yêu cầu.
 */
export function datBoAnhKhach(bo: BoAnhKhach | null): void {
  if (typeof window === "undefined") return;
  boHienTai = bo;
}

/** Bộ ảnh của tab này (trang `/k/<mã>/<n>`), hoặc null (trang `/g/<mã>`, trang gia đình). */
export function boAnhKhachHienTai(): BoAnhKhach | null {
  return boHienTai;
}

function duongDanCua(url: string | URL | Request): string {
  const s = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
  try {
    return new URL(s, "http://x").pathname;
  } catch {
    return s;
  }
}

/** Lượt gọi này có phải API khách theo bộ ảnh (`/api/g/…`) không. */
export function laApiKhach(url: string | URL | Request): boolean {
  return duongDanCua(url).startsWith("/api/g/");
}

/** `init` mới có thêm `x-bb-bo` (giữ nguyên mọi tiêu đề khác). Hàm thuần — dùng chung cho phép thử. */
export function themTieuDeBo(init: RequestInit | undefined, galleryId: string): RequestInit {
  const headers = new Headers(init?.headers);
  headers.set(TIEU_DE_BO_ANH, galleryId);
  return { ...init, headers };
}

const MA_CAN_DAT_LAI_PHIEN = new Set([401, 403, 410]);

async function datLaiPhien(ma: string, goi: typeof fetch): Promise<void> {
  // Nhiều lượt gọi cùng hỏng một lúc (vừa mở lại tab) chỉ đổi phiên MỘT lần.
  if (!dangDatLaiPhien) {
    dangDatLaiPhien = goi(`/api/k/${encodeURIComponent(ma)}`, { cache: "no-store" })
      .then(() => undefined, () => undefined)
      .finally(() => {
        dangDatLaiPhien = null;
      });
  }
  await dangDatLaiPhien;
}

/**
 * `fetch` cho màn khách. Ngoài trang `/k/<mã>/<n>`, hoặc với địa chỉ không phải
 * `/api/g/…`, là `fetch` trơn.
 */
export async function goiApiKhach(url: string, init?: RequestInit): Promise<Response> {
  const bo = boHienTai;
  if (!bo || !laApiKhach(url)) return fetch(url, init);

  const initCoBo = themTieuDeBo(init, bo.galleryId);
  const res = await fetch(url, initCoBo);
  if (!MA_CAN_DAT_LAI_PHIEN.has(res.status)) return res;

  // Thân yêu cầu dạng luồng không gửi lại được; mọi chỗ gọi hiện nay dùng chuỗi JSON.
  if (init?.body && typeof init.body !== "string") return res;
  await datLaiPhien(bo.ma, fetch);
  return fetch(url, initCoBo);
}
