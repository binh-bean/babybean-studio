/**
 * BB-341 — tải danh sách ảnh theo trang SONG SONG (src/lib/utils/tai-anh-song-song.ts).
 *
 * Canh hai điều:
 *   1. SỐ VÒNG mạng nối đuôi: bộ 425 ảnh trước đây 3 vòng (trang sau chờ con
 *      trỏ của trang trước), nay 1 vòng.
 *   2. KHÔNG THIẾU, KHÔNG TRÙNG tấm nào — kể cả khi sort_index thưa, trùng,
 *      hay `photoCount` lệch với thực tế.
 *
 * `goiTrang` là biên giới mạng: thay bằng một "máy chủ" giả làm đúng luật của
 * `/api/g/photos` (sort_index > sau|con trỏ, xếp tăng, limit+1 để biết hasMore).
 * Máy chủ giả trả lời theo ĐỢT: mọi lượt đang chờ được trả cùng lúc, mỗi đợt
 * là một vòng khứ hồi — đếm đợt là đếm vòng.
 */
import { describe, it, expect } from "vitest";
import { taiAnhSongSong, type TrangAnh } from "@/lib/utils/tai-anh-song-song";

interface Anh {
  id: string;
  sortIndex: number;
}

function taoMayChu(ds: Anh[], loiKhi?: (q: { sau?: number; cursor?: string }) => boolean) {
  const cho: Array<() => void> = [];
  let soLuot = 0;
  const traLoi = (q: { sau?: number; cursor?: string; limit: number }): TrangAnh<Anh> => {
    const tu = q.sau ?? (q.cursor ? Number(q.cursor) : 0);
    const loc = ds.filter((a) => a.sortIndex > tu).sort((a, b) => a.sortIndex - b.sortIndex);
    const trang = loc.slice(0, q.limit);
    const hasMore = loc.length > q.limit;
    return { data: trang, hasMore, cursor: trang.length ? String(trang[trang.length - 1]!.sortIndex) : undefined };
  };
  const goiTrang = (q: { sau?: number; cursor?: string; limit: number }) => {
    soLuot++;
    return new Promise<TrangAnh<Anh> | null>((res) =>
      cho.push(() => res(loiKhi?.(q) ? null : traLoi(q))),
    );
  };
  const nghi = () => new Promise((r) => setTimeout(r, 0));
  /** Chạy tới khi xong; trả số ĐỢT trả lời (= số vòng mạng nối đuôi). */
  async function chay<T>(p: Promise<T>): Promise<{ kq: T; dot: number }> {
    let xong = false;
    let kq!: T;
    void p.then((v) => {
      xong = true;
      kq = v;
    });
    let dot = 0;
    for (let i = 0; i < 100 && !xong; i++) {
      await nghi();
      if (cho.length === 0) continue;
      dot++;
      for (const f of cho.splice(0)) f();
    }
    await nghi();
    return { kq, dot };
  }
  return { goiTrang, chay, soLuot: () => soLuot };
}

const day = (n: number, buoc = 1, tu = buoc): Anh[] =>
  Array.from({ length: n }, (_, i) => ({ id: `a${i}`, sortIndex: tu + i * buoc }));

function kiemDuVaDung(nhan: Anh[], goc: Anh[]) {
  expect(nhan.map((a) => a.id).sort()).toEqual(goc.map((a) => a.id).sort());
  expect(new Set(nhan.map((a) => a.id)).size).toBe(nhan.length);
  for (let i = 1; i < nhan.length; i++) expect(nhan[i]!.sortIndex).toBeGreaterThanOrEqual(nhan[i - 1]!.sortIndex);
}

describe("BB-341 — taiAnhSongSong", () => {
  it("bộ 425 ảnh (trung bình thật): đủ 425 tấm trong MỘT vòng, không phải ba", async () => {
    const goc = day(425);
    const mc = taoMayChu(goc);
    const { kq, dot } = await mc.chay(taiAnhSongSong({ soAnhDuKien: 425, goiTrang: mc.goiTrang }));
    kiemDuVaDung(kq.anh, goc);
    expect(kq.du).toBe(true);
    expect(dot).toBe(1);
  });

  it("bộ 1.235 ảnh (lớn nhất hiện có): một vòng thay vì bảy", async () => {
    const goc = day(1235);
    const mc = taoMayChu(goc);
    const { kq, dot } = await mc.chay(taiAnhSongSong({ soAnhDuKien: 1235, goiTrang: mc.goiTrang }));
    kiemDuVaDung(kq.anh, goc);
    expect(dot).toBe(1);
  });

  it("sort_index thưa (10, 20, …): vẫn đủ, không trùng", async () => {
    const goc = day(425, 10);
    const mc = taoMayChu(goc);
    const { kq } = await mc.chay(taiAnhSongSong({ soAnhDuKien: 425, goiTrang: mc.goiTrang }));
    kiemDuVaDung(kq.anh, goc);
  });

  it("sort_index TRÙNG làm một khoảng chứa quá 200 tấm: đi tiếp bằng con trỏ, không thiếu tấm nào", async () => {
    // 1..100 mỗi số một tấm, 101..175 mỗi số HAI tấm → khoảng (0,200] có 250 tấm.
    const goc: Anh[] = [
      ...day(100),
      ...Array.from({ length: 150 }, (_, i) => ({ id: `t${i}`, sortIndex: 101 + Math.floor(i / 2) })),
      ...day(200, 1, 201).map((a) => ({ ...a, id: `b${a.id}` })),
    ];
    const mc = taoMayChu(goc);
    const { kq } = await mc.chay(taiAnhSongSong({ soAnhDuKien: goc.length, goiTrang: mc.goiTrang }));
    kiemDuVaDung(kq.anh, goc);
  });

  it("photoCount lệch (0, hay ít hơn thật): trang cuối đi tiếp tới hết", async () => {
    const goc = day(437);
    for (const uocTinh of [0, 100]) {
      const mc = taoMayChu(goc);
      const { kq } = await mc.chay(taiAnhSongSong({ soAnhDuKien: uocTinh, goiTrang: mc.goiTrang }));
      kiemDuVaDung(kq.anh, goc);
    }
  });

  it("hiện dần theo thứ tự: lần báo đầu tiên là ĐÚNG trang đầu, không lẫn trang sau", async () => {
    const goc = day(425);
    const mc = taoMayChu(goc);
    const lanBao: number[][] = [];
    await mc.chay(
      taiAnhSongSong({
        soAnhDuKien: 425,
        goiTrang: mc.goiTrang,
        khiCoThem: (a) => lanBao.push(a.map((x) => x.sortIndex)),
      }),
    );
    expect(lanBao[0]!.slice(0, 3)).toEqual([1, 2, 3]);
    // Mỗi lần báo là một ĐẦU liền mạch của danh sách cuối.
    for (const b of lanBao) expect(b).toEqual(Array.from({ length: b.length }, (_, i) => i + 1));
    expect(lanBao[lanBao.length - 1]!.length).toBe(425);
  });

  it("một trang lỗi: báo `du=false`, phần đã có vẫn trả về", async () => {
    const goc = day(425);
    const mc = taoMayChu(goc, (q) => q.sau === 200);
    const { kq } = await mc.chay(taiAnhSongSong({ soAnhDuKien: 425, goiTrang: mc.goiTrang }));
    expect(kq.du).toBe(false);
    expect(kq.anh.length).toBe(225);
  });
});
