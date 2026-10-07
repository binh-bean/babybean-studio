/**
 * BB-332 — một hàm trạng thái app ↔ Lark (`trangThaiBoAnh`). Bảng đầy đủ ở
 * docs/27-trang-thai-app-lark.md; phép thử canh đúng các mốc chủ studio chốt.
 */
import { describe, it, expect } from "vitest";
import { trangThaiBoAnh, TRANG_THAI_BO_ANH, BUOC_KHACH } from "@/lib/lark/trang-thai-app-lark";

const FILE_GOC = "optDAI9nFV";
const DA_CHON_HINH = "optl5DyKLx";
const DANG_LAM = "optmhzW4sL";
const DA_GUI_IN = "optxMAdtNX";

const co = { coDriveLink: true, coLinkApp: true, coBanGhiLark: true };

describe("BB-332: trangThaiBoAnh", () => {
  it("bản ghi Lark chưa thành bộ ảnh, chưa có link Drive → Mới nhập", () => {
    const t = trangThaiBoAnh({ status: null, coDriveLink: false, coLinkApp: false });
    expect(t.ma).toBe("moi_nhap");
    expect(t.quanTri).toBe("Mới nhập");
    expect(t.buocKhach).toBeNull();
  });

  it("nháp chưa có link Drive → Mới nhập; có link → Đang tải ảnh", () => {
    expect(trangThaiBoAnh({ status: "draft", coDriveLink: false, coLinkApp: false }).ma).toBe("moi_nhap");
    expect(trangThaiBoAnh({ status: "draft", coDriveLink: true, coLinkApp: false }).ma).toBe("dang_tai");
  });

  it("lỗi Drive hoặc link trùng bản ghi khác → Lỗi tải", () => {
    expect(trangThaiBoAnh({ status: "sync_error", ...co }).quanTri).toBe("Lỗi tải");
    expect(trangThaiBoAnh({ status: "ready", ...co, linkTrung: true }).ma).toBe("loi_tai");
    expect(trangThaiBoAnh({ status: null, coDriveLink: true, linkTrung: true, coLinkApp: false }).ma).toBe("loi_tai");
  });

  it("đủ ảnh, đã có Link app, Lark chưa 'Đã gửi file gốc' → Sẵn sàng", () => {
    const t = trangThaiBoAnh({ status: "ready", larkTrangThai: null, ...co });
    expect(t.ma).toBe("san_sang");
    expect(t.quanTri).toBe("Sẵn sàng");
  });

  it("đủ ảnh nhưng chưa có Link app → Chờ tạo Link app", () => {
    expect(trangThaiBoAnh({ status: "ready", ...co, coLinkApp: false }).ma).toBe("cho_tao_link");
  });

  it("Lark sang 'Đã gửi file gốc' → Chờ khách chọn", () => {
    const t = trangThaiBoAnh({ status: "ready", larkTrangThai: FILE_GOC, ...co });
    expect(t.ma).toBe("cho_khach_chon");
    expect(t.khach).toBe("Mời ba mẹ chọn ảnh ạ");
    expect(BUOC_KHACH[t.buocKhach!]).toBe("Chọn ảnh");
  });

  it("bộ cũ không neo Lark, ready → Chờ khách chọn (app không biết gì hơn)", () => {
    expect(trangThaiBoAnh({ status: "ready", ...co, coBanGhiLark: false }).ma).toBe("cho_khach_chon");
  });

  it("khách bấm chốt → 'Bean đang xác nhận danh sách ảnh ạ', KHÔNG phải 'Đã chốt'", () => {
    const t = trangThaiBoAnh({ status: "submitted", larkTrangThai: FILE_GOC, ...co });
    expect(t.ma).toBe("cho_studio_xac_nhan");
    expect(t.khach).toBe("Bean đang xác nhận danh sách ảnh ạ");
    expect(BUOC_KHACH[t.buocKhach!]).toBe("Bean xác nhận");
  });

  it("CSKH xác nhận mà Lark chưa 'Đang làm' → Đã chọn hình (xếp hàng), KHÔNG 'Đang chỉnh sửa'", () => {
    for (const lark of [null, FILE_GOC, DA_CHON_HINH]) {
      const t = trangThaiBoAnh({ status: "in_retouch", larkTrangThai: lark, ...co });
      expect(t.ma).toBe("da_chon_hinh");
      expect(t.khach).toBe("Bean đã nhận danh sách, ảnh đang chờ chỉnh ạ");
    }
  });

  it("Lark 'Đang làm' → Đang chỉnh sửa (cả khi app chưa bấm xác nhận — BB-285)", () => {
    expect(trangThaiBoAnh({ status: "in_retouch", larkTrangThai: DANG_LAM, ...co }).ma).toBe("dang_chinh_sua");
    expect(trangThaiBoAnh({ status: "submitted", larkTrangThai: DANG_LAM, ...co }).ma).toBe("dang_chinh_sua");
  });

  it("app đang chờ khách duyệt: giữ nhãn app dù Lark nói gì", () => {
    expect(trangThaiBoAnh({ status: "awaiting_approval", larkTrangThai: DANG_LAM, ...co }).ma).toBe("cho_khach_duyet");
  });

  it("app đã giao mà Lark còn 'Đã gửi in' → Đã giao (không lùi nhãn)", () => {
    expect(trangThaiBoAnh({ status: "delivered", larkTrangThai: DA_GUI_IN, ...co }).ma).toBe("da_giao");
    expect(trangThaiBoAnh({ status: "in_retouch", larkTrangThai: DA_GUI_IN, ...co }).ma).toBe("dang_in");
  });

  it("CSKH mở lại SAU lần đổi Lark cuối → trạng thái Lark cũ hết hiệu lực", () => {
    const t = trangThaiBoAnh({
      status: "in_review",
      larkTrangThai: DA_CHON_HINH,
      larkTrangThaiTu: "2026-09-16T00:00:00Z",
      reopenedAt: "2026-09-29T11:46:00Z",
      ...co,
    });
    expect(t.ma).toBe("cho_khach_chon");
  });

  it("mọi mã đều có nhãn quản trị và nhãn khách", () => {
    for (const [ma, d] of Object.entries(TRANG_THAI_BO_ANH)) {
      expect(d.quanTri, ma).toBeTruthy();
      expect(d.khach, ma).toBeTruthy();
    }
  });
});
