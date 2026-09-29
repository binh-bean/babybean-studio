/**
 * BB-327 — năm luật thuần của đợt sửa "Bàn làm việc / nhắc khách / mở lại /
 * quên mật khẩu". Mỗi khối canh ĐÚNG lỗi chủ studio báo 29/09/2026.
 */
import { describe, it, expect } from "vitest";
import { isGalleryLocked, maLarkConHieuLuc } from "@/lib/gallery-status";
import { dangCheDoChonThem } from "@/lib/gallery/dot-chon";
import { tienVuotHanMucConPhaiThu } from "@/lib/gallery/tien-phat-sinh";
import { locYeuCauChuaXuLy } from "@/lib/nhan-su/quen-mat-khau";
import { cauDaGuiNhac, coTheNhacKhach } from "@/lib/gallery/nhac-khach-ngay";
import { tabsChoVai, tongViecCanXuLy } from "@/lib/utils/viec-can-xu-ly-tabs";

const DA_CHON_HINH = "optl5DyKLx"; // Lark giai đoạn 2
const DANG_LAM = "optmhzW4sL"; // Lark giai đoạn 3

describe("BB-327 mở lại: khách tick/bỏ tick được sau khi CSKH mở lại", () => {
  // Đúng dữ liệu bb-dev của lượt anh thử 29/09: Lark "Đã chọn hình" từ 16/09, mở lại 29/09.
  const boAnhVuaMoLai = {
    lark_trang_thai: DA_CHON_HINH,
    lark_trang_thai_tu: "2026-09-16T01:57:16.156Z",
    reopened_at: "2026-09-29T11:46:35.192Z",
  };

  it("mở lại SAU lần cuối Lark đổi trạng thái → không còn khoá theo Lark", () => {
    expect(isGalleryLocked("in_review", maLarkConHieuLuc(boAnhVuaMoLai))).toBe(false);
    // …và màn khách không rơi vào chế độ "Chọn thêm ảnh" (đợt 1 khoá).
    expect(dangCheDoChonThem("in_review", maLarkConHieuLuc(boAnhVuaMoLai))).toBe(false);
  });

  it("Lark đổi trạng thái SAU khi mở lại → Lark lại có hiệu lực", () => {
    const larkDiTiep = { ...boAnhVuaMoLai, lark_trang_thai: DANG_LAM, lark_trang_thai_tu: "2026-09-30T02:00:00Z" };
    expect(isGalleryLocked("in_review", maLarkConHieuLuc(larkDiTiep))).toBe(true);
  });

  it("chưa từng mở lại → luật khoá theo Lark của BB-285 giữ nguyên", () => {
    expect(isGalleryLocked("in_review", maLarkConHieuLuc({ ...boAnhVuaMoLai, reopened_at: null }))).toBe(true);
  });

  it("mở lại không gỡ khoá theo TRẠNG THÁI app (CSKH đã xác nhận lại → in_retouch)", () => {
    expect(isGalleryLocked("in_retouch", maLarkConHieuLuc(boAnhVuaMoLai))).toBe(true);
  });
});

describe("BB-327 ảnh vượt hạn mức: đã thu đủ theo số lúc chốt thì rời danh sách", () => {
  it("giá ảnh thêm đổi 40.000 → 50.000 sau khi chốt: thu 120.000 là đủ", () => {
    // 3 ảnh vượt: view tính 3 × 50.000 = 150.000; khách thấy lúc chốt 3 × 40.000 = 120.000.
    expect(tienVuotHanMucConPhaiThu({ tienTheoAnh: 150_000, tienLucChot: 120_000, daGhiCo: 120_000 })).toBe(0);
  });

  it("chưa thu gì thì vẫn còn phải thu đúng số lúc chốt", () => {
    expect(tienVuotHanMucConPhaiThu({ tienTheoAnh: 150_000, tienLucChot: 120_000, daGhiCo: 0 })).toBe(120_000);
  });

  it("lúc chốt chưa biết hạn mức (0) hoặc chưa chốt → lùi về số theo ảnh", () => {
    expect(tienVuotHanMucConPhaiThu({ tienTheoAnh: 150_000, tienLucChot: 0, daGhiCo: 0 })).toBe(150_000);
    expect(tienVuotHanMucConPhaiThu({ tienTheoAnh: 150_000, tienLucChot: null, daGhiCo: 50_000 })).toBe(100_000);
  });
});

describe("BB-327 quên mật khẩu: yêu cầu rời danh sách khi admin đã đặt lại", () => {
  it("đặt lại SAU yêu cầu → hết; yêu cầu gửi SAU lần đặt lại → còn", () => {
    const ds = locYeuCauChuaXuLy(
      [
        { staffId: "a", requestedAt: "2026-09-29T10:00:00Z" },
        { staffId: "b", requestedAt: "2026-09-29T12:00:00Z" },
        { staffId: "b", requestedAt: "2026-09-29T09:00:00Z" },
      ],
      [
        { staffId: "a", resetAt: "2026-09-29T11:00:00Z" },
        { staffId: "b", resetAt: "2026-09-29T10:00:00Z" },
      ],
    );
    expect(ds).toEqual([{ staffId: "b", requestedAt: "2026-09-29T12:00:00Z", lanThu: 1 }]);
  });

  it("gửi nhiều lần chưa ai xử lý → một dòng, đếm số lần, lấy lần mới nhất", () => {
    const ds = locYeuCauChuaXuLy(
      [
        { staffId: "c", requestedAt: "2026-09-29T08:00:00Z" },
        { staffId: "c", requestedAt: "2026-09-29T09:30:00Z" },
      ],
      [],
    );
    expect(ds).toEqual([{ staffId: "c", requestedAt: "2026-09-29T09:30:00Z", lanThu: 2 }]);
  });
});

describe("BB-327 nhắc khách: nói thật tin tới đâu", () => {
  it("chỉ nhắc khi bộ ảnh đang chờ khách", () => {
    expect(coTheNhacKhach("in_review")).toBe(true);
    expect(coTheNhacKhach("ready")).toBe(true);
    expect(coTheNhacKhach("in_retouch")).toBe(false);
    expect(coTheNhacKhach("expired")).toBe(false);
  });

  it("câu kết quả có giờ gửi và kênh thật", () => {
    expect(cauDaGuiNhac({ daVaoChuong: true, soMayNhanDay: 0 }, "20:15")).toBe(
      "Đã gửi nhắc lúc 20:15 · chuông trong app",
    );
    expect(cauDaGuiNhac({ daVaoChuong: true, soMayNhanDay: 2 }, "20:15")).toBe(
      "Đã gửi nhắc lúc 20:15 · chuông trong app + thông báo tới 2 máy",
    );
    expect(cauDaGuiNhac({ daVaoChuong: false, soMayNhanDay: 0 }, "20:15")).toBe("Chưa gửi được, thử lại giúp");
  });
});

describe("BB-327 huy hiệu Việc cần xử lý = tổng các tab", () => {
  it("cộng đúng số các tab, bỏ qua tab chưa tải", () => {
    expect(tongViecCanXuLy({ "loi-dong-bo": 76, "over-quota": 1, "yeu-cau-mo-lai": 1, "quen-mat-khau": undefined })).toBe(78);
  });

  it("CTV thời vụ chỉ thấy tab Ảnh vượt hạn mức — huy hiệu không cộng tab họ không xem", () => {
    expect(tabsChoVai("photoshop_ctv").map((t) => t.value)).toEqual(["over-quota"]);
    expect(tabsChoVai("owner").map((t) => t.value)).toContain("quen-mat-khau");
  });
});
