/**
 * BB-392 mục 2 (anh 06/10, mục 9): thư mục "ảnh chỉnh sửa" trên Drive → app tự
 * biết (cron 08:00) và nhắc CSKH "N bộ có ảnh chỉnh chờ gửi khách duyệt".
 *
 * THUẦN: cơ sở dữ liệu giả (chuỗi lệnh supabase-js dựng tay), Drive giả, không
 * gọi mạng, không gửi Lark.
 */
import { describe, it, expect, vi } from "vitest";
import {
  laBoCanQuetAnhChinh,
  chonBoQuetLuotNay,
  quetAnhChinhTuDrive,
  gomTinAnhChinhChoGui,
  gopViecChoGuiTheoBo,
  type BoUngVienQuet,
} from "@/lib/anh-chinh-sua/quet-anh-chinh";
import { dungThe } from "@/lib/lark/notify";

const DANG_LAM = "optmhzW4sL"; // giai đoạn 3
const GUI_DUYET = "optjJ9MNLL"; // giai đoạn 5
const DA_CHOT = "optsXat0f1"; // giai đoạn 7

const bo = (id: string, status: string, lark: string | null = null, folder: string | null = `SEED_FOLDER_${id}`): BoUngVienQuet => ({
  id,
  status,
  lark_trang_thai: lark,
  drive_folder_id: folder,
  branch_id: "b-1",
});

describe("BB-392 mục 2: luật chọn bộ cần quét (thuần)", () => {
  it("đang chỉnh (submitted / in_retouch) và chưa có ảnh chỉnh → quét", () => {
    expect(laBoCanQuetAnhChinh(bo("a", "in_retouch", DANG_LAM), false)).toBe(true);
    expect(laBoCanQuetAnhChinh(bo("a", "submitted"), false)).toBe(true);
  });
  it("app đã có ảnh chỉnh / không có thư mục / Lark đã chốt in / chưa tới giai đoạn chỉnh → không", () => {
    expect(laBoCanQuetAnhChinh(bo("a", "in_retouch"), true)).toBe(false);
    expect(laBoCanQuetAnhChinh(bo("a", "in_retouch", null, null), false)).toBe(false);
    expect(laBoCanQuetAnhChinh(bo("a", "in_retouch", DA_CHOT), false)).toBe(false);
    expect(laBoCanQuetAnhChinh(bo("a", "selecting", GUI_DUYET), false)).toBe(false);
    expect(laBoCanQuetAnhChinh(bo("a", "delivered", GUI_DUYET), false)).toBe(false);
  });
  it("Lark báo 'Đã gửi duyệt' → quét và đứng trước; trần số bộ mỗi lượt", () => {
    const ds = [bo("c", "in_retouch"), bo("b", "awaiting_approval", GUI_DUYET), bo("a", "in_retouch")];
    expect(laBoCanQuetAnhChinh(ds[1]!, false)).toBe(true);
    const chon = chonBoQuetLuotNay(ds, 2, new Date("2026-10-07T01:00:00Z"));
    expect(chon).toHaveLength(2);
    expect(chon[0]!.id).toBe("b");
  });
  it("hơn trần thì xoay vòng theo ngày — vài sáng là quét hết", () => {
    const ds = Array.from({ length: 5 }, (_, i) => bo(`g${i}`, "in_retouch"));
    const daQuet = new Set<string>();
    for (let n = 0; n < 3; n++) {
      for (const b of chonBoQuetLuotNay(ds, 2, new Date(Date.UTC(2026, 9, 7 + n, 1)))) daQuet.add(b.id);
    }
    expect(daQuet.size).toBe(5);
  });
});

/** Chuỗi lệnh supabase-js giả: mọi bộ lọc trả lại chính nó, `await` ra dữ liệu bảng. */
function dbGia(bang: Record<string, unknown[]>) {
  return {
    from(ten: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "in", "not", "order", "range", "or", "eq"]) q[m] = () => q;
      q.then = (xong: (v: unknown) => unknown) => Promise.resolve({ data: bang[ten] ?? [], error: null }).then(xong);
      return q;
    },
  } as unknown as import("@supabase/supabase-js").SupabaseClient;
}

describe("BB-392 mục 2: lượt quét (Drive giả)", () => {
  it("chỉ hỏi Drive bộ chưa có ảnh chỉnh; có thư mục 'Ảnh chỉnh sửa' thì kéo về + ghi nhật ký", async () => {
    const db = dbGia({
      galleries: [bo("g1", "in_retouch"), bo("g2", "in_retouch"), bo("g3", "submitted"), bo("g4", "in_retouch", DA_CHOT)],
      photos: [
        { gallery_id: "g2", subfolder: "Ảnh chỉnh sửa" },
        { gallery_id: "g3", subfolder: "Concept 1" },
      ],
    });
    const thuMuc: Record<string, string[]> = {
      SEED_FOLDER_g1: ["Concept 1", "Ảnh chỉnh sửa"],
      SEED_FOLDER_g3: ["Concept 1"],
    };
    const hoi = vi.fn(async (f: string) => (thuMuc[f] ?? []).some((t) => /chỉnh/i.test(t)));
    const keo = vi.fn(async (_g: string, _r: string) => ({ photoCount: 12 }));
    const nhatKy = vi.fn(async () => {});
    const kq = await quetAnhChinhTuDrive({
      db,
      requestId: "phep-thu",
      coThuMucChinhSua: hoi,
      keoAnh: keo,
      ghiNhatKy: nhatKy,
      nghiMs: 0,
    });
    expect(hoi.mock.calls.map((c) => c[0]).sort()).toEqual(["SEED_FOLDER_g1", "SEED_FOLDER_g3"]);
    expect(keo).toHaveBeenCalledTimes(1);
    expect(keo.mock.calls[0]![0]).toBe("g1");
    expect(nhatKy).toHaveBeenCalledWith(expect.objectContaining({ galleryId: "g1", soAnh: 12 }));
    expect(kq).toMatchObject({ ungVien: 2, daHoi: 2, coThuMuc: 1, daKeo: 1, loi: 0 });
  });

  it("trần số bộ + dừng ở mốc hết giờ; lỗi một bộ không dừng cả lượt", async () => {
    const db = dbGia({ galleries: Array.from({ length: 10 }, (_, i) => bo(`g${i}`, "in_retouch")), photos: [] });
    const hoi = vi.fn(async (f: string) => {
      if (f === "SEED_FOLDER_g0") throw new Error("Drive 503");
      return false;
    });
    const kq = await quetAnhChinhTuDrive({ db, requestId: "x", coThuMucChinhSua: hoi, keoAnh: vi.fn(), gioiHan: 3, nghiMs: 0 });
    expect(hoi).toHaveBeenCalledTimes(3);
    expect(kq.loi).toBe(1);
    const kq2 = await quetAnhChinhTuDrive({
      db,
      requestId: "x",
      coThuMucChinhSua: hoi,
      keoAnh: vi.fn(),
      hetGioLuc: Date.now() - 1,
    });
    expect(kq2.hetGio).toBe(true);
    expect(kq2.daHoi).toBe(0);
  });
});

describe("BB-392 mục 2b: dòng nhắc CSKH 'N bộ có ảnh chỉnh chờ gửi khách duyệt'", () => {
  it("gộp theo bộ, theo chi nhánh; thẻ Lark có số bộ + lối vào Việc cần xử lý tab ảnh chỉnh sửa", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    const viec = gopViecChoGuiTheoBo([
      { loai: "cho_gui", galleryId: "g1", title: "Album · HD_20260910#5074_12654,HD_20260910#5074_12886", branchId: "b-1", soAnh: 10, luc: "2026-10-05T01:00:00Z" },
      { loai: "cho_gui", galleryId: "g1", title: "x", branchId: "b-1", soAnh: 2, luc: "2026-10-06T01:00:00Z" },
      { loai: "khach_sua", galleryId: "g9", title: "y", branchId: "b-1", soAnh: 1, luc: "2026-10-06T01:00:00Z" },
      { loai: "cho_gui", galleryId: "g2", title: "Bé Na", branchId: "b-1", soAnh: 5, luc: "2026-10-06T01:00:00Z" },
      { loai: "cho_gui", galleryId: "g3", title: "Bé Bo", branchId: "b-2", soAnh: 3, luc: "2026-10-06T01:00:00Z" },
    ]);
    expect(viec.find((v) => v.galleryId === "g1")!.soAnh).toBe(12);
    const tin = gomTinAnhChinhChoGui(viec, new Date("2026-10-07T01:00:00Z"));
    expect(tin.map((t) => [t.branchId, t.cacBo.length])).toEqual([
      ["b-1", 2],
      ["b-2", 1],
    ]);
    const the = dungThe("hau_ky.nhac", { loai: "anh_chinh_cho_gui", cacBo: tin[0]!.cacBo }, null) as {
      card: { header: { title: { content: string } }; elements: { text: { content: string } }[] };
    };
    expect(the.card.header.title.content).toBe("2 bộ có ảnh chỉnh chờ gửi khách duyệt");
    const noiDung = the.card.elements.map((e) => e.text.content).join("\n");
    expect(noiDung).toContain("https://app.example.test/admin/viec-can-xu-ly?tab=anh-chinh-sua");
    expect(noiDung).toContain("Gửi khách duyệt");
    // Tên bộ hiển thị sạch, không còn đuôi số dòng chi tiết hoá đơn.
    expect(noiDung).toContain("**Album · HD_20260910#5074** — 12 ảnh");
    expect(noiDung).not.toContain("_12654");
    vi.unstubAllEnvs();
  });
});
