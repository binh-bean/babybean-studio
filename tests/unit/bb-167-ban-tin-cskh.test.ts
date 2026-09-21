/**
 * BB-167 — bắn tin sang Lark khi khách chốt ảnh.
 *
 * Ba thứ đã hỏng trước bản vá, không thứ nào báo gì:
 *
 *   1. `enqueueLarkNotification` ném "Not implemented", không ai gọi.
 *   2. `/api/g/submit` tự ghi thẳng vào `notifications` với hai cột KHÔNG TỒN
 *      TẠI (`gallery_id`, `recipient`) → PGRST204. `supabase-js` không ném, mã
 *      cũ bỏ qua `error`, nên mỗi lượt Chốt là một dòng rơi vào hư không.
 *   3. Không có gì gửi đi: thiết kế cũ dựa vào một cron mỗi 5 phút mà gói
 *      Hobby không cho tồn tại.
 *
 * Các ca dưới đây khoá những chốt mà nếu tuột thì hoặc lộ dữ liệu của trẻ con,
 * hoặc làm hỏng nút Chốt của ba mẹ.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));

/** Bảng `notifications` giả, đủ để đọc lại thứ mã nguồn đã ghi. */
const soCai: Record<string, unknown>[] = [];
let webhookTrongSettings: unknown = "https://open.larksuite.com/open-apis/bot/v2/hook/abc123";
/** Bật lên để chính cơ sở dữ liệu nổ — ca "không được ném" cần đúng đường này. */
let csdlNo = false;

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(bang: string) {
      if (csdlNo) throw new Error("cơ sở dữ liệu không nối được");
      if (bang === "settings") {
        const q: Record<string, unknown> = {};
        for (const t of ["select", "eq", "is"]) q[t] = () => q;
        q.maybeSingle = async () => ({ data: { value: webhookTrongSettings }, error: null });
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
        // `update(...).eq(id)` không gọi .single(): phải áp ngay ở đây.
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

import {
  enqueueLarkNotification,
  cheSoDienThoai,
  locBoAnh,
  dungThe,
} from "@/lib/lark/notify";

const fetchGia = vi.fn();

beforeEach(() => {
  soCai.length = 0;
  csdlNo = false;
  webhookTrongSettings = "https://open.larksuite.com/open-apis/bot/v2/hook/abc123";
  fetchGia.mockReset();
  fetchGia.mockResolvedValue({ ok: true, status: 200, json: async () => ({ code: 0 }) });
  vi.stubGlobal("fetch", fetchGia);
  process.env.NEXT_PUBLIC_APP_URL = "https://hauky.babybeanstudio.vn";
  // `fetch` ở đây là hàm giả, không có gì ra khỏi máy — nên bộ này được mở
  // chốt "đang chạy phép thử thì không bắn tin". Xem `dangChayPhepThu` trong
  // src/lib/lark/notify.ts: chốt đó sinh ra sau khi sáu thẻ "Test BB114…" rơi
  // vào nhóm Lark thật của studio trong một lượt `npm run test` ngày 21/09.
  process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU;
});

const tinMau = {
  branchId: "11111111-1111-1111-1111-111111111111",
  event: "selection.submitted" as const,
  payload: {
    galleryId: "aaaaaaaa-0000-0000-0000-000000000001",
    galleryTitle: "HD_20260908#5055",
    selectedCount: 24,
    includedQuota: 20,
    extraCount: 4,
    extraAmount: 200000,
    confirmedByName: "Nguyễn Thị A",
    customerPhone: "090***4567",
  },
};

describe("BB-167 — bắn tin CSKH", () => {
  it("gửi ngay, và ghi lại là đã gửi", async () => {
    await enqueueLarkNotification(tinMau);

    expect(fetchGia).toHaveBeenCalledTimes(1);
    const [diaChi, tuyChon] = fetchGia.mock.calls[0]!;
    expect(diaChi).toContain("open.larksuite.com");
    expect((tuyChon as { method: string }).method).toBe("POST");

    // Hàng đợi vẫn ghi — nó là sổ cái, không còn là đường đi chính.
    expect(soCai).toHaveLength(1);
    expect(soCai[0]!.status).toBe("sent");
  });

  it("Lark chết thì ghi `failed`, không ném", async () => {
    fetchGia.mockRejectedValue(new Error("mất mạng"));

    await expect(enqueueLarkNotification(tinMau)).resolves.toBeUndefined();

    expect(soCai[0]!.status).toBe("failed");
    expect(String(soCai[0]!.last_error)).toContain("mất mạng");
  });

  it("CƠ SỞ DỮ LIỆU nổ cũng KHÔNG được ném — nút Chốt không hỏng theo", async () => {
    // Ca trên không canh được điều này: lỗi `fetch` bị bắt ngay trong `gui()`,
    // không bao giờ tới được khối catch ngoài cùng. Đo thật ngày 21/09: bỏ khối
    // catch đó đi thì cả bộ phép thử vẫn XANH — tức là nó không canh gì.
    //
    // Đường duy nhất chạm tới khối ấy là lỗi ở tầng cơ sở dữ liệu. Và đó không
    // phải giả định xa vời: `enqueueLarkNotification` đứng NGAY SAU khi lượt chọn
    // của ba mẹ đã ghi xong. Ném ở đây là biến một việc ĐÃ XONG thành một cái
    // 500 trước mặt họ, và họ sẽ bấm Chốt lại.
    csdlNo = true;

    await expect(enqueueLarkNotification(tinMau)).resolves.toBeUndefined();
    expect(fetchGia).not.toHaveBeenCalled();
  });

  it("Lark trả 200 kèm mã lỗi trong thân thì KHÔNG được tính là đã gửi", async () => {
    // Lark trả 200 cả khi thẻ sai hay webhook đã bị xoá. Đọc 200 là thành công
    // nghĩa là đánh dấu `sent` cho một tin không ai nhận được — đúng loại im
    // lặng mà cả task này sinh ra để dẹp.
    fetchGia.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 19021, msg: "webhook not found" }),
    });

    await enqueueLarkNotification(tinMau);
    expect(soCai[0]!.status).toBe("failed");
    expect(String(soCai[0]!.last_error)).toContain("19021");
  });

  it("chưa cấu hình nhóm Lark thì bỏ qua, KHÔNG gửi đi đâu cả", async () => {
    webhookTrongSettings = null;

    await enqueueLarkNotification(tinMau);

    expect(fetchGia).not.toHaveBeenCalled();
    // `skipped` chứ không `failed`: chưa dựng nhóm Lark là chuyện bình thường,
    // và màn Cài đặt phải phân biệt được với "cấu hình rồi mà gửi hỏng".
    expect(soCai[0]!.status).toBe("skipped");
  });

  it("địa chỉ webhook lạ thì từ chối — không đẩy tin của studio sang máy người khác", async () => {
    // `settings` là bảng CSKH và quản lý chi nhánh sửa được. Một dòng gõ nhầm
    // (hay gõ cố ý) biến tên khách, số điện thoại, số tiền thành một dòng POST
    // đều đặn sang máy chủ lạ.
    for (const xau of [
      "https://evil.example.com/hook",
      "http://open.larksuite.com/open-apis/bot/v2/hook/abc",
      "https://open.larksuite.com.evil.example/open-apis/bot/v2/hook/abc",
    ]) {
      soCai.length = 0;
      fetchGia.mockClear();
      webhookTrongSettings = xau;

      await enqueueLarkNotification(tinMau);
      expect(fetchGia, `phải từ chối: ${xau}`).not.toHaveBeenCalled();
    }
  });

  it("không ảnh của bé nào lọt sang Lark", async () => {
    await enqueueLarkNotification({
      ...tinMau,
      payload: {
        ...tinMau.payload,
        photoUrl: "https://drive.google.com/file/d/xyz/view",
        thumbnails: "https://lh3.googleusercontent.com/abc.jpg",
        anhBia: "https://example.com/be-bo.jpeg",
        coverImage: "abc.png",
      },
    });

    const than = JSON.stringify(fetchGia.mock.calls[0]![1]) + JSON.stringify(soCai);
    for (const cam of ["drive.google.com", "googleusercontent", "be-bo.jpeg", "abc.png"]) {
      expect(than, `lọt ${cam} sang Lark`).not.toContain(cam);
    }
  });

  it("che giữa số điện thoại", () => {
    expect(cheSoDienThoai("0901234567")).toBe("090***4567");
    expect(cheSoDienThoai("090 123 4567")).toBe("090***4567");
    expect(cheSoDienThoai(null)).toBeNull();
    // Số quá ngắn thì che hết, đừng cố đoán hình dạng.
    expect(cheSoDienThoai("12345")).toBe("***");
  });

  it("lọc bỏ ảnh nhưng GIỮ lại số liệu nghiệp vụ", () => {
    const ra = locBoAnh({ selectedCount: 24, extraAmount: 200000, photoUrl: "https://x/y.jpg" });
    expect(ra.selectedCount).toBe(24);
    expect(ra.extraAmount).toBe(200000);
    expect(ra.photoUrl).toBeUndefined();
  });

  it("thẻ có phụ thu thì đổi màu và đổi tiêu đề", () => {
    const coThua = dungThe("selection.submitted", tinMau.payload, null) as {
      card: { header: { template: string; title: { content: string } } };
    };
    expect(coThua.card.header.template).toBe("orange");
    expect(coThua.card.header.title.content).toContain("PHỤ THU");

    const khongThua = dungThe(
      "selection.submitted",
      { ...tinMau.payload, extraCount: 0, extraAmount: 0 },
      null,
    ) as { card: { header: { template: string } } };
    expect(khongThua.card.header.template).toBe("green");
  });

  it("sự kiện chưa có mẫu thẻ thì KHÔNG bịa ra tin", () => {
    expect(dungThe("gallery.overdue", {}, null)).toBeNull();
  });
});
