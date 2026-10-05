/**
 * BB-334C — phía trình duyệt của khối "Link app của gia đình" (màn nhân viên).
 * Hợp đồng máy chủ: docs/29-link-gia-dinh.md §3.1–3.4.
 *
 * Mọi hàm gọi `fetch` toàn cục (phép thử giả lập `fetch`, không giả lập hook).
 * Trả `{ ok: true, data }` hoặc `{ ok: false, ma, loi }` — không ném, để giao
 * diện luôn có câu tiếng Việt để hiện.
 *
 * LUẬT XÁC NHẬN: `doiLinkGiaDinh` và `thuHoiLinkGiaDinh` chỉ được gọi từ nút
 * XÁC NHẬN của hộp thoại (xem `khoi-link-gia-dinh.tsx`). Máy chủ cũng đòi
 * `xacNhan: true` trong thân — hai chốt, không chỉ tin giao diện.
 */

export interface LinkGiaDinhHienTai {
  shareLinkId: string;
  duongDan: string | null;
  diaChi: string | null;
  tokenPrefix: string | null;
  taoLuc: string;
  soLanMo: number;
  moLanCuoi: string | null;
}

export interface LinkCuConSong {
  shareLinkId: string;
  galleryId: string;
  tieuDeBo: string;
  vai: string;
  tokenPrefix: string | null;
  taoLuc: string;
  soLanMo: number;
}

export interface TrangThaiLinkGiaDinh {
  linkGiaDinh: LinkGiaDinhHienTai | null;
  linkCuConSong: LinkCuConSong[];
  loiMoiGiaDinh: Array<{ shareLinkId: string; nhan: string | null; taoLuc: string }>;
  soBoAnh: number;
  /** Vai hiện tại có được đổi / thu hồi không (máy chủ vẫn chặn lần nữa). */
  duocDoi: boolean;
}

export interface KetQuaGhiLark {
  tong: number;
  ghiDuoc: number;
  dong: Array<{ galleryId: string; recordId: string; ghiDuoc: boolean; lyDo: string | null }>;
  lyDo?: string;
}

export interface KetQuaTaoLink {
  shareLinkId: string;
  duongDan: string;
  tokenPrefix: string;
  luuDiaChiDuoc: boolean;
  daThuHoi: string | null;
  lark: KetQuaGhiLark | null;
}

export type KetQuaGoi<T> = { ok: true; data: T } | { ok: false; ma: string; loi: string };

const GOC = (customerId: string) => `/api/admin/customers/${encodeURIComponent(customerId)}/link-gia-dinh`;

async function goi<T>(url: string, init: RequestInit | undefined, loiMatKetNoi: string, loiChung: string): Promise<KetQuaGoi<T>> {
  try {
    const res = await fetch(url, { cache: "no-store", ...init });
    const json = (await res.json().catch(() => null)) as { data?: T; error?: { code?: string; message?: string } } | null;
    if (!res.ok || !json || json.data === undefined) {
      return { ok: false, ma: json?.error?.code ?? `HTTP_${res.status}`, loi: json?.error?.message ?? loiChung };
    }
    return { ok: true, data: json.data };
  } catch {
    return { ok: false, ma: "NETWORK", loi: loiMatKetNoi };
  }
}

const JSON_HEADERS = { "content-type": "application/json" };

export interface ChuoiLoi {
  matKetNoi: string;
  chung: string;
}

export function docLinkGiaDinh(customerId: string, loi: ChuoiLoi) {
  return goi<TrangThaiLinkGiaDinh>(GOC(customerId), undefined, loi.matKetNoi, loi.chung);
}

/** Khách chưa có link → tạo. Đã có → máy chủ trả 409 (muốn đổi thì qua `doiLinkGiaDinh`). */
export function taoLinkGiaDinh(customerId: string, loi: ChuoiLoi) {
  return goi<KetQuaTaoLink>(
    GOC(customerId),
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({}) },
    loi.matKetNoi,
    loi.chung,
  );
}

/** CHỈ gọi sau khi nhân viên bấm nút xác nhận trong hộp thoại "link cũ sẽ ngừng mở ngay". */
export function doiLinkGiaDinh(customerId: string, loi: ChuoiLoi) {
  return goi<KetQuaTaoLink>(
    GOC(customerId),
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ doiLink: true, xacNhan: true }) },
    loi.matKetNoi,
    loi.chung,
  );
}

/** CHỈ gọi sau khi nhân viên bấm nút xác nhận trong hộp thoại thu hồi. */
export function thuHoiLinkGiaDinh(customerId: string, loi: ChuoiLoi) {
  return goi<{ daThuHoi: string }>(
    GOC(customerId),
    { method: "DELETE", headers: JSON_HEADERS, body: JSON.stringify({ xacNhan: true }) },
    loi.matKetNoi,
    loi.chung,
  );
}

/** CHỈ gọi sau khi nhân viên bấm nút xác nhận "Ghi vào Lark". Sửa dữ liệu bên Lark. */
export function ghiLarkGiaDinh(customerId: string, loi: ChuoiLoi) {
  return goi<{ lark: KetQuaGhiLark }>(
    `${GOC(customerId)}/ghi-lark`,
    { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({}) },
    loi.matKetNoi,
    loi.chung,
  );
}

/** Tin nhắn mẫu gửi ba mẹ — giọng Bean, có link. */
export function tinNhanMauGiaDinh(diaChi: string): string {
  return (
    `Bean chào ba mẹ ạ. Đây là link app xem ảnh của gia đình mình tại Baby Bean: ${diaChi}\n` +
    `Link dùng lâu dài cho mọi buổi chụp của bé, có buổi mới Bean tự thêm vào, ba mẹ không cần xin lại ạ. ` +
    `Ba mẹ lưu vào màn hình chính để mở lại nhanh nhé ạ.`
  );
}

/** Địa chỉ đầy đủ: ưu tiên `diaChi` của máy chủ; thiếu thì ghép với gốc trang đang mở. */
export function diaChiHienThi(
  link: { diaChi: string | null; duongDan: string | null } | null,
  gocTrang: string | null,
): string | null {
  if (!link) return null;
  if (link.diaChi) return link.diaChi;
  if (link.duongDan && gocTrang) return `${gocTrang.replace(/\/$/, "")}${link.duongDan}`;
  return null;
}

/** Đổi {khoá} trong câu bằng giá trị. */
export function dien(mau: string, giaTri: Record<string, string | number>): string {
  return mau.replace(/\{(\w+)\}/g, (_, k: string) => String(giaTri[k] ?? ""));
}
