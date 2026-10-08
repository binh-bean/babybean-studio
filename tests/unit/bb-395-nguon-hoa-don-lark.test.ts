/**
 * BB-395 — nguồn hoá đơn bản Lark với `fetch` GIẢ (không gọi Lark thật). Dữ liệu theo hình
 * hoá đơn phát sinh hậu kỳ thật (số liệu, không tên khách), đổi sang mã 2099.
 */
import { describe, expect, it } from "vitest";
import { docDongHoaDon, idLienKet, soTuO, taoNguonHoaDonLark } from "@/lib/hoa-don/nguon-hoa-don-lark";
import { customerKey } from "@/lib/lark/sync-retouch";
import { LoiNguonHoaDon, chonNguonHoaDon, nguonHoaDonFixture } from "@/lib/hoa-don/nguon-hoa-don";

const MA = "HD_20990101#57";

function hoaDonLark(over: Record<string, unknown> = {}) {
  return {
    record_id: "recHD57",
    fields: {
      "Mã Hợp Đồng": [{ type: "text", text: MA }],
      "Tổng phải thu": 1300000,
      "Tổng Đã Thanh Toán": { type: 2, value: [1300000] },
      "Còn Lại": 0,
      "Trạng thái thanh toán": [{ type: "text", text: "Đã thu hết ☑️☑️☑️" }],
      "💲Bảng Thu V2": [{ record_ids: ["recThu1"], text: "THU-20990101#10691" }],
      "Hóa Đơn Chi Tiết V2": [{ record_ids: ["recD1", "recD2", "recD3"] }],
      "Mã Khách Hàng": [{ type: "text", text: "B_SG-Nguyễn Thị Mai_0901000001", record_ids: ["recKH"] }],
      "️🎯Tiến Độ Hậu Kỳ": [{ record_ids: ["recHK1", "recHK2"] }],
      ...over,
    },
  };
}

const DONG: Record<string, { fields: Record<string, unknown> }> = {
  recD1: {
    fields: {
      "Hóa Đơn": [{ text: MA }],
      "Mã Hóa Đơn Chi Tiết": `${MA}_12648`,
      "Chi Tiết SP / DV": [{ record_ids: ["recEditFile"], text: "Edit file" }],
      "Số Lượng": "26",
      "Giá niêm yết": [50000],
      "Giá chốt cuối": "1300000",
    },
  },
  recD2: {
    fields: {
      "Hóa Đơn": [{ text: MA }],
      "Mã Hóa Đơn Chi Tiết": `${MA}_12649`,
      "Chi Tiết SP / DV": [{ record_ids: ["recDV"], text: "Dịch vụ Hậu Kỳ" }],
      "Số Lượng": "1",
      "Giá chốt cuối": null,
    },
  },
  // Dòng của hoá đơn #572 lọt vào (link sai / contains): phải bị loại vì mã KHÔNG khớp chính xác.
  recD3: {
    fields: {
      "Hóa Đơn": [{ text: `${MA}2` }],
      "Mã Hóa Đơn Chi Tiết": `${MA}2_13000`,
      "Chi Tiết SP / DV": [{ record_ids: ["recEditFile"], text: "Edit file" }],
      "Số Lượng": "5",
      "Giá chốt cuối": "250000",
    },
  },
  recThu1: {
    fields: {
      STT: [{ text: "THU-20990101#10691" }],
      "Số Tiền Thanh Toán": "1300000",
      "Phương Thức TT": "Chuyển Khoản",
      "Loại Thu": "Hóa Đơn",
      "Ngày Thu": 4070908800000,
    },
  },
};

function fetchGia(hoaDon = hoaDonLark(), daGoi: string[] = []) {
  return (async (url: string) => {
    daGoi.push(url);
    const u = String(url);
    const tra = (data: unknown) => ({ json: async () => ({ code: 0, data }) }) as Response;
    if (u.includes("/tables?")) {
      return tra({
        items: [
          { table_id: "tblDong", name: "📄 Hóa Đơn Chi Tiết" },
          { table_id: "tblHD", name: "Hóa Đơn" },
          { table_id: "tblThu", name: "💲Bảng Thu" },
        ],
      });
    }
    if (u.includes("/tables/tblHD/records?")) return tra({ items: [hoaDon] });
    const m = u.match(/\/records\/([^?]+)$/);
    if (m) return tra({ record: DONG[decodeURIComponent(m[1] ?? "")] ?? { fields: {} } });
    throw new Error(`URL lạ: ${u}`);
  }) as unknown as typeof fetch;
}

describe("BB-395 đọc ô Lark", () => {
  it("chuỗi số, số âm, mảng [{text}], ô tra cứu {value}", () => {
    expect(soTuO("1300000")).toBe(1_300_000);
    expect(soTuO("-300000")).toBe(-300_000);
    expect(soTuO([{ text: "26" }])).toBe(26);
    expect(soTuO({ type: 2, value: [1300000] })).toBe(1_300_000);
    expect(soTuO(null)).toBe(0);
  });
  it("record_ids rỗng → không có phiếu (mảng ngoài không rỗng vẫn = 0)", () => {
    expect(idLienKet([{ record_ids: [] }])).toEqual([]);
    expect(idLienKet([{ record_ids: ["a", "b"] }])).toEqual(["a", "b"]);
  });
  it("so mã CHÍNH XÁC: dòng của #572 không thuộc #57", () => {
    expect(docDongHoaDon(MA, { record_id: "recD3", fields: DONG.recD3!.fields })).toBeNull();
    expect(docDongHoaDon(MA, { record_id: "recD1", fields: DONG.recD1!.fields })?.soLuong).toBe(26);
  });
});

describe("BB-395 nguồn Lark (fetch giả)", () => {
  it("đọc đủ hoá đơn mẫu: tiền, phiếu thu, dòng, khoá khách băm, link Hậu Kỳ", async () => {
    const daGoi: string[] = [];
    const nguon = taoNguonHoaDonLark({ baseToken: "base", layToken: async () => "Bearer t", fetchFn: fetchGia(undefined, daGoi) });
    const h = await nguon.layHoaDon(MA);
    expect(h).not.toBeNull();
    expect(h).toMatchObject({ ma: MA, nguon: "lark", tongPhaiThu: 1_300_000, daThu: 1_300_000, conLai: 0 });
    expect(h?.phieuThu).toEqual([
      { ma: "THU-20990101#10691", soTien: 1_300_000, phuongThuc: "chuyen_khoan", phuongThucGoc: "Chuyển Khoản", ngay: new Date(4070908800000).toISOString() },
    ]);
    expect(h?.dong.map((d) => [d.maDong, d.loai, d.soLuong, d.thanhTien])).toEqual([
      [`${MA}_12648`, "file_chinh", 26, 1_300_000],
      [`${MA}_12649`, "dich_vu", 1, 0],
    ]);
    // Khoá khách = đúng hàm băm của mã đồng bộ khách; chữ gốc (tên + SĐT) không đi ra.
    expect(h?.khoaKhachNguon).toBe(customerKey("B_SG-Nguyễn Thị Mai_0901000001"));
    expect(JSON.stringify(h)).not.toContain("0901000001");
    expect(h?.maHauKyNguon).toEqual(["recHK1", "recHK2"]);
    // Tìm hoá đơn bằng GET + filter (records/search báo InvalidFilter với AutoNumber).
    expect(daGoi.some((u) => u.includes("/tables/tblHD/records?") && u.includes("filter="))).toBe(true);
    expect(daGoi.some((u) => u.includes("/search"))).toBe(false);
  });
  it("hoá đơn không có phiếu thu (record_ids rỗng) → phieuThu rỗng", async () => {
    const nguon = taoNguonHoaDonLark({
      baseToken: "base",
      layToken: async () => "Bearer t",
      fetchFn: fetchGia(hoaDonLark({ "💲Bảng Thu V2": [{ record_ids: [] }], "Còn Lại": "1300000" })),
    });
    const h = await nguon.layHoaDon(MA);
    expect(h?.phieuThu).toEqual([]);
    expect(h?.conLai).toBe(1_300_000);
  });
  it("Lark trả hoá đơn mã khác (#572) → coi như không có", async () => {
    const nguon = taoNguonHoaDonLark({
      baseToken: "base",
      layToken: async () => "Bearer t",
      fetchFn: fetchGia(hoaDonLark({ "Mã Hợp Đồng": [{ text: `${MA}2` }] })),
    });
    expect(await nguon.layHoaDon(MA)).toBeNull();
  });
  it("Lark lỗi → LoiNguonHoaDon (route báo thân thiện, không ghi gì)", async () => {
    const nguon = taoNguonHoaDonLark({
      baseToken: "base",
      layToken: async () => "Bearer t",
      fetchFn: (async () => ({ json: async () => ({ code: 1254, msg: "rate limit" }) })) as unknown as typeof fetch,
    });
    await expect(nguon.layHoaDon(MA)).rejects.toBeInstanceOf(LoiNguonHoaDon);
  });
  it("trong phép thử, nhà máy LUÔN trả nguồn giả — không bao giờ tạo nguồn Lark", () => {
    let daTaoLark = false;
    const n = chonNguonHoaDon(() => {
      daTaoLark = true;
      throw new Error("không được gọi");
    });
    expect(n).toBe(nguonHoaDonFixture);
    expect(daTaoLark).toBe(false);
  });
});
