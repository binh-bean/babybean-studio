/**
 * BB-264 — "Hiệu suất nhân viên": hàm so sánh thuần (xếp hạng/tỉ trọng/chênh
 * lệch kỳ trước), bộ lọc nhân viên thử, và quyền `reports:operations`.
 *
 * ---------------------------------------------------------------------------
 * Vì sao không seed dữ liệu vận hành thật ở tệp này
 * ---------------------------------------------------------------------------
 * `route.test.ts` (BB-260, dùng chung cho mọi báo cáo) đã seed bộ ảnh Fixture
 * trong ô thời gian 2099 cô lập và kiểm CHÊNH LỆCH = 0 khi thêm dữ liệu — đúng
 * khuôn AGENTS.md §5a. Tệp này chỉ kiểm phần LOGIC RIÊNG của báo cáo này mà
 * `route.test.ts` không đụng tới: hàm so sánh thuần (`so-sanh-nhan-vien.ts`,
 * dữ liệu truyền tay — không đọc DB, không đọc mã nguồn), và bộ lọc nhân viên
 * thử (`laNhanVienThu`).
 */

import { describe, it, expect, vi } from "vitest";
import { phienGiaLap } from "../../fixtures/phien-nhan-su";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET } from "@/app/api/admin/bao-cao/[ma]/route";
import { soSanhNhanVien, tongGiaTri, type DiemNhanVien } from "@/lib/bao-cao/so-sanh-nhan-vien";
import { laNhanVienThu } from "@/lib/bao-cao/cac-bao-cao/hieu-suat-nhan-vien";

describe("BB-264: soSanhNhanVien — xếp hạng, tỉ trọng %, chênh lệch kỳ trước", () => {
  it("xếp hạng giảm dần theo giá trị, hạng 1 là giá trị cao nhất", () => {
    const diem: DiemNhanVien[] = [
      { staffId: "a", ten: "A", giaTri: 10 },
      { staffId: "b", ten: "B", giaTri: 30 },
      { staffId: "c", ten: "C", giaTri: 20 },
    ];
    const ketQua = soSanhNhanVien(diem, new Map());
    expect(ketQua.map((k) => k.staffId)).toEqual(["b", "c", "a"]);
    expect(ketQua.map((k) => k.xepHang)).toEqual([1, 2, 3]);
  });

  it("đồng hạng: hai người bằng giá trị nhận cùng số hạng, người kế nhảy đúng số người đứng trước", () => {
    const diem: DiemNhanVien[] = [
      { staffId: "a", ten: "A", giaTri: 20 },
      { staffId: "b", ten: "B", giaTri: 20 },
      { staffId: "c", ten: "C", giaTri: 5 },
    ];
    const ketQua = soSanhNhanVien(diem, new Map());
    const hangA = ketQua.find((k) => k.staffId === "a")?.xepHang;
    const hangB = ketQua.find((k) => k.staffId === "b")?.xepHang;
    const hangC = ketQua.find((k) => k.staffId === "c")?.xepHang;
    expect(hangA).toBe(1);
    expect(hangB).toBe(1);
    expect(hangC).toBe(3); // không phải 2 — hai người đã đứng trước ở hạng 1
  });

  it("tỉ trọng % trên tổng cộng lại đúng 100 khi tổng > 0", () => {
    const diem: DiemNhanVien[] = [
      { staffId: "a", ten: "A", giaTri: 25 },
      { staffId: "b", ten: "B", giaTri: 75 },
    ];
    const ketQua = soSanhNhanVien(diem, new Map());
    const a = ketQua.find((k) => k.staffId === "a");
    const b = ketQua.find((k) => k.staffId === "b");
    expect(a?.tiTrongPhanTram).toBe(25);
    expect(b?.tiTrongPhanTram).toBe(75);
  });

  it("chia 0: mọi giá trị đều 0 -> tỉ trọng null, không NaN hay Infinity", () => {
    const diem: DiemNhanVien[] = [
      { staffId: "a", ten: "A", giaTri: 0 },
      { staffId: "b", ten: "B", giaTri: 0 },
    ];
    const ketQua = soSanhNhanVien(diem, new Map());
    for (const k of ketQua) expect(k.tiTrongPhanTram).toBeNull();
  });

  it("nhân viên không có trong map kỳ trước -> kỳ trước = 0, không phải bỏ qua", () => {
    const diem: DiemNhanVien[] = [{ staffId: "moi", ten: "Nhân viên mới", giaTri: 10 }];
    const ketQua = soSanhNhanVien(diem, new Map());
    expect(ketQua[0]?.kyTruoc).toBe(0);
    // kỳ trước = 0, kỳ này > 0 -> chênh lệch không tính được (chia 0), theo `chenhLechPhanTram`.
    expect(ketQua[0]?.chenhLechPhanTram).toBeNull();
  });

  it("chênh lệch kỳ trước tính đúng khi kỳ trước > 0", () => {
    const diem: DiemNhanVien[] = [{ staffId: "a", ten: "A", giaTri: 15 }];
    const ketQua = soSanhNhanVien(diem, new Map([["a", 10]]));
    expect(ketQua[0]?.chenhLechPhanTram).toBeCloseTo(50, 5);
  });

  it("tongGiaTri cộng đúng tổng một danh sách rỗng và không rỗng", () => {
    expect(tongGiaTri([])).toBe(0);
    expect(tongGiaTri([{ giaTri: 3 }, { giaTri: 4 }])).toBe(7);
  });
});

describe("BB-264: laNhanVienThu — nhân viên thử bị loại khỏi báo cáo", () => {
  it("tên bắt đầu bằng \"Fixture\" -> bị loại", () => {
    expect(laNhanVienThu("Fixture BB-264 NV", "test_bb264_abc@demo.babybean.vn")).toBe(true);
  });

  it("email @demo.babybean.vn -> bị loại dù tên không bắt đầu bằng Fixture", () => {
    expect(laNhanVienThu("Nguyễn Văn Test", "test_bb264_xyz@demo.babybean.vn")).toBe(true);
  });

  it("nhân viên thật (tên thường, email thật) -> KHÔNG bị loại", () => {
    expect(laNhanVienThu("Nguyễn Thị Mai", "mai.nguyen@babybean.vn")).toBe(false);
  });

  it("chỉ tên bắt đầu bằng Fixture, email thật -> vẫn bị loại (một trong hai điều kiện là đủ)", () => {
    expect(laNhanVienThu("Fixture nhưng email thường", "nhanvien@babybean.vn")).toBe(true);
  });
});

describe("BB-264: GET /api/admin/bao-cao/hieu-suat-nhan-vien — quyền reports:operations", () => {
  it("nhân viên không có reports:operations -> 403", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("photoshop_ctv", []));

    const res = await GET(new Request("http://localhost/api/admin/bao-cao/hieu-suat-nhan-vien"), {
      params: Promise.resolve({ ma: "hieu-suat-nhan-vien" }),
    });
    expect(res.status).toBe(403);
  });
});
