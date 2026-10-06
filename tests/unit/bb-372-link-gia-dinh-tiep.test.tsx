/**
 * BB-372 — link gia đình, phần tiếp (P0 chủ studio 06/10).
 *
 * Ba khối (dựng bằng `renderToStaticMarkup`, KHÔNG giả lập hook — AGENTS.md §5a; hàm gọi API
 * giả lập `fetch` ở biên). Dữ liệu giả hoàn toàn.
 *
 *   1. Trang khách hàng: link màn con của TỪNG bộ — "Buổi n · tên · ngày", địa chỉ /k/<mã>/<n>,
 *      nút Chép từng dòng, trạng thái bộ, số ảnh. Số n lấy từ `soThuTu` máy chủ, không tính ở trình duyệt.
 *   2. Màn bộ ảnh: khách đã có link gia đình thì link cũ `/g/…` chỉ là một dòng thu gọn, địa chỉ
 *      link cũ nằm trong phần đóng sẵn.
 *   3. Link mời ông bà / người thân: nhãn, ngày tạo, lượt mở, tim, thu hồi, yêu cầu mua thêm; CHỈ ĐỌC
 *      (không có nút nào), chỉ 6 ký tự đầu của mã.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { KhoiLinkGiaDinhView, type KhoiLinkGiaDinhViewProps } from "@/components/features/admin/khoi-link-gia-dinh";
import {
  KhoiLinkBoAnhGiaDinhView,
  type KhoiLinkBoAnhGiaDinhViewProps,
} from "@/components/features/admin/khoi-link-bo-anh-gia-dinh";
import { KhoiLinkMoiNguoiThanView } from "@/components/features/admin/khoi-link-moi-nguoi-than";
import {
  diaChiManConBo,
  docLinkGiaDinh,
  docLinkMoiCuaBo,
  docLinkMoiCuaKhach,
  type BoAnhManCon,
  type DuLieuLinkMoi,
  type LinkGiaDinhCuaBo,
  type LinkMoiNguoiThan,
  type TrangThaiLinkGiaDinh,
} from "@/lib/utils/link-gia-dinh-nhan-vien";

vi.mock("@/lib/utils/khoa-cuon-trang", () => ({ khoaCuonTrang: () => () => {} }));

const GOC = "https://fixture-bb372.test";
const MA = "MaGiaCuaPhepThuBb372KhongThat0123456789abcde";

function bo(so: number, phan: Partial<BoAnhManCon> = {}): BoAnhManCon {
  return {
    galleryId: `00000000-0000-4000-8000-00000000000${so}`,
    soThuTu: so,
    tieuDe: `Fixture Bộ ${so}`,
    tenBe: "Bé Mít",
    ngayChup: `2026-09-${String(10 + so).padStart(2, "0")}`,
    soAnh: 100 + so,
    trangThai: { ma: "cho_khach_chon", khach: "Mời ba mẹ chọn ảnh ạ" },
    duongDanManCon: `/k/${MA}/${so}`,
    diaChiManCon: `${GOC}/k/${MA}/${so}`,
    ...phan,
  };
}

function du(phan: Partial<TrangThaiLinkGiaDinh> = {}): TrangThaiLinkGiaDinh {
  return {
    linkGiaDinh: {
      shareLinkId: "11111111-1111-4111-8111-111111111111",
      duongDan: `/k/${MA}`,
      diaChi: `${GOC}/k/${MA}`,
      tokenPrefix: MA.slice(0, 6),
      taoLuc: "2026-09-12T03:00:00Z",
      soLanMo: 2,
      moLanCuoi: "2026-10-05T01:30:00Z",
    },
    linkCuConSong: [],
    loiMoiGiaDinh: [],
    soBoAnh: 3,
    boAnh: [bo(1), bo(2, { trangThai: { ma: "dang_chinh", khach: "Bean đang chỉnh ảnh ạ" }, soAnh: 296 }), bo(3)],
    soBoAn: 0,
    duocDoi: true,
    ...phan,
  };
}

function dungKhach(phan: Partial<KhoiLinkGiaDinhViewProps> = {}): string {
  const props: KhoiLinkGiaDinhViewProps = {
    dangTai: false,
    loiTai: false,
    du: du(),
    diaChi: `${GOC}/k/${MA}`,
    hop: null,
    dangLam: null,
    thongBao: null,
    daChep: null,
    coTheChiaSe: false,
    goc: GOC,
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

/** Cắt các `<li data-testid="dong-man-con" …>` ra từng dòng. */
function cacDongManCon(html: string): string[] {
  return html.split('data-testid="dong-man-con"').slice(1);
}

describe("BB-372 (1) trang khách hàng: link màn con của từng bộ", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mỗi bộ một dòng 'Buổi n · tên · bé · ngày', đúng địa chỉ /k/<mã>/<n>, số ảnh, trạng thái, nút Chép", () => {
    const dong = cacDongManCon(dungKhach());
    expect(dong).toHaveLength(3);
    expect(dong[0]).toContain("Buổi 1 · Fixture Bộ 1 · Bé Mít · 11/09/2026");
    expect(dong[0]).toContain(`value="${GOC}/k/${MA}/1"`);
    expect(dong[0]).toContain("101 ảnh");
    expect(dong[0]).toContain("Mời ba mẹ chọn ảnh ạ");
    expect(dong[1]).toContain("Buổi 2 · Fixture Bộ 2");
    expect(dong[1]).toContain(`value="${GOC}/k/${MA}/2"`);
    expect(dong[1]).toContain("296 ảnh");
    expect(dong[1]).toContain("Bean đang chỉnh ảnh ạ"); // trạng thái KHÁC nhau theo từng bộ
    // Nút Chép ở từng dòng.
    for (const d of dong) {
      expect(d).toMatch(/<button(?=[^>]*data-testid="nut-chep-man-con-bo")[^>]*>/);
      expect(d).toContain("Chép");
    }
  });

  it("số 'Buổi n' lấy từ soThuTu máy chủ (không đếm vị trí): bộ số 2 và số 5 → Buổi 2, Buổi 5", () => {
    const html = dungKhach({
      du: du({ boAnh: [bo(2), bo(5)] }),
    });
    expect(html).toContain("Buổi 2 ·");
    expect(html).toContain("Buổi 5 ·");
    expect(html).toContain(`/k/${MA}/5`);
    expect(html).not.toContain("Buổi 3 ·");
    expect(html).not.toContain(`/k/${MA}/3"`);
  });

  it("dòng vừa chép hiện 'Đã chép'; dòng khác vẫn 'Chép'", () => {
    const dong = cacDongManCon(dungKhach({ daChepBo: bo(2).galleryId }));
    expect(dong[1]).toContain("Đã chép");
    expect(dong[0]).not.toContain("Đã chép");
  });

  it("không đọc lại được địa chỉ (thiếu bản mã hoá): ô trống, nút Chép khoá, không bịa link", () => {
    const html = dungKhach({
      du: du({ boAnh: [bo(1, { diaChiManCon: null, duongDanManCon: null })] }),
      goc: GOC,
    });
    const d = cacDongManCon(html)[0]!;
    expect(d).toContain("Chưa đọc lại được địa chỉ");
    expect(d).not.toContain("/k/");
    expect(d.match(/<button(?=[^>]*data-testid="nut-chep-man-con-bo")[^>]*>/)![0]).toMatch(/ disabled(=| |>)/);
  });

  it("máy chủ chỉ trả đường dẫn: ghép với gốc trang", () => {
    expect(diaChiManConBo({ diaChiManCon: null, duongDanManCon: `/k/${MA}/4` }, `${GOC}/`)).toBe(`${GOC}/k/${MA}/4`);
    expect(diaChiManConBo({ diaChiManCon: null, duongDanManCon: `/k/${MA}/4` }, null)).toBeNull();
  });

  it("có bộ đang ẩn: một dòng nói rõ; khách chưa có link gia đình: không hiện danh sách; máy chủ cũ (không boAnh): không hiện", () => {
    expect(dungKhach({ du: du({ soBoAn: 2 }) })).toContain("2 bộ chưa hiện với gia đình");
    expect(dungKhach({ du: du({ soBoAn: 0 }) })).not.toContain("link-man-con-bo-an");
    expect(dungKhach({ du: du({ linkGiaDinh: null }), diaChi: null })).not.toContain("link-man-con-cac-bo");
    expect(dungKhach({ du: du({ boAnh: undefined }) })).not.toContain("link-man-con-cac-bo");
    expect(dungKhach({ du: du({ boAnh: [] }) })).toContain("Chưa có bộ ảnh nào hiện với gia đình.");
  });

  it("docLinkGiaDinh chuyển nguyên boAnh/soBoAn của máy chủ", async () => {
    const mau = du();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ data: mau }), { status: 200 })));
    const r = await docLinkGiaDinh("33333333-3333-4333-8333-333333333333", { matKetNoi: "mất", chung: "lỗi" });
    expect(r.ok && r.data.boAnh?.map((b) => b.soThuTu)).toEqual([1, 2, 3]);
  });
});

function duBo(phan: Partial<LinkGiaDinhCuaBo> = {}): LinkGiaDinhCuaBo & { customerId: string } {
  return {
    soThuTu: 2,
    coAnh: true,
    hienVoiGiaDinh: true,
    linkGiaDinh: {
      shareLinkId: "11111111-1111-4111-8111-111111111111",
      tokenPrefix: MA.slice(0, 6),
      duongDan: `/k/${MA}`,
      duongDanManCon: `/k/${MA}/2`,
      diaChiManCon: `${GOC}/k/${MA}/2`,
      soLanMo: 0,
    },
    soLinkCuConSong: 0,
    duocDoi: true,
    ...phan,
    customerId: "22222222-2222-4222-8222-222222222222",
  };
}

function dungBo(d: LinkGiaDinhCuaBo & { customerId: string }, slot?: React.ReactNode): string {
  const props: KhoiLinkBoAnhGiaDinhViewProps = {
    du: d,
    diaChi: d.linkGiaDinh?.diaChiManCon ?? null,
    vuaTao: false,
    dangTao: false,
    thongBao: null,
    daChep: null,
    chatUrl: null,
    slotLinkCu: slot,
    onTao: () => {},
    onChepLink: () => {},
    onChepTinNhan: () => {},
  };
  return renderToStaticMarkup(<KhoiLinkBoAnhGiaDinhView {...props} />);
}

const DIA_CHI_CU = `${GOC}/g/LinkCuTheoBoKhongThat0123456789abcdefghijkl`;

describe("BB-372 (2) màn bộ ảnh: link cũ `/g/…` thu gọn khi khách đã có link gia đình", () => {
  const slot = <span data-testid="dia-chi-link-cu">{DIA_CHI_CU}</span>;

  it("đã có link gia đình + 2 link cũ: MỘT dòng 'N link cũ vẫn mở được (không cần gửi lại)', đóng sẵn, địa chỉ cũ chỉ nằm trong phần đóng", () => {
    const html = dungBo(duBo({ soLinkCuConSong: 2 }), slot);
    expect(html).toContain("2 link cũ vẫn mở được (không cần gửi lại)");
    const batDau = html.indexOf('data-testid="link-cu-bo-anh"');
    expect(batDau).toBeGreaterThan(0);
    const the = html.slice(html.lastIndexOf("<details", batDau), html.indexOf(">", batDau) + 1);
    expect(the).not.toMatch(/\sopen(=|\s|>)/); // đóng sẵn: bấm mới mở
    expect(the).toContain('data-thu-gon="1"');
    // Địa chỉ link cũ chỉ xuất hiện SAU thẻ <details> (trong phần thu gọn), không ở khối nổi bật phía trên.
    const truoc = html.slice(0, html.lastIndexOf("<details", batDau));
    expect(truoc).not.toContain("/g/");
    expect(truoc).not.toContain("LinkCuTheoBo");
    expect(html.indexOf(DIA_CHI_CU)).toBeGreaterThan(batDau);
    // Link nổi bật vẫn là link màn con.
    expect(truoc).toContain(`value="${GOC}/k/${MA}/2"`);
  });

  it("không có link cũ: không có dòng thu gọn", () => {
    expect(dungBo(duBo({ soLinkCuConSong: 0 }), slot)).not.toContain("link-cu-bo-anh");
  });

  it("chưa có link gia đình: link cũ vẫn là link đang dùng, giữ khối cũ (không bị giấu nhầm)", () => {
    const html = dungBo(duBo({ linkGiaDinh: null, soLinkCuConSong: 1 }), slot);
    expect(html).toContain("1 link cũ vẫn mở được (không cần gửi lại)");
    expect(html).toContain("Bấm để xem");
    expect(html).not.toContain('data-thu-gon="1"');
  });
});

function link(phan: Partial<LinkMoiNguoiThan> = {}): LinkMoiNguoiThan {
  return {
    shareLinkId: "aaaaaaaa-0000-4000-8000-000000000001",
    nhan: "Bà nội",
    taoLuc: "2026-09-20T03:00:00Z",
    soLanMo: 7,
    moLanCuoi: "2026-10-04T05:00:00Z",
    soTim: 12,
    soYeuCau: 2,
    daThuHoi: false,
    daHetHan: false,
    phamVi: "ca_nha",
    tieuDeBo: null,
    maDau: "AbCdEf",
    ...phan,
  };
}

function dungMoi(links: LinkMoiNguoiThan[] | null, phan: { dangTai?: boolean; loiTai?: boolean; phamVi?: "khach" | "bo"; chuaAp?: boolean } = {}) {
  const duLieu: DuLieuLinkMoi | null = links ? { links, chuaApMigration: phan.chuaAp ?? false } : null;
  return renderToStaticMarkup(
    <KhoiLinkMoiNguoiThanView dangTai={phan.dangTai ?? false} loiTai={phan.loiTai ?? false} du={duLieu} phamVi={phan.phamVi ?? "khach"} />,
  );
}

describe("BB-372 (3) link mời ông bà / người thân: chỉ đọc", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("mỗi link một dòng: nhãn ba mẹ đặt, ngày tạo, lượt mở + lần cuối, tim, yêu cầu mua thêm, 6 ký tự đầu", () => {
    const html = dungMoi([link()]);
    expect(html).toContain("Bà nội");
    expect(html).toContain("Tạo 20/09/2026");
    expect(html).toContain("Mở 7 lần");
    expect(html).toContain("lần cuối 04/10/2026");
    expect(html).toContain("12 tim");
    expect(html).toContain("2 yêu cầu mua thêm");
    expect(html).toContain("Mã AbCdEf…");
    expect(html).toContain("Xem cả nhà");
    expect(html).toContain("Đang mở");
    expect(html).toContain("1 link mời · 1 đã được mở");
  });

  it("link đã thu hồi: nhãn 'Đã thu hồi'; link chưa ai mở / chưa tim / chưa yêu cầu nói đúng như vậy", () => {
    const html = dungMoi([
      link({ shareLinkId: "b", nhan: "Ông ngoại", daThuHoi: true, soLanMo: 0, moLanCuoi: null, soTim: 0, soYeuCau: 0 }),
      link({ shareLinkId: "c", nhan: null, phamVi: "bo", tieuDeBo: "Fixture Bộ Thôi nôi", daHetHan: true }),
    ]);
    const dong = html.split('data-testid="dong-link-moi"').slice(1);
    expect(dong).toHaveLength(2);
    expect(dong[0]).toContain("Ông ngoại");
    expect(dong[0]).toContain("Đã thu hồi");
    expect(dong[0]).toContain('data-thu-hoi="1"');
    expect(dong[0]).toContain("Chưa ai mở");
    expect(dong[0]).toContain("Chưa thả tim");
    expect(dong[0]).toContain("Chưa có yêu cầu mua");
    expect(dong[1]).toContain("Chưa đặt tên");
    expect(dong[1]).toContain("Chỉ bộ: Fixture Bộ Thôi nôi");
    expect(dong[1]).toContain("Hết hạn");
    expect(html).toContain("2 link mời · 1 đã được mở");
  });

  it("CHỈ ĐỌC: không có nút, ô nhập hay biểu mẫu nào để sửa / thu hồi / chép link của khách", () => {
    const html = dungMoi([link(), link({ shareLinkId: "b", daThuHoi: true })]);
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("<form");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Thu hồi link");
  });

  it("chưa ai được mời / đang tải / lỗi / chưa áp migration", () => {
    expect(dungMoi([])).toContain("Ba mẹ chưa mời người thân nào.");
    expect(dungMoi(null, { dangTai: true })).toContain("Đang tải link mời");
    expect(dungMoi(null, { loiTai: true })).toContain("Không đọc được link mời");
    expect(dungMoi([link()], { chuaAp: true })).toContain("chưa đọc được vì cơ sở dữ liệu chưa cập nhật");
    expect(dungMoi([link()], { phamVi: "bo" })).toContain("tính riêng cho bộ ảnh này");
  });

  it("hàm gọi API: đúng đường của khách / của bộ, và gói lỗi 403 thành mã FORBIDDEN", async () => {
    const goi: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        goi.push(url);
        return new Response(JSON.stringify({ error: { code: "FORBIDDEN", message: "Không có quyền xem link mời người thân" } }), {
          status: 403,
        });
      }),
    );
    const loi = { matKetNoi: "mất", chung: "lỗi" };
    const k = await docLinkMoiCuaKhach("33333333-3333-4333-8333-333333333333", loi);
    const b = await docLinkMoiCuaBo("44444444-4444-4444-8444-444444444444", loi);
    expect(goi).toEqual([
      "/api/admin/customers/33333333-3333-4333-8333-333333333333/link-moi-nguoi-than",
      "/api/admin/galleries/44444444-4444-4444-8444-444444444444/link-moi-nguoi-than",
    ]);
    expect(k).toMatchObject({ ok: false, ma: "FORBIDDEN" });
    expect(b).toMatchObject({ ok: false, ma: "FORBIDDEN" });
  });
});
