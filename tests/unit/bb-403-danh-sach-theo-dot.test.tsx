/**
 * BB-403 — các đợt chọn ảnh hiện NGAY trên trang như đợt 1, không bắt tải về
 * (anh 08/10/2026). Thuần: không cơ sở dữ liệu, không đọc mã nguồn, không giả lập hook
 * (AGENTS §5a). Giả lập duy nhất là `fetch` và bộ nhớ tạm của trình duyệt — biên giới ra ngoài.
 *
 * Môi trường node (không có jsdom) nên "bấm đợt 2" được thử ở bộ điều khiển mà component
 * gọi y nguyên (`taoBoLayDanhSach`, `chepDanhSach`); phần hiển thị thử bằng `renderToStaticMarkup`.
 * Bấm thật trên trình duyệt: tests/e2e/bb-403-danh-sach-dot.spec.ts (viết, chưa chạy).
 *
 * Kiểm ngược (dán trong bàn giao):
 *   · bỏ `dot=` khỏi `duongDanDanhSach` → ca "bấm đợt 2" đỏ;
 *   · cho `cacChipDot` luôn trả [] → ca "chip từng đợt" đỏ;
 *   · khôi phục hai link `download` trong `DotChonQuanTri` → ca "không còn link tải" đỏ.
 */

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...r}>
      {children}
    </a>
  ),
}));

import { DanhSachAnhChon } from "@/components/features/admin/danh-sach-anh-chon";
import { DotChonQuanTri, type DotQuanTriView } from "@/components/features/admin/dot-chon-admin";
import { NganXuLy } from "@/components/features/admin/khach-gui-anh-chon-report";
import {
  cacChipDot,
  chepDanhSach,
  demTenTep,
  docDotTuHash,
  dotHopLe,
  dotMacDinh,
  duongDanDanhSach,
  duongDanMoDanhSach,
  taoBoLayDanhSach,
  type DotChoDanhSach,
} from "@/lib/gallery/danh-sach-theo-dot";

const GID = "11111111-1111-4111-8111-111111111111";

// Dữ liệu giả (AGENTS §6): tên tệp trung tính.
const anh = (...ten: string[]) => ten.map((t, i) => ({ photoId: `${t}-${i}`, fileName: t }));
const DOT_CHON: DotChoDanhSach[] = [
  { soDot: 1, laDot1: true, trangThai: null, soAnh: 2, anh: anh("IMG_0001.jpg", "IMG_0002.jpg") },
  { soDot: 2, laDot1: false, trangThai: "da_xac_nhan", soAnh: 1, anh: anh("IMG_0101.jpg") },
  { soDot: 3, laDot1: false, trangThai: "cho_xac_nhan", soAnh: 2, anh: anh("IMG_0201.jpg", "IMG_0202.jpg") },
  { soDot: 4, laDot1: false, trangThai: "tu_choi", soAnh: 3, anh: [] },
];

/** Thẻ mở của phần tử có data-testid. */
function the(html: string, testId: string): string {
  const m = new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`).exec(html);
  if (!m) throw new Error(`không thấy data-testid="${testId}"`);
  return m[0];
}

// ---------------------------------------------------------------------------
describe("BB-403: hàng chọn đợt (chip)", () => {
  it("chỉ có chip cho đợt CÓ THẬT: đợt 1 + đợt còn ảnh; đợt bị từ chối (hết ảnh) không có", () => {
    expect(cacChipDot(DOT_CHON).map((c) => c.soDot)).toEqual([1, 2, 3]);
  });

  it("bộ chỉ có đợt 1 thì không có hàng chip (danh sách hiện như trước)", () => {
    expect(cacChipDot([DOT_CHON[0]!])).toEqual([]);
    expect(cacChipDot([DOT_CHON[0]!, DOT_CHON[3]!])).toEqual([]);
    expect(cacChipDot(undefined)).toEqual([]);
  });

  it("mặc định: đợt MỚI NHẤT đang chờ xử lý; không đợt nào chờ thì 'Tất cả'", () => {
    expect(dotMacDinh(cacChipDot(DOT_CHON))).toBe(3);
    const khongCho = DOT_CHON.map((d) => ({ ...d, trangThai: d.laDot1 ? null : "da_xac_nhan" }));
    expect(dotMacDinh(cacChipDot(khongCho))).toBe("tat-ca");
    const haiCho = DOT_CHON.map((d) => (d.soDot === 2 ? { ...d, trangThai: "cho_xac_nhan" } : d));
    expect(dotMacDinh(cacChipDot(haiCho))).toBe(3);
    expect(dotMacDinh([])).toBeNull();
  });

  it("đợt người dùng chọn biến mất sau khi tải lại thì rơi về mặc định, không kẹt ở đợt không còn", () => {
    const chip = cacChipDot(DOT_CHON);
    expect(dotHopLe(2, chip)).toBe(2);
    expect(dotHopLe("tat-ca", chip)).toBe("tat-ca");
    expect(dotHopLe(4, chip)).toBe(3);
    expect(dotHopLe(2, [])).toBeNull();
  });

  it("hiển thị: có chip Đợt 1 · Đợt 2 · Đợt 3 · Tất cả, đợt chờ xử lý đang bật, đợt bị từ chối vắng mặt", () => {
    const html = renderToStaticMarkup(<DanhSachAnhChon galleryId={GID} soAnh={5} dotChon={DOT_CHON} />);
    for (const id of ["chip-dot-1", "chip-dot-2", "chip-dot-3", "chip-dot-tat-ca"]) expect(html).toContain(`data-testid="${id}"`);
    expect(html).not.toContain('data-testid="chip-dot-4"');
    expect(the(html, "chip-dot-3")).toContain('aria-pressed="true"');
    expect(the(html, "chip-dot-2")).toContain('aria-pressed="false"');
    expect(the(html, "chip-dot-tat-ca")).toContain('aria-pressed="false"');
    // đánh dấu ảnh mới của đợt đang xem
    expect(html).toMatch(/Đợt 3 · mua thêm · Chờ xác nhận · 2 ảnh mới/);
  });

  it("bộ chỉ có đợt 1: không chip, vẫn có nút Danh sách / Thông tin chi tiết", () => {
    const html = renderToStaticMarkup(<DanhSachAnhChon galleryId={GID} soAnh={2} dotChon={[DOT_CHON[0]!]} />);
    expect(html).not.toContain('data-testid="chon-dot"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>Danh sách<\/button>/);
  });

  it("có hai nút chép: tên tệp và bản chi tiết", () => {
    const html = renderToStaticMarkup(<DanhSachAnhChon galleryId={GID} soAnh={5} dotChon={DOT_CHON} />);
    expect(html).toMatch(/data-testid="chep-ten-tep"[^>]*>(<svg[^>]*>.*?<\/svg>)?Chép tên tệp<\/button>/);
    expect(html).toMatch(/data-testid="chep-ban-chi-tiet"[^>]*>(<svg[^>]*>.*?<\/svg>)?Chép bản chi tiết<\/button>/);
  });
});

// ---------------------------------------------------------------------------
describe("BB-403: bấm đợt → gọi đúng route xuất và hiện đúng tên tệp", () => {
  const THAN: Record<string, string> = {
    "hien=1": "IMG_0001.jpg\r\nIMG_0002.jpg\r\nIMG_0101.jpg\r\nIMG_0201.jpg\r\nIMG_0202.jpg",
    "hien=1&dot=1": "IMG_0001.jpg\r\nIMG_0002.jpg",
    "hien=1&dot=2": "IMG_0101.jpg",
    "hien=1&dot=3": "IMG_0201.jpg\r\nIMG_0202.jpg",
    "format=chi-tiet&hien=1&dot=2": "Bộ ảnh: Bộ thử\r\nCHỈ ẢNH ĐỢT 2 (không gồm ảnh các đợt khác)\r\nIMG_0101.jpg (Dùng cho: Album 20x20)",
  };
  const goi: string[] = [];
  const fetchGia = vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    goi.push(u);
    const q = u.split("export?")[1] ?? "";
    return q in THAN
      ? new Response(THAN[q], { status: 200 })
      : new Response(JSON.stringify({ error: { message: "Không có" } }), { status: 404 });
  }) as unknown as typeof fetch;

  afterEach(() => {
    goi.length = 0;
  });

  it("đợt 2 → `export?hien=1&dot=2`, ra đúng tên tệp của đợt 2 và KHÔNG lẫn tệp đợt khác", async () => {
    const bo = taoBoLayDanhSach(GID, fetchGia);
    const kq = await bo.lay("ten-file", 2);
    expect(goi).toEqual([`/api/admin/galleries/${GID}/export?hien=1&dot=2`]);
    expect(kq).toEqual({ ok: true, chu: "IMG_0101.jpg" });
  });

  it("Tất cả → không `dot`; Đợt 1 → dot=1; bản chi tiết → format=chi-tiet", async () => {
    const bo = taoBoLayDanhSach(GID, fetchGia);
    await bo.lay("ten-file", null);
    await bo.lay("ten-file", 1);
    const ct = await bo.lay("chi-tiet", 2);
    expect(goi).toEqual([
      `/api/admin/galleries/${GID}/export?hien=1`,
      `/api/admin/galleries/${GID}/export?hien=1&dot=1`,
      `/api/admin/galleries/${GID}/export?format=chi-tiet&hien=1&dot=2`,
    ]);
    expect(ct.ok && ct.chu).toContain("CHỈ ẢNH ĐỢT 2");
    expect(duongDanDanhSach(GID, "ten-file", null)).toBe(`/api/admin/galleries/${GID}/export?hien=1`);
  });

  it("bấm lại đợt đã xem thì không gọi mạng lần nữa; lỗi thì KHÔNG nhớ, bấm lại là thử lại", async () => {
    const bo = taoBoLayDanhSach(GID, fetchGia);
    await bo.lay("ten-file", 3);
    await bo.lay("ten-file", 3);
    expect(goi).toHaveLength(1);
    const hong = await bo.lay("ten-file", 9);
    expect(hong).toEqual({ ok: false, loi: "Không có" });
    await bo.lay("ten-file", 9);
    expect(goi.filter((u) => u.endsWith("dot=9"))).toHaveLength(2);
    bo.xoaDem();
    await bo.lay("ten-file", 3);
    expect(goi.filter((u) => u.endsWith("dot=3"))).toHaveLength(2);
  });

  it("mất mạng → câu báo gọn, không ném lỗi", async () => {
    const bo = taoBoLayDanhSach(GID, (async () => {
      throw new TypeError("network");
    }) as unknown as typeof fetch);
    expect(await bo.lay("ten-file", 2)).toEqual({ ok: false, loi: "Mất kết nối, thử lại giúp." });
  });
});

// ---------------------------------------------------------------------------
describe("BB-403: nút chép", () => {
  const THAN_TEN = "IMG_0201.jpg\r\nIMG_0202.jpg";
  const THAN_CT = "Bộ ảnh: Bộ thử\r\nCHỈ ẢNH ĐỢT 3\r\nIMG_0201.jpg\r\nIMG_0202.jpg (\"làm sáng da\")";
  const fetchGia = vi.fn(async (url: RequestInfo | URL) =>
    new Response(String(url).includes("format=chi-tiet") ? THAN_CT : THAN_TEN, { status: 200 }),
  ) as unknown as typeof fetch;

  function boNhoTam() {
    const da: string[] = [];
    return { da, writeText: async (c: string) => void da.push(c) };
  }

  it("Chép tên tệp: chép đúng nội dung của đợt, báo 'Đã chép 2 tệp'", async () => {
    const nho = boNhoTam();
    const kq = await chepDanhSach(taoBoLayDanhSach(GID, fetchGia), nho, "ten-file", 3, 2);
    expect(nho.da).toEqual([THAN_TEN]);
    expect(kq).toEqual({ ok: true, thongBao: "Đã chép 2 tệp" });
  });

  it("Chép bản chi tiết: chép bản chi tiết (không phải danh sách tên), báo số ảnh của đợt", async () => {
    const nho = boNhoTam();
    const kq = await chepDanhSach(taoBoLayDanhSach(GID, fetchGia), nho, "chi-tiet", 3, 2);
    expect(nho.da).toEqual([THAN_CT]);
    expect(kq).toEqual({ ok: true, thongBao: "Đã chép 2 tệp" });
  });

  it("trình duyệt chặn chép (hoặc không có bộ nhớ tạm) → báo cách làm tay, không nói đã chép", async () => {
    const chan = { writeText: async () => Promise.reject(new Error("denied")) };
    const a = await chepDanhSach(taoBoLayDanhSach(GID, fetchGia), chan, "ten-file", null, 2);
    expect(a).toEqual({ ok: false, loi: "Trình duyệt chặn chép — bôi đen khung chữ rồi Ctrl+C giúp." });
    const b = await chepDanhSach(taoBoLayDanhSach(GID, fetchGia), undefined, "ten-file", null, 2);
    expect(b.ok).toBe(false);
  });

  it("route lỗi → báo lỗi của route, không chép gì", async () => {
    const nho = boNhoTam();
    const hong = (async () => new Response(JSON.stringify({ error: { message: "Chưa lọc được theo đợt" } }), { status: 409 })) as unknown as typeof fetch;
    const kq = await chepDanhSach(taoBoLayDanhSach(GID, hong), nho, "ten-file", 2, 1);
    expect(kq).toEqual({ ok: false, loi: "Chưa lọc được theo đợt" });
    expect(nho.da).toEqual([]);
  });

  it("đếm tên tệp bỏ dòng trống", () => {
    expect(demTenTep("a.jpg\r\nb.jpg\r\n\r\n")).toBe(2);
    expect(demTenTep("")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe("BB-403: lối mở đúng đợt từ chỗ khác", () => {
  it("địa chỉ trang chi tiết kèm đợt đọc ngược ra đúng đợt", () => {
    expect(duongDanMoDanhSach(GID, 2)).toBe(`/admin/galleries/${GID}#xuat-danh-sach-dot-2`);
    expect(docDotTuHash("#xuat-danh-sach-dot-2")).toBe(2);
    expect(docDotTuHash("#xuat-danh-sach-tat-ca")).toBe("tat-ca");
    expect(docDotTuHash("#xuat-danh-sach")).toBeNull();
    expect(docDotTuHash("#thanh-toan")).toBeNull();
    expect(duongDanMoDanhSach(GID, null)).toBe(`/admin/galleries/${GID}#xuat-danh-sach`);
  });
});

// ---------------------------------------------------------------------------
describe("BB-403: không còn link TẢI cho đợt", () => {
  const dot = (soDot: number, o: Partial<DotQuanTriView> = {}): DotQuanTriView => ({
    soDot,
    laDot1: soDot === 1,
    trangThai: soDot === 1 ? null : "cho_xac_nhan",
    soAnh: 1,
    soAnhTinhTien: 1,
    giaMoiAnh: 30000,
    tienAnh: 30000,
    tienSanPham: 0,
    tong: 30000,
    lyDoTuChoi: null,
    lyDoMoLai: null,
    submittedAt: null,
    submittedByName: null,
    confirmedAt: null,
    xuLyAt: null,
    anh: anh(`IMG_${soDot}.jpg`),
    sanPham: [],
    ...o,
  });

  it("thẻ 'Đợt chọn': không `download`, không địa chỉ /export; có nút 'Xem danh sách đợt N' cho mỗi đợt có ảnh", () => {
    const html = renderToStaticMarkup(
      <DotChonQuanTri galleryId={GID} dotChon={[dot(1), dot(2)]} canConfirm onDone={() => {}} />,
    );
    expect(html).not.toMatch(/\sdownload[\s=>]/);
    expect(html).not.toContain("/export");
    expect(html).not.toMatch(/Tải danh sách|Chi tiết chỉ đợt/);
    expect(html).toContain('data-testid="xem-danh-sach-dot-1"');
    expect(html).toContain("Xem danh sách đợt 2");
  });

  it("ngăn xử lý ở 'Việc cần xử lý': không `download`; lối xem dẫn tới trang bộ ảnh đúng đợt", () => {
    const html = renderToStaticMarkup(
      <NganXuLy
        dong={{
          galleryId: GID,
          galleryTitle: "Bộ thử",
          branchName: null,
          customerName: null,
          guiLuc: null,
          dot1ChoXacNhan: true,
          dotMuaThem: [{ soDot: 2, soAnh: 1, tong: 30000, soSanPhamInChuaAnh: 0, submittedAt: null, sanPham: [] }],
          nhoStudioChonThem: 0,
          soSanPhamInChuaAnh: 0,
        }}
        canConfirm
        onDone={async () => {}}
      />,
    );
    expect(html).not.toMatch(/\sdownload[\s=>]/);
    expect(html).not.toContain("/api/admin/galleries/");
    expect(the(html, "xem-danh-sach-anh-chon")).toContain(`href="/admin/galleries/${GID}#xuat-danh-sach"`);
    expect(the(html, "xem-danh-sach-dot-2")).toContain(`href="/admin/galleries/${GID}#xuat-danh-sach-dot-2"`);
  });
});
