/**
 * Gửi thông báo đẩy (Web Push) cho mọi trình duyệt đã đăng ký của một bộ ảnh,
 * và ghi một dòng vào hộp thư của khách (`thong_bao_khach`, BB-261).
 *
 * OWNER: Sonnet (BB-246, BB-261). Chủ studio: ba mẹ bật thông báo tự động
 * (chuông ở góc phải màn khách), rồi nhận tin khi ảnh đã chỉnh xong hoặc hình
 * đã về, mời duyệt — không cần mở lại link để biết, và nếu chưa đọc thì vẫn
 * thấy trong chuông.
 *
 * ---------------------------------------------------------------------------
 * Không bao giờ ném ra ngoài
 * ---------------------------------------------------------------------------
 * Hàm này luôn được gọi SAU khi việc nghiệp vụ chính (chuyển trạng thái bộ
 * ảnh) đã ghi xong — đúng luật của `ghiNhatKy` (src/lib/nhat-ky.ts). Một dịch
 * vụ đẩy chập chờn (FCM/APNs/Mozilla) không được phép biến việc CSKH chuyển
 * file cho khách thành lỗi 500. Hỏng thì ghi log `thong_bao.day.loi`, không
 * ném — kể cả khi ghi hộp thư hỏng (xem `ghiHopThu`).
 *
 * ---------------------------------------------------------------------------
 * Payload KHÔNG chứa dữ liệu nhạy cảm
 * ---------------------------------------------------------------------------
 * Chỉ `{ galleryId, tieuDe, noiDung, thongBaoId }`. Mã link khách là BÍ MẬT
 * (server chỉ giữ dạng băm, xem 0070 + src/lib/auth/ma-link.ts) nên không gửi
 * link, không gửi tên bé, không gửi ảnh qua payload đẩy — nó đi qua mạng của
 * bên thứ ba (Google/Apple/Mozilla). Service worker tự tra lại URL đã lưu cục
 * bộ theo `galleryId` lúc bấm mở thông báo (xem public/sw.js). `thongBaoId`
 * chỉ là UUID của dòng hộp thư — không phải bí mật.
 *
 * ---------------------------------------------------------------------------
 * Thiếu khoá VAPID → tắt êm
 * ---------------------------------------------------------------------------
 * Studio có thể chưa sinh khoá VAPID (npx web-push generate-vapid-keys). Thiếu
 * bất kỳ biến nào trong ba biến NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY/
 * VAPID_SUBJECT thì hàm này coi như "chưa bật tính năng" — thoát êm, không
 * ném, không gửi gì. Nút bật thông báo ở màn khách cũng tự ẩn trong cùng
 * điều kiện đó (bat-thong-bao.tsx).
 *
 * ---------------------------------------------------------------------------
 * Dọn đăng ký đã chết
 * ---------------------------------------------------------------------------
 * Dịch vụ đẩy trả 404/410 khi trình duyệt đã gỡ đăng ký (gỡ app, xoá dữ liệu,
 * đổi máy...) — endpoint đó vĩnh viễn không dùng lại được. Không xoá thì mỗi
 * lần gửi sau lại thử lại một endpoint chết, tốn thời gian và làm log rối.
 */

import "server-only";
import webpush from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface NoiDungThongBao {
  tieuDe: string;
  noiDung: string;
  /**
   * BB-261: loại sự kiện, vd `anh_chinh_xong`, `hinh_da_ve` — ghi vào
   * `thong_bao_khach.loai` để phân biệt nguồn gốc trong hộp thư của khách.
   */
  loai: string;
}

interface KhoaVapid {
  publicKey: string;
  privateKey: string;
  subject: string;
}

function docKhoaVapid(): KhoaVapid | null {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

/** Lỗi `web-push` gắn `statusCode` từ phản hồi HTTP của dịch vụ đẩy. */
function maLoiHttp(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const sc = (err as { statusCode?: unknown }).statusCode;
    if (typeof sc === "number") return sc;
  }
  return undefined;
}

function ghiLoi(galleryId: string, loi: unknown, endpoint?: string): void {
  console.error(
    JSON.stringify({
      evt: "thong_bao.day.loi",
      galleryId,
      // Chỉ 12 ký tự đầu của endpoint — đủ để lần ra dòng nào, không lộ toàn
      // bộ endpoint (endpoint gắn với một trình duyệt cụ thể).
      endpoint: endpoint ? endpoint.slice(0, 12) : undefined,
      loi: loi instanceof Error ? loi.message : String(loi),
    }),
  );
}

/**
 * BB-261: ghi một dòng vào hộp thư của khách (`thong_bao_khach`), LUÔN LUÔN —
 * kể cả khi bộ ảnh chưa có đăng ký push nào. Khách vẫn thấy dòng này trong
 * chuông lần sau mở app, dù chưa từng bấm "Cho phép thông báo".
 *
 * Không bao giờ ném: hàm này đứng trước phần gửi push, và cùng luật với
 * guiThongBaoBoAnh — hỏng ghi hộp thư không được phép chặn phần gửi push tiếp
 * theo, càng không được phép biến việc nghiệp vụ chính thành lỗi 500.
 */
async function ghiHopThu(
  client: SupabaseClient,
  galleryId: string,
  noiDung: NoiDungThongBao,
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from("thong_bao_khach")
      .insert({
        gallery_id: galleryId,
        loai: noiDung.loai,
        tieu_de: noiDung.tieuDe,
        noi_dung: noiDung.noiDung,
      })
      .select("id")
      .single();
    if (error) throw error;
    return (data?.id as string | undefined) ?? null;
  } catch (err) {
    ghiLoi(galleryId, err);
    return null;
  }
}

/**
 * Gửi phần PUSH thô tới mọi đăng ký của bộ ảnh `galleryId` — không đụng hộp
 * thư (`thong_bao_khach`). Dùng cho cả lượt gửi đầu (`guiThongBaoBoAnh`, sau
 * khi đã ghi hộp thư) LẪN lượt NHẮC LẠI (`nhacThongBaoChuaDoc`, dòng hộp thư
 * đã có sẵn, chỉ cần gửi lại đúng `thongBaoId` đó).
 *
 * Không bao giờ ném — cùng luật với `guiThongBaoBoAnh`.
 */
export async function guiPushToiBoAnh(
  client: SupabaseClient,
  galleryId: string,
  noiDung: { tieuDe: string; noiDung: string },
  thongBaoId: string | null,
): Promise<void> {
  try {
    const vapid = docKhoaVapid();
    if (!vapid) return; // Chưa cấu hình khoá — tính năng tự tắt êm.

    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

    const { data: dsDangKy, error } = await client
      .from("push_dang_ky")
      .select("id, endpoint, p256dh, auth")
      .eq("gallery_id", galleryId);

    if (error) throw error;
    if (!dsDangKy || dsDangKy.length === 0) return;

    const payload = JSON.stringify({
      galleryId,
      tieuDe: noiDung.tieuDe,
      noiDung: noiDung.noiDung,
      thongBaoId,
    });

    await Promise.all(
      dsDangKy.map(async (dk) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: dk.endpoint as string,
              keys: { p256dh: dk.p256dh as string, auth: dk.auth as string },
            },
            payload,
          );

          const { error: upErr } = await client
            .from("push_dang_ky")
            .update({ gui_ok_luc: new Date().toISOString() })
            .eq("id", dk.id as string);
          if (upErr) ghiLoi(galleryId, upErr, dk.endpoint as string);
        } catch (err) {
          const status = maLoiHttp(err);
          if (status === 404 || status === 410) {
            // Đăng ký đã chết ở phía trình duyệt — xoá, không thử lại nữa.
            const { error: delErr } = await client
              .from("push_dang_ky")
              .delete()
              .eq("id", dk.id as string);
            if (delErr) ghiLoi(galleryId, delErr, dk.endpoint as string);
            return;
          }
          ghiLoi(galleryId, err, dk.endpoint as string);
        }
      }),
    );
  } catch (err) {
    ghiLoi(galleryId, err);
  }
}

/**
 * Gửi thông báo tới mọi đăng ký của bộ ảnh `galleryId`, và ghi một dòng vào
 * hộp thư của khách (`thong_bao_khach`) trước đó — xem `ghiHopThu`.
 *
 * `client` là admin client (service_role) — cả hai bảng đều không có policy
 * nào, chỉ service_role đọc/ghi được (xem migration 0071, 0074).
 */
export async function guiThongBaoBoAnh(
  client: SupabaseClient,
  galleryId: string,
  noiDung: NoiDungThongBao,
): Promise<void> {
  const thongBaoId = await ghiHopThu(client, galleryId, noiDung);
  await guiPushToiBoAnh(client, galleryId, noiDung, thongBaoId);
}
