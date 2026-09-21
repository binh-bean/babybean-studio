/**
 * BB-167 — chạy phép thử KHÔNG được bắn tin vào nhóm Lark thật.
 *
 * Đây là phép thử sinh ra từ một lần làm hỏng thật, ngày 21/09/2026.
 *
 * Bộ phép thử của BB-114 gọi THẬT `/api/g/submit` trên bb-dev: cơ sở dữ liệu
 * thật, bảng `settings` thật, webhook thật. Ngay sau khi đường bắn tin chạy
 * được, một lượt `npm run test` đẩy **sáu thẻ "Test BB114…"** vào nhóm Lark
 * của studio. Nhân viên nhận tin rác giữa giờ làm.
 *
 * Trước đó không ai gặp, vì đường ghi cũ hỏng sẵn (PGRST204) — tức là chính
 * một cái lỗi đang che một cái lỗi khác.
 *
 * Ca này canh cái chốt đó. Nó cố ý **không** đặt
 * `LARK_CHO_PHEP_GUI_TRONG_PHEP_THU`, tức là đứng đúng ở vị trí của một bộ
 * phép thử bình thường trong dự án.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const soCai: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from() {
      const q: Record<string, unknown> = {};
      let dangGhi: Record<string, unknown> | null = null;
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
      q.is = () => q;
      q.eq = (_cot: string, giaTri: string) => {
        const d = soCai.find((x) => x.id === giaTri);
        if (d && dangGhi && !("channel" in dangGhi)) Object.assign(d, dangGhi);
        return q;
      };
      q.single = async () => ({ data: dangGhi, error: null });
      q.maybeSingle = async () => ({
        data: { value: "https://open.larksuite.com/open-apis/bot/v2/hook/that-su-co-that" },
        error: null,
      });
      q.then = (giai: (v: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(giai);
      return q;
    },
  }),
}));

import { enqueueLarkNotification, guiLaiThongBaoDangCho } from "@/lib/lark/notify";

const fetchGia = vi.fn();

beforeEach(() => {
  soCai.length = 0;
  fetchGia.mockReset();
  fetchGia.mockResolvedValue({ ok: true, status: 200, json: async () => ({ code: 0 }) });
  vi.stubGlobal("fetch", fetchGia);
  // KHÔNG mở cửa thoát. Đó là cả nội dung của ca này.
  delete process.env.LARK_CHO_PHEP_GUI_TRONG_PHEP_THU;
});

describe("BB-167 — phép thử không được bắn tin thật", () => {
  it("dù webhook có cấu hình đầy đủ, chạy phép thử thì KHÔNG gọi ra ngoài", async () => {
    await enqueueLarkNotification({
      branchId: "11111111-1111-1111-1111-111111111111",
      event: "selection.submitted",
      payload: { galleryId: "x", selectedCount: 1 },
    });

    expect(fetchGia).not.toHaveBeenCalled();
    // Vẫn ghi vào sổ, để nếu ai đó tưởng tin đã đi thì mở bảng ra là thấy ngay.
    expect(soCai[0]!.status).toBe("skipped");
    expect(String(soCai[0]!.last_error)).toContain("phép thử");
  });

  it("lượt quét lại cũng không được gửi gì", async () => {
    const kq = await guiLaiThongBaoDangCho();
    expect(fetchGia).not.toHaveBeenCalled();
    expect(kq).toEqual({ daXu: 0, daGui: 0, conHong: 0 });
  });
});
