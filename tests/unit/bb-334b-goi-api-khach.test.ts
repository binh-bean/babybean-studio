/**
 * BB-334B — `goiApiKhach` (tiêu đề `x-bb-bo` luôn có trên trang /k/<mã>/<n>)
 * và tra bộ theo số thứ tự. Giả lập `fetch` (biên giới mạng), không giả lập gì
 * của React.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  goiApiKhach,
  datBoAnhKhach,
  boAnhKhachHienTai,
  themTieuDeBo,
  laApiKhach,
  TIEU_DE_BO_ANH,
} from "@/lib/utils/goi-api-khach";
import {
  traBoTheoSoThuTu,
  tenBoHienThi,
  ngayChupHienThi,
  xepBoTrenTrang,
  loaiChip,
  type BoAnhGiaDinh,
} from "@/lib/utils/trang-gia-dinh";

const BO1 = "11111111-1111-4111-8111-111111111111";
const BO2 = "22222222-2222-4222-8222-222222222222";

type GoiGhi = { url: string; headers: Headers; method: string; body: unknown };

function giaFetch(traLoi: (url: string, lan: number) => number) {
  const ghi: GoiGhi[] = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    ghi.push({ url, headers: new Headers(init?.headers), method: init?.method ?? "GET", body: init?.body });
    const status = traLoi(url, ghi.length);
    return new Response(JSON.stringify({ data: {} }), { status });
  });
  return { fn, ghi };
}

describe("goiApiKhach — x-bb-bo trên trang /k/<mã>/<n>", () => {
  const fetchGoc = globalThis.fetch;
  const coWindow = "window" in globalThis;

  beforeEach(() => {
    // `datBoAnhKhach` chỉ chạy ở trình duyệt — dựng `window` tối thiểu.
    (globalThis as Record<string, unknown>).window = globalThis;
  });
  afterEach(() => {
    datBoAnhKhach(null);
    globalThis.fetch = fetchGoc;
    if (!coWindow) delete (globalThis as Record<string, unknown>).window;
  });

  it("chưa đặt bộ (trang /g/ cũ): fetch trơn, KHÔNG có x-bb-bo", async () => {
    const { fn, ghi } = giaFetch(() => 200);
    globalThis.fetch = fn as unknown as typeof fetch;
    await goiApiKhach("/api/g/selection", { method: "PATCH", body: "{}" });
    expect(ghi).toHaveLength(1);
    expect(ghi[0]!.headers.has(TIEU_DE_BO_ANH)).toBe(false);
  });

  it("đã đặt bộ: MỌI lượt /api/g/* mang x-bb-bo đúng bộ, giữ nguyên tiêu đề khác", async () => {
    const { fn, ghi } = giaFetch(() => 200);
    globalThis.fetch = fn as unknown as typeof fetch;
    datBoAnhKhach({ ma: "maGiaDinh", galleryId: BO1 });

    await goiApiKhach("/api/g/gallery?token=maGiaDinh", { cache: "no-store" });
    await goiApiKhach("/api/g/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ a: 1 }),
    });
    await goiApiKhach(`/api/g/photos?limit=200`);
    await goiApiKhach("/api/g/tuc-thi", { headers: new Headers({ "x-khac": "1" }) });

    expect(ghi.map((g) => g.headers.get(TIEU_DE_BO_ANH))).toEqual([BO1, BO1, BO1, BO1]);
    expect(ghi[1]!.headers.get("content-type")).toBe("application/json");
    expect(ghi[1]!.method).toBe("POST");
    expect(ghi[1]!.body).toBe(JSON.stringify({ a: 1 }));
    expect(ghi[3]!.headers.get("x-khac")).toBe("1");
  });

  it("đổi bộ (tab khác / trang khác) → tiêu đề theo bộ MỚI, không dính bộ cũ", async () => {
    const { fn, ghi } = giaFetch(() => 200);
    globalThis.fetch = fn as unknown as typeof fetch;
    datBoAnhKhach({ ma: "m", galleryId: BO1 });
    await goiApiKhach("/api/g/selection", { method: "PATCH", body: "{}" });
    datBoAnhKhach({ ma: "m", galleryId: BO2 });
    await goiApiKhach("/api/g/selection", { method: "PATCH", body: "{}" });
    expect(ghi.map((g) => g.headers.get(TIEU_DE_BO_ANH))).toEqual([BO1, BO2]);
  });

  it("không gắn tiêu đề ngoài /api/g/ (ảnh, trang gia đình, đăng nhập)", async () => {
    const { fn, ghi } = giaFetch(() => 200);
    globalThis.fetch = fn as unknown as typeof fetch;
    datBoAnhKhach({ ma: "m", galleryId: BO1 });
    await goiApiKhach("/api/img/abc?tai=1");
    await goiApiKhach("/api/k/m");
    await goiApiKhach("/api/auth/gallery", { method: "POST", body: "{}" });
    expect(ghi.every((g) => !g.headers.has(TIEU_DE_BO_ANH))).toBe(true);
  });

  for (const status of [401, 403, 410]) {
    it(`${status} → gọi lại GET /api/k/<mã> MỘT lần rồi thử lại với cùng x-bb-bo`, async () => {
      const { fn, ghi } = giaFetch((url, lan) => (url.startsWith("/api/g/") && lan === 1 ? status : 200));
      globalThis.fetch = fn as unknown as typeof fetch;
      datBoAnhKhach({ ma: "ma/la", galleryId: BO1 });
      const res = await goiApiKhach("/api/g/submit", { method: "POST", body: '{"x":1}' });
      expect(res.status).toBe(200);
      expect(ghi.map((g) => g.url)).toEqual(["/api/g/submit", "/api/k/ma%2Fla", "/api/g/submit"]);
      expect(ghi[2]!.headers.get(TIEU_DE_BO_ANH)).toBe(BO1);
      expect(ghi[2]!.body).toBe('{"x":1}');
    });
  }

  it("vẫn lỗi sau khi đặt lại phiên → trả nguyên lỗi, không lặp vô hạn", async () => {
    const { fn, ghi } = giaFetch((url) => (url.startsWith("/api/g/") ? 403 : 200));
    globalThis.fetch = fn as unknown as typeof fetch;
    datBoAnhKhach({ ma: "m", galleryId: BO1 });
    const res = await goiApiKhach("/api/g/selection", { method: "PATCH", body: "{}" });
    expect(res.status).toBe(403);
    expect(ghi).toHaveLength(3);
  });

  it("lỗi nghiệp vụ khác (409, 422, 500) không đổi phiên", async () => {
    for (const s of [409, 422, 500]) {
      const { fn, ghi } = giaFetch(() => s);
      globalThis.fetch = fn as unknown as typeof fetch;
      datBoAnhKhach({ ma: "m", galleryId: BO1 });
      const res = await goiApiKhach("/api/g/submit", { method: "POST", body: "{}" });
      expect(res.status).toBe(s);
      expect(ghi).toHaveLength(1);
    }
  });

  it("nhiều lượt hỏng cùng lúc chỉ đổi phiên MỘT lần", async () => {
    const daGoi = new Set<string>();
    const { fn, ghi } = giaFetch((url) => {
      if (!url.startsWith("/api/g/")) return 200;
      if (daGoi.has(url)) return 200;
      daGoi.add(url);
      return 401;
    });
    globalThis.fetch = fn as unknown as typeof fetch;
    datBoAnhKhach({ ma: "m", galleryId: BO1 });
    await Promise.all([goiApiKhach("/api/g/a"), goiApiKhach("/api/g/b"), goiApiKhach("/api/g/c")]);
    expect(ghi.filter((g) => g.url === "/api/k/m")).toHaveLength(1);
  });

  it("phần thuần: themTieuDeBo / laApiKhach / boAnhKhachHienTai", () => {
    expect(new Headers(themTieuDeBo(undefined, BO2).headers).get("x-bb-bo")).toBe(BO2);
    expect(laApiKhach("/api/g/gallery?token=x")).toBe(true);
    expect(laApiKhach("http://localhost:3000/api/g/photos")).toBe(true);
    expect(laApiKhach("/api/gallery")).toBe(false);
    expect(laApiKhach("/api/img/x")).toBe(false);
    datBoAnhKhach({ ma: "m", galleryId: BO1 });
    expect(boAnhKhachHienTai()).toEqual({ ma: "m", galleryId: BO1 });
  });
});

function bo(p: Partial<BoAnhGiaDinh> & { soThuTu: number }): BoAnhGiaDinh {
  return {
    id: `id-${p.soThuTu}`,
    tieuDe: "Thôi nôi",
    tenBe: "Bé Mít",
    ngayChup: "2026-09-12",
    soAnh: 10,
    anhBiaId: null,
    trangThai: { ma: "dang_chinh_sua", khach: "Bean đang chỉnh ảnh ạ", bia: "", buocKhach: 2, giaiDoan: null },
    buocTiepTheo: { ma: "xem_anh", nhan: "Xem ảnh" },
    khoaChon: false,
    ...p,
  };
}

describe("traBoTheoSoThuTu — /k/<mã>/<n>", () => {
  // Máy chủ trả mới nhất trước — số thứ tự KHÔNG trùng vị trí trong mảng.
  const ds = [bo({ soThuTu: 3 }), bo({ soThuTu: 1 }), bo({ soThuTu: 2 })];

  it("tìm đúng theo soThuTu, không theo vị trí", () => {
    expect(traBoTheoSoThuTu(ds, "1")?.id).toBe("id-1");
    expect(traBoTheoSoThuTu(ds, "3")?.id).toBe("id-3");
    expect(traBoTheoSoThuTu(ds, 2)?.id).toBe("id-2");
  });

  it("không đoán: số không có, số 0, số âm, số đệm 0, chữ → null", () => {
    for (const n of ["4", "0", "-1", "02", "1a", "", " ", "1.0", "99999999"]) {
      expect(traBoTheoSoThuTu(ds, n)).toBeNull();
    }
  });
});

describe("trang gia đình — phần thuần", () => {
  it("tên bộ, ngày chụp", () => {
    expect(tenBoHienThi({ tenBe: "Bé Mít", tieuDe: "Thôi nôi" })).toBe("Bé Mít · Thôi nôi");
    expect(tenBoHienThi({ tenBe: null, tieuDe: "Thôi nôi" })).toBe("Thôi nôi");
    expect(tenBoHienThi({ tenBe: "Bé Mít", tieuDe: "Bé Mít thôi nôi" })).toBe("Bé Mít thôi nôi");
    expect(ngayChupHienThi("2026-09-12")).toBe("12.09.2026");
    expect(ngayChupHienThi(null)).toBeNull();
  });

  it("bộ cần ba mẹ làm lên thẻ lớn; một bộ thì chính nó là thẻ lớn (Q3 ★)", () => {
    const canChon = bo({ soThuTu: 1, buocTiepTheo: { ma: "chon_anh", nhan: "Chọn ảnh" } });
    const dangLam = bo({ soThuTu: 2 });
    expect(xepBoTrenTrang([dangLam, canChon])).toEqual({ theLon: canChon, conLai: [dangLam] });
    expect(xepBoTrenTrang([dangLam])).toEqual({ theLon: dangLam, conLai: [] });
    expect(xepBoTrenTrang([dangLam, bo({ soThuTu: 3 })]).theLon).toBeNull();
    expect(loaiChip(canChon)).toBe("can");
    expect(loaiChip(dangLam)).toBe("cho");
    expect(loaiChip(bo({ soThuTu: 4, trangThai: { ...dangLam.trangThai, ma: "da_giao" } }))).toBe("xong");
  });
});
