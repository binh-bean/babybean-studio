/**
 * Gộp và sắp một danh sách dòng `activity_logs` thô thành danh sách hiển thị
 * cho khối "Dòng thời gian hoạt động" (BB-259).
 *
 * OWNER: task BB-259. Hàm THUẦN — xem lời giải thích đầy đủ ở dich-hoat-dong.ts.
 *
 * ---------------------------------------------------------------------------
 * Vì sao phải gộp `selection.patch`
 * ---------------------------------------------------------------------------
 * Một lượt ba mẹ lướt ảnh và thả tim vài chục tấm sinh ra từng ấy dòng
 * `selection.patch` — loại action nhiều nhất trong bảng theo docs/briefs/
 * BB-173. Không gộp thì dòng thời gian chỉ toàn "Ba mẹ chọn/bỏ 1 tấm" lặp lại,
 * không đọc được gì.
 *
 * ---------------------------------------------------------------------------
 * Vì sao lọc `gallery.auth`
 * ---------------------------------------------------------------------------
 * Mỗi lần mở lại link (kể cả refresh trang) đều ghi một dòng. Chỉ lần ĐẦU
 * TIÊN ba mẹ mở link là một cột mốc đáng nhớ; các lần sau là rác.
 */

import { dichHoatDong, suyNguoi, type DongNhatKyDeDich } from "./dich-hoat-dong";

/** Gộp các `selection.patch` liên tiếp, cùng người, cách nhau không quá bao lâu. */
const CUA_SO_GOP_MS = 10 * 60 * 1000;

export interface RawActivityRow {
  id: string | number;
  createdAt: string;
  actorType: "staff" | "customer" | "system";
  actorId: string | null;
  actorLabel: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  /** Tra sẵn từ `staff_profiles.full_name` khi actorType === "staff". */
  staffFullName?: string | null;
}

export interface DongThoiGian {
  luc: string;
  nhom: string;
  cau: string;
  nguoi: string;
}

function khoaNguoi(r: RawActivityRow): string {
  return r.actorId ?? r.actorLabel ?? r.actorType;
}

/**
 * Chỉ giữ dòng `gallery.auth` có `created_at` NHỎ NHẤT (lần mở đầu tiên).
 * Nhận danh sách ở BẤT KỲ thứ tự nào.
 */
function locGalleryAuth(rows: RawActivityRow[]): RawActivityRow[] {
  const authRows = rows.filter((r) => r.action === "gallery.auth");
  if (authRows.length <= 1) return rows;

  let somNhat: RawActivityRow = authRows[0]!;
  for (const r of authRows) {
    if (new Date(r.createdAt).getTime() < new Date(somNhat.createdAt).getTime()) somNhat = r;
  }
  const idSomNhat = somNhat.id;
  return rows.filter((r) => r.action !== "gallery.auth" || r.id === idSomNhat);
}

/**
 * Gộp các dòng `selection.patch` LIÊN TIẾP theo thời gian (không phải liên
 * tiếp trong mảng đầu vào — hàm tự sắp theo thời gian trước), cùng người thực
 * hiện, cách nhau không quá `CUA_SO_GOP_MS`. Nhóm khác action chen giữa thì
 * cắt nhóm, dù cùng người.
 */
function gopSelectionPatch(rowsThoiGianTang: RawActivityRow[]): RawActivityRow[] {
  const ketQua: RawActivityRow[] = [];
  let nhomHienTai: RawActivityRow[] = [];

  function chotNhom() {
    if (nhomHienTai.length === 0) return;
    if (nhomHienTai.length === 1) {
      ketQua.push(nhomHienTai[0]!);
    } else {
      // Dòng đại diện cho cả nhóm: lấy thời điểm MỚI NHẤT trong nhóm (cuối
      // mảng, vì mảng đang tăng dần theo thời gian) — đó là lúc "hoạt động
      // gần nhất" của chuỗi thao tác này, hợp lý hơn lúc bắt đầu.
      const cuoi = nhomHienTai[nhomHienTai.length - 1]!;
      const tongApplied = nhomHienTai.reduce((tong, r) => {
        const n = r.metadata?.["applied"];
        return tong + (typeof n === "number" && Number.isFinite(n) ? n : 1);
      }, 0);
      ketQua.push({
        ...cuoi,
        metadata: { applied: tongApplied },
      });
    }
    nhomHienTai = [];
  }

  for (const r of rowsThoiGianTang) {
    if (r.action !== "selection.patch") {
      chotNhom();
      ketQua.push(r);
      continue;
    }
    const truoc = nhomHienTai[nhomHienTai.length - 1];
    const cungNguoiLienTiep =
      truoc &&
      khoaNguoi(truoc) === khoaNguoi(r) &&
      new Date(r.createdAt).getTime() - new Date(truoc.createdAt).getTime() <= CUA_SO_GOP_MS;

    if (truoc && !cungNguoiLienTiep) chotNhom();
    nhomHienTai.push(r);
  }
  chotNhom();

  return ketQua;
}

/**
 * Điểm vào chính: nhận danh sách dòng thô (thứ tự bất kỳ), trả danh sách hiển
 * thị đã lọc `gallery.auth`, gộp `selection.patch`, dịch câu, và sắp MỚI NHẤT
 * TRƯỚC.
 */
export function xepDongThoiGian(rowsTho: RawActivityRow[]): DongThoiGian[] {
  const daLoc = locGalleryAuth(rowsTho);

  const tangDan = [...daLoc].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const daGop = gopSelectionPatch(tangDan);

  const dong: DongThoiGian[] = daGop.map((r) => {
    const deDich: DongNhatKyDeDich = {
      action: r.action,
      actorType: r.actorType,
      actorLabel: r.actorLabel,
      metadata: r.metadata,
      staffFullName: r.staffFullName,
    };
    const { nhom, cau } = dichHoatDong(r.action, r.metadata);
    return { luc: r.createdAt, nhom, cau, nguoi: suyNguoi(deDich) };
  });

  return dong.sort((a, b) => new Date(b.luc).getTime() - new Date(a.luc).getTime());
}
