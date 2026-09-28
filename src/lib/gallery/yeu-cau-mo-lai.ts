/**
 * Trạng thái "khách xin mở lại bộ ảnh" — suy thẳng từ `activity_logs`, không
 * bảng mới, không cột mới.
 *
 * OWNER: DEV-BE. Task BB-312. Chủ studio: quy trình "khách xin mở lại" phải
 * có phản hồi ở CẢ HAI phía (quản trị thấy khối nổi bật, khách thấy đang chờ
 * hay đã xử lý).
 *
 * ---------------------------------------------------------------------------
 * Vì sao không dùng `revision_requests` (migration 0033)
 * ---------------------------------------------------------------------------
 * Bảng đó là vòng DUYỆT ẢNH ĐÃ CHỈNH (khách chê bản photoshop gửi, xin sửa lại
 * — BB-121): `unique (gallery_id, round)`, không có khái niệm "đang chờ/đã
 * mở/bị từ chối", và RLS chỉ cho photoshop_ctv/CSKH đọc — không khớp nghĩa
 * "xin MỞ LẠI LỰA CHỌN ẢNH" mà route `/api/g/xin-sua-lai` đang phục vụ. Ghép
 * hai khái niệm khác nhau vào một bảng là nguồn nhầm lẫn về sau, không phải
 * tiết kiệm.
 *
 * ---------------------------------------------------------------------------
 * Ba loại action, MỘT quy tắc: bản ghi mới nhất thắng
 * ---------------------------------------------------------------------------
 *   - gallery.reopen_requested — khách gửi (đã ghi ở /api/g/xin-sua-lai)
 *   - gallery.reopen           — CSKH mở lại (đã ghi ở admin/.../reopen)
 *   - gallery.reopen_rejected  — CSKH từ chối (admin/.../reopen/tu-choi, BB-312)
 *
 * Ba loại action trên CÙNG một `entity_id` (gallery.id) — bản ghi có
 * `created_at` lớn nhất quyết định trạng thái hiện tại. Khách xin lần 2 sau
 * khi bị từ chối thì một dòng `reopen_requested` mới lại là bản mới nhất, và
 * trạng thái quay về "đang chờ" — đúng vòng đời tự nhiên, không cần cờ riêng.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type TrangThaiXinMoLai = "khong_co" | "cho_xu_ly" | "da_mo" | "bi_tu_choi";

export interface XinMoLaiChiTiet {
  trangThai: TrangThaiXinMoLai;
  /** Lúc ba mẹ gửi yêu cầu ĐANG ĐƯỢC PHẢN ÁNH (yêu cầu gần nhất đã dẫn tới trạng thái hiện tại). */
  lucGuiGanNhat: string | null;
  /** Lời nhắn của khách kèm yêu cầu đó. */
  lyDoKhach: string | null;
  /** Lý do CSKH từ chối — chỉ có giá trị khi `trangThai === 'bi_tu_choi'`. */
  lyDoTuChoi: string | null;
  /** Lúc CSKH xử lý (mở hoặc từ chối) — null khi đang chờ hoặc chưa từng xin. */
  lucXuLy: string | null;
  /** Tổng số lần khách đã xin mở lại, MỌI THỜI ĐIỂM — cho câu "lần thứ N". */
  lanThu: number;
}

const RONG: XinMoLaiChiTiet = {
  trangThai: "khong_co",
  lucGuiGanNhat: null,
  lyDoKhach: null,
  lyDoTuChoi: null,
  lucXuLy: null,
  lanThu: 0,
};

interface HangHoatDongTho {
  created_at: string;
  metadata: Record<string, unknown> | null;
}

function layChuoi(m: Record<string, unknown> | null | undefined, khoa: string): string | null {
  const v = m?.[khoa];
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Đọc trạng thái xin mở lại của MỘT bộ ảnh. Ba lượt gọi song song (đều đi qua
 * chỉ mục `idx_activity_entity(entity_type, entity_id)`), không quét toàn
 * bảng — mỗi lượt chỉ lấy dòng MỚI NHẤT của đúng một loại action.
 */
export async function layTrangThaiXinMoLai(
  admin: SupabaseClient,
  galleryId: string,
): Promise<XinMoLaiChiTiet> {
  const coBan = () =>
    admin
      .from("activity_logs")
      .select("created_at, metadata")
      .eq("entity_type", "gallery")
      .eq("entity_id", galleryId);

  const [{ data: yeuCau, error: e1 }, { data: moLai, error: e2 }, { data: tuChoi, error: e3 }, { count: lanThu, error: e4 }] =
    await Promise.all([
      coBan().eq("action", "gallery.reopen_requested").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      coBan().eq("action", "gallery.reopen").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      coBan().eq("action", "gallery.reopen_rejected").order("created_at", { ascending: false }).limit(1).maybeSingle(),
      admin
        .from("activity_logs")
        .select("id", { count: "exact", head: true })
        .eq("entity_type", "gallery")
        .eq("entity_id", galleryId)
        .eq("action", "gallery.reopen_requested"),
    ]);
  if (e1) throw e1;
  if (e2) throw e2;
  if (e3) throw e3;
  if (e4) throw e4;

  const y = yeuCau as HangHoatDongTho | null;
  const m = moLai as HangHoatDongTho | null;
  const t = tuChoi as HangHoatDongTho | null;

  if (!y && !m && !t) return { ...RONG };

  const moc = (r: HangHoatDongTho | null) => (r ? new Date(r.created_at).getTime() : -Infinity);
  const mocY = moc(y);
  const mocM = moc(m);
  const mocT = moc(t);
  const moiNhat = Math.max(mocY, mocM, mocT);

  if (moiNhat === mocY) {
    // Yêu cầu MỚI NHẤT chưa được CSKH xử lý gì sau đó — đang chờ.
    return {
      trangThai: "cho_xu_ly",
      lucGuiGanNhat: y!.created_at,
      lyDoKhach: layChuoi(y!.metadata, "lyDo"),
      lyDoTuChoi: null,
      lucXuLy: null,
      lanThu: lanThu ?? 0,
    };
  }
  if (moiNhat === mocT) {
    return {
      trangThai: "bi_tu_choi",
      lucGuiGanNhat: y?.created_at ?? null,
      lyDoKhach: layChuoi(y?.metadata, "lyDo"),
      lyDoTuChoi: layChuoi(t!.metadata, "lyDo"),
      lucXuLy: t!.created_at,
      lanThu: lanThu ?? 0,
    };
  }
  // moiNhat === mocM — CSKH đã mở lại (không nhất thiết bắt nguồn từ yêu cầu
  // này, nhưng với khách thì "bộ ảnh vừa được mở lại" vẫn đúng, dù lý do gì).
  return {
    trangThai: "da_mo",
    lucGuiGanNhat: y?.created_at ?? null,
    lyDoKhach: layChuoi(y?.metadata, "lyDo"),
    lyDoTuChoi: null,
    lucXuLy: m!.created_at,
    lanThu: lanThu ?? 0,
  };
}

export interface DongChoXuLyMoLai {
  galleryId: string;
  title: string;
  status: string;
  branchId: string;
  branchName: string | null;
  customerName: string | null;
  requestedAt: string;
  lyDo: string | null;
  lanThu: number;
}

/**
 * Danh sách MỌI bộ ảnh đang có yêu cầu "xin mở lại" CHƯA XỬ LÝ, trong phạm vi
 * chi nhánh `branchIds` (null = mọi chi nhánh — chỉ `system:superuser` được
 * truyền null, do route gọi tự kiểm).
 *
 * Không có RPC riêng (brief cấm migration cho task này): lấy tối đa 500 dòng
 * `gallery.reopen_requested` GẦN NHẤT, giữ dòng mới nhất của mỗi bộ ảnh (list
 * đã sắp DESC nên dòng gặp đầu tiên là mới nhất), rồi loại các bộ đã có
 * `gallery.reopen`/`gallery.reopen_rejected` MỚI HƠN yêu cầu đó. 500 dòng đủ
 * dư so với quy mô thật (BB-276 giới hạn 3 lần/giờ/bộ) — cùng kiểu XẤP XỈ có
 * ghi chú như `qChuaCoHanMuc` ở `/api/admin/can-xu-ly`.
 */
export async function layDanhSachChoXuLyMoLai(
  admin: SupabaseClient,
  branchIds: string[] | null,
): Promise<DongChoXuLyMoLai[]> {
  const { data: guiRows, error: e1 } = await admin
    .from("activity_logs")
    .select("entity_id, created_at, metadata, branch_id")
    .eq("entity_type", "gallery")
    .eq("action", "gallery.reopen_requested")
    .order("created_at", { ascending: false })
    .limit(500);
  if (e1) throw e1;

  type HangGui = { entity_id: string; created_at: string; metadata: Record<string, unknown> | null; branch_id: string | null };
  const rows = (guiRows ?? []) as HangGui[];
  if (rows.length === 0) return [];

  const moiNhatTheoBo = new Map<string, HangGui>();
  const lanTheoBo = new Map<string, number>();
  for (const r of rows) {
    const id = r.entity_id;
    if (!moiNhatTheoBo.has(id)) moiNhatTheoBo.set(id, r);
    lanTheoBo.set(id, (lanTheoBo.get(id) ?? 0) + 1);
  }

  const ids = Array.from(moiNhatTheoBo.keys());
  if (ids.length === 0) return [];

  const [{ data: xuLyRows, error: e2 }, { data: galleryRows, error: e3 }] = await Promise.all([
    admin
      .from("activity_logs")
      .select("entity_id, created_at, action")
      .eq("entity_type", "gallery")
      .in("action", ["gallery.reopen", "gallery.reopen_rejected"])
      .in("entity_id", ids),
    admin
      .from("galleries")
      .select("id, title, status, branch_id, customer_id, branches(name)")
      .in("id", ids),
  ]);
  if (e2) throw e2;
  if (e3) throw e3;

  const xuLyMoiNhatTheoBo = new Map<string, number>();
  for (const r of (xuLyRows ?? []) as { entity_id: string; created_at: string }[]) {
    const moc = new Date(r.created_at).getTime();
    const hienTai = xuLyMoiNhatTheoBo.get(r.entity_id);
    if (hienTai === undefined || moc > hienTai) xuLyMoiNhatTheoBo.set(r.entity_id, moc);
  }

  type HangGallery = {
    id: string;
    title: string;
    status: string;
    branch_id: string;
    customer_id: string | null;
    branches: { name: string } | { name: string }[] | null;
  };
  const galleryById = new Map((galleryRows ?? []).map((g) => [String((g as HangGallery).id), g as HangGallery]));

  const dangChoIds: string[] = [];
  for (const id of ids) {
    const gui = moiNhatTheoBo.get(id)!;
    const xuLy = xuLyMoiNhatTheoBo.get(id);
    const mocGui = new Date(gui.created_at).getTime();
    if (xuLy !== undefined && xuLy > mocGui) continue; // đã xử lý sau lần xin gần nhất
    if (branchIds && !branchIds.includes(String(gui.branch_id ?? galleryById.get(id)?.branch_id ?? ""))) continue;
    dangChoIds.push(id);
  }
  if (dangChoIds.length === 0) return [];

  const customerIds = dangChoIds
    .map((id) => galleryById.get(id)?.customer_id)
    .filter((v): v is string => !!v);
  const { data: customerRows } = customerIds.length
    ? await admin.from("customers").select("id, full_name").in("id", customerIds)
    : { data: [] as { id: string; full_name: string }[] };
  const tenKhach = new Map((customerRows ?? []).map((c) => [c.id, c.full_name as string]));

  const tenChiNhanh = (raw: HangGallery["branches"]): string | null => {
    if (!raw) return null;
    if (Array.isArray(raw)) return raw[0]?.name ?? null;
    return raw.name ?? null;
  };

  return dangChoIds
    .map((id): DongChoXuLyMoLai | null => {
      const g = galleryById.get(id);
      if (!g) return null;
      const gui = moiNhatTheoBo.get(id)!;
      return {
        galleryId: id,
        title: g.title,
        status: g.status,
        branchId: g.branch_id,
        branchName: tenChiNhanh(g.branches),
        customerName: g.customer_id ? (tenKhach.get(g.customer_id) ?? null) : null,
        requestedAt: gui.created_at,
        lyDo: layChuoi(gui.metadata, "lyDo"),
        lanThu: lanTheoBo.get(id) ?? 1,
      };
    })
    .filter((v): v is DongChoXuLyMoLai => v !== null)
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());
}
