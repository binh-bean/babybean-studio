/**
 * BB-371 — ảnh chỉnh sửa trong app: phép thử đơn vị trên ĐÚNG hàm các route gọi.
 *
 *   1. Nhận diện thư mục ảnh chỉnh sửa (không dấu, hoa thường, dạng NFD của máy Mac).
 *   2. Ghép ảnh chỉnh ↔ ảnh gốc theo tên tệp (mơ hồ thì KHÔNG ghép).
 *   3. Cổng "khách đã được thấy chưa" (trạng thái + mốc CSKH gửi).
 *   4. Số lần sửa → lựa chọn cột Trạng Thái bên Lark ("Sửa" / "Sửa lần 2, 3, 4"),
 *      và đường ghi Lark: phép thử KHÔNG gọi mạng; giả lập Lark thì thân PUT
 *      đúng MỘT khoá với đúng TÊN lựa chọn tra từ MÃ.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

import {
  laThuMucChinhSua,
  tachThuMuc,
  ghepAnhChinhVoiGoc,
  khachThayAnhChinh,
  laAnhChuaGui,
  trangThaiLarkTheoLanSua,
  chuanHoaVung,
  ghepGhiChu,
  kieuTheoChuKy,
} from "@/lib/anh-chinh-sua/nhan-dien";
import { TRANG_THAI_LARK } from "@/lib/lark/trang-thai-hau-ky";
import { ghiTrangThaiSuaLenLark } from "@/lib/lark/ghi-trang-thai-sua";

describe("BB-371 · nhận diện thư mục ảnh chỉnh sửa", () => {
  it.each([
    "anh chinh sua",
    "ANH CHINH SUA",
    "Ảnh chỉnh sửa",
    "ảnh chỉnh sửa".normalize("NFD"), // tên thư mục tạo trên máy Mac
    "Anh_Chinh_Sua",
    "Ảnh chỉnh",
    "Đã chỉnh",
    "da chinh",
    "Edit",
    "edited",
    "Retouched 2",
    "Hậu kỳ",
    "15 anh chinh sua",
  ])("'%s' là thư mục ảnh chỉnh sửa", (ten) => {
    expect(laThuMucChinhSua(ten)).toBe(true);
  });

  it.each([
    "JPG",
    "RAW",
    "Ảnh chính", // ảnh CHÍNH (dấu sắc) — không phải ảnh chỉnh
    "anh chinh", // không dấu, mơ hồ chính/chỉnh → không đoán
    "Credit", // chứa "edit" nhưng không phải từ "edit"
    "Concept 1",
    "",
    null,
    undefined,
  ])("'%s' KHÔNG phải thư mục ảnh chỉnh sửa", (ten) => {
    expect(laThuMucChinhSua(ten as string | null | undefined)).toBe(false);
  });

  it("tách chip lọc: ảnh gốc giữ, thư mục chỉnh sửa ra riêng", () => {
    expect(tachThuMuc(["JPG", "anh chinh sua", "Set 2"])).toEqual({
      goc: ["JPG", "Set 2"],
      chinhSua: ["anh chinh sua"],
    });
  });
});

describe("BB-371 · ghép ảnh chỉnh ↔ ảnh gốc theo tên", () => {
  const goc = [
    { id: "g1", fileName: "IMG_1234.JPG" },
    { id: "g2", fileName: "IMG_1235.jpg" },
    { id: "g3", fileName: "DSC01240.jpg" },
    { id: "g4", fileName: "A_0500.jpg" },
    { id: "g5", fileName: "B_0500.jpg" },
  ];

  it("trùng tên (khác hoa thường, khác đuôi)", () => {
    const m = ghepAnhChinhVoiGoc([{ id: "c1", fileName: "img_1234.png" }], goc);
    expect(m.get("c1")).toBe("g1");
  });

  it("bỏ hậu tố phần mềm chỉnh: -Edit, (1), -2, _final", () => {
    const m = ghepAnhChinhVoiGoc(
      [
        { id: "c1", fileName: "IMG_1234-Edit.jpg" },
        { id: "c2", fileName: "IMG_1235 (1).jpg" },
        { id: "c3", fileName: "IMG_1235-2.jpg" },
        { id: "c4", fileName: "IMG_1234_final.jpg" },
      ],
      goc,
    );
    expect([m.get("c1"), m.get("c2"), m.get("c3"), m.get("c4")]).toEqual(["g1", "g2", "g2", "g1"]);
  });

  it("trùng dãy số khi tên khác hẳn", () => {
    const m = ghepAnhChinhVoiGoc([{ id: "c1", fileName: "1240 da chinh.jpg" }], goc);
    expect(m.get("c1")).toBe("g3");
  });

  it("mơ hồ (hai ảnh gốc cùng số) hoặc không khớp → null, không ghép bừa", () => {
    const m = ghepAnhChinhVoiGoc(
      [
        { id: "c1", fileName: "0500-edit.jpg" },
        { id: "c2", fileName: "khac-hoan-toan.jpg" },
      ],
      goc,
    );
    expect(m.get("c1")).toBeNull();
    expect(m.get("c2")).toBeNull();
  });
});

describe("BB-371 · cổng khách thấy ảnh chỉnh", () => {
  const gui = "2026-10-06T08:00:00Z";
  it("chưa gửi (in_retouch / submitted / không có mốc) → không thấy", () => {
    expect(khachThayAnhChinh("in_retouch", gui, "2026-10-06T07:00:00Z")).toBe(false);
    expect(khachThayAnhChinh("submitted", gui, "2026-10-06T07:00:00Z")).toBe(false);
    expect(khachThayAnhChinh("awaiting_approval", null, "2026-10-06T07:00:00Z")).toBe(false);
  });
  it("đã gửi, ảnh có trước mốc gửi → thấy", () => {
    expect(khachThayAnhChinh("awaiting_approval", gui, "2026-10-06T07:59:59Z")).toBe(true);
    expect(khachThayAnhChinh("delivered", gui, "2026-10-06T07:00:00Z")).toBe(true);
  });
  it("ảnh về SAU mốc gửi (thợ thả thêm khi khách đang duyệt) → chưa thấy, và là 'chưa gửi'", () => {
    expect(khachThayAnhChinh("awaiting_approval", gui, "2026-10-06T08:00:01Z")).toBe(false);
    expect(laAnhChuaGui(gui, "2026-10-06T08:00:01Z")).toBe(true);
    expect(laAnhChuaGui(gui, "2026-10-06T07:00:00Z")).toBe(false);
    expect(laAnhChuaGui(null, "2026-10-06T07:00:00Z")).toBe(true);
  });
});

describe("BB-371 · số lần sửa → Trạng Thái Hậu Kỳ bên Lark", () => {
  it("lần 1 → 'Sửa'; lần 2, 3, 4… → 'Sửa lần N' (lựa chọn 'Sửa lần 2, 3, 4')", () => {
    expect(trangThaiLarkTheoLanSua(1)).toEqual({ ma: "optjhQwMrT", nhan: "Sửa" });
    expect(trangThaiLarkTheoLanSua(2)).toEqual({ ma: "optW0pvHGd", nhan: "Sửa lần 2" });
    expect(trangThaiLarkTheoLanSua(3)).toEqual({ ma: "optW0pvHGd", nhan: "Sửa lần 3" });
    expect(trangThaiLarkTheoLanSua(4).nhan).toBe("Sửa lần 4");
    expect(trangThaiLarkTheoLanSua(0).ma).toBe("optjhQwMrT");
  });
  it("mã khớp đúng bảng lựa chọn Lark đã đọc (docs/21)", () => {
    expect(TRANG_THAI_LARK[trangThaiLarkTheoLanSua(1).ma].ten).toBe("Sửa");
    expect(TRANG_THAI_LARK[trangThaiLarkTheoLanSua(2).ma].ten).toBe("Sửa lần 2, 3, 4");
  });
});

describe("BB-371 · đường ghi Trạng Thái lên Lark", () => {
  const envCu = { ...process.env };
  afterEach(() => {
    process.env = { ...envCu };
    vi.unstubAllGlobals();
  });

  it("đang chạy phép thử → KHÔNG gọi mạng, trả dự định ghi", async () => {
    const goi = vi.fn();
    vi.stubGlobal("fetch", goi);
    const kq = await ghiTrangThaiSuaLenLark({ recordId: "recFixture", lanSua: 3 });
    expect(goi).not.toHaveBeenCalled();
    expect(kq).toMatchObject({ ghiDuoc: false, chayThu: true, maLuaChon: "optW0pvHGd", nhan: "Sửa lần 3" });
  });

  it("giả lập Lark: PUT đúng một khoá = cột Trạng Thái (tìm theo mã neo), giá trị = TÊN lựa chọn tra từ mã", async () => {
    process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
    delete process.env.PHEP_THU_TRINH_DUYET;
    process.env.LARK_APP_ID = "fixture-app";
    process.env.LARK_APP_SECRET = "fixture-secret";
    process.env.LARK_BASE_APP_TOKEN = "fixture-base";
    const put: { url: string; body: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const tra = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
        if (url.includes("/auth/")) return tra({ code: 0, tenant_access_token: "t" });
        if (url.endsWith("/tables?page_size=100")) return tra({ code: 0, data: { items: [{ table_id: "tbl1", name: "Hậu Kỳ 2026" }] } });
        if (url.includes("/fields")) {
          return tra({
            code: 0,
            data: {
              items: [
                { field_name: "Ghi chú", type: 1 },
                {
                  field_name: "Trạng Thái (đổi tên)",
                  type: 3,
                  property: {
                    options: [
                      { id: "optDAI9nFV", name: "Đã gửi file gốc" },
                      { id: "optjhQwMrT", name: "Sửa" },
                      { id: "optW0pvHGd", name: "Sửa lần 2,3,4 (chữ nhân viên tự đổi)" },
                    ],
                  },
                },
              ],
            },
          });
        }
        if (init?.method === "PUT") {
          put.push({ url, body: JSON.parse(String(init.body)) });
          return tra({ code: 0 });
        }
        return tra({ code: 1 });
      }),
    );

    const lan1 = await ghiTrangThaiSuaLenLark({ recordId: "recA", lanSua: 1 });
    const lan2 = await ghiTrangThaiSuaLenLark({ recordId: "recA", lanSua: 2 });
    expect(lan1.ghiDuoc).toBe(true);
    expect(lan2.ghiDuoc).toBe(true);
    expect(put).toHaveLength(2);
    expect(put[0]!.url).toMatch(/\/tables\/tbl1\/records\/recA$/);
    expect(put[0]!.body).toEqual({ fields: { "Trạng Thái (đổi tên)": "Sửa" } });
    expect(put[1]!.body).toEqual({ fields: { "Trạng Thái (đổi tên)": "Sửa lần 2,3,4 (chữ nhân viên tự đổi)" } });
  });
});

describe("BB-371 · dữ liệu yêu cầu sửa chi tiết", () => {
  it("vùng khoanh: giữ vùng trong khung, bỏ vùng hỏng, tối đa 10", () => {
    const v = chuanHoaVung([
      { x: 0.5, y: 0.5, r: 0.07 },
      { x: 1.5, y: 0.5, r: 0.07 },
      { x: 0.2, y: 0.2, r: 0 },
      "rác",
      ...Array.from({ length: 12 }, () => ({ x: 0.1, y: 0.1, r: 0.05 })),
    ]);
    expect(v[0]).toEqual({ x: 0.5, y: 0.5, r: 0.07 });
    expect(v).toHaveLength(10);
  });
  it("ghép ghi chú cho revision_requests.note (bản lùi khi chưa áp 0091)", () => {
    const s = ghepGhiChu("Cảm ơn Bean", [
      { photoId: "p", tenAnh: "IMG_1.jpg", ghiChu: "da sáng hơn", vung: [{ x: 0.1, y: 0.1, r: 0.1 }], anhMau: ["a"] },
    ]);
    expect(s).toBe("Cảm ơn Bean\n• IMG_1.jpg: da sáng hơn · đã khoanh 1 vùng · kèm 1 ảnh mẫu");
  });
  it("ảnh mẫu: xét chữ ký byte, không tin đuôi tệp", () => {
    expect(kieuTheoChuKy(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(kieuTheoChuKy(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(kieuTheoChuKy(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(kieuTheoChuKy(new TextEncoder().encode("%PDF-1.7 xxxxxx"))).toBeNull();
  });
});
