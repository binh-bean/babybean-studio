import { describe, it, expect, vi } from "vitest";
import { PATCH } from "@/app/api/admin/staff/[id]/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { NextRequest } from "next/server";

vi.mock("@/lib/supabase/admin", () => {
  return {
    createAdminClient: vi.fn(),
  };
});
/**
 * Nhà máy của `vi.mock` được kéo lên đầu tệp, nên KHÔNG gọi được hàm nhập từ
 * tệp khác ở trong đó — Vitest ném "error when mocking a module". Vì vậy bộ
 * quyền ở đây viết thẳng, không gọi `quyenCuaVai`.
 *
 * Ca này chỉ kiểm đường ghi có nuốt lỗi hay không, nên chỉ cần đúng một quyền
 * mở được cửa `staff:manage`.
 */
vi.mock("@/lib/auth/staff", () => ({
  AuthError: class AuthError extends Error { code: string; constructor(c: string) { super(); this.code = c; } },
  requirePermission: vi.fn(),
  requireStaff: vi
    .fn()
    .mockResolvedValue({ staffId: "staff-1", role: "owner", permissions: ["staff:manage"], branchIds: [] }),
}));

describe("Ca bắt buộc BB-190", () => {
  it("staff_branches xoá trượt thì phải báo lỗi", async () => {
     const mockAdmin = {
       from: vi.fn().mockImplementation((table) => {
         if (table === "staff_profiles") {
            return {
               select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "user-1", role: "cs", is_active: true } }) }) }),
               update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
            }
         }
         if (table === "staff_branches") {
            return {
               delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error("Loi xoa") }) }),
               // Phải có `insert`, dù ca này không mong nó chạy tới.
               //
               // Bản đầu thiếu nó, và vì thế phép thử XANH cả khi bỏ bản vá đi:
               // bỏ vá thì mã chạy tiếp tới `insert`, nổ TypeError "insert is not
               // a function", rơi vào catch, vẫn ra 500 INTERNAL. Đúng con số mà
               // ca này chờ — nhưng vì một lý do khác hẳn.
               //
               // Kiểm ngược 21/09/2026: có dòng này thì bỏ bản vá là ca ĐỎ với
               // `expected 200 to be 500`. Con số 200 đó mới là hậu quả thật:
               // đường sửa nhân sự báo "đã cập nhật" trong khi quyền chi nhánh
               // cũ chưa hề bị gỡ.
               insert: vi.fn().mockResolvedValue({ error: null })
            }
         }
         return {
            insert: vi.fn().mockResolvedValue({ error: null })
         }
       })
     };
     vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as never);

     const req = new NextRequest("http://localhost/api/admin/staff/user-1", {
       method: "PATCH",
       body: JSON.stringify({ role: "cs", branchIds: ["00000000-0000-0000-0000-000000000002"] })
     });
     
     const res = await PATCH(req, { params: Promise.resolve({ id: "user-1" }) } as unknown as never);
     const data = await res.json();
      expect(res.status).toBe(500);
     expect(data.error.code).toBe("INTERNAL");
  });

  it("activity_logs ghi trượt không báo lỗi", async () => {
     const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
     const mockAdmin = {
       from: vi.fn().mockImplementation((table) => {
         if (table === "staff_profiles") {
            return {
               select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { id: "user-1", role: "cs", is_active: true } }) }) }),
               update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
            }
         }
         if (table === "staff_branches") {
            return {
               delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
               insert: vi.fn().mockResolvedValue({ error: null })
            }
         }
         if (table === "activity_logs") {
            return {
               insert: vi.fn().mockResolvedValue({ error: new Error("Loi ghi log") })
            }
         }
       })
     };
     vi.mocked(createAdminClient).mockReturnValue(mockAdmin as unknown as never);

     const req = new NextRequest("http://localhost/api/admin/staff/user-1", {
       method: "PATCH",
       body: JSON.stringify({ role: "cs", branchIds: ["00000000-0000-0000-0000-000000000002"] })
     });
     
     const res = await PATCH(req, { params: Promise.resolve({ id: "user-1" }) } as unknown as never);
      expect(res.status).toBe(200);
     expect(consoleSpy).toHaveBeenCalledWith("[activity_logs] Ghi hụt:", expect.any(Error));
     consoleSpy.mockRestore();
  });
});
