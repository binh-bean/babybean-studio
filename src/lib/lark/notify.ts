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
import { khongGuiRaLarkThat } from "@/lib/kiem-thu";
import { hienTieuDeBoAnh } from "@/lib/utils/ma-hoa-don";

export type LarkEvent =
  | "gallery.sent"
  | "gallery.first_view"
  | "selection.submitted"
  /**
   * BB-321 — khách chốt một ĐỢT chọn thêm (đợt 2, 3, …) sau khi đợt 1 đã được
   * xác nhận. CSKH xác nhận/từ chối trong app rồi tự cập nhật hợp đồng bên Lark
   * bằng tay (chủ studio: không đẩy đợt lên bản ghi Lark thật).
   */
  | "selection.round_submitted"
  | "gallery.due_soon"
  | "gallery.overdue"
  | "gallery.sync_error"
  | "gallery.reopen_requested"
  | "delivery.ready"
  /** BB-200 — tin tổng hợp mốc hậu kỳ (docs/21), một thẻ cho mỗi chi nhánh × loại nhắc. */
  | "hau_ky.nhac"
  /**
   * BB-245 — ba mẹ gửi yêu cầu mua thêm sau khi ĐÃ DUYỆT ảnh (bộ ảnh đã khoá,
   * không có vòng xin sửa nào). App KHÔNG cộng tiền, CSKH gọi lại chốt giá.
   */
  | "mua_them.yeu_cau"
  /** BB-284 — khách DUYỆT ảnh đã chỉnh, không xin sửa gì thêm. Chuyển in. */
  | "review.approved"
  /** BB-284 — khách xin sửa kèm ghi chú, sau khi xem bản đã chỉnh. */
  | "review.changes_requested"
  /** BB-399 — ba mẹ mua "Làm ảnh nhanh" SAU khi đã chốt (thẻ sau chốt). */
  | "dich_vu.lam_nhanh";

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
 *
 * BẪY khi đặt tên khoá tiếng Việt không dấu: "anh" nằm lẫn trong rất nhiều từ —
 * `maNhac` (m-ANH-ac), `danhSach` (d-ANH-sach), `thanhTien`, `nhanh`… Khoá như
 * vậy bị cắt IM LẶNG và thẻ ra rỗng. BB-200 vấp hai lần trong một buổi; phép
 * thử tests/unit/bb-200-the-nhac-hau-ky.test.ts canh cho khoá của nó.
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

/**
 * BB-284 — "nhắc nội bộ": tin CHỈ để nhân viên biết (nhắc hậu kỳ, nhắc khách
 * chưa chốt...), phân biệt với tin khách→studio (`selection.submitted`,
 * `gallery.reopen_requested`, `mua_them.yeu_cau`, `review.*`) — những tin đó
 * LUÔN gửi, không nằm dưới công tắc này.
 *
 * Chủ studio 27/09/2026: automatic của Lark ở nhóm khác đã lo phần "ảnh về" và
 * "cảnh báo nội bộ" rồi, nên tắt các tin này trong app — tạm thời, tới lúc
 * chuyển hẳn Lark qua app thì bật lại bằng đúng công tắc này.
 *
 * Liệt kê theo CODE THẬT tính đến BB-284: chỉ `hau_ky.nhac`
 * (`src/app/api/cron/hau-ky/route.ts`) và `gallery.due_soon`
 * (`src/lib/gallery/nhac-khach.ts`) có nơi gọi thật. Năm sự kiện còn lại nằm
 * sẵn trong `LarkEvent` từ trước nhưng CHƯA có chỗ nào gọi (`dungThe` cũng
 * chưa có mẫu thẻ cho chúng) — liệt kê ở đây để nếu sau này có người nối dây
 * thêm thì mặc định vẫn TẮT, không phải nhớ quay lại sửa danh sách này.
 */
const SU_KIEN_NHAC_NOI_BO = new Set<LarkEvent>([
  "hau_ky.nhac",
  "gallery.due_soon",
  "gallery.overdue",
  "gallery.sync_error",
  "gallery.sent",
  "gallery.first_view",
  "delivery.ready",
]);

/**
 * Đọc công tắc `lark.nhac_noi_bo` trong `settings` (toàn hệ thống, không theo
 * chi nhánh). Mặc định TẮT (`false`) khi chưa cấu hình — đúng yêu cầu BB-284:
 * an toàn hơn là mặc định BẬT rồi quên tắt.
 *
 * Bật lại: màn Cài đặt → nhóm "Liên lạc" → "Nhắc nội bộ vào Lark", hoặc ghi
 * thẳng `update settings set value = 'true'::jsonb where key = 'lark.nhac_noi_bo'
 * and branch_id is null`.
 */
async function nhacNoiBoDangBat(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", "lark.nhac_noi_bo")
    .is("branch_id", null)
    .maybeSingle();
  return (data as { value?: unknown } | null)?.value === true;
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

  /**
   * BB-200 — nhắc theo mốc hậu kỳ (docs/21 "Chủ studio chốt 25/09/2026").
   *
   * Khoá danh sách là `cacBo` — KHÔNG phải `boAnh` hay `danhSach`: `locBoAnh()` cắt mọi
   * khoá có chữ "anh" — và d-ANH-sach cũng dính (phép thử BB-200 bắt được).
   * Trong danh sách không có đường link nào — nút mở bộ
   * ảnh dựng TẠI ĐÂY từ galleryId, nên không có URL nào đi qua payload.
   */
  if (event === "hau_ky.nhac") {
    const TIEU_DE: Record<string, { tieuDe: string; mau: string; viec: string }> = {
      qua_han_chon_hinh: {
        tieuDe: "QUẢN LÝ: bộ ảnh đã chọn hình quá hạn chưa chỉnh",
        mau: "purple",
        viec: "Quản lý vào xử lý quá hạn hậu kỳ.",
      },
      dang_lam_lau: {
        tieuDe: "Bộ ảnh 'Đang làm' quá 2 ngày",
        mau: "orange",
        viec: "Thợ chỉnh ảnh hoàn thành giúp.",
      },
      cho_khach_duyet: {
        tieuDe: "Đã gửi duyệt, khách chưa phản hồi",
        mau: "orange",
        viec: "CSKH gọi điện / nhắn tin nhắc khách duyệt ảnh.",
      },
      dang_in_lau: {
        tieuDe: "Đã gửi in quá 2 ngày",
        mau: "orange",
        viec: "CSKH kiểm tra, cập nhật và làm việc với nhà in.",
      },
      hinh_ve_chua_lay: {
        tieuDe: "Hình đã về, khách chưa lấy",
        mau: "orange",
        viec: "CSKH nhắc khách qua lấy hình.",
      },
      cam_on_sau_giao: {
        tieuDe: "Gọi cảm ơn khách đã nhận hình",
        mau: "green",
        viec: "CSKH gọi điện, nhắn tin cảm ơn, xin phản hồi về ảnh và dịch vụ.",
      },
      // BB-392 mục 2 — thư mục "ảnh chỉnh sửa" đã về (cron quét Drive kéo ảnh
      // về app), CSKH kiểm rồi bấm "Gửi khách duyệt". App KHÔNG tự gửi khách.
      anh_chinh_cho_gui: {
        tieuDe: "Ảnh chỉnh đã về",
        mau: "blue",
        viec: "CSKH kiểm ảnh chỉnh rồi bấm **Gửi khách duyệt** trong app.",
      },
    };
    const loai = TIEU_DE[chu(p.loai)];
    const ds = Array.isArray(p.cacBo) ? (p.cacBo as Record<string, unknown>[]) : [];
    if (!loai || ds.length === 0) return null;
    const goc = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ?? "";
    if (chu(p.loai) === "anh_chinh_cho_gui") {
      const dongAc = ds.slice(0, 30).map((b) => {
        const mo =
          goc && typeof b.galleryId === "string" ? ` — [mở](${goc}/admin/galleries/${b.galleryId}#anh-chinh-sua)` : "";
        return `• **${hienTieuDeBoAnh(chu(b.galleryTitle))}** — ${so(b.moc)} ảnh, về ${so(b.soNgay)} ngày${mo}`;
      });
      if (ds.length > 30) dongAc.push(`… và ${ds.length - 30} bộ nữa`);
      const loiVao = goc ? `\n[Mở Việc cần xử lý › Ảnh chỉnh sửa](${goc}/admin/viec-can-xu-ly?tab=anh-chinh-sua)` : "";
      return {
        msg_type: "interactive",
        card: {
          header: {
            template: loai.mau,
            title: { tag: "plain_text", content: `${ds.length} bộ có ảnh chỉnh chờ gửi khách duyệt` },
          },
          elements: [
            { tag: "div", text: { tag: "lark_md", content: `${loai.viec}${loiVao}` } },
            { tag: "div", text: { tag: "lark_md", content: dongAc.join("\n") } },
          ],
        },
      };
    }
    const dong = ds.slice(0, 30).map((b) => {
      const ten = [chu(b.customerName), typeof b.customerPhone === "string" ? b.customerPhone : null]
        .filter((x) => x && x !== "—")
        .join(" · ");
      const mo =
        goc && typeof b.galleryId === "string" ? ` — [mở](${goc}/admin/galleries/${b.galleryId})` : "";
      return `• **${chu(b.galleryTitle)}**${ten ? ` (${ten})` : ""} — ${so(b.soNgay)} ngày${mo}`;
    });
    if (ds.length > 30) dong.push(`… và ${ds.length - 30} bộ nữa`);
    return {
      msg_type: "interactive",
      card: {
        header: {
          template: loai.mau,
          title: { tag: "plain_text", content: `${loai.tieuDe} — ${ds.length} bộ` },
        },
        elements: [
          { tag: "div", text: { tag: "lark_md", content: loai.viec } },
          { tag: "div", text: { tag: "lark_md", content: dong.join("\n") } },
        ],
      },
    };
  }

  /**
   * BB-399 — dòng "Làm ảnh nhanh (N ngày)". Khoá payload `lamGapNgay` (KHÔNG chứa chữ "anh":
   * `locBoAnh()` cắt mọi khoá có "anh" — "nhanh" cũng dính). 0/thiếu = không mua.
   */
  const dongLamNhanh = (): Record<string, unknown> | null =>
    so(p.lamGapNgay) > 0
      ? {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**Làm ảnh nhanh (${so(p.lamGapNgay)} ngày)** — thợ ưu tiên chỉnh bộ này.`,
          },
        }
      : null;

  if (event === "dich_vu.lam_nhanh") {
    const ngay = so(p.lamGapNgay);
    if (ngay <= 0) return null;
    const han = typeof p.hanTraDuKien === "string" ? new Date(p.hanTraDuKien) : null;
    const hanChu =
      han && !Number.isNaN(han.getTime())
        ? `${String(han.getDate()).padStart(2, "0")}/${String(han.getMonth() + 1).padStart(2, "0")}/${han.getFullYear()}`
        : "—";
    const elements: Record<string, unknown>[] = [
      {
        tag: "div",
        fields: [o("Bộ ảnh", chu(p.galleryTitle)), o("Giá", tien(p.donGia)), o("Hạn trả dự kiến", hanChu)],
      },
      dongLamNhanh()!,
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: 'Khách mua sau khi đã chốt danh sách. CSKH thêm dòng "Làm ảnh nhanh" vào hoá đơn Lark.',
        },
      },
    ];
    if (diaChiAdmin) {
      elements.push({
        tag: "action",
        actions: [{ tag: "button", text: { tag: "plain_text", content: "Mở bộ ảnh" }, type: "primary", url: diaChiAdmin }],
      });
    }
    return {
      msg_type: "interactive",
      card: {
        header: { template: "orange", title: { tag: "plain_text", content: `Khách chọn làm ảnh nhanh (${ngay} ngày)` } },
        elements,
      },
    };
  }

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

    /*
      BB-321 — đợt 1 chốt THIẾU ảnh so với hạn mức và khách NHỜ studio chọn bổ
      sung (đã tick đồng ý không đổi lại), và/hoặc còn sản phẩm in chưa chọn ảnh
      (khách đã tick biết ảnh sẽ lâu hơn timeline). Hai việc CSKH phải làm, nên
      thẻ nói thẳng ra. Khoá tránh chữ "anh": `nhoStudioSoTam`, `soMonInThieuTam`.
    */
    const nhoStudio = so(p.nhoStudioSoTam);
    const inThieu = so(p.soMonInThieuTam);
    if (nhoStudio > 0) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Khách nhờ studio chọn thêm ${nhoStudio} ảnh** — khách đã đồng ý với ảnh studio chọn dùm và không đổi lại.`,
        },
      });
    }
    if (inThieu > 0) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**Còn ${inThieu} sản phẩm in chưa chọn ảnh** — khách đã biết nhận ảnh sẽ lâu hơn timeline.`,
        },
      });
    }
    const lamNhanhChot = dongLamNhanh();
    if (lamNhanhChot) elements.push(lamNhanhChot);

    /*
      BB-202 — dòng "Bìa album": tên tệp (không đuôi, xem submit/route.ts).
      Mảng rỗng (gói không có album, hoặc bảng album_covers chưa áp) thì
      không thêm dòng nào — không bịa ra thông tin cho gói không mua album.
    */
    const biaAlbum = Array.isArray(p.biaAlbumTen) ? (p.biaAlbumTen as unknown[]) : [];
    const tenBia = biaAlbum.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    if (tenBia.length > 0) {
      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: `**Bìa album:** ${tenBia.join(", ")}` },
      });
    }

    /*
      BB-284 — sản phẩm mua thêm LÚC CHỌN ảnh (`selection_addons`, khác với
      "chọn thêm ẢNH" ở `extraCount`/`extraAmount` phía trên, và khác với
      `mua_them.yeu_cau` — sự kiện đó là mua thêm SAU KHI đã duyệt ảnh).
      Không có dòng này thì CSKH đọc thẻ tưởng khách chỉ chọn thêm ảnh, bỏ sót
      đơn hàng sản phẩm đã nằm sẵn trong lượt chốt này.
    */
    const monMuaThem = Array.isArray(p.cacMonMuaThem)
      ? (p.cacMonMuaThem as Record<string, unknown>[])
      : [];
    if (monMuaThem.length > 0) {
      const dong = monMuaThem.map((m) => `• ${chu(m.ten)} ×${so(m.soLuong)}`);
      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: `**Mua thêm lúc chọn:**\n${dong.join("\n")}` },
      });
    }

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
          template: thua > 0 || nhoStudio > 0 || inThieu > 0 ? "orange" : "green",
          title: {
            tag: "plain_text",
            content:
              thua > 0
                ? "Khách chốt ảnh — CÓ PHỤ THU"
                : nhoStudio > 0
                  ? "Khách chốt ảnh — NHỜ STUDIO CHỌN THÊM"
                  : "Khách đã chốt ảnh",
          },
        },
        elements,
      },
    };
  }

  /**
   * BB-321 — khách chốt một đợt chọn thêm. Thẻ CAM: có tiền phát sinh cần CSKH
   * xác nhận trong app rồi cập nhật hợp đồng bên Lark.
   *
   * Khoá payload tránh chữ "anh" (`locBoAnh()` cắt theo TÊN KHOÁ): `soTam`,
   * `soTamTinhTien`, `phuThuTam` — KHÔNG `soAnh`/`tienAnh`; `cacMon` — không
   * `danhSach`. Không có đường link nào trong payload: nút mở bộ ảnh dựng tại
   * đây từ `galleryId`.
   */
  if (event === "selection.round_submitted") {
    const soDot = so(p.soDot);
    const truong = [
      o("Bộ ảnh", chu(p.galleryTitle)),
      o("Đợt", `Đợt ${soDot}`),
      o("Số ảnh", `${so(p.soTam)} ảnh`),
      o("Tổng tiền", tien(p.tongTien)),
    ];
    if (so(p.soTamTinhTien) > 0) {
      truong.push(o("Ảnh phụ thu", `${so(p.soTamTinhTien)} ảnh · ${tien(p.phuThuTam)}`));
    }
    if (so(p.tienSanPham) > 0) truong.push(o("Sản phẩm", tien(p.tienSanPham)));
    if (so(p.soMonInThieuTam) > 0) {
      truong.push(o("Còn thiếu ảnh in", `Còn ${so(p.soMonInThieuTam)} sản phẩm in chưa chọn ảnh`));
    }
    truong.push(o("Khách", chu(p.customerName ?? p.nguoiChot)));
    if (p.customerPhone) truong.push(o("Điện thoại", chu(p.customerPhone)));

    const elements: Record<string, unknown>[] = [{ tag: "div", fields: truong }];

    const mon = Array.isArray(p.cacMon) ? (p.cacMon as Record<string, unknown>[]) : [];
    if (mon.length > 0) {
      const dong = mon.slice(0, 20).map((m) => `• ${chu(m.ten)} ×${so(m.soLuong)}`);
      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: ["**Mua thêm:**", ...dong].join("\n") },
      });
    }
    const lamNhanhDot = dongLamNhanh();
    if (lamNhanhDot) elements.push(lamNhanhDot);
    elements.push({
      tag: "div",
      text: {
        tag: "lark_md",
        content: "CSKH xác nhận hoặc từ chối đợt này trong app, rồi cập nhật hợp đồng bên Lark.",
      },
    });
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
          template: "orange",
          title: { tag: "plain_text", content: `Khách mua thêm — đợt ${soDot}` },
        },
        elements,
      },
    };
  }

  /**
   * BB-068 — nhắc bộ ảnh khách chưa chốt.
   *
   * Thẻ này là để CSKH NHẤC MÁY GỌI, nên nó phải trả lời đúng ba câu ngay trên
   * màn khoá điện thoại: bộ nào, gửi mấy ngày rồi, còn mấy ngày nữa hết hạn.
   * Thiếu câu thứ ba thì người đọc phải mở app ra mới biết có gấp hay không.
   */
  if (event === "gallery.due_soon") {
    const conLai = p.conLaiNgay === null || p.conLaiNgay === undefined ? null : so(p.conLaiNgay);
    const truong = [
      o("Bộ ảnh", chu(p.galleryTitle)),
      o("Khách", chu(p.customerName)),
      o("Đã gửi", `${so(p.ngayThu)} ngày trước`),
      o("Còn lại", conLai === null ? "chưa đặt hạn" : conLai <= 0 ? "đã tới hạn" : `${conLai} ngày`),
    ];
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
        // Đỏ khi còn dưới hai ngày: quá mốc đó thì gọi muộn là mất luôn khách
        // vào vòng "link hết hạn, xin mở lại".
        header: {
          template: conLai !== null && conLai <= 2 ? "red" : "orange",
          title: { tag: "plain_text", content: "Khách chưa chốt ảnh" },
        },
        elements,
      },
    };
  }

  /**
   * Ba mẹ xin mở lại bộ ảnh đã khoá.
   *
   * Thẻ ĐỎ, và lý do của ba mẹ hiện nguyên văn: đây là thứ CSKH phải đọc rồi
   * quyết, không phải thứ để biết. Kèm nút mở thẳng màn quản trị vì việc kế
   * tiếp luôn là mở bộ ảnh ra xem đã chỉnh tới đâu.
   */
  if (event === "gallery.reopen_requested") {
    const elements: Record<string, unknown>[] = [
      {
        tag: "div",
        fields: [o("Bộ ảnh", chu(p.galleryTitle)), o("Đang ở bước", chu(p.trangThai))],
      },
      {
        tag: "div",
        text: { tag: "lark_md", content: `**Ba mẹ nhắn:**
${chu(p.lyDo)}` },
      },
    ];
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
          template: "red",
          title: { tag: "plain_text", content: "Khách xin sửa lại bộ ảnh đã chốt" },
        },
        elements,
      },
    };
  }

  /**
   * BB-245 — ba mẹ gửi yêu cầu mua thêm sau khi đã duyệt ảnh. Thẻ chỉ để CSKH
   * gọi lại chốt giá/thanh toán — app không hề cộng tiền vào hợp đồng, nên
   * không có con số "thành tiền" nào trong thẻ này.
   *
   * Khoá `cacMon` (không phải `danhSach`) và `tenTep` (không phải `tenAnh`
   * hay id ảnh) — cùng bẫy đã canh ở `hau_ky.nhac`: `locBoAnh()` cắt mọi khoá
   * khớp chữ "anh".
   */
  if (event === "mua_them.yeu_cau") {
    const mon = Array.isArray(p.cacMon) ? (p.cacMon as Record<string, unknown>[]) : [];
    if (mon.length === 0) return null;

    const dong = mon.map((m) => {
      const tep = typeof m.tenTep === "string" && m.tenTep ? ` (${m.tenTep})` : "";
      const ghi = typeof m.ghiChu === "string" && m.ghiChu ? ` — “${m.ghiChu}”` : "";
      return `• **${chu(m.ten)}** ×${so(m.soLuong)}${tep}${ghi}`;
    });

    /**
     * BB-254 — có khi yêu cầu đến từ link ông bà/người thân (vai 'viewer'),
     * không phải ba mẹ đứng hợp đồng. CSKH phải gọi lại ĐÚNG người vừa gửi,
     * nên thẻ ghi rõ "Người mua: <nhãn link> · <tên> · <SĐT che>" thay vì im
     * lặng coi mọi yêu cầu đều từ ba mẹ.
     */
    const coNguoiMua = typeof p.nguoiMuaTen === "string" && p.nguoiMuaTen.trim().length > 0;
    const elements: Record<string, unknown>[] = [
      { tag: "div", fields: [o("Bộ ảnh", chu(p.tieuDeBo)), o("Số sản phẩm", `${so(p.tongSoMon)}`)] },
    ];
    if (coNguoiMua) {
      const nhanLink = typeof p.nhanNguoiMua === "string" && p.nhanNguoiMua ? p.nhanNguoiMua : null;
      const soLienHe = typeof p.soLienHeNguoiMua === "string" ? p.soLienHeNguoiMua : null;
      const phanTu = [nhanLink, chu(p.nguoiMuaTen), soLienHe].filter((x): x is string => Boolean(x));
      elements.push({
        tag: "div",
        text: { tag: "lark_md", content: `**Người mua:** ${phanTu.join(" · ")}` },
      });
    }
    elements.push(
      { tag: "div", text: { tag: "lark_md", content: dong.join("\n") } },
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: coNguoiMua
            ? "Chưa thanh toán — CSKH gọi lại ĐÚNG người mua ở trên để chốt giá và cách thanh toán."
            : "Ba mẹ chưa thanh toán — CSKH gọi lại chốt giá và cách thanh toán.",
        },
      },
    );
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
          template: "purple",
          title: { tag: "plain_text", content: "Khách gửi yêu cầu mua thêm" },
        },
        elements,
      },
    };
  }

  /**
   * BB-284 — khách DUYỆT ảnh đã chỉnh, không xin sửa gì. Thẻ XANH: đây là tin
   * CSKH cần biết để bắt đầu chuẩn bị in, không phải tin phải xử lý gấp.
   */
  if (event === "review.approved") {
    const truong = [o("Bộ ảnh", chu(p.galleryTitle)), o("Khách", chu(p.customerName))];
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
          template: "green",
          title: { tag: "plain_text", content: "Khách duyệt ảnh — chuyển in" },
        },
        elements,
      },
    };
  }

  /**
   * BB-284 — khách xem bản đã chỉnh nhưng xin sửa kèm ghi chú. Thẻ ĐỎ, cùng
   * mức ưu tiên với `gallery.reopen_requested`: người chỉnh ảnh cần đọc đúng
   * chữ khách viết để không phải gọi lại hỏi sửa gì.
   *
   * `cacTam` (không phải "danhSachAnh" — `locBoAnh()` cắt mọi khoá khớp chữ
   * "anh", và "danhSach" dính bẫy đó, xem ghi chú ở `hau_ky.nhac`) là chỗ để
   * MỞ RỘNG sau này nếu app có ghi chú theo từng tấm; hiện `POST /api/g/review`
   * chỉ có một ghi chú chung cho cả vòng sửa (`revision_requests.note`), nên
   * mảng này thường rỗng và thẻ rơi về nhánh ghi chú chung bên dưới.
   */
  if (event === "review.changes_requested") {
    const CAT_GHI_CHU = 200;
    const catNgan = (s: string) => (s.length > CAT_GHI_CHU ? `${s.slice(0, CAT_GHI_CHU)}…` : s);

    const truong = [o("Bộ ảnh", chu(p.galleryTitle)), o("Vòng sửa", `Lần ${so(p.round)}`)];
    if (p.customerPhone) truong.push(o("Điện thoại", chu(p.customerPhone)));

    const cacTam = Array.isArray(p.cacTam) ? (p.cacTam as Record<string, unknown>[]) : [];
    let noiDungGhiChu: string;
    if (cacTam.length > 0) {
      const TRAN = 20;
      const dong = cacTam
        .slice(0, TRAN)
        .map((t, i) => `${i + 1}. **${chu(t.ten)}** — ${catNgan(chu(t.ghiChu))}`);
      if (cacTam.length > TRAN) dong.push(`… và ${cacTam.length - TRAN} tấm khác`);
      noiDungGhiChu = dong.join("\n");
    } else {
      noiDungGhiChu = catNgan(chu(p.ghiChu));
    }

    const elements: Record<string, unknown>[] = [
      { tag: "div", fields: truong },
      { tag: "div", text: { tag: "lark_md", content: `**Ba mẹ ghi cần sửa:**\n${noiDungGhiChu}` } },
    ];
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
          template: "red",
          title: { tag: "plain_text", content: "Khách xin sửa ảnh đã chỉnh" },
        },
        elements,
      },
    };
  }

  return null;
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

    if (khongGuiRaLarkThat()) {
      if (dong?.id) {
        const { error: err0 } = await admin
          .from("notifications")
          .update({ status: "skipped", last_error: "Đang chạy phép thử — không bắn tin thật" })
          .eq("id", dong.id);
        if (err0) console.error("Lỗi cập nhật skipped cho " + dong.id, err0);
      }
      return;
    }

    // BB-284 — tin nội bộ (nhắc nhân viên, không phải tin khách↔studio) đứng
    // dưới công tắc `lark.nhac_noi_bo`, mặc định TẮT. Chặn TRƯỚC khi tra
    // webhook: tắt nghĩa là không hỏi Lark gì cả, không phải hỏi xong rồi
    // không gửi.
    if (SU_KIEN_NHAC_NOI_BO.has(tin.event) && !(await nhacNoiBoDangBat(admin))) {
      if (dong?.id) {
        const { error: errNoiBo } = await admin
          .from("notifications")
          .update({
            status: "skipped",
            last_error: "Nhắc nội bộ đang TẮT (lark.nhac_noi_bo) — bật lại ở Cài đặt > Liên lạc",
          })
          .eq("id", dong.id);
        if (errNoiBo) console.error("Lỗi cập nhật skipped (nhắc nội bộ) cho " + dong.id, errNoiBo);
      }
      return;
    }

    const webhook = await timWebhook(tin.branchId);
    if (!webhook) {
      // Chưa dựng nhóm Lark không phải lỗi. `skipped` để lượt quét sau không
      // thử lại vô ích, và để màn Cài đặt phân biệt được "chưa cấu hình" với
      // "cấu hình rồi mà gửi hỏng" — hai việc dẫn tới hai hành động khác hẳn.
      if (dong?.id) {
        const { error: err1 } = await admin
          .from("notifications")
          .update({ status: "skipped", last_error: "Chưa cấu hình lark.webhook_url" })
          .eq("id", dong.id);
        if (err1) console.error("Lỗi cập nhật skipped cho " + dong.id, err1);
      }
      return;
    }

    const the = dungThe(tin.event, payload, diaChiBoAnh(payload.galleryId));
    if (!the) {
      if (dong?.id) {
        const { error: err2 } = await admin
          .from("notifications")
          .update({ status: "skipped", last_error: `Chưa có mẫu thẻ cho ${tin.event}` })
          .eq("id", dong.id);
        if (err2) console.error("Lỗi cập nhật skipped cho " + dong.id, err2);
      }
      return;
    }

    const kq = await gui(webhook, the);
    if (dong?.id) {
      const { error: err3 } = await admin
        .from("notifications")
        .update(
          kq.duoc
            ? { status: "sent", sent_at: new Date().toISOString(), attempts: 1 }
            : { status: "failed", attempts: 1, last_error: kq.lyDo ?? "không rõ" },
        )
        .eq("id", dong.id);
      if (err3) console.error("Lỗi cập nhật trạng thái thông báo " + dong.id, err3);
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
  if (khongGuiRaLarkThat()) return { daXu: 0, daGui: 0, conHong: 0 };

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

  // Đọc một lần cho cả lượt quét, không phải mỗi dòng — công tắc không đổi
  // giữa chừng một lượt quét vài chục dòng.
  const noiBoDangBat = await nhacNoiBoDangBat(admin);

  for (const d of dsDong) {
    // BB-284 — dòng cũ (ghi trước khi có công tắc, hoặc ghi lúc công tắc còn
    // bật) mà giờ công tắc đã tắt thì không gửi lại — cùng luật với đường gửi
    // ngay ở `enqueueLarkNotification`.
    if (SU_KIEN_NHAC_NOI_BO.has(d.template as LarkEvent) && !noiBoDangBat) {
      const { error: errNoiBo } = await admin
        .from("notifications")
        .update({
          status: "skipped",
          last_error: "Nhắc nội bộ đang TẮT (lark.nhac_noi_bo) — bật lại ở Cài đặt > Liên lạc",
        })
        .eq("id", d.id);
      if (errNoiBo) console.error("Lỗi cập nhật skipped (nhắc nội bộ, retry) cho " + d.id, errNoiBo);
      continue;
    }

    const webhook = await timWebhook(d.branch_id);
    const the = webhook ? dungThe(d.template as LarkEvent, d.payload, diaChiBoAnh(d.payload?.galleryId)) : null;

    if (!webhook || !the) {
      const { error: err4 } = await admin
        .from("notifications")
        .update({
          status: "skipped",
          last_error: webhook ? `Chưa có mẫu thẻ cho ${d.template}` : "Chưa cấu hình lark.webhook_url",
        })
        .eq("id", d.id);
      if (err4) console.error("Lỗi cập nhật skipped (retry) cho " + d.id, err4);
      continue;
    }

    const kq = await gui(webhook, the);
    const lanThu = d.attempts + 1;
    const { error: err5 } = await admin
      .from("notifications")
      .update(
        kq.duoc
          ? { status: "sent", sent_at: new Date().toISOString(), attempts: lanThu }
          : { status: "failed", attempts: lanThu, last_error: kq.lyDo ?? "không rõ" },
      )
      .eq("id", d.id);
    if (err5) console.error("Lỗi cập nhật trạng thái thông báo (retry) " + d.id, err5);

    if (kq.duoc) daGui++;
    else conHong++;
  }

  return { daXu: dsDong.length, daGui, conHong };
}
