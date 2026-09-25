/**
 * BB-246 — thông báo đẩy (Web Push): ba mẹ bật một lần trên màn khách, rồi
 * nhận tin khi ảnh đã chỉnh xong, mời duyệt.
 *
 * `web-push` là RANH GIỚI RA NGOÀI (gọi mạng thật tới FCM/APNs/Mozilla) —
 * AGENTS.md §5a cho phép giả biên giới đó, cấm giả "ruột" (hook React,
 * `useState`/`useEffect`). Không có React ở đây; hàm đang thử
 * (`guiThongBaoBoAnh`) là hàm thuần server nhận `client` làm tham số, nên
 * không cần giả `@/lib/supabase/admin` — tự tay dựng một `client` giả đúng
 * hình dạng để ĐỌC LẠI những gì hàm ghi, không đọc mã nguồn của hàm.
 *
 * Bốn ca canh đúng bốn điều brief đòi:
 *  1. Payload đẩy không chứa token/tên bé/link.
 *  2. 410 (đăng ký đã chết) → xoá dòng đó.
 *  3. Thiếu khoá VAPID → không gửi, không ném.
 *  4. Zod ở route từ chối endpoint http và thân JSON hỏng → 400, không 500.
 *
 * KIỂM NGƯỢC (chạy tay, dán kết quả vào bàn giao):
 *  · Xoá dòng lọc `err.statusCode !== 404 && !== 410` (gộp 410 vào nhánh ghi
 *    log thường) trong gui-day.ts → ca "410 → xoá đăng ký" phải ĐỎ.
 *  · Xoá điều kiện `!publicKey || !privateKey || !subject` (luôn coi là có
 *    khoá) trong docKhoaVapid() → ca "thiếu VAPID" phải ĐỎ (sendNotification
 *    bị gọi dù không có khoá).
 *  · Đổi `payload` trong gui-day.ts thành gồm cả `galleryId, tieuDe, noiDung,
 *    token: "x"` → ca "payload không chứa token" phải ĐỎ.
 *  · Xoá `.refine(...)` bắt buộc https trong schema.ts → ca "endpoint http"
 *    phải ĐỎ (trả 200 thay vì 400).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

// Giả `web-push` — biên giới ra ngoài, không phải ruột của hàm đang thử.
const webpushGia = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));
vi.mock("web-push", () => ({ default: webpushGia }));

import { guiThongBaoBoAnh } from "@/lib/thong-bao/gui-day";

interface DongPushDangKy {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * `client` giả — chỉ đủ hình dạng `push_dang_ky` mà `guiThongBaoBoAnh` chạm
 * tới: `.select().eq("gallery_id", …)`, `.update(…).eq("id", …)`,
 * `.delete().eq("id", …)`. Ghi lại mọi lượt update/delete để test đọc ngược.
 */
function taoAdminGia(dsDangKy: DongPushDangKy[]) {
  const ghiNhan = {
    update: [] as { id: string; patch: Record<string, unknown> }[],
    delete: [] as string[],
  };

  const client = {
    from(bang: string) {
      if (bang !== "push_dang_ky") throw new Error(`bảng không mong đợi: ${bang}`);

      let mode: "select" | "update" | "delete" = "select";
      let patchDangCho: Record<string, unknown> = {};

      const builder = {
        select: () => builder,
        update: (patch: Record<string, unknown>) => {
          mode = "update";
          patchDangCho = patch;
          return builder;
        },
        delete: () => {
          mode = "delete";
          return builder;
        },
        eq(_cot: string, giaTri: string) {
          if (mode === "select") {
            return Promise.resolve({ data: dsDangKy, error: null });
          }
          if (mode === "update") {
            ghiNhan.update.push({ id: giaTri, patch: patchDangCho });
            return Promise.resolve({ error: null });
          }
          ghiNhan.delete.push(giaTri);
          return Promise.resolve({ error: null });
        },
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, ghiNhan };
}

const dongKhoaVapidThat = {
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: "cong-khai-gia",
  VAPID_PRIVATE_KEY: "rieng-tu-gia",
  VAPID_SUBJECT: "mailto:cskh@babybeanstudio.vn",
};

beforeEach(() => {
  webpushGia.setVapidDetails.mockReset();
  webpushGia.sendNotification.mockReset();
  for (const [k, v] of Object.entries(dongKhoaVapidThat)) vi.stubEnv(k, v);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("BB-246: guiThongBaoBoAnh — payload đẩy", () => {
  it("chỉ gồm galleryId/tieuDe/noiDung — không token, không tên bé, không link", async () => {
    const { client } = taoAdminGia([
      { id: "d1", endpoint: "https://fcm.example/d1", p256dh: "p", auth: "a" },
    ]);
    webpushGia.sendNotification.mockResolvedValue(undefined);

    await guiThongBaoBoAnh(client, "gallery-123", {
      tieuDe: "Ảnh của bé đã chỉnh xong",
      noiDung: "Mời ba mẹ xem và duyệt bộ ảnh.",
    });

    expect(webpushGia.sendNotification).toHaveBeenCalledTimes(1);
    const [, payloadThoi] = webpushGia.sendNotification.mock.calls[0] as [unknown, string];
    const payload = JSON.parse(payloadThoi) as Record<string, unknown>;

    expect(Object.keys(payload).sort()).toEqual(["galleryId", "noiDung", "tieuDe"]);
    expect(payload.galleryId).toBe("gallery-123");
    expect(payloadThoi).not.toMatch(/token|link|tenBe|babyName|shareLink/i);
  });
});

describe("BB-246: guiThongBaoBoAnh — dọn đăng ký đã chết", () => {
  it("gửi trả 410 -> xoá đúng dòng đó, không cập nhật gui_ok_luc", async () => {
    const { client, ghiNhan } = taoAdminGia([
      { id: "d1", endpoint: "https://fcm.example/d1", p256dh: "p", auth: "a" },
    ]);
    webpushGia.sendNotification.mockRejectedValue(
      Object.assign(new Error("gone"), { statusCode: 410 }),
    );

    await guiThongBaoBoAnh(client, "gallery-123", { tieuDe: "t", noiDung: "n" });

    expect(ghiNhan.delete).toEqual(["d1"]);
    expect(ghiNhan.update).toEqual([]);
  });

  it("gửi trả 404 -> cũng xoá (endpoint đã bị dịch vụ đẩy bỏ)", async () => {
    const { client, ghiNhan } = taoAdminGia([
      { id: "d2", endpoint: "https://fcm.example/d2", p256dh: "p", auth: "a" },
    ]);
    webpushGia.sendNotification.mockRejectedValue(
      Object.assign(new Error("not found"), { statusCode: 404 }),
    );

    await guiThongBaoBoAnh(client, "gallery-123", { tieuDe: "t", noiDung: "n" });

    expect(ghiNhan.delete).toEqual(["d2"]);
  });

  it("gửi trả 500 (lỗi tạm của dịch vụ đẩy) -> KHÔNG xoá, chỉ ghi log", async () => {
    const { client, ghiNhan } = taoAdminGia([
      { id: "d3", endpoint: "https://fcm.example/d3", p256dh: "p", auth: "a" },
    ]);
    const banGhiLoi = vi.spyOn(console, "error").mockImplementation(() => {});
    webpushGia.sendNotification.mockRejectedValue(
      Object.assign(new Error("server error"), { statusCode: 500 }),
    );

    await guiThongBaoBoAnh(client, "gallery-123", { tieuDe: "t", noiDung: "n" });

    expect(ghiNhan.delete).toEqual([]);
    expect(banGhiLoi).toHaveBeenCalled();
    banGhiLoi.mockRestore();
  });
});

describe("BB-246: guiThongBaoBoAnh — thiếu khoá VAPID", () => {
  it("thiếu bất kỳ biến nào trong ba biến VAPID -> không gửi, không ném", async () => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    const { client, ghiNhan } = taoAdminGia([
      { id: "d1", endpoint: "https://fcm.example/d1", p256dh: "p", auth: "a" },
    ]);

    await expect(
      guiThongBaoBoAnh(client, "gallery-123", { tieuDe: "t", noiDung: "n" }),
    ).resolves.toBeUndefined();

    expect(webpushGia.sendNotification).not.toHaveBeenCalled();
    expect(ghiNhan.update).toEqual([]);
    expect(ghiNhan.delete).toEqual([]);
  });

  it("client hỏng (đọc push_dang_ky ném lỗi) -> vẫn không ném ra ngoài", async () => {
    const client = {
      from() {
        throw new Error("kết nối cơ sở dữ liệu hỏng");
      },
    } as unknown as SupabaseClient;
    const banGhiLoi = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      guiThongBaoBoAnh(client, "gallery-123", { tieuDe: "t", noiDung: "n" }),
    ).resolves.toBeUndefined();

    expect(banGhiLoi).toHaveBeenCalled();
    banGhiLoi.mockRestore();
  });
});

describe("BB-246: POST /api/g/thong-bao — Zod chặn đầu vào hỏng", () => {
  let POST: typeof import("@/app/api/g/thong-bao/route").POST;
  let gallerySession: typeof import("@/lib/auth/gallery-session");

  beforeEach(async () => {
    gallerySession = await import("@/lib/auth/gallery-session");
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: "11111111-1111-1111-1111-111111111111",
      customerId: null,
      shareLinkId: "22222222-2222-2222-2222-222222222222",
      selectionId: "33333333-3333-3333-3333-333333333333",
      role: "owner",
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
    ({ POST } = await import("@/app/api/g/thong-bao/route"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("endpoint http (không https) -> 400 INVALID_INPUT, không 500", async () => {
    const req = new Request("http://localhost/api/g/thong-bao", {
      method: "POST",
      body: JSON.stringify({
        endpoint: "http://khong-phai-https.example/abc",
        keys: { p256dh: "AAAAaaaa11--__", auth: "BBBBbbbb22--__" },
      }),
    });

    const res = await POST(req);
    const data = (await res.json()) as { error?: { code: string } };

    expect(res.status).toBe(400);
    expect(data.error?.code).toBe("INVALID_INPUT");
  });

  it("thân JSON hỏng (cắt giữa chừng) -> 400 INVALID_INPUT, không 500", async () => {
    const req = new Request("http://localhost/api/g/thong-bao", {
      method: "POST",
      body: '{"endpoint": "https://fcm.example/x", "keys": {',
    });

    const res = await POST(req);
    const data = (await res.json()) as { error?: { code: string } };

    expect(res.status).toBe(400);
    expect(data.error?.code).toBe("INVALID_INPUT");
  });

  it("thiếu khoá p256dh/auth -> 400 INVALID_INPUT", async () => {
    const req = new Request("http://localhost/api/g/thong-bao", {
      method: "POST",
      body: JSON.stringify({ endpoint: "https://fcm.example/x", keys: { p256dh: "", auth: "" } }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
