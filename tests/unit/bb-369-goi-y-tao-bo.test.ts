/**
 * BB-369 mục 2 (chủ studio 06/10, ảnh fe05fc22): thuật sĩ "Tạo bộ ảnh mới" tra
 * được dòng Lark mà vẫn bắt chọn tay Chi nhánh + Photo. Nay chi nhánh + người
 * chụp lấy từ dòng Lark.
 *
 * Lark giả ở biên giới mạng (`fetch`), dữ liệu "Fixture"/số giả.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { traHauKy, bocDongHauKy } from "@/lib/lark/tra-hau-ky";
import { goiYTuDongLark, khopNguoiChup } from "@/lib/lark/goi-y-tao-bo";

const CHI_NHANH = [
  { id: "bNTB", code: "BB-NTB", name: "Baby Bean Tân Bình" },
  { id: "bTD", code: "BB-TD", name: "Baby Bean Thảo Điền" },
];
const NHAN_SU = [
  { id: "sAn", name: "Fixture Nguyễn Văn An", branchIds: ["bTD"] },
  { id: "sBinh", name: "Fixture Trần Bình", branchIds: ["bNTB"] },
  { id: "sAn2", name: "Fixture Nguyễn Văn An", branchIds: ["bNTB"] },
];

describe("BB-369: khớp chi nhánh + người chụp từ dòng Lark", () => {
  it("Lark ghi 'Thảo Điền' + photo 'Fixture Nguyen Van An' → chi nhánh TĐ, người chụp đúng chi nhánh", () => {
    const g = goiYTuDongLark({ chiNhanh: "Thảo Điền", photo: "Fixture Nguyen Van An" }, CHI_NHANH, NHAN_SU);
    expect(g).toMatchObject({ branchId: "bTD", photographerId: "sAn" });
  });

  it("Lark chưa có người chụp → photographerId null (thuật sĩ nhắc bổ sung trên Lark, cho chọn tay)", () => {
    const g = goiYTuDongLark({ chiNhanh: "NTB", photo: null }, CHI_NHANH, NHAN_SU);
    expect(g).toMatchObject({ branchId: "bNTB", photographerId: null, photoLark: null });
  });

  it("tên không khớp / khớp nhiều người → null, không đoán", () => {
    expect(khopNguoiChup("Người Lạ", "bTD", NHAN_SU)).toBeNull();
    expect(khopNguoiChup("Fixture Nguyễn Văn An", null, NHAN_SU)).toBeNull(); // hai người trùng tên, không biết chi nhánh
    expect(khopNguoiChup("Fixture Trần Bình, Fixture Nguyễn Văn An", "bNTB", NHAN_SU)).toBe("sBinh"); // lấy người đầu
  });

  it("bocDongHauKy đọc cột 'photo' (Lookup người) và bỏ mã lựa chọn chi nhánh", () => {
    const d = bocDongHauKy({
      record_id: "recFX1",
      fields: { "Chi Nhánh": ["optAbc123"], photo: { users: [{ name: "Fixture Trần Bình" }] } },
    });
    expect(d.photo).toBe("Fixture Trần Bình");
    expect(d.chiNhanh).toBe("");
  });
});

describe("BB-369: traHauKy lấy tên chi nhánh từ lượt search (API bản ghi chỉ có mã lựa chọn)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const k of ["CHO_PHEP_GOI_MANG_TRONG_PHEP_THU", "LARK_APP_ID", "LARK_APP_SECRET", "LARK_BASE_APP_TOKEN"]) delete process.env[k];
  });

  it("dòng khớp có chiNhanh = tên từ search, photo từ bản ghi", async () => {
    process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
    process.env.LARK_APP_ID = "fx";
    process.env.LARK_APP_SECRET = "fx";
    process.env.LARK_BASE_APP_TOKEN = "fxBase";
    const json = (data: unknown) => new Response(JSON.stringify({ code: 0, data, tenant_access_token: "t-fixture" }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes("tenant_access_token")) return json({});
        if (u.includes("/tables?page_size=100")) return json({ items: [{ table_id: "tblFX", name: "Hậu Kỳ" }] });
        if (u.includes("/records/search")) {
          return json({ items: [{ record_id: "recFX1", fields: { "Chi Nhánh": { type: 3, value: ["Thảo Điền"] } } }] });
        }
        if (u.endsWith("/records/recFX1")) {
          return json({
            record: {
              record_id: "recFX1",
              fields: {
                "HĐ Tổng": [{ text: "HD_20261004#5", type: "text" }],
                "SDT KH": [{ text: "0901000001", type: "text" }],
                "Tên KH": [{ text: "Fixture Mẹ Mai", type: "text" }],
                "Chi Nhánh": ["optTD0001"],
                photo: { users: [{ name: "Fixture Nguyễn Văn An" }] },
              },
            },
          });
        }
        throw new Error(`fetch giả không biết: ${u}`);
      }),
    );
    const ds = await traHauKy("HD_20261004#5", "0901000001");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ chiNhanh: "Thảo Điền", photo: "Fixture Nguyễn Văn An" });
    expect(goiYTuDongLark(ds[0]!, CHI_NHANH, NHAN_SU)).toMatchObject({ branchId: "bTD", photographerId: "sAn" });
  });
});
