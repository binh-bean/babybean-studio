/**
 * BB-334C — khối "Link app của gia đình" ở trang khách hàng (nhân viên).
 *
 * Dựng bằng `renderToStaticMarkup` (không giả lập hook — AGENTS.md §5a) và giả
 * lập `fetch` ở biên (không giả lập ruột component). Dữ liệu giả hoàn toàn.
 *
 * Cái gì được canh:
 *   - các trạng thái: đang tải · chưa có link · có link · vừa thu hồi · không đọc lại được địa chỉ;
 *   - ẩn nút Đổi / Thu hồi theo vai (`duocDoi`);
 *   - hộp xác nhận hiện đúng chữ hậu quả cho đổi / thu hồi / ghi Lark;
 *   - hàm gọi API gửi ĐÚNG thân (`doiLink`+`xacNhan`, `xacNhan`) và gói lỗi thành câu tiếng Việt;
 *   - ghép với e2e `tests/e2e/bb-334c-link-gia-dinh.spec.ts` — nơi canh việc nút ngoài
 *     hộp KHÔNG gọi được API (cần trình duyệt thật).
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KhoiLinkGiaDinhView, type KhoiLinkGiaDinhViewProps } from "@/components/features/admin/khoi-link-gia-dinh";
import {
  diaChiHienThi,
  dien,
  docLinkGiaDinh,
  doiLinkGiaDinh,
  ghiLarkGiaDinh,
  taoLinkGiaDinh,
  thuHoiLinkGiaDinh,
  tinNhanMauGiaDinh,
  type TrangThaiLinkGiaDinh,
} from "@/lib/utils/link-gia-dinh-nhan-vien";

vi.mock("@/lib/utils/khoa-cuon-trang", () => ({ khoaCuonTrang: () => () => {} }));

const DIA_CHI = "https://fixture-bb334c.test/k/MaGiaCuaPhepThuBb334cKhongThat0123456789ab";

function du(phan: Partial<TrangThaiLinkGiaDinh> = {}): TrangThaiLinkGiaDinh {
  return {
    linkGiaDinh: {
      shareLinkId: "11111111-1111-4111-8111-111111111111",
      duongDan: "/k/MaGiaCuaPhepThuBb334cKhongThat0123456789ab",
      diaChi: DIA_CHI,
      tokenPrefix: "MaGiaC",
      taoLuc: "2026-09-12T03:00:00Z",
      soLanMo: 14,
      moLanCuoi: "2026-10-05T01:30:00Z",
    },
    linkCuConSong: [
      { shareLinkId: "a", galleryId: "g1", tieuDeBo: "Fixture Bộ Thôi nôi", vai: "owner", tokenPrefix: "x", taoLuc: "2026-09-01T00:00:00Z", soLanMo: 3 },
      { shareLinkId: "b", galleryId: "g2", tieuDeBo: "Fixture Bộ Đầy tháng", vai: "owner", tokenPrefix: "y", taoLuc: "2026-09-02T00:00:00Z", soLanMo: 0 },
    ],
    loiMoiGiaDinh: [],
    soBoAnh: 3,
    duocDoi: true,
    ...phan,
  };
}

/** Thẻ <button …> mang data-testid đã cho (thứ tự thuộc tính không quan trọng). */
function nut(html: string, testid: string): string {
  const m = html.match(new RegExp(`<button(?=[^>]*data-testid="${testid}")[^>]*>`));
  if (!m) throw new Error(`Không thấy nút ${testid}`);
  return m[0];
}

function dung(phan: Partial<KhoiLinkGiaDinhViewProps> = {}): string {
  const props: KhoiLinkGiaDinhViewProps = {
    dangTai: false,
    loiTai: false,
    du: du(),
    diaChi: DIA_CHI,
    hop: null,
    dangLam: null,
    thongBao: null,
    daChep: null,
    coTheChiaSe: false,
    onTao: () => {},
    onMoHop: () => {},
    onDongHop: () => {},
    onXacNhan: () => {},
    onChepLink: () => {},
    onChepTinNhan: () => {},
    onChiaSe: () => {},
    ...phan,
  };
  return renderToStaticMarkup(<KhoiLinkGiaDinhView {...props} />);
}

describe("BB-334C — các trạng thái của khối", () => {
  it("đang tải: chỉ có dòng 'Đang tải', chưa có nút nào", () => {
    const html = dung({ dangTai: true, du: null });
    expect(html).toContain("Đang tải link gia đình");
    expect(html).not.toContain("nut-tao-link-gia-dinh");
    expect(html).not.toContain("o-link-gia-dinh");
  });

  it("chưa có link: hiện nút tạo, không có ô link, không có nút đổi/thu hồi/ghi Lark", () => {
    const html = dung({ du: du({ linkGiaDinh: null }), diaChi: null });
    expect(html).toContain("Khách chưa có link gia đình.");
    expect(html).toContain('data-testid="nut-tao-link-gia-dinh"');
    expect(html).not.toContain('data-testid="o-link-gia-dinh"');
    expect(html).not.toContain("nut-doi-link-gia-dinh");
    expect(html).not.toContain("nut-thu-hoi-link-gia-dinh");
    expect(html).not.toContain("nut-ghi-link-lark");
  });

  it("chưa có link mà khách chưa có bộ ảnh nào: nút tạo bị khoá (máy chủ cũng từ chối)", () => {
    const html = dung({ du: du({ linkGiaDinh: null, soBoAnh: 0 }), diaChi: null });
    expect(nut(html, "nut-tao-link-gia-dinh")).toMatch(/ disabled(=| |>)/);
  });

  it("có link: hiện đúng địa chỉ, nút Chép, tin nhắn mẫu chứa địa chỉ, Ghi link vào Lark", () => {
    const html = dung();
    expect(html).toContain(`value="${DIA_CHI}"`);
    expect(html).toContain('data-testid="nut-chep-link-gia-dinh"');
    expect(html).toContain("Chép link");
    expect(html).toContain('data-testid="nut-chep-tin-nhan"');
    expect(html).toMatch(/data-testid="tin-nhan-mau-gia-dinh"[^>]*>[^<]*MaGiaCuaPhepThuBb334c/);
    expect(html).toContain('data-testid="nut-ghi-link-lark"');
    expect(html).toContain("Ba mẹ mở 14 lần");
    expect(html).not.toContain("Chưa có link");
  });

  it("'N link cũ vẫn mở được' đọc đúng số `linkCuConSong`, kèm tên từng bộ", () => {
    const html = dung();
    expect(html).toContain("2 link cũ theo từng bộ vẫn mở được");
    expect(html).toContain("Fixture Bộ Thôi nôi · mở 3 lần");
    const mot = dung({ du: du({ linkCuConSong: du().linkCuConSong.slice(0, 1) }) });
    expect(mot).toContain("1 link cũ theo từng bộ vẫn mở được");
    const khong = dung({ du: du({ linkCuConSong: [] }) });
    expect(khong).not.toContain("link cũ theo từng bộ");
  });

  it("có link mời người thân: nói rõ thu hồi riêng", () => {
    const html = dung({ du: du({ loiMoiGiaDinh: [{ shareLinkId: "m", nhan: "Bà nội", taoLuc: "2026-09-20T00:00:00Z" }] }) });
    expect(html).toContain("1 link mời người thân");
    expect(html).toContain("không bị thu hồi kèm");
  });

  it("chưa ai mở link: nói 'chưa mở lần nào', không bịa 'lần cuối'", () => {
    const html = dung({ du: du({ linkGiaDinh: { ...du().linkGiaDinh!, soLanMo: 0, moLanCuoi: null } }) });
    expect(html).toContain("Ba mẹ chưa mở lần nào");
    expect(html).not.toContain("lần cuối");
  });

  it("vừa thu hồi: báo đã thu hồi, vẫn cho tạo lại, không còn ô link", () => {
    const html = dung({ du: du({ linkGiaDinh: null }), diaChi: null, vuaThuHoi: true });
    expect(html).toContain('data-testid="link-gia-dinh-da-thu-hoi"');
    expect(html).toContain("Ba mẹ mở link này sẽ không thấy gì");
    expect(html).toContain('data-testid="nut-tao-link-gia-dinh"');
    expect(html).not.toContain('data-testid="o-link-gia-dinh"');
  });

  it("có link nhưng không giải mã lại được địa chỉ: báo rõ và khoá nút Chép", () => {
    const html = dung({ diaChi: null, du: du({ linkGiaDinh: { ...du().linkGiaDinh!, diaChi: null, duongDan: null } }) });
    expect(html).toContain('data-testid="link-gia-dinh-khong-doc-lai"');
    expect(nut(html, "nut-chep-link-gia-dinh")).toMatch(/ disabled(=| |>)/);
  });

  it("nút Chia sẻ chỉ hiện khi trình duyệt có Web Share", () => {
    expect(dung({ coTheChiaSe: false })).not.toContain("nut-chia-se-link-gia-dinh");
    expect(dung({ coTheChiaSe: true })).toContain("nut-chia-se-link-gia-dinh");
  });

  it("đã chép: nút đổi chữ thành 'Đã chép'", () => {
    expect(dung({ daChep: "link" })).toContain("Đã chép");
    expect(dung({ daChep: "tin" })).toContain("Đã chép tin nhắn");
  });

  it("thông báo lỗi dùng role=alert, thông báo ok dùng role=status", () => {
    expect(dung({ thongBao: { loai: "loi", chu: "Không làm được." } })).toMatch(/role="alert"[^>]*data-testid="link-gia-dinh-thong-bao"/);
    expect(dung({ thongBao: { loai: "ok", chu: "Xong." } })).toMatch(/role="status"[^>]*data-testid="link-gia-dinh-thong-bao"/);
  });
});

describe("BB-334C — ẩn nút theo vai", () => {
  it("vai được đổi (cs/admin/owner): thấy Đổi link và Thu hồi", () => {
    const html = dung({ du: du({ duocDoi: true }) });
    expect(html).toContain('data-testid="nut-doi-link-gia-dinh"');
    expect(html).toContain('data-testid="nut-thu-hoi-link-gia-dinh"');
    expect(html).not.toContain("link-gia-dinh-chi-admin-doi");
  });

  it("vai khác: KHÔNG có nút Đổi/Thu hồi, vẫn Chép + Ghi Lark, có lời giải thích 'CSKH hoặc Admin'", () => {
    const html = dung({ du: du({ duocDoi: false }) });
    expect(html).not.toContain("nut-doi-link-gia-dinh");
    expect(html).not.toContain("nut-thu-hoi-link-gia-dinh");
    expect(html).toContain('data-testid="nut-chep-link-gia-dinh"');
    expect(html).toContain('data-testid="nut-ghi-link-lark"');
    expect(html).toContain("Chỉ CSKH hoặc Admin được đổi hoặc thu hồi link.");
    // Vai cao nhất hiển thị "Admin", không phải "owner"/"chủ studio".
    expect(html).not.toMatch(/owner/i);
  });
});

describe("BB-334C — hộp xác nhận", () => {
  it("không mở hộp thì không có hộp nào trong trang", () => {
    expect(dung({ hop: null })).not.toContain('role="dialog"');
  });

  it("đổi link: nói thẳng 'Link cũ sẽ ngừng mở ngay', có Huỷ và nút xác nhận", () => {
    const html = dung({ hop: "doi" });
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Đổi link gia đình?");
    expect(html).toContain("Link cũ sẽ ngừng mở ngay");
    expect(html).toContain('data-testid="hop-link-gia-dinh-huy"');
    expect(html).toContain('data-testid="hop-link-gia-dinh-xac-nhan"');
  });

  it("thu hồi: nói link ngừng mở ngay và link mời / link cũ theo bộ không bị thu hồi kèm", () => {
    const html = dung({ hop: "thu-hoi" });
    expect(html).toContain("Thu hồi link gia đình?");
    expect(html).toContain("Link sẽ ngừng mở ngay");
    expect(html).toContain("vẫn mở được");
    expect(html).toContain("Thu hồi link</button>");
  });

  it("ghi Lark: nói rõ sửa dữ liệu bên Lark, có Huỷ", () => {
    const html = dung({ hop: "ghi-lark" });
    expect(html).toContain("Ghi link vào Lark?");
    expect(html).toContain("sẽ bị thay");
    expect(html).toContain("sửa dữ liệu bên Lark");
    expect(html).toContain("Ghi vào Lark</button>");
    expect(html).toContain('data-testid="hop-link-gia-dinh-huy"');
  });

  it("đang xử lý: cả hai nút của hộp bị khoá để không bấm hai lần", () => {
    const html = dung({ hop: "doi", dangLam: "doi" });
    expect(nut(html, "hop-link-gia-dinh-xac-nhan")).toMatch(/ disabled(=| |>)/);
    expect(nut(html, "hop-link-gia-dinh-huy")).toMatch(/ disabled(=| |>)/);
  });
});

describe("BB-334C — gọi API (giả lập fetch ở biên)", () => {
  const LOI = { matKetNoi: "Mất kết nối.", chung: "Không làm được." };
  const goi = vi.fn();
  afterEach(() => {
    goi.mockReset();
    vi.unstubAllGlobals();
  });
  const dap = (status: number, body: unknown) =>
    Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

  it("tạo: POST thân rỗng, KHÔNG có doiLink / xacNhan", async () => {
    goi.mockReturnValue(dap(200, { data: { shareLinkId: "x", duongDan: "/k/abc", tokenPrefix: "abc", luuDiaChiDuoc: true, daThuHoi: null, lark: null } }));
    vi.stubGlobal("fetch", goi);
    const r = await taoLinkGiaDinh("kh-1", LOI);
    expect(r.ok).toBe(true);
    const [url, init] = goi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/customers/kh-1/link-gia-dinh");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("đổi: POST có doiLink:true VÀ xacNhan:true", async () => {
    goi.mockReturnValue(dap(200, { data: { shareLinkId: "x", duongDan: "/k/abc", tokenPrefix: "abc", luuDiaChiDuoc: true, daThuHoi: "old", lark: null } }));
    vi.stubGlobal("fetch", goi);
    await doiLinkGiaDinh("kh-1", LOI);
    const [, init] = goi.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ doiLink: true, xacNhan: true });
  });

  it("thu hồi: DELETE có xacNhan:true", async () => {
    goi.mockReturnValue(dap(200, { data: { daThuHoi: "old" } }));
    vi.stubGlobal("fetch", goi);
    const r = await thuHoiLinkGiaDinh("kh-1", LOI);
    expect(r).toEqual({ ok: true, data: { daThuHoi: "old" } });
    const [, init] = goi.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("DELETE");
    expect(JSON.parse(String(init.body))).toEqual({ xacNhan: true });
  });

  it("ghi Lark: POST tới .../ghi-lark", async () => {
    goi.mockReturnValue(dap(200, { data: { lark: { tong: 0, ghiDuoc: 0, dong: [] } } }));
    vi.stubGlobal("fetch", goi);
    await ghiLarkGiaDinh("kh-1", LOI);
    const [url, init] = goi.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/admin/customers/kh-1/link-gia-dinh/ghi-lark");
    expect(init.method).toBe("POST");
  });

  it("mã khách có ký tự lạ được mã hoá trong đường dẫn", async () => {
    goi.mockReturnValue(dap(200, { data: { linkGiaDinh: null, linkCuConSong: [], loiMoiGiaDinh: [], soBoAnh: 0, duocDoi: false } }));
    vi.stubGlobal("fetch", goi);
    await docLinkGiaDinh("a/b?c", LOI);
    expect((goi.mock.calls[0] as [string])[0]).toBe("/api/admin/customers/a%2Fb%3Fc/link-gia-dinh");
  });

  it("máy chủ báo lỗi: trả mã + câu của máy chủ; 409 giữ nguyên mã CONFLICT", async () => {
    goi.mockReturnValue(dap(409, { error: { code: "CONFLICT", message: "Khách đã có link gia đình." } }));
    vi.stubGlobal("fetch", goi);
    expect(await taoLinkGiaDinh("kh-1", LOI)).toEqual({ ok: false, ma: "CONFLICT", loi: "Khách đã có link gia đình." });
  });

  it("máy chủ trả thân hỏng: dùng câu chung, không ném", async () => {
    goi.mockReturnValue(Promise.resolve(new Response("<html>", { status: 500 })));
    vi.stubGlobal("fetch", goi);
    expect(await thuHoiLinkGiaDinh("kh-1", LOI)).toEqual({ ok: false, ma: "HTTP_500", loi: "Không làm được." });
  });

  it("mất mạng: mã NETWORK + câu mất kết nối", async () => {
    goi.mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", goi);
    expect(await doiLinkGiaDinh("kh-1", LOI)).toEqual({ ok: false, ma: "NETWORK", loi: "Mất kết nối." });
  });
});

describe("BB-334C — hàm phụ", () => {
  it("địa chỉ hiển thị: ưu tiên diaChi máy chủ, thiếu thì ghép gốc trang, thiếu cả hai thì null", () => {
    expect(diaChiHienThi({ diaChi: "https://a.test/k/x", duongDan: "/k/x" }, "https://b.test")).toBe("https://a.test/k/x");
    expect(diaChiHienThi({ diaChi: null, duongDan: "/k/x" }, "https://b.test/")).toBe("https://b.test/k/x");
    expect(diaChiHienThi({ diaChi: null, duongDan: null }, "https://b.test")).toBeNull();
    expect(diaChiHienThi(null, "https://b.test")).toBeNull();
  });

  it("tin nhắn mẫu có link và xưng Bean, gọi ba mẹ, có 'ạ'", () => {
    const t = tinNhanMauGiaDinh("https://a.test/k/x");
    expect(t).toContain("https://a.test/k/x");
    expect(t).toMatch(/Bean chào ba mẹ ạ/);
  });

  it("dien() thay {khoá}", () => {
    expect(dien("{n} link, {n} lần", { n: 2 })).toBe("2 link, 2 lần");
  });
});
