/**
 * BB-321 — "đợt chọn": mua thêm ảnh theo từng đợt + nút "Mở lại" luôn chạy được.
 *
 * Toàn bộ là luật THUẦN (không đụng cơ sở dữ liệu, không giả lập hook React) —
 * đúng các hàm mà route, banner quản trị và màn khách cùng gọi. Phép thử đọc
 * KẾT QUẢ của hàm, không đọc mã nguồn (AGENTS §5a).
 *
 * Bốn mảng, mỗi mảng có ít nhất một ca "đảo ngược": nếu bản vá hoàn nguyên thì
 * ca đó đỏ.
 *   1. Khoá theo đợt      — `anhDangKhoa`, `phanLoaiAnhChonThem`
 *   2. Tiền của một đợt   — `tinhTienDot`, `soDotKeTiep`
 *   3. Trạng thái mở lại  — `luaChonMoLai`, `laTrangThaiMoLaiDuoc`
 *   4. Thẻ Lark của đợt   — sống sót qua `locBoAnh()` (bẫy chữ "anh" trong tên khoá)
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  anhDangKhoa,
  dangCheDoChonThem,
  dotDangKhoa,
  dotDaTraLai,
  giaiThichKhongMoLaiDuoc,
  laTrangThaiMoLaiDuoc,
  luaChonMoLai,
  nhanKhoaAnh,
  nhanTrangThaiDotChoKhach,
  phanLoaiAnhChonThem,
  soDotKeTiep,
  tinhTienDot,
  demSanPhamInChuaAnh,
  kiemTraNhoStudioChon,
  kiemTraSanPhamInChuaAnh,
  CAU_DONG_Y_STUDIO_CHON,
  CAU_BIET_ANH_IN_CHAM,
  CANH_BAO_MO_LAI_HAU_KY,
  type DotTomTat,
} from "@/lib/gallery/dot-chon";
import { dungThe, locBoAnh } from "@/lib/lark/notify";
import { demSoCanXuLy, dongCanXuLy } from "@/lib/utils/can-xu-ly";
import { dichHoatDong, suyNguoi } from "@/lib/nhat-ky/dich-hoat-dong";

// ---------------------------------------------------------------------------
// 1. Khoá theo đợt
// ---------------------------------------------------------------------------

describe("BB-321 (1): khoá ảnh theo từng đợt", () => {
  it("ảnh đợt 2 trở đi KHOÁ ở mọi trạng thái bộ ảnh (dòng chỉ tồn tại khi đợt đang chờ/đã xác nhận)", () => {
    for (const st of ["in_retouch", "awaiting_approval", "approved", "delivered", "in_review", "submitted"]) {
      expect(anhDangKhoa(2, st), `đợt 2 ở ${st}`).toBe(true);
      expect(anhDangKhoa(5, st), `đợt 5 ở ${st}`).toBe(true);
    }
  });

  it("ảnh đợt 1 khoá từ lúc CSKH xác nhận (in_retouch…), KHÔNG khoá lúc mới chốt (submitted) — migration 0060", () => {
    expect(anhDangKhoa(1, "in_retouch")).toBe(true);
    expect(anhDangKhoa(1, "delivered")).toBe(true);
    expect(anhDangKhoa(1, "submitted")).toBe(false);
    expect(anhDangKhoa(1, "in_review")).toBe(false);
  });

  it("chế độ 'Chọn thêm ảnh' bắt đầu SAU khi CSKH xác nhận đợt 1, không sớm hơn", () => {
    expect(dangCheDoChonThem("in_retouch")).toBe(true);
    expect(dangCheDoChonThem("awaiting_approval")).toBe(true);
    expect(dangCheDoChonThem("approved")).toBe(true);
    expect(dangCheDoChonThem("delivered")).toBe(true);
    // đợt 1 còn sửa thẳng được: KHÔNG được ép khách sang đợt 2 sớm
    expect(dangCheDoChonThem("submitted")).toBe(false);
    expect(dangCheDoChonThem("in_review")).toBe(false);
    expect(dangCheDoChonThem("expired")).toBe(false);
    expect(dangCheDoChonThem("archived")).toBe(false);
  });

  it("theo Lark: 'Đã chọn hình' trở đi thì coi như đợt 1 đã khoá và mở chọn thêm, dù app còn ready/in_review/submitted", () => {
    const DA_CHON_HINH = "optl5DyKLx"; // giai đoạn 2 của Lark
    for (const st of ["ready", "in_review", "submitted"]) {
      expect(dangCheDoChonThem(st, DA_CHON_HINH), st).toBe(true);
      expect(dangCheDoChonThem(st), st).toBe(false); // không có mã Lark thì như cũ
      expect(dangCheDoChonThem(st, null), st).toBe(false);
    }
    // Lark chưa tới "Đã chọn hình" (mã lạ/rỗng) thì KHÔNG mở
    expect(dangCheDoChonThem("in_review", "ma_khong_co")).toBe(false);
    // Lark KHÔNG mở được các trạng thái không liên quan (hết hạn, nháp, lưu trữ)
    for (const st of ["expired", "draft", "archived", "syncing"]) expect(dangCheDoChonThem(st, DA_CHON_HINH), st).toBe(false);
    // Đợt 1 ở trạng thái Lark-khoá cũng bị coi là khoá (cùng hàm với khoaChonTheoLark)
    expect(anhDangKhoa(1, "in_review", DA_CHON_HINH)).toBe(true);
    expect(anhDangKhoa(1, "in_review", null)).toBe(false);
  });

  it("chỉ đợt đang chờ/đã xác nhận giữ ảnh khoá; đợt bị từ chối/mở lại thì ảnh về tay khách", () => {
    expect(dotDangKhoa("cho_xac_nhan")).toBe(true);
    expect(dotDangKhoa("da_xac_nhan")).toBe(true);
    expect(dotDangKhoa("tu_choi")).toBe(false);
    expect(dotDangKhoa("da_mo_lai")).toBe(false);
    expect(dotDaTraLai("tu_choi")).toBe(true);
    expect(dotDaTraLai("da_mo_lai")).toBe(true);
    expect(dotDaTraLai("da_xac_nhan")).toBe(false);
  });

  it("phanLoaiAnhChonThem: ảnh đã nằm trong đợt nào cũng bị từ chối, kèm ĐÚNG số đợt; ảnh mới được nhận", () => {
    const daCo = new Map<string, number>([
      ["a1", 1],
      ["a2", 1],
      ["b1", 2],
    ]);
    const kq = phanLoaiAnhChonThem(["a1", "b1", "moi1", "moi2"], daCo);
    expect(kq.hopLe).toEqual(["moi1", "moi2"]);
    expect(kq.biKhoa).toEqual([
      { photoId: "a1", dot: 1 },
      { photoId: "b1", dot: 2 },
    ]);
  });

  it("phanLoaiAnhChonThem: bỏ trùng, và danh sách rỗng không nổ", () => {
    const daCo = new Map<string, number>([["a1", 1]]);
    expect(phanLoaiAnhChonThem(["x", "x", "x"], daCo).hopLe).toEqual(["x"]);
    expect(phanLoaiAnhChonThem(["a1", "a1"], daCo).biKhoa).toEqual([{ photoId: "a1", dot: 1 }]);
    expect(phanLoaiAnhChonThem([], daCo)).toEqual({ hopLe: [], biKhoa: [] });
  });

  it("nhãn khoá đúng câu chủ studio đặt", () => {
    expect(nhanKhoaAnh(1)).toBe("Đã chốt đợt 1");
    expect(nhanKhoaAnh(3)).toBe("Đã chốt đợt 3");
  });
});

// ---------------------------------------------------------------------------
// 2. Tiền và số đợt
// ---------------------------------------------------------------------------

describe("BB-321 (2): tiền của một đợt và số đợt kế tiếp", () => {
  it("đợt 2 trở đi tính tiền TỪ ẢNH ĐẦU TIÊN: 4 ảnh mới → 4 ảnh tính tiền", () => {
    const t = tinhTienDot({ soAnhMoi: 4, giaMoiAnh: 30000, tienSanPham: 0 });
    expect(t.soAnhTinhTien).toBe(4);
    expect(t.tienAnh).toBe(120000);
    expect(t.tong).toBe(120000);
  });

  it("phần gói còn trống ở đợt 1 KHÔNG được dùng ở đợt 2: chọn 12/15 ở đợt 1 rồi thêm 5 ảnh → cả 5 ảnh tính tiền", () => {
    // Bản đầu tính theo lát và trả 2 ảnh (3 ảnh đầu 'nằm trong gói'); chủ studio đã đổi.
    const t = tinhTienDot({ soAnhMoi: 5, daChonTruoc: 12, hanMuc: 15, giaMoiAnh: 30000, tienSanPham: 0 });
    expect(t.soAnhTinhTien).toBe(5);
    expect(t.tienAnh).toBe(150000);
  });

  it("tham số cũ daChonTruoc/hanMuc không còn ảnh hưởng tiền (đợt 3 cũng từ ảnh đầu tiên)", () => {
    const a = tinhTienDot({ soAnhMoi: 3, daChonTruoc: 19, hanMuc: 15, giaMoiAnh: 30000, tienSanPham: 0 });
    const b = tinhTienDot({ soAnhMoi: 3, giaMoiAnh: 30000, tienSanPham: 0 });
    expect(a).toEqual(b);
    expect(a.soAnhTinhTien).toBe(3);
  });

  it("tiền sản phẩm cộng vào tổng; đợt chỉ mua sản phẩm (0 ảnh) vẫn hợp lệ", () => {
    const t = tinhTienDot({ soAnhMoi: 0, giaMoiAnh: 30000, tienSanPham: 450000 });
    expect(t.tienAnh).toBe(0);
    expect(t.tienSanPham).toBe(450000);
    expect(t.tong).toBe(450000);
  });

  it("số âm không làm tiền âm", () => {
    const t = tinhTienDot({ soAnhMoi: -3, giaMoiAnh: -10, tienSanPham: -100 });
    expect(t.tong).toBe(0);
  });

  it("soDotKeTiep: chưa có đợt nào → đợt 2 (đợt 1 là lượt chọn gốc)", () => {
    expect(soDotKeTiep([])).toBe(2);
  });

  it("soDotKeTiep: đếm CẢ đợt bị từ chối — số đợt không dùng lại", () => {
    expect(soDotKeTiep([{ soDot: 2 }, { soDot: 3 }])).toBe(4);
    expect(soDotKeTiep([{ soDot: 2 }])).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 3. Nút "Mở lại"
// ---------------------------------------------------------------------------

describe("BB-321 (3): trạng thái mở lại được — một nguồn cho route lẫn banner", () => {
  const dot = (soDot: number, trangThai: DotTomTat["trangThai"]): DotTomTat => ({ soDot, trangThai });

  it("mở lại được ở submitted, expired VÀ in_retouch (lỗi chủ studio báo 29/09: in_retouch thiếu nút)", () => {
    for (const st of ["submitted", "expired", "in_retouch"]) {
      expect(laTrangThaiMoLaiDuoc(st), st).toBe(true);
      expect(luaChonMoLai(st, []).duoc, st).toBe(true);
    }
  });

  it("KHÔNG mở lại ở delivered/approved/awaiting_approval/in_review/ready/archived — và LUÔN có câu giải thích, không nút chết", () => {
    for (const st of ["delivered", "approved", "awaiting_approval", "in_review", "ready", "archived", "draft"]) {
      const lua = luaChonMoLai(st, []);
      expect(lua.duoc, st).toBe(false);
      expect(lua.lyDoKhong, st).toBeTruthy();
      expect(lua.cacDot).toEqual([]);
    }
  });

  it("delivered: câu giải thích nói rõ khách muốn thêm thì chọn thêm ở đợt mới", () => {
    const cau = giaiThichKhongMoLaiDuoc("delivered");
    expect(cau).toContain("đã giao");
    expect(cau).toContain("đợt mới");
  });

  it("in_retouch có cảnh báo hậu kỳ; submitted/expired thì không", () => {
    expect(luaChonMoLai("in_retouch", []).canhBao).toBe(CANH_BAO_MO_LAI_HAU_KY);
    expect(CANH_BAO_MO_LAI_HAU_KY).toBe(
      "Hậu kỳ có thể đã bắt đầu chỉnh — mở lại để khách đổi ảnh đợt đã chốt",
    );
    expect(luaChonMoLai("submitted", []).canhBao).toBeNull();
    expect(luaChonMoLai("expired", []).canhBao).toBeNull();
  });

  it("mặc định = đợt khoá GẦN NHẤT; danh sách chọn có đợt 1 + mọi đợt đang khoá", () => {
    const lua = luaChonMoLai("in_retouch", [dot(2, "da_xac_nhan"), dot(3, "da_xac_nhan")]);
    expect(lua.dotMacDinh).toBe(3);
    expect(lua.cacDot.map((d) => d.soDot)).toEqual([1, 2, 3]);
  });

  it("chưa có đợt mua thêm nào → mặc định đợt 1, danh sách chỉ có đợt 1", () => {
    const lua = luaChonMoLai("in_retouch", []);
    expect(lua.dotMacDinh).toBe(1);
    expect(lua.cacDot.map((d) => d.soDot)).toEqual([1]);
  });

  it("đợt đã bị từ chối/mở lại KHÔNG nằm trong danh sách (ảnh đã ở tay khách rồi); đợt chờ xác nhận thì có", () => {
    const lua = luaChonMoLai("in_retouch", [
      dot(2, "tu_choi"),
      dot(3, "cho_xac_nhan"),
      dot(4, "da_mo_lai"),
      dot(5, "da_xac_nhan"),
    ]);
    expect(lua.cacDot.map((d) => d.soDot)).toEqual([1, 3, 5]);
    expect(lua.dotMacDinh).toBe(5);
  });

  it("submitted/expired: chỉ đợt 1, dù đã có đợt cũ (mở lại đợt 1 là luồng gốc)", () => {
    const lua = luaChonMoLai("submitted", [dot(2, "da_xac_nhan")]);
    expect(lua.cacDot.map((d) => d.soDot)).toEqual([1]);
    expect(lua.dotMacDinh).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Chữ khách đọc
// ---------------------------------------------------------------------------

describe("BB-321: chữ hiển thị cho khách theo trạng thái đợt", () => {
  it("chờ / đã xác nhận / từ chối kèm lý do / mở lại", () => {
    expect(nhanTrangThaiDotChoKhach("cho_xac_nhan")).toBe("Đang chờ studio xác nhận");
    expect(nhanTrangThaiDotChoKhach("da_xac_nhan")).toBe("Studio đã xác nhận");
    expect(nhanTrangThaiDotChoKhach("tu_choi", "Tấm này đã in xong")).toContain("Tấm này đã in xong");
    expect(nhanTrangThaiDotChoKhach("da_mo_lai")).toContain("mở lại");
  });
});

// ---------------------------------------------------------------------------
// 4. Thẻ Lark
// ---------------------------------------------------------------------------

describe("BB-321 (4): thẻ Lark 'selection.round_submitted' sống sót qua locBoAnh()", () => {
  const payload = {
    galleryId: "11111111-1111-4111-8111-111111111111",
    galleryTitle: "Bộ ảnh mẫu bé Na",
    soDot: 2,
    soTam: 5,
    soTamTinhTien: 2,
    phuThuTam: 60000,
    tienSanPham: 200000,
    tongTien: 260000,
    nguoiChot: "Nguyễn Thị Mai",
    customerName: "Nguyễn Thị Mai",
    customerPhone: "090***0001",
    cacMon: [{ ten: "Khung gỗ 40x60", soLuong: 1 }],
    submittedAt: "2026-09-29T10:00:00.000Z",
  };

  it("KHÔNG khoá nào bị locBoAnh cắt (bẫy chữ 'anh' trong tên khoá làm thẻ ra rỗng lặng lẽ)", () => {
    const sau = locBoAnh(payload);
    expect(Object.keys(sau).sort()).toEqual(Object.keys(payload).sort());
  });

  it("thẻ nêu số đợt, số ảnh, tổng tiền, sản phẩm và dặn CSKH cập nhật hợp đồng bên Lark", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
    const the = dungThe("selection.round_submitted", locBoAnh(payload), "https://app.example.com/admin/galleries/x") as {
      card: { header: { title: { content: string } }; elements: unknown[] };
    } | null;
    expect(the).not.toBeNull();
    expect(the!.card.header.title.content).toBe("Khách mua thêm — đợt 2");
    const noiDung = JSON.stringify(the!.card.elements);
    expect(noiDung).toContain("Đợt 2");
    expect(noiDung).toContain("5 ảnh");
    expect(noiDung).toContain("260.000đ");
    expect(noiDung).toContain("Khung gỗ 40x60");
    expect(noiDung).toContain("cập nhật hợp đồng bên Lark");
    vi.unstubAllEnvs();
  });
});

// ---------------------------------------------------------------------------
// Việc cần xử lý
// ---------------------------------------------------------------------------

describe("BB-321: đợt mua thêm chờ xác nhận vào 'Việc cần xử lý'", () => {
  it("choDotChon được cộng vào huy hiệu và có dòng riêng dẫn tới tab 'Khách mua thêm'", () => {
    const d = { choDotChon: 3, choMoLai: 1 };
    expect(demSoCanXuLy(d)).toBe(4);
    const dong = dongCanXuLy(d);
    expect(dong.reduce((n, r) => n + r.soLuong, 0)).toBe(demSoCanXuLy(d));
    const dongDot = dong.find((r) => r.key === "cho-dot-chon");
    expect(dongDot?.soLuong).toBe(3);
    expect(dongDot?.href).toContain("tab=khach-mua-them");
  });

  it("không có đợt nào chờ thì không hiện dòng", () => {
    expect(dongCanXuLy({ choDotChon: 0 }).some((r) => r.key === "cho-dot-chon")).toBe(false);
  });
});

describe("BB-321: dòng thời gian dịch đúng các hành động của đợt", () => {
  it("chốt / xác nhận / từ chối / mở lại đợt N có câu riêng, không rơi về 'Thao tác khác'", () => {
    expect(dichHoatDong("selection.round_submit", { soDot: 2, soAnh: 5 }).cau).toBe("Ba mẹ chốt đợt 2 (5 tấm)");
    expect(dichHoatDong("selection.round_confirm", { soDot: 2 }).cau).toBe("Nhân viên xác nhận đợt 2");
    expect(dichHoatDong("selection.round_reject", { soDot: 3, lyDo: "không ghép vào câu" }).cau).toBe(
      "Nhân viên từ chối đợt 3",
    );
    expect(dichHoatDong("gallery.reopen", { soDot: 2 }).cau).toBe("Nhân viên mở lại đợt 2");
    // mở lại đợt 1 / dữ liệu cũ (không có soDot) giữ câu cũ
    expect(dichHoatDong("gallery.reopen", { soDot: 1 }).cau).toBe("Nhân viên mở lại bộ ảnh");
    expect(dichHoatDong("gallery.reopen", {}).cau).toBe("Nhân viên mở lại bộ ảnh");
  });

  it("người chốt đợt là ba mẹ (tên tự gõ), không bị gán 'Ông bà (tên)'", () => {
    expect(suyNguoi({ action: "selection.round_submit", actorType: "customer", actorLabel: "Nguyễn Thị Mai" })).toBe(
      "Ba mẹ (Nguyễn Thị Mai)",
    );
  });
});

// ---------------------------------------------------------------------------
// Đợt 1 chốt thiếu ảnh / sản phẩm in chưa gắn ảnh
// ---------------------------------------------------------------------------

describe("BB-321 (5): đợt 1 chốt THIẾU ảnh — nhờ studio chọn bổ sung, phải tick đồng ý", () => {
  it("nhờ mà KHÔNG tick đồng ý → từ chối, kèm loại lỗi để giao diện biết ô nào", () => {
    const r = kiemTraNhoStudioChon({ soAnhThieu: 3, nho: true, dongY: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.chiTiet.loai).toBe("thieu_dong_y_anh_studio_chon");
      expect(r.message).toContain(CAU_DONG_Y_STUDIO_CHON);
    }
  });

  it("nhờ + tick đồng ý → hợp lệ, số ảnh nhờ do MÁY CHỦ tính (= số còn thiếu)", () => {
    expect(kiemTraNhoStudioChon({ soAnhThieu: 3, nho: true, dongY: true })).toEqual({ ok: true, soNho: 3 });
  });

  it("không nhờ, hoặc không còn thiếu → không đòi gì, soNho = 0", () => {
    expect(kiemTraNhoStudioChon({ soAnhThieu: 3, nho: false, dongY: false })).toEqual({ ok: true, soNho: 0 });
    expect(kiemTraNhoStudioChon({ soAnhThieu: 0, nho: true, dongY: false })).toEqual({ ok: true, soNho: 0 });
  });

  it("câu tick đúng chữ chủ studio duyệt", () => {
    expect(CAU_DONG_Y_STUDIO_CHON).toBe("Tôi đồng ý với ảnh studio chọn dùm và không đổi lại");
  });
});

describe("BB-321 (6): sản phẩm in chưa gắn ảnh — phải tick 'biết ảnh sẽ lâu hơn timeline' mới chốt", () => {
  it("còn sản phẩm chưa gắn ảnh mà thiếu cờ → từ chối, nêu số lượng", () => {
    const r = kiemTraSanPhamInChuaAnh({ soChuaAnh: 2, biet: false });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.chiTiet).toEqual({ loai: "thieu_biet_anh_in_cham", soSanPhamInChuaAnh: 2 });
      expect(r.message).toContain("2 sản phẩm in chưa chọn ảnh");
      expect(r.message).toContain(CAU_BIET_ANH_IN_CHAM);
    }
  });

  it("có cờ thì qua; không có sản phẩm nào chưa gắn ảnh thì không đòi cờ", () => {
    expect(kiemTraSanPhamInChuaAnh({ soChuaAnh: 2, biet: true }).ok).toBe(true);
    expect(kiemTraSanPhamInChuaAnh({ soChuaAnh: 0, biet: false }).ok).toBe(true);
  });

  it("câu tick đúng chữ chủ studio duyệt", () => {
    // Câu rút gọn anh chốt khi duyệt bản vẽ BB-321 (29/09/2026).
    expect(CAU_BIET_ANH_IN_CHAM).toBe("Tôi biết chưa chọn ảnh in thì nhận ảnh chậm hơn");
  });

  it("demSanPhamInChuaAnh: ảnh in/khung tính phần chưa xếp, album tính cả cuốn khi chưa có tấm nào, hàng mua thêm chưa có ảnh tính số lượng", () => {
    const dem = demSanPhamInChuaAnh({
      hangTrongGoi: [
        { galleryItemId: "in", quantity: 3, nhom: "anh_in" }, // xếp 1/3 → thiếu 2
        { galleryItemId: "khung", quantity: 1, nhom: "khung" }, // xếp đủ → 0
        { galleryItemId: "album", quantity: 1, nhom: "album" }, // chưa tấm nào → 1
        { galleryItemId: "album2", quantity: 1, nhom: "album" }, // có 5 tấm → 0
      ],
      soXepTheoHang: new Map([
        ["in", 1],
        ["khung", 1],
        ["album2", 5],
      ]),
      muaThem: [
        { soLuong: 2, daCoAnh: false }, // +2
        { soLuong: 4, daCoAnh: true }, // 0
      ],
    });
    expect(dem).toBe(2 + 0 + 1 + 0 + 2);
  });

  it("xếp DƯ suất không làm số âm; gói không có hàng in thì 0", () => {
    expect(
      demSanPhamInChuaAnh({
        hangTrongGoi: [{ galleryItemId: "in", quantity: 1, nhom: "anh_in" }],
        soXepTheoHang: new Map([["in", 4]]),
        muaThem: [],
      }),
    ).toBe(0);
    expect(demSanPhamInChuaAnh({ hangTrongGoi: [], soXepTheoHang: new Map(), muaThem: [] })).toBe(0);
  });
});

describe("BB-321 (7): Lark + Việc cần xử lý cho hai việc của đợt 1", () => {
  it("thẻ 'selection.submitted' nêu 'Khách nhờ studio chọn thêm N ảnh' và 'Còn N sản phẩm in chưa chọn ảnh'; khoá sống sót qua locBoAnh", () => {
    const payload = {
      galleryId: "11111111-1111-4111-8111-111111111111",
      galleryTitle: "Bộ mẫu",
      selectedCount: 12,
      includedQuota: 15,
      extraCount: 0,
      extraAmount: 0,
      confirmedByName: "Mẹ Mai",
      nhoStudioSoTam: 3,
      soMonInThieuTam: 2,
    };
    const sau = locBoAnh(payload);
    expect(sau.nhoStudioSoTam).toBe(3);
    expect(sau.soMonInThieuTam).toBe(2);
    const the = dungThe("selection.submitted", sau, null) as { card: { header: { title: { content: string } }; elements: unknown[] } };
    const nd = JSON.stringify(the.card.elements);
    expect(nd).toContain("Khách nhờ studio chọn thêm 3 ảnh");
    expect(nd).toContain("Còn 2 sản phẩm in chưa chọn ảnh");
    expect(the.card.header.title.content).toContain("NHỜ STUDIO CHỌN THÊM");
  });

  it("thẻ bình thường (không nhờ, không thiếu) KHÔNG có hai dòng đó", () => {
    const the = dungThe(
      "selection.submitted",
      locBoAnh({ galleryTitle: "B", selectedCount: 15, includedQuota: 15, confirmedByName: "M", nhoStudioSoTam: 0, soMonInThieuTam: 0 }),
      null,
    ) as { card: { header: { title: { content: string } }; elements: unknown[] } };
    const nd = JSON.stringify(the.card.elements);
    expect(nd).not.toContain("nhờ studio");
    expect(nd).not.toContain("chưa chọn ảnh");
    expect(the.card.header.title.content).toBe("Khách đã chốt ảnh");
  });

  it("thẻ đợt mua thêm nêu số sản phẩm in chưa chọn ảnh", () => {
    const the = dungThe(
      "selection.round_submitted",
      locBoAnh({ galleryTitle: "B", soDot: 2, soTam: 2, tongTien: 60000, soMonInThieuTam: 1, cacMon: [] }),
      null,
    );
    expect(JSON.stringify(the)).toContain("Còn 1 sản phẩm in chưa chọn ảnh");
  });

  it("choStudioChon vào huy hiệu 'Cần xử lý ngay' và có dòng riêng", () => {
    const d = { choStudioChon: 2, choDotChon: 1 };
    expect(demSoCanXuLy(d)).toBe(3);
    const dong = dongCanXuLy(d);
    expect(dong.reduce((n, r) => n + r.soLuong, 0)).toBe(demSoCanXuLy(d));
    expect(dong.find((r) => r.key === "cho-studio-chon")?.soLuong).toBe(2);
    expect(dongCanXuLy({ choStudioChon: 0 }).some((r) => r.key === "cho-studio-chon")).toBe(false);
  });
});
