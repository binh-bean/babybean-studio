/**
 * BB-358 (anh 02/10/2026) — kiến thức sản phẩm UV (BB-339 làm sai):
 *   1. In UV rồi thì KHÔNG cán gỗ được → không còn chữ "cán gỗ / cán lên gỗ".
 *   2. Tên chỉ là "UV", không "UV bóng" (đổi ở hàm hiển thị chung, dữ liệu giữ nguyên).
 *   3. UV không bọc khung, không treo: Khung Hàn Quốc chỉ cho chất liệu đã cán.
 *   4. Lời UV ngắn, giọng Bean, câu nào cũng kết "ạ".
 *
 * Kiểm trên hàm thật mà màn khách gọi và trên dữ liệu `vi` lúc chạy — không đọc
 * tệp nguồn (AGENTS.md §5a). Phần giao diện (không có ô khung khi chọn UV, có khi
 * chọn Gỗ) canh ở e2e `bb-339-man-khach.spec.ts`.
 */
import { describe, it, expect } from "vitest";
import {
  coTheBocKhung,
  laChatLieuUV,
  tenChatLieuChoKhach,
  tenCoChatLieuChoKhach,
} from "@/lib/products/nhom-san-pham";
import { vi } from "@/i18n/vi";

function phang(obj: unknown, tien = ""): [string, string][] {
  if (typeof obj === "string") return [[tien, obj]];
  if (obj && typeof obj === "object") {
    return Object.entries(obj).flatMap(([k, v]) => phang(v, tien ? `${tien}.${k}` : k));
  }
  return [];
}

describe("BB-358 — UV là ảnh giấy", () => {
  it("tên hiển thị chỉ là 'UV' (kể cả khi dữ liệu ghi 'UV bóng')", () => {
    expect(tenChatLieuChoKhach("UV")).toBe("UV");
    expect(tenChatLieuChoKhach("UV bóng")).toBe("UV");
    expect(tenChatLieuChoKhach("uv  Bóng")).toBe("UV");
    expect(tenCoChatLieuChoKhach("Ảnh in UV bóng 10x15")).toBe("Ảnh in UV 10x15");
    // Không đụng chất liệu khác.
    expect(tenChatLieuChoKhach("Gỗ")).toBe("Gỗ");
    expect(tenChatLieuChoKhach("Cavas/Kim tuyến")).toBe("Kim Tuyến");
  });

  it("UV không có lựa chọn bọc khung; chất liệu đã cán thì có", () => {
    expect(laChatLieuUV("UV")).toBe(true);
    expect(coTheBocKhung("UV")).toBe(false);
    expect(coTheBocKhung("UV bóng")).toBe(false);
    for (const cl of ["Gỗ", "Tráng gương", "Thủy tinh", "Mica HD", "Cavas/Kim tuyến"]) {
      expect(coTheBocKhung(cl), cl).toBe(true);
    }
    // Không nhầm chất liệu có chữ "uv" ở giữa.
    expect(laChatLieuUV("Mica UV-HD")).toBe(false);
  });

  it("không câu khách thấy nào còn 'cán gỗ', 'UV bóng' hay mời chọn khung để treo ảnh UV", () => {
    const sai = phang(vi.gallery, "gallery").filter(([, s]) =>
      /cán (lên )?(tấm )?gỗ để treo|cán lên gỗ ạ|hoặc cán (lên )?gỗ|UV bóng|chọn thêm khung/i.test(s),
    );
    expect(sai).toEqual([]);
  });

  it("lời UV ngắn, giọng Bean, kết 'ạ'", () => {
    for (const cau of [vi.gallery.treoTuong.uvLaAnhGiay, vi.gallery.treoTuong.moTaChatLieu.UV]) {
      expect(cau).toMatch(/ạ\.$/);
      expect(cau).toMatch(/giấy ảnh/);
      expect(cau).not.toMatch(/gỗ|khung|treo/i);
      expect(cau.split(/\s+/).length).toBeLessThanOrEqual(16);
    }
  });
});
