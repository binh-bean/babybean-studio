/**
 * BB-260 — tiện ích kỳ báo cáo (giờ Việt Nam, kỳ trước cùng độ dài).
 */

import { describe, it, expect } from "vitest";
import {
  homNay,
  nNgayGanDay,
  thangNay,
  thangTruoc,
  kyTruocCungDoDai,
  chenhLechPhanTram,
  dinhDangNgayVN,
  ngayVnTuChuoi,
  trungVi,
  chiaMoc,
  nhanMoc,
} from "@/lib/bao-cao/ky";

describe("BB-260: ranh giới ngày theo giờ VN", () => {
  it("23:30 giờ VN ngày 31/12 (16:30 UTC 31/12) vẫn thuộc NGÀY 31/12 giờ VN", () => {
    // 16:30 UTC 31/12 = 23:30 giờ VN (+7) 31/12 — chưa sang ngày mới.
    const d = new Date("2025-12-31T16:30:00Z");
    const k = homNay(d);
    expect(dinhDangNgayVN(k.tu)).toBe("2025-12-31");
    expect(dinhDangNgayVN(k.den)).toBe("2026-01-01");
  });

  it("00:30 UTC (07:30 giờ VN) đã sang ngày mới giờ VN dù còn 31/12 giờ UTC", () => {
    // 00:30 UTC 1/1 = 07:30 giờ VN 1/1.
    const d = new Date("2026-01-01T00:30:00Z");
    const k = homNay(d);
    expect(dinhDangNgayVN(k.tu)).toBe("2026-01-01");
  });

  it("7 ngày gần đây tính CẢ hôm nay", () => {
    const now = new Date("2026-03-15T04:00:00Z"); // 11:00 giờ VN 15/3
    const k = nNgayGanDay(now, 7);
    expect(dinhDangNgayVN(k.tu)).toBe("2026-03-09");
    expect(dinhDangNgayVN(new Date(k.den.getTime() - 1))).toBe("2026-03-15");
  });
});

describe("BB-260: tháng này / tháng trước, kể cả qua năm mới", () => {
  it("tháng trước khi đang ở tháng 1 phải trả về tháng 12 NĂM TRƯỚC", () => {
    const now = new Date("2026-01-15T04:00:00Z"); // giữa tháng 1/2026 giờ VN
    const k = thangTruoc(now);
    expect(dinhDangNgayVN(k.tu)).toBe("2025-12-01");
    expect(dinhDangNgayVN(k.den)).toBe("2026-01-01");
  });

  it("tháng này của tháng 1 là 1/1 -> 1/2", () => {
    const now = new Date("2026-01-15T04:00:00Z");
    const k = thangNay(now);
    expect(dinhDangNgayVN(k.tu)).toBe("2026-01-01");
    expect(dinhDangNgayVN(k.den)).toBe("2026-02-01");
  });
});

describe("BB-260: kỳ trước cùng độ dài", () => {
  it("kỳ 7 ngày -> kỳ trước cũng đúng 7 ngày, liền kề ngay trước", () => {
    const now = new Date("2026-03-15T04:00:00Z");
    const k = nNgayGanDay(now, 7);
    const truoc = kyTruocCungDoDai(k);
    expect(truoc.den.getTime()).toBe(k.tu.getTime());
    expect(truoc.den.getTime() - truoc.tu.getTime()).toBe(k.den.getTime() - k.tu.getTime());
    expect(dinhDangNgayVN(truoc.tu)).toBe("2026-03-02");
  });

  it("kỳ tháng 2 (28 ngày, 2026 không nhuận) -> kỳ trước là tháng 1 nhưng CÙNG SỐ NGÀY, không phải cả tháng 1", () => {
    const k = thangNay(new Date("2026-02-10T04:00:00Z"));
    const truoc = kyTruocCungDoDai(k);
    const soNgayKyNay = (k.den.getTime() - k.tu.getTime()) / 86_400_000;
    const soNgayKyTruoc = (truoc.den.getTime() - truoc.tu.getTime()) / 86_400_000;
    expect(soNgayKyTruoc).toBe(soNgayKyNay);
  });
});

describe("BB-260: % chênh lệch so kỳ trước", () => {
  it("tăng gấp đôi -> +100%", () => {
    expect(chenhLechPhanTram(20, 10)).toBe(100);
  });
  it("kỳ trước = 0, kỳ này > 0 -> không tính được (null)", () => {
    expect(chenhLechPhanTram(5, 0)).toBeNull();
  });
  it("cả hai kỳ đều 0 -> 0%, không phải null", () => {
    expect(chenhLechPhanTram(0, 0)).toBe(0);
  });
  it("thiếu kỳ trước -> null", () => {
    expect(chenhLechPhanTram(5, undefined)).toBeNull();
  });
});

describe("BB-260: ngayVnTuChuoi diễn giải query string", () => {
  it("ném lỗi rõ ràng khi chuỗi sai định dạng", () => {
    expect(() => ngayVnTuChuoi("15/03/2026")).toThrow();
  });
  it("chuỗi hợp lệ -> đúng nửa đêm giờ VN của ngày đó", () => {
    const d = ngayVnTuChuoi("2026-03-15");
    expect(dinhDangNgayVN(d)).toBe("2026-03-15");
  });
});

describe("BB-260: trungVi", () => {
  it("mảng rỗng -> null", () => {
    expect(trungVi([])).toBeNull();
  });
  it("số lẻ phần tử -> phần tử giữa", () => {
    expect(trungVi([5, 1, 3])).toBe(3);
  });
  it("số chẵn phần tử -> trung bình hai phần tử giữa", () => {
    expect(trungVi([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("BB-260: chiaMoc / nhanMoc", () => {
  it("chia 3 ngày thành 3 mốc theo ngày", () => {
    const k = { tu: ngayVnTuChuoi("2026-03-01"), den: ngayVnTuChuoi("2026-03-01", 3) };
    const moc = chiaMoc(k, "ngay");
    expect(moc).toHaveLength(3);
    expect(moc.map((m) => nhanMoc(m.tu, "ngay"))).toEqual(["01/03", "02/03", "03/03"]);
  });

  it("gom theo tháng không trôi mốc qua tháng 31 ngày", () => {
    const k = { tu: ngayVnTuChuoi("2026-01-01"), den: ngayVnTuChuoi("2026-04-01") };
    const moc = chiaMoc(k, "thang");
    expect(moc.map((m) => nhanMoc(m.tu, "thang"))).toEqual(["01/2026", "02/2026", "03/2026"]);
  });
});
