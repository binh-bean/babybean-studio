/**
 * Network-level interceptor for Google Drive image requests.
 *
 * OWNER: QA-BOT. Task BB-134, nâng cấp BB-316 (vòng 5).
 *
 * Loaded via --require when the Next.js dev server starts for E2E tests.
 * Replaces globalThis.fetch so that any request to lh3.googleusercontent.com
 * or drive.google.com/thumbnail returns a realistic mock image instead of
 * hitting the internet.
 *
 * DOES NOT mock createAdminClient, Supabase queries, cookie signing, or any
 * permission check — those all run for real. Only the final Drive HTTP call
 * is intercepted, at the same layer the real code uses (globalThis.fetch).
 *
 * BB-316 (rubric §4): các vòng chấm thẩm mỹ trước dùng một PNG 1×1 trong
 * suốt — đủ để `naturalWidth > 0` (mục đích gốc của BB-134) nhưng KHÔNG đủ
 * để chụp màn hình review: lưới ảnh trông như ô xám/trong suốt, không giống
 * ảnh thật. Đổi sang JPEG trung tính (gradient + nhiễu nhẹ, không người),
 * 60–135 KB ở cỡ gốc, cùng độ trễ 300–800ms — xem tests/fixtures/anh-mock-jpeg.cjs.
 *
 * Chỉ ảnh hưởng ẢNH TRẢ VỀ của cùng hai domain đã mock từ trước — mọi phép
 * thử khác vẫn nhận đúng một ảnh hợp lệ (`naturalWidth > 0`), chỉ khác nội
 * dung/độ trễ.
 */

const { taoAnhJpeg, kichThuocGoc } = require("./anh-mock-jpeg.cjs");

const origFetch = globalThis.fetch;

function doTre() {
  // Độ trễ giống Drive thật chỉ bật khi chụp chấm điểm (MOCK_DRIVE_TRE=1), để
  // các e2e khác không chậm thêm 300–800 ms mỗi ảnh.
  if (process.env.MOCK_DRIVE_TRE !== "1") return Promise.resolve();
  const ms = 300 + Math.random() * 500;
  return new Promise((r) => setTimeout(r, ms));
}

function layDriveFileId(url) {
  const m = url.match(/\/d\/([^=/?]+)/);
  return m ? m[1] : "khong-ro";
}

function layChieuRong(url) {
  const m = url.match(/[=&]w(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

globalThis.fetch = async function patchedFetch(input, init) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (
    url.includes("lh3.googleusercontent.com") ||
    url.includes("drive.google.com/thumbnail")
  ) {
    await doTre();

    const driveFileId = layDriveFileId(url);
    const goc = kichThuocGoc(driveFileId);
    const wYeuCau = layChieuRong(url); // null hoặc s0 = ảnh gốc
    let w = goc.w;
    let h = goc.h;
    if (wYeuCau && wYeuCau < goc.w) {
      const ty = wYeuCau / goc.w;
      w = wYeuCau;
      h = Math.round(goc.h * ty);
    }

    const body = await taoAnhJpeg(driveFileId, w, h);
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Length": String(body.byteLength),
      },
    });
  }

  return origFetch(input, init);
};
