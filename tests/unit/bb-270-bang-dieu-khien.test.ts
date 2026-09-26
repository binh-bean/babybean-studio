/**
 * BB-270 — Bảng điều khiển: chip % so kỳ trước + tiến độ theo chi nhánh.
 *
 * Ba nhóm phép thử, theo AGENTS.md §5a (không đọc mã nguồn làm dữ liệu thử,
 * không giả lập hook React — cả hai điều đó không áp dụng ở đây vì đây là
 * logic thuần + route API, không có component React nào bị giả lập):
 *
 * 1. Hàm thuần `src/lib/utils/bang-dieu-khien.ts` — chạy offline, không cần
 *    client giả lẫn cơ sở dữ liệu. Canh đúng hợp đồng: kỳ trước = 0 → null,
 *    tăng/giảm, và "tốt/xấu" phụ thuộc Ý NGHĨA thẻ chứ không phải dấu %.
 * 2. `GET /api/admin/dashboard` với client giả MÔ PHỎNG NGỮ NGHĨA PostgREST
 *    (in/eq/neq/gte/lt/not/or đều lọc thật trên một mảng trong bộ nhớ — theo
 *    đúng khuôn `taoAdminGiaBoLoc` của BB-261, không phải canned data trả
 *    nguyên xi). Canh: chi nhánh không được xem không lọt vào
 *    `tienDoChiNhanh`, và bộ ảnh Fixture không được tính vào bất cứ số nào.
 * 3. `GET /api/admin/dashboard` với client luôn lỗi (khuôn BB-060) — canh
 *    "đọc hụt thì ném", áp dụng cho cả các truy vấn MỚI của BB-270.
 *
 * KIỂM NGƯỢC (chạy tay trước khi nộp, dán cả hai kết quả):
 *  · Bỏ dòng `locBoAnhThat(...)` khỏi `demGalleryTheoChiNhanh` trong route.ts
 *    → ca "Fixture bị loại khỏi tiến độ chi nhánh" phải ĐỎ (đếm dư 1).
 *  · Đổi `.in("id", branchIds)` thành bỏ điều kiện khi lấy tên chi nhánh
 *    trong route.ts → ca "chỉ gồm chi nhánh được xem" phải ĐỎ (branch-b lọt
 *    vào kết quả).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

import { tinhTyLeChot, bienDongLaTot } from "@/lib/utils/bang-dieu-khien";
import { chenhLechPhanTram } from "@/lib/bao-cao/ky";

// ---------------------------------------------------------------------------
// Nhóm 1 — hàm thuần, offline.
// ---------------------------------------------------------------------------

describe("BB-270: chenhLechPhanTram + bienDongLaTot (chip % so kỳ trước)", () => {
  it("kỳ trước = 0, hiện tại > 0 -> % là null (không chia cho 0, không hiện chip)", () => {
    const pct = chenhLechPhanTram(5, 0);
    expect(pct).toBeNull();
    expect(bienDongLaTot(pct, true)).toBeNull();
  });

  it("kỳ trước = 0, hiện tại = 0 -> % là 0 (đi ngang) -> không tô tốt/xấu", () => {
    const pct = chenhLechPhanTram(0, 0);
    expect(pct).toBe(0);
    expect(bienDongLaTot(pct, true)).toBeNull();
  });

  it("giảm so kỳ trước", () => {
    const pct = chenhLechPhanTram(8, 10); // -20%
    expect(pct).toBeCloseTo(-20, 5);
  });

  it("tăng so kỳ trước", () => {
    const pct = chenhLechPhanTram(15, 10); // +50%
    expect(pct).toBeCloseTo(50, 5);
  });

  it("thẻ 'tăng là tốt' (vd Đã giao): tăng -> tốt, giảm -> xấu", () => {
    expect(bienDongLaTot(chenhLechPhanTram(15, 10), true)).toBe(true);
    expect(bienDongLaTot(chenhLechPhanTram(8, 10), true)).toBe(false);
  });

  it("thẻ 'tăng là xấu' (vd Quá hạn, nếu sau này có kỳ trước): tăng -> xấu, giảm -> tốt", () => {
    expect(bienDongLaTot(chenhLechPhanTram(15, 10), false)).toBe(false);
    expect(bienDongLaTot(chenhLechPhanTram(8, 10), false)).toBe(true);
  });

  it("không có kỳ trước để so (undefined/null) -> không hiện chip", () => {
    expect(bienDongLaTot(null, true)).toBeNull();
    expect(bienDongLaTot(undefined, true)).toBeNull();
  });
});

describe("BB-270: tinhTyLeChot (tiến độ chi nhánh)", () => {
  it("không có bộ ảnh nào đang hoạt động -> null (không chia cho 0)", () => {
    expect(tinhTyLeChot(0, 0)).toBeNull();
  });

  it("có hoạt động, một phần đã chốt -> tỉ lệ đúng", () => {
    expect(tinhTyLeChot(4, 1)).toBe(0.25);
    expect(tinhTyLeChot(2, 2)).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Nhóm 2 — route API, client giả mô phỏng bộ lọc PostgREST thật.
// ---------------------------------------------------------------------------

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/staff", () => ({
  AuthError: class AuthError extends Error {
    code: string;
    constructor(c: string) {
      super(c);
      this.code = c;
    }
  },
  requireStaff: vi.fn(),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

interface HangGia {
  id: string;
  branch_id: string;
  branch_name?: string;
  title: string;
  status: string;
  urgency?: string;
  customer_name?: string;
  due_at?: string | null;
  selected_count?: number;
  included_quota?: number | null;
  updated_at?: string;
  created_at?: string;
}

/** Cắt object `r` xuống đúng các cột trong `colsExpr` ("*" giữ nguyên). */
function chonCot(r: HangGia, colsExpr: string): Partial<HangGia> {
  if (colsExpr.trim() === "*") return r;
  const cots = colsExpr.split(",").map((c) => c.trim());
  const out: Partial<HangGia> = {};
  for (const c of cots) (out as Record<string, unknown>)[c] = (r as unknown as Record<string, unknown>)[c];
  return out;
}

/**
 * Bảng giả — LỌC THẬT trên một mảng trong bộ nhớ, theo đúng ngữ nghĩa các
 * toán tử PostgREST mà route.ts dùng (in/eq/neq/gte/lt/not.ilike/or/limit).
 * Không phải canned data trả nguyên xi bất kể tham số — xem khuôn BB-261.
 */
function taoBang(rowsGoc: HangGia[]) {
  return () => {
    let list = [...rowsGoc];
    let cols = "*";
    let demSo = false;

    const builder = {
      select(colsArg: string, opts?: { count?: string; head?: boolean }) {
        cols = colsArg;
        demSo = !!opts?.count;
        return builder;
      },
      in(col: string, vals: unknown[]) {
        list = list.filter((r) => vals.includes((r as unknown as Record<string, unknown>)[col]));
        return builder;
      },
      eq(col: string, val: unknown) {
        list = list.filter((r) => (r as unknown as Record<string, unknown>)[col] === val);
        return builder;
      },
      neq(col: string, val: unknown) {
        list = list.filter((r) => (r as unknown as Record<string, unknown>)[col] !== val);
        return builder;
      },
      gte(col: string, val: string) {
        list = list.filter((r) => {
          const v = (r as unknown as Record<string, unknown>)[col] as string | undefined;
          return v !== undefined && v !== null && v >= val;
        });
        return builder;
      },
      lt(col: string, val: string) {
        list = list.filter((r) => {
          const v = (r as unknown as Record<string, unknown>)[col] as string | undefined;
          return v !== undefined && v !== null && v < val;
        });
        return builder;
      },
      not(col: string, op: string, val: string) {
        if (op === "ilike") {
          const tienTo = String(val).replace(/%$/, "").toLowerCase();
          list = list.filter((r) => !String((r as unknown as Record<string, unknown>)[col] ?? "").toLowerCase().startsWith(tienTo));
        }
        return builder;
      },
      or(bieuThuc: string) {
        const dieuKien = bieuThuc.split(",").map((phan) => {
          const [col, op, val] = phan.split(".");
          return (r: HangGia) => {
            const v = (r as unknown as Record<string, unknown>)[col as string];
            if (op === "eq") return v === val;
            return false;
          };
        });
        list = list.filter((r) => dieuKien.some((f) => f(r)));
        return builder;
      },
      order() {
        return builder;
      },
      limit(n: number) {
        list = list.slice(0, n);
        return builder;
      },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        const ketQua = demSo
          ? { data: null, count: list.length, error: null }
          : { data: list.map((r) => chonCot(r, cols)), error: null };
        return Promise.resolve(ketQua).then(resolve, reject);
      },
    };
    return builder;
  };
}

function taoAdminGia(bang: {
  galleries: HangGia[];
  v_gallery_progress: HangGia[];
  branches: { id: string; name: string }[];
}) {
  const tuGalleries = taoBang(bang.galleries);
  const tuView = taoBang(bang.v_gallery_progress);
  const tuBranches = taoBang(bang.branches as unknown as HangGia[]);
  return {
    from(ten: string) {
      if (ten === "galleries") return tuGalleries();
      if (ten === "v_gallery_progress") return tuView();
      if (ten === "branches") return tuBranches();
      throw new Error(`bảng không mong đợi: ${ten}`);
    },
  };
}

describe("BB-270: GET /api/admin/dashboard — client giả mô phỏng bộ lọc thật", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("tienDoChiNhanh chỉ gồm chi nhánh nhân viên được xem, và loại bộ ảnh Fixture", async () => {
    const galleries: HangGia[] = [
      // Chi nhánh A — được xem.
      { id: "g1", branch_id: "branch-a", title: "Bộ ảnh nhà Nguyễn Thị Mai", status: "ready" },
      { id: "g2", branch_id: "branch-a", title: "Bộ ảnh nhà Trần Văn Bình", status: "submitted" },
      // Fixture — phải bị loại khỏi MỌI số, kể cả khi trạng thái khớp bộ lọc.
      { id: "g3", branch_id: "branch-a", title: "Fixture BB-270 loại trừ", status: "ready" },
      // Chi nhánh B — KHÔNG được xem (staff.branchIds chỉ có branch-a).
      { id: "g4", branch_id: "branch-b", title: "Bộ ảnh chi nhánh B", status: "ready" },
    ];
    const view: HangGia[] = galleries.map((g) => ({
      ...g,
      urgency: "on_track",
      branch_name: g.branch_id === "branch-a" ? "Chi nhánh A" : "Chi nhánh B",
      customer_name: "Khách giả",
      due_at: null,
      selected_count: 0,
      included_quota: null,
    }));
    const branches = [
      { id: "branch-a", name: "Chi nhánh A" },
      { id: "branch-b", name: "Chi nhánh B" },
    ];

    const adminGia = taoAdminGia({ galleries, v_gallery_progress: view, branches });

    const staffAuth = await import("@/lib/auth/staff");
    vi.mocked(staffAuth.requireStaff).mockResolvedValue({
      staffId: "nv-1",
      role: "cs",
      branchIds: ["branch-a"],
      permissions: quyenCuaVai("cs"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);

    const supaAdmin = await import("@/lib/supabase/admin");
    vi.mocked(supaAdmin.createAdminClient).mockReturnValue(adminGia as unknown as never);

    const { GET } = await import("@/app/api/admin/dashboard/route");
    const res = await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        tienDoChiNhanh: { branchId: string; branchName: string; dangHoatDong: number; daChot: number; tyLeChot: number | null }[];
      };
    };

    const { tienDoChiNhanh } = json.data;
    expect(tienDoChiNhanh.map((c) => c.branchId)).toEqual(["branch-a"]);

    const chiNhanhA = tienDoChiNhanh[0]!;
    // Đang hoạt động: g1 (ready) + g2 (submitted) = 2. g3 (Fixture) và g4
    // (chi nhánh B) KHÔNG được tính — nếu bị tính, con số này sẽ là 3 hoặc 4.
    expect(chiNhanhA.dangHoatDong).toBe(2);
    // Đã chốt: chỉ g2 (submitted).
    expect(chiNhanhA.daChot).toBe(1);
    expect(chiNhanhA.tyLeChot).toBe(0.5);
  });

  it("chi nhánh không có bộ ảnh nào đang hoạt động -> tyLeChot null, không chia cho 0", async () => {
    const galleries: HangGia[] = [
      { id: "g1", branch_id: "branch-a", title: "Bộ ảnh đã giao xong", status: "delivered" },
    ];
    const view: HangGia[] = galleries.map((g) => ({
      ...g,
      urgency: "no_due",
      branch_name: "Chi nhánh A",
      customer_name: "Khách giả",
      due_at: null,
      selected_count: 0,
      included_quota: null,
    }));
    const branches = [{ id: "branch-a", name: "Chi nhánh A" }];

    const adminGia = taoAdminGia({ galleries, v_gallery_progress: view, branches });

    const staffAuth = await import("@/lib/auth/staff");
    vi.mocked(staffAuth.requireStaff).mockResolvedValue({
      staffId: "nv-1",
      role: "cs",
      branchIds: ["branch-a"],
      permissions: quyenCuaVai("cs"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);

    const supaAdmin = await import("@/lib/supabase/admin");
    vi.mocked(supaAdmin.createAdminClient).mockReturnValue(adminGia as unknown as never);

    const { GET } = await import("@/app/api/admin/dashboard/route");
    const res = await GET(new Request("http://localhost/api/admin/dashboard"));
    const json = (await res.json()) as {
      data: { tienDoChiNhanh: { dangHoatDong: number; daChot: number; tyLeChot: number | null }[] };
    };
    expect(json.data.tienDoChiNhanh[0]).toMatchObject({ dangHoatDong: 0, daChot: 0, tyLeChot: null });
  });
});

// ---------------------------------------------------------------------------
// Nhóm 3 — client luôn lỗi (khuôn BB-060): số mới cũng phải ném, không bịa 0.
// ---------------------------------------------------------------------------

function clientLuonHong() {
  const ketQua = { data: null, count: null, error: { message: "quyen doc bi tu choi" } };
  const chuoi: Record<string, unknown> = {};
  for (const ten of ["select", "in", "eq", "neq", "not", "gte", "lt", "or", "order", "limit"]) {
    chuoi[ten] = vi.fn(() => chuoi);
  }
  chuoi.then = (giai: (v: unknown) => unknown) => Promise.resolve(ketQua).then(giai);
  return { from: vi.fn(() => chuoi) };
}

describe("BB-270: truy vấn MỚI (kỳ trước, tiến độ chi nhánh) hỏng thì phải báo lỗi, không bịa 0", () => {
  beforeEach(async () => {
    const supaAdmin = await import("@/lib/supabase/admin");
    vi.mocked(supaAdmin.createAdminClient).mockReturnValue(clientLuonHong() as unknown as never);
    const staffAuth = await import("@/lib/auth/staff");
    vi.mocked(staffAuth.requireStaff).mockResolvedValue({
      staffId: "nv-1",
      role: "cs",
      branchIds: ["branch-a"],
      permissions: quyenCuaVai("cs"),
    } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
  });

  it("trả 500, thân không có 'data' — không một con số nào là số bịa", async () => {
    const { GET } = await import("@/app/api/admin/dashboard/route");
    const res = await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(res.status).toBe(500);
    const json = (await res.json()) as { data?: unknown };
    expect(json.data).toBeUndefined();
  });
});
