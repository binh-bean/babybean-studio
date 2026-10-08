/**
 * BB-396 — chọn lại kiểu bìa trong trình thiết kế, màn khách đọc kiểu thật.
 *
 * Gốc lỗi (BB-370): màn khách KHÔNG truyền `coverLayout` vào `BiaBoAnh` (khách luôn
 * thấy "Bên cạnh"), nên ô chọn kiểu bị bỏ. Nay màn khách và khung xem trước quản
 * trị cùng dựng prop bìa bằng `propBiaTuBoAnh`.
 *
 * Dựng THẬT bằng `renderToStaticMarkup` (không giả lập hook — AGENTS.md §5a);
 * `fetch` giả ở biên. Nút ô kiểu bìa lấy từ cây phần tử của `ChonKieuBia`
 * (component không hook) rồi gọi đúng `onClick` của nó. Dữ liệu giả hoàn toàn.
 */
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BiaBoAnh, type BiaBoAnhProps } from "@/components/features/gallery/bia-bo-anh";
import {
  BiaBoAnhEditor,
  ChonKieuBia,
  TrinhThietKeBia,
  thayDoiBia,
  type ChiTietBia,
} from "@/components/features/admin/bia-bo-anh-editor";
import { KIEU_BIA, kieuBiaHopLe, propBiaTuBoAnh, tenKieuBia } from "@/lib/gallery/kieu-bia";
import { NutMoiOngBaBia } from "@/components/features/gallery/moi-nguoi-than";

afterEach(() => vi.unstubAllGlobals());

// Vitest biên dịch JSX kiểu cổ điển (`React.createElement`); vài component dùng chung
// (vd `ThuongHieuBoAnh`) viết cho JSX tự động của Next nên không import React.
(globalThis as { React?: typeof React }).React = React;

const ANH = "aaaaaaaa-0000-4000-8000-000000000396";

function bia(over: Partial<BiaBoAnhProps> = {}, nguon: Parameters<typeof propBiaTuBoAnh>[0] = {}): string {
  return renderToStaticMarkup(
    <BiaBoAnh
      {...propBiaTuBoAnh(nguon)}
      anhBia={{ id: ANH }}
      tenBe="Bé Fixture"
      chiNhanh="Chi nhánh Thử"
      soAnh={12}
      hanMuc={10}
      daChon={0}
      hanChot={null}
      khoa={false}
      onBatDau={() => {}}
      {...over}
    />,
  );
}

const kieuBiaGoc = (html: string) => html.match(/data-kieu-bia="([^"]+)"/)?.[1] ?? null;

describe("BB-396 (a) — prop bìa màn khách mang đúng kiểu bìa", () => {
  it("propBiaTuBoAnh: kiểu đã lưu đi thẳng vào prop; null/thiếu/lạ → ben-canh", () => {
    expect(propBiaTuBoAnh({ coverLayout: "tap-chi" }).coverLayout).toBe("tap-chi");
    expect(propBiaTuBoAnh({ coverLayout: "de-cheo" }).coverLayout).toBe("de-cheo");
    expect(propBiaTuBoAnh({ coverLayout: null }).coverLayout).toBe("ben-canh");
    expect(propBiaTuBoAnh({}).coverLayout).toBe("ben-canh");
    expect(propBiaTuBoAnh({ coverLayout: "kieu-la" }).coverLayout).toBe("ben-canh");
  });

  it("bìa dựng từ propBiaTuBoAnh ra đúng kiểu đã lưu (cả 4 kiểu), null → Bên cạnh", () => {
    for (const k of KIEU_BIA) {
      expect(kieuBiaGoc(bia({}, { coverLayout: k.id, status: "ready" }))).toBe(k.id);
    }
    expect(kieuBiaGoc(bia({}, { coverLayout: null, status: "ready" }))).toBe("ben-canh");
    // Mọi kiểu đều là "Ảnh bìa" cho trình đọc màn hình + phép thử cũ.
    expect(bia({}, { coverLayout: "toi-gian" })).toContain('aria-label="Ảnh bìa"');
  });

  it("bộ ĐÃ GIAO: luật cũ giữ nguyên — bìa Đã hoàn thiện thắng mọi kiểu", () => {
    expect(kieuBiaGoc(bia({}, { coverLayout: "tap-chi", status: "delivered" }))).toBe("da-giao");
  });

  it("kiểu Tạp chí vẫn có nút Mời ông bà khi màn khách truyền", () => {
    const html = bia({ nutMoiOngBa: <button data-testid="nut-moi-thu">Mời</button> }, { coverLayout: "tap-chi" });
    expect(html).toContain('data-testid="nut-moi-thu"');
  });

  it("tên kiểu tiếng Việt", () => {
    expect(KIEU_BIA.map((k) => k.ten)).toEqual(["Bên cạnh", "Tạp chí", "Tối giản", "Đè chéo"]);
    expect(tenKieuBia(null)).toBe("Bên cạnh");
    expect(tenKieuBia("de-cheo")).toBe("Đè chéo");
    expect(kieuBiaHopLe(42)).toBe("ben-canh");
  });
});

describe("BB-396 vòng 2 — MỌI kiểu bìa có đủ khối chức năng của Bên cạnh", () => {
  const anhNho = [1, 2, 3, 4].map((i) => ({ id: `cccccccc-0000-4000-8000-00000000000${i}`, width: 3000, height: 2000 }));
  const coTestId = (html: string, id: string) => html.includes(`data-testid="${id}"`);
  const day = (kieu: string, over: Partial<BiaBoAnhProps> = {}) =>
    bia(
      { chatUrl: "https://example.com/chat-fixture", anhXemTruoc: anhNho, hanChot: "2099-01-01T00:00:00Z", ...over },
      { coverLayout: kieu, status: "ready", shootDate: "2026-09-13", sessionType: "Thôi nôi" },
    );

  for (const k of KIEU_BIA) {
    it(`${k.ten}: đang mở chọn — tiêu đề, lời chào, ngày·chi nhánh (đt), bộ ba thông tin (mt), nút chính, Nhắn studio, dòng cuối (đt), dải khoảnh khắc`, () => {
      const html = day(k.id);
      expect(kieuBiaGoc(html)).toBe(k.id);
      expect(html.match(/<h1[\s>]/g)?.length).toBe(1);
      for (const id of [
        "bia-loi-chao",
        "bia-meta-dt",
        "bia-thong-tin-mt",
        "bia-nut-chinh",
        "nut-nhan-studio-bia",
        "bia-dong-cuoi-dt",
        "bia-dai-khoanh-khac",
      ]) {
        expect(coTestId(html, id), `${k.id} thiếu ${id}`).toBe(true);
      }
      expect(html).toContain('href="https://example.com/chat-fixture"');
      // Dải khoảnh khắc có đủ 4 tấm, bấm được.
      expect(html.match(/aria-label="Xem ảnh này trong lưới"/g)?.length).toBe(4);
    });

    it(`${k.ten}: có nút Mời ông bà (thay chỗ Nhắn studio, luật BB-355) + đã chốt có dấu khoá`, () => {
      const moi = day(k.id, { nutMoiOngBa: <NutMoiOngBaBia /> });
      expect(coTestId(moi, "nut-moi-ong-ba-bia")).toBe(true);
      expect(coTestId(moi, "nut-nhan-studio-bia")).toBe(false);
      expect(coTestId(moi, "bia-nut-chinh")).toBe(true);

      const chot = day(k.id, { khoa: true });
      expect(coTestId(chot, "bia-dau-da-chot")).toBe(true);
      expect(chot).toContain("Xem lại bộ ảnh");
    });

    it(`${k.ten}: người thân được mời — khối giải thích + 3 bước, không dải khoảnh khắc`, () => {
      const html = day(k.id, { laNguoiXem: true, khoa: true });
      expect(coTestId(html, "bia-giai-thich-nguoi-xem")).toBe(true);
      expect(coTestId(html, "bia-3-buoc-nguoi-xem")).toBe(true);
      expect(coTestId(html, "bia-loi-chao")).toBe(true);
      expect(coTestId(html, "bia-dai-khoanh-khac")).toBe(false);
      expect(html).toContain("Xem ảnh và thả tim");
    });
  }
});

const DETAIL: ChiTietBia = {
  coverPhotoId: ANH,
  coverHeadline: null,
  welcomeMessage: null,
  coverLayout: null,
  babyNickname: "Bơ",
  babyFullName: "Nguyễn Fixture Bơ",
  branchName: "Chi nhánh Thử",
  shootDate: "2026-09-13",
  sessionType: "Thôi nôi",
  title: "HD_FIXTURE_396",
  status: "ready",
  photoCount: 12,
  includedQuota: 10,
  selectedCount: 0,
};

function trinh(detail: Partial<ChiTietBia> = {}): string {
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  return renderToStaticMarkup(
    <TrinhThietKeBia
      detail={{ ...DETAIL, ...detail }}
      busy={false}
      luoi={[
        { id: "bbbbbbbb-0000-4000-8000-000000000001", fileName: "BB_001.jpg", width: 3000, height: 2000 },
        { id: "bbbbbbbb-0000-4000-8000-000000000002", fileName: "BB_002.jpg", width: 2000, height: 3000 },
      ]}
      dangTaiLuoi={false}
      conTiep={false}
      onTaiThem={() => {}}
      onDong={() => {}}
      onSave={() => {}}
    />,
  );
}

/** Thẻ mở của phần tử mang `data-testid` — để đọc thuộc tính của riêng nó. */
function theMo(html: string, testId: string): string {
  const i = html.indexOf(`data-testid="${testId}"`);
  expect(i, `không thấy data-testid="${testId}"`).toBeGreaterThan(-1);
  const dau = html.lastIndexOf("<", i);
  return html.slice(dau, html.indexOf(">", i) + 1);
}

/** Đi cây phần tử React (không dựng) tìm phần tử có prop khớp. */
function timPhanTu(nut: unknown, khop: (p: Record<string, unknown>) => boolean): Array<Record<string, unknown>> {
  const ket: Array<Record<string, unknown>> = [];
  const di = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(di);
    if (!React.isValidElement(n)) return;
    const p = n.props as Record<string, unknown>;
    if (khop(p)) ket.push(p);
    di(p.children);
  };
  di(nut);
  return ket;
}

describe("BB-396 (b) — trình thiết kế: ô kiểu bìa đứng đầu, mẫu thật, lưu kiểu", () => {
  it("4 ô kiểu bìa nằm TRƯỚC lưới ảnh trong thứ tự DOM", () => {
    const html = trinh();
    const oKieu = html.indexOf('data-testid="chon-kieu-bia"');
    const luoi = html.indexOf('data-testid="luoi-chon-bia"');
    expect(oKieu).toBeGreaterThan(-1);
    expect(luoi).toBeGreaterThan(-1);
    expect(oKieu).toBeLessThan(luoi);
    const nut = [...html.matchAll(/data-kieu="([^"]+)"/g)].map((m) => m[1]);
    expect(nut).toEqual(["ben-canh", "tap-chi", "toi-gian", "de-cheo"]);
    for (const k of KIEU_BIA) expect(html).toContain(`aria-label="Kiểu bìa ${k.ten}"`);
  });

  it("mỗi ô là bìa THẬT của bộ (BiaBoAnh đúng kiểu, đúng ảnh bìa, đúng tên bé) — không phải hình vẽ tay", () => {
    const html = trinh();
    const vung = html.slice(html.indexOf('data-testid="chon-kieu-bia"'), html.indexOf('data-testid="luoi-chon-bia"'));
    for (const k of KIEU_BIA) expect(vung).toContain(`data-kieu-bia="${k.id}"`);
    expect(vung.split(`/api/img/${ANH}?w=1600`).length - 1).toBeGreaterThanOrEqual(4);
    expect(vung).toContain("Bé Bơ");
  });

  it("khung xem trước lớn dựng đúng kiểu đang chọn (khởi tạo từ kiểu đã lưu; null → Bên cạnh)", () => {
    for (const [luu, mongDoi] of [["toi-gian", "toi-gian"], [null, "ben-canh"], ["tap-chi", "tap-chi"]] as const) {
      const html = trinh({ coverLayout: luu });
      expect(theMo(html, "khung-xem-truoc-bia")).toContain(`data-kieu-chon="${mongDoi}"`);
      const sauKhung = html.slice(html.indexOf('data-testid="khung-xem-truoc-bia"'));
      expect(kieuBiaGoc(sauKhung)).toBe(mongDoi);
      expect(html).toMatch(new RegExp(`data-kieu="${mongDoi}" aria-pressed="true"`));
    }
  });

  it("bấm ô kiểu → báo đúng kiểu lên (trình thiết kế đổi khung xem trước theo đó)", () => {
    const onChon = vi.fn();
    const cay = ChonKieuBia({
      kho: "may-tinh",
      kieuDangChon: "ben-canh",
      onChon,
      tenBo: "Bé Bơ",
      daGiao: false,
      biaChung: {
        ...propBiaTuBoAnh({}),
        anhBia: { id: ANH },
        tenBe: "Bé Bơ",
        chiNhanh: "Chi nhánh Thử",
        soAnh: 12,
        hanMuc: 10,
        daChon: 0,
        hanChot: null,
        khoa: false,
        onBatDau: () => {},
      },
    });
    const nutTapChi = timPhanTu(cay, (p) => p["data-kieu"] === "tap-chi");
    expect(nutTapChi).toHaveLength(1);
    (nutTapChi[0]!.onClick as () => void)();
    expect(onChon).toHaveBeenCalledWith("tap-chi");
  });

  it("Lưu: chỉ đổi kiểu cũng bật nút và gửi coverLayout; không đổi kiểu thì không gửi", () => {
    const goc = { coverPhotoId: ANH, coverHeadline: null, welcomeMessage: null, coverLayout: null };
    const chiDoiKieu = thayDoiBia({ anhBia: ANH, tieuDe: "", loi: "", kieuBia: "tap-chi" }, goc);
    expect(chiDoiKieu.doiGi).toBe(true);
    expect(chiDoiKieu.thayDoi.coverLayout).toBe("tap-chi");

    const khongDoi = thayDoiBia({ anhBia: ANH, tieuDe: "", loi: "", kieuBia: "ben-canh" }, goc);
    expect(khongDoi.doiGi).toBe(false);
    expect("coverLayout" in khongDoi.thayDoi).toBe(false);

    const doiAnh = thayDoiBia({ anhBia: "khac", tieuDe: "", loi: "", kieuBia: "toi-gian" }, { ...goc, coverLayout: "toi-gian" });
    expect(doiAnh.doiGi).toBe(true);
    expect("coverLayout" in doiAnh.thayDoi).toBe(false);
  });

  it("bộ đã giao: có ghi chú kiểu bìa chỉ dùng lúc chọn ảnh", () => {
    expect(trinh({ status: "delivered" })).toContain('data-testid="ghi-chu-kieu-bia-da-giao"');
    expect(trinh()).not.toContain('data-testid="ghi-chu-kieu-bia-da-giao"');
  });

  it("khối tóm tắt ở trang chi tiết ghi tên kiểu đang dùng; vai không sửa không có nút mở", () => {
    const html = renderToStaticMarkup(
      <BiaBoAnhEditor galleryId="g" detail={{ ...DETAIL, coverLayout: "de-cheo" }} busy={false} onSave={() => {}} choSua={false} />,
    );
    expect(theMo(html, "kieu-bia-dang-dung")).toBeTruthy();
    expect(html).toContain("Kiểu bìa: Đè chéo");
    expect(html).not.toContain("Đổi bìa");
    expect(html).not.toContain('data-testid="chon-kieu-bia"');
  });
});
