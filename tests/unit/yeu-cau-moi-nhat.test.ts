/**
 * BB-388 — danh sách bộ ảnh quản trị: phản hồi về KHÔNG theo thứ tự thì chỉ lần tải mới nhất
 * được đổ vào màn hình. Dựng lại đúng thứ tự đo được trong vết e2e bb-379 (07/10): mở trang
 * (không lọc, về sau 1,6 giây) → gõ tên khách (về sau 1,0 giây) → bấm "Chưa có tên bé" (về sau
 * 0,5 giây). Không chặn thì lần mở trang về cuối cùng và ghi đè kết quả lọc.
 */
import { describe, it, expect } from "vitest";
import { taoBoDemYeuCau } from "@/lib/utils/yeu-cau-moi-nhat";

type Dong = { id: string };

/** Mô phỏng `fetchGalleries`: bắt đầu lần tải, chờ "mạng", rồi đổ vào màn hình nếu còn mới nhất. */
function dungDanhSach() {
  const boDem = taoBoDemYeuCau();
  let manHinh: Dong[] = [];
  const tai = async (mang: Promise<Dong[]>) => {
    const so = boDem.batDau();
    const ketQua = await mang;
    if (!boDem.laMoiNhat(so)) return;
    manHinh = ketQua;
  };
  return { tai, manHinh: () => manHinh };
}

const cho = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

describe("BB-388 — chỉ nhận phản hồi của lần tải mới nhất", () => {
  it("lần mở trang (không lọc) về muộn KHÔNG ghi đè kết quả lọc 'Chưa có tên bé'", async () => {
    const ds = dungDanhSach();
    const boDaCoTenBe = { id: "bo-fixture" };
    await Promise.all([
      ds.tai(cho(60, [boDaCoTenBe])), // mở trang, không lọc
      ds.tai(cho(40, [boDaCoTenBe])), // gõ tên khách
      ds.tai(cho(10, [] as Dong[])), // bấm "Chưa có tên bé" — bộ đã có tên bé nên rỗng
    ]);
    expect(ds.manHinh()).toEqual([]);
  });

  it("phản hồi về đúng thứ tự thì lần sau cùng thắng như thường", async () => {
    const ds = dungDanhSach();
    await ds.tai(cho(1, [{ id: "a" }]));
    await ds.tai(cho(1, [{ id: "b" }]));
    expect(ds.manHinh()).toEqual([{ id: "b" }]);
  });

  it("bộ đếm: lần cũ hết là mới nhất ngay khi lần mới bắt đầu", () => {
    const b = taoBoDemYeuCau();
    const mot = b.batDau();
    expect(b.laMoiNhat(mot)).toBe(true);
    const hai = b.batDau();
    expect(b.laMoiNhat(mot)).toBe(false);
    expect(b.laMoiNhat(hai)).toBe(true);
  });
});
