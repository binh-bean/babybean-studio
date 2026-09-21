/**
 * Unit tests cho BB-111: Đồng bộ bảng Hậu Kỳ từ Lark Base xuống app.
 * Spec: docs/16 §2 & §7, docs/15 §9.
 * OWNER: DEV-INT.
 */

import { describe, it, expect, vi } from "vitest";

process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";

import {
  cellText,
  extractChatLink,
  isRetouchStatusExcluded,
  EXCLUDED_RETOUCH_STATUSES,
  checkRetouchTrigger,
  matchBranch,
  readLarkTable,
  syncSingleRetouchRecord,
} from "@/lib/lark/sync-retouch";

describe("BB-111: 5 trạng thái đã qua khâu in bị loại (docs/16 §7.1)", () => {
  it("loại trừ đúng 5 trạng thái theo quy định của chủ studio", () => {
    for (const st of EXCLUDED_RETOUCH_STATUSES) {
      expect(isRetouchStatusExcluded(st)).toBe(true);
    }
  });

  it("giữ lại các trạng thái đang sản xuất hoặc đang chọn ảnh", () => {
    expect(isRetouchStatusExcluded("Đã gửi file gốc")).toBe(false);
    expect(isRetouchStatusExcluded("Đã Chọn Hình")).toBe(false);
    expect(isRetouchStatusExcluded("Đã Gửi Duyệt")).toBe(false);
    expect(isRetouchStatusExcluded("Đang làm")).toBe(false);
    expect(isRetouchStatusExcluded("Leader check hình")).toBe(false);
    expect(isRetouchStatusExcluded("sửa")).toBe(false);
  });
});

describe("BB-111: Bẫy 1 - extractChatLink (docs/16 §7.3)", () => {
  it("chỉ lấy link URL, tuyệt đối vứt bỏ text chứa tên khách", () => {
    const rawChat = [
      {
        link: "https://m.me/1000123456789",
        text: "Nguyễn Thị Mai (Tên Thật Của Khách)",
      },
    ];
    const link = extractChatLink(rawChat);
    expect(link).toBe("https://m.me/1000123456789");
    expect(link).not.toContain("Nguyễn Thị Mai");
  });

  it("xử lý cấu trúc object đơn lẻ và chuỗi URL", () => {
    expect(extractChatLink({ link: "https://facebook.com/messages/t/123", text: "Khách A" })).toBe(
      "https://facebook.com/messages/t/123",
    );
    expect(extractChatLink("https://facebook.com/messages/t/123")).toBe(
      "https://facebook.com/messages/t/123",
    );
    expect(extractChatLink(null)).toBeNull();
    expect(extractChatLink("không phải link")).toBeNull();
  });
});

describe("BB-111: Bẫy 2 - cellText với fullPhoneNum (docs/16 §7.4)", () => {
  it("bóc được số điện thoại khi Lark trả [{ fullPhoneNum: '...' }]", () => {
    const rawPhone = [{ fullPhoneNum: "+84901234567" }];
    expect(cellText(rawPhone)).toBe("+84901234567");
  });
});

describe("BB-111: checkRetouchTrigger", () => {
  it("loại trừ nếu bản ghi thuộc 5 trạng thái đã qua in", () => {
    const fields = {
      "Trạng thái": "Đã Giao",
      "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2",
    };
    const res = checkRetouchTrigger(fields);
    expect(res.triggered).toBe(false);
    expect(res.isStatusExcluded).toBe(true);
  });

  it("từ chối nếu cột 'Link ảnh gửi khách' rỗng", () => {
    const fields = {
      "Trạng thái": "Đã gửi file gốc",
    };
    const res = checkRetouchTrigger(fields);
    expect(res.triggered).toBe(false);
    expect(res.reason).toContain("không có nội dung");
  });

  it("kích hoạt thành công khi trạng thái hợp lệ và có link Drive", () => {
    const fields = {
      "Trạng thái": "Đã gửi file gốc",
      "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2?usp=sharing",
      "Lấy link app": true,
      "Link app": "https://babybeanstudio.vn/g/token123",
    };
    const res = checkRetouchTrigger(fields);
    expect(res.triggered).toBe(true);
    expect(res.driveFolderId).toBe("1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2");
    expect(res.hasLayLinkApp).toBe(true);
    expect(res.linkApp).toBe("https://babybeanstudio.vn/g/token123");
  });
});

describe("BB-111: matchBranch", () => {
  const branches = [
    { id: "b-q1", code: "BB-Q1", name: "BabyBean Quận 1" },
    { id: "b-td", code: "BB-TD", name: "BabyBean Thủ Đức" },
    { id: "b-gv", code: "BB-GV", name: "BabyBean Gò Vấp" },
  ];

  it("khớp đúng chi nhánh Quận 1, Thủ Đức, Gò Vấp", () => {
    expect(matchBranch("Quận 1", branches)).toBe("b-q1");
    expect(matchBranch("Cơ sở Thủ Đức", branches)).toBe("b-td");
    expect(matchBranch("BabyBean Gò Vấp", branches)).toBe("b-gv");
  });
});

describe("BB-111: readLarkTable pagination (bẫy 500 bản ghi)", () => {
  it("lặp qua toàn bộ các trang khi has_more = true", async () => {
    const mockAuth = { authorization: "Bearer fake-token" };
    const mockBaseToken = "app_fake_token";

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        code: 0,
        data: { items: [{ table_id: "tbl_hau_ky", name: "Hậu Kỳ" }] },
      }),
    } as Response);

    const page1Records = Array.from({ length: 500 }, (_, i) => ({
      record_id: `rec_p1_${i}`,
      fields: { Tên: `Record ${i}` },
    }));
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        code: 0,
        data: { items: page1Records, has_more: true, page_token: "token_page_2" },
      }),
    } as Response);

    const page2Records = Array.from({ length: 50 }, (_, i) => ({
      record_id: `rec_p2_${i}`,
      fields: { Tên: `Record ${i + 500}` },
    }));
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        code: 0,
        data: { items: page2Records, has_more: false },
      }),
    } as Response);

    const result = await readLarkTable(mockAuth, mockBaseToken, /h[aậ]u\s*k[yỳ]/i);

    expect(result.tableName).toBe("Hậu Kỳ");
    expect(result.records.length).toBe(550);
    expect(result.records[0]?.record_id).toBe("rec_p1_0");
    expect(result.records[549]?.record_id).toBe("rec_p2_49");

    fetchSpy.mockRestore();
  });
});

describe("BB-111: Ánh xạ che dữ liệu cá nhân theo docs/16 §7.3", () => {
  const branches = [{ id: "b-q1", code: "BB-Q1", name: "BabyBean Quận 1" }];
  const staffList = [
    { id: "s-tho1", fullName: "Nguyễn Thợ Ảnh", role: "photographer" },
    { id: "s-cs1", fullName: "Trần CSKH", role: "cs" },
    { id: "s-ret1", fullName: "Lê Photoshop", role: "retoucher" },
  ];

  it("ghi đúng các cột được che và giữ nguyên mã hợp đồng", async () => {
    let insertedCustomer: unknown[] = [];
    let insertedGallery: unknown[] = [];

    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes("select id, title, status from galleries")) {
          return { rows: [] };
        }
        if (sql.includes("select id from customers")) {
          return { rows: [] };
        }
        if (sql.includes("insert into customers")) {
          insertedCustomer = params ?? [];
          return { rows: [{ id: "new-cust-id" }] };
        }
        if (sql.includes("insert into shoots")) {
          return { rows: [{ id: "new-shoot-id" }] };
        }
        if (sql.includes("insert into galleries")) {
          insertedGallery = params ?? [];
          return { rows: [{ id: "new-gal-id" }] };
        }
        return { rows: [] };
      }),
    } as unknown as import("pg").Client;

    const record = {
      record_id: "rec_hau_ky_001",
      fields: {
        "Trạng thái": "Đã gửi file gốc",
        "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2",
        "Hợp đồng": "HD_20250722#572",
        "Tên KH": "Tên Khách Thật Cần Che",
        "SDT KH": [{ fullPhoneNum: "0912345678" }],
        "Chat với khách": [{ link: "https://m.me/fb_user_123", text: "Tên Khách Thật" }],
      },
    };

    const res = await syncSingleRetouchRecord({
      client: mockClient,
      record,
      branches,
      staffList,
      write: true,
      index: 0,
    });

    expect(res.action).toBe("created");
    expect(res.contractCode).toBe("HD_20250722#572");

    // 1. Kiểm tra customers:
    //    full_name phải là "KH · HD_20250722#572"
    //    phone: null
    //    facebook: chỉ link, không có tên
    expect(insertedCustomer[1]).toBe("KH · HD_20250722#572");
    expect(insertedCustomer[2]).toBe("https://m.me/fb_user_123");
    expect(insertedCustomer).not.toContain("Tên Khách Thật");

    // 2. Kiểm tra galleries:
    //    title: "Album · HD_20250722#572"
    //    status: 'draft'
    //    lark_contract_code: 'HD_20250722#572'
    expect(insertedGallery).toContain("HD_20250722#572");
    expect(insertedGallery).toContain("Album · HD_20250722#572");
  });
});
