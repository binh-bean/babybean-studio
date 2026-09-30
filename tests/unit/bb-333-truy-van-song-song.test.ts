/**
 * BB-333 — /api/g/gallery và requireStaff() phải gửi truy vấn SONG SONG.
 *
 * Lỗi: màn khách chờ /api/g/gallery 2,5 s (bản build, 4G giả lập) vì ~22 câu
 * truy vấn đi NỐI ĐUÔI — câu sau chờ câu trước về. Mỗi quản trị viên cũng trả
 * thêm một vòng mạng ở MỌI route API vì requireStaff() hỏi hồ sơ xong mới hỏi
 * chi nhánh.
 *
 * Cách canh: thay Supabase bằng một client giả (biên giới ra ngoài — không giả
 * lập gì của React), mỗi câu mất 15 ms, và đếm SỐ CÂU ĐANG BAY CÙNG LÚC nhiều
 * nhất. Nối đuôi thì con số đó là 1; song song thì lớn hơn nhiều.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const phien = vi.hoisted(() => ({ shareLinkId: "sl-1" }));

const dem = { dangBay: 0, nhieuNhat: 0, tong: 0 };

function duLieuTheoBang(bang: string) {
  if (bang === "galleries") {
    return {
      data: {
        id: "g-1", title: "Fixture BB-333", welcome_message: null, status: "ready",
        baby_id: "b-1", customer_id: "c-1", shoot_date: null, branch: null,
        photo_count: 10, included_quota: 5, extra_photo_price: 0, max_selection: null,
        allow_extra: true, due_at: null, cover_photo_id: null, cover_headline: null,
        cover_layout: null, download_enabled: false, notes_enabled: true, invite_enabled: true,
        lark_trang_thai: null, lark_trang_thai_tu: null, reopened_at: null,
      },
      error: null,
    };
  }
  if (bang === "share_links") return { data: { id: "sl-1" }, error: null };
  if (bang === "staff_profiles") {
    return { data: { role: "owner", is_active: true, role_id: "r-1", roles: { name: "owner", permissions: ["system:superuser"] } }, error: null };
  }
  if (bang === "branches") return { data: [{ id: "br-1" }], error: null };
  return { data: [], error: null, count: 0 };
}

/** Builder giả: mọi phương thức trả lại chính nó; `then` mới "gửi" câu truy vấn. */
function builder(bang: string): unknown {
  const b: unknown = new Proxy(
    {},
    {
      get(_t, k) {
        if (k === "then") {
          return (res: (v: unknown) => void) => {
            dem.dangBay++;
            dem.tong++;
            dem.nhieuNhat = Math.max(dem.nhieuNhat, dem.dangBay);
            setTimeout(() => {
              dem.dangBay--;
              res(duLieuTheoBang(bang));
            }, 15);
          };
        }
        return () => b;
      },
    },
  );
  return b;
}

const clientGia = {
  from: (bang: string) => builder(bang),
  rpc: () => builder("rpc"),
  auth: { getUser: async () => ({ data: { user: { id: "u-1" } }, error: null }) },
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: async () => clientGia }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => clientGia }));
vi.mock("@/lib/auth/gallery-session", () => {
  class GallerySessionError extends Error {
    code = "UNAUTHENTICATED";
  }
  return {
    GallerySessionError,
    requireGallerySession: async () => ({
      galleryId: "g-1", selectionId: "s-1", shareLinkId: phien.shareLinkId, role: "owner",
    }),
  };
});
vi.mock("@/lib/selection/contract", () => ({
  getGalleryContractSummary: async (_id: string, sb: typeof clientGia) => {
    await sb.from("gallery_items");
    return { quotaKnown: true, includedQuota: 5, items: [], totalValue: 0 };
  },
}));
vi.mock("@/lib/gallery/yeu-cau-mo-lai", () => ({
  layTrangThaiXinMoLai: async (sb: typeof clientGia) => {
    await sb.from("reopen_requests");
    return { trangThai: "khong_co" };
  },
}));

beforeEach(() => {
  dem.dangBay = 0;
  dem.nhieuNhat = 0;
  dem.tong = 0;
});

describe("BB-333 — truy vấn song song", () => {
  it("/api/g/gallery: đợt đầu gửi ≥ 8 câu cùng lúc, kết quả vẫn đủ trường", async () => {
    const { GET } = await import("@/app/api/g/gallery/route");
    const res = await GET(new Request("http://localhost/api/g/gallery?token=Fixture-BB333-ma"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.id).toBe("g-1");
    expect(json.data.title).toBe("Fixture BB-333");
    // Nối đuôi (trước bản vá) thì con số này là 1.
    expect(dem.nhieuNhat).toBeGreaterThanOrEqual(8);
  });

  it("/api/g/gallery: mã trên địa chỉ lệch phiên vẫn bị từ chối (409)", async () => {
    const { GET } = await import("@/app/api/g/gallery/route");
    // share_links giả trả id "sl-1"; phiên cầm link KHÁC → phải từ chối.
    phien.shareLinkId = "sl-KHAC";
    try {
      const res = await GET(new Request("http://localhost/api/g/gallery?token=Fixture-BB333-ma"));
      const json = await res.json();
      expect(json.error?.code).toBe("SESSION_MISMATCH");
      expect(json.data).toBeUndefined();
    } finally {
      phien.shareLinkId = "sl-1";
    }
  });

  it("requireStaff: hồ sơ và chi nhánh gửi cùng lúc (≥ 2 câu đang bay)", async () => {
    const { requireStaff } = await import("@/lib/auth/staff");
    const s = await requireStaff();
    expect(s.staffId).toBe("u-1");
    expect(s.branchIds).toEqual(["br-1"]);
    // Trước bản vá: hồ sơ → (xong) → chi nhánh, tối đa 1 câu đang bay.
    expect(dem.nhieuNhat).toBeGreaterThanOrEqual(2);
  });
});
