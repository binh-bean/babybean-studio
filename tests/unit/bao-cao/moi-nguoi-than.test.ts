/**
 * BB-372 — báo cáo "Mời người thân": hàm đếm thuần (không đụng cơ sở dữ liệu).
 *
 * Ba con số chủ studio hỏi: số nhà có mời người thân, số người được mời đã mở, số yêu cầu mua
 * thêm đến từ người được mời. Phần đọc dữ liệu + loại Fixture được canh ở
 * tests/security/bb-372-link-moi-nguoi-than.test.ts.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { tinhMoiNguoiThan, moiNguoiThan } from "@/lib/bao-cao/cac-bao-cao/moi-nguoi-than";
import { layBaoCao, baoCaoTheoQuyen } from "@/lib/bao-cao/dang-ky";

describe("BB-372: tinhMoiNguoiThan", () => {
  const link = (linkId: string, customerId: string | null, branchId: string, soLanMo: number) => ({ linkId, customerId, branchId, soLanMo });

  it("đếm NHÀ (không phải link): hai link của cùng một khách là một nhà", () => {
    const tk = tinhMoiNguoiThan(
      [link("l1", "k1", "b1", 0), link("l2", "k1", "b1", 3), link("l3", "k2", "b1", 0)],
      [],
      new Set(["l1", "l2", "l3"]),
    );
    expect(tk.soNhaCoMoi).toBe(2);
    expect(tk.soLinkMoi).toBe(3);
  });

  it("'đã mở' đếm LINK có lượt mở > 0, không đếm lượt", () => {
    const tk = tinhMoiNguoiThan([link("l1", "k1", "b1", 0), link("l2", "k1", "b1", 9), link("l3", "k2", "b1", 1)], [], new Set());
    expect(tk.soNguoiDaMo).toBe(2);
  });

  it("yêu cầu mua thêm: chỉ tính yêu cầu có share_link_id là link mời; yêu cầu của ba mẹ (không link) và link lạ bị bỏ", () => {
    const tk = tinhMoiNguoiThan(
      [],
      [
        { linkId: "l1", branchId: "b1" }, // người được mời
        { linkId: "l1", branchId: "b1" },
        { linkId: null, branchId: "b1" }, // ba mẹ
        { linkId: "owner-link", branchId: "b1" }, // link không phải viewer
      ],
      new Set(["l1"]),
    );
    expect(tk.soYeuCau).toBe(2);
  });

  it("tách theo chi nhánh, rỗng thì ra 0 (không NaN, không ném)", () => {
    const tk = tinhMoiNguoiThan(
      [link("l1", "k1", "b1", 1), link("l2", "k2", "b2", 0)],
      [{ linkId: "l2", branchId: "b2" }],
      new Set(["l1", "l2"]),
    );
    expect(tk.theoChiNhanh.get("b1")).toMatchObject({ link: 1, daMo: 1, yeuCau: 0 });
    expect(tk.theoChiNhanh.get("b2")).toMatchObject({ link: 1, daMo: 0, yeuCau: 1 });
    expect(tk.theoChiNhanh.get("b1")!.nha.size).toBe(1);
    const rong = tinhMoiNguoiThan([], [], new Set());
    expect([rong.soNhaCoMoi, rong.soLinkMoi, rong.soNguoiDaMo, rong.soYeuCau]).toEqual([0, 0, 0, 0]);
  });
});

describe("BB-372: báo cáo đã đăng ký trong khung BB-260", () => {
  it("có trong sổ đăng ký, quyền vận hành, nhóm vận hành", () => {
    expect(layBaoCao("moi-nguoi-than")).toBe(moiNguoiThan);
    expect(moiNguoiThan.quyen).toBe("reports:operations");
    expect(baoCaoTheoQuyen(["reports:operations"]).map((b) => b.ma)).toContain("moi-nguoi-than");
    expect(baoCaoTheoQuyen(["reports:financial"]).map((b) => b.ma)).not.toContain("moi-nguoi-than");
  });
});
