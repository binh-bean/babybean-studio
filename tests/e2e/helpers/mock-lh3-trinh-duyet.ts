import type { Page } from "@playwright/test";
import sharp from "sharp";

/**
 * BB-316 (vòng 5) — từ BB-314, ảnh LƯỚI (w≤800) không còn đi qua hàm
 * `/api/img` nữa: route trả 302 thẳng sang `lh3.googleusercontent.com`, và
 * CHÍNH TRÌNH DUYỆT đi tiếp request đó — không qua máy chủ Next.js, nên
 * `tests/fixtures/mock-drive-network.cjs` (patch `globalThis.fetch` PHÍA MÁY
 * CHỦ) không chặn được request này. Không chặn ở đây thì lưới ảnh của rubric
 * (K2–K3, K11) sẽ toàn ô xám vì trình duyệt cố nối ra Internet thật rồi lỗi.
 *
 * Chặn ở TẦNG TRÌNH DUYỆT (Playwright `page.route`), đúng như brief BB-316
 * gợi ý. Vẫn để `/api/img` chạy XUYÊN SUỐT thật (xét quyền, RLS, redirect
 * thật) — chỉ chặn đúng request lh3 mà trình duyệt tự đi tiếp sau redirect.
 *
 * Ảnh trả về: JPEG trung tính (gradient + nhiễu nhẹ), không người, cùng công
 * thức với mock phía máy chủ (`anh-mock-jpeg.cjs`) để lưới và ảnh bìa nhất
 * quán về màu sắc/kết cấu khi cùng nằm trên một màn hình chụp.
 */

const MAU: [string, string, string][] = [
  ["#F3E6DC", "#E8A598", "#C4645A"],
  ["#EEF1EA", "#7FA99B", "#4F5B45"],
  ["#F7EFE6", "#D9C2A7", "#8C6E54"],
  ["#EDE7F0", "#C9B7CF", "#7E6A86"],
  ["#F1ECE4", "#B9C8C0", "#6F8C80"],
  ["#FBF3EC", "#EBC3A6", "#B7866A"],
];

function seedTuId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

function svgNen(seed: number, w: number, h: number): Buffer {
  const [a, b, c] = MAU[seed % MAU.length] ?? MAU[0]!;
  const r = (n: number) => ((seed * (n * 7 + 3)) % 100) / 100;
  // Nền dịu + ba mảng màu nhoè lớn (màu nước trừu tượng) — KHÔNG có hình tròn/elip
  // riêng lẻ vì chúng trông như đầu và thân người.
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><filter id="b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${Math.round(Math.min(w, h) * 0.09)}"/></filter>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="#D9C6B0"/></linearGradient></defs>
<rect width="100%" height="100%" fill="url(#g)"/>
<g filter="url(#b)">
<ellipse cx="${w * (0.15 + r(1) * 0.3)}" cy="${h * (0.15 + r(2) * 0.3)}" rx="${w * 0.28}" ry="${h * 0.16}" fill="${b}"/>
<ellipse cx="${w * (0.55 + r(3) * 0.3)}" cy="${h * (0.55 + r(4) * 0.3)}" rx="${w * 0.32}" ry="${h * 0.18}" fill="${c}" opacity="0.8"/>
<ellipse cx="${w * (0.2 + r(5) * 0.3)}" cy="${h * 0.88}" rx="${w * 0.3}" ry="${h * 0.1}" fill="#FFFFFF" opacity="0.7"/>
</g></svg>`,
  );
}

async function lopNhieu(w: number, h: number): Promise<Buffer> {
  const div = 10;
  const nw = Math.max(2, Math.round(w / div));
  const nh = Math.max(2, Math.round(h / div));
  const noise = Buffer.alloc(nw * nh);
  for (let i = 0; i < noise.length; i++) noise[i] = Math.floor(Math.random() * 256);
  return sharp(noise, { raw: { width: nw, height: nh, channels: 1 } })
    .resize(w, h, { kernel: "cubic" })
    .jpeg()
    .toBuffer();
}

const dem = new Map<string, Buffer>();

async function taoAnhJpeg(driveFileId: string, w: number, h: number): Promise<Buffer> {
  const key = `${driveFileId}:${w}x${h}`;
  const co = dem.get(key);
  if (co) return co;
  const seed = seedTuId(driveFileId || "x");
  const nen = svgNen(seed, w, h);
  const noiseBuf = await lopNhieu(w, h);
  const quality = 54 + (seed % 8);
  const buf = await sharp(nen)
    .composite([{ input: noiseBuf, blend: "soft-light" }])
    .jpeg({ quality })
    .toBuffer();
  dem.set(key, buf);
  return buf;
}

function kichThuocGoc(driveFileId: string): { w: number; h: number } {
  // Khớp ĐÚNG hướng ảnh trong CSDL fixture: id có dạng dg5-<run>-<bộ>-<x>, x%6==2 là ảnh NGANG.
  const m = /-(\d+)$/.exec(driveFileId || "");
  const ngang = m ? parseInt(m[1]!, 10) % 6 === 2 : seedTuId(driveFileId || "x") % 20 < 3;
  return ngang ? { w: 1500, h: 1000 } : { w: 1000, h: 1500 };
}

async function phucVuAnh(driveFileId: string, wYeuCau: number | null): Promise<Buffer> {
  const goc = kichThuocGoc(driveFileId);
  let w = goc.w;
  let h = goc.h;
  if (wYeuCau && wYeuCau < goc.w) {
    w = wYeuCau;
    h = Math.round(goc.h * (wYeuCau / goc.w));
  }
  // Độ trễ 300–800ms — cùng khoảng brief yêu cầu cho mock Drive.
  await new Promise((r) => setTimeout(r, 300 + Math.random() * 500));
  return taoAnhJpeg(driveFileId, w, h);
}

const HEADERS_ANH = { "access-control-allow-origin": "*", "cross-origin-resource-policy": "cross-origin" };

/**
 * Playwright KHÔNG chặn được request tới đích của một redirect 302 (thử thật:
 * trình duyệt đi thẳng ra lh3 thật rồi bị ORB chặn). Nên chặn ở /api/img: gọi
 * route THẬT với maxRedirects=0 (xét quyền, RLS, 302 đều chạy thật), rồi nếu
 * nhận 302 sang lh3 thì trả luôn ảnh mock thay cho bước đi tiếp sang Internet.
 */
export async function chanLh3TrenTrinhDuyet(page: Page): Promise<void> {
  await page.route("**/api/img/**", async (route) => {
   try {
    const u = new URL(route.request().url());
    const w = Number(u.searchParams.get("w") ?? 800);
    if (w > 800 || u.searchParams.get("tai") === "1" || u.searchParams.get("qua") === "1") {
      await route.continue();
      return;
    }
    const res = await route.fetch({ maxRedirects: 0 });
    const loc = res.headers()["location"] ?? "";
    if (res.status() === 302 && loc.includes("lh3.googleusercontent.com")) {
      const id = loc.match(/\/d\/([^=/?]+)/)?.[1] ?? "khong-ro";
      const body = await phucVuAnh(id, w);
      await route.fulfill({ status: 200, contentType: "image/jpeg", headers: HEADERS_ANH, body });
      return;
    }
    await route.fulfill({ response: res });
   } catch {
    // trang/ngữ cảnh đã đóng khi request còn dở — bỏ qua
   }
  });
  await page.route("https://lh3.googleusercontent.com/**", async (route) => {
   try {
    const url = route.request().url();
    const id = url.match(/\/d\/([^=/?]+)/)?.[1] ?? "khong-ro";
    const wm = url.match(/[=&]w(\d+)/);
    const body = await phucVuAnh(id, wm ? parseInt(wm[1]!, 10) : null);
    await route.fulfill({ status: 200, contentType: "image/jpeg", headers: HEADERS_ANH, body });
   } catch {
    // đã đóng
   }
  });
}
