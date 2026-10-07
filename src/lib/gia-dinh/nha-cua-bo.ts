/**
 * BB-392 mục 3a (anh 06/10, mục 10 + 6): "một nhà có nhiều buổi chụp, có nhiều
 * bộ ảnh trên hậu kỳ — cần hiển thị dễ hiểu logic, liên kết công việc dễ làm".
 *
 * Dòng việc (Việc cần xử lý, Bàn làm việc) của bộ thuộc khách có ≥ 2 bộ hiện
 * nhãn nhà "Nhà <tên khách> · Buổi N/M" + lối "Xem cả nhà" sang trang khách.
 * Số buổi N cùng cách đánh số với link gia đình (`docMoiBo`, bo-anh-gia-dinh.ts):
 * cột `so_thu_tu_khach` nếu đã có, không thì vị trí theo (created_at, id) trong
 * mọi bộ của khách. Chỉ HIỂN THỊ — không đổi cách đếm việc.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface NhaCuaBo {
  customerId: string;
  /** Tên khách thật; null khi chỉ có tên che "KH · …" — giao diện tự lùi về "Nhà này". */
  tenKhach: string | null;
  buoi: number;
  tong: number;
}

export interface DongBoCuaKhach {
  id: string;
  customer_id: string | null;
  created_at: string;
  so_thu_tu_khach?: number | null;
}

/** HÀM THUẦN — mọi bộ của các khách → nhãn nhà cho bộ thuộc khách có ≥ 2 bộ. */
export function tinhNhaCuaBo(cacBo: readonly DongBoCuaKhach[], tenKhach: ReadonlyMap<string, string | null> = new Map()): Map<string, NhaCuaBo> {
  const theoKhach = new Map<string, DongBoCuaKhach[]>();
  for (const b of cacBo) {
    if (!b.customer_id) continue;
    const ds = theoKhach.get(b.customer_id) ?? [];
    ds.push(b);
    theoKhach.set(b.customer_id, ds);
  }
  const ra = new Map<string, NhaCuaBo>();
  for (const [customerId, ds] of theoKhach) {
    if (ds.length < 2) continue;
    const xep = [...ds].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    xep.forEach((b, i) => {
      ra.set(b.id, {
        customerId,
        tenKhach: tenKhach.get(customerId) ?? null,
        buoi: b.so_thu_tu_khach != null ? b.so_thu_tu_khach : i + 1,
        tong: xep.length,
      });
    });
  }
  return ra;
}

/** Chữ nhãn: "Nhà Nguyễn Thị Mai · Buổi 2/3". */
export function chuNhanNha(n: NhaCuaBo): string {
  return `${n.tenKhach ? `Nhà ${n.tenKhach}` : "Nhà này"} · Buổi ${n.buoi}/${n.tong}`;
}

function laLoiThieuCot(err: { code?: string; message?: string } | null): boolean {
  return !!err && (err.code === "42703" || /column .* does not exist|could not find the .* column/i.test(err.message ?? ""));
}

/**
 * BB-394 — như `docNhaCuaCacBo` nhưng đọc lỗi thì trả {} (bỏ nhãn) chứ không ném:
 * nhãn nhà chỉ là phụ, không được làm hỏng danh sách việc. MỘT lần đọc cho cả trang.
 */
export async function docNhaCuaCacBoKhongLoi(db: SupabaseClient, galleryIds: readonly string[]): Promise<Record<string, NhaCuaBo>> {
  try {
    return await docNhaCuaCacBo(db, galleryIds);
  } catch {
    return {};
  }
}

/**
 * Đọc nhãn nhà cho một loạt bộ ảnh (máy chủ, client service_role). Trả object
 * thường (galleryId → NhaCuaBo) để gửi qua JSON. Bộ thuộc khách chỉ có 1 bộ thì
 * không có mặt.
 */
export async function docNhaCuaCacBo(db: SupabaseClient, galleryIds: readonly string[]): Promise<Record<string, NhaCuaBo>> {
  const ids = [...new Set(galleryIds)].filter(Boolean);
  if (ids.length === 0) return {};
  const khachIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from("galleries").select("customer_id").in("id", ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as { customer_id: string | null }[]) if (r.customer_id) khachIds.add(r.customer_id);
  }
  if (khachIds.size === 0) return {};
  const khach = [...khachIds];

  const cacBo: DongBoCuaKhach[] = [];
  const tenKhach = new Map<string, string | null>();
  for (let i = 0; i < khach.length; i += 200) {
    const nhom = khach.slice(i, i + 200);
    const coCot = await db.from("galleries").select("id, customer_id, created_at, so_thu_tu_khach").in("customer_id", nhom);
    let dong: unknown[] | null = coCot.data;
    if (coCot.error) {
      if (!laLoiThieuCot(coCot.error)) throw coCot.error;
      const khong = await db.from("galleries").select("id, customer_id, created_at").in("customer_id", nhom);
      if (khong.error) throw khong.error;
      dong = khong.data;
    }
    cacBo.push(...((dong ?? []) as DongBoCuaKhach[]));
    const { data: kh, error: loiKh } = await db.from("customers").select("id, full_name").in("id", nhom);
    if (loiKh) throw loiKh;
    for (const k of (kh ?? []) as { id: string; full_name: string | null }[]) {
      const ten = (k.full_name ?? "").trim();
      // Tên che do đồng bộ Lark sinh ra ("KH · <mã>") không phải tên người.
      tenKhach.set(k.id, ten && !/^KH\s*·/.test(ten) ? ten : null);
    }
  }
  const nha = tinhNhaCuaBo(cacBo, tenKhach);
  const ra: Record<string, NhaCuaBo> = {};
  for (const id of ids) {
    const n = nha.get(id);
    if (n) ra[id] = n;
  }
  return ra;
}
