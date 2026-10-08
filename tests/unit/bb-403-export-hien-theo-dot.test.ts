/**
 * BB-403 — route xuất nhận `hien=1` KẾT HỢP `dot=N`: danh sách đợt N hiện ngay trên trang.
 *
 * Chạy route THẬT trên cơ sở dữ liệu GIẢ trong bộ nhớ (biên giới ra ngoài); không chạm bb-dev.
 * Chỉ giả lập: máy khách Supabase, phiên nhân sự, nhật ký, và hai hàm đọc thêm của đợt 1 (không
 * liên quan phép thử này).
 *
 * Kiểm ngược (dán trong bàn giao): bỏ dòng `if (dot !== null) truyVanAnh = truyVanAnh.eq("dot", dot)`
 * khỏi route → ca "hien=1&dot=2" trả cả ảnh đợt 1 và đợt 3 → đỏ.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { taoFakeSupabase } from "./bao-cao/fake-supabase";

vi.mock("server-only", () => ({}));

const GID = "22222222-2222-4222-8222-222222222222";
const SEL = "sel-403";

type Dong = Record<string, unknown>;
const banGia: Record<string, Dong[]> = {};
const ghiNhatKy = vi.fn(async (_v: unknown) => {});

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => taoFakeSupabase(banGia) }));
vi.mock("@/lib/nhat-ky", () => ({ ghiNhatKy: (v: unknown) => ghiNhatKy(v) }));
vi.mock("@/lib/gallery/dot-chon-server", () => ({
  laLoiThieuCot: () => false,
  layThongTinChotDot1: async () => ({ nhoStudioChonThem: 0, soSanPhamInChuaAnh: 0 }),
}));
vi.mock("@/lib/gallery/anh-album-khong-chinh-server", () => ({
  docAnhAlbumKhongChinhCuaBo: async () => ({ soSuat: 0, anh: [] }),
}));
vi.mock("@/lib/auth/staff", () => {
  class AuthError extends Error {
    constructor(public code: string) {
      super(code);
    }
  }
  return {
    AuthError,
    requireStaff: async () => ({
      staffId: "00000000-0000-4000-8000-000000000403",
      role: "owner",
      roleName: "owner",
      branchIds: ["br-403"],
      permissions: ["galleries:read", "galleries:export", "galleries:all_in_branch"],
    }),
    requirePermission: () => {},
  };
});

import { GET } from "@/app/api/admin/galleries/[id]/export/route";

function dongAnh(id: string, ten: string, dot: number, sortIndex: number, ghiChu: string | null = null): Dong {
  return {
    id: `it-${id}`,
    selection_id: SEL,
    photo_id: `ph-${id}`,
    mark: "selected",
    dot,
    order_index: null,
    retouch_note: ghiChu,
    is_favorite: false,
    photos: { file_name: ten, sort_index: sortIndex, subfolder: null },
  };
}

const goi = (q: string) =>
  GET(new Request(`http://localhost/api/admin/galleries/${GID}/export?${q}`), { params: Promise.resolve({ id: GID }) });

beforeEach(() => {
  ghiNhatKy.mockClear();
  for (const k of Object.keys(banGia)) delete banGia[k];
  banGia.galleries = [{ id: GID, branch_id: "br-403", title: "Bộ thử BB-403", status: "submitted", customer_id: null, baby_id: null, editor_id: null }];
  banGia.selections = [{ id: SEL, gallery_id: GID, is_primary: true, general_note: null, submitted_at: null, submitted_by_name: null }];
  banGia.selection_items = [
    dongAnh("1", "IMG_0001.jpg", 1, 1),
    dongAnh("2", "IMG_0002.jpg", 1, 2),
    dongAnh("3", "IMG_0101.jpg", 2, 3, "làm sáng da"),
    dongAnh("4", "IMG_0201.jpg", 3, 4),
    dongAnh("5", "IMG_0202.jpg", 3, 5),
    { ...dongAnh("6", "IMG_0999.jpg", 2, 6), mark: "suggested" },
  ];
});

describe("BB-403: export?hien=1&dot=N", () => {
  it("hien=1&dot=2 → CHỈ ảnh đợt 2 (không lẫn đợt 1, đợt 3, ảnh gợi ý)", async () => {
    const res = await goi("hien=1&dot=2");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("IMG_0101.jpg");
  });

  it("hien=1&dot=3 → hai ảnh đợt 3, xếp theo thứ tự thư mục", async () => {
    expect((await (await goi("hien=1&dot=3")).text()).split("\r\n")).toEqual(["IMG_0201.jpg", "IMG_0202.jpg"]);
  });

  it("hien=1&dot=1 → ảnh đợt 1; hien=1 (không dot) → như cũ, mọi đợt", async () => {
    expect((await (await goi("hien=1&dot=1")).text()).split("\r\n")).toEqual(["IMG_0001.jpg", "IMG_0002.jpg"]);
    expect((await (await goi("hien=1")).text()).split("\r\n")).toEqual([
      "IMG_0001.jpg",
      "IMG_0002.jpg",
      "IMG_0101.jpg",
      "IMG_0201.jpg",
      "IMG_0202.jpg",
    ]);
  });

  it("bản chi tiết của đợt: có dòng 'CHỈ ẢNH ĐỢT 2' và ghi chú cho thợ của đúng ảnh đợt đó", async () => {
    const chu = await (await goi("format=chi-tiet&hien=1&dot=2")).text();
    expect(chu).toContain("CHỈ ẢNH ĐỢT 2");
    expect(chu).toContain('IMG_0101.jpg ("làm sáng da")');
    expect(chu).not.toContain("IMG_0001.jpg");
    expect(chu).not.toContain("IMG_0201.jpg");
    expect(chu).toContain("Số ảnh đã chọn: 1");
  });

  it("hien=1 không ghi nhật ký (mở trang không làm đầy Dòng thời gian); không hien thì có ghi kèm đợt", async () => {
    await goi("hien=1&dot=2");
    expect(ghiNhatKy).not.toHaveBeenCalled();
    await goi("dot=2");
    expect(ghiNhatKy).toHaveBeenCalledTimes(1);
    expect(ghiNhatKy.mock.calls[0]![0]).toMatchObject({ action: "gallery.export", metadata: { dot: 2, soAnh: 1 } });
  });

  it("số đợt vô lý bị từ chối", async () => {
    expect((await goi("hien=1&dot=0")).status).toBe(400);
    expect((await goi("hien=1&dot=abc")).status).toBe(400);
  });
});
