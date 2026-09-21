/**
 * BB-197 — màn Cài đặt: đường API.
 *
 * Ba thứ ca này canh, và cả ba đều là chỗ đã cắn dự án này ít nhất một lần:
 *
 * 1. **Quyền.** Cài đặt ảnh hưởng tới mọi album của mọi chi nhánh, nên chỉ chủ
 *    studio và quản trị được sửa.
 * 2. **Kiểu dữ liệu.** Nhận bừa một `jsonb` rồi ghi thẳng là cách nhanh nhất để
 *    một hôm nào đó màn khách 500 vì `reminder_days` bỗng là chuỗi.
 * 3. **Bí mật không rời máy chủ.** `lark.webhook_url` đọc ra phải bị che.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import * as staffAuth from "@/lib/auth/staff";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("server-only", () => ({}));

import { GET, PATCH } from "@/app/api/admin/settings/route";

const admin = createAdminClient();

function nhuVai(role: string) {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue({
    staffId: "00000000-0000-0000-0000-0000000000aa",
    role,
    branchIds: [],
  } as unknown as Awaited<ReturnType<typeof staffAuth.requireStaff>>);
}

const patch = (than: unknown) =>
  PATCH(
    new Request("http://localhost/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(than),
    }),
  );

/** Giá trị thật trước khi phép thử đụng vào, để trả lại nguyên trạng. */
let hanCu: unknown = null;

describe("BB-197: đường API cài đặt", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    if (hanCu !== null) {
      await admin
        .from("settings")
        .update({ value: hanCu })
        .eq("key", "gallery.default_due_days")
        .is("branch_id", null);
    }
  });

  it("CSKH không đọc và không sửa được cài đặt", async () => {
    nhuVai("cs");
    expect((await GET()).status).toBe(403);

    nhuVai("cs");
    const res = await patch({ thayDoi: [{ key: "gallery.default_due_days", value: 9 }] });
    expect(res.status).toBe(403);
  });

  it("chủ studio đọc được, và webhook Lark bị che", async () => {
    nhuVai("owner");
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();

    const webhook = json.data.items.find(
      (i: { key: string }) => i.key === "lark.webhook_url",
    );
    expect(webhook.biMat).toBe(true);
    // Che nghĩa là KHÔNG còn đọc được địa chỉ thật.
    expect(String(webhook.value)).not.toContain("/hook/");
    expect(String(webhook.value)).toContain("••");

    const han = json.data.items.find(
      (i: { key: string }) => i.key === "gallery.default_due_days",
    );
    expect(typeof han.value).toBe("number");
    hanCu = han.value;

    // `lark_hook_queue` là hàng đợi nội bộ, không phải cài đặt: không được lên
    // màn hình để ai đó sửa nhầm.
    const khoa = json.data.items.map((i: { key: string }) => i.key);
    expect(khoa).not.toContain("lark_hook_queue");
    // Dòng PIN đã chết từ BB-169, migration 0054 xoá hẳn.
    expect(khoa).not.toContain("gallery.require_pin_default");
  });

  it("giá trị sai kiểu bị từ chối, và KHÔNG ghi gì cả", async () => {
    nhuVai("owner");
    const truoc = await admin
      .from("settings")
      .select("value")
      .eq("key", "gallery.default_due_days")
      .is("branch_id", null)
      .single();

    nhuVai("owner");
    const res = await patch({
      thayDoi: [{ key: "gallery.default_due_days", value: "bảy ngày" }],
    });
    expect(res.status).toBe(400);

    const sau = await admin
      .from("settings")
      .select("value")
      .eq("key", "gallery.default_due_days")
      .is("branch_id", null)
      .single();
    expect(sau.data?.value).toEqual(truoc.data?.value);
  });

  it("khoá ngoài danh sách trắng bị từ chối", async () => {
    nhuVai("owner");
    const res = await patch({ thayDoi: [{ key: "lark_hook_queue", value: {} }] });
    expect(res.status).toBe(400);
  });

  it("sửa thật thì đọc lại thấy giá trị mới", async () => {
    nhuVai("owner");
    const res = await patch({ thayDoi: [{ key: "gallery.default_due_days", value: 9 }] });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.daDoi).toContain("gallery.default_due_days");

    const doc = await admin
      .from("settings")
      .select("value")
      .eq("key", "gallery.default_due_days")
      .is("branch_id", null)
      .single();
    expect(doc.data?.value).toBe(9);
  });
});
