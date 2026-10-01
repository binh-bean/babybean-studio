/**
 * BB-344 — hai luật:
 *
 *  A. Khối "Cần xử lý ngay" ở Bàn làm việc và tab "Khách gửi ảnh chọn" cùng MỘT con số
 *     (đếm theo BỘ ẢNH, gồm đợt 1 chờ xác nhận + đợt mua thêm ≥ 2 + nhờ studio chọn giúp).
 *  B. "Nếu không phát sinh thì khối không nhấn được": còn phải thu = 0 → nút xác nhận
 *     thanh toán khoá + câu "Chưa phát sinh tiền cần thu"; máy chủ cũng từ chối ghi thu.
 *
 * Dữ liệu: chi nhánh riêng "Fixture BB-344-…" (tests/fixtures/bb-344.ts), dọn theo id ở afterAll.
 * Gọi ĐÚNG các route thật (chỉ giả lập phiên nhân sự). Dựng component bằng `renderToStaticMarkup`,
 * không giả lập hook (AGENTS.md §5a).
 *
 * Kiểm ngược (§5a) — kết quả thật dán trong bàn giao BB-344:
 *  · A: đổi `khachGuiAnhChon: khachGuiAnhChon.length` ở can-xu-ly/route.ts về công thức cũ
 *       (số đợt mua thêm + số bộ nhờ chọn giúp) → ca A1 ĐỎ (4 ≠ 3).
 *  · B: bỏ `chuaPhatSinh={…}` ở PaymentForm (hoặc `|| chuaPhatSinh`) → ca B1 ĐỎ;
 *       bỏ khối `if (tienCanThu.tienCanThu <= 0 …)` ở payments/route.ts → ca B3/B4 ĐỎ.
 */
import React from "react";
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { phienGiaLap } from "../fixtures/phien-nhan-su";
import { duLieuBB344, donDepBB344, type DuLieuBB344 } from "../fixtures/bb-344";

vi.mock("server-only", () => ({}));

import * as staffAuth from "@/lib/auth/staff";
import { GET as canXuLy } from "@/app/api/admin/can-xu-ly/route";
import { GET as tabKhachGui } from "@/app/api/admin/reports/dot-chon-cho-xac-nhan/route";
import { GET as chiTietBo } from "@/app/api/admin/galleries/[id]/items/route";
import { POST as ghiThu } from "@/app/api/admin/galleries/[id]/payments/route";
import { TABS_VIEC_CAN_XU_LY } from "@/lib/utils/viec-can-xu-ly-tabs";
import { dongCanXuLy } from "@/lib/utils/can-xu-ly";
import { PaymentForm } from "@/components/features/admin/form-thanh-toan";
import {
  tienCanThuCuaBo,
  CAU_CHUA_PHAT_SINH_TIEN,
} from "@/lib/gallery/tien-phat-sinh";

// Thuộc tính `disabled` thật (không khớp nhầm lớp CSS `disabled:opacity-40`).
const DA_KHOA = /\sdisabled=""/;

let d: DuLieuBB344;

beforeAll(async () => {
  d = await duLieuBB344({ coNhanSu: true });
}, 120_000);

afterAll(async () => {
  if (d) {
    const con = await donDepBB344(d);
    expect(con).toEqual({ conBo: 0, conChiNhanh: 0 });
  }
}, 120_000);

function asOwner() {
  vi.spyOn(staffAuth, "requireStaff").mockResolvedValue(phienGiaLap("owner", [d.branchId], d.ownerId!));
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (v: unknown) => new Request("http://localhost", { method: "POST", body: JSON.stringify(v) });
const soDongSo = async (id: string) =>
  Number((await d.pg.query(`select count(*)::int n from gallery_payments where gallery_id = $1`, [id])).rows[0].n);

describe("BB-344 A: số 'Cần xử lý ngay' = số dòng tab 'Khách gửi ảnh chọn'", () => {
  it("A1. cùng chi nhánh: huy hiệu Bàn làm việc = số dòng của tab = số BỘ ẢNH (không phải số đợt)", async () => {
    asOwner();
    const resBlock = await canXuLy(new Request(`http://localhost/api/admin/can-xu-ly?branchId=${d.branchId}`));
    expect(resBlock.status).toBe(200);
    const block = (await resBlock.json()).data as { khachGuiAnhChon: number };

    const resTab = await tabKhachGui(
      new Request(`http://localhost/api/admin/reports/dot-chon-cho-xac-nhan?branchId=${d.branchId}`),
    );
    expect(resTab.status).toBe(200);
    const tab = (await resTab.json()).data as { boAnh: { galleryId: string }[]; items: unknown[]; viecDot1: unknown[] };

    // Đúng ba bộ: vuotHanMuc (đợt 1), dotA (đợt 1 + 2 đợt thêm), dotB (2 đợt thêm).
    expect(tab.boAnh.map((b) => b.galleryId).sort()).toEqual([d.vuotHanMuc, d.dotA, d.dotB].sort());
    // Công thức cũ (BB-321) cộng theo ĐỢT: 4 đợt mua thêm — phải KHÁC số bộ ảnh, để ca này có tác dụng.
    expect(tab.items.length + tab.viecDot1.length).toBe(4);

    const tabDef = TABS_VIEC_CAN_XU_LY.find((t) => t.value === "khach-mua-them")!;
    const soTrenTab = tabDef.demSo(tab);
    expect(soTrenTab).toBe(3);
    expect(block.khachGuiAnhChon).toBe(soTrenTab);

    // Dòng ở khối "Cần xử lý ngay": cùng số, bấm mở đúng tab.
    const dong = dongCanXuLy({ khachGuiAnhChon: block.khachGuiAnhChon }).find((r) => r.key === "khach-gui-anh-chon");
    expect(dong?.soLuong).toBe(soTrenTab);
    expect(dong?.href).toBe("/admin/viec-can-xu-ly?tab=khach-mua-them");
  });
});

describe("BB-344 B: nếu không phát sinh thì khối thanh toán không nhấn được", () => {
  it("B0. hàm thuần: số cần thu = (số lúc chốt, hoặc số theo ảnh) + đợt mua thêm đã xác nhận − đã ghi có, không âm", () => {
    expect(tienCanThuCuaBo({ tienTheoAnh: 0, tienLucChot: 0, tienDotMuaThem: 0, daGhiCo: 0 })).toBe(0);
    expect(tienCanThuCuaBo({ tienTheoAnh: 0, tienLucChot: 300000, tienDotMuaThem: 0, daGhiCo: 0 })).toBe(300000);
    // chưa chốt: lùi về số theo ảnh (đúng báo cáo vượt hạn mức)
    expect(tienCanThuCuaBo({ tienTheoAnh: 150000, tienLucChot: null, tienDotMuaThem: 0, daGhiCo: 0 })).toBe(150000);
    // đợt mua thêm đã xác nhận cộng vào, đã thu thì trừ ra
    expect(tienCanThuCuaBo({ tienTheoAnh: 0, tienLucChot: 300000, tienDotMuaThem: 100000, daGhiCo: 0 })).toBe(400000);
    expect(tienCanThuCuaBo({ tienTheoAnh: 0, tienLucChot: 300000, tienDotMuaThem: 100000, daGhiCo: 300000 })).toBe(100000);
    // thu đủ / thu dư → 0, không âm
    expect(tienCanThuCuaBo({ tienTheoAnh: 0, tienLucChot: 300000, tienDotMuaThem: 0, daGhiCo: 300000 })).toBe(0);
    expect(tienCanThuCuaBo({ tienTheoAnh: 0, tienLucChot: 300000, tienDotMuaThem: 0, daGhiCo: 400000 })).toBe(0);
  });

  it("B1. còn phải thu = 0 → nút 'Ghi nhận đã thu' và mọi ô bị khoá, có câu 'Chưa phát sinh tiền cần thu'", () => {
    const html = renderToStaticMarkup(
      <PaymentForm conThieu={0} chuaPhatSinh onSubmit={() => {}} />,
    );
    const nut = html.match(/<button[^>]*>/)?.[0] ?? "";
    expect(nut).toMatch(DA_KHOA);
    // Mọi ô nhập cũng khoá.
    const oNhap = html.match(/<(input|select)[^>]*>/g) ?? [];
    expect(oNhap.length).toBeGreaterThanOrEqual(4);
    for (const o of oNhap) expect(o, o).toMatch(DA_KHOA);
    expect(html).toContain(CAU_CHUA_PHAT_SINH_TIEN);
  });

  it("B2. còn phải thu > 0 → nút bấm được (số tiền điền sẵn) và không có câu cảnh báo", () => {
    // Form điền sẵn số tiền = còn thiếu nên hợp lệ ngay lúc dựng (không cần useEffect).
    const html = renderToStaticMarkup(<PaymentForm conThieu={300000} onSubmit={() => {}} />);
    const nut = html.match(/<button[^>]*>/)?.[0] ?? "";
    expect(nut).not.toMatch(DA_KHOA);
    expect(html).not.toContain(CAU_CHUA_PHAT_SINH_TIEN);
  });

  it("B3. màn chi tiết (items): bộ không phát sinh → amountToCollect = 0; bộ vượt hạn mức → 300.000", async () => {
    asOwner();
    const a = await chiTietBo(new Request("http://localhost"), params(d.khongPhatSinh));
    expect(a.status).toBe(200);
    expect((await a.json()).data.amountToCollect).toBe(0);
    const b = await chiTietBo(new Request("http://localhost"), params(d.vuotHanMuc));
    expect(b.status).toBe(200);
    expect((await b.json()).data.amountToCollect).toBe(300000);
  });

  it("B4. máy chủ: bộ không phát sinh thì từ chối ghi thu và giảm giá, sổ không có dòng nào", async () => {
    asOwner();
    for (const body of [
      { amount: 100000, method: "tien_mat" },
      { discountPercent: 10, note: "thử", amount: 0, method: "tien_mat" },
    ]) {
      const res = await ghiThu(post(body), params(d.khongPhatSinh));
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect((await res.json()).error.message).toBe(CAU_CHUA_PHAT_SINH_TIEN);
    }
    expect(await soDongSo(d.khongPhatSinh)).toBe(0);
  });

  it("B5. máy chủ: bộ vượt hạn mức thu được như cũ; thu đủ rồi (còn phải thu 0) thì không thu thêm, nhưng dòng TRỪ đính chính vẫn ghi được", async () => {
    asOwner();
    const thu = await ghiThu(post({ amount: 300000, method: "chuyen_khoan" }), params(d.vuotHanMuc));
    expect(thu.status).toBe(200);
    expect((await thu.json()).data.outstanding).toBe(0);

    const thuThem = await ghiThu(post({ amount: 1000, method: "tien_mat" }), params(d.vuotHanMuc));
    expect(thuThem.status).toBe(400);

    const sau = await chiTietBo(new Request("http://localhost"), params(d.vuotHanMuc));
    expect((await sau.json()).data.amountToCollect).toBe(0);

    const dinhChinh = await ghiThu(
      post({ amount: -300000, method: "chuyen_khoan", note: "Ghi nhầm bộ khác" }),
      params(d.vuotHanMuc),
    );
    expect(dinhChinh.status).toBe(200);
    expect(await soDongSo(d.vuotHanMuc)).toBe(2);
    // Đính chính xong, số cần thu quay lại 300.000.
    const lai = await chiTietBo(new Request("http://localhost"), params(d.vuotHanMuc));
    expect((await lai.json()).data.amountToCollect).toBe(300000);
  });
});
