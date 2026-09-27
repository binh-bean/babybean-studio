/**
 * BB-284 — thẻ Lark cho hai sự kiện MỚI: khách duyệt ảnh chỉnh (chuyển in) và
 * khách xin sửa kèm ghi chú. Cả hai đứng NGOÀI công tắc nhắc nội bộ — chiều
 * khách↔studio luôn gửi (xem bb-284-cong-tac-nhac-noi-bo.test.ts).
 *
 * `dungThe` là hàm thuần, không đụng mạng hay cơ sở dữ liệu — phép thử ở đây
 * không cần giả lập gì ngoài chính payload.
 */
import { describe, it, expect } from "vitest";
import { dungThe, locBoAnh } from "@/lib/lark/notify";

describe("BB-284 — thẻ review.approved", () => {
  const payload = {
    galleryId: "11111111-1111-4111-8111-111111111111",
    galleryTitle: "Fixture BB-284 duyệt",
    customerName: "Nguyễn Thị Mai",
    customerPhone: "090***4567",
  };

  it("dựng thẻ XANH, có tên khách và SĐT đã che", () => {
    const the = dungThe("review.approved", payload, "https://app/admin/galleries/x") as {
      card: {
        header: { template: string; title: { content: string } };
        elements: { fields?: { text: { content: string } }[] }[];
      };
    };
    expect(the.card.header.template).toBe("green");
    expect(the.card.header.title.content).toContain("duyệt");

    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).toContain("Nguyễn Thị Mai");
    expect(noiDung).toContain("090***4567");
    // SĐT phải đã che TRƯỚC khi tới dungThe — chính chuỗi số đầy đủ không được
    // xuất hiện lẫn trong thẻ (ở đây coi như đã che ở nơi gọi, chỉ canh format).
    expect(noiDung).not.toMatch(/0901234567/);
  });

  it("thiếu link quản trị thì vẫn dựng được thẻ, chỉ không có nút", () => {
    const the = dungThe("review.approved", payload, null) as {
      card: { elements: Record<string, unknown>[] };
    };
    expect(the.card.elements.some((e) => e.tag === "action")).toBe(false);
  });
});

describe("BB-284 — thẻ review.changes_requested", () => {
  const payloadCoBan = {
    galleryId: "11111111-1111-4111-8111-111111111111",
    galleryTitle: "Fixture BB-284 xin sửa",
    round: 2,
    ghiChu: "Ảnh số 3 và số 7 bị sáng quá, ba mẹ muốn tối lại một chút",
    customerPhone: "090***1234",
  };

  it("dựng thẻ ĐỎ, có số vòng và ghi chú nguyên văn", () => {
    const the = dungThe(
      "review.changes_requested",
      payloadCoBan,
      "https://app/admin/galleries/x",
    ) as {
      card: {
        header: { template: string; title: { content: string } };
        elements: unknown[];
      };
    };
    expect(the.card.header.template).toBe("red");
    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).toContain("Lần 2");
    expect(noiDung).toContain("Ảnh số 3 và số 7 bị sáng quá");
    expect(noiDung).toContain("090***1234");
  });

  it("ghi chú dài hơn 200 ký tự bị cắt gọn, có dấu …", () => {
    const ghiChuDai = "x".repeat(250);
    const the = dungThe(
      "review.changes_requested",
      { ...payloadCoBan, ghiChu: ghiChuDai },
      null,
    ) as { card: { elements: unknown[] } };
    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).toContain("x".repeat(200) + "…");
    expect(noiDung).not.toContain("x".repeat(201));
  });

  it("có mảng cacTam (theo từng tấm) thì liệt kê từng dòng, cắt ở 20 tấm", () => {
    const cacTam = Array.from({ length: 25 }, (_, i) => ({
      ten: `Ảnh ${i + 1}`,
      ghiChu: `Sửa tấm ${i + 1}`,
    }));
    const the = dungThe(
      "review.changes_requested",
      { ...payloadCoBan, cacTam },
      null,
    ) as { card: { elements: unknown[] } };
    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).toContain("Sửa tấm 1");
    expect(noiDung).toContain("Sửa tấm 20");
    expect(noiDung).not.toContain("Sửa tấm 21");
    expect(noiDung).toContain("và 5 tấm khác");
  });

  it("khoá payload không dính bẫy locBoAnh (không chứa chữ 'anh')", () => {
    // `cacTam`/`ghiChu`/`round`/`customerPhone` không được lọt vào KHOA_CAM —
    // nếu ai đổi tên khoá thành thứ chứa "anh" thì thẻ rơi về rỗng lặng lẽ,
    // đúng bẫy đã ghi ở đầu notify.ts (BB-200 vấp hai lần).
    const sauKhiLoc = locBoAnh(payloadCoBan);
    expect(sauKhiLoc.ghiChu).toBe(payloadCoBan.ghiChu);
    expect(sauKhiLoc.round).toBe(2);
    expect(sauKhiLoc.galleryTitle).toBe(payloadCoBan.galleryTitle);
  });
});

describe("BB-284 — mua thêm lúc chọn hiện trong thẻ selection.submitted", () => {
  it("có cacMonMuaThem thì hiện dòng 'Mua thêm lúc chọn'", () => {
    const the = dungThe(
      "selection.submitted",
      {
        galleryTitle: "Fixture BB-284 chốt",
        selectedCount: 20,
        includedQuota: 20,
        confirmedByName: "Nguyễn Thị Mai",
        cacMonMuaThem: [{ ten: "Khung gỗ 40x60", soLuong: 1 }],
      },
      null,
    ) as { card: { elements: unknown[] } };
    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).toContain("Mua thêm lúc chọn");
    expect(noiDung).toContain("Khung gỗ 40x60");
  });

  it("không mua gì thêm thì KHÔNG bịa ra dòng đó", () => {
    const the = dungThe(
      "selection.submitted",
      {
        galleryTitle: "Fixture BB-284 chốt",
        selectedCount: 20,
        includedQuota: 20,
        confirmedByName: "Nguyễn Thị Mai",
        cacMonMuaThem: [],
      },
      null,
    ) as { card: { elements: unknown[] } };
    const noiDung = JSON.stringify(the.card.elements);
    expect(noiDung).not.toContain("Mua thêm lúc chọn");
  });
});
