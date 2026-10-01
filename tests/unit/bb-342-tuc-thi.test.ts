/**
 * BB-342 — cập nhật tức thì: tên kênh, phát sự kiện, trạm phía trình duyệt.
 *
 * Giả lập đúng BIÊN GIỚI ra ngoài: `fetch` (REST broadcast của Supabase) và
 * websocket (một kết nối giả có `channel().on().subscribe()`). Không giả lập
 * hook React (AGENTS §5a điều 2) — phần dính React của hook chỉ là nối trạm
 * vào vòng đời component; phần có logic nằm ở `taoTram`, thử ở đây, và cả
 * chuỗi thật được e2e bb-342 đo trên hai trình duyệt.
 *
 * Kiểm ngược (đã chạy, kết quả dán trong bàn giao):
 *  · Xoá dòng `phatSuKienBoAnh(...)` trong `guiThongBaoBoAnh` (gui-day.ts)
 *    → ca "tin vào chuông thì phát cho kênh khách" ĐỎ.
 *  · Đổi `bam()` thành trả thẳng id → ca "tên kênh không chứa id" ĐỎ.
 *  · Bỏ `laLoaiHopLe` ở trạm → ca "tin rác bị bỏ" ĐỎ.
 *  · Cho `taoBoGop.day` luôn gọi thẳng → ca "50 sự kiện gộp thành một" ĐỎ.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

const webpushGia = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));
vi.mock("web-push", () => ({ default: webpushGia }));

import { kenhKhach, kenhNhanVien, phatSuKienBoAnh } from "@/lib/supabase/tuc-thi";
import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";
import { taoTram, taoBoGop, type KetNoiToiThieu, type KenhToiThieu } from "@/lib/utils/use-cap-nhat-tuc-thi";
import { LOAI_TUC_THI, TEN_SU_KIEN_TUC_THI, laLoaiHopLe } from "@/lib/utils/tuc-thi-su-kien";

const G_A = "11111111-1111-4111-8111-111111111111";
const G_B = "22222222-2222-4222-8222-222222222222";
const CN = "33333333-3333-4333-8333-333333333333";

interface LuotGoi {
  url: string;
  body: { messages: { topic: string; event: string; payload: Record<string, unknown> }[] };
}

let luotGoi: LuotGoi[] = [];
let traVe: () => Promise<Response> = async () => new Response(null, { status: 202 });

beforeEach(() => {
  luotGoi = [];
  traVe = async () => new Response(null, { status: 202 });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://bb-gia.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "khoa-service-gia");
  vi.stubEnv("APP_SECRET", "x".repeat(40));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      luotGoi.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
      return traVe();
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("tên kênh", () => {
  it("cố định theo bộ ảnh, khác nhau giữa hai bộ, khác giữa kênh khách và kênh nhân viên", () => {
    expect(kenhKhach(G_A)).toBe(kenhKhach(G_A));
    expect(kenhKhach(G_A)).not.toBe(kenhKhach(G_B));
    expect(kenhNhanVien(G_A)).not.toBe(kenhKhach(G_A).replace(/^kh:/, "nv:"));
  });

  it("không chứa id và không đoán được nếu không có APP_SECRET", () => {
    const k = kenhKhach(G_A);
    expect(k).toMatch(/^kh:[A-Za-z0-9_-]{32}$/);
    expect(k).not.toContain(G_A);
    expect(k).not.toContain(G_A.replace(/-/g, ""));
    vi.stubEnv("APP_SECRET", "y".repeat(40));
    expect(kenhKhach(G_A)).not.toBe(k); // đổi bí mật là đổi kênh — bí mật là thứ giữ kênh
  });
});

describe("phatSuKienBoAnh", () => {
  it("một lượt REST, phát cho kênh khách VÀ kênh chi nhánh; payload chỉ có loại (+ id ở kênh nhân viên)", async () => {
    const ok = await phatSuKienBoAnh({ galleryId: G_A, branchId: CN, loai: LOAI_TUC_THI.khachChotDanhSach });
    expect(ok).toBe(true);
    expect(luotGoi).toHaveLength(1);
    expect(luotGoi[0]!.url).toBe("https://bb-gia.supabase.co/realtime/v1/api/broadcast");
    const msgs = luotGoi[0]!.body.messages;
    expect(msgs.map((m) => m.topic)).toEqual([kenhKhach(G_A), kenhNhanVien(CN)]);
    expect(msgs.every((m) => m.event === TEN_SU_KIEN_TUC_THI)).toBe(true);
    expect(msgs[0]!.payload).toEqual({ loai: "khach.chot_danh_sach" });
    expect(msgs[1]!.payload).toEqual({ loai: "khach.chot_danh_sach", galleryId: G_A });
  });

  it("không bao giờ ném: Supabase sập / trả 500 → false, việc nghiệp vụ không hỏng", async () => {
    const loi = vi.spyOn(console, "error").mockImplementation(() => {});
    traVe = async () => {
      throw new Error("mạng sập");
    };
    await expect(phatSuKienBoAnh({ galleryId: G_A, branchId: CN, loai: "khach.chot_dot" })).resolves.toBe(false);
    traVe = async () => new Response("x", { status: 500 });
    await expect(phatSuKienBoAnh({ galleryId: G_A, branchId: CN, loai: "khach.chot_dot" })).resolves.toBe(false);
    expect(loi).toHaveBeenCalled();
    loi.mockRestore();
  });

  it("loại không hợp lệ (văn bản tự do) thì không phát gì", async () => {
    const loi = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await phatSuKienBoAnh({ galleryId: G_A, branchId: CN, loai: "Mẹ Lan vừa chốt" })).toBe(false);
    expect(luotGoi).toHaveLength(0);
    loi.mockRestore();
  });
});

describe("guiThongBaoBoAnh (mọi việc studio→khách đi qua đây) phát sự kiện tức thì", () => {
  it("tin vào chuông thì phát cho kênh khách của đúng bộ ảnh", async () => {
    const client = {
      from(bang: string) {
        if (bang === "thong_bao_khach") {
          const b = {
            insert: () => b,
            select: () => b,
            single: () => Promise.resolve({ data: { id: "hop-thu-1" }, error: null }),
          };
          return b;
        }
        if (bang === "galleries") {
          const b = {
            select: () => b,
            eq: () => b,
            maybeSingle: () => Promise.resolve({ data: { branch_id: CN }, error: null }),
          };
          return b;
        }
        if (bang === "push_dang_ky") {
          return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
        }
        throw new Error(`bảng không mong đợi: ${bang}`);
      },
    } as unknown as SupabaseClient;

    await guiThongBaoBoAnh(client, G_A, { tieuDe: "t", noiDung: "n", loai: "dot_chon_xac_nhan" });
    const msgs = luotGoi.flatMap((l) => l.body.messages ?? []);
    expect(msgs.map((m) => m.topic)).toContain(kenhKhach(G_A));
    expect(msgs.map((m) => m.topic)).toContain(kenhNhanVien(CN));
    expect(msgs.map((m) => m.topic)).not.toContain(kenhKhach(G_B));
  });
});

// ---------------------------------------------------------------------------
// Trạm phía trình duyệt, với một websocket giả
// ---------------------------------------------------------------------------

function taoKetNoiGia() {
  const kenh = new Map<string, { cb?: (t: { payload?: unknown }) => void; bao?: (s: string) => void }>();
  let daNgat = false;
  const ketNoi: KetNoiToiThieu = {
    channel(ten: string) {
      const o: { cb?: (t: { payload?: unknown }) => void; bao?: (s: string) => void } = {};
      kenh.set(ten, o);
      const k: KenhToiThieu = {
        on(_l, loc, cb) {
          expect(loc.event).toBe(TEN_SU_KIEN_TUC_THI);
          o.cb = cb;
          return k;
        },
        subscribe(bao) {
          o.bao = bao;
          return k;
        },
      };
      return k;
    },
    disconnect() {
      daNgat = true;
    },
  };
  return { ketNoi, kenh, daNgat: () => daNgat };
}

const doi = () => new Promise((r) => setTimeout(r, 0));

describe("taoTram", () => {
  it("nghe đủ các kênh máy chủ cấp; chỉ 'đã nối' khi MỌI kênh SUBSCRIBED; chuyển sự kiện cho người nghe", async () => {
    const gia = taoKetNoiGia();
    const tram = taoTram({ layTenKenh: async () => ["nv:a", "nv:b"], taoKetNoi: async () => gia.ketNoi });
    const nhan: unknown[] = [];
    tram.nghe((sk) => nhan.push(sk));
    await doi();
    await doi();
    expect([...gia.kenh.keys()]).toEqual(["nv:a", "nv:b"]);
    expect(tram.daNoi()).toBe(false);
    gia.kenh.get("nv:a")!.bao!("SUBSCRIBED");
    expect(tram.daNoi()).toBe(false);
    gia.kenh.get("nv:b")!.bao!("SUBSCRIBED");
    expect(tram.daNoi()).toBe(true);

    gia.kenh.get("nv:b")!.cb!({ payload: { loai: "khach.chot_dot", galleryId: G_A } });
    expect(nhan).toEqual([{ loai: "khach.chot_dot", galleryId: G_A }]);
  });

  it("tin rác trên kênh công khai (loại lạ, thiếu loại) bị bỏ", async () => {
    const gia = taoKetNoiGia();
    const tram = taoTram({ layTenKenh: async () => ["kh:x"], taoKetNoi: async () => gia.ketNoi });
    const nhan: unknown[] = [];
    tram.nghe((sk) => nhan.push(sk));
    await doi();
    await doi();
    const cb = gia.kenh.get("kh:x")!.cb!;
    cb({ payload: { loai: "<img src=x onerror=alert(1)>" } });
    cb({ payload: {} });
    cb({ payload: null });
    cb({ payload: { loai: "studio.thong_bao", galleryId: 42 } });
    expect(nhan).toEqual([{ loai: "studio.thong_bao" }]);
  });

  it("rớt rồi nối lại → báo để màn tải bù; lần nối đầu tiên thì không", async () => {
    const gia = taoKetNoiGia();
    const tram = taoTram({ layTenKenh: async () => ["kh:x"], taoKetNoi: async () => gia.ketNoi });
    let soLanTaiBu = 0;
    tram.ngheNoiLai(() => soLanTaiBu++);
    await doi();
    await doi();
    const bao = gia.kenh.get("kh:x")!.bao!;
    bao("SUBSCRIBED");
    expect(soLanTaiBu).toBe(0);
    bao("CHANNEL_ERROR");
    expect(tram.daNoi()).toBe(false);
    bao("SUBSCRIBED");
    expect(soLanTaiBu).toBe(1);
  });

  it("máy chủ không cấp kênh (chưa đăng nhập) → không mở websocket, daNoi() = false (lưới đỡ 30 giây lo)", async () => {
    const taoKetNoi = vi.fn(async () => taoKetNoiGia().ketNoi);
    const tram = taoTram({ layTenKenh: async () => [], taoKetNoi });
    await doi();
    expect(taoKetNoi).not.toHaveBeenCalled();
    expect(tram.daNoi()).toBe(false);
  });

  it("đóng trạm thì ngắt websocket", async () => {
    const gia = taoKetNoiGia();
    const tram = taoTram({ layTenKenh: async () => ["kh:x"], taoKetNoi: async () => gia.ketNoi });
    await doi();
    await doi();
    tram.dong();
    expect(gia.daNgat()).toBe(true);
  });
});

describe("taoBoGop — sự kiện dồn dập không thành bão tải lại", () => {
  it("lần đầu gọi ngay; 50 sự kiện trong cửa sổ gộp thành MỘT lần cuối mang sự kiện mới nhất", () => {
    vi.useFakeTimers();
    try {
      const goi: number[] = [];
      const g = taoBoGop<number>((x) => goi.push(x), 1_500);
      g.day(1);
      expect(goi).toEqual([1]);
      for (let i = 2; i <= 50; i++) g.day(i);
      expect(goi).toEqual([1]);
      vi.advanceTimersByTime(1_500);
      expect(goi).toEqual([1, 50]);
      vi.advanceTimersByTime(5_000);
      expect(goi).toEqual([1, 50]); // hết sự kiện thì im
      g.day(51);
      expect(goi).toEqual([1, 50, 51]);
      g.day(52);
      g.huy();
      vi.advanceTimersByTime(5_000);
      expect(goi).toEqual([1, 50, 51]); // tháo khối thì không gọi vào component đã rời
    } finally {
      vi.useRealTimers();
    }
  });

  it("gopMs = 0: không gộp (thông báo cho từng việc của khách)", () => {
    const goi: number[] = [];
    const g = taoBoGop<number>((x) => goi.push(x), 0);
    g.day(1);
    g.day(2);
    expect(goi).toEqual([1, 2]);
  });
});

describe("laLoaiHopLe", () => {
  it("chỉ nhận mã loại, không nhận văn bản tự do", () => {
    expect(laLoaiHopLe("khach.chot_dot")).toBe(true);
    expect(laLoaiHopLe("Khách A vừa chốt")).toBe(false);
    expect(laLoaiHopLe("")).toBe(false);
    expect(laLoaiHopLe(undefined)).toBe(false);
  });
});
