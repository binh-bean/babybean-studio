/**
 * BB-308 (bản vẽ BB-301 bang-dieu-khien.html, admin duyệt 28/09/2026) —
 * khối "Việc hôm nay" ở Bảng điều khiển thêm chip lọc "Tất cả / Nhắc khách /
 * Duyệt & giao", có số đếm. `nhomThaoTacViec` (dashboard.tsx) là hàm THUẦN
 * quyết định một dòng "Việc hôm nay" thuộc chip nào — PHẢI khớp đúng nhánh
 * mà `NutLamNhanhViec` (cùng file) đã vẽ nút "Làm nhanh":
 *   - "submitted"                  -> nút "Chuyển chỉnh"    -> duyệt & giao
 *   - "in_retouch"                 -> nút "Duyệt/Giao ảnh"  -> duyệt & giao
 *   - "ready" chưa gửi (`sentAt` null) -> nút "Chép link"   -> duyệt & giao
 *   - còn lại (vd "in_review" đang chờ khách chọn)          -> "Nhắc khách"
 *
 * Không gọi qua dashboard THẬT được: `locBoAnhThat` (src/lib/bao-cao/loc-chung.ts)
 * cố tình loại MỌI bộ ảnh tên bắt đầu "Fixture" khỏi khối "Việc hôm nay" của
 * API `/api/admin/dashboard` — đúng luật §6 (không để dữ liệu thử lẫn vào số
 * liệu quản trị thật). Vì vậy phép thử canh HÀM PHÂN LOẠI thuần này trực
 * tiếp; phần dựng chip (đếm, bấm đổi tab) được canh riêng ở
 * tests/e2e/bb-308-quan-tri.spec.ts bằng cấu trúc UI, không bằng dữ liệu
 * Fixture qua API dashboard.
 *
 * Thước đo AGENTS.md §5a: hoàn nguyên nhánh "ready chưa gửi" (bỏ điều kiện
 * `&& !item.sentAt`, coi MỌI "ready" là duyệt & giao) thì ca thứ ba dưới đây
 * phải ĐỎ — "ready" đã gửi (`sentAt` khác null) đáng lẽ đợi khách xem/duyệt,
 * không còn việc gì cho studio "duyệt & giao" nữa.
 */

import { describe, it, expect } from "vitest";
import { nhomThaoTacViec } from "@/components/features/admin/dashboard";

describe("BB-308: nhomThaoTacViec — chip Nhắc khách / Duyệt & giao", () => {
  it("submitted -> duyệt & giao (chờ studio chuyển sang chỉnh ảnh)", () => {
    expect(nhomThaoTacViec({ status: "submitted", sentAt: null })).toBe("duyet_giao");
  });

  it("in_retouch -> duyệt & giao (chờ studio duyệt/giao ảnh)", () => {
    expect(nhomThaoTacViec({ status: "in_retouch", sentAt: null })).toBe("duyet_giao");
  });

  it("ready CHƯA gửi (sentAt null) -> duyệt & giao (chờ studio chép link gửi)", () => {
    expect(nhomThaoTacViec({ status: "ready", sentAt: null })).toBe("duyet_giao");
  });

  it("ready ĐÃ gửi (sentAt có giá trị) -> nhắc khách, không phải duyệt & giao", () => {
    expect(nhomThaoTacViec({ status: "ready", sentAt: "2026-09-20T10:00:00Z" })).toBe("nhac_khach");
  });

  it("in_review (khách đang chọn, chưa chốt) -> nhắc khách", () => {
    expect(nhomThaoTacViec({ status: "in_review", sentAt: null })).toBe("nhac_khach");
  });

  it("expired (quá hạn chưa chốt) -> vẫn là nhắc khách, không phải việc của studio", () => {
    expect(nhomThaoTacViec({ status: "expired", sentAt: null })).toBe("nhac_khach");
  });
});
