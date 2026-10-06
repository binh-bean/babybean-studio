/**
 * BB-371 — cổng ảnh phía khách (hàm thuần mà `/api/g/photos` và `/api/img` gọi).
 * Kiểm ngược trên chính hàm này — KHÔNG tắt cổng rồi chạy trên bb-dev.
 */
import { describe, it, expect } from "vitest";
import { locLuoiAnhGoc, quyetDinhAnhChoKhach, type DauVaoAnhKhach } from "@/lib/anh-chinh-sua/cong-khach";

const BO_A = "11111111-1111-4111-8111-111111111111";
const BO_B = "22222222-2222-4222-8222-222222222222";
const GUI = "2026-10-06T08:00:00Z";

const anh = (x: Partial<DauVaoAnhKhach> = {}): DauVaoAnhKhach => ({
  phienGalleryId: BO_A,
  phienCustomerId: null,
  anhGalleryId: BO_A,
  boCustomerId: "khach-a",
  trangThaiBo: "awaiting_approval",
  subfolder: "anh chinh sua",
  anhTaoLuc: "2026-10-06T07:00:00Z",
  guiLuc: GUI,
  ...x,
});

describe("BB-371 · lưới chọn ảnh gốc (/api/g/photos)", () => {
  it("bỏ mọi ảnh trong thư mục ảnh chỉnh sửa, giữ ảnh gốc + thư mục khác, giữ thứ tự", () => {
    const trang = [
      { id: "1", subfolder: "anh chinh sua" },
      { id: "2", subfolder: "JPG" },
      { id: "3", subfolder: null },
      { id: "4", subfolder: "Ảnh chỉnh sửa".normalize("NFD") },
      { id: "5", subfolder: "Set 2" },
    ];
    expect(locLuoiAnhGoc(trang).map((p) => p.id)).toEqual(["2", "3", "5"]);
  });
});

describe("BB-371 · byte ảnh cho khách (/api/img)", () => {
  it("ảnh chỉnh ĐÃ gửi, đúng bộ → cho xem", () => {
    expect(quyetDinhAnhChoKhach(anh())).toBe("cho_xem");
  });
  it("ảnh (chỉnh hay gốc) của bộ KHÁC → cấm (403)", () => {
    expect(quyetDinhAnhChoKhach(anh({ anhGalleryId: BO_B }))).toBe("cam");
    expect(quyetDinhAnhChoKhach(anh({ anhGalleryId: BO_B, subfolder: "JPG" }))).toBe("cam");
  });
  it("link gia đình: đúng khách thì xem; khách khác hoặc bộ mồ côi (customer rỗng) → cấm", () => {
    const nha = { phienGalleryId: null, phienCustomerId: "khach-a" };
    expect(quyetDinhAnhChoKhach(anh({ ...nha, anhGalleryId: BO_B }))).toBe("cho_xem");
    expect(quyetDinhAnhChoKhach(anh({ ...nha, boCustomerId: "khach-b" }))).toBe("cam");
    expect(quyetDinhAnhChoKhach(anh({ ...nha, boCustomerId: null }))).toBe("cam");
  });
  it("ảnh chỉnh CHƯA gửi (bộ in_retouch / submitted / chưa có mốc) → ẩn (404)", () => {
    expect(quyetDinhAnhChoKhach(anh({ trangThaiBo: "in_retouch" }))).toBe("an");
    expect(quyetDinhAnhChoKhach(anh({ trangThaiBo: "submitted" }))).toBe("an");
    expect(quyetDinhAnhChoKhach(anh({ guiLuc: null }))).toBe("an");
  });
  it("ảnh chỉnh về SAU mốc gửi → ẩn; ảnh gốc của bộ đó vẫn xem được", () => {
    expect(quyetDinhAnhChoKhach(anh({ anhTaoLuc: "2026-10-06T08:00:01Z" }))).toBe("an");
    expect(quyetDinhAnhChoKhach(anh({ subfolder: "JPG", trangThaiBo: "in_retouch", guiLuc: null }))).toBe("cho_xem");
  });
});
