/**
 * BB-214(c) — Giá một ảnh chọn thêm mặc định phải đọc từ settings.
 *
 * OWNER: DEV-BE.
 * Spec: db/migrations/0065-gia-anh-chon-them-mac-dinh.sql
 *
 * ---------------------------------------------------------------------------
 * Thước đo của AGENTS.md §5a
 * ---------------------------------------------------------------------------
 * Hoàn nguyên bản vá (đổi `v_extra_price := coalesce(p_extra_photo_price,
 * v_settings_price, v_pkg.extra_photo_price)` lại thành
 * `coalesce(p_extra_photo_price, v_pkg.extra_photo_price)` như trước 0065)
 * thì ca 1 phải ĐỎ: bộ ảnh mới sẽ mang giá của GÓI thay vì giá đã đổi trong
 * settings.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";
import { khoaCaiDat, moKhoaCaiDat, type KhoaCaiDat } from "../helpers/khoa-cai-dat";

const admin = createAdminClient();
const runId = randomUUID().slice(0, 8);

const packageIds: string[] = [];
const customerIds: string[] = [];
const galleryIds: string[] = [];

const KHOA = "gallery.extra_photo_price_default";

async function docSettings(): Promise<unknown> {
  const { data } = await admin
    .from("settings")
    .select("value")
    .eq("key", KHOA)
    .is("branch_id", null)
    .maybeSingle();
  return data?.value ?? null;
}

async function ghiSettings(v: number): Promise<void> {
  // Không dùng upsert: chỉ mục duy nhất của settings là theo BIỂU THỨC
  // (key, coalesce(branch_id, '000…')), onConflict cột thường không khớp —
  // cùng lý do và cùng cách với src/app/api/admin/settings/route.ts.
  const { data: daSua, error } = await admin
    .from("settings")
    .update({ value: v } as never)
    .eq("key", KHOA)
    .is("branch_id", null)
    .select("id");
  if (error) throw error;
  if (!daSua || daSua.length === 0) {
    const { error: loiChen } = await admin
      .from("settings")
      .insert({ key: KHOA, branch_id: null, value: v } as never);
    if (loiChen) throw loiChen;
  }
}

describe("BB-214c · giá ảnh chọn thêm mặc định cấu hình được", () => {
  let branchId: string;
  let goc: unknown;
  /**
   * Khoá riêng cho `gallery.extra_photo_price_default` — chặn hai agent chạy
   * song song ghi đè lẫn nhau lên dòng `settings` toàn cục này. Xem
   * tests/helpers/khoa-cai-dat.ts.
   */
  let khoa: KhoaCaiDat;

  beforeAll(async () => {
    khoa = await khoaCaiDat(KHOA);
    const { data: branch } = await admin.from("branches").select("id").limit(1).single();
    if (!branch) throw new Error("Cần ít nhất một chi nhánh");
    branchId = (branch as { id: string }).id;
    goc = await docSettings();
  });

  afterAll(async () => {
    if (galleryIds.length) await admin.from("galleries").delete().in("id", galleryIds);
    if (packageIds.length) await admin.from("packages").delete().in("id", packageIds);
    if (customerIds.length) await admin.from("customers").delete().in("id", customerIds);
    // Trả settings về đúng giá trị cũ — bb-dev là cơ sở dữ liệu thật.
    if (goc !== null) await ghiSettings(goc as number);
    await moKhoaCaiDat(khoa);
  });

  it("1. Bộ ảnh mới, không truyền giá riêng, lấy giá từ settings — KHÔNG lấy giá của gói", async () => {
    // Gói mang một giá KHÁC hẳn settings, để phân biệt được hai nguồn.
    const { data: pkg, error: pkgErr } = await admin
      .from("packages")
      .insert({
        branch_id: branchId,
        code: `FIXTURE-BB214C-${runId}`,
        name: `Fixture BB-214c ${runId}`,
        extra_photo_price: 12345,
        included_quota: 20,
      } as never)
      .select("id")
      .single();
    if (pkgErr || !pkg) throw pkgErr ?? new Error("không tạo được gói fixture");
    packageIds.push((pkg as { id: string }).id);

    await ghiSettings(77777);

    const token = `bb214c-${runId}`;
    const { data: result, error } = await admin.rpc("create_gallery_bundle", {
      p_branch_id: branchId,
      p_new_customer: { fullName: "Fixture BB-214c Nguyễn Thị Mai", phone: "0901000099" },
      p_package_id: (pkg as { id: string }).id,
      p_title: `Fixture BB-214c ${runId}`,
      p_drive_folder_id: `FIXTURE_BB214C_${runId}`,
      p_drive_folder_url: `https://drive.google.com/drive/folders/FIXTURE_BB214C_${runId}`,
      p_token_hash: `hash-${runId}`,
      p_token_prefix: token.slice(0, 6),
    });
    if (error || !result) throw error ?? new Error("RPC không trả kết quả");

    const galleryId = (result as { gallery_id: string }).gallery_id;
    const customerId = (result as { customer_id: string }).customer_id;
    galleryIds.push(galleryId);
    customerIds.push(customerId);

    const { data: gallery } = await admin
      .from("galleries")
      .select("extra_photo_price")
      .eq("id", galleryId)
      .single();

    expect(Number((gallery as { extra_photo_price: number }).extra_photo_price)).toBe(77777);
  });

  it("2. Form vẫn ghi đè được: truyền p_extra_photo_price thì dùng đúng số đó, không phải settings", async () => {
    const { data: pkg, error: pkgErr } = await admin
      .from("packages")
      .insert({
        branch_id: branchId,
        code: `FIXTURE-BB214C-B-${runId}`,
        name: `Fixture BB-214c ghi đè ${runId}`,
        extra_photo_price: 12345,
        included_quota: 20,
      } as never)
      .select("id")
      .single();
    if (pkgErr || !pkg) throw pkgErr ?? new Error("không tạo được gói fixture");
    packageIds.push((pkg as { id: string }).id);

    await ghiSettings(77777);

    const token = `bb214c-b-${runId}`;
    const { data: result, error } = await admin.rpc("create_gallery_bundle", {
      p_branch_id: branchId,
      p_new_customer: { fullName: "Fixture BB-214c Ghi Đè", phone: "0901000098" },
      p_package_id: (pkg as { id: string }).id,
      p_extra_photo_price: 99999,
      p_title: `Fixture BB-214c ghi đè ${runId}`,
      p_drive_folder_id: `FIXTURE_BB214C_B_${runId}`,
      p_drive_folder_url: `https://drive.google.com/drive/folders/FIXTURE_BB214C_B_${runId}`,
      p_token_hash: `hash-b-${runId}`,
      p_token_prefix: token.slice(0, 6),
    });
    if (error || !result) throw error ?? new Error("RPC không trả kết quả");

    const galleryId = (result as { gallery_id: string }).gallery_id;
    const customerId = (result as { customer_id: string }).customer_id;
    galleryIds.push(galleryId);
    customerIds.push(customerId);

    const { data: gallery } = await admin
      .from("galleries")
      .select("extra_photo_price")
      .eq("id", galleryId)
      .single();

    expect(Number((gallery as { extra_photo_price: number }).extra_photo_price)).toBe(99999);
  });

  it("3. Đổi settings sau khi bộ ảnh đã tạo KHÔNG đổi giá của bộ ảnh đó", async () => {
    // Bộ ảnh của ca 1 đã tạo với settings = 77777.
    await ghiSettings(123456);

    const galleryId = galleryIds[0];
    const { data: gallery } = await admin
      .from("galleries")
      .select("extra_photo_price")
      .eq("id", galleryId)
      .single();

    expect(Number((gallery as { extra_photo_price: number }).extra_photo_price)).toBe(77777);
  });

  it("4. Khoá settings nằm trong danh sách sửa được ở màn Cài đặt (BB-197)", async () => {
    const { KHOA_SUA_DUOC } = await import("@/app/api/admin/settings/schema");
    expect(KHOA_SUA_DUOC.has(KHOA)).toBe(true);
  });
});
