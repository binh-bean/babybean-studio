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
    expect(buocHanhTrinh("submitted", null).hienTai).toBe(0);
  });

  it("giai doan null ma in_retouch -> mac dinh", () => {
    // BB-402 — tranh theo CÙNG mã trạng thái với bước (xếp hàng chờ chỉnh = "ghi nhận"),
    // không còn tranh "đang chỉnh" đi kèm bước "Chờ chỉnh".
    expect(tranhHanhTrinh("in_retouch", null, 10)).toBe("tien-do-ghi-nhan");
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
    expect(buocHanhTrinh("in_retouch", 6).hienTai).toBe(2);
  });

  it("tien-do-duyet (giaiDoan = 5 hoac status = awaiting_approval)", () => {
    expect(tranhHanhTrinh("in_retouch", 5, 10)).toBe("tien-do-duyet");
    // BB-402 — Lark "Đã chốt chưa in" (GĐ7) là SAU khi duyệt: bước In/nhận ảnh, tranh in.
    expect(tranhHanhTrinh("in_retouch", 7, 10)).toBe("tien-do-in");
    expect(buocHanhTrinh("in_retouch", 7).hienTai).toBe(4);

    // status awaiting_approval ghi de
    expect(tranhHanhTrinh("awaiting_approval", 3, 10)).toBe("tien-do-duyet");
    expect(buocHanhTrinh("awaiting_approval", 3).hienTai).toBe(3);
  });

  it("tien-do-in (giaiDoan = 8)", () => {
    expect(tranhHanhTrinh("approved", 8, 10)).toBe("tien-do-in");
    expect(buocHanhTrinh("approved", 8).hienTai).toBe(4);
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

// Opus soát BB-225: `approved` (đã duyệt, chờ in/giao) từng không có thẻ.
describe("BB-225: approved có thẻ", () => {
  // BB-402 — anh báo 08/10: đã duyệt mà tiến trình khách vẫn đứng ở "Duyệt ảnh".
  it("approved chưa có giai đoạn Lark → tranh in, bước In/nhận ảnh (đã qua Duyệt)", () => {
    expect(tranhHanhTrinh("approved", null)).toBe("tien-do-in");
    expect(buocHanhTrinh("approved", null).hienTai).toBe(4);
  });
  it("approved + Lark Đã gửi in → tranh in", () => {
    expect(tranhHanhTrinh("approved", 8)).toBe("tien-do-in");
  });
});

// BB-329 mục 1 — chủ studio 30/09/2026: ba mẹ vừa chốt (CSKH chưa xác nhận)
// mà thanh đã ở "Đang chỉnh". Chỉ "Đang chỉnh" khi Lark sang "Đang làm" (GĐ3).
describe("BB-329: tiến độ theo từng bước xác nhận", () => {
  const nhanHienTai = (status: string, gd: number | null) => {
    const { buoc, hienTai } = buocHanhTrinh(status, gd);
    return buoc[hienTai];
  };
  it("vừa chốt, CSKH chưa xác nhận → Chờ xác nhận", () => {
    expect(nhanHienTai("submitted", null)).toBe("Chờ xác nhận");
  });
  it("CSKH đã xác nhận, Lark còn 'Đã chọn hình' (GĐ2) → Chờ chỉnh, KHÔNG phải Đang chỉnh", () => {
    expect(nhanHienTai("in_retouch", 2)).toBe("Chờ chỉnh");
    expect(nhanHienTai("in_retouch", null)).toBe("Chờ chỉnh");
    // Lark đã "Đã chọn hình" dù app còn submitted → cũng là xếp hàng.
    expect(nhanHienTai("submitted", 2)).toBe("Chờ chỉnh");
  });
  it("Lark 'Đang làm' / 'Leader check' / 'Sửa' → Đang chỉnh", () => {
    for (const gd of [3, 4, 6]) expect(nhanHienTai("in_retouch", gd)).toBe("Đang chỉnh");
  });
  it("gửi duyệt → Duyệt ảnh; gửi in trở đi → In/nhận ảnh", () => {
    expect(nhanHienTai("in_retouch", 5)).toBe("Duyệt ảnh");
    expect(nhanHienTai("awaiting_approval", null)).toBe("Duyệt ảnh");
    for (const gd of [8, 9, 10]) expect(nhanHienTai("approved", gd)).toBe("In/nhận ảnh");
  });
  it("không còn nhãn 'Đã chốt' trên thanh", () => {
    expect(buocHanhTrinh("submitted", null).buoc).not.toContain("Đã chốt");
  });
});
