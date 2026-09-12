/**
 * Unit tests cho BB-111: Đồng bộ bảng Hậu Kỳ từ Lark Base xuống app.
 * OWNER: DEV-INT.
 */

import { describe, it, expect, vi } from "vitest";
import {
  cellText,
  cellBoolean,
  getField,
  parseCustomerAndBabyName,
  extractDriveUrl,
  checkRetouchTrigger,
  matchBranch,
  readLarkTable,
  syncSingleRetouchRecord,
} from "@/lib/lark/sync-retouch";

describe("BB-111 / BB-097: parseCustomerAndBabyName", () => {
  it("bóc đúng tên mẹ ngoài ngoặc và tên bé trong ngoặc", () => {
    const res = parseCustomerAndBabyName("fb Trang Đài Nguyễn (Tiểu Muội)");
    expect(res.customerName).toBe("Trang Đài Nguyễn");
    expect(res.babyName).toBe("Tiểu Muội");
    expect(res.isGuessed).toBe(true);
  });

  it("loại bỏ tiền tố FB viết hoa", () => {
    const res = parseCustomerAndBabyName("FB Nguyễn Thị Lan (Bé Bon)");
    expect(res.customerName).toBe("Nguyễn Thị Lan");
    expect(res.babyName).toBe("Bé Bon");
    expect(res.isGuessed).toBe(true);
  });

  it("không có ngoặc thì toàn bộ là tên mẹ và không có tên bé", () => {
    const res = parseCustomerAndBabyName("fb Mai Phương");
    expect(res.customerName).toBe("Mai Phương");
    expect(res.babyName).toBe("");
    expect(res.isGuessed).toBe(false);
  });

  it("xử lý chuỗi có chữ đằng sau ngoặc", () => {
    const res = parseCustomerAndBabyName("Mẹ Lan (Bé Sóc) gói VIP");
    expect(res.customerName).toBe("Mẹ Lan gói VIP");
    expect(res.babyName).toBe("Bé Sóc");
    expect(res.isGuessed).toBe(true);
  });

  it("xử lý chuỗi rỗng an toàn", () => {
    const res = parseCustomerAndBabyName("");
    expect(res.customerName).toBe("Khách hàng");
    expect(res.babyName).toBe("");
    expect(res.isGuessed).toBe(false);
  });
});

describe("BB-111: extractDriveUrl", () => {
  it("trích xuất đúng URL Google Drive từ đoạn văn bản", () => {
    const text = "Ảnh chụp của bé: https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2?usp=sharing gửi mẹ xem";
    expect(extractDriveUrl(text)).toBe("https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2?usp=sharing");
  });

  it("trả về null nếu không có link Google Drive", () => {
    expect(extractDriveUrl("Chưa có link")).toBeNull();
  });
});

describe("BB-111: checkRetouchTrigger", () => {
  it("từ chối kích hoạt nếu cột 'Link ảnh gửi khách' không có nội dung", () => {
    const fields = {
      "Tên khách hàng": "Chị Mai",
      "Lấy link app": true,
    };
    const res = checkRetouchTrigger(fields);
    expect(res.triggered).toBe(false);
    expect(res.reason).toContain("không có nội dung");
  });

  it("từ chối kích hoạt nếu link Drive không hợp lệ", () => {
    const fields = {
      "Link ảnh gửi khách": "https://google.com/not-drive",
    };
    const res = checkRetouchTrigger(fields);
    expect(res.triggered).toBe(false);
  });

  it("kích hoạt thành công khi có link folder Drive hợp lệ", () => {
    const fields = {
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

  it("nhận diện được ô tích 'Lấy link app' khi chưa tích", () => {
    const fields = {
      "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2",
      "Lấy link app": false,
    };
    const res = checkRetouchTrigger(fields);
    expect(res.triggered).toBe(true);
    expect(res.hasLayLinkApp).toBe(false);
    expect(res.linkApp).toBe("");
  });
});

describe("BB-111: cell parsing & sparse field handling", () => {
  it("cellText bóc được mọi cấu trúc Lark (text, array, object)", () => {
    expect(cellText(null)).toBe("");
    expect(cellText("chuỗi thuần")).toBe("chuỗi thuần");
    expect(cellText({ text: "đối tượng text" })).toBe("đối tượng text");
    expect(cellText([{ text: "phần 1 " }, { text: "phần 2" }])).toBe("phần 1 phần 2");
  });

  it("cellBoolean xử lý đúng các kiểu boolean của Lark", () => {
    expect(cellBoolean(true)).toBe(true);
    expect(cellBoolean(false)).toBe(false);
    expect(cellBoolean("true")).toBe(true);
    expect(cellBoolean("1")).toBe(true);
    expect(cellBoolean(null)).toBe(false);
    expect(cellBoolean(undefined)).toBe(false);
  });

  it("getField tìm được trường bất chấp hoa thường và khoảng trắng", () => {
    const fields = {
      "  Link Ảnh Gửi Khách  ": "https://drive.google.com/...",
      "Cơ sở": "Quận 1",
    };
    expect(getField(fields, /link\s*ảnh\s*gửi\s*khách/i)).toBe("https://drive.google.com/...");
    expect(getField(fields, /cơ\s*sở/i)).toBe("Quận 1");
    expect(getField(fields, /không\s*tồn\s*tại/i)).toBeUndefined();
  });
});

describe("BB-111: matchBranch", () => {
  const branches = [
    { id: "b-q1", code: "BB-Q1", name: "BabyBean Quận 1" },
    { id: "b-td", code: "BB-TD", name: "BabyBean Thủ Đức" },
    { id: "b-gv", code: "BB-GV", name: "BabyBean Gò Vấp" },
  ];

  it("khớp đúng chi nhánh Quận 1", () => {
    expect(matchBranch("Chi nhánh Quận 1", branches)).toBe("b-q1");
    expect(matchBranch("BB-Q1", branches)).toBe("b-q1");
  });

  it("khớp đúng chi nhánh Thủ Đức", () => {
    expect(matchBranch("Cơ sở Thủ Đức", branches)).toBe("b-td");
    expect(matchBranch("TD", branches)).toBe("b-td");
  });

  it("khớp đúng chi nhánh Gò Vấp", () => {
    expect(matchBranch("BabyBean Gò Vấp", branches)).toBe("b-gv");
    expect(matchBranch("GV", branches)).toBe("b-gv");
  });

  it("fallback về chi nhánh đầu tiên nếu không khớp", () => {
    expect(matchBranch("", branches)).toBe("b-q1");
    expect(matchBranch("Không rõ", branches)).toBe("b-q1");
  });
});

describe("BB-111: readLarkTable pagination (bẫy 500 bản ghi)", () => {
  it("lặp qua toàn bộ các trang khi has_more = true", async () => {
    const mockAuth = { authorization: "Bearer fake-token" };
    const mockBaseToken = "app_fake_token";

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    // Lần 1: get tables
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        code: 0,
        data: { items: [{ table_id: "tbl_hau_ky", name: "Hậu Kỳ" }] },
      }),
    } as Response);

    // Lần 2: page 1 (500 records, has_more: true)
    const page1Records = Array.from({ length: 500 }, (_, i) => ({
      record_id: `rec_p1_${i}`,
      fields: { "Tên": `Record ${i}` },
    }));
    fetchSpy.mockResolvedValueOnce({
      json: async () => ({
        code: 0,
        data: { items: page1Records, has_more: true, page_token: "token_page_2" },
      }),
    } as Response);

    // Lần 3: page 2 (50 records, has_more: false)
    const page2Records = Array.from({ length: 50 }, (_, i) => ({
      record_id: `rec_p2_${i}`,
      fields: { "Tên": `Record ${i + 500}` },
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

describe("BB-111: syncSingleRetouchRecord flow", () => {
  const branches = [
    { id: "b-q1", code: "BB-Q1", name: "BabyBean Quận 1" },
  ];
  const staffList = [
    { id: "s-tho1", fullName: "Nguyễn Thợ Ảnh", role: "photographer" },
    { id: "s-cs1", fullName: "Trần CSKH", role: "cs" },
    { id: "s-ret1", fullName: "Lê Photoshop", role: "retoucher" },
  ];

  it("bỏ qua bản ghi khi không có Link ảnh gửi khách", async () => {
    const mockClient = { query: vi.fn() } as unknown as import("pg").Client;
    const record = {
      record_id: "rec_no_link",
      fields: { "Tên khách hàng": "Chị A" },
    };

    const res = await syncSingleRetouchRecord({
      client: mockClient,
      record,
      branches,
      staffList,
      isProduction: false,
      write: false,
      index: 0,
    });

    expect(res.action).toBe("skipped");
  });

  it("phát hiện album đã tồn tại theo drive_folder_id và không tạo trùng", async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({
        rows: [{ id: "existing-gallery-uuid", title: "Album cũ", status: "ready" }],
      }),
    } as unknown as import("pg").Client;

    const record = {
      record_id: "rec_exists",
      fields: {
        "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2",
      },
    };

    const res = await syncSingleRetouchRecord({
      client: mockClient,
      record,
      branches,
      staffList,
      isProduction: false,
      write: false,
      index: 0,
    });

    expect(res.action).toBe("already_exists");
    expect(res.galleryId).toBe("existing-gallery-uuid");
  });

  it("chế độ xem trước (write=false) trả về thông tin album sẽ tạo mà không ghi vào DB", async () => {
    const mockClient = {
      query: vi.fn().mockResolvedValueOnce({ rows: [] }), // galleries check
    } as unknown as import("pg").Client;

    const record = {
      record_id: "rec_new",
      fields: {
        "Tên thư mục": "fb Trang Đài Nguyễn (Tiểu Muội)",
        "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2",
        "Hợp đồng": "HD_20260912#001",
      },
    };

    const res = await syncSingleRetouchRecord({
      client: mockClient,
      record,
      branches,
      staffList,
      isProduction: false,
      write: false,
      index: 0,
    });

    expect(res.action).toBe("created");
    expect(res.title).toBe("fb Trang Đài Nguyễn (Tiểu Muội)");
    expect(res.driveFolderId).toBe("1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2");
    expect(mockClient.query).toHaveBeenCalledTimes(1); // Chỉ kiểm tra tồn tại, không insert
  });

  it("chế độ ghi thật (write=true) tạo Customer, Baby, Shoot và Gallery với status='draft'", async () => {
    const mockQueries: string[] = [];
    const mockClient = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        mockQueries.push(sql);
        if (sql.includes("select id, title, status from galleries")) {
          return { rows: [] }; // Không có album trùng
        }
        if (sql.includes("select id from customers")) {
          return { rows: [] }; // Chưa có khách
        }
        if (sql.includes("insert into customers")) {
          return { rows: [{ id: "new-customer-id" }] };
        }
        if (sql.includes("select id from babies")) {
          return { rows: [] }; // Chưa có bé
        }
        if (sql.includes("insert into babies")) {
          return { rows: [{ id: "new-baby-id" }] };
        }
        if (sql.includes("insert into shoots")) {
          return { rows: [{ id: "new-shoot-id" }] };
        }
        if (sql.includes("insert into galleries")) {
          // Kiểm tra status truyền vào galleries phải là 'draft'
          expect(sql).toContain("'draft'");
          expect(params).toContain("HD_20260912#001");
          return { rows: [{ id: "new-gallery-id" }] };
        }
        return { rows: [] };
      }),
    } as unknown as import("pg").Client;

    const record = {
      record_id: "rec_write",
      fields: {
        "Tên thư mục": "fb Trang Đài Nguyễn (Tiểu Muội)",
        "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1GeWplnZxVVoqOQO4kQgeNpnroRtbmGz2",
        "Hợp đồng": "HD_20260912#001",
        "Lấy link app": true,
      },
    };

    const res = await syncSingleRetouchRecord({
      client: mockClient,
      record,
      branches,
      staffList,
      isProduction: false,
      write: true,
      index: 0,
    });

    expect(res.action).toBe("created");
    expect(res.galleryId).toBe("new-gallery-id");

    // Kiểm tra transaction begin & commit
    expect(mockQueries).toContain("begin");
    expect(mockQueries).toContain("commit");
  });
});
