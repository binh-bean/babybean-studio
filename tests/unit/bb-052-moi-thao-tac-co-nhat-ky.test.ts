/**
 * BB-052 — mọi đường ghi dữ liệu đều phải để lại dấu trong nhật ký.
 *
 * ---------------------------------------------------------------------------
 * Vì sao cần một phép thử CẤU TRÚC, không chỉ vài ca chạy thật
 * ---------------------------------------------------------------------------
 * Rà soát ngày 22/09/2026 tìm ra sáu đường ghi dữ liệu không ghi nhật ký gì:
 * sửa dòng hàng hợp đồng (tiền), mở lại bộ ảnh đã chốt, chuyển file đã chỉnh
 * cho khách, đồng bộ lại ảnh từ Drive, và hai quyết định duyệt ảnh của khách.
 *
 * Vá sáu chỗ đó là việc một lần. Cái khó là đường API thứ bảy, viết vào tháng
 * sau, bởi người không đọc bản rà soát này. Nên phép thử dưới đây QUÉT THƯ MỤC:
 * mỗi tệp `route.ts` có `POST`, `PATCH` hay `DELETE` đều phải hoặc ghi nhật ký,
 * hoặc nằm trong danh sách ngoại lệ có ghi LÝ DO ngay tại đây.
 *
 * Danh sách ngoại lệ là chỗ để tranh luận, không phải chỗ để giấu. Thêm một
 * dòng vào đó là một quyết định có tên và có lý do.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { POST as moLai } from "@/app/api/admin/galleries/[id]/reopen/route";
import {
  POST as themDongHang,
  PATCH as suaDongHang,
  DELETE as boDongHang,
} from "@/app/api/admin/galleries/[id]/items/route";

/**
 * Đường ghi dữ liệu KHÔNG cần dòng nhật ký, kèm lý do.
 *
 * Mỗi dòng ở đây là một quyết định, không phải một chỗ bỏ sót.
 */
const GHI_TRONG_SQL: Record<string, string> = {
  // Hai đường này ghi nhật ký TRONG CÙNG TRANSACTION với việc nghiệp vụ —
  // chặt hơn mọi đường ghi bằng TypeScript ở trên, vì việc hỏng thì dòng nhật
  // ký cũng cuốn theo. Ca 3 dưới đây mở đúng thân hàm ra đối chiếu, không tin
  // lời ghi chú này.
  "admin/galleries": "create_gallery_bundle",
  "g/selection": "patch_selection_batch",
};

const NGOAI_LE: Record<string, string> = {
  "g/placements":
    "Một bộ in mười khung là mười lượt đặt ảnh; ghi hết thì nhật ký ngập dòng " +
    "không ai đọc. Bản thân việc đặt đã nằm trong selection_placements, còn " +
    "quyết định cuối của khách có selection.submit ghi lại.",
  "g/buoi-chup":
    "Chỉ chọn buổi chụp để mở trong phiên của khách, không ghi dữ liệu nghiệp vụ.",
  "admin/galleries/preview":
    "Chỉ đọc thử một thư mục Drive rồi trả về, không ghi gì.",
  "auth/session":
    "Cấp lại phiên đăng nhập. Lượt vào bằng link khách đã có gallery.auth ở auth/gallery.",
  "auth/logout": "Xoá cookie phiên, không đụng dữ liệu nghiệp vụ.",
  "lark/hook": "Nhận webhook của Lark, không ghi vào cơ sở dữ liệu.",
  "cron/expire-galleries":
    "Máy chạy nền: kết quả mỗi lượt đã ghi console.info kèm số liệu, và hệ quả " +
    "nhìn thấy được ở chính trạng thái bộ ảnh.",
  "cron/flush-notifications": "Như trên — lưới đỡ gửi lại tin, trạng thái nằm ở bảng notifications.",
  "cron/sync-lark": "Như trên — mỗi lượt ghi số bản ghi đã xử vào log máy chủ.",
};

function quetRoute(thuMuc: string, goc: string): string[] {
  const ra: string[] = [];
  for (const ten of readdirSync(thuMuc)) {
    const duong = join(thuMuc, ten);
    if (statSync(duong).isDirectory()) ra.push(...quetRoute(duong, goc));
    else if (ten === "route.ts") ra.push(duong.slice(goc.length + 1).replace(/\\/g, "/"));
  }
  return ra;
}

describe("BB-052: mọi thao tác ghi dữ liệu đều có nhật ký", () => {
  it("1. Không đường API nào ghi dữ liệu mà im lặng", () => {
    const goc = join(process.cwd(), "src", "app", "api");
    const tep = quetRoute(goc, goc);
    expect(tep.length).toBeGreaterThan(20);

    const thieu: string[] = [];
    for (const t of tep) {
      const noiDung = readFileSync(join(goc, t), "utf8");
      const coGhiDuLieu = /export async function (POST|PATCH|PUT|DELETE)/.test(noiDung);
      if (!coGhiDuLieu) continue;

      const coNhatKy = /activity_logs|ghiNhatKy/.test(noiDung);
      const khoa = t.replace(/\/route\.ts$/, "");
      if (!coNhatKy && !(khoa in NGOAI_LE) && !(khoa in GHI_TRONG_SQL)) thieu.push(khoa);
    }

    expect(thieu, `Thiếu nhật ký (hoặc thiếu dòng lý do trong NGOAI_LE): ${thieu.join(", ")}`)
      .toEqual([]);
  });

  it("2b. Hàm SQL được viện dẫn phải THẬT SỰ ghi nhật ký", async () => {
    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    try {
      for (const [khoa, ham] of Object.entries(GHI_TRONG_SQL)) {
        const { rows } = await client.query(
          `select pg_get_functiondef(p.oid) as d
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where p.proname = $1 and n.nspname = 'public' limit 1`,
          [ham],
        );
        expect(rows.length, `Không tìm thấy hàm ${ham} (viện dẫn bởi ${khoa})`).toBe(1);
        expect(
          String(rows[0].d).includes("activity_logs"),
          `${ham} không còn ghi activity_logs — đường ${khoa} đang im lặng`,
        ).toBe(true);
      }
    } finally {
      await client.end();
    }
  });

  it("2. Danh sách ngoại lệ không được có dòng chết", () => {
    // Ngoại lệ trỏ tới một đường API không còn tồn tại nghĩa là lý do đó đã cũ,
    // và dòng ấy đang che cho một đường khác trùng tên trong tương lai.
    const goc = join(process.cwd(), "src", "app", "api");
    const tep = new Set(quetRoute(goc, goc).map((t) => t.replace(/\/route\.ts$/, "")));
    for (const khoa of Object.keys(NGOAI_LE)) {
      expect(tep.has(khoa), `Ngoại lệ "${khoa}" trỏ tới đường API không còn tồn tại`).toBe(true);
    }
  });

  describe("chạy thật trên cơ sở dữ liệu", () => {
    let client: Client;
    let branchId: string;
    let staffId: string;
    let customerId: string;
    let galleryId: string;
    let productId: string;

    const demNhatKy = async (action: string) => {
      const { rows } = await client.query(
        "select count(*)::int n from activity_logs where action = $1 and entity_id = $2",
        [action, galleryId],
      );
      return rows[0].n as number;
    };

    beforeAll(async () => {
      client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
      await client.connect();
      const { rows: br } = await client.query("select id from branches order by name limit 1");
      branchId = br[0].id;
      const { rows: st } = await client.query("select id from staff_profiles limit 1");
      staffId = st[0].id;
      const { rows: pr } = await client.query(
        "select id from products where is_active = true limit 1",
      );
      productId = pr[0]?.id;

      const { rows: c } = await client.query(
        `insert into customers (branch_id, full_name) values ($1,'Fixture BB-052') returning id`,
        [branchId],
      );
      customerId = c[0].id;
      const { rows: g } = await client.query(
        `insert into galleries (branch_id, customer_id, title, status, drive_folder_id,
                                drive_folder_url, photo_count, due_at)
         values ($1,$2,'Fixture BB-052','expired',$3,'https://example.com/x',5, now() - interval '2 days')
         returning id`,
        [branchId, customerId, `fixture-bb052-${Date.now()}`],
      );
      galleryId = g[0].id;

      vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
        staffId,
        role: "owner",
        roleName: "owner",
        branchIds: [branchId],
        permissions: quyenCuaVai("owner"),
      } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
    });

    afterAll(async () => {
      await client.query("delete from activity_logs where entity_id = $1", [galleryId]);
      await client.query("delete from gallery_items where gallery_id = $1", [galleryId]);
      await client.query("delete from galleries where id = $1", [galleryId]);
      await client.query("delete from customers where id = $1", [customerId]);
      await client.end();
    });

    it("3. Mở lại bộ ảnh để lại dòng nhật ký kèm lý do", async () => {
      const res = await moLai(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ reason: "Khách xin chọn lại" }),
        }),
        { params: Promise.resolve({ id: galleryId }) },
      );
      expect(res.status).toBe(200);
      expect(await demNhatKy("gallery.reopen")).toBe(1);

      const { rows } = await client.query(
        "select metadata from activity_logs where action='gallery.reopen' and entity_id=$1",
        [galleryId],
      );
      expect(rows[0].metadata.lyDo).toBe("Khách xin chọn lại");
      expect(rows[0].metadata.tuTrangThai).toBe("expired");
    });

    it("4. Thêm, sửa và bỏ dòng hàng đều để lại dấu", async () => {
      if (!productId) {
        throw new Error("Không có sản phẩm nào đang bật — phép thử này cần một dòng products");
      }

      const them = await themDongHang(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ productId, quantity: 2 }),
        }),
        { params: Promise.resolve({ id: galleryId }) },
      );
      expect(them.status).toBe(200);
      const itemId = (await them.json()).data.id;
      expect(await demNhatKy("gallery.item_added")).toBe(1);

      const sua = await suaDongHang(
        new Request("http://localhost", {
          method: "PATCH",
          body: JSON.stringify({ itemId, quantity: 5 }),
        }),
        { params: Promise.resolve({ id: galleryId }) },
      );
      expect(sua.status).toBe(200);
      expect(await demNhatKy("gallery.item_changed")).toBe(1);

      const bo = await boDongHang(
        new Request("http://localhost", { method: "DELETE", body: JSON.stringify({ itemId }) }),
        { params: Promise.resolve({ id: galleryId }) },
      );
      expect(bo.status).toBe(200);
      expect(await demNhatKy("gallery.item_removed")).toBe(1);

      // Số lượng cũ và mới phải nằm trong dòng nhật ký: đó là thứ đổi số tiền
      // khách phải trả, và là lý do duy nhất để đọc lại dòng này sáu tháng sau.
      const { rows } = await client.query(
        "select metadata from activity_logs where action='gallery.item_changed' and entity_id=$1",
        [galleryId],
      );
      expect(rows[0].metadata.quantity).toBe(5);
      expect(rows[0].metadata).toHaveProperty("quotaBefore");
      expect(rows[0].metadata).toHaveProperty("quotaAfter");
    });
  });
});
