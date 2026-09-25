import { describe, it, expect } from "vitest";
import { tranhHanhTrinh, buocHanhTrinh } from "../../src/components/features/gallery/hanh-trinh";

describe("BB-225 Hanh trinh", () => {
  it("tra ve tranh chua-co-anh khi photoCount === 0", () => {
    expect(tranhHanhTrinh("ready", null, 0)).toBe("chua-co-anh");
    expect(tranhHanhTrinh("in_retouch", 2, 0)).toBe("chua-co-anh");
  });

  it("tra ve null khi status la ready hoac in_review (khong hien the)", () => {
    expect(tranhHanhTrinh("ready", null, 10)).toBe(null);
    expect(tranhHanhTrinh("in_review", null, 10)).toBe(null);
  });

  it("chot thanh cong (submitted)", () => {
    expect(tranhHanhTrinh("submitted", null, 10)).toBe("chot-thanh-cong");
    expect(buocHanhTrinh("submitted", null).hienTai).toBe(1);
  });

  it("giai doan null ma in_retouch -> mac dinh", () => {
    expect(tranhHanhTrinh("in_retouch", null, 10)).toBe("tien-do-chinh-sua");
    expect(buocHanhTrinh("in_retouch", null).hienTai).toBe(1);
  });

  it("tien-do-ghi-nhan (giaiDoan = 2)", () => {
    expect(tranhHanhTrinh("in_retouch", 2, 10)).toBe("tien-do-ghi-nhan");
    expect(buocHanhTrinh("in_retouch", 2).hienTai).toBe(1);
  });

  it("tien-do-chinh-sua (giaiDoan = 3, 4, 6)", () => {
    expect(tranhHanhTrinh("in_retouch", 3, 10)).toBe("tien-do-chinh-sua");
    expect(tranhHanhTrinh("in_retouch", 4, 10)).toBe("tien-do-chinh-sua");
    expect(tranhHanhTrinh("in_retouch", 6, 10)).toBe("tien-do-chinh-sua");
    expect(buocHanhTrinh("in_retouch", 6).hienTai).toBe(1);
  });

  it("tien-do-duyet (giaiDoan = 5, 7 hoac status = awaiting_approval)", () => {
    expect(tranhHanhTrinh("in_retouch", 5, 10)).toBe("tien-do-duyet");
    expect(tranhHanhTrinh("in_retouch", 7, 10)).toBe("tien-do-duyet");
    expect(buocHanhTrinh("in_retouch", 7).hienTai).toBe(2);

    // status awaiting_approval ghi de
    expect(tranhHanhTrinh("awaiting_approval", 3, 10)).toBe("tien-do-duyet");
    expect(buocHanhTrinh("awaiting_approval", 3).hienTai).toBe(2);
  });

  it("tien-do-in (giaiDoan = 8)", () => {
    expect(tranhHanhTrinh("approved", 8, 10)).toBe("tien-do-in");
    expect(buocHanhTrinh("approved", 8).hienTai).toBe(3);
  });

  it("tien-do-da-ve (giaiDoan = 9)", () => {
    expect(tranhHanhTrinh("approved", 9, 10)).toBe("tien-do-da-ve");
    expect(buocHanhTrinh("approved", 9).hienTai).toBe(4);
  });

  it("tien-do-da-giao (giaiDoan = 10, 11 hoac status = delivered)", () => {
    expect(tranhHanhTrinh("approved", 10, 10)).toBe("tien-do-da-giao");
    expect(tranhHanhTrinh("approved", 11, 10)).toBe("tien-do-da-giao");
    expect(buocHanhTrinh("approved", 11).hienTai).toBe(4);

    // status delivered ghi de
    expect(tranhHanhTrinh("delivered", 8, 10)).toBe("tien-do-da-giao");
    expect(buocHanhTrinh("delivered", 8).hienTai).toBe(4);
  });
});
