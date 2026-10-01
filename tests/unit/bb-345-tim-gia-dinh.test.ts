/**
 * BB-345 — tim gia đình (link mời, vai viewer) lưu trên máy chủ + "Đặt chỉnh sửa".
 *
 * Hai phần:
 *   1. Hàm thuần (không cần DB): gộp tim cũ lần đầu, tạm tính, câu Bean, gom
 *      hàng đợi "Khách gửi ảnh chọn" có thêm nguồn "đặt chỉnh sửa".
 *   2. Gọi THẲNG route handler trên bb-dev với dữ liệu "Fixture BB-345-…" (chi
 *      nhánh riêng, dọn theo id ở afterAll). Chỉ giả lập `requireGallerySession`
 *      để cắm phiên — cùng khuôn tests/security/bb-276-*.
 *      · Trước khi áp 0083: canh "không 500", trả `chuaApMigration`.
 *      · Sau khi áp 0083: canh lưu/bỏ tim, ba mẹ thấy tim gia đình, tạo yêu
 *        cầu chỉnh sửa đúng số tấm + tạm tính, bấm lại không ghi trùng.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("server-only", () => ({}));

import * as gallerySession from "@/lib/auth/gallery-session";
import { GET as docTim, POST as guiTim } from "@/app/api/g/tim-gia-dinh/route";
import { POST as datChinhSua } from "@/app/api/g/tim-gia-dinh/dat-chinh-sua/route";
import { gopTimLanDau, tinhTamTinh, cauDaNhanChinhSua, ghiChuDatChinhSua } from "@/lib/gallery/tim-gia-dinh";
import { gomTheoBoAnh, layKhachGuiAnhChon } from "@/lib/gallery/khach-gui-anh-chon";
import { layDatChinhSuaChoXuLy } from "@/lib/gallery/tim-gia-dinh-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { taoBb345, donBb345, coBangTimGiaDinh, type DuLieuBb345, type BoBb345 } from "../fixtures/bb-345";

describe("BB-345 (1): hàm thuần", () => {
  it("lần đầu: gộp tim cũ trong trình duyệt với máy chủ, chỉ gửi tấm máy chủ chưa có", () => {
    const kq = gopTimLanDau({ local: ["a", "b", "b"], server: ["b", "c"], daDua: false });
    expect(new Set(kq.hienThi)).toEqual(new Set(["a", "b", "c"]));
    expect(kq.canDua).toEqual(["a"]);
  });

  it("đã đưa lên rồi: máy chủ là nguồn thật — tim bỏ ở máy khác không 'hồi sinh' từ bộ nhớ đệm", () => {
    const kq = gopTimLanDau({ local: ["a", "b"], server: ["b"], daDua: true });
    expect(kq.hienThi).toEqual(["b"]);
    expect(kq.canDua).toEqual([]);
  });

  it("tạm tính = số tấm × giá ảnh thêm; giá thiếu/âm → 0 (CSKH báo giá)", () => {
    expect(tinhTamTinh(3, 50000)).toEqual({ donGia: 50000, tamTinh: 150000 });
    expect(tinhTamTinh(3, "50000")).toEqual({ donGia: 50000, tamTinh: 150000 });
    expect(tinhTamTinh(3, null)).toEqual({ donGia: 0, tamTinh: 0 });
    expect(tinhTamTinh(3, -1)).toEqual({ donGia: 0, tamTinh: 0 });
  });

  it("câu Bean đúng giọng, kết thúc bằng 'ạ'", () => {
    expect(cauDaNhanChinhSua(3)).toBe("Bean đã nhận yêu cầu chỉnh sửa 3 tấm của gia đình ạ!");
    expect(ghiChuDatChinhSua(3, "  ")).toBe("Đặt chỉnh sửa 3 tấm gia đình thả tim");
    expect(ghiChuDatChinhSua(3, "làm sáng da")).toBe("Đặt chỉnh sửa 3 tấm gia đình thả tim — làm sáng da");
  });

  it("hàng đợi 'Khách gửi ảnh chọn': bộ ảnh CHỈ có yêu cầu chỉnh sửa vẫn thành một dòng", () => {
    const dong = gomTheoBoAnh([], [], [], [
      {
        id: "y1",
        galleryId: "g1",
        galleryTitle: "Bộ 1",
        branchName: "CN",
        customerName: "Khách",
        soAnh: 3,
        tamTinh: 150000,
        trangThai: "moi",
        nguoiGui: "Bà nội",
        submittedAt: "2026-10-01T01:00:00Z",
      },
    ]);
    expect(dong).toHaveLength(1);
    expect(dong[0]!.galleryId).toBe("g1");
    expect(dong[0]!.datChinhSua).toEqual([
      expect.objectContaining({ id: "y1", soAnh: 3, tamTinh: 150000, trangThai: "moi" }),
    ]);
    expect(dong[0]!.guiLuc).toBe("2026-10-01T01:00:00Z");
  });
});

describe("BB-345 (2): route tim + đặt chỉnh sửa trên cơ sở dữ liệu", () => {
  let d: DuLieuBb345;
  let coBang = false;

  function phien(bo: BoBb345, vai: "viewer" | "owner") {
    vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
      galleryId: bo.id,
      customerId: null,
      selectionId: bo.selectionId,
      shareLinkId: vai === "viewer" ? bo.viewerLinkId : bo.ownerLinkId,
      role: vai,
      exp: 0,
    } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
  }
  const post = (url: string, body: unknown) =>
    new Request(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  const doc = async (res: Response) => ({ status: res.status, json: await res.json().catch(() => null) });
  const NGUOI = { tenNguoiMua: "Fixture BB-345 Bà nội", sdtNguoiMua: "0901000001" };

  beforeAll(async () => {
    d = await taoBb345();
    coBang = await coBangTimGiaDinh(d.pg);
    if (!coBang) console.warn("[BB-345] Chưa áp 0083 — phần cần bảng tim tự bỏ qua, chỉ canh 'không 500'.");
  }, 60_000);

  afterAll(async () => {
    vi.restoreAllMocks();
    if (d) await donBb345(d);
  }, 60_000);

  it("ba mẹ POST tim gia đình → 403 (tim của ba mẹ là danh sách chọn ảnh)", async () => {
    phien(d.A, "owner");
    const r = await doc(await guiTim(post("/api/g/tim-gia-dinh", { them: [d.A.anh[0]!.id] })));
    expect(r.status).toBe(403);
  });

  it("viewer gửi thân hỏng → 400, không 500", async () => {
    phien(d.A, "viewer");
    expect((await guiTim(post("/api/g/tim-gia-dinh", "{không phải json"))).status).toBe(400);
    expect((await guiTim(post("/api/g/tim-gia-dinh", { them: ["khong-phai-uuid"] }))).status).toBe(400);
    expect((await guiTim(post("/api/g/tim-gia-dinh", {}))).status).toBe(400);
  });

  it("chưa áp 0083: GET/POST trả chuaApMigration, đặt chỉnh sửa 409 — không 500", async (ctx) => {
    if (coBang) ctx.skip();
    phien(d.A, "viewer");
    const g = await doc(await docTim());
    expect(g.status).toBe(200);
    expect(g.json.data.chuaApMigration).toBe(true);
    const p = await doc(await guiTim(post("/api/g/tim-gia-dinh", { them: [d.A.anh[0]!.id] })));
    expect(p.status).toBe(200);
    expect(p.json.data.chuaApMigration).toBe(true);
    const c = await doc(await datChinhSua(post("/api/g/tim-gia-dinh/dat-chinh-sua", NGUOI)));
    expect(c.status).toBe(409);
    expect(c.json.error.details.chuaApMigration).toBe(true);
    phien(d.A, "owner");
    const gb = await doc(await docTim());
    expect(gb.status).toBe(200);
    expect(gb.json.data.chuaApMigration).toBe(true);
    // Hàng đợi CSKH: thiếu cột `loai` thì nguồn "đặt chỉnh sửa" rỗng, không ném lỗi làm hỏng cả tab.
    await expect(layDatChinhSuaChoXuLy(createAdminClient(), [d.branchId])).resolves.toEqual([]);
  });

  it("đặt chỉnh sửa: ba mẹ → 403; thiếu/sai SĐT → 400", async () => {
    phien(d.A, "owner");
    expect((await datChinhSua(post("/api/g/tim-gia-dinh/dat-chinh-sua", NGUOI))).status).toBe(403);
    phien(d.A, "viewer");
    expect(
      (await datChinhSua(post("/api/g/tim-gia-dinh/dat-chinh-sua", { ...NGUOI, sdtNguoiMua: "123" }))).status,
    ).toBe(400);
    expect(
      (await datChinhSua(post("/api/g/tim-gia-dinh/dat-chinh-sua", { sdtNguoiMua: "0901000001" }))).status,
    ).toBe(400);
  });

  it("sau 0083: thả 3 tim, thả lại không nhân đôi, bỏ 1 → còn 2; ba mẹ thấy đúng 2 tấm", async (ctx) => {
    if (!coBang) ctx.skip();
    phien(d.A, "viewer");
    const ba = d.A.anh.slice(0, 3).map((a) => a.id);
    let r = await doc(await guiTim(post("/api/g/tim-gia-dinh", { them: ba })));
    expect(r.status).toBe(200);
    expect(new Set(r.json.data.cuaToi)).toEqual(new Set(ba));
    r = await doc(await guiTim(post("/api/g/tim-gia-dinh", { them: [ba[0]!] })));
    expect(r.json.data.cuaToi).toHaveLength(3);
    r = await doc(await guiTim(post("/api/g/tim-gia-dinh", { bo: [ba[2]!] })));
    expect(new Set(r.json.data.cuaToi)).toEqual(new Set(ba.slice(0, 2)));

    const g = await doc(await docTim());
    expect(new Set(g.json.data.cuaToi)).toEqual(new Set(ba.slice(0, 2)));

    phien(d.A, "owner");
    const bm = await doc(await docTim());
    expect(bm.json.data.vai).toBe("ba_me");
    expect(new Set(bm.json.data.giaDinh.map((x: { photoId: string }) => x.photoId))).toEqual(new Set(ba.slice(0, 2)));
    // Không đụng danh sách trong gói của ba mẹ.
    const { rows } = await d.pg.query(`select count(*)::int n from selection_items where gallery_id = $1`, [d.A.id]);
    expect(rows[0].n).toBe(0);
  });

  it("sau 0083: đặt chỉnh sửa 3 tấm → một yêu cầu 'chinh_sua', tạm tính 3 × giá ảnh thêm; bấm lại không ghi trùng", async (ctx) => {
    if (!coBang) ctx.skip();
    phien(d.A, "viewer");
    const ba = d.A.anh.slice(0, 3).map((a) => a.id);
    await guiTim(post("/api/g/tim-gia-dinh", { them: ba }));

    const r = await doc(await datChinhSua(post("/api/g/tim-gia-dinh/dat-chinh-sua", NGUOI)));
    expect(r.status).toBe(200);
    expect(r.json.data.soAnh).toBe(3);
    expect(r.json.data.tamTinh).toBe(3 * d.giaMoiAnh);
    expect(r.json.data.cau).toBe("Bean đã nhận yêu cầu chỉnh sửa 3 tấm của gia đình ạ!");

    const { rows } = await d.pg.query(
      `select loai, product_id, so_luong, anh_ids, don_gia, tam_tinh, trang_thai, share_link_id, ten_nguoi_mua
         from yeu_cau_mua_them where gallery_id = $1`,
      [d.A.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].loai).toBe("chinh_sua");
    expect(rows[0].product_id).toBeNull();
    expect(rows[0].so_luong).toBe(3);
    expect(new Set(rows[0].anh_ids)).toEqual(new Set(ba));
    expect(Number(rows[0].tam_tinh)).toBe(150000);
    expect(rows[0].trang_thai).toBe("moi");
    expect(rows[0].share_link_id).toBe(d.A.viewerLinkId);

    const lai = await doc(await datChinhSua(post("/api/g/tim-gia-dinh/dat-chinh-sua", NGUOI)));
    expect(lai.json.data.daCo).toBe(true);
    const { rows: dem } = await d.pg.query(`select count(*)::int n from yeu_cau_mua_them where gallery_id = $1`, [d.A.id]);
    expect(dem[0].n).toBe(1);

    // CSKH thấy ở hàng đợi "Khách gửi ảnh chọn" (chi nhánh của bộ ảnh).
    // "Cần xử lý ngay" (GET /api/admin/can-xu-ly → khachGuiAnhChon, BB-344) đếm bằng
    // `layKhachGuiAnhChon` — bộ ảnh CHỈ có yêu cầu chỉnh sửa phải là một dòng ở đó.
    const hangDoi = await layKhachGuiAnhChon(createAdminClient(), [d.branchId]);
    const dongA = hangDoi.find((x) => x.galleryId === d.A.id);
    expect(dongA?.datChinhSua).toHaveLength(1);
    expect(dongA?.datChinhSua[0]?.soAnh).toBe(3);

    const ds = await layDatChinhSuaChoXuLy(createAdminClient(), [d.branchId]);
    expect(ds.map((x) => x.galleryId)).toContain(d.A.id);
    expect(ds.find((x) => x.galleryId === d.A.id)?.soAnh).toBe(3);
  });
});
