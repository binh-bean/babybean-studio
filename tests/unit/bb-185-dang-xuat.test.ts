/**
 * BB-185 — nút Đăng xuất.
 *
 * Quét cả dự án 18.09.2026: không có một đường đăng xuất nào, và không nút nào
 * gọi tới. Ba chi nhánh đều dùng máy chung ở quầy, nên ca sau ngồi vào là thừa
 * nguyên phiên của ca trước — nhật ký ghi sai tên, quyền hạn sai người.
 *
 * Ba ca dưới đây khoá ba quyết định, và mỗi quyết định đều có lý do cụ thể.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const cookieStore = {
  daXoa: [] as string[],
  getAll: () => [],
  get: () => undefined,
  set: () => {},
  delete(ten: string) {
    cookieStore.daXoa.push(ten);
  },
};

const signOut = vi.fn(async () => ({ error: null }));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));
vi.mock("@/lib/supabase/server", () => ({
  createServerClient: async () => ({ auth: { signOut } }),
}));

import { POST } from "@/app/api/auth/logout/route";

beforeEach(() => {
  cookieStore.daXoa = [];
  signOut.mockClear();
});

describe("BB-185 — đăng xuất", () => {
  it("xoá phiên trên chính máy này, KHÔNG đá người ta khỏi mọi máy", async () => {
    const res = await POST();
    expect(res.status).toBe(200);

    // `global` sẽ huỷ phiên trên cả điện thoại riêng của người đó giữa lúc họ
    // đang làm việc. Ai bị một lần thì thôi bấm nút này.
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("xoá luôn phiên KHÁCH còn sót trên máy quầy", async () => {
    await POST();

    // CSKH hay mở link của khách ngay trên máy quầy để xem ba mẹ thấy gì. Bỏ
    // lại cookie đó là máy quầy vẫn mở sẵn album nhà khách cho người kế tiếp.
    expect(cookieStore.daXoa).toContain("bb_gs");
  });

  it("phiên đã hỏng thì VẪN thoát được", async () => {
    // Đây là chốt dễ mất nhất. Thêm một dòng requireStaff() ở đầu đường này
    // trông rất hợp lý, nhưng nó làm nút Đăng xuất chết đúng vào lúc cần nhất:
    // tài khoản vừa bị tắt, hồ sơ đã xoá, hay cookie hỏng — người ngồi đó
    // không thoát ra được, và cũng không đăng nhập bằng tài khoản khác được.
    signOut.mockRejectedValueOnce(new Error("phiên hỏng"));

    const res = await POST();

    // 200, không phải 500: màn gọi phải đưa người ta về /login chứ không hiện
    // thông báo lỗi rồi để họ đứng dậy, tưởng mình đã thoát.
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.daThoat).toBe(true);
    // Nói thật là chưa sạch hẳn, thay vì báo thành công trơn.
    expect(json.data.daSachHan).toBe(false);
    // Và phiên khách VẪN phải được xoá dù signOut hỏng.
    expect(cookieStore.daXoa).toContain("bb_gs");
  });
});
