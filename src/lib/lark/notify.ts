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
import { dangChayPhepThu } from "@/lib/kiem-thu";

export type LarkEvent =
  | "gallery.sent"
  | "gallery.first_view"
  | "selection.submitted"
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
  | "mua_them.yeu_cau";

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
    };
    const loai = TIEU_DE[chu(p.loai)];
    const ds = Array.isArray(p.cacBo) ? (p.cacBo as Record<string, unknown>[]) : [];
    if (!loai || ds.length === 0) return null;
    const goc = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ?? "";
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

    if (dangChayPhepThu()) {
      if (dong?.id) {
        const { error: err0 } = await admin
          .from("notifications")
          .update({ status: "skipped", last_error: "Đang chạy phép thử — không bắn tin thật" })
          .eq("id", dong.id);
        if (err0) console.error("Lỗi cập nhật skipped cho " + dong.id, err0);
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
