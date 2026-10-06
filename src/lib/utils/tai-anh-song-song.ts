/**
 * BB-341 — tải danh sách ảnh của bộ theo trang SONG SONG.
 *
 * Trước đây màn khách xin `/api/g/photos` từng trang 200 ảnh NỐI ĐUÔI: trang
 * sau phải chờ con trỏ của trang trước. Bộ 425 ảnh (trung bình thật) = 3 vòng,
 * bộ 1.235 ảnh = 7 vòng — mỗi vòng một lượt khứ hồi mạng điện thoại + một lần
 * chạy hàm.
 *
 * Nay: biết trước số ảnh (`photoCount` của `/api/g/gallery`), xin CÙNG LÚC
 * trang k = "sort_index > k×cỡ" (tham số `sau`). Trang đầu về là hiện ngay;
 * các trang sau ghép vào theo đúng thứ tự.
 *
 * Đúng kể cả khi sort_index không liền mạch:
 *   - Khoảng (k×cỡ, (k+1)×cỡ] chứa tối đa `cỡ` ảnh (sort_index là số nguyên)
 *     nên một trang luôn phủ hết khoảng của nó — TRỪ khi sort_index bị TRÙNG.
 *     Ca đó: trang còn `hasMore` mà ảnh cuối chưa chạm mốc trang sau → đi tiếp
 *     bằng con trỏ cho tới khi chạm mốc. Không thiếu tấm nào.
 *   - Trang cuối đi tiếp bằng con trỏ cho tới hết (`photoCount` có thể lệch
 *     với sort_index thật: ảnh ẩn, khoảng trống).
 *   - Trùng lặp giữa hai trang (khi sort_index thưa) bị gộp theo `id`.
 *
 * Hàm thuần — `goiTrang` là biên giới mạng, phép thử thay bằng dữ liệu giả.
 */

export interface TrangAnh<T> {
  data: T[];
  hasMore: boolean;
  cursor?: string;
}

/** Xin MỘT trang. Trả `null` khi lỗi (mạng, phiên…) — dừng nhánh đó lại. */
export type GoiTrang<T> = (q: { sau?: number; cursor?: string; limit: number }) => Promise<TrangAnh<T> | null>;

export interface KetQuaTaiAnh<T> {
  anh: T[];
  /** `false` khi có trang lỗi giữa chừng — danh sách có thể thiếu. */
  du: boolean;
}

export async function taiAnhSongSong<T extends { id: string; sortIndex: number }>(opts: {
  /** Số ảnh dự kiến (`gallery.photoCount`). Sai lệch vẫn đúng, chỉ chậm hơn. */
  soAnhDuKien: number;
  goiTrang: GoiTrang<T>;
  /** Gọi mỗi khi phần ĐẦU liền mạch của danh sách dài thêm (hiện dần). */
  khiCoThem?: (anhDaCo: T[]) => void;
  coTrang?: number;
  /** Trần số trang xin cùng lúc — bộ 1.235 ảnh là 7. */
  toiDaSongSong?: number;
  /** Trần tổng số lượt gọi, chống vòng lặp vô tận khi con trỏ hỏng. */
  toiDaLuot?: number;
}): Promise<KetQuaTaiAnh<T>> {
  const co = opts.coTrang ?? 200;
  const soTrang = Math.max(1, Math.min(opts.toiDaSongSong ?? 8, Math.ceil(Math.max(0, opts.soAnhDuKien) / co)));
  const moc = Array.from({ length: soTrang }, (_, k) => k * co);
  let luotConLai = opts.toiDaLuot ?? 60;
  let du = true;

  const ketQuaTrang: (T[] | undefined)[] = new Array(soTrang).fill(undefined);
  let daBao = 0; // số trang đầu liền mạch đã báo ra ngoài

  const gop = (n: number): T[] => {
    const daThay = new Set<string>();
    const tatCa: T[] = [];
    for (let k = 0; k < n; k++) {
      for (const a of ketQuaTrang[k] ?? []) {
        if (daThay.has(a.id)) continue;
        daThay.add(a.id);
        tatCa.push(a);
      }
    }
    // Ổn định: hai ảnh cùng sort_index giữ thứ tự máy chủ trả.
    return tatCa
      .map((a, i) => ({ a, i }))
      .sort((x, y) => x.a.sortIndex - y.a.sortIndex || x.i - y.i)
      .map((x) => x.a);
  };

  const baoNeuLienMach = () => {
    let n = daBao;
    while (n < soTrang && ketQuaTrang[n] !== undefined) n++;
    if (n > daBao) {
      daBao = n;
      opts.khiCoThem?.(gop(n));
    }
  };

  const goi = async (q: { sau?: number; cursor?: string; limit: number }) => {
    if (luotConLai <= 0) return null;
    luotConLai--;
    return opts.goiTrang(q);
  };

  await Promise.all(
    moc.map(async (batDau, k) => {
      const laTrangCuoi = k === soTrang - 1;
      const mocSau = laTrangCuoi ? Infinity : moc[k + 1]!;
      const cuaTrang: T[] = [];
      let trang = await goi({ sau: batDau, limit: co });
      while (trang) {
        cuaTrang.push(...trang.data);
        const cuoi = trang.data[trang.data.length - 1];
        // BB-371 — máy chủ lọc ảnh chỉnh sửa khỏi trang, nên một trang có thể RỖNG mà
        // vẫn còn ảnh phía sau (`hasMore` + con trỏ tính trên trang thô): đi tiếp.
        const conTiep = trang.hasMore && !!trang.cursor && (!cuoi || cuoi.sortIndex < mocSau);
        if (!conTiep) break;
        trang = await goi({ cursor: trang.cursor, limit: co });
      }
      if (!trang) du = false;
      ketQuaTrang[k] = cuaTrang;
      baoNeuLienMach();
    }),
  );

  return { anh: gop(soTrang), du };
}
