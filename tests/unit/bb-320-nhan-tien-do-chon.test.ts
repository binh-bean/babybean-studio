/**
 * BB-320 — nhãn "đã chọn / trong gói" phải nói rõ ĐÂY LÀ SỐ TẤM KHÁCH CHỌN, để
 * không lẫn với "40 ảnh" (số ảnh CÓ TRONG BỘ) — vòng 6 hỏi hai con số này có lệch
 * nhau không: không lệch, chúng đếm hai thứ khác nhau; nhãn là chỗ phân biệt.
 */
import { describe, it, expect } from "vitest";
import { nhanTienDoChon } from "@/lib/utils/dinh-dang";

describe("BB-320: nhanTienDoChon", () => {
  it("biết hạn mức: '12/12 tấm', giải thích nói rõ là số khách đã chọn trong gói", () => {
    const r = nhanTienDoChon({ selectedCount: 12, includedQuota: 12 });
    expect(r.ngan).toBe("12/12 tấm");
    expect(r.quotaKnown).toBe(true);
    expect(r.giaiThich).toBe("Khách đã chọn 12 trên 12 tấm trong gói");
  });

  it("vượt hạn mức vẫn giữ nguyên hai số thật, không cắt về hạn mức", () => {
    expect(nhanTienDoChon({ selectedCount: 17, includedQuota: 15 }).ngan).toBe("17/15 tấm");
  });

  it("chưa rõ hạn mức: không in '0/?' trơ trọi, nói thẳng là chưa rõ", () => {
    const r = nhanTienDoChon({ selectedCount: 0, includedQuota: 0 });
    expect(r.ngan).toBe("0 tấm");
    expect(r.quotaKnown).toBe(false);
    expect(r.giaiThich).toContain("chưa rõ hạn mức");
  });
});
