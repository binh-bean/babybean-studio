/**
 * BB-392 mục 1 (anh 06/10, mục 11): "đã đồng bộ bằng SĐT và mã hoá đơn nhưng
 * khách hàng vẫn báo không có số". BB-369 sửa cho bộ MỚI; bộ ĐÃ CÓ đi nhánh
 * `already_exists` trả về sớm → khách cũ trống số mãi.
 *
 * THUẦN: client pg giả (không kết nối cơ sở dữ liệu), bản ghi Lark dựng tay.
 */
import { describe, it, expect, vi } from "vitest";
import { syncSingleRetouchRecord } from "@/lib/lark/sync-retouch";
import { MA_DU_AN_THAT } from "@/lib/lark/muc-tieu-du-lieu";

const DB_THAT_GIA = `postgresql://postgres.${MA_DU_AN_THAT[0]}:khong-dung@127.0.0.1:1/khong-ket-noi`;

function banGhi(sdt: string) {
  return {
    record_id: "rec_bb392",
    fields: {
      "Trạng thái": "Đã gửi file gốc",
      "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1Fixture392aaaaaaaaaaaaaaaaaaaa",
      "Hợp đồng": "HD_20260910#5074",
      "SDT KH": [{ text: sdt, type: "text" }],
    },
  };
}

function clientGia(phoneHienCo: string | null) {
  const cauLenh: { sql: string; params?: unknown[] }[] = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      cauLenh.push({ sql, params });
      if (sql.includes("from galleries where drive_folder_id")) {
        return { rows: [{ id: "gal-cu", title: "Album · HD_20260910#5074", status: "draft", customer_id: "kh-cu" }] };
      }
      if (sql.includes("select phone, branch_id from customers")) {
        return { rows: [{ phone: phoneHienCo, branch_id: "b-1" }] };
      }
      return { rows: [] };
    }),
  } as unknown as import("pg").Client;
  return { client, cauLenh };
}

const chung = { branches: [], staffList: [], index: 0, dbUrl: DB_THAT_GIA };

describe("BB-392 mục 1: bộ đã có vẫn điền số cho khách đang trống", () => {
  it("khách cũ trống số → update customers.phone (chỉ khi trống)", async () => {
    const { client, cauLenh } = clientGia(null);
    const kq = await syncSingleRetouchRecord({ ...chung, client, record: banGhi("0901000392"), write: true });
    expect(kq.action).toBe("already_exists");
    const update = cauLenh.find((c) => c.sql.includes("update customers set phone"));
    expect(update?.params).toEqual(["kh-cu", "0901000392"]);
    expect(update?.sql).toMatch(/phone is null or btrim\(phone\) = ''/);
  });

  it("khách cũ có số KHÁC → không đè, ghi nhật ký lệch", async () => {
    const { client, cauLenh } = clientGia("0901000111");
    await syncSingleRetouchRecord({ ...chung, client, record: banGhi("0901000392"), write: true });
    expect(cauLenh.some((c) => c.sql.includes("update customers set phone"))).toBe(false);
    const nk = cauLenh.find((c) => c.sql.includes("insert into activity_logs"));
    expect(nk?.params?.[1]).toBe("customer.sdt_lech_lark");
  });

  it("chạy thử (write=false) hoặc DB không được giữ dữ liệu thật → không ghi gì", async () => {
    const a = clientGia(null);
    await syncSingleRetouchRecord({ ...chung, client: a.client, record: banGhi("0901000392"), write: false });
    expect(a.cauLenh.some((c) => /update customers|insert into activity_logs/.test(c.sql))).toBe(false);
    const b = clientGia(null);
    await syncSingleRetouchRecord({ ...chung, dbUrl: "postgresql://localhost/test", client: b.client, record: banGhi("0901000392"), write: true });
    expect(b.cauLenh.some((c) => c.sql.includes("update customers set phone"))).toBe(false);
  });
});
