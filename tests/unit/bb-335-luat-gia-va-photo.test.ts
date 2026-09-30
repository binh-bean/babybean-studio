/**
 * BB-335 — (1) luật giá hạ ngưỡng: kích thước có giá bên Lark thì khách thấy;
 * (2) cột "photo" của Hậu Kỳ bên Lark → galleries.lark_photo.
 *
 * Hàm thuần — không gọi Lark. Phần cuối chỉ ĐỌC bb-dev (information_schema),
 * không ghi gì.
 */
import { describe, it, expect } from "vitest";
import { Client } from "pg";
import {
  trangThaiKichThuoc,
  giaDuocBaoTuDong,
} from "@/lib/products/kich-thuoc-dang-ban";
import { tenPhotoTuO, gopGiaTriPhoto, laThieuCotLarkPhoto } from "@/lib/lark/photo-hau-ky";
import { dungBangMa, dichBanGhi, ghiPhotoVaoGalleries, type CotLark } from "@/lib/lark/doc-trang-thai-lark";
import { MA_NEO_COT_TRANG_THAI } from "@/lib/lark/trang-thai-hau-ky";
// @ts-expect-error — tệp .mjs không có khai báo kiểu
import { giaNiemYet } from "../../scripts/sync-lark-catalog.mjs";

describe("BB-335 luật giá: có giá bên Lark là khách thấy", () => {
  it("Gỗ 120×180: có giá, 1 lần bán → khách thấy (trước BB-335 bị ẩn vì < 5 mẫu)", () => {
    expect(trangThaiKichThuoc({ listPrice: 4400000, priceConfidence: 1, priceSamples: 1 })).toBe("khach_thay");
  });
  it("Mica 70×110: 0 lần bán nhưng giá nhập thẳng bên Lark (tin cậy 1) → khách thấy", () => {
    expect(trangThaiKichThuoc({ listPrice: 7600000, priceConfidence: 1, priceSamples: 0 })).toBe("khach_thay");
  });
  it("anh chốt 30/09: chưa bán lần nào nhưng CÓ GIÁ → khách thấy", () => {
    expect(trangThaiKichThuoc({ listPrice: 300000, priceConfidence: 0.9, priceSamples: 0 })).toBe("khach_thay");
    expect(trangThaiKichThuoc({ listPrice: 300000, priceConfidence: null, priceSamples: 0 })).toBe("khach_thay");
    expect(trangThaiKichThuoc({ listPrice: 500000, priceConfidence: 0.5, priceSamples: 2 })).toBe("khach_thay");
  });
  it("không có giá / giá 0 → chưa có giá, không bịa giá", () => {
    expect(trangThaiKichThuoc({ listPrice: null, priceConfidence: null, priceSamples: 0 })).toBe("chua_co_gia");
    expect(trangThaiKichThuoc({ listPrice: 0, priceConfidence: 1, priceSamples: 0 })).toBe("chua_co_gia");
  });
  it("dòng Supabase (numeric về dạng chuỗi) đi cùng luật", () => {
    expect(giaDuocBaoTuDong({ list_price: "1600000", price_confidence: "1.000", price_samples: 3 })).toBe(true);
    expect(giaDuocBaoTuDong({ list_price: null, price_confidence: null, price_samples: 0 })).toBe(false);
  });
});

describe("BB-335 đồng bộ danh mục: 'Giá Bán' bên Lark là giá niêm yết", () => {
  it("có Giá Bán, chưa bán lần nào → giá đó, tin cậy 1, 0 mẫu", () => {
    expect(giaNiemYet(7600000, undefined)).toEqual({ price: 7600000, confidence: 1, samples: 0 });
  });
  it("có Giá Bán + giá quan sát → Giá Bán, giữ số lần bán", () => {
    expect(giaNiemYet(1600000, { price: 1600000, confidence: 1, samples: 3 })).toEqual({
      price: 1600000,
      confidence: 1,
      samples: 3,
    });
  });
  it("Giá Bán trống/0 → rơi về giá quan sát; không có cả hai → null", () => {
    const qs = { price: 20000, confidence: 0.9, samples: 15 };
    expect(giaNiemYet(0, qs)).toBe(qs);
    expect(giaNiemYet(0, undefined)).toEqual({ price: null, confidence: null, samples: 0 });
  });
});

describe("BB-335 Photo: bóc tên thợ chụp từ ô Lark", () => {
  it("Lookup → User (hình dạng đo thật 30/09): { users: [...] }", () => {
    expect(
      tenPhotoTuO({ users: [{ id: "ou_x", userId: "u1", name: "Fixture BB-335 Thợ A", enName: "A", notify: false }] }),
    ).toBe("Fixture BB-335 Thợ A");
  });
  it("nhiều người → 'A, B', bỏ trùng", () => {
    expect(
      tenPhotoTuO({ users: [{ name: "Fixture BB-335 A" }, { name: "Fixture BB-335 B" }, { name: "Fixture BB-335 A" }] }),
    ).toBe("Fixture BB-335 A, Fixture BB-335 B");
  });
  it("cột đổi sang User thường / Text / chọn-một / search {value} vẫn ra tên", () => {
    expect(tenPhotoTuO([{ name: "Fixture BB-335 A" }])).toBe("Fixture BB-335 A");
    expect(tenPhotoTuO("Fixture BB-335 A")).toBe("Fixture BB-335 A");
    expect(tenPhotoTuO([{ text: "Fixture BB-335 A", type: "text" }])).toBe("Fixture BB-335 A");
    expect(tenPhotoTuO({ type: 11, value: [{ name: "Fixture BB-335 A" }] })).toBe("Fixture BB-335 A");
  });
  it("ô trống → null (không ra '[object Object]')", () => {
    expect(tenPhotoTuO(undefined)).toBeNull();
    expect(tenPhotoTuO({ users: [] })).toBeNull();
    expect(tenPhotoTuO({})).toBeNull();
  });

  const cot: CotLark[] = [
    { field_id: "f1", field_name: "Trạng Thái", property: { options: [{ id: MA_NEO_COT_TRANG_THAI, name: "X" }] } },
    { field_id: "f2", field_name: "photo" },
  ];
  it("dichBanGhi đọc cột 'photo' khi bảng có cột đó", () => {
    const bang = dungBangMa(cot);
    expect(bang.cotPhoto).toBe("photo");
    const d = dichBanGhi({ photo: { users: [{ name: "Fixture BB-335 A" }] } }, undefined, bang);
    expect(d.photo).toBe("Fixture BB-335 A");
    expect(dichBanGhi({}, undefined, bang).photo).toBeNull();
  });
  it("bảng chưa có cột 'photo' → photo undefined (không xoá giá trị cũ)", () => {
    const d = dichBanGhi({}, undefined, dungBangMa([cot[0]!]));
    expect(d.photo).toBeUndefined();
  });
  it("lựa chọn bộ lọc: tách 'A, B', bỏ trùng, bỏ trống", () => {
    expect(gopGiaTriPhoto(["Fixture BB-335 B", "Fixture BB-335 A, Fixture BB-335 B", null, " "])).toEqual([
      "Fixture BB-335 A",
      "Fixture BB-335 B",
    ]);
  });
  it("nhận ra lỗi 'chưa áp 0081'", () => {
    expect(laThieuCotLarkPhoto({ code: "42703", message: "column galleries.lark_photo does not exist" })).toBe(true);
    expect(laThieuCotLarkPhoto({ code: "08006", message: "connection failure" })).toBe(false);
  });
});

describe.skipIf(!process.env.SUPABASE_DB_URL)("BB-335 Photo: 0081 chưa áp thì không ném (chỉ đọc bb-dev)", () => {
  it("ghiPhotoVaoGalleries trả chuaApMigration hoặc ghi 0 dòng cho mã không tồn tại", async () => {
    const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
    await client.connect();
    try {
      const doc = new Map([
        ["rec_fixture_bb335_khong_ton_tai", { maTrangThai: null, maCanhBao: null, ngayVaoGiaiDoan: null, suaLuc: null, photo: "Fixture BB-335 A" }],
      ]);
      const kq = await ghiPhotoVaoGalleries(client, doc);
      expect(kq.doi).toBe(0);
    } finally {
      await client.end();
    }
  });
});
