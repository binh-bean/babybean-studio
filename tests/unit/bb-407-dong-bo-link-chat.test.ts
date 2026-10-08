/**
 * BB-407 — đồng bộ link chat Lark → `customers.facebook` theo lô (cron hằng ngày + script bù).
 *
 * THUẦN: không kết nối cơ sở dữ liệu, không gọi Lark. Dòng Lark và `pg` đều là bản GIẢ trong
 * bộ nhớ (hàm đọc Lark được tiêm vào `dongBoLinkChatTuLark`). Dữ liệu giả theo AGENTS §6:
 * tên bịa, link `m.me/fake-...`, mã khách `KHFAKE...`.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  SQL_GHI_LINK_CHAT_THEO_LARK,
  dongBoLinkChatTuLark,
  gomLinkChatTuLark,
  khoaKhachTuMa,
  tinhKeHoachLinkChat,
  type DongLarkTho,
  type KhachTrongApp,
} from "@/lib/lark/dong-bo-link-chat";

const TEN_GIA = "Nguyễn Thị Mai Fixture";
const L_A = "https://m.me/fake-a-407";
const L_B = "https://m.me/fake-b-407";
const L_C = "https://m.me/fake-c-407";

const dongKH = (ma: string, link: unknown): DongLarkTho => ({
  record_id: `recKH_${ma}`,
  fields: { "Mã Khách Hàng": ma, "link chat": link },
});
const dongHK = (rid: string, ma: string | null, chat: unknown): DongLarkTho => ({
  record_id: rid,
  fields: { ...(ma ? { "Mã KH": ma } : {}), "Chat với khách": chat },
});
const o = (link: string) => [{ link, text: TEN_GIA, type: "url" }];

const khach = (id: string, over: Partial<KhachTrongApp> = {}): KhachTrongApp => ({
  id,
  lark_customer_key: null,
  facebook: null,
  dong: [],
  ...over,
});

describe("BB-407: gomLinkChatTuLark — đọc + khớp theo khoá", () => {
  it("bảng Khách Hàng: khoá = sha256(Mã KH) 12 ký tự; chỉ lấy `link`, bỏ `text` (tên khách)", () => {
    const n = gomLinkChatTuLark([dongKH("KHFAKE001", { link: L_A, text: TEN_GIA })], []);
    const khoa = khoaKhachTuMa("KHFAKE001");
    expect(khoa).toMatch(/^[0-9a-f]{12}$/);
    expect(n.theoKhachHang.get(khoa)).toBe(L_A);
    expect(JSON.stringify([...n.theoKhachHang])).not.toContain("Fixture");
  });

  it("nhánh Hậu Kỳ: theo Mã KH và theo record_id (khách chưa có khoá Lark)", () => {
    const n = gomLinkChatTuLark([], [dongHK("recHK1", "KHFAKE002", o(L_B)), dongHK("recHK2", null, o(L_C))]);
    expect(n.theoHauKyMaKH.get(khoaKhachTuMa("KHFAKE002"))).toBe(L_B);
    expect(n.theoDongHauKy.get("recHK1")).toBe(L_B);
    expect(n.theoDongHauKy.get("recHK2")).toBe(L_C);
    expect(n.theoHauKyMaKH.size).toBe(1);
    expect(JSON.stringify([...n.theoDongHauKy, ...n.theoHauKyMaKH])).not.toContain("Fixture");
  });

  it("một khoá có hai link KHÁC nhau → mơ hồ (null); cùng link lặp lại thì không mơ hồ", () => {
    const n = gomLinkChatTuLark(
      [dongKH("KHFAKE003", { link: L_A }), dongKH("KHFAKE003", { link: L_B }), dongKH("KHFAKE004", { link: L_A }), dongKH("KHFAKE004", { link: L_A })],
      [],
    );
    expect(n.theoKhachHang.get(khoaKhachTuMa("KHFAKE003"))).toBeNull();
    expect(n.theoKhachHang.get(khoaKhachTuMa("KHFAKE004"))).toBe(L_A);
  });

  it("link hỏng (javascript:, data:, chữ thường = tên khách, rỗng) bị loại — không vào bảng tra", () => {
    const n = gomLinkChatTuLark(
      [
        dongKH("KHFAKE005", { link: "javascript:alert(1)", text: TEN_GIA }),
        dongKH("KHFAKE006", { link: "", text: TEN_GIA }),
        dongKH("KHFAKE007", TEN_GIA),
        dongKH("KHFAKE008", undefined),
      ],
      [dongHK("recHK3", "KHFAKE009", [{ link: "data:text/html,<script>1</script>" }]), dongHK("recHK4", "KHFAKE010", TEN_GIA)],
    );
    expect(n.theoKhachHang.size).toBe(0);
    expect(n.theoHauKyMaKH.size).toBe(0);
    expect(n.theoDongHauKy.size).toBe(0);
  });

  it("ô lookup có phần tử hỏng đứng trước → lấy phần tử http(s) hợp lệ kế tiếp", () => {
    const n = gomLinkChatTuLark([], [dongHK("recHK5", null, [{ link: "javascript:alert(1)" }, { link: L_A, text: TEN_GIA }])]);
    expect(n.theoDongHauKy.get("recHK5")).toBe(L_A);
  });
});

describe("BB-407: tinhKeHoachLinkChat — khác thì ghi, giống thì không, Lark trống thì giữ", () => {
  const kh1 = khoaKhachTuMa("KHFAKE101");
  const kh2 = khoaKhachTuMa("KHFAKE102");
  const kh3 = khoaKhachTuMa("KHFAKE103");

  it("link Lark KHÁC giá trị đang có (kể cả trống/trắng) → vào kế hoạch ghi, đúng nguồn", () => {
    const nguon = gomLinkChatTuLark(
      [dongKH("KHFAKE101", { link: L_A }), dongKH("KHFAKE102", { link: L_B })],
      [dongHK("recX1", null, o(L_C))],
    );
    const { seGhi, dem } = tinhKeHoachLinkChat(nguon, [
      khach("k1", { lark_customer_key: kh1, facebook: "https://m.me/cu-407" }), // khác → ghi đè
      khach("k2", { lark_customer_key: kh2, facebook: "   " }), // trắng → ghi
      khach("k3", { dong: ["recX1"], facebook: null }), // theo dòng Hậu Kỳ
    ]);
    expect(seGhi).toEqual([
      { id: "k1", link: L_A, nguon: "theoKhachHang" },
      { id: "k2", link: L_B, nguon: "theoKhachHang" },
      { id: "k3", link: L_C, nguon: "theoDongHauKy" },
    ]);
    expect(dem).toMatchObject({ khachTrongApp: 3, seGhi: 3, theoKhachHang: 2, theoDongHauKy: 1, giongRoi: 0 });
  });

  it("link Lark GIỐNG giá trị đang có (kể cả thừa khoảng trắng) → không ghi, đếm giongRoi", () => {
    const nguon = gomLinkChatTuLark([dongKH("KHFAKE101", { link: L_A })], []);
    const { seGhi, dem } = tinhKeHoachLinkChat(nguon, [
      khach("k1", { lark_customer_key: kh1, facebook: L_A }),
      khach("k2", { lark_customer_key: kh1, facebook: `  ${L_A} ` }),
    ]);
    expect(seGhi).toEqual([]);
    expect(dem).toMatchObject({ seGhi: 0, giongRoi: 2 });
  });

  it("Lark không có link (hoặc link hỏng) → giữ nguyên, KHÔNG có mục xoá/ghi rỗng", () => {
    const nguon = gomLinkChatTuLark([dongKH("KHFAKE101", { link: "javascript:alert(1)" })], []);
    const { seGhi, dem } = tinhKeHoachLinkChat(nguon, [
      khach("k1", { lark_customer_key: kh1, facebook: "https://m.me/tay-407" }),
      khach("k2", { facebook: "https://m.me/tay-407" }),
    ]);
    expect(seGhi).toEqual([]);
    expect(dem).toMatchObject({ seGhi: 0, khongCoTrenLark: 2, moHo: 0 });
  });

  it("ưu tiên Khách Hàng → Hậu Kỳ theo Mã KH → dòng Hậu Kỳ", () => {
    const nguon = gomLinkChatTuLark(
      [dongKH("KHFAKE101", { link: L_A })],
      [dongHK("recY1", "KHFAKE101", o(L_B)), dongHK("recY2", "KHFAKE102", o(L_B)), dongHK("recY3", null, o(L_C))],
    );
    const { seGhi } = tinhKeHoachLinkChat(nguon, [
      khach("k1", { lark_customer_key: kh1, dong: ["recY1", "recY3"] }),
      khach("k2", { lark_customer_key: kh2, dong: ["recY3"] }),
      khach("k3", { lark_customer_key: kh3, dong: ["recY3"] }),
    ]);
    expect(seGhi).toEqual([
      { id: "k1", link: L_A, nguon: "theoKhachHang" },
      { id: "k2", link: L_B, nguon: "theoHauKyMaKH" },
      { id: "k3", link: L_C, nguon: "theoDongHauKy" },
    ]);
  });

  it("MƠ HỒ bị bỏ qua: khoá có hai link khác nhau, hoặc khách có nhiều bộ trỏ tới link khác nhau", () => {
    const nguon = gomLinkChatTuLark(
      [dongKH("KHFAKE101", { link: L_A }), dongKH("KHFAKE101", { link: L_B })],
      [dongHK("recZ1", null, o(L_A)), dongHK("recZ2", null, o(L_B)), dongHK("recZ3", null, o(L_A))],
    );
    const { seGhi, dem } = tinhKeHoachLinkChat(nguon, [
      khach("k1", { lark_customer_key: kh1, facebook: "https://m.me/cu-407" }), // khoá mơ hồ
      khach("k2", { dong: ["recZ1", "recZ2"], facebook: "https://m.me/cu-407" }), // hai bộ, hai link
      khach("k3", { dong: ["recZ1", "recZ3"], facebook: null }), // hai bộ, CÙNG link → ghi
    ]);
    expect(seGhi).toEqual([{ id: "k3", link: L_A, nguon: "theoDongHauKy" }]);
    expect(dem).toMatchObject({ moHo: 2, seGhi: 1 });
  });

  it("khoá mơ hồ ở bảng Khách Hàng nhưng Hậu Kỳ theo Mã KH rõ ràng → dùng Hậu Kỳ", () => {
    const nguon = gomLinkChatTuLark(
      [dongKH("KHFAKE101", { link: L_A }), dongKH("KHFAKE101", { link: L_B })],
      [dongHK("recW1", "KHFAKE101", o(L_C))],
    );
    const { seGhi } = tinhKeHoachLinkChat(nguon, [khach("k1", { lark_customer_key: kh1 })]);
    expect(seGhi).toEqual([{ id: "k1", link: L_C, nguon: "theoHauKyMaKH" }]);
  });
});

describe("BB-407: dongBoLinkChatTuLark — đọc Lark → kế hoạch → ghi bằng SQL_GHI_LINK_CHAT_THEO_LARK", () => {
  const kh1 = khoaKhachTuMa("KHFAKE201");
  const kh2 = khoaKhachTuMa("KHFAKE202");
  const kh3 = khoaKhachTuMa("KHFAKE203");

  /** pg GIẢ: bảng khách trong bộ nhớ; câu ghi áp đúng điều kiện `is distinct from`. */
  function pgGia(dongDb: { id: string; lark_customer_key: string | null; facebook: string | null; dong: string[] }[], loiVoiId?: string) {
    const ghi: unknown[][] = [];
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql === SQL_GHI_LINK_CHAT_THEO_LARK) {
          ghi.push(params ?? []);
          if (params?.[1] === loiVoiId) throw new Error(`loi co ten ${TEN_GIA}`);
          const k = dongDb.find((x) => x.id === params?.[1]);
          if (k && (k.facebook ?? "").trim() !== params?.[0]) {
            k.facebook = params?.[0] as string;
            return { rows: [], rowCount: 1 };
          }
          return { rows: [], rowCount: 0 };
        }
        return { rows: dongDb.map((x) => ({ ...x })), rowCount: dongDb.length };
      },
    };
    return { client, ghi, dongDb };
  }
  const docLark = async () => ({
    khachHang: [dongKH("KHFAKE201", { link: L_A, text: TEN_GIA }), dongKH("KHFAKE202", { link: L_B, text: TEN_GIA })],
    hauKy: [dongHK("recQ1", null, o(L_C))],
  });

  it("ghi: khác → ghi đè, giống → bỏ, Lark trống → giữ; kết quả chỉ là SỐ ĐẾM", async () => {
    const db = pgGia([
      { id: "k1", lark_customer_key: kh1, facebook: "https://m.me/cu-407", dong: [] }, // khác → ghi
      { id: "k2", lark_customer_key: kh2, facebook: L_B, dong: [] }, // giống
      { id: "k3", lark_customer_key: kh3, facebook: "https://m.me/tay-407", dong: [] }, // Lark không có
      { id: "k4", lark_customer_key: null, facebook: null, dong: ["recQ1"] }, // theo dòng
    ]);
    const kq = await dongBoLinkChatTuLark({ client: db.client, docLark, ghi: true });
    expect(kq).toMatchObject({
      khachTrongApp: 4,
      seGhi: 2,
      daGhi: 2,
      loiGhi: 0,
      giongRoi: 1,
      khongCoTrenLark: 1,
      soDongKhachHangLark: 2,
      soDongHauKyLark: 1,
    });
    expect(db.dongDb.map((k) => k.facebook)).toEqual([L_A, L_B, "https://m.me/tay-407", L_C]);
    expect(db.ghi).toEqual([[L_A, "k1"], [L_C, "k4"]]);
    // chỉ số đếm: không tên, không link
    const chu = JSON.stringify(kq);
    expect(chu).not.toContain("m.me");
    expect(chu).not.toContain("Fixture");
    expect(Object.values(kq).every((v) => typeof v === "number")).toBe(true);
  });

  it("chạy lại lượt thứ hai → không ghi gì nữa (đã giống)", async () => {
    const db = pgGia([{ id: "k1", lark_customer_key: kh1, facebook: "https://m.me/cu-407", dong: [] }]);
    await dongBoLinkChatTuLark({ client: db.client, docLark, ghi: true });
    const lan2 = await dongBoLinkChatTuLark({ client: db.client, docLark, ghi: true });
    expect(lan2).toMatchObject({ seGhi: 0, daGhi: 0, giongRoi: 1 });
  });

  it("ghi=false (xem thử) → tính kế hoạch nhưng KHÔNG gửi câu ghi", async () => {
    const db = pgGia([{ id: "k1", lark_customer_key: kh1, facebook: null, dong: [] }]);
    const kq = await dongBoLinkChatTuLark({ client: db.client, docLark, ghi: false });
    expect(kq).toMatchObject({ seGhi: 1, daGhi: 0 });
    expect(db.ghi).toHaveLength(0);
    expect(db.dongDb[0]?.facebook).toBeNull();
  });

  it("một lần ghi lỗi → chỉ đếm loiGhi (không lộ nội dung lỗi), các khách khác vẫn được ghi", async () => {
    const db = pgGia(
      [
        { id: "k1", lark_customer_key: kh1, facebook: null, dong: [] },
        { id: "k2", lark_customer_key: kh2, facebook: null, dong: [] },
      ],
      "k1",
    );
    const kq = await dongBoLinkChatTuLark({ client: db.client, docLark, ghi: true });
    expect(kq).toMatchObject({ seGhi: 2, daGhi: 1, loiGhi: 1 });
    expect(JSON.stringify(kq)).not.toContain("Fixture");
    expect(db.dongDb[1]?.facebook).toBe(L_B);
  });

  it("Lark đọc lỗi → ném TRƯỚC khi chạm DB (người gọi bọc lỗi)", async () => {
    const db = pgGia([{ id: "k1", lark_customer_key: kh1, facebook: null, dong: [] }]);
    const truyVan = vi.spyOn(db.client, "query");
    await expect(
      dongBoLinkChatTuLark({
        client: db.client,
        docLark: async () => {
          throw new Error("Lark hỏng");
        },
        ghi: true,
      }),
    ).rejects.toThrow("Lark hỏng");
    expect(truyVan).not.toHaveBeenCalled();
  });
});
