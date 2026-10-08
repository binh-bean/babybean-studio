/**
 * BB-404 — "Nhắn khách": link chat RIÊNG của từng khách (Lark "👑 Khách Hàng" → "link chat",
 * lookup "Chat với khách" ở Hậu Kỳ) đủ dữ liệu + nút dùng chung trên mọi màn quản trị.
 *
 * THUẦN: không kết nối cơ sở dữ liệu, không gọi Lark. Supabase/pg là bản GIẢ trong bộ nhớ;
 * component dựng bằng renderToStaticMarkup (không giả lập hook — AGENTS §5a).
 * Dữ liệu giả: tên/SĐT bịa theo AGENTS §6.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/staff", () => ({
  AuthError: class AuthError extends Error {
    code: string;
    constructor(c: string) {
      super(c);
      this.code = c;
    }
  },
  requireStaff: vi.fn().mockResolvedValue({
    staffId: "staff-gia-404",
    role: "cs",
    branchIds: ["b-404"],
    permissions: ["customers:read", "customers:write", "galleries:read"],
  }),
  requirePermission: vi.fn(),
  requireBranch: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { extractChatLink, syncSingleRetouchRecord } from "@/lib/lark/sync-retouch";
import { bocDongHauKy } from "@/lib/lark/tra-hau-ky";
import { ghiLinkChatTheoLark, ghiLinkChatTheoLarkPg, SQL_GHI_LINK_CHAT_THEO_LARK } from "@/lib/lark/ghi-link-chat";
import { layLinkChatTheoBo, layLinkChatTheoKhach } from "@/lib/lien-lac/link-chat-khach-server";
import { NutNhanKhach } from "@/components/features/admin/nut-nhan-khach";
import { GET as getKhachHang } from "@/app/api/admin/customers/route";
import { createAdminClient } from "@/lib/supabase/admin";

const LINK = "https://business.facebook.com/latest/inbox/all?selected_item_id=fixture-404";
const TEN_GIA = "Nguyễn Thị Mai Fixture";

// ---------------------------------------------------------------------------
// Supabase GIẢ trong bộ nhớ — đủ các mắt xích các hàm/route dưới đây dùng.
// ---------------------------------------------------------------------------
type Dong = Record<string, unknown>;
function dbGia(bang: Record<string, Dong[]>) {
  const ghi: { bang: string; giaTri: Dong; loc: [string, string, unknown][] }[] = [];
  const doc: { bang: string; select: string }[] = [];
  function from(ten: string) {
    const loc: [string, string, unknown][] = [];
    let capNhat: Dong | null = null;
    let chon = "*";
    const q: Record<string, unknown> = {};
    const khop = (r: Dong) =>
      loc.every(([op, cot, v]) => {
        if (op === "eq") return r[cot] === v;
        if (op === "is") return r[cot] === v || (v === null && r[cot] === undefined);
        if (op === "in") return (v as unknown[]).includes(r[cot]);
        return true;
      });
    const nhung = (r: Dong) => {
      // "id, customers(facebook)" → nhúng khách theo customer_id
      if (/customers\(/.test(chon)) {
        const kh = (bang.customers ?? []).find((c) => c.id === r.customer_id) ?? null;
        return { ...r, customers: kh ? { facebook: kh.facebook } : null };
      }
      return r;
    };
    const ketQua = () => {
      const rows = (bang[ten] ?? []).filter(khop);
      if (capNhat) {
        for (const r of rows) Object.assign(r, capNhat);
        ghi.push({ bang: ten, giaTri: capNhat, loc: [...loc] });
        return { data: rows.map((r) => ({ id: r.id })), error: null, count: rows.length };
      }
      return { data: rows.map(nhung), error: null, count: rows.length };
    };
    for (const m of ["order", "range", "limit", "ilike", "like", "not", "gte", "lt", "or", "neq"]) q[m] = () => q;
    q.select = (s?: string) => {
      if (!capNhat) {
        chon = s ?? "*";
        doc.push({ bang: ten, select: chon });
      }
      return q;
    };
    q.eq = (c: string, v: unknown) => (loc.push(["eq", c, v]), q);
    q.is = (c: string, v: unknown) => (loc.push(["is", c, v]), q);
    q.in = (c: string, v: unknown[]) => (loc.push(["in", c, v]), q);
    q.update = (v: Dong) => ((capNhat = v), q);
    q.maybeSingle = async () => {
      const k = ketQua();
      return { data: (k.data as Dong[])[0] ?? null, error: null };
    };
    q.then = (giai: (v: unknown) => unknown, tuChoi?: (e: unknown) => unknown) => Promise.resolve(ketQua()).then(giai, tuChoi);
    return q;
  }
  return { client: { from } as unknown as import("@supabase/supabase-js").SupabaseClient, ghi, doc };
}

// ---------------------------------------------------------------------------
describe("BB-404: extractChatLink — chỉ lấy link http(s), bỏ text (tên khách)", () => {
  it("ô lookup [{link,text,type}] → đúng link, không kéo tên khách", () => {
    const kq = extractChatLink([{ link: LINK, text: TEN_GIA, type: "url" }]);
    expect(kq).toBe(LINK);
    expect(String(kq)).not.toContain("Fixture");
  });
  it("ô URL {link,text} → đúng link", () => {
    expect(extractChatLink({ link: ` ${LINK} `, text: TEN_GIA })).toBe(LINK);
  });
  it("từ chối javascript:/data:/chữ thường — ở mọi hình dạng ô", () => {
    expect(extractChatLink([{ link: "javascript:alert(1)", text: TEN_GIA }])).toBeNull();
    expect(extractChatLink({ link: "javascript:alert(document.cookie)", text: TEN_GIA })).toBeNull();
    expect(extractChatLink("javascript:alert(1)")).toBeNull();
    expect(extractChatLink("httpjavascript:alert(1)")).toBeNull();
    expect(extractChatLink([{ link: "data:text/html,<script>1</script>" }])).toBeNull();
    expect(extractChatLink([{ link: "", text: TEN_GIA }])).toBeNull();
    expect(extractChatLink(TEN_GIA)).toBeNull();
  });
  it("mảng có phần tử hỏng đứng trước → lấy phần tử http(s) hợp lệ kế tiếp", () => {
    expect(extractChatLink([{ link: "javascript:alert(1)" }, { link: LINK, text: TEN_GIA }])).toBe(LINK);
  });
});

describe("BB-404: dòng Hậu Kỳ mang link chat (thuật sĩ tạo bộ / gắn Lark)", () => {
  const record = (chat: unknown) => ({
    record_id: "rec_404",
    fields: {
      "HĐ Tổng": "HD_20991231#404",
      "Tên KH": "Trần Thị Lan",
      "SDT KH": "0901000404",
      "Chat với khách": chat,
    },
  });
  it("linkChat = link, và KHÔNG chuỗi nào của dòng chứa text của ô chat", () => {
    const d = bocDongHauKy(record([{ link: LINK, text: TEN_GIA, type: "url" }]) as never);
    expect(d.linkChat).toBe(LINK);
    expect(JSON.stringify(d)).not.toContain(TEN_GIA);
  });
  it("link javascript: → không có linkChat", () => {
    const d = bocDongHauKy(record([{ link: "javascript:alert(1)", text: TEN_GIA }]) as never);
    expect(d.linkChat).toBeUndefined();
  });
});

describe("BB-404/407: ghiLinkChatTheoLark — Lark là nguồn đúng: khác thì ghi đè, giống thì không ghi, trống thì giữ", () => {
  const LINK_TAY = "https://m.me/sua-tay-404";
  it("facebook NULL → ghi link (có điều kiện is null)", async () => {
    const db = dbGia({ customers: [{ id: "k1", facebook: null }] });
    expect(await ghiLinkChatTheoLark(db.client, "k1", LINK)).toBe("da_ghi");
    expect(db.ghi).toHaveLength(1);
    expect(db.ghi[0]?.giaTri).toEqual({ facebook: LINK });
    expect(db.ghi[0]?.loc).toContainEqual(["is", "facebook", null]);
  });
  it("facebook chuỗi trắng → coi là trống, ghi link", async () => {
    const bang = { customers: [{ id: "k1", facebook: "   " }] };
    const db = dbGia(bang);
    expect(await ghiLinkChatTheoLark(db.client, "k1", LINK)).toBe("da_ghi");
    expect(bang.customers[0]?.facebook).toBe(LINK);
  });
  it("đã có link KHÁC (Lark vừa đổi) → GHI ĐÈ theo Lark, có điều kiện so lại giá trị cũ", async () => {
    const bang = { customers: [{ id: "k1", facebook: LINK_TAY }] };
    const db = dbGia(bang);
    expect(await ghiLinkChatTheoLark(db.client, "k1", LINK)).toBe("da_ghi");
    expect(bang.customers[0]?.facebook).toBe(LINK);
    expect(db.ghi).toHaveLength(1);
    // chống đè đồng thời: câu UPDATE chỉ trúng khi giá trị vẫn là giá trị cũ vừa đọc
    expect(db.ghi[0]?.loc).toContainEqual(["eq", "facebook", LINK_TAY]);
  });
  it("link Lark GIỐNG giá trị đang có (kể cả thừa khoảng trắng) → da_co, không ghi", async () => {
    const bang = { customers: [{ id: "k1", facebook: `  ${LINK} ` }] };
    const db = dbGia(bang);
    expect(await ghiLinkChatTheoLark(db.client, "k1", LINK)).toBe("da_co");
    expect(db.ghi).toHaveLength(0);
    expect(bang.customers[0]?.facebook).toBe(`  ${LINK} `);
  });
  it("Lark trống/hỏng → giữ nguyên link đang có, không xoá", async () => {
    const bang = { customers: [{ id: "k1", facebook: LINK_TAY }] };
    const db = dbGia(bang);
    expect(await ghiLinkChatTheoLark(db.client, "k1", null)).toBe("khong_co_link");
    expect(await ghiLinkChatTheoLark(db.client, "k1", "")).toBe("khong_co_link");
    expect(await ghiLinkChatTheoLark(db.client, "k1", "javascript:alert(1)")).toBe("khong_co_link");
    expect(db.ghi).toHaveLength(0);
    expect(bang.customers[0]?.facebook).toBe(LINK_TAY);
  });
  it("link hỏng (javascript:) / thiếu khách → không ghi gì", async () => {
    const db = dbGia({ customers: [{ id: "k1", facebook: null }] });
    expect(await ghiLinkChatTheoLark(db.client, "k1", "javascript:alert(1)")).toBe("khong_co_link");
    expect(await ghiLinkChatTheoLark(db.client, null, LINK)).toBe("khong_co_link");
    expect(await ghiLinkChatTheoLark(db.client, "khong-co", LINK)).toBe("khong_thay_khach");
    expect(db.ghi).toHaveLength(0);
  });
});

describe("BB-404/407: đồng bộ Hậu Kỳ — bộ ĐÃ CÓ vẫn được cập nhật link chat theo Lark", () => {
  // pg GIẢ: giữ một khách trong bộ nhớ, áp đúng điều kiện của SQL_GHI_LINK_CHAT_THEO_LARK
  // (`btrim(coalesce(facebook,'')) is distinct from $1`) — chỉ ghi khi KHÁC, không còn "chỉ khi trống".
  const clientGia = (facebook: string | null) => {
    const khach = { id: "kh-cu", facebook };
    const cauLenh: { sql: string; params?: unknown[] }[] = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        cauLenh.push({ sql, params });
        if (sql.includes("from galleries where drive_folder_id")) {
          return { rows: [{ id: "gal-cu", title: "Album", status: "draft", customer_id: "kh-cu" }], rowCount: 1 };
        }
        if (sql === SQL_GHI_LINK_CHAT_THEO_LARK) {
          const khac = (khach.facebook ?? "").trim() !== params?.[0];
          if (params?.[1] === khach.id && khac) {
            khach.facebook = params?.[0] as string;
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 0 };
      },
    } as unknown as import("pg").Client;
    return { client, cauLenh, khach };
  };
  const banGhiVoi = (chat: unknown) => ({
    record_id: "rec_bb404",
    fields: {
      "Trạng thái": "Đã gửi file gốc",
      "Link ảnh gửi khách": "https://drive.google.com/drive/folders/1Fixture404aaaaaaaaaaaaaaaaaaaa",
      "Hợp đồng": "HD_20991231#404",
      "Chat với khách": chat,
    },
  });
  const banGhi = banGhiVoi([{ link: LINK, text: TEN_GIA, type: "url" }]);
  const chung = { branches: [], staffList: [], index: 0, dbUrl: "postgresql://localhost/test" };
  const soLanGhi = (cauLenh: { sql: string }[]) => cauLenh.filter((c) => c.sql === SQL_GHI_LINK_CHAT_THEO_LARK).length;

  it("khách cũ trống link → ghi link (chỉ phần URL)", async () => {
    const a = clientGia(null);
    const kq = await syncSingleRetouchRecord({ ...chung, client: a.client, record: banGhi, write: true });
    expect(kq.action).toBe("already_exists");
    expect(a.khach.facebook).toBe(LINK);
    expect(JSON.stringify(a.cauLenh)).not.toContain(TEN_GIA);
  });
  it("khách cũ đã có link KHÁC → GHI ĐÈ theo Lark", async () => {
    const a = clientGia("https://m.me/sua-tay-404");
    await syncSingleRetouchRecord({ ...chung, client: a.client, record: banGhi, write: true });
    expect(a.khach.facebook).toBe(LINK);
    expect(soLanGhi(a.cauLenh)).toBe(1);
  });
  it("khách cũ đã có link GIỐNG Lark → không ghi (rowCount 0, giá trị y nguyên)", async () => {
    const a = clientGia(LINK);
    await syncSingleRetouchRecord({ ...chung, client: a.client, record: banGhi, write: true });
    expect(a.khach.facebook).toBe(LINK);
    // câu SQL vẫn được gửi (điều kiện nằm ở DB) nhưng không đổi dòng nào
    const ghi = a.cauLenh.find((c) => c.sql === SQL_GHI_LINK_CHAT_THEO_LARK);
    expect(ghi?.params).toEqual([LINK, "kh-cu"]);
  });
  it("Lark trống / link hỏng → KHÔNG gửi câu ghi, giữ link đang có", async () => {
    for (const chat of [[], [{ link: "", text: TEN_GIA }], [{ link: "javascript:alert(1)", text: TEN_GIA }]]) {
      const a = clientGia("https://m.me/sua-tay-404");
      await syncSingleRetouchRecord({ ...chung, client: a.client, record: banGhiVoi(chat), write: true });
      expect(a.khach.facebook).toBe("https://m.me/sua-tay-404");
      expect(soLanGhi(a.cauLenh)).toBe(0);
    }
  });
  it("chạy thử (write=false) → không ghi", async () => {
    const b = clientGia(null);
    await syncSingleRetouchRecord({ ...chung, client: b.client, record: banGhi, write: false });
    expect(b.khach.facebook).toBeNull();
    expect(soLanGhi(b.cauLenh)).toBe(0);
  });
  it("ghiLinkChatTheoLarkPg từ chối link không http(s)", async () => {
    const a = clientGia(null);
    expect(await ghiLinkChatTheoLarkPg(a.client as never, "kh-cu", "javascript:alert(1)")).toBe("khong_co_link");
    expect(a.khach.facebook).toBeNull();
  });
  it("ghiLinkChatTheoLarkPg: khác → da_ghi, giống → da_co", async () => {
    const a = clientGia("https://m.me/cu-404");
    expect(await ghiLinkChatTheoLarkPg(a.client as never, "kh-cu", LINK)).toBe("da_ghi");
    expect(await ghiLinkChatTheoLarkPg(a.client as never, "kh-cu", LINK)).toBe("da_co");
  });
});

describe("BB-404: NutNhanKhach — một component dùng chung", () => {
  it("có link → <a target=_blank rel=noopener noreferrer href=link>", () => {
    const html = renderToStaticMarkup(<NutNhanKhach url={LINK} />);
    expect(html).toContain('data-testid="nut-nhan-khach"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain(`href="${LINK.replace(/&/g, "&amp;")}"`);
    expect(html).toContain("Nhắn khách");
  });
  it("không có link → nút xám 'Chưa có link chat' + gợi ý 'Đồng bộ từ Lark', không có href chat", () => {
    const html = renderToStaticMarkup(<NutNhanKhach url={null} />);
    expect(html).toContain('data-testid="nut-nhan-khach-trong"');
    expect(html).toContain("Chưa có link chat");
    expect(html).toContain("Đồng bộ từ Lark");
    expect(html).not.toContain('data-testid="nut-nhan-khach"');
    expect(html).not.toContain('target="_blank"');
  });
  it("javascript: → xám, không bao giờ thành href", () => {
    const html = renderToStaticMarkup(<NutNhanKhach url="javascript:alert(1)" gonNho />);
    expect(html).toContain('data-testid="nut-nhan-khach-trong"');
    expect(html).not.toContain("javascript:");
  });
  it("anKhiTrong (chỗ phụ) → không vẽ gì khi chưa có link", () => {
    expect(renderToStaticMarkup(<NutNhanKhach url={null} anKhiTrong />)).toBe("");
  });
});

describe("BB-404: API quản trị trả chatUrl (DB giả, một truy vấn)", () => {
  beforeEach(() => vi.mocked(createAdminClient).mockReset());

  it("layLinkChatTheoBo / layLinkChatTheoKhach: link hợp lệ → chatUrl; javascript:/trống → null", async () => {
    const db = dbGia({
      galleries: [
        { id: "g1", customer_id: "k1" },
        { id: "g2", customer_id: "k2" },
        { id: "g3", customer_id: "k3" },
      ],
      customers: [
        { id: "k1", facebook: LINK },
        { id: "k2", facebook: "javascript:alert(1)" },
        { id: "k3", facebook: null },
      ],
    });
    expect(await layLinkChatTheoBo(db.client, ["g1", "g2", "g3", "g1"])).toEqual({ g1: LINK, g2: null, g3: null });
    expect(db.doc.filter((d) => d.bang === "galleries")).toHaveLength(1);
    const theoKhach = await layLinkChatTheoKhach(db.client, ["k1", "k2"]);
    expect(theoKhach.get("k1")).toBe(LINK);
    expect(theoKhach.get("k2")).toBeNull();
  });

  it("GET /api/admin/customers: mỗi dòng có chatUrl (khách không link → null)", async () => {
    const db = dbGia({
      customers: [
        { id: "k1", full_name: "Nguyễn Thị Mai", phone: "0901000001", phone_normalized: "0901000001", branch_id: "b-404", created_at: "2099-01-02", facebook: LINK },
        { id: "k2", full_name: "Lê Thị Hoa", phone: "0901000002", phone_normalized: "0901000002", branch_id: "b-404", created_at: "2099-01-01", facebook: "javascript:alert(1)" },
      ],
      galleries: [],
      babies: [],
      branches: [{ id: "b-404", name: "Chi nhánh giả" }],
    });
    vi.mocked(createAdminClient).mockReturnValue(db.client as never);
    const res = await getKhachHang(new Request("http://localhost/api/admin/customers"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { items: { id: string; chatUrl: string | null }[] } };
    const theoId = Object.fromEntries(json.data.items.map((k) => [k.id, k.chatUrl]));
    expect(theoId).toEqual({ k1: LINK, k2: null });
  });

  it("GET /api/admin/reports/yeu-cau-mo-lai: trả chatTheoBo theo từng bộ", async () => {
    vi.resetModules();
    vi.doMock("@/lib/gallery/yeu-cau-mo-lai", () => ({
      layDanhSachChoXuLyMoLai: async () => [{ galleryId: "g1", title: "HD_20991231#404" }],
    }));
    vi.doMock("@/lib/gallery/dot-chon-server", () => ({ layCacDot: async () => [] }));
    vi.doMock("@/lib/gia-dinh/nha-cua-bo", () => ({ docNhaCuaCacBoKhongLoi: async () => ({}) }));
    const db = dbGia({ galleries: [{ id: "g1", customer_id: "k1" }], customers: [{ id: "k1", facebook: LINK }] });
    const { createAdminClient: taoMoi } = await import("@/lib/supabase/admin");
    vi.mocked(taoMoi).mockReturnValue(db.client as never);
    const { GET } = await import("@/app/api/admin/reports/yeu-cau-mo-lai/route");
    const res = await GET(new Request("http://localhost/api/admin/reports/yeu-cau-mo-lai"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { chatTheoBo: Record<string, string | null> } };
    expect(json.data.chatTheoBo).toEqual({ g1: LINK });
  });
});
