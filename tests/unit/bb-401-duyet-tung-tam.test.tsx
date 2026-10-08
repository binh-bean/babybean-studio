/**
 * BB-401 — anh 08/10: "Màn khách duyệt ảnh chỉnh sửa đang CHỈ có so sánh và xem tiến/lùi ảnh."
 *
 * Canh HÀNH VI của màn xem lớn và luồng gửi (AGENTS §5a):
 *   1. Màn xem lớn mở THẲNG (không qua nút "Yêu cầu sửa" dưới lưới) có đủ 3 nút: Duyệt tấm
 *      này · Cần sửa tấm này · Duyệt cả bộ — bản BB-384 chỉ có so sánh + tiến/lùi.
 *   2. "Cần sửa tấm này" mở ghi chú cho ĐÚNG tấm đang xem; đổi tấm → ghi chú của đúng tấm đó.
 *   3. Ảnh minh hoạ: chọn tệp gọi đúng tấm, gửi đúng route `anh-mau` (fetch giả ở biên).
 *   4. "Duyệt cả bộ" / "Gửi yêu cầu sửa" gửi đúng thân tới `/api/g/review`.
 *   5. Lời xin lỗi đúng câu anh chốt + "khoảng N ngày".
 *
 * Cách dựng: `XemLonDuyet`, `HopDuyetCaBo`, `KetQuaGuiView` KHÔNG dùng hook (trạng thái do khối
 * cha giữ) → dựng bằng `renderToStaticMarkup`, và "bấm" bằng cách gọi đúng `onClick`/`onChange`
 * của phần tử mang `data-testid` trong cây React vừa dựng (gọi thẳng hàm component thuần, KHÔNG
 * giả lập useState/useEffect). Component có hook (`AnhKhoanhVung`) không bị gọi, chỉ đọc props.
 */
import React from "react";
import { describe, it, expect, vi as vt, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "@/i18n/vi";
import {
  XemLonDuyet,
  HopDuyetCaBo,
  KetQuaGuiView,
  TomTatGuiSua,
  type AnhChinh,
  type HanhXemLon,
  type PropsXemLon,
} from "@/components/features/gallery/anh-chinh-sua-khach";
import { AnhKhoanhVung } from "@/components/features/gallery/anh-khoanh-vung";
import {
  buocSauDuyet,
  datDuyet,
  datSua,
  demNhap,
  docNhapLuu,
  guiAnhMinhHoa,
  guiKeHoach,
  keHoachDuyetCaBo,
  keHoachGui,
  kiemTepAnhMinhHoa,
  nhanAnhMinhHoaDuoc,
  suaGhiChu,
  themAnhMinhHoa,
  themVung,
  type NhapDuyet,
} from "@/lib/anh-chinh-sua/duyet-tung-tam";
import { goiApiKhach } from "@/lib/utils/goi-api-khach";

afterEach(() => vt.unstubAllGlobals());

const t = vi.gallery.anhChinh;
const CHU = (html: string) =>
  html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "").replace(/ /g, " ").replace(/&#x27;/g, "'");

const anh: AnhChinh[] = [1, 2, 3].map((i) => ({
  id: `p${i}`,
  fileName: `IMG_000${i}-Edit.jpg`,
  width: 1500,
  height: 1000,
  maTepDrive: null,
  goc: null,
  khoa: "goc",
}));

// ---- dựng cây React của component THUẦN rồi tìm phần tử theo data-testid ----
type El = React.ReactElement<Record<string, unknown>>;
function trai(node: unknown, ra: El[] = []): El[] {
  if (node == null || typeof node === "boolean" || typeof node === "string" || typeof node === "number") return ra;
  if (Array.isArray(node)) {
    for (const n of node) trai(n, ra);
    return ra;
  }
  const el = node as El;
  if (!React.isValidElement(el)) return ra;
  if (typeof el.type === "function" && el.type !== AnhKhoanhVung) {
    // Component thuần (không hook) — gọi như hàm để lấy cây con.
    return trai((el.type as (p: unknown) => unknown)(el.props), ra);
  }
  ra.push(el);
  return trai(el.props.children, ra);
}
const tim = (cay: unknown, testId: string) => trai(cay).filter((e) => e.props["data-testid"] === testId);
const mot = (cay: unknown, testId: string) => {
  const ds = tim(cay, testId);
  expect(ds, `phần tử data-testid="${testId}"`).toHaveLength(1);
  return ds[0]!;
};

/** Trạng thái giả của khối cha + hành động ghi lại lời gọi. */
function dungMan(dau: Partial<PropsXemLon> = {}) {
  const goi: [keyof HanhXemLon, unknown[]][] = [];
  const s = {
    viTriMo: 0,
    nhap: {} as NhapDuyet,
    dangGhiChu: false,
    dangKhoanh: false,
    ...dau,
  };
  const ghi =
    <K extends keyof HanhXemLon>(k: K, f?: (...a: Parameters<HanhXemLon[K]>) => void) =>
    (...a: Parameters<HanhXemLon[K]>) => {
      goi.push([k, a]);
      f?.(...a);
    };
  const hanh: HanhXemLon = {
    dong: ghi("dong"),
    diToi: ghi("diToi", (i) => (s.viTriMo = i)),
    batTatSoSanh: ghi("batTatSoSanh"),
    datViTriSoSanh: ghi("datViTriSoSanh"),
    duyetTam: ghi("duyetTam", (id) => (s.nhap = datDuyet(s.nhap, id))),
    canSuaTam: ghi("canSuaTam", (id) => {
      s.nhap = datSua(s.nhap, id);
      s.dangGhiChu = true;
    }),
    duyetCaBo: ghi("duyetCaBo"),
    guiYeuCau: ghi("guiYeuCau"),
    ghiChu: ghi("ghiChu", (id, chu) => (s.nhap = suaGhiChu(s.nhap, id, chu))),
    batTatKhoanh: ghi("batTatKhoanh", () => (s.dangKhoanh = !s.dangKhoanh)),
    themVung: ghi("themVung", (id, v) => (s.nhap = themVung(s.nhap, id, v))),
    boVung: ghi("boVung"),
    chonAnhMinhHoa: ghi("chonAnhMinhHoa"),
    boAnhMinhHoa: ghi("boAnhMinhHoa"),
    boYeuCauSua: ghi("boYeuCauSua"),
    xongGhiChu: ghi("xongGhiChu", () => (s.dangGhiChu = false)),
  };
  const props = (): PropsXemLon => ({
    anh,
    daXem: new Set(anh.map((a) => a.id)),
    dem: demNhap(
      anh.map((a) => a.id),
      s.nhap,
      new Set(),
    ),
    moVong: true,
    trangThaiVong: "cho_duyet",
    laChu: true,
    tinhNang: { vungKhoanh: true, anhMau: true },
    nhanDot: null,
    lichSuTam: [],
    soSanh: false,
    viTriSoSanh: 50,
    dangTaiAnh: false,
    ban: false,
    loi: null,
    ...dau,
    viTriMo: s.viTriMo,
    nhap: s.nhap,
    dangGhiChu: s.dangGhiChu,
    dangKhoanh: s.dangKhoanh,
    hanh,
  });
  const cay = () => XemLonDuyet(props());
  return { s, goi, cay, html: () => renderToStaticMarkup(<XemLonDuyet {...props()} />) };
}

describe("BB-401 · 1 · màn xem lớn mở thẳng có đủ 3 nút duyệt", () => {
  it("không cần bấm gì trước: Duyệt tấm này · Cần sửa tấm này · Duyệt cả bộ, kèm so sánh và tiến/lùi", () => {
    const m = dungMan({ viTriMo: 1 });
    const chu = CHU(m.html());
    expect(chu).toContain(t.duyetTamNay);
    expect(chu).toContain(t.canSuaTamNay);
    expect(chu).toContain(t.duyetCaBo);
    expect(chu).toContain(t.truocDo);
    expect(chu).toContain(t.tiepTheo);
    const cay = m.cay();
    mot(cay, "nut-duyet-tam");
    mot(cay, "nut-can-sua-tam");
    mot(cay, "nut-duyet-ca-bo");
    // Trạng thái hiện NGAY trên tấm và trên dải ảnh nhỏ.
    expect(mot(cay, "trang-thai-tam-xem-lon").props["data-trang-thai"]).toBe("da_xem");
    expect(tim(cay, "o-dai-anh")).toHaveLength(3);
  });

  it("bấm Duyệt tấm này gọi đúng tấm đang xem; trạng thái trên tấm và dải ảnh đổi thành Đã duyệt", () => {
    const m = dungMan({ viTriMo: 1 });
    (mot(m.cay(), "nut-duyet-tam").props.onClick as () => void)();
    expect(m.goi.at(-1)).toEqual(["duyetTam", ["p2"]]);
    const cay = m.cay();
    expect(mot(cay, "trang-thai-tam-xem-lon").props["data-trang-thai"]).toBe("da_duyet");
    expect(mot(cay, "nut-duyet-tam").props["aria-pressed"]).toBe(true);
    expect(tim(cay, "o-dai-anh").map((e) => e.props["data-trang-thai"])).toEqual(["da_xem", "da_duyet", "da_xem"]);
    expect(CHU(m.html())).toContain(t.ttDaDuyet);
  });

  it("người thân (không phải người nhận link chính) không có nút quyết, chỉ lời Bean", () => {
    const m = dungMan({ laChu: false, moVong: false });
    const cay = m.cay();
    expect(tim(cay, "nut-duyet-tam")).toHaveLength(0);
    expect(tim(cay, "nut-can-sua-tam")).toHaveLength(0);
    expect(CHU(m.html())).toContain("người nhận link chính");
  });
});

describe("BB-401 · 2 · Cần sửa mở ghi chú cho ĐÚNG tấm đang xem", () => {
  it("bấm Cần sửa ở tấm 2 → bảng ghi chú của tấm 2; gõ ghi chú lưu vào tấm 2", () => {
    const m = dungMan({ viTriMo: 1 });
    expect(tim(m.cay(), "bang-sua-tam")).toHaveLength(0);
    (mot(m.cay(), "nut-can-sua-tam").props.onClick as () => void)();
    expect(m.goi.at(-1)).toEqual(["canSuaTam", ["p2"]]);

    const bang = mot(m.cay(), "bang-sua-tam");
    expect(bang.props["data-photo-id"]).toBe("p2");
    const o = mot(m.cay(), "ghi-chu-tam");
    (o.props.onChange as (e: unknown) => void)({ target: { value: "Da bé sáng hơn chút" } });
    expect(m.s.nhap.p2?.ghiChu).toBe("Da bé sáng hơn chút");
    expect(mot(m.cay(), "ghi-chu-tam").props.value).toBe("Da bé sáng hơn chút");
    // Câu mở đầu xoa dịu + đủ công cụ: khoanh vùng, thêm ảnh minh hoạ.
    const chu = CHU(m.html());
    expect(chu).toContain("Bean xin lỗi vì tấm này chưa đúng ý ba mẹ");
    mot(m.cay(), "nut-khoanh-vung");
    mot(m.cay(), "o-chon-anh-minh-hoa");
  });

  it("đổi tấm: tấm chưa xin sửa thì về thanh duyệt; quay lại tấm có ghi chú thì thấy ĐÚNG ghi chú của nó", () => {
    let nhap: NhapDuyet = {};
    nhap = suaGhiChu(datSua(nhap, "p1"), "p1", "Ghi chú tấm 1");
    nhap = suaGhiChu(datSua(nhap, "p3"), "p3", "Ghi chú tấm 3");
    const m = dungMan({ viTriMo: 0, nhap, dangGhiChu: true });
    expect(mot(m.cay(), "bang-sua-tam").props["data-photo-id"]).toBe("p1");
    expect(mot(m.cay(), "ghi-chu-tam").props.value).toBe("Ghi chú tấm 1");

    (mot(m.cay(), "nut-tam-sau").props.onClick as () => void)();
    // Tấm 2 chưa xin sửa: KHÔNG hiện ghi chú của tấm 1 trên tấm 2.
    expect(tim(m.cay(), "bang-sua-tam")).toHaveLength(0);
    mot(m.cay(), "thanh-duyet-tam");

    (mot(m.cay(), "nut-tam-sau").props.onClick as () => void)();
    expect(mot(m.cay(), "bang-sua-tam").props["data-photo-id"]).toBe("p3");
    expect(mot(m.cay(), "ghi-chu-tam").props.value).toBe("Ghi chú tấm 3");
  });

  it("vùng khoanh và ảnh minh hoạ thuộc về tấm đang xem", () => {
    const m = dungMan({ viTriMo: 2 });
    (mot(m.cay(), "nut-can-sua-tam").props.onClick as () => void)();
    (mot(m.cay(), "nut-khoanh-vung").props.onClick as () => void)();
    // Ảnh lớn bật chế độ khoanh và thêm vùng vào ĐÚNG tấm 3.
    const anhLon = trai(m.cay()).find((e) => e.type === AnhKhoanhVung)!;
    expect(anhLon.props.dangKhoanh).toBe(true);
    (anhLon.props.onThem as (v: unknown) => void)({ x: 0.4, y: 0.3, r: 0.07 });
    expect(m.s.nhap.p3?.vung).toHaveLength(1);
    expect(m.s.nhap.p1).toBeUndefined();

    const tep = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "mau.jpg", { type: "image/jpeg" });
    (mot(m.cay(), "o-chon-anh-minh-hoa").props.onChange as (e: unknown) => void)({
      target: { files: [tep], value: "C:\\fakepath\\mau.jpg" },
    });
    expect(m.goi.at(-1)).toEqual(["chonAnhMinhHoa", ["p3", [tep]]]);
  });
});

describe("BB-401 · 3 · ảnh minh hoạ gửi đúng route", () => {
  it("POST /api/g/anh-chinh-sua/anh-mau với trường `tep`; nhận lại đường dẫn bucket", async () => {
    const fetchGia = vt.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: { duongDan: "g1/abc.jpg" } }), { status: 200 }),
    );
    vt.stubGlobal("fetch", fetchGia);
    const tep = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], "mau.jpg", { type: "image/jpeg" });
    const kq = await guiAnhMinhHoa(tep, goiApiKhach, "lỗi");
    expect(kq).toEqual({ duongDan: "g1/abc.jpg" });
    expect(fetchGia).toHaveBeenCalledTimes(1);
    const [url, init] = fetchGia.mock.calls[0]!;
    expect(url).toBe("/api/g/anh-chinh-sua/anh-mau");
    expect(init?.method).toBe("POST");
    expect((init?.body as FormData).get("tep")).toBeInstanceOf(Blob);
  });

  it("máy chủ từ chối → trả lời Bean của máy chủ, không thêm ảnh", async () => {
    vt.stubGlobal(
      "fetch",
      vt.fn(async () => new Response(JSON.stringify({ error: { message: "Ảnh mẫu cần nhỏ hơn 5 MB ạ." } }), { status: 400 })),
    );
    const kq = await guiAnhMinhHoa(new Blob([new Uint8Array([1])]), goiApiKhach, "lỗi");
    expect(kq).toEqual({ loi: "Ảnh mẫu cần nhỏ hơn 5 MB ạ." });
  });

  it("kiểm tệp: không phải ảnh / quá 5 MB bị chặn trước khi gửi; tối đa 3 ảnh mỗi tấm", () => {
    expect(kiemTepAnhMinhHoa({ name: "a.pdf", type: "application/pdf", size: 10 })).toBe("loai");
    expect(kiemTepAnhMinhHoa({ name: "a.jpg", type: "image/jpeg", size: 6 * 1024 * 1024 })).toBe("dung_luong");
    expect(kiemTepAnhMinhHoa({ name: "IMG_1.HEIC", type: "", size: 1000 })).toBeNull();
    let n = datSua({}, "p1");
    for (const d of ["a", "b", "c", "d"]) n = themAnhMinhHoa(n, "p1", { duongDan: d });
    expect(n.p1!.anhMau.map((x) => x.duongDan)).toEqual(["a", "b", "c"]);
  });

  it("route nhận ảnh minh hoạ cả khi đợt MUA THÊM đang chờ duyệt (bộ đã duyệt)", () => {
    expect(nhanAnhMinhHoaDuoc({ trangThaiBo: "awaiting_approval", cacDotMuaThem: [] })).toBe(true);
    expect(nhanAnhMinhHoaDuoc({ trangThaiBo: "approved", cacDotMuaThem: ["da_duyet", "cho_duyet"] })).toBe(true);
    expect(nhanAnhMinhHoaDuoc({ trangThaiBo: "approved", cacDotMuaThem: ["da_duyet"] })).toBe(false);
    expect(nhanAnhMinhHoaDuoc({ trangThaiBo: "in_retouch", cacDotMuaThem: [] })).toBe(false);
  });
});

describe("BB-401 · 4 · gửi đúng tới /api/g/review", () => {
  const trongGoi = anh.map((a) => ({ id: a.id, fileName: a.fileName, khoaVong: "goc" }));
  const moGoc = new Set(["goc"]);

  function fetchGhi(round = 1) {
    const f = vt.fn(async (_url: string, init?: RequestInit) => {
      const than = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ data: than.decision === "revise" ? { round } : { status: "approved" } }), {
        status: 200,
      });
    });
    vt.stubGlobal("fetch", f);
    return f;
  }

  it("Duyệt cả bộ (trong gói) gửi đúng {decision:'approve'} — không kèm khoa", async () => {
    const f = fetchGhi();
    const kq = await guiKeHoach(keHoachDuyetCaBo({ anh: trongGoi, vongMo: moGoc }), goiApiKhach, "lỗi");
    expect(kq).toMatchObject({ ok: true, daDuyet: true, daSua: false });
    expect(f.mock.calls.map(([u]) => u)).toEqual(["/api/g/review"]);
    expect(JSON.parse(String(f.mock.calls[0]![1]?.body))).toEqual({ decision: "approve" });
  });

  it("Duyệt cả bộ có đợt mua thêm mở: mỗi vòng một lượt, đợt kèm khoa", () => {
    const ds = [
      { id: "p1", fileName: "a", khoaVong: "goc" },
      { id: "p2", fileName: "b", khoaVong: "dot:2" },
      { id: "p3", fileName: "c", khoaVong: "dot:3" },
    ];
    expect(keHoachDuyetCaBo({ anh: ds, vongMo: new Set(["goc", "dot:2"]) })).toEqual([
      { decision: "approve" },
      { decision: "approve", khoa: "dot:2" },
    ]);
  });

  it("Gửi yêu cầu sửa: tấm 1 duyệt, tấm 2 xin sửa kèm ghi chú + vùng + ảnh → revise đúng một tấm", async () => {
    let nhap: NhapDuyet = datDuyet({}, "p1");
    nhap = suaGhiChu(datSua(nhap, "p2"), "p2", "Da bé sáng hơn");
    nhap = themVung(nhap, "p2", { x: 0.4, y: 0.3, r: 0.07 });
    nhap = themAnhMinhHoa(nhap, "p2", { duongDan: "g1/mau.jpg", xem: "blob:x" });
    const cacThan = keHoachGui({ anh: trongGoi, nhap, vongMo: moGoc, ghiChuChung: " Cảm ơn Bean " });
    expect(cacThan).toEqual([
      {
        decision: "revise",
        note: "Cảm ơn Bean",
        items: [{ photoId: "p2", note: "Da bé sáng hơn", marks: [{ x: 0.4, y: 0.3, r: 0.07 }], anhMau: ["g1/mau.jpg"] }],
      },
    ]);
    const f = fetchGhi(2);
    const kq = await guiKeHoach(cacThan, goiApiKhach, "lỗi");
    expect(kq).toMatchObject({ ok: true, daSua: true, lan: 2 });
    expect(f.mock.calls[0]![1]?.method).toBe("POST");
  });

  it("đã duyệt từng tấm hết (không tấm nào xin sửa) → gửi approve; còn tấm chưa quyết → không gửi gì", () => {
    const hetDuyet = anh.reduce<NhapDuyet>((n, a) => datDuyet(n, a.id), {});
    expect(keHoachGui({ anh: trongGoi, nhap: hetDuyet, vongMo: moGoc })).toEqual([{ decision: "approve" }]);
    expect(keHoachGui({ anh: trongGoi, nhap: datDuyet({}, "p1"), vongMo: moGoc })).toEqual([]);
  });

  it("bấm Duyệt tấm này: sang tấm kế chưa quyết; duyệt tấm cuối → hỏi Duyệt cả bộ", () => {
    const ids = ["p1", "p2", "p3"];
    expect(buocSauDuyet(ids, datDuyet({}, "p1"), "p1")).toEqual({ toi: "p2", hoiDuyetCaBo: false });
    const ca3 = ids.reduce<NhapDuyet>((n, id) => datDuyet(n, id), {});
    expect(buocSauDuyet(ids, ca3, "p3")).toEqual({ toi: null, hoiDuyetCaBo: true });
    // Còn tấm xin sửa: không hỏi duyệt cả bộ.
    const coSua = datDuyet(datDuyet(datSua({}, "p1"), "p2"), "p3");
    expect(buocSauDuyet(ids, coSua, "p3")).toEqual({ toi: null, hoiDuyetCaBo: false });
  });

  it("máy chủ báo lỗi → dừng, trả đúng lời của máy chủ", async () => {
    vt.stubGlobal(
      "fetch",
      vt.fn(async () => new Response(JSON.stringify({ error: { message: "Ba mẹ đã duyệt các ảnh này rồi ạ." } }), { status: 400 })),
    );
    const kq = await guiKeHoach([{ decision: "approve" }], goiApiKhach, "lỗi");
    expect(kq).toMatchObject({ ok: false, loi: "Ba mẹ đã duyệt các ảnh này rồi ạ." });
  });

  it("hộp Duyệt cả bộ nói rõ còn bao nhiêu tấm chưa duyệt / đang xin sửa; nút xác nhận gọi onDuyet", () => {
    const nhap = datSua(datDuyet({}, "p1"), "p2");
    const dem = demNhap(["p1", "p2", "p3"], nhap, new Set(["p1", "p2"]));
    const onDuyet = vt.fn();
    const el = HopDuyetCaBo({ dem, ban: false, loi: null, onDuyet, onXemLai: () => {} });
    const chu = CHU(renderToStaticMarkup(el));
    expect(chu).toContain("Bộ có 3 tấm: 1 tấm đã duyệt, 1 tấm chưa duyệt ạ.");
    expect(chu).toContain("1 tấm ba mẹ đang ghi cần sửa");
    (mot(el, "nut-xac-nhan-duyet-ca-bo").props.onClick as () => void)();
    expect(onDuyet).toHaveBeenCalledTimes(1);
  });

  it("tóm tắt trước khi gửi liệt kê đúng tấm xin sửa và ghi chú", () => {
    const nhap = suaGhiChu(datSua(datDuyet({}, "p1"), "p2"), "p2", "Da bé sáng hơn");
    const el = TomTatGuiSua({
      anh,
      nhap,
      dem: demNhap(["p1", "p2", "p3"], nhap, new Set()),
      ghiChuChung: "",
      ban: false,
      loi: null,
      onGhiChuChung: () => {},
      onSuaLai: () => {},
      onGui: () => {},
      onXemLai: () => {},
    });
    expect(tim(el, "tom-tat-tam")).toHaveLength(1);
    const chu = CHU(renderToStaticMarkup(el));
    expect(chu).toContain("IMG_0002-Edit.jpg");
    expect(chu).toContain("Da bé sáng hơn");
    expect(chu).not.toContain("IMG_0001-Edit.jpg");
  });
});

describe("BB-401 · 5 · lời xin lỗi đúng câu anh chốt + khoảng N ngày", () => {
  const CAU_ANH =
    "Bean thành thật xin lỗi vì chưa làm hài lòng ba mẹ trong lần chỉnh sửa ảnh này, yêu cầu của ba mẹ đã được ghi nhận và chuyển đến bộ phận hậu kỳ ạ.";

  it("sau khi gửi xin sửa: câu anh chốt nguyên văn, khoảng N ngày theo cài đặt, liệt kê tấm", () => {
    const html = renderToStaticMarkup(
      <KetQuaGuiView
        ketQua={{ loai: "sua", lan: 1, tam: [{ ten: "IMG_0002-Edit.jpg", ghiChu: "Da bé sáng hơn" }], ghiChuChung: "", soNgaySua: 4 }}
        onDong={() => {}}
      />,
    );
    const chu = CHU(html);
    expect(chu).toContain(CAU_ANH);
    expect(chu).toContain("Bean sẽ gửi lại ảnh đã sửa trong khoảng 4 ngày ạ.");
    expect(chu).toContain("IMG_0002-Edit.jpg");
    expect(html).toContain('data-testid="xac-nhan-da-gui-sua"');
  });

  it("thiếu cài đặt → khoảng 3 ngày; duyệt hết → lời cảm ơn, không xin lỗi", () => {
    expect(
      CHU(renderToStaticMarkup(<KetQuaGuiView ketQua={{ loai: "sua", lan: 2, tam: [], ghiChuChung: "" }} onDong={() => {}} />)),
    ).toContain("trong khoảng 3 ngày ạ.");
    const camOn = CHU(renderToStaticMarkup(<KetQuaGuiView ketQua={{ loai: "duyet" }} onDong={() => {}} />));
    expect(camOn).toContain("Bean cảm ơn ba mẹ đã duyệt ảnh ạ");
    expect(camOn).not.toContain("xin lỗi");
  });
});

describe("BB-401 · bản nháp trên máy", () => {
  it("đọc lại: bỏ tấm lạ, bỏ URL xem trước đã chết, giữ ghi chú/vùng/ảnh", () => {
    const luu = docNhapLuu(
      {
        nhap: {
          p1: { trangThai: "sua", ghiChu: "x", vung: [{ x: 0.1, y: 0.2, r: 0.07 }, { x: "sai" }], anhMau: [{ duongDan: "g/a.jpg", xem: "blob:1" }] },
          lA: { trangThai: "duyet", ghiChu: "", vung: [], anhMau: [] },
          p2: { trangThai: "la", ghiChu: "" },
        },
        daXem: ["p1", "lA"],
      },
      ["p1", "p2"],
    );
    expect(luu.nhap).toEqual({ p1: { trangThai: "sua", ghiChu: "x", vung: [{ x: 0.1, y: 0.2, r: 0.07 }], anhMau: [{ duongDan: "g/a.jpg" }] } });
    expect(luu.daXem).toEqual(["p1"]);
  });
});
