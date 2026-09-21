/**
 * Bắn tin sang Lark cho nhân viên.
 *
 * OWNER: DEV-INT. Task BB-080 (khung), BB-167 (lấp thân).
 * Spec: docs/08-lark-integration.md §2
 *
 * ===========================================================================
 * Ba thứ đã hỏng trước bản vá này, và không thứ nào báo gì
 * ===========================================================================
 *
 * **1. `enqueueLarkNotification` ném "Not implemented".** Khung ký từ BB-080,
 * thân để trống chờ Phase 3. Không chỗ nào gọi nó, nên không ai gặp lỗi.
 *
 * **2. `/api/g/submit` tự ghi thẳng vào `notifications` — và ghi TRƯỢT.** Nó
 * đặt hai cột `gallery_id` và `recipient`; bảng không có cột nào trong hai cột
 * đó. Đo ngày 21/09/2026 bằng chính khoá của app:
 *
 *     PGRST204: Could not find the 'gallery_id' column of 'notifications'
 *
 * `supabase-js` KHÔNG ném lỗi — nó trả `{ data, error }`. Mã cũ bỏ qua cả hai.
 * Nên mỗi lượt khách bấm Chốt là một dòng thông báo rơi vào hư không, và khách
 * vẫn nhận 200. Bảng `notifications` rỗng trơn từ đầu tới nay.
 *
 * **3. Không có gì gửi đi cả.** `docs/08` thiết kế: đẩy vào hàng đợi, cron
 * `flush-notifications` gửi mỗi 5 phút. Nhưng `docs/11 §5` ghi rõ **gói Hobby
 * chỉ cho cron chạy MỘT LẦN MỖI NGÀY**, và chính vì thế `flush-notifications`
 * đã bị gỡ khỏi `vercel.json`. Thiết kế ấy phụ thuộc vào một thứ không tồn tại
 * được trên hạ tầng đang dùng.
 *
 * ===========================================================================
 * Nên đổi thiết kế: hàng đợi để BỀN, không phải để NHANH
 * ===========================================================================
 * Gửi NGAY trong lượt gọi, sau khi việc nghiệp vụ đã xong, với hạn chờ cứng.
 * Hàng đợi vẫn ghi — nhưng nó là sổ cái và là đường thử lại, không còn là
 * đường đi chính.
 *
 * Vì sao đảo lại như vậy:
 *
 * - Tin "khách vừa chốt 24 ảnh" mà tới sau 24 tiếng thì **không còn là thông
 *   báo**, nó là lịch sử. CSKH đã biết bằng đường khác từ lâu.
 * - Hạ tầng hiện tại không có chỗ cho một lượt chạy mỗi 5 phút, và sẽ không có
 *   cho tới khi nâng gói. Thiết kế phải chạy được trên thứ đang có.
 *
 * Cái giá, nói thẳng: lượt gọi của khách dài thêm đúng bằng thời gian Lark trả
 * lời. Chặn lại bằng `HAN_CHO_MS` — quá hạn thì cắt, ghi `failed`, và **việc
 * của khách vẫn xong**. Lark chết không được phép làm hỏng nút Chốt.
 *
 * ===========================================================================
 * Bốn chốt an toàn, không cái nào được nới
 * ===========================================================================
 *
 * **Không bao giờ ném.** Mọi đường vào đều bọc kín. Hàm này đứng sau một giao
 * dịch đã commit; ném ở đây là biến một việc đã xong thành lỗi 500 trước mặt
 * ba mẹ.
 *
 * **Không ảnh của bé sang Lark** (`docs/08 §5`). Nhóm chat rộng hơn app rất
 * nhiều, và tin nhắn Lark thì chuyển tiếp được. `locBoAnh()` chặn ở tầng cuối,
 * không dựa vào người gọi nhớ.
 *
 * **Số điện thoại che giữa**: `090***4567`.
 *
 * **Không mã link trần.** Sáu ký tự đầu, cùng luật với `cheMa`.
 */

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export type LarkEvent =
  | "gallery.sent"
  | "gallery.first_view"
  | "selection.submitted"
  | "gallery.due_soon"
  | "gallery.overdue"
  | "gallery.sync_error"
  | "delivery.ready";

export interface LarkNotification {
  /** Chi nhánh của bộ ảnh. `null` = tin của nhóm quản lý chung. */
  branchId: string | null;
  event: LarkEvent;
  payload: Record<string, unknown>;
}

/**
 * Hạn chờ Lark trả lời.
 *
 * Ba giây, không phải mười: đây là thời gian ba mẹ ngồi nhìn nút Chốt quay.
 * Lark chậm hơn thế thì thà ghi `failed` rồi thử lại sau còn hơn bắt khách chờ.
 */
const HAN_CHO_MS = 3_000;

/** Thử lại tối đa bấy nhiêu lượt rồi bỏ (docs/08 §2). */
export const SO_LAN_THU_TOI_DA = 3;

/** Bao nhiêu dòng tồn đọng được xử trong một lượt quét. */
const MOI_LUOT_QUET = 50;

/**
 * Chỉ nhận webhook của đúng miền Lark.
 *
 * Giá trị này nằm trong `settings` — một bảng CSKH và quản lý chi nhánh sửa
 * được. Không chốt miền ở đây thì một dòng gõ nhầm (hay gõ cố ý) biến mọi tin
 * nội bộ của studio — tên khách, số điện thoại, số tiền — thành một dòng POST
 * đều đặn sang máy chủ của người lạ.
 *
 * `larksuite.com` là bản quốc tế, `feishu.cn` là bản Trung Quốc. Studio đang
 * dùng bản quốc tế; nhận cả hai để đổi bản không phải sửa mã.
 */
const MIEN_LARK = /^https:\/\/open\.(larksuite\.com|feishu\.cn)\/open-apis\/bot\/v2\/hook\//;

/** Che giữa số điện thoại: 0901234567 → 090***4567. */
export function cheSoDienThoai(so: string | null | undefined): string | null {
  if (!so) return null;
  const chiSo = so.replace(/\D/g, "");
  if (chiSo.length < 7) return "***";
  return `${chiSo.slice(0, 3)}***${chiSo.slice(-4)}`;
}

/**
 * Cắt mọi thứ trông như ảnh ra khỏi payload, ở tầng cuối cùng trước khi gửi.
 *
 * `docs/08 §5` cấm gửi ảnh của bé sang Lark. Chốt đó phải nằm ở ĐÂY chứ không
 * phải ở từng chỗ gọi: chỗ gọi sẽ nhiều dần lên, và chỉ cần một chỗ quên là
 * ảnh một đứa bé nằm trong nhóm chat có thể chuyển tiếp ra ngoài.
 *
 * Chặn theo tên khoá lẫn theo hình dạng giá trị — tên khoá đổi được, còn một
 * chuỗi trỏ vào tệp ảnh thì vẫn là ảnh.
 */
export function locBoAnh(payload: Record<string, unknown>): Record<string, unknown> {
  const KHOA_CAM = /(photo|image|anh|thumb|url|src|href|drive)/i;
  const GIA_TRI_CAM = /(^https?:\/\/)|(\.(jpe?g|png|webp|heic|heif|gif)(\?|$))/i;

  const ra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (KHOA_CAM.test(k)) continue;
    if (typeof v === "string" && GIA_TRI_CAM.test(v)) continue;
    ra[k] = v;
  }
  return ra;
}

/**
 * Địa chỉ webhook của nhóm nhận tin.
 *
 * Chi nhánh trước, nhóm chung sau. `docs/08 §2` nói rõ vì sao KHÔNG gộp cả ba
 * chi nhánh vào một nhóm: khoảng 120 tin một ngày, nhân viên tắt thông báo
 * trong tuần đầu, và từ đó mọi cảnh báo đều vô dụng.
 *
 * Chưa cấu hình nhóm nào thì trả `null` — và đó KHÔNG phải lỗi. Studio chưa
 * dựng nhóm Lark cho chi nhánh là chuyện bình thường; việc vẫn phải chạy.
 */
export async function timWebhook(branchId: string | null): Promise<string | null> {
  const admin = createAdminClient();

  const doc = async (bId: string | null) => {
    let q = admin.from("settings").select("value").eq("key", "lark.webhook_url");
    q = bId === null ? q.is("branch_id", null) : q.eq("branch_id", bId);
    const { data } = await q.maybeSingle();
    const v = (data as { value?: unknown } | null)?.value;
    return typeof v === "string" && MIEN_LARK.test(v) ? v : null;
  };

  if (branchId) {
    const rieng = await doc(branchId);
    if (rieng) return rieng;
  }
  return doc(null);
}

/** Dựng thẻ tin nhắn. Trả `null` cho sự kiện chưa có mẫu — không bịa ra tin. */
export function dungThe(
  event: LarkEvent,
  p: Record<string, unknown>,
  diaChiAdmin: string | null,
): Record<string, unknown> | null {
  const so = (v: unknown) => (typeof v === "number" ? v : Number(v ?? 0));
  const chu = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : "—");
  const tien = (v: unknown) => `${so(v).toLocaleString("vi-VN")}đ`;

  const o = (nhan: string, giaTri: string) => ({
    is_short: true,
    text: { tag: "lark_md", content: `**${nhan}:**\n${giaTri}` },
  });

  if (event === "selection.submitted") {
    const thua = so(p.extraCount);
    const truong = [
      o("Khách", chu(p.confirmedByName)),
      o("Bộ ảnh", chu(p.galleryTitle)),
      o("Đã chọn", `${so(p.selectedCount)} ảnh`),
      o("Trong gói", so(p.includedQuota) > 0 ? `${so(p.includedQuota)} ảnh` : "chưa rõ"),
    ];
    if (thua > 0) {
      truong.push(o("Chọn thêm", `${thua} ảnh`), o("Phụ thu", tien(p.extraAmount)));
    }
    if (p.customerPhone) truong.push(o("Điện thoại", chu(p.customerPhone)));

    const elements: Record<string, unknown>[] = [{ tag: "div", fields: truong }];
    if (diaChiAdmin) {
      elements.push({
        tag: "action",
        actions: [
          {
            tag: "button",
            text: { tag: "plain_text", content: "Mở bộ ảnh" },
            type: "primary",
            url: diaChiAdmin,
          },
        ],
      });
    }

    return {
      msg_type: "interactive",
      card: {
        header: {
          // Đỏ khi có phụ thu: đó là dòng CSKH phải xử lý, không chỉ để biết.
          template: thua > 0 ? "orange" : "green",
          title: {
            tag: "plain_text",
            content: thua > 0 ? "Khách chốt ảnh — CÓ PHỤ THU" : "Khách đã chốt ảnh",
          },
        },
        elements,
      },
    };
  }

  return null;
}

/**
 * Đang chạy phép thử thì KHÔNG được bắn tin thật.
 *
 * Học bằng cách làm hỏng, 21/09/2026: bộ phép thử của BB-114 gọi thật
 * `/api/g/submit` trên bb-dev — cơ sở dữ liệu THẬT, `settings` THẬT, webhook
 * THẬT. Ngay sau khi đường bắn tin chạy được, sáu thẻ "Test BB114…" đã rơi
 * vào nhóm Lark thật của studio trong một lượt `npm run test`.
 *
 * Trước đó không ai gặp vì đường ghi cũ hỏng sẵn (PGRST204) — tức là chính
 * cái lỗi này đang che cái lỗi kia.
 *
 * Chốt ở đây chứ không ở từng phép thử: phép thử sẽ nhiều dần lên, và chỉ cần
 * một cái quên là nhân viên studio lại nhận tin rác giữa giờ làm.
 */
function dangChayPhepThu(): boolean {
  // Cửa thoát cho chính phép thử của đường này: nó thay `fetch` bằng hàm giả
  // nên không có gì ra ngoài máy. Bộ phép thử nào gọi thật đường `/api/g/submit`
  // thì KHÔNG đặt biến này, và vì thế không bắn được tin nào.
  if (process.env.LARK_CHO_PHEP_GUI_TRONG_PHEP_THU === "1") return false;
  return Boolean(process.env.VITEST) || process.env.NODE_ENV === "test";
}

/** Gửi một thẻ đi. Không ném; trả lý do bằng tiếng Việt khi hỏng. */
async function gui(
  webhook: string,
  the: Record<string, unknown>,
): Promise<{ duoc: boolean; lyDo?: string }> {
  const dungLai = new AbortController();
  const hen = setTimeout(() => dungLai.abort(), HAN_CHO_MS);
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(the),
      signal: dungLai.signal,
    });

    if (!res.ok) return { duoc: false, lyDo: `Lark trả ${res.status}` };

    // Lark trả 200 KÈM mã lỗi trong thân khi thẻ sai hay webhook đã bị xoá.
    // Đọc 200 là thành công ở đây nghĩa là đánh dấu `sent` cho một tin không
    // ai nhận được — đúng loại im lặng mà cả task này sinh ra để dẹp.
    const than = (await res.json().catch(() => null)) as { code?: number; msg?: string } | null;
    if (than && typeof than.code === "number" && than.code !== 0) {
      return { duoc: false, lyDo: `Lark báo lỗi ${than.code}: ${than.msg ?? ""}`.trim() };
    }
    return { duoc: true };
  } catch (err) {
    const lyDo =
      err instanceof Error && err.name === "AbortError"
        ? `Lark không trả lời trong ${HAN_CHO_MS}ms`
        : err instanceof Error
          ? err.message
          : String(err);
    return { duoc: false, lyDo };
  } finally {
    clearTimeout(hen);
  }
}

/**
 * Ghi vào sổ rồi bắn đi ngay. **Không bao giờ ném.**
 *
 * Thứ tự cố ý: ghi hàng đợi TRƯỚC. Máy chủ chết giữa chừng thì vẫn còn dòng
 * `pending` để lượt quét sau nhặt lên. Gửi trước rồi mới ghi là mất dấu.
 */
export async function enqueueLarkNotification(tin: LarkNotification): Promise<void> {
  try {
    const admin = createAdminClient();
    const payload = locBoAnh(tin.payload);

    const { data: dong } = await admin
      .from("notifications")
      .insert({
        branch_id: tin.branchId,
        channel: "lark",
        template: tin.event,
        payload,
        status: "pending",
      })
      .select("id")
      .single();

    if (dangChayPhepThu()) {
      if (dong?.id) {
        await admin
          .from("notifications")
          .update({ status: "skipped", last_error: "Đang chạy phép thử — không bắn tin thật" })
          .eq("id", dong.id);
      }
      return;
    }

    const webhook = await timWebhook(tin.branchId);
    if (!webhook) {
      // Chưa dựng nhóm Lark không phải lỗi. `skipped` để lượt quét sau không
      // thử lại vô ích, và để màn Cài đặt phân biệt được "chưa cấu hình" với
      // "cấu hình rồi mà gửi hỏng" — hai việc dẫn tới hai hành động khác hẳn.
      if (dong?.id) {
        await admin
          .from("notifications")
          .update({ status: "skipped", last_error: "Chưa cấu hình lark.webhook_url" })
          .eq("id", dong.id);
      }
      return;
    }

    const the = dungThe(tin.event, payload, diaChiBoAnh(payload.galleryId));
    if (!the) {
      if (dong?.id) {
        await admin
          .from("notifications")
          .update({ status: "skipped", last_error: `Chưa có mẫu thẻ cho ${tin.event}` })
          .eq("id", dong.id);
      }
      return;
    }

    const kq = await gui(webhook, the);
    if (dong?.id) {
      await admin
        .from("notifications")
        .update(
          kq.duoc
            ? { status: "sent", sent_at: new Date().toISOString(), attempts: 1 }
            : { status: "failed", attempts: 1, last_error: kq.lyDo ?? "không rõ" },
        )
        .eq("id", dong.id);
    }
  } catch (err) {
    // Hàm này đứng sau một giao dịch ĐÃ commit. Ném ở đây là biến việc đã xong
    // của ba mẹ thành một cái 500 trước mặt họ.
    console.error(
      JSON.stringify({
        evt: "lark_notify.failed",
        event: tin.event,
        lyDo: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/** Địa chỉ màn quản trị của bộ ảnh. `null` khi thiếu NEXT_PUBLIC_APP_URL. */
function diaChiBoAnh(galleryId: unknown): string | null {
  const goc = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!goc || typeof galleryId !== "string" || !galleryId) return null;
  return `${goc.replace(/\/$/, "")}/admin/galleries/${galleryId}`;
}

/**
 * Quét lại những tin chưa gửi được. Dùng cho lượt chạy định kỳ.
 *
 * Đây là LƯỚI ĐỠ, không phải đường đi chính — đường chính là gửi ngay ở
 * `enqueueLarkNotification`. Nên chạy mỗi ngày một lượt là đủ: nó chỉ chạm tới
 * những tin đã hỏng, và tin hỏng là ngoại lệ.
 */
export async function guiLaiThongBaoDangCho(): Promise<{
  daXu: number;
  daGui: number;
  conHong: number;
}> {
  const admin = createAdminClient();
  let daGui = 0;
  let conHong = 0;

  // Cùng chốt như `enqueueLarkNotification` — xem ghi chú ở `dangChayPhepThu`.
  if (dangChayPhepThu()) return { daXu: 0, daGui: 0, conHong: 0 };

  const { data: dong } = await admin
    .from("notifications")
    .select("id, branch_id, template, payload, attempts")
    .eq("channel", "lark")
    .in("status", ["pending", "failed"])
    .lt("attempts", SO_LAN_THU_TOI_DA)
    .order("created_at", { ascending: true })
    .limit(MOI_LUOT_QUET);

  type Dong = {
    id: string;
    branch_id: string | null;
    template: string;
    payload: Record<string, unknown>;
    attempts: number;
  };

  // `Array.isArray` chứ không `?? []`: khi truy vấn hỏng, `data` về `null` — nhưng
  // cũng có thể về một thứ khác không lặp được, và lúc đó vòng lặp ném
  // `is not iterable`. Hàm này đi nhờ lượt chạy của `expire-galleries`, nên ném ở
  // đây là kéo sập luôn phần cho link hết hạn — đúng loại đổ dây chuyền mà
  // BB-186 vừa dẹp xong.
  const dsDong = (Array.isArray(dong) ? dong : []) as unknown as Dong[];

  for (const d of dsDong) {
    const webhook = await timWebhook(d.branch_id);
    const the = webhook ? dungThe(d.template as LarkEvent, d.payload, diaChiBoAnh(d.payload?.galleryId)) : null;

    if (!webhook || !the) {
      await admin
        .from("notifications")
        .update({
          status: "skipped",
          last_error: webhook ? `Chưa có mẫu thẻ cho ${d.template}` : "Chưa cấu hình lark.webhook_url",
        })
        .eq("id", d.id);
      continue;
    }

    const kq = await gui(webhook, the);
    const lanThu = d.attempts + 1;
    await admin
      .from("notifications")
      .update(
        kq.duoc
          ? { status: "sent", sent_at: new Date().toISOString(), attempts: lanThu }
          : { status: "failed", attempts: lanThu, last_error: kq.lyDo ?? "không rõ" },
      )
      .eq("id", d.id);

    if (kq.duoc) daGui++;
    else conHong++;
  }

  return { daXu: dsDong.length, daGui, conHong };
}
