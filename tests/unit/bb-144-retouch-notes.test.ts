import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { patchSelection } from "@/lib/selection/mutate";
import type { GallerySession } from "@/types/domain";

describe("BB-144: Lưu ghi chú và nhãn từng ảnh", () => {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let branchId: string;
  let customerId: string;
  let galleryId: string;
  let selectionId: string;
  let shareLinkId: string;
  let photo1: string;
  let photo2: string;

  let session: GallerySession;

  beforeAll(async () => {
    branchId = (await supabase.from("branches").select("id").limit(1).single()).data!.id;
    customerId = (await supabase.from("customers").select("id").limit(1).single()).data!.id;
    galleryId = randomUUID();
    selectionId = randomUUID();
    photo1 = randomUUID();
    photo2 = randomUUID();
    shareLinkId = randomUUID();

    const { error: gErr } = await supabase.from("galleries").insert({
      id: galleryId,
      branch_id: branchId,
      customer_id: customerId,
      drive_folder_id: "test_bb144_" + randomUUID(),
      drive_folder_url: "https://drive.google.com/test",
      title: "Test BB-144",
      status: "ready",
      photo_count: 2,
      included_quota: 5,
      max_selection: null,
      allow_extra: true,
      extra_photo_price: 50000,
    });
    if (gErr) throw gErr;

    const { error: lErr } = await supabase.from("share_links").insert({
      id: shareLinkId,
      gallery_id: galleryId,
      token_hash: randomUUID(),
      token_prefix: "144144",
      role: "owner",
      label: "Ba Mẹ",
    });
    if (lErr) throw lErr;

    const { error: sErr } = await supabase.from("selections").insert({
      id: selectionId,
      gallery_id: galleryId,
      share_link_id: shareLinkId,
      display_name: "Test Selection BB-144",
    });
    if (sErr) throw sErr;

    const { error: pErr } = await supabase.from("photos").insert([
      {
        id: photo1,
        gallery_id: galleryId,
        drive_file_id: randomUUID(),
        file_name: "photo1.jpg",
        mime_type: "image/jpeg",
        status: "active",
        width: 800,
        height: 600,
        sort_index: 1,
      },
      {
        id: photo2,
        gallery_id: galleryId,
        drive_file_id: randomUUID(),
        file_name: "photo2.jpg",
        mime_type: "image/jpeg",
        status: "active",
        width: 800,
        height: 600,
        sort_index: 2,
      },
    ]);
    if (pErr) throw pErr;

    session = {
      galleryId,
      shareLinkId,
      selectionId,
      customerId,
      role: "owner",
      exp: 0,
    };
  });

  afterAll(async () => {
    if (galleryId) {
      await supabase.from("galleries").delete().eq("id", galleryId);
    }
  });

  it("1. Chọn ảnh kèm ghi chú và thẻ -> lưu thành công", async () => {
    const res = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [
          {
            photoId: photo1,
            mark: "selected",
            retouchNote: "Xoá mụn sữa trên má",
            noteTags: ["xoa_mun_sua", "lam_sang_da"],
          },
        ],
      },
      null,
      null
    );

    expect(res.error).toBeUndefined();
    expect(res.data?.applied).toBe(1);

    const { data: item } = await supabase
      .from("selection_items")
      .select("mark, retouch_note, note_tags")
      .eq("selection_id", selectionId)
      .eq("photo_id", photo1)
      .single();

    expect(item?.mark).toBe("selected");
    expect(item?.retouch_note).toBe("Xoá mụn sữa trên má");
    expect(item?.note_tags).toEqual(["xoa_mun_sua", "lam_sang_da"]);
  });

  it("2. Ảnh đã chọn, cập nhật ghi chú (không gửi mark) -> giữ nguyên mark, đổi note", async () => {
    const res = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [
          {
            photoId: photo1,
            retouchNote: "Chỉnh thêm tóc mai",
          },
        ],
      },
      null,
      null
    );

    expect(res.error).toBeUndefined();
    expect(res.data?.applied).toBe(1);

    const { data: item } = await supabase
      .from("selection_items")
      .select("mark, retouch_note, note_tags")
      .eq("selection_id", selectionId)
      .eq("photo_id", photo1)
      .single();

    expect(item?.mark).toBe("selected");
    expect(item?.retouch_note).toBe("Chỉnh thêm tóc mai");
    // Không gửi noteTags -> giữ nguyên noteTags cũ
    expect(item?.note_tags).toEqual(["xoa_mun_sua", "lam_sang_da"]);
  });

  it("3. Gửi retouchNote = null -> xoá ghi chú", async () => {
    const res = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [
          {
            photoId: photo1,
            retouchNote: null,
          },
        ],
      },
      null,
      null
    );

    expect(res.error).toBeUndefined();
    expect(res.data?.applied).toBe(1);

    const { data: item } = await supabase
      .from("selection_items")
      .select("mark, retouch_note, note_tags")
      .eq("selection_id", selectionId)
      .eq("photo_id", photo1)
      .single();

    expect(item?.mark).toBe("selected");
    expect(item?.retouch_note).toBeNull();
    // noteTags không gửi -> vẫn giữ nguyên
    expect(item?.note_tags).toEqual(["xoa_mun_sua", "lam_sang_da"]);
  });

  it("4. Gửi noteTags = [] -> xoá danh sách thẻ", async () => {
    const res = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [
          {
            photoId: photo1,
            noteTags: [],
          },
        ],
      },
      null,
      null
    );

    expect(res.error).toBeUndefined();
    expect(res.data?.applied).toBe(1);

    const { data: item } = await supabase
      .from("selection_items")
      .select("mark, retouch_note, note_tags")
      .eq("selection_id", selectionId)
      .eq("photo_id", photo1)
      .single();

    expect(item?.mark).toBe("selected");
    expect(item?.note_tags).toEqual([]);
  });

  it("5. Ghi chú cho ảnh CHƯA ĐƯỢC CHỌN (và không chọn) -> bị từ chối INVALID_INPUT", async () => {
    const res = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [
          {
            photoId: photo2,
            retouchNote: "Ghi chú cho ảnh chưa chọn",
          },
        ],
      },
      null,
      null
    );

    expect(res.error).toBeUndefined();
    // RPC reject ảnh này vì chưa chọn và không đánh dấu
    expect(res.data?.rejected?.length).toBe(1);
    expect(res.data?.rejected?.[0]?.photoId).toBe(photo2);
    expect(res.data?.rejected?.[0]?.code).toBe("INVALID_INPUT");

    // Dưới database không có dòng nào của photo2
    const { data: item } = await supabase
      .from("selection_items")
      .select("id")
      .eq("selection_id", selectionId)
      .eq("photo_id", photo2);

    expect(item?.length).toBe(0);
  });

  it("6. Chốt xong vẫn sửa được ghi chú; CSKH xác nhận rồi mới GALLERY_LOCKED", async () => {
    /*
      Đổi luật 22/09/2026 (migration 0060): mốc khoá là lúc CSKH XÁC NHẬN, không
      phải lúc ba mẹ bấm Chốt.

      Ghi chú chỉnh sửa là ca rõ nhất cho quyết định đó: ba mẹ chốt xong mới
      nhớ ra "tấm này xoá giúp em cái dây điện phía sau". Chừng nào CSKH chưa
      chuyển cho thợ chỉnh ảnh thì thêm câu đó không làm hỏng việc của ai.
    */
    await supabase.from("galleries").update({ status: "submitted" }).eq("id", galleryId);

    const resSauChot = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [{ photoId: photo1, retouchNote: "Xoá giúp em cái dây điện phía sau" }],
      },
      null,
      null,
    );
    expect(resSauChot.error).toBeUndefined();

    const { data: item } = await supabase
      .from("selection_items")
      .select("retouch_note")
      .eq("selection_id", session.selectionId)
      .eq("photo_id", photo1)
      .single();
    expect(item?.retouch_note).toBe("Xoá giúp em cái dây điện phía sau");

    // CSKH xác nhận -> từ đây công đã đổ vào danh sách, khoá lại.
    await supabase.from("galleries").update({ status: "in_retouch" }).eq("id", galleryId);

    const resSauKhoa = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [{ photoId: photo1, retouchNote: "Cố sửa khi đã khoá" }],
      },
      null,
      null,
    );
    expect(resSauKhoa.error?.code).toBe("GALLERY_LOCKED");

    // Khôi phục lại ready
    await supabase.from("galleries").update({ status: "ready" }).eq("id", galleryId);
  });

  it("7. Gửi ghi chú + thẻ -> đọc lại bằng GET /api/g/photos thấy đúng", async () => {
    // 1. Cập nhật ghi chú và thẻ cho photo1
    const patchRes = await patchSelection(
      session,
      {
        clientOpId: randomUUID(),
        ops: [
          {
            photoId: photo1,
            retouchNote: "Bé bị xước nhẹ ở trán, nhờ sửa giúp",
            noteTags: ["xoa_mun_sua", "lam_sang_da"],
          },
        ],
      },
      null,
      null
    );
    expect(patchRes.error).toBeUndefined();

    // 2. Mock session để gọi GET /api/g/photos
    const gallerySession = await import("@/lib/auth/gallery-session");
    const sessionSpy = vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId,
      shareLinkId,
      selectionId,
      customerId,
      role: "owner",
      exp: 0,
    });

    const { GET } = await import("@/app/api/g/photos/route");
    const req = new NextRequest("http://localhost/api/g/photos");
    const response = await GET(req);
    const json = await response.json();

    sessionSpy.mockRestore();

    expect(response.status).toBe(200);
    expect(json.data).toBeDefined();

    const returnedPhoto = json.data.find((p: { id: string }) => p.id === photo1);
    expect(returnedPhoto).toBeDefined();
    expect(returnedPhoto.retouchNote).toBe("Bé bị xước nhẹ ở trán, nhờ sửa giúp");
    expect(returnedPhoto.noteTags).toEqual(["xoa_mun_sua", "lam_sang_da"]);
  });

  it("8. Giả lập ghi hỏng (.update() trả lỗi) -> lối gọi NHẬN ĐƯỢC lỗi, không nuốt thành 200", async () => {
    const admin = await import("@/lib/supabase/admin");
    const adminClient = admin.createAdminClient();

    // Giả lập .from("selection_items").update() bị lỗi
    const originalFrom = adminClient.from.bind(adminClient);
    const fromSpy = vi.spyOn(adminClient, "from").mockImplementation((table: string) => {
      const builder = originalFrom(table);
      if (table === "selection_items") {
        return new Proxy(builder, {
          get(target, prop, receiver) {
            if (prop === "update") {
              return () => ({
                eq: () => ({
                  eq: () =>
                    Promise.resolve({
                      error: { message: "Simulated database constraint failure" },
                      data: null,
                      count: null,
                      status: 400,
                      statusText: "Bad Request",
                    }),
                }),
              });
            }
            return Reflect.get(target, prop, receiver);
          },
        });
      }
      return builder;
    });

    try {
      // 1. Kiểm tra tầng service: patchSelection phải trả về error code INTERNAL, không trả về data
      const res = await patchSelection(
        session,
        {
          clientOpId: randomUUID(),
          ops: [
            {
              photoId: photo1,
              retouchNote: "Thử ghi hỏng",
            },
          ],
        },
        null,
        null
      );

      expect(res.data).toBeUndefined();
      expect(res.error).toBeDefined();
      expect(res.error?.code).toBe("INTERNAL");

      // 2. Kiểm tra tầng API route: lối gọi nhận HTTP 500, TUYỆT ĐỐI KHÔNG nhận 200
      const gallerySession = await import("@/lib/auth/gallery-session");
      const sessionSpy = vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
        galleryId,
        shareLinkId,
        selectionId,
        customerId,
        role: "owner",
        exp: 0,
      });

      const { PATCH } = await import("@/app/api/g/selection/route");
      const req = new Request("http://localhost/api/g/selection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientOpId: randomUUID(),
          ops: [
            {
              photoId: photo1,
              retouchNote: "Thử ghi hỏng qua API",
            },
          ],
        }),
      });

      const httpResponse = await PATCH(req);
      const httpJson = await httpResponse.json();

      sessionSpy.mockRestore();

      // Khẳng định lối gọi nhận được lỗi HTTP 500, không nuốt thành 200
      expect(httpResponse.status).toBe(500);
      expect(httpJson.error).toBeDefined();
      expect(httpJson.error.code).toBe("INTERNAL");
      expect(httpJson.data).toBeUndefined();
    } finally {
      fromSpy.mockRestore();
    }
  });
});
