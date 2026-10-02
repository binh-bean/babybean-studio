/**
 * Vòng 7 — người soát C (phản biện & bảo mật). Phép thử PHỦ ĐỊNH, chỉ ở worktree dg7c.
 *
 * Dữ liệu: chi nhánh riêng "Fixture DANHGIA7-C-<run>", 2 bộ ảnh (A, B), SĐT 090100000x.
 * Dọn theo id ở afterAll. Không gọi Lark (401 trả trước mọi lệnh gọi Lark; VITEST bật chốt).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "pg";
import { createHash, randomBytes, createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

vi.mock("server-only", () => ({}));

// next/headers giả cho requireStaff thật (A4). Mặc định: không cookie.
let headersGia = new Headers();
vi.mock("next/headers", () => ({
  headers: async () => headersGia,
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

import * as gallerySession from "@/lib/auth/gallery-session";
import * as staffMod from "@/lib/auth/staff";
import { HEADER_NGUOI_DUNG, kyNguoiDung, docNguoiDung } from "@/lib/auth/dau-nguoi-dung";
import { kenhKhach, kenhNhanVien } from "@/lib/supabase/tuc-thi";
import { POST as larkHook } from "@/app/api/lark/hook/route";
import { xuLyBoAnhMatDongLark, TRAN_XOA_MOI_LUOT } from "@/lib/lark/ban-ghi-moi";
import { maHoaMaLink, giaiMaMaLink } from "@/lib/auth/ma-link";
import { GET as moiGet, POST as moiPost } from "@/app/api/g/moi-nguoi-than/route";
import { POST as thuTien } from "@/app/api/admin/galleries/[id]/payments/route";
import { POST as addonsPost } from "@/app/api/g/addons/route";
import { POST as muaThemPost } from "@/app/api/g/mua-them/route";
import { sanPhamBanChoKhach, sanPhamThuocNhomBan, laSanPhamThu } from "@/lib/products/nhom-san-pham";
import { coTrongBangGia } from "@/lib/products/bang-gia-01-10";

const NHAN = "Fixture DANHGIA7-C";
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${url}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

interface Bo {
  id: string;
  customerId: string;
  ownerLinkId: string;
  viewerLinkId: string;
  selectionId: string;
  anh: string[];
}
let pg: Client;
let runId = "";
let branchId = "";
let A: Bo;
let B: Bo;
const ketQua: Record<string, string> = {};

function phien(bo: Bo, vai: "viewer" | "owner") {
  vi.spyOn(gallerySession, "requireGallerySession").mockResolvedValue({
    galleryId: bo.id,
    customerId: null,
    selectionId: bo.selectionId,
    shareLinkId: vai === "viewer" ? bo.viewerLinkId : bo.ownerLinkId,
    role: vai,
    exp: 0,
  } as unknown as Awaited<ReturnType<typeof gallerySession.requireGallerySession>>);
}

async function dungBo(ten: string, status: string): Promise<Bo> {
  const { rows: c } = await pg.query(
    `insert into customers (branch_id, full_name, phone) values ($1,$2,$3) returning id`,
    [branchId, `${NHAN}-${runId} Mẹ Bé Ngọc Ánh ${ten}`, ten === "A" ? "0901000001" : "0901000002"],
  );
  const { rows: g } = await pg.query(
    `insert into galleries (branch_id, customer_id, title, status, drive_folder_id, drive_folder_url,
                            photo_count, included_quota, extra_photo_price, download_enabled)
     values ($1,$2,$3,$4,$5,'https://example.com/dg7c',3,5,50000,false) returning id`,
    [branchId, c[0].id, `${NHAN}-${runId} Bé Ngọc Ánh ${ten}`, status, `fixture-dg7c-${runId}-${ten}`],
  );
  const id = g[0].id as string;
  const anh: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const { rows: p } = await pg.query(
      `insert into photos (gallery_id, drive_file_id, file_name, mime_type, sort_index, status, width, height)
       values ($1,$2,$3,'image/jpeg',$4,'active',$5,$6) returning id`,
      [id, `dg7c-${runId}-${ten}-${i}`, `DG7C${ten}_000${i}.jpg`, i, i % 2 ? 6000 : 4000, i % 2 ? 4000 : 6000],
    );
    anh.push(p[0].id as string);
  }
  const maBaMe = randomBytes(32).toString("base64url");
  const maGiaDinh = randomBytes(32).toString("base64url");
  const { rows: l1 } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, status)
     values ($1,$2,$3,'owner','active') returning id`,
    [id, sha256(maBaMe), maBaMe.slice(0, 6)],
  );
  // Link mời có bản mã hoá (BB-338) — và đã HẾT HẠN nhưng status vẫn 'active'.
  const { rows: l2 } = await pg.query(
    `insert into share_links (gallery_id, token_hash, token_prefix, role, label, status, expires_at)
     values ($1,$2,$3,'viewer',$4,'active', now() - interval '2 days') returning id`,
    [id, sha256(maGiaDinh), maGiaDinh.slice(0, 6), `${NHAN} Bà nội`],
  );
  await pg.query(`insert into share_link_ma (share_link_id, ma_hoa) values ($1,$2)`, [l2[0].id, maHoaMaLink(maGiaDinh)]);
  const { rows: s } = await pg.query(
    `insert into selections (gallery_id, share_link_id, display_name, is_primary)
     values ($1,$2,$3,true) returning id`,
    [id, l1[0].id, `${NHAN}-${runId} ${ten}`],
  );
  return { id, customerId: c[0].id, ownerLinkId: l1[0].id, viewerLinkId: l2[0].id, selectionId: s[0].id, anh };
}

beforeAll(async () => {
  runId = Math.random().toString(36).slice(2, 10);
  pg = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  await pg.connect();
  const { rows } = await pg.query(`insert into branches (code, name) values ($1,$2) returning id`, [
    `FXDG7C-${runId}`,
    `${NHAN}-${runId} Chi nhánh`,
  ]);
  branchId = rows[0].id;
  A = await dungBo("A", "in_review");
  B = await dungBo("B", "submitted");
}, 60_000);

afterAll(async () => {
  vi.restoreAllMocks();
  const q = (sql: string, a: unknown[]) => pg.query(sql, a).catch((e) => console.error("don", e.message));
  for (const bo of [A, B].filter(Boolean)) {
    await q("delete from gallery_payments where gallery_id = $1", [bo.id]);
    await q("delete from yeu_cau_mua_them where gallery_id = $1", [bo.id]);
    await q("delete from selection_addons where selection_id = $1", [bo.selectionId]);
    await q("delete from activity_logs where entity_id = $1", [bo.id]);
    await q("delete from selection_items where gallery_id = $1", [bo.id]);
    await q("delete from selections where gallery_id = $1", [bo.id]);
    await q("delete from share_link_ma where share_link_id in (select id from share_links where gallery_id = $1)", [bo.id]);
    await q("delete from share_links where gallery_id = $1", [bo.id]);
    await q("delete from photos where gallery_id = $1", [bo.id]);
    await q("delete from galleries where id = $1 and branch_id = $2", [bo.id, branchId]);
    await q("delete from customers where id = $1 and branch_id = $2", [bo.customerId, branchId]);
  }
  await q("delete from activity_logs where branch_id = $1", [branchId]);
  await q("delete from branches where id = $1", [branchId]);
  const { rows } = await pg.query(`select count(*)::int n from galleries where title like $1`, [`${NHAN}-${runId}%`]);
  console.log("KET_QUA_DG7C", JSON.stringify({ ...ketQua, conFixture: rows[0].n }));
  await pg.end();
}, 60_000);

// ---------------------------------------------------------------------------
describe("(a) dấu ký middleware → requireStaff", () => {
  const UID = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
  it("dấu ký bằng khoá khác / cookie khác / hết hạn / sửa uid → bị từ chối", async () => {
    const cookie = "sb-x-auth-token=phien-A";
    const dau = (await kyNguoiDung(UID, cookie))!;
    expect(await docNguoiDung(dau, cookie)).toBe(UID);
    expect(await docNguoiDung(dau, "sb-x-auth-token=phien-B")).toBeNull();
    expect(await docNguoiDung(dau, cookie, Date.now() + 31_000)).toBeNull();
    const [, exp, bam, ky] = dau.split(".");
    expect(await docNguoiDung(`${"00000000-0000-4000-8000-000000000000"}.${exp}.${bam}.${ky}`, cookie)).toBeNull();
    const cu = process.env.APP_SECRET!;
    process.env.APP_SECRET = "khoa-ke-tan-cong-dai-hon-32-ky-tu-xxxxxxxxxxxxxx";
    const gia = (await kyNguoiDung(UID, cookie))!;
    process.env.APP_SECRET = cu;
    expect(await docNguoiDung(gia, cookie)).toBeNull();
  });

  it("dấu HỢP LỆ cho uid của một owner thật nhưng KHÔNG có phiên Supabase → requireStaff vẫn chặn (RLS)", async () => {
    const { rows } = await pg.query(
      `select sp.id from staff_profiles sp join roles r on r.id = sp.role_id
        where sp.is_active and 'system:superuser' = any(r.permissions) limit 1`,
    );
    expect(rows.length).toBe(1);
    const cookie = "";
    headersGia = new Headers({ [HEADER_NGUOI_DUNG]: (await kyNguoiDung(rows[0].id, cookie))!, cookie });
    await expect(staffMod.requireStaff()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    headersGia = new Headers();
    ketQua.a_dauKhongChoQuyen = "PASS";
  });
});

// ---------------------------------------------------------------------------
describe("(b) kênh tức thì HMAC", () => {
  it("tên kênh không suy ra được từ id nếu thiếu APP_SECRET, và KHÔNG BAO GIỜ đổi (không xoay vòng)", () => {
    const k = kenhKhach(A.id);
    expect(k).not.toContain(A.id);
    expect(kenhKhach(A.id)).toBe(k); // tất định: ai từng nhận tên kênh thì giữ được mãi
    const doan = `kh:${createHmac("sha256", "doan-bua").update(`bb-tuc-thi:v1:kh:${A.id}`).digest("base64url").slice(0, 32)}`;
    expect(doan).not.toBe(k);
    expect(kenhNhanVien(branchId)).not.toBe(kenhKhach(branchId));
  });

  it("kênh công khai: ai cầm tên kênh + khoá anon thì NGHE và cũng PHÁT GIẢ được", async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const ten = kenhKhach(`dg7c-khong-ton-tai-${runId}`);
    const nghe = createClient(url, anon, { auth: { persistSession: false } });
    const phat = createClient(url, anon, { auth: { persistSession: false } });
    const nhan: unknown[] = [];
    const cho = (ch: ReturnType<typeof nghe.channel>) =>
      new Promise<string>((res) => {
        const t = setTimeout(() => res("TIMEOUT"), 12_000);
        ch.subscribe((s) => {
          if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
            clearTimeout(t);
            res(s);
          }
        });
      });
    const ch1 = nghe.channel(ten).on("broadcast", { event: "cap_nhat" }, (m) => nhan.push(m.payload));
    const s1 = await cho(ch1);
    const ch2 = phat.channel(ten);
    const s2 = await cho(ch2);
    ketQua.b_trangThaiKenh = `${s1}/${s2}`;
    if (s1 === "SUBSCRIBED" && s2 === "SUBSCRIBED") {
      await ch2.send({ type: "broadcast", event: "cap_nhat", payload: { loai: "studio_thanh_toan" } });
      for (let i = 0; i < 30 && nhan.length === 0; i++) await new Promise((r) => setTimeout(r, 200));
    }
    ketQua.b_phatGiaNhanDuoc = String(nhan.length);
    await nghe.removeAllChannels();
    await phat.removeAllChannels();
    // Ghi nhận hành vi (không phải khẳng định an toàn): phát giả được = khách/nhân viên cũ có thể kích tải lại.
    expect(["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "TIMEOUT"]).toContain(s1);
  }, 40_000);
});

// ---------------------------------------------------------------------------
describe("(c) hook Lark", () => {
  it("không header / sai bí mật / chữ thường / CRON_SECRET của Vercel → 401 (trước mọi lệnh gọi Lark)", async () => {
    expect((await larkHook(post("/api/lark/hook", { record_id: "rec1" }))).status).toBe(401);
    expect(
      (await larkHook(post("/api/lark/hook", { record_id: "rec1" }, { authorization: "Bearer sai" }))).status,
    ).toBe(401);
    const s = process.env.SYNC_CRON_SECRET ?? "";
    if (s) {
      expect(
        (await larkHook(post("/api/lark/hook", { record_id: "rec1" }, { authorization: `bearer ${s}` }))).status,
      ).toBe(401);
    }
    const c = process.env.CRON_SECRET;
    if (c && c !== s) {
      expect(
        (await larkHook(post("/api/lark/hook", { record_id: "rec1" }, { authorization: `Bearer ${c}` }))).status,
      ).toBe(401);
    }
    ketQua.c_auth = "PASS";
  });

  function clientGia(soBo: number) {
    const capNhat: string[] = [];
    return {
      capNhat,
      query: async (sql: string, args: unknown[]) => {
        if (/^\s*select g\.id/.test(sql)) {
          return {
            rows: Array.from({ length: soBo }, (_, i) => ({
              id: `g${i}`,
              status: "draft",
              lark_dong_da_xoa_luc: null,
              soLinkApp: 0,
              soAnhChon: 0,
            })),
          };
        }
        capNhat.push(String(args?.[0]));
        return { rows: [], rowCount: 1 };
      },
    };
  }
  it(`trần xoá: ${TRAN_XOA_MOI_LUOT + 1} bộ mất dòng → không đụng bộ nào; ${TRAN_XOA_MOI_LUOT} → lưu trữ đủ`, async () => {
    const c1 = clientGia(TRAN_XOA_MOI_LUOT + 1);
    const r1 = await xuLyBoAnhMatDongLark(c1 as never, ["x"]);
    expect(c1.capNhat.length).toBe(0);
    expect(r1.boQua).toBeTruthy();
    const c2 = clientGia(TRAN_XOA_MOI_LUOT);
    const r2 = await xuLyBoAnhMatDongLark(c2 as never, ["x"]);
    expect(r2.luuTru).toBe(TRAN_XOA_MOI_LUOT);
    // Rò: trần đặt theo LƯỢT, không theo ngày — 20 bộ/lượt × (cron 08:00 + mỗi lượt sync 5 phút) không có trần tổng.
    ketQua.c_tran = "PASS (trần theo lượt, không theo ngày)";
  });
});

// ---------------------------------------------------------------------------
describe("(d) link mời mã hoá", () => {
  it("bản mã bị sửa / sai khoá → null", () => {
    const m = maHoaMaLink("ma-bi-mat-123");
    expect(giaiMaMaLink(m)).toBe("ma-bi-mat-123");
    const p = m.split(":");
    const ctSua = Buffer.from(p[3]!, "base64url");
    ctSua[0] = (ctSua[0] ?? 0) ^ 1;
    expect(giaiMaMaLink([p[0], p[1], p[2], ctSua.toString("base64url")].join(":"))).toBeNull();
    const cu = process.env.APP_SECRET!;
    process.env.APP_SECRET = "khoa-khac-hoan-toan-dai-hon-32-ky-tu-yyyyyyyyyyyyy";
    expect(giaiMaMaLink(m)).toBeNull();
    process.env.APP_SECRET = cu;
  });

  it("viewer không xem/tạo được link mời; ba mẹ A không thấy link của B", async () => {
    phien(A, "viewer");
    expect((await moiGet()).status).toBe(403);
    expect((await moiPost(post("/api/g/moi-nguoi-than", { nhan: "Ông ngoại" }))).status).toBe(403);
    phien(A, "owner");
    const res = await moiGet();
    expect(res.status).toBe(200);
    const items = ((await res.json()) as { data: { items: { id: string; duongDan: string | null; expiresAt: string }[] } }).data.items;
    expect(items.map((i) => i.id)).not.toContain(B.viewerLinkId);
    const cuaA = items.find((i) => i.id === A.viewerLinkId);
    // Link mời ĐÃ HẾT HẠN (expires_at < now) nhưng status 'active' → có còn trả lại địa chỉ đầy đủ?
    ketQua.d_linkHetHanVanTraDiaChi = String(!!cuaA?.duongDan);
  });
});

// ---------------------------------------------------------------------------
describe("(e) bảng mới chỉ service_role", () => {
  it("khoá anon không đọc/ghi được tim_gia_dinh, share_link_ma, lark_ban_ghi_moi, gallery_payments", async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
    });
    const tong: Record<string, string> = {};
    for (const bang of ["tim_gia_dinh", "share_link_ma", "lark_ban_ghi_moi", "gallery_payments", "yeu_cau_mua_them"]) {
      const { data, error } = await anon.from(bang).select("*").limit(1);
      tong[bang] = error ? "tu_choi" : `${(data ?? []).length} dong`;
      expect((data ?? []).length).toBe(0);
    }
    const { error: ghi } = await anon.from("tim_gia_dinh").insert({ gallery_id: A.id, share_link_id: A.viewerLinkId, photo_id: A.anh[0] });
    expect(ghi).toBeTruthy();
    ketQua.e_anon = JSON.stringify(tong);
  });
});

// ---------------------------------------------------------------------------
describe("(f) thu tiền + khoá", () => {
  const nhanVien = (branchIds: string[]) =>
    vi.spyOn(staffMod, "requireStaff").mockResolvedValue({
      staffId: "00000000-0000-4000-8000-00000000dg7c".replace("dg7c", "0d70"),
      role: "cs",
      roleName: "cs",
      permissions: ["galleries:write"],
      branchIds,
    } as never);

  it("IDOR: CSKH chi nhánh khác ghi thu vào bộ B → 403, không có dòng sổ", async () => {
    nhanVien(["11111111-1111-4111-8111-111111111111"]);
    const r = await thuTien(post(`/api/admin/galleries/${B.id}/payments`, { amount: -1000, method: "tien_mat", note: "x", khoaBoAnh: true, chacChan: true }), {
      params: Promise.resolve({ id: B.id }),
    });
    expect(r.status).toBe(403);
    const { rows } = await pg.query(`select count(*)::int n from gallery_payments where gallery_id=$1`, [B.id]);
    expect(rows[0].n).toBe(0);
  });

  it("không phát sinh tiền: ghi thu dương → 400; khoá không tick chắc chắn → 400; chacChan dạng chuỗi 'true' không được tính", async () => {
    nhanVien([branchId]);
    const r1 = await thuTien(post(`/api/admin/galleries/${B.id}/payments`, { amount: 100000, method: "tien_mat" }), {
      params: Promise.resolve({ id: B.id }),
    });
    expect(r1.status).toBe(400);
    const r2 = await thuTien(
      post(`/api/admin/galleries/${B.id}/payments`, { amount: -1000, method: "tien_mat", note: "đính chính", khoaBoAnh: true, chacChan: "true" }),
      { params: Promise.resolve({ id: B.id }) },
    );
    expect(r2.status).toBe(400);
    const { rows } = await pg.query(
      `select (select count(*)::int from gallery_payments where gallery_id=$1) n, (select status::text from galleries where id=$1) s`,
      [B.id],
    );
    expect(rows[0].n).toBe(0);
    expect(rows[0].s).toBe("submitted");
    ketQua.f = "PASS";
  });
});

// ---------------------------------------------------------------------------
describe("(g) danh mục bán theo bảng giá 01/10", () => {
  it("đo trên bb-dev: món ĐANG BÁN cho khách nhưng KHÔNG nằm trong bảng giá (album/khung không xét bảng)", async () => {
    const { rows } = await pg.query(
      `select id, name, kind, material, size, is_active from products where is_active`,
    );
    const lot = rows.filter(
      (p) =>
        sanPhamBanChoKhach({ isActive: p.is_active, kind: p.kind, material: p.material, size: p.size, name: p.name }) &&
        !coTrongBangGia(p.material, p.size),
    );
    const thu = rows.filter(
      (p) => laSanPhamThu(p.name) && sanPhamBanChoKhach({ isActive: p.is_active, kind: p.kind, material: p.material, size: p.size, name: p.name }),
    );
    ketQua.g_banNgoaiBang = JSON.stringify(lot.map((p) => `${p.kind}|${p.material}|${p.size}`).slice(0, 40));
    ketQua.g_banNgoaiBangSo = String(lot.length);
    ketQua.g_spThuMuaDuoc = String(thu.length);
    // Một món in đang kinh doanh mà bảng giá KHÔNG có → phải bị addons + mua-them từ chối.
    const ngoai = rows.find(
      (p) => p.kind === "print" && sanPhamThuocNhomBan({ isActive: true, kind: p.kind, material: p.material }) && !coTrongBangGia(p.material, p.size),
    );
    ketQua.g_mauNgoaiBang = ngoai ? `${ngoai.material}|${ngoai.size}` : "khong_co";
    if (ngoai) {
      phien(A, "owner");
      const r = await addonsPost(post("/api/g/addons", { productId: ngoai.id, quantity: 1, photoId: A.anh[0] }));
      ketQua.g_addons = `${r.status} ${JSON.stringify(await r.json()).slice(0, 120)}`;
      expect(r.status).not.toBe(200);
      expect(r.status).not.toBe(201);
      phien(A, "viewer");
      const r2 = await muaThemPost(
        post("/api/g/mua-them", {
          items: [{ productId: ngoai.id, soLuong: 1, photoId: A.anh[0] }],
          tenNguoiMua: "Bà nội Fixture",
          sdtNguoiMua: "0901000003",
        }),
      );
      ketQua.g_muaThem = `${r2.status} ${JSON.stringify(await r2.json()).slice(0, 120)}`;
      expect(r2.status).not.toBe(200);
      const { rows: yc } = await pg.query(`select count(*)::int n from yeu_cau_mua_them where gallery_id=$1`, [A.id]);
      expect(yc[0].n).toBe(0);
    }
  });
});
