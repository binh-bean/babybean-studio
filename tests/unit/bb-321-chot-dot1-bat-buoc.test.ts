/**
 * BB-321 — chốt ĐỢT 1 khi chọn THIẾU so với hạn mức: ô "Tôi đồng ý với ảnh studio
 * chọn dùm và không đổi lại" là BẮT BUỘC (chủ studio 29/09/2026: chỉ có hai đường —
 * "Chọn tiếp" cho đủ, hoặc đồng ý studio chọn dùm; không có đường thứ ba).
 *
 * Gọi THẬT `POST /api/g/submit` trên bb-dev (fixture "Fixture BB321K-…", dọn theo chi
 * nhánh ở afterAll). Chạy được cả khi CHƯA áp 0077: lời từ chối xảy ra trước mọi lần
 * ghi, và lượt chốt hợp lệ đi nhánh "chưa có cột" của route.
 *
 * Kiểm ngược: đổi lại route thành `nho: input.nhoStudioChonThem === true` (bản trước)
 * thì ca 1 nhận 200 thay vì 400 → đỏ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import * as larkNotify from "@/lib/lark/notify";
import { POST as chotDot1 } from "@/app/api/g/submit/route";
import { duLieuBb321K, donDepBb321K, DA_CHON_DOT1, type DuLieuBb321K } from "../fixtures/bb321-khach";

let d: DuLieuBb321K;
let selectionId = "";
let shareLinkId = "";

const submit = (body: unknown) =>
  chotDot1(new Request("http://localhost/api/g/submit", { method: "POST", body: JSON.stringify(body) }));

function phien() {
  vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
    galleryId: d.dot1.id,
    customerId: null,
    role: "owner",
    shareLinkId,
    selectionId,
    exp: 0,
  } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
}

describe("BB-321: chốt đợt 1 chọn thiếu — BẮT BUỘC đồng ý studio chọn dùm", () => {
  beforeAll(async () => {
    d = await duLieuBb321K();
    const { rows } = await d.pg.query("select id, share_link_id from selections where gallery_id = $1", [d.dot1.id]);
    selectionId = rows[0].id;
    shareLinkId = rows[0].share_link_id;
    vi.spyOn(larkNotify, "enqueueLarkNotification").mockResolvedValue(undefined);
  }, 60_000);

  afterAll(async () => {
    if (d) expect(await donDepBb321K(d)).toBe(0);
  }, 60_000);

  const trangThai = async () =>
    (await d.pg.query("select status::text s from galleries where id = $1", [d.dot1.id])).rows[0].s as string;

  it(`chọn ${DA_CHON_DOT1.length}/15, KHÔNG tick đồng ý → 400 thieu_dong_y_anh_studio_chon, bộ ảnh vẫn 'ready'`, async () => {
    phien();
    const res = await submit({ confirmedByName: "Mẹ Lan", agreed: true, bietAnhInChamHon: true });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.details?.loai ?? json.error.chiTiet?.loai ?? JSON.stringify(json)).toContain(
      "thieu_dong_y_anh_studio_chon",
    );
    expect(await trangThai()).toBe("ready");
  });

  it("gửi lời nhờ mà vẫn KHÔNG tick đồng ý → vẫn 400 (không có đường thứ ba)", async () => {
    phien();
    const res = await submit({ confirmedByName: "Mẹ Lan", agreed: true, nhoStudioChonThem: true, bietAnhInChamHon: true });
    expect(res.status).toBe(400);
    expect(await trangThai()).toBe("ready");
  });

  it("tick đồng ý (không cần gửi lời nhờ riêng) → chốt được, bộ ảnh sang 'submitted'", async () => {
    phien();
    const res = await submit({ confirmedByName: "Mẹ Lan", agreed: true, dongYAnhStudioChon: true, bietAnhInChamHon: true });
    expect(res.status).toBe(200);
    expect(await trangThai()).toBe("submitted");
    // Có cột 0077 thì máy chủ TỰ ghi lời nhờ = hạn mức − đã chọn.
    const { rows: cot } = await d.pg.query(
      `select count(*)::int n from information_schema.columns
        where table_schema = 'public' and table_name = 'selections' and column_name = 'nho_studio_chon_them'`,
    );
    if (cot[0].n === 1) {
      const { rows } = await d.pg.query("select nho_studio_chon_them n, dong_y_anh_studio_chon y from selections where id = $1", [
        selectionId,
      ]);
      expect(rows[0]).toEqual({ n: 15 - DA_CHON_DOT1.length, y: true });
    }
  });
});
