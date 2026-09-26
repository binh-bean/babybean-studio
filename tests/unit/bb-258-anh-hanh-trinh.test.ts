import { describe, it, expect } from "vitest";
import { anhHanhTrinh, CO_BAN_NGANG } from "../../src/components/features/gallery/hanh-trinh";

describe("BB-258 anhHanhTrinh — chọn ảnh ngang/vuông cho khung tràn của thẻ hành trình", () => {
  it("tên CÓ trong CO_BAN_NGANG (bản ngang đã về đủ 10/10, 26/09/2026) thì dùng bản ngang 16:9", () => {
    expect(CO_BAN_NGANG.has("tien-do-ghi-nhan")).toBe(true);
    const anh = anhHanhTrinh("tien-do-ghi-nhan");
    expect(anh.ngang).toBe(true);
    expect(anh.src).toBe("/hanh-trinh/ngang-tien-do-ghi-nhan-1280.webp");
    expect(anh.srcSet).toBe(
      "/hanh-trinh/ngang-tien-do-ghi-nhan-640.webp 640w, /hanh-trinh/ngang-tien-do-ghi-nhan-1280.webp 1280w",
    );
  });

  it("10/10 tên đã có bản ngang, đúng danh sách chủ studio xác nhận 26/09/2026", () => {
    const daCo = [
      "tien-do-chon-anh",
      "tien-do-ghi-nhan",
      "tien-do-chinh-sua",
      "tien-do-duyet",
      "tien-do-in",
      "tien-do-da-ve",
      "tien-do-da-giao",
      "chot-thanh-cong",
      "link-het-han",
      "chua-co-anh",
    ] as const;
    for (const ten of daCo) expect(CO_BAN_NGANG.has(ten)).toBe(true);
    expect(CO_BAN_NGANG.size).toBe(daCo.length);
  });
});
