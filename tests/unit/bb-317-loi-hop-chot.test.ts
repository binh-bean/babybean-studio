import { describe, it, expect } from "vitest";
import { tieuDeHopChot, cauYeuCauBiaAlbum, cauNhacThieuAnh } from "@/lib/utils/dinh-dang";

const demChu = (s: string) => s.trim().split(/\s+/).length;

describe("BB-317 — tiêu đề hộp chốt gọi tên bé", () => {
  it("họ tên đầy đủ (không nickname) → thêm 'bé' thường", () => {
    expect(tieuDeHopChot("Nguyễn Ngọc Bảo An")).toBe("Chốt ảnh cho bé Nguyễn Ngọc Bảo An");
  });
  it("tên đã có 'Bé' ở đầu (nickname qua tenGoiBe) → không nhân đôi", () => {
    expect(tieuDeHopChot("Bé Mít")).toBe("Chốt ảnh cho Bé Mít");
    expect(tieuDeHopChot("bé na")).toBe("Chốt ảnh cho bé na");
  });
  it("không có tên → chuỗi rỗng để nơi gọi dùng tiêu đề chung", () => {
    expect(tieuDeHopChot(null)).toBe("");
    expect(tieuDeHopChot("   ")).toBe("");
  });
});

describe("BB-317 K-e — mỗi sản phẩm MỘT luật, gọi tên, ≤ 12 chữ", () => {
  it("bìa album là yêu cầu, gọi đúng tên", () => {
    const c = cauYeuCauBiaAlbum(["Album 20×30"]);
    // BB-355 — giọng Bean: gọi "ba mẹ", kết "ạ"; vẫn ≤ 12 chữ.
    expect(c).toBe("Ba mẹ chọn ảnh bìa cho Album 20×30 để chốt ạ.");
    expect(demChu(c)).toBeLessThanOrEqual(12);
  });
  it("nhiều album → nêu cuốn đầu và đếm phần còn lại", () => {
    expect(cauYeuCauBiaAlbum(["Album 20×30", "Album 15×21"])).toBe(
      "Ba mẹ chọn ảnh bìa cho Album 20×30 và 1 album nữa để chốt ạ.",
    );
  });
  it("sản phẩm in thiếu ảnh chỉ là lời nhắc, không chặn", () => {
    const c = cauNhacThieuAnh("Ảnh in 15×21", 1);
    expect(c).toBe("Ảnh in 15×21 còn thiếu 1 tấm, bổ sung sau được ạ.");
    expect(demChu(c)).toBeLessThanOrEqual(12);
    expect(c).not.toMatch(/để chốt|bắt buộc|xác nhận/);
  });
  it("cuốn album rỗng nói 'chưa có ảnh', không bịa số thiếu", () => {
    expect(cauNhacThieuAnh("Album 20×30", 1, true)).toBe("Album 20×30 chưa có ảnh, bổ sung sau được ạ.");
  });
  it("hai câu không dùng chung động từ nên không thể mâu thuẫn", () => {
    expect(cauYeuCauBiaAlbum(["A"])).toMatch(/để chốt/);
    expect(cauNhacThieuAnh("A", 2)).not.toMatch(/để chốt/);
  });
});
