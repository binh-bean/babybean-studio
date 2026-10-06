/**
 * BB-373 — ghi link màn quản lý bộ ảnh lên cột "Link quản lý bộ ảnh" của bảng Hậu Kỳ.
 *
 * Chỉ giả lập `fetch` (biên giới ra ngoài). Hai lớp chốt:
 *  - mặc định (đang chạy phép thử) KHÔNG có lượt fetch nào — không ghi Lark thật;
 *  - các ca còn lại bật cửa thoát `CHO_PHEP_GOI_MANG_TRONG_PHEP_THU` CHỈ trong tệp này,
 *    và fetch giả ném lỗi với mọi địa chỉ lạ, nên không thể lọt ra Lark thật.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  laCotLinkQuanLy,
  quyetDinhGhiLinkQuanLy,
  ghiLinkQuanLyVeLark,
  ghiLinkQuanLyChoBoAnh,
  duongDanQuanLyBoAnh,
} from "@/lib/lark/ghi-link-quan-ly";

const GOC = "https://app.vi-du.test";
const BO = "11111111-2222-3333-4444-555555555555";
const BO_KHAC = "99999999-2222-3333-4444-555555555555";
const DIA_CHI = `${GOC}/admin/galleries/${BO}`;

describe("BB-373: nhận ra cột", () => {
  it("nhận các tên cột đúng, kể cả chữ đang có trên bảng thật; loại Link app và cột khác", () => {
    for (const ten of [
      "Link quản lý bộ ảnh",
      "Quản lý bộ ảnh",
      "link quản lý",
      "Link quản trị bộ ảnh",
      "Link lý trị bộ ảnh", // đúng tên cột đang có ngày 06/10/2026
      " Link  quản lý  bộ ảnh ",
      "Link quản lý bộ ảnh".normalize("NFD"),
    ]) {
      expect(laCotLinkQuanLy(ten), ten).toBe(true);
    }
    for (const ten of ["Link app", "Lấy link app", "Link ảnh gửi khách", "Link HD", "Quản lý", "Link quản lý bộ ảnh cũ"]) {
      expect(laCotLinkQuanLy(ten), ten).toBe(false);
    }
  });
});

describe("BB-373: quyết định ghi", () => {
  it("ghi khi ô trống hoặc đang giữ link quản lý của app trỏ SAI bộ; không đụng thứ khác", () => {
    expect(quyetDinhGhiLinkQuanLy("", DIA_CHI)).toEqual({ ghi: true });
    expect(quyetDinhGhiLinkQuanLy(`${GOC}/admin/galleries/${BO_KHAC}`, DIA_CHI)).toEqual({ ghi: true });
    expect(quyetDinhGhiLinkQuanLy(DIA_CHI, DIA_CHI)).toMatchObject({ ghi: false, boQua: "da_dung" });
    expect(quyetDinhGhiLinkQuanLy(`${DIA_CHI}/`, DIA_CHI)).toMatchObject({ ghi: false, boQua: "da_dung" });
    // Ghi chú của nhân viên, link Drive, link app của khách, link của môi trường khác: để nguyên.
    for (const khac of [
      "Chờ khách chọn lại",
      "https://drive.google.com/drive/folders/abc",
      `${GOC}/g/AbCdEf123456`,
      `https://moi-truong-khac.test/admin/galleries/${BO_KHAC}`,
    ]) {
      expect(quyetDinhGhiLinkQuanLy(khac, DIA_CHI), khac).toMatchObject({ ghi: false, boQua: "o_co_noi_dung_khac" });
    }
  });
});

describe("BB-373: lượt ghi lên Lark (fetch giả)", () => {
  let cotLark: { field_name: string; type: number }[];
  let oHienCo: unknown;
  let dongTonTai: boolean;
  let cacLuot: { url: string; method: string; body?: string }[];

  function dungFetchGia() {
    cacLuot = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = String(init?.method ?? "GET");
      cacLuot.push({ url, method, body: typeof init?.body === "string" ? init.body : undefined });
      const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
      if (url.includes("/auth/v3/tenant_access_token")) return json({ tenant_access_token: "t-gia" });
      if (/\/tables\?page_size/.test(url)) return json({ code: 0, data: { items: [{ table_id: "tbl1", name: "Hậu Kỳ" }] } });
      if (url.includes("/tables/tbl1/fields")) return json({ code: 0, data: { items: cotLark } });
      if (url.includes("/tables/tbl1/records/rec1") && method === "GET") {
        return json(
          dongTonTai
            ? { code: 0, data: { record: { fields: { "Link quản lý bộ ảnh": oHienCo } } } }
            : { code: 1254043, msg: "không có dòng" },
        );
      }
      if (url.includes("/tables/tbl1/records/rec1") && method === "PUT") return json({ code: 0 });
      throw new Error(`Địa chỉ lạ, không được gọi: ${url}`);
    });
  }
  const cacLuotPut = () => cacLuot.filter((l) => l.method === "PUT");

  beforeEach(() => {
    process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
    delete process.env.PHEP_THU_TRINH_DUYET;
    process.env.LARK_APP_ID = "id-gia";
    process.env.LARK_APP_SECRET = "bi-mat-gia";
    process.env.LARK_BASE_APP_TOKEN = "base-gia";
    process.env.NEXT_PUBLIC_APP_URL = GOC;
    cotLark = [
      { field_name: "Link app", type: 15 },
      { field_name: "Link quản lý bộ ảnh", type: 15 },
    ];
    oHienCo = undefined;
    dongTonTai = true;
    dungFetchGia();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
  });

  it("MẶC ĐỊNH (chốt phép thử còn nguyên): không có lượt fetch nào, không ghi Lark thật", async () => {
    delete process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
    const kq = await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.boQua).toBe("dang_chay_phep_thu");
    expect(cacLuot).toHaveLength(0);
  });

  it("ô trống: ghi ĐÚNG MỘT cột, kiểu URL { link, text } là địa chỉ đầy đủ", async () => {
    const kq = await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(true);
    const put = cacLuotPut();
    expect(put).toHaveLength(1);
    const thanYeuCau = JSON.parse(put[0]!.body!);
    expect(Object.keys(thanYeuCau.fields)).toEqual(["Link quản lý bộ ảnh"]);
    expect(thanYeuCau.fields["Link quản lý bộ ảnh"]).toEqual({ link: DIA_CHI, text: DIA_CHI });
  });

  it("cột kiểu chữ: ghi chuỗi thuần", async () => {
    cotLark = [{ field_name: "Link quản lý bộ ảnh", type: 1 }];
    await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true });
    expect(JSON.parse(cacLuotPut()[0]!.body!).fields["Link quản lý bộ ảnh"]).toBe(DIA_CHI);
  });

  it("ô đang giữ link quản lý trỏ sai bộ: ghi đè bằng link đúng", async () => {
    oHienCo = [{ link: `${GOC}/admin/galleries/${BO_KHAC}`, text: "x" }];
    const kq = await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(true);
    expect(cacLuotPut()).toHaveLength(1);
  });

  it("ô đã đúng link / ô có ghi chú của nhân viên: KHÔNG ghi", async () => {
    oHienCo = { link: DIA_CHI, text: DIA_CHI };
    expect((await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true })).boQua).toBe("da_dung");
    oHienCo = "Đợi khách duyệt";
    expect((await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true })).boQua).toBe("o_co_noi_dung_khac");
    expect(cacLuotPut()).toHaveLength(0);
  });

  it("CHƯA CÓ CỘT: tự tắt, không ghi, không ném, nói rõ thiếu cột", async () => {
    cotLark = [{ field_name: "Link app", type: 15 }, { field_name: "Lấy link app", type: 7 }];
    const kq = await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.boQua).toBe("chua_co_cot");
    expect(kq.lyDo).toContain("chưa có cột");
    expect(cacLuotPut()).toHaveLength(0);
  });

  it("cột sai kiểu (ô tích): không ghi để khỏi làm hỏng cột", async () => {
    cotLark = [{ field_name: "Link quản lý bộ ảnh", type: 7 }];
    const kq = await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true });
    expect(kq.boQua).toBe("chua_co_cot");
    expect(cacLuotPut()).toHaveLength(0);
  });

  it("chạy thử (ghiThat=false): báo SẼ ghi nhưng không gọi PUT", async () => {
    const kq = await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: false });
    expect(kq).toMatchObject({ ghiDuoc: false, chayThu: true, seGhi: true });
    expect(cacLuotPut()).toHaveLength(0);
  });

  it("dòng Lark không tồn tại: không ghi mò", async () => {
    dongTonTai = false;
    const kq = await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true });
    expect(kq.boQua).toBe("khong_thay_dong");
    expect(cacLuotPut()).toHaveLength(0);
  });

  it("Lark chết (fetch ném): không ném ra ngoài", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("mạng đứt"));
    const kq = await ghiLinkQuanLyVeLark({ recordId: "rec1", diaChi: DIA_CHI, ghiThat: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.boQua).toBe("loi");
  });

  it("ghiLinkQuanLyChoBoAnh: dựng địa chỉ từ NEXT_PUBLIC_APP_URL + id bộ, ghi vào đúng dòng của bộ", async () => {
    const adminGia = {
      from: () => ({
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { id: BO, lark_hauky_record_id: "rec1" }, error: null }) }),
        }),
      }),
    } as never;
    const kq = await ghiLinkQuanLyChoBoAnh(adminGia, BO);
    expect(kq.ghiDuoc).toBe(true);
    expect(JSON.parse(cacLuotPut()[0]!.body!).fields["Link quản lý bộ ảnh"].link).toBe(`${GOC}${duongDanQuanLyBoAnh(BO)}`);
    expect(cacLuotPut()[0]!.url).toContain("/records/rec1");
  });

  it("ghiLinkQuanLyChoBoAnh: bộ chưa gắn dòng Hậu Kỳ thì không gọi Lark; thiếu NEXT_PUBLIC_APP_URL thì không đoán", async () => {
    const adminGia = (record: string | null) =>
      ({
        from: () => ({
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: BO, lark_hauky_record_id: record }, error: null }) }),
          }),
        }),
      }) as never;
    expect((await ghiLinkQuanLyChoBoAnh(adminGia(null), BO)).boQua).toBe("khong_co_dong_lark");
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect((await ghiLinkQuanLyChoBoAnh(adminGia("rec1"), BO)).boQua).toBe("thieu_dia_chi_goc");
    expect(cacLuot).toHaveLength(0);
  });
});
