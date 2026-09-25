/**
 * BB-200 — thẻ tin nhắc hậu kỳ gửi nhóm Lark.
 *
 * Bẫy canh ở đây: `locBoAnh()` cắt mọi khoá có chữ "anh" trước khi dựng thẻ —
 * kể cả `danhSach` (d-ANH-sach) và `maNhac` (m-ANH-ac): bản đầu dùng đúng hai
 * tên đó và thẻ ra null.
 * Đặt tên danh sách là `boAnh` là thẻ rỗng, và dungThe trả null — tin rơi vào
 * trạng thái "chưa có mẫu thẻ" mà không ai hay.
 */
import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { dungThe, locBoAnh } from "@/lib/lark/notify";

const payload = {
  loai: "cho_khach_duyet",
  nguoiNhan: "cskh",
  cacBo: [
    {
      galleryId: "11111111-1111-4111-8111-111111111111",
      galleryTitle: "Bé Na 100 ngày",
      customerName: "Nguyễn Thị Mai",
      customerPhone: "090***0001",
      soNgay: 5,
      moc: 5,
    },
  ],
};

describe("thẻ hau_ky.nhac", () => {
  it("danh sách sống sót qua locBoAnh", () => {
    expect(locBoAnh(payload).cacBo).toEqual(payload.cacBo);
  });

  it("thẻ có tiêu đề đúng loại, số bộ, tên bộ ảnh, SĐT đã che, nút mở", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
    const the = dungThe("hau_ky.nhac", locBoAnh(payload), null) as {
      card: { header: { title: { content: string } }; elements: { text?: { content: string } }[] };
    };
    expect(the.card.header.title.content).toBe("Đã gửi duyệt, khách chưa phản hồi — 1 bộ");
    const noiDung = the.card.elements.map((e) => e.text?.content ?? "").join("\n");
    expect(noiDung).toContain("Bé Na 100 ngày");
    expect(noiDung).toContain("090***0001");
    expect(noiDung).toContain("5 ngày");
    expect(noiDung).toContain("https://app.example.com/admin/galleries/11111111-1111-4111-8111-111111111111");
    vi.unstubAllEnvs();
  });

  it("loại lạ hoặc danh sách rỗng → null (không bịa tin)", () => {
    expect(dungThe("hau_ky.nhac", { loai: "khong_co", cacBo: payload.cacBo }, null)).toBeNull();
    expect(dungThe("hau_ky.nhac", { loai: "cho_khach_duyet", cacBo: [] }, null)).toBeNull();
  });
});
