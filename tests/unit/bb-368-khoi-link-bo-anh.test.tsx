/**
 * BB-368 — khối Link app trên màn chi tiết bộ ảnh (bộ có khách).
 *
 * Dựng `KhoiLinkBoAnhGiaDinhView` bằng `renderToStaticMarkup` (không giả lập hook —
 * AGENTS.md §5a); hàm gọi API giả lập `fetch` ở biên. Dữ liệu giả hoàn toàn.
 *
 * Canh: khách chưa có link → nút "Tạo link gia đình" (không có nút tạo link theo bộ);
 * khách đã có → link màn con /k/<mã>/<n>, tin nhắn giọng Bean kết "ạ", dòng sang
 * trang khách; bộ chưa có ảnh → cảnh báo; "N link cũ vẫn mở được".
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  KhoiLinkBoAnhGiaDinhView,
  type KhoiLinkBoAnhGiaDinhViewProps,
} from "@/components/features/admin/khoi-link-bo-anh-gia-dinh";
import {
  diaChiManConHienThi,
  docLinkGiaDinhCuaBo,
  tinNhanMauManCon,
  type LinkGiaDinhCuaBo,
} from "@/lib/utils/link-gia-dinh-nhan-vien";

const KHACH = "22222222-2222-4222-8222-222222222222";
const MA = "MaGiaCuaPhepThuBb368KhongThat0123456789abcde";
const MAN_CON = `https://fixture-bb368.test/k/${MA}/2`;

function du(phan: Partial<LinkGiaDinhCuaBo> = {}): LinkGiaDinhCuaBo & { customerId: string } {
  return {
    soThuTu: 2,
    coAnh: true,
    hienVoiGiaDinh: true,
    linkGiaDinh: {
      shareLinkId: "11111111-1111-4111-8111-111111111111",
      tokenPrefix: MA.slice(0, 6),
      duongDan: `/k/${MA}`,
      duongDanManCon: `/k/${MA}/2`,
      diaChiManCon: MAN_CON,
      soLanMo: 0,
    },
    soLinkCuConSong: 0,
    duocDoi: true,
    ...phan,
    customerId: KHACH,
  };
}

function dung(p: Partial<KhoiLinkBoAnhGiaDinhViewProps> = {}) {
  const d = p.du ?? du();
  const props: KhoiLinkBoAnhGiaDinhViewProps = {
    du: d,
    diaChi: diaChiManConHienThi(d.linkGiaDinh, "https://fixture-bb368.test"),
    vuaTao: false,
    dangTao: false,
    thongBao: null,
    daChep: null,
    chatUrl: null,
    onTao: () => {},
    onChepLink: () => {},
    onChepTinNhan: () => {},
    ...p,
  };
  return renderToStaticMarkup(<KhoiLinkBoAnhGiaDinhView {...props} />);
}

const ma = (html: string, testId: string) => html.includes(`data-testid="${testId}"`);

describe("BB-368: khối Link app ở màn bộ ảnh", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("khách CHƯA có link gia đình: chỉ có nút Tạo link gia đình, không có ô link, không có nút tạo link theo bộ", () => {
    const html = dung({ du: du({ linkGiaDinh: null }), diaChi: null });
    expect(ma(html, "nut-tao-link-gia-dinh-bo")).toBe(true);
    expect(html).toContain("Tạo link gia đình");
    expect(ma(html, "o-link-man-con")).toBe(false);
    expect(ma(html, "nut-tao-link-app")).toBe(false);
  });

  it("khách ĐÃ có link: ô link là /k/<mã>/<n> của bộ này, có Chép link / Chép tin nhắn / dòng sang trang khách", () => {
    const html = dung();
    expect(html).toContain(`value="${MAN_CON}"`);
    expect(ma(html, "nut-chep-link-man-con")).toBe(true);
    expect(ma(html, "nut-chep-tin-nhan-man-con")).toBe(true);
    expect(html).toContain(`href="/admin/customers/${KHACH}"`);
    expect(html).toContain("Buổi thứ 2 trong link gia đình");
    expect(ma(html, "nut-tao-link-gia-dinh-bo")).toBe(false);
    expect(ma(html, "canh-bao-bo-chua-co-anh")).toBe(false);
  });

  it("bộ chưa có ảnh: link màn con vẫn hiện, kèm cảnh báo bấm Đồng bộ ảnh trước", () => {
    const html = dung({ du: du({ coAnh: false, hienVoiGiaDinh: false }) });
    expect(html).toContain(`value="${MAN_CON}"`);
    expect(ma(html, "canh-bao-bo-chua-co-anh")).toBe(true);
    expect(html).toContain("Bộ chưa có ảnh — bấm Đồng bộ ảnh trước, khách chưa thấy bộ này.");
  });

  it("link cũ theo bộ còn mở được: một dòng 'N link cũ…' kèm phần xem link cũ (slot giữ chức năng cũ)", () => {
    const html = dung({ du: du({ soLinkCuConSong: 1 }), slotLinkCu: <span data-testid="slot-link-cu">cũ</span> });
    expect(html).toContain("1 link cũ vẫn mở được (không cần gửi lại)"); // BB-372: đổi chữ, thu gọn
    expect(ma(html, "slot-link-cu")).toBe(true);
    expect(ma(dung(), "link-cu-bo-con-song")).toBe(false);
  });

  it("tin nhắn mẫu: giọng Bean, có link màn con, câu kết 'ạ'", () => {
    for (const tin of [tinNhanMauManCon(MAN_CON), tinNhanMauManCon(MAN_CON, { linkMoi: true })]) {
      expect(tin.startsWith("Bean chào ba mẹ ạ.")).toBe(true);
      expect(tin).toContain(MAN_CON);
      expect(tin.trim()).toMatch(/ạ\.$/);
    }
  });

  it("docLinkGiaDinhCuaBo gọi đúng đường của bộ và gói lỗi thành câu tiếng Việt", async () => {
    const goi: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        goi.push(url);
        return new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Không có quyền xem link gia đình" } }), {
          status: 403,
        });
      }),
    );
    const r = await docLinkGiaDinhCuaBo("33333333-3333-4333-8333-333333333333", { matKetNoi: "mất", chung: "lỗi" });
    expect(goi).toEqual(["/api/admin/galleries/33333333-3333-4333-8333-333333333333/link-gia-dinh"]);
    expect(r).toEqual({ ok: false, ma: "FORBIDDEN", loi: "Không có quyền xem link gia đình" });
  });
});
