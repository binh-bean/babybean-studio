/**
 * Vạch chia trục Y của biểu đồ báo cáo — chỉ SỐ NGUYÊN, không lặp.
 *
 * BB-318 (Q-d, báo cáo chấm vòng 5): trục cũ chia `max` làm 4 rồi làm tròn,
 * nên khi `max` là 1 hay 2 ra "0, 0, 1, 1, 1" — vạch lẻ bị làm tròn thành
 * cùng một số. Số bộ ảnh là số đếm: không có "0,25 bộ" để vẽ vạch.
 *
 * Trả các mốc tăng dần, bắt đầu từ 0, bước là số nguyên "đẹp" (1, 2, 5, 10,
 * 20, 50…), mốc cuối >= `maxGiaTri` để cột cao nhất luôn nằm trong khung.
 */
export function mocTrucY(maxGiaTri: number, toiDaKhoang = 4): number[] {
  const max = Math.max(1, Math.ceil(Number.isFinite(maxGiaTri) ? maxGiaTri : 1));
  const tho = max / Math.max(1, toiDaKhoang);
  const luyThua = 10 ** Math.floor(Math.log10(tho));
  let buoc = luyThua * 10;
  for (const boi of [1, 2, 5, 10]) {
    if (luyThua * boi >= tho) {
      buoc = luyThua * boi;
      break;
    }
  }
  buoc = Math.max(1, Math.round(buoc));
  const moc: number[] = [];
  for (let v = 0; v < max + buoc; v += buoc) {
    moc.push(v);
    if (v >= max) break;
  }
  return moc;
}
