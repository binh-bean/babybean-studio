/**
 * BB-387 — anh chốt 07/10 cho vòng khách duyệt ảnh chỉnh. Phép thử THUẦN (không DB, không mạng;
 * client Supabase và `requireStaff` là đồ giả ở biên):
 *   1. Lời Bean khi xin sửa: đúng ý câu anh, KHÔNG nêu tên thợ chỉnh.
 *   2. Khoảng ngày: "trong khoảng {n} ngày", n từ cài đặt `gallery.revision_days_estimate`,
 *      thiếu/lạ → 3; Admin sửa được ở Cài đặt.
 *   3. Bìa bộ ảnh khớp `khoiVungDuyet` = "dang_chuan_bi".
 *   4. `coTheGui` của báo cáo ảnh chỉnh nhận cả `anh_chinh:gui_khach`.
 */
import React from "react";
import { describe, it, expect, vi as vt } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vt.mock("server-only", () => ({}));

import { vi } from "@/i18n/vi";
import { ReviewPanel } from "@/components/features/gallery/review-panel";
import { BiaBoAnh } from "@/components/features/gallery/bia-bo-anh";
import { cauBiaKhach } from "@/lib/lark/trang-thai-app-lark";
import { khoiVungDuyet } from "@/lib/anh-chinh-sua/vong-duyet";
import {
  KHOA_SO_NGAY_SUA,
  SO_NGAY_SUA_MAC_DINH,
  cauHanSua,
  chuanHoaSoNgaySua,
  docSoNgaySuaDuKien,
} from "@/lib/anh-chinh-sua/han-sua";
import { CAI_DAT_SUA_DUOC, kieuCaiDat, timDinhNghia } from "@/app/api/admin/settings/schema";
import { ghepGhiChu } from "@/lib/anh-chinh-sua/nhan-dien";

const CHU = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/ /g, " ");

// BB-401 — anh chốt lại 08/10: đúng MỘT câu, nối bằng dấu phẩy.
const CAU_CUA_ANH =
  "Bean thành thật xin lỗi vì chưa làm hài lòng ba mẹ trong lần chỉnh sửa ảnh này, yêu cầu của ba mẹ đã được ghi nhận và chuyển đến bộ phận hậu kỳ ạ.";

describe("BB-387 · 1+2 · lời xin lỗi và khoảng ngày trong khung đã nhận yêu cầu sửa", () => {
  const note = ghepGhiChu("", [{ photoId: "a", tenAnh: "IMG_0001.jpg", ghiChu: "da sáng hơn", vung: [], anhMau: [] }]);
  const vongMo = [{ round: 1, note, createdAt: "2026-10-07T03:00:00Z", resolved: false }];
  const dung = (extra: Record<string, unknown>) =>
    CHU(
      renderToStaticMarkup(
        <ReviewPanel
          status="in_retouch"
          review={{ soAnhChinhTrongApp: 0, finalDriveUrl: null, rounds: vongMo, ...extra }}
        />,
      ),
    );

  it("nói đúng câu anh viết và không nêu tên thợ chỉnh, kể cả khi dữ liệu cũ còn trường nguoiChinh", () => {
    const chu = dung({ soNgaySua: 3, nguoiChinh: "Lan" });
    expect(chu).toContain(CAU_CUA_ANH);
    expect(chu).not.toContain("Lan");
    expect(chu).not.toContain("Bạn ");
    expect(chu).not.toContain("bên chỉnh ảnh");
  });

  it("nêu khoảng ngày theo cài đặt, thiếu thì 3", () => {
    expect(dung({ soNgaySua: 5 })).toContain("Bean sẽ gửi lại ảnh đã sửa trong khoảng 5 ngày ạ.");
    expect(dung({})).toContain("trong khoảng 3 ngày ạ.");
  });
});

describe("BB-387 · 2 · số ngày ước tính", () => {
  it("chuẩn hoá: số nguyên 1..30 giữ, còn lại về 3", () => {
    expect(chuanHoaSoNgaySua(5)).toBe(5);
    expect(chuanHoaSoNgaySua(30)).toBe(30);
    for (const la of [0, -2, 2.5, 31, "5", null, undefined, NaN, {}]) expect(chuanHoaSoNgaySua(la)).toBe(SO_NGAY_SUA_MAC_DINH);
    expect(SO_NGAY_SUA_MAC_DINH).toBe(3);
  });

  it("câu hẹn: trong khoảng n ngày ạ, không hứa cứng", () => {
    expect(cauHanSua(7)).toBe("Bean sẽ gửi lại ảnh đã sửa trong khoảng 7 ngày ạ.");
    expect(cauHanSua(undefined)).toBe("Bean sẽ gửi lại ảnh đã sửa trong khoảng 3 ngày ạ.");
  });

  function khachGia(tra: { data?: unknown; ne?: boolean }) {
    const dau: Record<string, unknown> = {};
    const chain = {
      select: () => chain,
      eq: (c: string, v: unknown) => ((dau[c] = v), chain),
      is: (c: string, v: unknown) => ((dau[`is:${c}`] = v), chain),
      maybeSingle: async () => {
        if (tra.ne) throw new Error("hỏng kết nối giả");
        return { data: tra.data ?? null };
      },
    };
    return { dau, db: { from: (b: string) => ((dau.bang = b), chain) } as never };
  }

  it("đọc đúng khoá chung từ bảng settings; có dòng thì dùng, thiếu/lạ/lỗi thì 3", async () => {
    const co = khachGia({ data: { value: 6 } });
    expect(await docSoNgaySuaDuKien(co.db)).toBe(6);
    expect(co.dau).toMatchObject({ bang: "settings", key: KHOA_SO_NGAY_SUA, "is:branch_id": null });
    expect(KHOA_SO_NGAY_SUA).toBe("gallery.revision_days_estimate");
    expect(await docSoNgaySuaDuKien(khachGia({}).db)).toBe(3);
    expect(await docSoNgaySuaDuKien(khachGia({ data: { value: "abc" } }).db)).toBe(3);
    expect(await docSoNgaySuaDuKien(khachGia({ ne: true }).db)).toBe(3);
  });

  it("Admin sửa được ở Cài đặt: có trong danh sách, kiểu số, 1..30, có nhãn tiếng Việt", () => {
    const d = timDinhNghia(KHOA_SO_NGAY_SUA)!;
    expect(d).toBeDefined();
    expect(CAI_DAT_SUA_DUOC.some((c) => c.key === KHOA_SO_NGAY_SUA)).toBe(true);
    expect(kieuCaiDat(d)).toBe("so");
    expect(d.schema.safeParse(3).success).toBe(true);
    expect(d.schema.safeParse(0).success).toBe(false);
    expect(d.schema.safeParse(31).success).toBe(false);
    expect(d.schema.safeParse(2.5).success).toBe(false);
    expect(vi.admin.caiDat.nhan[KHOA_SO_NGAY_SUA as keyof typeof vi.admin.caiDat.nhan]).toBeTruthy();
    expect(vi.admin.caiDat.moTa[KHOA_SO_NGAY_SUA as keyof typeof vi.admin.caiDat.moTa]).toBeTruthy();
  });
});

describe("BB-387 · 3 · bìa bộ ảnh khớp khoiVungDuyet", () => {
  const khoi = (soAnhChinhTrongApp: number, status = "awaiting_approval", giaiDoan: number | null = null) =>
    khoiVungDuyet({ status, soAnhChinhTrongApp, giaiDoan, coVongSuaMo: false });

  it("cauBiaKhach: chưa có ảnh chỉnh trong app → lời Bean đang chuẩn bị, không đã chỉnh xong", () => {
    const cau = cauBiaKhach("awaiting_approval", null, "Bống", { khoa: true, khoiDuyet: khoi(0) });
    expect(cau).toBe("Bean đang chuẩn bị ảnh của Bống để ba mẹ duyệt ạ.");
    expect(cau).not.toContain("đã chỉnh xong");
  });
  it("cauBiaKhach: đường Lark Đã gửi duyệt mà app chưa có ảnh → cũng đang chuẩn bị", () => {
    const cau = cauBiaKhach("in_retouch", 5, "Bống", { khoa: true, khoiDuyet: khoi(0, "in_retouch", 5) });
    expect(cau).toContain("đang chuẩn bị");
  });
  it("cauBiaKhach: đã có ảnh chỉnh trong app → giữ đã chỉnh xong, mời ba mẹ duyệt", () => {
    const cau = cauBiaKhach("awaiting_approval", null, "Bống", { khoa: true, khoiDuyet: khoi(4) });
    expect(cau).toBe("Ảnh của Bống đã chỉnh xong, mời ba mẹ duyệt ạ.");
  });
  it("khoiDuyet chỉ đổi câu của bước chờ duyệt, không đụng trạng thái khác", () => {
    expect(cauBiaKhach("submitted", null, "Bống", { khoa: true, khoiDuyet: "dang_chuan_bi" })).toBe(
      cauBiaKhach("submitted", null, "Bống", { khoa: true }),
    );
  });

  const bia = (khoiDuyet: ReturnType<typeof khoiVungDuyet>) =>
    CHU(
      renderToStaticMarkup(
        React.createElement(BiaBoAnh, {
          anhBia: null,
          coverHeadline: null,
          tenBe: "Bống",
          ngayChup: null,
          chiNhanh: "Chi nhánh Fixture",
          loiChao: null,
          soAnh: 40,
          hanMuc: 20,
          daChon: 20,
          hanChot: null,
          khoa: true,
          trangThai: "awaiting_approval",
          giaiDoanTienDo: null,
          khoiDuyet,
          onBatDau: () => {},
        } as React.ComponentProps<typeof BiaBoAnh>),
      ),
    );
  it("bìa dựng thật: chưa có ảnh chỉnh → đang chuẩn bị; có rồi → đã chỉnh xong", () => {
    const chua = bia(khoi(0));
    expect(chua).toContain("Bean đang chuẩn bị ảnh của Bống để ba mẹ duyệt ạ.");
    expect(chua).not.toContain("đã chỉnh xong");
    const co = bia(khoi(4));
    expect(co).toContain("Ảnh của Bống đã chỉnh xong, mời ba mẹ duyệt ạ.");
    expect(co).not.toContain("đang chuẩn bị");
  });
});

describe("BB-387 · 4 · báo cáo ảnh chỉnh: coTheGui theo quyền", () => {
  async function goi(permissions: string[]) {
    vt.resetModules();
    vt.doMock("@/lib/auth/staff", () => ({
      AuthError: class AuthError extends Error {
        code = "FORBIDDEN";
      },
      requireStaff: async () => ({ role: "cskh", branchIds: ["b1"], permissions }),
    }));
    vt.doMock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
    vt.doMock("@/lib/anh-chinh-sua/viec-can-lam", () => ({ layViecAnhChinh: async () => [] }));
    const { GET } = await import("@/app/api/admin/reports/anh-chinh-sua/route");
    const res = await GET(new Request("http://localhost/api/admin/reports/anh-chinh-sua"));
    return (await res.json()).data.coTheGui as boolean;
  }

  it("anh_chinh:gui_khach (thợ chỉnh, không có galleries:write) → gửi được", async () => {
    expect(await goi(["anh_chinh:gui_khach"])).toBe(true);
  });
  it("galleries:write vẫn gửi được như trước", async () => {
    expect(await goi(["galleries:write"])).toBe(true);
  });
  it("không có quyền nào trong hai quyền → không gửi", async () => {
    expect(await goi(["galleries:read"])).toBe(false);
  });
});
