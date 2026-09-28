/**
 * BB-311 (mục A, admin 28/09/2026) — `scripts/don-dem-het-han.ts`.
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao): đổi `Math.floor` thành
 * `Math.ceil` trong `tinhSoNgayGiuDem` → ca "N làm tròn XUỐNG, không lên"
 * phải ĐỎ (N sẽ lớn hơn 1 so với kỳ vọng ở biên).
 */
import { describe, it, expect } from "vitest";
import {
  tinhSoNgayGiuDem,
  duongDanDemBia,
  boMoiMoiTuanTuLark,
  boCanDonDemHetHan,
  chayDonDemHetHan,
  TRAN_MB_MAC_DINH,
  N_NGAY_TOI_THIEU,
  N_NGAY_TOI_DA,
} from "../../scripts/don-dem-het-han";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("tinhSoNgayGiuDem — N ngày giữ đệm, thuần", () => {
  it("lượng khách cao -> N nhỏ (giữ ngắn ngày để không vỡ trần)", () => {
    // 50 bộ/tuần × 1.23MB × N/7 <= 614.4 -> N <= 69.86 -> nhưng thử số lớn hơn để N thật sự nhỏ
    const n = tinhSoNgayGiuDem({ boMoiMoiTuan: 500, dungLuongTrungBinhMoiBoMB: 1.23 });
    expect(n).toBeLessThan(10);
    expect(n).toBeGreaterThanOrEqual(N_NGAY_TOI_THIEU);
  });

  it("lượng khách thấp -> N lớn nhưng bị CHẶN ở trần tối đa", () => {
    const n = tinhSoNgayGiuDem({ boMoiMoiTuan: 0.1, dungLuongTrungBinhMoiBoMB: 1.23 });
    expect(n).toBe(N_NGAY_TOI_DA);
  });

  it("lượng khách = 0 -> không có cơ sở tính, trả về trần tối đa (AN TOÀN, không xoá nhầm)", () => {
    expect(tinhSoNgayGiuDem({ boMoiMoiTuan: 0, dungLuongTrungBinhMoiBoMB: 1.23 })).toBe(N_NGAY_TOI_DA);
  });

  it("dung lượng mỗi bộ = 0 -> cũng trả về trần tối đa", () => {
    expect(tinhSoNgayGiuDem({ boMoiMoiTuan: 20, dungLuongTrungBinhMoiBoMB: 0 })).toBe(N_NGAY_TOI_DA);
  });

  it("N không bao giờ thấp hơn N_NGAY_TOI_THIEU dù lượng khách cực cao", () => {
    const n = tinhSoNgayGiuDem({ boMoiMoiTuan: 100_000, dungLuongTrungBinhMoiBoMB: 100 });
    expect(n).toBe(N_NGAY_TOI_THIEU);
  });

  it("công thức đúng: N = floor(tranMB / (boMoiMoiTuan/7 × dungLuongMB))", () => {
    // 7 bộ/tuần = 1 bộ/ngày × 10MB/bộ = 10MB/ngày; trần 100MB -> N = 10
    const n = tinhSoNgayGiuDem({ boMoiMoiTuan: 7, dungLuongTrungBinhMoiBoMB: 10, tranMB: 100, nMax: 999 });
    expect(n).toBe(10);
  });

  it("làm tròn XUỐNG (floor), không tròn lên — biên đúng ngay dưới một ngày tròn", () => {
    // 7 bộ/tuần × 10MB = 10MB/ngày; trần 105MB -> 10.5 ngày -> floor = 10, KHÔNG phải 11.
    const n = tinhSoNgayGiuDem({ boMoiMoiTuan: 7, dungLuongTrungBinhMoiBoMB: 10, tranMB: 105, nMax: 999 });
    expect(n).toBe(10);
  });

  it("TRAN_MB_MAC_DINH đúng 60% của 1GB (1024MB)", () => {
    expect(TRAN_MB_MAC_DINH).toBeCloseTo(0.6 * 1024, 5);
  });
});

describe("duongDanDemBia — 4 đường dẫn ứng viên (2 cỡ × 2 đuôi)", () => {
  it("trả đúng 4 đường dẫn cho một coverPhotoId", () => {
    expect(duongDanDemBia("photo-abc")).toEqual([
      "photo-abc/1600.jpg",
      "photo-abc/1600.webp",
      "photo-abc/2048.jpg",
      "photo-abc/2048.webp",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Client Supabase giả — chỉ giả lập biên giới, không chạm bb-dev.
// ---------------------------------------------------------------------------
function taoClientGia(opts: {
  shootsGanDay: number;
  deliveriesQuaHan: string[]; // gallery_id
  galleriesXong: { id: string; cover_photo_id: string | null; status: string; updated_at: string }[];
  doiTuongTheoBia: Record<string, { name: string; metadata: { size?: number } | null }[]>;
}) {
  const removeCalls: string[][] = [];
  const client = {
    from(bang: string) {
      if (bang === "shoots") {
        return {
          select: () => ({
            gte: async () => ({ count: opts.shootsGanDay, data: null, error: null }),
          }),
        };
      }
      if (bang === "deliveries") {
        return {
          select: () => ({
            not: () => ({
              lt: async () => ({
                data: opts.deliveriesQuaHan.map((gallery_id) => ({ gallery_id, delivered_at: "2026-01-01" })),
                error: null,
              }),
            }),
          }),
        };
      }
      if (bang === "galleries") {
        return {
          select: () => ({
            in: async () => ({ data: opts.galleriesXong, error: null }),
          }),
        };
      }
      throw new Error(`bảng không mong đợi: ${bang}`);
    },
    storage: {
      from(bucket: string) {
        if (bucket !== "thumbnails") throw new Error(`bucket không mong đợi: ${bucket}`);
        return {
          list: async (prefix: string) => ({ data: opts.doiTuongTheoBia[prefix] ?? [], error: null }),
          remove: async (paths: string[]) => {
            removeCalls.push(paths);
            return { data: null, error: null };
          },
        };
      },
    },
  };
  return { client: client as unknown as SupabaseClient, removeCalls };
}

describe("boMoiMoiTuanTuLark — chia đều số shoots 4 tuần gần nhất", () => {
  it("20 shoots trong 4 tuần -> 5 bộ/tuần", async () => {
    const { client } = taoClientGia({
      shootsGanDay: 20,
      deliveriesQuaHan: [],
      galleriesXong: [],
      doiTuongTheoBia: {},
    });
    expect(await boMoiMoiTuanTuLark(client)).toBe(5);
  });
});

describe("boCanDonDemHetHan — chỉ lấy bộ ĐÃ XONG, quá N ngày, có ảnh bìa", () => {
  it("delivered + có trong deliveries quá hạn -> được chọn", async () => {
    const { client } = taoClientGia({
      shootsGanDay: 0,
      deliveriesQuaHan: ["g1"],
      galleriesXong: [{ id: "g1", cover_photo_id: "cover-1", status: "delivered", updated_at: "2026-01-01" }],
      doiTuongTheoBia: {},
    });
    const ket = await boCanDonDemHetHan(client, 30);
    expect(ket).toEqual([{ galleryId: "g1", coverPhotoId: "cover-1" }]);
  });

  it("KHÔNG có cover_photo_id -> bị loại (không có gì để dọn)", async () => {
    const { client } = taoClientGia({
      shootsGanDay: 0,
      deliveriesQuaHan: [],
      galleriesXong: [{ id: "g2", cover_photo_id: null, status: "expired", updated_at: "2000-01-01" }],
      doiTuongTheoBia: {},
    });
    const ket = await boCanDonDemHetHan(client, 30);
    expect(ket).toEqual([]);
  });

  it("archived nhưng updated_at GẦN ĐÂY (chưa quá N ngày) -> KHÔNG bị chọn", async () => {
    const ganDay = new Date().toISOString();
    const { client } = taoClientGia({
      shootsGanDay: 0,
      deliveriesQuaHan: [],
      galleriesXong: [{ id: "g3", cover_photo_id: "cover-3", status: "archived", updated_at: ganDay }],
      doiTuongTheoBia: {},
    });
    const ket = await boCanDonDemHetHan(client, 30);
    expect(ket).toEqual([]);
  });
});

describe("chayDonDemHetHan — chỉ xoá đối tượng LỚN (1600/2048) của bìa, gộp MB", () => {
  it("chế độ xem trước (ghiThat=false): KHÔNG gọi remove(), vẫn báo đúng MB sẽ giải phóng", async () => {
    const { client, removeCalls } = taoClientGia({
      shootsGanDay: 4, // 1 bộ/tuần
      deliveriesQuaHan: ["g1"],
      galleriesXong: [{ id: "g1", cover_photo_id: "cover-1", status: "delivered", updated_at: "2000-01-01" }],
      doiTuongTheoBia: {
        "cover-1": [
          { name: "1600.jpg", metadata: { size: 463_800 } },
          { name: "2048.webp", metadata: { size: 793_700 } },
          { name: "200.jpg", metadata: { size: 18_800 } }, // KHÔNG phải cỡ bìa -> bỏ qua
        ],
      },
    });

    const ket = await chayDonDemHetHan(client, { ghiThat: false });
    expect(ket.soBoDaDon).toBe(1);
    expect(ket.mbGiaiPhong).toBeCloseTo((463_800 + 793_700) / (1024 * 1024), 5);
    expect(removeCalls.length).toBe(0); // CHỈ xem trước — không xoá
  });

  it("chế độ --write: gọi remove() với ĐÚNG hai đối tượng lớn, KHÔNG đụng 200.jpg", async () => {
    const { client, removeCalls } = taoClientGia({
      shootsGanDay: 4,
      deliveriesQuaHan: ["g1"],
      galleriesXong: [{ id: "g1", cover_photo_id: "cover-1", status: "delivered", updated_at: "2000-01-01" }],
      doiTuongTheoBia: {
        "cover-1": [
          { name: "1600.jpg", metadata: { size: 463_800 } },
          { name: "200.jpg", metadata: { size: 18_800 } },
        ],
      },
    });

    await chayDonDemHetHan(client, { ghiThat: true });
    expect(removeCalls).toEqual([["cover-1/1600.jpg"]]);
  });

  it("bộ chưa có gì trong đệm (list rỗng) -> không tính vào soBoDaDon", async () => {
    const { client } = taoClientGia({
      shootsGanDay: 4,
      deliveriesQuaHan: ["g1"],
      galleriesXong: [{ id: "g1", cover_photo_id: "cover-1", status: "delivered", updated_at: "2000-01-01" }],
      doiTuongTheoBia: {},
    });
    const ket = await chayDonDemHetHan(client, { ghiThat: false });
    expect(ket.soBoDaDon).toBe(0);
    expect(ket.mbGiaiPhong).toBe(0);
  });
});
