/**
 * BB-200 — nhãn theo Lark và mốc nhắc (toán thuần, không mạng, không DB).
 *
 * Canh đúng lời chủ studio (docs/19 mục 3): CSKH xác nhận xong mà Lark còn ở
 * "Đã chọn hình" thì KHÔNG được nói "đang chỉnh sửa".
 */
import { describe, it, expect } from "vitest";
import {
  nhanHienThi,
  mocNhacHomNay,
  soNgayLich,
  giaiDoanCua,
  mauCanhBao,
  TRANG_THAI_LARK,
} from "@/lib/lark/trang-thai-hau-ky";

const nhanApp = (s: string) => `APP:${s}`;
const DA_CHON = "optl5DyKLx";
const DANG_LAM = "optmhzW4sL";
const GUI_DUYET = "optjJ9MNLL";
const DA_GIAO = "opttHXFpgy";

describe("nhanHienThi — luồng docs/19 mục 3", () => {
  it("CSKH xác nhận, Lark còn 'Đã chọn hình': khách thấy 'đã được ghi nhận yêu cầu', không phải đang chỉnh", () => {
    const n = nhanHienThi("in_retouch", DA_CHON, nhanApp);
    expect(n.khach).toBe("Bộ ảnh đã được ghi nhận yêu cầu");
    expect(n.quanTri).toBe("Đã chọn ảnh · chờ chỉnh sửa");
    expect(n.khach).not.toMatch(/chỉnh sửa/i);
  });

  it("chưa đọc được Lark (null) cũng coi là đang xếp hàng, không nhận vơ là đang chỉnh", () => {
    expect(nhanHienThi("in_retouch", null, nhanApp).khach).toBe("Bộ ảnh đã được ghi nhận yêu cầu");
  });

  it("Lark tụt sau app (còn 'Đã gửi file gốc') không lùi nhãn về chờ chọn", () => {
    expect(nhanHienThi("in_retouch", "optDAI9nFV", nhanApp).giaiDoan).toBe(2);
  });

  it("Lark 'Đang làm': cả hai màn nói đang chỉnh sửa", () => {
    const n = nhanHienThi("in_retouch", DANG_LAM, nhanApp);
    expect(n.khach).toBe("Đang chỉnh sửa");
    expect(n.quanTri).toBe("Đang chỉnh sửa");
  });

  /*
    BB-285 (27/09/2026, chủ studio chốt): số đo 183 bộ app còn
    'ready'/'in_review'/'submitted' ("mời chọn") trong khi Lark đã đi xa hơn
    hẳn — bản thân đây LÀ cái lỗi BB-285 phải sửa, nên câu khẳng định cũ
    "Lark không đè" cho ba trạng thái này không còn đúng nữa. Ca dưới đây thay
    thế ca cũ cùng tên: trước BB-285 hàm trả `{ quanTri: 'APP:ready', khach:
    null, giaiDoan: null }` cho input y hệt — hoàn nguyên BB-285 (bỏ điều kiện
    `laKhoaTheoLark` khỏi `theoLark`) sẽ làm ca này đỏ.
  */
  it("BB-285: ready/in_review/submitted mà Lark đã 'Đang làm' (giai đoạn ≥2) → Lark ĐÈ, không còn 'mời chọn'", () => {
    for (const s of ["ready", "in_review", "submitted"]) {
      const n = nhanHienThi(s, DANG_LAM, nhanApp);
      expect(n.giaiDoan).toBe(3);
      expect(n.khach).toBe("Đang chỉnh sửa");
      expect(n.quanTri).not.toBe(`APP:${s}`);
    }
  });

  it("ready/in_review/submitted mà Lark còn giai đoạn 1 (đã gửi file gốc): CHƯA có gì để theo, giữ nhãn app", () => {
    for (const s of ["ready", "in_review", "submitted"]) {
      const n = nhanHienThi(s, "optDAI9nFV", nhanApp);
      expect(n).toEqual({ quanTri: `APP:${s}`, khach: null, giaiDoan: null });
    }
  });

  it("chờ khách duyệt trong app: giữ nhãn app dù Lark đã đi xa (màn khách có nút duyệt SỐNG của app, BB-285 cố ý không đè)", () => {
    const n = nhanHienThi("awaiting_approval", GUI_DUYET, nhanApp);
    expect(n.khach).toBeNull();
    expect(n.quanTri).toBe("APP:awaiting_approval");
  });

  it("app đã giao mà Lark còn chậm: tin app", () => {
    expect(nhanHienThi("delivered", GUI_DUYET, nhanApp).quanTri).toBe("APP:delivered");
    expect(nhanHienThi("delivered", DA_GIAO, nhanApp).khach).toBe("Đã giao");
  });
});

describe("mã lựa chọn", () => {
  it("đủ 12 lựa chọn, giai đoạn 1–11", () => {
    expect(Object.keys(TRANG_THAI_LARK)).toHaveLength(12);
    expect(giaiDoanCua("optW0pvHGd")).toBe(6);
    expect(giaiDoanCua("khong-co")).toBeNull();
  });
  it("màu cảnh báo theo chủ studio: tím = Phải Xong Trong Ngày", () => {
    expect(mauCanhBao("optQEfwHOy")).toBe("tim");
    expect(mauCanhBao("opt1E9Y1AQ")).toBe("cam");
    expect(mauCanhBao(null)).toBeNull();
  });
});

describe("soNgayLich — ngày lịch giờ Việt Nam", () => {
  it("23:00 hôm trước tới 08:00 hôm sau là 1 ngày", () => {
    // 23:00 VN = 16:00 UTC; 08:00 VN hôm sau = 01:00 UTC
    expect(soNgayLich(new Date("2026-09-20T16:00:00Z"), new Date("2026-09-21T01:00:00Z"))).toBe(1);
  });
  it("cùng ngày VN là 0 dù cách nhiều giờ", () => {
    expect(soNgayLich(new Date("2026-09-20T17:30:00Z"), new Date("2026-09-21T16:00:00Z"))).toBe(0);
  });
});

describe("mocNhacHomNay", () => {
  const homNay = new Date("2026-09-25T01:00:00Z"); // 08:00 VN
  const truoc = (n: number) => new Date(homNay.getTime() - n * 86_400_000);

  it("GĐ5 gửi duyệt 21 ngày (cron lỡ 1 ngày): MỘT tin mốc 20, các mốc nhỏ ghi bỏ qua", () => {
    const ra = mocNhacHomNay({ maLark: GUI_DUYET, tu: truoc(21), homNay, nhanhA: false, daGui: new Set() });
    expect(ra).toEqual([{ maNhac: "cho_khach_duyet", moc: 20, nguoiNhan: "cskh", mocBoQua: [2, 5, 10] }]);
  });

  it("tồn đọng cũ (mốc 20 đã qua 5 ngày): KHÔNG gửi, ghi hết là bỏ qua — ngày đầu bật không dội tin", () => {
    const ra = mocNhacHomNay({ maLark: GUI_DUYET, tu: truoc(25), homNay, nhanhA: false, daGui: new Set() });
    expect(ra).toEqual([{ maNhac: "cho_khach_duyet", moc: null, nguoiNhan: "cskh", mocBoQua: [2, 5, 10, 20] }]);
  });

  it("mốc đã gửi thì không gửi lại", () => {
    const ra = mocNhacHomNay({
      maLark: GUI_DUYET, tu: truoc(6), homNay, nhanhA: false,
      daGui: new Set(["cho_khach_duyet:2", "cho_khach_duyet:5"]),
    });
    expect(ra).toEqual([]);
  });

  it("chưa tới mốc đầu thì im", () => {
    expect(mocNhacHomNay({ maLark: GUI_DUYET, tu: truoc(1), homNay, nhanhA: false, daGui: new Set() })).toEqual([]);
  });

  it("GĐ2 nhánh A: 4 ngày báo quản lý; nhánh C phải đợi 10", () => {
    const a = mocNhacHomNay({ maLark: DA_CHON, tu: truoc(4), homNay, nhanhA: true, daGui: new Set() });
    expect(a.map((m) => [m.maNhac, m.moc, m.nguoiNhan])).toEqual([["qua_han_chon_hinh", 4, "quan_ly"]]);
    expect(mocNhacHomNay({ maLark: DA_CHON, tu: truoc(4), homNay, nhanhA: false, daGui: new Set() })).toEqual([]);
    expect(mocNhacHomNay({ maLark: DA_CHON, tu: truoc(10), homNay, nhanhA: false, daGui: new Set() })[0]?.moc).toBe(10);
  });

  it("GĐ1 và GĐ7 KHÔNG nhắc — Lark tự gửi (chủ studio 25/09)", () => {
    for (const ma of ["optDAI9nFV", "optsXat0f1", "optWz9BTWy"]) {
      expect(mocNhacHomNay({ maLark: ma, tu: truoc(40), homNay, nhanhA: false, daGui: new Set() })).toEqual([]);
    }
  });

  it("không biết từ lúc nào thì không nhắc (không đoán ngày)", () => {
    expect(mocNhacHomNay({ maLark: GUI_DUYET, tu: null, homNay, nhanhA: false, daGui: new Set() })).toEqual([]);
  });
});
