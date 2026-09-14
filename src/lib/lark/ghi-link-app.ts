/**
 * Ghi link app ngược lên cột "Link app" của bảng Hậu Kỳ bên Lark Bitable.
 *
 * OWNER: DEV-INT. Task BB-132.
 * Spec: docs/16-quy-trinh-dau-cuoi.md §2, docs/briefs/BB-132-dan-link-ve-lark.md
 *
 * ---------------------------------------------------------------------------
 * ĐÂY LÀ ĐƯỜNG GHI ĐẦU TIÊN ĐI LÊN LARK
 * ---------------------------------------------------------------------------
 * Mọi thứ trước nay (sync-lark-catalog / -contracts / -hauky, sync-retouch.ts)
 * chỉ ĐỌC XUỐNG. docs/16 §2 từng ghi "dán tay là cố ý" vì hai chiều thì hai bên
 * ghi đè nhau. Chỗ này mở đúng MỘT lỗ nhỏ trên nguyên tắc đó, và mở có rào:
 *
 *   - Chỉ ghi ĐÚNG MỘT CỘT. Thân yêu cầu chỉ mang một khoá duy nhất, nên dù
 *     có lỗi ở chỗ khác thì cột khác của Lark cũng không thể bị chạm tới.
 *     Lark PUT records là ghi ĐÈ THEO CỘT CÓ MẶT, cột vắng mặt giữ nguyên.
 *   - Chỉ ghi khi ô ĐANG TRỐNG, trừ khi người gọi nói rõ là ghi đè. Nhân viên
 *     đã dán tay một link vào đó thì máy không được lẳng lặng thay.
 *   - Tìm bảng và cột THEO TÊN lúc chạy. Repo CÔNG KHAI: không app_token,
 *     không table_id, không field_id, không option_id trong mã nguồn.
 *   - Không bao giờ ném lỗi ra ngoài. Xem `ghiLinkAppVeLark`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao tên cột phải khớp CHÍNH XÁC
 * ---------------------------------------------------------------------------
 * docs/16 §2 thêm HAI cột cùng mang chữ "link app":
 *
 *     "Lấy link app"   ô TÍCH — nhân viên tích để báo app dựng link
 *     "Link app"       ô chữ/URL — nơi chứa link đã tạo
 *
 * Một regex lỏng kiểu /link app/i khớp cả hai, và `Object.keys` của Lark không
 * hứa thứ tự nào cả. Nhét một địa chỉ web vào ô tích là vừa mất link vừa làm
 * hỏng đúng cái ô điều khiển luồng việc. Nên ở đây khớp NEO HAI ĐẦU, và còn
 * kiểm kiểu cột nữa: chỉ chấp nhận ô chữ hoặc ô URL.
 */

import "server-only";
import { HOST, larkAuth, type LarkAuthHeader } from "@/lib/lark/sync-retouch";

/** Tên bảng Hậu Kỳ — cùng mẫu với scripts/sync-lark-hauky.mjs. */
export const MAU_TEN_BANG_HAU_KY = /h[aậ]u k[yỳ]/i;

/**
 * Tên cột "Link app", NEO HAI ĐẦU.
 *
 * `^...$` là phần quan trọng nhất của tệp này: nó loại "Lấy link app" (ô tích).
 * Cho phép khoảng trắng thừa và một dấu cách ở giữa vì tên cột bên Lark do
 * người gõ, "Link  app" hay " Link app " đều đã gặp.
 */
export const MAU_TEN_COT_LINK_APP = /^\s*link\s*app\s*$/i;

/**
 * Kiểu cột Lark Bitable được phép ghi link vào.
 *
 *   1  = ô chữ nhiều dòng (Text)
 *   15 = ô liên kết (URL) — thân yêu cầu phải là { link, text }
 *
 * Mọi kiểu khác (7 = ô tích, 3 = một lựa chọn, 4 = nhiều lựa chọn...) đều từ
 * chối. Lark nhận kiểu sai thì có khi báo lỗi, có khi âm thầm nuốt — và cái
 * "âm thầm nuốt" là thứ không ai phát hiện cho tới lúc khách hỏi link đâu.
 */
const KIEU_O_CHU = 1;
const KIEU_O_URL = 15;

export interface ViTriGhi {
  tableId: string;
  tenBang: string;
  fieldName: string;
  fieldType: number;
}

export interface KetQuaGhiLark {
  /** Đã ghi thật lên Lark chưa. Chạy thử luôn là false. */
  ghiDuoc: boolean;
  /** Chạy thử: chỉ in dự định, không gọi PUT. */
  chayThu: boolean;
  /** Vì sao không ghi được — tiếng Việt, để hiện thẳng cho CSKH. */
  lyDo?: string;
  /** Bảng và cột đã tìm ra, để chạy thử in cho người soát. */
  viTri?: ViTriGhi;
  /** Mã dòng Hậu Kỳ sẽ ghi / đã ghi. */
  recordId?: string;
}

/**
 * Đọc cấu hình Lark từ biến môi trường. KHÔNG đọc .env.local trực tiếp.
 *
 * Trả null khi thiếu, KHÔNG ném: thiếu cấu hình Lark là chuyện của studio,
 * không phải lý do để chặn CSKH tạo link cho khách.
 */
export function docCauHinhLark(): { appId: string; appSecret: string; baseToken: string } | null {
  const appId = process.env.LARK_APP_ID?.trim();
  const appSecret = process.env.LARK_APP_SECRET?.trim();
  const baseToken = process.env.LARK_BASE_APP_TOKEN?.trim();
  if (!appId || !appSecret || !baseToken) return null;
  return { appId, appSecret, baseToken };
}

/** Tên các biến môi trường còn thiếu, để báo cho người vận hành biết thiếu gì. */
export function bienMoiTruongConThieu(): string[] {
  return ["LARK_APP_ID", "LARK_APP_SECRET", "LARK_BASE_APP_TOKEN"].filter(
    (ten) => !process.env[ten]?.trim(),
  );
}

/**
 * Tìm bảng Hậu Kỳ và cột "Link app" theo TÊN, ngay lúc chạy.
 *
 * Không nhận table_id/field_id từ ngoài vào: nhận là mở đường cho ai đó nhét
 * định danh vào biến môi trường rồi vào mã nguồn, và repo thì công khai.
 */
export async function timCotLinkApp(
  auth: LarkAuthHeader,
  baseToken: string,
): Promise<ViTriGhi> {
  const listRes = await fetch(`${HOST}/bitable/v1/apps/${baseToken}/tables?page_size=100`, {
    headers: { authorization: auth.authorization },
  });
  const list = (await listRes.json()) as {
    code: number;
    msg?: string;
    data?: { items?: Array<{ table_id: string; name: string }> };
  };
  if (list.code !== 0 || !list.data?.items) {
    throw new Error(`Không liệt kê được bảng từ Lark: ${list.msg || "lỗi kết nối"}`);
  }

  const table = list.data.items.find((t) => MAU_TEN_BANG_HAU_KY.test(t.name));
  if (!table) {
    throw new Error(
      `Không tìm thấy bảng Hậu Kỳ. Các bảng hiện có: ` +
        list.data.items.map((t) => t.name).join(" | "),
    );
  }

  const fieldsRes = await fetch(
    `${HOST}/bitable/v1/apps/${baseToken}/tables/${table.table_id}/fields?page_size=200`,
    { headers: { authorization: auth.authorization } },
  );
  const fields = (await fieldsRes.json()) as {
    code: number;
    msg?: string;
    data?: { items?: Array<{ field_name: string; type: number }> };
  };
  if (fields.code !== 0 || !fields.data?.items) {
    throw new Error(`Không đọc được danh sách cột của ${table.name}: ${fields.msg || "lỗi API"}`);
  }

  const khop = fields.data.items.filter((f) => MAU_TEN_COT_LINK_APP.test(f.field_name));
  if (khop.length === 0) {
    const gan = fields.data.items
      .filter((f) => /link/i.test(f.field_name))
      .map((f) => f.field_name);
    throw new Error(
      `Bảng ${table.name} chưa có cột "Link app".` +
        (gan.length ? ` Các cột có chữ "link": ${gan.join(" | ")}` : ""),
    );
  }
  // Hai cột cùng tên là bảng bị sửa tay thành mập mờ. Dừng, đừng chọn bừa —
  // chọn nhầm cột nghĩa là link biến mất mà không ai báo.
  if (khop.length > 1) {
    throw new Error(
      `Bảng ${table.name} có ${khop.length} cột cùng tên "Link app". Nhờ người sửa bên Lark rồi chạy lại.`,
    );
  }

  const field = khop[0]!;
  if (field.type !== KIEU_O_CHU && field.type !== KIEU_O_URL) {
    throw new Error(
      `Cột "${field.field_name}" đang là kiểu ${field.type}, không phải ô chữ hay ô URL. Không ghi để khỏi làm hỏng cột.`,
    );
  }

  return {
    tableId: table.table_id,
    tenBang: table.name,
    fieldName: field.field_name,
    fieldType: field.type,
  };
}

/** Ô URL của Lark là { link, text }; ô chữ là chuỗi thuần. */
function giaTriO(viTri: ViTriGhi, diaChi: string): unknown {
  if (viTri.fieldType === KIEU_O_URL) {
    // Nhãn hiển thị đặt bằng chính địa chỉ, KHÔNG đặt bằng tên khách: docs/16
    // §7.3 — nhãn text của ô URL bên Lark chính là chỗ tên khách hay lọt vào.
    return { link: diaChi, text: diaChi };
  }
  return diaChi;
}

/** Đọc một dòng Hậu Kỳ, để biết ô "Link app" đang trống hay đã có người dán. */
async function docO(
  auth: LarkAuthHeader,
  baseToken: string,
  viTri: ViTriGhi,
  recordId: string,
): Promise<{ coDong: boolean; oDangCo: string }> {
  const res = await fetch(
    `${HOST}/bitable/v1/apps/${baseToken}/tables/${viTri.tableId}/records/${recordId}`,
    { headers: { authorization: auth.authorization } },
  );
  const json = (await res.json()) as {
    code: number;
    msg?: string;
    data?: { record?: { fields?: Record<string, unknown> } };
  };
  // Mã dòng sai thì Lark trả code khác 0. Phải BÁO RA chứ không được ghi mò:
  // ghi nhầm dòng nghĩa là khách A nhận link xem ảnh của khách B.
  if (json.code !== 0 || !json.data?.record) {
    return { coDong: false, oDangCo: "" };
  }
  const o = json.data.record.fields?.[viTri.fieldName];
  let dangCo = "";
  if (typeof o === "string") dangCo = o.trim();
  else if (o && typeof o === "object") {
    const first = Array.isArray(o) ? o[0] : o;
    if (first && typeof first === "object") {
      dangCo = String((first as { link?: string; text?: string }).link ?? "").trim();
    }
  }
  return { coDong: true, oDangCo: dangCo };
}

export interface TuyChonGhiLink {
  /** Mã dòng Hậu Kỳ — galleries.lark_hauky_record_id. */
  recordId: string;
  /** Địa chỉ ĐẦY ĐỦ của link app, ví dụ https://.../g/<mã>. */
  diaChi: string;
  /**
   * false = chạy thử: tìm bảng/cột, in dự định, KHÔNG gọi PUT.
   * Công tắc `--that` của scripts/ghi-link-app-len-lark.ts bật cờ này.
   */
  ghiThat: boolean;
  /** true = ghi đè cả khi ô đã có nội dung do nhân viên dán tay. */
  ghiDe?: boolean;
}

/**
 * Ghi link app lên Lark. KHÔNG BAO GIỜ NÉM LỖI.
 *
 * Đây là điều kiện số 3 của brief: Lark chết mà chặn luôn việc tạo link là làm
 * cả studio đứng. Mọi sự cố — thiếu biến môi trường, Lark từ chối token, mất
 * mạng, sai mã dòng — đều quy về `{ ghiDuoc: false, lyDo }` để chỗ gọi vẫn trả
 * link về tay CSKH kèm câu "chưa ghi được, dán tay giúp".
 */
export async function ghiLinkAppVeLark(opts: TuyChonGhiLink): Promise<KetQuaGhiLark> {
  const chayThu = !opts.ghiThat;

  if (!opts.recordId) {
    return {
      ghiDuoc: false,
      chayThu,
      lyDo: "Bộ ảnh này chưa gắn dòng Hậu Kỳ nào bên Lark, không biết ghi vào đâu.",
    };
  }

  const cauHinh = docCauHinhLark();
  if (!cauHinh) {
    return {
      ghiDuoc: false,
      chayThu,
      lyDo: `Chưa cấu hình Lark (thiếu ${bienMoiTruongConThieu().join(", ")}).`,
    };
  }

  try {
    const auth = await larkAuth(cauHinh.appId, cauHinh.appSecret);
    const viTri = await timCotLinkApp(auth, cauHinh.baseToken);

    const { coDong, oDangCo } = await docO(auth, cauHinh.baseToken, viTri, opts.recordId);
    if (!coDong) {
      return {
        ghiDuoc: false,
        chayThu,
        viTri,
        recordId: opts.recordId,
        lyDo: `Không tìm thấy dòng Hậu Kỳ ${opts.recordId} bên Lark.`,
      };
    }
    if (oDangCo && oDangCo !== opts.diaChi && !opts.ghiDe) {
      return {
        ghiDuoc: false,
        chayThu,
        viTri,
        recordId: opts.recordId,
        lyDo: `Ô "${viTri.fieldName}" đã có link khác, không ghi đè. Nhờ người soát bên Lark.`,
      };
    }

    if (chayThu) {
      return { ghiDuoc: false, chayThu: true, viTri, recordId: opts.recordId };
    }

    const res = await fetch(
      `${HOST}/bitable/v1/apps/${cauHinh.baseToken}/tables/${viTri.tableId}/records/${opts.recordId}`,
      {
        method: "PUT",
        headers: {
          authorization: auth.authorization,
          "content-type": "application/json",
        },
        // ĐÚNG MỘT KHOÁ. Lark giữ nguyên mọi cột không có mặt ở đây, nên thân
        // yêu cầu một khoá là bảo đảm bằng cấu trúc, không phải bằng lời hứa.
        body: JSON.stringify({
          fields: { [viTri.fieldName]: giaTriO(viTri, opts.diaChi) },
        }),
      },
    );
    const json = (await res.json()) as { code: number; msg?: string };
    if (json.code !== 0) {
      return {
        ghiDuoc: false,
        chayThu: false,
        viTri,
        recordId: opts.recordId,
        lyDo: `Lark từ chối ghi: ${json.msg || `mã lỗi ${json.code}`}`,
      };
    }

    return { ghiDuoc: true, chayThu: false, viTri, recordId: opts.recordId };
  } catch (err) {
    return {
      ghiDuoc: false,
      chayThu,
      recordId: opts.recordId,
      lyDo: `Không ghi được sang Lark: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Che mã link trước khi in ra bất cứ đâu: giữ SÁU ký tự đầu, cắt phần còn lại.
 *
 * Cùng luật với route share-link và bảng activity_logs. Nhật ký — và cả màn
 * hình terminal, và cả ảnh chụp màn hình người ta dán vào nhóm chat — đọc được
 * rộng hơn bảng share_links rất nhiều. In cả mã vào đó là dựng sẵn một đường
 * vòng mở mọi bộ ảnh mà không cần đăng nhập.
 */
export function cheMa(diaChi: string): string {
  return diaChi.replace(/\/g\/([A-Za-z0-9_-]{6})[A-Za-z0-9_-]+/g, "/g/$1…");
}

/**
 * Địa chỉ đầy đủ của link app, ghép từ NEXT_PUBLIC_APP_URL.
 *
 * KHÔNG đoán tên miền khi biến trống — cùng lý do đã ghi ở
 * src/app/api/admin/galleries/route.ts: đoán nhầm là dán vào Lark một link
 * chết, và tên miền đoán bừa có thể rơi vào tay người khác đăng ký, biến mọi
 * cú bấm của phụ huynh thành một mã link gửi cho người lạ.
 */
export function diaChiDayDu(duongDan: string): string | null {
  const goc = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!goc) return null;
  return `${goc.replace(/\/$/, "")}${duongDan}`;
}
