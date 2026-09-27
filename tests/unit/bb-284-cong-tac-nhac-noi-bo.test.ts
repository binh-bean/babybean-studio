/**
 * BB-284 — công tắc "Nhắc nội bộ vào Lark" (`settings.lark.nhac_noi_bo`).
 *
 * Chủ studio 27/09/2026: automatic của Lark ở nhóm khác đã lo phần "ảnh về"
 * và "cảnh báo nội bộ" rồi — tạm TẮT các tin đó trong app, KHÔNG đụng tới tin
 * khách↔studio (khách chốt ảnh, xin mở lại, mua thêm, duyệt/xin sửa).
 *
 * Thước đo (AGENTS.md §5a): hoàn nguyên bản vá (bỏ chốt công tắc trong
 * `enqueueLarkNotification`/`guiLaiThongBaoDangCho`) thì ca "tắt → không xếp
 * hàng cho hau_ky.nhac" phải ĐỎ. Đã thử tay: bỏ khối `if (SU_KIEN_NHAC_NOI_BO...)`
 * trong `src/lib/lark/notify.ts` thì ca đó gọi `fetch` thật (đỏ vì
 * `toHaveBeenCalledTimes(0)` nhận được 1). Vá lại thì xanh — dán trong bàn giao.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

/** Bảng `settings` giả — phân biệt theo `key`, không trộn với `lark.webhook_url`. */
let webhookTrongSettings: unknown = "https://open.larksuite.com/open-apis/bot/v2/hook/abc123";
let nhacNoiBoTrongSettings: unknown = false;

/** Bảng `notifications` giả, đủ để đọc lại thứ mã nguồn đã ghi. */
const soCai: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(bang: string) {
      if (bang === "settings") {
        let khoaDangHoi: string | null = null;
        const q: Record<string, unknown> = {};
        q.select = () => q;
        q.eq = (_cot: string, giaTri: string) => {
          khoaDangHoi = giaTri;
          return q;
        };
        q.is = () => q;
        q.maybeSingle = async () => {
          if (khoaDangHoi === "lark.webhook_url") {
            return { data: { value: webhookTrongSettings }, error: null };
          }
          if (khoaDangHoi === "lark.nhac_noi_bo") {
            return { data: { value: nhacNoiBoTrongSettings }, error: null };
          }
          return { data: null, error: null };
        };
        return q;
      }
      // notifications
      const q: Record<string, unknown> = {};
      let dangGhi: Record<string, unknown> | null = null;
      let locId: string | null = null;
      q.insert = (v: Record<string, unknown>) => {
        dangGhi = { id: `n${soCai.length + 1}`, ...v };
        soCai.push(dangGhi);
        return q;
      };
      q.update = (v: Record<string, unknown>) => {
        dangGhi = v;
        return q;
      };
      q.select = () => q;
      q.order = () => q;
      q.limit = () => q;
      q.in = () => q;
      q.lt = () => q;
      q.eq = (_cot: string, giaTri: string) => {
        locId = giaTri;
        const d = soCai.find((x) => x.id === locId);
        if (d && dangGhi && !("channel" in dangGhi)) Object.assign(d, dangGhi);
        return q;
      };
      q.single = async () => ({ data: dangGhi, error: null });
      q.then = (giai: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(giai);
      return q;
    },
  }),
}));

import { enqueueLarkNotification } from "@/lib/lark/notify";

const fetchGia = vi.fn();

beforeEach(() => {
  soCai.length = 0;
  webhookTrongSettings = "https://open.larksuite.com/open-apis/bot/v2/hook/abc123";
  nhacNoiBoTrongSettings = false;
  fetchGia.mockReset();
  fetchGia.mockResolvedValue({ ok: true, status: 200, json: async () => ({ code: 0 }) });
  vi.stubGlobal("fetch", fetchGia);
  process.env.NEXT_PUBLIC_APP_URL = "https://hauky.babybeanstudio.vn";
  // Mở khoá "đang chạy phép thử" để đi qua nhánh gửi thật (fetch đã giả lập ở
  // trên) — đúng cách các phép thử Lark khác trong repo này làm (xem
  // bb-167-ban-tin-cskh.test.ts). KHÔNG một byte nào ra khỏi máy thật.
  process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
});

const tinNoiBo = {
  branchId: "11111111-1111-1111-1111-111111111111",
  event: "hau_ky.nhac" as const,
  payload: { loai: "cho_khach_duyet", cacBo: [{ galleryTitle: "Fixture BB-284", soNgay: 3 }] },
};

const tinDueSoon = {
  branchId: "11111111-1111-1111-1111-111111111111",
  event: "gallery.due_soon" as const,
  payload: { galleryId: "x", galleryTitle: "Fixture BB-284", ngayThu: 3, conLaiNgay: 2 },
};

const tinKhachChot = {
  branchId: "11111111-1111-1111-1111-111111111111",
  event: "selection.submitted" as const,
  payload: { galleryId: "x", galleryTitle: "Fixture BB-284", selectedCount: 10, includedQuota: 10 },
};

describe("BB-284 — công tắc nhắc nội bộ, MẶC ĐỊNH TẮT", () => {
  it("chưa cấu hình (giá trị null) → coi như TẮT, không gửi hau_ky.nhac", async () => {
    nhacNoiBoTrongSettings = null;
    await enqueueLarkNotification(tinNoiBo);
    expect(fetchGia).not.toHaveBeenCalled();
    expect(soCai[0]!.status).toBe("skipped");
    expect(String(soCai[0]!.last_error)).toContain("lark.nhac_noi_bo");
  });

  it("tắt (false) → hau_ky.nhac KHÔNG gửi, không xếp hàng đợi (ghi 'skipped')", async () => {
    nhacNoiBoTrongSettings = false;
    await enqueueLarkNotification(tinNoiBo);

    expect(fetchGia).not.toHaveBeenCalled();
    expect(soCai).toHaveLength(1);
    expect(soCai[0]!.status).toBe("skipped");
    expect(String(soCai[0]!.last_error)).toContain("TẮT");
  });

  it("tắt (false) → gallery.due_soon cũng KHÔNG gửi", async () => {
    nhacNoiBoTrongSettings = false;
    await enqueueLarkNotification(tinDueSoon);

    expect(fetchGia).not.toHaveBeenCalled();
    expect(soCai[0]!.status).toBe("skipped");
  });

  it("bật (true) → hau_ky.nhac gửi bình thường", async () => {
    nhacNoiBoTrongSettings = true;
    await enqueueLarkNotification(tinNoiBo);

    expect(fetchGia).toHaveBeenCalledTimes(1);
    expect(soCai[0]!.status).toBe("sent");
  });

  it("tắt (false) KHÔNG chặn tin khách↔studio (selection.submitted vẫn gửi)", async () => {
    nhacNoiBoTrongSettings = false;
    await enqueueLarkNotification(tinKhachChot);

    expect(fetchGia).toHaveBeenCalledTimes(1);
    expect(soCai[0]!.status).toBe("sent");
  });

  it("tắt (false) KHÔNG đọc/gọi webhook — công tắc chặn TRƯỚC khi tra Lark", async () => {
    // Nếu code tra webhook trước rồi mới xét công tắc thì đổi thứ tự này vẫn
    // xanh — nhưng đặt webhook thành địa chỉ lạ để lộ ra nếu có ai đó lỡ gọi
    // `timWebhook` trước khi kiểm công tắc và log nhầm.
    nhacNoiBoTrongSettings = false;
    webhookTrongSettings = "https://open.larksuite.com/open-apis/bot/v2/hook/khac";
    await enqueueLarkNotification(tinNoiBo);
    expect(fetchGia).not.toHaveBeenCalled();
  });
});
