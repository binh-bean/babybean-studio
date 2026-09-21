/**
 * BB-132 — ghi link app ngược lên cột "Link app" của bảng Hậu Kỳ bên Lark.
 *
 * Đây là đường GHI ĐẦU TIÊN đi lên Lark; mọi thứ trước nay chỉ đọc xuống. Bảng
 * Hậu Kỳ là sổ vận hành thật của studio, nên phép thử ở đây canh bốn chuyện:
 *
 *   1. Ghi ĐÚNG MỘT CỘT — thân yêu cầu PUT chỉ được mang một khoá.
 *   2. Không nhầm "Link app" với "Lấy link app" (ô TÍCH, docs/16 §2). Nhét
 *      địa chỉ web vào ô tích là vừa mất link vừa hỏng ô điều khiển luồng việc.
 *   3. Chạy thử KHÔNG gọi PUT — công tắc `--that` phải có thật, không phải
 *      chỉ in ra một dòng chữ rồi vẫn ghi.
 *   4. Lark hỏng thì KHÔNG ném lỗi, chỉ trả lý do tiếng Việt — vì chỗ gọi phải
 *      trả link về tay CSKH bằng mọi giá. Mã link hiện đúng một lần; nuốt mất
 *      nó là khách không có link và không ai dựng lại được.
 *
 * Không gọi Lark thật: `fetch` bị thay bằng bản giả. Bộ test chạy trên máy CI
 * không có token Lark, và một phép thử ghi thật lên sổ vận hành của studio là
 * thứ không được phép tồn tại.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  ghiLinkAppVeLark,
  timCotLinkApp,
  diaChiDayDu,
  cheMa,
  MAU_TEN_COT_LINK_APP,
  bienMoiTruongConThieu,
} from "@/lib/lark/ghi-link-app";

process.env.LARK_CHO_PHEP_GUI_TRONG_PHEP_THU = "1";

const AUTH = { authorization: "Bearer gia-lap" };
const BASE = "app-token-gia-lap";
const RECORD = "recgialap123";
const DIA_CHI = "https://vi-du.test/g/abcdef0123456789";

/** Cột kiểu 1 = ô chữ, 15 = ô URL, 7 = ô tích. */
const COT_LINK_APP = { field_name: "Link app", type: 1 };
const COT_LAY_LINK_APP = { field_name: "Lấy link app", type: 7 };

interface LuotGoi {
  url: string;
  method: string;
  body: unknown;
}

/**
 * Bản `fetch` giả trả lời theo đường dẫn, và ghi lại mọi lượt gọi để phép thử
 * soi được thân yêu cầu PUT.
 */
function lapFetch(opts: {
  fields?: Array<{ field_name: string; type: number }>;
  oDangCo?: unknown;
  recordCode?: number;
  putCode?: number;
  putMsg?: string;
}) {
  const luot: LuotGoi[] = [];
  const fields = opts.fields ?? [COT_LAY_LINK_APP, COT_LINK_APP];

  const gia = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    luot.push({
      url: u,
      method,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });

    const tra = (data: unknown) =>
      new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });

    if (u.includes("/auth/v3/tenant_access_token")) {
      return tra({ code: 0, tenant_access_token: "t-gia-lap" });
    }
    if (u.includes("/tables?page_size")) {
      return tra({ code: 0, data: { items: [{ table_id: "tblGiaLap", name: "Hậu Kỳ" }] } });
    }
    if (u.includes("/fields?page_size")) {
      return tra({ code: 0, data: { items: fields } });
    }
    if (method === "PUT") {
      return tra({ code: opts.putCode ?? 0, msg: opts.putMsg });
    }
    // Đọc một dòng.
    if (opts.recordCode && opts.recordCode !== 0) return tra({ code: opts.recordCode, msg: "sai mã dòng" });
    return tra({
      code: 0,
      data: { record: { fields: { "Link app": opts.oDangCo ?? undefined } } },
    });
  });

  vi.stubGlobal("fetch", gia);
  return luot;
}

describe("BB-132: ghi link app về Lark", () => {
  beforeEach(() => {
    vi.stubEnv("LARK_APP_ID", "id-gia-lap");
    vi.stubEnv("LARK_APP_SECRET", "secret-gia-lap");
    vi.stubEnv("LARK_BASE_APP_TOKEN", BASE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  // --- Cột: "Link app" chứ KHÔNG phải "Lấy link app" ------------------------

  it("1. Mẫu tên cột loại được ô tích 'Lấy link app'", () => {
    expect(MAU_TEN_COT_LINK_APP.test("Link app")).toBe(true);
    expect(MAU_TEN_COT_LINK_APP.test(" link  APP ")).toBe(true);
    // Đây là dòng quan trọng nhất của tệp: một regex lỏng /link app/i khớp cả
    // ô tích, và Lark không hứa thứ tự cột nào cả.
    expect(MAU_TEN_COT_LINK_APP.test("Lấy link app")).toBe(false);
    expect(MAU_TEN_COT_LINK_APP.test("Link app cũ")).toBe(false);
  });

  it("2. Tìm đúng cột 'Link app', bỏ qua ô tích đứng trước nó", async () => {
    lapFetch({});
    const viTri = await timCotLinkApp(AUTH, BASE);
    expect(viTri.fieldName).toBe("Link app");
    expect(viTri.tenBang).toBe("Hậu Kỳ");
  });

  it("3. Cột 'Link app' là ô TÍCH thì từ chối, không ghi", async () => {
    lapFetch({ fields: [{ field_name: "Link app", type: 7 }] });
    await expect(timCotLinkApp(AUTH, BASE)).rejects.toThrow(/kiểu 7/);
  });

  it("4. Hai cột trùng tên thì dừng, không chọn bừa", async () => {
    lapFetch({ fields: [COT_LINK_APP, { field_name: "link app", type: 1 }] });
    await expect(timCotLinkApp(AUTH, BASE)).rejects.toThrow(/cùng tên/);
  });

  // --- Ghi: đúng một cột ----------------------------------------------------

  it("5. Thân yêu cầu PUT chỉ mang ĐÚNG MỘT khoá", async () => {
    const luot = lapFetch({});
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(true);

    const put = luot.find((l) => l.method === "PUT");
    expect(put).toBeDefined();
    const fields = (put!.body as { fields: Record<string, unknown> }).fields;
    // Lark PUT giữ nguyên cột vắng mặt, nên "đúng một khoá" là bảo đảm bằng
    // cấu trúc rằng không cột nào khác bị chạm tới.
    expect(Object.keys(fields)).toEqual(["Link app"]);
    expect(fields["Link app"]).toBe(DIA_CHI);
    // Ghi vào ĐÚNG dòng đã lưu trong galleries.lark_hauky_record_id.
    expect(put!.url).toContain(`/records/${RECORD}`);
  });

  it("6. Ô kiểu URL thì gửi { link, text }, nhãn là chính địa chỉ", async () => {
    // docs/16 §7.3: nhãn text của ô URL bên Lark chính là chỗ tên khách hay
    // lọt vào. Đặt nhãn bằng địa chỉ là không có chỗ cho tên khách chui vào.
    const luot = lapFetch({ fields: [{ field_name: "Link app", type: 15 }] });
    await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: true });
    const put = luot.find((l) => l.method === "PUT")!;
    const o = (put.body as { fields: Record<string, unknown> }).fields["Link app"];
    expect(o).toEqual({ link: DIA_CHI, text: DIA_CHI });
  });

  // --- Công tắc --that ------------------------------------------------------

  it("7. Chạy thử KHÔNG gọi PUT, nhưng vẫn in ra đúng dòng và đúng cột", async () => {
    const luot = lapFetch({});
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: false });

    expect(luot.some((l) => l.method === "PUT")).toBe(false);
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.chayThu).toBe(true);
    expect(kq.viTri?.tenBang).toBe("Hậu Kỳ");
    expect(kq.viTri?.fieldName).toBe("Link app");
    expect(kq.recordId).toBe(RECORD);
  });

  // --- Không đụng vào link nhân viên đã dán tay -----------------------------

  it("8. Ô đang giữ thứ KHÔNG PHẢI link app thì không ghi đè", async () => {
    // Link Drive, link chat, hay một dòng ghi chú nhân viên tự gõ — máy không
    // được lẳng lặng thay.
    const luot = lapFetch({ oDangCo: "https://drive.google.com/drive/folders/abc123" });
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.lyDo).toMatch(/KHÔNG PHẢI link app/);
    expect(luot.some((l) => l.method === "PUT")).toBe(false);
  });

  /**
   * BB-155. Ca này canh đúng cái làm khách nhận "Link đã hết hạn" ngày
   * 15.09.2026: CSKH cấp lại link (link cũ bị thu hồi ngay), nhưng ô Lark kẹt
   * lại ở link cũ vì chốt chống ghi đè chặn luôn chính app.
   *
   * Bỏ ca này thì bản sửa lặng lẽ hỏng lại, và chỉ khách phát hiện.
   */
  it("8b. Ô đang giữ LINK CŨ CỦA CHÍNH APP thì PHẢI ghi đè", async () => {
    const goc = new URL(DIA_CHI).origin;
    const luot = lapFetch({ oDangCo: `${goc}/g/maCuDaBiThuHoi` });
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(true);
    expect(luot.some((l) => l.method === "PUT")).toBe(true);
  });

  it("9. Nói rõ --ghi-de thì mới ghi đè", async () => {
    const luot = lapFetch({ oDangCo: "https://cu.test/g/xxxxxx" });
    const kq = await ghiLinkAppVeLark({
      recordId: RECORD,
      diaChi: DIA_CHI,
      ghiThat: true,
      ghiDe: true,
    });
    expect(kq.ghiDuoc).toBe(true);
    expect(luot.some((l) => l.method === "PUT")).toBe(true);
  });

  // --- Hỏng thì KHÔNG ném lỗi ----------------------------------------------

  it("10. Lark từ chối ghi -> trả lý do, KHÔNG ném lỗi", async () => {
    lapFetch({ putCode: 1254045, putMsg: "FieldNameNotFound" });
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.lyDo).toContain("FieldNameNotFound");
  });

  it("11. Mất mạng giữa chừng -> trả lý do, KHÔNG ném lỗi", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.lyDo).toContain("ECONNRESET");
  });

  it("12. Sai mã dòng -> báo ra, tuyệt đối không ghi mò sang dòng khác", async () => {
    // Ghi nhầm dòng nghĩa là khách A nhận link xem ảnh của khách B. Đó là đúng
    // cái nguy cơ mà BB-132 sinh ra để bỏ, nên ở đây phải dừng hẳn.
    const luot = lapFetch({ recordCode: 1254043 });
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.lyDo).toMatch(/Không tìm thấy dòng Hậu Kỳ/);
    expect(luot.some((l) => l.method === "PUT")).toBe(false);
  });

  it("13. Bộ ảnh chưa gắn dòng Hậu Kỳ -> không gọi Lark lần nào", async () => {
    const luot = lapFetch({});
    const kq = await ghiLinkAppVeLark({ recordId: "", diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.lyDo).toMatch(/chưa gắn dòng Hậu Kỳ/);
    expect(luot).toHaveLength(0);
  });

  it("14. Thiếu biến môi trường -> báo thiếu gì, KHÔNG ném lỗi", async () => {
    vi.stubEnv("LARK_BASE_APP_TOKEN", "");
    const luot = lapFetch({});
    expect(bienMoiTruongConThieu()).toEqual(["LARK_BASE_APP_TOKEN"]);
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.lyDo).toContain("LARK_BASE_APP_TOKEN");
    expect(luot).toHaveLength(0);
  });

  // --- Địa chỉ đầy đủ -------------------------------------------------------

  it("15. Thiếu NEXT_PUBLIC_APP_URL thì trả null, KHÔNG đoán tên miền", async () => {
    // Đoán bừa tên miền là dán vào Lark một link chết, và tên miền đoán bừa có
    // thể rơi vào tay người khác đăng ký — mọi cú bấm của phụ huynh thành một
    // mã link gửi cho người lạ.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(diaChiDayDu("/g/abcdef")).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://chon-anh.test/");
    expect(diaChiDayDu("/g/abcdef")).toBe("https://chon-anh.test/g/abcdef");
  });

  // --- Che mã link trong mọi dòng in ra ------------------------------------

  it("16. Chỉ in SÁU ký tự đầu của mã, không bao giờ cả mã", () => {
    // Màn hình terminal cũng là nhật ký: người ta chụp màn hình dán vào nhóm
    // chat. Cả mã lọt ra là mở được bộ ảnh đó mà không cần đăng nhập.
    const che = cheMa(DIA_CHI);
    expect(che).toBe("https://vi-du.test/g/abcdef…");
    expect(che).not.toContain("abcdef0123456789");
    // Chuỗi không phải link app thì để nguyên, đừng cắt mất thông tin chẩn đoán.
    expect(cheMa("(chạy thử, chưa có địa chỉ thật)")).toBe("(chạy thử, chưa có địa chỉ thật)");
  });
});
