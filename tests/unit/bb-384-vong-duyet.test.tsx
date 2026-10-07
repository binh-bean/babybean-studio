/**
 * BB-384 — vòng khách duyệt LUÔN trong app. Phép thử THUẦN (không DB, không mạng thật):
 *
 *   1. Luật quyết định khối nào hiện ở vùng duyệt (`khoiVungDuyet`) — bộ chờ duyệt mà
 *      app chưa có ảnh chỉnh: lời Bean "đang chuẩn bị", KHÔNG khung cũ.
 *   2. Khung `ReviewPanel` render ra: không còn link Drive, không nút duyệt, không ô
 *      chữ chung — kể cả khi `deliveries.final_drive_url` còn link (ảnh chụp của anh).
 *   3. Thanh đáy theo bước: bước duyệt → "Xem & duyệt N ảnh chỉnh", không phải
 *      "Đủ trong gói · Yêu cầu sửa lại".
 *   4. Máy chủ chặn duyệt mù / gửi duyệt khi 0 ảnh; cảnh báo màn quản trị.
 *   5. Xác nhận "đã nhận gì" sau khi xin sửa; lời mời in thêm đúng lúc (bh-04).
 *   6. Luồng Lark sau khi khách gửi (kể cả đợt mua thêm): "Sửa" / "Sửa lần N" — fetch
 *      giả lập, KHÔNG gọi Lark thật.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

import {
  khoiVungDuyet,
  thanhDayBuocDuyet,
  kiemQuyetTrongGoi,
  lyDoKhongGuiDuoc,
  canhBaoKhachChuaXem,
  CANH_BAO_KHACH_CHUA_XEM,
  hienLoiMoiInThem,
  chonAnhMoiIn,
  chonSanPhamGoiY,
  tomTatVongSua,
  GIAI_DOAN_LARK_GUI_DUYET,
} from "@/lib/anh-chinh-sua/vong-duyet";
import { ghepGhiChu } from "@/lib/anh-chinh-sua/nhan-dien";
import { lanSuaKeTiep } from "@/lib/anh-chinh-sua/theo-dot";
import { ReviewPanel } from "@/components/features/gallery/review-panel";
import { ghiTrangThaiSuaLenLark } from "@/lib/lark/ghi-trang-thai-sua";

describe("BB-384 · vùng duyệt màn khách vẽ khối nào", () => {
  it("bộ chờ duyệt, app CHƯA có ảnh chỉnh (CSKH gửi bằng link Drive) → lời Bean 'đang chuẩn bị', không khung cũ", () => {
    expect(khoiVungDuyet({ status: "awaiting_approval", soAnhChinhTrongApp: 0, giaiDoan: 5, coVongSuaMo: false })).toBe(
      "dang_chuan_bi",
    );
  });
  it("có ảnh chỉnh trong app → khối duyệt từng tấm", () => {
    expect(khoiVungDuyet({ status: "awaiting_approval", soAnhChinhTrongApp: 5, giaiDoan: 5, coVongSuaMo: false })).toBe(
      "anh_trong_app",
    );
    expect(khoiVungDuyet({ status: "approved", soAnhChinhTrongApp: 5, giaiDoan: 7, coVongSuaMo: false })).toBe("anh_trong_app");
  });
  it("Lark 'Đã gửi duyệt' khi app còn đang chỉnh, chưa có ảnh → cũng 'đang chuẩn bị' (đồng bộ trạng thái Lark)", () => {
    expect(
      khoiVungDuyet({ status: "in_retouch", soAnhChinhTrongApp: 0, giaiDoan: GIAI_DOAN_LARK_GUI_DUYET, coVongSuaMo: false }),
    ).toBe("dang_chuan_bi");
  });
  it("đang sửa theo yêu cầu (vòng mở) → thông tin (Bean đã nhận yêu cầu), không 'đang chuẩn bị'", () => {
    expect(khoiVungDuyet({ status: "in_retouch", soAnhChinhTrongApp: 0, giaiDoan: 6, coVongSuaMo: true })).toBe("thong_tin");
    expect(khoiVungDuyet({ status: "in_retouch", soAnhChinhTrongApp: 0, giaiDoan: 5, coVongSuaMo: true })).toBe("thong_tin");
  });
  it("chưa tới bước chỉnh → không khối nào", () => {
    expect(khoiVungDuyet({ status: "in_review", soAnhChinhTrongApp: 0, giaiDoan: null, coVongSuaMo: false })).toBeNull();
  });
});

describe("BB-384 · khung ReviewPanel không còn đường duyệt bằng link Drive", () => {
  const review = {
    soAnhChinhTrongApp: 0,
    finalDriveUrl: "https://drive.google.com/drive/folders/FIXTURE_BB384",
    rounds: [{ round: 1, note: "không ưng tí nào", createdAt: "2026-10-06T03:00:00Z", resolved: true }],
  };

  it("chờ duyệt + link Drive cũ: không link Drive, không nút, không ô chữ — chỉ lời Bean và lịch sử", () => {
    const html = renderToStaticMarkup(<ReviewPanel status="awaiting_approval" review={review} dangChuanBi />);
    expect(html).not.toContain("FIXTURE_BB384");
    expect(html).not.toContain("Mở thư mục ảnh đã chỉnh");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<textarea");
    expect(html).toContain('data-testid="bean-dang-chuan-bi-duyet"');
    expect(html).toContain("Bean đang chuẩn bị ảnh để ba mẹ duyệt");
    expect(html).toContain("Bean đã sửa");
  });

  it("đang sửa theo yêu cầu: xác nhận rõ đã nhận gì (số tấm, từng tấm, ghi chú chung) + ai sửa", () => {
    const note = ghepGhiChu("Bé hơi tối", [
      { photoId: "a", tenAnh: "IMG_0001.jpg", ghiChu: "da sáng hơn", vung: [], anhMau: [] },
      { photoId: "b", tenAnh: "IMG_0002.jpg", ghiChu: "", vung: [{ x: 0.5, y: 0.5, r: 0.1 }], anhMau: ["x"] },
    ]);
    const html = renderToStaticMarkup(
      <ReviewPanel
        status="in_retouch"
        review={{ ...review, rounds: [{ round: 2, note, createdAt: "2026-10-07T03:00:00Z", resolved: false }], soNgaySua: 3 }}
      />,
    );
    expect(html).toContain('data-testid="da-nhan-cac-tam"');
    expect(html).toContain("2 tấm cần sửa");
    expect(html).toContain("IMG_0001.jpg");
    expect(html).toContain("Bé hơi tối");
    // BB-387 — lời xin lỗi của anh + khoảng ngày; KHÔNG nêu tên thợ chỉnh.
    expect(html).toContain("Yêu cầu của ba mẹ đã được ghi nhận và chuyển đến bộ phận hậu kỳ");
    expect(html).toContain("trong khoảng 3 ngày");
    expect(html).not.toContain("<button");
  });
});

describe("BB-384 · thanh đáy theo bước", () => {
  it("bước duyệt có ảnh chỉnh → nút chính dẫn vào duyệt", () => {
    expect(thanhDayBuocDuyet({ status: "awaiting_approval", soAnhChinhTrongApp: 5 })).toEqual({
      dong: "5 ảnh chỉnh chờ ba mẹ duyệt",
      nut: "Xem & duyệt 5 ảnh chỉnh",
    });
  });
  it("bước duyệt chưa có ảnh → lời Bean, KHÔNG nút (không duyệt mù)", () => {
    const t = thanhDayBuocDuyet({ status: "awaiting_approval", soAnhChinhTrongApp: 0 });
    expect(t?.nut).toBeNull();
    expect(t?.dong).toContain("Bean đang chuẩn bị");
  });
  it("ngoài bước duyệt → giữ thanh chọn ảnh cũ", () => {
    for (const s of ["in_review", "submitted", "in_retouch", "approved"]) {
      expect(thanhDayBuocDuyet({ status: s, soAnhChinhTrongApp: 5 })).toBeNull();
    }
  });
});

describe("BB-384 · máy chủ và màn quản trị", () => {
  it("/api/g/review vòng trong gói: 0 ảnh khách thấy → từ chối (bỏ đường duyệt mù theo link Drive)", () => {
    const kq = kiemQuyetTrongGoi({ status: "awaiting_approval", soAnhKhachThay: 0 });
    expect(kq.ok).toBe(false);
    expect(kiemQuyetTrongGoi({ status: "awaiting_approval", soAnhKhachThay: 3 })).toEqual({ ok: true });
    expect(kiemQuyetTrongGoi({ status: "in_retouch", soAnhKhachThay: 3 }).ok).toBe(false);
  });
  it("Gửi khách duyệt (cả route cũ retouch-done) khi 0 ảnh chỉnh → chặn với câu nói rõ phải Đồng bộ ảnh", () => {
    expect(lyDoKhongGuiDuoc(0)).toMatch(/Đồng bộ ảnh/);
    expect(lyDoKhongGuiDuoc(4)).toBeNull();
  });
  it("cảnh báo 'Khách chưa xem được ảnh chỉnh' ở bước duyệt (app hoặc Lark) khi khách không thấy tấm nào", () => {
    expect(canhBaoKhachChuaXem({ status: "awaiting_approval", giaiDoan: null, soAnhKhachThay: 0 })).toBe(
      CANH_BAO_KHACH_CHUA_XEM,
    );
    expect(canhBaoKhachChuaXem({ status: "in_retouch", giaiDoan: 5, soAnhKhachThay: 0 })).toBe(CANH_BAO_KHACH_CHUA_XEM);
    expect(canhBaoKhachChuaXem({ status: "in_retouch", giaiDoan: 3, soAnhKhachThay: 0 })).toBeNull();
    expect(canhBaoKhachChuaXem({ status: "awaiting_approval", giaiDoan: 5, soAnhKhachThay: 4 })).toBeNull();
    expect(canhBaoKhachChuaXem({ status: "awaiting_approval", giaiDoan: 5, soAnhKhachThay: null })).toBeNull();
  });
});

describe("BB-384 · xác nhận đã nhận + mời in thêm (bh-04)", () => {
  it("tách bản ghép ghi chú: số tấm, từng tấm, ghi chú chung; bỏ nhãn đợt mua thêm", () => {
    const note = `[Mua thêm đợt 2]\n${ghepGhiChu("Cảm ơn Bean", [
      { photoId: "a", tenAnh: "A.jpg", ghiChu: "sáng hơn", vung: [], anhMau: [] },
    ])}`;
    expect(tomTatVongSua(note)).toEqual({ soTam: 1, ghiChuChung: "Cảm ơn Bean", tam: [{ ten: "A.jpg", ghiChu: "sáng hơn" }] });
  });
  it("mời in thêm ĐÚNG lúc duyệt cho in và không còn tấm xin sửa — không phải lúc mới gửi ảnh chỉnh", () => {
    expect(hienLoiMoiInThem({ status: "approved", coVongSuaMo: false, laChu: true })).toBe(true);
    expect(hienLoiMoiInThem({ status: "awaiting_approval", coVongSuaMo: false, laChu: true })).toBe(false);
    expect(hienLoiMoiInThem({ status: "approved", coVongSuaMo: true, laChu: true })).toBe(false);
    expect(hienLoiMoiInThem({ status: "approved", coVongSuaMo: false, laChu: false })).toBe(false);
  });
  it("3 tấm mời in: ưu tiên tấm ba mẹ chưa từng xin sửa, giữ thứ tự", () => {
    const anh = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    expect(chonAnhMoiIn(anh, new Set(["a", "c"])).map((x) => x.id)).toEqual(["b", "d", "e"]);
    expect(chonAnhMoiIn(anh.slice(0, 2), new Set(["a"])).map((x) => x.id)).toEqual(["b", "a"]);
  });
  it("sản phẩm gợi ý: chỉ mục in có trong danh mục, có giá > 0 (không bịa giá)", () => {
    const ds = chonSanPhamGoiY([
      { productId: "1", name: "Ảnh in 13x18", unitPrice: 30000, nhom: "anh_in" },
      { productId: "2", name: "Không giá", unitPrice: 0, nhom: "anh_in" },
      { productId: "3", name: "Phí ship", unitPrice: 20000, nhom: null },
      { productId: "4", name: "Khung 20x30", unitPrice: 250000, nhom: "khung" },
      { productId: "5", name: "Album 25x25", unitPrice: 1500000, nhom: "album" },
      { productId: "6", name: "Ảnh in 20x30", unitPrice: 60000, nhom: "anh_in" },
    ]);
    expect(ds.map((x) => x.productId)).toEqual(["1", "4", "5"]);
  });
});

describe("BB-384 · luồng Lark sau khi khách gửi yêu cầu sửa (fetch giả lập)", () => {
  const envCu = { ...process.env };
  afterEach(() => {
    process.env = { ...envCu };
    vi.unstubAllGlobals();
  });

  it("đợt mua thêm xin sửa sau 2 vòng trong gói → lần 3, dòng Hậu Kỳ của BỘ ghi 'Sửa lần 2, 3, 4'", async () => {
    process.env.CHO_PHEP_GOI_MANG_TRONG_PHEP_THU = "1";
    delete process.env.PHEP_THU_TRINH_DUYET;
    process.env.LARK_APP_ID = "fixture-app";
    process.env.LARK_APP_SECRET = "fixture-secret";
    process.env.LARK_BASE_APP_TOKEN = "fixture-base";
    const put: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const tra = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
        if (url.includes("/auth/")) return tra({ code: 0, tenant_access_token: "t" });
        if (url.endsWith("/tables?page_size=100")) return tra({ code: 0, data: { items: [{ table_id: "tbl1", name: "Hậu Kỳ" }] } });
        if (url.includes("/fields")) {
          return tra({
            code: 0,
            data: {
              items: [
                {
                  field_name: "Trạng Thái",
                  type: 3,
                  property: {
                    options: [
                      { id: "optDAI9nFV", name: "Đã gửi file gốc" },
                      { id: "optjhQwMrT", name: "Sửa" },
                      { id: "optW0pvHGd", name: "Sửa lần 2, 3, 4" },
                    ],
                  },
                },
              ],
            },
          });
        }
        if (init?.method === "PUT") {
          put.push(JSON.parse(String(init.body)));
          return tra({ code: 0 });
        }
        return tra({ code: 1 });
      }),
    );
    const lan = lanSuaKeTiep([{ round: 1 }, { round: 2 }]);
    expect(lan).toBe(3);
    const kq = await ghiTrangThaiSuaLenLark({ recordId: "recFixture", lanSua: lan });
    expect(kq).toMatchObject({ ghiDuoc: true, nhan: "Sửa lần 3" });
    expect(put).toEqual([{ fields: { "Trạng Thái": "Sửa lần 2, 3, 4" } }]);
  });
});
