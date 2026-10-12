/**
 * BB-409 — quyền xoá bộ ảnh / xoá nhân sự, kế hoạch chuyển dữ liệu, và chặn link
 * khách của bộ trong thùng rác. Phép thử THUẦN: client Supabase là đồ giả (ghi lại
 * lời gọi rpc), `fetch` bị chặn, nhật ký là hàm giả.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

const gia = vi.hoisted(() => ({
  nhanSu: {} as Record<string, Record<string, unknown>>,
  chiNhanh: {} as Record<string, string[]>,
  toChuc: null as null | { id: string },
  boAnh: null as null | Record<string, unknown>,
  link: null as null | Record<string, unknown>,
  rpc: [] as Array<{ ten: string; thamSo: Record<string, unknown> }>,
  khoa: [] as Array<{ id: string; thamSo: Record<string, unknown> }>,
}));

function clientGia() {
  const cauHoi = (bang: string) => {
    const loc: Record<string, unknown> = {};
    const q: Record<string, unknown> = {};
    for (const m of ["select", "gt", "lt", "lte", "in", "or", "order", "limit", "not", "is"]) q[m] = () => q;
    q.eq = (cot: string, gt: unknown) => {
      loc[cot] = gt;
      return q;
    };
    const mot = async () => {
      if (bang === "staff_profiles") {
        if (loc.la_to_chuc === true) return { data: gia.toChuc, error: null };
        return { data: gia.nhanSu[String(loc.id)] ?? null, error: null };
      }
      if (bang === "galleries") return { data: gia.boAnh, error: null };
      if (bang === "share_links") return { data: gia.link, error: null };
      return { data: null, error: null };
    };
    q.maybeSingle = mot;
    q.single = mot;
    q.then = (xong: (v: unknown) => unknown) => {
      if (bang === "staff_branches") {
        const ds = (gia.chiNhanh[String(loc.staff_id)] ?? []).map((branch_id) => ({ branch_id }));
        return Promise.resolve(xong({ data: ds, error: null }));
      }
      return Promise.resolve(xong({ data: [], error: null }));
    };
    q.insert = async () => ({ data: null, error: null });
    q.update = () => q;
    return q;
  };
  return {
    from: cauHoi,
    rpc: async (ten: string, thamSo: Record<string, unknown>) => {
      gia.rpc.push({ ten, thamSo });
      if (ten === "bo_anh_vao_thung_rac") return { data: "2026-10-10T07:00:00.000Z", error: null };
      if (ten === "xoa_nhan_su_chuyen_du_lieu") return { data: { boAnhPhoto: 2 }, error: null };
      return { data: null, error: null };
    },
    auth: {
      admin: {
        updateUserById: async (id: string, thamSo: Record<string, unknown>) => {
          gia.khoa.push({ id, thamSo });
          return { data: {}, error: null };
        },
        createUser: async () => ({ data: null, error: new Error("không được tạo tài khoản trong phép thử") }),
        deleteUser: async () => ({ data: null, error: null }),
      },
    },
  };
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => clientGia() }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => clientGia() }));
vi.mock("@/lib/nhat-ky", () => ({ ghiNhatKy: vi.fn(async () => {}) }));

import * as staffAuth from "@/lib/auth/staff";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";
import { DELETE as xoaNhanSu } from "@/app/api/admin/staff/[id]/route";
import { POST as vaoThungRac } from "@/app/api/admin/galleries/[id]/thung-rac/route";
import { POST as thaoTacThungRac } from "@/app/api/admin/thung-rac/[id]/route";
import { assertShareLinkUsable, GallerySessionError } from "@/lib/auth/gallery-session";
import { boAnhDaXoa } from "@/lib/auth/dang-nhap-bang-ma";
import {
  COT_PHU_TRACH,
  TEN_TO_CHUC,
  keHoachChuyen,
  kiemQuyenXoaNhanSu,
  tenHienThiNhanSu,
} from "@/lib/nhan-su/xoa-nhan-su";
import { bamThuMucDrive } from "@/lib/thung-rac/thung-rac";

const CN = "11111111-1111-4111-8111-111111111111";
const CN_KHAC = "55555555-5555-4555-8555-555555555555";
const TOI = "22222222-2222-4222-8222-222222222222";
const BO = "44444444-4444-4444-8444-444444444444";
const NV = {
  admin: "a0000000-0000-4000-8000-000000000001",
  quanLy: "a0000000-0000-4000-8000-000000000002",
  cs: "a0000000-0000-4000-8000-000000000003",
  csKhacCn: "a0000000-0000-4000-8000-000000000004",
};
const TO_CHUC = "a0000000-0000-4000-8000-0000000000ff";

function laVai(vai: string, branchIds: string[] = [CN]) {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
    staffId: TOI,
    role: vai,
    roleName: vai,
    branchIds,
    permissions: quyenCuaVai(vai),
  } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const xoa = (id: string) => xoaNhanSu(new Request(`http://x/api/admin/staff/${id}`, { method: "DELETE" }), ctx(id));

beforeEach(() => {
  gia.nhanSu = {
    [NV.admin]: { id: NV.admin, full_name: "Fixture Admin", role: "owner", roles: { permissions: quyenCuaVai("owner") } },
    [NV.quanLy]: { id: NV.quanLy, full_name: "Fixture Quản lý", role: "branch_manager", roles: { permissions: quyenCuaVai("branch_manager") } },
    [NV.cs]: { id: NV.cs, full_name: "Fixture CSKH", role: "cs", roles: { permissions: quyenCuaVai("cs") } },
    [NV.csKhacCn]: { id: NV.csKhacCn, full_name: "Fixture CSKH 2", role: "cs", roles: { permissions: quyenCuaVai("cs") } },
  };
  gia.chiNhanh = { [NV.quanLy]: [CN], [NV.cs]: [CN], [NV.csKhacCn]: [CN_KHAC] };
  gia.toChuc = { id: TO_CHUC };
  gia.boAnh = null;
  gia.link = null;
  gia.rpc = [];
  gia.khoa = [];
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("BB-409: phép thử thuần không được gọi mạng");
  }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("BB-409: quyền xoá nhân sự (route DELETE /api/admin/staff/:id)", () => {
  it("Admin xoá CSKH → chuyển việc về Tổ chức trong MỘT lời gọi SQL + khoá đăng nhập", async () => {
    laVai("owner");
    const res = await xoa(NV.cs);
    expect(res.status).toBe(200);
    const goi = gia.rpc.filter((r) => r.ten === "xoa_nhan_su_chuyen_du_lieu");
    expect(goi).toEqual([{ ten: "xoa_nhan_su_chuyen_du_lieu", thamSo: { p_staff_id: NV.cs, p_to_chuc_id: TO_CHUC, p_actor_id: TOI } }]);
    expect(gia.khoa).toHaveLength(1);
    expect(gia.khoa[0]!.id).toBe(NV.cs);
    expect(gia.khoa[0]!.thamSo.ban_duration).toBeTruthy();
  });

  it("Quản lý xoá CSKH cùng chi nhánh → được", async () => {
    laVai("branch_manager");
    expect((await xoa(NV.cs)).status).toBe(200);
  });

  it("vai khác (CSKH, Kế toán, Photo) → 403, không gọi SQL nào", async () => {
    for (const vai of ["cs", "accountant", "photographer", "retoucher", "viewer"]) {
      laVai(vai);
      expect((await xoa(NV.csKhacCn)).status).toBe(403);
      vi.restoreAllMocks();
    }
    expect(gia.rpc).toEqual([]);
  });

  it("Quản lý xoá Admin hoặc Quản lý khác → 403", async () => {
    laVai("branch_manager");
    expect((await xoa(NV.admin)).status).toBe(403);
    expect((await xoa(NV.quanLy)).status).toBe(403);
    expect(gia.rpc).toEqual([]);
  });

  it("không ai xoá được Admin — kể cả Admin", async () => {
    laVai("owner");
    const res = await xoa(NV.admin);
    expect(res.status).toBe(403);
    expect(gia.rpc).toEqual([]);
  });

  it("Quản lý không xoá được người ở chi nhánh khác", async () => {
    laVai("branch_manager");
    expect((await xoa(NV.csKhacCn)).status).toBe(403);
  });

  it("người đã xoá rồi → 409, không chạy lại", async () => {
    gia.nhanSu[NV.cs]!.da_nghi_luc = "2026-10-09T00:00:00Z";
    laVai("owner");
    expect((await xoa(NV.cs)).status).toBe(409);
    expect(gia.rpc).toEqual([]);
  });
});

describe("BB-409: luật quyền + kế hoạch chuyển (thuần)", () => {
  const admin = { staffId: TOI, role: "owner" as const, permissions: quyenCuaVai("owner"), branchIds: [CN] };
  it("tự xoá mình bị chặn; Tổ chức BabyBean không xoá được", () => {
    expect(kiemQuyenXoaNhanSu(admin, { id: TOI, role: "cs", permissions: [], branchIds: [CN] })).toBe("TU_XOA");
    expect(kiemQuyenXoaNhanSu(admin, { id: TO_CHUC, role: "viewer", permissions: [], branchIds: [], laToChuc: true })).toBe("LA_TO_CHUC");
  });
  it("vai tự tạo mang quyền nhan_su:xoa được coi là Quản lý", () => {
    const quanLy = { staffId: TOI, role: "branch_manager" as const, permissions: quyenCuaVai("branch_manager"), branchIds: [CN] };
    expect(
      kiemQuyenXoaNhanSu(quanLy, { id: NV.cs, role: "cs", permissions: ["nhan_su:xoa"], branchIds: [CN] }),
    ).toBe("LA_QUAN_LY");
  });
  it("kế hoạch: cộng bộ ảnh theo ba vai, câu xác nhận nêu Tổ chức BabyBean", () => {
    const kh = keHoachChuyen({ boAnhPhoto: 2, boAnhCskh: 1, boAnhChinh: 0, viecChinhAnh: 4, buoiChup: 3, khachTao: 7 }, "Fixture CSKH");
    expect(kh.soBoAnh).toBe(3);
    expect(kh.soViec).toBe(4);
    expect(kh.soKhach).toBe(7);
    expect(kh.cau).toBe("3 bộ ảnh, 4 việc chỉnh ảnh, 3 buổi chụp sắp tới đang do Fixture CSKH phụ trách sẽ chuyển về Tổ chức BabyBean.");
    expect(keHoachChuyen(null, "Fixture CSKH").cau).toBe("Fixture CSKH không còn việc nào đang phụ trách.");
  });
  it("danh sách cột phụ trách khớp đúng năm cột hàm SQL chuyển", () => {
    expect(COT_PHU_TRACH.map((c) => `${c.bang}.${c.cot}`)).toEqual([
      "galleries.photographer_id",
      "galleries.cskh_id",
      "galleries.editor_id",
      "deliveries.retoucher_id",
      "shoots.photographer_id",
    ]);
  });
  it("tên hiển thị: người đã xoá kèm (đã nghỉ); dòng Tổ chức hiện tên chung", () => {
    expect(tenHienThiNhanSu({ full_name: "Fixture CSKH", da_nghi_luc: "2026-10-01" })).toBe("Fixture CSKH (đã nghỉ)");
    expect(tenHienThiNhanSu({ full_name: "Fixture CSKH", da_nghi_luc: null })).toBe("Fixture CSKH");
    expect(tenHienThiNhanSu({ full_name: "x", la_to_chuc: true })).toBe(TEN_TO_CHUC);
  });
});

describe("BB-409: quyền xoá bộ ảnh (thùng rác)", () => {
  const vao = () => vaoThungRac(new Request(`http://x/api/admin/galleries/${BO}/thung-rac`, { method: "POST" }), ctx(BO));

  it("Admin / Quản lý đưa bộ vào thùng rác; dấu Drive gửi dạng BĂM", async () => {
    for (const vai of ["owner", "branch_manager"]) {
      gia.rpc = [];
      gia.boAnh = { id: BO, branch_id: CN, drive_folder_id: "SEED_FOLDER_ID_001", deleted_at: null };
      laVai(vai);
      expect((await vao()).status).toBe(200);
      expect(gia.rpc).toEqual([
        { ten: "bo_anh_vao_thung_rac", thamSo: { p_gallery_id: BO, p_actor_id: TOI, p_drive_hash: bamThuMucDrive("SEED_FOLDER_ID_001") } },
      ]);
      vi.restoreAllMocks();
    }
  });

  it("vai khác → 403; Quản lý chi nhánh khác → 403", async () => {
    gia.boAnh = { id: BO, branch_id: CN, drive_folder_id: null, deleted_at: null };
    for (const vai of ["cs", "photographer", "retoucher", "accountant", "viewer"]) {
      laVai(vai);
      expect((await vao()).status).toBe(403);
      vi.restoreAllMocks();
    }
    laVai("branch_manager", [CN_KHAC]);
    expect((await vao()).status).toBe(403);
    expect(gia.rpc).toEqual([]);
  });

  it("xoá hẳn ngay mà gõ sai mã → 400, không đụng gì", async () => {
    gia.boAnh = { id: BO, branch_id: CN, deleted_at: "2026-10-01T00:00:00Z" };
    laVai("owner");
    const res = await thaoTacThungRac(
      new Request(`http://x/api/admin/thung-rac/${BO}`, { method: "POST", body: JSON.stringify({ hanhDong: "xoa_han", xacNhan: "sai-ma" }) }),
      ctx(BO),
    );
    expect(res.status).toBe(400);
    expect(gia.rpc).toEqual([]);
  });
});

describe("BB-409: link khách của bộ trong thùng rác", () => {
  it("phiên đang mở của link theo bộ → GALLERY_GONE (khách thấy 'bộ ảnh không còn')", async () => {
    gia.link = { status: "active", customer_id: null, expires_at: null, galleries: { deleted_at: "2026-10-10T00:00:00Z" } };
    await expect(assertShareLinkUsable("link-1")).rejects.toMatchObject({ code: "GALLERY_GONE" });
    await expect(assertShareLinkUsable("link-1")).rejects.toBeInstanceOf(GallerySessionError);
  });
  it("bộ còn dùng → link vẫn qua", async () => {
    gia.link = { status: "active", customer_id: null, expires_at: null, galleries: { deleted_at: null } };
    await expect(assertShareLinkUsable("link-1")).resolves.toBeUndefined();
  });
  it("đọc deleted_at cả khi PostgREST trả mảng", () => {
    expect(boAnhDaXoa({ galleries: [{ deleted_at: "2026-10-10" }] })).toBe(true);
    expect(boAnhDaXoa({ galleries: null })).toBe(false);
  });
});
