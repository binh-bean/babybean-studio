/**
 * BB-196 — xoá bộ ảnh thì dòng nhật ký gỡ trỏ, KHÔNG nằm lại thành mồ côi.
 *
 * Vì sao cần một phép thử chứ không chỉ một lượt đo:
 *
 * BB-173 dạy `db:cleanup` quét nhật ký mồ côi, và số dòng tụt từ 9.823 xuống
 * 720. Đo lại cùng buổi chiều: 389/720 dòng (54%) đã mồ côi trở lại. Cái chổi
 * quét sạch xong thì thứ sinh ra rác lại sinh tiếp.
 *
 * `0051` đổi cách: `activity_logs.gallery_id` có khoá ngoại `on delete set
 * null`, và một trigger gỡ luôn `entity_id` theo. Phép thử này canh đúng chốt
 * đó — bỏ trigger đi là nó phải ĐỎ.
 */
import { randomUUID } from "node:crypto";
import { describe, it, expect, afterAll } from "vitest";
import { createAdminClient } from "../../src/lib/supabase/admin";

describe("BB-196: nhật ký của bộ ảnh đã xoá", () => {
  const admin = createAdminClient();
  const donDep: string[] = [];

  afterAll(async () => {
    if (donDep.length) await admin.from("activity_logs").delete().in("id", donDep);
    // `drive_folder_id` là cột duy nhất: một lượt chạy hỏng giữa chừng để lại
    // bộ ảnh nháp, và lượt sau vấp 23505 chứ không phải vấp thứ nó đi canh.
    // Quét theo tiền tố nên dọn được cả rác của những lượt trước.
    await admin.from("galleries").delete().like("drive_folder_id", "bb196-%");
  });

  it("xoá bộ ảnh thì dòng nhật ký còn nguyên nhưng thôi trỏ vào hư không", async () => {
    const { data: chiNhanh, error: loiCn } = await admin
      .from("branches")
      .select("id")
      .limit(1)
      .single();
    expect(loiCn).toBeNull();

    // Bộ ảnh nháp, đủ để xoá ngay sau đó. Tên mang dấu BB-196 để db:cleanup
    // nhận ra nếu phép thử dừng giữa chừng.
    // `galleries.customer_id` là cột bắt buộc — mượn một khách đang có của
    // đúng chi nhánh đó, không tạo khách giả để khỏi để lại rác.
    const { data: khach, error: loiKh } = await admin
      .from("customers")
      .select("id")
      .eq("branch_id", chiNhanh!.id)
      .limit(1)
      .single();
    expect(loiKh).toBeNull();

    const { data: bo, error: loiBo } = await admin
      .from("galleries")
      .insert({
        branch_id: chiNhanh!.id,
        customer_id: khach!.id,
        title: "Test BB196 — xoá ngay",
        status: "draft",
        drive_folder_id: `bb196-${randomUUID()}`,
        drive_folder_url: "https://drive.google.com/drive/folders/bb196-gia-lap",
      })
      .select("id")
      .single();
    expect(loiBo).toBeNull();

    const { data: dong, error: loiGhi } = await admin
      .from("activity_logs")
      .insert({
        branch_id: chiNhanh!.id,
        actor_type: "staff",
        actor_label: "Phép thử BB-196",
        action: "gallery.create",
        entity_type: "gallery",
        entity_id: bo!.id,
      })
      .select("id, entity_id, gallery_id")
      .single();
    expect(loiGhi).toBeNull();
    donDep.push(dong!.id);

    // Trigger phải điền `gallery_id` ngay lúc ghi, không đợi ai gọi.
    expect(dong!.gallery_id).toBe(bo!.id);

    const { error: loiXoa } = await admin.from("galleries").delete().eq("id", bo!.id);
    expect(loiXoa).toBeNull();

    const { data: sau, error: loiDoc } = await admin
      .from("activity_logs")
      .select("id, entity_type, entity_id, gallery_id, actor_label")
      .eq("id", dong!.id)
      .single();
    expect(loiDoc).toBeNull();

    // Dòng nhật ký CÒN — nó vẫn kể ai đã làm gì.
    expect(sau!.actor_label).toBe("Phép thử BB-196");
    expect(sau!.entity_type).toBe("gallery");
    // …nhưng thôi trỏ vào một bộ ảnh không còn tồn tại.
    expect(sau!.gallery_id).toBeNull();
    expect(sau!.entity_id).toBeNull();
  });
});
