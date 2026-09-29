/**
 * BB-325 — tạo bộ ảnh phải neo vào dòng Hậu Kỳ Lark + luật "tên hiển thị".
 *
 * Canh HÀM THUẦN (không gọi Lark, không đọc mã nguồn — AGENTS.md §5a):
 *  - `locDongKhop`: mã hóa đơn so KHỚP TUYỆT ĐỐI (API search của Lark dùng
 *    "contains", "#57" khớp nhầm "#572"), số điện thoại so 9 số cuối.
 *  - `bocDongHauKy`: bóc tên mẹ/SĐT/tên bé/gói/ngày chụp/số file edit.
 *  - `tinhTieuDeBoAnhQuanTri` + `dongThongTinBoAnhQuanTri`: tiêu đề quản trị là
 *    TÊN MẸ; dòng thông tin "tên bé · SĐT · mã hóa đơn · gói".
 * Dữ liệu là dữ liệu giả (AGENTS.md §6).
 */
import { describe, it, expect } from "vitest";
import { locDongKhop, bocDongHauKy, duoiSoDienThoai, chuanHoaMaHoaDon, danhSachGoi } from "@/lib/lark/tra-hau-ky";
import { maGoiLark } from "@/lib/gallery/goi-chup-lark";
import { tinhTieuDeBoAnhQuanTri, dongThongTinBoAnhQuanTri } from "@/lib/utils/dinh-dang";
import { dinhDangNghin, docSoNghin } from "@/lib/utils/so-tien-nhap";

function dong(id: string, hd: string, sdt: string, extra: Record<string, unknown> = {}) {
  return {
    record_id: id,
    fields: {
      "HĐ Tổng": [{ text: hd, type: "text" }],
      "SDT KH": [{ fullPhoneNum: sdt }],
      ...extra,
    },
  };
}

describe("BB-325: locDongKhop — mã hóa đơn khớp tuyệt đối + 9 số cuối SĐT", () => {
  const ds = [
    dong("rec1", "HD_20260901#57", "0901000001"),
    dong("rec2", "HD_20260901#572", "0901000001"),
    dong("rec3", "HD_20260901#57", "0912345678"),
  ];

  it("'#57' KHÔNG khớp nhầm '#572', và SĐT khác bị loại", () => {
    expect(locDongKhop(ds, "HD_20260901#57", "0901000001").map((r) => r.record_id)).toEqual(["rec1"]);
  });

  it("SĐT dạng +84 / có dấu cách vẫn khớp; mã viết thường vẫn khớp", () => {
    expect(locDongKhop(ds, " hd_20260901#57 ", "+84 901 000 001").map((r) => r.record_id)).toEqual(["rec1"]);
  });

  it("thiếu mã hoặc SĐT quá ngắn → không khớp gì (không trả bừa)", () => {
    expect(locDongKhop(ds, "", "0901000001")).toEqual([]);
    expect(locDongKhop(ds, "HD_20260901#57", "0901")).toEqual([]);
  });

  it("chuẩn hoá phụ trợ", () => {
    expect(duoiSoDienThoai("+84 901-000-001")).toBe("901000001");
    expect(chuanHoaMaHoaDon(" hd_1#2 ")).toBe("HD_1#2");
  });
});

describe("BB-325: bocDongHauKy — thông tin điền sẵn lấy từ Lark, không bịa", () => {
  it("bóc tên mẹ, SĐT, tên bé trong ngoặc, gói, ngày chụp giờ VN, số file edit", () => {
    // 2026-09-01 00:00 giờ VN = 2026-08-31T17:00Z
    const ms = Date.UTC(2026, 7, 31, 17, 0, 0);
    const r = bocDongHauKy(
      dong("rec9", "HD_20260901#01", "0901000001", {
        "Tên KH": [{ text: "Nguyễn Thị Mai", type: "text" }],
        "Link ảnh gửi khách": { link: "https://drive.google.com/drive/folders/SEED_FOLDER_ID_001", text: "FB Mẹ Mai ( Bé Na )" },
        "Gói chụp": [{ text: "Baby 02", type: "text" }],
        "Ngày Chụp": [ms],
        "Tổng file edit": "15",
        "Trạng Thái": "Chờ khách chọn",
      }),
      "https://lark.example/base/x?record=rec9",
    );
    expect(r).toEqual({
      recordId: "rec9",
      maHoaDon: "HD_20260901#01",
      tenMe: "Nguyễn Thị Mai",
      soDienThoai: "0901000001",
      tenBe: "Bé Na",
      goiChup: "Baby 02",
      ngayChup: "2026-09-01",
      tongFileEdit: 15,
      trangThai: "Chờ khách chọn",
      linkLark: "https://lark.example/base/x?record=rec9",
    });
  });

  it("không có ngoặc trong nhãn thư mục → tên bé TRỐNG (không đoán); ô trống → null", () => {
    const r = bocDongHauKy(
      dong("rec8", "HD_1#1", "0901000001", {
        "Link ảnh gửi khách": { link: "https://drive.google.com/x", text: "FB Mẹ Mai" },
      }),
    );
    expect(r.tenBe).toBe("");
    expect(r.ngayChup).toBeNull();
    expect(r.tongFileEdit).toBeNull();
  });
});

describe("BB-325: tên hiển thị quản trị — TÊN MẸ làm tiêu đề", () => {
  it("bộ mới tạo (lỗi.JPG): tiêu đề là tên mẹ, KHÔNG phải 'Gói … · tên'", () => {
    const { tieuDe } = tinhTieuDeBoAnhQuanTri({
      packageName: "Gói Cao cấp",
      babyNickname: null,
      babyFullName: null,
      customerName: "Nguyễn Thị Mai",
      duPhong: "HD_20260901#01",
    });
    expect(tieuDe).toBe("Nguyễn Thị Mai");
  });

  it("tên che 'KH · …' không phải tên người → lùi về tên bé", () => {
    const { tieuDe } = tinhTieuDeBoAnhQuanTri({
      babyNickname: "Na",
      babyFullName: null,
      customerName: "KH · 1a2b3c4d5e6f",
      duPhong: "HD_1#1",
    });
    expect(tieuDe).toBe("Bé Na");
  });

  it("dòng thông tin: tên bé · SĐT · mã hóa đơn · gói (chỉ phần có dữ liệu)", () => {
    expect(
      dongThongTinBoAnhQuanTri({
        tieuDe: "Nguyễn Thị Mai",
        babyNickname: "Na",
        babyFullName: "Trần Bảo Na",
        customerPhone: "0901000001",
        maHoaDon: "HD_20260901#01",
        packageName: "Baby 02",
      }),
    ).toBe("Bé Na · 0901 000 001 · HD_20260901#01 · Baby 02");
    expect(dongThongTinBoAnhQuanTri({ tieuDe: "Bé Na", babyNickname: "Na", customerPhone: null })).toBe("");
  });
});

describe("BB-325: ô giá ảnh thêm có dấu chấm ngăn nghìn", () => {
  it("50000 → '50.000' và đọc ngược '50.000' → 50000", () => {
    expect(dinhDangNghin(50000)).toBe("50.000");
    expect(docSoNghin("50.000")).toBe(50000);
    expect(docSoNghin("1.250.000đ")).toBe(1250000);
    expect(docSoNghin("")).toBe(0);
  });
});

describe("BB-325: gói chụp lấy từ Lark", () => {
  it("ô 'Gói chụp' nhiều mục được tách, không dính liền 'Fam 04Thêm set chụp'", () => {
    expect(danhSachGoi([{ text: "Fam 04", type: "text" }, { text: "Thêm set chụp", type: "text" }])).toEqual([
      "Fam 04",
      "Thêm set chụp",
    ]);
    expect(danhSachGoi(undefined)).toEqual([]);
  });

  it("mã gói Lark không dấu, ổn định theo tên", () => {
    expect(maGoiLark("Baby 02")).toBe("LARK-BABY-02");
    expect(maGoiLark("Gia đình Ông Bà")).toBe("LARK-GIA-DINH-ONG-BA");
  });
});
