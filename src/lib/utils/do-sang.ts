export function tinhDoSang(
  imageData: Uint8ClampedArray,
  width: number,
  height: number,
  startY: number,
  endY: number
): number {
  let tongSang = 0;
  let soDiem = 0;

  const start = Math.max(0, Math.floor(startY));
  const end = Math.min(height, Math.ceil(endY));

  for (let y = start; y < end; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = imageData[i]!;
      const g = imageData[i + 1]!;
      const b = imageData[i + 2]!;
      const a = imageData[i + 3]!;

      if (a > 0) {
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        tongSang += luma;
        soDiem++;
      }
    }
  }

  return soDiem > 0 ? tongSang / soDiem : 0;
}

export function chonMauChu(doSang: number): "sang" | "toi" {
  // Độ sáng trung bình > 128 (sáng) -> dùng chữ tối, và ngược lại.
  return doSang > 128 ? "toi" : "sang";
}

