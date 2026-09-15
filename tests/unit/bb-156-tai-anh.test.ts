/**
 * BB-156 — tải ảnh về máy khách, theo lô.
 *
 * Ba thứ được canh ở đây, và cả ba đều là thứ chỉ lộ ra ở nhà khách:
 * tải HẾT chứ không dừng giữa chừng, dừng NGAY khi máy hết chỗ, và nói được
 * bộ ảnh nặng bao nhiêu trước khi ba mẹ bấm.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  taiTheoLo,
  doDocDuocDungLuong,
  laLoiHetCho,
  SO_ANH_MOI_LO,
} from "@/lib/utils/tai-anh";

function dungDanhSach(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `anh-${i}`, fileName: `IMG_${i}.jpg` }));
}

describe("BB-156: tải ảnh theo lô", () => {
  let daGoi: string[];

  beforeEach(() => {
    daGoi = [];
    vi.stubGlobal("fetch", async (url: string) => {
      daGoi.push(url);
      return { ok: true, status: 200, blob: async () => new Blob(["x"]) } as unknown as Response;
    });
    vi.stubGlobal("URL", {
      createObjectURL: () => "blob:gia",
      revokeObjectURL: () => {},
    });
    const a = { href: "", download: "", click: () => {}, remove: () => {} };
    vi.stubGlobal("document", {
      createElement: () => a,
      body: { appendChild: () => {} },
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("Lô 10–20 ảnh như chủ studio chốt", () => {
    expect(SO_ANH_MOI_LO).toBeGreaterThanOrEqual(10);
    expect(SO_ANH_MOI_LO).toBeLessThanOrEqual(20);
  });

  it("Tải HẾT cả bộ, không dừng ở cuối lô đầu", async () => {
    const xong = await taiTheoLo(dungDanhSach(37), () => {}, () => false);
    expect(xong).toBe(37);
    expect(daGoi.length).toBe(37);
    // đúng đường ảnh, đúng cờ tải
    // BB-161: tải là ảnh GỐC, không gửi cỡ.
    expect(daGoi[0]).toContain("/api/img/anh-0?tai=1");
  });

  it("Bấm dừng thì dừng, không tải nốt cho xong", async () => {
    let dem = 0;
    const xong = await taiTheoLo(dungDanhSach(50), () => { dem += 1; }, () => dem > 5);
    expect(xong).toBeLessThan(50);
    expect(daGoi.length).toBeLessThan(50);
  });

  /**
   * Ca quan trọng nhất với ba mẹ: máy hết chỗ giữa chừng. Phải DỪNG và nói rõ
   * đã tải được bao nhiêu — tải tiếp chỉ là bắt họ chờ thêm để nhận thêm lỗi.
   */
  it("Máy hết chỗ -> dừng ngay và báo rõ đã tải được bao nhiêu", async () => {
    let lan = 0;
    vi.stubGlobal("fetch", async () => {
      lan += 1;
      if (lan > 3) {
        const e = new Error("The quota has been exceeded.");
        e.name = "QuotaExceededError";
        throw e;
      }
      return { ok: true, status: 200, blob: async () => new Blob(["x"]) } as unknown as Response;
    });

    const moc: string[] = [];
    const xong = await taiTheoLo(dungDanhSach(40), (t) => { if (t.loi) moc.push(t.loi); }, () => false);

    expect(xong).toBe(3);
    expect(moc.length).toBe(1);
    expect(moc[0]).toContain("hết dung lượng");
    expect(moc[0]).toContain("3/40");
  });

  it("Lỗi lẻ một ảnh thì đi tiếp, không bỏ cả bộ", async () => {
    let lan = 0;
    vi.stubGlobal("fetch", async () => {
      lan += 1;
      if (lan === 2) throw new Error("mạng chập chờn");
      return { ok: true, status: 200, blob: async () => new Blob(["x"]) } as unknown as Response;
    });
    const xong = await taiTheoLo(dungDanhSach(10), () => {}, () => false);
    expect(xong).toBe(9);
  });

  it("Nhận diện lỗi hết chỗ của cả ba trình duyệt", () => {
    const q = new Error("x"); q.name = "QuotaExceededError";
    const ff = new Error("y"); ff.name = "NS_ERROR_FILE_NO_DEVICE_SPACE";
    expect(laLoiHetCho(q)).toBe(true);
    expect(laLoiHetCho(ff)).toBe(true);
    expect(laLoiHetCho(new Error("Not enough space on disk"))).toBe(true);
    expect(laLoiHetCho(new Error("mạng chập chờn"))).toBe(false);
  });

  it("Nói dung lượng bằng chữ ba mẹ đọc được", () => {
    expect(doDocDuocDungLuong(7_224_811_520)).toBe("6.7 GB");
    expect(doDocDuocDungLuong(432_013_312)).toBe("412 MB");
    expect(doDocDuocDungLuong(0)).toBe("chưa rõ");
    expect(doDocDuocDungLuong(null)).toBe("chưa rõ");
  });
});
