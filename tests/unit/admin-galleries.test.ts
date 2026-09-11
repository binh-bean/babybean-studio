import { describe, it, expect, vi, beforeAll } from "vitest";

vi.mock("server-only", () => ({}));

import { GET } from "@/app/api/admin/galleries/route";
import * as staffAuth from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

describe("GET /api/admin/galleries (BB-024)", () => {
  let sampleBranchId: string;

  beforeAll(async () => {
    const admin = createAdminClient();
    const { data: branch } = await admin.from("branches").select("id").limit(1).single();
    if (!branch) throw new Error("Cần ít nhất một chi nhánh trong database");
    sampleBranchId = branch.id;
  });

  it("1. Yêu cầu đăng nhập nhân viên (UNAUTHENTICATED khi chưa đăng nhập)", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockRejectedValueOnce(
      new staffAuth.AuthError("UNAUTHENTICATED", "Vui lòng đăng nhập lại")
    );

    const req = new Request("http://localhost:3000/api/admin/galleries");
    const res = await GET(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("UNAUTHENTICATED");
  });

  it("2. Trả về cấu trúc danh sách hợp lệ kèm khối đếm status cho kanban", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: "00000000-0000-0000-0000-000000000001",
      role: "owner",
      branchIds: [sampleBranchId],
    });

    const req = new Request("http://localhost:3000/api/admin/galleries");
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.data).toBeDefined();
    expect(Array.isArray(body.data.items)).toBe(true);
    expect(body.data.counts).toBeDefined();
    expect(typeof body.data.counts.all).toBe("number");
    expect(typeof body.data.counts.in_review).toBe("number");
    expect(typeof body.data.counts.submitted).toBe("number");
  });

  it("3. Mỗi album trả đủ các cột nghiệp vụ cần thiết (tiến độ N/M, hạn chốt, lần chọn gần nhất)", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: "00000000-0000-0000-0000-000000000001",
      role: "owner",
      branchIds: [sampleBranchId],
    });

    const req = new Request("http://localhost:3000/api/admin/galleries?limit=10");
    const res = await GET(req);
    const body = await res.json();

    expect(body.data.items.length).toBeGreaterThan(0);
    const item = body.data.items[0];

    // Các trường bắt buộc
    expect(item).toHaveProperty("id");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("babyName");
    expect(item).toHaveProperty("customerName");
    expect(item).toHaveProperty("customerPhone");
    expect(item).toHaveProperty("branch");
    expect(item.branch).toHaveProperty("id");
    expect(item.branch).toHaveProperty("name");
    expect(item).toHaveProperty("totalPhotos");
    expect(item).toHaveProperty("selectedCount");
    expect(item).toHaveProperty("includedQuota");
    expect(item).toHaveProperty("progress");
    expect(item).toHaveProperty("dueAt");
    expect(item).toHaveProperty("status");
    expect(item).toHaveProperty("lastSelectedAt");
    expect(item).toHaveProperty("urgency");
  });

  it("4. Lọc theo trạng thái status[] (chỉ trả về album theo status nhưng khối counts vẫn đầy đủ)", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: "00000000-0000-0000-0000-000000000001",
      role: "owner",
      branchIds: [sampleBranchId],
    });

    const req = new Request("http://localhost:3000/api/admin/galleries?status=submitted");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    for (const item of body.data.items) {
      expect(item.status).toBe("submitted");
    }
    // Khối counts vẫn đếm tổng thể để dựng kanban
    expect(body.data.counts.all).toBeGreaterThanOrEqual(body.data.items.length);
  });

  it("5. Tìm kiếm theo tên bé hoặc số điện thoại khách", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: "00000000-0000-0000-0000-000000000001",
      role: "owner",
      branchIds: [sampleBranchId],
    });

    // Tìm kiếm với SĐT mẫu '0912'
    const req = new Request("http://localhost:3000/api/admin/galleries?q=0912");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.items.length).toBeGreaterThan(0);
    for (const item of body.data.items) {
      const match =
        item.customerPhone.includes("0912") ||
        (item.babyName && item.babyName.includes("0912")) ||
        item.customerName.includes("0912");
      expect(match).toBe(true);
    }
  });

  it("6. Chặn trần phân trang ở backend (yêu cầu 1000 chỉ trả tối đa trần 200)", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: "00000000-0000-0000-0000-000000000001",
      role: "owner",
      branchIds: [sampleBranchId],
    });

    // Client gửi limit vượt 200 -> Zod báo INVALID_INPUT
    const req = new Request("http://localhost:3000/api/admin/galleries?limit=1000");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_INPUT");
  });

  it("7. Phân quyền chi nhánh: nhân viên không được truy cập chi nhánh ngoài quyền", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValueOnce({
      staffId: "00000000-0000-0000-0000-000000000002",
      role: "cs",
      branchIds: ["22222222-2222-2222-2222-222222222222"], // chỉ có quyền chi nhánh 2
    });

    // CS yêu cầu lọc chi nhánh 1 -> FORBIDDEN
    const req = new Request(
      "http://localhost:3000/api/admin/galleries?branchId=11111111-1111-1111-1111-111111111111"
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
