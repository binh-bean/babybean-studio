/**
 * BB-368 — lượt ghi Lark TỰ ĐỘNG sau Đồng bộ ảnh chỉ ghi khi ô "Link app" TRỐNG.
 *
 * `ghiLinkManConSauDongBo` luôn gọi `ghiLinkAppVeLark({ chiKhiTrong: true })`
 * (canh ở tests/security/bb-368-link-gia-dinh-bo-anh.test.ts). Tệp này canh tầng
 * dưới: với `chiKhiTrong`, ô đã có BẤT CỨ thứ gì — kể cả link app cũ của chính
 * app (`/g/…`, `/k/…`), thứ mà luồng thường được phép ghi đè (BB-155) — thì
 * KHÔNG có lượt PUT nào.
 *
 * Không gọi Lark thật: `fetch` là bản giả; cửa thoát CHO_PHEP_GOI_MANG_TRONG_PHEP_THU
 * chỉ có hiệu lực trong tệp này (Vitest tách tiến trình theo tệp).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { ghiLinkAppVeLark } from "@/lib/lark/ghi-link-app";

process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";

const RECORD = "recgialap368";
const GOC = "https://vi-du.test";
const MAN_CON = `${GOC}/k/abcdefABCDEF0123456789abcdefABCDEF012345678/2`;

function lapFetch(oDangCo: unknown) {
  const luot: { method: string; url: string; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      luot.push({ method, url: u, body: init?.body ? JSON.parse(String(init.body)) : null });
      const tra = (d: unknown) => new Response(JSON.stringify(d), { headers: { "content-type": "application/json" } });
      if (u.includes("/auth/v3/tenant_access_token")) return tra({ code: 0, tenant_access_token: "t-gia-lap", expire: 7200 });
      if (u.includes("/tables?page_size")) return tra({ code: 0, data: { items: [{ table_id: "tblGiaLap", name: "Hậu Kỳ" }] } });
      if (u.includes("/fields?page_size")) return tra({ code: 0, data: { items: [{ field_name: "Link app", type: 1 }] } });
      if (method === "PUT") return tra({ code: 0 });
      return tra({ code: 0, data: { record: { fields: { "Link app": oDangCo ?? undefined } } } });
    }),
  );
  return luot;
}

describe("BB-368: ghi Lark sau đồng bộ — chỉ khi ô trống", () => {
  beforeEach(() => {
    vi.stubEnv("LARK_APP_ID", "id-gia-lap");
    vi.stubEnv("LARK_APP_SECRET", "secret-gia-lap");
    vi.stubEnv("LARK_BASE_APP_TOKEN", "app-token-gia-lap");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("ô TRỐNG → một lượt PUT, đúng một khoá, đúng link màn con", async () => {
    const luot = lapFetch(undefined);
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: MAN_CON, ghiThat: true, chiKhiTrong: true });
    expect(kq.ghiDuoc).toBe(true);
    const put = luot.filter((l) => l.method === "PUT");
    expect(put).toHaveLength(1);
    expect(put[0]!.url).toContain(`/records/${RECORD}`);
    expect(put[0]!.body).toEqual({ fields: { "Link app": MAN_CON } });
  });

  it("ô đang giữ link /g/ cũ của chính app → KHÔNG PUT (luồng thường thì có ghi đè — đối chứng)", async () => {
    const cu = `${GOC}/g/XyZ123cuTheoBoXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`;

    const luotThuong = lapFetch(cu);
    expect((await ghiLinkAppVeLark({ recordId: RECORD, diaChi: MAN_CON, ghiThat: true })).ghiDuoc).toBe(true);
    expect(luotThuong.some((l) => l.method === "PUT")).toBe(true);
    vi.unstubAllGlobals();

    const luot = lapFetch(cu);
    const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: MAN_CON, ghiThat: true, chiKhiTrong: true });
    expect(kq.ghiDuoc).toBe(false);
    expect(kq.lyDo).toMatch(/đã có nội dung/);
    expect(luot.some((l) => l.method === "PUT")).toBe(false);
  });

  it("ô đang giữ link /k/ gia đình (kể cả link màn con khác) hoặc chữ tay → KHÔNG PUT", async () => {
    for (const dangCo of [
      `${GOC}/k/abcdefABCDEF0123456789abcdefABCDEF012345678`,
      `${GOC}/k/abcdefABCDEF0123456789abcdefABCDEF012345678/1`,
      [{ link: `${GOC}/k/zzz/3`, text: "x" }],
      "CSKH dán tay: gửi qua Zalo rồi",
    ]) {
      const luot = lapFetch(dangCo);
      const kq = await ghiLinkAppVeLark({ recordId: RECORD, diaChi: MAN_CON, ghiThat: true, chiKhiTrong: true });
      expect(kq.ghiDuoc).toBe(false);
      expect(luot.some((l) => l.method === "PUT")).toBe(false);
      vi.unstubAllGlobals();
    }
  });
});
