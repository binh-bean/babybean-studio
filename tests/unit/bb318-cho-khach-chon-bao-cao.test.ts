/**
 * BB-318 Q-d — báo cáo "Tiến độ chọn ảnh" và thẻ "Chờ khách chọn" của Bảng
 * điều khiển phải dùng CÙNG luật Lark (BB-285). Trước bản vá báo cáo đếm thẳng
 * theo `status` của app: bộ app còn `in_review` mà Lark đã "Đã chọn hình" vẫn
 * bị đếm là "đang chọn".
 *
 * Giả lập duy nhất là client Supabase (biên giới ra ngoài): bộ dựng truy vấn
 * chạy trên mảng dòng trong bộ nhớ, đủ các toán tử báo cáo dùng.
 */
import { describe, it, expect } from "vitest";
import { conChoKhachChonTheoLark } from "@/lib/gallery/cho-khach-chon";
import { tienDoChonAnh } from "@/lib/bao-cao/cac-bao-cao/tien-do-chon-anh";
import type { NguCanhBaoCao } from "@/lib/bao-cao/loai";

const LARK_GUI_FILE_GOC = "optDAI9nFV"; // giai đoạn 1
const LARK_DA_CHON_HINH = "optl5DyKLx"; // giai đoạn 2

const NGAY = 86_400_000;
const homNay = new Date();
const truoc = (ngay: number) => new Date(homNay.getTime() - ngay * NGAY).toISOString();

type Dong = Record<string, unknown>;

function bangGia(rows: Dong[]) {
  let cur = rows;
  const b = {
    select: () => b,
    order: () => b,
    not: (cot: string, _op: string, v: string) => {
      const tienTo = v.replace("%", "").toLowerCase();
      cur = cur.filter((r) => !String(r[cot] ?? "").toLowerCase().startsWith(tienTo));
      return b;
    },
    neq: (cot: string, v: unknown) => ((cur = cur.filter((r) => r[cot] !== v)), b),
    eq: (cot: string, v: unknown) => ((cur = cur.filter((r) => r[cot] === v)), b),
    in: (cot: string, vs: unknown[]) => ((cur = cur.filter((r) => vs.includes(r[cot]))), b),
    gte: (cot: string, v: string) => ((cur = cur.filter((r) => r[cot] != null && String(r[cot]) >= v)), b),
    lt: (cot: string, v: string) => ((cur = cur.filter((r) => r[cot] != null && String(r[cot]) < v)), b),
    then: (ok: (v: { data: Dong[]; error: null }) => unknown) => ok({ data: cur, error: null }),
  };
  return b;
}

function ctxCho(rows: Dong[]): NguCanhBaoCao {
  const client = {
    from: (bang: string) => (bang === "branches" ? bangGia([{ id: "cn1", name: "Chi nhánh A" }]) : bangGia(rows)),
  };
  return {
    client: client as unknown as NguCanhBaoCao["client"],
    chiNhanhIds: null,
    tu: new Date(homNay.getTime() - 7 * NGAY),
    den: new Date(homNay.getTime() + NGAY),
    nhom: "ngay",
  };
}

const bo = (id: string, status: string, lark: string | null, larkTu: string | null, extra: Dong = {}): Dong => ({
  id,
  branch_id: "cn1",
  title: `Bộ ${id}`,
  status,
  lark_trang_thai: lark,
  lark_trang_thai_tu: larkTu,
  sent_at: null,
  submitted_at: null,
  due_at: null,
  ...extra,
});

describe("conChoKhachChonTheoLark", () => {
  it("chưa có Lark, hoặc Lark còn ở file gốc gần đây: vẫn chờ khách", () => {
    expect(conChoKhachChonTheoLark({ lark_trang_thai: null, lark_trang_thai_tu: null }, homNay)).toBe(true);
    expect(conChoKhachChonTheoLark({ lark_trang_thai: LARK_GUI_FILE_GOC, lark_trang_thai_tu: truoc(5) }, homNay)).toBe(true);
  });
  it("Lark đã 'Đã chọn hình' trở lên, hoặc file gốc quá 60 ngày: không còn chờ", () => {
    expect(conChoKhachChonTheoLark({ lark_trang_thai: LARK_DA_CHON_HINH, lark_trang_thai_tu: truoc(1) }, homNay)).toBe(false);
    expect(conChoKhachChonTheoLark({ lark_trang_thai: LARK_GUI_FILE_GOC, lark_trang_thai_tu: truoc(90) }, homNay)).toBe(false);
  });
});

describe("báo cáo Tiến độ chọn ảnh: 'Khách đang chọn ảnh' theo cùng luật Lark", () => {
  const rows: Dong[] = [
    bo("a", "in_review", null, null), // đang chọn thật
    bo("b", "in_review", LARK_DA_CHON_HINH, truoc(2)), // app quên đóng, Lark đã đi tiếp
    bo("c", "in_review", LARK_GUI_FILE_GOC, truoc(90)), // quá 60 ngày ở file gốc
    bo("d", "ready", null, null), // sẵn sàng, chưa mở link: không thuộc "đang chọn"
    bo("e", "in_review", null, null, { due_at: truoc(3) }), // đang chọn thật và quá hạn
    bo("f", "in_review", LARK_DA_CHON_HINH, truoc(2), { due_at: truoc(3) }), // quá hạn nhưng Lark đã đi tiếp
    bo("g", "ready", null, null, { sent_at: truoc(1) }), // đã gửi link trong kỳ (không lọc Lark)
    bo("h", "in_review", LARK_DA_CHON_HINH, truoc(2), { sent_at: truoc(1) }), // đã gửi link trong kỳ, Lark đã đi tiếp
  ];

  it("chỉ đếm bộ còn chờ khách theo Lark; 'Đã gửi link' không bị lọc Lark", async () => {
    const kq = await tienDoChonAnh.chay(ctxCho(rows));
    const the = (nhan: string) => kq.theSo.find((t) => t.nhan === nhan)?.giaTri;
    // a, e (b, c, f, h bị Lark loại; d là ready)
    expect(the("Khách đang chọn ảnh (hiện tại)")).toBe(2);
    // e (f bị Lark loại)
    expect(the("Quá hạn chưa chốt (hiện tại)")).toBe(1);
    // g, h: gửi link là sự kiện trong kỳ, không phụ thuộc Lark
    expect(the("Đã gửi link")).toBe(2);
  });

  it("nhãn báo cáo khác hẳn nhãn 'Chờ khách chọn' của Bảng điều khiển và có ghi chú giải thích", async () => {
    const kq = await tienDoChonAnh.chay(ctxCho(rows));
    expect(kq.theSo.map((t) => t.nhan)).not.toContain("Chờ khách chọn");
    expect(kq.bang?.cot).toContain("Khách đang chọn ảnh");
    expect((kq.ghiChu ?? []).some((g) => g.includes("Chờ khách chọn") && g.includes("Sẵn sàng gửi khách"))).toBe(true);
  });
});
