/**
 * BB-383 — quyền theo vai, anh chốt 06/10/2026. Phép thử THUẦN: không chạm cơ
 * sở dữ liệu (client Supabase là đồ giả, `fetch` bị chặn hẳn).
 *
 * Ma trận "sau" KHÔNG gõ tay: lấy bộ quyền hiện tại (tests/fixtures/phien-nhan-su
 * — bản sao 0052…0066) rồi ÁP CHÍNH các câu `update roles … array_append` đọc
 * từ `db/migrations/0099-quyen-theo-vai.sql`. Sửa migration lệch ý anh là đỏ.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

// --- Client Supabase giả: một bộ ảnh do test đặt, mọi câu khác trả rỗng ------
const gia = vi.hoisted(() => ({
  boAnh: null as null | { id: string; branch_id: string; editor_id: string | null },
}));
function clientGia() {
  const cauHoi = (bang: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gt", "lt", "in", "or", "order", "limit"]) q[m] = () => q;
    const mot = async () => ({ data: bang === "galleries" ? gia.boAnh : null, error: null });
    q.maybeSingle = mot;
    q.single = mot;
    q.then = (xong: (v: unknown) => unknown) => xong({ data: [], error: null });
    return q;
  };
  return { from: cauHoi };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clientGia() }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => clientGia() }));

import * as staffAuth from "@/lib/auth/staff";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { MA_QUYEN_HOP_LE, DANH_MUC_QUYEN } from "@/lib/auth/danh-muc-quyen";
import {
  quyenThaoTacBoAnh,
  xetQuyenXemBoAnh,
  coMotTrongCacQuyen,
  QUYEN_GUI_KHACH_DUYET,
} from "@/lib/auth/quyen-xem-bo-anh";
import { POST as guiKhach } from "@/app/api/admin/galleries/[id]/anh-chinh-sua/gui-khach/route";
import { POST as dongBo } from "@/app/api/admin/galleries/[id]/sync/route";
import { GET as xemAnh } from "@/app/api/admin/galleries/[id]/photos/route";
// BB-383b — route sửa THÔNG TIN bộ ảnh và route tiền/xác nhận/dòng hàng.
import { PATCH as doiThuMuc } from "@/app/api/admin/galleries/[id]/drive/route";
import { PUT as datTenBe } from "@/app/api/admin/galleries/[id]/ten-be/route";
import { PATCH as suaBia } from "@/app/api/admin/galleries/[id]/bia/route";
import { POST as thuTien } from "@/app/api/admin/galleries/[id]/payments/route";
import { POST as xacNhanDanhSach } from "@/app/api/admin/galleries/[id]/confirm/route";
import { POST as themDongHang } from "@/app/api/admin/galleries/[id]/items/route";
import { POST as xacNhanDot } from "@/app/api/admin/galleries/[id]/dot-chon/[soDot]/xac-nhan/route";
import { POST as dongHopDong } from "@/app/api/admin/galleries/[id]/dong-hop-dong/route";

// --- Ma trận trước / sau ---------------------------------------------------
const VAI_THEO_ID: Record<string, string> = {
  "00000000-0000-0000-0000-000000000001": "owner",
  "00000000-0000-0000-0000-000000000002": "admin",
  "00000000-0000-0000-0000-000000000003": "branch_manager",
  "00000000-0000-0000-0000-000000000004": "cs",
  "00000000-0000-0000-0000-000000000005": "photographer",
  "00000000-0000-0000-0000-000000000006": "retoucher",
  "00000000-0000-0000-0000-000000000007": "accountant",
  "00000000-0000-0000-0000-000000000008": "viewer",
  "00000000-0000-0000-0000-000000000009": "photoshop_ctv",
};
const CAC_VAI = Object.values(VAI_THEO_ID);

const SQL = fs.readFileSync(path.resolve(__dirname, "../../db/migrations/0099-quyen-theo-vai.sql"), "utf8");
/** Bỏ chú thích (`-- …`) để câu đảo ngược trong chú thích không bị tính. */
const SQL_CHAY = SQL.split("\n").map((d) => d.replace(/--.*$/, "")).join("\n");

function capTuMigration(): Array<{ quyen: string; vai: string[] }> {
  return SQL_CHAY.split(/update roles/i)
    .slice(1)
    .map((khoi) => {
      const quyen = /array_append\(permissions,\s*'([^']+)'\)/.exec(khoi)?.[1] ?? "";
      const ids = [...khoi.matchAll(/'(0{8}-0{4}-0{4}-0{4}-0{11}\d)'/g)].map((m) => m[1]);
      return { quyen, vai: ids.map((id) => VAI_THEO_ID[id ?? ""] ?? `?${id}`) };
    });
}

const TRUOC: Record<string, string[]> = Object.fromEntries(CAC_VAI.map((v) => [v, quyenCuaVai(v)]));
const SAU: Record<string, string[]> = Object.fromEntries(CAC_VAI.map((v) => [v, [...quyenCuaVai(v)]]));
/** Bộ quyền của một vai trong một bảng (vai lạ → rỗng). */
const qv = (bang: Record<string, string[]>, vai: string): string[] => bang[vai] ?? [];
for (const { quyen, vai } of capTuMigration()) {
  for (const v of vai) if (!qv(SAU, v).includes(quyen)) SAU[v] = [...qv(SAU, v), quyen];
}

const ai = (bang: Record<string, string[]>, xet: (q: string[]) => boolean) =>
  CAC_VAI.filter((v) => xet(qv(bang, v))).sort();

// --- Phiên giả ----------------------------------------------------------------
const CN = "11111111-1111-4111-8111-111111111111";
const TOI = "22222222-2222-4222-8222-222222222222";
const NGUOI_KHAC = "33333333-3333-4333-8333-333333333333";
const BO = "44444444-4444-4444-8444-444444444444";

function laVai(vai: string, bang: Record<string, string[]>) {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
    staffId: TOI,
    role: vai,
    roleName: vai,
    branchIds: [CN],
    permissions: qv(bang, vai),
  } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (url = `http://x/api/admin/galleries/${BO}/sync`) => new Request(url, { method: "POST" });

beforeEach(() => {
  gia.boAnh = null;
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("BB-383: phép thử thuần không được gọi mạng");
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// =============================================================================
describe("BB-383 · migration 0099", () => {
  it("cấp đúng bốn ý anh chốt, không cấp gì thêm", () => {
    expect(capTuMigration()).toEqual([
      { quyen: "selections:read", vai: ["photoshop_ctv"] },
      { quyen: "anh_chinh:gui_khach", vai: ["owner", "admin", "cs", "retoucher"] },
      { quyen: "galleries:sync", vai: ["photographer"] },
      // BB-383b (anh chốt 07/10 "Chỉ sửa thông tin bộ, không tiền"): quyền HẸP,
      // không phải `galleries:write`.
      { quyen: "galleries:edit_info", vai: ["owner", "admin", "branch_manager", "cs", "photographer"] },
    ]);
  });

  it("BB-383b: KHÔNG cấp galleries:write cho vai nào", () => {
    expect(capTuMigration().map((c) => c.quyen)).not.toContain("galleries:write");
    expect(SQL_CHAY).not.toMatch(/'galleries:write'/);
  });

  it("chạy lại được: mỗi câu cấp đều có chốt 'chỉ thêm khi chưa có'", () => {
    const khoi = SQL_CHAY.split(/update roles/i).slice(1);
    expect(khoi.length).toBe(4);
    for (const k of khoi) {
      const q = /array_append\(permissions,\s*'([^']+)'\)/.exec(k)![1];
      expect(k).toContain(`not ('${q}' = any (permissions))`);
    }
  });

  it("luật lượt chọn chỉ cho thấy bộ được giao khi không có galleries:all_in_branch", () => {
    expect(SQL_CHAY).toMatch(/drop policy if exists selections_select on selections;/);
    expect(SQL_CHAY).toMatch(
      /create policy selections_select[\s\S]*has_permission\('selections:read'\)[\s\S]*has_permission\('galleries:all_in_branch'\) or g\.editor_id = auth\.uid\(\)/,
    );
  });

  it("có câu đảo ngược trong chú thích", () => {
    expect(SQL).toMatch(/Đảo ngược/);
    expect(SQL).toMatch(/array_remove\(permissions, 'anh_chinh:gui_khach'\)/);
    expect(SQL).toMatch(/array_remove\(permissions, 'galleries:edit_info'\)/);
    expect(SQL).toMatch(/array_remove\(permissions, 'selections:read'\)/);
    // Đảo ngược không được gỡ `galleries:write` của ai — 0099 không cấp nó.
    expect(SQL).not.toMatch(/array_remove\(permissions, 'galleries:write'\)/);
  });
});

describe("BB-383 · danh mục quyền (màn Vai trò)", () => {
  it("quyền mới hợp lệ khi lưu vai và có nhãn tiếng Việt", () => {
    expect(MA_QUYEN_HOP_LE.has(QUYEN_GUI_KHACH_DUYET)).toBe(true);
    const q = DANH_MUC_QUYEN.find((x) => x.ma === QUYEN_GUI_KHACH_DUYET)!;
    expect(q.ten).toBe("Gửi ảnh chỉnh sửa cho khách duyệt");
    expect(q.dangCoHieuLuc).toBe(true);
    expect(DANH_MUC_QUYEN.find((x) => x.ma === "galleries:sync")!.dangCoHieuLuc).toBe(true);
  });

  it("BB-383b: quyền 'Sửa thông tin bộ ảnh' có trong danh mục", () => {
    expect(MA_QUYEN_HOP_LE.has("galleries:edit_info")).toBe(true);
    const q = DANH_MUC_QUYEN.find((x) => x.ma === "galleries:edit_info");
    expect(q?.ten).toBe("Sửa thông tin bộ ảnh");
    expect(q?.dangCoHieuLuc).toBe(true);
  });
});

describe("BB-383 · ai được gì (trước → sau)", () => {
  it("1. Xem lượt chọn (selections:read): thêm CTV chỉnh ảnh", () => {
    const co = (q: string[]) => q.includes("selections:read");
    expect(ai(TRUOC, co)).not.toContain("photoshop_ctv");
    expect(ai(SAU, co)).toEqual([...CAC_VAI].sort());
  });

  it("1b. CTV vẫn chỉ mở được bộ ĐƯỢC GIAO", () => {
    const ctv = { staffId: TOI, permissions: qv(SAU, "photoshop_ctv"), branchIds: [CN] };
    expect(xetQuyenXemBoAnh(ctv, { branch_id: CN, editor_id: TOI })).toBeNull();
    expect(xetQuyenXemBoAnh(ctv, { branch_id: CN, editor_id: NGUOI_KHAC })).toBe("chua-duoc-giao");
    expect(xetQuyenXemBoAnh(ctv, { branch_id: CN, editor_id: null })).toBe("chua-duoc-giao");
  });

  it("2. Gửi khách duyệt ảnh chỉnh: thêm thợ chỉnh — thợ chụp KHÔNG (BB-383b)", () => {
    const xet = (q: string[]) => quyenThaoTacBoAnh(q).guiAnhChinh;
    expect(ai(TRUOC, xet)).toEqual(["admin", "branch_manager", "cs", "owner"]);
    expect(ai(SAU, xet)).toEqual(["admin", "branch_manager", "cs", "owner", "retoucher"]);
  });

  it("3. Đồng bộ ảnh: thợ chụp bấm được (galleries:sync)", () => {
    const xet = (q: string[]) => quyenThaoTacBoAnh(q).dongBo;
    expect(ai(TRUOC, xet)).toEqual(["admin", "branch_manager", "cs", "owner", "photographer"]);
    expect(ai(SAU, xet)).toEqual(["admin", "branch_manager", "cs", "owner", "photographer"]);
    // Có `galleries:sync` mà KHÔNG có `galleries:write` vẫn bấm được.
    expect(quyenThaoTacBoAnh(["galleries:sync"]).dongBo).toBe(true);
    expect(quyenThaoTacBoAnh(["galleries:sync"]).ghi).toBe(false);
  });

  it("4. Vai \"Photo\" (photographer) sửa THÔNG TIN bộ ảnh, không có quyền ghi chung (BB-383b)", () => {
    const suaThongTin = (q: string[]) => quyenThaoTacBoAnh(q).suaThongTin === true;
    expect(ai(TRUOC, suaThongTin)).toEqual(["admin", "branch_manager", "cs", "owner"]);
    expect(ai(SAU, suaThongTin)).toEqual(["admin", "branch_manager", "cs", "owner", "photographer"]);
    // Quyền ghi chung (tiền, xác nhận, dòng hàng) KHÔNG đổi.
    const ghi = (q: string[]) => quyenThaoTacBoAnh(q).ghi;
    expect(ai(SAU, ghi)).toEqual(["admin", "branch_manager", "cs", "owner"]);
    // Chỉ có `galleries:edit_info` → sửa thông tin được, ghi chung thì không.
    expect(quyenThaoTacBoAnh(["galleries:edit_info"]).suaThongTin).toBe(true);
    expect(quyenThaoTacBoAnh(["galleries:edit_info"]).ghi).toBe(false);
    expect(quyenThaoTacBoAnh(["galleries:write"]).suaThongTin).toBe(true);
  });

  it("4b. Bảng thao tác của thợ chụp SAU 0099 (anh chốt 07/10)", () => {
    const q = quyenThaoTacBoAnh(qv(SAU, "photographer"));
    expect({
      suaThongTin: q.suaThongTin,
      dongBo: q.dongBo,
      thuTien_xacNhan_dongHang: q.ghi,
      guiKhachDuyet: q.guiAnhChinh,
    }).toEqual({ suaThongTin: true, dongBo: true, thuTien_xacNhan_dongHang: false, guiKhachDuyet: false });
    expect(qv(SAU, "photographer")).not.toContain("galleries:write");
    expect(qv(SAU, "photographer")).not.toContain("anh_chinh:gui_khach");
  });

  it("không vai nào MẤT quyền", () => {
    for (const v of CAC_VAI) for (const q of qv(TRUOC, v)) expect(qv(SAU, v)).toContain(q);
  });

  it("coMotTrongCacQuyen", () => {
    expect(coMotTrongCacQuyen(["a"], ["a", "b"])).toBe(true);
    expect(coMotTrongCacQuyen(["c"], ["a", "b"])).toBe(false);
    expect(coMotTrongCacQuyen([], [])).toBe(false);
  });
});

// =============================================================================
describe("BB-383 · cửa quyền ở route (client Supabase giả)", () => {
  it("gửi khách duyệt: thợ chỉnh SAU 0099 qua được cửa quyền (rơi tiếp vào kiểm mã bộ → 400)", async () => {
    laVai("retoucher", SAU);
    const res = await guiKhach(req(), ctx("khong-phai-uuid"));
    expect(res.status).toBe(400);
  });

  it("gửi khách duyệt: thợ chỉnh TRƯỚC 0099, kế toán, CTV → 403", async () => {
    for (const [vai, bang] of [["retoucher", TRUOC], ["accountant", SAU], ["photoshop_ctv", SAU]] as const) {
      laVai(vai, bang);
      const res = await guiKhach(req(), ctx("khong-phai-uuid"));
      expect(res.status, vai).toBe(403);
    }
  });

  it("đồng bộ: vai chỉ có galleries:sync qua được cửa quyền (bộ không có → 404)", async () => {
    laVai("photographer", { photographer: qv(TRUOC, "photographer").filter((q) => q !== "galleries:write") });
    const res = await dongBo(req(), ctx(BO));
    expect(res.status).toBe(404);
  });

  it("đồng bộ: thợ chỉnh, kế toán, CTV → 403", async () => {
    for (const vai of ["retoucher", "accountant", "photoshop_ctv"]) {
      laVai(vai, SAU);
      const res = await dongBo(req(), ctx(BO));
      expect(res.status, vai).toBe(403);
    }
  });

  it("GET ảnh của bộ: CTV xem bộ được giao → 200, bộ người khác → 403 (cùng luật với màn chi tiết)", async () => {
    const url = `http://x/api/admin/galleries/${BO}/photos`;
    laVai("photoshop_ctv", SAU);
    gia.boAnh = { id: BO, branch_id: CN, editor_id: TOI };
    expect((await xemAnh(new Request(url), ctx(BO))).status).toBe(200);
    gia.boAnh = { id: BO, branch_id: CN, editor_id: NGUOI_KHAC };
    expect((await xemAnh(new Request(url), ctx(BO))).status).toBe(403);
  });

  // --- BB-383b: thợ chụp "Chỉ sửa thông tin bộ, không tiền" -----------------
  // Qua cửa quyền = mã KHÁC 403 (bộ không có → 404, đầu vào sai → 400).
  const json = (method: string, body: unknown) =>
    new Request(`http://x/api/admin/galleries/${BO}`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const goiSuaThongTin = {
    "đổi thư mục Drive": () => doiThuMuc(json("PATCH", { driveUrl: "https://drive.google.com/drive/folders/SEED_FOLDER_ID_001" }), ctx(BO)),
    "điền tên bé": () => datTenBe(json("PUT", { fullName: "Bé Na" }), ctx(BO)),
    "sửa bìa (tiêu đề, lời chào)": () => suaBia(json("PATCH", { coverHeadline: "Tiêu đề thử" }), ctx(BO)),
  };
  const goiTienXacNhan = {
    "thu tiền": () => thuTien(json("POST", { amount: 100000 }), ctx(BO)),
    "xác nhận danh sách": () => xacNhanDanhSach(json("POST", {}), ctx(BO)),
    "thêm dòng hàng": () => themDongHang(json("POST", { productId: BO }), ctx(BO)),
    "xác nhận đợt chọn": () =>
      xacNhanDot(json("POST", {}), { params: Promise.resolve({ id: BO, soDot: "2" }) }),
    "đóng hợp đồng": () => dongHopDong(json("POST", {}), ctx(BO)),
    "gửi khách duyệt ảnh chỉnh": () => guiKhach(json("POST", {}), ctx(BO)),
  };

  it("BB-383b: thợ chụp SAU 0099 qua được cửa quyền của mọi route sửa thông tin", async () => {
    for (const [ten, goi] of Object.entries(goiSuaThongTin)) {
      laVai("photographer", SAU);
      const res = await goi();
      expect(res.status, ten).not.toBe(403);
      expect([400, 404], ten).toContain(res.status);
    }
  });

  it("BB-383b: thợ chụp SAU 0099 bị 403 ở mọi route tiền / xác nhận / dòng hàng / gửi duyệt", async () => {
    for (const [ten, goi] of Object.entries(goiTienXacNhan)) {
      laVai("photographer", SAU);
      expect((await goi()).status, ten).toBe(403);
    }
  });

  it("BB-383b: CSKH (galleries:write) vẫn qua cửa quyền route sửa thông tin", async () => {
    for (const [ten, goi] of Object.entries(goiSuaThongTin)) {
      laVai("cs", TRUOC);
      expect((await goi()).status, ten).not.toBe(403);
    }
  });

  it("BB-383b: kế toán, thợ chỉnh, CTV vẫn bị 403 ở route sửa thông tin", async () => {
    for (const vai of ["accountant", "retoucher", "photoshop_ctv"]) {
      for (const [ten, goi] of Object.entries(goiSuaThongTin)) {
        laVai(vai, SAU);
        expect((await goi()).status, `${vai} · ${ten}`).toBe(403);
      }
    }
  });

  it("GET ảnh của bộ: CSKH (thấy mọi bộ trong chi nhánh) xem bộ không giao cho mình → 200", async () => {
    laVai("cs", SAU);
    gia.boAnh = { id: BO, branch_id: CN, editor_id: NGUOI_KHAC };
    expect((await xemAnh(new Request(`http://x/api/admin/galleries/${BO}/photos`), ctx(BO))).status).toBe(200);
  });
});
