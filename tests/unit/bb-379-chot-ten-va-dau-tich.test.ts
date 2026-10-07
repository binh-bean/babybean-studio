/**
 * BB-379 — hộp "Chốt danh sách": chủ studio 22/09/2026 "tên người xác nhận là tên khách hàng trong
 * bộ; dấu tích ghi xác nhận đúng thông tin". Phần MÁY CHỦ của luật đó (phần giao diện — ô tên
 * điền sẵn, nút khoá tới khi tích — nằm ở tests/e2e/bb-379-kiem-quan-tri.spec.ts):
 *
 *   1. thiếu dấu tích (`agreed` false / không gửi) → 400, bộ ảnh KHÔNG chốt;
 *   2. thiếu tên người xác nhận (rỗng / toàn khoảng trắng / không gửi) → 400, bộ ảnh KHÔNG chốt;
 *   3. đủ cả hai → 200, tên + thời điểm LƯU (`selections.submitted_by_name` / `submitted_at`);
 *   4. quản trị ĐỌC RA: `GET /api/admin/galleries/[id]/items` trả `nguoiXacNhan` + `submittedAt`.
 *
 * Gọi THẬT route trên bb-dev, nền "Fixture BB321K-…" (tests/fixtures/bb321-khach.ts, dọn theo
 * chi nhánh). Hai ô tick của BB-321 (chọn thiếu / còn ảnh in chưa có ảnh) được tích đầy đủ để ca
 * thành công đi tới cuối.
 *
 * Kiểm ngược (kết quả trong bàn giao): schema `agreed: z.literal(true)` → `z.boolean().optional()`
 * thì ca 1 đỏ; route `items` bỏ `nguoiXacNhan` thì ca 4 đỏ.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import * as larkNotify from "@/lib/lark/notify";
import * as staffAuth from "@/lib/auth/staff";
import { POST as chot } from "@/app/api/g/submit/route";
import { GET as chiTiet } from "@/app/api/admin/galleries/[id]/items/route";
import { duLieuBb321K, donDepBb321K, type DuLieuBb321K } from "../fixtures/bb321-khach";
import { quyenCuaVai } from "../fixtures/phien-nhan-su";

let d: DuLieuBb321K;
let selectionId = "";
let shareLinkId = "";

const submit = (body: unknown) => chot(new Request("http://localhost/api/g/submit", { method: "POST", body: JSON.stringify(body) }));

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

const DU_TICK = { dongYAnhStudioChon: true, bietAnhInChamHon: true };
const trangThai = async () => (await d.pg.query("select status::text s from galleries where id = $1", [d.dot1.id])).rows[0].s as string;

describe("BB-379: chốt danh sách cần tên + dấu tích; quản trị thấy lại", () => {
  beforeAll(async () => {
    d = await duLieuBb321K();
    const { rows } = await d.pg.query("select id, share_link_id from selections where gallery_id = $1", [d.dot1.id]);
    selectionId = rows[0].id;
    shareLinkId = rows[0].share_link_id;
    vi.spyOn(larkNotify, "enqueueLarkNotification").mockResolvedValue(undefined);
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (d) expect(await donDepBb321K(d)).toBe(0);
  }, 60_000);

  it("1. thiếu dấu tích (false hoặc không gửi) → 400, bộ ảnh vẫn 'ready'", async () => {
    for (const body of [
      { confirmedByName: "Mẹ Lan", agreed: false, ...DU_TICK },
      { confirmedByName: "Mẹ Lan", ...DU_TICK },
    ]) {
      phien();
      const res = await submit(body);
      expect(res.status).toBe(400);
      expect(await trangThai()).toBe("ready");
    }
  });

  it("2. thiếu tên người xác nhận (rỗng / khoảng trắng / không gửi) → 400, bộ ảnh vẫn 'ready'", async () => {
    for (const body of [
      { confirmedByName: "", agreed: true, ...DU_TICK },
      { confirmedByName: "   ", agreed: true, ...DU_TICK },
      { agreed: true, ...DU_TICK },
    ]) {
      phien();
      const res = await submit(body);
      expect(res.status).toBe(400);
      expect(await trangThai()).toBe("ready");
    }
  });

  it("3. đủ tên + dấu tích → 200; tên (đã gọn) và thời điểm được LƯU", async () => {
    phien();
    const truoc = Date.now();
    const res = await submit({ confirmedByName: "  Nguyễn Thị Lan  ", agreed: true, ...DU_TICK });
    expect(res.status).toBe(200);
    expect(await trangThai()).toBe("submitted");
    const { rows } = await d.pg.query("select submitted_by_name n, submitted_at t from selections where id = $1", [selectionId]);
    expect(rows[0].n).toBe("Nguyễn Thị Lan");
    expect(new Date(rows[0].t).getTime()).toBeGreaterThanOrEqual(truoc - 5_000);
  });

  it("4. quản trị đọc ra tên người xác nhận + thời điểm chốt", async () => {
    vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-0000-0000-000000000379",
      role: "owner",
      permissions: quyenCuaVai("owner"),
      branchIds: [d.branchId],
    });
    const res = await chiTiet(new Request("http://localhost/x"), { params: Promise.resolve({ id: d.dot1.id }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.nguoiXacNhan).toBe("Nguyễn Thị Lan");
    expect(json.data.submittedAt).toBeTruthy();
  });
});
