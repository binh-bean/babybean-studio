/**
 * BB-060 — truy vấn hỏng thì bảng điều khiển phải BÁO, không được hiện số 0.
 *
 * Vì sao ca này tồn tại:
 *
 * Bản đầu của đường `/api/admin/dashboard` bỏ qua `error` ở cả tám truy vấn.
 * Hậu quả không phải một trang lỗi — mà là một bảng điều khiển hiện "0 album
 * quá hạn" trông y như thật. Chủ studio đọc con số đó rồi yên tâm, trong khi
 * câu hỏi kia chưa từng chạy được.
 *
 * Phép thử quét mã của BB-190 không bắt được: nó soát đường GHI, đây là đường
 * ĐỌC. Nên phải có một ca canh thẳng vào hành vi.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

import { quyenCuaVai } from "../fixtures/phien-nhan-su";
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
    staffId: "staff-gia-lap",
    role: "cs",
    branchIds: ["11111111-1111-1111-1111-111111111111"], permissions: quyenCuaVai("cs"), }),
  requireRole: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { GET } from "@/app/api/admin/dashboard/route";
import { createAdminClient } from "@/lib/supabase/admin";

/** Mọi truy vấn đều trả lỗi, giống lúc thiếu quyền đọc hoặc mất khung nhìn. */
function clientLuonHong() {
  const ketQua = { data: null, count: null, error: { message: "quyen doc bi tu choi" } };
  const chuoi: Record<string, unknown> = {};
  for (const ten of ["select", "in", "eq", "gte", "lt", "or", "order", "limit", "not", "neq"]) {
    chuoi[ten] = vi.fn(() => chuoi);
  }
  // Mắt xích cuối được `await`, nên chuỗi phải là một thenable.
  chuoi.then = (giai: (v: unknown) => unknown) => Promise.resolve(ketQua).then(giai);
  return { from: vi.fn(() => chuoi) };
}

describe("BB-060: truy vấn hỏng thì không được bịa số 0", () => {
  beforeEach(() => {
    vi.mocked(createAdminClient).mockReturnValue(clientLuonHong() as unknown as never);
  });

  it("trả 500 chứ không trả một bảng toàn số 0", async () => {
    const res = await GET(new Request("http://localhost/api/admin/dashboard"));

    expect(res.status).toBe(500);

    const json = (await res.json()) as { data?: { stats?: Record<string, number> } };
    // Không được có một con số nào trong thân trả về: số 0 ở đây là số bịa.
    expect(json.data?.stats).toBeUndefined();
  });
});
