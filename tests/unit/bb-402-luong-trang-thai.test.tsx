/**
 * BB-402 — luồng trạng thái bộ ảnh: quản trị và màn khách nói CÙNG một giai đoạn, và
 * nút chính của ba mẹ đúng giai đoạn.
 *
 * Lỗi anh báo 08/10/2026 (bộ HD_20260924#5261, dữ liệu dưới đây là GIẢ — chỉ mô phỏng
 * hình dạng): `status = approved`, `lark_trang_thai = NULL`. Quản trị ghi "Khách đã
 * duyệt, ảnh đang đi in" mà màn khách lùi về "Bean đã nhận danh sách, ảnh đang chờ
 * chỉnh" (bước "Chờ chỉnh"), và nút chính vẫn "Yêu cầu sửa lại".
 *
 * Phép thử THUẦN: hàm suy trạng thái, hàm nút chính, và component thật dựng bằng
 * `renderToStaticMarkup` (không giả lập hook). Cơ sở dữ liệu là biên ngoài → client
 * Supabase giả tối thiểu (không chạm bb-dev). Không gọi Lark.
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

import { nhanHienThi } from "@/lib/lark/trang-thai-hau-ky";
import { tienDoHaiMan, trangThaiKhach, trangThaiBoAnh } from "@/lib/lark/trang-thai-app-lark";
import { buocHanhTrinh, tranhHanhTrinh, BUOC_HANH_TRINH } from "@/components/features/gallery/hanh-trinh";
import { coLoiNhanBean, loaiNutChinh, NHAN_NUT_CHINH, type DauVaoNutChinh } from "@/lib/gallery/nut-chinh-khach";
import { DotChonTrenManChinh, type TrangThaiDotKhach } from "@/components/features/gallery/chon-them-anh";
import { thanhDayBuocDuyet } from "@/lib/anh-chinh-sua/vong-duyet";
import { soDotMuaThemChoDuyet } from "@/lib/anh-chinh-sua/theo-dot";
import { mocCanBaoKhach } from "@/lib/thong-bao/moc-khach";
import { ThanhChon } from "@/components/features/gallery/thanh-chon";
import { TheHanhTrinh } from "@/components/features/gallery/the-hanh-trinh";
import { layHoacTaoLuotChon, ghiMocKhachMoBoAnh } from "@/lib/selection/luot-chon-theo-link";
import type { SupabaseClient } from "@supabase/supabase-js";

const GD2 = "optl5DyKLx"; // Đã chọn hình
const GD3 = "optmhzW4sL"; // Đang làm
const GD5 = "optjJ9MNLL"; // Đã gửi duyệt
const GD6 = "optjhQwMrT"; // Sửa
const GD8 = "optxMAdtNX"; // Đã gửi in
const GD10 = "opttHXFpgy"; // Đã giao

const nhanApp = (s: string) => `APP:${s}`;

/** Bộ của anh (giả): đã duyệt trong app, Lark chưa ai đổi. */
const BO_DA_DUYET = { status: "approved", lark_trang_thai: null, lark_trang_thai_tu: null, reopened_at: null };

describe("BB-402 · bộ đã duyệt (approved, Lark NULL) — hai màn cùng một giai đoạn", () => {
  it("giai đoạn gửi màn khách là 7 (Đã chốt chưa in), KHÔNG ép về 2 (Đã chọn hình)", () => {
    const n = nhanHienThi("approved", null, nhanApp);
    expect(n.giaiDoan).toBe(7);
    expect(n.quanTri).toBe("Đã chốt, chờ in");
  });

  it("quản trị và khách: cùng hàm `tienDoHaiMan` → chờ in / bước In & giao", () => {
    const t = tienDoHaiMan(BO_DA_DUYET);
    expect(t.quanTri).toBe("Đã chốt, chờ in");
    expect(t.khach.ma).toBe("da_chot_cho_in");
    expect(t.khach.khach).toBe("Ảnh đã chốt, Bean đang chuẩn bị in ạ");
    expect(t.buocKhach).toBe("In & giao");
    // Thẻ hành trình của khách đọc CÙNG giai đoạn máy chủ gửi.
    const { buoc, hienTai } = buocHanhTrinh("approved", t.giaiDoan);
    expect(buoc[hienTai]).toBe("In/nhận ảnh");
    expect(tranhHanhTrinh("approved", t.giaiDoan)).toBe("tien-do-in");
  });

  it("Lark CHẬM hơn app (approved mà Lark còn 'Đã gửi duyệt' / 'Sửa') → không lùi nhãn", () => {
    for (const ma of [GD2, GD3, GD5, GD6]) {
      expect(nhanHienThi("approved", ma, nhanApp).giaiDoan).toBe(7);
      expect(trangThaiBoAnh({ status: "approved", larkTrangThai: ma, coDriveLink: true, coLinkApp: true }).ma).toBe(
        "da_chot_cho_in",
      );
    }
    expect(trangThaiKhach("approved", 5).ma).toBe("da_chot_cho_in");
  });

  it("Lark ĐI TRƯỚC (Đã gửi in) thì theo Lark: Đang in", () => {
    const t = tienDoHaiMan({ ...BO_DA_DUYET, lark_trang_thai: GD8 });
    expect(t.quanTri).toBe("Đã gửi in");
    expect(t.khach.ma).toBe("dang_in");
    expect(tienDoHaiMan({ ...BO_DA_DUYET, lark_trang_thai: GD10 }).khach.ma).toBe("da_giao");
  });

  it("in_retouch vẫn xếp hàng ở giai đoạn 2 khi chưa có Lark (luật BB-329 giữ nguyên)", () => {
    expect(nhanHienThi("in_retouch", null, nhanApp).giaiDoan).toBe(2);
    expect(buocHanhTrinh("in_retouch", 2).buoc[buocHanhTrinh("in_retouch", 2).hienTai]).toBe("Chờ chỉnh");
  });
});

// ---------------------------------------------------------------------------
// Bảng: mỗi trạng thái → bước tiến trình + nút chính
// ---------------------------------------------------------------------------

type Ca = {
  ten: string;
  vao: DauVaoNutChinh;
  buoc: (typeof BUOC_HANH_TRINH)[number] | null;
  nut: ReturnType<typeof loaiNutChinh>;
};

const CA: Ca[] = [
  { ten: "đang chọn (ready)", vao: { status: "ready", giaiDoan: null, khoa: false, daChotChoXacNhan: false }, buoc: null, nut: "chot" },
  {
    ten: "vừa chốt, chờ xác nhận",
    vao: { status: "submitted", giaiDoan: null, khoa: true, daChotChoXacNhan: true },
    buoc: "Chờ xác nhận",
    nut: "sua_danh_sach",
  },
  {
    ten: "CSKH đã xác nhận, xếp hàng chỉnh",
    vao: { status: "in_retouch", giaiDoan: 2, khoa: true, daChotChoXacNhan: false },
    buoc: "Chờ chỉnh",
    nut: "chon_them",
  },
  {
    ten: "đang chỉnh (Lark Đang làm)",
    vao: { status: "in_retouch", giaiDoan: 3, khoa: true, daChotChoXacNhan: false },
    buoc: "Đang chỉnh",
    nut: "chon_them",
  },
  {
    ten: "chờ ba mẹ duyệt ảnh chỉnh",
    vao: { status: "awaiting_approval", giaiDoan: null, khoa: true, daChotChoXacNhan: false },
    buoc: "Duyệt ảnh",
    nut: "duyet",
  },
  {
    ten: "ĐÃ DUYỆT (lỗi anh báo)",
    vao: { status: "approved", giaiDoan: 7, khoa: true, daChotChoXacNhan: false },
    buoc: "In/nhận ảnh",
    nut: "chon_them",
  },
  {
    ten: "đã duyệt, Lark Đã gửi in",
    vao: { status: "approved", giaiDoan: 8, khoa: true, daChotChoXacNhan: false },
    buoc: "In/nhận ảnh",
    nut: "chon_them",
  },
  {
    ten: "đã duyệt mà một ĐỢT MUA THÊM đang chờ duyệt",
    vao: { status: "approved", giaiDoan: 7, khoa: true, daChotChoXacNhan: false, soDotMuaThemChoDuyet: 1 },
    buoc: "In/nhận ảnh",
    nut: "duyet",
  },
  {
    ten: "đã giao",
    vao: { status: "delivered", giaiDoan: null, khoa: true, daChotChoXacNhan: false },
    buoc: "In/nhận ảnh",
    nut: "chon_them",
  },
  {
    ten: "app còn in_retouch nhưng Lark đã Đã giao",
    vao: { status: "in_retouch", giaiDoan: 10, khoa: true, daChotChoXacNhan: false },
    buoc: "In/nhận ảnh",
    nut: "chon_them",
  },
];

describe("BB-402 · mỗi trạng thái → bước tiến trình + nút chính", () => {
  for (const c of CA) {
    it(c.ten, () => {
      expect(loaiNutChinh(c.vao)).toBe(c.nut);
      if (c.buoc) {
        const { buoc, hienTai } = buocHanhTrinh(c.vao.status, c.vao.giaiDoan);
        expect(buoc[hienTai]).toBe(c.buoc);
      }
    });
  }

  it("approved / delivered / in_retouch KHÔNG BAO GIỜ ra 'Yêu cầu sửa lại'", () => {
    for (const status of ["in_retouch", "approved", "delivered"]) {
      for (const giaiDoan of [null, 2, 3, 4, 6, 7, 8, 9, 10, 11]) {
        expect(loaiNutChinh({ status, giaiDoan, khoa: true, daChotChoXacNhan: false })).not.toBe("xin_sua_lai");
      }
    }
  });

  it("vòng 2 — lối phụ 'Nhắn Bean' chỉ khi chưa duyệt xong (đang xếp hàng / đang chỉnh)", () => {
    const v = (status: string, giaiDoan: number | null) => ({ status, giaiDoan, khoa: true, daChotChoXacNhan: false });
    expect(coLoiNhanBean(v("in_retouch", 2))).toBe(true);
    expect(coLoiNhanBean(v("in_retouch", 3))).toBe(true);
    expect(coLoiNhanBean(v("approved", 7))).toBe(false);
    expect(coLoiNhanBean(v("delivered", null))).toBe(false);
    // Khoá vì hết hạn (chưa tới bước xác nhận): vẫn là đường xin mở lại, không "Chọn thêm".
    expect(loaiNutChinh(v("expired", null))).toBe("xin_sua_lai");
  });
});

describe("BB-402 · đợt mua thêm chờ duyệt", () => {
  it("đếm đúng đợt đã gửi duyệt, chưa duyệt, không có vòng sửa mở", () => {
    const moc = new Map([
      ["dot:2", { guiLuc: "2026-10-08T01:00:00Z", duyetLuc: null }], // chờ duyệt
      ["dot:3", { guiLuc: "2026-10-08T01:00:00Z", duyetLuc: "2026-10-08T02:00:00Z" }], // đã duyệt
      ["dot:4", { guiLuc: "2026-10-08T01:00:00Z", duyetLuc: null }], // đang sửa
      ["dot:5", { guiLuc: null, duyetLuc: null }], // chưa gửi
      ["goc", { guiLuc: "2026-10-08T01:00:00Z", duyetLuc: null }], // không phải đợt mua thêm
    ]);
    const vong = [{ resolved_at: null, dot_khoa: "dot:4" }];
    expect(soDotMuaThemChoDuyet(moc, vong)).toBe(1);
    expect(soDotMuaThemChoDuyet(null, vong)).toBe(0);
  });

  it("thanh đáy là thanh DUYỆT khi bộ đã duyệt mà đợt mua thêm còn chờ", () => {
    expect(thanhDayBuocDuyet({ status: "approved", soAnhChinhTrongApp: 4, soDotMuaThemChoDuyet: 1 })?.nut).toBe(
      "Xem & duyệt ảnh chỉnh",
    );
    expect(thanhDayBuocDuyet({ status: "approved", soAnhChinhTrongApp: 4, soDotMuaThemChoDuyet: 0 })).toBeNull();
  });
});

describe("BB-402 · thông báo chuông theo Lark không báo lùi sau khi đã duyệt", () => {
  it("approved: Lark 2 → 3 không báo 'Bean đang chỉnh ảnh'", () => {
    expect(mocCanBaoKhach({ maCu: GD2, maMoi: GD3, trangThaiApp: "approved" })).toBeNull();
    expect(mocCanBaoKhach({ maCu: GD2, maMoi: GD3, trangThaiApp: "in_retouch" })).toBe("dang_chinh_sua");
  });
});

// ---------------------------------------------------------------------------
// Component thật (renderToStaticMarkup — hook chạy thật, không giả lập)
// ---------------------------------------------------------------------------

/** Nút chính như `gallery-app.tsx` dựng từ `loaiNutChinh` (nhánh khoá). */
function nutTuLoai(v: DauVaoNutChinh) {
  const loai = loaiNutChinh(v);
  if (loai === "chon_them") return { nhan: NHAN_NUT_CHINH.chon_them, onClick: () => {} };
  if (loai === "sua_danh_sach") return { nhan: NHAN_NUT_CHINH.sua_danh_sach, onClick: () => {} };
  if (loai === "xin_sua_lai") return { nhan: NHAN_NUT_CHINH.xin_sua_lai, onClick: () => {} };
  return null;
}

describe("BB-402 · màn khách dựng thật", () => {
  it("thanh đáy của bộ đã duyệt: 'Chọn thêm ảnh', không 'Yêu cầu sửa'", () => {
    const html = renderToStaticMarkup(
      <ThanhChon
        daChon={16}
        hanMuc={16}
        soTamThem={0}
        tienThem={0}
        nutChinh={nutTuLoai({ status: "approved", giaiDoan: 7, khoa: true, daChotChoXacNhan: false })}
        muaThem={null}
      />,
    );
    expect(html).toContain("Chọn thêm ảnh");
    expect(html).not.toContain("Yêu cầu sửa");
  });

  it("vòng 2 — bộ ĐANG CHỈNH: nút 'Chọn thêm ảnh' + lối phụ 'Nhắn Bean', không 'Yêu cầu sửa'", () => {
    const v = { status: "in_retouch", giaiDoan: 3, khoa: true, daChotChoXacNhan: false };
    const html = renderToStaticMarkup(
      <ThanhChon
        daChon={16}
        hanMuc={16}
        soTamThem={0}
        tienThem={0}
        nutChinh={nutTuLoai(v)}
        muaThem={null}
        loiPhu={coLoiNhanBean(v) ? { nhan: NHAN_NUT_CHINH.nhan_bean, href: "https://fixture.test/chat" } : null}
      />,
    );
    expect(html).toContain("Chọn thêm ảnh");
    expect(html).toContain('data-testid="loi-phu-thanh-day"');
    expect(html).toContain("Nhắn Bean");
    expect(html).not.toContain("Yêu cầu sửa");
  });

  it("vòng 3 — thanh đáy đã có 'Chọn thêm ảnh': thẻ đợt GIỮ lối vào + giá, nút hạ xuống kiểu phụ", () => {
    const tt: TrangThaiDotKhach = {
      cheDoChonThem: true,
      coTheChot: true,
      giaMoiAnh: 50000,
      hanMuc: 16,
      daChonTruoc: 16,
      cacDot: [],
      dotTheoAnh: {},
      banNhap: null,
    };
    const props = { tt, tenBe: "Mít", soAnhNhap: 0, soMonNhap: 0, onMo: () => {} };
    expect(renderToStaticMarkup(<DotChonTrenManChinh {...props} />)).toContain('data-kieu-nut="chinh"');
    // Chưa có đợt nào: thẻ vẫn hiện (e2e bb-321/bb-400 vào đợt 2 từ thẻ này), đủ câu giá.
    const phu = renderToStaticMarkup(<DotChonTrenManChinh {...props} nutPhu />);
    expect(phu).toContain('data-testid="chon-them-anh"');
    expect(phu).toContain("không cần xin mở lại");
    expect(phu).toContain("Chọn thêm ảnh</button>");
    expect(phu).toContain('data-kieu-nut="phu"');
    expect(phu).not.toContain('data-kieu-nut="chinh"');
    // Có nháp: vẫn "Tiếp tục đợt N".
    expect(renderToStaticMarkup(<DotChonTrenManChinh {...props} soAnhNhap={1} nutPhu />)).toContain("Tiếp tục đợt 2");
  });

  it("thẻ tiến trình của bộ đã duyệt: bước hiện tại là 'In/nhận ảnh', tiêu đề 'Bean đang chuẩn bị in'", () => {
    const gd = tienDoHaiMan(BO_DA_DUYET).giaiDoan;
    const html = renderToStaticMarkup(<TheHanhTrinh status="approved" giaiDoan={gd} photoCount={120} />);
    const hienTai = /aria-current="step"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/.exec(html)?.[1] ?? "";
    expect(hienTai.replace(/\s+/g, " ").trim()).toBe("In/nhận ảnh");
    expect(html).toContain("Ảnh đã chốt, Bean đang chuẩn bị in ạ");
    expect(html).not.toContain("đang chờ chỉnh");
  });
});

// ---------------------------------------------------------------------------
// Mốc sent_at / first_viewed_at khi khách mở bộ lần đầu (link gia đình)
// ---------------------------------------------------------------------------

/** Client Supabase giả: select trả lần lượt `docRa`; insert thành công; ghi lại mọi update. */
function clientGia(docRa: Array<{ id: string } | null>) {
  let lan = 0;
  const capNhat: Array<{ bang: string; giaTri: Record<string, unknown>; dieuKien: string[] }> = [];
  const truyVan = (bang: string) => {
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.maybeSingle = async () => ({ data: docRa[lan++] ?? null, error: null });
    q.insert = () => ({ select: () => ({ single: async () => ({ data: { id: "luot-moi" }, error: null }) }) });
    q.update = (giaTri: Record<string, unknown>) => {
      const dong = { bang, giaTri, dieuKien: [] as string[] };
      capNhat.push(dong);
      const u: Record<string, unknown> = {};
      u.eq = (cot: string, v: unknown) => (dong.dieuKien.push(`${cot}=${String(v)}`), u);
      u.is = (cot: string, v: unknown) => (dong.dieuKien.push(`${cot} is ${String(v)}`), Promise.resolve({ error: null }));
      return u;
    };
    return q;
  };
  return { admin: { from: (b: string) => truyVan(b) } as unknown as SupabaseClient, capNhat };
}

describe("BB-402 · khách mở bộ lần đầu thì đặt mốc (chỉ khi đang trống)", () => {
  it("link gia đình mở bộ mới: tạo lượt chọn → ghi first_viewed_at + sent_at có điều kiện IS NULL", async () => {
    const { admin, capNhat } = clientGia([null, null, null]);
    await expect(
      layHoacTaoLuotChon(admin, { shareLinkId: "l", galleryId: "g-1", laKhachChinh: true, laLinkGiaDinh: true }),
    ).resolves.toBe("luot-moi");
    const ghiBo = capNhat.filter((c) => c.bang === "galleries");
    expect(ghiBo.map((c) => Object.keys(c.giaTri)[0]).sort()).toEqual(["first_viewed_at", "sent_at"]);
    for (const c of ghiBo) {
      expect(c.dieuKien).toContain("id=g-1");
      expect(c.dieuKien).toContain(`${Object.keys(c.giaTri)[0]} is null`);
      // Không đặt hạn chốt: hạn tự huỷ bộ ảnh là việc của CSKH.
      expect("due_at" in c.giaTri).toBe(false);
    }
  });

  it("lượt chọn ĐÃ CÓ (mở lần sau) → không ghi gì", async () => {
    const { admin, capNhat } = clientGia([{ id: "luot-cu" }]);
    await layHoacTaoLuotChon(admin, { shareLinkId: "l", galleryId: "g-1", laKhachChinh: true, laLinkGiaDinh: true });
    expect(capNhat).toHaveLength(0);
  });

  it("ghi hụt không bao giờ ném (không chặn ba mẹ mở ảnh)", async () => {
    const hong = { from: () => ({ update: () => { throw new Error("mất mạng"); } }) } as unknown as SupabaseClient;
    const loi = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(ghiMocKhachMoBoAnh(hong, "g-1")).resolves.toBeUndefined();
    loi.mockRestore();
  });
});
