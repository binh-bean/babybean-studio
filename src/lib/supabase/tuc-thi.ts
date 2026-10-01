/**
 * BB-342 — cập nhật tức thì giữa khách và nhân viên (Supabase Realtime Broadcast).
 *
 * OWNER: DEV-BE.
 *
 * ---------------------------------------------------------------------------
 * Vì sao Broadcast phát từ máy chủ, không dùng postgres_changes
 * ---------------------------------------------------------------------------
 * Khách KHÔNG phải người dùng Supabase Auth (phiên khách là cookie ký bằng
 * APP_SECRET — gallery-session.ts), và RLS đã khoá kín mọi bảng với `anon`.
 * postgres_changes đi qua RLS nên khách không nghe được gì; mở RLS cho anon
 * thì lại thành lỗ hổng. Vậy nên: route API — sau khi đã ghi xong việc nghiệp
 * vụ — gọi REST `POST /realtime/v1/api/broadcast` bằng service_role, một lượt
 * HTTP (không mở websocket trên máy chủ, hợp với serverless).
 *
 * ---------------------------------------------------------------------------
 * Vì sao tên kênh là HMAC, không phải id
 * ---------------------------------------------------------------------------
 * Kênh broadcast công khai: ai biết TÊN kênh và có khoá anon (khoá này nằm
 * trong mã trình duyệt) là nghe được. Nên tên kênh = HMAC-SHA256(APP_SECRET,
 * "bb-tuc-thi:v1:<loai>:<id>") — chỉ máy chủ tính được. Khách chỉ nhận tên
 * kênh của ĐÚNG bộ ảnh trong phiên của mình (`GET /api/g/tuc-thi`), nhân viên
 * chỉ nhận tên kênh của ĐÚNG các chi nhánh mình được gán (`GET
 * /api/admin/tuc-thi`). Biết id bộ ảnh khác cũng không suy ra được tên kênh.
 *
 * Phương án còn lại — kênh riêng tư + RLS trên `realtime.messages` — cần khách
 * cầm JWT của Supabase. Khách không có (và cấp JWT cho khách là mở thêm một bề
 * mặt tấn công vào PostgREST), nên không chọn. Không cần migration.
 *
 * ---------------------------------------------------------------------------
 * Payload: chỉ LOẠI + id
 * ---------------------------------------------------------------------------
 * Không tên, không số điện thoại, không tiền. Trình duyệt nhận xong gọi lại
 * API (nơi kiểm quyền thật). Kênh khách còn không mang id bộ ảnh.
 *
 * ---------------------------------------------------------------------------
 * Không bao giờ ném, không chặn lâu
 * ---------------------------------------------------------------------------
 * Luôn được gọi SAU khi việc nghiệp vụ đã ghi xong — đúng luật `ghiNhatKy`.
 * Realtime chập chờn không được biến việc khách chốt ảnh thành lỗi 500. Chờ
 * tối đa 2 giây; hỏng thì ghi log `tuc_thi.phat_hong`. Phía trình duyệt còn
 * lưới đỡ: mất kết nối thì 30 giây hỏi lại một lần, quay lại tab thì tải lại.
 */

import "server-only";
import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { TEN_SU_KIEN_TUC_THI, laLoaiHopLe } from "@/lib/utils/tuc-thi-su-kien";

const TIEN_TO = "bb-tuc-thi:v1";
const CHO_TOI_DA_MS = 2_000;

function khoaBiMat(): string {
  const goc = process.env.APP_SECRET;
  if (!goc || goc.length < 32) throw new Error("APP_SECRET thiếu hoặc ngắn hơn 32 ký tự");
  return goc;
}

function bam(phan: string): string {
  // 24 byte = 192 bit: không dò được, mà tên kênh vẫn ngắn.
  return createHmac("sha256", khoaBiMat()).update(`${TIEN_TO}:${phan}`).digest("base64url").slice(0, 32);
}

/** Kênh của MỘT bộ ảnh — khách của bộ đó nghe. */
export function kenhKhach(galleryId: string): string {
  return `kh:${bam(`kh:${galleryId}`)}`;
}

/** Kênh của MỘT chi nhánh — nhân viên được gán chi nhánh đó nghe. */
export function kenhNhanVien(branchId: string): string {
  return `nv:${bam(`nv:${branchId}`)}`;
}

export interface SuKienCanPhat {
  galleryId: string;
  /** Chi nhánh của bộ ảnh. Thiếu thì tự tra (một câu hỏi nhỏ theo khoá chính). */
  branchId?: string | null;
  loai: string;
}

/**
 * Phát một sự kiện cho CẢ kênh khách của bộ ảnh LẪN kênh nhân viên của chi
 * nhánh — một lượt HTTP. Hai phía cùng tải lại: khách thấy trạng thái mới,
 * nhân viên khác cũng thấy việc vừa được xử lý rời hàng đợi.
 *
 * Trả `true` khi Supabase nhận (202). Không bao giờ ném.
 */
export async function phatSuKienBoAnh(
  suKien: SuKienCanPhat,
  client?: SupabaseClient,
): Promise<boolean> {
  try {
    if (!laLoaiHopLe(suKien.loai)) throw new Error(`loai không hợp lệ: ${String(suKien.loai).slice(0, 60)}`);
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const khoa = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !khoa) return false;

    let branchId = suKien.branchId ?? null;
    if (!branchId) {
      // Tra hỏng thì vẫn phát cho khách — chỉ thiếu kênh nhân viên lần này.
      try {
        const { data } = await (client ?? createAdminClient())
          .from("galleries")
          .select("branch_id")
          .eq("id", suKien.galleryId)
          .maybeSingle();
        branchId = (data?.branch_id as string | undefined) ?? null;
      } catch {
        branchId = null;
      }
    }

    const messages: { topic: string; event: string; payload: Record<string, string> }[] = [
      { topic: kenhKhach(suKien.galleryId), event: TEN_SU_KIEN_TUC_THI, payload: { loai: suKien.loai } },
    ];
    if (branchId) {
      messages.push({
        topic: kenhNhanVien(String(branchId)),
        event: TEN_SU_KIEN_TUC_THI,
        payload: { loai: suKien.loai, galleryId: suKien.galleryId },
      });
    }

    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { apikey: khoa, Authorization: `Bearer ${khoa}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(CHO_TOI_DA_MS),
    });
    if (res.status !== 202 && !res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return true;
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "tuc_thi.phat_hong",
        loai: suKien.loai,
        galleryId: suKien.galleryId,
        loi: err instanceof Error ? err.message : String(err),
      }),
    );
    return false;
  }
}
