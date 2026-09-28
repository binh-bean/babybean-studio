/**
 * BB-311 (P0 mục 1b) — `scripts/don-dem-hong.ts`.
 *
 * Chỉ kiểm các hàm THUẦN (lọc/tính toán) và lớp duyệt/xoá qua CLIENT GIẢ tự
 * dựng (đúng khuôn `tests/unit/bb-300-nap-lai-tu-lark.test.ts`) — không chạm
 * Storage thật ở đây (Storage thật được kiểm bằng cách CHẠY LỆNH XEM TRƯỚC
 * thật, dán kết quả vào bàn giao, không phải bằng phép thử tự động).
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao): đổi `NGUONG_BYTE_HONG` từ
 * 1024 xuống 0 → ca "đối tượng 78 byte bị coi là hỏng" phải ĐỎ.
 */
import { describe, it, expect } from "vitest";
import {
  laTenTepNhoCu,
  laDoiTuongIcon,
  locDoiTuongCanXoa,
  tongByte,
  formatMB,
  duyetToanBoBucket,
  xoaTheoLo,
  NGUONG_BYTE_HONG,
  type ClientDuyet,
  type DoiTuong,
} from "../../scripts/don-dem-hong";

describe("laTenTepNhoCu — nhận diện cỡ đệm nhỏ đã bỏ dùng", () => {
  it("200.jpg / 400.jpg / 800.jpg / 800.webp là nhỏ cũ", () => {
    expect(laTenTepNhoCu("200.jpg")).toBe(true);
    expect(laTenTepNhoCu("400.jpg")).toBe(true);
    expect(laTenTepNhoCu("800.jpg")).toBe(true);
    expect(laTenTepNhoCu("800.webp")).toBe(true);
  });

  it("1600.jpg / 2048.webp (ảnh bìa) KHÔNG phải nhỏ cũ", () => {
    expect(laTenTepNhoCu("1600.jpg")).toBe(false);
    expect(laTenTepNhoCu("2048.webp")).toBe(false);
  });

  it("tên tệp không khớp mẫu -> false, không ném lỗi", () => {
    expect(laTenTepNhoCu("tong-so-dong.json")).toBe(false);
    expect(laTenTepNhoCu("")).toBe(false);
    expect(laTenTepNhoCu("192.jpg")).toBe(false); // cỡ icon, không phải THUMBNAIL_WIDTHS
  });
});

describe("laDoiTuongIcon — nhận diện thư mục icon/", () => {
  it("đường dẫn bắt đầu bằng icon/ là đối tượng icon", () => {
    expect(laDoiTuongIcon("icon/abc-123/192.jpg")).toBe(true);
  });
  it("đường dẫn photoId thường KHÔNG phải icon", () => {
    expect(laDoiTuongIcon("abc-123/800.jpg")).toBe(false);
  });
});

describe("locDoiTuongCanXoa — ba chế độ", () => {
  const mau: DoiTuong[] = [
    { path: "photo-1/200.jpg", size: 78 }, // hỏng (nhỏ, và cũng là cỡ nhỏ)
    { path: "photo-1/800.jpg", size: 135_000 }, // cỡ nhỏ cũ, KHÔNG hỏng
    { path: "photo-1/1600.jpg", size: 463_000 }, // ảnh bìa, không hỏng không nhỏ
    { path: "icon/gallery-1/192.jpg", size: 50 }, // icon hỏng
    { path: "icon/gallery-1/512.jpg", size: 30_000 }, // icon bình thường
  ];

  it('chế độ "hong" (mặc định): chỉ lấy < 1KB, KỂ CẢ trong icon/', () => {
    const ket = locDoiTuongCanXoa(mau, "hong");
    expect(ket.map((d) => d.path).sort()).toEqual(["icon/gallery-1/192.jpg", "photo-1/200.jpg"]);
  });

  it('chế độ "nho": lấy cỡ 200/400/800, BỎ QUA icon/ (icon vẫn đúng ý dù nhỏ)', () => {
    const ket = locDoiTuongCanXoa(mau, "nho");
    expect(ket.map((d) => d.path).sort()).toEqual(["photo-1/200.jpg", "photo-1/800.jpg"]);
  });

  it('chế độ "tat_ca": lấy MỌI đối tượng, không lọc gì', () => {
    const ket = locDoiTuongCanXoa(mau, "tat_ca");
    expect(ket.length).toBe(mau.length);
  });
});

describe("tongByte / formatMB", () => {
  it("cộng đúng tổng byte, đổi ra MB với 2 chữ số thập phân", () => {
    const doiTuongs: DoiTuong[] = [{ path: "a", size: 1_048_576 }, { path: "b", size: 524_288 }];
    expect(tongByte(doiTuongs)).toBe(1_572_864);
    expect(formatMB(tongByte(doiTuongs))).toBe("1.50");
  });
});

describe("NGUONG_BYTE_HONG — kiểm ngược sẽ hoàn nguyên đúng dòng này", () => {
  it("ngưỡng đúng bằng 1024 (1KB) như tài liệu đầu tệp mô tả", () => {
    expect(NGUONG_BYTE_HONG).toBe(1024);
  });
});

// ---------------------------------------------------------------------------
// Client Storage giả — chỉ giả lập biên giới list()/remove(), không chạm bb-dev.
// ---------------------------------------------------------------------------
function taoClientGia(cay: Record<string, { name: string; size?: number }[]>) {
  const removeCalls: string[][] = [];
  const client: ClientDuyet = {
    storage: {
      from() {
        return {
          async list(path: string, _opts: { limit: number; offset: number }) {
            const items = cay[path] ?? [];
            return {
              data: items.map((it) => ({
                name: it.name,
                id: it.size === undefined ? null : "id",
                metadata: it.size === undefined ? null : { size: it.size },
              })),
              error: null,
            };
          },
          async remove(paths: string[]) {
            removeCalls.push(paths);
            return { data: null, error: null };
          },
        };
      },
    },
  };
  return { client, removeCalls };
}

describe("duyetToanBoBucket — duyệt hai tầng (thư mục -> tệp), gồm cả icon/", () => {
  it("liệt kê đúng đường dẫn đầy đủ cho photoId thường và cho icon/<galleryId>/", () => {
    const { client } = taoClientGia({
      "": [{ name: "photo-1" }, { name: "icon" }], // thư mục (không có size)
      "photo-1": [
        { name: "800.jpg", size: 135_000 },
        { name: "1600.jpg", size: 463_000 },
      ],
      icon: [{ name: "gallery-1" }],
      "icon/gallery-1": [{ name: "192.jpg", size: 12_000 }],
    });

    return duyetToanBoBucket(client).then((ket) => {
      expect(ket.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
        { path: "icon/gallery-1/192.jpg", size: 12_000 },
        { path: "photo-1/1600.jpg", size: 463_000 },
        { path: "photo-1/800.jpg", size: 135_000 },
      ]);
    });
  });
});

describe("xoaTheoLo — chia lô, gọi remove() nhiều lần khi vượt kích thước lô", () => {
  it("50 đường dẫn, lô 20 -> 3 lượt gọi remove()", async () => {
    const { client, removeCalls } = taoClientGia({});
    const paths = Array.from({ length: 50 }, (_, i) => `photo-${i}/200.jpg`);
    const soDaXoa = await xoaTheoLo(client, paths, 20);
    expect(soDaXoa).toBe(50);
    expect(removeCalls.length).toBe(3);
    expect(removeCalls[0]!.length).toBe(20);
    expect(removeCalls[2]!.length).toBe(10);
  });
});
