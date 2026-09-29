/**
 * BB-280 — logic sắp/lọc menu quản trị (bốn nhóm, đúng thứ tự, ai xem được gì).
 *
 * Kiểm bằng ĐƠN VỊ trên dữ liệu thuần (`navGroups`, `mucDuocXem`) thay vì
 * dựng tài khoản thử qua trình duyệt cho mọi vai: dựng tài khoản `owner` +
 * `photoshop_ctv` thật đã có trong `tests/e2e/bb-280-quan-tri.spec.ts`, còn ca
 * "nhóm rỗng thì ẩn tiêu đề nhóm" cần một vai KHÔNG tồn tại thật (ẩn HẾT mục
 * trong một nhóm) — dựng tài khoản thật cho một vai không ai dùng là phí,
 * nên kiểm thẳng hàm lọc.
 *
 * AGENTS.md §5a: mỗi test ở đây phải ĐỎ nếu bỏ đúng dòng logic nó canh —
 * không đọc mã nguồn làm dữ liệu thử, không so chuỗi có trong mọi HTML.
 */
import { describe, it, expect } from "vitest";
import { navGroups, mucDuocXem, demSoCanXuLy } from "@/components/features/admin/admin-sidebar";

describe("BB-280: navGroups — bốn nhóm, đúng thứ tự", () => {
  it("có đúng bốn nhóm, theo đúng thứ tự Tổng quan/Vận hành/Báo cáo/Hệ thống", () => {
    expect(navGroups.map((g) => g.label)).toEqual(["Tổng quan", "Vận hành", "Báo cáo", "Hệ thống"]);
  });

  it("Vận hành có đúng ba mục: Bộ ảnh, Khách hàng, Việc cần xử lý", () => {
    const vanHanh = navGroups.find((g) => g.key === "van-hanh")!;
    expect(vanHanh.items.map((i) => i.name)).toEqual(["Quản lý bộ ảnh", "Khách hàng", "Việc cần xử lý"]);
  });

  it("Hệ thống gộp Nhân sự & vai trò thành MỘT mục trỏ về /admin/staff (không còn /admin/roles riêng)", () => {
    const heThong = navGroups.find((g) => g.key === "he-thong")!;
    const tenMuc = heThong.items.map((i) => i.name);
    expect(tenMuc).toContain("Nhân sự & vai trò");
    expect(tenMuc).not.toContain("Vai trò");
    expect(tenMuc).not.toContain("Nhân sự");
    const mucNhanSu = heThong.items.find((i) => i.name === "Nhân sự & vai trò")!;
    expect(mucNhanSu.href).toBe("/admin/staff");
  });

  it("Việc cần xử lý trỏ về /admin/viec-can-xu-ly, không còn ba mục báo cáo lỗi riêng", () => {
    const tatCaMuc = navGroups.flatMap((g) => g.items.map((i) => i.name));
    expect(tatCaMuc).toContain("Việc cần xử lý");
    expect(tatCaMuc).not.toContain("Bộ ảnh lỗi tải");
    expect(tatCaMuc).not.toContain("Link sắp hết hạn");
    expect(tatCaMuc).not.toContain("Ảnh vượt hạn mức");
    const mucViecCanXuLy = navGroups.flatMap((g) => g.items).find((i) => i.name === "Việc cần xử lý")!;
    expect(mucViecCanXuLy.href).toBe("/admin/viec-can-xu-ly");
  });
});

describe("BB-280: mucDuocXem — ai xem được gì", () => {
  const mucOwnerOnly = {
    name: "Nhân sự & vai trò",
    href: "/admin/staff",
    icon: (() => null) as never,
    ready: true,
    ownerOnly: true,
  };
  const mucHiddenChoCtv = {
    name: "Nhật ký thao tác",
    href: "/admin/reports/nhat-ky",
    icon: (() => null) as never,
    ready: true,
    hiddenForRoles: ["photoshop_ctv"],
  };
  const mucAiCungThay = {
    name: "Chi nhánh",
    href: "/admin/branches",
    icon: (() => null) as never,
    ready: true,
  };

  it("ownerOnly: ẩn với vai thường, hiện với owner/admin", () => {
    expect(mucDuocXem(mucOwnerOnly, "photoshop_ctv", false)).toBe(false);
    expect(mucDuocXem(mucOwnerOnly, "cs", false)).toBe(false);
    expect(mucDuocXem(mucOwnerOnly, "owner", true)).toBe(true);
    expect(mucDuocXem(mucOwnerOnly, "admin", true)).toBe(true);
  });

  it("hiddenForRoles: ẩn ĐÚNG vai bị liệt kê, hiện với vai khác", () => {
    expect(mucDuocXem(mucHiddenChoCtv, "photoshop_ctv", false)).toBe(false);
    expect(mucDuocXem(mucHiddenChoCtv, "cs", false)).toBe(true);
    expect(mucDuocXem(mucHiddenChoCtv, undefined, false)).toBe(true);
  });

  it("mục không giới hạn: mọi vai đều thấy", () => {
    expect(mucDuocXem(mucAiCungThay, "photoshop_ctv", false)).toBe(true);
    expect(mucDuocXem(mucAiCungThay, "owner", true)).toBe(true);
  });

  it("một nhóm mà MỌI mục đều bị ẩn với một vai thì lọc còn lại mảng rỗng — cơ sở của luật 'ẩn tiêu đề nhóm rỗng' trong admin-sidebar.tsx", () => {
    const nhomGiaLap = [mucOwnerOnly, mucHiddenChoCtv];
    const conLai = nhomGiaLap.filter((item) => mucDuocXem(item, "photoshop_ctv", false));
    expect(conLai).toHaveLength(0);
  });
});

describe("BB-283: demSoCanXuLy — số huy hiệu cạnh 'Việc cần xử lý'", () => {
  it("cộng ĐÚNG hai mảng của GET /api/admin/can-xu-ly (driveChuaChiaSe + chuaCoAnh)", () => {
    expect(
      demSoCanXuLy({
        driveChuaChiaSe: [{ id: "a" }, { id: "b" }],
        chuaCoAnh: [{ id: "c" }],
      })
    ).toBe(3);
  });

  it("cả hai mảng rỗng thì trả 0 — không hiện huy hiệu", () => {
    expect(demSoCanXuLy({ driveChuaChiaSe: [], chuaCoAnh: [] })).toBe(0);
  });

  it("thiếu một trong hai khoá (hỏng dữ liệu) thì coi khoá đó là 0, không throw", () => {
    expect(demSoCanXuLy({ driveChuaChiaSe: [{ id: "a" }] })).toBe(1);
    expect(demSoCanXuLy({ chuaCoAnh: [{ id: "a" }, { id: "b" }] })).toBe(2);
  });

  it("data null/undefined (API lỗi) thì trả 0, không throw — huy hiệu ẩn thay vì sập trang", () => {
    expect(demSoCanXuLy(null)).toBe(0);
    expect(demSoCanXuLy(undefined)).toBe(0);
  });
});
